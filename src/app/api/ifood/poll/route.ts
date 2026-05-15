/**
 * POST /api/ifood/poll
 *   Body: { empresaId? }
 *   Header: x-cron-secret
 *
 * Endpoint disparado por cron externo a cada ~30s.
 * Faz 1 ciclo: poll → para cada PLACED busca detalhe + importa pedido →
 *   ack de TODOS os eventos lidos.
 *
 * Pode receber empresaId pra rodar só uma; sem ele itera todas com
 * polling_ativo=true.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { getIfoodConfig, pollEvents, ackEvents, getOrderDetail, type IfoodEvent } from "@/lib/ifood/client";
import { importarPedidoIfood } from "@/lib/ifood/import-pedido";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let empresaId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    empresaId = body.empresaId;
  } catch { /* sem body é OK */ }

  // Lista empresas elegíveis
  const empresas = empresaId
    ? [{ empresa_id: empresaId }]
    : await query<{ empresa_id: string }>(
        `SELECT empresa_id FROM ifood_config
          WHERE polling_ativo = true AND ativo = true`
      );

  const resumo: Array<{ empresa_id: string; eventos: number; pedidos: number; erro?: string }> = [];

  for (const { empresa_id } of empresas) {
    try {
      const cfg = await getIfoodConfig(empresa_id);
      if (!cfg || !cfg.ativo) continue;

      const events = await pollEvents(cfg);
      console.log(`[iFood/poll] empresa=${empresa_id} merchant=${cfg.merchant_id ?? '-'} mode=${cfg.mode ?? '-'} eventos_recebidos=${events.length}`);

      let importados = 0;
      const idsParaAck: string[] = [];

      for (const ev of events) {
        idsParaAck.push(ev.id);
        const codeRaw = String(ev.code ?? "UNKNOWN").toUpperCase();
        // Normaliza códigos iFood (Merchant API v1 usa 3 letras): PLC=PLACED, etc
        const isPlaced = codeRaw === "PLACED" || codeRaw === "PLC";
        console.log(`[iFood/poll] evento id=${ev.id} code=${codeRaw} orderId=${ev.orderId ?? '-'} placed=${isPlaced}`);

        // Salva evento bruto
        await queryOne(
          `INSERT INTO ifood_eventos
             (empresa_id, evento_id, tipo, pedido_ifood_id, payload)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (empresa_id, evento_id) DO NOTHING`,
          [empresa_id, ev.id, codeRaw, ev.orderId ?? null, JSON.stringify(ev)]
        );

        if (isPlaced && ev.orderId) {
          try {
            const detail = await getOrderDetail(cfg, ev.orderId);
            if (detail) {
              const r = await importarPedidoIfood(empresa_id, detail);
              if (!r.ja_existia) importados++;
              await queryOne(
                `UPDATE ifood_eventos SET pedido_id = $1, processado_em = NOW()
                  WHERE empresa_id = $2 AND evento_id = $3`,
                [r.pedido_id, empresa_id, ev.id]
              );
            }
          } catch (err) {
            await queryOne(
              `UPDATE ifood_eventos SET erro = $1 WHERE empresa_id = $2 AND evento_id = $3`,
              [(err as Error).message.slice(0, 500), empresa_id, ev.id]
            );
          }
        } else if (ev.orderId && !isPlaced) {
          // Sync inverso: status mudou no iFood — replica no nosso pedido
          // Mapa de codes iFood → status interno
          const STATUS_MAP: Record<string, string> = {
            CFM: "confirmado",      // CONFIRMED
            INTEGRATED: "confirmado",
            CONFIRMED:  "confirmado",
            DSP: "em_entrega",       // DISPATCHED — saiu pra entrega
            DISPATCHED: "em_entrega",
            RTP: "pronto",           // READY_TO_PICKUP
            READY_TO_PICKUP: "pronto",
            CON: "entregue",         // CONCLUDED
            CONCLUDED: "entregue",
            CAN: "cancelado",        // CANCELLED
            CANCELLED: "cancelado",
            CANCELLATION_REQUESTED: "cancelado",
          };
          const novoStatus = STATUS_MAP[codeRaw];
          if (novoStatus) {
            try {
              const upd = await queryOne<{ id: string; numero: number }>(
                `UPDATE pedidos
                    SET status     = $1,
                        updated_at = NOW()
                  WHERE empresa_id = $2
                    AND ifood_order_id = $3
                    AND status != $1
                    AND status NOT IN ('entregue', 'cancelado')
                  RETURNING id, numero`,
                [novoStatus, empresa_id, ev.orderId]
              );
              if (upd) {
                console.log(`[iFood/poll] sync inverso: pedido #${upd.numero} ${codeRaw} → status=${novoStatus}`);
              }
              await queryOne(
                `UPDATE ifood_eventos SET pedido_id = $1, processado_em = NOW()
                  WHERE empresa_id = $2 AND evento_id = $3`,
                [upd?.id ?? null, empresa_id, ev.id]
              );
            } catch (err) {
              await queryOne(
                `UPDATE ifood_eventos SET erro = $1 WHERE empresa_id = $2 AND evento_id = $3`,
                [(err as Error).message.slice(0, 500), empresa_id, ev.id]
              ).catch(() => {});
            }
          } else {
            // KEEPALIVE / DDCR / outros — só marca processado pra não ficar pendente eternamente
            await queryOne(
              `UPDATE ifood_eventos SET processado_em = NOW()
                WHERE empresa_id = $1 AND evento_id = $2`,
              [empresa_id, ev.id]
            ).catch(() => {});
          }
        }
      }

      // Ack tudo
      if (idsParaAck.length > 0) {
        await ackEvents(cfg, idsParaAck);
        await queryOne(
          `UPDATE ifood_eventos SET ack_em = NOW()
            WHERE empresa_id = $1 AND evento_id = ANY($2::text[])`,
          [empresa_id, idsParaAck]
        );
      }

      await queryOne(
        `UPDATE ifood_config
            SET ultimo_polling_em = NOW(),
                ultimo_evento_id  = COALESCE($1, ultimo_evento_id),
                ultimo_erro       = NULL,
                ultimo_erro_em    = NULL,
                updated_at        = NOW()
          WHERE empresa_id = $2`,
        [events[events.length - 1]?.id ?? null, empresa_id]
      );

      resumo.push({ empresa_id, eventos: events.length, pedidos: importados });
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      console.error(`[iFood/poll] empresa ${empresa_id}:`, msg);
      await queryOne(
        `UPDATE ifood_config
            SET ultimo_erro = $1, ultimo_erro_em = NOW(), updated_at = NOW()
          WHERE empresa_id = $2`,
        [msg, empresa_id]
      ).catch(() => {});
      resumo.push({ empresa_id, eventos: 0, pedidos: 0, erro: msg });
    }
  }

  return NextResponse.json({ ok: true, empresas: resumo });
}

export async function GET() {
  return NextResponse.json({ ok: true, cron: "ifood-poll" });
}
