import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, LoaderCircle, Plus, Store } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage } from "../lib/api";
import { formatBRL, type Seller } from "../lib/types";

type InventoryMotorcycle = {
  id: string;
  brand: string;
  model: string;
  version?: string | null;
  year: number;
  priceCents: string;
  imageUrl?: string | null;
  isPublished: boolean;
  status: string;
  primarySeller?: { id: string; name: string } | null;
};

const motorcycleSchema = z.object({
  brand: z.string().trim().min(1, "Informe a marca.").max(80),
  model: z.string().trim().min(1, "Informe o modelo.").max(100),
  version: z.string().trim().max(100),
  year: z.number().int().min(1900).max(2100),
  price: z.string().regex(/^\d+(?:[,.]\d{1,2})?$/, "Use um valor como 12500,00."),
  description: z.string().max(5000),
  imageUrl: z.union([
    z.string().url("Informe uma URL válida.").refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
    z.literal(""),
  ]),
  primarySellerId: z.string(),
  publish: z.boolean(),
});

type MotorcycleValues = z.infer<typeof motorcycleSchema>;

const sellerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.union([z.string().email("Informe um e-mail válido."), z.literal("")]),
  whatsapp: z.string().max(30),
  bio: z.string().max(1000),
});

type SellerValues = z.infer<typeof sellerSchema>;

function priceToCents(value: string) {
  const [whole = "0", fraction = ""] = value.replace(",", ".").split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

const stockLabels: Record<string, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservada",
  SOLD: "Vendida",
  UNAVAILABLE: "Indisponível",
  PREPARING: "Em preparação",
};

export function InventoryPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const auth = useQuery({ queryKey: ["session"], queryFn: async () => (await api.get("/auth/me")).data });
  useEffect(() => {
    if (auth.isError) void navigate({ to: "/login" });
  }, [auth.isError, navigate]);

  const motorcycles = useQuery({
    queryKey: ["inventory-motorcycles"],
    queryFn: async () => (await api.get<{ items: InventoryMotorcycle[] }>("/motorcycles")).data.items,
    enabled: auth.isSuccess,
  });
  const sellers = useQuery({
    queryKey: ["inventory-sellers"],
    queryFn: async () => (await api.get<{ items: Seller[] }>("/sellers")).data.items,
    enabled: auth.isSuccess,
  });
  const motorcycleForm = useForm<MotorcycleValues>({
    resolver: zodResolver(motorcycleSchema),
    defaultValues: { brand: "", model: "", version: "", year: new Date().getFullYear(), price: "", description: "", imageUrl: "", primarySellerId: "", publish: false },
  });
  const sellerForm = useForm<SellerValues>({
    resolver: zodResolver(sellerSchema),
    defaultValues: { name: "", email: "", whatsapp: "", bio: "" },
  });

  const createMotorcycle = useMutation({
    mutationFn: async (values: MotorcycleValues) => api.post("/motorcycles", {
      brand: values.brand,
      model: values.model,
      version: values.version || undefined,
      year: values.year,
      priceCents: priceToCents(values.price),
      description: values.description || undefined,
      imageUrl: values.imageUrl || undefined,
      primarySellerId: values.primarySellerId || undefined,
      isPublished: values.publish,
      status: "AVAILABLE",
    }),
    onSuccess: async () => {
      motorcycleForm.reset({ brand: "", model: "", version: "", year: new Date().getFullYear(), price: "", description: "", imageUrl: "", primarySellerId: "", publish: false });
      await Promise.all([cache.invalidateQueries({ queryKey: ["inventory-motorcycles"] }), cache.invalidateQueries({ queryKey: ["catalog"] })]);
    },
  });
  const createSeller = useMutation({
    mutationFn: async (values: SellerValues) => api.post("/sellers", {
      name: values.name,
      email: values.email || undefined,
      whatsapp: values.whatsapp || undefined,
      bio: values.bio || undefined,
    }),
    onSuccess: async () => {
      sellerForm.reset();
      await cache.invalidateQueries({ queryKey: ["inventory-sellers"] });
    },
  });
  const updateStock = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => api.patch(`/motorcycles/${id}`, { status }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ["inventory-motorcycles"] }), cache.invalidateQueries({ queryKey: ["catalog"] })]);
    },
  });
  const updatePublication = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => api.patch(`/motorcycles/${id}`, { isPublished }),
    onSuccess: async () => {
      await Promise.all([cache.invalidateQueries({ queryKey: ["inventory-motorcycles"] }), cache.invalidateQueries({ queryKey: ["catalog"] })]);
    },
  });

  if (auth.isLoading || !auth.isSuccess) return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  const role = (auth.data as { user?: { role?: string } }).user?.role;
  if (!["ADMIN", "SUPERVISOR", "MANAGER"].includes(role ?? "")) return <main className="page-wrap py-24 text-center"><p className="font-bold">Seu perfil não tem acesso ao estoque.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;

  return (
    <div className="min-h-screen bg-[#f6f7f3]">
      <header className="border-b border-black/5 bg-white"><div className="page-wrap flex h-[72px] items-center justify-between">
        <Link to="/admin" className="flex items-center gap-2 text-sm font-bold text-ink"><ArrowLeft size={16} /> CRM</Link>
        <div className="flex items-center gap-2 font-black"><Bike className="text-pine" size={19} /> Estoque e equipe</div>
      </div></header>
      <main className="page-wrap py-9 sm:py-12">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Administração</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Estoque e vendedores</h1>
        <p className="mt-2 text-sm text-muted">Cadastre os dados reais da loja. Somente motos publicadas e disponíveis aparecem no catálogo.</p>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.3fr_.7fr]">
          <Card className="rounded-2xl p-5 shadow-none sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebefe8] text-pine"><Plus size={19} /></span><div><h2 className="font-bold">Cadastrar motocicleta</h2><p className="mt-1 text-xs text-muted">O valor é informado em reais, com até duas casas decimais.</p></div></div>
            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={motorcycleForm.handleSubmit((values) => createMotorcycle.mutate(values))}>
              <label className="field-label">Marca<input className="field-input" {...motorcycleForm.register("brand")} />{motorcycleForm.formState.errors.brand && <span className="field-error">{motorcycleForm.formState.errors.brand.message}</span>}</label>
              <label className="field-label">Modelo<input className="field-input" {...motorcycleForm.register("model")} />{motorcycleForm.formState.errors.model && <span className="field-error">{motorcycleForm.formState.errors.model.message}</span>}</label>
              <label className="field-label">Versão <span className="font-normal text-muted">(opcional)</span><input className="field-input" {...motorcycleForm.register("version")} /></label>
              <label className="field-label">Ano<input className="field-input" type="number" {...motorcycleForm.register("year", { valueAsNumber: true })} />{motorcycleForm.formState.errors.year && <span className="field-error">{motorcycleForm.formState.errors.year.message}</span>}</label>
              <label className="field-label">Preço (R$)<input className="field-input" inputMode="decimal" placeholder="12500,00" {...motorcycleForm.register("price")} />{motorcycleForm.formState.errors.price && <span className="field-error">{motorcycleForm.formState.errors.price.message}</span>}</label>
              <label className="field-label">Vendedor principal <span className="font-normal text-muted">(opcional)</span>
                <select className="field-input" {...motorcycleForm.register("primarySellerId")}><option value="">Sem vendedor associado</option>{sellers.data?.map((seller) => <option key={seller.id ?? seller.slug} value={seller.id ?? ""}>{seller.name}</option>)}</select>
              </label>
              <label className="field-label sm:col-span-2">URL da foto principal <span className="font-normal text-muted">(opcional; upload ainda não disponível)</span><input className="field-input" type="url" {...motorcycleForm.register("imageUrl")} />{motorcycleForm.formState.errors.imageUrl && <span className="field-error">{motorcycleForm.formState.errors.imageUrl.message}</span>}</label>
              <label className="field-label sm:col-span-2">Descrição comercial <span className="font-normal text-muted">(opcional)</span><textarea className="field-input min-h-24" {...motorcycleForm.register("description")} /></label>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink/70 sm:col-span-2"><input type="checkbox" className="accent-pine" {...motorcycleForm.register("publish")} />Publicar no catálogo imediatamente</label>
              {createMotorcycle.isError && <p className="field-error sm:col-span-2" role="alert">{errorMessage(createMotorcycle.error)}</p>}
              <Button className="w-full sm:col-span-2" type="submit" disabled={createMotorcycle.isPending}>{createMotorcycle.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Cadastrar motocicleta</Button>
            </form>
          </Card>

          <Card className="rounded-2xl p-5 shadow-none sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebefe8] text-pine"><Store size={18} /></span><div><h2 className="font-bold">Adicionar vendedor</h2><p className="mt-1 text-xs text-muted">Cria uma página pública para compartilhar.</p></div></div>
            <form className="mt-6 space-y-4" onSubmit={sellerForm.handleSubmit((values) => createSeller.mutate(values))}>
              <label className="field-label">Nome<input className="field-input" {...sellerForm.register("name")} />{sellerForm.formState.errors.name && <span className="field-error">{sellerForm.formState.errors.name.message}</span>}</label>
              <label className="field-label">E-mail<input className="field-input" type="email" {...sellerForm.register("email")} />{sellerForm.formState.errors.email && <span className="field-error">{sellerForm.formState.errors.email.message}</span>}</label>
              <label className="field-label">WhatsApp <span className="font-normal text-muted">(com código do país)</span><input className="field-input" inputMode="tel" {...sellerForm.register("whatsapp")} /></label>
              <label className="field-label">Apresentação<input className="field-input" {...sellerForm.register("bio")} /></label>
              {createSeller.isError && <p className="field-error" role="alert">{errorMessage(createSeller.error)}</p>}
              {createSeller.isSuccess && <p className="text-xs font-semibold text-pine" role="status">Vendedor cadastrado.</p>}
              <Button className="w-full" variant="dark" type="submit" disabled={createSeller.isPending}>{createSeller.isPending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}Adicionar vendedor</Button>
            </form>
          </Card>
        </div>

        <Card className="mt-6 overflow-hidden rounded-2xl shadow-none">
          <div className="flex items-center justify-between p-5"><div><h2 className="font-bold">Motocicletas cadastradas</h2><p className="mt-1 text-xs text-muted">{motorcycles.data?.length ?? 0} registros</p></div></div>
          {motorcycles.isLoading && <p className="p-8 text-center text-xs text-muted">Carregando estoque...</p>}
          {motorcycles.isError && <p className="p-8 text-center text-xs text-red-700">{errorMessage(motorcycles.error)}</p>}
          {motorcycles.data?.length === 0 && <p className="p-8 text-center text-xs text-muted">Nenhuma motocicleta cadastrada.</p>}
          {motorcycles.data && motorcycles.data.length > 0 && <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-[#fafbf8] text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-5 py-3">Motocicleta</th><th className="px-4 py-3">Preço</th><th className="px-4 py-3">Vendedor</th><th className="px-4 py-3">Estoque</th><th className="px-5 py-3">Catálogo</th></tr></thead>
              <tbody className="divide-y divide-black/5">{motorcycles.data.map((motorcycle) => <tr key={motorcycle.id}>
                <td className="px-5 py-4"><p className="font-bold">{motorcycle.brand} {motorcycle.model} {motorcycle.version}</p><p className="mt-1 text-[10px] text-muted">{motorcycle.year}</p></td>
                <td className="px-4 py-4 font-semibold">{formatBRL(motorcycle.priceCents)}</td>
                <td className="px-4 py-4 text-muted">{motorcycle.primarySeller?.name ?? "—"}</td>
                <td className="px-4 py-4"><select aria-label={`Estoque de ${motorcycle.brand} ${motorcycle.model}`} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[10px]" value={motorcycle.status} disabled={updateStock.isPending} onChange={(event) => updateStock.mutate({ id: motorcycle.id, status: event.target.value })}>{Object.entries(stockLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td className="px-5 py-4"><button className="font-bold text-pine underline disabled:opacity-40" disabled={updatePublication.isPending || motorcycle.status !== "AVAILABLE"} onClick={() => updatePublication.mutate({ id: motorcycle.id, isPublished: !motorcycle.isPublished })}>{motorcycle.isPublished ? "Retirar" : "Publicar"}</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
          {(updateStock.isError || updatePublication.isError) && <p className="p-4 text-xs text-red-700" role="alert">{errorMessage(updateStock.error ?? updatePublication.error)}</p>}
        </Card>
      </main>
    </div>
  );
}
