/**
 * GET /api/pub/cliente/me
 * Header: X-Cliente-Token: <token>
 *
 * Retorna dados do cliente + pontos + cupons disponíveis + últimos pedidos.
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, unauthorized, serverError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

async function getCliente(req: NextRequest) {
  const token = req.headers.get("x-cliente-token") ?? "";
  if (!token) return null;
  const sess = await queryOne<{
    cliente_id: string; empresa_id: string;
  }>(
    `UPDATE cliente_sessoes SET ultima_uso = NOW()
       WHERE token = $1 AND expira_em > NOW()
       RETURNING cliente_id, empresa_id`,
    [token]
  );
  return sess;
}

export async function GET(req: NextRequest) {
  const sess = await getCliente(req);
  if (!sess) return unauthorized("Sessão inválida ou expirada");

  try {
    const cliente = await queryOne(
      `SELECT id, nome, telefone, email,
              COALESCE(pontos, 0)               AS pontos,
              COALESCE(saldo_cashback, 0)::text AS saldo_cashback,
              COALESCE(total_pedidos, 0)        AS total_pedidos,
              COALESCE(total_gasto, 0)::text    AS total_gasto,
              ultimo_pedido_em::text
         FROM clientes WHERE id = $1`,
      [sess.cliente_id]
    );

    const empresa = await queryOne(
      `SELECT id, slug, nome_fantasia, logo_url, cor_primaria,
              fidelidade_ativo, pontos_por_real, real_por_ponto,
              cashback_ativo, cashback_percentual
         FROM empresas WHERE id = $1`,
      [sess.empresa_id]
    );

    // Cupons da empresa que o cliente PODE usar (ativos, dentro da validade)
    const cupons = await query(
      `SELECT id, codigo, descricao, tipo_desconto, valor_desconto,
              valido_ate::text, uso_maximo, uso_atual,
              valor_minimo
         FROM cupons
        WHERE empresa_id = $1
          AND ativo = TRUE
          AND (valido_ate IS NULL OR valido_ate > NOW())
        ORDER BY valido_ate NULLS LAST, created_at DESC
        LIMIT 20`,
      [sess.empresa_id]
    ).catch(() => []);

    // Últimos 10 pedidos
    const pedidos = await query(
      `SELECT id, numero, status, total::float, tipo_consumo, created_at::text
         FROM pedidos
        WHERE cliente_id = $1
          AND empresa_id = $2
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10`,
      [sess.cliente_id, sess.empresa_id]
    ).catch(() => []);

    return ok({ cliente, empresa, cupons, pedidos });
  } catch (err) {
    console.error("[Cliente/me]", err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
