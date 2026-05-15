-- 057_agentes_heartbeat.sql
-- Tabela "agentes" — registra todas as máquinas conectadas ao SaaS:
--   - retaguarda local (mini-PC do balcão, source-of-truth offline)
--   - terminais (PDV/caixa Windows, escritório)
--   - kiosk/totem (auto-atendimento)
--   - tv (painel TV cozinha)
--   - garcom (tablet/celular do garçom)
--   - impressora (impressora de rede com agente próprio)
--
-- Cada agente:
--   - tem token único (sha256 hashed) gerado no registro
--   - bate heartbeat a cada N segundos pra dizer "estou vivo"
--   - cron compara ultimo_heartbeat com NOW() e marca offline se atrasou
--   - alertado_em previne spam de notificação ao restaurante

CREATE TABLE IF NOT EXISTS agentes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Identificação
  agente_id         TEXT NOT NULL,        -- ID estável da máquina (UUID gerado no install)
  tipo              TEXT NOT NULL CHECK (tipo IN
                      ('retaguarda', 'terminal', 'kiosk', 'tv', 'garcom', 'impressora', 'outro')),
  nome              TEXT NOT NULL,         -- Nome amigável definido pelo usuário ("PDV Caixa 1")

  -- Auth (token único, armazenado hashed)
  token_hash        TEXT NOT NULL,         -- sha256 do token de auth
  token_prefix      TEXT NOT NULL,         -- 8 primeiros chars (pra UI mostrar "rdt_a3f2...")

  -- Telemetria
  hostname          TEXT,
  ip_ultimo         INET,
  plataforma        TEXT,                  -- linux, windows, android, ios, web
  versao            TEXT,                  -- versão do agente/app
  user_agent        TEXT,
  metadados         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Heartbeat
  registrado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  primeiro_hb_em    TIMESTAMP WITH TIME ZONE,   -- quando bateu o primeiro heartbeat real
  ultimo_hb_em      TIMESTAMP WITH TIME ZONE,
  ultimo_pedido_em  TIMESTAMP WITH TIME ZONE,   -- última atividade significativa (opcional)
  fila_pendente     INT NOT NULL DEFAULT 0,     -- itens aguardando sync

  -- Status / alertas
  status            TEXT NOT NULL DEFAULT 'aguardando'
                    CHECK (status IN ('aguardando', 'online', 'offline', 'desativado')),
  alertado_em       TIMESTAMP WITH TIME ZONE,   -- última vez que disparou alerta de offline
  alertas_count     INT NOT NULL DEFAULT 0,

  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMP WITH TIME ZONE,

  CONSTRAINT agentes_unique_per_empresa UNIQUE (empresa_id, agente_id)
);

CREATE INDEX IF NOT EXISTS idx_agentes_empresa
  ON agentes(empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agentes_status_hb
  ON agentes(status, ultimo_hb_em) WHERE ativo = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agentes_token_hash
  ON agentes(token_hash) WHERE ativo = true AND deleted_at IS NULL;

-- Tabela de eventos opcional pra histórico (fica enxuta, retenção 30d)
CREATE TABLE IF NOT EXISTS agentes_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id    UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,        -- 'online','offline','alertado','registrado','desativado'
  detalhes     JSONB,
  criado_em    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentes_eventos_agente
  ON agentes_eventos(agente_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_agentes_eventos_empresa
  ON agentes_eventos(empresa_id, criado_em DESC);
