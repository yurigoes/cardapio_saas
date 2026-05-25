/**
 * Pool Postgres + bootstrap do schema do SaaS de mídia indoor.
 *
 * Tabelas:
 *   midia_contas       — clientes (empresa que assina)
 *   midia_assinaturas  — vínculo conta ↔ plano ↔ status pagamento
 *   midia_telas        — mapeia tela do cliente ↔ display do Xibo
 *   midia_leads        — leads da landing (já existia da etapa anterior)
 *
 * Reusa o mesmo Postgres da VPS (DATABASE_URL). Cria tudo on-boot.
 */
import { Pool } from "pg";

let _pool: Pool | null = null;
export function db(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurado");
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  }
  return _pool;
}

let _bootstrapped = false;
export async function ensureSchema(): Promise<void> {
  if (_bootstrapped) return;
  const p = db();
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_contas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      empresa       TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      senha_hash    TEXT NOT NULL,
      whatsapp      TEXT,
      cidade        TEXT,
      status        TEXT NOT NULL DEFAULT 'pendente',  -- pendente|ativo|suspenso|cancelado
      -- IDs provisionados no Xibo
      xibo_folder_id        INTEGER,
      xibo_display_group_id INTEGER,
      provisionado_em       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS midia_assinaturas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id      UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      plano         TEXT NOT NULL,         -- essencial|profissional|rede
      preco_tela    NUMERIC(10,2) NOT NULL,
      qtd_telas     INTEGER NOT NULL DEFAULT 1,
      status        TEXT NOT NULL DEFAULT 'pendente', -- pendente|ativa|inadimplente|cancelada
      gateway       TEXT,                  -- mercadopago
      gateway_ref   TEXT,                  -- preapproval_id / subscription id
      ativada_em    TIMESTAMPTZ,
      proximo_venc  DATE,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_assin_conta ON midia_assinaturas(conta_id);

    CREATE TABLE IF NOT EXISTS midia_telas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id      UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      nome          TEXT NOT NULL,         -- ex: "Frente da loja"
      xibo_display_id INTEGER,             -- preenchido ao parear
      codigo_pareamento TEXT,              -- código que o player mostra
      status        TEXT DEFAULT 'aguardando', -- aguardando|ativa
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_telas_conta ON midia_telas(conta_id);

    -- Planos (gerenciáveis pelo master). Seed inicial vem do lib/planos.ts.
    CREATE TABLE IF NOT EXISTS midia_planos (
      id            TEXT PRIMARY KEY,      -- slug: essencial|profissional|rede|...
      nome          TEXT NOT NULL,
      preco         NUMERIC(10,2) NOT NULL,-- R$/tela/mês
      telas_label   TEXT NOT NULL DEFAULT '',
      destaque      BOOLEAN NOT NULL DEFAULT false,
      recursos      JSONB NOT NULL DEFAULT '[]',
      ativo         BOOLEAN NOT NULL DEFAULT true,
      ordem         INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Admins do SaaS (dono/master + suporte).
    CREATE TABLE IF NOT EXISTS midia_admins (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      senha_hash    TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'master',  -- master|suporte
      ativo         BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Modelos de contrato (HTML com placeholders {{...}}).
    CREATE TABLE IF NOT EXISTS midia_contrato_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo        TEXT NOT NULL,
      conteudo_html TEXT NOT NULL,
      versao        INTEGER NOT NULL DEFAULT 1,
      ativo         BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Contratos gerados por conta (snapshot + clickwrap).
    CREATE TABLE IF NOT EXISTS midia_conta_contratos (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id      UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      template_id   UUID REFERENCES midia_contrato_templates(id) ON DELETE SET NULL,
      titulo        TEXT NOT NULL,
      conteudo_html TEXT NOT NULL,         -- snapshot renderizado
      conteudo_hash TEXT NOT NULL,         -- SHA256 do snapshot
      aceito        BOOLEAN NOT NULL DEFAULT false,
      aceito_em     TIMESTAMPTZ,
      aceito_ip     TEXT,
      aceito_nome   TEXT,
      criado_em     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_contratos_conta ON midia_conta_contratos(conta_id);

    -- ═══ DOOH (rede de anúncios) ═══════════════════════════════════════════
    -- Locais = inventário da Three (cada ponto = 1 display group no Xibo).
    CREATE TABLE IF NOT EXISTS midia_locais (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      cidade        TEXT,
      endereco      TEXT,
      descricao     TEXT,
      foto_url      TEXT,
      largura       INTEGER NOT NULL DEFAULT 1080,   -- resolução das telas do local
      altura        INTEGER NOT NULL DEFAULT 1920,   -- (default retrato)
      xibo_display_group_id INTEGER,                 -- grupo no Xibo
      ativo         BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Pacotes de venda (modelos de campanha).
    CREATE TABLE IF NOT EXISTS midia_pacotes (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      tipo          TEXT NOT NULL DEFAULT 'video',   -- video|banner_estatico|banner_eletronico|peca
      dias          INTEGER NOT NULL,
      insercoes_dia INTEGER NOT NULL,
      segundos      INTEGER NOT NULL DEFAULT 10,
      preco         NUMERIC(10,2) NOT NULL DEFAULT 0,
      ativo         BOOLEAN NOT NULL DEFAULT true,
      ordem         INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Campanhas vendidas a anunciantes (midia_contas).
    CREATE TABLE IF NOT EXISTS midia_campanhas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id      UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      pacote_id     UUID REFERENCES midia_pacotes(id) ON DELETE SET NULL,
      nome          TEXT NOT NULL,
      tipo          TEXT NOT NULL DEFAULT 'video',
      dias          INTEGER NOT NULL,
      insercoes_dia INTEGER NOT NULL,
      segundos      INTEGER NOT NULL DEFAULT 10,
      data_inicio   DATE,
      data_fim      DATE,
      valor         NUMERIC(10,2) NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'rascunho',   -- rascunho|aguardando_arte|no_ar|pausada|encerrada
      status_pagamento TEXT NOT NULL DEFAULT 'pendente',-- pendente|pago|isento
      -- Xibo refs (preenchidos ao lançar)
      xibo_media_id    INTEGER,
      xibo_layout_id   INTEGER,
      xibo_campaign_id INTEGER,
      arte_nome     TEXT,
      lancada_em    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_camp_conta ON midia_campanhas(conta_id);

    -- Locais de cada campanha (N:N).
    CREATE TABLE IF NOT EXISTS midia_campanha_locais (
      campanha_id   UUID NOT NULL REFERENCES midia_campanhas(id) ON DELETE CASCADE,
      local_id      UUID NOT NULL REFERENCES midia_locais(id) ON DELETE CASCADE,
      PRIMARY KEY (campanha_id, local_id)
    );

    -- Chamados de suporte (anunciante ↔ Three).
    CREATE TABLE IF NOT EXISTS midia_chamados (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id      UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      assunto       TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'aberto',  -- aberto|respondido|fechado
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_chamados_conta ON midia_chamados(conta_id);

    CREATE TABLE IF NOT EXISTS midia_chamado_msgs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chamado_id    UUID NOT NULL REFERENCES midia_chamados(id) ON DELETE CASCADE,
      autor         TEXT NOT NULL,        -- cliente|suporte
      mensagem      TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_chamado_msgs ON midia_chamado_msgs(chamado_id);

    -- Pagamentos de campanha (MP Checkout Pro / pagamento único).
    CREATE TABLE IF NOT EXISTS midia_pagamentos (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campanha_id   UUID NOT NULL REFERENCES midia_campanhas(id) ON DELETE CASCADE,
      valor         NUMERIC(10,2) NOT NULL,
      gateway_ref   TEXT,                 -- preference id / payment id
      init_point    TEXT,                 -- link de checkout
      status        TEXT NOT NULL DEFAULT 'pendente', -- pendente|pago|cancelado
      pago_em       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_pag_campanha ON midia_pagamentos(campanha_id);

    -- Branding do SaaS (singleton id=1) — aplica em landing, admin, painel, e-mails, contratos.
    CREATE TABLE IF NOT EXISTS midia_branding (
      id            INTEGER PRIMARY KEY DEFAULT 1,
      nome          TEXT NOT NULL DEFAULT 'Three Digital Mídia',
      logo_url      TEXT,
      cor           TEXT NOT NULL DEFAULT '#7c3aed',
      cor_dark      TEXT NOT NULL DEFAULT '#5b21b6',
      cor_light     TEXT NOT NULL DEFAULT '#a78bfa',
      site          TEXT DEFAULT 'https://tthreedigital.com.br',
      email         TEXT,
      whatsapp      TEXT,
      cnpj          TEXT,
      razao_social  TEXT,
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT midia_branding_single CHECK (id = 1)
    );
    INSERT INTO midia_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);

  // Coluna p/ não reenviar boas-vindas
  await p.query(`ALTER TABLE midia_contas ADD COLUMN IF NOT EXISTS boas_vindas_em TIMESTAMPTZ;`);
  // Tipo da arte (image|video) p/ preview no painel
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS arte_tipo TEXT;`);
  // Conteúdo base do local (layout de preenchimento entre os anúncios)
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS conteudo_layout_id INTEGER;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS conteudo_nome TEXT;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS conteudo_event_id INTEGER;`);

  await seedPlanos();
  await seedPacotes();
  await seedMasterAdmin();

  _bootstrapped = true;
}

/** Seed de pacotes-exemplo (o master ajusta depois). */
async function seedPacotes(): Promise<void> {
  const p = db();
  const { rows } = await p.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM midia_pacotes`);
  if (Number(rows[0]?.n ?? "0") > 0) return;

  const exemplos: [string, string, number, number, number, number, number][] = [
    // nome, tipo, dias, insercoes_dia, segundos, preco, ordem
    ["15 dias · 250 inserções/dia", "video", 15, 250, 10, 0, 0],
    ["15 dias · 500 inserções/dia", "video", 15, 500, 10, 0, 1],
    ["30 dias · Banner estático",   "banner_estatico", 30, 200, 10, 0, 2],
    ["Banner eletrônico",            "banner_eletronico", 30, 300, 12, 0, 3],
    ["Peça publicitária",            "peca", 15, 200, 15, 0, 4],
  ];
  for (const [nome, tipo, dias, ins, seg, preco, ordem] of exemplos) {
    await p.query(
      `INSERT INTO midia_pacotes (nome, tipo, dias, insercoes_dia, segundos, preco, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [nome, tipo, dias, ins, seg, preco, ordem]
    );
  }
}

/** Popula midia_planos a partir do static PLANOS se a tabela estiver vazia. */
async function seedPlanos(): Promise<void> {
  const p = db();
  const { rows } = await p.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM midia_planos`);
  if (Number(rows[0]?.n ?? "0") > 0) return;

  const { PLANOS } = await import("./planos");
  for (let i = 0; i < PLANOS.length; i++) {
    const pl = PLANOS[i];
    await p.query(
      `INSERT INTO midia_planos (id, nome, preco, telas_label, destaque, recursos, ativo, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7)
       ON CONFLICT (id) DO NOTHING`,
      [pl.id, pl.nome, pl.preco, pl.telas, pl.destaque ?? false, JSON.stringify(pl.recursos), i]
    );
  }
}

/** Cria o primeiro admin master a partir de MASTER_EMAIL/MASTER_PASSWORD (uma vez). */
async function seedMasterAdmin(): Promise<void> {
  const email = (process.env.MASTER_EMAIL ?? "").toLowerCase().trim();
  const senha = process.env.MASTER_PASSWORD ?? "";
  if (!email || !senha) return;

  const p = db();
  const existe = await p.query(`SELECT 1 FROM midia_admins WHERE email = $1`, [email]);
  if (existe.rows.length) return;

  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash(senha, 10);
  await p.query(
    `INSERT INTO midia_admins (nome, email, senha_hash, role)
     VALUES ($1,$2,$3,'master') ON CONFLICT (email) DO NOTHING`,
    [process.env.MASTER_NOME ?? "Master", email, hash]
  );
}
