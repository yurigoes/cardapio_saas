/**
 * POST /api/webhooks/infinity-pay
 * Recebe notificação da InfinityPay (sem assinatura). Confirma via /payment_check
 * antes de marcar como pago — fonte de verdade.
 *
 * Body esperado: { order_nsu, transaction_nsu?, invoice_slug?, paid_amount?, capture_method?, receipt_url? }
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { confirmarPagamento } from "@/lib/infinity-pay-confirm";

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

// GET pra healthcheck, debug E confirmação manual via redirect_url da InfinityPay.
// Após o cliente pagar, InfinityPay redireciona pra ?paid=1&order_nsu=... — nosso
// painel chama esse endpoint passando o order_nsu pra confirmar na hora.
export async function GET(req: NextRequest) {
  const orderNsu = req.nextUrl.searchParams.get("order_nsu");
  if (orderNsu) {
    await ensureSchema();
    const r = await confirmarPagamento(orderNsu, {
      transactionNsu: req.nextUrl.searchParams.get("transaction_nsu"),
      slug: req.nextUrl.searchParams.get("slug"),
      captureMethod: req.nextUrl.searchParams.get("capture_method"),
      receiptUrl: req.nextUrl.searchParams.get("receipt_url"),
    });
    return NextResponse.json(r);
  }
  return NextResponse.json({ ok: true, hint: "POST com { order_nsu } da InfinityPay" });
}
