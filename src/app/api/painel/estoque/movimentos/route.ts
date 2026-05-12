/**
 * GET /api/painel/estoque/movimentos
 *   query: ?page=1&limit=30&produto_id=&tipo=&from=&to=
 *
 * Histórico paginado de movimentos de estoque.
 * Útil para auditoria de saídas, entradas e perdas.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryCount } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { forbidden, serverError, paginatedOk } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "estoque:ver")) return forbidden();

  const sp = req.nextUrl.searchParams;
  const page  = Math.max(1, parseInt(sp.get("page")  ?? "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30", 10)));
  const produtoId = sp.get("produto_id");
  const tipo      = sp.get("tipo");
  const from      = sp.get("from");
  const to        = sp.get("to");
  const offset = (page - 1) * limit;

  const conds: string[] = ["m.empresa_id = $1"];
  const vals: unknown[] = [empresaId];
  let idx = 2;

  if (produtoId) { conds.push(`m.produto_id = $${idx++}`); vals.push(produtoId); }
  if (tipo)      { conds.push(`m.tipo = $${idx++}`);       vals.push(tipo); }
  if (from)      { conds.push(`m.criado_em >= $${idx++}::date`); vals.push(from); }
  if (to)        { conds.push(`m.criado_em < ($${idx++}::date + INTERVAL '1 day')`); vals.push(to); }

  const where = conds.join(" AND ");

  try {
    const [rows, total] = await Promise.all([
      query<{
        id: string; tipo: string; quantidade: number;
        estoque_anterior: number | null; estoque_atual: number | null;
        motivo: string | null; criado_em: string;
        produto_id: string; produto_nome: string;
        pedido_id: string | null; pedido_numero: number | null;
        usuario_nome: string | null;
      }>(
        `SELECT m.id, m.tipo, m.quantidade,
                m.estoque_anterior, m.estoque_atual,
                m.motivo, m.criado_em,
                m.produto_id, p.nome AS produto_nome,
                m.pedido_id, ped.numero AS pedido_numero,
                u.nome AS usuario_nome
         FROM estoque_movimentos m
         LEFT JOIN produtos p   ON p.id   = m.produto_id
         LEFT JOIN pedidos  ped ON ped.id = m.pedido_id
         LEFT JOIN usuarios u   ON u.id   = m.usuario_id
         WHERE ${where}
         ORDER BY m.criado_em DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...vals, limit, offset]
      ),
      queryCount(`SELECT COUNT(*) FROM estoque_movimentos m WHERE ${where}`, vals),
    ]);

    return paginatedOk(rows, total, page, limit);
  } catch (err) {
    console.error("[Estoque/Movimentos]", err);
    return serverError();
  }
}
