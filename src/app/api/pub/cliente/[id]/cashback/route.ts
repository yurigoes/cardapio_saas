/**
 * GET /api/pub/cliente/[id]/cashback?slug=
 *
 * Retorna saldo de cashback + histórico (últimos 30 movimentos) do cliente.
 * Rota pública — escopo definido pelo slug da empresa.
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return badRequest("Parâmetro 'slug' obrigatório");

  try {
    const empresa = await queryOne<{
      id: string;
      cashback_ativo: boolean;
      cashback_percentual: string;
    }>(
      `SELECT id,
              COALESCE(cashback_ativo, false)        AS cashback_ativo,
              COALESCE(cashback_percentual, 0)        AS cashback_percentual
       FROM empresas WHERE slug = $1 AND deleted_at IS NULL AND status = 'ativo'`,
      [slug]
    );
    if (!empresa) return notFound("Empresa não encontrada");

    const cliente = await queryOne<{ saldo: string }>(
      `SELECT COALESCE(saldo_cashback, 0) AS saldo
       FROM clientes WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresa.id]
    );
    if (!cliente) return notFound("Cliente não encontrado");

    const movs = await query<{
      id: string; tipo: string; valor: string;
      saldo_anterior: string | null; saldo_atual: string | null;
      motivo: string | null; criado_em: string;
      pedido_numero: number | null;
    }>(
      `SELECT m.id, m.tipo, m.valor,
              m.saldo_anterior, m.saldo_atual, m.motivo, m.criado_em,
              p.numero AS pedido_numero
       FROM cashback_movimentos m
       LEFT JOIN pedidos p ON p.id = m.pedido_id
       WHERE m.cliente_id = $1 AND m.empresa_id = $2
       ORDER BY m.criado_em DESC LIMIT 30`,
      [params.id, empresa.id]
    );

    return ok({
      empresa: {
        cashback_ativo:      empresa.cashback_ativo,
        cashback_percentual: Number(empresa.cashback_percentual),
      },
      saldo: Number(cliente.saldo),
      movimentos: movs.map(m => ({
        ...m,
        valor:          Number(m.valor),
        saldo_anterior: m.saldo_anterior != null ? Number(m.saldo_anterior) : null,
        saldo_atual:    m.saldo_atual    != null ? Number(m.saldo_atual)    : null,
      })),
    });
  } catch (err) {
    console.error("[Pub/Cliente/Cashback]", err);
    return serverError();
  }
}
