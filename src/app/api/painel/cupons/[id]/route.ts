/**
 * GET    /api/painel/cupons/[id]  → detalhes do cupom
 * PATCH  /api/painel/cupons/[id]  → atualiza / ativa / desativa
 * DELETE /api/painel/cupons/[id]  → remove cupom
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError, badRequest, noContent } from "@/lib/utils/response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin","gerente"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  try {
    const cupom = await queryOne<Record<string, unknown>>(
      `SELECT c.*, cl.nome as cliente_nome
       FROM cupons c
       LEFT JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!cupom) return notFound();
    return ok(cupom);
  } catch (err) {
    console.error("[Cupons/GET/:id]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin","gerente"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const ALLOWED = ["descricao","tipo","valor","uso_maximo","uso_por_cliente",
                   "valor_minimo_pedido","valido_de","valido_ate","ativo"];

  const updates: Record<string, unknown> = {};
  for (const f of ALLOWED) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  if (Object.keys(updates).length === 0) return badRequest("Nenhum campo para atualizar");

  try {
    const cupom = await queryOne<{ id: string }>(
      `SELECT id FROM cupons WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!cupom) return notFound();

    const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`).join(", ");
    await queryOne(
      `UPDATE cupons SET ${sets}, updated_at = NOW() WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [params.id, empresaId, ...Object.values(updates)]
    );

    return ok({ updated: true });
  } catch (err) {
    console.error("[Cupons/PATCH/:id]", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  try {
    const cupom = await queryOne<{ uso_atual: number }>(
      `SELECT uso_atual FROM cupons WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!cupom) return notFound();
    if (cupom.uso_atual > 0) return badRequest("Não é possível excluir cupons já utilizados. Desative-o.");

    await queryOne(`DELETE FROM cupons WHERE id = $1`, [params.id]);
    return noContent();
  } catch (err) {
    console.error("[Cupons/DELETE/:id]", err);
    return serverError();
  }
}
