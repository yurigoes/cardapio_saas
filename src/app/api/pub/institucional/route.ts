/**
 * GET /api/pub/institucional
 * Retorna dados pro site institucional:
 *   - Métricas: total de pedidos, empresas ativas, uptime, chamados resolvidos
 *   - Parceiros: empresas com logo + exibir_como_parceiro=true
 *   - Planos públicos (já existe /api/pub/planos, mas trazemos resumido aqui)
 */
import { query, queryOne } from "@/lib/db/client";
import { ok, serverError } from "@/lib/utils/response";

export async function GET() {
  try {
    const [metr, parc, planosResumo] = await Promise.all([
      queryOne<{
        total_pedidos: string;
        empresas_ativas: string;
        chamados_resolvidos: string;
        primeira_empresa: string | null;
      }>(
        `SELECT
           (SELECT COUNT(*)::text FROM pedidos)                                AS total_pedidos,
           (SELECT COUNT(*)::text FROM empresas
              WHERE status = 'ativo' AND deleted_at IS NULL)                    AS empresas_ativas,
           (SELECT COUNT(*)::text FROM suporte_chamados
              WHERE status IN ('resolvido','fechado'))                          AS chamados_resolvidos,
           (SELECT MIN(created_at)::text FROM empresas WHERE deleted_at IS NULL) AS primeira_empresa`
      ).catch(() => null),
      query<{ id: string; nome_fantasia: string; logo_url: string }>(
        `SELECT id, nome_fantasia, logo_url
           FROM empresas
          WHERE status = 'ativo' AND deleted_at IS NULL
            AND logo_url IS NOT NULL AND logo_url <> ''
            AND COALESCE(exibir_como_parceiro, TRUE) = TRUE
          ORDER BY created_at ASC
          LIMIT 60`
      ).catch(() => []),
      query<{ id: string; nome: string; preco_mensal: string; modulos: string[]; destaque: boolean }>(
        `SELECT id, nome, preco_mensal, modulos, destaque
           FROM planos
          WHERE ativo = TRUE
          ORDER BY destaque DESC, preco_mensal ASC NULLS LAST
          LIMIT 6`
      ).catch(() => []),
    ]);

    const inicio = metr?.primeira_empresa ? new Date(metr.primeira_empresa) : null;
    const uptimeDias = inicio
      ? Math.max(1, Math.floor((Date.now() - inicio.getTime()) / 86400000))
      : 0;

    return ok({
      metricas: {
        total_pedidos:        Number(metr?.total_pedidos ?? 0),
        empresas_ativas:      Number(metr?.empresas_ativas ?? 0),
        chamados_resolvidos:  Number(metr?.chamados_resolvidos ?? 0),
        uptime_dias:          uptimeDias,
      },
      parceiros: parc,
      planos:    planosResumo,
    });
  } catch (err) {
    console.error("[Pub/Institucional]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
