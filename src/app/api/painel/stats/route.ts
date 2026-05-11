import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId } = auth.payload;
  if (!empresaId) return forbidden();

  try {
    const stats = await queryOne<{
      pedidos_hoje:      number;
      pedidos_pendentes: number;
      vendas_hoje:       string;
      ticket_medio:      string;
      clientes_novos:    number;
      tempo_medio_min:   string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM pedidos
           WHERE empresa_id = $1
             AND created_at::date = CURRENT_DATE
             AND deleted_at IS NULL)                                          AS pedidos_hoje,

        (SELECT COUNT(*) FROM pedidos
           WHERE empresa_id = $1
             AND status IN ('pendente','confirmado','preparando')
             AND deleted_at IS NULL)                                          AS pedidos_pendentes,

        (SELECT COALESCE(SUM(total), 0) FROM pedidos
           WHERE empresa_id = $1
             AND created_at::date = CURRENT_DATE
             AND status NOT IN ('cancelado')
             AND deleted_at IS NULL)                                          AS vendas_hoje,

        (SELECT COALESCE(AVG(total), 0) FROM pedidos
           WHERE empresa_id = $1
             AND created_at::date = CURRENT_DATE
             AND status NOT IN ('cancelado')
             AND deleted_at IS NULL)                                          AS ticket_medio,

        (SELECT COUNT(*) FROM clientes
           WHERE empresa_id = $1
             AND created_at::date = CURRENT_DATE
             AND deleted_at IS NULL)                                          AS clientes_novos,

        (SELECT COALESCE(
           AVG(EXTRACT(EPOCH FROM (COALESCE(pronto_em, NOW()) - created_at)) / 60), 0
         ) FROM pedidos
           WHERE empresa_id = $1
             AND created_at::date = CURRENT_DATE
             AND status IN ('pronto','entregue')
             AND deleted_at IS NULL)                                          AS tempo_medio_min
    `, [empresaId]);

    return ok({
      pedidos_hoje:      Number(stats?.pedidos_hoje      ?? 0),
      pedidos_pendentes: Number(stats?.pedidos_pendentes ?? 0),
      vendas_hoje:       Number(stats?.vendas_hoje       ?? 0),
      ticket_medio:      Number(stats?.ticket_medio      ?? 0),
      clientes_novos:    Number(stats?.clientes_novos    ?? 0),
      tempo_medio_min:   Math.round(Number(stats?.tempo_medio_min ?? 0)),
    });
  } catch (err) {
    console.error("[Painel/Stats]", err);
    return serverError();
  }
}
