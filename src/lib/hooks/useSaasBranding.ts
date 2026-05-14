"use client";

import { useEffect, useState } from "react";

export interface SaasBranding {
  nome: string;
  logo_url: string | null;
  whatsapp: string | null;
  site: string | null;
}

let cache: SaasBranding | null = null;

const DEFAULT: SaasBranding = {
  nome: "Cardápio SaaS", logo_url: null, whatsapp: null, site: null,
};

export function useSaasBranding() {
  const [branding, setBranding] = useState<SaasBranding>(cache ?? DEFAULT);

  useEffect(() => {
    if (cache) return;
    fetch("/api/pub/saas-branding")
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          cache = d.data as SaasBranding;
          setBranding(cache);
        }
      })
      .catch(() => {});
  }, []);

  return branding;
}
