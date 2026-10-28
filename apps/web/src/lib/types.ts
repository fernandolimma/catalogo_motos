export type Motorcycle = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  version?: string | null;
  year: number;
  modelYear?: number | null;
  displacementCc?: number | null;
  category?: string | null;
  color?: string | null;
  mileageKm?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  priceCents: string;
  promotionalCents: string | null;
  isFeatured: boolean;
  status: string;
  images?: Array<{ id: string; url: string; alt?: string | null }>;
  primarySeller?: { name: string; slug: string; whatsapp?: string | null } | null;
};

export type Seller = {
  id?: string;
  name: string;
  slug: string;
  bio?: string | null;
  photoUrl?: string | null;
  whatsapp?: string | null;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  stage: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  seller?: { id: string; name: string } | null;
  motorcycle?: { id: string; brand: string; model: string; slug: string } | null;
  activities?: Array<{ createdAt: string }>;
};

export const leadStages = [
  "NEW", "WAITING", "CONTACTED", "NEGOTIATION", "QUALIFIED",
  "PROPOSAL", "DECISION", "WON", "LOST",
] as const;

export const stageLabels: Record<string, string> = {
  NEW: "Novo lead",
  WAITING: "Aguardando atendimento",
  CONTACTED: "Primeiro contato",
  NEGOTIATION: "Em negociação",
  QUALIFIED: "Qualificado",
  PROPOSAL: "Proposta enviada",
  DECISION: "Aguardando decisão",
  WON: "Venda concluída",
  LOST: "Lead perdido",
};

export function formatBRL(cents: string | null | undefined) {
  if (!cents) return "Consulte";
  const amount = BigInt(cents);
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `R$ ${new Intl.NumberFormat("pt-BR").format(whole)},${fraction}`;
}
