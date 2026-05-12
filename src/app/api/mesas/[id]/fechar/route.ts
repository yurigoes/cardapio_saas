/**
 * POST /api/mesas/[id]/fechar
 *   body opcional: { observacoes?: string }
 *
 * Fecha a mesa: marca o pedido ativo como "entregue" (já foi consumido),
 * limpa pedido_ativo_id e seta status='livre'. Em transação.
 *
 * Útil quando o cliente paga e libera a mesa.
 *
 * Se a mesa não tem pedido ativo, apenas garante status='livre'.
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { transaction } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "mesa:editar") && !temPermissao(role, "pedido:editar")) {
    return forbidden();
  }

  try {
    const result = await transaction(async (client) => {
      const mesa = await client.query<{
        id: string; pedido_ativo_id: string | null;
      }>(
        `SELECT id, pedido_ativo_id FROM mesas
         WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [params.id, empresaId]
      ).then(r => r.rows[0]);

      if (!mesa) return { error: "not_found" as const };

      // Se há pedido ativo, marca como entregue (se ainda não estiver)
      let pedidoFechado: { id: string; numero: number; total: string } | null = null;
      if (mesa.pedido_ativo_id) {
        const pedido = await client.query<{ id: string; numero: number; total: string; status: string }>(
          `UPDATE pedidos
             SET status = CASE WHEN status IN ('cancelado', 'entregue') THEN status
                               ELSE 'entregue' END,
                 entregue_em = COALESCE(entregue_em, NOW()),
                 updated_at = NOW()
           WHERE id = $1 AND empresa_id = $2
           RETURNING id, numero, total, status`,
          [mesa.pedido_ativo_id, empresaId]
        ).then(r => r.rows[0]);

        if (pedido) {
          pedidoFechado = { id: pedido.id, numero: pedido.numero, total: pedido.total };
        }
      }

      // Limpa estado da mesa
      await client.query(
        `UPDATE mesas
           SET status = 'livre', pedido_ativo_id = NULL, updated_at = NOW()
         WHERE id = $1 AND empresa_id = $2`,
        [params.id, empresaId]
      );

      return { ok: true, pedido: pedidoFechado };
    });

    if ("error" in result) {
      if (result.error === "not_found") return notFound("Mesa não encontrada");
    }

    return ok(result);
  } catch (err) {
    console.error("[Mesas/Fechar]", err);
    return serverError();
  }
}
