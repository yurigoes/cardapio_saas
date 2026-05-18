-- 081_retaguardas.sql
-- Tabela de retaguardas registradas.
-- Cada retaguarda manda heartbeat a cada 60s pro master saber se está viva.

CREATE TABLE IF NOT EXISTS retaguardas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retaguarda_id UUID NOT NULL UNIQUE,           -- ID gerado no setup.sh
  empresa_id    UUID REFERENCES empresas(id) ON DELETE CASCADE,
  empresa_slug  TEXT NOT NULL,                  -- redundante mas útil pra debug
  dominio       TEXT,                           -- ex: loja1.tthreedigital.com.br
  ip_publico    INET,                           -- inferido do request
  versao        TEXT,                           -- futuro: versão do nginx/retaguarda
  ativo         BOOLEAN DEFAULT TRUE,
  primeira_vez  TIMESTAMPTZ DEFAULT NOW(),
  ultimo_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  metricas      JSONB DEFAULT '{}'::jsonb,      -- cache hit, etc (futuro)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retaguardas_empresa
  ON retaguardas(empresa_id) WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_retaguardas_heartbeat
  ON retaguardas(ultimo_heartbeat DESC) WHERE ativo = TRUE;

COMMENT ON TABLE retaguardas IS
  'Mini-PCs rodando reverse-proxy/cache nas lojas dos clientes. ' ||
  'Reduz acessos simultâneos ao master servindo cardápio + imagens localmente.';
