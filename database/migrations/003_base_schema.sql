-- ─────────────────────────────────────────────────────────────────────────────
-- 003 — Schema base completo (bootstrap definitivo)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cria TODAS as tabelas core com TODAS as colunas usadas pelo código.
-- Reflete o estado pós-migrations 004-031 em uma instalação completa.
-- 100% idempotente: CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ── planos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(100) NOT NULL,
  descricao       TEXT,
  preco           NUMERIC(10,2) DEFAULT 0,
  preco_mensal    NUMERIC(10,2) DEFAULT 0,
  periodo         VARCHAR(20)  DEFAULT 'mensal',
  modulos         JSONB        DEFAULT '[]'::jsonb,
  recursos_json   JSONB        DEFAULT '{}'::jsonb,
  limites         JSONB        DEFAULT '{}'::jsonb,
  limite_empresas INTEGER,
  ativo           BOOLEAN      DEFAULT true,
  destaque        BOOLEAN      DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── empresas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fantasia   VARCHAR(255)  NOT NULL,
  razao_social    VARCHAR(255),
  cnpj            VARCHAR(20),
  slug            VARCHAR(100)  NOT NULL UNIQUE,
  subdominio      VARCHAR(100),
  status          VARCHAR(20)   NOT NULL DEFAULT 'teste',
  whatsapp        VARCHAR(20),
  telefone        VARCHAR(20),
  email           VARCHAR(255),
  descricao       TEXT,
  cor_primaria    VARCHAR(20)   DEFAULT '#10B981',
  cor_secundaria  VARCHAR(20)   DEFAULT '#0F172A',
  tema            VARCHAR(10)   DEFAULT 'dark',
  logo_url        TEXT,
  banner_url      TEXT,
  horario_abertura  TIME,
  horario_fechamento TIME,
  dias_funcionamento VARCHAR(50) DEFAULT 'seg-dom',
  aceita_dinheiro BOOLEAN       DEFAULT true,
  aceita_pix      BOOLEAN       DEFAULT true,
  aceita_cartao   BOOLEAN       DEFAULT true,
  caixa_obrigatorio BOOLEAN     DEFAULT false,
  imprimir_cozinha_auto BOOLEAN DEFAULT false,
  imprimir_cupom_auto   BOOLEAN DEFAULT false,
  taxa_entrega    NUMERIC(10,2) DEFAULT 0,
  pedido_minimo   NUMERIC(10,2) DEFAULT 0,
  tempo_entrega_min INTEGER,
  fidelidade_ativo  BOOLEAN     DEFAULT false,
  pontos_por_real   NUMERIC(6,2) DEFAULT 1.0,
  real_por_ponto    NUMERIC(6,4) DEFAULT 0.01,
  cashback_ativo    BOOLEAN     DEFAULT false,
  cashback_percentual NUMERIC(5,2) DEFAULT 0,
  totem_bg_video_url TEXT,
  totem_bg_image_url TEXT,
  totem_cta_text  TEXT,
  totem_slogan    TEXT,
  evolution_url   TEXT,
  evolution_key   TEXT,
  evolution_eventos JSONB       DEFAULT '[]'::jsonb,
  n8n_url         TEXT,
  n8n_token       TEXT,
  n8n_eventos     JSONB         DEFAULT '[]'::jsonb,
  modulos_ativos  JSONB         NOT NULL DEFAULT '["cardapio_digital","mesa","balcao","delivery","cozinha_kds","garcom","financeiro","relatorios_basicos","crm","cupom","whatsapp","pix","impressoras","notificacoes","autoatendimento_qrcode"]'::jsonb,
  plano_id        UUID          REFERENCES planos(id) ON DELETE SET NULL,
  assinatura_expira_em TIMESTAMPTZ,
  pix_tipo        VARCHAR(20),
  pix_chave       VARCHAR(255),
  pix_favorecido  VARCHAR(255),
  slave_key       VARCHAR(255),
  slave_ativo     BOOLEAN       DEFAULT false,
  slave_uuid      UUID,
  slave_ultimo_sync TIMESTAMPTZ,
  endereco_lat    NUMERIC(10,7),
  endereco_lng    NUMERIC(10,7),
  trial_inicio    TIMESTAMPTZ,
  trial_fim       TIMESTAMPTZ,
  trial_dias      INTEGER       DEFAULT 14,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_empresas_slug   ON empresas(slug);
CREATE INDEX IF NOT EXISTS idx_empresas_status ON empresas(status) WHERE deleted_at IS NULL;

-- ── usuarios ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(255)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  senha_hash      VARCHAR(255)  NOT NULL,
  role            VARCHAR(30)   NOT NULL,
  empresa_id      UUID          REFERENCES empresas(id) ON DELETE CASCADE,
  telefone        VARCHAR(20),
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  ultimo_login    TIMESTAMPTZ,
  tentativas_login INTEGER      NOT NULL DEFAULT 0,
  bloqueado_ate   TIMESTAMPTZ,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_usuarios_email   ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id) WHERE deleted_at IS NULL;

-- ── sessoes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessoes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  refresh_token   TEXT         NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  expires_at      TIMESTAMPTZ  NOT NULL,
  revogado_em     TIMESTAMPTZ,
  ultimo_acesso   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessoes_refresh ON sessoes (refresh_token) WHERE revogado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);

-- ── categorias ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        VARCHAR(100)  NOT NULL,
  descricao   TEXT,
  imagem_url  TEXT,
  ordem       INTEGER       NOT NULL DEFAULT 0,
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  disponivel  BOOLEAN       NOT NULL DEFAULT true,
  pontos_fidelidade INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias(empresa_id) WHERE deleted_at IS NULL;

-- ── produtos ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id  UUID          REFERENCES categorias(id) ON DELETE SET NULL,
  nome          VARCHAR(255)  NOT NULL,
  descricao     TEXT,
  preco         NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_custo   NUMERIC(10,2),
  imagem_url    TEXT,
  tipo          VARCHAR(20)   DEFAULT 'comida',
  destaque      BOOLEAN       DEFAULT false,
  disponivel    BOOLEAN       NOT NULL DEFAULT true,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  tempo_preparo INTEGER,
  pontos_fidelidade INTEGER   DEFAULT 0,
  variacoes     JSONB         DEFAULT '{"grupos":[]}'::jsonb,
  controla_estoque BOOLEAN    DEFAULT false,
  estoque_atual INTEGER       DEFAULT 0,
  estoque_minimo INTEGER      DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa   ON produtos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id);

-- ── mesas ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesas (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero      INTEGER       NOT NULL,
  nome        VARCHAR(50),
  capacidade  INTEGER       DEFAULT 4,
  setor       VARCHAR(100),
  status      VARCHAR(20)   NOT NULL DEFAULT 'livre',
  qrcode_url  TEXT,
  pedido_ativo_id UUID,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT mesas_empresa_numero_uniq UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_mesas_empresa ON mesas(empresa_id) WHERE deleted_at IS NULL;

-- ── pedidos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero          SERIAL,
  tipo            VARCHAR(20)   NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pendente',
  mesa_id         UUID          REFERENCES mesas(id) ON DELETE SET NULL,
  comanda         VARCHAR(50),
  cliente_id      UUID,
  cliente_nome    VARCHAR(255),
  cliente_telefone VARCHAR(20),
  cliente_endereco JSONB,
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto        NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxa_entrega    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  pontos_ganhos   INTEGER       DEFAULT 0,
  observacoes     TEXT,
  forma_pagamento VARCHAR(50),
  tipo_consumo    VARCHAR(20)   DEFAULT 'local',
  cupom_id        UUID,
  motoboy_id      UUID,
  zona_id         UUID,
  status_entrega  VARCHAR(20),
  atribuido_em    TIMESTAMPTZ,
  aceito_em       TIMESTAMPTZ,
  preparando_em   TIMESTAMPTZ,
  pronto_em       TIMESTAMPTZ,
  coletado_em     TIMESTAMPTZ,
  entregue_em     TIMESTAMPTZ,
  cancelado_em    TIMESTAMPTZ,
  cancelado_motivo TEXT,
  reaberto_em     TIMESTAMPTZ,
  reaberto_motivo TEXT,
  tracking_token  VARCHAR(40),
  valor_motoboy   NUMERIC(10,2) DEFAULT 0,
  impresso_em     TIMESTAMPTZ,
  impresso_por    VARCHAR(50),
  origem          VARCHAR(50),
  origem_id       VARCHAR(255),
  slave_uuid      UUID,
  slave_synced_at TIMESTAMPTZ,
  usuario_id      UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  atendente_id    UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa  ON pedidos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_status   ON pedidos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa     ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_motoboy  ON pedidos(motoboy_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_tracking_unique
  ON pedidos(tracking_token) WHERE tracking_token IS NOT NULL;

-- ── pedido_itens ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_itens (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id      UUID          REFERENCES produtos(id) ON DELETE SET NULL,
  nome            VARCHAR(255)  NOT NULL,
  preco_unitario  NUMERIC(10,2) NOT NULL,
  quantidade      INTEGER       NOT NULL DEFAULT 1,
  subtotal        NUMERIC(10,2) NOT NULL,
  observacoes     TEXT,
  adicionais      JSONB         DEFAULT '[]'::jsonb,
  complementos    JSONB         DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id);

-- ── pedido_pagamentos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_pagamentos (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id   UUID          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  forma       VARCHAR(20)   NOT NULL,
  valor       NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  troco_para  NUMERIC(10,2),
  observacoes TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedpag_pedido  ON pedido_pagamentos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedpag_empresa ON pedido_pagamentos(empresa_id);

-- ── motoboys ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS motoboys (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(100) NOT NULL,
  telefone      VARCHAR(20),
  veiculo       VARCHAR(50),
  placa         VARCHAR(10),
  status        VARCHAR(20)  DEFAULT 'disponivel',
  ativo         BOOLEAN      DEFAULT true,
  usuario_id    UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  lat_atual     NUMERIC(10,7),
  lng_atual     NUMERIC(10,7),
  localizado_em TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_motoboys_empresa ON motoboys(empresa_id);
CREATE INDEX IF NOT EXISTS idx_motoboys_usuario ON motoboys(usuario_id) WHERE usuario_id IS NOT NULL;

-- ── motoboy_localizacoes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS motoboy_localizacoes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id  UUID         NOT NULL REFERENCES motoboys(id) ON DELETE CASCADE,
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id   UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  lat         NUMERIC(10,7) NOT NULL,
  lng         NUMERIC(10,7) NOT NULL,
  precisao_m  NUMERIC(8,2),
  velocidade  NUMERIC(6,2),
  bateria     NUMERIC(5,2),
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loc_motoboy_data ON motoboy_localizacoes(motoboy_id, criado_em DESC);

-- ── zonas_entrega ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zonas_entrega (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          VARCHAR(100) NOT NULL,
  descricao     TEXT,
  bairro        VARCHAR(100),
  cep_inicio    VARCHAR(8),
  cep_fim       VARCHAR(8),
  taxa          NUMERIC(10,2) DEFAULT 0,
  valor_cobrado NUMERIC(10,2) DEFAULT 0,
  valor_motoboy NUMERIC(10,2) DEFAULT 0,
  tempo_min     INTEGER,
  ativo         BOOLEAN      DEFAULT true,
  ordem         INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── gateways_config ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gateways_config (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  slug            VARCHAR(50)   NOT NULL,
  nome            VARCHAR(100),
  ambiente        VARCHAR(20)   DEFAULT 'producao',
  ativo           BOOLEAN       NOT NULL DEFAULT false,
  padrao          BOOLEAN       NOT NULL DEFAULT false,
  client_id       TEXT,
  client_secret   TEXT,
  api_key         TEXT,
  token           TEXT,
  merchant_id     TEXT,
  webhook_url     TEXT,
  webhook_secret  TEXT,
  configuracoes   JSONB         DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT gateways_empresa_slug_uniq UNIQUE (empresa_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_gateways_empresa ON gateways_config(empresa_id) WHERE deleted_at IS NULL;

-- ── pagamentos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagamentos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id     UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  gateway_slug  VARCHAR(50)  NOT NULL,
  gateway_id    VARCHAR(255) NOT NULL,
  metodo        VARCHAR(30)  NOT NULL DEFAULT 'pix',
  status        VARCHAR(30)  NOT NULL DEFAULT 'pendente',
  valor         NUMERIC(10,2) NOT NULL,
  gateway_data  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT pagamentos_gateway_unique UNIQUE (gateway_slug, gateway_id)
);
CREATE INDEX IF NOT EXISTS idx_pagamentos_empresa ON pagamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pedido  ON pagamentos(pedido_id);

-- ── clientes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome              VARCHAR(200),
  email             VARCHAR(255),
  telefone          VARCHAR(20),
  cpf               VARCHAR(14),
  endereco          JSONB,
  pontos            INTEGER       DEFAULT 0,
  total_pedidos     INTEGER       DEFAULT 0,
  total_gasto       NUMERIC(12,2) DEFAULT 0,
  saldo_cashback    NUMERIC(10,2) NOT NULL DEFAULT 0,
  limite_vale       NUMERIC(10,2) NOT NULL DEFAULT 0,
  saldo_vale_aberto NUMERIC(10,2) NOT NULL DEFAULT 0,
  ultimo_pedido_em  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_cpf
  ON clientes(empresa_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_telefone
  ON clientes(empresa_id, telefone) WHERE telefone IS NOT NULL;

-- ── cupons ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cupons (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo              VARCHAR(50)   NOT NULL,
  descricao           TEXT,
  tipo                VARCHAR(20)   NOT NULL,
  valor               NUMERIC(10,2) NOT NULL DEFAULT 0,
  uso_maximo          INTEGER,
  uso_atual           INTEGER       NOT NULL DEFAULT 0,
  uso_por_cliente     INTEGER,
  valor_minimo_pedido NUMERIC(10,2),
  valido_de           TIMESTAMPTZ,
  valido_ate          TIMESTAMPTZ,
  ativo               BOOLEAN       NOT NULL DEFAULT true,
  cliente_id          UUID          REFERENCES clientes(id) ON DELETE CASCADE,
  pontos_resgatados   INTEGER,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT cupons_empresa_codigo_uniq UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_cupons_empresa ON cupons(empresa_id);

-- ── cupons_uso ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cupons_uso (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cupom_id    UUID         NOT NULL REFERENCES cupons(id) ON DELETE CASCADE,
  pedido_id   UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  cliente_id  UUID         REFERENCES clientes(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── caixas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS caixas (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'aberto',
  valor_abertura         NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_esperado         NUMERIC(10,2),
  valor_fechamento       NUMERIC(10,2),
  diferenca              NUMERIC(10,2),
  valores_esperados      JSONB,
  valores_informados     JSONB,
  diferencas_por_forma   JSONB,
  observacoes            TEXT,
  observacoes_fechamento TEXT,
  usuario_abertura_id    UUID         REFERENCES usuarios(id) ON DELETE RESTRICT,
  usuario_fechamento_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  aberto_em              TIMESTAMPTZ  DEFAULT NOW(),
  fechado_em             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_aberto_unique
  ON caixas(empresa_id) WHERE status = 'aberto';
CREATE INDEX IF NOT EXISTS idx_caixas_empresa ON caixas(empresa_id);

-- ── caixa_movimentos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id        UUID          REFERENCES caixas(id) ON DELETE CASCADE,
  empresa_id      UUID          REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id      UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_id       UUID          REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo            VARCHAR(20)   NOT NULL,
  forma_pagamento VARCHAR(30),
  valor           NUMERIC(10,2) NOT NULL,
  descricao       TEXT,
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_caixa   ON caixa_movimentos(caixa_id);
CREATE INDEX IF NOT EXISTS idx_caixa_mov_empresa ON caixa_movimentos(empresa_id);

-- ── estoque_movimentos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  produto_id       UUID         NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  pedido_id        UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id       UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo             VARCHAR(20)  NOT NULL,
  quantidade       INTEGER      NOT NULL,
  estoque_anterior INTEGER,
  estoque_atual    INTEGER,
  motivo           TEXT,
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_empresa ON estoque_movimentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto ON estoque_movimentos(produto_id);

-- ── cashback_movimentos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashback_movimentos (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id     UUID         NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pedido_id      UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo           VARCHAR(20)  NOT NULL,
  valor          NUMERIC(10,2) NOT NULL,
  saldo_anterior NUMERIC(10,2),
  saldo_atual    NUMERIC(10,2),
  motivo         TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cashback_mov_cliente ON cashback_movimentos(cliente_id);

-- ── vales ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vales (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id      UUID         NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  pedido_id       UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  valor           NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  valor_quitado   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20)  NOT NULL DEFAULT 'aberto',
  data_vencimento TIMESTAMPTZ,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vales_empresa ON vales(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_vales_cliente ON vales(cliente_id);

-- ── vale_quitacoes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vale_quitacoes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id         UUID         NOT NULL REFERENCES vales(id) ON DELETE CASCADE,
  empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id       UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id      UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  valor           NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  valor_quitado   NUMERIC(10,2),
  data_quitacao   TIMESTAMPTZ  DEFAULT NOW(),
  forma_pagamento VARCHAR(20),
  observacoes     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── push_subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID         REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    TEXT         NOT NULL,
  p256dh      TEXT         NOT NULL,
  auth        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_empresa ON push_subscriptions(empresa_id);

-- ── webhook_log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_log (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         REFERENCES empresas(id) ON DELETE SET NULL,
  gateway_slug VARCHAR(50)  NOT NULL,
  evento       VARCHAR(100),
  recurso_id   VARCHAR(255),
  pedido_id    UUID         REFERENCES pedidos(id) ON DELETE SET NULL,
  resultado    VARCHAR(30),
  http_status  INTEGER,
  mensagem     TEXT,
  payload      JSONB,
  headers      JSONB,
  duracao_ms   INTEGER,
  ip_origem    INET,
  recebido_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_empresa ON webhook_log(empresa_id, recebido_em DESC);

-- ── chamados_painel ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chamados_painel (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pedido_id    UUID         REFERENCES pedidos(id) ON DELETE CASCADE,
  numero       INTEGER,
  cliente_nome VARCHAR(255),
  balcao       VARCHAR(50),
  status       VARCHAR(20)  NOT NULL DEFAULT 'aberto',
  chamado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE chamados_painel
  ADD COLUMN IF NOT EXISTS status     VARCHAR(20)  NOT NULL DEFAULT 'aberto',
  ADD COLUMN IF NOT EXISTS chamado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_chamados_empresa ON chamados_painel(empresa_id, created_at DESC);

-- ── mensagens_template ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensagens_template (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  evento      VARCHAR(50)  NOT NULL,
  texto       TEXT         NOT NULL,
  titulo      VARCHAR(200),
  corpo       TEXT,
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT mensagens_template_empresa_evento_unique UNIQUE (empresa_id, evento)
);

-- ── audit_log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID,
  usuario_id       UUID,
  acao             VARCHAR(100) NOT NULL,
  recurso          VARCHAR(100),
  recurso_id       UUID,
  dados_anteriores JSONB,
  dados_antes      JSONB,
  dados_novos      JSONB,
  ip_address       INET,
  ip_origem        INET,
  user_agent       TEXT,
  duracao_ms       INTEGER,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_empresa ON audit_log(empresa_id, created_at DESC);

-- ── security_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        VARCHAR(50)  NOT NULL,
  ip_address  INET,
  ip_origem   INET,
  usuario_id  UUID,
  empresa_id  UUID,
  user_agent  TEXT,
  detalhes    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── rate_limit_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id          BIGSERIAL    PRIMARY KEY,
  chave       VARCHAR(255) NOT NULL,
  ip_origem   INET,
  rota        VARCHAR(255),
  bloqueado   BOOLEAN      DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── uploads ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  url         TEXT         NOT NULL,
  tipo        VARCHAR(50),
  hash        VARCHAR(255),
  metadata    JSONB        DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── dominios_customizados ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dominios_customizados (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  dominio      VARCHAR(255) NOT NULL UNIQUE,
  verificado   BOOLEAN      DEFAULT false,
  ssl_ativo    BOOLEAN      DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── sync_log (slave/master sync) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  tipo          VARCHAR(50),
  direcao       VARCHAR(20),
  registros     INTEGER,
  sucesso       BOOLEAN,
  erro          TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── motoboy fk para pedidos (depois de motoboys existir) ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_motoboy_id_fkey'
  ) THEN
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_motoboy_id_fkey
      FOREIGN KEY (motoboy_id) REFERENCES motoboys(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── cliente fk para pedidos ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_cliente_id_fkey'
  ) THEN
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── triggers updated_at ──────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN VALUES ('empresas'),('usuarios'),('categorias'),('produtos'),
                  ('mesas'),('pedidos'),('motoboys'),('clientes'),
                  ('cupons'),('caixas'),('zonas_entrega'),('gateways_config'),
                  ('vales'),('mensagens_template'),('pagamentos'),
                  ('push_subscriptions'),('dominios_customizados'),('planos')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_%I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER tg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
