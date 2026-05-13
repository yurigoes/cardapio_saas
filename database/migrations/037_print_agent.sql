-- ─────────────────────────────────────────────────────────────────────────────
-- 037 — Agente de impressão local
-- ─────────────────────────────────────────────────────────────────────────────
-- Substitui popups de impressão por fila persistente.
-- Agente local (Node.js em cada loja) faz long-poll, busca jobs pendentes,
-- imprime via TCP direto na impressora térmica ESC/POS.
--
-- Topologia típica:
--   1 agente por loja (rodando na máquina do PDV/balcão)
--   N impressoras configuradas por agente (cozinha, bar, balcão, retirada)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── impressoras ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS impressoras (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome         VARCHAR(100) NOT NULL,
  setor        VARCHAR(20)  NOT NULL,
    -- 'cozinha' | 'bar' | 'balcao' | 'retirada' | 'caixa'
  tipo         VARCHAR(20)  NOT NULL DEFAULT 'tcp',
    -- 'tcp' (IP:porta — mais comum)
    -- 'usb' (futuro, requer agente com node-usb)
    -- 'system' (impressora padrão do SO no agente)
  ip           VARCHAR(45),
  porta        INTEGER      DEFAULT 9100,    -- ESC/POS padrão
  largura_cols INTEGER      DEFAULT 48,      -- 48 (80mm) ou 32 (58mm)
  ativa        BOOLEAN      NOT NULL DEFAULT true,
  ultimo_ping  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT impressoras_empresa_nome_uniq UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_impressoras_empresa ON impressoras (empresa_id, ativa);

-- ── print_agents (cada instância do agente local autenticada por key) ────────
CREATE TABLE IF NOT EXISTS print_agents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(100) NOT NULL,
  agent_key_hash VARCHAR(64) NOT NULL UNIQUE,    -- SHA-256
  prefix        VARCHAR(12)  NOT NULL,
  ativo         BOOLEAN      NOT NULL DEFAULT true,
  ultimo_ping   TIMESTAMPTZ,
  ultimo_ip     INET,
  versao        VARCHAR(20),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT print_agents_empresa_nome_uniq UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_print_agents_empresa ON print_agents (empresa_id, ativo);

-- ── print_jobs (fila de impressão) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_jobs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  impressora_id UUID         NOT NULL REFERENCES impressoras(id) ON DELETE CASCADE,
  pedido_id     UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo          VARCHAR(20)  NOT NULL,
    -- 'cupom' (cliente) | 'cozinha' | 'comanda' (mesa) | 'conta' | 'rejeicao'
  conteudo      TEXT         NOT NULL,           -- ESC/POS bytes em base64 OU texto plano
  formato       VARCHAR(10)  NOT NULL DEFAULT 'escpos',  -- 'escpos' | 'text'
  status        VARCHAR(20)  NOT NULL DEFAULT 'pendente',
    -- 'pendente' | 'processando' | 'sucesso' | 'erro'
  tentativas    INTEGER      NOT NULL DEFAULT 0,
  erro          TEXT,
  enviado_em    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expira_em     TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_pendentes
  ON print_jobs (empresa_id, status, created_at)
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_print_jobs_pedido ON print_jobs (pedido_id);
