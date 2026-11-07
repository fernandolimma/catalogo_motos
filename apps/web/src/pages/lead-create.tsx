import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Save } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AdminShell } from "../components/admin-shell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";

type Session = {
  user?: {
    id: string;
    name: string;
    role: string;
    seller?: { id: string; name: string } | null;
  };
};
type LeadSource = { id: string; value: string };
type Seller = { id: string; name: string };

const leadSchema = z.object({
  sellerId: z.string(),
  name: z.string().trim().min(2, "Informe seu nome completo.").max(120),
  phone: z.string().trim().min(10, "Informe seu telefone com DDD.").max(30),
  email: z.string().trim().min(1, "Informe seu e-mail.").email("Informe um e-mail válido.").max(254),
  bestContactTime: z.string().max(100),
  message: z.string().max(2000),
  originId: z.string().min(1, "Selecione a origem do lead."),
});
type LeadValues = z.infer<typeof leadSchema>;

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function LeadCreatePage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const auth = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await api.get<Session>("/auth/me")).data,
  });
  const currentUser = auth.data?.user;
  const isAdmin = currentUser?.role === "ADMIN";
  const sources = useQuery({
    queryKey: ["lead-sources"],
    queryFn: async () => (await api.get<{ items: LeadSource[] }>("/lead-sources")).data.items,
    enabled: auth.isSuccess,
  });
  const sellers = useQuery({
    queryKey: ["inventory-sellers"],
    queryFn: async () => (await api.get<{ items: Seller[] }>("/sellers")).data.items,
    enabled: auth.isSuccess && isAdmin,
  });
  const form = useForm<LeadValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: { sellerId: "", name: "", phone: "", email: "", bestContactTime: "", message: "", originId: "" },
  });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
    if (currentUser?.role === "SELLER" && currentUser.seller) {
      form.setValue("sellerId", currentUser.seller.id);
    }
  }, [auth.isError, currentUser, form, navigate]);

  const createLead = useMutation({
    mutationFn: async (values: LeadValues) => api.post("/leads/manual", {
      ...(isAdmin ? { sellerId: values.sellerId } : {}),
      name: values.name,
      phone: values.phone,
      email: values.email,
      bestContactTime: values.bestContactTime || undefined,
      message: values.message || undefined,
      originId: values.originId,
    }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["leads"] }),
        cache.invalidateQueries({ queryKey: ["crm-overview"] }),
        cache.invalidateQueries({ queryKey: ["crm-report"] }),
      ]);
      await navigate({ to: "/admin/funil" });
    },
  });

  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  if (!["ADMIN", "SELLER"].includes(currentUser?.role ?? "")) {
    return <main className="page-wrap py-24 text-center"><p className="font-bold">Somente administradores e vendedores podem cadastrar leads.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;
  }

  const onSubmit = form.handleSubmit((values) => createLead.mutate(values));

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={currentUser?.role ?? "SELLER"}>
      <div className="page-wrap py-4 sm:py-5">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Funil de vendas</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Cadastrar lead</h1>
        <p className="mt-2 text-sm text-muted">Registre contatos recebidos fora do catálogo e encaminhe-os ao vendedor responsável.</p>

        <Card className="mt-7 max-w-3xl rounded-2xl p-5 shadow-none sm:p-8">
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
            <label className="field-label sm:col-span-2">Vendedor responsável pelo atendimento
              {isAdmin ? (
                <select className="field-input" {...form.register("sellerId")} disabled={sellers.isLoading || sellers.isError}>
                  <option value="">{sellers.isLoading ? "Carregando vendedores..." : "Selecione um vendedor"}</option>
                  {sellers.data?.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                </select>
              ) : (
                <input className="field-input" value={currentUser?.seller?.name ?? "Conta sem vendedor vinculado"} readOnly />
              )}
              {form.formState.errors.sellerId && <span className="field-error">{form.formState.errors.sellerId.message}</span>}
              {sellers.isError && <span className="field-error" role="alert">{errorMessage(sellers.error)}</span>}
              {currentUser?.role === "SELLER" && !currentUser.seller && <span className="field-error">Sua conta ainda não está vinculada a um vendedor.</span>}
            </label>
            <label className="field-label sm:col-span-2">Seu nome
              <input className="field-input" autoComplete="name" {...form.register("name")} placeholder="Nome completo" />
              {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
            </label>
            <label className="field-label">Telefone / WhatsApp
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <input
                    {...field}
                    className="field-input"
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={15}
                    placeholder="(00) 00000-0000"
                    value={formatPhone(field.value)}
                    onChange={(event) => field.onChange(formatPhone(event.target.value))}
                  />
                )}
              />
              {form.formState.errors.phone && <span className="field-error">{form.formState.errors.phone.message}</span>}
            </label>
            <label className="field-label">E-mail
              <input className="field-input" autoComplete="email" type="email" required {...form.register("email")} placeholder="voce@email.com" />
              {form.formState.errors.email && <span className="field-error">{form.formState.errors.email.message}</span>}
            </label>
            <label className="field-label">Melhor horário para contato <span className="font-normal text-muted">(opcional)</span>
              <input className="field-input" {...form.register("bestContactTime")} placeholder="Ex.: depois das 18h" />
              {form.formState.errors.bestContactTime && <span className="field-error">{form.formState.errors.bestContactTime.message}</span>}
            </label>
            <label className="field-label">Origem do lead
              <select className="field-input" {...form.register("originId")} disabled={sources.isLoading || sources.isError || sources.data?.length === 0}>
                <option value="">{sources.isLoading ? "Carregando origens..." : "Selecione uma origem"}</option>
                {sources.data?.map((source) => <option key={source.id} value={source.id}>{source.value}</option>)}
              </select>
              {form.formState.errors.originId && <span className="field-error">{form.formState.errors.originId.message}</span>}
              {sources.isError && <span className="field-error" role="alert">{errorMessage(sources.error)}</span>}
              {sources.isSuccess && sources.data.length === 0 && <span className="field-error">Cadastre origens em Configurações antes de incluir um lead.</span>}
            </label>
            <label className="field-label sm:col-span-2">Como podemos ajudar? <span className="font-normal text-muted">(opcional)</span>
              <textarea className="field-input min-h-28 resize-y" {...form.register("message")} placeholder="Anotações ou informações compartilhadas pelo lead" />
              {form.formState.errors.message && <span className="field-error">{form.formState.errors.message.message}</span>}
            </label>
            {createLead.isError && <p className="field-error sm:col-span-2" role="alert">{errorMessage(createLead.error)}</p>}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={createLead.isPending || sources.isLoading || !sources.data?.length || (isAdmin && (sellers.isLoading || !sellers.data?.length)) || (currentUser?.role === "SELLER" && !currentUser.seller)}>
                {createLead.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
                Cadastrar lead
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}
