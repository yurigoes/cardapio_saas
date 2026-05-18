/**
 * POST /api/webhooks/cielo-lio
 * Webhook do Cielo LIO Order Manager — notifica mudanças de status.
 * Payload: { ResourceId: <order_id>, ChangeType: 1 (status changed) }
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { getDriver } from "@/lib/payments/terminal/registry";

export async function POST(req: NextRequest) {
  let body: { ResourceId?: string };
  try { body = await req.json(); } catch { body = {}; }

  const orderId = body.ResourceId;
  if (!orderId) return NextResponse.json({ ok: true, ignored: true });

  // Resolve transação local
  const tx = await queryOne<{
    id: string; driver: string; terminal_id: string | null; status: string;
  }>(
    `SELECT id, driver, terminal_id, status FROM terminal_transacoes
      WHERE driver = 'cielo_lio' AND gateway_tx_id = $1`,
    [orderId]
  );
  if (!tx) return NextResponse.json({ ok: true, ignored: true, motivo: "tx não encontrada" });
  if (["aprovada","recusada","cancelada","expirada","erro"].includes(tx.status)) {
    return NextResponse.json({ ok: true, idempotente: true });
  }

  const driver = getDriver("cielo_lio");
  if (!driver || !tx.terminal_id) return NextResponse.json({ ok: false, motivo: "driver/terminal não encontrado" }, { status: 500 });

  const cred = await queryOne<{ credenciais: Record<string, unknown> }>(
    `SELECT credenciais FROM empresa_terminais WHERE id = $1`, [tx.terminal_id]
  );
  if (!cred) return NextResponse.json({ ok: false }, { status: 500 });

  try {
    const remoto = await driver.consultarStatus(tx.id, orderId, cred.credenciais);
    await query(
      `UPDATE terminal_transacoes
          SET status            = $1,
              authorization_id  = COALESCE($2, authorization_id),
              bandeira          = COALESCE($3, bandeira),
              ultimos_4         = COALESCE($4, ultimos_4),
              concluido_em      = CASE WHEN $1 = 'aprovada' THEN NOW() ELSE concluido_em END,
              cancelado_em      = CASE WHEN $1 = 'cancelada' THEN NOW() ELSE cancelado_em END
        WHERE id = $5`,
      [remoto.status, remoto.authorization_id ?? null,
       remoto.bandeira ?? null, remoto.ultimos_4 ?? null, tx.id]
    );
    return NextResponse.json({ ok: true, status: remoto.status });
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "?" }, { status: 500 });
  }
}
