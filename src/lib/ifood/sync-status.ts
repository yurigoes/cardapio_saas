/**
 * Sincroniza mudanças de status do nosso painel com o iFood.
 *
 * Mapa interno → iFood:
 *   pendente    → (nada — espera aceite)
 *   confirmado  → /confirm  (e startPreparation logo depois)
 *   preparo     → /startPreparation
 *   em_preparo  → /startPreparation
 *   pronto      → /readyToPickup    (se TAKEOUT)
 *                /dispatch          (se DELIVERY já com motoboy)
 *   entregue    → (nada — fluxo natural conclui sozinho no iFood)
 *   cancelado   → /requestCancellation
 *
 * Best-effort: nunca trava o PATCH do nosso pedido. Loga erros e segue.
 * Idempotente: o iFood ignora se o estado já bateu.
 */
import { queryOne } from "@/lib/db/client";
import {
  getIfoodConfig,
  confirmOrder,
  startPreparation,
  readyToPickup,
  dispatchOrder,
  cancelOrder,
} from "./client";

interface PedidoSync {
  ifood_order_id: string;
  origem: string | null;
  tipo_consumo: string | null;
}

const TAG = "[iFood/sync]";

/**
 * Chamado APÓS o UPDATE do nosso pedido. Decide se precisa replicar no iFood
 * baseado no novo status. Não bloqueia o caller (caller deve usar .catch()).
 */
export async function syncIfoodFromInternalStatus(
  empresaId: string,
  pedidoId:  string,
  novoStatus: string,
  motivoCancelamento?: string,
): Promise<{ acao: string | null; ok: boolean }> {
  const ped = await queryOne<PedidoSync>(
    `SELECT ifood_order_id, origem, tipo_consumo
       FROM pedidos
      WHERE id = $1 AND empresa_id = $2`,
    [pedidoId, empresaId]
  ).catch(() => null);

  if (!ped) return { acao: null, ok: false };
  if (ped.origem !== "ifood" || !ped.ifood_order_id) return { acao: null, ok: true };

  // Pedidos simulados (prefixo SIM-) não vão pra API do iFood
  if (ped.ifood_order_id.startsWith("SIM-")) {
    return { acao: "skipped_simulated", ok: true };
  }

  const cfg = await getIfoodConfig(empresaId);
  if (!cfg) return { acao: null, ok: false };

  try {
    switch (novoStatus) {
      case "confirmado": {
        const ok = await confirmOrder(cfg, ped.ifood_order_id);
        return { acao: "confirm", ok };
      }
      case "preparo":
      case "em_preparo": {
        // Confirma primeiro (idempotente — iFood retorna ok se já confirmado)
        await confirmOrder(cfg, ped.ifood_order_id).catch(() => {});
        const ok = await startPreparation(cfg, ped.ifood_order_id);
        return { acao: "startPreparation", ok };
      }
      case "pronto": {
        // Dispatch (delivery) ou readyToPickup (retirada/takeout)
        const isTakeout = ped.tipo_consumo === "retirada" || ped.tipo_consumo === "takeout";
        if (isTakeout) {
          const ok = await readyToPickup(cfg, ped.ifood_order_id);
          return { acao: "readyToPickup", ok };
        } else {
          const ok = await dispatchOrder(cfg, ped.ifood_order_id);
          return { acao: "dispatch", ok };
        }
      }
      case "em_entrega":
      case "saiu_entrega": {
        const ok = await dispatchOrder(cfg, ped.ifood_order_id);
        return { acao: "dispatch", ok };
      }
      case "cancelado": {
        const ok = await cancelOrder(
          cfg,
          ped.ifood_order_id,
          motivoCancelamento ?? "Cancelado pelo estabelecimento",
          "801",
        );
        return { acao: "requestCancellation", ok };
      }
      default:
        return { acao: null, ok: true };
    }
  } catch (err) {
    console.warn(`${TAG} ${novoStatus} pedido=${pedidoId}:`, err instanceof Error ? err.message : err);
    return { acao: null, ok: false };
  }
}

/** Wrapper fire-and-forget que loga sem propagar erro. */
export function syncIfoodAsync(
  empresaId: string,
  pedidoId:  string,
  novoStatus: string,
  motivoCancelamento?: string,
): void {
  syncIfoodFromInternalStatus(empresaId, pedidoId, novoStatus, motivoCancelamento)
    .then((r) => {
      if (r.acao) {
        console.log(`${TAG} ${r.acao} pedido=${pedidoId} status=${novoStatus} ok=${r.ok}`);
      }
    })
    .catch((err) => {
      console.warn(`${TAG} async error:`, err instanceof Error ? err.message : err);
    });
}
