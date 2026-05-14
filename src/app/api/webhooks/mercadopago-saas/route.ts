/**
 * POST /api/webhooks/mercadopago-saas
 *
 * Webhook DEDICADO pras cobranças do master (mensalidades + assinaturas).
 * Distinto de:
 *   - /api/webhooks/mercadopago         (pedidos do cardápio das empresas)
 *   - /api/webhooks/mercadopago-modulos (compras de módulos extras)
 *
 * Eventos MP suportados:
 *   - payment                              → pagamento de mensalidade
 *   - subscription_preapproval             → autorização da assinatura
 *   - subscription_authorized_payment      → cobrança recorrente automática
 *
 * external_reference convention:
 *   - "MENS-<uuid>" → mensalidade
 *   - "ASS-<uuid>"  → assinatura
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { buscarPagamento, buscarPreApproval } from "@/lib/billing/mercadopago";

interface WebhookPayload {
  type?:   string;
  action?: string;
  data?: { id?: string | number };
}

export async function POST(req: NextRequest) {
  let body: WebhookPayload;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const tipo = body.type ?? body.action ?? "";
  const recursoId = body.data?.id;
  if (!recursoId) {
    return NextResponse.json({ ok: true, ignored: true, motivo: "sem id" });
  }

  try {
    // ─── Pagamento (manual ou cobrança recorrente da assinatura) ──────────
    if (tipo.includes("payment")) {
      const pag = await buscarPagamento(recursoId);
      const ref = pag.external_reference ?? "";

      if (ref.startsWith("MENS-")) {
        await processarPagamentoMensalidade(ref.slice(5), pag);
      } else if (ref.startsWith("ASS-")) {
        // Pagamento autorizado pela assinatura recorrente
        await processarPagamentoAssinatura(ref.slice(4), pag);
      } else {
        return NextResponse.json({ ok: true, ignored: true, motivo: "external_ref desconhecido", ref });
      }
      return NextResponse.json({ ok: true, processado: "payment", ref });
    }

    // ─── PreApproval (autorização inicial / mudança de status) ────────────
    if (tipo.includes("subscription_preapproval") || tipo.includes("preapproval")) {
      const pre = await buscarPreApproval(String(recursoId));
      const ref = pre.external_reference ?? "";
      if (!ref.startsWith("ASS-")) {
        return NextResponse.json({ ok: true, ignored: true, motivo: "preapproval ref inválido", ref });
      }
      await processarStatusAssinatura(ref.slice(4), pre);
      return NextResponse.json({ ok: true, processado: "preapproval", ref });
    }

    return NextResponse.json({ ok: true, ignored: true, type: tipo });
  } catch (err) {
    console.error("[MP-SaaS/webhook]", err);
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : "?" },
      { status: 500 }
    );
  }
}

interface PagamentoMin {
  id: number; status: string; transaction_amount: number;
  date_approved: string | null;
}

async function processarPagamentoMensalidade(mensalidadeId: string, pag: PagamentoMin) {
  const m = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM mensalidades WHERE id = $1`,
    [mensalidadeId]
  );
  if (!m) {
    console.warn(`[MP-SaaS] mensalidade ${mensalidadeId} não encontrada`);
    return;
  }

  // Idempotência
  if (m.status === "paga" && pag.status === "approved") return;

  if (pag.status === "approved") {
    await query(
      `UPDATE mensalidades
          SET status = 'paga',
              pago_em = COALESCE($2::timestamp, NOW()),
              pago_via = 'mp_checkout',
              mp_payment_id = $3,
              atualizado_em = NOW()
        WHERE id = $1`,
      [m.id, pag.date_approved, String(pag.id)]
    );
    console.info(`[MP-SaaS] ✓ mensalidade ${m.id} APROVADA (R$ ${pag.transaction_amount})`);
  } else if (["cancelled", "rejected", "refunded", "charged_back"].includes(pag.status)) {
    // Mantém status 'aberta' — só registra a tentativa
    console.info(`[MP-SaaS] mensalidade ${m.id} pagamento ${pag.status}`);
  }
}

async function processarPagamentoAssinatura(assinaturaId: string, pag: PagamentoMin) {
  const ass = await queryOne<{
    id: string; empresa_id: string; valor_mensal: string; plano_id: string | null;
  }>(
    `SELECT id, empresa_id, valor_mensal::text, plano_id
       FROM assinaturas WHERE id = $1`,
    [assinaturaId]
  );
  if (!ass) return;

  if (pag.status !== "approved") return;

  // Cria mensalidade do mês corrente já marcada como paga
  const hoje = new Date();
  const mesRef = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  await query(
    `INSERT INTO mensalidades
       (empresa_id, plano_id, mes_referencia, valor, vencimento,
        status, pago_em, pago_via, mp_payment_id)
     VALUES ($1, $2, $3, $4, $5, 'paga', NOW(), 'mp_assinatura', $6)
     ON CONFLICT (empresa_id, mes_referencia) DO UPDATE
       SET status = 'paga', pago_em = NOW(),
           pago_via = 'mp_assinatura', mp_payment_id = EXCLUDED.mp_payment_id,
           atualizado_em = NOW()`,
    [
      ass.empresa_id, ass.plano_id,
      mesRef.toISOString().slice(0, 10),
      Number(ass.valor_mensal),
      mesRef.toISOString().slice(0, 10),  // vencimento = mes_ref (paga = irrelevante)
      String(pag.id),
    ]
  );

  await query(
    `UPDATE assinaturas
        SET ultimo_pagamento_em = NOW(),
            proxima_cobranca = (CURRENT_DATE + INTERVAL '1 month'),
            atualizado_em = NOW()
      WHERE id = $1`,
    [ass.id]
  );
}

interface PreApprovalMin {
  id: string; status: string; next_payment_date: string | null;
}

async function processarStatusAssinatura(assinaturaId: string, pre: PreApprovalMin) {
  const novoStatus =
    pre.status === "authorized" ? "ativa" :
    pre.status === "paused"     ? "pausada" :
    pre.status === "cancelled"  ? "cancelada" :
    pre.status === "pending"    ? "pendente" : "rejeitada";

  await query(
    `UPDATE assinaturas
        SET status = $2,
            proxima_cobranca = COALESCE($3::date, proxima_cobranca),
            ativada_em = CASE WHEN $2 = 'ativa' AND ativada_em IS NULL THEN NOW() ELSE ativada_em END,
            atualizado_em = NOW()
      WHERE id = $1`,
    [assinaturaId, novoStatus, pre.next_payment_date]
  );
  console.info(`[MP-SaaS] assinatura ${assinaturaId} → ${novoStatus}`);
}

export async function GET() {
  return NextResponse.json({ ok: true, hook: "mercadopago-saas" });
}
