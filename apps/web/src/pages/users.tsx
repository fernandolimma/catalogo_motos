import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LoaderCircle, Pencil, Plus, Shield, UserCheck, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AdminShell } from "../components/admin-shell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";

const userSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().email("Informe um e-mail válido.").max(254),
  password: z.string().refine((value) => !value || value.length >= 12, "A senha deve ter pelo menos 12 caracteres."),
  role: z.enum(["ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"]),
  sellerId: z.string(),
}).superRefine((value, context) => {
  if (value.role === "SELLER" && !value.sellerId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sellerId"], message: "Vincule um vendedor à conta." });
  }
});

type UserValues = z.infer<typeof userSchema>;
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserValues["role"];
  isActive: boolean;
  seller: { id: string; name: string } | null;
};
type ManagedSeller = { id: string; name: string; userId: string | null; isActive: boolean };

const roleLabels: Record<UserValues["role"], string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  SUPPORT: "Suporte",
};

const emptyValues: UserValues = { name: "", email: "", password: "", role: "SELLER", sellerId: "" };

export function UsersPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const auth = useQuery({ queryKey: ["session"], queryFn: async () => (await api.get("/auth/me")).data });
  const users = useQuery({
    queryKey: ["managed-users"],
    queryFn: async () => (await api.get<{ items: ManagedUser[] }>("/users")).data.items,
    enabled: auth.isSuccess,
  });
  const sellers = useQuery({
    queryKey: ["inventory-sellers"],
    queryFn: async () => (await api.get<{ items: ManagedSeller[] }>("/sellers")).data.items,
    enabled: auth.isSuccess,
  });
  const form = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: emptyValues,
  });
  const selectedRole = form.watch("role");
  const currentUserId = (auth.data as { user?: { id?: string } } | undefined)?.user?.id;
  const availableSellers = sellers.data?.filter((seller) =>
    seller.isActive && (!seller.userId || seller.userId === editingUser?.id),
  ) ?? [];

  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);

  const saveUser = useMutation({
    mutationFn: async (values: UserValues) => {
      const payload = {
        name: values.name,
        email: values.email,
        role: values.role,
        sellerId: ["SELLER", "SUPPORT"].includes(values.role) ? values.sellerId || null : null,
        ...(values.password ? { password: values.password } : {}),
      };
      if (editingUser) return api.patch(`/users/${editingUser.id}`, payload);
      return api.post("/users", payload);
    },
    onSuccess: async (_result, values) => {
      if (editingUser?.id === currentUserId && values.password) {
        await api.post("/auth/logout");
        await cache.clear();
        await navigate({ to: "/login" });
        return;
      }
      setEditingUser(null);
      form.reset(emptyValues);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["managed-users"] }),
        cache.invalidateQueries({ queryKey: ["inventory-sellers"] }),
      ]);
    },
  });
  const setUserActive = useMutation({
    mutationFn: async ({ user, isActive }: { user: ManagedUser; isActive: boolean }) =>
      api.patch(`/users/${user.id}`, { isActive }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["managed-users"] }),
        cache.invalidateQueries({ queryKey: ["inventory-sellers"] }),
      ]);
    },
  });

  if (auth.isLoading || !auth.isSuccess) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  }
  const currentUser = (auth.data as { user?: { id?: string; name?: string; role?: string } }).user;
  if (currentUser?.role !== "ADMIN") {
    return <main className="page-wrap py-24 text-center"><p className="font-bold">Somente administradores podem gerenciar contas.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;
  }

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={currentUser?.role ?? "ADMIN"}>
      <div className="page-wrap py-4 sm:py-5">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Administração</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Usuários e permissões</h1>
        <p className="mt-2 text-sm text-muted">Crie acessos, associe vendedores, redefina senhas e bloqueie contas sem excluir o histórico.</p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <Card className="rounded-2xl p-5 shadow-none sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebefe8] text-pine">{editingUser ? <Pencil size={18} /> : <Plus size={19} />}</span>
              <div><h2 className="font-bold">{editingUser ? "Editar conta" : "Criar conta"}</h2><p className="mt-1 text-xs text-muted">As senhas precisam ter pelo menos 12 caracteres.</p></div>
            </div>
            <form className="mt-6 space-y-4" onSubmit={form.handleSubmit((values) => {
              if (!editingUser && values.password.length < 12) {
                form.setError("password", { message: "A senha inicial deve ter pelo menos 12 caracteres." });
                return;
              }
              saveUser.mutate(values);
            })}>
              <label className="field-label">Nome
                <input className="field-input" autoComplete="name" {...form.register("name")} />
                {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
              </label>
              <label className="field-label">E-mail de acesso
                <input className="field-input" autoComplete="email" type="email" {...form.register("email")} />
                {form.formState.errors.email && <span className="field-error">{form.formState.errors.email.message}</span>}
              </label>
              <label className="field-label">{editingUser ? "Nova senha (opcional)" : "Senha inicial"}
                <input className="field-input" autoComplete="new-password" type="password" {...form.register("password")} />
                {form.formState.errors.password && <span className="field-error">{form.formState.errors.password.message}</span>}
              </label>
              <label className="field-label">Perfil
                <select className="field-input" {...form.register("role")}>
                  {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
              </label>
              {["SELLER", "SUPPORT"].includes(selectedRole) && <label className="field-label">Vendedor vinculado{selectedRole === "SUPPORT" ? " (opcional)" : ""}
                <select className="field-input" {...form.register("sellerId")}>
                  <option value="">Selecione um vendedor</option>
                  {availableSellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                </select>
                {form.formState.errors.sellerId && <span className="field-error">{form.formState.errors.sellerId.message}</span>}
              </label>}
              {saveUser.isError && <p className="field-error" role="alert">{errorMessage(saveUser.error)}</p>}
              <Button className="w-full" type="submit" disabled={saveUser.isPending || users.isLoading || sellers.isLoading}>
                {saveUser.isPending ? <LoaderCircle size={16} className="animate-spin" /> : editingUser ? <KeyRound size={16} /> : <Plus size={16} />}
                {editingUser ? "Salvar conta" : "Criar acesso"}
              </Button>
              {editingUser && <Button className="w-full" variant="outline" type="button" onClick={() => {
                setEditingUser(null);
                form.reset(emptyValues);
                saveUser.reset();
              }}>Cancelar edição</Button>}
            </form>
          </Card>

          <Card className="overflow-hidden rounded-2xl shadow-none">
            <div className="border-b border-black/5 p-5 sm:p-7">
              <div className="flex items-center gap-3"><Shield className="text-pine" size={20} /><div><h2 className="font-bold">Contas cadastradas</h2><p className="mt-1 text-xs text-muted">Desativar bloqueia o login sem apagar vendas ou atividades.</p></div></div>
            </div>
            {users.isLoading && <p className="p-8 text-center text-xs text-muted">Carregando contas...</p>}
            {users.isError && <p className="p-8 text-center text-xs text-red-700" role="alert">{errorMessage(users.error)}</p>}
            {users.data?.length === 0 && <p className="p-8 text-center text-xs text-muted">Nenhuma conta cadastrada.</p>}
            {users.data && users.data.length > 0 && <ul className="divide-y divide-black/5">
              {users.data.map((user) => {
                const isCurrentUser = user.id === currentUser.id;
                return <li key={user.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold">{user.name}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${user.isActive ? "bg-[#ebefe8] text-pine" : "bg-red-50 text-red-700"}`}>{user.isActive ? "Ativa" : "Bloqueada"}</span>{isCurrentUser && <span className="text-[9px] text-muted">Sua conta</span>}</div>
                    <p className="mt-1 truncate text-xs text-muted">{user.email}</p>
                    <p className="mt-1 text-[10px] font-semibold text-ink/60">{roleLabels[user.role]}{user.seller ? ` · ${user.seller.name}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="small" variant="outline" type="button" onClick={() => {
                      setEditingUser(user);
                      form.reset({ name: user.name, email: user.email, password: "", role: user.role, sellerId: user.seller?.id ?? "" });
                      saveUser.reset();
                    }}><Pencil size={13} />Editar</Button>
                    <Button size="small" variant="outline" type="button" disabled={isCurrentUser || setUserActive.isPending} onClick={() => setUserActive.mutate({ user, isActive: !user.isActive })}>
                      {setUserActive.isPending ? <LoaderCircle size={13} className="animate-spin" /> : user.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                      {user.isActive ? "Bloquear" : "Ativar"}
                    </Button>
                  </div>
                </li>;
              })}
            </ul>}
            {setUserActive.isError && <p className="border-t border-black/5 p-4 text-xs text-red-700" role="alert">{errorMessage(setUserActive.error)}</p>}
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
