/**
 * POST /api/webhooks/stone
 *
 * Recebe notificações Stone OpenBank e sincroniza pedido + pagamento.
 * Configurar no painel Stone:
 *   URL:    https://seu-dominio.com/api/webhooks/stone
 *   Secret: definir no painel → cole no campo webhook_secret do gateway
 *   Header: X-Hub-Signature: sha256=<hmac-sha256(body, secret)>
 *
 * Eventos relevantes (formato do envelope pode variar):
 *   - pix.payment_link.paid     → confirmado
 *   - pix.payment_link.expired  → cancelado
 *   - payment.refunded          → estornado
 *
 * O pedido é localizado via "reference" (que setamos como pedido_id no cobrar).
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { StoneGateway } from "@/lib/gateways/stone";
import type { GatewayConfig } from "@/lib/gateways/types";
import { decrypt } from "@/lib/security/encrypt";
import { registrarVendaPedido } from "@/lib/caixa/movimento";
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";
import { notificarConfirmacaoCliente } from "@/lib/notify/evolution";
import { withWebhookLog } from "@/lib/webhook/wrapper";

interface StoneWebhookPayload {
  event:     string;
  resource?: {
    id:        string;
    status:    string;
    reference: string | null;
    amount:    number;
  };
  type?:     string;
  data?:     {
    id:        string;
    status:    string;
    reference: string | null;
    amount:    number;
  };
}

interface DbGateway {
  id:             string;
  empresa_id:     string;
  client_id:      string | null;
  client_secret:  string | null;
  webhook_secret: string | null;
  ambiente:       string;
}

function mapStoneEventToPedidoStatus(event: string): string | null {
  if (!event) return null;
  const e = event.toLowerCase();
  if (e.includes("paid") || e.includes("approved") || e.includes("captured")) return "confirmado";
  if (e.includes("expired") || e.includes("canceled") || e.includes("cancelled")) return "cancelado";
  return null;
}

export async function POST(req: NextRequest) {
  return withWebhookLog("stone", req, async (ctx) => {
    const payload = ctx.payload as StoneWebhookPayload | null;
    if (!payload) {
      return { resultado: "falha", status: 400, mensagem: "JSON inválido" };
    }

    const evento   = payload.event ?? payload.type ?? "";
    const resource = payload.resource ?? payload.data;

    if (!resource?.id) {
      return { resultado: "ignorado", evento, mensagem: "sem resource.id" };
    }

    const gateway = await queryOne<DbGateway>(
      `SELECT id, empresa_id, client_id, client_secret, webhook_secret, ambiente
       FROM gateways_config
       WHERE slug = 'stone' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateway) {
      return { resultado: "ignorado", evento, recursoId: resource.id, mensagem: "nenhum gateway stone ativo" };
    }

    if (gateway.webhook_secret) {
      const sig    = ctx.req.headers.get("x-hub-signature") ?? ctx.req.headers.get("x-stone-signature") ?? "";
      const secret = decrypt(gateway.webhook_secret);
      const config: GatewayConfig = {
        nome: "", slug: "stone",
        ambiente: gateway.ambiente as "sandbox" | "producao",
        configuracoes: {},
        client_id:     gateway.client_id     ? decrypt(gateway.client_id)     : undefined,
        client_secret: gateway.client_secret ? decrypt(gateway.client_secret) : undefined,
        webhook_secret: secret,
      };
      const gw = new StoneGateway(config);
      const { valid } = await gw.validarWebhook(payload, sig);
      if (!valid) {
        return { resultado: "assinatura_invalida", evento, empresaId: gateway.empresa_id, recursoId: resource.id };
      }
    }

    const pedidoId = resource.reference ?? undefined;
    if (!pedidoId) {
      return {
        resultado: "ignorado", evento, empresaId: gateway.empresa_id,
        recursoId: resource.id, mensagem: "sem reference",
      };
    }

    // Refunds: só atualizam pagamentos
    if (evento.toLowerCase().includes("refund")) {
      try {
        await queryOne(
          `UPDATE pagamentos
             SET status = 'estornado', updated_at = NOW()
           WHERE gateway_slug = 'stone' AND gateway_id = $1`,
          [resource.id]
        );
      } catch { /* tabela pode não existir */ }
      return {
        resultado: "processado", evento, empresaId: gateway.empresa_id,
        recursoId: resource.id, pedidoId, mensagem: "estornado",
        body: { ok: true, refunded: true },
      };
    }

    const novoStatus = mapStoneEventToPedidoStatus(evento);
    if (!novoStatus) {
      return {
        resultado: "ignorado", evento, empresaId: gateway.empresa_id,
        recursoId: resource.id, pedidoId, mensagem: `evento não mapeado: ${evento}`,
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
         WHERE gateway_slug = 'stone' AND gateway_id = $2`,
        [novoStatus === "confirmado" ? "aprovado" : novoStatus, resource.id]
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
            body:  `R$ ${Number(pedidoData.total).toFixed(2).replace(".", ",")} via Stone`,
            url:   `/painel/pedidos`,
            tag:   "pagamento-confirmado",
          }).catch(e => console.warn("[Stone/webhook] Push:", e));
          notificarConfirmacaoCliente(gateway.empresa_id, pedidoId)
            .catch(e => console.warn("[Stone/webhook] Evolution:", e));
        }
      } catch (e) {
        console.error("[Stone/webhook] CaixaIntegration:", e);
      }
    }

    console.info(`[Stone/webhook] Pedido ${pedidoId} → ${novoStatus} (${evento})`);
    return {
      resultado: "processado",
      evento,
      empresaId: gateway.empresa_id,
      recursoId: resource.id,
      pedidoId,
      mensagem:  `${resource.status} → ${novoStatus}`,
      body:      { ok: true, pedido_id: pedidoId, status: novoStatus },
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, gateway: "stone" });
}
