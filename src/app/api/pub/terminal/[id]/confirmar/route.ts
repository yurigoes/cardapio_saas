/**
 * POST /api/pub/terminal/[id]/confirmar
 * Callback do app TEF Android — quando o pinpad finaliza, o app dispara
 * uma URL/Intent de retorno que o totem (frontend) capta e chama esta
 * rota com o resultado.
 *
 * Body: { resultado, authorization_id?, nsu?, bandeira?, ultimos_4?, mensagem?, raw? }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";

const schema = z.object({
  resultado:        z.enum(["aprovada", "recusada", "cancelada", "erro"]),
  authorization_id: z.string().max(60).optional(),
  nsu:              z.string().max(60).optional(),
  bandeira:         z.string().max(30).optional(),
  ultimos_4:        z.string().max(4).optional(),
  mensagem:         z.string().max(500).optional(),
  raw:              z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const tx = await queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM terminal_transacoes WHERE id = $1`, [params.id]
  );
  if (!tx) return notFound();

  // Idempotência
  if (["aprovada", "recusada", "cancelada"].includes(tx.status)) {
    return ok({ jaConcluida: true, status: tx.status });
  }

  try {
    await query(
      `UPDATE terminal_transacoes
          SET status            = $1,
              authorization_id  = COALESCE($2, authorization_id),
              bandeira          = COALESCE($3, bandeira),
              ultimos_4         = COALESCE($4, ultimos_4),
              gateway_tx_id     = COALESCE($5, gateway_tx_id),
              erro_mensagem     = $6,
              raw_response      = COALESCE($7::jsonb, raw_response),
              concluido_em      = CASE WHEN $1 = 'aprovada' THEN NOW() ELSE concluido_em END,
              cancelado_em      = CASE WHEN $1 = 'cancelada' THEN NOW() ELSE cancelado_em END
        WHERE id = $8`,
      [body.resultado, body.authorization_id ?? null, body.bandeira ?? null,
       body.ultimos_4 ?? null, body.nsu ?? null,
       body.mensagem ?? null,
       body.raw ? JSON.stringify(body.raw) : null,
       params.id]
    );
    return ok({ ok: true, status: body.resultado });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
