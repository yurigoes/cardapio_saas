/**
 * POST   /api/painel/push/subscribe   { endpoint, keys: { p256dh, auth } }
 * DELETE /api/painel/push/subscribe   { endpoint }
 *
 * Registra ou remove uma inscrição de Web Push para o usuário autenticado.
 * Idempotente via UNIQUE (usuario_id, endpoint).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, badRequest, forbidden, serverError } from "@/lib/utils/response";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys:     z.object({
    p256dh: z.string().min(1).max(500),
    auth:   z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { empresaId, sub: usuarioId } = auth.payload;
  if (!empresaId || !usuarioId) return forbidden();

  let body: z.output<typeof subscribeSchema>;
  try {
    const r = subscribeSchema.safeParse(await req.json());
    if (!r.success) {
      return badRequest(r.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "));
    }
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    const userAgent = req.headers.get("user-agent") ?? null;
    const result = await queryOne<{ id: string }>(
      `INSERT INTO push_subscriptions
         (empresa_id, usuario_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (usuario_id, endpoint) DO UPDATE
         SET p256dh = EXCLUDED.p256dh,
             auth   = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent,
             updated_at = NOW()
       RETURNING id`,
      [empresaId, usuarioId, body.endpoint, body.keys.p256dh, body.keys.auth, userAgent]
    );

    return ok({ id: result?.id, subscribed: true });
  } catch (err) {
    console.error("[Push/Subscribe]", err);
    return serverError();
  }
}

const unsubSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { sub: usuarioId } = auth.payload;
  if (!usuarioId) return forbidden();

  let body: z.output<typeof unsubSchema>;
  try {
    const r = unsubSchema.safeParse(await req.json());
    if (!r.success) return badRequest("endpoint inválido");
    body = r.data;
  } catch {
    return badRequest("JSON inválido");
  }

  try {
    await queryOne(
      `DELETE FROM push_subscriptions
       WHERE usuario_id = $1 AND endpoint = $2 RETURNING id`,
      [usuarioId, body.endpoint]
    );
    return ok({ unsubscribed: true });
  } catch (err) {
    console.error("[Push/Unsubscribe]", err);
    return serverError();
  }
}
