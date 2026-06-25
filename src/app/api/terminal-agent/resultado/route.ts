/**
 * POST /api/terminal-agent/resultado
 *
 * Chamado pelo app "Three Pay" no terminal Cielo Smart após o cliente pagar.
 * Body: {
 *   token, transacao_id, resultado: 'aprovada'|'recusada'|'cancelada'|'erro',
 *   authorization_id?, nsu?, bandeira?, ultimos_4?, mensagem?, raw?
 * }
 * Atualiza a transação; o totem (pollando /api/pub/terminal/[id]/status) vê o resultado.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

const schema = z.object({
  token:            z.string().min(8),
  transacao_id:     z.string().uuid(),
  resultado:        z.enum(["aprovada", "recusada", "cancelada", "erro"]),
  authorization_id: z.string().max(60).optional(),
  nsu:              z.string().max(60).optional(),
  bandeira:         z.string().max(40).optional(),
  ultimos_4:        z.string().max(4).optional(),
  mensagem:         z.string().max(300).optional(),
  raw:              z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "body inválido"); }

  const terminal = await queryOne<{ id: string }>(
    `SELECT id FROM empresa_terminais WHERE agent_token = $1 AND ativo = TRUE`,
    [body.token]
  );
  if (!terminal) return notFound("terminal não encontrado ou inativo");

  // Garante que a transação é deste terminal e ainda não finalizada
  const tx = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM terminal_transacoes WHERE id = $1 AND terminal_id = $2`,
    [body.transacao_id, terminal.id]
  );
  if (!tx) return notFound("transação não encontrada para este terminal");
  if (["aprovada", "recusada", "cancelada"].includes(tx.status)) {
    return ok({ ja_finalizada: true, status: tx.status });
  }

  await query(
    `UPDATE terminal_transacoes
        SET status           = $1,
            authorization_id = COALESCE($2, authorization_id),
            bandeira         = COALESCE($3, bandeira),
            ultimos_4        = COALESCE($4, ultimos_4),
            erro_mensagem    = $5,
            raw_response     = COALESCE($6::jsonb, raw_response),
            concluido_em     = CASE WHEN $1 = 'aprovada' THEN NOW() ELSE concluido_em END
      WHERE id = $7`,
    [
      body.resultado,
      body.authorization_id ?? null,
      body.bandeira ?? null,
      body.ultimos_4 ?? null,
      body.resultado === "erro" || body.resultado === "recusada" ? (body.mensagem ?? null) : null,
      body.raw ? JSON.stringify({ ...body.raw, nsu: body.nsu, mensagem: body.mensagem }) : JSON.stringify({ nsu: body.nsu, mensagem: body.mensagem }),
      body.transacao_id,
    ]
  );

  return ok({ status: body.resultado });
}
