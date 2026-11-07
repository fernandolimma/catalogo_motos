import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, Mail, Pencil, Phone, Search, Trash2, Users, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "../components/admin-shell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";

type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
};
type ContactPage = { items: Contact[]; pagination: { total: number; pages: number; page: number } };
type ContactDraft = Pick<Contact, "name" | "phone" | "email">;
type Session = { user?: { id: string; name: string; role: string } };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function ContactsPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>({ name: "", phone: "", email: "" });
  const auth = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await api.get<Session>("/auth/me")).data,
  });
  const contacts = useQuery({
    queryKey: ["contacts", search, page],
    queryFn: async () => (await api.get<ContactPage>("/leads", {
      params: { q: search.trim() || undefined, page, limit: 25 },
    })).data,
    enabled: auth.isSuccess,
  });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);
  useEffect(() => setPage(1), [search]);

  const updateContact = useMutation({
    mutationFn: async ({ id, contact }: { id: string; contact: ContactDraft }) =>
      api.patch(`/leads/${id}/contact`, contact),
    onSuccess: async () => {
      setEditingContact(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["contacts"] }),
        cache.invalidateQueries({ queryKey: ["leads"] }),
        cache.invalidateQueries({ queryKey: ["kanban-leads"] }),
        cache.invalidateQueries({ queryKey: ["lead-detail"] }),
        cache.invalidateQueries({ queryKey: ["whatsapp-chats"] }),
        cache.invalidateQueries({ queryKey: ["crm-overview"] }),
      ]);
    },
  });
  const deleteContact = useMutation({
    mutationFn: async (id: string) => api.delete(`/leads/${id}`),
    onSuccess: async (_result, id) => {
      if (page > 1 && contacts.data?.items.length === 1 && contacts.data.items[0]?.id === id) {
        setPage((value) => value - 1);
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["contacts"] }),
        cache.invalidateQueries({ queryKey: ["leads"] }),
        cache.invalidateQueries({ queryKey: ["kanban-leads"] }),
        cache.invalidateQueries({ queryKey: ["lead-detail"] }),
        cache.invalidateQueries({ queryKey: ["whatsapp-chats"] }),
        cache.invalidateQueries({ queryKey: ["crm-overview"] }),
      ]);
    },
  });

  function startEditing(contact: Contact) {
    setEditingContact(contact);
    setDraft({ name: contact.name, phone: contact.phone, email: contact.email ?? "" });
    updateContact.reset();
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingContact || updateContact.isPending) return;
    updateContact.mutate({ id: editingContact.id, contact: draft });
  }

  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  const currentUser = auth.data.user;
  if (!["ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"].includes(currentUser?.role ?? "")) {
    return <main className="page-wrap py-24 text-center"><p className="font-bold">Seu perfil não pode acessar os contatos.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;
  }
  const pagination = contacts.data?.pagination;
  const canDeleteContacts = currentUser?.role === "ADMIN";

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={currentUser?.role ?? "SELLER"}>
      <div className="page-wrap py-4 sm:py-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">CRM</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Contatos</h1>
            <p className="mt-2 text-sm text-muted">Consulte e gerencie os dados de contato dos Leads recebidos.</p>
          </div>
          {["ADMIN", "SELLER"].includes(currentUser?.role ?? "") && (
            <Link to="/admin/leads/cadastrar" className="inline-flex items-center justify-center rounded-full bg-lime px-5 py-3 text-xs font-semibold text-ink transition hover:bg-[#d2ef77]">
              Cadastrar lead
            </Link>
          )}
        </div>

        <Card className="mt-6 overflow-hidden rounded-2xl p-0 shadow-none">
          <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <Users size={16} className="text-pine" />
              {pagination ? `${pagination.total} ${pagination.total === 1 ? "contato" : "contatos"}` : "Contatos"}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 sm:w-80">
              <Search size={15} className="shrink-0 text-muted" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted"
                aria-label="Buscar contatos"
                placeholder="Buscar por nome, telefone ou e-mail"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {contacts.isError && <p className="m-4 rounded-xl bg-red-50 p-4 text-xs text-red-700" role="alert">{errorMessage(contacts.error)}</p>}
          {deleteContact.isError && <p className="m-4 rounded-xl bg-red-50 p-4 text-xs text-red-700" role="alert">{errorMessage(deleteContact.error)}</p>}
          {deleteContact.isSuccess && <p className="m-4 rounded-xl bg-green-50 p-4 text-xs text-green-800" role="status">Contato excluído.</p>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-paper text-[10px] font-extrabold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">Nome (contato)</th>
                  <th scope="col" className="px-4 py-3">Telefone</th>
                  <th scope="col" className="px-4 py-3">E-mail</th>
                  <th scope="col" className="px-4 py-3">Adicionado em</th>
                  <th scope="col" className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {contacts.isLoading && <tr><td colSpan={5} className="px-5 py-12 text-center text-xs text-muted">Carregando contatos...</td></tr>}
                {!contacts.isLoading && !contacts.isError && contacts.data?.items.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center">
                    <Users className="mx-auto text-muted" size={24} />
                    <p className="mt-3 text-sm font-bold">{search ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}</p>
                    <p className="mt-1 text-xs text-muted">{search ? "Tente buscar por outro termo." : "Os Leads recebidos aparecerão nesta lista."}</p>
                  </td></tr>
                )}
                {contacts.data?.items.map((contact) => (
                  <tr key={contact.id} className="transition hover:bg-paper/70">
                    <td className="px-5 py-4 text-xs font-bold text-ink">{contact.name}</td>
                    <td className="px-4 py-4 text-xs text-ink">{contact.phone}</td>
                    <td className="px-4 py-4 text-xs text-ink">{contact.email || <span className="text-muted">Não informado</span>}</td>
                    <td className="px-4 py-4 text-xs text-muted">{dateLabel(contact.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="small" variant="outline" aria-label={`Editar ${contact.name}`} onClick={() => startEditing(contact)}>
                          <Pencil size={14} /> <span className="hidden sm:inline">Editar</span>
                        </Button>
                        {canDeleteContacts && (
                          <Button
                            type="button"
                            size="small"
                            variant="outline"
                            aria-label={`Excluir ${contact.name}`}
                            className="!border-red-200 !text-red-700 hover:!bg-red-50"
                            disabled={deleteContact.isPending}
                            onClick={() => {
                              if (window.confirm(`Excluir o contato de "${contact.name}"? Esta ação também removerá o histórico do Lead e não pode ser desfeita.`)) {
                                deleteContact.reset();
                                deleteContact.mutate(contact.id);
                              }
                            }}
                          >
                            {deleteContact.isPending && deleteContact.variables === contact.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            <span className="hidden sm:inline">Excluir</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex flex-col gap-3 border-t border-black/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[11px] text-muted">
              {pagination && pagination.total > 0
                ? `Exibindo ${(page - 1) * 25 + 1}–${Math.min(page * 25, pagination.total)} de ${pagination.total}`
                : "Nenhum contato para exibir"}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="small" variant="outline" aria-label="Página anterior" disabled={page <= 1 || contacts.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft size={15} /> Anterior
              </Button>
              <span className="min-w-16 text-center text-[11px] text-muted">{page} / {Math.max(pagination?.pages ?? 0, 1)}</span>
              <Button type="button" size="small" variant="outline" aria-label="Próxima página" disabled={!pagination || page >= pagination.pages || contacts.isFetching} onClick={() => setPage((value) => value + 1)}>
                Próxima <ChevronRight size={15} />
              </Button>
            </div>
          </footer>
        </Card>
      </div>

      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !updateContact.isPending) setEditingContact(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-contact-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
            <header className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-extrabold uppercase tracking-[.15em] text-pine">Contato</p><h2 id="edit-contact-title" className="mt-1 text-xl font-black">Editar dados</h2></div>
              <button type="button" aria-label="Fechar edição" disabled={updateContact.isPending} onClick={() => setEditingContact(null)} className="rounded-full p-2 text-muted hover:bg-paper hover:text-ink disabled:opacity-50"><X size={18} /></button>
            </header>
            <form className="mt-5 space-y-4" onSubmit={submitEdit}>
              <label className="field-label">Nome (contato)
                <input className="field-input" type="text" autoComplete="name" minLength={2} maxLength={120} required value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
              </label>
              <label className="field-label">Telefone
                <span className="relative block"><Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="field-input !pl-9" type="tel" autoComplete="tel" minLength={10} maxLength={30} required value={draft.phone} onChange={(event) => setDraft((value) => ({ ...value, phone: event.target.value }))} /></span>
              </label>
              <label className="field-label">E-mail
                <span className="relative block"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="field-input !pl-9" type="email" autoComplete="email" maxLength={254} value={draft.email ?? ""} onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))} /></span>
              </label>
              <p className="flex items-center gap-1.5 text-[11px] text-muted"><CalendarDays size={13} /> Adicionado em {dateLabel(editingContact.createdAt)}</p>
              {updateContact.isError && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">{errorMessage(updateContact.error)}</p>}
              <div className="flex justify-end gap-2 border-t border-black/5 pt-4">
                <Button type="button" variant="outline" disabled={updateContact.isPending} onClick={() => setEditingContact(null)}>Cancelar</Button>
                <Button type="submit" disabled={updateContact.isPending || !draft.name.trim() || !draft.phone.trim()}>
                  {updateContact.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Pencil size={15} />} Salvar alterações
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
