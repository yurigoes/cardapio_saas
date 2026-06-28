// ─────────────────────────────────────────────
// Cálculo de valores do pedido (lógica pura, testável)
// ─────────────────────────────────────────────

export interface ItemCalculo {
  preco_unitario: number;
  quantidade:     number;
}

/** Soma (preço unitário × quantidade) de todos os itens. */
export function calcularSubtotal(itens: ItemCalculo[]): number {
  return itens.reduce(
    (acc, item) => acc + item.preco_unitario * item.quantidade,
    0
  );
}

/** Total do pedido = subtotal + taxa de entrega − desconto (nunca abaixo de 0). */
export function calcularTotal(
  subtotal: number,
  taxaEntrega = 0,
  desconto = 0
): number {
  return Math.max(0, subtotal + taxaEntrega - desconto);
}
