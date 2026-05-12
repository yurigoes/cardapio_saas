/**
 * withWebhookLog — wrapper genérico para POST handlers de webhook.
 *
 * Garante que TODO retorno (sucesso, ignore, falha, assinatura inválida, exception)
 * seja registrado em webhook_log uma única vez, com payload + headers + IP + duração.
 *
 * Antes:
 *   export async function POST(req) {
 *     try {
 *       ... 80 linhas com early returns sem log ...
 *       logWebhook({ resultado: "processado", ... });
 *       return NextResponse.json(...);
 *     } catch { return 500; }  // sem log
 *   }
 *
 * Depois:
 *   export const POST = (req) => withWebhookLog("mercadopago", req, async (ctx) => {
 *     if (!ctx.payload) return { resultado: "falha", status: 400, mensagem: "JSON inválido" };
 *     ...
 *     return { resultado: "processado", recursoId, pedidoId, mensagem: "..." };
 *   });
 *
 * O wrapper se encarrega de:
 *   - parsear o body (bruto + JSON)
 *   - capturar IP (x-forwarded-for) e headers
 *   - cronometrar duração
 *   - traduzir resultado → HTTP status (assinatura_invalida=401, falha=500, demais=200)
 *   - registrar em webhook_log
 *   - tratar exceptions como falha
 */
import { NextRequest, NextResponse } from "next/server";
import { logWebhook, type ResultadoWebhook } from "./log";

export interface WebhookContext {
  req:     NextRequest;
  rawBody: string;
  /** Body parseado como JSON, ou null se não for JSON válido */
  payload: Record<string, unknown> | null;
  ip:      string | undefined;
  headers: Record<string, string>;
}

export interface WebhookOutcome {
  resultado:  ResultadoWebhook;
  /** HTTP status. Default por resultado: assinatura_invalida=401, falha=500, demais=200 */
  status?:    number;
  mensagem?:  string;
  evento?:    string;
  empresaId?: string | null;
  recursoId?: string;
  pedidoId?:  string;
  /** JSON de resposta. Se omitido, usa { ok, ...meta } automático. */
  body?:      Record<string, unknown>;
}

function defaultStatus(r: ResultadoWebhook): number {
  if (r === "assinatura_invalida") return 401;
  if (r === "falha")               return 500;
  return 200;
}

export async function withWebhookLog(
  gateway: string,
  req: NextRequest,
  handler: (ctx: WebhookContext) => Promise<WebhookOutcome>
): Promise<NextResponse> {
  const t0      = Date.now();
  const rawBody = await req.text();

  let payload: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(rawBody);
    payload = (typeof parsed === "object" && parsed !== null) ? parsed as Record<string, unknown> : null;
  } catch {
    // não-JSON é aceitável (alguns gateways usam form-encoded); handler decide
  }

  const ip      = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const headers = Object.fromEntries(req.headers);

  const ctx: WebhookContext = { req, rawBody, payload, ip, headers };

  let outcome: WebhookOutcome;
  try {
    outcome = await handler(ctx);
  } catch (err) {
    console.error(`[${gateway}/webhook] uncaught:`, err);
    outcome = {
      resultado: "falha",
      status:    500,
      mensagem:  err instanceof Error ? err.message : String(err),
    };
  }

  const httpStatus = outcome.status ?? defaultStatus(outcome.resultado);

  // Não-bloqueante — falha de log nunca derruba o handler
  await logWebhook({
    gateway,
    empresaId:  outcome.empresaId,
    evento:     outcome.evento,
    recursoId:  outcome.recursoId,
    pedidoId:   outcome.pedidoId,
    resultado:  outcome.resultado,
    httpStatus,
    mensagem:   outcome.mensagem,
    payload:    payload ?? { _raw: rawBody.slice(0, 4000) },
    headers,
    duracaoMs:  Date.now() - t0,
    ipOrigem:   ip,
  });

  const ok = outcome.resultado !== "falha" && outcome.resultado !== "assinatura_invalida";
  const body = outcome.body ?? {
    ok,
    ...(outcome.resultado === "ignorado" && { ignored: true }),
    ...(outcome.resultado === "processado" && outcome.pedidoId && { pedido_id: outcome.pedidoId }),
    ...(outcome.mensagem && !ok && { error: outcome.mensagem }),
  };

  return NextResponse.json(body, { status: httpStatus });
}
