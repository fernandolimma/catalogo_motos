import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Plus, Save, Store, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { AdminShell } from "../components/admin-shell";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, errorMessage, sellerPhotoUrl } from "../lib/api";
import { formatBRL } from "../lib/types";

type InventoryMotorcycle = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  version?: string | null;
  year: string;
  group?: string | null;
  category?: string | null;
  priceCents: string;
  showPriceOnCatalog: boolean;
  colors: string[];
  description?: string | null;
  imageUrl?: string | null;
  isPublished: boolean;
  availableToAllSellers: boolean;
  status: string;
  primarySeller?: { id: string; name: string } | null;
};

type InventorySeller = {
  id: string;
  slug: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
};

type MotorcycleOption = { id: string; type: "GROUP" | "MODEL" | "CATEGORY" | "YEAR" | "VERSION"; value: string };

const motorcycleSchema = z.object({
  brand: z.string().trim().min(1, "Informe a marca.").max(80),
  model: z.string().trim().min(1, "Informe o modelo.").max(100),
  version: z.string().trim().max(100),
  year: z.string().trim().min(1, "Informe o ano.").max(20).regex(/^[A-Za-z0-9][A-Za-z0-9 /.-]*$/, "Informe um ano válido, como 26/27."),
  group: z.string().trim().max(80),
  category: z.string().trim().max(80),
  price: z.string().regex(/^\d+(?:[,.]\d{1,2})?$/, "Use um valor como 12500,00."),
  showPriceOnCatalog: z.boolean(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(12, "Adicione no máximo 12 cores.")
    .refine((colors) => new Set(colors).size === colors.length, "Não adicione a mesma cor mais de uma vez."),
  description: z.string().max(5000),
  imageUrl: z.union([
    z.string().url("Informe uma URL válida.").refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
    z.literal(""),
  ]),
  primarySellerId: z.string(),
  publish: z.boolean(),
  availableToAllSellers: z.boolean(),
});

type MotorcycleValues = z.infer<typeof motorcycleSchema>;

const sellerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.union([z.string().email("Informe um e-mail válido."), z.literal("")]),
  whatsapp: z.string().max(30),
  bio: z.string().max(1000),
});

type SellerValues = z.infer<typeof sellerSchema>;

const emptySellerValues: SellerValues = { name: "", email: "", whatsapp: "", bio: "" };
const sellerPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const maxSellerPhotoSize = 1_048_576;

function priceToCents(value: string) {
  const [whole = "0", fraction = ""] = value.replace(",", ".").split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

function priceFromCents(value: string) {
  const cents = BigInt(value);
  return `${cents / 100n},${(cents % 100n).toString().padStart(2, "0")}`;
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const editingMotorcycle = useRouterState({ select: (state) => typeof state.location.search.edit === "string" ? state.location.search.edit : null });
  const isSellerView = pathname === "/admin/vendedores";
  const isMotorcycleFormView = pathname === "/admin/motocicletas/cadastrar";
  const cache = useQueryClient();
  const [editingSeller, setEditingSeller] = useState<string | null>(null);
  const [colorToAdd, setColorToAdd] = useState("#000000");
  const [sellerPhoto, setSellerPhoto] = useState<File | null>(null);
  const [sellerPhotoPreview, setSellerPhotoPreview] = useState<string | null>(null);
  const [removeSellerPhoto, setRemoveSellerPhoto] = useState(false);
  const [sellerPhotoError, setSellerPhotoError] = useState<string | null>(null);
  const [sellerFormError, setSellerFormError] = useState<string | null>(null);
  const [sellerFormSuccess, setSellerFormSuccess] = useState<string | null>(null);
  const sellerPhotoInput = useRef<HTMLInputElement>(null);
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
    queryFn: async () => (await api.get<{ items: InventorySeller[] }>("/sellers")).data.items,
    enabled: auth.isSuccess,
  });
  const currentEditingSeller = sellers.data?.find((seller) => seller.id === editingSeller);
  useEffect(() => {
    if (!sellerPhoto) {
      setSellerPhotoPreview(null);
      return;
    }
    const preview = URL.createObjectURL(sellerPhoto);
    setSellerPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [sellerPhoto]);
  const motorcycleOptions = useQuery({
    queryKey: ["motorcycle-options"],
    queryFn: async () => (await api.get<{ items: MotorcycleOption[] }>("/motorcycle-options")).data.items,
    enabled: auth.isSuccess,
  });
  const groups = motorcycleOptions.data?.filter((option) => option.type === "GROUP") ?? [];
  const models = motorcycleOptions.data?.filter((option) => option.type === "MODEL") ?? [];
  const categories = motorcycleOptions.data?.filter((option) => option.type === "CATEGORY") ?? [];
  const years = motorcycleOptions.data?.filter((option) => option.type === "YEAR").sort((left, right) => right.value.localeCompare(left.value, "pt-BR", { numeric: true })) ?? [];
  const versions = motorcycleOptions.data?.filter((option) => option.type === "VERSION") ?? [];
  const motorcycleForm = useForm<MotorcycleValues>({
    resolver: zodResolver(motorcycleSchema),
    defaultValues: { brand: "", model: "", version: "", year: "", group: "", category: "", price: "", showPriceOnCatalog: true, colors: [], description: "", imageUrl: "", primarySellerId: "", publish: false, availableToAllSellers: false },
  });
  const motorcycleColors = useWatch({ control: motorcycleForm.control, name: "colors" }) ?? [];
  useEffect(() => {
    if (!editingMotorcycle || !motorcycles.data) return;
    const motorcycle = motorcycles.data.find((item) => item.id === editingMotorcycle);
    if (!motorcycle) return;
    motorcycleForm.reset({
      brand: motorcycle.brand,
      model: motorcycle.model,
      version: motorcycle.version ?? "",
      year: motorcycle.year,
      group: motorcycle.group ?? "",
      category: motorcycle.category ?? "",
      price: priceFromCents(motorcycle.priceCents),
      showPriceOnCatalog: motorcycle.showPriceOnCatalog,
      colors: motorcycle.colors ?? [],
      description: motorcycle.description ?? "",
      imageUrl: motorcycle.imageUrl ?? "",
      primarySellerId: motorcycle.primarySeller?.id ?? "",
      publish: motorcycle.isPublished,
      availableToAllSellers: motorcycle.availableToAllSellers,
    });
  }, [editingMotorcycle, motorcycles.data, motorcycleForm]);
  const sellerForm = useForm<SellerValues>({
    resolver: zodResolver(sellerSchema),
    defaultValues: emptySellerValues,
  });

  const createMotorcycle = useMutation({
    mutationFn: async (values: MotorcycleValues) => api.post("/motorcycles", {
      brand: values.brand,
      model: values.model,
      version: values.version || undefined,
      year: values.year,
      group: values.group || undefined,
      category: values.category || undefined,
      priceCents: priceToCents(values.price),
      showPriceOnCatalog: values.showPriceOnCatalog,
      colors: values.colors,
      description: values.description || undefined,
      imageUrl: values.imageUrl || undefined,
      primarySellerId: values.primarySellerId || undefined,
      isPublished: values.publish,
      availableToAllSellers: values.availableToAllSellers,
      status: "AVAILABLE",
    }),
    onSuccess: async () => {
      motorcycleForm.reset({ brand: "", model: "", version: "", year: "", group: "", category: "", price: "", showPriceOnCatalog: true, colors: [], description: "", imageUrl: "", primarySellerId: "", publish: false, availableToAllSellers: false });
      await Promise.all([cache.invalidateQueries({ queryKey: ["inventory-motorcycles"] }), cache.invalidateQueries({ queryKey: ["catalog"] })]);
      await navigate({ to: "/admin/estoque" });
    },
  });
  const createSeller = useMutation({
    mutationFn: async (values: SellerValues) => api.post<{ seller: InventorySeller }>("/sellers", {
      name: values.name,
      email: values.email || undefined,
      whatsapp: values.whatsapp || undefined,
      bio: values.bio || undefined,
    }),
  });
  const updateMotorcycle = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: MotorcycleValues }) => api.patch(`/motorcycles/${id}`, {
      brand: values.brand,
      model: values.model,
      version: values.version || null,
      year: values.year,
      group: values.group || null,
      category: values.category || null,
      priceCents: priceToCents(values.price),
      showPriceOnCatalog: values.showPriceOnCatalog,
      colors: values.colors,
      description: values.description || null,
      imageUrl: values.imageUrl || null,
      primarySellerId: values.primarySellerId || null,
      isPublished: values.publish,
      availableToAllSellers: values.availableToAllSellers,
    }),
    onSuccess: async () => {
      motorcycleForm.reset({ brand: "", model: "", version: "", year: "", group: "", category: "", price: "", showPriceOnCatalog: true, colors: [], description: "", imageUrl: "", primarySellerId: "", publish: false, availableToAllSellers: false });
      await Promise.all([cache.invalidateQueries({ queryKey: ["inventory-motorcycles"] }), cache.invalidateQueries({ queryKey: ["catalog"] })]);
      await navigate({ to: "/admin/estoque" });
    },
  });
  const updateSeller = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: SellerValues }) => api.patch(`/sellers/${id}`, {
      name: values.name,
      email: values.email || null,
      whatsapp: values.whatsapp || null,
      bio: values.bio || null,
    }),
  });
  const uploadSellerPhoto = useMutation({
    mutationFn: async ({ id, photo }: { id: string; photo: File }) => {
      const body = new FormData();
      body.append("photo", photo);
      return api.post(`/sellers/${id}/photo`, body, { headers: { "Content-Type": "multipart/form-data" } });
    },
  });
  const deleteSellerPhoto = useMutation({
    mutationFn: async (id: string) => api.delete(`/sellers/${id}/photo`),
  });
  const clearSellerForm = () => {
    setEditingSeller(null);
    setSellerPhoto(null);
    setRemoveSellerPhoto(false);
    setSellerPhotoError(null);
    setSellerFormError(null);
    setSellerFormSuccess(null);
    if (sellerPhotoInput.current) sellerPhotoInput.current.value = "";
    sellerForm.reset({ ...emptySellerValues });
    createSeller.reset();
    updateSeller.reset();
    uploadSellerPhoto.reset();
    deleteSellerPhoto.reset();
  };
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
  const submitSeller = async (values: SellerValues) => {
    setSellerFormError(null);
    setSellerFormSuccess(null);
    createSeller.reset();
    updateSeller.reset();
    uploadSellerPhoto.reset();
    deleteSellerPhoto.reset();
    try {
      const wasEditing = Boolean(editingSeller);
      let sellerId = editingSeller;
      if (sellerId) {
        await updateSeller.mutateAsync({ id: sellerId, values });
      } else {
        const { data } = await createSeller.mutateAsync(values);
        sellerId = data.seller.id;
        setEditingSeller(sellerId);
        await cache.invalidateQueries({ queryKey: ["inventory-sellers"] });
      }

      if (removeSellerPhoto && currentEditingSeller?.photoUrl) {
        await deleteSellerPhoto.mutateAsync(sellerId);
      } else if (sellerPhoto) {
        await uploadSellerPhoto.mutateAsync({ id: sellerId, photo: sellerPhoto });
      }

      clearSellerForm();
      setSellerFormSuccess(wasEditing ? "Dados do vendedor atualizados." : "Vendedor cadastrado.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["inventory-sellers"] }),
        cache.invalidateQueries({ queryKey: ["inventory-motorcycles"] }),
        cache.invalidateQueries({ queryKey: ["catalog"] }),
        cache.invalidateQueries({ queryKey: ["public-sellers"] }),
        cache.invalidateQueries({ queryKey: ["seller-catalog"] }),
      ]);
    } catch (error) {
      setSellerFormError(errorMessage(error));
    }
  };

  if (auth.isLoading || !auth.isSuccess) return <main className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">Verificando sessão...</main>;
  const currentUser = (auth.data as { user?: { name?: string; role?: string } }).user;
  const role = currentUser?.role;
  if (!["ADMIN", "SUPERVISOR", "MANAGER"].includes(role ?? "")) return <main className="page-wrap py-24 text-center"><p className="font-bold">Seu perfil não tem acesso ao estoque.</p><Link className="mt-4 inline-block text-sm text-pine underline" to="/admin">Voltar ao CRM</Link></main>;

  return (
    <AdminShell userName={currentUser?.name ?? "Usuário"} role={role ?? "SELLER"}>
      <div className="page-wrap py-4 sm:py-5">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-pine">Administração</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{isSellerView ? "Vendedores" : isMotorcycleFormView ? (editingMotorcycle ? "Editar motocicleta" : "Cadastrar motocicleta") : "Motocicletas cadastradas"}</h1>
        <p className="mt-2 text-sm text-muted">{isSellerView ? "Cadastre e atualize os vendedores e suas páginas públicas." : isMotorcycleFormView ? "Preencha os dados da motocicleta para incluí-la no estoque." : "Consulte e gerencie o estoque, a publicação e a disponibilidade das motocicletas."}</p>
        <nav aria-label="Gestão de estoque" className="mt-5 flex flex-wrap gap-2">
          <Link to="/admin/estoque" className={`rounded-xl px-4 py-2 text-xs font-bold ${!isSellerView && !isMotorcycleFormView ? "bg-pine text-white" : "border border-black/10 bg-white text-ink"}`}>Motocicletas cadastradas</Link>
          <Link to="/admin/motocicletas/cadastrar" className={`rounded-xl px-4 py-2 text-xs font-bold ${isMotorcycleFormView ? "bg-pine text-white" : "border border-black/10 bg-white text-ink"}`}>Cadastrar motocicleta</Link>
          <Link to="/admin/vendedores" className={`rounded-xl px-4 py-2 text-xs font-bold ${isSellerView ? "bg-pine text-white" : "border border-black/10 bg-white text-ink"}`}>Vendedores</Link>
        </nav>

        {isMotorcycleFormView && <div className="mt-8">
          <Card className="rounded-2xl p-5 shadow-none sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebefe8] text-pine">{editingMotorcycle ? <Pencil size={18} /> : <Plus size={19} />}</span><div><h2 className="font-bold">{editingMotorcycle ? "Editar motocicleta" : "Cadastrar motocicleta"}</h2><p className="mt-1 text-xs text-muted">O valor é informado em reais, com até duas casas decimais.</p></div></div>
            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={motorcycleForm.handleSubmit((values) => {
              if (editingMotorcycle) updateMotorcycle.mutate({ id: editingMotorcycle, values });
              else createMotorcycle.mutate(values);
            })}>
              <label className="field-label">Marca<input className="field-input" {...motorcycleForm.register("brand")} />{motorcycleForm.formState.errors.brand && <span className="field-error">{motorcycleForm.formState.errors.brand.message}</span>}</label>
              <label className="field-label">Modelo
                <select className="field-input" {...motorcycleForm.register("model")} disabled={motorcycleOptions.isLoading || motorcycleOptions.isError || models.length === 0}>
                  <option value="">{motorcycleOptions.isLoading ? "Carregando modelos..." : models.length ? "Selecione um modelo" : "Cadastre modelos em Configurações"}</option>
                  {models.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                </select>
                {motorcycleForm.formState.errors.model && <span className="field-error">{motorcycleForm.formState.errors.model.message}</span>}
              </label>
              <label className="field-label">Versão <span className="font-normal text-muted">(opcional)</span>
                <select className="field-input" {...motorcycleForm.register("version")} disabled={motorcycleOptions.isLoading || motorcycleOptions.isError}>
                  <option value="">{motorcycleOptions.isLoading ? "Carregando versões..." : "Selecione uma versão (opcional)"}</option>
                  {versions.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                </select>
              </label>
              <label className="field-label">Ano
                <select className="field-input" {...motorcycleForm.register("year")} disabled={motorcycleOptions.isLoading || motorcycleOptions.isError || years.length === 0}>
                  <option value="">{motorcycleOptions.isLoading ? "Carregando anos..." : years.length ? "Selecione um ano" : "Cadastre anos em Configurações"}</option>
                  {years.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                </select>
                {motorcycleForm.formState.errors.year && <span className="field-error">{motorcycleForm.formState.errors.year.message}</span>}
              </label>
              <label className="field-label">Grupo
                <select className="field-input" {...motorcycleForm.register("group")} disabled={motorcycleOptions.isLoading || motorcycleOptions.isError}>
                  <option value="">{motorcycleOptions.isLoading ? "Carregando grupos..." : "Selecione um grupo (opcional)"}</option>
                  {groups.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                </select>
              </label>
              {motorcycleOptions.isError && <p className="field-error sm:col-span-2" role="alert">{errorMessage(motorcycleOptions.error)}</p>}
              {!motorcycleOptions.isLoading && !motorcycleOptions.isError && (models.length === 0 || years.length === 0) && <p className="text-xs text-muted sm:col-span-2">Cadastre ao menos um modelo e um ano em Configurações antes de incluir uma motocicleta.</p>}
              <label className="field-label">Categoria <span className="font-normal text-muted">(opcional)</span>
                <select className="field-input" {...motorcycleForm.register("category")} disabled={motorcycleOptions.isLoading || motorcycleOptions.isError}>
                  <option value="">{motorcycleOptions.isLoading ? "Carregando categorias..." : "Selecione uma categoria (opcional)"}</option>
                  {categories.map((option) => <option key={option.id} value={option.value}>{option.value}</option>)}
                </select>
              </label>
              <label className="field-label">Preço (R$)<input className="field-input" inputMode="decimal" placeholder="12500,00" {...motorcycleForm.register("price")} />{motorcycleForm.formState.errors.price && <span className="field-error">{motorcycleForm.formState.errors.price.message}</span>}</label>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink/70 sm:col-span-2"><input type="checkbox" className="accent-pine" {...motorcycleForm.register("showPriceOnCatalog")} />Exibir preço nos cards do catálogo</label>
              <fieldset className="rounded-xl border border-black/10 p-4 sm:col-span-2">
                <legend className="px-1 text-xs font-bold">Cores disponíveis</legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="motorcycle-color">Adicionar cor</label>
                    <div className="mt-2 flex gap-2">
                      <input id="motorcycle-color" aria-label="Escolher cor" className="h-10 min-w-0 flex-1 cursor-pointer rounded-lg border border-black/10 bg-white p-1" type="color" value={colorToAdd} onChange={(event) => setColorToAdd(event.target.value)} />
                      <Button type="button" aria-label="Adicionar cor selecionada" disabled={motorcycleColors.length >= 12 || motorcycleColors.includes(colorToAdd)} onClick={() => {
                        motorcycleForm.setValue("colors", [...motorcycleColors, colorToAdd], { shouldDirty: true, shouldValidate: true });
                      }}><Plus size={17} /></Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink">Cores selecionadas</p>
                    {motorcycleColors.length ? <ul className="mt-2 flex flex-wrap gap-2">
                      {motorcycleColors.map((color) => <li key={color} className="flex items-center gap-2 rounded-lg border border-black/10 bg-white p-1.5">
                        <span className="h-8 w-8 rounded-full border border-black/15" style={{ backgroundColor: color }} title={color} />
                        <span className="sr-only">{color}</span>
                        <button className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-red-600 hover:bg-red-50" type="button" aria-label={`Remover cor ${color}`} onClick={() => {
                          motorcycleForm.setValue("colors", motorcycleColors.filter((selectedColor) => selectedColor !== color), { shouldDirty: true, shouldValidate: true });
                        }}><X size={15} /></button>
                      </li>)}
                    </ul> : <p className="mt-2 text-xs text-muted">Nenhuma cor selecionada.</p>}
                    <p className="mt-2 text-[10px] text-muted">{motorcycleColors.length}/12 cores</p>
                  </div>
                </div>
                {motorcycleForm.formState.errors.colors && <p className="field-error mt-2">{motorcycleForm.formState.errors.colors.message}</p>}
              </fieldset>
              <label className="field-label">Vendedor principal <span className="font-normal text-muted">(opcional)</span>
                <select className="field-input" {...motorcycleForm.register("primarySellerId")}><option value="">Sem vendedor associado</option>{sellers.data?.map((seller) => <option key={seller.id ?? seller.slug} value={seller.id ?? ""}>{seller.name}</option>)}</select>
              </label>
              <label className="field-label sm:col-span-2">URL da foto principal <span className="font-normal text-muted">(opcional; upload ainda não disponível)</span><input className="field-input" type="url" {...motorcycleForm.register("imageUrl")} />{motorcycleForm.formState.errors.imageUrl && <span className="field-error">{motorcycleForm.formState.errors.imageUrl.message}</span>}</label>
              <label className="field-label sm:col-span-2">Descrição comercial <span className="font-normal text-muted">(opcional)</span><textarea className="field-input min-h-24" {...motorcycleForm.register("description")} /></label>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink/70 sm:col-span-2"><input type="checkbox" className="accent-pine" {...motorcycleForm.register("publish")} />Publicar no catálogo imediatamente</label>
              <label className="flex items-start gap-2 text-xs font-semibold text-ink/70 sm:col-span-2"><input type="checkbox" className="mt-0.5 accent-pine" {...motorcycleForm.register("availableToAllSellers")} /><span>Disponível para todos os vendedores <span className="block mt-1 font-normal text-muted">A moto aparecerá no catálogo de cada vendedor enquanto estiver publicada e disponível.</span></span></label>
              {(createMotorcycle.isError || updateMotorcycle.isError) && <p className="field-error sm:col-span-2" role="alert">{errorMessage(createMotorcycle.error ?? updateMotorcycle.error)}</p>}
              <Button className="w-full sm:col-span-2" type="submit" disabled={createMotorcycle.isPending || updateMotorcycle.isPending}>{createMotorcycle.isPending || updateMotorcycle.isPending ? <LoaderCircle size={16} className="animate-spin" /> : editingMotorcycle ? <Save size={16} /> : <Plus size={16} />}{editingMotorcycle ? "Salvar alterações" : "Cadastrar motocicleta"}</Button>
              {editingMotorcycle && <Button className="w-full sm:col-span-2" variant="outline" type="button" onClick={() => {
                motorcycleForm.reset({ brand: "", model: "", version: "", year: "", group: "", category: "", price: "", showPriceOnCatalog: true, colors: [], description: "", imageUrl: "", primarySellerId: "", publish: false, availableToAllSellers: false });
                updateMotorcycle.reset();
                void navigate({ to: "/admin/estoque" });
              }}><X size={16} />Cancelar edição</Button>}
            </form>
          </Card>
        </div>}

        {isSellerView && <div className="mt-8 max-w-2xl">
          <Card className="rounded-2xl p-5 shadow-none sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebefe8] text-pine">{editingSeller ? <Pencil size={18} /> : <Store size={18} />}</span><div><h2 className="font-bold">{editingSeller ? "Editar vendedor" : "Adicionar vendedor"}</h2><p className="mt-1 text-xs text-muted">{editingSeller ? "Atualize os dados públicos do vendedor." : "Cria uma página pública para compartilhar."}</p></div></div>
            <form className="mt-6 space-y-4" onSubmit={sellerForm.handleSubmit(submitSeller)}>
              <label className="field-label">Nome<input className="field-input" {...sellerForm.register("name")} />{sellerForm.formState.errors.name && <span className="field-error">{sellerForm.formState.errors.name.message}</span>}</label>
              <label className="field-label">E-mail<input className="field-input" type="email" {...sellerForm.register("email")} />{sellerForm.formState.errors.email && <span className="field-error">{sellerForm.formState.errors.email.message}</span>}</label>
              <label className="field-label">WhatsApp <span className="font-normal text-muted">(com código do país)</span><input className="field-input" inputMode="tel" {...sellerForm.register("whatsapp")} /></label>
              <label className="field-label">Apresentação<input className="field-input" {...sellerForm.register("bio")} /></label>
              <fieldset className="space-y-3 rounded-xl border border-black/10 p-4">
                <legend className="px-1 text-xs font-bold">Imagens do Perfil</legend>
                <label className="field-label" htmlFor="seller-profile-photo">Foto de Perfil</label>
                <input
                  id="seller-profile-photo"
                  ref={sellerPhotoInput}
                  className="field-input file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-paper file:px-2 file:py-1"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = "";
                    setSellerPhotoError(null);
                    setSellerFormError(null);
                    setSellerFormSuccess(null);
                    setSellerPhoto(null);
                    if (!file) return;
                    if (!sellerPhotoMimeTypes.includes(file.type)) {
                      setSellerPhotoError("Envie uma imagem JPG, PNG ou WebP.");
                      return;
                    }
                    if (file.size > maxSellerPhotoSize) {
                      setSellerPhotoError("A foto deve ter no máximo 1 MB.");
                      return;
                    }
                    setSellerPhoto(file);
                    setRemoveSellerPhoto(false);
                  }}
                />
                <p className="text-xs text-muted">Formatos suportados: JPG, PNG, WebP. Máximo 1 MB.</p>
                {(sellerPhotoPreview || (!removeSellerPhoto && currentEditingSeller?.photoUrl)) && <div className="flex items-center gap-3 rounded-xl border border-black/10 p-3">
                  <img
                    className="h-14 w-14 rounded-full object-cover"
                    src={sellerPhotoPreview ?? sellerPhotoUrl(currentEditingSeller?.photoUrl) ?? ""}
                    alt={sellerPhoto ? "Pré-visualização da foto de perfil" : `Foto de perfil de ${currentEditingSeller?.name ?? ""}`}
                  />
                  {currentEditingSeller?.photoUrl && <label className="flex cursor-pointer items-center gap-2 text-xs text-ink/70">
                    <input
                      type="checkbox"
                      className="accent-pine"
                      checked={removeSellerPhoto}
                      onChange={(event) => {
                        setRemoveSellerPhoto(event.target.checked);
                        if (event.target.checked) setSellerPhoto(null);
                      }}
                    />
                    Remover
                  </label>}
                </div>}
                {sellerPhotoError && <p className="field-error" role="alert">{sellerPhotoError}</p>}
              </fieldset>
              {sellerFormError && <p className="field-error" role="alert">{sellerFormError}</p>}
              {sellerFormSuccess && <p className="text-xs font-semibold text-pine" role="status">{sellerFormSuccess}</p>}
              <Button className="w-full" variant="dark" type="submit" disabled={createSeller.isPending || updateSeller.isPending || uploadSellerPhoto.isPending || deleteSellerPhoto.isPending}>
                {createSeller.isPending || updateSeller.isPending || uploadSellerPhoto.isPending || deleteSellerPhoto.isPending ? <LoaderCircle size={16} className="animate-spin" /> : editingSeller ? <Save size={16} /> : <Plus size={16} />}
                {uploadSellerPhoto.isPending ? "Enviando foto..." : deleteSellerPhoto.isPending ? "Removendo foto..." : editingSeller ? "Salvar alterações" : "Adicionar vendedor"}
              </Button>
              {editingSeller && <Button className="w-full" variant="outline" type="button" onClick={() => {
                clearSellerForm();
              }}><X size={16} />Cancelar edição</Button>}
            </form>
            {sellers.data && sellers.data.length > 0 && <div className="mt-6 border-t border-black/5 pt-5">
              <h3 className="text-xs font-bold">Vendedores cadastrados</h3>
              <ul className="mt-3 space-y-2">
                {sellers.data.map((seller) => <li key={seller.id} className="flex items-center justify-between gap-2 rounded-xl bg-paper p-3">
                  <div className="min-w-0"><p className="truncate text-xs font-bold">{seller.name}</p><p className="truncate text-[10px] text-muted">{seller.email || seller.whatsapp || seller.slug}</p></div>
                  <button className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-pine hover:bg-white" type="button" onClick={() => {
                    if (sellerPhotoInput.current) sellerPhotoInput.current.value = "";
                    setEditingSeller(seller.id);
                    setSellerPhoto(null);
                    setRemoveSellerPhoto(false);
                    setSellerPhotoError(null);
                    setSellerFormError(null);
                    setSellerFormSuccess(null);
                    sellerForm.reset({
                      name: seller.name,
                      email: seller.email ?? "",
                      whatsapp: seller.whatsapp ?? "",
                      bio: seller.bio ?? "",
                    });
                    updateSeller.reset();
                    uploadSellerPhoto.reset();
                    deleteSellerPhoto.reset();
                  }}><Pencil size={13} />Editar</button>
                </li>)}
              </ul>
            </div>}
          </Card>
        </div>}

        {!isSellerView && !isMotorcycleFormView && <Card className="mt-6 overflow-hidden rounded-2xl shadow-none">
          <div className="flex items-center justify-between gap-3 p-5"><div><h2 className="font-bold">Motocicletas cadastradas</h2><p className="mt-1 text-xs text-muted">{motorcycles.data?.length ?? 0} registros</p></div><Link to="/admin/motocicletas/cadastrar" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-pine px-4 py-2.5 text-xs font-bold text-white transition hover:bg-pine/90"><Plus size={15} />Cadastrar motocicleta</Link></div>
          {motorcycles.isLoading && <p className="p-8 text-center text-xs text-muted">Carregando estoque...</p>}
          {motorcycles.isError && <p className="p-8 text-center text-xs text-red-700">{errorMessage(motorcycles.error)}</p>}
          {motorcycles.data?.length === 0 && <p className="p-8 text-center text-xs text-muted">Nenhuma motocicleta cadastrada.</p>}
          {motorcycles.data && motorcycles.data.length > 0 && <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="bg-[#fafbf8] text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-5 py-3">Motocicleta</th><th className="px-4 py-3">Preço</th><th className="px-4 py-3">Vendedor</th><th className="px-4 py-3">Estoque</th><th className="px-5 py-3">Catálogo</th><th className="px-5 py-3">Ações</th></tr></thead>
              <tbody className="divide-y divide-black/5">{motorcycles.data.map((motorcycle) => <tr key={motorcycle.id}>
                <td className="px-5 py-4"><p className="font-bold">{motorcycle.brand} {motorcycle.model} {motorcycle.version}</p><p className="mt-1 text-[10px] text-muted">{motorcycle.year}{motorcycle.group ? ` · ${motorcycle.group}` : ""}{motorcycle.category ? ` · ${motorcycle.category}` : ""}</p></td>
                <td className="px-4 py-4 font-semibold">{formatBRL(motorcycle.priceCents)}</td>
                <td className="px-4 py-4 text-muted">{motorcycle.primarySeller?.name ?? "—"}</td>
                <td className="px-4 py-4"><select aria-label={`Estoque de ${motorcycle.brand} ${motorcycle.model}`} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[10px]" value={motorcycle.status} disabled={updateStock.isPending} onChange={(event) => updateStock.mutate({ id: motorcycle.id, status: event.target.value })}>{Object.entries(stockLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td className="px-5 py-4"><button className="font-bold text-pine underline disabled:opacity-40" disabled={updatePublication.isPending || motorcycle.status !== "AVAILABLE"} onClick={() => updatePublication.mutate({ id: motorcycle.id, isPublished: !motorcycle.isPublished })}>{motorcycle.isPublished ? "Retirar" : "Publicar"}</button></td>
                <td className="px-5 py-4"><button className="flex items-center gap-1 font-bold text-pine hover:underline" type="button" onClick={() => {
                  updateMotorcycle.reset();
                  void navigate({ to: "/admin/motocicletas/cadastrar", search: { edit: motorcycle.id } });
                }}><Pencil size={13} />Editar</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
          {(updateStock.isError || updatePublication.isError) && <p className="p-4 text-xs text-red-700" role="alert">{errorMessage(updateStock.error ?? updatePublication.error)}</p>}
        </Card>}
      </div>
    </AdminShell>
  );
}
