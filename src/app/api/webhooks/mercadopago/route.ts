/**
 * POST /api/webhooks/mercadopago
 *
 * Recebe notificações do Mercado Pago e atualiza o status do pedido.
 * Configurar como Notification URL no painel MP:
 *   https://seu-dominio.com/api/webhooks/mercadopago
 *
 * MP envia: { action: "payment.updated", data: { id: "12345678" } }
 * O pagamento está vinculado ao pedido via external_reference (pedido_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db/client";
import { MercadoPagoGateway } from "@/lib/gateways/mercadopago";
import type { GatewayConfig } from "@/lib/gateways/types";
import { decrypt } from "@/lib/security/encrypt";
import { registrarVendaPedido } from "@/lib/caixa/movimento";
import { enviarPushParaUsuariosDaEmpresa } from "@/lib/push";
import { notificarConfirmacaoCliente } from "@/lib/notify/evolution";
import { withWebhookLog } from "@/lib/webhook/wrapper";

const MP_API = "https://api.mercadopago.com";

interface MpWebhookPayload {
  action: string;
  data:   { id: string };
  type?:  string;
}

interface MpPaymentDetail {
  id:                 number;
  status:             string;
  transaction_amount: number;
  external_reference: string | null;
  live_mode:          boolean;
}

interface DbGateway {
  id:     string;
  token:  string | null;
  api_key: string | null;
  webhook_secret: string | null;
  empresa_id: string;
}

function mapMpStatusToPedido(mpStatus: string): string | null {
  switch (mpStatus) {
    case "approved":  return "confirmado";
    case "rejected":  return null;
    case "cancelled": return "cancelado";
    default:          return null;
  }
}

export async function POST(req: NextRequest) {
  return withWebhookLog("mercadopago", req, async (ctx) => {
    const payload = ctx.payload as MpWebhookPayload | null;
    if (!payload) {
      return { resultado: "falha", status: 400, mensagem: "JSON inválido" };
    }

    const evento = payload.action ?? payload.type ?? "";

    if (payload.type !== "payment" && payload.action !== "payment.updated") {
      return { resultado: "ignorado", evento, mensagem: "evento não relevante" };
    }

    const mpPaymentId = payload.data?.id;
    if (!mpPaymentId) {
      return { resultado: "falha", status: 400, evento, mensagem: "data.id ausente" };
    }

    const gateways = await queryOne<DbGateway>(
      `SELECT id, empresa_id, token, api_key, webhook_secret
       FROM gateways_config
       WHERE slug = 'mercadopago' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateways) {
      return { resultado: "ignorado", evento, mensagem: "nenhum gateway mercadopago ativo" };
    }

    const accessToken = gateways.token ? decrypt(gateways.token)
      : gateways.api_key ? decrypt(gateways.api_key) : null;

    if (!accessToken) {
      return { resultado: "falha", evento, empresaId: gateways.empresa_id, mensagem: "Token não configurado" };
    }

    if (gateways.webhook_secret) {
      const signature = ctx.req.headers.get("x-signature") ?? "";
      const secret = decrypt(gateways.webhook_secret);
      const tempConfig = {
        nome: "", slug: "mercadopago", ambiente: "producao",
        configuracoes: {}, token: accessToken, webhook_secret: secret,
      } as GatewayConfig;
      const gw = new MercadoPagoGateway(tempConfig);
      const { valid } = await gw.validarWebhook(payload, signature);
      if (!valid) {
        return { resultado: "assinatura_invalida", evento, empresaId: gateways.empresa_id };
      }
    }

    const mpRes = await fetch(`${MP_API}/v1/payments/${mpPaymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) {
      return {
        resultado: "falha", evento, empresaId: gateways.empresa_id, recursoId: String(mpPaymentId),
        mensagem: `consulta ao MP falhou: ${mpRes.status}`,
      };
    }

    const payment = await mpRes.json() as MpPaymentDetail;
    const pedidoId = payment.external_reference ?? undefined;

    if (!pedidoId) {
      return {
        resultado: "ignorado", evento, empresaId: gateways.empresa_id,
        recursoId: String(payment.id), mensagem: "sem external_reference",
      };
    }

    const novoStatus = mapMpStatusToPedido(payment.status);
    if (!novoStatus) {
      return {
        resultado: "ignorado", evento, empresaId: gateways.empresa_id,
        recursoId: String(payment.id), pedidoId, mensagem: `status mp: ${payment.status}`,
      };
    }

    await queryOne(
      `UPDATE pedidos
         SET status = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3
         AND status NOT IN ('cancelado', 'entregue')
       RETURNING id`,
      [novoStatus, pedidoId, gateways.empresa_id]
    );

    try {
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, updated_at = NOW()
         WHERE gateway_slug = 'mercadopago' AND gateway_id = $2`,
        [payment.status === "approved" ? "aprovado" : novoStatus, String(payment.id)]
      );
    } catch { /* tabela pode não existir */ }

    if (novoStatus === "confirmado") {
      try {
        await registrarVendaPedido(gateways.empresa_id, pedidoId, payment.transaction_amount, "pix");
      } catch (e) {
        console.error("[MP/webhook] CaixaIntegration:", e);
      }
      enviarPushParaUsuariosDaEmpresa(gateways.empresa_id, {
        title: `💰 Pagamento confirmado`,
        body:  `R$ ${payment.transaction_amount.toFixed(2).replace(".", ",")} via Mercado Pago`,
        url:   `/painel/pedidos`,
        tag:   "pagamento-confirmado",
      }).catch(e => console.warn("[MP/webhook] Push:", e));
      notificarConfirmacaoCliente(gateways.empresa_id, pedidoId)
        .catch(e => console.warn("[MP/webhook] Evolution:", e));
    }

    console.info(`[MP/webhook] Pedido ${pedidoId} → ${novoStatus} (MP status: ${payment.status})`);
    return {
      resultado: "processado",
      evento,
      empresaId: gateways.empresa_id,
      recursoId: String(payment.id),
      pedidoId,
      mensagem:  `${payment.status} → ${novoStatus}`,
      body:      { ok: true, pedido_id: pedidoId, status: novoStatus },
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, gateway: "mercadopago" });
}
