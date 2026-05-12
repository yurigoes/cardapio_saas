/**
 * POST /api/painel/pagamentos/[id]/sincronizar
 *
 * Consulta o gateway externo pelo status atual da cobrança e atualiza
 * o registro local. Útil quando webhook não chegou (gateway congestionado,
 * URL bloqueada por firewall, etc.).
 *
 * Se o status mudou para "aprovado", também atualiza o pedido para
 * "confirmado" (mesmo comportamento do webhook).
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, serverError } from "@/lib/utils/response";
import { getGateway } from "@/lib/gateways/registry";
import { registrarVendaPedido } from "@/lib/caixa/movimento";
import type { GatewaySlug } from "@/lib/gateways/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "financeiro:editar")) return forbidden();

  try {
    const pagamento = await queryOne<{
      id: string; gateway_slug: string; gateway_id: string;
      pedido_id: string | null; status: string; valor: string;
    }>(
      `SELECT id, gateway_slug, gateway_id, pedido_id, status, valor
       FROM pagamentos WHERE id = $1 AND empresa_id = $2`,
      [params.id, empresaId]
    );
    if (!pagamento) return notFound("Pagamento não encontrado");

    // Consulta o gateway externo
    const gw = await getGateway(empresaId, pagamento.gateway_slug as GatewaySlug);
    const remoto = await gw.consultar(pagamento.gateway_id);

    const statusRemoto = remoto.status; // "aprovado" | "aguardando" | "recusado" | etc

    // Se mudou, atualiza local
    if (statusRemoto !== pagamento.status) {
      await queryOne(
        `UPDATE pagamentos
           SET status = $1, gateway_data = $2::jsonb, updated_at = NOW()
         WHERE id = $3`,
        [statusRemoto, JSON.stringify(remoto.gateway_data), pagamento.id]
      );

      // Se ficou aprovado e pedido existe, replica no pedido
      if (statusRemoto === "aprovado" && pagamento.pedido_id) {
        await queryOne(
          `UPDATE pedidos
             SET status = 'confirmado', updated_at = NOW()
           WHERE id = $1 AND empresa_id = $2
             AND status NOT IN ('cancelado', 'entregue')
           RETURNING id`,
          [pagamento.pedido_id, empresaId]
        );

        // Integração caixa
        try {
          await registrarVendaPedido(
            empresaId, pagamento.pedido_id,
            Number(pagamento.valor), "pix"
          );
        } catch { /* não-fatal */ }
      }
    }

    return ok({
      pagamento_id:    pagamento.id,
      status_anterior: pagamento.status,
      status_atual:    statusRemoto,
      mudou:           statusRemoto !== pagamento.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao sincronizar";
    console.error("[Pagamentos/Sincronizar]", err);
    return serverError(msg);
  }
}
