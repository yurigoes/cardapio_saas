/**
 * logError — helper central pra registrar erros server-side.
 *
 * Não-bloqueante: falha de log nunca derruba o handler.
 * Limita stack trace a 4000 chars (evita bloat).
 *
 * Uso típico:
 *   try { ... }
 *   catch (err) {
 *     logError(err, { rota: 'POST /api/pedidos', empresaId, ... });
 *     return serverError();
 *   }
 */
import { query } from "@/lib/db/client";

export interface LogErrorContext {
  level?:      "error" | "warn" | "fatal";
  rota?:       string;
  metodo?:     string;
  empresaId?:  string | null;
  usuarioId?:  string | null;
  userAgent?:  string;
  ipOrigem?:   string;
  requestId?:  string;
  contexto?:   Record<string, unknown>;
}

export async function logError(err: unknown, ctx: LogErrorContext = {}): Promise<void> {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? err.stack?.slice(0, 4000) : undefined;

    await query(
      `INSERT INTO error_log
         (empresa_id, usuario_id, level, origem, message, stack, rota, metodo,
          user_agent, ip_origem, request_id, contexto)
       VALUES ($1, $2, $3, 'server', $4, $5, $6, $7, $8, $9::inet, $10, $11::jsonb)`,
      [
        ctx.empresaId ?? null,
        ctx.usuarioId ?? null,
        ctx.level     ?? "error",
        message.slice(0, 2000),
        stack ?? null,
        ctx.rota      ?? null,
        ctx.metodo    ?? null,
        ctx.userAgent ?? null,
        ctx.ipOrigem  ?? null,
        ctx.requestId ?? null,
        ctx.contexto ? JSON.stringify(ctx.contexto) : null,
      ]
    );
  } catch (logErr) {
    console.error("[logError] Falha ao gravar log:", logErr);
  }
}
