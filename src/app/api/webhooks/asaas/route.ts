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
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";
import { notificarConfirmacaoCliente } from "@/lib/notify/evolution";
import { withWebhookLog } from "@/lib/webhook/wrapper";

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
    default:                         return null;
  }
}

export async function POST(req: NextRequest) {
  return withWebhookLog("asaas", req, async (ctx) => {
    const payload = ctx.payload as AsaasWebhookPayload | null;
    if (!payload) {
      return { resultado: "falha", status: 400, mensagem: "JSON inválido" };
    }

    const evento = payload.event ?? "";

    if (!payload.payment?.id) {
      return { resultado: "falha", status: 400, evento, mensagem: "payment.id ausente" };
    }

    const gateway = await queryOne<DbGateway>(
      `SELECT id, empresa_id, api_key, token, webhook_secret, ambiente
       FROM gateways_config
       WHERE slug = 'asaas' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateway) {
      return { resultado: "ignorado", evento, mensagem: "nenhum gateway asaas ativo" };
    }

    if (gateway.webhook_secret) {
      const sig    = ctx.req.headers.get("asaas-access-token") ?? "";
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
        return { resultado: "assinatura_invalida", evento, empresaId: gateway.empresa_id };
      }
    }

    const pedidoId = payload.payment.externalReference ?? undefined;
    if (!pedidoId) {
      return {
        resultado: "ignorado", evento, empresaId: gateway.empresa_id,
        recursoId: payload.payment.id, mensagem: "sem externalReference",
      };
    }

    // Refunds só atualizam pagamentos
    if (evento === "PAYMENT_REFUNDED") {
      try {
        await queryOne(
          `UPDATE pagamentos
             SET status = 'estornado', updated_at = NOW()
           WHERE gateway_slug = 'asaas' AND gateway_id = $1`,
          [payload.payment.id]
        );
      } catch { /* tabela pode não existir */ }
      return {
        resultado: "processado", evento, empresaId: gateway.empresa_id,
        recursoId: payload.payment.id, pedidoId, mensagem: "estornado",
        body: { ok: true, refunded: true },
      };
    }

    const novoStatus = mapEventToPedidoStatus(evento);
    if (!novoStatus) {
      return {
        resultado: "ignorado", evento, empresaId: gateway.empresa_id,
        recursoId: payload.payment.id, pedidoId, mensagem: `evento não mapeado: ${evento}`,
      };
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
          enviarPushParaUsuariosDaEmpresa(gateway.empresa_id, {
            title: `💰 Pagamento confirmado`,
            body:  `R$ ${Number(pedidoData.total).toFixed(2).replace(".", ",")} via Asaas`,
            url:   `/painel/pedidos`,
            tag:   "pagamento-confirmado",
          }).catch(e => console.warn("[Asaas/webhook] Push:", e));
          notificarConfirmacaoCliente(gateway.empresa_id, pedidoId)
            .catch(e => console.warn("[Asaas/webhook] Evolution:", e));
        }
      } catch (e) {
        console.error("[Asaas/webhook] CaixaIntegration:", e);
      }
    }

    console.info(`[Asaas/webhook] Pedido ${pedidoId} → ${novoStatus} (${evento})`);
    return {
      resultado: "processado",
      evento,
      empresaId: gateway.empresa_id,
      recursoId: payload.payment.id,
      pedidoId,
      mensagem:  `${payload.payment.status} → ${novoStatus}`,
      body:      { ok: true, pedido_id: pedidoId, status: novoStatus },
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, gateway: "asaas" });
}
