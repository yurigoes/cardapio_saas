/**
 * POST /api/cron/limpar-error-log
 *
 * Cron diário — apaga erros mais antigos que 30 dias.
 * Auth: header `x-cron-secret`.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const r = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM error_log WHERE created_at < NOW() - INTERVAL '30 days' RETURNING 1
       ) SELECT COUNT(*)::text AS count FROM deleted`
    );
    const removidos = Number(r[0]?.count ?? 0);
    return NextResponse.json({ ok: true, removidos });
  } catch (err) {
    console.error("[Cron/LimparErrorLog]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "limpar-error-log" });
}
