"use client";

/**
 * Carrega branding do SaaS (logo, nome, contatos) a partir do
 * endpoint público /api/pub/saas-branding. Cache curto (60s) +
 * sessionStorage pra sobreviver navegação SPA mas re-validar
 * em F5/login.
 */
import { useEffect, useState } from "react";

export interface SaasBranding {
  nome: string;
  logo_url: string | null;
  whatsapp: string | null;
  site: string | null;
}

const DEFAULT: SaasBranding = {
  nome: "Cardápio SaaS", logo_url: null, whatsapp: null, site: null,
};

const CACHE_KEY = "saas_branding_cache_v1";
const CACHE_TTL_MS = 60_000; // 60s

function readCache(): { data: SaasBranding; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - c.ts > CACHE_TTL_MS) return null;
    return c;
  } catch { return null; }
}

function writeCache(data: SaasBranding) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function useSaasBranding() {
  const cached = readCache()?.data;
  const [branding, setBranding] = useState<SaasBranding>(cached ?? DEFAULT);

  useEffect(() => {
    let alive = true;
    fetch("/api/pub/saas-branding", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        if (d.success && d.data) {
          const next: SaasBranding = {
            nome:     d.data.nome     ?? DEFAULT.nome,
            logo_url: d.data.logo_url ?? null,
            whatsapp: d.data.whatsapp ?? null,
            site:     d.data.site     ?? null,
          };
          writeCache(next);
          setBranding(next);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return branding;
}

/** Helper pra master usar após salvar no /admin/config */
export function invalidarSaasBrandingCache() {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}
