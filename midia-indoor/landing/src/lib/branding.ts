/**
 * Branding do SaaS (cor, logo, nome, CNPJ...). Editável pelo master e aplicado
 * em todo o sistema: landing, admin, painel, e-mails e contratos.
 */
import { db, ensureSchema } from "./db";

export interface Branding {
  nome: string;
  logo_url: string | null;
  cor: string;
  cor_dark: string;
  cor_light: string;
  site: string | null;
  email: string | null;
  whatsapp: string | null;
  cnpj: string | null;
  razao_social: string | null;
}

const PADRAO: Branding = {
  nome: "Three Digital Mídia",
  logo_url: process.env.BRAND_LOGO_URL ?? "https://minio.tthreedigital.com.br/cardapio/saas/LOGO%20BRANCA%20THREE.png",
  cor: "#7c3aed", cor_dark: "#5b21b6", cor_light: "#a78bfa",
  site: "https://tthreedigital.com.br",
  email: process.env.CONTRATADA_EMAIL ?? null,
  whatsapp: null,
  cnpj: process.env.CONTRATADA_CNPJ ?? null,
  razao_social: process.env.CONTRATADA_NOME ?? null,
};

export async function getBranding(): Promise<Branding> {
  try {
    await ensureSchema();
    const { rows } = await db().query<Branding>(
      `SELECT nome, logo_url, cor, cor_dark, cor_light, site, email, whatsapp, cnpj, razao_social
         FROM midia_branding WHERE id = 1`
    );
    if (!rows[0]) return PADRAO;
    // completa nulos com o padrão
    return { ...PADRAO, ...Object.fromEntries(Object.entries(rows[0]).filter(([, v]) => v != null)) } as Branding;
  } catch {
    return PADRAO;
  }
}
