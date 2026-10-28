import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api, errorMessage } from "../lib/api";
import { getCampaignParams } from "../lib/campaign";
import { Button } from "./ui/button";

const interestSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo."),
  phone: z.string().trim().min(10, "Informe seu telefone com DDD."),
  email: z.union([z.string().email("Informe um e-mail válido."), z.literal("")]),
  message: z.string().max(2000),
  bestContactTime: z.string(),
  consent: z.boolean().refine((value) => value, "Precisamos da sua autorização para responder ao contato."),
});

type InterestValues = z.infer<typeof interestSchema>;

type InterestFormProps = { motorcycleSlug?: string; sellerSlug?: string; compact?: boolean };

export function InterestForm({ motorcycleSlug, sellerSlug, compact = false }: InterestFormProps) {
  const form = useForm<InterestValues>({
    resolver: zodResolver(interestSchema),
    defaultValues: { name: "", phone: "", email: "", message: "", bestContactTime: "", consent: false },
  });
  const mutation = useMutation({
    mutationFn: async (values: InterestValues) => {
      const { data } = await api.post("/public/leads", {
        ...values,
        motorcycleSlug,
        sellerSlug,
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
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="field-label">Seu nome
        <input className="field-input" autoComplete="name" {...form.register("name")} placeholder="Nome completo" />
        {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
      </label>
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="field-label">Telefone / WhatsApp
          <input className="field-input" autoComplete="tel" inputMode="tel" {...form.register("phone")} placeholder="(00) 00000-0000" />
          {form.formState.errors.phone && <span className="field-error">{form.formState.errors.phone.message}</span>}
        </label>
        <label className="field-label">E-mail <span className="font-normal text-muted">(opcional)</span>
          <input className="field-input" autoComplete="email" type="email" {...form.register("email")} placeholder="voce@email.com" />
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
      <Button className="w-full" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={16} />}
        {mutation.isPending ? "Enviando..." : "Quero saber mais"}
      </Button>
    </form>
  );
}
