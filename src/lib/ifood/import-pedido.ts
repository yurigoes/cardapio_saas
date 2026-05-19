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
    const totalRaw = ord.total as { orderAmount?: { value: number }; deliveryFee?: { value: number }; benefits?: { value: number } } | undefined;
    const total    = totalRaw?.orderAmount?.value ?? subtotal;
    const taxaEntrega = totalRaw?.deliveryFee?.value ?? 0;

    // ── Voucher / benefícios (Cenário 1 homologação)
    // iFood envia "benefits" como array OU em total.benefits.value (formato varia).
    interface BenefitItem { name?: string; value?: number; targetId?: string; target?: string; }
    const rawBenefits = (ord as { benefits?: unknown }).benefits;
    const benefitsArr: BenefitItem[] = Array.isArray(rawBenefits)
      ? (rawBenefits as BenefitItem[])
      : [];
    const valorVoucher = benefitsArr.reduce((a, b) => a + (Number(b.value) || 0), 0)
                      || Number(totalRaw?.benefits?.value || 0);
    const voucherCodigo = benefitsArr.find(b => b.target === "VOUCHER" || b.name)?.name
                      || benefitsArr[0]?.name
                      || null;

    // ── Agendamento (Cenário 1)
    // iFood: orderTiming = "IMMEDIATE" | "SCHEDULED" + schedule.deliveryDateTimeStart
    interface ScheduleObj { deliveryDateTimeStart?: string; deliveryDateTimeEnd?: string; }
    const orderTiming = (ord as { orderTiming?: string }).orderTiming;
    const schedule = (ord as { schedule?: ScheduleObj }).schedule ?? {};
    let agendadoPara: string | null = null;
    if (orderTiming === "SCHEDULED" && schedule.deliveryDateTimeStart) {
      agendadoPara = new Date(schedule.deliveryDateTimeStart).toISOString();
    }

    // tipo_consumo + tipo
    const ifoodMode = (ord.delivery as { mode?: string })?.mode
                   ?? (ord.takeout as { mode?: string })?.mode
                   ?? "DELIVERY";
    const tipo_consumo = ifoodMode === "TAKEOUT" ? "retirada" : "delivery";

    // Cliente — captura nome, telefone e documento (CPF/CNPJ — Cenário 5)
    interface CustomerObj {
      name?: string; phone?: string | { number?: string };
      documentNumber?: string; taxPayerIdentificationNumber?: string;
    }
    const cliente = (ord.customer as CustomerObj) ?? {};
    const clienteTel = typeof cliente.phone === "string"
      ? cliente.phone
      : (cliente.phone?.number ?? null);
    const clienteDoc = (cliente.documentNumber ?? cliente.taxPayerIdentificationNumber ?? null);
    const clienteDocLimpo = clienteDoc ? String(clienteDoc).replace(/\D/g, "").slice(0, 14) : null;

    // ── Pagamento: troco + observações (Cenário 5)
    // iFood: payments.methods[].cash.changeFor
    interface PaymentMethod { method?: string; cash?: { changeFor?: number }; type?: string; }
    interface PaymentsObj { methods?: PaymentMethod[]; prepaid?: number; }
    const payments = (ord as { payments?: PaymentsObj }).payments ?? {};
    const trocoMethod = (payments.methods ?? []).find(m => m.cash?.changeFor != null);
    const trocoPara = trocoMethod?.cash?.changeFor ?? null;

    // Forma de pagamento legível
    const primMethod = (payments.methods ?? [])[0];
    const formaPag = primMethod?.method?.toLowerCase()
                  ?? (trocoPara ? "dinheiro" : null);

    // Observações do cliente (comments / instructions)
    const clienteObs = (ord as { comments?: string }).comments
                    ?? (ord as { observations?: string }).observations
                    ?? null;

    // INSERT pedido — status pendente + ifood_aceite_status pendente
    const novoPed = await client.query<{ id: string; numero: number }>(
      `INSERT INTO pedidos
         (empresa_id, tipo, status, ifood_order_id, origem, origem_id,
          cliente_nome, cliente_telefone, cliente_documento, cliente_observacoes,
          subtotal, desconto, taxa_entrega, total,
          valor_voucher, voucher_codigo,
          troco_para, forma_pagamento,
          tipo_consumo, observacoes,
          agendado_para,
          ifood_aceite_status)
       VALUES ($1, $2, 'pendente', $3::text, 'ifood', $3::text,
               $4, $5, $6, $7,
               $8, $9, $10, $11,
               $12, $13,
               $14, $15,
               $16, $17,
               $18,
               'pendente')
       RETURNING id, numero`,
      [
        empresaId,                                          // 1
        tipo_consumo === "delivery" ? "delivery" : "balcao",// 2
        ord.id,                                             // 3
        cliente.name ?? null,                               // 4
        clienteTel,                                         // 5
        clienteDocLimpo,                                    // 6
        clienteObs,                                         // 7
        subtotal,                                           // 8
        valorVoucher,                                       // 9 desconto = voucher por enquanto
        taxaEntrega,                                        // 10
        total,                                              // 11
        valorVoucher,                                       // 12
        voucherCodigo,                                      // 13
        trocoPara,                                          // 14
        formaPag,                                           // 15
        tipo_consumo,                                       // 16
        `iFood #${ord.displayId ?? ord.id.slice(0, 8)}`,    // 17
        agendadoPara,                                       // 18
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
      // Pedidos simulados (prefixo SIM-) pulam a chamada real ao iFood
      const ehSimulado = typeof ord.id === "string" && ord.id.startsWith("SIM-");
      const ifoodCfg = ehSimulado ? null : await getIfoodConfig(empresaId);
      const ok = ehSimulado ? true : (ifoodCfg ? await confirmOrder(ifoodCfg, ord.id) : false);
      if (ehSimulado || ifoodCfg) {
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
