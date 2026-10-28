import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, LoaderCircle, LockKeyhole } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

type Credentials = z.infer<typeof credentialsSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<Credentials>({ resolver: zodResolver(credentialsSchema), defaultValues: { email: "", password: "" } });
  const login = useMutation({
    mutationFn: async (values: Credentials) => (await api.post("/auth/login", values)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await navigate({ to: "/admin" });
    },
  });
  return (
    <main className="flex min-h-[calc(100vh-76px)] items-center justify-center bg-[#ebefe8] px-4 py-12">
      <Card className="w-full max-w-md rounded-[2rem] p-7 sm:p-9">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold text-muted"><ArrowLeft size={14} /> Voltar ao catálogo</Link>
        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime text-pine"><Bike size={23} /></div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-pine">Área da equipe</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Acesse o CRM</h1>
        <p className="mt-2 text-sm text-muted">Entre com suas credenciais de acesso.</p>
        <form className="mt-7 space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
          <label className="field-label">E-mail
            <input className="field-input" type="email" autoComplete="username" {...form.register("email")} />
            {form.formState.errors.email && <span className="field-error">{form.formState.errors.email.message}</span>}
          </label>
          <label className="field-label">Senha
            <input className="field-input" type="password" autoComplete="current-password" {...form.register("password")} />
            {form.formState.errors.password && <span className="field-error">{form.formState.errors.password.message}</span>}
          </label>
          {login.isError && <p className="field-error" role="alert">{errorMessage(login.error)}</p>}
          <Button className="mt-2 w-full" type="submit" disabled={login.isPending}>
            {login.isPending ? <LoaderCircle size={17} className="animate-spin" /> : <LockKeyhole size={16} />}
            {login.isPending ? "Acessando..." : "Entrar"}
          </Button>
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-muted">Problemas de acesso? Procure o administrador do sistema.</p>
      </Card>
    </main>
  );
}
