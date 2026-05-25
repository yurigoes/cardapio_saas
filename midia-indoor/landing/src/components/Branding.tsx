"use client";

import { useEffect } from "react";

/** Aplica as cores da marca como CSS vars no documento (runtime). */
export function aplicarCorBranding(cor?: string, dark?: string, light?: string) {
  if (typeof document === "undefined") return;
  const r = document.documentElement.style;
  if (cor) r.setProperty("--brand", cor);
  if (dark) r.setProperty("--brand-dark", dark);
  if (light) r.setProperty("--brand-light", light);
}

/** Busca o branding e aplica a cor em runtime (montado no layout). */
export function BrandingVars() {
  useEffect(() => {
    fetch("/api/branding")
      .then(r => r.json())
      .then(d => { if (d.ok) aplicarCorBranding(d.branding.cor, d.branding.cor_dark, d.branding.cor_light); })
      .catch(() => { /* mantém o padrão do globals.css */ });
  }, []);
  return null;
}
