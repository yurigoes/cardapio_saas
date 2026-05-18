/**
 * PATCH  /api/painel/integracoes/terminais/[id]  → atualiza
 * DELETE /api/painel/integracoes/terminais/[id]  → desativa (não apaga histórico)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

const schema = z.object({
  nome:         z.string().min(2).max(80).optional(),
  ativo:        z.boolean().optional(),
  credenciais:  z.record(z.unknown()).optional(),
  config:       z.record(z.unknown()).optional(),
  padrao_pdv:   z.boolean().optional(),
  padrao_totem: z.boolean().optional(),
  observacao:   z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ALLOWED.includes(role)) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const entries = Object.entries(body).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return badRequest("Nada para atualizar");

  // Garante dono
  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM empresa_terminais WHERE id = $1 AND empresa_id = $2`,
    [params.id, empresaId]
  );
  if (!existente) return notFound();

  try {
    if (body.padrao_pdv) {
      await query(`UPDATE empresa_terminais SET padrao_pdv = FALSE WHERE empresa_id = $1 AND id <> $2`, [empresaId, params.id]);
    }
    if (body.padrao_totem) {
      await query(`UPDATE empresa_terminais SET padrao_totem = FALSE WHERE empresa_id = $1 AND id <> $2`, [empresaId, params.id]);
    }

    const sets: string[] = ["updated_at = NOW()"];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of entries) {
      if (k === "credenciais" || k === "config") {
        sets.push(`${k} = $${i++}::jsonb`);
        vals.push(JSON.stringify(v));
      } else {
        sets.push(`${k} = $${i++}`); vals.push(v);
      }
    }
    vals.push(params.id);
    await queryOne(`UPDATE empresa_terminais SET ${sets.join(", ")} WHERE id = $${i}`, vals);
    return ok({ updated: true });
  } catch (err) {
    console.error("[Terminais/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!ALLOWED.includes(role)) return forbidden();

  try {
    await queryOne(
      `UPDATE empresa_terminais SET ativo = FALSE, updated_at = NOW()
        WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    return ok({ desativado: true });
  } catch {
    return serverError();
  }
}
