/**
 * GET /api/pub/saas-branding
 * Endpoint PÚBLICO — qualquer painel interno consome.
 * Devolve dados não-sensíveis pra branding/contato/LGPD.
 */
import { queryOne } from "@/lib/db/client";
import { NextResponse } from "next/server";

interface BrandingValor {
  nome?:         string;
  logo_url?:     string | null;
  email?:        string | null;
  telefone?:     string | null;
  whatsapp?:     string | null;
  site?:         string | null;
  dpo_nome?:     string | null;
  dpo_email?:    string | null;
  dpo_telefone?: string | null;
  endereco?:     string | null;
  cnpj?:         string | null;
  razao_social?: string | null;
}

const DEFAULT = {
  nome:         "Cardápio SaaS",
  logo_url:     null as string | null,
  email:        null as string | null,
  telefone:     null as string | null,
  whatsapp:     null as string | null,
  site:         null as string | null,
  dpo_nome:     null as string | null,
  dpo_email:    null as string | null,
  dpo_telefone: null as string | null,
  endereco:     null as string | null,
  cnpj:         null as string | null,
  razao_social: null as string | null,
};

const HEADERS = {
  "Cache-Control":                "no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control":            "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "Pragma":                       "no-cache",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const r = await queryOne<{ valor: BrandingValor }>(
      `SELECT valor FROM settings WHERE chave = 'saas_branding'`
    );
    const v = r?.valor ?? {};
    const data = {
      nome:         v.nome         ?? DEFAULT.nome,
      logo_url:     v.logo_url     ?? null,
      email:        v.email        ?? null,
      telefone:     v.telefone     ?? null,
      whatsapp:     v.whatsapp     ?? null,
      site:         v.site         ?? null,
      dpo_nome:     v.dpo_nome     ?? null,
      dpo_email:    v.dpo_email    ?? null,
      dpo_telefone: v.dpo_telefone ?? null,
      endereco:     v.endereco     ?? null,
      cnpj:         v.cnpj         ?? null,
      razao_social: v.razao_social ?? null,
    };
    return NextResponse.json({ success: true, data }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT }, { headers: HEADERS });
  }
}
