import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, created, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { z } from "zod";

const categoriaSchema = z.object({
  nome:      z.string().min(2).max(100).trim(),
  descricao: z.string().max(500).trim().optional(),
  ordem:     z.number().int().min(0).default(0),
  ativo:     z.boolean().default(true),
  imagem_url: z.string().url().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const categorias = await query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM produtos p WHERE p.categoria_id = c.id AND p.deleted_at IS NULL) as total_produtos
     FROM categorias c
     WHERE c.empresa_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.ordem ASC, c.nome ASC`,
    [empresaId]
  );

  return ok(categorias);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cardapio:editar")) return forbidden();

  let body: z.infer<typeof categoriaSchema>;
  try {
    body = categoriaSchema.parse(await req.json());
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const categoria = await queryOne<{ id: string }>(
      `INSERT INTO categorias (empresa_id, nome, descricao, ordem, ativo, imagem_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [empresaId, body.nome, body.descricao ?? null, body.ordem, body.ativo, body.imagem_url ?? null]
    );

    return created({ id: categoria?.id });
  } catch (err) {
    console.error("[Painel/Categorias/POST]", err);
    return serverError();
  }
}
