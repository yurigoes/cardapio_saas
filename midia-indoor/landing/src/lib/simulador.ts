/**
 * Simulador de inserções — lógica de cálculo compartilhada (client + server).
 *
 * Modelo: preço por SEGUNDO de inserção.
 *   valor_total = preco_segundo × segundos × insercoes_dia × dias
 * onde preco_segundo é o preço de 1 inserção de 1 segundo, por 1 dia.
 *
 * Ex.: preco_segundo=0.05, 10s, 100 ins/dia, 30 dias
 *   = 0.05 × 10 × 100 × 30 = R$ 1.500,00
 */

export interface SimuladorConfig {
  preco_segundo: number;
  min_insercoes_dia: number;
  min_dias: number;
  min_valor: number;
  duracoes_seg: number[];
  ativo: boolean;
}

export interface ParamsSimulacao {
  insercoes_dia: number;
  segundos: number;
  dias: number;
}

/** Valor total de um pedido dado os parâmetros. */
export function calcularValor(precoSegundo: number, p: ParamsSimulacao): number {
  const v = precoSegundo * p.segundos * p.insercoes_dia * p.dias;
  return Math.round(v * 100) / 100;
}

/** Quantas inserções/dia cabem num orçamento (modo "por valor"). */
export function insercoesPorOrcamento(precoSegundo: number, orcamento: number, segundos: number, dias: number): number {
  const unit = precoSegundo * segundos * dias; // custo de 1 insercao/dia no periodo
  if (unit <= 0) return 0;
  return Math.floor(orcamento / unit);
}

/** Valida os parâmetros contra os mínimos. Retorna lista de erros (vazia = ok). */
export function validarPedido(cfg: SimuladorConfig, p: ParamsSimulacao): string[] {
  const erros: string[] = [];
  if (p.insercoes_dia < cfg.min_insercoes_dia) erros.push(`Mínimo de ${cfg.min_insercoes_dia} inserções/dia`);
  if (p.dias < cfg.min_dias) erros.push(`Mínimo de ${cfg.min_dias} dias`);
  const valor = calcularValor(cfg.preco_segundo, p);
  if (valor < cfg.min_valor) erros.push(`Valor mínimo do pedido é ${brl(cfg.min_valor)}`);
  if (![10, 15, 20, 30, 45, 60].includes(p.segundos) && !cfg.duracoes_seg.includes(p.segundos)) {
    erros.push(`Duração inválida (${p.segundos}s)`);
  }
  return erros;
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Parse do csv de durações ("10,15,20") -> number[]. */
export function parseDuracoes(csv: string | null | undefined): number[] {
  if (!csv) return [10, 15, 20, 30];
  const arr = csv.split(",").map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
  return arr.length ? arr : [10, 15, 20, 30];
}
