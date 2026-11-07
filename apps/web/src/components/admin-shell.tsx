import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bike, Columns3, ExternalLink, LayoutDashboard, LogOut, MessageCircle, Plus, Settings, Shield, Store, UserCog, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { api } from "../lib/api";
import { Button } from "./ui/button";

type AdminShellProps = {
  children: ReactNode;
  userName: string;
  role: string;
  fullScreen?: boolean;
};

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  SUPPORT: "Suporte",
};

export function AdminShell({ children, userName, role, fullScreen = false }: AdminShellProps) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: async () => {
      await cache.clear();
      await navigate({ to: "/login" });
    },
  });
  const canManageInventory = ["ADMIN", "SUPERVISOR", "MANAGER"].includes(role);
  const isAdmin = role === "ADMIN";

  const linkClass = (active: boolean) =>
    `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
      active ? "bg-lime text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <div className={fullScreen ? "min-h-screen bg-[#111b21]" : "min-h-screen bg-[#f6f7f3] lg:grid lg:grid-cols-[250px_minmax(0,1fr)]"}>
      {!fullScreen && <aside className="bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link to="/admin" className="flex h-[68px] items-center gap-3 border-b border-white/10 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-pine"><Bike size={18} /></span>
          <span className="text-sm font-black tracking-tight">INDEPENDÊNCIA <span className="text-lime">CRM</span></span>
        </Link>
        <nav aria-label="Navegação administrativa" className="flex gap-2 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible lg:px-4 lg:py-6">
          <Link to="/admin" activeOptions={{ exact: true }} className={linkClass(pathname === "/admin")}><LayoutDashboard size={16} /> Painel comercial</Link>
          <Link to="/admin/funil" className={linkClass(pathname === "/admin/funil")}><Columns3 size={16} /> Funil de vendas</Link>
          {["ADMIN", "SUPERVISOR", "MANAGER", "SELLER", "SUPPORT"].includes(role) && <Link to="/admin/contatos" className={linkClass(pathname === "/admin/contatos")}><Users size={16} /> Contatos</Link>}
          {["ADMIN", "SUPERVISOR", "MANAGER", "SELLER"].includes(role) && <Link to="/admin/whatsapp" className={linkClass(pathname === "/admin/whatsapp")}><MessageCircle size={16} /> WhatsApp</Link>}
          {["ADMIN", "SELLER"].includes(role) && <Link to="/admin/leads/cadastrar" className={linkClass(pathname === "/admin/leads/cadastrar")}><UserPlus size={16} /> Cadastrar lead</Link>}
          {canManageInventory && <>
            <Link to="/admin/estoque" className={linkClass(pathname === "/admin/estoque")}><Bike size={16} /> Estoque</Link>
            <Link to="/admin/motocicletas/cadastrar" className={linkClass(pathname === "/admin/motocicletas/cadastrar")}><Plus size={16} /> Cadastrar</Link>
            <Link to="/admin/vendedores" className={linkClass(pathname === "/admin/vendedores")}><Store size={16} /> Vendedores</Link>
          </>}
          {isAdmin && <>
            <Link to="/admin/usuarios" className={linkClass(pathname === "/admin/usuarios")}><UserCog size={16} /> Contas de acesso</Link>
            <Link to="/admin/configuracoes" className={linkClass(pathname === "/admin/configuracoes")}><Settings size={16} /> Configurações</Link>
          </>}
        </nav>
        <div className="hidden px-4 pb-5 lg:mt-auto lg:block">
          <a href="/" className="mb-4 flex items-center justify-between rounded-xl border border-white/10 px-3 py-3 text-xs font-semibold text-white/75 transition hover:bg-white/5 hover:text-white">
            Abrir catálogo público <ExternalLink size={14} />
          </a>
          <div className="flex items-center gap-3 border-t border-white/10 pt-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lime"><Shield size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{userName}</p>
              <p className="mt-1 text-[10px] text-white/50">{roleLabels[role] ?? role}</p>
            </div>
            <button type="button" aria-label="Sair do sistema" title="Sair" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>}
      <div className="min-w-0">
        {!fullScreen && <header className="flex h-[60px] items-center justify-between border-b border-black/5 bg-white px-4 sm:px-6 lg:h-[68px] lg:px-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted"><BarChart3 size={15} className="text-pine" /> Gestão da loja</div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block"><span className="block text-xs font-bold text-ink">{userName}</span><span className="mt-0.5 block text-[10px] text-muted">{roleLabels[role] ?? role}</span></span>
            <Button className="lg:hidden" size="small" variant="outline" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={14} /> Sair</Button>
          </div>
        </header>}
        <main className={fullScreen ? "min-w-0" : "min-w-0 py-5 sm:py-7 lg:py-8"}>{children}</main>
      </div>
    </div>
  );
}
