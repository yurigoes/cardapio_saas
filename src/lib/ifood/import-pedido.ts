/**
 * Importa pedido do iFood para a tabela pedidos.
 * Idempotente via ifood_order_id UNIQUE.
 *
 * Mapeia campos essenciais; payload completo fica em ifood_eventos.payload.
 */
import { queryOne, transaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { IfoodOrderDetail } from "./client";
import { confirmOrder, getIfoodConfig } from "./client";
import { notificarEvolution } from "@/lib/notify/evolution";
import { dispatchCupomCozinha } from "@/lib/print/dispatch";

interface ImportResult {
  pedido_id:     string;
  numero:        number;
  ja_existia:    boolean;
  auto_aceito?:  boolean;
}

export async function importarPedidoIfood(
  empresaId: string,
  ord:       IfoodOrderDetail
): Promise<ImportResult> {
  // Lê config pra saber se auto_aceite ligado (fora da transaction)
  const cfg = await queryOne<{ auto_aceite: boolean }>(
    `SELECT auto_aceite FROM ifood_config WHERE empresa_id = $1`,
    [empresaId]
  ).catch(() => null);
  const autoAceite = !!cfg?.auto_aceite;

  const result = await transaction(async (client: PoolClient) => {
    // Já importado?
    const ja = await client.query<{ id: string; numero: number }>(
      `SELECT id, numero FROM pedidos WHERE ifood_order_id = $1 LIMIT 1`,
      [ord.id]
    ).then(r => r.rows[0]);

    if (ja) {
      return { pedido_id: ja.id, numero: ja.numero, ja_existia: true };
    }

    // Calcula totais
    const itens    = Array.isArray(ord.items) ? ord.items : [];
    const subtotal = itens.reduce((a, i) => a + (i.unitPrice?.value ?? 0) * (i.quantity ?? 1), 0);
    const total    = (ord.total as { orderAmount?: { value: number } })?.orderAmount?.value ?? subtotal;

    // tipo_consumo + tipo
    const ifoodMode = (ord.delivery as { mode?: string })?.mode
                   ?? (ord.takeout as { mode?: string })?.mode
                   ?? "DELIVERY";
    const tipo_consumo = ifoodMode === "TAKEOUT" ? "retirada" : "delivery";

    const cliente   = (ord.customer as { name?: string; phone?: string }) ?? {};

    // INSERT pedido — status pendente + ifood_aceite_status pendente
    // (será atualizado p/ auto_aceito após o INSERT se autoAceite=true)
    const novoPed = await client.query<{ id: string; numero: number }>(
      `INSERT INTO pedidos
         (empresa_id, tipo, status, ifood_order_id, origem, origem_id,
          cliente_nome, cliente_telefone,
          subtotal, desconto, taxa_entrega, total,
          tipo_consumo, observacoes,
          ifood_aceite_status)
       VALUES ($1, $2, 'pendente', $3::text, 'ifood', $3::varchar,
               $4, $5,
               $6, 0, 0, $7,
               $8, $9, 'pendente')
       RETURNING id, numero`,
      [
        empresaId,
        tipo_consumo === "delivery" ? "delivery" : "balcao",
        ord.id,
        cliente.name ?? null,
        cliente.phone ?? null,
        subtotal,
        total,
        tipo_consumo,
        `iFood #${ord.displayId ?? ord.id.slice(0, 8)}`,
      ]
    ).then(r => r.rows[0]);

    // INSERT itens
    for (const item of itens) {
      const it_subtotal = (item.unitPrice?.value ?? 0) * (item.quantity ?? 1);
      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, nome, preco_unitario, quantidade, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [novoPed.id, item.name, item.unitPrice?.value ?? 0, item.quantity ?? 1, it_subtotal]
      );
    }

    // Notifica empresa via Evolution (se config)
    notificarEvolution(empresaId, "novo_pedido", {
      pedidoNumero: novoPed.numero,
      total,
    }).catch(() => {});

    return { pedido_id: novoPed.id, numero: novoPed.numero, ja_existia: false };
  });

  // Auto-aceite (FORA da transaction — chamada externa pra iFood)
  if (!result.ja_existia && autoAceite) {
    try {
      const ifoodCfg = await getIfoodConfig(empresaId);
      if (ifoodCfg) {
        const ok = await confirmOrder(ifoodCfg, ord.id);
        if (ok) {
          await queryOne(
            `UPDATE pedidos
                SET status = 'confirmado',
                    ifood_aceite_status = 'auto_aceito',
                    ifood_aceite_em = NOW()
              WHERE id = $1`,
            [result.pedido_id]
          ).catch(() => {});
          // Dispara cozinha (auto-aceito, segue fluxo normal)
          dispatchCupomCozinha(empresaId, result.pedido_id)
            .catch((e) => console.warn("[iFood/import] cozinha:", e));
          return { ...result, auto_aceito: true };
        } else {
          console.warn(`[iFood/import] auto-aceite falhou pra ${ord.id}`);
        }
      }
    } catch (err) {
      console.warn("[iFood/import] auto-aceite error:", err);
    }
  }

  return result;
}
