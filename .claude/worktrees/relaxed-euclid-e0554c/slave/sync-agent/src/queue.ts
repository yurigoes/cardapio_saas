/**
 * queue.ts — Fila offline de operações pendentes
 *
 * Quando o slave está offline, operações (pedidos, eventos de mesa) são
 * salvas na tabela sync_queue local. Quando a conexão é restaurada,
 * processQueue() tenta enviar os itens pendentes.
 */

import { query, queryOne } from "./db";
import { pushToVPS }       from "./push";
import { logger }          from "./logger";

export type QueueItemType = "pedido" | "mesa_evento";

// ─────────────────────────────────────────────────────────────────────────────
// Adicionar à fila
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adiciona um item à fila de sincronização local.
 * Usado quando o slave está offline e não consegue fazer push imediato.
 */
export async function addToQueue(tipo: QueueItemType, data: object): Promise<void> {
  await query(
    `INSERT INTO sync_queue (tipo, payload) VALUES ($1, $2)`,
    [tipo, JSON.stringify(data)]
  );
  logger.debug(`Item adicionado à fila offline`, { tipo });
}

// ─────────────────────────────────────────────────────────────────────────────
// Processar fila
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenta processar todos os itens pendentes da fila.
 * Em caso de sucesso, marca os itens como processados.
 * Incrementa o contador de tentativas em caso de falha.
 */
export async function processQueue(): Promise<{ processados: number; falhas: number }> {
  const itens = await query<{
    id:         number;
    tipo:       QueueItemType;
    payload:    Record<string, unknown>;
    tentativas: number;
  }>(
    `SELECT id, tipo, payload, tentativas
     FROM sync_queue
     WHERE processado_at IS NULL AND tentativas < 10
     ORDER BY id ASC
     LIMIT 50`
  );

  if (itens.length === 0) {
    return { processados: 0, falhas: 0 };
  }

  logger.info(`Processando fila offline: ${itens.length} item(ns) pendente(s)`);

  let processados = 0;
  let falhas      = 0;

  for (const item of itens) {
    try {
      // Dispara o push geral — os pedidos locais pendentes serão enviados
      // A fila serve como trigger; o push.ts já faz a lógica completa
      await pushToVPS();

      // Marca o item como processado
      await query(
        `UPDATE sync_queue SET processado_at = NOW() WHERE id = $1`,
        [item.id]
      );

      processados++;
    } catch (err) {
      // Incrementa tentativas, mas não marca como falho permanentemente
      await query(
        `UPDATE sync_queue SET tentativas = tentativas + 1 WHERE id = $1`,
        [item.id]
      );

      logger.warn(`Falha ao processar item da fila`, {
        id:         item.id,
        tipo:       item.tipo,
        tentativas: item.tentativas + 1,
        erro:       String(err),
      });

      falhas++;
      break;   // Para na primeira falha — a conexão provavelmente está offline
    }
  }

  return { processados, falhas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tamanho da fila
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o número de itens pendentes na fila.
 */
export async function getQueueSize(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE processado_at IS NULL AND tentativas < 10`
  );
  return parseInt(row?.count ?? "0", 10);
}
