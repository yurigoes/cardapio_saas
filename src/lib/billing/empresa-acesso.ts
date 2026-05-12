/**
 * Define a cláusula SQL canônica para "empresa que pode operar":
 *   - status = 'ativo' (assinante pagante)
 *   - OU status = 'teste' com trial_fim no futuro
 *
 * Usado em rotas públicas (totem, cardápio, criação de pedido público) para
 * que empresas em trial NÃO sejam tratadas como inexistentes.
 *
 * Cuidado: 'suspensa' e 'cancelada' continuam fora — empresa não opera.
 */
export const EMPRESA_OPERACIONAL_SQL =
  `(status = 'ativo' OR (status = 'teste' AND trial_fim IS NOT NULL AND trial_fim > NOW()))`;
