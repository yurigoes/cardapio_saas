-- ═══════════════════════════════════════════════════════════════
--  Migration 041 — Infraestrutura do painel VPS
--
--  - vps_agents:       agentes locais que executam comandos no host
--                      (similar a print_agents)
--  - vps_diagnosticos: histórico de verificações (cron + manual)
--  - vps_alertas:      configuração de notificações (WhatsApp via Evolution)
--  - settings:         flags globais (modo manutenção, etc)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vps_agents (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(100) NOT NULL,
  agent_key_hash  CHAR(64)     NOT NULL UNIQUE,    -- SHA-256 da pak_xxx
  prefix          VARCHAR(12)  NOT NULL,
  ativo           BOOLEAN      NOT NULL DEFAULT true,
  ultimo_ping     TIMESTAMPTZ,
  ultimo_ip       INET,
  versao          VARCHAR(20),
  hostname        VARCHAR(100),
  -- Última coleta serializada
  ultimo_status   JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vps_agents_ping ON vps_agents (ultimo_ping DESC);

CREATE TABLE IF NOT EXISTS vps_diagnosticos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID         REFERENCES vps_agents(id) ON DELETE CASCADE,
  -- 'manual', 'agendado', 'pre_deploy', 'pos_deploy'
  origem          VARCHAR(20)  NOT NULL DEFAULT 'manual',
  -- 'ok', 'warn', 'erro'
  resultado       VARCHAR(20)  NOT NULL,
  duracao_ms      INTEGER,
  resumo          TEXT,
  -- detalhes completos do diagnóstico (disco, ram, docker, erros, etc)
  detalhes        JSONB,
  notificado      BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vps_diag_recent ON vps_diagnosticos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vps_diag_warns  ON vps_diagnosticos (resultado, created_at DESC) WHERE resultado != 'ok';

CREATE TABLE IF NOT EXISTS vps_alertas_config (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp        VARCHAR(20),                       -- número destino
  ativo           BOOLEAN      NOT NULL DEFAULT false,
  -- ['cron_diario', 'erro_critico', 'disco_cheio', 'deploy_falhou']
  eventos         JSONB        NOT NULL DEFAULT '["erro_critico","disco_cheio","deploy_falhou"]'::jsonb,
  evolution_instance VARCHAR(100),                   -- nome da instância na evolution
  ultimo_envio    TIMESTAMPTZ,
  ultimo_status   VARCHAR(20),                       -- 'ok' ou 'falha'
  ultimo_erro     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Configurações globais (key/value JSONB)
CREATE TABLE IF NOT EXISTS settings (
  chave           VARCHAR(100) PRIMARY KEY,
  valor           JSONB        NOT NULL,
  descricao       TEXT,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by      UUID         REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Flag inicial: modo manutenção desligado
INSERT INTO settings (chave, valor, descricao)
SELECT 'manutencao', '{"ativo":false,"mensagem":"Sistema em manutenção. Voltamos em breve.","janela_inicio":null,"janela_fim":null}'::jsonb,
       'Modo manutenção — bloqueia /api/pedidos/POST e mostra aviso na UI'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE chave = 'manutencao');
