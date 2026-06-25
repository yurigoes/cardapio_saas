/**
 * GET /api/terminal-agent/proxima?token=AGENT_TOKEN
 *
 * Chamado pelo app "Three Pay" rodando no terminal Cielo Smart (L400).
 * Autentica pelo agent_token do terminal e devolve a PRÓXIMA cobrança pendente
 * (status 'processando', ainda não reclamada), reclamando-a atomicamente pra
 * evitar cobrança dupla. Retorna null se não houver nada na fila.
 *
 * Resposta:
 *   { ok: true, cobranca: { transacao_id, valor, metodo, parcelas, pedido_id } | null }
 */
import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound } from "@/lib/utils/response";

interface ItemPedido { nome: string; quantidade: number; preco_unitario: number; subtotal: number; observacoes: string | null }

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) return badRequest("token obrigatório");

  const terminal = await queryOne<{ id: string }>(
    `SELECT id FROM empresa_terminais WHERE agent_token = $1 AND ativo = TRUE`,
    [token]
  );
  if (!terminal) return notFound("terminal não encontrado ou inativo");

  // Heartbeat (best-effort)
  await query(`UPDATE empresa_terminais SET agente_visto_em = NOW() WHERE id = $1`, [terminal.id]).catch(() => null);

  // Reivindica atomicamente a próxima cobrança pendente do terminal.
  // Reclama de novo se uma claim antiga (>90s) não virou resultado (retry).
  const cobranca = await queryOne<{
    id: string; valor: string; metodo: string; parcelas: number; pedido_id: string | null;
  }>(
    `UPDATE terminal_transacoes
        SET agente_claim_em = NOW()
      WHERE id = (
        SELECT id FROM terminal_transacoes
         WHERE terminal_id = $1
           AND status = 'processando'
           AND (agente_claim_em IS NULL OR agente_claim_em < NOW() - INTERVAL '90 seconds')
         ORDER BY iniciado_em ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, valor, metodo, parcelas, pedido_id`,
    [terminal.id]
  );

  if (!cobranca) return ok({ cobranca: null });

  // Dados do pedido pra imprimir o comprovante completo no L400 (best-effort)
  let pedido: { numero: number | null; cliente_nome: string | null; total: number; itens: ItemPedido[] } | null = null;
  if (cobranca.pedido_id) {
    const ped = await queryOne<{ numero: number | null; cliente_nome: string | null; total: string }>(
      `SELECT numero, cliente_nome, total FROM pedidos WHERE id = $1`, [cobranca.pedido_id]
    );
    if (ped) {
      const itens = await query<ItemPedido>(
        `SELECT nome, quantidade, preco_unitario, subtotal, observacoes
           FROM pedido_itens WHERE pedido_id = $1 ORDER BY created_at`, [cobranca.pedido_id]
      );
      pedido = {
        numero: ped.numero,
        cliente_nome: ped.cliente_nome,
        total: Number(ped.total),
        itens: (itens as ItemPedido[]).map(i => ({
          nome: i.nome, quantidade: Number(i.quantidade),
          preco_unitario: Number(i.preco_unitario), subtotal: Number(i.subtotal),
          observacoes: i.observacoes,
        })),
      };
    }
  }

  return ok({
    cobranca: {
      transacao_id: cobranca.id,
      valor:        Number(cobranca.valor),
      metodo:       cobranca.metodo,
      parcelas:     cobranca.parcelas,
      pedido_id:    cobranca.pedido_id,
      pedido,
    },
  });
}
