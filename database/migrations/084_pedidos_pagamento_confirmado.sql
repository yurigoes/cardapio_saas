-- 084_pedidos_pagamento_confirmado.sql
-- Marca quando o pagamento foi confirmado (caixa apertou "Confirmar").
-- Usado pra:
--  - Idempotência: chamada repetida não reimprime cozinha/cliente
--  - Auditoria: tempo entre pedido e confirmação de pagamento

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pagamento_confirmado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pedidos_pagto_pendente
  ON pedidos(empresa_id, created_at DESC)
  WHERE pagamento_confirmado_em IS NULL
    AND forma_pagamento = 'cartao_caixa'
    AND deleted_at IS NULL;

COMMENT ON COLUMN pedidos.pagamento_confirmado_em IS
  'Quando operador no caixa marcou que recebeu o pagamento. NULL pra pedidos '
  'que ainda não foram pagos (típico: cartao_caixa aguardando). Filtros de '
  'pedidos pendentes de pagamento usam esse campo.';
