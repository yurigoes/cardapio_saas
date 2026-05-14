-- ═══════════════════════════════════════════════════════════════
--  Migration 043 — kiosk tokens + flag de envio de aniversário
-- ═══════════════════════════════════════════════════════════════

-- Tokens de kiosk (cozinha/tv/delivery sem login, por slug + token)
CREATE TABLE IF NOT EXISTS kiosk_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- 'cozinha' | 'tv' | 'delivery' | 'totem'
  tipo        VARCHAR(20)  NOT NULL,
  token_hash  CHAR(64)     NOT NULL UNIQUE,
  prefix      VARCHAR(12)  NOT NULL,
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  ultimo_uso  TIMESTAMPTZ,
  ultimo_ip   INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  -- 1 token por (empresa, tipo) ativo simultaneamente
  UNIQUE (empresa_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_lookup ON kiosk_tokens (empresa_id, tipo, ativo);

-- Aniversários — registra envios pra não duplicar
CREATE TABLE IF NOT EXISTS aniversario_envios (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id  UUID         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  ano         INTEGER      NOT NULL,
  enviado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resultado   VARCHAR(20)  NOT NULL,    -- 'sucesso', 'erro'
  erro        TEXT,
  -- 1 envio por cliente por ano
  UNIQUE (cliente_id, ano)
);

CREATE INDEX IF NOT EXISTS idx_aniversario_recent ON aniversario_envios (created_at DESC) WHERE created_at IS NOT NULL;

-- Mala direta — campanhas
CREATE TABLE IF NOT EXISTS mala_direta_campanhas (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(100) NOT NULL,
  canal         VARCHAR(20)  NOT NULL DEFAULT 'whatsapp', -- 'whatsapp', 'email'
  -- Filtro de público (JSON: { cidade?, ranking?, ultima_compra_dias? })
  filtro        JSONB        DEFAULT '{}'::jsonb,
  mensagem      TEXT         NOT NULL,
  -- 'rascunho' | 'agendada' | 'enviando' | 'concluida' | 'cancelada'
  status        VARCHAR(20)  NOT NULL DEFAULT 'rascunho',
  agendada_para TIMESTAMPTZ,
  -- Delays (em segundos) entre cada envio — randomizado entre min/max
  delay_min_seg INTEGER      NOT NULL DEFAULT 5,
  delay_max_seg INTEGER      NOT NULL DEFAULT 30,
  -- Stats
  total_alvo    INTEGER      DEFAULT 0,
  total_enviado INTEGER      DEFAULT 0,
  total_falha   INTEGER      DEFAULT 0,
  iniciada_em   TIMESTAMPTZ,
  concluida_em  TIMESTAMPTZ,
  created_by    UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mala_direta_status ON mala_direta_campanhas (empresa_id, status);
