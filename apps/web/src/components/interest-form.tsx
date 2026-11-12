import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { z } from "zod";
import { api, errorMessage } from "../lib/api";
import { getCampaignParams } from "../lib/campaign";
import type { Seller } from "../lib/types";
import { Button } from "./ui/button";

const interestSchema = z.object({
  sellerSlug: z.string().min(1, "Selecione o vendedor que fará o atendimento."),
  name: z.string().trim().min(2, "Informe seu nome completo."),
  phone: z.string().trim().min(10, "Informe seu telefone com DDD."),
  email: z.string().trim().min(1, "Informe seu e-mail.").email("Informe um e-mail válido.").max(254),
  message: z.string().max(2000),
  bestContactTime: z.string(),
  consent: z.boolean().refine((value) => value, "Precisamos da sua autorização para responder ao contato."),
});

type InterestValues = z.infer<typeof interestSchema>;

type InterestFormProps = { motorcycleSlug?: string; sellerSlug?: string; sellerName?: string; compact?: boolean };

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function InterestForm({ motorcycleSlug, sellerSlug, sellerName, compact = false }: InterestFormProps) {
  const sellers = useQuery({
    queryKey: ["public-sellers"],
    queryFn: async () => (await api.get<{ items: Seller[] }>("/public/sellers")).data.items,
  });
  const form = useForm<InterestValues>({
    resolver: zodResolver(interestSchema),
    defaultValues: { sellerSlug: sellerSlug ?? "", name: "", phone: "", email: "", message: "", bestContactTime: "", consent: false },
  });
  useEffect(() => {
    if (sellerSlug) form.setValue("sellerSlug", sellerSlug, { shouldValidate: true });
  }, [form, sellerSlug]);
  const fixedSellerName = sellerSlug
    ? sellerName ?? sellers.data?.find((seller) => seller.slug === sellerSlug)?.name ?? sellerSlug
    : undefined;
  const mutation = useMutation({
    mutationFn: async (values: InterestValues) => {
      const { data } = await api.post("/public/leads", {
        ...values,
        sellerSlug: sellerSlug ?? values.sellerSlug,
        motorcycleSlug,
        sourcePage: window.location.href,
        utm: getCampaignParams(),
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      return data as { message: string };
    },
  });

  if (mutation.isSuccess) {
    return (
      <div className="rounded-2xl bg-[#f2f8df] p-5 text-pine" role="status">
        <CheckCircle2 className="mb-3" size={24} />
        <p className="font-bold">Interesse recebido</p>
        <p className="mt-1 text-sm leading-6">{mutation.data.message}</p>
      </div>
    );
  }

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));
  return (
    <form onSubmit={(event) => {
      if (!sellerSlug && (!sellers.isSuccess || sellers.data.length === 0)) {
        event.preventDefault();
        return;
      }
      void onSubmit(event);
    }} className="space-y-4">
      <label className="field-label">Vendedor responsável pelo atendimento
        {sellerSlug
          ? <div className="field-input flex items-center" role="textbox" aria-readonly="true">{fixedSellerName}</div>
          : <select className="field-input" {...form.register("sellerSlug")} disabled={sellers.isLoading || sellers.isError || sellers.data?.length === 0}>
            <option value="">{sellers.isLoading ? "Carregando vendedores..." : "Selecione um vendedor"}</option>
            {sellers.data?.map((seller) => <option key={seller.slug} value={seller.slug}>{seller.name}</option>)}
          </select>}
        {form.formState.errors.sellerSlug && <span className="field-error">{form.formState.errors.sellerSlug.message}</span>}
        {!sellerSlug && sellers.isError && <span className="field-error" role="alert">Não foi possível carregar os vendedores. Tente novamente.</span>}
        {!sellerSlug && sellers.isSuccess && sellers.data.length === 0 && <span className="field-error" role="alert">Nenhum vendedor está disponível para atendimento no momento.</span>}
      </label>
      <label className="field-label">Seu nome
        <input className="field-input" autoComplete="name" {...form.register("name")} placeholder="Nome completo" />
        {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
      </label>
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
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
      </div>
      {!compact && <label className="field-label">Melhor horário para contato <span className="font-normal text-muted">(opcional)</span>
        <input className="field-input" {...form.register("bestContactTime")} placeholder="Ex.: depois das 18h" />
      </label>}
      <label className="field-label">Como podemos ajudar? <span className="font-normal text-muted">(opcional)</span>
        <textarea className="field-input min-h-24 resize-y" {...form.register("message")} placeholder="Conte um pouco sobre o que procura" />
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-ink/65">
        <input type="checkbox" className="mt-1 accent-pine" {...form.register("consent")} />
        <span>Autorizo o uso destes dados para responder à minha solicitação, conforme o <a href="/privacidade" className="font-semibold underline">Aviso de Privacidade</a>.</span>
      </label>
      {form.formState.errors.consent && <p className="field-error">{form.formState.errors.consent.message}</p>}
      {mutation.isError && <p className="field-error" role="alert">{errorMessage(mutation.error)}</p>}
      <Button className="w-full" type="submit" disabled={mutation.isPending || (!sellerSlug && (!sellers.isSuccess || sellers.data.length === 0))}>
        {mutation.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={16} />}
        {mutation.isPending ? "Enviando..." : "Quero saber mais"}
      </Button>
    </form>
  );
}
