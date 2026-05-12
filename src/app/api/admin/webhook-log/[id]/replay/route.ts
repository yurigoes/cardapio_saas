/**
 * POST /api/admin/webhook-log/[id]/replay
 *
 * Master-only. Reenvia um webhook gravado para o handler do gateway,
 * preservando payload + headers originais. Útil para:
 *   - reprocessar após correção de bug
 *   - simular evento em ambiente de teste (com gravação real)
 *
 * O novo processamento gera um novo registro em webhook_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, notFound, badRequest, serverError } from "@/lib/utils/response";
import { auditLog } from "@/lib/security/audit";

const SUPPORTED = ["mercadopago", "pagarme", "asaas", "stone"];

interface LogRow {
  id:           string;
  gateway_slug: string;
  payload:      Record<string, unknown> | null;
  headers:      Record<string, string> | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden("Apenas master");

  try {
    const log = await queryOne<LogRow>(
      `SELECT id, gateway_slug, payload, headers
         FROM webhook_log
        WHERE id = $1`,
      [params.id]
    );

    if (!log) return notFound("Registro não encontrado");
    if (!SUPPORTED.includes(log.gateway_slug)) {
      return badRequest(`Replay não suportado para gateway ${log.gateway_slug}`);
    }
    if (!log.payload) {
      return badRequest("Registro sem payload — não é possível reprocessar");
    }

    // Reconstrói headers úteis (mantém signature/IP); descarta hop-by-hop
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-replay-of",  log.id);
    if (log.headers) {
      for (const [k, v] of Object.entries(log.headers)) {
        const lk = k.toLowerCase();
        if (lk === "content-length" || lk === "host" || lk === "connection") continue;
        if (lk === "content-type" || lk === "x-replay-of") continue;
        headers.set(k, String(v));
      }
    }

    // URL absoluta para o próprio host
    const url = new URL(`/api/webhooks/${log.gateway_slug}`, req.nextUrl.origin);
    const replay = await fetch(url, {
      method:  "POST",
      headers,
      body:    JSON.stringify(log.payload),
    });

    const replayBody = await replay.text();
    let parsedBody: unknown = replayBody;
    try { parsedBody = JSON.parse(replayBody); } catch { /* texto cru */ }

    await auditLog({
      acao:       "webhook:replay",
      recurso:    "webhook_log",
      recursoId:  log.id,
      dadosNovos: { gateway: log.gateway_slug, status: replay.status },
      usuario:    { sub: auth.payload.sub, empresaId: undefined },
    });

    return ok({
      replay_status: replay.status,
      replay_body:   parsedBody,
      original_id:   log.id,
      gateway:       log.gateway_slug,
    });
  } catch (err) {
    console.error("[Admin/WebhookReplay]", err);
    return serverError();
  }
}
