-- 061_suporte_acessos.sql
-- Sistema de acesso ao módulo Suporte:
--   - Master cria acesso pra uma empresa específica com duração
--     (24h, 30d, 90d, sempre)
--   - Sistema gera chave única sup_xxxxxx (mostrada UMA vez ao master,
--     que envia pra empresa)
--   - Empresa cola chave em /painel/suporte pra desbloquear conteúdo
--   - Se duração='sempre', empresa pode trocar a chave por senha pessoal
--   - Master pode revogar a qualquer momento

CREATE TABLE IF NOT EXISTS suporte_acessos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

  -- Chave de acesso (sha256 hashed)
  chave_hash      TEXT NOT NULL,
  chave_prefix    TEXT NOT NULL,        -- "sup_xxxxxx" pra mostrar no painel

  -- Duração / expiração
  duracao         TEXT NOT NULL CHECK (duracao IN ('24h', '30d', '90d', 'sempre')),
  liberado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  liberado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  expira_em       TIMESTAMP WITH TIME ZONE,    -- NULL = sempre

  -- Personalização (só pra duração='sempre')
  personalizado   BOOLEAN NOT NULL DEFAULT FALSE,
  personalizado_em TIMESTAMP WITH TIME ZONE,

  -- Revogação
  revogado_em     TIMESTAMP WITH TIME ZONE,
  revogado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_revogacao TEXT,

  -- Telemetria de uso
  ultimo_uso      TIMESTAMP WITH TIME ZONE,
  ultimo_uso_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  acessos_count   INT NOT NULL DEFAULT 0,

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Apenas 1 acesso ativo por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_suporte_acessos_empresa_ativo
  ON suporte_acessos(empresa_id)
  WHERE revogado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_suporte_acessos_chave_hash
  ON suporte_acessos(chave_hash)
  WHERE revogado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_suporte_acessos_expira
  ON suporte_acessos(expira_em)
  WHERE revogado_em IS NULL AND expira_em IS NOT NULL;

COMMENT ON TABLE suporte_acessos IS
  'Controle de acesso ao módulo Suporte. Master gera chaves; empresa desbloqueia.';
COMMENT ON COLUMN suporte_acessos.duracao IS
  'Janela de validade. Sempre = expira_em NULL.';
COMMENT ON COLUMN suporte_acessos.personalizado IS
  'True se a empresa trocou a chave inicial por senha pessoal (só vale pra duracao=sempre).';
