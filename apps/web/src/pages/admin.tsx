import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowDownRight, ArrowUpRight, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Download, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { AdminShell } from "../components/admin-shell";
import { RemarketingBadge } from "../components/remarketing-badge";
import { useAppDialog } from "../components/app-dialog";
import { api, errorMessage } from "../lib/api";
import { formatBRL, leadStages, stageLabels, type Lead } from "../lib/types";

type LeadPage = { items: Lead[]; pagination: { total: number; pages: number; page: number } };
const leadsPerPage = 5;
type Overview = { total: number; byStage: Record<string, number>; conversion: number };
type SalesReport = {
  period: { from: string; to: string };
  totals: { leads: number; won: number; lost: number; conversion: number; sales: number; revenueCents: string };
  byStage: Record<string, number>;
  bySource: Array<{ source: string; total: number; won: number }>;
  bySeller: Array<{ sellerId: string | null; sellerName: string; total: number }>;
  dailyTrend: Array<{ date: string; total: number }>;
};
type LeadDetail = { lead: Omit<Lead, "activities"> & { activities: Array<{ id: string; type: string; content: string; createdAt: string; user?: { name: string } | null }> } };

function metricIcon(stage: string) {
  if (stage === "NEW") return <ArrowUpRight size={17} />;
  if (stage === "WON") return <CheckCheck size={17} />;
  if (stage === "LOST") return <ArrowDownRight size={17} />;
  return <Activity size={17} />;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function reportDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function downloadReport(report: SalesReport) {
  const rows: Array<Array<string | number>> = [
    ["Relatório comercial", `${report.period.from} a ${report.period.to}`],
    ["Indicador", "Valor"],
    ["Leads recebidos", report.totals.leads],
    ["Vendas concluídas no período", report.totals.sales],
    ["Receita registrada", formatBRL(report.totals.revenueCents)],
    ["Conversão atual dos leads recebidos no período (%)", report.totals.conversion],
    ["Etapa", "Quantidade"],
    ...leadStages.map((stage) => [stageLabels[stage], report.byStage[stage] ?? 0]),
    ["Origem", "Quantidade"],
    ...report.bySource.map(({ source, total }) => [source, total]),
    ["Vendedor", "Quantidade de leads"],
    ...report.bySeller.map(({ sellerName, total }) => [sellerName, total]),
    ["Data", "Leads recebidos"],
    ...report.dailyTrend.map(({ date, total }) => [date, total]),
  ];
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-crm-${report.period.from}-${report.period.to}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AdminPage() {
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<string>("");
  const [leadsPage, setLeadsPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reportFrom, setReportFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return dateInputValue(date);
  });
  const [reportTo, setReportTo] = useState(() => dateInputValue(new Date()));
  const [currentMonth, setCurrentMonth] = useState(() => dateInputValue(new Date()).slice(0, 7));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const updateMonth = () => {
      clearTimeout(timer);
      const now = new Date();
      setCurrentMonth(dateInputValue(now).slice(0, 7));
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      timer = setTimeout(updateMonth, Math.min(nextMonth.getTime() - now.getTime(), 24 * 60 * 60 * 1000));
    };
    updateMonth();
    window.addEventListener("focus", updateMonth);
    return () => { clearTimeout(timer); window.removeEventListener("focus", updateMonth); };
  }, []);
  const [monthYear, monthNumber] = currentMonth.split("-").map(Number);
  const monthFrom = `${currentMonth}-01`;
  const monthTo = dateInputValue(new Date(monthYear, monthNumber, 0));
  const auth = useQuery({ queryKey: ["session"], queryFn: async () => (await api.get("/auth/me")).data });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);

  const leads = useQuery({
    queryKey: ["leads", search, activeStage, leadsPage],
    queryFn: async () => (await api.get<LeadPage>("/leads", { params: { q: search || undefined, stage: activeStage || undefined, page: leadsPage, limit: leadsPerPage } })).data,
    enabled: auth.isSuccess,
  });
  useEffect(() => {
    if (leads.data && leadsPage > Math.max(leads.data.pagination.pages, 1)) {
      setLeadsPage(Math.max(leads.data.pagination.pages, 1));
    }
  }, [leads.data, leadsPage]);
  const sellers = useQuery({
    queryKey: ["inventory-sellers"],
    queryFn: async () => (await api.get<{ items: Array<{ id: string; name: string; slug: string }> }>("/sellers")).data.items,
    enabled: auth.isSuccess && ["ADMIN", "SUPERVISOR", "MANAGER"].includes((auth.data as { user?: { role?: string } } | undefined)?.user?.role ?? ""),
  });
  const overview = useQuery({
    queryKey: ["crm-overview"],
    queryFn: async () => (await api.get<Overview>("/crm/overview")).data,
    enabled: auth.isSuccess,
  });
  const report = useQuery({
    queryKey: ["crm-report", reportFrom, reportTo],
    queryFn: async () => (await api.get<SalesReport>("/crm/reports", { params: { from: reportFrom, to: reportTo } })).data,
    enabled: auth.isSuccess && Boolean(reportFrom && reportTo && reportFrom <= reportTo),
  });
  const monthReport = useQuery({
    queryKey: ["crm-report", monthFrom, monthTo],
    queryFn: async () => (await api.get<SalesReport>("/crm/reports", { params: { from: monthFrom, to: monthTo } })).data,
    enabled: auth.isSuccess,
  });
  const detail = useQuery({
    queryKey: ["lead-detail", selectedLead],
    queryFn: async () => (await api.get<LeadDetail>(`/leads/${selectedLead}`)).data.lead,
    enabled: auth.isSuccess && selectedLead !== null,
  });

  const stageMutation = useMutation({
    mutationFn: async ({ id, stage, lostReason, salePriceCents, sellerId }: { id: string; stage: string; lostReason?: string; salePriceCents?: string; sellerId?: string }) => api.patch(`/crm/leads/${id}/stage`, { stage, lostReason, salePriceCents, sellerId }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ["leads"] }), cache.invalidateQueries({ queryKey: ["crm-overview"] }), cache.invalidateQueries({ queryKey: ["crm-report"] }), cache.invalidateQueries({ queryKey: ["lead-detail"] }), cache.invalidateQueries({ queryKey: ["inventory-sellers"] })]);
    },
  });
  const noteMutation = useMutation({
    mutationFn: async () => api.post(`/leads/${selectedLead}/activities`, { type: "NOTE", content: note }),
    onSuccess: async () => {
      setNote("");
      await cache.invalidateQueries({ queryKey: ["lead-detail", selectedLead] });
    },
  });
  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  const overviewData = overview.data;
  const currentUser = (auth.data as { user?: { name?: string; role?: string } }).user;
  const reportBreakdowns: Array<{ title: string; rows: Array<[string, number]> }> = [
    { title: "Leads por origem", rows: report.data?.bySource.map(({ source, total }) => [source, total]) ?? [] },
    { title: "Leads por vendedor", rows: report.data?.bySeller.map(({ sellerName, total }) => [sellerName, total]) ?? [] },
  ];

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={currentUser?.role ?? "SELLER"}>
      <div className="page-wrap py-4 sm:py-5">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Painel comercial</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Olá{currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : ""}.</h1><p className="mt-2 text-sm text-muted">Acompanhe os contatos e a evolução do atendimento.</p></div>
          <div className="flex items-center gap-2">
            {currentUser?.role === "SUPERVISOR" && <span className="rounded-full bg-lime px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.15em] text-pine">Supervisor</span>}
          </div>
        </div>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Todos os leads", overviewData?.total ?? 0, <Users size={17} />],
            ["Novos", overviewData?.byStage.NEW ?? 0, metricIcon("NEW")],
            ["Em andamento", Object.entries(overviewData?.byStage ?? {}).filter(([key]) => !["NEW", "WON", "LOST"].includes(key)).reduce((sum, [, count]) => sum + count, 0), metricIcon("NEGOTIATION")],
            ["Conversão", `${overviewData?.conversion ?? 0}%`, metricIcon("WON")],
          ].map(([label, value, icon]) => <Card key={String(label)} className="rounded-2xl p-5 shadow-none">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted">{label}</span><span className="text-pine">{icon}</span></div>
            <p className="mt-4 text-3xl font-black tracking-tight">{overview.isLoading ? "—" : value}</p>
            <p className="mt-1 text-[10px] text-muted">{label === "Conversão" ? "Vendas concluídas ÷ leads recebidos" : "Dados registrados no CRM"}</p>
          </Card>)}
        </section>

        <section className="mt-8 space-y-4">
          <Card className="rounded-2xl p-5 shadow-none">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Análise comercial</p><h2 className="mt-1 text-xl font-black">Relatórios</h2><p className="mt-1 text-xs text-muted">Conversão acompanha os leads recebidos no período; receita usa a data de fechamento da venda.</p></div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="field-label">De<input className="field-input min-w-36" type="date" value={reportFrom} max={reportTo} onChange={(event) => setReportFrom(event.target.value)} /></label>
                <label className="field-label">Até<input className="field-input min-w-36" type="date" value={reportTo} min={reportFrom} onChange={(event) => setReportTo(event.target.value)} /></label>
                <Button variant="outline" size="small" onClick={() => report.data && downloadReport(report.data)} disabled={!report.data || report.isFetching}><Download size={14} /> Exportar CSV</Button>
              </div>
            </div>
            {report.isError && <p className="mt-4 text-xs text-red-700" role="alert">{errorMessage(report.error)}</p>}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Leads recebidos", report.data?.totals.leads ?? "—", <Users size={17} />],
              ["Vendas concluídas", report.data?.totals.sales ?? "—", <CheckCheck size={17} />],
              ["Receita registrada", report.data ? formatBRL(report.data.totals.revenueCents) : "—", <Activity size={17} />],
              ["Conversão do período", report.data ? `${report.data.totals.conversion}%` : "—", <ArrowUpRight size={17} />],
              ["Leads perdidos", report.data?.totals.lost ?? "—", <ArrowDownRight size={17} />],
            ].map(([label, value, icon]) => <Card key={String(label)} className="rounded-2xl p-5 shadow-none">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted">{label}</span><span className="text-pine">{icon}</span></div>
              <p className="mt-4 text-2xl font-black tracking-tight">{value}</p>
            </Card>)}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-2xl p-5 shadow-none">
              <div><p className="text-sm font-bold">Leads recebidos por dia</p><p className="mt-1 text-xs text-muted">Volume dentro do período selecionado</p></div>
              <div className="mt-4 h-[230px]">
                {report.isLoading ? <p className="pt-20 text-center text-xs text-muted">Carregando relatório...</p> : report.data?.dailyTrend.length ? <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.data.dailyTrend} margin={{ left: -20, right: 6, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="#e9ede6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#718074" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(report.data.dailyTrend.length / 8))} tickFormatter={(value: string) => value.slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#718074" }} axisLine={false} tickLine={false} />
                    <Tooltip labelFormatter={(value) => dateLabel(`${value}T12:00:00`)} />
                    <Bar dataKey="total" name="Leads recebidos" fill="#224d38" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer> : <p className="pt-20 text-center text-xs text-muted">Nenhum lead recebido no período.</p>}
              </div>
            </Card>

            <Card className="rounded-2xl p-5 shadow-none">
              <div className="flex items-center justify-between"><div><p className="text-sm font-bold">Etapas no período</p><p className="mt-1 text-xs text-muted">Etapa atual dos leads recebidos no mês atual, independentemente do filtro do relatório</p>{monthReport.data && <p className="mt-1 text-xs font-semibold text-pine">Período: {reportDateLabel(monthReport.data.period.from)} a {reportDateLabel(monthReport.data.period.to)}</p>}</div><ClipboardList size={18} className="text-pine" /></div>
              <div className="mt-4 h-[230px]">
                {monthReport.isLoading ? <p className="pt-20 text-center text-xs text-muted">Carregando relatório...</p> : monthReport.isError ? <p className="pt-20 text-center text-xs text-red-700" role="alert">{errorMessage(monthReport.error)}</p> : monthReport.data && <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadStages.map((stage) => ({ name: stageLabels[stage], total: monthReport.data.byStage[stage] ?? 0 }))} margin={{ left: -20, right: 6, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="#e9ede6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#718074" }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={55} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#718074" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "#f7f8f3" }} />
                    <Bar dataKey="total" name="Leads" radius={[6, 6, 0, 0]}>{leadStages.map((stage, index) => <Cell key={stage} fill={index === 0 ? "#c5e85b" : "#224d38"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>}
              </div>
            </Card>
          </div>

          <Card className="rounded-2xl p-5 shadow-none">
            <h3 className="text-sm font-bold">Leads e vendas por origem</h3>
            <p className="mt-1 text-xs text-muted">Leads recebidos no período selecionado e, entre eles, os que estão atualmente em Venda concluída.</p>
            {report.data && <p className="mt-1 text-xs font-semibold text-pine">Período: {reportDateLabel(report.data.period.from)} a {reportDateLabel(report.data.period.to)}</p>}
            {report.isLoading ? <p className="mt-4 text-xs text-muted">Carregando relatório...</p> : report.isError ? <p className="mt-4 text-xs text-red-700" role="alert">{errorMessage(report.error)}</p> : !reportFrom || !reportTo || reportFrom > reportTo ? <p className="mt-4 text-xs text-muted">Selecione um período válido.</p> : report.data && report.data.bySource.some(({ won }) => typeof won !== "number") ? <p className="mt-4 text-xs text-red-700" role="alert">Não foi possível carregar as vendas por origem. Atualize a API e tente novamente.</p> : report.data?.bySource.length ? <>
              <div className="mt-4 overflow-x-auto">
                <div style={{ minWidth: Math.max(480, report.data.bySource.length * 120), height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={report.data.bySource} margin={{ left: -20, right: 12, top: 10, bottom: 4 }}>
                      <CartesianGrid stroke="#e9ede6" vertical={false} />
                      <XAxis dataKey="source" tick={{ fontSize: 10, fill: "#718074" }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={80} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#718074" }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: "#f7f8f3" }} />
                      <Legend />
                      <Bar dataKey="total" name="Leads recebidos" fill="#224d38" radius={[5, 5, 0, 0]} />
                      <Line dataKey="won" name="Venda concluída" type="linear" stroke="#d97706" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="text-muted"><th className="py-2 pr-3">Origem</th><th className="px-3 py-2 text-right">Leads recebidos</th><th className="pl-3 py-2 text-right">Venda concluída</th></tr></thead>
                  <tbody className="divide-y divide-black/5">{report.data.bySource.map(({ source, total, won }) => <tr key={source}><td className="py-2 pr-3">{source}</td><td className="px-3 py-2 text-right">{total}</td><td className="pl-3 py-2 text-right">{won}</td></tr>)}</tbody>
                </table>
              </div>
            </> : <p className="mt-4 text-xs text-muted">Nenhum lead recebido no período.</p>}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {reportBreakdowns.map(({ title, rows }) => (
              <Card key={title} className="rounded-2xl p-5 shadow-none">
                <h3 className="text-sm font-bold">{title}</h3>
                {report.isLoading ? <p className="mt-4 text-xs text-muted">Carregando relatório...</p> : rows.length ? <ul className="mt-3 divide-y divide-black/5">
                  {rows.map(([label, total]) => <li key={label} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="truncate text-ink/75">{label}</span><span className="font-bold">{total}</span></li>)}
                </ul> : <p className="mt-4 text-xs text-muted">Sem dados no período selecionado.</p>}
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <Card className="rounded-2xl p-5 shadow-none">
            <div className="flex items-center justify-between"><div><p className="text-sm font-bold">Etapas do funil</p><p className="mt-1 text-xs text-muted">Leads por etapa atual</p></div><ClipboardList size={18} className="text-pine" /></div>
            <div className="mt-4 h-[230px]">
              {overview.isLoading ? <p className="pt-20 text-center text-xs text-muted">Carregando indicadores...</p> : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadStages.map((stage) => ({ name: stageLabels[stage], total: overviewData?.byStage[stage] ?? 0 }))} margin={{ left: -20, right: 6, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#e9ede6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#718074" }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#718074" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f7f8f3" }} />
                  <Bar dataKey="total" name="Leads" radius={[6, 6, 0, 0]}>{leadStages.map((stage, index) => <Cell key={stage} fill={index === 0 ? "#c5e85b" : "#224d38"} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>}
            </div>
          </Card>
          <Card className="overflow-hidden rounded-2xl shadow-none">
            <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div><p className="text-sm font-bold">Leads recentes</p><p className="mt-1 text-xs text-muted">{leads.data?.pagination.total ?? 0} registros encontrados</p></div>
              <label className="flex h-10 items-center gap-2 rounded-xl bg-paper px-3 sm:w-64"><Search size={15} className="text-muted" /><input className="w-full bg-transparent text-xs outline-none placeholder:text-muted" placeholder="Buscar nome ou telefone" value={search} onChange={(event) => { setSearch(event.target.value); setLeadsPage(1); }} /></label>
            </div>
            <div className="flex gap-2 overflow-x-auto border-y border-black/5 px-5 py-3">
              <button onClick={() => { setActiveStage(""); setLeadsPage(1); }} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${activeStage === "" ? "bg-ink text-white" : "bg-paper text-muted"}`}>Todos</button>
              {leadStages.map((stage) => <button key={stage} onClick={() => { setActiveStage(stage); setLeadsPage(1); }} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${activeStage === stage ? "bg-ink text-white" : "bg-paper text-muted"}`}>{stageLabels[stage]}</button>)}
            </div>
            {leads.isLoading ? <p className="p-10 text-center text-xs text-muted">Carregando leads...</p> : null}
            {leads.isError ? <p className="p-10 text-center text-xs text-red-700" role="alert">{errorMessage(leads.error)}</p> : null}
            {!leads.isLoading && leads.data?.items.length === 0 && <div className="p-12 text-center"><CircleHelp className="mx-auto text-muted" /><p className="mt-3 text-sm font-bold">Nenhum lead por aqui ainda</p><p className="mt-1 text-xs text-muted">Os contatos recebidos pelo catálogo aparecerão aqui.</p></div>}
            {leads.data?.items.length ? <div className="overflow-x-auto">
              <table className="w-full min-w-[690px] text-left text-xs">
                <thead className="bg-[#fafbf8] text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-5 py-3 font-bold">Contato</th><th className="px-4 py-3 font-bold">Interesse</th><th className="px-4 py-3 font-bold">Etapa</th><th className="px-4 py-3 font-bold">Origem</th><th className="px-4 py-3 font-bold">Recebido</th><th className="px-5 py-3" /></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {leads.data.items.map((lead) => <tr key={lead.id} className="hover:bg-[#fafbf8]">
                    <td className="px-5 py-4"><button className="text-left" onClick={() => setSelectedLead(lead.id)}><p className="font-bold">{lead.name}</p><p className="mt-1 text-[10px] text-muted">{lead.phone}</p></button>{lead.isRemarketing && <div className="mt-2"><RemarketingBadge /></div>}</td>
                    <td className="px-4 py-4 text-ink/75">{lead.motorcycle ? `${lead.motorcycle.brand} ${lead.motorcycle.model}` : "Geral"}</td>
                    <td className="px-4 py-4"><div className="flex flex-col gap-2">
                      <select aria-label={`Etapa de ${lead.name}`} className="max-w-40 rounded-lg border border-black/10 bg-white px-2 py-2 text-[10px] font-semibold" value={lead.stage} disabled={stageMutation.isPending} onChange={async (event) => {
                        const stage = event.target.value;
                        const lostReason = stage === "LOST" ? await dialog.prompt({ title: "Motivo da perda", message: "Informe o motivo da perda:" }) : undefined;
                        if (stage === "LOST" && !lostReason?.trim()) return;
                        const salePrice = stage === "WON" ? await dialog.prompt({ title: "Venda concluída", message: "Valor da venda (somente números, ex.: 25000):" }) : undefined;
                        if (stage === "WON" && salePrice === null) return;
                        if (stage === "WON" && salePrice && !/^\d+$/.test(salePrice.trim())) {
                          await dialog.alert({ title: "Valor inválido", message: "Informe somente números no valor da venda." });
                          return;
                        }
                        stageMutation.mutate({ id: lead.id, stage, lostReason: lostReason ?? undefined, salePriceCents: salePrice?.trim() || undefined });
                      }}>{leadStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select>
                      {sellers.data && sellers.data.length > 0 && <select aria-label={`Vendedor de ${lead.name}`} className="max-w-40 rounded-lg border border-black/10 bg-white px-2 py-2 text-[10px] font-semibold" value={lead.seller?.id ?? ""} disabled={stageMutation.isPending} onChange={(event) => {
                        const sellerId = event.target.value;
                        if (!sellerId) return;
                        stageMutation.mutate({ id: lead.id, stage: lead.stage, sellerId });
                      }}>
                        <option value="">Sem vendedor</option>
                        {sellers.data.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                      </select>}
                    </div></td>
                    <td className="px-4 py-4 text-muted">{lead.source}</td>
                    <td className="px-4 py-4 text-muted">{dateLabel(lead.createdAt)}</td>
                    <td className="px-5 py-4"><button className="font-bold text-pine hover:underline" onClick={() => setSelectedLead(lead.id)}>Abrir</button></td>
                  </tr>)}
                </tbody>
              </table>
            </div> : null}
            <footer className="flex flex-col gap-3 border-t border-black/5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted">
                {leads.isLoading ? "Carregando leads..." : leads.isError && !leads.data ? "Não foi possível carregar os leads" : leads.data?.pagination.total
                  ? `Exibindo ${(leadsPage - 1) * leadsPerPage + 1}–${Math.min(leadsPage * leadsPerPage, leads.data.pagination.total)} de ${leads.data.pagination.total}`
                  : "Nenhum lead para exibir"}
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="small" variant="outline" aria-label="Página anterior" disabled={leadsPage <= 1 || leads.isFetching} onClick={() => setLeadsPage((page) => page - 1)}>
                  <ChevronLeft size={15} /> Anterior
                </Button>
                <span className="min-w-16 text-center text-[11px] text-muted">{leadsPage} / {Math.max(leads.data?.pagination.pages ?? 0, 1)}</span>
                <Button type="button" size="small" variant="outline" aria-label="Próxima página" disabled={!leads.data || leadsPage >= leads.data.pagination.pages || leads.isFetching} onClick={() => setLeadsPage((page) => page + 1)}>
                  Próxima <ChevronRight size={15} />
                </Button>
              </div>
            </footer>
          </Card>
        </section>
        {stageMutation.isError && <p className="mt-4 text-xs text-red-700" role="alert">{errorMessage(stageMutation.error)}</p>}

        {selectedLead && <div className="fixed inset-0 z-40 flex justify-end bg-ink/35" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelectedLead(null); }}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-label="Detalhes do lead">
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-pine">Ficha do contato</p><h2 className="mt-2 text-2xl font-black">{detail.data?.name ?? "Carregando..."}</h2></div><button onClick={() => setSelectedLead(null)} aria-label="Fechar" className="rounded-full p-2 hover:bg-paper"><X size={18} /></button></div>
            {detail.data && <div className="mt-6 space-y-5">
              {detail.data.isRemarketing && <RemarketingBadge />}
              <div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-paper p-3"><p className="text-muted">Telefone</p><p className="mt-1 font-bold">{detail.data.phone}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-muted">E-mail</p><p className="mt-1 break-all font-bold">{detail.data.email || "Não informado"}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-muted">Vendedor</p><p className="mt-1 font-bold">{detail.data.seller?.name || "A definir"}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-muted">Origem</p><p className="mt-1 font-bold">{detail.data.source}</p></div></div>
              <div><p className="text-sm font-bold">Histórico</p><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (note.trim()) noteMutation.mutate(); }}><input className="field-input" placeholder="Adicionar anotação interna..." value={note} onChange={(event) => setNote(event.target.value)} /><Button size="small" type="submit" disabled={!note.trim() || noteMutation.isPending}>Salvar</Button></form>
                {noteMutation.isError && <p className="mt-2 text-xs text-red-700">{errorMessage(noteMutation.error)}</p>}
                <div className="mt-4 space-y-3">{detail.data.activities?.map((activity) => <div key={activity.id} className="border-l-2 border-lime pl-3"><p className="text-xs leading-5">{activity.content}</p><p className="mt-1 text-[10px] text-muted">{activity.user?.name ? `${activity.user.name} · ` : ""}{dateLabel(activity.createdAt)}</p></div>)}</div>
              </div>
            </div>}
          </aside>
        </div>}
      </div>
    </AdminShell>
  );
}
