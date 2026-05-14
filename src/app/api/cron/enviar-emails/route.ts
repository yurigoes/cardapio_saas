/**
 * POST /api/cron/enviar-emails
 *
 * Cron a cada 1-2 minutos — processa fila de e-mails pendentes
 * (status='pendente' com proximo_em <= NOW()).
 *
 * Tenta até 20 jobs por chamada. Falhas voltam pra fila com backoff
 * exponencial (5min, 25min, 125min ≈ 2h) até max_tentativas (3 default).
 *
 * Auth: header `x-cron-secret`.
 */
import { NextRequest, NextResponse } from "next/server";
import { processarQueue } from "@/lib/email/smtp";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const r = await processarQueue(20);
    if (r.processados > 0) {
      console.info(`[Cron/EnviarEmails] ${r.sucesso}/${r.processados} ok, ${r.falha} falhas`);
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[Cron/EnviarEmails]", err);
    return NextResponse.json({ ok: false, erro: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "enviar-emails" });
}
