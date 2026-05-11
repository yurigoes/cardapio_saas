-- Migration 008 — Totem customization, Delivery, Estoque

-- ── Totem customization fields on empresas ─────────────────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS totem_bg_video_url TEXT,
  ADD COLUMN IF NOT EXISTS totem_bg_image_url TEXT,
  ADD COLUMN IF NOT EXISTS totem_cta_text      VARCHAR(100) DEFAULT 'Toque para fazer seu pedido',
  ADD COLUMN IF NOT EXISTS totem_slogan        VARCHAR(200);

-- ── Stock control on produtos ──────────────────────────────────────────────
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS estoque_atual    INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estoque_minimo  INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS controla_estoque BOOLEAN DEFAULT false;

-- ── Motoboys (delivery riders) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS motoboys (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(200) NOT NULL,
  telefone    VARCHAR(20),
  veiculo     VARCHAR(100),
  placa       VARCHAR(10),
  status      VARCHAR(20)  NOT NULL DEFAULT 'disponivel'
    CHECK (status IN ('disponivel','em_rota','inativo')),
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motoboys_empresa ON motoboys(empresa_id);

-- ── Delivery zones ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zonas_entrega (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  taxa        NUMERIC(8,2) NOT NULL DEFAULT 0,
  tempo_min   INTEGER,
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zonas_empresa ON zonas_entrega(empresa_id);

-- ── Link motoboy to delivery pedido ───────────────────────────────────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS motoboy_id   UUID REFERENCES motoboys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zona_id      UUID REFERENCES zonas_entrega(id) ON DELETE SET NULL;
