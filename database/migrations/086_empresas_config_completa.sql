-- 086_empresas_config_completa.sql
-- Garante TODAS as colunas usadas em /api/painel/config (GET e PATCH).
-- Idempotente — IF NOT EXISTS em tudo. Se uma coluna não existir, o
-- SELECT do GET quebra com erro 500 genérico.
-- Roda em qualquer ambiente, mesmo já tendo a maioria das colunas.

ALTER TABLE empresas
  -- Identidade
  ADD COLUMN IF NOT EXISTS razao_social_full       TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_estadual      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS inscricao_municipal     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS regime_tributario       VARCHAR(40),
  -- Endereço
  ADD COLUMN IF NOT EXISTS endereco_cep            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS endereco_logradouro     TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS endereco_complemento    TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS endereco_cidade         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS endereco_uf             VARCHAR(2),
  -- Gestor
  ADD COLUMN IF NOT EXISTS gestor_nome             VARCHAR(120),
  ADD COLUMN IF NOT EXISTS gestor_cpf              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gestor_rg               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gestor_telefone         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gestor_email            VARCHAR(255),
  -- Cadastro (validação master)
  ADD COLUMN IF NOT EXISTS cadastro_status         VARCHAR(20) DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS cadastro_motivo_rejeicao TEXT,
  -- Visual
  ADD COLUMN IF NOT EXISTS tema                    VARCHAR(20) DEFAULT 'escuro',
  ADD COLUMN IF NOT EXISTS banner_url              TEXT,
  ADD COLUMN IF NOT EXISTS descricao               TEXT,
  -- Operação
  ADD COLUMN IF NOT EXISTS dias_funcionamento      JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aceita_dinheiro         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aceita_pix              BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aceita_cartao           BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS imprimir_cozinha_auto   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS imprimir_cupom_auto     BOOLEAN DEFAULT FALSE,
  -- Fidelidade + cashback
  ADD COLUMN IF NOT EXISTS fidelidade_ativo        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pontos_por_real         NUMERIC(8,4) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS real_por_ponto          NUMERIC(8,4) DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS cashback_ativo          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cashback_percentual     NUMERIC(5,2) DEFAULT 0,
  -- Totem
  ADD COLUMN IF NOT EXISTS totem_bg_video_url      TEXT,
  ADD COLUMN IF NOT EXISTS totem_bg_image_url      TEXT,
  ADD COLUMN IF NOT EXISTS totem_cta_text          TEXT,
  ADD COLUMN IF NOT EXISTS totem_slogan            TEXT,
  ADD COLUMN IF NOT EXISTS totem_logo_url          TEXT,
  ADD COLUMN IF NOT EXISTS totem_cor_destaque      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS totem_promo_texto       TEXT,
  ADD COLUMN IF NOT EXISTS totem_pos_destaque      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS totem_atendimento       TEXT,
  ADD COLUMN IF NOT EXISTS totem_tema              VARCHAR(20) DEFAULT 'escuro',
  ADD COLUMN IF NOT EXISTS totem_aceita_dinheiro   BOOLEAN DEFAULT FALSE,
  -- Delivery
  ADD COLUMN IF NOT EXISTS delivery_aceita_fora_zona BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS taxa_entrega            NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pedido_minimo           NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tempo_entrega_min       INTEGER,
  -- Integrações
  ADD COLUMN IF NOT EXISTS evolution_url           TEXT,
  ADD COLUMN IF NOT EXISTS evolution_key           TEXT,
  ADD COLUMN IF NOT EXISTS evolution_eventos       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS n8n_url                 TEXT,
  ADD COLUMN IF NOT EXISTS n8n_token               TEXT,
  ADD COLUMN IF NOT EXISTS n8n_eventos             JSONB DEFAULT '[]'::jsonb,
  -- Sistema
  ADD COLUMN IF NOT EXISTS modulos_ativos          JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status                  VARCHAR(20) DEFAULT 'ativo';
