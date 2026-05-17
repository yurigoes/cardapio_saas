-- 070_cadastro_completo_planos.sql
-- ─────────────────────────────────────────────────────────────────
-- Cadastro completo da empresa (endereço estruturado + responsável legal),
-- anexos de documentos, contratos clickwrap, módulos à la carte / extras,
-- e flag pra exibir como parceiro no site institucional.
-- ─────────────────────────────────────────────────────────────────

-- ─── Empresa: dados cadastrais completos ───────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS razao_social_full     TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_estadual    TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_municipal   TEXT,
  ADD COLUMN IF NOT EXISTS regime_tributario     TEXT,           -- mei|simples|lucro_presumido|lucro_real
  -- Endereço estruturado
  ADD COLUMN IF NOT EXISTS endereco_cep          VARCHAR(9),
  ADD COLUMN IF NOT EXISTS endereco_logradouro   TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS endereco_complemento  TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro       TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade       TEXT,
  ADD COLUMN IF NOT EXISTS endereco_uf           VARCHAR(2),
  -- Responsável legal (gestor)
  ADD COLUMN IF NOT EXISTS gestor_nome           TEXT,
  ADD COLUMN IF NOT EXISTS gestor_cpf            VARCHAR(14),
  ADD COLUMN IF NOT EXISTS gestor_rg             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gestor_telefone       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gestor_email          TEXT,
  -- Validação cadastral (revisão pelo suporte/financeiro)
  ADD COLUMN IF NOT EXISTS cadastro_status       TEXT DEFAULT 'pendente',  -- pendente|em_analise|aprovado|rejeitado
  ADD COLUMN IF NOT EXISTS cadastro_aprovado_por UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS cadastro_aprovado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cadastro_motivo_rejeicao TEXT,
  -- Site institucional
  ADD COLUMN IF NOT EXISTS exibir_como_parceiro  BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_empresas_cadastro_status ON empresas(cadastro_status);

-- ─── Anexos de documentos ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresa_documentos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,  -- cnpj|identidade_frente|identidade_verso|selfie_com_documento|contrato_social|comprovante_endereco|outro
  nome_arquivo TEXT NOT NULL,
  url          TEXT NOT NULL,
  tamanho      INT,
  mime         TEXT,
  validado     BOOLEAN DEFAULT FALSE,
  validado_por UUID REFERENCES usuarios(id),
  validado_em  TIMESTAMPTZ,
  observacao   TEXT,
  uploaded_by  UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empdoc_empresa ON empresa_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empdoc_tipo    ON empresa_documentos(empresa_id, tipo);

-- ─── Contratos (clickwrap: aceite no painel com IP/timestamp/hash) ──
CREATE TABLE IF NOT EXISTS contrato_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  versao        TEXT UNIQUE NOT NULL,
  titulo        TEXT NOT NULL,
  conteudo_html TEXT NOT NULL,
  ativo         BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empresa_contratos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  template_id           UUID REFERENCES contrato_templates(id),
  versao                TEXT NOT NULL,
  conteudo_html         TEXT NOT NULL,            -- snapshot do que foi aceito
  conteudo_hash         TEXT NOT NULL,            -- sha256 hex do conteudo_html
  pdf_url               TEXT,                     -- URL pro PDF gerado (opcional)
  aceito                BOOLEAN DEFAULT FALSE,
  aceito_em             TIMESTAMPTZ,
  aceito_por_usuario_id UUID REFERENCES usuarios(id),
  aceito_por_nome       TEXT,
  aceito_por_cpf        TEXT,
  aceito_ip             INET,
  aceito_user_agent     TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empcont_empresa ON empresa_contratos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empcont_aceito  ON empresa_contratos(empresa_id, aceito);

-- ─── Planos: à la carte ────────────────────────────────────────
-- Estrutura: [{"id":"whatsapp","nome":"WhatsApp avulso","preco":30,"descricao":"..."}]
ALTER TABLE planos
  ADD COLUMN IF NOT EXISTS modulos_alacarte JSONB DEFAULT '[]'::jsonb;

-- ─── Módulos extras ativados por empresa (além dos do plano) ───
CREATE TABLE IF NOT EXISTS empresa_modulos_extras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modulo        TEXT NOT NULL,
  tipo          TEXT NOT NULL,                 -- experimental | alacarte | gratuito
  preco         NUMERIC(10,2) DEFAULT 0,
  expira_em     TIMESTAMPTZ,                   -- NULL = sem expiração (gratuito permanente)
  cobranca_id   UUID,                          -- referência opcional a mensalidades
  bloqueado     BOOLEAN DEFAULT FALSE,         -- TRUE se à la carte e venceu 24h sem pagar
  observacao    TEXT,
  criado_por    UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, modulo)
);
CREATE INDEX IF NOT EXISTS idx_emex_empresa ON empresa_modulos_extras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emex_expira  ON empresa_modulos_extras(expira_em) WHERE expira_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emex_tipo    ON empresa_modulos_extras(empresa_id, tipo);

-- ─── Template de contrato inicial (você edita depois em /admin/contratos) ──
INSERT INTO contrato_templates (versao, titulo, conteudo_html, ativo)
VALUES (
  'v1.0-2026-05',
  'Contrato de Prestação de Serviços — Three Digital SaaS',
  '<h1>Contrato de Prestação de Serviços</h1>
   <p><strong>CONTRATADA:</strong> Three Digital Soluções em Tecnologia</p>
   <p><strong>CONTRATANTE:</strong> {{razao_social}} — CNPJ {{cnpj}}</p>
   <h2>1. Objeto</h2>
   <p>A CONTRATADA fornecerá acesso ao sistema SaaS de gestão de cardápios e
      pedidos, hospedado em infraestrutura própria, conforme plano contratado.</p>
   <h2>2. Vigência</h2>
   <p>O contrato vigora por prazo indeterminado a partir do aceite eletrônico,
      podendo ser rescindido por qualquer parte mediante aviso prévio de 30 dias.</p>
   <h2>3. Pagamento</h2>
   <p>Mensalidade conforme plano + módulos à la carte ativados. Vencimento
      no mesmo dia do mês do aceite. Atraso superior a 24h em módulos à la
      carte bloqueia automaticamente a funcionalidade.</p>
   <h2>4. LGPD</h2>
   <p>A CONTRATADA atua como operadora dos dados pessoais conforme Lei 13.709/18.
      Política de privacidade disponível em /privacidade.</p>
   <h2>5. SLA</h2>
   <p>Disponibilidade alvo: 99,5% / mês. Suporte por chat e email das 8h às 22h
      todos os dias.</p>
   <p><em>Ao marcar "Li e aceito", o CONTRATANTE confirma ter lido e concordado
      com todos os termos acima. Registro auditável de IP, data/hora e hash do
      documento aceito ficará armazenado em nossos servidores.</em></p>',
  TRUE
)
ON CONFLICT (versao) DO NOTHING;
