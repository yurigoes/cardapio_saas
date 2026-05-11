import { NextRequest } from "next/server";
import { query, transaction } from "@/lib/db/client";
import { getIfoodService, converterPedidoIfood, IfoodPedido } from "@/lib/integrations/ifood";
import { logger } from "@/lib/utils/logger";
import { ok, badRequest, serverError } from "@/lib/utils/response";
import type { PoolClient } from "pg";

// ─────────────────────────────────────────────
// POST /api/webhooks/ifood — Recebe eventos do iFood
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-ifood-signature") || "";

  let body: { merchantId?: string; type?: string; id?: string; order?: IfoodPedido };
  try {
    const rawBody = await req.text();

    // Busca empresa pelo merchant_id antes de validar assinatura
    const parsed = JSON.parse(rawBody);
    body = parsed;

    if (!body.merchantId) {
      return badRequest("merchantId ausente");
    }

    // Busca configuração da empresa
    const integracao = await query<{ empresa_id: string }>(
      `SELECT empresa_id FROM integracoes
       WHERE tipo = 'ifood'
         AND config->>'merchant_id' = $1
         AND ativo = TRUE
       LIMIT 1`,
      [body.merchantId]
    );

    if (!integracao[0]) {
      logger.warn("iFood webhook: merchant não encontrado", { merchantId: body.merchantId });
      return ok({ received: true }); // Retorna 200 para evitar reenvio
    }

    const empresaId = integracao[0].empresa_id;

    // Valida assinatura
    const ifoodService = await getIfoodService(empresaId);
    if (ifoodService && !ifoodService.validarWebhook(rawBody, signature)) {
      logger.warn("iFood webhook: assinatura inválida", { empresaId });
      return badRequest("Assinatura inválida");
    }

    // Processa evento
    await processarEventoIfood(body.type || "", body, empresaId);

    return ok({ received: true });
  } catch (err) {
    logger.error("iFood webhook: erro ao processar", err as Error);
    return serverError();
  }
}

async function processarEventoIfood(
  tipo:      string,
  payload:   { order?: IfoodPedido; id?: string },
  empresaId: string
): Promise<void> {
  switch (tipo) {
    case "PLACED":
    case "CONFIRMED":
      if (payload.order) {
        await criarOuAtualizarPedidoIfood(payload.order, empresaId);
      }
      break;

    case "CANCELLATION_REQUESTED":
      if (payload.id) {
        await cancelarPedidoIfood(payload.id, empresaId, "Cancelamento solicitado pelo iFood");
      }
      break;

    case "CANCELLED":
      if (payload.id) {
        await cancelarPedidoIfood(payload.id, empresaId, "Pedido cancelado");
      }
      break;

    default:
      logger.info("iFood webhook: evento ignorado", { tipo });
  }
}

async function criarOuAtualizarPedidoIfood(
  ifoodPedido: IfoodPedido,
  empresaId:   string
): Promise<void> {
  // Verifica se pedido já existe
  const existing = await query<{ id: string }>(
    `SELECT id FROM pedidos WHERE origem = 'ifood' AND origem_id = $1 LIMIT 1`,
    [ifoodPedido.id]
  );

  if (existing[0]) {
    logger.info("iFood: pedido já existe, atualizando", { origem_id: ifoodPedido.id });
    return;
  }

  const pedidoData = converterPedidoIfood(ifoodPedido, empresaId);

  await transaction(async (client: PoolClient) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO pedidos
         (empresa_id, tipo, status, cliente_nome, cliente_telefone,
          cliente_endereco, subtotal, taxa_entrega, total, observacoes,
          origem, origem_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        pedidoData.empresa_id,
        pedidoData.tipo,
        pedidoData.status,
        pedidoData.cliente_nome,
        pedidoData.cliente_telefone,
        pedidoData.cliente_endereco ? JSON.stringify(pedidoData.cliente_endereco) : null,
        pedidoData.subtotal,
        pedidoData.taxa_entrega,
        pedidoData.total,
        null,
        pedidoData.origem,
        pedidoData.origem_id,
        JSON.stringify(pedidoData.metadata),
      ]
    );

    const pedidoId = result.rows[0].id;

    for (const item of pedidoData.itens) {
      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, nome, preco_unitario, quantidade, subtotal, adicionais)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          pedidoId,
          item.nome,
          item.preco_unitario,
          item.quantidade,
          item.preco_unitario * item.quantidade,
          JSON.stringify(item.adicionais),
        ]
      );
    }
  });

  logger.info("iFood: pedido criado com sucesso", { origem_id: ifoodPedido.id });
}

async function cancelarPedidoIfood(
  ifoodOrderId: string,
  empresaId:    string,
  motivo:       string
): Promise<void> {
  await query(
    `UPDATE pedidos
     SET status = 'cancelado', cancelado_em = NOW(), motivo_cancelamento = $3
     WHERE origem = 'ifood' AND origem_id = $1 AND empresa_id = $2
       AND status NOT IN ('cancelado', 'entregue')`,
    [ifoodOrderId, empresaId, motivo]
  );
}
