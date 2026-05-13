/**
 * PATCH  /api/painel/impressoras/[id]  → atualiza
 * DELETE /api/painel/impressoras/[id]  → remove
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

const patchSchema = z.object({
  nome:  z.string().min(1).max(100).optional(),
  setor: z.enum(["cozinha", "bar", "balcao", "retirada", "caixa"]).optional(),
  ip:    z.string().max(45).nullable().optional(),
  porta: z.number().int().min(1).max(65535).optional(),
  largura_cols: z.number().int().min(20).max(80).optional(),
  ativa: z.boolean().optional(),
}).strict();

export async function PATCH(
  req: NextRequest, { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body)) {
    sets.push(`${k} = $${i++}`); vals.push(v);
  }
  vals.push(params.id, empresaId);

  try {
    const r = await queryOne(
      `UPDATE impressoras SET ${sets.join(", ")}
        WHERE id = $${i++} AND empresa_id = $${i}
        RETURNING id`,
      vals
    );
    if (!r) return notFound();
    return ok({ updated: true });
  } catch (err) {
    console.error("[Impressoras/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest, { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;

  try {
    const r = await queryOne(
      `DELETE FROM impressoras WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [params.id, empresaId]
    );
    if (!r) return notFound();
    return ok({ deleted: true });
  } catch (err) {
    console.error("[Impressoras/DELETE]", err);
    return serverError();
  }
}
