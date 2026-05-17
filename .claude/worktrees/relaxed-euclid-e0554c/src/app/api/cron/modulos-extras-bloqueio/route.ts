/**
 * GET /api/cron/modulos-extras-bloqueio
 *
 * Bloqueia módulos extras 'alacarte' cuja expira_em (= NOW()+24h ao liberar)
 * já passou sem pagamento confirmado.
 *
 * Chamado por cron na VPS:
 *   * /15 * * * *  curl -fsS -H "X-Cron-Token: $CRON_TOKEN" \
 *                       https://app.tthreedigital.com.br/api/cron/modulos-extras-bloqueio
 *
 * Auth: header X-Cron-Token === process.env.CRON_TOKEN (configurar no .env)
 */
import { NextRequest } from "next/server";
import { query } from "@/lib/db/client";
import { ok, forbidden, serverError } from "@/lib/utils/response";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-cron-token");
  const esperado = process.env.CRON_TOKEN;
  if (!esperado) return forbidden("CRON_TOKEN não configurado");
  if (token !== esperado) return forbidden("Token inválido");

  try {
    const bloqueados = await query<{ id: string; empresa_id: string; modulo: string }>(
      `UPDATE empresa_modulos_extras
          SET bloqueado  = TRUE,
              updated_at = NOW()
        WHERE tipo       = 'alacarte'
          AND bloqueado  = FALSE
          AND pago       = FALSE
          AND expira_em IS NOT NULL
          AND expira_em < NOW()
        RETURNING id, empresa_id, modulo`
    );

    // Marca empresas com cobrança vencida 24h+ como bloqueadas
    const empresasBloq = await query<{ id: string }>(
      `UPDATE empresas e
          SET bloqueado_inadimplencia = TRUE,
              bloqueado_motivo = COALESCE(bloqueado_motivo, 'Cobrança vencida há mais de 24h sem pagamento'),
              bloqueado_em     = COALESCE(bloqueado_em, NOW())
        WHERE deleted_at IS NULL
          AND COALESCE(bloqueado_inadimplencia, FALSE) = FALSE
          AND (
            EXISTS (SELECT 1 FROM mensalidades m
                     WHERE m.empresa_id = e.id
                       AND m.status IN ('aberta','atrasada')
                       AND m.vencimento < CURRENT_DATE - INTERVAL '1 day')
            OR EXISTS (SELECT 1 FROM cobrancas_avulsas c
                        WHERE c.empresa_id = e.id
                          AND c.status IN ('aberta','atrasada')
                          AND c.vencimento < CURRENT_DATE - INTERVAL '1 day')
          )
        RETURNING id`
    ).catch(() => []);

    // Marca mensalidades vencidas como 'atrasada' (mudança de status)
    await query(
      `UPDATE mensalidades SET status = 'atrasada', atualizado_em = NOW()
        WHERE status = 'aberta' AND vencimento < CURRENT_DATE`
    ).catch(() => null);

    return ok({
      modulos_bloqueados:  bloqueados.length,
      empresas_bloqueadas: empresasBloq.length,
      detalhes:            bloqueados,
      em:                  new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron/ExtrasBloqueio]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
