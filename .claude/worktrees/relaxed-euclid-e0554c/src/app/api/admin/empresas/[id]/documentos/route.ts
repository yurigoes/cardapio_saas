/**
 * GET   /api/admin/empresas/[id]/documentos              → lista todos
 * PATCH /api/admin/empresas/[id]/documentos              → { doc_id, validado, observacao? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError, notFound } from "@/lib/utils/response";

const ALLOWED = ["master", "suporte"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  try {
    const rows = await query(
      `SELECT id, tipo, nome_arquivo, url, tamanho, mime,
              COALESCE(status, CASE WHEN validado THEN 'aprovado' ELSE 'pendente' END) AS status,
              validado, validado_em, observacao, created_at
         FROM empresa_documentos
        WHERE empresa_id = $1
        ORDER BY created_at DESC`,
      [params.id]
    );
    return ok(rows);
  } catch (err) {
    console.error("[Admin/Docs/GET]", err);
    return serverError();
  }
}

const validarSchema = z.object({
  doc_id:     z.string().uuid(),
  status:     z.enum(["pendente", "aprovado", "rejeitado"]),
  observacao: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  let body: z.infer<typeof validarSchema>;
  try { body = validarSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const aprovado = body.status === "aprovado";
    const r = await queryOne<{ id: string }>(
      `UPDATE empresa_documentos
          SET status       = $1,
              validado     = $2,
              validado_por = $3,
              validado_em  = CASE WHEN $2 THEN NOW() ELSE NULL END,
              observacao   = COALESCE($4, observacao)
        WHERE id = $5 AND empresa_id = $6
        RETURNING id`,
      [body.status, aprovado, auth.payload.sub, body.observacao ?? null, body.doc_id, params.id]
    );
    if (!r) return notFound();

    // Atualiza status cadastral da empresa baseado nos docs
    // - Se tem algum rejeitado → continua em_analise (cliente reenvia)
    // - Se todos os obrigatórios estão aprovados → marca cadastro como aprovado
    await queryOne(
      `WITH stats AS (
         SELECT COUNT(*) FILTER (WHERE status = 'rejeitado') AS rej,
                COUNT(*) FILTER (WHERE status = 'pendente')  AS pend,
                COUNT(*) FILTER (WHERE status = 'aprovado')  AS apr
           FROM empresa_documentos WHERE empresa_id = $1
       )
       UPDATE empresas
          SET cadastro_status = CASE
            WHEN (SELECT rej FROM stats) > 0 THEN 'em_analise'
            WHEN (SELECT pend FROM stats) > 0 THEN 'em_analise'
            WHEN (SELECT apr FROM stats) >= 4 THEN 'aprovado'
            ELSE cadastro_status
          END
        WHERE id = $1`,
      [params.id]
    ).catch(() => {});

    return ok({ id: r.id, status: body.status });
  } catch (err) {
    console.error("[Admin/Docs/PATCH]", err);
    return serverError();
  }
}
