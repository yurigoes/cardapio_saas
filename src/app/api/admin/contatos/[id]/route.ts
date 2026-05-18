/**
 * PATCH  /api/admin/contatos/[id]  → marca status / responde
 *   { status?, resposta_texto?, observacoes?, enviar_email? }
 *
 * Se enviar_email = true e resposta_texto preenchido, dispara email para
 * o contato com a resposta usando o template padrão.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "suporte"];

const schema = z.object({
  status:         z.enum(["novo","lido","respondido","convertido","spam"]).optional(),
  resposta_texto: z.string().max(5000).optional(),
  observacoes:    z.string().max(2000).nullable().optional(),
  enviar_email:   z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const contato = await queryOne<{ id: string; nome: string; email: string }>(
    `SELECT id, nome, email FROM contatos_institucional WHERE id = $1`,
    [params.id]
  );
  if (!contato) return notFound();

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (body.status      !== undefined) { sets.push(`status = $${i++}`);         vals.push(body.status); }
  if (body.observacoes !== undefined) { sets.push(`observacoes = $${i++}`);    vals.push(body.observacoes); }
  if (body.resposta_texto !== undefined) {
    sets.push(`resposta_texto = $${i++}`);              vals.push(body.resposta_texto);
    sets.push(`respondido_em = NOW()`);
    sets.push(`respondido_por = $${i++}`);              vals.push(auth.payload.sub);
    if (!body.status) { sets.push(`status = 'respondido'`); }
  }
  if (sets.length === 0) return badRequest("Nada para atualizar");
  vals.push(params.id);

  try {
    await queryOne(
      `UPDATE contatos_institucional SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );

    let email_enviado = false;
    if (body.enviar_email && body.resposta_texto) {
      try {
        const { enfileirar } = await import("@/lib/email/smtp");
        const { wrapEmail } = await import("@/lib/suporte/email-wrapper");
        const { getSaasBranding } = await import("@/lib/branding/server");
        const branding = await getSaasBranding();
        const html = wrapEmail(
          `<p>Olá <strong>${contato.nome}</strong>,</p>
           <p>${body.resposta_texto.replace(/\n/g, "<br>")}</p>
           <p>Qualquer dúvida, é só responder este email.</p>`,
          "info",
          {
            saas_nome:     branding.nome,
            saas_logo:     branding.logo_url,
            saas_site:     branding.site,
            saas_whatsapp: branding.whatsapp,
            titulo:        "Resposta ao seu contato",
            link:          branding.site ?? undefined,
            ano:           new Date().getFullYear(),
          }
        );
        await enfileirar({
          para:    contato.email,
          evento:  "resposta-contato",
          assunto: `Re: seu contato — ${branding.nome}`,
          html,
        });
        email_enviado = true;
      } catch (e) {
        console.warn("[Contatos/PATCH] email falhou:", e);
      }
    }

    return ok({ updated: true, email_enviado });
  } catch (err) {
    console.error("[Admin/Contatos/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
