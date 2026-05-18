/**
 * GET   /api/admin/redes/[id]                 — detalhes + filiais
 * PATCH /api/admin/redes/[id]                 — atualiza
 * POST  /api/admin/redes/[id]/vincular        — vincula empresa existente como filial
 *   Body: { empresa_id, is_matriz?, nome_filial? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(_req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master" && auth.payload.role !== "suporte") return forbidden();

  try {
    const rede = await queryOne(
      `SELECT * FROM redes WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!rede) return notFound();

    const filiais = await query(
      `SELECT id, nome_fantasia, nome_filial, is_matriz, ordem_filial,
              status, cnpj, endereco_cidade, endereco_uf, created_at
         FROM empresas
        WHERE rede_id = $1 AND deleted_at IS NULL
        ORDER BY is_matriz DESC, ordem_filial ASC`,
      [params.id]
    );

    return ok({ rede, filiais });
  } catch (err) {
    console.error("[Admin/Redes/[id]/GET]", err);
    return serverError();
  }
}

const patchSchema = z.object({
  nome:                     z.string().min(2).max(120).optional(),
  cnpj_matriz:              z.string().max(18).nullable().optional(),
  razao_social:             z.string().max(200).nullable().optional(),
  logo_url:                 z.string().nullable().optional(),
  cor_primaria:             z.string().max(20).nullable().optional(),
  fidelidade_cross_filial:  z.boolean().optional(),
  cardapio_sincronizado:    z.boolean().optional(),
  plano_id:                 z.string().uuid().nullable().optional(),
  desconto_progressivo_pct: z.number().min(0).max(100).optional(),
  email_contato:            z.string().email().nullable().optional(),
  whatsapp:                 z.string().max(20).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const entries = Object.entries(body).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return badRequest("Nada para atualizar");

  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of entries) {
    sets.push(`${k} = $${i++}`); vals.push(v);
  }
  vals.push(params.id);

  try {
    const r = await queryOne<{ id: string }>(
      `UPDATE redes SET ${sets.join(", ")} WHERE id = $${i} AND deleted_at IS NULL RETURNING id`,
      vals
    );
    if (!r) return notFound();
    return ok({ id: r.id });
  } catch (err) {
    console.error("[Admin/Redes/[id]/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    // Desvincular empresas primeiro
    await query(`UPDATE empresas SET rede_id = NULL, is_matriz = FALSE WHERE rede_id = $1`, [params.id]);
    await queryOne(`UPDATE redes SET deleted_at = NOW() WHERE id = $1`, [params.id]);
    return ok({ deleted: true });
  } catch (err) {
    console.error("[Admin/Redes/[id]/DELETE]", err);
    return serverError();
  }
}
