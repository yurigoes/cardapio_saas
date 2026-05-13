import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { usuarioCreateSchema } from "@/lib/utils/validators";
import bcrypt from "bcryptjs";

function assertMaster(role: string) {
  if (role !== "master") throw new Error("forbidden");
}

// GET /api/admin/empresas/[id]/usuarios
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  try {
    const usuarios = await query(
      `SELECT id, nome, email, role, telefone, ativo, created_at, ultimo_login,
              bloqueado_ate, tentativas_login
       FROM usuarios
       WHERE empresa_id = $1 AND deleted_at IS NULL
       ORDER BY nome ASC`,
      [params.id]
    );
    return ok(usuarios);
  } catch (err) {
    console.error("[Admin/Empresas/Usuarios/GET]", err);
    return serverError();
  }
}

// POST /api/admin/empresas/[id]/usuarios
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  let body: z.output<typeof usuarioCreateSchema>;
  try {
    body = usuarioCreateSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const empresa = await queryOne(
      `SELECT id FROM empresas WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!empresa) return badRequest("Empresa não encontrada");

    const existing = await queryOne(
      `SELECT id FROM usuarios WHERE email = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [body.email, params.id]
    );
    if (existing) return badRequest("E-mail já cadastrado nesta empresa");

    const hash = await bcrypt.hash(body.senha, 12);

    const usuario = await queryOne<{ id: string }>(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, role, telefone, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      [params.id, body.nome, body.email, hash, body.role, body.telefone ?? null]
    );

    return created({ id: usuario?.id });
  } catch (err) {
    console.error("[Admin/Empresas/Usuarios/POST]", err);
    return serverError();
  }
}

// DELETE /api/admin/empresas/[id]/usuarios?userId=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  try { assertMaster(auth.payload.role); } catch { return forbidden(); }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return badRequest("userId obrigatório");

  try {
    await queryOne(
      `UPDATE usuarios SET deleted_at = NOW() WHERE id = $1 AND empresa_id = $2`,
      [userId, params.id]
    );
    return ok({ deleted: true });
  } catch (err) {
    console.error("[Admin/Empresas/Usuarios/DELETE]", err);
    return serverError();
  }
}
