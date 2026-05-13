-- ─────────────────────────────────────────────────────────────────────────────
-- 030 — Vales (crediário) + caixa detalhado por forma de pagamento
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite cliente/funcionário cadastrado comprar a prazo. Empresa autoriza
-- limite individual em clientes.limite_vale; vale aberto consome o limite;
-- quitação devolve.
--
-- Caixa: agora suporta valores informados/esperados por forma de pagamento
-- em JSONB para fechamento detalhado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── clientes.limite_vale ─────────────────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS limite_vale         NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_vale_aberto   NUMERIC(10,2) NOT NULL DEFAULT 0;
  -- saldo_vale_aberto é denormalized: SUM(vales.valor - valor_quitado WHERE status<>'quitado')

-- ── vales (crediário) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vales (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id      UUID         NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  pedido_id       UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  valor           NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  valor_quitado   NUMERIC(10,2) NOT NULL DEFAULT 0,

  status          VARCHAR(20)  NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'parcial', 'quitado', 'cancelado')),

  data_vencimento TIMESTAMPTZ,
  observacoes     TEXT,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vales_empresa ON vales (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_vales_cliente ON vales (cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_vales_pedido  ON vales (pedido_id);
CREATE INDEX IF NOT EXISTS idx_vales_aberto
  ON vales (empresa_id, created_at DESC)
  WHERE status IN ('aberto', 'parcial');

-- ── vale_quitacoes (histórico de pagamentos) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS vale_quitacoes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id         UUID         NOT NULL REFERENCES vales(id) ON DELETE CASCADE,
  empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id       UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,

  valor           NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  forma_pagamento VARCHAR(20)  NOT NULL,    -- pix | dinheiro | credito | debito | outro
  observacoes     TEXT,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vale_quit_vale    ON vale_quitacoes (vale_id);
CREATE INDEX IF NOT EXISTS idx_vale_quit_empresa ON vale_quitacoes (empresa_id, created_at DESC);

-- ── caixas: fechamento detalhado por forma ──────────────────────────────────
ALTER TABLE caixas
  ADD COLUMN IF NOT EXISTS valores_esperados JSONB,
    -- ex: {"pix": 250, "dinheiro": 100, "credito": 380, "debito": 90, "vale": 50}
  ADD COLUMN IF NOT EXISTS valores_informados JSONB,
  ADD COLUMN IF NOT EXISTS diferencas_por_forma JSONB;

-- ── trigger: mantém clientes.saldo_vale_aberto sincronizado ──────────────────
-- Recalcula sempre que vale ou quitação muda. Robusto contra inconsistência.
CREATE OR REPLACE FUNCTION recalcular_saldo_vale_cliente() RETURNS TRIGGER AS $$
DECLARE
  cliente UUID;
BEGIN
  cliente := COALESCE(NEW.cliente_id, OLD.cliente_id);
  IF cliente IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE clientes c SET
    saldo_vale_aberto = COALESCE((
      SELECT SUM(v.valor - v.valor_quitado)
        FROM vales v
       WHERE v.cliente_id = c.id
         AND v.status IN ('aberto', 'parcial')
    ), 0)
  WHERE c.id = cliente;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_vales_recalc_saldo ON vales;
CREATE TRIGGER tg_vales_recalc_saldo
  AFTER INSERT OR UPDATE OR DELETE ON vales
  FOR EACH ROW EXECUTE FUNCTION recalcular_saldo_vale_cliente();
