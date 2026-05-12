/**
 * POST /api/cron/expire-trials
 *
 * Cron diário (3h da manhã) — varre empresas com status='teste' e trial_fim < now,
 * marca como 'suspensa' e invalida cache de módulos.
 *
 * Autenticação: header `x-cron-secret` deve bater com env CRON_SECRET.
 *
 * Configurar no Coolify/cron externo:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://app.dominio/api/cron/expire-trials
 */
import { NextRequest, NextResponse } from "next/server";
import { expirarTriaisVencidos } from "@/lib/billing/trial";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const expiradas = await expirarTriaisVencidos();
    console.info(`[Cron/ExpireTrials] ${expiradas.length} empresa(s) suspensa(s)`);
    return NextResponse.json({
      ok:    true,
      count: expiradas.length,
      empresas: expiradas.map(e => ({ id: e.id, nome: e.nome_fantasia })),
    });
  } catch (err) {
    console.error("[Cron/ExpireTrials]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET para healthcheck do cron sem efeito
export async function GET() {
  return NextResponse.json({ ok: true, cron: "expire-trials" });
}
