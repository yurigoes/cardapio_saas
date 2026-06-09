/**
 * POST /api/webhooks/infinity-pay
 * Recebe notificação da InfinityPay (sem assinatura). Confirma via /payment_check
 * antes de marcar como pago — fonte de verdade.
 *
 * Body esperado: { order_nsu, transaction_nsu?, invoice_slug?, paid_amount?, capture_method?, receipt_url? }
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { consultarStatusInfinityPay } from "@/lib/infinity-pay";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const orderNsu = body.order_nsu as string | undefined;
  if (!orderNsu) return NextResponse.json({ ok: true, ignored: true });

  return await confirmarPagamento(String(orderNsu), {
    transactionNsu: (body.transaction_nsu as string) ?? null,
    slug:           (body.invoice_slug as string) ?? (body.slug as string) ?? null,
    captureMethod:  (body.capture_method as string) ?? null,
    paidAmount:     typeof body.paid_amount === "number" ? body.paid_amount : null,
    receiptUrl:     (body.receipt_url as string) ?? null,
  }).then(r => NextResponse.json(r));
}

// GET pra healthcheck e debug
export async function GET(req: NextRequest) {
  const orderNsu = req.nextUrl.searchParams.get("order_nsu");
  if (orderNsu) {
    const r = await confirmarPagamento(orderNsu, {});
    return NextResponse.json(r);
  }
  return NextResponse.json({ ok: true, hint: "POST com { order_nsu } da InfinityPay" });
}

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
