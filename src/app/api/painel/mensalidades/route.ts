/**
 * GET /api/painel/mensalidades — lista mensalidades da empresa logada.
 * Filtros: ?status=aberta|paga|atrasada|cancelada
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!["master", "admin", "gerente", "financeiro"].includes(role)) return forbidden();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const where: string[] = ["empresa_id = $1"];
  const params: unknown[] = [empresaId];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }

  try {
    const rows = await query(
      `SELECT m.id, m.mes_referencia::text, m.valor, m.vencimento::text, m.status,
              m.mp_init_point, m.pago_em, m.pago_via, p.nome AS plano_nome
         FROM mensalidades m
    LEFT JOIN planos p ON p.id = m.plano_id
        WHERE ${where.join(" AND ")}
        ORDER BY m.mes_referencia DESC LIMIT 100`,
      params
    );

    // Agrega assinatura ativa (se houver)
    const assinatura = await queryOne(
      `SELECT id, status, valor_mensal, proxima_cobranca::text, mp_init_point
         FROM assinaturas
        WHERE empresa_id = $1 AND status IN ('pendente','autorizada','ativa')
        ORDER BY criado_em DESC LIMIT 1`,
      [empresaId]
    ).catch(() => null);

    return ok({ mensalidades: rows, assinatura_ativa: assinatura });
  } catch (err) {
    console.error("[Mensalidades/GET]", err);
    return serverError();
  }
}
