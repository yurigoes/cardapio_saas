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
import { logWebhook } from "@/lib/webhook/log";

interface StoneWebhookPayload {
  event:     string;                          // ex: "pix.payment_link.paid"
  resource?: {
    id:        string;
    status:    string;
    reference: string | null;                 // pedido_id
    amount:    number;
  };
  // Stone às vezes serializa como { type, data } — aceitar ambos:
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
  const rawBody = await req.text();
  let payload: StoneWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as StoneWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  // Normaliza envelope (Stone pode usar event/resource OU type/data)
  const event    = payload.event ?? payload.type ?? "";
  const resource = payload.resource ?? payload.data;

  if (!resource?.id) {
    return NextResponse.json({ ok: true, ignored: true, reason: "sem resource.id" });
  }

  try {
    const gateway = await queryOne<DbGateway>(
      `SELECT id, empresa_id, client_id, client_secret, webhook_secret, ambiente
       FROM gateways_config
       WHERE slug = 'stone' AND ativo = TRUE AND deleted_at IS NULL
       LIMIT 1`
    );

    if (!gateway) {
      console.warn("[Stone/webhook] Nenhum gateway stone ativo");
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Validação HMAC-SHA256 do body raw (se webhook_secret configurado)
    if (gateway.webhook_secret) {
      const sig    = req.headers.get("x-hub-signature") ?? req.headers.get("x-stone-signature") ?? "";
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
      const { valid } = await gw.validarWebhook(JSON.parse(rawBody), sig);
      if (!valid) {
        console.warn("[Stone/webhook] Assinatura inválida");
        return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
      }
    }

    const pedidoId = resource.reference;
    if (!pedidoId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "sem reference" });
    }

    // Refunds: só atualizam pagamentos
    if (event.toLowerCase().includes("refund")) {
      try {
        await queryOne(
          `UPDATE pagamentos
             SET status = 'estornado', updated_at = NOW()
           WHERE gateway_slug = 'stone' AND gateway_id = $1`,
          [resource.id]
        );
      } catch { /* tabela pode não existir */ }
      return NextResponse.json({ ok: true, refunded: true });
    }

    const novoStatus = mapStoneEventToPedidoStatus(event);
    if (!novoStatus) {
      return NextResponse.json({ ok: true, ignored: true, reason: event });
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
        }
      } catch (e) {
        console.error("[Stone/webhook] CaixaIntegration:", e);
      }
    }

    console.info(`[Stone/webhook] Pedido ${pedidoId} → ${novoStatus} (${event})`);
    logWebhook({
      gateway:    "stone",
      empresaId:  gateway.empresa_id,
      evento:     event,
      recursoId:  resource.id,
      pedidoId,
      resultado:  "processado",
      httpStatus: 200,
      mensagem:   `${resource.status} → ${novoStatus}`,
      payload,
      headers:    Object.fromEntries(req.headers),
      ipOrigem:   req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });
    return NextResponse.json({ ok: true, pedido_id: pedidoId, status: novoStatus });
  } catch (err) {
    console.error("[Stone/webhook]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, gateway: "stone" });
}
