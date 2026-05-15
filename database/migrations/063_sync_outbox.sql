-- 063_sync_outbox.sql
-- Infraestrutura pra retaguarda local offline-first sincronizar com VPS.
--
-- sync_outbox: eventos gerados localmente esperando push pra VPS
-- sync_inbox:  eventos vindos da VPS pra serem aplicados na retaguarda
--
-- Esta migration só cria as tabelas. Agente local de sync vem depois.

CREATE TABLE IF NOT EXISTS sync_outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  agente_id     UUID REFERENCES agentes(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL,        -- 'pedido_criado', 'pedido_atualizado', 'cliente_criado', etc
  entidade_id   UUID,                  -- ID do registro relacionado
  payload       JSONB NOT NULL,
  criado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  enviado_em    TIMESTAMP WITH TIME ZONE,
  ack_em        TIMESTAMP WITH TIME ZONE,
  tentativas    INT NOT NULL DEFAULT 0,
  erro          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_pendente
  ON sync_outbox(empresa_id, criado_em)
  WHERE enviado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_agente
  ON sync_outbox(agente_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS sync_inbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  agente_id     UUID REFERENCES agentes(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL,
  entidade_id   UUID,
  payload       JSONB NOT NULL,
  recebido_em   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  aplicado_em   TIMESTAMP WITH TIME ZONE,
  erro          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_inbox_pendente
  ON sync_inbox(empresa_id, recebido_em)
  WHERE aplicado_em IS NULL;

COMMENT ON TABLE sync_outbox IS
  'Eventos gerados localmente esperando push pra VPS. Padrão outbox pra evitar dual-write.';
COMMENT ON TABLE sync_inbox IS
  'Eventos vindos da VPS pra aplicar localmente. Permite replay idempotente.';
