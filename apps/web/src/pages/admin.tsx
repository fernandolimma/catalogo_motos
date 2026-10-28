import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowDownRight, ArrowUpRight, Bike, CheckCheck, CircleHelp, ClipboardList, Download, LogOut, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";
import { formatBRL, leadStages, stageLabels, type Lead } from "../lib/types";

type LeadPage = { items: Lead[]; pagination: { total: number; pages: number; page: number } };
type Overview = { total: number; byStage: Record<string, number>; conversion: number };
type SalesReport = {
  period: { from: string; to: string };
  totals: { leads: number; won: number; lost: number; conversion: number; sales: number; revenueCents: string };
  byStage: Record<string, number>;
  bySource: Array<{ source: string; total: number }>;
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

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  SUPPORT: "Suporte",
};

export function AdminPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<string>("");
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reportFrom, setReportFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return dateInputValue(date);
  });
  const [reportTo, setReportTo] = useState(() => dateInputValue(new Date()));
  const auth = useQuery({ queryKey: ["session"], queryFn: async () => (await api.get("/auth/me")).data });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);

  const leads = useQuery({
    queryKey: ["leads", search, activeStage],
    queryFn: async () => (await api.get<LeadPage>("/leads", { params: { q: search || undefined, stage: activeStage || undefined, limit: 50 } })).data,
    enabled: auth.isSuccess,
  });
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
  const detail = useQuery({
    queryKey: ["lead-detail", selectedLead],
    queryFn: async () => (await api.get<LeadDetail>(`/leads/${selectedLead}`)).data.lead,
    enabled: auth.isSuccess && selectedLead !== null,
  });

  const stageMutation = useMutation({
    mutationFn: async ({ id, stage, lostReason, salePriceCents, sellerId }: { id: string; stage: string; lostReason?: string; salePriceCents?: string; sellerId?: string }) => api.patch(`/crm/leads/${id}/stage`, { stage, lostReason, salePriceCents, sellerId }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ["leads"] }), cache.invalidateQueries({ queryKey: ["crm-overview"] }), cache.invalidateQueries({ queryKey: ["lead-detail"] }), cache.invalidateQueries({ queryKey: ["inventory-sellers"] })]);
    },
  });
  const noteMutation = useMutation({
    mutationFn: async () => api.post(`/leads/${selectedLead}/activities`, { type: "NOTE", content: note }),
    onSuccess: async () => {
      setNote("");
      await cache.invalidateQueries({ queryKey: ["lead-detail", selectedLead] });
    },
  });
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: async () => {
      await cache.clear();
      await navigate({ to: "/login" });
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
    <div className="min-h-screen bg-[#f6f7f3]">
      <header className="border-b border-black/5 bg-white">
        <div className="page-wrap flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-pine"><Bike size={18} /></span><span className="font-black tracking-tight">INDEPENDÊNCIA <span className="text-pine">CRM</span></span></div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block"><p className="text-xs font-bold">{currentUser?.name}</p><p className="text-[10px] text-muted">{currentUser?.role ? roleLabels[currentUser.role] ?? currentUser.role : "Perfil"}</p></div>
            {["ADMIN", "SUPERVISOR", "MANAGER"].includes(currentUser?.role ?? "") && <Link to="/admin/estoque"><Button variant="outline" size="small"><Bike size={14} /> Estoque</Button></Link>}
            <Button variant="outline" size="small" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={14} /> Sair</Button>
          </div>
        </div>
      </header>
      <main className="page-wrap py-9 sm:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Painel comercial</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Olá{currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : ""}.</h1><p className="mt-2 text-sm text-muted">Acompanhe os contatos e a evolução do atendimento.</p></div>
          <div className="flex items-center gap-2">
            {currentUser?.role === "SUPERVISOR" && <span className="rounded-full bg-lime px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.15em] text-pine">Supervisor</span>}
            <Link to="/"><Button variant="outline" size="small"><ArrowUpRight size={14} /> Ver catálogo público</Button></Link>
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
              <div className="flex items-center justify-between"><div><p className="text-sm font-bold">Etapas no período</p><p className="mt-1 text-xs text-muted">Etapa atual dos leads recebidos no intervalo</p></div><ClipboardList size={18} className="text-pine" /></div>
              <div className="mt-4 h-[230px]">
                {report.isLoading ? <p className="pt-20 text-center text-xs text-muted">Carregando relatório...</p> : <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadStages.map((stage) => ({ name: stageLabels[stage], total: report.data?.byStage[stage] ?? 0 }))} margin={{ left: -20, right: 6, top: 4, bottom: 4 }}>
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
              <label className="flex h-10 items-center gap-2 rounded-xl bg-paper px-3 sm:w-64"><Search size={15} className="text-muted" /><input className="w-full bg-transparent text-xs outline-none placeholder:text-muted" placeholder="Buscar nome ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            </div>
            <div className="flex gap-2 overflow-x-auto border-y border-black/5 px-5 py-3">
              <button onClick={() => setActiveStage("")} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${activeStage === "" ? "bg-ink text-white" : "bg-paper text-muted"}`}>Todos</button>
              {leadStages.map((stage) => <button key={stage} onClick={() => setActiveStage(stage)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${activeStage === stage ? "bg-ink text-white" : "bg-paper text-muted"}`}>{stageLabels[stage]}</button>)}
            </div>
            {leads.isLoading ? <p className="p-10 text-center text-xs text-muted">Carregando leads...</p> : null}
            {leads.isError ? <p className="p-10 text-center text-xs text-red-700" role="alert">{errorMessage(leads.error)}</p> : null}
            {!leads.isLoading && leads.data?.items.length === 0 && <div className="p-12 text-center"><CircleHelp className="mx-auto text-muted" /><p className="mt-3 text-sm font-bold">Nenhum lead por aqui ainda</p><p className="mt-1 text-xs text-muted">Os contatos recebidos pelo catálogo aparecerão aqui.</p></div>}
            {leads.data?.items.length ? <div className="overflow-x-auto">
              <table className="w-full min-w-[690px] text-left text-xs">
                <thead className="bg-[#fafbf8] text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-5 py-3 font-bold">Contato</th><th className="px-4 py-3 font-bold">Interesse</th><th className="px-4 py-3 font-bold">Etapa</th><th className="px-4 py-3 font-bold">Origem</th><th className="px-4 py-3 font-bold">Recebido</th><th className="px-5 py-3" /></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {leads.data.items.map((lead) => <tr key={lead.id} className="hover:bg-[#fafbf8]">
                    <td className="px-5 py-4"><button className="text-left" onClick={() => setSelectedLead(lead.id)}><p className="font-bold">{lead.name}</p><p className="mt-1 text-[10px] text-muted">{lead.phone}</p></button></td>
                    <td className="px-4 py-4 text-ink/75">{lead.motorcycle ? `${lead.motorcycle.brand} ${lead.motorcycle.model}` : "Geral"}</td>
                    <td className="px-4 py-4"><div className="flex flex-col gap-2">
                      <select aria-label={`Etapa de ${lead.name}`} className="max-w-40 rounded-lg border border-black/10 bg-white px-2 py-2 text-[10px] font-semibold" value={lead.stage} disabled={stageMutation.isPending} onChange={(event) => {
                        const stage = event.target.value;
                        const lostReason = stage === "LOST" ? window.prompt("Informe o motivo da perda:") ?? undefined : undefined;
                        if (stage === "LOST" && !lostReason?.trim()) return;
                        const salePrice = stage === "WON" ? window.prompt("Valor da venda (somente números, ex.: 25000):") ?? undefined : undefined;
                        if (stage === "WON" && salePrice && !/^\d+$/.test(salePrice.trim())) {
                          window.alert("Informe somente números no valor da venda.");
                          return;
                        }
                        stageMutation.mutate({ id: lead.id, stage, lostReason, salePriceCents: salePrice?.trim() || undefined });
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
          </Card>
        </section>
        {stageMutation.isError && <p className="mt-4 text-xs text-red-700" role="alert">{errorMessage(stageMutation.error)}</p>}

        {selectedLead && <div className="fixed inset-0 z-40 flex justify-end bg-ink/35" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelectedLead(null); }}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-label="Detalhes do lead">
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-pine">Ficha do contato</p><h2 className="mt-2 text-2xl font-black">{detail.data?.name ?? "Carregando..."}</h2></div><button onClick={() => setSelectedLead(null)} aria-label="Fechar" className="rounded-full p-2 hover:bg-paper"><X size={18} /></button></div>
            {detail.data && <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-paper p-3"><p className="text-muted">Telefone</p><p className="mt-1 font-bold">{detail.data.phone}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-muted">E-mail</p><p className="mt-1 break-all font-bold">{detail.data.email || "Não informado"}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-muted">Vendedor</p><p className="mt-1 font-bold">{detail.data.seller?.name || "A definir"}</p></div><div className="rounded-xl bg-paper p-3"><p className="text-muted">Origem</p><p className="mt-1 font-bold">{detail.data.source}</p></div></div>
              <div><p className="text-sm font-bold">Histórico</p><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (note.trim()) noteMutation.mutate(); }}><input className="field-input" placeholder="Adicionar anotação interna..." value={note} onChange={(event) => setNote(event.target.value)} /><Button size="small" type="submit" disabled={!note.trim() || noteMutation.isPending}>Salvar</Button></form>
                {noteMutation.isError && <p className="mt-2 text-xs text-red-700">{errorMessage(noteMutation.error)}</p>}
                <div className="mt-4 space-y-3">{detail.data.activities?.map((activity) => <div key={activity.id} className="border-l-2 border-lime pl-3"><p className="text-xs leading-5">{activity.content}</p><p className="mt-1 text-[10px] text-muted">{activity.user?.name ? `${activity.user.name} · ` : ""}{dateLabel(activity.createdAt)}</p></div>)}</div>
              </div>
            </div>}
          </aside>
        </div>}
      </main>
    </div>
  );
}
