/**
 * PATCH /api/painel/produtos/[id]/exclusivo
 * Body: { exclusivo: boolean } — marca o produto como exclusivo da filial atual
 *                                ou volta a ser compartilhado na rede.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, badRequest, notFound, serverError } from "@/lib/utils/response";
import { cardapioScope } from "@/lib/rede/cardapio";
import { invalidarCardapioPorEmpresa } from "@/lib/cache/cardapio";

const schema = z.object({ exclusivo: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cardapio:editar")) return forbidden();

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const scope = await cardapioScope(empresaId);
  if (!scope.rede_id) return badRequest("Empresa não pertence a uma rede");

  try {
    // Garante que o produto pertence à rede
    const r = await queryOne<{ id: string; rede_id: string | null }>(
      `SELECT id, rede_id FROM produtos WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!r) return notFound();
    if (r.rede_id !== scope.rede_id) return forbidden("Produto não pertence à sua rede");

    await queryOne(
      `UPDATE produtos
          SET exclusivo_filial_id = $1, updated_at = NOW()
        WHERE id = $2`,
      [body.exclusivo ? empresaId : null, params.id]
    );

    invalidarCardapioPorEmpresa(empresaId).catch(() => null);
    return ok({
      id: params.id,
      exclusivo: body.exclusivo,
      filial_id: body.exclusivo ? empresaId : null,
    });
  } catch (err) {
    console.error("[Produtos/Exclusivo]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
