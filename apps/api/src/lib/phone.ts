export function normalizePhone(value: string) {
  const normalized = value.replace(/\D/g, "");
  return normalized.length >= 10 && normalized.length <= 13 ? normalized : null;
}

export function phoneNumberVariants(value: string) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  const localNumber = normalized.startsWith("55") && [12, 13].includes(normalized.length)
    ? normalized.slice(2)
    : normalized;
  if (![10, 11].includes(localNumber.length)) return [normalized];

  const localVariants = new Set([localNumber]);
  const subscriber = localNumber.slice(2);
  if (localNumber.length === 10 && /^[6-9]/.test(subscriber)) {
    localVariants.add(`${localNumber.slice(0, 2)}9${subscriber}`);
  } else if (localNumber.length === 11 && localNumber[2] === "9") {
    localVariants.add(`${localNumber.slice(0, 2)}${subscriber.slice(1)}`);
  }

  return [...new Set([normalized, ...localVariants, ...[...localVariants].map((number) => `55${number}`)])];
}
