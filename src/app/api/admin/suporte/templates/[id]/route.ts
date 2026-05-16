/**
 * PATCH/DELETE /api/admin/suporte/templates/[id]
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";

const patchSchema = z.object({
  nome:     z.string().min(2).max(120).optional(),
  assunto:  z.string().max(200).nullable().optional(),
  conteudo: z.string().min(3).max(20_000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof patchSchema>;
  try { body = patchSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (body.nome     !== undefined) { sets.push(`nome = $${i++}`);     vals.push(body.nome); }
  if (body.assunto  !== undefined) { sets.push(`assunto = $${i++}`);  vals.push(body.assunto); }
  if (body.conteudo !== undefined) {
    sets.push(`conteudo = $${i++}`); vals.push(body.conteudo);
    const vars = Array.from(new Set(
      Array.from(body.conteudo.match(/\{(\w+)\}/g) || []).map(m => m.slice(1, -1))
    ));
    sets.push(`variaveis = $${i++}::text[]`); vals.push(vars);
  }
  sets.push(`updated_at = NOW()`);
  vals.push(params.id);

  const r = await queryOne<{ id: string }>(
    `UPDATE suporte_templates_msg SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
    vals
  ).catch((err) => { console.error("[Templates/PATCH]", err); return null; });
  if (!r) return notFound("Template não encontrado");

  return ok({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const r = await queryOne<{ id: string }>(
    `DELETE FROM suporte_templates_msg WHERE id = $1 RETURNING id`,
    [params.id]
  );
  if (!r) return notFound("Template não encontrado");

  return ok({ removido: true });
}
