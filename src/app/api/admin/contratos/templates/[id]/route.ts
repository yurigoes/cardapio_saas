/**
 * GET    /api/admin/contratos/templates/[id]
 * PATCH  /api/admin/contratos/templates/[id]
 * DELETE /api/admin/contratos/templates/[id]
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  versao:        z.string().min(1).max(50).optional(),
  titulo:        z.string().min(3).max(200).optional(),
  descricao:     z.string().max(500).nullable().optional(),
  conteudo_html: z.string().min(10).optional(),
  tipo:          z.enum(["onboarding", "aditivo", "servico_extra"]).optional(),
  ativo:         z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await queryOne(
      `SELECT id, versao, titulo, descricao, conteudo_html, tipo, ativo, created_at
         FROM contrato_templates WHERE id = $1`, [params.id]
    );
    if (!r) return notFound();
    return ok(r);
  } catch { return serverError(); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const entries = Object.entries(body).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return badRequest("Nada para atualizar");

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of entries) {
    sets.push(`${k} = $${i++}`); vals.push(v);
  }
  vals.push(params.id);

  try {
    const r = await queryOne<{ id: string }>(
      `UPDATE contrato_templates SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
      vals
    );
    if (!r) return notFound();
    return ok({ id: r.id });
  } catch (err) {
    console.error("[Templates/PATCH]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verifica se há contratos aceitos vinculados
    const usado = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM empresa_contratos WHERE template_id = $1`,
      [params.id]
    );
    if (Number(usado?.n ?? "0") > 0) {
      // Só desativa pra não quebrar contratos aceitos
      await queryOne(
        `UPDATE contrato_templates SET ativo = FALSE WHERE id = $1`, [params.id]
      );
      return ok({ desativado: true, motivo: "Template em uso — apenas desativado" });
    }
    await queryOne(`DELETE FROM contrato_templates WHERE id = $1`, [params.id]);
    return ok({ removido: true });
  } catch (err) {
    console.error("[Templates/DELETE]", err);
    return serverError();
  }
}
