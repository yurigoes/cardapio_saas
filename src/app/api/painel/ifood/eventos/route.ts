/**
 * GET /api/painel/ifood/eventos?tipo=&apenas_erro=&page=&limit=
 *
 * Lista eventos iFood recebidos. Inclui status (processado/erro/pendente)
 * + payload completo. Master/admin only.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

const ALLOWED = ["master", "admin", "gerente"];

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (!ALLOWED.includes(auth.payload.role)) return forbidden();
  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  const url = new URL(req.url);
  const tipo        = url.searchParams.get("tipo");
  const apenasErro  = url.searchParams.get("apenas_erro") === "1";
  const page        = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit       = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 30)));
  const offset      = (page - 1) * limit;

  const where: string[] = ["empresa_id = $1"];
  const params: unknown[] = [empresaId];
  if (tipo)       { params.push(tipo);  where.push(`tipo = $${params.length}`); }
  if (apenasErro) { where.push(`erro IS NOT NULL`); }

  try {
    params.push(limit, offset);
    const rows = await query(
      `SELECT id, evento_id, tipo, pedido_ifood_id, pedido_id,
              payload, processado_em, ack_em, erro, criado_em
         FROM ifood_eventos
        WHERE ${where.join(" AND ")}
        ORDER BY criado_em DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = await queryOne<{ qtd: string }>(
      `SELECT COUNT(*) AS qtd FROM ifood_eventos WHERE ${where.join(" AND ")}`,
      params.slice(0, -2)
    );

    // Stats agregadas (sem filtro de paginação)
    const stats = await queryOne<{
      total_24h: string; pedidos_24h: string; erros_24h: string;
    }>(
      `SELECT
         COUNT(*)::text                                                AS total_24h,
         COUNT(*) FILTER (WHERE pedido_id IS NOT NULL)::text           AS pedidos_24h,
         COUNT(*) FILTER (WHERE erro IS NOT NULL)::text                AS erros_24h
       FROM ifood_eventos
       WHERE empresa_id = $1 AND criado_em > NOW() - INTERVAL '24 hours'`,
      [empresaId]
    );

    return ok({
      eventos: rows,
      stats,
      page, limit,
      total: Number(total?.qtd ?? 0),
    });
  } catch (err) {
    console.error("[Ifood/Eventos/GET]", err);
    return serverError();
  }
}
