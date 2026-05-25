"use client";

/** Aplica as cores da marca como CSS vars no documento (runtime). */
export function aplicarCorBranding(cor?: string, dark?: string, light?: string) {
  if (typeof document === "undefined") return;
  const r = document.documentElement.style;
  if (cor) r.setProperty("--brand", cor);
  if (dark) r.setProperty("--brand-dark", dark);
  if (light) r.setProperty("--brand-light", light);
}
