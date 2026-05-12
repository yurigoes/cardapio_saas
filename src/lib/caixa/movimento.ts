/**
 * Helpers para registrar movimentos de caixa atrelados a pedidos.
 *
 * Regras:
 *   - registrarVendaPedido: chamada quando pedido entra em estado pago
 *     (confirmado para pagamentos online, ou entregue para dinheiro presencial).
 *     Idempotente: se já há movimento venda para este pedido, não duplica.
 *   - registrarEstornoPedido: chamada quando pedido pago é cancelado.
 *     Cria movimento estorno do mesmo valor da venda.
 *
 * Comportamento se NÃO há caixa aberto:
 *   - Operação é registrada nos logs e ignorada silenciosamente.
 *     Razão: muitos restaurantes operam delivery sem caixa diário aberto;
 *     bloquear pedido por isso seria errado. Auditoria nos logs.
 */
import { queryOne } from "@/lib/db/client";

interface CaixaAberto {
  id: string;
}

export async function registrarVendaPedido(
  empresaId: string,
  pedidoId: string,
  valor: number,
  formaPagamento: string | null
): Promise<{ registrado: boolean; motivo?: string }> {
  if (valor <= 0) return { registrado: false, motivo: "valor zero" };

  // Caixa aberto?
  const caixa = await queryOne<CaixaAberto>(
    `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
    [empresaId]
  ).catch(() => null);

  if (!caixa) {
    console.info(`[Caixa] Sem caixa aberto — venda do pedido ${pedidoId} não registrada no caixa`);
    return { registrado: false, motivo: "sem caixa aberto" };
  }

  // Idempotência: já existe movimento venda para este pedido?
  const jaRegistrado = await queryOne<{ id: string }>(
    `SELECT id FROM caixa_movimentos
     WHERE pedido_id = $1 AND tipo = 'venda' LIMIT 1`,
    [pedidoId]
  ).catch(() => null);

  if (jaRegistrado) {
    return { registrado: false, motivo: "já registrado" };
  }

  try {
    await queryOne(
      `INSERT INTO caixa_movimentos
         (caixa_id, empresa_id, pedido_id, tipo, forma_pagamento, valor, descricao)
       VALUES ($1, $2, $3, 'venda', $4, $5, $6)
       RETURNING id`,
      [
        caixa.id,
        empresaId,
        pedidoId,
        formaPagamento ?? "outro",
        valor,
        `Venda · pedido ${pedidoId.slice(0, 8)}`,
      ]
    );
    return { registrado: true };
  } catch (err) {
    console.error("[Caixa/registrarVendaPedido]", err);
    return { registrado: false, motivo: "erro de inserção" };
  }
}

export async function registrarEstornoPedido(
  empresaId: string,
  pedidoId: string,
  valor: number,
  formaPagamento: string | null
): Promise<{ registrado: boolean; motivo?: string }> {
  if (valor <= 0) return { registrado: false, motivo: "valor zero" };

  // Procura primeiro se há venda registrada (caso típico) e usa o mesmo caixa
  const venda = await queryOne<{ caixa_id: string }>(
    `SELECT caixa_id FROM caixa_movimentos
     WHERE pedido_id = $1 AND tipo = 'venda' LIMIT 1`,
    [pedidoId]
  ).catch(() => null);

  // Se não houve venda registrada, busca caixa aberto atual
  let caixaId = venda?.caixa_id;
  if (!caixaId) {
    const caixa = await queryOne<CaixaAberto>(
      `SELECT id FROM caixas WHERE empresa_id = $1 AND status = 'aberto' LIMIT 1`,
      [empresaId]
    ).catch(() => null);
    if (!caixa) {
      console.info(`[Caixa] Sem caixa aberto — estorno do pedido ${pedidoId} não registrado`);
      return { registrado: false, motivo: "sem caixa aberto" };
    }
    caixaId = caixa.id;
  }

  // Idempotência
  const jaRegistrado = await queryOne<{ id: string }>(
    `SELECT id FROM caixa_movimentos
     WHERE pedido_id = $1 AND tipo = 'estorno' LIMIT 1`,
    [pedidoId]
  ).catch(() => null);

  if (jaRegistrado) return { registrado: false, motivo: "já registrado" };

  try {
    await queryOne(
      `INSERT INTO caixa_movimentos
         (caixa_id, empresa_id, pedido_id, tipo, forma_pagamento, valor, descricao)
       VALUES ($1, $2, $3, 'estorno', $4, $5, $6)
       RETURNING id`,
      [
        caixaId,
        empresaId,
        pedidoId,
        formaPagamento ?? "outro",
        valor,
        `Estorno · pedido ${pedidoId.slice(0, 8)}`,
      ]
    );
    return { registrado: true };
  } catch (err) {
    console.error("[Caixa/registrarEstornoPedido]", err);
    return { registrado: false, motivo: "erro de inserção" };
  }
}
