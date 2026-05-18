/**
 * POST /api/admin/redes/[id]/vincular
 * Body: { empresa_id, is_matriz?, nome_filial?, ordem_filial? }
 *
 * Vincula uma empresa existente como filial da rede.
 * Se is_matriz=true, desmarca outras matrizes da mesma rede.
 *
 * DELETE /api/admin/redes/[id]/vincular?empresa_id=...
 *   Desvincula filial.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  empresa_id:   z.string().uuid(),
  is_matriz:    z.boolean().optional(),
  nome_filial:  z.string().max(100).optional(),
  ordem_filial: z.number().int().min(0).max(999).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  try {
    const rede = await queryOne<{ id: string }>(
      `SELECT id FROM redes WHERE id = $1 AND deleted_at IS NULL`, [params.id]
    );
    if (!rede) return notFound("Rede não encontrada");

    if (body.is_matriz) {
      await query(
        `UPDATE empresas SET is_matriz = FALSE WHERE rede_id = $1`,
        [params.id]
      );
    }

    const r = await queryOne<{ id: string }>(
      `UPDATE empresas
          SET rede_id      = $1,
              is_matriz    = COALESCE($2, FALSE),
              nome_filial  = COALESCE($3, nome_filial),
              ordem_filial = COALESCE($4, ordem_filial),
              updated_at   = NOW()
        WHERE id = $5 AND deleted_at IS NULL
        RETURNING id`,
      [params.id, body.is_matriz ?? false, body.nome_filial ?? null,
       body.ordem_filial ?? null, body.empresa_id]
    );
    if (!r) return notFound("Empresa não encontrada");

    // Replica produtos da matriz pra esta filial se cardapio_sincronizado
    // (best-effort — replicação real é feita pelas queries que usam rede_id)
    return ok({ vinculado: true });
  } catch (err) {
    console.error("[Admin/Redes/Vincular]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const empresaId = req.nextUrl.searchParams.get("empresa_id");
  if (!empresaId) return badRequest("Param 'empresa_id' obrigatório");

  try {
    await queryOne(
      `UPDATE empresas
          SET rede_id = NULL, is_matriz = FALSE, updated_at = NOW()
        WHERE id = $1 AND rede_id = $2`,
      [empresaId, params.id]
    );
    return ok({ desvinculado: true });
  } catch (err) {
    console.error("[Admin/Redes/Desvincular]", err);
    return serverError();
  }
}
