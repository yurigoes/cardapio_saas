/**
 * PATCH  /api/admin/cobrancas-avulsas/[id]  → marca paga / atualiza
 * DELETE /api/admin/cobrancas-avulsas/[id]  → cancela
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "financeiro"];

const schema = z.object({
  status:    z.enum(["aberta","paga","atrasada","cancelada"]).optional(),
  pago_via:  z.string().max(30).nullable().optional(),
  pago_em:   z.string().datetime().nullable().optional(),
  valor:     z.number().positive().optional(),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  motivo:    z.string().max(1000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const entries = Object.entries(body).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return badRequest("Nada para atualizar");

  const sets: string[] = ["atualizado_em = NOW()"];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of entries) {
    sets.push(`${k} = $${i++}`); vals.push(v);
  }
  // Quando marca paga sem fornecer pago_em, usa NOW()
  if (body.status === "paga" && body.pago_em === undefined) {
    sets.push(`pago_em = NOW()`);
  }
  vals.push(params.id);

  try {
    const r = await queryOne<{ id: string; empresa_id: string }>(
      `UPDATE cobrancas_avulsas SET ${sets.join(", ")} WHERE id = $${i} RETURNING id, empresa_id`,
      vals
    );
    if (!r) return notFound();

    // Se marcou como paga, tenta desbloquear empresa
    if (body.status === "paga") {
      await queryOne(
        `UPDATE empresas SET bloqueado_inadimplencia = FALSE, bloqueado_motivo = NULL
          WHERE id = $1
            AND NOT EXISTS (
              SELECT 1 FROM cobrancas_avulsas
               WHERE empresa_id = $1 AND status IN ('aberta','atrasada')
                 AND vencimento < CURRENT_DATE - INTERVAL '1 day'
            )
            AND NOT EXISTS (
              SELECT 1 FROM mensalidades
               WHERE empresa_id = $1 AND status IN ('aberta','atrasada')
                 AND vencimento < CURRENT_DATE - INTERVAL '1 day'
            )`,
        [r.empresa_id]
      ).catch(() => {});
    }

    return ok({ updated: true });
  } catch (err) {
    console.error("[CobrAv/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  try {
    await queryOne(
      `UPDATE cobrancas_avulsas SET status = 'cancelada', atualizado_em = NOW() WHERE id = $1`,
      [params.id]
    );
    return ok({ cancelada: true });
  } catch { return serverError(); }
}
