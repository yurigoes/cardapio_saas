import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db/client";
import { temPermissao } from "@/lib/auth/rbac";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { notificarClienteSobrePedido, type EvolutionEvento } from "@/lib/notify/evolution";
import { cancelarJobsPedido } from "@/lib/print/queue";
import { invalidarRastreio } from "@/lib/delivery/rastreio";
import { dispatchCupomCozinha } from "@/lib/print/dispatch";
import { syncIfoodAsync } from "@/lib/ifood/sync-status";

// Map de status do pedido → ID do evento Evolution (WA_EVENTOS no painel)
const STATUS_TO_EVENTO: Partial<Record<PedidoStatus, EvolutionEvento>> = {
  confirmado: "confirmado",
  em_preparo: "em_preparo",
  preparo:    "em_preparo",
  pronto:     "pronto",
  entregue:   "entregue",
  cancelado:  "cancelado",
};

// Aceita TODOS os nomes usados pelo frontend (PROXIMOS_STATUS em /painel/pedidos).
// 'em_preparo' aceito como alias legado de 'preparo'.
const STATUS_SEQUENCE = [
  "pendente", "confirmado", "preparo", "em_preparo",
  "pronto", "entregue", "cancelado",
] as const;
type PedidoStatus = typeof STATUS_SEQUENCE[number];

const patchSchema = z.object({
  status: z.enum(STATUS_SEQUENCE),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();
  if (!temPermissao(role, "pedido:ver")) return forbidden();

  try {
    const pedido = await queryOne<Record<string, unknown>>(
      `SELECT p.*,
              m.numero as mesa_numero,
              u.nome   as atendente_nome,
              mb.nome  as motoboy_nome,
              mb.telefone as motoboy_telefone,
              z.nome   as zona_nome
       FROM pedidos p
       LEFT JOIN mesas    m  ON m.id  = p.mesa_id
       LEFT JOIN usuarios u  ON u.id  = p.atendente_id
       LEFT JOIN motoboys mb ON mb.id = p.motoboy_id
       LEFT JOIN zonas_entrega z ON z.id = p.zona_id
       WHERE p.id = $1 AND p.empresa_id = $2 AND p.deleted_at IS NULL`,
      [params.id, empresaId]
    );

    if (!pedido) return notFound("Pedido não encontrado");

    const itens = await query(
      `SELECT pi.id, pi.nome, pi.quantidade, pi.preco_unitario, pi.subtotal,
              pi.observacoes,
              COALESCE(pi.adicionais,   '[]'::jsonb) AS adicionais,
              COALESCE(pi.complementos, '[]'::jsonb) AS complementos
       FROM pedido_itens pi
       WHERE pi.pedido_id = $1
       ORDER BY pi.created_at ASC`,
      [params.id]
    );

    return ok({ ...pedido, itens });
  } catch (err) {
    console.error("[Pedidos/GET-ONE]", err);
    return serverError();
  }
}

// ─────────────────────────────────────────────
// PATCH /api/pedidos/[id] — Atualiza status
// ─────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, role } = auth.payload;
  if (!empresaId) return forbidden();

  // cozinha usa cozinha:atualizar; outros precisam de pedido:editar
  const podePorCozinha = temPermissao(role, "cozinha:atualizar");
  const podePorPainel  = temPermissao(role, "pedido:editar");
  if (!podePorCozinha && !podePorPainel) return forbidden();

  let body: { status: PedidoStatus };
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return badRequest("Status inválido");
  }

  try {
    const pedido = await queryOne<{
      id: string; status: string; mesa_id: string | null;
      numero: number | null; cliente_telefone: string | null; total: string | null;
    }>(
      `SELECT id, status, mesa_id, numero, cliente_telefone, total
         FROM pedidos
        WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [params.id, empresaId]
    );
    if (!pedido) return notFound("Pedido não encontrado");

    await queryOne(
      `UPDATE pedidos SET status = $1, updated_at = NOW() WHERE id = $2`,
      [body.status, params.id]
    );

    // Se entregue e tinha mesa, libera a mesa
    if (body.status === "entregue" && pedido.mesa_id) {
      await queryOne(
        `UPDATE mesas SET status = 'livre', pedido_ativo_id = NULL WHERE id = $1`,
        [pedido.mesa_id]
      );
    }

    // Se entregue, invalida link de rastreio
    if (body.status === "entregue") {
      invalidarRastreio(params.id).catch(() => {});
    }

    // Cancela jobs de impressão pendentes se pedido foi cancelado
    if (body.status === "cancelado" && pedido.status !== "cancelado") {
      cancelarJobsPedido(params.id)
        .catch(e => console.warn("[Pedidos/PATCH] cancel print:", e));
    }

    // Dispara cozinha quando pedido é CONFIRMADO (e ainda não foi)
    if ((body.status === "confirmado" || body.status === "preparo" || body.status === "em_preparo")
        && pedido.status === "pendente") {
      dispatchCupomCozinha(empresaId, params.id)
        .catch(e => console.warn("[Pedidos/PATCH] cozinha:", e));
    }

    // Sync com iFood (se origem='ifood' e tem ifood_order_id) — best-effort
    if (pedido.status !== body.status) {
      syncIfoodAsync(empresaId, params.id, body.status);
    }

    // WhatsApp ao cliente em transições relevantes (best-effort).
    // Usa notificarClienteSobrePedido pra garantir que vai pro CLIENTE
    // (busca telefone + nome + total do pedido em vez de assumir vars).
    const evento = STATUS_TO_EVENTO[body.status];
    if (evento && pedido.status !== body.status) {
      notificarClienteSobrePedido(empresaId, params.id, evento)
        .catch(e => console.warn("[Pedidos/PATCH] notify:", e));
    }

    return ok({ id: params.id, status: body.status });
  } catch (err) {
    console.error("[Pedidos/PATCH]", err);
    return serverError();
  }
}
