import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const updateSchema = z.object({
  nome:       z.string().min(2).max(100).trim().optional(),
  descricao:  z.string().max(500).trim().optional(),
  ordem:      z.number().int().min(0).optional(),
  ativo:      z.boolean().optional(),
  imagem_url: z.string().url().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cardapio:editar")) return forbidden();

  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  if (Object.keys(body).length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const sets: string[]    = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.nome      !== undefined) { sets.push(`nome = $${i++}`);       values.push(body.nome); }
    if (body.descricao !== undefined) { sets.push(`descricao = $${i++}`);  values.push(body.descricao); }
    if (body.ordem     !== undefined) { sets.push(`ordem = $${i++}`);      values.push(body.ordem); }
    if (body.ativo     !== undefined) { sets.push(`ativo = $${i++}`);      values.push(body.ativo); }
    if (body.imagem_url!== undefined) { sets.push(`imagem_url = $${i++}`); values.push(body.imagem_url); }

    sets.push(`updated_at = NOW()`);
    values.push(params.id, empresaId);

    const cat = await queryOne(
      `UPDATE categorias SET ${sets.join(", ")}
       WHERE id = $${i} AND empresa_id = $${i + 1} AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    if (!cat) return notFound("Categoria não encontrada");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Categorias/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cardapio:editar")) return forbidden();

  try {
    const cat = await queryOne(
      `UPDATE categorias SET deleted_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [params.id, empresaId]
    );

    if (!cat) return notFound("Categoria não encontrada");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Categorias/DELETE]", err);
    return serverError();
  }
}
