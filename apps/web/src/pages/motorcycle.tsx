import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Gauge, MessageCircle, ShieldCheck } from "lucide-react";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { InterestForm } from "../components/interest-form";
import { Card } from "../components/ui/card";
import { api } from "../lib/api";
import { formatBRL, type Motorcycle } from "../lib/types";

export function MotorcyclePage() {
  const { slug } = useParams({ from: "/motos/$slug" });
  const { seller: sellerSlug } = useSearch({ from: "/motos/$slug" });
  const query = useQuery({
    queryKey: ["motorcycle", slug],
    queryFn: async () => (await api.get<{ motorcycle: Motorcycle }>(`/public/motorcycles/${encodeURIComponent(slug)}`)).data.motorcycle,
  });

  if (query.isLoading) return <div className="page-wrap py-24 text-center text-sm text-muted">Carregando detalhes...</div>;
  if (query.isError || !query.data) return <div className="page-wrap py-24 text-center"><p className="text-lg font-bold">Esta motocicleta não está disponível.</p><Link className="mt-5 inline-block text-sm font-bold text-pine underline" to="/">Voltar ao catálogo</Link></div>;
  const motorcycle = query.data;
  const image = motorcycle.images?.find((item) => item.url)?.url ?? motorcycle.imageUrl;
  document.title = `${motorcycle.brand} ${motorcycle.model} | Independência Motos`;
  const specs = [
    ["Ano", `${motorcycle.year}${motorcycle.modelYear ? ` / ${motorcycle.modelYear}` : ""}`],
    ["Cilindrada", motorcycle.displacementCc ? `${motorcycle.displacementCc} cc` : null],
    ["Quilometragem", motorcycle.mileageKm !== null && motorcycle.mileageKm !== undefined ? `${new Intl.NumberFormat("pt-BR").format(motorcycle.mileageKm)} km` : null],
    ["Cor", motorcycle.color],
    ["Categoria", motorcycle.category],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <div className="page-wrap py-10 sm:py-16">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} /> Voltar ao catálogo</Link>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="flex aspect-[1.35] items-center justify-center overflow-hidden rounded-[2rem] bg-[#e8ede5]">
            {image ? <img className="h-full w-full object-cover" src={image} alt={`${motorcycle.brand} ${motorcycle.model}`} /> : <span className="text-8xl">🏍</span>}
          </div>
          {motorcycle.images && motorcycle.images.length > 1 && <div className="mt-3 grid grid-cols-4 gap-3">{motorcycle.images.map((item) => <img key={item.id} className="aspect-square rounded-xl object-cover" src={item.url} alt={item.alt ?? ""} />)}</div>}
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-pine">{motorcycle.brand}</p>
            <h1 className="mt-2 font-display text-4xl font-black tracking-[-.04em] sm:text-5xl">{motorcycle.model}{motorcycle.version ? ` ${motorcycle.version}` : ""}</h1>
            {motorcycle.description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-muted">{motorcycle.description}</p>}
            <h2 className="mt-9 text-lg font-extrabold">Ficha da motocicleta</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{specs.map(([label, value]) => <Card key={label} className="rounded-2xl p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p><p className="mt-2 font-bold">{value}</p></Card>)}</div>
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#ebefe8] p-4 text-xs leading-5 text-ink/65"><ShieldCheck size={18} className="shrink-0 text-pine" />Disponibilidade e informações comerciais podem mudar. Confirme os detalhes com a equipe.</div>
          </div>
        </div>
        <aside className="lg:sticky lg:top-28">
          <Card className="rounded-[2rem] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-pine">Disponível no catálogo</p>
            <p className="mt-4 font-display text-4xl font-black tracking-[-.04em]">{formatBRL(motorcycle.promotionalCents ?? motorcycle.priceCents)}</p>
            <p className="mt-2 text-xs leading-5 text-muted">Consulte a equipe para confirmar as condições comerciais vigentes.</p>
            <div className="my-7 h-px bg-black/5" />
            {motorcycle.primarySeller && <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-paper p-4">
              <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted">Vendedor responsável</p><p className="mt-1 font-bold">{motorcycle.primarySeller.name}</p></div>
              <Link to="/vendedor/$slug" params={{ slug: motorcycle.primarySeller.slug }} className="text-xs font-bold text-pine underline">Ver catálogo</Link>
            </div>}
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold"><Gauge size={17} className="text-pine" />Fale com a equipe sobre esta moto</div>
            <InterestForm motorcycleSlug={motorcycle.slug} sellerSlug={sellerSlug} />
            {motorcycle.primarySeller?.whatsapp && <a className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full border border-black/10 text-sm font-bold text-ink hover:bg-black/5" href={`https://wa.me/${motorcycle.primarySeller.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />Abrir WhatsApp <ArrowUpRight size={14} /></a>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
