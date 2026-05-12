/**
 * Helpers para registrar movimentos de estoque atrelados a vendas.
 *
 * Idempotência:
 *   - Saída por venda registra-se uma vez por (pedido_id, produto_id).
 *   - Se já existe movimento de saída para esse pedido+produto, ignora.
 *
 * Sem transação: chama queryOne diretamente. Se for crítico, envolva
 * em transaction no caller.
 */
import type { PoolClient } from "pg";

interface EstoqueProduto {
  id:               string;
  controla_estoque: boolean;
  estoque_atual:    number | null;
}

/**
 * Registra saída de estoque por venda.
 * Decrementa produtos.estoque_atual E grava o movimento.
 * Tudo dentro do client (já em transaction no caller).
 *
 * Comportamento:
 *   - Se produto não controla estoque: skip silencioso
 *   - Se idempotência detectada (já há saída p/ esse pedido+produto): skip
 *   - Senão: UPDATE produtos + INSERT estoque_movimentos
 */
export async function registrarSaidaEstoque(
  client: PoolClient,
  empresaId:    string,
  produtoId:    string,
  pedidoId:     string,
  quantidade:   number,
  usuarioId?:   string,
): Promise<void> {
  if (quantidade <= 0) return;

  // Idempotência: já existe saída pra esse pedido+produto?
  const ja = await client.query<{ id: string }>(
    `SELECT id FROM estoque_movimentos
     WHERE pedido_id = $1 AND produto_id = $2 AND tipo = 'saida' LIMIT 1`,
    [pedidoId, produtoId]
  ).then(r => r.rows[0]).catch(() => null);

  if (ja) return;

  // Lê produto + lock pra decremento atômico
  const produto = await client.query<EstoqueProduto>(
    `SELECT id, controla_estoque, estoque_atual
     FROM produtos WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
    [produtoId, empresaId]
  ).then(r => r.rows[0]).catch(() => null);

  if (!produto || !produto.controla_estoque) return;

  const estoqueAnterior = produto.estoque_atual ?? 0;
  const estoqueAtual    = estoqueAnterior - quantidade;

  // Atualiza estoque (permite negativo — restaurante decide se quer bloquear)
  await client.query(
    `UPDATE produtos SET estoque_atual = $1, updated_at = NOW()
     WHERE id = $2 AND empresa_id = $3`,
    [estoqueAtual, produtoId, empresaId]
  );

  // Registra movimento
  await client.query(
    `INSERT INTO estoque_movimentos
       (empresa_id, produto_id, pedido_id, usuario_id, tipo, quantidade,
        estoque_anterior, estoque_atual, motivo)
     VALUES ($1, $2, $3, $4, 'saida', $5, $6, $7, $8)`,
    [
      empresaId, produtoId, pedidoId, usuarioId ?? null,
      quantidade, estoqueAnterior, estoqueAtual,
      `Venda · pedido ${pedidoId.slice(0, 8)}`,
    ]
  );
}
