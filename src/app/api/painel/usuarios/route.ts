import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, created, forbidden, badRequest, serverError, paginatedOk } from "@/lib/utils/response";
import { usuarioCreateSchema, paginacaoSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { z } from "zod";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(auth.payload.role, "usuario:ver")) return forbidden();

  const sp = req.nextUrl.searchParams;
  const { page, limit, q } = paginacaoSchema.parse({
    page: sp.get("page"), limit: sp.get("limit"), q: sp.get("q"),
  });

  const offset = (page - 1) * limit;
  const role   = sp.get("role");

  const conditions = ["u.empresa_id = $1", "u.deleted_at IS NULL"];
  const values: unknown[] = [empresaId];
  let i = 2;

  if (q) {
    conditions.push(`(u.nome ILIKE $${i} OR u.email ILIKE $${i})`);
    values.push(`%${q}%`);
    i++;
  }

  if (role) {
    conditions.push(`u.role = $${i}`);
    values.push(role);
    i++;
  }

  const where = conditions.join(" AND ");

  const [usuarios, total] = await Promise.all([
    query(
      `SELECT u.id, u.nome, u.email, u.role, u.telefone, u.ativo, u.created_at, u.ultimo_login
       FROM usuarios u
       WHERE ${where}
       ORDER BY u.nome ASC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    queryCount(`SELECT COUNT(*) FROM usuarios u WHERE ${where}`, values),
  ]);

  return paginatedOk(usuarios, total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "usuario:criar")) return forbidden();

  let body: z.output<typeof usuarioCreateSchema>;
  try {
    body = await parseBodyOrThrow(req, usuarioCreateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados invÃ¡lidos");
  }

  try {
    const existing = await queryOne(
      `SELECT id FROM usuarios WHERE email = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [body.email, empresaId]
    );
    if (existing) return badRequest("E-mail jÃ¡ cadastrado nesta empresa");

    const hash = await bcrypt.hash(body.senha, 12);

    const usuario = await queryOne<{ id: string }>(
      `INSERT INTO usuarios (empresa_id, nome, email, senha_hash, role, telefone, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      [empresaId, body.nome, body.email, hash, body.role, body.telefone ?? null]
    );

    return created({ id: usuario?.id });
  } catch (err) {
    console.error("[Painel/Usuarios/POST]", err);
    return serverError();
  }
}
