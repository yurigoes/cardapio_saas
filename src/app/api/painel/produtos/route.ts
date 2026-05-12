import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne, queryCount } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, created, forbidden, badRequest, serverError, paginatedOk } from "@/lib/utils/response";
import { produtoCreateSchema, paginacaoSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const sp = req.nextUrl.searchParams;
  const { page, limit, q } = paginacaoSchema.parse({
    page:  sp.get("page")  ?? undefined,
    limit: sp.get("limit") ?? undefined,
    q:     sp.get("q")     ?? undefined,
  });

  const categoriaId = sp.get("categoria_id");
  const offset      = (page - 1) * limit;

  const conditions = ["p.empresa_id = $1", "p.deleted_at IS NULL"];
  const values: unknown[] = [empresaId];
  let i = 2;

  if (q) {
    conditions.push(`(p.nome ILIKE $${i} OR p.descricao ILIKE $${i})`);
    values.push(`%${q}%`);
    i++;
  }

  if (categoriaId) {
    conditions.push(`p.categoria_id = $${i}`);
    values.push(categoriaId);
    i++;
  }

  const where = conditions.join(" AND ");

  const [produtos, total] = await Promise.all([
    query(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE ${where}
       ORDER BY c.ordem ASC, p.nome ASC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    ),
    queryCount(`SELECT COUNT(*) FROM produtos p WHERE ${where}`, values),
  ]);

  return paginatedOk(produtos, total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cardapio:editar")) return forbidden();

  let body: z.output<typeof produtoCreateSchema>;
  try {
    body = await parseBodyOrThrow(req, produtoCreateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  try {
    const produto = await queryOne<{ id: string }>(
      `INSERT INTO produtos
         (empresa_id, categoria_id, nome, descricao, preco, preco_custo,
          disponivel, destaque, tempo_preparo, imagem_url, tipo, pontos_fidelidade,
          variacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        empresaId,
        body.categoria_id      ?? null,
        body.nome,
        body.descricao         ?? null,
        body.preco,
        body.preco_custo       ?? null,
        body.disponivel,
        body.destaque,
        body.tempo_preparo     ?? null,
        body.imagem_url        ?? null,
        body.tipo,
        body.pontos_fidelidade ?? 0,
        JSON.stringify(body.variacoes ?? { grupos: [] }),
      ]
    );

    return created({ id: produto?.id });
  } catch (err) {
    console.error("[Painel/Produtos/POST]", err);
    return serverError();
  }
}
