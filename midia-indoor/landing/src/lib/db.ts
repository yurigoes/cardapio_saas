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
  // Capacidade da grade do local (inserções/dia recomendadas; 0 = ilimitado)
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS capacidade_dia INTEGER NOT NULL DEFAULT 0;`);
  // URL do APK do Xibo Player Android (hospedado pelo SaaS, evita depender do site do Xibo)
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_apk_url TEXT;`);
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_versao TEXT;`);
  // Splash do local (tela de espera quando não há conteúdo agendado)
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS splash_layout_id INTEGER;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS splash_nome TEXT;`);
  // Geo + audiência estimada
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS lat NUMERIC(10,6);`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS lng NUMERIC(10,6);`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS passantes_dia INTEGER NOT NULL DEFAULT 0;`);
  // Day-parting na campanha (horário do dia em formato HH:MM)
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS hora_inicio TEXT;`);
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS hora_fim TEXT;`);
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS xibo_daypart_id INTEGER;`);

  // Status de aprovação da arte na campanha + motivo de rejeição
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS arte_status TEXT NOT NULL DEFAULT 'aprovada';`);
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS arte_rejeicao_motivo TEXT;`);
  // Histórico de criativos (versionamento de arte)
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_campanha_artes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campanha_id     UUID NOT NULL REFERENCES midia_campanhas(id) ON DELETE CASCADE,
      arte_nome       TEXT,
      arte_tipo       TEXT,
      xibo_layout_id  INTEGER,
      xibo_media_id   INTEGER,
      ativa           BOOLEAN NOT NULL DEFAULT true,
      criada_em       TIMESTAMPTZ DEFAULT NOW(),
      enviada_por     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_midia_campanha_artes_camp ON midia_campanha_artes(campanha_id);
  `);

  // Multi-usuário por anunciante (operadores adicionais)
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_conta_usuarios (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id    UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      nome        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      senha_hash  TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'operador',  -- owner|operador
      ativo       BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_conta_usuarios_conta ON midia_conta_usuarios(conta_id);
  `);

  // Cupons de desconto
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_cupons (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo        TEXT NOT NULL UNIQUE,
      tipo          TEXT NOT NULL DEFAULT 'pct',  -- pct|fixo
      valor         NUMERIC(10,2) NOT NULL,        -- pct: 10 = 10%; fixo: R$ valor
      validade      TIMESTAMPTZ,
      max_usos      INTEGER,
      usos          INTEGER NOT NULL DEFAULT 0,
      ativo         BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_cupons_codigo ON midia_cupons(codigo);
  `);
  // Cupom aplicado na campanha (registro do uso)
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS cupom_id UUID REFERENCES midia_cupons(id) ON DELETE SET NULL;`);
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) NOT NULL DEFAULT 0;`);

  // Audit log
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_auditoria (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      autor_tipo    TEXT NOT NULL,        -- admin|cliente|sistema
      autor_id      TEXT,
      autor_nome    TEXT,
      acao          TEXT NOT NULL,        -- ex: campanha.lancar
      entidade      TEXT,                 -- ex: campanha, local, anunciante
      entidade_id   TEXT,
      detalhes      JSONB,
      ip            TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_auditoria_data ON midia_auditoria(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_midia_auditoria_acao ON midia_auditoria(acao);
  `);
  // Orientação física das telas do local (retrato/paisagem) — usada pra escolher o Display Profile do Xibo
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS orientacao TEXT NOT NULL DEFAULT 'retrato';`);

  // ─── Lote 4: NF + cobrança recorrente, afiliados, backups ────────────────
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_notas_fiscais (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id        UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      campanha_id     UUID REFERENCES midia_campanhas(id) ON DELETE SET NULL,
      numero          TEXT,
      serie           TEXT,
      valor           NUMERIC(10,2) NOT NULL,
      data_emissao    DATE NOT NULL,
      pdf_url         TEXT,
      xml_url         TEXT,
      status          TEXT NOT NULL DEFAULT 'pendente',  -- pendente|emitida|cancelada
      observacao      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_nf_conta ON midia_notas_fiscais(conta_id);
    CREATE INDEX IF NOT EXISTS idx_midia_nf_campanha ON midia_notas_fiscais(campanha_id);
  `);

  // Cobrança recorrente (assinatura DOOH "sempre no ar": cobra X / mês enquanto ativa)
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_cobrancas_recorrentes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id        UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      nome            TEXT NOT NULL,
      valor_mensal    NUMERIC(10,2) NOT NULL,
      dia_vencimento  INTEGER NOT NULL DEFAULT 10,    -- 1..28
      ativo           BOOLEAN NOT NULL DEFAULT true,
      mp_preapproval_id TEXT,                          -- MP Subscription id (opcional)
      proximo_venc    DATE,
      ultimo_cobrado  DATE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_cobrancas_conta ON midia_cobrancas_recorrentes(conta_id);
  `);

  // Fatura mensal gerada pelo cron de cobrança
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_faturas (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id        UUID NOT NULL REFERENCES midia_contas(id) ON DELETE CASCADE,
      cobranca_id     UUID REFERENCES midia_cobrancas_recorrentes(id) ON DELETE SET NULL,
      competencia     TEXT NOT NULL,                   -- ex: 2026-06
      valor           NUMERIC(10,2) NOT NULL,
      vencimento      DATE NOT NULL,
      status          TEXT NOT NULL DEFAULT 'aberta',  -- aberta|paga|atrasada|cancelada
      pago_em         TIMESTAMPTZ,
      mp_init_point   TEXT,
      mp_payment_id   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (conta_id, competencia, cobranca_id)
    );
    CREATE INDEX IF NOT EXISTS idx_midia_faturas_conta ON midia_faturas(conta_id);
    CREATE INDEX IF NOT EXISTS idx_midia_faturas_status ON midia_faturas(status);
  `);

  // Programa de afiliados (parceiros que indicam anunciantes)
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_afiliados (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome            TEXT NOT NULL,
      email           TEXT NOT NULL UNIQUE,
      whatsapp        TEXT,
      codigo          TEXT NOT NULL UNIQUE,            -- ex: JOAO10 — usado no link de indicação
      comissao_pct    NUMERIC(5,2) NOT NULL DEFAULT 10,
      pix_chave       TEXT,
      ativo           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_afiliados_codigo ON midia_afiliados(codigo);
  `);
  // Vincula anunciante ao afiliado que o indicou (e snapshot da comissão na hora do cadastro)
  await p.query(`ALTER TABLE midia_contas ADD COLUMN IF NOT EXISTS afiliado_id UUID REFERENCES midia_afiliados(id) ON DELETE SET NULL;`);
  await p.query(`ALTER TABLE midia_contas ADD COLUMN IF NOT EXISTS afiliado_comissao_pct NUMERIC(5,2);`);

  // Comissões geradas por campanha paga
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_comissoes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      afiliado_id     UUID NOT NULL REFERENCES midia_afiliados(id) ON DELETE CASCADE,
      conta_id        UUID NOT NULL REFERENCES midia_contas(id)    ON DELETE CASCADE,
      campanha_id     UUID REFERENCES midia_campanhas(id) ON DELETE SET NULL,
      base            NUMERIC(10,2) NOT NULL,           -- valor da campanha (já com desconto)
      pct             NUMERIC(5,2)  NOT NULL,
      valor           NUMERIC(10,2) NOT NULL,           -- base * pct/100
      status          TEXT NOT NULL DEFAULT 'pendente', -- pendente|paga|cancelada
      pago_em         TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_comissoes_afiliado ON midia_comissoes(afiliado_id);
    CREATE INDEX IF NOT EXISTS idx_midia_comissoes_status ON midia_comissoes(status);
  `);

  // Histórico de backups (gerado pelo cron de backup)
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_backups (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo            TEXT NOT NULL,                   -- db|library|completo
      tamanho_bytes   BIGINT,
      caminho         TEXT,                            -- ex: /backups/2026-06-03_db.sql.gz
      sha256          TEXT,
      status          TEXT NOT NULL DEFAULT 'ok',      -- ok|falha
      mensagem        TEXT,
      criado_em       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_backups_data ON midia_backups(criado_em DESC);
  `);

  // ─── Grupos de locais (multi-TV, ex: 8 pontas de gôndola) ──────────────
  //   - Um "local-grupo" é uma agregação que aponta pra N "locais-filhos".
  //   - tipo='grupo' → exibe múltiplas telas como uma unidade na campanha.
  //   - sincronia=true → cria SyncGroup no Xibo (mesmo conteúdo no mesmo
  //     instante em todas as telas, modo dominó).
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'individual';`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS sincronia BOOLEAN NOT NULL DEFAULT false;`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_local_grupo_membros (
      grupo_id   UUID NOT NULL REFERENCES midia_locais(id) ON DELETE CASCADE,
      membro_id  UUID NOT NULL REFERENCES midia_locais(id) ON DELETE CASCADE,
      ordem      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (grupo_id, membro_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lgm_grupo ON midia_local_grupo_membros(grupo_id);
    CREATE INDEX IF NOT EXISTS idx_lgm_membro ON midia_local_grupo_membros(membro_id);
  `);

  // Sync periódico Xibo → SaaS (contadores de telas por local)
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS telas_total  INTEGER NOT NULL DEFAULT 0;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS telas_online INTEGER NOT NULL DEFAULT 0;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS sync_em TIMESTAMPTZ;`);

  // Dias da semana em que a campanha pode tocar (CSV "1,2,3" = Seg,Ter,Qua... 7=Dom).
  // NULL ou "1,2,3,4,5,6,7" = todos os dias.
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS dias_semana TEXT;`);

  // Tipo/formato da campanha (define o fluxo de mídia/layout)
  //  - simples            : 1 arte só, layout fullscreen padrão (default)
  //  - encarte_totem      : 1 arte/vídeo (totem vertical de entrada de loja)
  //  - encarte_gondola    : N artes em sequência num único layout (ex: 8 promos
  //                         de ponta de gôndola que tocam todas seguidas, depois
  //                         outros anúncios assumem, e volta)
  await p.query(`ALTER TABLE midia_campanhas ADD COLUMN IF NOT EXISTS formato TEXT NOT NULL DEFAULT 'simples';`);

  // ─── Arquivamento (soft-delete com purge automático após 6 meses) ────────
  await p.query(`ALTER TABLE midia_campanhas  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;`);
  await p.query(`ALTER TABLE midia_locais     ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;`);
  await p.query(`ALTER TABLE midia_contas     ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;`);
  // Quando uma campanha vira "encerrada", marca archived_at automaticamente
  await p.query(`UPDATE midia_campanhas SET archived_at = COALESCE(archived_at, updated_at) WHERE status = 'encerrada' AND archived_at IS NULL;`);
  await p.query(`UPDATE midia_locais    SET archived_at = COALESCE(archived_at, updated_at) WHERE ativo = false AND archived_at IS NULL;`);
  await p.query(`UPDATE midia_contas    SET archived_at = COALESCE(archived_at, updated_at) WHERE status IN ('inativo','cancelado') AND archived_at IS NULL;`);

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
