/**
 * POST /api/cron/cleanup-retaguardas
 *
 * Cron diário. Marca retaguardas inativas há mais de 24h como ativo=false.
 * Não deleta — guarda histórico. Pra remover de vez, master deleta na UI.
 *
 * Auth: header x-cron-secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const inativos = await query<{ id: string; empresa_slug: string }>(
      `UPDATE retaguardas
          SET ativo = FALSE, updated_at = NOW()
        WHERE ativo = TRUE
          AND ultimo_heartbeat < NOW() - INTERVAL '24 hours'
        RETURNING id, empresa_slug`
    );

    console.info(`[Cron/CleanupRetaguardas] ${inativos.length} marcadas inativas: ${inativos.map(r => r.empresa_slug).join(", ") || "(nenhuma)"}`);

    return NextResponse.json({ ok: true, inativas: inativos.length, retaguardas: inativos });
  } catch (err) {
    console.error("[Cron/CleanupRetaguardas]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "cleanup-retaguardas" });
}
