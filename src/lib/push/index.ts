/**
 * Web Push (VAPID) helpers.
 *
 * Setup:
 *   1. Gerar par de chaves uma vez:
 *        npx web-push generate-vapid-keys
 *   2. Pôr no .env:
 *        VAPID_PUBLIC_KEY=...
 *        VAPID_PRIVATE_KEY=...
 *        VAPID_SUBJECT=mailto:contato@seudominio.com
 *
 * Endpoints:
 *   - GET  /api/painel/push/vapid-public-key
 *   - POST /api/painel/push/subscribe   { endpoint, keys: { p256dh, auth } }
 *   - DEL  /api/painel/push/subscribe   { endpoint }
 *
 * Envio: enviarPushParaUsuariosDaEmpresa(empresaId, payload)
 */
import webpush from "web-push";
import { query } from "@/lib/db/client";

let configured = false;
function ensureVapid() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";
  if (!pub || !priv) {
    throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas");
  }
  webpush.setVapidDetails(sub, pub, priv);
  configured = true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title:  string;
  body:   string;
  icon?:  string;
  badge?: string;
  tag?:   string;
  data?:  Record<string, unknown>;
  url?:   string;        // URL para abrir ao clicar
}

interface SubRow {
  id: string; endpoint: string; p256dh: string; auth: string;
}

/**
 * Envia push para todas as inscrições ativas dos usuários da empresa.
 * Falhas (410 Gone, 404, etc.) removem a inscrição automaticamente.
 */
export async function enviarPushParaUsuariosDaEmpresa(
  empresaId: string,
  payload:   PushPayload,
): Promise<{ enviados: number; removidos: number; falhas: number }> {
  try {
    ensureVapid();
  } catch (e) {
    console.warn("[Push] VAPID não configurado:", e instanceof Error ? e.message : e);
    return { enviados: 0, removidos: 0, falhas: 0 };
  }

  const subs = await query<SubRow>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE empresa_id = $1`,
    [empresaId]
  ).catch(() => []);

  if (subs.length === 0) return { enviados: 0, removidos: 0, falhas: 0 };

  const body = JSON.stringify(payload);
  let enviados  = 0;
  let removidos = 0;
  let falhas    = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      enviados++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        // Inscrição expirada/inválida → remove
        await query(
          `DELETE FROM push_subscriptions WHERE id = $1`,
          [s.id]
        ).catch(() => {});
        removidos++;
      } else {
        falhas++;
        console.warn("[Push] Falha de envio:", status, err);
      }
    }
  }));

  return { enviados, removidos, falhas };
}
