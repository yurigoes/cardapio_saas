import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  try {
    const stats = await queryOne<{
      total_empresas:  number;
      empresas_ativas: number;
      total_usuarios:  number;
      total_pedidos:   number;
      receita_mes:     string;
      alertas:         number;
    }>(`
      SELECT
        (SELECT COUNT(*)  FROM empresas  WHERE deleted_at IS NULL)                              AS total_empresas,
        (SELECT COUNT(*)  FROM empresas  WHERE status = 'ativo' AND deleted_at IS NULL)         AS empresas_ativas,
        (SELECT COUNT(*)  FROM usuarios  WHERE deleted_at IS NULL)                              AS total_usuarios,
        (SELECT COUNT(*)  FROM pedidos   WHERE created_at >= date_trunc('month', NOW())
                                           AND deleted_at IS NULL)                              AS total_pedidos,
        (SELECT COALESCE(SUM(pg.valor), 0)
           FROM pagamentos pg
           WHERE pg.status = 'aprovado'
             AND pg.created_at >= date_trunc('month', NOW()))                                   AS receita_mes,
        (SELECT COUNT(*)  FROM empresas
           WHERE status IN ('suspenso','bloqueado')
              OR (assinatura_expira_em IS NOT NULL AND assinatura_expira_em < NOW() + INTERVAL '7 days')
           AND deleted_at IS NULL)                                                              AS alertas
    `);

    return ok({
      total_empresas:  Number(stats?.total_empresas  ?? 0),
      empresas_ativas: Number(stats?.empresas_ativas ?? 0),
      total_usuarios:  Number(stats?.total_usuarios  ?? 0),
      total_pedidos:   Number(stats?.total_pedidos   ?? 0),
      receita_mes:     Number(stats?.receita_mes     ?? 0),
      alertas:         Number(stats?.alertas         ?? 0),
    });
  } catch (err) {
    console.error("[Admin/Stats]", err);
    return serverError();
  }
}
