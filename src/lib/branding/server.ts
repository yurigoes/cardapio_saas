/**
 * Server-side helper para carregar saas_branding em RSC/Server Components.
 * Lê direto do banco — não passa pelo HTTP do endpoint público.
 */
import "server-only";
import { queryOne } from "@/lib/db/client";

export interface SaasBrandingServer {
  nome:         string;
  logo_url:     string | null;
  email:        string | null;
  telefone:     string | null;
  whatsapp:     string | null;
  site:         string | null;
  dpo_nome:     string | null;
  dpo_email:    string | null;
  dpo_telefone: string | null;
  endereco:     string | null;
  cnpj:         string | null;
  razao_social: string | null;
}

// Fallback caso settings.saas_branding ainda não tenha sido configurado
// na instalação. Pode ser sobrescrito 100% via /admin/config (branding).
const DEFAULT: SaasBrandingServer = {
  nome:         "Three Digital",
  logo_url:     null,
  email:        null,
  telefone:     null,
  whatsapp:     null,
  site:         "https://tthreedigital.com.br",
  dpo_nome:     null,
  dpo_email:    null,
  dpo_telefone: null,
  endereco:     null,
  cnpj:         null,
  razao_social: null,
};

export async function getSaasBranding(): Promise<SaasBrandingServer> {
  try {
    const r = await queryOne<{ valor: Partial<SaasBrandingServer> }>(
      `SELECT valor FROM settings WHERE chave = 'saas_branding'`
    );
    return { ...DEFAULT, ...(r?.valor ?? {}) };
  } catch {
    return DEFAULT;
  }
}
