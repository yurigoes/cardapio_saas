/**
 * POST /api/webhooks/mercadopago-modulos
 *
 * Webhook DEDICADO pra compras de módulos (assinaturas SaaS).
 * Distinto do /api/webhooks/mercadopago (que processa pedidos do cardápio).
 *
 * Autentica via MERCADOPAGO_ACCESS_TOKEN (env) — gateway global do SaaS,
 * não da empresa. external_reference deve ser ID de modulo_compras.
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { buscarPagamento } from "@/lib/billing/mercadopago";
import { enfileirar as enfileirarEmail, smtpAtivo } from "@/lib/email/smtp";

const MOTIVOS_FALHA: Record<string, string> = {
  cancelled:    "Pagamento cancelado",
  rejected:     "Cartão recusado pela operadora",
  refunded:     "Pagamento estornado",
  charged_back: "Chargeback",
};

export async function POST(req: NextRequest) {
  let body: { type?: string; action?: string; data?: { id?: string | number } };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const tipo = body.type ?? body.action ?? "";
  if (!tipo.includes("payment")) {
    return NextResponse.json({ ok: true, ignored: true, type: tipo });
  }

  const paymentId = body.data?.id;
  if (!paymentId) return NextResponse.json({ ok: false, error: "no payment id" }, { status: 400 });

  try {
    const pagamento = await buscarPagamento(paymentId);
    const compraId  = pagamento.external_reference;

    if (!compraId) {
      return NextResponse.json({ ok: true, ignored: true, motivo: "sem external_reference" });
    }

    const compra = await queryOne<{ id: string; status: string; modulo: string; empresa_id: string }>(
      `SELECT id, status, modulo, empresa_id FROM modulo_compras WHERE id = $1`,
      [compraId]
    );
    if (!compra) {
      return NextResponse.json({ ok: true, ignored: true, motivo: "compra não encontrada" });
    }

    // Idempotência
    if (compra.status === "pago" && pagamento.status === "approved") {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    if (pagamento.status === "approved") {
      await queryOne(
        `UPDATE modulo_compras
            SET status      = 'pago',
                pago_em     = NOW(),
                ativa_ate   = NOW() + INTERVAL '30 days',
                gateway_ref = COALESCE(gateway_ref, '') || ' mp:payment:' || $2
          WHERE id = $1`,
        [compraId, paymentId]
      );
      console.info(`[MP-Modulos] ✓ ${compra.modulo} APROVADO empresa=${compra.empresa_id}`);

      // Email de confirmação (best-effort)
      if (await smtpAtivo()) {
        const dadosEmail = await queryOne<{
          empresa_nome: string; email: string | null; valor: string;
        }>(
          `SELECT e.nome_fantasia AS empresa_nome, e.email, mc.valor::text
             FROM modulo_compras mc
             JOIN empresas e ON e.id = mc.empresa_id
            WHERE mc.id = $1`,
          [compraId]
        ).catch(() => null);

        if (dadosEmail?.email) {
          enfileirarEmail({
            para:    dadosEmail.email,
            evento:  "pagamento_ok",
            vars: {
              empresa_nome:   dadosEmail.empresa_nome,
              descricao:      `Módulo ${compra.modulo} (30 dias)`,
              valor:          Number(dadosEmail.valor).toFixed(2).replace(".", ","),
              data_pagamento: new Date().toLocaleString("pt-BR"),
              transacao_id:   String(paymentId),
              painel_url:     `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/painel`,
            },
            contexto: { empresa_id: compra.empresa_id, compra_id: compraId, tipo: "pagamento_ok" },
          }).catch(e => console.warn("[MP-Modulos] email pagamento_ok:", e));
        }
      }
    } else if (["cancelled", "rejected", "refunded", "charged_back"].includes(pagamento.status)) {
      const novoStatus = pagamento.status === "cancelled" ? "cancelado" : "expirado";
      await queryOne(
        `UPDATE modulo_compras SET status = $1 WHERE id = $2`,
        [novoStatus, compraId]
      );
      console.info(`[MP-Modulos] ${compra.modulo} → ${novoStatus} empresa=${compra.empresa_id}`);

      // Email de falha (best-effort) — só pra rejected/cancelled (não pra refund de admin)
      if (["cancelled", "rejected"].includes(pagamento.status) && await smtpAtivo()) {
        const dadosEmail = await queryOne<{
          empresa_nome: string; email: string | null; valor: string;
        }>(
          `SELECT e.nome_fantasia AS empresa_nome, e.email, mc.valor::text
             FROM modulo_compras mc
             JOIN empresas e ON e.id = mc.empresa_id
            WHERE mc.id = $1`,
          [compraId]
        ).catch(() => null);

        if (dadosEmail?.email) {
          enfileirarEmail({
            para:    dadosEmail.email,
            evento:  "pagamento_falhou",
            vars: {
              empresa_nome: dadosEmail.empresa_nome,
              descricao:    `Módulo ${compra.modulo}`,
              valor:        Number(dadosEmail.valor).toFixed(2).replace(".", ","),
              motivo:       MOTIVOS_FALHA[pagamento.status] ?? pagamento.status,
              painel_url:   `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/painel/modulos`,
            },
            contexto: { empresa_id: compra.empresa_id, compra_id: compraId, tipo: "pagamento_falhou" },
          }).catch(e => console.warn("[MP-Modulos] email pagamento_falhou:", e));
        }
      }
    }

    return NextResponse.json({ ok: true, status: pagamento.status });
  } catch (err) {
    console.error("[MP-Modulos]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hook: "mercadopago-modulos" });
}
