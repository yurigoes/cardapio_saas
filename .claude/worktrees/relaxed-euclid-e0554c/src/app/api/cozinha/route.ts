import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, serverError } from "@/lib/utils/response";

// GET /api/cozinha — pedidos ativos com itens (últimas 24h)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "cozinha:ver")) return forbidden();

  const tipo = req.nextUrl.searchParams.get("tipo"); // mesa | balcao | delivery | null=todos

  try {
    const conditions = [
      "p.empresa_id = $1",
      "p.deleted_at IS NULL",
      "p.status IN ('pendente','em_preparo','pronto')",
      "p.created_at >= NOW() - INTERVAL '24 hours'",
    ];
    const values: unknown[] = [empresaId];

    if (tipo) {
      conditions.push(`p.tipo = $2`);
      values.push(tipo);
    }

    const where = conditions.join(" AND ");

    // Retorna pedidos com itens em JSON agregado — evita N+1
    const pedidos = await query<{
      id: string; numero: number; tipo: string; status: string;
      mesa_numero: number | null; cliente_nome: string | null;
      observacoes: string | null; created_at: string;
      tempo_segundos: number;
      itens: { id: string; nome: string; quantidade: number; observacoes: string | null }[];
    }>(
      `SELECT
         p.id, p.numero, p.tipo, p.status,
         m.numero           AS mesa_numero,
         p.cliente_nome,
         p.observacoes,
         p.created_at,
         EXTRACT(EPOCH FROM (NOW() - p.created_at))::int AS tempo_segundos,
         COALESCE(
           json_agg(
             json_build_object(
               'id',          pi.id,
               'nome',        pi.nome,
               'quantidade',  pi.quantidade,
               'observacoes', pi.observacoes
             ) ORDER BY pi.created_at ASC
           ) FILTER (WHERE pi.id IS NOT NULL),
           '[]'
         ) AS itens
       FROM pedidos p
       LEFT JOIN mesas       m  ON m.id  = p.mesa_id
       LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
       WHERE ${where}
       GROUP BY p.id, m.numero
       ORDER BY
         CASE p.status
           WHEN 'pendente'   THEN 1
           WHEN 'em_preparo' THEN 2
           WHEN 'pronto'     THEN 3
         END,
         p.created_at ASC`,
      values
    );

    return ok(pedidos);
  } catch (err) {
    console.error("[Cozinha/GET]", err);
    return serverError();
  }
}
