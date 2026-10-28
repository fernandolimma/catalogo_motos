import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { formatBRL, type Motorcycle, type Seller } from "../lib/types";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

type CatalogResponse = { items: Motorcycle[]; pagination: { total: number } };

function MotorcycleCard({ motorcycle, sellerSlug }: { motorcycle: Motorcycle; sellerSlug?: string }) {
  const image = motorcycle.images?.find((item) => item.url)?.url ?? motorcycle.imageUrl;
  return (
    <Card className="group overflow-hidden transition-transform duration-300 hover:-translate-y-1">
      <Link to="/motos/$slug" params={{ slug: motorcycle.slug }} search={sellerSlug ? { seller: sellerSlug } : {}} className="block">
        <div className="relative flex aspect-[1.4] items-center justify-center overflow-hidden bg-[#e8ede5]">
          {image ? (
            <img className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" src={image} alt={`${motorcycle.brand} ${motorcycle.model}`} loading="lazy" />
          ) : (
            <div className="text-center text-pine/60"><span className="text-6xl">🏍</span><p className="mt-2 text-xs font-semibold uppercase tracking-widest">Foto em breve</p></div>
          )}
          {motorcycle.isFeatured && <span className="absolute left-4 top-4 rounded-full bg-lime px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest">Destaque</span>}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{motorcycle.brand}</p>
              <h3 className="mt-1 text-lg font-extrabold tracking-tight">{motorcycle.model}{motorcycle.version ? ` ${motorcycle.version}` : ""}</h3>
            </div>
            <ArrowUpRight className="mt-1 shrink-0 text-muted transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" size={18} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            <span>{motorcycle.year}{motorcycle.modelYear && motorcycle.modelYear !== motorcycle.year ? `/${motorcycle.modelYear}` : ""}</span>
            {motorcycle.displacementCc && <><span>·</span><span>{motorcycle.displacementCc} cc</span></>}
            {motorcycle.mileageKm !== null && motorcycle.mileageKm !== undefined && <><span>·</span><span>{new Intl.NumberFormat("pt-BR").format(motorcycle.mileageKm)} km</span></>}
          </div>
          <div className="mt-5 border-t border-black/5 pt-4">
            <p className="text-xs text-muted">Valor anunciado</p>
            <p className="mt-1 text-xl font-black tracking-tight">{formatBRL(motorcycle.promotionalCents ?? motorcycle.priceCents)}</p>
          </div>
        </div>
      </Link>
      <div className="px-5 pb-5">
        <Link to="/motos/$slug" params={{ slug: motorcycle.slug }} search={sellerSlug ? { seller: sellerSlug } : {}}><Button variant="outline" className="w-full">Ver detalhes <ArrowRight size={16} /></Button></Link>
      </div>
    </Card>
  );
}

export function HomePage() {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const catalog = useQuery({
    queryKey: ["catalog", q, brand],
    queryFn: async () => (await api.get<CatalogResponse>("/public/motorcycles", { params: { q: q || undefined, brand: brand || undefined, limit: 12 } })).data,
  });
  const sellers = useQuery({
    queryKey: ["public-sellers"],
    queryFn: async () => (await api.get<{ items: Seller[] }>("/public/sellers")).data.items,
  });

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute -right-36 -top-32 h-[580px] w-[580px] rounded-full border border-white/10" />
        <div className="absolute -right-8 -top-4 h-[330px] w-[330px] rounded-full border border-lime/20" />
        <div className="page-wrap relative grid min-h-[580px] items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]">
          <div className="max-w-2xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-[.15em] text-lime"><Sparkles size={14} /> Liberdade tem duas rodas</p>
            <h1 className="font-display text-5xl font-black leading-[1.05] tracking-[-.05em] sm:text-6xl lg:text-7xl">O próximo<br />capítulo começa<br /><span className="text-lime">na estrada.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/65">Encontre a motocicleta que combina com você. Consulte as opções disponíveis e converse com a nossa equipe.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="#catalogo"><Button size="large">Explorar motocicletas <ArrowDown size={17} /></Button></a>
              <span className="text-xs text-white/45">Estoque atualizado pela equipe</span>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-xs font-medium text-white/60">
              <span className="inline-flex items-center gap-2"><BadgeCheck size={16} className="text-lime" /> Atendimento próximo</span>
              <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-lime" /> Informações claras</span>
            </div>
          </div>
          <div className="relative mx-auto flex aspect-square w-full max-w-[470px] items-center justify-center">
            <div className="absolute inset-4 rounded-full bg-lime/10 blur-2xl" />
            <div className="relative flex h-full w-full items-center justify-center rounded-full border border-white/10 bg-white/[.025]">
              <div className="absolute inset-7 rounded-full border border-dashed border-lime/20" />
              <div className="absolute inset-16 rounded-full border border-white/10" />
              <div className="relative -rotate-12 text-[170px] leading-none drop-shadow-2xl sm:text-[220px]" aria-hidden="true">🏍</div>
              <div className="absolute bottom-8 left-5 rounded-2xl border border-white/10 bg-ink/80 px-4 py-3 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-widest text-lime">Sua próxima história</p>
                <p className="mt-1 text-sm font-semibold">começa com uma conversa.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="catalogo" className="scroll-mt-24 py-20 sm:py-24">
        <div className="page-wrap">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.2em] text-pine">Seleção da loja</p>
              <h2 className="mt-3 max-w-xl font-display text-4xl font-black tracking-[-.04em] sm:text-5xl">Encontre sua próxima companheira.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted">Veja as motocicletas disponíveis no momento. Ficou com dúvida? Nossa equipe pode ajudar.</p>
          </div>
          <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm sm:flex-row">
            <label className="flex flex-1 items-center gap-3 px-3">
              <Search size={18} className="shrink-0 text-muted" />
              <input aria-label="Buscar motocicleta" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted/70" placeholder="Busque por marca ou modelo" value={q} onChange={(event) => setQ(event.target.value)} />
            </label>
            <input aria-label="Filtrar por marca" className="h-12 rounded-xl bg-paper px-4 text-sm outline-none placeholder:text-muted/70 sm:w-48" placeholder="Todas as marcas" value={brand} onChange={(event) => setBrand(event.target.value)} />
            <a href="#catalogo"><Button className="h-12 w-full sm:w-auto"><Search size={16} /> Buscar motos</Button></a>
          </div>

          {catalog.isLoading ? <div className="py-20 text-center text-sm text-muted">Carregando motocicletas...</div> : null}
          {catalog.isError ? <div className="py-20 text-center text-sm text-red-700" role="alert">Não foi possível carregar o catálogo. Tente novamente em instantes.</div> : null}
          {catalog.data?.items.length === 0 && <div className="rounded-3xl border border-dashed border-ink/15 py-16 text-center">
            <p className="text-lg font-bold">Nenhuma motocicleta encontrada</p>
            <p className="mt-2 text-sm text-muted">Ajuste sua busca ou volte em breve para conferir novidades.</p>
          </div>}
          {catalog.data?.items.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.data.items.map((motorcycle) => <MotorcycleCard key={motorcycle.id} motorcycle={motorcycle} />)}
          </div> : null}
        </div>
      </section>

      <section className="bg-[#ebefe8] py-20">
        <div className="page-wrap grid gap-10 md:grid-cols-[.8fr_1.2fr] md:items-center">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-pine">Conte com a gente</p>
            <h2 className="mt-3 font-display text-4xl font-black tracking-[-.04em]">Uma boa escolha começa com boas conversas.</h2>
            <p className="mt-5 text-sm leading-7 text-muted">Nossa equipe está pronta para ouvir o que você procura e apresentar as opções disponíveis.</p>
          </div>
          <div id="vendedores" className="grid gap-4 sm:grid-cols-2">
            {sellers.data?.map((seller) => (
              <Link key={seller.slug} to="/vendedor/$slug" params={{ slug: seller.slug }} className="group rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-soft">
                <div className="flex items-center gap-4">
                  {seller.photoUrl ? <img className="h-14 w-14 rounded-2xl object-cover" src={seller.photoUrl} alt="" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime text-lg font-black text-pine">{seller.name.slice(0, 1)}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{seller.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{seller.bio || "Conheça as motos do catálogo e fale diretamente com o vendedor."}</p>
                  </div>
                  <ArrowUpRight size={18} className="text-muted transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-pine" />
                </div>
              </Link>
            ))}
            {sellers.isLoading && <p className="text-sm text-muted">Carregando equipe...</p>}
            {!sellers.isLoading && sellers.data?.length === 0 && <p className="text-sm text-muted">Entre em contato pelo formulário da motocicleta para falar com nossa equipe.</p>}
          </div>
        </div>
      </section>
    </>
  );
}

export { MotorcycleCard };
