// ─────────────────────────────────────────────
// Cálculo de cashback (lógica pura, testável). A persistência fica em movimento.ts.
// ─────────────────────────────────────────────

/** Arredonda para 2 casas (centavos), evitando lixo de ponto flutuante. */
export function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Cashback gerado = total × percentual / 100, em centavos arredondados. */
export function calcularCashback(totalPedido: number, percentual: number): number {
  if (totalPedido <= 0 || percentual <= 0) return 0;
  return arredondar2((totalPedido * percentual) / 100);
}

/** Novo saldo após crédito. */
export function aplicarCredito(saldoAnterior: number, valor: number): number {
  return arredondar2(saldoAnterior + valor);
}

/** Novo saldo após débito (nunca abaixo de 0). */
export function aplicarDebito(saldoAnterior: number, valor: number): number {
  return arredondar2(Math.max(0, saldoAnterior - valor));
}
