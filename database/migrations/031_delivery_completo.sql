-- ─────────────────────────────────────────────────────────────────────────────
-- 031 — Delivery profissional: zonas, atribuição motoboy, status, rastreamento
-- ─────────────────────────────────────────────────────────────────────────────
-- Reaproveita zonas_entrega legada (criada na 008) e estende.
-- Inclui rastreamento por geolocation (GPS do celular do motoboy via PWA).
-- 100% gratuito: usa OpenStreetMap (Leaflet) no frontend, sem chave de API.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── zonas_entrega: estende com bairro, CEP range, valor_motoboy ──────────────
ALTER TABLE zonas_entrega
  ADD COLUMN IF NOT EXISTS bairro          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cep_inicio      VARCHAR(8),       -- só dígitos
  ADD COLUMN IF NOT EXISTS cep_fim         VARCHAR(8),
  ADD COLUMN IF NOT EXISTS valor_cobrado   NUMERIC(10,2),    -- alias canônico de 'taxa'
  ADD COLUMN IF NOT EXISTS valor_motoboy   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ordem           INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW();

-- Backfill: copia 'taxa' (legado) para 'valor_cobrado' onde estiver vazio
UPDATE zonas_entrega
   SET valor_cobrado = COALESCE(taxa, 0)
 WHERE valor_cobrado IS NULL;

CREATE INDEX IF NOT EXISTS idx_zonas_cep
  ON zonas_entrega (empresa_id, cep_inicio, cep_fim);
CREATE INDEX IF NOT EXISTS idx_zonas_bairro
  ON zonas_entrega (empresa_id, lower(bairro));

-- ── pedidos: campos de delivery ──────────────────────────────────────────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS zona_id          UUID REFERENCES zonas_entrega(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_entrega   VARCHAR(20),
    -- aguardando | atribuido | coletado | em_rota | entregue | cancelado
  ADD COLUMN IF NOT EXISTS atribuido_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coletado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregue_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_token   VARCHAR(40),
  ADD COLUMN IF NOT EXISTS valor_motoboy    NUMERIC(10,2) DEFAULT 0;

-- UNIQUE no token (permite NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pedidos_tracking_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_pedidos_tracking_unique
      ON pedidos (tracking_token)
      WHERE tracking_token IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_motoboy_status
  ON pedidos (motoboy_id, status_entrega)
  WHERE motoboy_id IS NOT NULL;

-- ── motoboys: localização atual + ativo + login ──────────────────────────────
ALTER TABLE motoboys
  ADD COLUMN IF NOT EXISTS lat_atual       NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng_atual       NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS localizado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ativo           BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_motoboys_usuario
  ON motoboys (usuario_id) WHERE usuario_id IS NOT NULL;

-- ── motoboy_localizacoes (histórico de pings) ────────────────────────────────
CREATE TABLE IF NOT EXISTS motoboy_localizacoes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id  UUID         NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id   UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  lat         NUMERIC(10,7) NOT NULL,
  lng         NUMERIC(10,7) NOT NULL,
  precisao_m  NUMERIC(8,2),
  velocidade  NUMERIC(6,2),       -- km/h opcional
  bateria     NUMERIC(5,2),       -- % opcional
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_motoboy_data
  ON motoboy_localizacoes (motoboy_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_loc_pedido
  ON motoboy_localizacoes (pedido_id, criado_em DESC)
  WHERE pedido_id IS NOT NULL;

-- ── Endereço da empresa (origem das entregas, para mostrar no mapa) ─────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS endereco_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS endereco_lng NUMERIC(10,7);
