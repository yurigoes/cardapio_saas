/**
 * Envio de e-mail (nodemailer/SMTP) com a marca da Three Digital Mídia.
 *
 * Env:
 *   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" p/ 465),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM ("Three Digital Mídia <noreply@...>")
 *   BRAND_LOGO_URL (logo no header do e-mail)
 *   APP_URL (link do painel)
 *
 * Se SMTP não estiver configurado, enviar() vira no-op (loga e segue) — não
 * quebra o fluxo de provisionamento.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { getBranding } from "./branding";

const APP_URL = (process.env.APP_URL ?? "https://midiaindoor.tthreedigital.com.br").replace(/\/+$/, "");

let _tx: Transporter | null = null;
function transporter(): Transporter | null {
  if (_tx) return _tx;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  _tx = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? "false") === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return _tx;
}

export function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Wrapper HTML com a marca (header com a cor + logo do branding). */
async function wrap(titulo: string, conteudoHtml: string, botao?: { texto: string; url: string }): Promise<string> {
  const b = await getBranding();
  const cor = b.cor, corDark = b.cor_dark, nome = b.nome;
  const site = b.site ?? "https://tthreedigital.com.br";
  const logo = b.logo_url
    ? `<img src="${b.logo_url}" alt="${nome}" style="max-height:46px;max-width:200px;margin-bottom:6px;">`
    : `<div style="color:#fff;font-size:20px;font-weight:800;">${nome}</div>`;
  const btn = botao
    ? `<p style="text-align:center;margin:26px 0;">
         <a href="${botao.url}" style="display:inline-block;background:${cor};color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;">${botao.texto}</a>
       </p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;background:#0a0a12;color:#1a1f2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.3);">
        <tr><td style="background:linear-gradient(135deg,${cor},${corDark});padding:30px 32px;text-align:center;">
          ${logo}
          <h1 style="color:#fff;font-size:21px;margin:8px 0 0;font-weight:700;">${titulo}</h1>
        </td></tr>
        <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;color:#1f2937;">
          ${conteudoHtml}
          ${btn}
        </td></tr>
        <tr><td style="background:#f4f6f8;padding:16px 32px;text-align:center;font-size:12px;color:#888;">
          © ${new Date().getFullYear()} ${nome} · <a href="${site}" style="color:${cor};text-decoration:none;">${site.replace("https://","")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function enviar(opts: { para: string; assunto: string; html: string }): Promise<boolean> {
  const tx = transporter();
  if (!tx) { console.warn("[email] SMTP não configurado — pulando", opts.assunto); return false; }
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM ?? `Mídia Indoor <noreply@tthreedigital.com.br>`,
      to: opts.para,
      subject: opts.assunto,
      html: opts.html,
    });
    return true;
  } catch (err) {
    console.error("[email] falha ao enviar", err);
    return false;
  }
}

/** Notifica o anunciante quando o suporte responde um chamado. */
export async function enviarRespostaChamado(opts: { nome: string; email: string; assunto: string; mensagem: string }): Promise<boolean> {
  const b = await getBranding();
  const primeiro = opts.nome.split(" ")[0] || opts.nome;
  const trecho = opts.mensagem.length > 400 ? opts.mensagem.slice(0, 400) + "…" : opts.mensagem;
  const conteudo = `
    <p>Olá, <strong>${primeiro}</strong>!</p>
    <p>Você tem uma nova resposta no seu chamado <strong>"${opts.assunto}"</strong>:</p>
    <blockquote style="margin:14px 0;padding:12px 16px;border-left:3px solid ${b.cor};background:#f7f5ff;border-radius:6px;color:#374151;white-space:pre-wrap;">${trecho}</blockquote>
    <p>Acesse seu painel pra ver a conversa completa e responder.</p>`;
  return enviar({
    para: opts.email,
    assunto: `Resposta ao seu chamado: ${opts.assunto}`,
    html: await wrap("Você recebeu uma resposta", conteudo, { texto: "Ver chamado", url: `${APP_URL}/painel` }),
  });
}

/** Envia o relatório (proof-of-play) de uma campanha pro anunciante. */
export async function enviarRelatorioCampanha(opts: {
  nome: string; email: string; campanha: string; periodo: string;
  plays: number; duracao: number;
  porLocal?: { local: string; plays: number }[];
}): Promise<boolean> {
  const b = await getBranding();
  const primeiro = opts.nome.split(" ")[0] || opts.nome;
  const linhas = (opts.porLocal ?? []).map(p =>
    `<tr><td style="padding:6px 10px;border-top:1px solid #eee;">${p.local}</td><td style="padding:6px 10px;border-top:1px solid #eee;text-align:right;font-weight:600;">${p.plays}</td></tr>`
  ).join("");
  const tabela = linhas
    ? `<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:14px;">
         <thead><tr><th style="padding:6px 10px;text-align:left;color:#6b7280;">Local / Tela</th><th style="padding:6px 10px;text-align:right;color:#6b7280;">Exibições</th></tr></thead>
         <tbody>${linhas}</tbody>
       </table>`
    : "";
  const conteudo = `
    <p>Olá, <strong>${primeiro}</strong>!</p>
    <p>Segue o relatório de exibições da campanha <strong>"${opts.campanha}"</strong> (${opts.periodo}):</p>
    <div style="margin:16px 0;padding:16px;background:#f7f5ff;border-radius:10px;text-align:center;">
      <div style="font-size:30px;font-weight:800;color:${b.cor};">${opts.plays}</div>
      <div style="font-size:13px;color:#6b7280;">inserções exibidas · ${Math.round(opts.duracao)}s no total</div>
    </div>
    ${tabela}
    <p style="margin-top:16px;">Obrigado por anunciar com a ${b.nome}! 🎉</p>`;
  return enviar({
    para: opts.email,
    assunto: `Relatório da campanha: ${opts.campanha}`,
    html: await wrap("Relatório de exibições", conteudo, { texto: "Ver no painel", url: `${APP_URL}/painel` }),
  });
}

/** Avisa o anunciante que a campanha entrou no ar. */
export async function enviarCampanhaNoAr(opts: { nome: string; email: string; campanha: string; periodo: string; locais: string[] }): Promise<boolean> {
  const b = await getBranding();
  const primeiro = opts.nome.split(" ")[0] || opts.nome;
  const conteudo = `
    <p>Olá, <strong>${primeiro}</strong>! 🎬</p>
    <p>Sua campanha <strong>"${opts.campanha}"</strong> está <strong style="color:${b.cor};">no ar</strong>!</p>
    <p style="margin-top:12px;"><strong>Período:</strong> ${opts.periodo}<br>
       <strong>Locais:</strong> ${opts.locais.join(", ") || "—"}</p>
    <p style="margin-top:14px;">Acompanhe as exibições em tempo real no seu painel.</p>`;
  return enviar({
    para: opts.email,
    assunto: `Sua campanha "${opts.campanha}" está no ar 🎬`,
    html: await wrap("Campanha no ar!", conteudo, { texto: "Ver no painel", url: `${APP_URL}/painel` }),
  });
}

/** Alerta operacional pro master (atendimento). Usado por crons/health-checks. */
export async function enviarAlertaMaster(opts: { assunto: string; conteudoHtml: string; para?: string }): Promise<boolean> {
  const dest = opts.para ?? process.env.MASTER_EMAIL ?? "atendimento@tthreedigital.com.br";
  return enviar({
    para: dest,
    assunto: opts.assunto,
    html: await wrap("Alerta operacional", opts.conteudoHtml),
  });
}

/** E-mail de boas-vindas (enviado quando a conta é ativada). */
export async function enviarBoasVindas(opts: { nome: string; email: string; empresa: string }): Promise<boolean> {
  const b = await getBranding();
  const primeiro = opts.nome.split(" ")[0] || opts.nome;
  const conteudo = `
    <p>Olá, <strong>${primeiro}</strong>! 🎉</p>
    <p>Sua conta da <strong>${b.nome}</strong> para <strong>${opts.empresa}</strong> está
       <strong style="color:${b.cor};">ativa</strong>. Já pode subir suas mídias e parear suas TVs.</p>
    <p style="margin-top:18px;font-weight:600;">Próximos passos:</p>
    <ol style="padding-left:18px;color:#374151;">
      <li>Acesse seu painel e faça login.</li>
      <li>Envie suas imagens e vídeos.</li>
      <li>Instale o app player na TV e pareie ela pelo painel.</li>
    </ol>
    <p style="margin-top:18px;">Qualquer dúvida, é só responder este e-mail ou chamar no WhatsApp.</p>`;
  return enviar({
    para: opts.email,
    assunto: `Bem-vindo à ${b.nome}! Sua conta está ativa 🚀`,
    html: await wrap("Sua conta está ativa!", conteudo, { texto: "Acessar meu painel", url: `${APP_URL}/painel` }),
  });
}
