/**
 * Importa pedido do iFood para a tabela pedidos.
 * Idempotente via ifood_order_id UNIQUE.
 *
 * Mapeia campos essenciais; payload completo fica em ifood_eventos.payload.
 */
import { transaction } from "@/lib/db/client";
import type { PoolClient } from "pg";
import type { IfoodOrderDetail } from "./client";
import { notificarEvolution } from "@/lib/notify/evolution";

interface ImportResult {
  pedido_id:     string;
  numero:        number;
  ja_existia:    boolean;
}

export async function importarPedidoIfood(
  empresaId: string,
  ord:       IfoodOrderDetail
): Promise<ImportResult> {
  return await transaction(async (client: PoolClient) => {
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

    // INSERT pedido
    const novoPed = await client.query<{ id: string; numero: number }>(
      `INSERT INTO pedidos
         (empresa_id, tipo, status, ifood_order_id, origem, origem_id,
          cliente_nome, cliente_telefone,
          subtotal, desconto, taxa_entrega, total,
          tipo_consumo, observacoes)
       VALUES ($1, $2, 'pendente', $3, 'ifood', $3,
               $4, $5,
               $6, 0, 0, $7,
               $8, $9)
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
}
