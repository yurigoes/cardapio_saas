/**
 * GET /api/pub/saas-branding
 * Endpoint PÚBLICO — qualquer painel interno consome.
 * Devolve só dados não-sensíveis (logo + nome + canais públicos).
 */
import { queryOne } from "@/lib/db/client";
import { NextResponse } from "next/server";

const DEFAULT = {
  nome:     "Cardápio SaaS",
  logo_url: null as string | null,
  whatsapp: null as string | null,
  site:     null as string | null,
};

const HEADERS = {
  "Cache-Control":     "no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "Pragma":            "no-cache",
};

// Força Next a não pré-renderizar / cachear no edge
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const r = await queryOne<{ valor: { nome?: string; logo_url?: string | null; whatsapp?: string | null; site?: string | null } }>(
      `SELECT valor FROM settings WHERE chave = 'saas_branding'`
    );
    const data = {
      nome:     r?.valor?.nome     ?? DEFAULT.nome,
      logo_url: r?.valor?.logo_url ?? null,
      whatsapp: r?.valor?.whatsapp ?? null,
      site:     r?.valor?.site     ?? null,
    };
    return NextResponse.json({ success: true, data }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT }, { headers: HEADERS });
  }
}
