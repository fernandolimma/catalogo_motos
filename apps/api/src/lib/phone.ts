export function normalizePhone(value: string) {
  const normalized = value.replace(/\D/g, "");
  return normalized.length >= 10 && normalized.length <= 13 ? normalized : null;
}
