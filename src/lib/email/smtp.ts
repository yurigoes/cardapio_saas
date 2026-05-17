/**
 * SMTP client + queue de envio de e-mail.
 *
 * Strategy:
 *   - Config persistida em `smtp_config` (singleton)
 *   - Templates HTML em `email_templates` (1 por evento)
 *   - Jobs em `email_jobs` (queue com retry exponencial)
 *   - Worker chamado por cron noturno + sob demanda após enqueue
 *
 * Render: Mustache simples ({{variavel}} + {{#var}}...{{/var}} para condicional).
 * Lib: nodemailer (suporta SMTP/SES/Mailgun/etc).
 */
import nodemailer, { type Transporter } from "nodemailer";
import { query, queryOne } from "@/lib/db/client";
import { getSaasBranding } from "@/lib/branding/server";
import { decryptIfNeeded } from "@/lib/security/encrypt";

interface SmtpConfig {
  host: string | null; port: number; secure: boolean;
  username: string | null; password: string | null;
  from_name: string | null; from_email: string | null;
  reply_to: string | null; ativo: boolean;
}

interface TemplateRow {
  assunto: string; html: string; texto: string | null; ativo: boolean;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigHash:  string | null = null;

async function getConfig(): Promise<SmtpConfig | null> {
  return await queryOne<SmtpConfig>(
    `SELECT host, port, secure, username, password,
            from_name, from_email, reply_to, ativo
       FROM smtp_config WHERE id = 1`
  ).catch(() => null);
}

async function getTransporter(): Promise<{ transporter: Transporter; cfg: SmtpConfig } | null> {
  const cfg = await getConfig();
  if (!cfg || !cfg.ativo || !cfg.host || !cfg.from_email) return null;

  // Senha vem criptografada (formato iv:tag:enc) ou plaintext (compat legado)
  const senhaPlain = cfg.password ? (decryptIfNeeded(cfg.password) ?? cfg.password) : null;

  const hash = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.username}:${senhaPlain}`;
  if (cachedTransporter && cachedConfigHash === hash) {
    return { transporter: cachedTransporter, cfg };
  }

  cachedTransporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   cfg.username && senhaPlain
      ? { user: cfg.username, pass: senhaPlain }
      : undefined,
    // Timeout protetor pra não pendurar request
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     20_000,
  });
  cachedConfigHash = hash;

  return { transporter: cachedTransporter, cfg };
}

/** Render Mustache simples — {{var}} + {{#var}}…{{/var}} (truthy block) */
function render(tpl: string, vars: Record<string, unknown>): string {
  // Bloco condicional {{#k}}...{{/k}} renderiza só se truthy
  let out = tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, k, body) => {
    const v = vars[k];
    return v ? body : "";
  });
  // Substituição simples
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
  return out;
}

interface EnviarParams {
  para:    string;
  cc?:     string;
  bcc?:    string;
  assunto: string;
  html:    string;
  texto?:  string;
}

interface EnviarResult {
  ok: boolean;
  message_id?: string;
  erro?: string;
}

/** Envia direto (sem queue). Para uso interno do worker. */
export async function enviarDireto(p: EnviarParams): Promise<EnviarResult> {
  const conn = await getTransporter();
  if (!conn) return { ok: false, erro: "smtp não configurado/desativado" };

  try {
    const fromName  = conn.cfg.from_name  ?? "Cardápio SaaS";
    const fromEmail = conn.cfg.from_email!;
    const info = await conn.transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      p.para,
      cc:      p.cc,
      bcc:     p.bcc,
      replyTo: conn.cfg.reply_to ?? undefined,
      subject: p.assunto,
      html:    p.html,
      text:    p.texto,
    });
    return { ok: true, message_id: info.messageId };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Enfileira um e-mail. Renderiza imediatamente os templates com as vars
 * fornecidas + branding global (saas_nome, saas_logo, etc).
 */
export async function enfileirar(params: {
  para:     string;
  evento:   string;          // boas_vindas | reset_senha | manual | ...
  vars?:    Record<string, unknown>;
  cc?:      string;
  bcc?:     string;
  contexto?: Record<string, unknown>;
  // Pra envio "manual" (sem template), passa assunto+html direto
  assunto?: string;
  html?:    string;
  texto?:   string;
}): Promise<{ jobId: string | null; motivo?: string }> {

  // Vars padrão de branding
  const branding = await getSaasBranding();
  const vars: Record<string, unknown> = {
    ...params.vars,
    saas_nome:     branding.nome,
    saas_logo:     branding.logo_url,
    saas_email:    branding.email,
    saas_telefone: branding.telefone,
    saas_whatsapp: branding.whatsapp,
    saas_site:     branding.site,
    ano:           new Date().getFullYear(),
  };

  let assunto: string, html: string, texto: string | undefined;

  if (params.assunto && params.html) {
    // Manual
    assunto = render(params.assunto, vars);
    html    = render(params.html, vars);
    texto   = params.texto ? render(params.texto, vars) : undefined;
  } else {
    // Template
    const tpl = await queryOne<TemplateRow>(
      `SELECT assunto, html, texto, ativo FROM email_templates WHERE evento = $1`,
      [params.evento]
    ).catch(() => null);

    if (!tpl) return { jobId: null, motivo: `template '${params.evento}' não encontrado` };
    if (!tpl.ativo) return { jobId: null, motivo: `template '${params.evento}' desativado` };

    assunto = render(tpl.assunto, vars);
    html    = render(tpl.html, vars);
    texto   = tpl.texto ? render(tpl.texto, vars) : undefined;
  }

  const job = await queryOne<{ id: string }>(
    `INSERT INTO email_jobs
       (para, cc, bcc, assunto, html, texto, evento, contexto, proximo_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
     RETURNING id`,
    [
      params.para,
      params.cc ?? null,
      params.bcc ?? null,
      assunto,
      html,
      texto ?? null,
      params.evento,
      JSON.stringify(params.contexto ?? {}),
    ]
  );

  // Dispara processamento imediato em background (não bloqueia)
  // Cron continua processando os atrasados a cada 5min.
  if (job?.id) {
    processarQueue(5).catch(err => console.warn("[smtp/processarQueue]", err));
  }
  return { jobId: job?.id ?? null };
}

/**
 * Worker: processa jobs pendentes da queue. Roda 1x por chamada (não loop).
 * Use cron pra disparar a cada 1min.
 */
export async function processarQueue(maxJobs = 20): Promise<{
  processados: number; sucesso: number; falha: number;
}> {
  const jobs = await query<{
    id: string; para: string; cc: string | null; bcc: string | null;
    assunto: string; html: string; texto: string | null;
    tentativas: number; max_tentativas: number;
  }>(
    `SELECT id, para, cc, bcc, assunto, html, texto, tentativas, max_tentativas
       FROM email_jobs
      WHERE status IN ('pendente')
        AND (proximo_em IS NULL OR proximo_em <= NOW())
        AND tentativas < max_tentativas
      ORDER BY created_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [maxJobs]
  );

  let sucesso = 0, falha = 0;

  for (const job of jobs) {
    // Marca como enviando
    await query(
      `UPDATE email_jobs SET status = 'enviando' WHERE id = $1`,
      [job.id]
    );

    const r = await enviarDireto({
      para:    job.para,
      cc:      job.cc ?? undefined,
      bcc:     job.bcc ?? undefined,
      assunto: job.assunto,
      html:    job.html,
      texto:   job.texto ?? undefined,
    });

    if (r.ok) {
      await query(
        `UPDATE email_jobs
            SET status = 'enviado', enviado_em = NOW(), message_id = $2
          WHERE id = $1`,
        [job.id, r.message_id ?? null]
      );
      await query(
        `UPDATE smtp_config
            SET ultimo_envio = NOW(), ultimo_status = 'ok',
                ultimo_erro  = NULL, enviados_total = enviados_total + 1
          WHERE id = 1`
      );
      sucesso++;
    } else {
      const novaTentativa = job.tentativas + 1;
      const esgotou = novaTentativa >= job.max_tentativas;
      // Backoff exponencial: 1m, 5m, 15m
      const proximoEm = esgotou ? null : new Date(Date.now() + Math.pow(5, novaTentativa) * 60_000);

      await query(
        `UPDATE email_jobs
            SET status = $2, tentativas = $3, erro = $4, proximo_em = $5
          WHERE id = $1`,
        [
          job.id,
          esgotou ? "erro" : "pendente",
          novaTentativa,
          r.erro ?? "erro desconhecido",
          proximoEm,
        ]
      );
      await query(
        `UPDATE smtp_config
            SET ultimo_status = 'erro', ultimo_erro = $1,
                falhas_total = falhas_total + 1
          WHERE id = 1`,
        [r.erro ?? null]
      );
      falha++;
    }
  }

  return { processados: jobs.length, sucesso, falha };
}

/** Verifica se SMTP está minimamente configurado e ativo */
export async function smtpAtivo(): Promise<boolean> {
  const cfg = await getConfig();
  return !!(cfg && cfg.ativo && cfg.host && cfg.from_email);
}

/** Invalida transporter cacheado (chamar após PATCH config) */
export function invalidarCacheSmtp() {
  cachedTransporter = null;
  cachedConfigHash  = null;
}
