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

// Mapeia status MP → status do pedido interno
function mapMpStatusToPedido(mpStatus: string): string | null {
  switch (mpStatus) {
    case "approved":  return "confirmado";
    case "rejected":  return null;   // não muda o pedido
    case "cancelled": return "cancelado";
    default:          return null;
  }
}

export async function POST(req: NextRequest) {
  let payload: MpWebhookPayload;

  try {
    payload = await req.json() as MpWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  // Só processa eventos de pagamento
  if (payload.type !== "payment" && payload.action !== "payment.updated") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const mpPaymentId = payload.data?.id;
  if (!mpPaymentId) {
    return NextResponse.json({ ok: false, error: "data.id ausente" }, { status: 400 });
  }

  try {
    // Busca um gateway Mercado Pago ativo para poder consultar o pagamento
    // (a notificação não identifica a empresa — usamos external_reference depois)
    const gateways = await queryOne<DbGateway>(
      `SELECT id, empresa_id, token, api_key, webhook_secret
       FROM gateways_config
       WHERE slug = 'mercadopago' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateways) {
      console.warn("[MP/webhook] Nenhum gateway mercadopago ativo encontrado");
      return NextResponse.json({ ok: true, ignored: true });
    }

    const accessToken = gateways.token
      ? decrypt(gateways.token)
      : gateways.api_key
        ? decrypt(gateways.api_key)
        : null;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Token não configurado" }, { status: 500 });
    }

    // Valida assinatura (opcional — se webhook_secret configurado)
    const signature = req.headers.get("x-signature") ?? "";
    if (gateways.webhook_secret) {
      const secret = decrypt(gateways.webhook_secret);
      const tempConfig = {
        nome: "", slug: "mercadopago", ambiente: "producao",
        configuracoes: {}, token: accessToken, webhook_secret: secret,
      } as GatewayConfig;
      const gw = new MercadoPagoGateway(tempConfig);
      const { valid } = await gw.validarWebhook(payload, signature);
      if (!valid) {
        console.warn("[MP/webhook] Assinatura inválida");
        return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
      }
    }

    // Consulta detalhes do pagamento na API do MP
    const mpRes = await fetch(`${MP_API}/v1/payments/${mpPaymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) {
      console.error("[MP/webhook] Erro ao consultar pagamento:", mpRes.status);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    const payment = await mpRes.json() as MpPaymentDetail;

    // external_reference = pedido_id (UUID)
    const pedidoId = payment.external_reference;
    if (!pedidoId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "sem external_reference" });
    }

    const novoStatus = mapMpStatusToPedido(payment.status);
    if (!novoStatus) {
      return NextResponse.json({ ok: true, ignored: true, reason: `status mp: ${payment.status}` });
    }

    // Atualiza pedido
    await queryOne(
      `UPDATE pedidos
         SET status = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3
         AND status NOT IN ('cancelado', 'entregue')
       RETURNING id`,
      [novoStatus, pedidoId, gateways.empresa_id]
    );

    // Atualiza registro de pagamento se existir
    try {
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, updated_at = NOW()
         WHERE gateway_slug = 'mercadopago' AND gateway_id = $2`,
        [payment.status === "approved" ? "aprovado" : novoStatus, String(payment.id)]
      );
    } catch { /* tabela pode não existir */ }

    // Integração caixa: registra venda quando pagamento online é confirmado
    if (novoStatus === "confirmado") {
      try {
        await registrarVendaPedido(gateways.empresa_id, pedidoId, payment.transaction_amount, "pix");
      } catch (e) {
        console.error("[MP/webhook] CaixaIntegration:", e);
      }
      // Push: pagamento confirmado é momento crítico
      enviarPushParaUsuariosDaEmpresa(gateways.empresa_id, {
        title: `💰 Pagamento confirmado`,
        body:  `R$ ${payment.transaction_amount.toFixed(2).replace(".", ",")} via Mercado Pago`,
        url:   `/painel/pedidos`,
        tag:   "pagamento-confirmado",
      }).catch(e => console.warn("[MP/webhook] Push:", e));
    }

    console.info(`[MP/webhook] Pedido ${pedidoId} → ${novoStatus} (MP status: ${payment.status})`);
    return NextResponse.json({ ok: true, pedido_id: pedidoId, status: novoStatus });
  } catch (err) {
    console.error("[MP/webhook] Erro:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// MP faz GET no endpoint para verificar disponibilidade
export async function GET() {
  return NextResponse.json({ ok: true, gateway: "mercadopago" });
}
