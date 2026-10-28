import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Link, useParams } from "@tanstack/react-router";
import { MotorcycleCard } from "./home";
import { InterestForm } from "../components/interest-form";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";
import type { Motorcycle, Seller } from "../lib/types";

type SellerCatalog = { seller: Seller & { motorcycles: Motorcycle[] } };

export function SellerPage() {
  const { slug } = useParams({ from: "/vendedor/$slug" });
  const query = useQuery({
    queryKey: ["seller-catalog", slug],
    queryFn: async () => (await api.get<SellerCatalog>(`/public/sellers/${encodeURIComponent(slug)}`)).data.seller,
  });
  if (query.isLoading) return <div className="page-wrap py-24 text-center text-sm text-muted">Carregando catálogo...</div>;
  if (query.isError || !query.data) return <div className="page-wrap py-24 text-center"><p className="text-lg font-bold">Este catálogo não está disponível.</p><Link className="mt-5 inline-block text-sm font-bold text-pine underline" to="/">Voltar ao início</Link></div>;
  const seller = query.data;
  document.title = `Catálogo de ${seller.name} | Independência Motos`;
  return (
    <div className="page-wrap py-12 sm:py-16">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} /> Voltar ao início</Link>
      <section className="mt-8 grid gap-8 rounded-[2rem] bg-ink p-7 text-white sm:grid-cols-[1fr_.8fr] sm:p-10">
        <div className="flex items-center gap-5">
          {seller.photoUrl ? <img className="h-20 w-20 rounded-3xl object-cover" src={seller.photoUrl} alt="" /> : <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-lime text-3xl font-black text-pine">{seller.name.slice(0, 1)}</div>}
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-lime">Seu consultor</p><h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">{seller.name}</h1><p className="mt-2 max-w-lg text-sm leading-6 text-white/60">{seller.bio || "Conheça as motocicletas disponíveis e me conte o que você procura."}</p></div>
        </div>
        {seller.whatsapp && <a className="inline-flex min-h-12 items-center justify-center gap-2 self-center rounded-full bg-lime px-5 text-sm font-bold text-ink" href={`https://wa.me/${seller.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle size={17} /> Conversar no WhatsApp</a>}
      </section>
      <section className="py-14">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-pine">Meu catálogo</p>
        <h2 className="mt-3 font-display text-3xl font-black tracking-tight">Motocicletas disponíveis</h2>
        {seller.motorcycles.length ? <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{seller.motorcycles.map((motorcycle) => <MotorcycleCard key={motorcycle.id} motorcycle={motorcycle} sellerSlug={seller.slug} />)}</div> : <p className="mt-5 text-sm text-muted">Nenhuma motocicleta disponível neste catálogo no momento.</p>}
      </section>
      <section className="mx-auto max-w-2xl">
        <Card className="rounded-[2rem] p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-pine">Vamos conversar</p>
          <h2 className="mt-2 text-2xl font-black">O que você está procurando?</h2>
          <p className="mb-6 mt-2 text-sm text-muted">Deixe seus dados e sua mensagem chegará à nossa equipe.</p>
          <InterestForm sellerSlug={seller.slug} />
        </Card>
      </section>
    </div>
  );
}
