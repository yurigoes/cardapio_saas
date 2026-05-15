-- 054_ifood_auto_aceite.sql
-- Auto-aceite de pedidos iFood + popup pendentes:
--   - ifood_config.auto_aceite — se true, importer chama /confirm automático
--   - pedidos.ifood_aceite_status — pendente | aceito | recusado | auto_aceito
--   - índices pra busca rápida do popup

ALTER TABLE ifood_config
  ADD COLUMN IF NOT EXISTS auto_aceite BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS ifood_aceite_status TEXT
    CHECK (ifood_aceite_status IN ('pendente', 'aceito', 'recusado', 'auto_aceito')),
  ADD COLUMN IF NOT EXISTS ifood_aceite_em TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ifood_aceite_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- Índice pra polling rápido do popup (pedidos iFood pendentes da empresa)
CREATE INDEX IF NOT EXISTS idx_pedidos_ifood_pendente
  ON pedidos(empresa_id, ifood_aceite_status)
  WHERE origem = 'ifood' AND ifood_aceite_status = 'pendente';
