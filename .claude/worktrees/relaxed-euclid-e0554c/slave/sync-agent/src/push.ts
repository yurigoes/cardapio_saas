/**
 * push.ts — Envia pedidos criados offline para a VPS (push)
 *
 * Busca pedidos locais onde slave_synced_at IS NULL (criados offline),
 * envia para a VPS e marca como sincronizados após confirmação.
 */

import axios   from "axios";
import { config, saveState } from "./config";
import { authHeaders }        from "./auth";
import { query }              from "./db";
import { logger }             from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface ItemLocal {
  id:             string;
  produto_id:     string | null;
  nome:           string;
  preco_unitario: number;
  quantidade:     number;
  subtotal:       number;
  observacoes:    string | null;
}

interface PedidoLocal {
  id:                string;
  tipo:              string;
  status:            string;
  mesa_id:           string | null;
  cliente_nome:      string | null;
  cliente_telefone:  string | null;
  subtotal:          number;
  total:             number;
  observacoes:       string | null;
  slave_uuid:        string;
  created_at:        string;
  itens:             ItemLocal[];
}

interface PushResponse {
  aceitos:    number;
  duplicados: number;
  erros:      string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Push principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca pedidos não sincronizados do banco local e os envia para a VPS.
 * Após confirmação, marca cada pedido com slave_synced_at = NOW().
 *
 * @returns Objeto com aceitos, duplicados e erros
 */
export async function pushToVPS(): Promise<PushResponse> {
  // Busca pedidos pendentes de sincronização
  const pedidosRaw = await query<PedidoLocal>(
    `SELECT id, tipo, status, mesa_id, cliente_nome, cliente_telefone,
            subtotal, total, observacoes, slave_uuid, created_at
     FROM pedidos
     WHERE origem = 'slave' AND slave_synced_at IS NULL
     ORDER BY created_at ASC
     LIMIT 100`   // processa em lotes de 100
  );

  if (pedidosRaw.length === 0) {
    logger.debug("Nenhum pedido pendente para push");
    return { aceitos: 0, duplicados: 0, erros: [] };
  }

  logger.info(`Enviando ${pedidosRaw.length} pedido(s) para a VPS...`);

  // Busca itens de cada pedido
  const pedidoIds = pedidosRaw.map(p => p.id);
  const todosItens = await query<ItemLocal & { pedido_id: string }>(
    `SELECT pedido_id, id, produto_id, nome, preco_unitario, quantidade, subtotal, observacoes
     FROM pedido_itens
     WHERE pedido_id = ANY($1)`,
    [pedidoIds]
  );

  // Agrupa itens por pedido
  const itensPorPedido = todosItens.reduce<Record<string, ItemLocal[]>>((acc, item) => {
    const { pedido_id, ...rest } = item;
    (acc[pedido_id] ??= []).push(rest);
    return acc;
  }, {});

  // Monta payload para a VPS
  const pedidosPayload = pedidosRaw.map(p => ({
    slave_uuid:        p.slave_uuid,
    tipo:              p.tipo,
    status:            p.status,
    mesa_id:           p.mesa_id,
    cliente_nome:      p.cliente_nome,
    cliente_telefone:  p.cliente_telefone,
    subtotal:          p.subtotal,
    total:             p.total,
    observacoes:       p.observacoes,
    created_at:        p.created_at,
    itens:             itensPorPedido[p.id] ?? [],
  }));

  const bodyStr = JSON.stringify({ pedidos: pedidosPayload, mesa_eventos: [] });

  const response = await axios.post<{ success: boolean; data: PushResponse; error?: string }>(
    `${config.vpsUrl}/api/sync/push`,
    bodyStr,
    {
      headers:        authHeaders(bodyStr),
      timeout:        30_000,
      validateStatus: () => true,
    }
  );

  if (!response.data.success) {
    throw new Error(
      `Push falhou [${response.status}]: ${response.data.error ?? "Erro desconhecido"}`
    );
  }

  const result = response.data.data;

  // Marca pedidos como sincronizados (aceitos + duplicados = já na VPS)
  if (result.aceitos + result.duplicados > 0) {
    await query(
      `UPDATE pedidos
       SET slave_synced_at = NOW(), updated_at = NOW()
       WHERE slave_uuid = ANY($1)`,
      [pedidosRaw.map(p => p.slave_uuid)]
    );
  }

  saveState({ lastPushAt: new Date().toISOString() });

  logger.info("Push concluído", {
    aceitos:    result.aceitos,
    duplicados: result.duplicados,
    erros:      result.erros.length,
  });

  if (result.erros.length > 0) {
    logger.warn("Erros no push", { erros: result.erros });
  }

  return result;
}
