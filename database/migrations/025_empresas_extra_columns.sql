-- ─────────────────────────────────────────────────────────────────────────────
-- 025 — Garante todas as colunas em 'empresas' que o app espera
-- ─────────────────────────────────────────────────────────────────────────────
-- Sintetiza colunas adicionadas em diferentes migrations (007/009/010/014/015/016/019)
-- e que podem estar faltando em instalações antigas/parciais.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE empresas
  -- Identidade visual / cardápio
  ADD COLUMN IF NOT EXISTS tema                   VARCHAR(10)   DEFAULT 'dark'
    CHECK (tema IN ('dark','light')),
  ADD COLUMN IF NOT EXISTS logo_url               TEXT,
  ADD COLUMN IF NOT EXISTS banner_url             TEXT,
  ADD COLUMN IF NOT EXISTS descricao              TEXT,

  -- Funcionamento
  ADD COLUMN IF NOT EXISTS horario_abertura       TIME,
  ADD COLUMN IF NOT EXISTS horario_fechamento     TIME,
  ADD COLUMN IF NOT EXISTS dias_funcionamento     VARCHAR(50)   DEFAULT 'seg-dom',

  -- Pagamento
  ADD COLUMN IF NOT EXISTS aceita_dinheiro        BOOLEAN       DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_pix             BOOLEAN       DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_cartao          BOOLEAN       DEFAULT true,

  -- Delivery
  ADD COLUMN IF NOT EXISTS taxa_entrega           NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pedido_minimo          NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tempo_entrega_min      INTEGER,

  -- Fidelidade / Cashback
  ADD COLUMN IF NOT EXISTS pontos_por_real        NUMERIC(6,2)  DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS real_por_ponto         NUMERIC(6,4)  DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS fidelidade_ativo       BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS cashback_ativo         BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS cashback_percentual    NUMERIC(5,2)  DEFAULT 0,

  -- Caixa
  ADD COLUMN IF NOT EXISTS caixa_obrigatorio      BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS imprimir_cozinha_auto  BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS imprimir_cupom_auto    BOOLEAN       DEFAULT false,

  -- Totem
  ADD COLUMN IF NOT EXISTS totem_bg_video_url     TEXT,
  ADD COLUMN IF NOT EXISTS totem_bg_image_url     TEXT,
  ADD COLUMN IF NOT EXISTS totem_cta_text         TEXT,
  ADD COLUMN IF NOT EXISTS totem_slogan           TEXT,

  -- Integrações
  ADD COLUMN IF NOT EXISTS evolution_url          TEXT,
  ADD COLUMN IF NOT EXISTS evolution_key          TEXT,
  ADD COLUMN IF NOT EXISTS evolution_eventos      JSONB         DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS n8n_url                TEXT,
  ADD COLUMN IF NOT EXISTS n8n_token              TEXT,
  ADD COLUMN IF NOT EXISTS n8n_eventos            JSONB         DEFAULT '[]'::jsonb,

  -- PIX direto
  ADD COLUMN IF NOT EXISTS pix_tipo               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pix_chave              VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pix_favorecido         VARCHAR(255);

-- ── produtos: colunas que app/garcom espera mas legado pode não ter ──────────
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS imagem_url        TEXT,
  ADD COLUMN IF NOT EXISTS destaque          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tempo_preparo     INTEGER,
  ADD COLUMN IF NOT EXISTS tipo              VARCHAR(20) DEFAULT 'comida',
  ADD COLUMN IF NOT EXISTS pontos_fidelidade INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variacoes         JSONB       DEFAULT '{"grupos":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS preco_custo       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS estoque_atual     INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo    INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS controla_estoque  BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS disponivel        BOOLEAN     DEFAULT true;
