/**
 * GET /api/admin/usuarios
 *
 * Lista TODOS os usuários do sistema (todas empresas + masters).
 * Master only.
 *
 * Query: ?role=master|admin|... &search=texto &page=1 &limit=50
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError, paginatedOk, badRequest, conflict } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const sp = req.nextUrl.searchParams;
  const role   = sp.get("role");
  const search = sp.get("search");
  const page   = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit  = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const conds: string[] = ["u.deleted_at IS NULL"];
  const vals: unknown[] = [];
  let i = 1;
  if (role)   { conds.push(`u.role = $${i++}`); vals.push(role); }
  if (search) {
    conds.push(`(u.nome ILIKE $${i} OR u.email ILIKE $${i})`);
    vals.push(`%${search}%`);
    i++;
  }
  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query(
        `SELECT u.id, u.nome, u.email, u.role, u.ativo, u.bloqueado_ate,
                u.tentativas_login, u.ultimo_login, u.created_at,
                u.empresa_id,
                e.nome_fantasia AS empresa_nome,
                e.slug          AS empresa_slug
           FROM usuarios u
           LEFT JOIN empresas e ON e.id = u.empresa_id
          WHERE ${where}
          ORDER BY u.created_at DESC
          LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM usuarios u WHERE ${where}`, vals),
    ]);
    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Admin/Usuarios/GET]", err);
    return serverError();
  }
}

// ─── POST /api/admin/usuarios ──────────────────────────────────
// Master cria usuário em qualquer empresa, com qualquer role.
// Pra criar agente de suporte: empresa_id=null + role='suporte'.

const ROLES_VALIDOS = [
  "master", "suporte", "admin", "gerente", "garcom", "cozinha",
  "atendente", "financeiro", "delivery", "motoboy", "cliente",
] as const;

const postSchema = z.object({
  nome:       z.string().min(2).max(120),
  email:      z.string().email().max(120),
  senha:      z.string().min(8).max(72),
  role:       z.enum(ROLES_VALIDOS),
  empresa_id: z.string().uuid().nullable().optional(),
  ativo:      z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof postSchema>;
  try { body = postSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // master e suporte não têm empresa; demais precisam
  if (body.role !== "master" && body.role !== "suporte" && !body.empresa_id) {
    return badRequest(`role '${body.role}' exige empresa_id`);
  }

  try {
    // E-mail já existe?
    const existe = await queryOne<{ id: string }>(
      `SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
      [body.email]
    );
    if (existe) return conflict("E-mail já cadastrado");

    const senha_hash = await bcrypt.hash(body.senha, 10);
    const novo = await queryOne<{ id: string; nome: string; email: string; role: string; empresa_id: string | null }>(
      `INSERT INTO usuarios (nome, email, senha_hash, role, empresa_id, ativo)
       VALUES ($1, LOWER($2), $3, $4, $5, $6)
       RETURNING id, nome, email, role, empresa_id`,
      [body.nome, body.email, senha_hash,
       body.role,
       (body.role === "master" || body.role === "suporte") ? null : body.empresa_id,
       body.ativo]
    );
    if (!novo) return serverError("falha ao criar");

    return ok({ usuario: novo }, undefined, 201);
  } catch (err) {
    console.error("[Admin/Usuarios/POST]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
