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
  // APK hospedado no SaaS (arquivo gravado em APK_DIR)
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_apk_filename TEXT;`);
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_apk_size BIGINT;`);
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_apk_sha256 TEXT;`);
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_apk_uploaded_at TIMESTAMPTZ;`);
  // Wallpaper da tela de login (BYTEA evita precisar montar volume)
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS login_wallpaper_data BYTEA;`);
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS login_wallpaper_mime TEXT;`);
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS login_wallpaper_updated_at TIMESTAMPTZ;`);
  // Splash do local (tela de espera quando não há conteúdo agendado)
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS splash_layout_id INTEGER;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS splash_nome TEXT;`);
  // Corrige locais com largura/altura zero ou nulas (legacy / antes do DEFAULT).
  // Sem isso, Xibo retorna 422 "Por favor indique uma largura" ao criar Resolution.
  await p.query(`UPDATE midia_locais SET largura = 1080 WHERE largura IS NULL OR largura < 120;`);
  await p.query(`UPDATE midia_locais SET altura  = 1920 WHERE altura  IS NULL OR altura  < 120;`);
  // Horario de funcionamento do local — usado pra calcular CAPACIDADE de
  // anuncios/dia (segundos disponiveis = (hora_fim - hora_inicio) * 3600).
  // Default 06:00-22:00 (16h) — padrao de varejo brasileiro.
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS hora_abertura TEXT NOT NULL DEFAULT '06:00';`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS hora_fechamento TEXT NOT NULL DEFAULT '22:00';`);

  // Plano de veiculacao: como o local intercala conteudo entre anuncios.
  //   'publicidade'    — so anuncios, sem ancora (default — comportamento atual)
  //   'encarte_totem'  — encarte 1:1: [encarte > anuncio_n > encarte > anuncio_n+1 > ...]
  //   'ponta_gondola'  — cada display tem midia propria; intercala com anuncios em sync
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS plano_veiculacao TEXT NOT NULL DEFAULT 'publicidade';`);

  // Encarte do local (totem). Mestre define em Local → "Midia Encarte" com periodo
  // de vigencia. Quando vigente, eh intercalado 1:1 com os anuncios.
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_layout_id INTEGER;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_media_id INTEGER;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_nome TEXT;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_inicio DATE;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_fim DATE;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_duracao_seg INTEGER NOT NULL DEFAULT 10;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_arquivo_bytes BYTEA;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS encarte_arquivo_mime TEXT;`);
  // Multi-paginas do encarte: bloco completo [pag1, pag2, ..., pagN] intercalado
  // 1:1 com cada anuncio. Substitui o uso de encarte_media_id single (mantido
  // por compat). Ordem = coluna 'ordem' ASC.
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_encarte_paginas (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      local_id        UUID NOT NULL REFERENCES midia_locais(id) ON DELETE CASCADE,
      ordem           INTEGER NOT NULL DEFAULT 0,
      nome            TEXT,
      xibo_media_id   INTEGER NOT NULL,
      duracao_seg     INTEGER NOT NULL DEFAULT 10,
      arquivo_bytes   BYTEA,
      arquivo_mime    TEXT,
      criada_em       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_encarte_paginas_local ON midia_encarte_paginas(local_id, ordem);
  `);
  // Layout consolidado intercalado (gerado por regenerarLayoutDoLocal) — virou
  // o conteudo base do local quando plano_veiculacao != 'publicidade'.
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS interleave_layout_id INTEGER;`);
  await p.query(`ALTER TABLE midia_locais ADD COLUMN IF NOT EXISTS interleave_event_id INTEGER;`);

  // Ponta de gondola: cada tela individual tem sua propria midia (cada gondola
  // mostra produto diferente). Anuncios intercalam em sync entre todas.
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS gondola_layout_id INTEGER;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS gondola_media_id INTEGER;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS gondola_nome TEXT;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS gondola_duracao_seg INTEGER NOT NULL DEFAULT 10;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS gondola_arquivo_bytes BYTEA;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS gondola_arquivo_mime TEXT;`);
  // Tela tem que saber a qual local pertence (pra ponta_gondola saber a tela
  // ser regenerada quando muda anuncio do local). Tambem ip/mac pra diagnostico.
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS local_id UUID REFERENCES midia_locais(id) ON DELETE SET NULL;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS ip TEXT;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS mac TEXT;`);
  await p.query(`ALTER TABLE midia_telas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_midia_telas_local ON midia_telas(local_id);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_midia_telas_ip ON midia_telas(ip);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_midia_telas_mac ON midia_telas(mac);`);
  // TVs DOOH pertencem ao MASTER (Three Digital), nao a um anunciante especifico.
  // Antes a coluna era NOT NULL referenciando midia_contas, mas isso impede registrar
  // TVs descobertas via Xibo (ex: pareadas pelo provisionamento sem conta de anunciante).
  await p.query(`ALTER TABLE midia_telas ALTER COLUMN conta_id DROP NOT NULL;`).catch(() => {});
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
  // Backup binario da arte pra soft-recreate quando o Xibo perde o Layout/Media
  // (limpeza, restore de backup antigo, migracao). Sem isso, a unica opcao seria
  // pedir reupload ao anunciante — o que e ruim UX. Com isso, conseguimos
  // recriar o layout transparentemente.
  await p.query(`ALTER TABLE midia_campanha_artes ADD COLUMN IF NOT EXISTS arquivo_bytes BYTEA;`);
  await p.query(`ALTER TABLE midia_campanha_artes ADD COLUMN IF NOT EXISTS arquivo_mime TEXT;`);

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
  // WhatsApp: opt-in (anunciante autoriza receber notificacoes) + opcionalmente
  // sobrescreve o numero (caso o cadastro principal seja outro).
  await p.query(`ALTER TABLE midia_contas ADD COLUMN IF NOT EXISTS whatsapp_optin BOOLEAN NOT NULL DEFAULT true;`);
  await p.query(`ALTER TABLE midia_contas ADD COLUMN IF NOT EXISTS whatsapp_notif TEXT;`);
  // Log de envios pra auditoria + reprocessamento se falhar
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_whatsapp_logs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conta_id      UUID REFERENCES midia_contas(id) ON DELETE SET NULL,
      destino       TEXT NOT NULL,
      tipo          TEXT NOT NULL,        -- 'campanha_no_ar'|'arte_aprovada'|'arte_rejeitada'|'os_aberta'|'pagamento_ok'|'vencimento'|'manual'
      mensagem      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'enviado',  -- 'enviado'|'falha'|'pendente'
      provider      TEXT,                 -- 'evolution'|'twilio'|'wppconnect'
      provider_id   TEXT,
      erro          TEXT,
      criado_em     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_wpp_logs_conta ON midia_whatsapp_logs(conta_id, criado_em DESC);
    CREATE INDEX IF NOT EXISTS idx_midia_wpp_logs_status ON midia_whatsapp_logs(status);
  `);

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

  // ─── Inventário de hardware (controle interno) ─────────────────────────
  //   Cada item físico (box, TV, totem, cabo, fonte, suporte) com MAC,
  //   serial, fabricante, valor, etc. Cada item gera um QR único pra
  //   colar fisicamente no equipamento; quando escaneado abre a página
  //   pública /q/{token} com dados completos.
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_inventario (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo            TEXT NOT NULL DEFAULT 'box',  -- box|tv|totem|cabo|fonte|suporte|outro
      nome            TEXT NOT NULL,                -- ex: "Box-001 Atacadão"
      mac             TEXT,                          -- AA:BB:CC:DD:EE:FF
      serial          TEXT,
      fabricante      TEXT,
      modelo          TEXT,
      local_id        UUID REFERENCES midia_locais(id) ON DELETE SET NULL,
      xibo_display_id INTEGER,                       -- vínculo com display do Xibo
      qr_token        TEXT NOT NULL UNIQUE,          -- token único pro QR
      ip_local        TEXT,                          -- último IP visto na LAN
      valor           NUMERIC(10,2),
      comprado_em     DATE,
      garantia_ate    DATE,
      nota_fiscal     TEXT,
      observacao      TEXT,
      ativo           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_inv_mac ON midia_inventario(mac);
    CREATE INDEX IF NOT EXISTS idx_inv_local ON midia_inventario(local_id);
    CREATE INDEX IF NOT EXISTS idx_inv_qr ON midia_inventario(qr_token);
  `);
  // RustDesk: ID do app pra acesso remoto (capturado no provisionamento)
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS rustdesk_id TEXT;`);
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS rustdesk_senha TEXT;`);
  // Monitor conectado via HDMI (capturado por EDID quando possivel, ou cadastrado manual)
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS monitor_modelo TEXT;`);
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS monitor_serial TEXT;`);
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS monitor_resolucao TEXT;`);
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS monitor_polegadas INT;`);
  // Vinculo 1:1 entre itens (TV <-> Box, etc). Quando vincula uma TV a um Box,
  // ambos ficam apontando um pro outro (ou apenas TV.vinculado_a_id = box.id).
  // Sem foreign key forte (ON DELETE SET NULL) pra nao impedir excluir um lado.
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS vinculado_a_id UUID;`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_midia_inv_vinculado ON midia_inventario(vinculado_a_id);`);
  // Resolucao/polegadas tambem aplicam quando tipo='tv' (display em si)
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS resolucao TEXT;`);
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS polegadas INT;`);
  // Status operacional do item (independente do 'ativo' que e flag de uso)
  await p.query(`ALTER TABLE midia_inventario ADD COLUMN IF NOT EXISTS status_item TEXT NOT NULL DEFAULT 'em_estoque';`);
  // ativo (boolean) ja existe — vamos usar status_item pra granularidade operacional

  // Historico de movimentacoes do item (entrou no estoque, foi pra local X,
  // desvinculou, abriu OS, etc) — pra auditoria e rastreabilidade
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_inventario_movimentos (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inventario_id UUID NOT NULL REFERENCES midia_inventario(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL,     -- 'criado'|'vinculou'|'desvinculou'|'mudou_local'|'os_aberta'|'os_resolvida'|'status_mudou'
      detalhes      JSONB,             -- { de:..., para:..., motivo:..., os_id:... }
      autor_tipo    TEXT,              -- 'admin'|'tecnico'|'sistema'|'publico'
      autor_id      TEXT,
      autor_nome    TEXT,
      criado_em     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_midia_inv_mov_inv ON midia_inventario_movimentos(inventario_id, criado_em DESC);
  `);

  // Ordens de servico (chamado tecnico de manutencao)
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_inventario_os (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inventario_id   UUID NOT NULL REFERENCES midia_inventario(id) ON DELETE CASCADE,
      motivo          TEXT NOT NULL,    -- 'problema'|'manutencao'|'substituicao'|'perda'|'instalacao'|'outro'
      descricao       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'aberto',  -- 'aberto'|'em_analise'|'resolvido'|'descartado'
      veredito        TEXT,             -- 'queimado'|'consertado'|'sem_problema'|'substituir'|'descartar'|null
      veredito_obs    TEXT,
      atribuido_a     TEXT,             -- nome livre do tecnico
      custo_centavos  INTEGER,
      fotos           JSONB,            -- array de URLs base64 (cap 5)
      aberta_por_tipo TEXT,             -- 'admin'|'publico_qr'|'master'
      aberta_por      TEXT,
      aberta_por_nome TEXT,
      criada_em       TIMESTAMPTZ DEFAULT NOW(),
      fechada_em      TIMESTAMPTZ,
      resolvida_por   TEXT,
      em_garantia     BOOLEAN DEFAULT FALSE,
      substituido_por_id UUID            -- inventario_id que substituiu este (se queimado)
    );
    CREATE INDEX IF NOT EXISTS idx_midia_inv_os_inv ON midia_inventario_os(inventario_id, criada_em DESC);
    CREATE INDEX IF NOT EXISTS idx_midia_inv_os_status ON midia_inventario_os(status);
  `);
  // SLA: prazo de resposta esperado. Default por motivo: problema=24h,
  // instalacao=48h, manutencao=72h, outros=96h. Set automaticamente em abrirOS.
  await p.query(`ALTER TABLE midia_inventario_os ADD COLUMN IF NOT EXISTS prazo_sla TIMESTAMPTZ;`);
  // 2FA (TOTP) pra admins
  await p.query(`ALTER TABLE midia_admins ADD COLUMN IF NOT EXISTS totp_secret TEXT;`);
  await p.query(`ALTER TABLE midia_admins ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;`);
  // APK do Player armazenado direto no banco (BYTEA) - assim nao precisa volume montado
  await p.query(`ALTER TABLE midia_branding ADD COLUMN IF NOT EXISTS player_apk_data BYTEA;`);

  // Screenshots de TVs via agente ADB local
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_screenshots (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inventario_id UUID REFERENCES midia_inventario(id) ON DELETE CASCADE,
      mac         TEXT NOT NULL,
      data        BYTEA NOT NULL,
      mime        TEXT NOT NULL DEFAULT 'image/png',
      size        INTEGER NOT NULL,
      taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_screenshots_mac ON midia_screenshots(mac, taken_at DESC);
    CREATE INDEX IF NOT EXISTS idx_screenshots_inv ON midia_screenshots(inventario_id, taken_at DESC);

    CREATE TABLE IF NOT EXISTS midia_screenshot_requests (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inventario_id UUID NOT NULL REFERENCES midia_inventario(id) ON DELETE CASCADE,
      mac           TEXT NOT NULL,
      ip            TEXT,
      status        TEXT NOT NULL DEFAULT 'pendente', -- pendente|capturado|falha
      requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      done_at       TIMESTAMPTZ,
      erro          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_screen_req_status ON midia_screenshot_requests(status, requested_at);
  `);

  // InfinityPay - link de pagamento gerado por campanha
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_infinity_links (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campanha_id     UUID NOT NULL REFERENCES midia_campanhas(id) ON DELETE CASCADE,
      valor_centavos  BIGINT NOT NULL,
      url             TEXT,
      slug            TEXT,
      status          TEXT NOT NULL DEFAULT 'pendente',  -- pendente|pago|falha
      transaction_nsu TEXT,
      capture_method  TEXT,
      paid_amount_centavos BIGINT,
      receipt_url     TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at         TIMESTAMPTZ,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_inf_camp ON midia_infinity_links(campanha_id, status);
  `);

  // Kits do inventario (TV + box + cabos = 1 kit) com depreciacao
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_inventario_kits (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      local_id      UUID REFERENCES midia_locais(id) ON DELETE SET NULL,
      vida_util_anos INT DEFAULT 5,
      observacao    TEXT,
      ativo         BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS midia_inventario_kit_itens (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kit_id        UUID NOT NULL REFERENCES midia_inventario_kits(id) ON DELETE CASCADE,
      inventario_id UUID REFERENCES midia_inventario(id) ON DELETE SET NULL,
      descricao     TEXT NOT NULL,
      quantidade    INT NOT NULL DEFAULT 1,
      valor_unit    DECIMAL(10,2) NOT NULL DEFAULT 0,
      comprado_em   DATE
    );
    CREATE INDEX IF NOT EXISTS idx_kit_itens_kit ON midia_inventario_kit_itens(kit_id);
  `);

  // ─── Multi-tenant / White-label (operadores DOOH revendendo o SaaS) ────
  //   - Cada operador é uma "tenant" com domínio próprio + branding
  //   - Detecção: middleware compara host da requisição com tenant.dominios
  //   - Todos os dados de cada tenant ficam isolados via tenant_id
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_tenants (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug            TEXT NOT NULL UNIQUE,         -- ex: "atacadao-xyz"
      nome            TEXT NOT NULL,
      dominios        TEXT[] NOT NULL DEFAULT '{}', -- hosts deste tenant (ex: ['media.atacadaoxy.com.br'])
      branding_id     UUID,                          -- aponta pra midia_branding (já existente, multi-row aqui)
      ativo           BOOLEAN NOT NULL DEFAULT true,
      plano           TEXT NOT NULL DEFAULT 'basico',-- basico|pro|enterprise
      preco_mensal    NUMERIC(10,2) NOT NULL DEFAULT 0,
      mp_assinatura_id TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_slug ON midia_tenants(slug);
  `);
  // Tenant default ("Three Digital") pra continuar funcionando como hoje
  await p.query(`
    INSERT INTO midia_tenants (slug, nome, dominios, plano, preco_mensal)
    VALUES ('three-digital', 'Three Digital Mídia', ARRAY['midiaindoor.tthreedigital.com.br','localhost'], 'enterprise', 0)
    ON CONFLICT (slug) DO NOTHING;
  `);
  // Adiciona tenant_id às tabelas principais (NULL = pertence ao tenant default)
  for (const tabela of ["midia_contas", "midia_locais", "midia_campanhas", "midia_pacotes", "midia_cupons", "midia_afiliados"]) {
    await p.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES midia_tenants(id) ON DELETE CASCADE;`);
    // Backfill: tudo que não tem tenant_id aponta pro default
    await p.query(`UPDATE ${tabela} SET tenant_id = (SELECT id FROM midia_tenants WHERE slug='three-digital') WHERE tenant_id IS NULL;`);
  }

  // ─── Templates de campanha (salvos pra reusar) ────────────────────────
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_campanha_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome          TEXT NOT NULL,
      descricao     TEXT,
      formato       TEXT NOT NULL DEFAULT 'simples',
      tipo          TEXT,
      dias          INTEGER,
      insercoes_dia INTEGER,
      segundos      INTEGER,
      hora_inicio   TEXT,
      hora_fim      TEXT,
      dias_semana   TEXT,
      valor         NUMERIC(10,2),
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ─── Notificações in-app (sininho) ─────────────────────────────────────
  await p.query(`
    CREATE TABLE IF NOT EXISTS midia_notificacoes (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      destino       TEXT NOT NULL DEFAULT 'master',   -- master | conta:<uuid>
      tipo          TEXT NOT NULL,                    -- arte-aprovacao | campanha-vence | tela-offline | pagamento | sistema
      titulo        TEXT NOT NULL,
      mensagem      TEXT,
      link          TEXT,                              -- ex: /admin?aba=campanhas&id=X
      icone         TEXT,
      lida          BOOLEAN NOT NULL DEFAULT false,
      lida_em       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notif_destino ON midia_notificacoes(destino, lida, created_at DESC);
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
