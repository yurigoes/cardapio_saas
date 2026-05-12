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
    const clienteRaw = await queryOne<{
      id:            string;
      nome:          string;
      telefone:      string | null;
      email:         string | null;
      cpf:           string | null;
      pontos:        string | number;
      total_pedidos: string | number;
      total_gasto:   string | number;
      ultimo_pedido: string | null;
    }>(
      `SELECT id, nome, telefone, cpf, email,
              pontos, total_pedidos, total_gasto,
              ultimo_pedido_em AS ultimo_pedido
       FROM clientes WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!clienteRaw) return notFound();

    const cliente = {
      ...clienteRaw,
      pontos:        Number(clienteRaw.pontos),
      total_pedidos: Number(clienteRaw.total_pedidos),
      total_gasto:   Number(clienteRaw.total_gasto),
    };

    // Últimos pedidos do cliente
    const pedidos = await query<{
      id:        string;
      numero:    number;
      total:     string | number;
      status:    string;
      criado_em: string;
    }>(
      `SELECT id, numero, total, status, created_at AS criado_em
       FROM pedidos
       WHERE cliente_id = $1 AND empresa_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [params.id, empresaId]
    );

    // Cupons do cliente — mapeia valido_ate → validade (campo esperado pelo frontend)
    const cupons = await query<{
      id:       string;
      codigo:   string;
      tipo:     string;
      valor:    string | number;
      validade: string | null;
      ativo:    boolean;
    }>(
      `SELECT id, codigo, tipo, valor, valido_ate AS validade, ativo
       FROM cupons
       WHERE cliente_id = $1 AND empresa_id = $2 AND ativo = true
       ORDER BY created_at DESC LIMIT 10`,
      [params.id, empresaId]
    );

    const pedidosNorm = pedidos.map((p) => ({ ...p, total: Number(p.total) }));
    const cuponsNorm  = cupons.map((c)  => ({ ...c, valor: Number(c.valor) }));

    return ok({ ...cliente, pedidos: pedidosNorm, cupons: cuponsNorm });
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
