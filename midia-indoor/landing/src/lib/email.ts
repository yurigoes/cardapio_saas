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

const ROXO       = "#7c3aed";
const ROXO_DARK  = "#5b21b6";
const APP_URL    = (process.env.APP_URL ?? "https://midiaindoor.tthreedigital.com.br").replace(/\/+$/, "");
const LOGO_URL   = process.env.BRAND_LOGO_URL
  ?? "https://minio.tthreedigital.com.br/cardapio/saas/LOGO%20BRANCA%20THREE.png";
const SAAS_NOME  = "Three Digital Mídia";
const SAAS_SITE  = "https://tthreedigital.com.br";

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

/** Wrapper HTML com a marca (header roxo + logo). */
function wrap(titulo: string, conteudoHtml: string, botao?: { texto: string; url: string }): string {
  const logo = LOGO_URL
    ? `<img src="${LOGO_URL}" alt="${SAAS_NOME}" style="max-height:46px;max-width:200px;margin-bottom:6px;">`
    : `<div style="color:#fff;font-size:20px;font-weight:800;">${SAAS_NOME}</div>`;
  const btn = botao
    ? `<p style="text-align:center;margin:26px 0;">
         <a href="${botao.url}" style="display:inline-block;background:${ROXO};color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:700;">${botao.texto}</a>
       </p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;background:#0a0a12;color:#1a1f2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.3);">
        <tr><td style="background:linear-gradient(135deg,${ROXO},${ROXO_DARK});padding:30px 32px;text-align:center;">
          ${logo}
          <h1 style="color:#fff;font-size:21px;margin:8px 0 0;font-weight:700;">${titulo}</h1>
        </td></tr>
        <tr><td style="padding:30px 32px;font-size:15px;line-height:1.65;color:#1f2937;">
          ${conteudoHtml}
          ${btn}
        </td></tr>
        <tr><td style="background:#f4f6f8;padding:16px 32px;text-align:center;font-size:12px;color:#888;">
          © ${new Date().getFullYear()} ${SAAS_NOME} · <a href="${SAAS_SITE}" style="color:${ROXO};text-decoration:none;">${SAAS_SITE.replace("https://","")}</a>
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
      from: process.env.SMTP_FROM ?? `${SAAS_NOME} <noreply@tthreedigital.com.br>`,
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

/** E-mail de boas-vindas (enviado quando a conta é ativada). */
export async function enviarBoasVindas(opts: { nome: string; email: string; empresa: string }): Promise<boolean> {
  const primeiro = opts.nome.split(" ")[0] || opts.nome;
  const conteudo = `
    <p>Olá, <strong>${primeiro}</strong>! 🎉</p>
    <p>Sua conta da <strong>${SAAS_NOME}</strong> para <strong>${opts.empresa}</strong> está
       <strong style="color:${ROXO};">ativa</strong>. Já pode subir suas mídias e parear suas TVs.</p>
    <p style="margin-top:18px;font-weight:600;">Próximos passos:</p>
    <ol style="padding-left:18px;color:#374151;">
      <li>Acesse seu painel e faça login.</li>
      <li>Envie suas imagens e vídeos.</li>
      <li>Instale o app player na TV e pareie ela pelo painel.</li>
    </ol>
    <p style="margin-top:18px;">Qualquer dúvida, é só responder este e-mail ou chamar no WhatsApp.</p>`;
  return enviar({
    para: opts.email,
    assunto: `Bem-vindo à ${SAAS_NOME}! Sua conta está ativa 🚀`,
    html: wrap("Sua conta está ativa!", conteudo, { texto: "Acessar meu painel", url: `${APP_URL}/painel` }),
  });
}
