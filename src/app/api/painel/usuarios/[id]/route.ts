import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { usuarioUpdateSchema, senhaSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { z } from "zod";
import bcrypt from "bcryptjs";

const senhaUpdateSchema = z.object({ senha: senhaSchema });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "usuario:editar")) return forbidden();

  let body: z.output<typeof usuarioUpdateSchema>;
  try {
    body = await parseBodyOrThrow(req, usuarioUpdateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  if (Object.keys(body).length === 0) return badRequest("Nenhum campo para atualizar");

  // prevent demoting yourself
  if (params.id === sub && body.role) {
    return badRequest("Não é possível alterar seu próprio papel");
  }

  try {
    const sets: string[]    = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.nome     !== undefined) { sets.push(`nome = $${i++}`);     values.push(body.nome); }
    if (body.email    !== undefined) { sets.push(`email = $${i++}`);    values.push(body.email); }
    if (body.role     !== undefined) { sets.push(`role = $${i++}`);     values.push(body.role); }
    if (body.telefone !== undefined) { sets.push(`telefone = $${i++}`); values.push(body.telefone); }
    if (body.ativo    !== undefined) { sets.push(`ativo = $${i++}`);    values.push(body.ativo); }

    sets.push(`updated_at = NOW()`);
    values.push(params.id, empresaId);

    const usuario = await queryOne(
      `UPDATE usuarios SET ${sets.join(", ")}
       WHERE id = $${i} AND empresa_id = $${i + 1} AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    if (!usuario) return notFound("Usuário não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Usuarios/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "usuario:deletar")) return forbidden();

  if (params.id === sub) return badRequest("Não é possível excluir sua própria conta");

  try {
    const usuario = await queryOne(
      `UPDATE usuarios SET deleted_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [params.id, empresaId]
    );

    if (!usuario) return notFound("Usuário não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Usuarios/DELETE]", err);
    return serverError();
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();

  // only the user themselves or admins can reset passwords
  const isSelf  = params.id === sub;
  const isAdmin = temPermissao(role, "usuario:editar");
  if (!isSelf && !isAdmin) return forbidden();

  let body: z.output<typeof senhaUpdateSchema>;
  try {
    body = await parseBodyOrThrow(req, senhaUpdateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const hash = await bcrypt.hash(body.senha, 12);
    const usuario = await queryOne(
      `UPDATE usuarios SET senha_hash = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [hash, params.id, empresaId]
    );

    if (!usuario) return notFound("Usuário não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Usuarios/PUT]", err);
    return serverError();
  }
}
