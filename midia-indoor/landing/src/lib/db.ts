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
  `);

  // Coluna p/ não reenviar boas-vindas
  await p.query(`ALTER TABLE midia_contas ADD COLUMN IF NOT EXISTS boas_vindas_em TIMESTAMPTZ;`);

  await seedPlanos();
  await seedMasterAdmin();

  _bootstrapped = true;
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
