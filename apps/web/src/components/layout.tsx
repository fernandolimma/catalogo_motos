import { Link, Outlet } from "@tanstack/react-router";
import { ArrowUpRight, Bike, Menu } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

export function PublicLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-paper/95 backdrop-blur">
        <div className="page-wrap flex h-[76px] items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Independência Motos, início">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime"><Bike size={21} /></span>
            <span className="text-sm font-extrabold leading-tight tracking-tight">INDEPENDÊNCIA<br /><span className="text-pine">MOTOS</span></span>
          </Link>
          <button className="rounded-full p-2 md:hidden" aria-label="Abrir menu" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button>
          <nav className={`${menuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-[76px] flex-col gap-5 border-b border-black/5 bg-paper px-6 py-6 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0`}>
            <a href="/#catalogo" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink/70 hover:text-ink">Motos</a>
            <a href="/#vendedores" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-ink/70 hover:text-ink">Nossa equipe</a>
            <Link to="/login" className="text-sm font-semibold text-ink/70 hover:text-ink">Área do vendedor</Link>
            <a href="/#catalogo" onClick={() => setMenuOpen(false)}><Button size="small">Encontrar minha moto <ArrowUpRight size={15} /></Button></a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-24 bg-ink py-12 text-white">
        <div className="page-wrap flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black tracking-[.18em] text-lime">INDEPENDÊNCIA MOTOS</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Encontre sua próxima motocicleta com uma equipe pronta para ajudar.</p>
          </div>
          <div className="flex gap-5 text-sm text-white/65">
            <Link to="/privacidade" className="hover:text-white">Privacidade</Link>
            <Link to="/login" className="hover:text-white">Acesso da equipe</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function AdminLayout() {
  return <Outlet />;
}
