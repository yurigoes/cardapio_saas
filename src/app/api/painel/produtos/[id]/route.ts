import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { produtoUpdateSchema, parseBodyOrThrow } from "@/lib/utils/validators";
import { z } from "zod";
import { cardapioScope } from "@/lib/rede/cardapio";

/**
 * Helper: WHERE pra UPDATE/DELETE que respeita scope.
 * Em rede sincronizada, qualquer filial pode editar produto compartilhado
 * (filtra por rede_id). Standalone: filtra por empresa_id.
 */
async function whereOwnership(empresaId: string, paramStart: number) {
  const scope = await cardapioScope(empresaId);
  if (scope.sincronizado && scope.rede_id) {
    return { clause: `rede_id = $${paramStart}`, value: scope.rede_id };
  }
  return { clause: `empresa_id = $${paramStart}`, value: scope.empresa_id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cardapio:editar")) return forbidden();

  let body: z.output<typeof produtoUpdateSchema>;
  try {
    body = await parseBodyOrThrow(req, produtoUpdateSchema);
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Dados inválidos");
  }

  if (Object.keys(body).length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const fields: Record<string, unknown> = {};
    if (body.nome              !== undefined) fields.nome              = body.nome;
    if (body.descricao         !== undefined) fields.descricao         = body.descricao;
    if (body.preco             !== undefined) fields.preco             = body.preco;
    if (body.preco_custo       !== undefined) fields.preco_custo       = body.preco_custo;
    if (body.disponivel        !== undefined) fields.disponivel        = body.disponivel;
    if (body.destaque          !== undefined) fields.destaque          = body.destaque;
    if (body.tempo_preparo     !== undefined) fields.tempo_preparo     = body.tempo_preparo;
    if (body.imagem_url        !== undefined) fields.imagem_url        = body.imagem_url;
    if (body.tipo              !== undefined) fields.tipo              = body.tipo;
    if (body.categoria_id      !== undefined) fields.categoria_id      = body.categoria_id;
    if (body.pontos_fidelidade !== undefined) fields.pontos_fidelidade = body.pontos_fidelidade;
    if (body.variacoes         !== undefined) fields.variacoes         = JSON.stringify(body.variacoes);

    const entries  = Object.entries(fields);
    const sets     = entries.map(([k], i) => `${k} = $${i + 1}`);
    const values   = entries.map(([, v]) => v);

    sets.push(`updated_at = NOW()`);
    const own = await whereOwnership(empresaId, values.length + 2);
    values.push(params.id, own.value);

    const produto = await queryOne(
      `UPDATE produtos SET ${sets.join(", ")}
       WHERE id = $${values.length - 1} AND ${own.clause} AND deleted_at IS NULL
       RETURNING id`,
      values
    );

    if (!produto) return notFound("Produto não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Produtos/PATCH]", err);
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
    const own = await whereOwnership(empresaId, 2);
    const produto = await queryOne(
      `UPDATE produtos SET deleted_at = NOW()
       WHERE id = $1 AND ${own.clause} AND deleted_at IS NULL
       RETURNING id`,
      [params.id, own.value]
    );

    if (!produto) return notFound("Produto não encontrado");
    return ok({ id: params.id });
  } catch (err) {
    console.error("[Painel/Produtos/DELETE]", err);
    return serverError();
  }
}
