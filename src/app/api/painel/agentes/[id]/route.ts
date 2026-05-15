/**
 * DELETE /api/painel/agentes/[id] — desativa (soft) agente
 * PATCH  /api/painel/agentes/[id] — atualiza nome/tipo
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin"];

const TIPOS = ["retaguarda", "terminal", "kiosk", "tv", "garcom", "impressora", "outro"] as const;
const patchSchema = z.object({
  tipo: z.enum(TIPOS).optional(),
  nome: z.string().min(2).max(100).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  if (!body.tipo && !body.nome) return badRequest("Nada para atualizar");

  try {
    const r = await queryOne(
      `UPDATE agentes
          SET tipo       = COALESCE($1, tipo),
              nome       = COALESCE($2, nome),
              updated_at = NOW()
        WHERE id = $3 AND empresa_id = $4 AND deleted_at IS NULL
        RETURNING id`,
      [body.tipo ?? null, body.nome ?? null, params.id, empresaId]
    );
    if (!r) return notFound("Agente não encontrado");
    return ok({ atualizado: true });
  } catch (err) {
    console.error("[Agentes/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const r = await queryOne<{ id: string }>(
      `UPDATE agentes
          SET deleted_at = NOW(), ativo = false, status = 'desativado',
              updated_at = NOW()
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [params.id, empresaId]
    );
    if (!r) return notFound("Agente não encontrado");

    await query(
      `INSERT INTO agentes_eventos (agente_id, empresa_id, tipo, detalhes)
       VALUES ($1, $2, 'desativado', $3::jsonb)`,
      [r.id, empresaId, JSON.stringify({ por: auth.payload.sub })]
    ).catch(() => {});

    return ok({ deletado: true });
  } catch (err) {
    console.error("[Agentes/DELETE]", err);
    return serverError();
  }
}
