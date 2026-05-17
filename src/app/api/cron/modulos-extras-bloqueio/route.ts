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

    return ok({
      bloqueados: bloqueados.length,
      detalhes:   bloqueados,
      em:         new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron/ExtrasBloqueio]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
