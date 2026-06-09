/**
 * Helper compartilhado: confirma pagamento InfinityPay (consulta /payment_check
 * e atualiza tabelas).
 *
 * Extraído do route handler /api/webhooks/infinity-pay pra poder ser importado
 * sem violar a regra do Next 14 ("routes não podem ter exports extras").
 */
import { db } from "./db";
import { consultarStatusInfinityPay } from "./infinity-pay";

interface ConfirmHint {
  transactionNsu?: string | null;
  slug?: string | null;
  captureMethod?: string | null;
  paidAmount?: number | null;
  receiptUrl?: string | null;
}

export async function confirmarPagamento(orderNsu: string, hint: ConfirmHint) {
  // Acha o link
  const linkR = await db().query<{
    id: string; campanha_id: string; status: string; slug: string | null;
  }>(`SELECT id, campanha_id, status, slug FROM midia_infinity_links WHERE id = $1`, [orderNsu]);
  const link = linkR.rows[0];
  if (!link) return { ok: true, ignored: true };
  if (link.status === "pago") return { ok: true, already: true };

  // Consulta InfinityPay (fonte de verdade)
  const chk = await consultarStatusInfinityPay({
    orderNsu,
    transactionNsu: hint.transactionNsu,
    slug: hint.slug ?? link.slug,
  });
  const paid = chk.ok && chk.body?.paid === true;
  if (!paid) return { ok: true, paid: false, status: chk.status, hint: chk.body };

  const captureMethod = hint.captureMethod ?? chk.body?.capture_method ?? null;
  const paidAmount = hint.paidAmount ?? (typeof chk.body?.paid_amount === "number" ? chk.body.paid_amount : null);

  await db().query(
    `UPDATE midia_infinity_links
        SET status='pago', paid_at=NOW(), updated_at=NOW(),
            transaction_nsu = COALESCE($2, transaction_nsu),
            capture_method  = $3,
            paid_amount_centavos = $4,
            receipt_url     = COALESCE($5, receipt_url)
      WHERE id = $1`,
    [orderNsu, hint.transactionNsu ?? null, captureMethod, paidAmount, hint.receiptUrl ?? chk.body?.receipt_url ?? null]
  );

  // Marca a campanha como paga
  await db().query(`UPDATE midia_campanhas SET status_pagamento='pago' WHERE id = $1`, [link.campanha_id]);

  return { ok: true, paid: true };
}
