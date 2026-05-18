-- 080_transferencias_estoque.sql
-- Transferências de produtos entre filiais de uma mesma rede.

CREATE TABLE IF NOT EXISTS transferencias_estoque (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rede_id       UUID NOT NULL REFERENCES redes(id) ON DELETE CASCADE,
  filial_origem UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  filial_destino UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id    UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade    NUMERIC(12,3) NOT NULL CHECK (quantidade > 0),
  motivo        TEXT,
  status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','em_transito','recebido','cancelado')),
  -- Audit
  criado_por    UUID REFERENCES usuarios(id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em    TIMESTAMPTZ,
  recebido_em   TIMESTAMPTZ,
  recebido_por  UUID REFERENCES usuarios(id),
  cancelado_em  TIMESTAMPTZ,
  observacao    TEXT
);
CREATE INDEX IF NOT EXISTS idx_transferencias_rede   ON transferencias_estoque(rede_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_transferencias_orig   ON transferencias_estoque(filial_origem, status);
CREATE INDEX IF NOT EXISTS idx_transferencias_dest   ON transferencias_estoque(filial_destino, status);
