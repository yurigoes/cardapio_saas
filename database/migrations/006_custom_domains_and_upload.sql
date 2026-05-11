-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006 — Domínios personalizados + upload + impressão
-- ─────────────────────────────────────────────────────────────────────────────

-- Domínio personalizado por empresa (fluxo: pendente → aprovado/rejeitado)
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS dominio_proprio   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dominio_status    VARCHAR(20)  DEFAULT 'pendente'
    CHECK (dominio_status IN ('pendente','aprovado','rejeitado')),
  ADD COLUMN IF NOT EXISTS dominio_ssl_ok    BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url          TEXT;

-- Índice único para domínio próprio aprovado
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_dominio
  ON empresas (dominio_proprio)
  WHERE dominio_proprio IS NOT NULL AND dominio_status = 'aprovado';

-- Tabela de uploads de imagens (auditoría)
CREATE TABLE IF NOT EXISTS uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  object_name  TEXT NOT NULL,
  url          TEXT NOT NULL,
  mime_type    VARCHAR(100),
  size_bytes   INTEGER,
  referencia   VARCHAR(100),  -- 'produto', 'empresa', 'categoria'
  referencia_id UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_empresa ON uploads (empresa_id);

-- Coluna impresso_em em pedidos (para controle de impressão no slave)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS impresso_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS impresso_por    VARCHAR(100);  -- 'slave', 'manual', etc.

-- Número sequencial do pedido por empresa
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS numero INTEGER;

-- Gera número sequencial para pedidos existentes (se não tiver)
DO $$
DECLARE
  rec RECORD;
  seq INTEGER;
BEGIN
  FOR rec IN SELECT DISTINCT empresa_id FROM pedidos WHERE numero IS NULL LOOP
    seq := 1;
    FOR rec2 IN
      SELECT id FROM pedidos
      WHERE empresa_id = rec.empresa_id AND numero IS NULL
      ORDER BY created_at
    LOOP
      UPDATE pedidos SET numero = seq WHERE id = rec2.id;
      seq := seq + 1;
    END LOOP;
  END LOOP;
END$$;

-- Trigger: auto-incrementa numero do pedido por empresa
CREATE OR REPLACE FUNCTION pedido_auto_numero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(numero), 0) + 1
      INTO NEW.numero
      FROM pedidos
     WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_pedido_auto_numero ON pedidos;
CREATE TRIGGER tg_pedido_auto_numero
  BEFORE INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION pedido_auto_numero();

-- Schema do N8N (criado separado para não conflitar)
CREATE SCHEMA IF NOT EXISTS n8n;
