/**
 * GET /api/mesas/[id]/historico?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Retorna pedidos da mesa no período. Default: hoje.
 * Útil para ver rodadas/comandas do dia ou auditar uso histórico.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

function todayISO() { return new Date().toISOString().slice(0, 10); }

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:ver")) return forbidden();

  const sp   = req.nextUrl.searchParams;
  const from = sp.get("from") ?? todayISO();
  const to   = sp.get("to")   ?? todayISO();

  try {
    const mesa = await queryOne<{ id: string; numero: number }>(
      `SELECT id, numero FROM mesas
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!mesa) return notFound("Mesa não encontrada");

    const pedidos = await query<{
      id:           string;
      numero:       number;
      status:       string;
      total:        string;
      subtotal:     string;
      desconto:     string;
      forma_pagamento: string | null;
      cliente_nome: string | null;
      criado_em:    string;
      entregue_em:  string | null;
    }>(
      `SELECT p.id, p.numero, p.status, p.total, p.subtotal, p.desconto,
              p.forma_pagamento, p.cliente_nome,
              p.created_at  AS criado_em,
              p.entregue_em
       FROM pedidos p
       WHERE p.mesa_id = $1 AND p.empresa_id = $2
         AND p.deleted_at IS NULL
         AND p.created_at >= $3::date
         AND p.created_at < ($4::date + INTERVAL '1 day')
       ORDER BY p.created_at DESC`,
      [params.id, empresaId, from, to]
    );

    const totalGeral = pedidos
      .filter(p => p.status !== "cancelado")
      .reduce((acc, p) => acc + Number(p.total), 0);

    return ok({
      mesa: { id: mesa.id, numero: mesa.numero },
      periodo: { from, to },
      pedidos: pedidos.map((p) => ({
        ...p,
        total:    Number(p.total),
        subtotal: Number(p.subtotal),
        desconto: Number(p.desconto),
      })),
      total_geral: totalGeral,
    });
  } catch (err) {
    console.error("[Mesas/Historico]", err);
    return serverError();
  }
}
