/**
 * POST /api/painel/suporte/chamados/[id]/email
 * Body: { para, assunto, html }
 *
 * Master/suporte envia email customizado vinculado ao chamado.
 * - From: usa email_from do operador (ex: joao@three.com.br)
 * - Display name: nome do operador
 * - Anexa assinatura_html no rodapé automaticamente
 * - Loga em suporte_emails_log + cria mensagem 'sistema' no chat
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, notFound } from "@/lib/utils/response";
import { enfileirar } from "@/lib/email/smtp";

const schema = z.object({
  para:    z.string().email().max(120),
  assunto: z.string().min(3).max(200),
  html:    z.string().min(10).max(50_000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const operador = await queryOne<{
      nome: string; email: string;
      email_from: string | null;
      cargo: string | null;
      assinatura_html: string | null;
    }>(
      `SELECT nome, email, email_from, cargo, assinatura_html
         FROM usuarios WHERE id = $1`,
      [auth.payload.sub]
    );
    if (!operador) return forbidden();

    const chamado = await queryOne<{ id: string; assunto: string }>(
      `SELECT id, assunto FROM suporte_chamados WHERE id = $1`,
      [params.id]
    );
    if (!chamado) return notFound("Chamado não encontrado");

    // Monta from + assinatura
    const fromEmail = operador.email_from || operador.email;
    const fromDisplay = `${operador.nome} <${fromEmail}>`;

    // Default minimal signature se não tiver custom
    const assinatura = operador.assinatura_html || `
      <hr style="margin-top:20px;border:0;border-top:1px solid #ddd">
      <p style="color:#888;font-size:12px;margin:8px 0 0">
        <strong>${operador.nome}</strong>${operador.cargo ? ` · ${operador.cargo}` : ""}<br>
        Three Digital — Suporte<br>
        <a href="mailto:${fromEmail}" style="color:#666">${fromEmail}</a>
      </p>
    `;

    const htmlCompleto = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:20px">
        ${body.html}
        ${assinatura}
        <p style="color:#aaa;font-size:10px;margin-top:30px">
          Ref. chamado #${chamado.id.slice(0, 8)} — ${chamado.assunto}
        </p>
      </div>
    `;

    // Envia via fila SMTP
    let erro: string | null = null;
    try {
      await enfileirar({
        para:    body.para,
        evento:  "manual",
        assunto: body.assunto,
        html:    htmlCompleto,
        // SMTP override de from (se driver suportar)
        contexto: { from: fromDisplay, replyTo: fromEmail },
      });
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    // Log
    await queryOne(
      `INSERT INTO suporte_emails_log (chamado_id, enviado_por, enviado_de, para, assunto, html, erro)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [params.id, auth.payload.sub, fromEmail, body.para, body.assunto, htmlCompleto, erro]
    ).catch(() => {});

    // Cria mensagem 'sistema' no chat pra registrar
    await queryOne(
      `INSERT INTO suporte_mensagens (chamado_id, autor_id, autor_tipo, autor_nome, texto, interno)
       VALUES ($1, $2, 'sistema', $3, $4, FALSE)`,
      [params.id, auth.payload.sub, operador.nome,
       `📧 ${operador.nome} enviou email para ${body.para}: "${body.assunto}"${erro ? ` — ❌ falha: ${erro}` : ""}`]
    ).catch(() => {});

    if (erro) return serverError(`Email não enviado: ${erro}`);
    return ok({ enviado: true, de: fromEmail, para: body.para });
  } catch (err) {
    console.error("[Suporte/Email]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
