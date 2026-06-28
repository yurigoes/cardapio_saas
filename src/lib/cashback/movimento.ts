/**
 * Helpers de cashback. Idempotente por (pedido_id, tipo).
 */
import type { PoolClient } from "pg";
import { calcularCashback, aplicarCredito, aplicarDebito } from "./calculo";

interface EmpresaCb {
  cashback_ativo:      boolean;
  cashback_percentual: string | number;
}

/**
 * Credita cashback ao cliente baseado no valor do pedido.
 * Calcula valor = total × empresa.cashback_percentual / 100.
 *
 * Idempotente: skip se já houve crédito para esse pedido.
 * Skip silencioso se: cashback inativo, percentual zero, sem cliente.
 */
export async function creditarCashbackPedido(
  client: PoolClient,
  empresaId: string,
  clienteId: string,
  pedidoId:  string,
  totalPedido: number,
): Promise<{ creditado: boolean; valor?: number; motivo?: string }> {
  if (totalPedido <= 0) return { creditado: false, motivo: "valor zero" };

  const empresa = await client.query<EmpresaCb>(
    `SELECT COALESCE(cashback_ativo, false)        AS cashback_ativo,
            COALESCE(cashback_percentual, 0)        AS cashback_percentual
     FROM empresas WHERE id = $1`,
    [empresaId]
  ).then(r => r.rows[0]).catch(() => null);

  if (!empresa || !empresa.cashback_ativo) return { creditado: false, motivo: "inativo" };

  const pct = Number(empresa.cashback_percentual);
  if (pct <= 0) return { creditado: false, motivo: "percentual zero" };

  // Idempotência
  const ja = await client.query<{ id: string }>(
    `SELECT id FROM cashback_movimentos
     WHERE pedido_id = $1 AND tipo = 'credito' LIMIT 1`,
    [pedidoId]
  ).then(r => r.rows[0]).catch(() => null);

  if (ja) return { creditado: false, motivo: "já creditado" };

  const valor = calcularCashback(totalPedido, pct);
  if (valor <= 0) return { creditado: false, motivo: "valor calculado zero" };

  // Lock cliente para atualizar saldo atomicamente
  const cliente = await client.query<{ saldo_cashback: string }>(
    `SELECT saldo_cashback FROM clientes WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
    [clienteId, empresaId]
  ).then(r => r.rows[0]);

  if (!cliente) return { creditado: false, motivo: "cliente não existe" };

  const saldoAnterior = Number(cliente.saldo_cashback);
  const saldoAtual    = aplicarCredito(saldoAnterior, valor);

  await client.query(
    `UPDATE clientes SET saldo_cashback = $1, updated_at = NOW() WHERE id = $2`,
    [saldoAtual, clienteId]
  );

  await client.query(
    `INSERT INTO cashback_movimentos
       (empresa_id, cliente_id, pedido_id, tipo, valor, saldo_anterior, saldo_atual, motivo)
     VALUES ($1, $2, $3, 'credito', $4, $5, $6, $7)`,
    [
      empresaId, clienteId, pedidoId, valor, saldoAnterior, saldoAtual,
      `${pct.toFixed(1)}% sobre R$ ${totalPedido.toFixed(2)}`,
    ]
  );

  return { creditado: true, valor };
}

/**
 * Debita cashback do cliente (uso como desconto).
 * Não vai abaixo de zero. Idempotente por pedido.
 */
export async function debitarCashbackPedido(
  client: PoolClient,
  empresaId: string,
  clienteId: string,
  pedidoId:  string,
  valorUso:  number,
): Promise<{ debitado: boolean; valor?: number; motivo?: string }> {
  if (valorUso <= 0) return { debitado: false, motivo: "valor zero" };

  const ja = await client.query<{ id: string }>(
    `SELECT id FROM cashback_movimentos
     WHERE pedido_id = $1 AND tipo = 'debito' LIMIT 1`,
    [pedidoId]
  ).then(r => r.rows[0]).catch(() => null);

  if (ja) return { debitado: false, motivo: "já debitado" };

  const cliente = await client.query<{ saldo_cashback: string }>(
    `SELECT saldo_cashback FROM clientes WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
    [clienteId, empresaId]
  ).then(r => r.rows[0]);

  if (!cliente) return { debitado: false, motivo: "cliente não existe" };

  const saldoAnterior = Number(cliente.saldo_cashback);
  if (saldoAnterior < valorUso) {
    return { debitado: false, motivo: "saldo insuficiente" };
  }

  const saldoAtual = aplicarDebito(saldoAnterior, valorUso);

  await client.query(
    `UPDATE clientes SET saldo_cashback = $1, updated_at = NOW() WHERE id = $2`,
    [saldoAtual, clienteId]
  );

  await client.query(
    `INSERT INTO cashback_movimentos
       (empresa_id, cliente_id, pedido_id, tipo, valor, saldo_anterior, saldo_atual, motivo)
     VALUES ($1, $2, $3, 'debito', $4, $5, $6, $7)`,
    [empresaId, clienteId, pedidoId, valorUso, saldoAnterior, saldoAtual, "Usado em compra"]
  );

  return { debitado: true, valor: valorUso };
}
