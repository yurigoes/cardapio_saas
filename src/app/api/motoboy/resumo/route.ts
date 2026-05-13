/**
 * GET /api/motoboy/resumo
 *
 * Resumo do dia para o motoboy logado:
 *   - corridas hoje (entregues)
 *   - total a receber hoje (soma valor_motoboy)
 *   - corridas em aberto (atribuidas/coletadas)
 *   - tempo médio entrega (atribuído → entregue)
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { empresaId, role, sub } = auth.payload;
  if (!empresaId) return forbidden();
  if (role !== "motoboy") return forbidden("Apenas motoboy");

  try {
    const motoboy = await queryOne<{ id: string }>(
      `SELECT id FROM motoboys WHERE usuario_id = $1 AND empresa_id = $2`,
      [sub, empresaId]
    );
    if (!motoboy) return forbidden("Motoboy não vinculado");

    const r = await queryOne<{
      corridas_hoje: string; total_hoje: string; em_aberto: string;
      tempo_medio_min: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status_entrega = 'entregue'
                            AND entregue_em >= date_trunc('day', NOW()))::text  AS corridas_hoje,
         COALESCE(SUM(valor_motoboy) FILTER (WHERE status_entrega = 'entregue'
                            AND entregue_em >= date_trunc('day', NOW())), 0)::text AS total_hoje,
         COUNT(*) FILTER (WHERE status_entrega IN ('atribuido','coletado','em_rota'))::text AS em_aberto,
         COALESCE(AVG(EXTRACT(EPOCH FROM (entregue_em - atribuido_em))/60)
                  FILTER (WHERE status_entrega = 'entregue'
                            AND atribuido_em IS NOT NULL AND entregue_em IS NOT NULL
                            AND entregue_em >= NOW() - INTERVAL '7 days'), 0)::text AS tempo_medio_min
       FROM pedidos
       WHERE empresa_id = $1 AND motoboy_id = $2 AND deleted_at IS NULL`,
      [empresaId, motoboy.id]
    );

    return ok({
      motoboy_id:      motoboy.id,
      corridas_hoje:   Number(r?.corridas_hoje ?? 0),
      total_hoje:      Number(r?.total_hoje ?? 0),
      em_aberto:       Number(r?.em_aberto ?? 0),
      tempo_medio_min: Math.round(Number(r?.tempo_medio_min ?? 0)),
    });
  } catch (err) {
    console.error("[Motoboy/Resumo]", err);
    return serverError();
  }
}
