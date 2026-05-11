-- Migration 005: Slave support (VPS master + local Linux slave per restaurant)
-- Adiciona suporte a slaves locais por empresa

-- Campos na tabela empresas para gerenciar a slave key e status de sync
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slave_key  CHAR(64) UNIQUE;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slave_ativo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slave_ultimo_sync TIMESTAMPTZ;

-- Log de sincronizações
CREATE TABLE IF NOT EXISTS sync_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo         VARCHAR(20) NOT NULL,  -- 'pull' | 'push'
  status       VARCHAR(20) NOT NULL,  -- 'ok' | 'erro'
  detalhes     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_empresa ON sync_log(empresa_id, created_at DESC);

-- Pedidos: rastreamento de origem e deduplicação
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem       VARCHAR(10) NOT NULL DEFAULT 'vps';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS slave_uuid   VARCHAR(36) UNIQUE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS slave_synced_at TIMESTAMPTZ;

-- Index para deduplicação de pedidos do slave
CREATE INDEX IF NOT EXISTS idx_pedidos_slave_uuid ON pedidos(slave_uuid) WHERE slave_uuid IS NOT NULL;
