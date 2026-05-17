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
  validado:   z.boolean(),
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
    const r = await queryOne<{ id: string }>(
      `UPDATE empresa_documentos
          SET validado     = $1,
              validado_por = $2,
              validado_em  = CASE WHEN $1 THEN NOW() ELSE NULL END,
              observacao   = COALESCE($3, observacao)
        WHERE id = $4 AND empresa_id = $5
        RETURNING id`,
      [body.validado, auth.payload.sub, body.observacao ?? null, body.doc_id, params.id]
    );
    if (!r) return notFound();
    return ok({ id: r.id, validado: body.validado });
  } catch (err) {
    console.error("[Admin/Docs/PATCH]", err);
    return serverError();
  }
}
