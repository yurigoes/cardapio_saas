/**
 * GET /api/admin/usuarios/[id]      Master only. Detalhe.
 * PATCH /api/admin/usuarios/[id]    Master only.
 *   Body parcial: { nome?, email?, senha?, role?, empresa_id?, ativo? }
 *   Permite vincular/desvincular empresa, mudar role, etc.
 * DELETE /api/admin/usuarios/[id]   Soft delete (deleted_at = NOW)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { invalidarPermissoesCache } from "@/lib/auth/rbac";

const ROLES = ["master","suporte","admin","gerente","garcom","cozinha","atendente","financeiro","delivery","motoboy","cliente"] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const u = await queryOne(
    `SELECT u.id, u.nome, u.email, u.role, u.ativo, u.empresa_id,
            u.email_from, u.cargo, u.assinatura_html, u.telefone,
            u.created_at::text, u.ultimo_login::text,
            e.nome_fantasia AS empresa_nome
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [params.id]
  );
  if (!u) return notFound("Usuário não encontrado");
  return ok({ usuario: u });
}

const patchSchema = z.object({
  nome:            z.string().min(2).max(120).optional(),
  email:           z.string().email().max(120).optional(),
  senha:           z.string().min(8).max(72).optional(),
  role:            z.enum(ROLES).optional(),
  empresa_id:      z.string().uuid().nullable().optional(),
  ativo:           z.boolean().optional(),
  email_from:      z.string().email().nullable().optional(),
  cargo:           z.string().max(80).nullable().optional(),
  assinatura_html: z.string().max(5000).nullable().optional(),
  telefone:        z.string().max(30).nullable().optional(),
}).strict();

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

  if (Object.keys(body).length === 0) return badRequest("Nada pra atualizar");

  // Validações cruzadas
  if (body.role && (body.role === "master" || body.role === "suporte")) {
    body.empresa_id = null;
  }
  if (body.role && body.role !== "master" && body.role !== "suporte"
      && body.empresa_id === undefined) {
    // Vai precisar checar se empresa atual é null e role exige empresa
    const atual = await queryOne<{ empresa_id: string | null }>(
      `SELECT empresa_id FROM usuarios WHERE id = $1`, [params.id]
    );
    if (!atual?.empresa_id) {
      return badRequest(`role '${body.role}' exige empresa_id`);
    }
  }

  // Hash senha se fornecida
  let senhaHash: string | null = null;
  if (body.senha) senhaHash = await bcrypt.hash(body.senha, 10);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (body.nome            !== undefined) { sets.push(`nome = $${i++}`);            vals.push(body.nome); }
  if (body.email           !== undefined) { sets.push(`email = LOWER($${i++})`);    vals.push(body.email); }
  if (senhaHash)                          { sets.push(`senha_hash = $${i++}`);      vals.push(senhaHash); }
  if (body.role            !== undefined) { sets.push(`role = $${i++}`);            vals.push(body.role); }
  if (body.empresa_id      !== undefined) { sets.push(`empresa_id = $${i++}`);      vals.push(body.empresa_id); }
  if (body.ativo           !== undefined) { sets.push(`ativo = $${i++}`);           vals.push(body.ativo); }
  if (body.email_from      !== undefined) { sets.push(`email_from = $${i++}`);      vals.push(body.email_from); }
  if (body.cargo           !== undefined) { sets.push(`cargo = $${i++}`);           vals.push(body.cargo); }
  if (body.assinatura_html !== undefined) { sets.push(`assinatura_html = $${i++}`); vals.push(body.assinatura_html); }
  if (body.telefone        !== undefined) { sets.push(`telefone = $${i++}`);        vals.push(body.telefone); }
  sets.push(`updated_at = NOW()`);
  vals.push(params.id);

  try {
    const r = await queryOne<{ id: string; role: string }>(
      `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${i} AND deleted_at IS NULL
       RETURNING id, role`,
      vals
    );
    if (!r) return notFound("Usuário não encontrado");

    // Invalida cache de permissões pra esse usuário
    invalidarPermissoesCache("user", r.id);

    return ok({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return badRequest("E-mail já em uso");
    }
    console.error("[Admin/Usuarios/PATCH]", err);
    return serverError();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  if (params.id === auth.payload.sub) {
    return badRequest("Não pode deletar a si mesmo");
  }

  await queryOne(
    `UPDATE usuarios SET deleted_at = NOW(), ativo = false WHERE id = $1`,
    [params.id]
  );
  invalidarPermissoesCache("user", params.id);
  return ok({ deletado: true });
}
