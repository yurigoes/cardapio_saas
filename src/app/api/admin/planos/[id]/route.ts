/**
 * GET    /api/admin/planos/[id]   — detalhes
 * PATCH  /api/admin/planos/[id]   — edita
 * DELETE /api/admin/planos/[id]   — só apaga se sem empresas vinculadas
 *                                   (caso contrário apenas desativa)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { NextResponse } from "next/server";

function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

const patchSchema = z.object({
  nome:      z.string().min(2).max(100).optional(),
  descricao: z.string().max(500).nullable().optional(),
  preco:     z.number().min(0).optional(),
  preco_mensal: z.number().min(0).optional(),
  periodo:   z.enum(["mensal", "anual", "unico"]).optional(),
  modulos:   z.array(z.string()).optional(),
  limites:   z.record(z.unknown()).optional(),
  ativo:     z.boolean().optional(),
  destaque:  z.boolean().optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }
  try {
    const r = await queryOne(
      `SELECT p.*,
              (SELECT COUNT(*) FROM empresas e WHERE e.plano_id = p.id AND e.deleted_at IS NULL) as total_empresas
         FROM planos p WHERE id = $1`,
      [params.id]
    );
    if (!r) return notFound();
    return ok(r);
  } catch (err) {
    console.error("[Admin/Planos/GET]", err);
    return serverError();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body)) {
    if (k === "modulos" || k === "limites") {
      sets.push(`${k} = $${i++}::jsonb`);
      vals.push(JSON.stringify(v));
    } else {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  vals.push(params.id);

  try {
    const r = await queryOne(
      `UPDATE planos SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
      vals
    );
    if (!r) return notFound();
    return ok({ updated: true });
  } catch (err) {
    console.error("[Admin/Planos/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  try {
    // Conta empresas vinculadas
    const r = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM empresas
        WHERE plano_id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    const total = parseInt(r?.total ?? "0", 10);

    if (total > 0) {
      // Não pode excluir — desativa pra novos cadastros
      await queryOne(
        `UPDATE planos SET ativo = false, destaque = false, updated_at = NOW() WHERE id = $1`,
        [params.id]
      );
      return NextResponse.json({
        success: false,
        code: "CONFLICT",
        error: `Plano não pode ser excluído pois ${total} empresa(s) estão usando. Foi DESATIVADO pra novos cadastros — empresas existentes continuam funcionando.`,
        data: { plano_inativado: true, empresas_vinculadas: total },
      }, { status: 409 });
    }

    // Sem vínculos — exclui de fato
    await queryOne(`DELETE FROM planos WHERE id = $1`, [params.id]);
    return ok({ deleted: true });
  } catch (err) {
    console.error("[Admin/Planos/DELETE]", err);
    return serverError();
  }
}
