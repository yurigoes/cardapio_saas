-- 066_permissoes_overrides.sql
-- 1) Permite chamados sem empresa (suporte interno do SaaS pode abrir)
-- 2) Tabela de overrides de permissões por role ou usuário individual

-- empresa_id agora é nullable em chamados (master/suporte podem abrir
-- chamados internos sem vínculo a empresa)
ALTER TABLE suporte_chamados
  ALTER COLUMN empresa_id DROP NOT NULL;

-- Overrides de permissão
-- escopo='role'  + escopo_id=nome_da_role  → muda permissões da role inteira
-- escopo='user'  + escopo_id=uuid_user     → override só pra esse usuário
CREATE TABLE IF NOT EXISTS permissoes_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo        TEXT NOT NULL CHECK (escopo IN ('role','user')),
  escopo_id     TEXT NOT NULL,                -- nome da role OU UUID do usuário
  permissao     TEXT NOT NULL,                 -- ex: 'pedido:cancelar', 'admin:tudo'
  acao          TEXT NOT NULL CHECK (acao IN ('allow','deny')),
  motivo        TEXT,
  criado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (escopo, escopo_id, permissao)
);

CREATE INDEX IF NOT EXISTS idx_perm_overrides_lookup
  ON permissoes_overrides(escopo, escopo_id);
