/**
 * POST /api/pub/terminal/iniciar
 * Inicia um pagamento de terminal (PDV ou Totem).
 *
 * Body: { empresa_id, terminal_id?, valor, metodo, parcelas?, pedido_id?, origem }
 *
 * Se terminal_id não passado, usa o padrão_totem ou padrao_pdv da empresa.
 *
 * Devolve { transacao_id, modo, intent_uri | qr_code | checkout_url, ... }
 * UI usa o `modo` pra decidir como continuar (abrir intent android, mostrar QR, etc).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { ok, badRequest, notFound, serverError } from "@/lib/utils/response";
import { getDriver } from "@/lib/payments/terminal/registry";

const schema = z.object({
  empresa_id:   z.string().uuid(),
  terminal_id:  z.string().uuid().optional(),
  pedido_id:    z.string().uuid().optional(),
  valor:        z.number().positive().max(1_000_000),
  metodo:       z.enum(["credito", "debito", "voucher", "pix", "qrcode"]),
  parcelas:     z.number().int().positive().max(24).optional(),
  origem:       z.enum(["pdv", "totem", "api"]).default("totem"),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  // Resolve terminal
  let terminal: { id: string; driver: string; credenciais: Record<string, unknown>; ativo: boolean } | null = null;
  if (body.terminal_id) {
    terminal = await queryOne(
      `SELECT id, driver, credenciais, ativo
         FROM empresa_terminais
        WHERE id = $1 AND empresa_id = $2`,
      [body.terminal_id, body.empresa_id]
    );
  } else {
    const col = body.origem === "totem" ? "padrao_totem" : "padrao_pdv";
    terminal = await queryOne(
      `SELECT id, driver, credenciais, ativo
         FROM empresa_terminais
        WHERE empresa_id = $1 AND ${col} = TRUE AND ativo = TRUE
        LIMIT 1`,
      [body.empresa_id]
    );
  }
  if (!terminal) return notFound("Nenhum terminal padrão configurado pra esta origem");
  if (!terminal.ativo) return badRequest("Terminal desativado");

  const driver = getDriver(terminal.driver);
  if (!driver) return badRequest(`Driver desconhecido: ${terminal.driver}`);

  // Cria registro de transação local primeiro (pega ID pra usar como external ref)
  const tx = await queryOne<{ id: string }>(
    `INSERT INTO terminal_transacoes
       (empresa_id, terminal_id, pedido_id, origem, driver, metodo, parcelas, valor, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente')
     RETURNING id`,
    [body.empresa_id, terminal.id, body.pedido_id ?? null, body.origem,
     terminal.driver, body.metodo, body.parcelas ?? 1, body.valor]
  );
  if (!tx) return serverError("Falha ao criar transação");

  try {
    const result = await driver.iniciar({
      ...body,
      terminal_id: tx.id,  // o driver usa esse ID nos callbacks/intents
    }, terminal.credenciais);

    // Persiste o resultado
    await query(
      `UPDATE terminal_transacoes
          SET status        = $1,
              gateway_tx_id = $2,
              qr_code       = $3,
              qr_code_img   = $4,
              raw_response  = $5::jsonb
        WHERE id = $6`,
      [result.status === "aprovada" ? "aprovada"
       : result.status === "recusada" ? "recusada"
       : result.status === "erro"     ? "erro"
       : "processando",
       result.gateway_tx_id ?? null,
       result.qr_code ?? null,
       result.qr_code_img ?? null,
       JSON.stringify({ modo: result.modo, mensagem: result.mensagem }),
       tx.id]
    );

    return ok({ ...result, transacao_id: tx.id });
  } catch (err) {
    await query(
      `UPDATE terminal_transacoes SET status = 'erro', erro_mensagem = $1 WHERE id = $2`,
      [err instanceof Error ? err.message : "erro", tx.id]
    ).catch(() => null);
    return serverError(err instanceof Error ? err.message : undefined);
  }
}
