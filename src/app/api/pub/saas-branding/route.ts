/**
 * GET /api/pub/saas-branding
 * Endpoint PÚBLICO — qualquer painel interno consome.
 * Devolve só dados não-sensíveis (logo + nome + canais públicos).
 */
import { queryOne } from "@/lib/db/client";
import { ok } from "@/lib/utils/response";
import { NextResponse } from "next/server";

const DEFAULT = {
  nome:     "Cardápio SaaS",
  logo_url: null as string | null,
  whatsapp: null as string | null,
  site:     null as string | null,
};

export async function GET() {
  try {
    const r = await queryOne<{ valor: { nome?: string; logo_url?: string | null; whatsapp?: string | null; site?: string | null } }>(
      `SELECT valor FROM settings WHERE chave = 'saas_branding'`
    );
    return ok({
      nome:     r?.valor?.nome     ?? DEFAULT.nome,
      logo_url: r?.valor?.logo_url ?? null,
      whatsapp: r?.valor?.whatsapp ?? null,
      site:     r?.valor?.site     ?? null,
    });
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT });
  }
}
