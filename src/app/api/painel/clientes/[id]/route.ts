/**
 * GET    /api/painel/clientes/[id]   → dados do cliente + histórico
 * PATCH  /api/painel/clientes/[id]   → ajuste manual de pontos
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, serverError, badRequest } from "@/lib/utils/response";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin","gerente"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  try {
    const cliente = await queryOne<Record<string, unknown>>(
      `SELECT id, nome, telefone, cpf, email,
              pontos, total_pedidos, total_gasto, ultimo_pedido_em, created_at
       FROM clientes WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!cliente) return notFound();

    // Últimos pedidos do cliente
    const pedidos = await query<Record<string, unknown>>(
      `SELECT id, numero, total, status, created_at
       FROM pedidos WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [params.id]
    );

    // Cupons do cliente
    const cupons = await query<Record<string, unknown>>(
      `SELECT id, codigo, tipo, valor, valido_ate, uso_atual, ativo
       FROM cupons WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [params.id]
    );

    return ok({ ...cliente, pedidos, cupons });
  } catch (err) {
    console.error("[Clientes/GET/:id]", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!["master","admin"].includes(auth.payload.role)) return forbidden();

  const { empresaId } = auth.payload;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const { pontos_ajuste, nome, telefone, email } = body as {
    pontos_ajuste?: number; nome?: string; telefone?: string; email?: string;
  };

  try {
    const cliente = await queryOne<{ id: string }>(
      `SELECT id FROM clientes WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!cliente) return notFound();

    const sets: string[] = ["updated_at = NOW()"];
    const vals: unknown[] = [];
    let idx = 1;

    if (pontos_ajuste !== undefined) {
      sets.push(`pontos = GREATEST(0, pontos + $${idx++})`);
      vals.push(pontos_ajuste);
    }
    if (nome !== undefined) { sets.push(`nome = $${idx++}`); vals.push(nome); }
    if (telefone !== undefined) { sets.push(`telefone = $${idx++}`); vals.push(telefone); }
    if (email !== undefined) { sets.push(`email = $${idx++}`); vals.push(email); }

    vals.push(params.id);

    await queryOne(
      `UPDATE clientes SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`,
      vals
    );

    return ok({ updated: true });
  } catch (err) {
    console.error("[Clientes/PATCH/:id]", err);
    return serverError();
  }
}
