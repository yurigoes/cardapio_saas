/**
 * POST /api/cron/limpar-localizacoes
 *
 * Cron diário — apaga localizações de motoboy mais antigas que 7 dias.
 * Evita bloat da tabela motoboy_localizacoes (ping a cada 15-30s acumula
 * milhares de linhas/motoboy/dia).
 *
 * Auth: header `x-cron-secret`.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const r = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM motoboy_localizacoes
          WHERE criado_em < NOW() - INTERVAL '7 days'
          RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM deleted`
    );
    const removidos = Number(r[0]?.count ?? 0);
    console.info(`[Cron/LimparLoc] ${removidos} pings removidos`);
    return NextResponse.json({ ok: true, removidos });
  } catch (err) {
    console.error("[Cron/LimparLoc]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "limpar-localizacoes" });
}
