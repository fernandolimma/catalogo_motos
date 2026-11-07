import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Pencil, Plus, Settings, Tags, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "../components/admin-shell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";

type OptionType = "GROUP" | "MODEL" | "CATEGORY" | "YEAR" | "VERSION" | "ORIGIN";
type MotorcycleOption = { id: string; type: OptionType; value: string };

const optionSections: Array<{ type: OptionType; title: string; description: string; placeholder: string }> = [
  { type: "GROUP", title: "Grupos de motocicletas", description: "Organize os grupos disponíveis no cadastro de motos.", placeholder: "Ex.: Street" },
  { type: "MODEL", title: "Modelos de motocicletas", description: "Cadastre os modelos que poderão ser selecionados no estoque.", placeholder: "Ex.: CG 160" },
  { type: "CATEGORY", title: "Categorias de motocicletas", description: "Defina as categorias disponíveis para classificar as motos.", placeholder: "Ex.: Trail" },
  { type: "YEAR", title: "Anos das motocicletas", description: "Cadastre o ano de fabricação, incluindo formatos como 26/27.", placeholder: "Ex.: 2026 ou 26/27" },
  { type: "VERSION", title: "Versões de motocicletas", description: "Defina as versões que poderão ser escolhidas no cadastro.", placeholder: "Ex.: ABS" },
  { type: "ORIGIN", title: "Origens de leads", description: "Cadastre as origens disponíveis ao incluir leads manualmente.", placeholder: "Ex.: Indicação" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [values, setValues] = useState<Record<OptionType, string>>({ GROUP: "", MODEL: "", CATEGORY: "", YEAR: "", VERSION: "", ORIGIN: "" });
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editedValue, setEditedValue] = useState("");
  const auth = useQuery({ queryKey: ["session"], queryFn: async () => (await api.get("/auth/me")).data });
  const options = useQuery({
    queryKey: ["motorcycle-options"],
    queryFn: async () => (await api.get<{ items: MotorcycleOption[] }>("/motorcycle-options")).data.items,
    enabled: auth.isSuccess,
  });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);

  const createOption = useMutation({
    mutationFn: async ({ type, value }: { type: OptionType; value: string }) =>
      api.post("/motorcycle-options", { type, value }),
    onSuccess: async (_result, variables) => {
      setValues((current) => ({ ...current, [variables.type]: "" }));
      await cache.invalidateQueries({ queryKey: ["motorcycle-options"] });
    },
  });
  const updateOption = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) =>
      api.patch(`/motorcycle-options/${id}`, { value }),
    onSuccess: async () => {
      setEditingOption(null);
      setEditedValue("");
      await cache.invalidateQueries({ queryKey: ["motorcycle-options"] });
    },
  });
  const deleteOption = useMutation({
    mutationFn: async (id: string) => api.delete(`/motorcycle-options/${id}`),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["motorcycle-options"] });
    },
  });

  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  const currentUser = (auth.data as { user?: { name?: string; role?: string } }).user;
  if (currentUser?.role !== "ADMIN") {
    return <main className="page-wrap py-24 text-center"><p className="font-bold">Somente administradores podem alterar as configurações.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;
  }

  return (
    <AdminShell userName={currentUser.name ?? "Usuário"} role="ADMIN">
      <div className="page-wrap py-4 sm:py-5">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Administração</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Configurações</h1>
        <p className="mt-2 text-sm text-muted">Gerencie as opções utilizadas nos cadastros do sistema.</p>

        <section className="mt-8 grid items-start gap-6 lg:grid-cols-2" aria-label="Opções de motocicletas">
          {optionSections.map((section) => {
            const sectionOptions = options.data?.filter((option) => option.type === section.type) ?? [];
            return (
              <Card key={section.type} className="rounded-2xl p-5 shadow-none sm:p-7">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ebefe8] text-pine"><Tags size={18} /></span>
                  <div><h2 className="font-bold">{section.title}</h2><p className="mt-1 text-xs leading-5 text-muted">{section.description}</p></div>
                </div>
                <form className="mt-5 flex items-end gap-2" onSubmit={(event) => {
                  event.preventDefault();
                  const value = values[section.type].trim();
                  if (value) createOption.mutate({ type: section.type, value });
                }}>
                  <label className="field-label min-w-0 flex-1">
                    Novo {section.type === "GROUP" ? "grupo" : section.type === "MODEL" ? "modelo" : section.type === "CATEGORY" ? "categoria" : section.type === "YEAR" ? "ano" : section.type === "ORIGIN" ? "origem" : "versão"}
                    <input
                      className="field-input"
                      type="text"
                      maxLength={section.type === "YEAR" ? 20 : 100}
                      placeholder={section.placeholder}
                      value={values[section.type]}
                      onChange={(event) => setValues((current) => ({ ...current, [section.type]: event.target.value }))}
                    />
                  </label>
                  <Button type="submit" className="shrink-0" disabled={!values[section.type].trim() || createOption.isPending}>
                    {createOption.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
                    Adicionar
                  </Button>
                </form>
                {createOption.isError && createOption.variables?.type === section.type && <p className="mt-3 text-xs text-red-700" role="alert">{errorMessage(createOption.error)}</p>}
                {createOption.isSuccess && createOption.variables?.type === section.type && <p className="mt-3 text-xs font-semibold text-pine" role="status">Opção cadastrada.</p>}
                <div className="mt-6 border-t border-black/5 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold">Cadastrados</h3>
                    <span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-bold text-muted">{sectionOptions.length}</span>
                  </div>
                  {options.isLoading && <p className="mt-3 text-xs text-muted">Carregando configurações...</p>}
                  {options.isError && <p className="mt-3 text-xs text-red-700" role="alert">{errorMessage(options.error)}</p>}
                  {!options.isLoading && !options.isError && sectionOptions.length === 0 && <p className="mt-3 text-xs text-muted">Nenhuma opção cadastrada.</p>}
                  {sectionOptions.length > 0 && <ul className="mt-3 grid gap-2">
                    {sectionOptions.map((option) => <li key={option.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-black/5 bg-paper p-2">
                      {editingOption === option.id ? (
                        <>
                          <input
                            autoFocus
                            aria-label={`Editar ${option.value}`}
                            className="field-input min-w-0 flex-1"
                            maxLength={section.type === "YEAR" ? 20 : 100}
                            value={editedValue}
                            onChange={(event) => setEditedValue(event.target.value)}
                          />
                          <Button
                            type="button"
                            size="small"
                            aria-label={`Salvar ${option.value}`}
                            disabled={!editedValue.trim() || updateOption.isPending}
                            onClick={() => updateOption.mutate({ id: option.id, value: editedValue.trim() })}
                          ><Check size={15} />Salvar</Button>
                          <Button type="button" size="small" variant="outline" aria-label="Cancelar edição" onClick={() => {
                            setEditingOption(null);
                            setEditedValue("");
                            updateOption.reset();
                          }}><X size={15} />Cancelar</Button>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 break-words px-1 text-xs font-semibold text-ink">{option.value}</span>
                          <Button type="button" size="small" variant="outline" aria-label={`Editar ${option.value}`} disabled={updateOption.isPending || deleteOption.isPending} onClick={() => {
                            setEditingOption(option.id);
                            setEditedValue(option.value);
                            updateOption.reset();
                          }}><Pencil size={14} />Editar</Button>
                          <Button type="button" size="small" variant="outline" aria-label={`Excluir ${option.value}`} disabled={deleteOption.isPending || updateOption.isPending} onClick={() => {
                            if (window.confirm(`Excluir "${option.value}"? A opção deixará de aparecer nas listas de cadastro.`)) {
                              deleteOption.mutate(option.id);
                            }
                          }}><Trash2 size={14} />Excluir</Button>
                        </>
                      )}
                    </li>)}
                  </ul>}
                  {updateOption.isError && updateOption.variables?.id && sectionOptions.some((option) => option.id === updateOption.variables?.id) && <p className="mt-3 text-xs text-red-700" role="alert">{errorMessage(updateOption.error)}</p>}
                  {deleteOption.isError && deleteOption.variables && sectionOptions.some((option) => option.id === deleteOption.variables) && <p className="mt-3 text-xs text-red-700" role="alert">{errorMessage(deleteOption.error)}</p>}
                </div>
              </Card>
            );
          })}
        </section>
        <Card className="mt-6 flex items-start gap-3 rounded-2xl p-5 shadow-none">
          <Settings size={17} className="mt-0.5 shrink-0 text-pine" />
          <p className="text-xs leading-5 text-muted">Os grupos e modelos cadastrados ficam salvos no banco de dados e são carregados na tela de cadastro de motocicletas.</p>
        </Card>
      </div>
    </AdminShell>
  );
}
