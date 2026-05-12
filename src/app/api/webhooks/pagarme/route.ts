/**
 * POST /api/webhooks/pagarme
 *
 * Recebe notificações do Pagar.me e atualiza pedido + pagamento.
 * Configurar no painel Pagar.me como Webhook URL:
 *   https://seu-dominio.com/api/webhooks/pagarme
 *
 * Eventos relevantes:
 *   - order.paid              → pedido confirmado
 *   - order.payment_failed    → falhou
 *   - order.canceled          → cancelado
 *
 * O pedido é localizado via metadata.pedido_id (setado no cobrar()).
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { PagarmeGateway } from "@/lib/gateways/pagarme";
import type { GatewayConfig } from "@/lib/gateways/types";
import { decrypt } from "@/lib/security/encrypt";
import { registrarVendaPedido } from "@/lib/caixa/movimento";
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";
import { notificarConfirmacaoCliente } from "@/lib/notify/evolution";
import { withWebhookLog } from "@/lib/webhook/wrapper";

interface PmWebhookPayload {
  id:    string;
  type:  string;
  data: {
    id:        string;
    status:    string;
    code?:     string;
    metadata?: Record<string, string>;
    charges?:  Array<{ id: string; status: string }>;
  };
}

interface DbGateway {
  id:             string;
  empresa_id:     string;
  api_key:        string | null;
  token:          string | null;
  webhook_secret: string | null;
}

function mapPmStatusToPedido(status: string): string | null {
  switch ((status || "").toLowerCase()) {
    case "paid":     return "confirmado";
    case "canceled": return "cancelado";
    default:         return null;
  }
}

const EVENTOS_ACEITOS = ["order.paid", "order.payment_failed", "order.canceled"];

export async function POST(req: NextRequest) {
  return withWebhookLog("pagarme", req, async (ctx) => {
    const payload = ctx.payload as PmWebhookPayload | null;
    if (!payload) {
      return { resultado: "falha", status: 400, mensagem: "JSON inválido" };
    }

    const evento = payload.type ?? "";

    if (!EVENTOS_ACEITOS.includes(evento)) {
      return { resultado: "ignorado", evento, mensagem: `evento não relevante: ${evento}` };
    }

    const gateway = await queryOne<DbGateway>(
      `SELECT id, empresa_id, api_key, token, webhook_secret
       FROM gateways_config
       WHERE slug = 'pagarme' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateway) {
      return { resultado: "ignorado", evento, mensagem: "nenhum gateway pagarme ativo" };
    }

    const secretKey = gateway.api_key ? decrypt(gateway.api_key)
      : gateway.token ? decrypt(gateway.token) : null;

    if (!secretKey) {
      return { resultado: "falha", evento, empresaId: gateway.empresa_id, mensagem: "Secret key não configurada" };
    }

    if (gateway.webhook_secret) {
      const sig    = ctx.req.headers.get("x-hub-signature") ?? "";
      const secret = decrypt(gateway.webhook_secret);
      const config: GatewayConfig = {
        nome: "", slug: "pagarme", ambiente: "producao",
        configuracoes: {}, api_key: secretKey, webhook_secret: secret,
      };
      const gw = new PagarmeGateway(config);
      const { valid } = await gw.validarWebhook(payload, sig);
      if (!valid) {
        return { resultado: "assinatura_invalida", evento, empresaId: gateway.empresa_id };
      }
    }

    const pedidoId = payload.data?.metadata?.pedido_id ?? payload.data?.code;
    if (!pedidoId) {
      return {
        resultado: "ignorado", evento, empresaId: gateway.empresa_id,
        recursoId: payload.data?.id, mensagem: "sem pedido_id",
      };
    }

    const novoStatus = mapPmStatusToPedido(payload.data.status);
    if (!novoStatus) {
      return {
        resultado: "ignorado", evento, empresaId: gateway.empresa_id,
        recursoId: payload.data.id, pedidoId, mensagem: `status: ${payload.data.status}`,
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

    const chargeId = payload.data.charges?.[0]?.id ?? payload.data.id;
    try {
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, updated_at = NOW()
         WHERE gateway_slug = 'pagarme' AND gateway_id = $2`,
        [payload.data.status === "paid" ? "aprovado" : novoStatus, chargeId]
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
            body:  `R$ ${Number(pedidoData.total).toFixed(2).replace(".", ",")} via Pagar.me`,
            url:   `/painel/pedidos`,
            tag:   "pagamento-confirmado",
          }).catch(e => console.warn("[Pagarme/webhook] Push:", e));
          notificarConfirmacaoCliente(gateway.empresa_id, pedidoId)
            .catch(e => console.warn("[Pagarme/webhook] Evolution:", e));
        }
      } catch (e) {
        console.error("[Pagarme/webhook] CaixaIntegration:", e);
      }
    }

    console.info(`[Pagarme/webhook] Pedido ${pedidoId} → ${novoStatus} (${evento})`);
    return {
      resultado: "processado",
      evento,
      empresaId: gateway.empresa_id,
      recursoId: chargeId,
      pedidoId,
      mensagem:  `${payload.data.status} → ${novoStatus}`,
      body:      { ok: true, pedido_id: pedidoId, status: novoStatus },
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, gateway: "pagarme" });
}
