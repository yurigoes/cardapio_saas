/**
 * GET /api/cron/poll-infinity-pay
 * Cron alternativo: percorre links 'pendentes' criados nas ultimas 24h e
 * consulta o status na InfinityPay. Roda quando o webhook pode ter falhado.
 *
 * Header: x-cron-secret = process.env.CRON_SECRET (ou ?secret=)
 *
 * Sugestao: agendar pra cada 5 min via cron externo / Vercel Cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { confirmarPagamento } from "@/lib/infinity-pay-confirm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || "";
  const got = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (expected && got !== expected) return NextResponse.json({ ok: false, error: "secret inválido" }, { status: 401 });

  await ensureSchema();
  const pendentes = await db().query<{ id: string; campanha_id: string; created_at: string }>(
    `SELECT id, campanha_id, created_at FROM midia_infinity_links
       WHERE status = 'pendente' AND url IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at`
  );
  let confirmados = 0;
  for (const p of pendentes.rows) {
    try {
      const r = await confirmarPagamento(p.id, {});
      if (r?.paid) confirmados++;
    } catch (e) {
      console.error("[cron/poll-infinity-pay]", p.id, e);
    }
  }
  return NextResponse.json({ ok: true, verificados: pendentes.rows.length, confirmados });
}
