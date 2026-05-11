import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, serverError } from "@/lib/utils/response";
import { assertModuloAtivo } from "@/lib/modules/checker";

// ─────────────────────────────────────────────
// GET /api/cozinha/pedidos — Fila da cozinha (KDS)
// ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();

  if (!temPermissao(role, "cozinha:ver")) return forbidden();

  try {
    await assertModuloAtivo(empresaId, "cozinha_kds");
  } catch {
    return forbidden("Módulo Cozinha/KDS não está ativo");
  }

  const setor = req.nextUrl.searchParams.get("setor");

  const conditions: string[] = [
    `p.empresa_id = $1`,
    `p.status IN ('confirmado','preparando')`,
    `p.deleted_at IS NULL`,
    `p.created_at >= NOW() - INTERVAL '12 hours'`,
  ];
  const values: unknown[] = [empresaId];

  if (setor) {
    conditions.push(`pi.setor_producao = $2`);
    values.push(setor);
  }

  try {
    const pedidos = await query(
      `SELECT
         p.id,
         p.numero,
         p.tipo,
         p.status,
         p.comanda,
         p.observacoes,
         p.created_at,
         p.aceito_em,
         p.preparando_em,
         m.numero as mesa_numero,
         EXTRACT(EPOCH FROM (NOW() - p.created_at))::int as tempo_espera_segundos,
         json_agg(
           json_build_object(
             'id',            pi.id,
             'nome',          pi.nome,
             'quantidade',    pi.quantidade,
             'observacoes',   pi.observacoes,
             'adicionais',    pi.adicionais,
             'complementos',  pi.complementos,
             'status',        pi.status,
             'setor',         pi.setor_producao
           ) ORDER BY pi.created_at
         ) as itens
       FROM pedidos p
       JOIN pedido_itens pi ON pi.pedido_id = p.id
       LEFT JOIN mesas m ON m.id = p.mesa_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY p.id, m.numero
       ORDER BY
         CASE p.status
           WHEN 'confirmado'  THEN 1
           WHEN 'preparando'  THEN 2
         END,
         p.created_at ASC`,
      values
    );

    return ok(pedidos);
  } catch (err) {
    console.error("[Cozinha/Pedidos]", err);
    return serverError();
  }
}
