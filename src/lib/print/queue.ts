/**
 * Helper para enfileirar jobs de impressão.
 * Caller decide qual impressora pelo setor.
 */
import { query, queryOne } from "@/lib/db/client";

export type SetorImpressora = "cozinha" | "bar" | "balcao" | "retirada" | "caixa";
export type TipoCupom = "cupom" | "cozinha" | "comanda" | "conta" | "rejeicao";

interface EnqueueParams {
  empresaId:  string;
  setor:      SetorImpressora;
  pedidoId?:  string;
  tipo:       TipoCupom;
  conteudo:   string;            // texto plano ou ESC/POS base64
  formato?:   "escpos" | "text"; // default 'text' (agente formata)
}

/**
 * Cria 1 print_job para CADA impressora ativa naquele setor.
 * Retorna IDs dos jobs criados.
 */
export async function enqueuePrint(p: EnqueueParams): Promise<string[]> {
  const impressoras = await query<{ id: string }>(
    `SELECT id FROM impressoras
      WHERE empresa_id = $1 AND setor = $2 AND ativa = true`,
    [p.empresaId, p.setor]
  );
  if (impressoras.length === 0) return [];

  const ids: string[] = [];
  for (const imp of impressoras) {
    const r = await queryOne<{ id: string }>(
      `INSERT INTO print_jobs
         (empresa_id, impressora_id, pedido_id, tipo, conteudo, formato)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [p.empresaId, imp.id, p.pedidoId ?? null, p.tipo, p.conteudo, p.formato ?? "text"]
    );
    if (r?.id) ids.push(r.id);
  }
  return ids;
}

/** Cancela jobs pendentes de um pedido (caso pedido seja cancelado antes de imprimir). */
export async function cancelarJobsPedido(pedidoId: string): Promise<void> {
  await query(
    `UPDATE print_jobs
        SET status = 'erro', erro = 'pedido cancelado', enviado_em = NOW()
      WHERE pedido_id = $1 AND status = 'pendente'`,
    [pedidoId]
  );
}
