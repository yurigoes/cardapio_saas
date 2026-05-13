/**
 * PATCH  /api/painel/print-agents/[id]   → ativar/desativar
 * DELETE /api/painel/print-agents/[id]   → remove (soft via ativo=false não — remove físico)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin"];

const patchSchema = z.object({
  ativo: z.boolean().optional(),
  nome:  z.string().min(1).max(100).optional(),
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

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (body.ativo !== undefined) { sets.push(`ativo = $${i++}`); vals.push(body.ativo); }
  if (body.nome  !== undefined) { sets.push(`nome  = $${i++}`); vals.push(body.nome); }
  if (sets.length === 0) return badRequest("Nenhum campo para atualizar");
  vals.push(params.id, empresaId);

  try {
    const r = await queryOne(
      `UPDATE print_agents SET ${sets.join(", ")}
        WHERE id = $${i++} AND empresa_id = $${i}
        RETURNING id`,
      vals
    );
    if (!r) return notFound();
    return ok({ updated: true });
  } catch (err) {
    console.error("[PrintAgents/PATCH]", err);
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
    const r = await queryOne(
      `DELETE FROM print_agents WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [params.id, empresaId]
    );
    if (!r) return notFound();
    return ok({ deleted: true });
  } catch (err) {
    console.error("[PrintAgents/DELETE]", err);
    return serverError();
  }
}
