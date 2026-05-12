/**
 * Helper para registrar tentativas de webhook na tabela webhook_log.
 * Não-bloqueante — falha de log nunca derruba o handler.
 *
 * Uso típico em cada webhook handler:
 *   const t0 = Date.now();
 *   try {
 *     ... processa webhook ...
 *     await logWebhook({ gateway, payload, resultado: "processado", ... });
 *   } catch {
 *     await logWebhook({ gateway, payload, resultado: "falha", ... });
 *   }
 */
import { query } from "@/lib/db/client";

export type ResultadoWebhook =
  | "recebido"
  | "processado"
  | "ignorado"
  | "falha"
  | "assinatura_invalida";

interface LogWebhookParams {
  gateway:    string;                          // slug do gateway
  empresaId?: string | null;
  evento?:    string;
  recursoId?: string;                          // gateway_id (charge/payment external id)
  pedidoId?:  string;
  resultado:  ResultadoWebhook;
  httpStatus?: number;
  mensagem?:  string;
  payload?:   Record<string, unknown> | unknown;
  headers?:   Record<string, unknown>;
  duracaoMs?: number;
  ipOrigem?:  string;
}

export async function logWebhook(p: LogWebhookParams): Promise<void> {
  try {
    await query(
      `INSERT INTO webhook_log
         (empresa_id, gateway_slug, evento, recurso_id, pedido_id,
          resultado, http_status, mensagem,
          payload, headers, duracao_ms, ip_origem)
       VALUES ($1, $2, $3, $4, $5,
               $6, $7, $8,
               $9::jsonb, $10::jsonb, $11, $12::inet)`,
      [
        p.empresaId ?? null,
        p.gateway,
        p.evento ?? null,
        p.recursoId ?? null,
        p.pedidoId ?? null,
        p.resultado,
        p.httpStatus ?? null,
        p.mensagem ?? null,
        p.payload  ? JSON.stringify(p.payload)  : null,
        p.headers  ? JSON.stringify(p.headers)  : null,
        p.duracaoMs ?? null,
        p.ipOrigem ?? null,
      ]
    );
  } catch (err) {
    console.error("[WebhookLog] Falha ao registrar:", err);
  }
}
