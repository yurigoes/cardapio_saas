-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007 — Clientes (fidelidade), Cupons, Config de empresa
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Colunas de personalização na tabela empresas ──────────────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS tema              VARCHAR(10)   DEFAULT 'dark'
    CHECK (tema IN ('dark','light')),
  ADD COLUMN IF NOT EXISTS logo_url          TEXT,
  ADD COLUMN IF NOT EXISTS banner_url        TEXT,
  ADD COLUMN IF NOT EXISTS descricao         TEXT,
  ADD COLUMN IF NOT EXISTS horario_abertura  TIME,
  ADD COLUMN IF NOT EXISTS horario_fechamento TIME,
  ADD COLUMN IF NOT EXISTS dias_funcionamento VARCHAR(50)  DEFAULT 'seg-dom',
  ADD COLUMN IF NOT EXISTS aceita_dinheiro   BOOLEAN       DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_pix        BOOLEAN       DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_cartao     BOOLEAN       DEFAULT true,
  ADD COLUMN IF NOT EXISTS taxa_entrega      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pedido_minimo     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tempo_entrega_min INTEGER,
  ADD COLUMN IF NOT EXISTS pontos_por_real   NUMERIC(6,2)  DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS real_por_ponto    NUMERIC(6,4)  DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS fidelidade_ativo  BOOLEAN       DEFAULT false;

-- ── Tabela de clientes (fidelidade / CRM) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome             VARCHAR(200),
  telefone         VARCHAR(20),
  cpf              VARCHAR(14),
  email            VARCHAR(255),
  pontos           INTEGER      NOT NULL DEFAULT 0,
  total_pedidos    INTEGER      NOT NULL DEFAULT 0,
  total_gasto      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ultimo_pedido_em TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_cpf
  ON clientes (empresa_id, cpf)
  WHERE cpf IS NOT NULL AND cpf <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_telefone
  ON clientes (empresa_id, telefone)
  WHERE telefone IS NOT NULL AND telefone <> '';

CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes (empresa_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_clientes_updated_at ON clientes;
CREATE TRIGGER tg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Tabela de cupons ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cupons (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo           VARCHAR(50)  NOT NULL,
  descricao        TEXT,
  tipo             VARCHAR(20)  NOT NULL DEFAULT 'percentual'
    CHECK (tipo IN ('percentual','fixo','frete_gratis')),
  valor            NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Regras de uso
  uso_maximo       INTEGER,         -- NULL = ilimitado
  uso_atual        INTEGER      NOT NULL DEFAULT 0,
  uso_por_cliente  INTEGER      DEFAULT 1,
  -- Restrições de valor
  valor_minimo_pedido NUMERIC(10,2),
  -- Validade
  valido_de        TIMESTAMPTZ  DEFAULT NOW(),
  valido_ate       TIMESTAMPTZ,
  -- Gerado por fidelidade (resgate de pontos)
  cliente_id       UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  pontos_resgatados INTEGER,
  -- Status
  ativo            BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cupom_empresa_codigo
  ON cupons (empresa_id, UPPER(codigo));

CREATE INDEX IF NOT EXISTS idx_cupons_empresa ON cupons (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cupons_cliente  ON cupons (cliente_id);

DROP TRIGGER IF EXISTS tg_cupons_updated_at ON cupons;
CREATE TRIGGER tg_cupons_updated_at
  BEFORE UPDATE ON cupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Tabela de uso de cupons (histórico) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS cupons_uso (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cupom_id    UUID        NOT NULL REFERENCES cupons(id) ON DELETE CASCADE,
  pedido_id   UUID        REFERENCES pedidos(id) ON DELETE SET NULL,
  cliente_id  UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  usado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cupons_uso_cupom   ON cupons_uso (cupom_id);
CREATE INDEX IF NOT EXISTS idx_cupons_uso_cliente ON cupons_uso (cliente_id);

-- ── Coluna cliente_id em pedidos ──────────────────────────────────────────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cliente_id   UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cupom_id     UUID REFERENCES cupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desconto     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pontos_ganhos INTEGER DEFAULT 0;

-- ── Coluna imagem_url na tabela produtos (garante existência) ─────────────────
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS imagem_url   TEXT,
  ADD COLUMN IF NOT EXISTS destaque     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tempo_preparo INTEGER;

-- ── Demo: imagens nos produtos ─────────────────────────────────────────────────
DO $$
DECLARE v_emp UUID := '00000000-0000-0001-0000-000000000001';
BEGIN
  -- Tenta pegar o ID real da empresa demo
  SELECT id INTO v_emp FROM empresas WHERE slug = 'demo' LIMIT 1;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=600&q=80',
    destaque = true, tempo_preparo = 10
  WHERE empresa_id = v_emp AND nome = 'Bruschetta' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&q=80',
    tempo_preparo = 15
  WHERE empresa_id = v_emp AND nome = 'Caldo de Feijão' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1625944525533-473f1a3d54e7?w=600&q=80',
    tempo_preparo = 12
  WHERE empresa_id = v_emp AND nome = 'Bolinho de Bacalhau' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80',
    destaque = true, tempo_preparo = 25
  WHERE empresa_id = v_emp AND nome = 'Filé à Parmegiana' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=600&q=80',
    tempo_preparo = 20
  WHERE empresa_id = v_emp AND nome = 'Frango Grelhado' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=600&q=80',
    destaque = true, tempo_preparo = 30
  WHERE empresa_id = v_emp AND nome = 'Moqueca de Camarão' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
    destaque = true, tempo_preparo = 35
  WHERE empresa_id = v_emp AND nome = 'Picanha na Brasa' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=80',
    tempo_preparo = 22
  WHERE empresa_id = v_emp AND nome = 'Risoto de Funghi' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=80',
    tempo_preparo = 2
  WHERE empresa_id = v_emp AND nome = 'Refrigerante' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?w=600&q=80',
    tempo_preparo = 5
  WHERE empresa_id = v_emp AND nome = 'Suco Natural' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&q=80',
    tempo_preparo = 2
  WHERE empresa_id = v_emp AND nome = 'Água Mineral' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80',
    tempo_preparo = 2
  WHERE empresa_id = v_emp AND nome = 'Cerveja Long Neck' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1582716401301-b2407dc7563d?w=600&q=80',
    tempo_preparo = 8
  WHERE empresa_id = v_emp AND nome = 'Pudim de Leite' AND imagem_url IS NULL;

  UPDATE produtos SET imagem_url = 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80',
    destaque = true, tempo_preparo = 12
  WHERE empresa_id = v_emp AND nome = 'Petit Gateau' AND imagem_url IS NULL;
END $$;
