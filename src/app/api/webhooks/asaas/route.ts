/**
 * POST /api/webhooks/asaas
 *
 * Recebe notificações Asaas e sincroniza pedido + pagamento.
 * Configurar no painel Asaas:
 *   URL:   https://seu-dominio.com/api/webhooks/asaas
 *   Token: defina algo aleatório → cole no campo webhook_secret do gateway
 *
 * Eventos relevantes:
 *   - PAYMENT_CONFIRMED / PAYMENT_RECEIVED  → confirmado
 *   - PAYMENT_OVERDUE / PAYMENT_DELETED     → cancelado
 *   - PAYMENT_REFUNDED                       → estornado
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { AsaasGateway } from "@/lib/gateways/asaas";
import type { GatewayConfig } from "@/lib/gateways/types";
import { decrypt } from "@/lib/security/encrypt";
import { registrarVendaPedido } from "@/lib/caixa/movimento";

interface AsaasWebhookPayload {
  event:  string;
  payment: {
    id:                string;
    status:            string;
    value:             number;
    externalReference: string | null;
  };
}

interface DbGateway {
  id:             string;
  empresa_id:     string;
  api_key:        string | null;
  token:          string | null;
  webhook_secret: string | null;
  ambiente:       string;
}

function mapEventToPedidoStatus(event: string): string | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
    case "PAYMENT_RECEIVED_IN_CASH": return "confirmado";
    case "PAYMENT_DELETED":
    case "PAYMENT_OVERDUE":          return "cancelado";
    default:                          return null;
  }
}

export async function POST(req: NextRequest) {
  let payload: AsaasWebhookPayload;
  try {
    payload = await req.json() as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  if (!payload.payment?.id) {
    return NextResponse.json({ ok: false, error: "payment.id ausente" }, { status: 400 });
  }

  try {
    const gateway = await queryOne<DbGateway>(
      `SELECT id, empresa_id, api_key, token, webhook_secret, ambiente
       FROM gateways_config
       WHERE slug = 'asaas' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateway) {
      console.warn("[Asaas/webhook] Nenhum gateway asaas ativo");
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Validação do token compartilhado (asaas-access-token header)
    if (gateway.webhook_secret) {
      const sig    = req.headers.get("asaas-access-token") ?? "";
      const secret = decrypt(gateway.webhook_secret);
      const accessToken = gateway.api_key ? decrypt(gateway.api_key)
        : gateway.token ? decrypt(gateway.token) : "";
      const config: GatewayConfig = {
        nome: "", slug: "asaas",
        ambiente: gateway.ambiente as "sandbox" | "producao",
        configuracoes: {}, api_key: accessToken, webhook_secret: secret,
      };
      const gw = new AsaasGateway(config);
      const { valid } = await gw.validarWebhook(payload, sig);
      if (!valid) {
        console.warn("[Asaas/webhook] Token inválido");
        return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
      }
    }

    // pedido_id vem em payment.externalReference (setamos no cobrar)
    const pedidoId = payload.payment.externalReference;
    if (!pedidoId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "sem externalReference" });
    }

    const novoStatus = mapEventToPedidoStatus(payload.event);

    // Refunds só atualizam pagamentos, não voltam o pedido pra cancelado se já entregue
    if (payload.event === "PAYMENT_REFUNDED") {
      try {
        await queryOne(
          `UPDATE pagamentos
             SET status = 'estornado', updated_at = NOW()
           WHERE gateway_slug = 'asaas' AND gateway_id = $1`,
          [payload.payment.id]
        );
      } catch { /* tabela pode não existir */ }
      return NextResponse.json({ ok: true, refunded: true });
    }

    if (!novoStatus) {
      return NextResponse.json({ ok: true, ignored: true, reason: payload.event });
    }

    await queryOne(
      `UPDATE pedidos
         SET status = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3
         AND status NOT IN ('cancelado', 'entregue')
       RETURNING id`,
      [novoStatus, pedidoId, gateway.empresa_id]
    );

    try {
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, updated_at = NOW()
         WHERE gateway_slug = 'asaas' AND gateway_id = $2`,
        [novoStatus === "confirmado" ? "aprovado" : novoStatus, payload.payment.id]
      );
    } catch { /* tabela pode não existir */ }

    if (novoStatus === "confirmado") {
      try {
        const pedidoData = await queryOne<{ total: string; forma_pagamento: string | null }>(
          `SELECT total, forma_pagamento FROM pedidos WHERE id = $1`,
          [pedidoId]
        );
        if (pedidoData) {
          await registrarVendaPedido(
            gateway.empresa_id, pedidoId,
            Number(pedidoData.total),
            pedidoData.forma_pagamento ?? "pix"
          );
        }
      } catch (e) {
        console.error("[Asaas/webhook] CaixaIntegration:", e);
      }
    }

    console.info(`[Asaas/webhook] Pedido ${pedidoId} → ${novoStatus} (${payload.event})`);
    return NextResponse.json({ ok: true, pedido_id: pedidoId, status: novoStatus });
  } catch (err) {
    console.error("[Asaas/webhook]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, gateway: "asaas" });
}
