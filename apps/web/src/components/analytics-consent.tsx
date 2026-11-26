import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { gtmEnabled, isAnalyticsConsentChange, loadGtm, readAnalyticsConsent, saveAnalyticsConsent, type AnalyticsConsent } from "../lib/gtm";
import { Button } from "./ui/button";

export function AnalyticsConsentSettings() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() => {
    if (!gtmEnabled) return null;
    try {
      return readAnalyticsConsent();
    } catch (error) {
      console.error("Não foi possível consultar a escolha de cookies.", error);
      return null;
    }
  });
  const [open, setOpen] = useState(consent === null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (gtmEnabled && consent === "accepted") loadGtm();
  }, [consent]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (!isAnalyticsConsentChange(event)) return;
      try {
        const next = readAnalyticsConsent();
        if (consent === "accepted" && next !== "accepted") {
          window.location.reload();
          return;
        }
        setConsent(next);
        setOpen(next === null);
      } catch (storageError) {
        console.error("Não foi possível atualizar a escolha de cookies.", storageError);
        if (consent === "accepted") {
          window.location.reload();
          return;
        }
        setError("Não foi possível acessar suas preferências de cookies.");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [consent]);

  if (!gtmEnabled) return null;

  function choose(value: AnalyticsConsent) {
    try {
      saveAnalyticsConsent(value);
    } catch (storageError) {
      console.error("Não foi possível salvar a escolha de cookies.", storageError);
      setError("Não foi possível salvar sua escolha. Verifique as configurações do navegador.");
      return;
    }
    if (consent === "accepted" && value === "rejected") {
      window.location.reload();
      return;
    }
    setConsent(value);
    setOpen(false);
    setError("");
  }

  return <>
    <button type="button" className="text-left hover:text-white" onClick={() => setOpen(true)}>Preferências de cookies</button>
    {open && <div role="region" aria-label="Preferências de cookies" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-black/10 bg-white p-5 text-ink shadow-xl">
      <p className="text-sm font-bold">Cookies de medição</p>
      <p className="mt-2 text-xs leading-5 text-muted">Com sua autorização, usamos o Google Tag Manager para carregar ferramentas de medição no catálogo. Você pode alterar sua escolha a qualquer momento em Preferências de cookies. <Link to="/privacidade" className="font-bold text-pine underline">Aviso de privacidade</Link></p>
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="small" variant="outline" onClick={() => choose("rejected")}>Recusar</Button>
        <Button type="button" size="small" onClick={() => choose("accepted")}>Aceitar</Button>
      </div>
    </div>}
  </>;
}
