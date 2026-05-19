-- 085_pedidos_ifood_homolog.sql
-- Campos exigidos pra homologação iFood:
--   * Cenário 1 — Pedido agendado: agendado_para
--   * Cenário 1 — Voucher: valor_voucher + voucher_codigo (já temos desconto, mas separar pra cupom claro)
--   * Cenário 5 — Dinheiro com troco: troco_para
--   * Cenário 5 — CPF/CNPJ do cliente: cliente_documento
--   * Cenário 5 — Observações do cliente: cliente_observacoes (separado de obs internas)
--   * iFood cancelamento: ifood_codigo_cancelamento + ifood_motivo_cancelamento

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS agendado_para           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS troco_para              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cliente_documento       VARCHAR(20),     -- CPF/CNPJ
  ADD COLUMN IF NOT EXISTS cliente_observacoes     TEXT,            -- comments do cliente (≠ observacoes internas)
  ADD COLUMN IF NOT EXISTS valor_voucher           NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voucher_codigo          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ifood_codigo_cancelamento TEXT,
  ADD COLUMN IF NOT EXISTS ifood_motivo_cancelamento TEXT;

-- Índice pra dashboard de pedidos agendados pendentes
CREATE INDEX IF NOT EXISTS idx_pedidos_agendados
  ON pedidos(empresa_id, agendado_para)
  WHERE agendado_para IS NOT NULL AND deleted_at IS NULL
    AND status NOT IN ('entregue', 'cancelado');

COMMENT ON COLUMN pedidos.agendado_para IS
  'Pedido agendado pra esse horário. iFood manda em orderTiming=SCHEDULED + scheduledDateTime. ' ||
  'NULL = pedido imediato.';

COMMENT ON COLUMN pedidos.troco_para IS
  'Valor pelo qual o cliente vai pagar em dinheiro (pra calcular troco). ' ||
  'Ex: total R$45, cliente paga com R$50, troco_para=50.00.';

COMMENT ON COLUMN pedidos.cliente_documento IS
  'CPF (11 dígitos) ou CNPJ (14) do cliente, sem máscara. iFood manda em ' ||
  'customer.documentNumber ou taxPayerIdentificationNumber.';

COMMENT ON COLUMN pedidos.cliente_observacoes IS
  'Notas/comentários adicionais do cliente sobre o pedido. Vem de iFood.comments. ' ||
  'É diferente de "observacoes" que pode ser nota interna do operador.';

COMMENT ON COLUMN pedidos.valor_voucher IS
  'Valor do voucher iFood aplicado (incluído em desconto total). ' ||
  'Ex: voucher de R$10 → valor_voucher=10.';

COMMENT ON COLUMN pedidos.voucher_codigo IS
  'Código do voucher iFood. Ex: VOUCHER_ENTGRATIS.';
