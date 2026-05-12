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
 *   - charge.paid / refunded  → status de cobrança individual
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
import { logWebhook } from "@/lib/webhook/log";

interface PmWebhookPayload {
  id:    string;
  type:  string; // ex: "order.paid"
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
    case "failed":   return null; // mantém status atual
    default:         return null;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let payload: PmWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as PmWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  // Filtra eventos relevantes
  const eventosAceitos = ["order.paid", "order.payment_failed", "order.canceled"];
  if (!eventosAceitos.includes(payload.type)) {
    return NextResponse.json({ ok: true, ignored: true, reason: payload.type });
  }

  try {
    // Busca gateway configurado
    const gateway = await queryOne<DbGateway>(
      `SELECT id, empresa_id, api_key, token, webhook_secret
       FROM gateways_config
       WHERE slug = 'pagarme' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateway) {
      console.warn("[Pagarme/webhook] Nenhum gateway pagarme ativo");
      return NextResponse.json({ ok: true, ignored: true });
    }

    const secretKey = gateway.api_key
      ? decrypt(gateway.api_key)
      : gateway.token
        ? decrypt(gateway.token)
        : null;

    if (!secretKey) {
      return NextResponse.json({ ok: false, error: "Secret key não configurada" }, { status: 500 });
    }

    // Valida assinatura (se webhook_secret estiver configurado)
    if (gateway.webhook_secret) {
      const sig    = req.headers.get("x-hub-signature") ?? "";
      const secret = decrypt(gateway.webhook_secret);
      const config: GatewayConfig = {
        nome: "", slug: "pagarme", ambiente: "producao",
        configuracoes: {}, api_key: secretKey, webhook_secret: secret,
      };
      const gw = new PagarmeGateway(config);
      // Re-parse para passar o objeto exato (a assinatura é sobre o body raw, não o JSON)
      const { valid } = await gw.validarWebhook(JSON.parse(rawBody), sig);
      if (!valid) {
        console.warn("[Pagarme/webhook] Assinatura inválida");
        return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
      }
    }

    // pedido_id vem em data.metadata.pedido_id (que setamos no cobrar)
    // Fallback: data.code (que também usamos)
    const pedidoId = payload.data?.metadata?.pedido_id ?? payload.data?.code;
    if (!pedidoId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "sem pedido_id" });
    }

    const novoStatus = mapPmStatusToPedido(payload.data.status);
    if (!novoStatus) {
      return NextResponse.json({ ok: true, ignored: true, reason: `status: ${payload.data.status}` });
    }

    // Atualiza pedido (não rebaixa entregue/cancelado)
    await queryOne(
      `UPDATE pedidos
         SET status = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3
         AND status NOT IN ('cancelado', 'entregue')
       RETURNING id`,
      [novoStatus, pedidoId, gateway.empresa_id]
    );

    // Atualiza tabela pagamentos (se existir)
    try {
      const chargeId = payload.data.charges?.[0]?.id ?? payload.data.id;
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, updated_at = NOW()
         WHERE gateway_slug = 'pagarme' AND gateway_id = $2`,
        [payload.data.status === "paid" ? "aprovado" : novoStatus, chargeId]
      );
    } catch { /* tabela pode não existir */ }

    // Integração caixa: venda online quando confirmada
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
        }
      } catch (e) {
        console.error("[Pagarme/webhook] CaixaIntegration:", e);
      }
    }

    console.info(`[Pagarme/webhook] Pedido ${pedidoId} → ${novoStatus} (${payload.type})`);
    logWebhook({
      gateway:    "pagarme",
      empresaId:  gateway.empresa_id,
      evento:     payload.type,
      recursoId:  String(payload.data?.charges?.[0]?.id ?? payload.data?.id ?? ""),
      pedidoId,
      resultado:  "processado",
      httpStatus: 200,
      mensagem:   `${payload.data.status} → ${novoStatus}`,
      payload,
      headers:    Object.fromEntries(req.headers),
      ipOrigem:   req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return NextResponse.json({ ok: true, pedido_id: pedidoId, status: novoStatus });
  } catch (err) {
    console.error("[Pagarme/webhook]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Pagar.me faz GET para verificar disponibilidade
export async function GET() {
  return NextResponse.json({ ok: true, gateway: "pagarme" });
}
