/**
 * Wrapper HTML padrão pra emails do suporte.
 * Conteúdo do template (vindo do banco) é colocado no meio do corpo.
 * Cor do header muda conforme urgência:
 *  - verde  (normal): #10b981
 *  - azul   (info):   #3b82f6
 *  - amarelo (atenção): #f59e0b
 *  - vermelho (urgente): #ef4444
 */
export type Urgencia = "normal" | "info" | "atencao" | "urgente";

const CORES: Record<Urgencia, { bg: string; label: string }> = {
  normal:   { bg: "#10b981", label: "" },
  info:     { bg: "#3b82f6", label: "ℹ INFORMATIVO" },
  atencao:  { bg: "#f59e0b", label: "⚠ ATENÇÃO" },
  urgente:  { bg: "#ef4444", label: "🚨 URGENTE" },
};

export interface WrapperVars {
  saas_nome:     string;
  saas_logo?:    string | null;
  saas_site?:    string | null;
  saas_whatsapp?: string | null;
  titulo:        string;
  operador?:     string;
  cargo?:        string;
  email_op?:     string;
  link?:         string;        // pra "Ver chamado"
  ano:           number;
}

export function wrapEmail(
  conteudo: string,
  urgencia: Urgencia,
  vars: WrapperVars
): string {
  const cor = CORES[urgencia] ?? CORES.normal;
  const logo = vars.saas_logo
    ? `<img src="${vars.saas_logo}" alt="${vars.saas_nome}" style="max-height:48px;max-width:200px;margin-bottom:8px;">`
    : "";

  const tagUrgencia = cor.label
    ? `<div style="background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:4px;display:inline-block;margin-bottom:8px;letter-spacing:.5px;">${cor.label}</div>`
    : "";

  const footerOperador = vars.operador
    ? `<div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:24px;font-size:13px;color:#6b7280;">
         <strong style="color:#1f2937;">${vars.operador}</strong>${vars.cargo ? ` · ${vars.cargo}` : ""}
         ${vars.email_op ? `<br><a href="mailto:${vars.email_op}" style="color:${cor.bg};text-decoration:none;">${vars.email_op}</a>` : ""}
       </div>`
    : "";

  const btnVerChamado = vars.link
    ? `<p style="text-align:center;margin:20px 0;">
         <a href="${vars.link}" style="display:inline-block;background:${cor.bg};color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver chamado</a>
       </p>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;background:#f4f6f8;color:#1a1f2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:20px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:${cor.bg};padding:24px 32px;text-align:center;">
          ${logo}
          ${tagUrgencia}
          <h1 style="color:#fff;font-size:20px;margin:0;font-weight:600;">${vars.titulo}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;font-size:15px;line-height:1.6;">
          ${conteudo}
          ${btnVerChamado}
          ${footerOperador}
        </td></tr>
        <tr><td style="background:#f4f6f8;padding:14px 32px;text-align:center;font-size:12px;color:#888;">
          © ${vars.ano} ${vars.saas_nome}${vars.saas_site ? ` · <a href="${vars.saas_site}" style="color:${cor.bg};text-decoration:none;">${vars.saas_site}</a>` : ""}
          ${vars.saas_whatsapp ? `<br>WhatsApp: ${vars.saas_whatsapp}` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
