-- 076_redes_filiais.sql
-- Suporte a REDES DE FILIAIS: uma rede tem N empresas (filiais)
-- - Cardápio compartilhado (produtos/categorias por rede_id)
-- - Caixa/pedidos/estoque por filial (mantém empresa_id)
-- - Fidelidade configurável (cross-filial ou isolada)
-- - Cobrança unificada na matriz com desconto progressivo
-- - Usuário pode operar qualquer filial da rede

CREATE TABLE IF NOT EXISTS redes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                     TEXT NOT NULL,
  cnpj_matriz              TEXT,
  razao_social             TEXT,
  logo_url                 TEXT,
  cor_primaria             TEXT DEFAULT '#10b981',
  cor_secundaria           TEXT,
  site                     TEXT,
  email_contato            TEXT,
  whatsapp                 TEXT,

  -- Configs operacionais
  fidelidade_cross_filial  BOOLEAN NOT NULL DEFAULT FALSE,
                            -- TRUE: cliente acumula pontos em qualquer filial
                            -- FALSE: pontos isolados por filial
  cardapio_sincronizado    BOOLEAN NOT NULL DEFAULT TRUE,
                            -- TRUE: produtos/categorias compartilhados
                            -- FALSE: cada filial tem o próprio (modo legado)

  -- Cobrança unificada
  plano_id                 UUID REFERENCES planos(id),
                            -- plano da rede inteira (sobrescreve plano por filial)
  desconto_progressivo_pct NUMERIC(5,2) DEFAULT 0,
                            -- ex: 30 = 30% off na 2ª filial em diante

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_redes_ativas ON redes(deleted_at) WHERE deleted_at IS NULL;

-- ─── Empresas: vínculo opcional com rede ────────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS rede_id       UUID REFERENCES redes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_matriz     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ordem_filial  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nome_filial   TEXT;
  -- nome_filial: ex "Pituba", "Itaigara" — usado pra distinguir filiais da MESMA rede

CREATE INDEX IF NOT EXISTS idx_empresas_rede ON empresas(rede_id) WHERE rede_id IS NOT NULL;
-- Garante 1 matriz por rede
CREATE UNIQUE INDEX IF NOT EXISTS uq_rede_matriz
  ON empresas(rede_id) WHERE is_matriz = TRUE;

-- ─── Usuários: vínculo com rede + filial padrão ─────────────────
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS rede_id          UUID REFERENCES redes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filial_padrao_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opera_todas_filiais BOOLEAN NOT NULL DEFAULT FALSE;
  -- opera_todas_filiais: se TRUE, usuário pode trocar de filial via dropdown.
  -- Dono da rede (admin/master) tem TRUE automático.

CREATE INDEX IF NOT EXISTS idx_usuarios_rede ON usuarios(rede_id) WHERE rede_id IS NOT NULL;

-- ─── Produtos/Categorias: compartilhados por rede ───────────────
-- Adicionamos rede_id mas mantemos empresa_id pra compat. Quando empresa.rede_id
-- não é null E rede.cardapio_sincronizado=true, as queries de cardápio
-- agregam por rede_id ao invés de empresa_id.
ALTER TABLE produtos    ADD COLUMN IF NOT EXISTS rede_id UUID REFERENCES redes(id) ON DELETE SET NULL;
ALTER TABLE categorias  ADD COLUMN IF NOT EXISTS rede_id UUID REFERENCES redes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_rede   ON produtos(rede_id)   WHERE rede_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categorias_rede ON categorias(rede_id) WHERE rede_id IS NOT NULL;

-- ─── Cliente: cross-filial opcional ─────────────────────────────
-- Mantém empresa_id mas adiciona rede_id. Quando rede.fidelidade_cross_filial=true,
-- pontos somam por rede_id (não por empresa_id).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS rede_id UUID REFERENCES redes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_rede ON clientes(rede_id) WHERE rede_id IS NOT NULL;

-- ─── Mensalidade unificada por rede ─────────────────────────────
-- Quando empresa pertence a uma rede, mensalidade é gerada pela MATRIZ,
-- agrupando todas filiais. mensalidades.rede_id != null indica isso.
ALTER TABLE mensalidades ADD COLUMN IF NOT EXISTS rede_id UUID REFERENCES redes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mensalidades_rede ON mensalidades(rede_id, mes_referencia DESC) WHERE rede_id IS NOT NULL;

-- ─── Audit: log de troca de filial pelo usuário ─────────────────
CREATE TABLE IF NOT EXISTS rede_audit_troca_filial (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  rede_id     UUID NOT NULL REFERENCES redes(id),
  empresa_de  UUID REFERENCES empresas(id),
  empresa_pra UUID NOT NULL REFERENCES empresas(id),
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rede_troca_user ON rede_audit_troca_filial(usuario_id, created_at DESC);
