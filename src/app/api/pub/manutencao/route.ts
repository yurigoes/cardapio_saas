/**
 * GET /api/pub/manutencao
 * Endpoint público — frontend polla pra mostrar banner.
 * Sem dados sensíveis: só { ativo, mensagem, previsao }.
 */
import { queryOne } from "@/lib/db/client";
import { NextResponse } from "next/server";

const HEADERS = {
  "Cache-Control":     "no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const r = await queryOne<{ valor: { ativo?: boolean; mensagem?: string; janela_inicio?: string; janela_fim?: string } }>(
      `SELECT valor FROM settings WHERE chave = 'manutencao'`
    );
    return NextResponse.json({
      success: true,
      data: {
        ativo:    r?.valor?.ativo === true,
        mensagem: r?.valor?.mensagem ?? "Sistema em manutenção. Estamos realizando varredura de segurança anti-hacking. Previsão: 30 minutos a 2 horas.",
        previsao: "30 minutos a 2 horas",
      },
    }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ success: true, data: { ativo: false } }, { headers: HEADERS });
  }
}
