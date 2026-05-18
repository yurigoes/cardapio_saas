/**
 * GET /api/pub/terminal/[id]/status
 * UI faz polling aqui pra saber se o pagamento foi aprovado.
 * Consulta o gateway se ainda pendente.
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, notFound, serverError } from "@/lib/utils/response";
import { getDriver } from "@/lib/payments/terminal/registry";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const tx = await queryOne<{
    id: string; status: string; driver: string; gateway_tx_id: string | null;
    terminal_id: string | null;
  }>(
    `SELECT id, status, driver, gateway_tx_id, terminal_id
       FROM terminal_transacoes WHERE id = $1`,
    [params.id]
  );
  if (!tx) return notFound();

  // Status final → não consulta gateway
  if (["aprovada","recusada","cancelada","expirada","erro"].includes(tx.status)) {
    return ok({ transacao_id: tx.id, status: tx.status });
  }

  // Status intermediário → consulta gateway se driver suporta
  const driver = getDriver(tx.driver);
  if (driver && tx.terminal_id) {
    const cred = await queryOne<{ credenciais: Record<string, unknown> }>(
      `SELECT credenciais FROM empresa_terminais WHERE id = $1`,
      [tx.terminal_id]
    );
    if (cred) {
      try {
        const remoto = await driver.consultarStatus(tx.id, tx.gateway_tx_id, cred.credenciais);
        if (remoto.status !== tx.status as typeof remoto.status) {
          await query(
            `UPDATE terminal_transacoes
                SET status            = $1,
                    authorization_id  = COALESCE($2, authorization_id),
                    bandeira          = COALESCE($3, bandeira),
                    ultimos_4         = COALESCE($4, ultimos_4),
                    concluido_em      = CASE WHEN $1 = 'aprovada' THEN NOW() ELSE concluido_em END
              WHERE id = $5`,
            [remoto.status, remoto.authorization_id ?? null,
             remoto.bandeira ?? null, remoto.ultimos_4 ?? null, tx.id]
          ).catch(() => null);
        }
        return ok(remoto);
      } catch (err) {
        return serverError(err instanceof Error ? err.message : undefined);
      }
    }
  }

  return ok({ transacao_id: tx.id, status: tx.status });
}
