/**
 * GET /api/sync/pedidos — Slave busca pedidos para imprimir
 *
 * Auth: Authorization: Bearer <slave_jwt>
 * Query: ?status=pendente&novo=true&limit=20
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { verifySlaveJWT, extractBearer } from "@/lib/sync/auth";
import { ok, unauthorized, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  // Autenticação slave JWT
  const token = extractBearer(req.headers.get("authorization"));
  if (!token) return unauthorized("Token ausente");

  let payload;
  try {
    payload = await verifySlaveJWT(token);
  } catch {
    return unauthorized("Token inválido ou expirado");
  }

  const empresaId = payload.empresaId;
  const sp        = req.nextUrl.searchParams;
  const status    = sp.get("status") || "pendente";
  const novoOnly  = sp.get("novo") === "true";
  const limit     = Math.min(parseInt(sp.get("limit") || "20"), 100);

  try {
    const conditions = [
      "p.empresa_id = $1",
      "p.deleted_at IS NULL",
      `p.status = $2`,
    ];
    const values: unknown[] = [empresaId, status];
    let i = 3;

    if (novoOnly) {
      conditions.push(`p.impresso_em IS NULL`);
    }

    const pedidos = await query(
      `SELECT p.id, p.numero, p.tipo, p.status,
              p.mesa_id, p.comanda, p.cliente_nome, p.cliente_telefone,
              p.observacoes, p.taxa_entrega, p.desconto,
              p.total, p.impresso_em, p.created_at,
              json_agg(
                json_build_object(
                  'id', pi.id,
                  'nome', pi.nome,
                  'quantidade', pi.quantidade,
                  'preco_unitario', pi.preco_unitario,
                  'observacoes', pi.observacoes
                ) ORDER BY pi.created_at
              ) as itens
       FROM pedidos p
       LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
       WHERE ${conditions.join(" AND ")}
       GROUP BY p.id
       ORDER BY p.created_at ASC
       LIMIT $${i}`,
      [...values, limit]
    );

    return ok(pedidos);
  } catch (err) {
    console.error("[Sync/Pedidos/GET]", err);
    return serverError();
  }
}
