/**
 * PATCH /api/admin/empresas/[id]/modulos-extras/[modulo]
 * Body: { pago?: boolean, pago_via?: string, expira_em?: string, observacao?: string }
 *
 * Usado pra:
 *  - Master marca à la carte como pago (desbloqueia + estende vigência por 30 dias se não informar)
 *  - Estender vigência de experimental
 *  - Atualizar observação
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  pago:       z.boolean().optional(),
  pago_via:   z.string().max(30).optional(),
  expira_em:  z.string().datetime().nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; modulo: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const sets: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  let i = 1;

  if (body.pago !== undefined) {
    sets.push(`pago = $${i++}`);                 vals.push(body.pago);
    sets.push(`pago_em = ${body.pago ? "NOW()" : "NULL"}`);
    sets.push(`pago_por_usuario_id = $${i++}`);  vals.push(body.pago ? auth.payload.sub : null);
    if (body.pago) {
      // Pagou → desbloqueia e estende vigência 30 dias se não informar expira_em
      sets.push(`bloqueado = FALSE`);
      if (body.expira_em === undefined) {
        sets.push(`expira_em = NOW() + INTERVAL '30 days'`);
      }
    }
  }
  if (body.pago_via !== undefined)   { sets.push(`pago_via = $${i++}`);   vals.push(body.pago_via); }
  if (body.expira_em !== undefined)  { sets.push(`expira_em = $${i++}`);  vals.push(body.expira_em); }
  if (body.observacao !== undefined) { sets.push(`observacao = $${i++}`); vals.push(body.observacao); }

  vals.push(params.id);
  vals.push(params.modulo);

  try {
    const r = await queryOne<{ id: string }>(
      `UPDATE empresa_modulos_extras
          SET ${sets.join(", ")}
        WHERE empresa_id = $${i++} AND modulo = $${i}
        RETURNING id`,
      vals
    );
    if (!r) return notFound();
    return ok({ updated: true });
  } catch (err) {
    console.error("[ModExtras/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
