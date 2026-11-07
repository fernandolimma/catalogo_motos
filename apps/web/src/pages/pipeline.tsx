import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Columns3, MessageCircle, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "../components/admin-shell";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";
import { leadStages, stageLabels, type Lead } from "../lib/types";

type LeadPage = { items: Lead[]; pagination: { total: number; pages: number; page: number } };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function stageChangeDetails(stage: string) {
  if (stage === "LOST") {
    const lostReason = window.prompt("Informe o motivo da perda:");
    return lostReason?.trim() ? { lostReason: lostReason.trim() } : null;
  }
  if (stage === "WON") {
    const salePrice = window.prompt("Valor da venda em reais (opcional, ex.: 25000,00):");
    if (salePrice === null) return null;
    if (!salePrice.trim()) return {};
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(salePrice.trim())) {
      window.alert("Informe um valor válido, como 25000,00.");
      return null;
    }
    const [whole = "0", fraction = ""] = salePrice.trim().replace(",", ".").split(".");
    return { salePriceCents: (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString() };
  }
  return {};
}

export function PipelinePage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const auth = useQuery({ queryKey: ["session"], queryFn: async () => (await api.get("/auth/me")).data });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);

  const leads = useQuery({
    queryKey: ["kanban-leads"],
    queryFn: async () => {
      const firstPage = (await api.get<LeadPage>("/leads", { params: { page: 1, limit: 100 } })).data;
      const items = [...firstPage.items];
      for (let page = 2; page <= firstPage.pagination.pages; page += 1) {
        const nextPage = (await api.get<LeadPage>("/leads", { params: { page, limit: 100 } })).data;
        items.push(...nextPage.items);
      }
      return items;
    },
    enabled: auth.isSuccess,
  });

  const moveLead = useMutation({
    mutationFn: async ({ id, stage, details }: { id: string; stage: string; details: { lostReason?: string; salePriceCents?: string } }) =>
      api.patch(`/crm/leads/${id}/stage`, { stage, ...details }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["kanban-leads"] }),
        cache.invalidateQueries({ queryKey: ["leads"] }),
        cache.invalidateQueries({ queryKey: ["crm-overview"] }),
        cache.invalidateQueries({ queryKey: ["lead-detail"] }),
      ]);
    },
  });

  const visibleLeads = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return leads.data ?? [];
    return (leads.data ?? []).filter((lead) =>
      [lead.name, lead.phone, lead.email, lead.seller?.name, lead.motorcycle?.brand, lead.motorcycle?.model]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(query)),
    );
  }, [leads.data, search]);

  function moveToStage(lead: Lead, stage: string) {
    if (lead.stage === stage || moveLead.isPending) return;
    const details = stageChangeDetails(stage);
    if (details) moveLead.mutate({ id: lead.id, stage, details });
  }

  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  const currentUser = (auth.data as { user?: { name?: string; role?: string } }).user;

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={currentUser?.role ?? "SELLER"}>
      <div className="page-wrap py-4 sm:py-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">CRM</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Funil de vendas</h1>
            <p className="mt-2 text-sm text-muted">Acompanhe e mova os leads entre as etapas do atendimento.</p>
          </div>
          <Link to="/admin" className="inline-flex items-center gap-2 self-start rounded-xl border border-black/10 bg-white px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-paper sm:self-auto">
            Painel completo <ArrowRight size={14} />
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Columns3 size={16} className="text-pine" />
            {visibleLeads.length} {visibleLeads.length === 1 ? "lead visível" : "leads visíveis"}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-black/5 bg-white px-3 sm:w-72">
            <Search size={15} className="text-muted" />
            <input
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted"
              placeholder="Buscar contato, vendedor ou moto"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        {leads.isError && <p className="mt-5 rounded-xl bg-red-50 p-4 text-xs text-red-700" role="alert">{errorMessage(leads.error)}</p>}
        {moveLead.isError && <p className="mt-4 rounded-xl bg-red-50 p-4 text-xs text-red-700" role="alert">{errorMessage(moveLead.error)}</p>}
        {leads.isLoading ? <p className="p-12 text-center text-xs text-muted">Carregando funil de vendas...</p> : null}
        {!leads.isLoading && !leads.isError && visibleLeads.length === 0 && (
          <Card className="mt-6 rounded-2xl p-12 text-center shadow-none">
            <Columns3 className="mx-auto text-muted" />
            <p className="mt-3 text-sm font-bold">{search ? "Nenhum lead encontrado" : "O funil ainda está vazio"}</p>
            <p className="mt-1 text-xs text-muted">{search ? "Tente buscar por outro termo." : "Os contatos recebidos pelo catálogo aparecerão aqui."}</p>
          </Card>
        )}

        {!leads.isLoading && !leads.isError && visibleLeads.length > 0 && (
          <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-5">
            {leadStages.map((stage) => {
              const stageLeads = visibleLeads.filter((lead) => lead.stage === stage);
              const isTerminal = stage === "WON" || stage === "LOST";
              return (
                <section
                  key={stage}
                  aria-label={`${stageLabels[stage]}: ${stageLeads.length} leads`}
                  className={`w-[min(84vw,310px)] shrink-0 snap-start rounded-2xl border p-3 transition-colors sm:w-[300px] ${dropStage === stage ? "border-pine bg-[#eaf0e8]" : "border-black/5 bg-[#eef0eb]"}`}
                  onDragOver={(event) => { event.preventDefault(); setDropStage(stage); }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropStage(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const lead = leads.data?.find((item) => item.id === (event.dataTransfer.getData("text/plain") || draggedLead));
                    if (lead) moveToStage(lead, stage);
                    setDraggedLead(null);
                    setDropStage(null);
                  }}
                >
                  <header className="flex items-center justify-between gap-2 px-1 pb-3">
                    <h2 className="text-xs font-extrabold text-ink">{stageLabels[stage]}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${stage === "WON" ? "bg-pine text-white" : stage === "LOST" ? "bg-red-100 text-red-700" : "bg-white text-muted"}`}>{stageLeads.length}</span>
                  </header>
                  <div className="max-h-[calc(100vh-300px)] min-h-36 space-y-3 overflow-y-auto">
                    {stageLeads.map((lead) => (
                      <article
                        key={lead.id}
                        draggable={!moveLead.isPending}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", lead.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDraggedLead(lead.id);
                        }}
                        onDragEnd={() => { setDraggedLead(null); setDropStage(null); }}
                        className={`cursor-grab rounded-xl border border-black/5 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${draggedLead === lead.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-ink">{lead.name}</h3>
                            <Link className="mt-1 inline-block text-xs text-pine hover:underline" to="/admin/whatsapp" search={{ leadId: lead.id }}>{lead.phone}</Link>
                          </div>
                          <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-bold ${isTerminal ? "bg-paper text-muted" : "bg-[#f3f6e8] text-pine"}`}>{lead.source}</span>
                        </div>
                        <Link
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#eaf0e8] px-2.5 py-2 text-[10px] font-bold text-pine transition hover:bg-[#dfe9dc]"
                          to="/admin/whatsapp"
                          search={{ leadId: lead.id }}
                        >
                          <MessageCircle size={13} /> Conversar no WhatsApp
                        </Link>
                        {lead.motorcycle && <p className="mt-3 truncate rounded-lg bg-paper px-2.5 py-2 text-[10px] font-semibold text-ink/75">{lead.motorcycle.brand} {lead.motorcycle.model}</p>}
                        <div className="mt-3 space-y-1.5 text-[10px] text-muted">
                          <p className="flex items-center gap-1.5"><UserRound size={12} />{lead.seller?.name ?? "Vendedor não atribuído"}</p>
                          <p className="flex items-center gap-1.5"><CalendarDays size={12} />Recebido em {dateLabel(lead.createdAt)}</p>
                        </div>
                        <label className="sr-only" htmlFor={`lead-stage-${lead.id}`}>Mover {lead.name} para outra etapa</label>
                        <select
                          id={`lead-stage-${lead.id}`}
                          className="mt-3 w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-[10px] font-semibold text-ink"
                          value={lead.stage}
                          disabled={moveLead.isPending}
                          onChange={(event) => moveToStage(lead, event.target.value)}
                        >
                          {leadStages.map((option) => <option key={option} value={option}>{stageLabels[option]}</option>)}
                        </select>
                      </article>
                    ))}
                    {stageLeads.length === 0 && <div className="rounded-xl border border-dashed border-black/10 px-3 py-8 text-center text-[10px] text-muted">Solte um lead nesta etapa</div>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
