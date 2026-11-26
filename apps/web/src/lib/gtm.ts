const consentKey = "catalogo-motos-analytics-consent";
const scriptId = "catalogo-motos-gtm";

export type AnalyticsConsent = "accepted" | "rejected";

export const gtmId = import.meta.env.VITE_GTM_ID?.trim() ?? "";

if (gtmId && !/^GTM-[A-Z0-9]+$/.test(gtmId)) {
  console.error("VITE_GTM_ID inválido: use um identificador no formato GTM-XXXXXXX.");
}

export const gtmEnabled = /^GTM-[A-Z0-9]+$/.test(gtmId);

export function readAnalyticsConsent(): AnalyticsConsent | null {
  const value = localStorage.getItem(consentKey);
  return value === "accepted" || value === "rejected" ? value : null;
}

export function saveAnalyticsConsent(value: AnalyticsConsent) {
  localStorage.setItem(consentKey, value);
}

export function isAnalyticsConsentChange(event: StorageEvent) {
  return event.key === consentKey || event.key === null;
}

export function loadGtm() {
  if (!gtmEnabled || document.getElementById(scriptId)) return;
  const dataLayer = window.dataLayer ?? [];
  window.dataLayer = dataLayer;
  dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.id = scriptId;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  script.onerror = () => console.error("Não foi possível carregar o Google Tag Manager.");
  document.head.appendChild(script);
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}
