/**
 * PATCH  /api/painel/api-keys/[id]   → ativa/desativa, renomeia
 * DELETE /api/painel/api-keys/[id]   → revoga (soft delete)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";

const ALLOWED = ["master", "admin"];

const patchSchema = z.object({
  nome:  z.string().min(1).max(100).optional(),
  ativo: z.boolean().optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId, sub } = auth.payload;

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let i = 1;
  if (body.nome  !== undefined) { sets.push(`nome  = $${i++}`); vals.push(body.nome); }
  if (body.ativo !== undefined) { sets.push(`ativo = $${i++}`); vals.push(body.ativo); }
  vals.push(params.id, empresaId);

  try {
    const r = await queryOne(
      `UPDATE api_keys SET ${sets.join(", ")}
        WHERE id = $${i++} AND empresa_id = $${i} AND deleted_at IS NULL
        RETURNING id`,
      vals
    );
    if (!r) return notFound();
    await auditLog({ acao: "api_key:atualizar", recurso: "api_keys", recursoId: params.id, dadosNovos: body, usuario: { sub, empresaId } });
    return ok({ updated: true });
  } catch (err) {
    console.error("[ApiKeys/PATCH]", err);
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
  const { empresaId, sub } = auth.payload;

  try {
    const r = await queryOne(
      `UPDATE api_keys SET deleted_at = NOW(), ativo = false, updated_at = NOW()
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [params.id, empresaId]
    );
    if (!r) return notFound();
    await auditLog({ acao: "api_key:revogar", recurso: "api_keys", recursoId: params.id, usuario: { sub, empresaId } });
    return ok({ deleted: true });
  } catch (err) {
    console.error("[ApiKeys/DELETE]", err);
    return serverError();
  }
}
