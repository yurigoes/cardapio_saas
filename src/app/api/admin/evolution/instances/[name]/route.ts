/**
 * GET    /api/admin/evolution/instances/[name]/qr     — pega QR code (proxy)
 * POST   /api/admin/evolution/instances/[name]/connect — conecta
 * DELETE /api/admin/evolution/instances/[name]         — deleta
 */
import { NextRequest } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { decryptIfNeeded } from "@/lib/security/encrypt";

async function getCfg(): Promise<{ url: string; apiKey: string } | { error: string }> {
  const cfg = await queryOne<{ url: string | null; api_key: string | null }>(
    `SELECT url, api_key FROM master_evolution_config WHERE id = 1`
  );
  if (!cfg?.url) return { error: "URL não configurada" };
  if (!cfg?.api_key) return { error: "API key não configurada" };
  let url = cfg.url.trim().replace(/\/+$/, "").replace(/\/(manager|api)$/, "");
  let apiKey = cfg.api_key;
  if (apiKey.startsWith("encrypted:")) {
    const dec = decryptIfNeeded(apiKey.slice(10));
    if (!dec) return { error: "Falha ao decifrar api_key" };
    apiKey = dec;
  }
  return { url, apiKey };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const cfg = await getCfg();
  if ("error" in cfg) return badRequest(cfg.error);

  try {
    const r = await fetch(`${cfg.url}/instance/connect/${params.name}`, {
      headers: { "apikey": cfg.apiKey },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!r.ok) return serverError(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return ok(await r.json());
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "erro");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const cfg = await getCfg();
  if ("error" in cfg) return badRequest(cfg.error);

  try {
    // Tenta logout primeiro (encerra sessão WA)
    await fetch(`${cfg.url}/instance/logout/${params.name}`, {
      method:  "DELETE",
      headers: { "apikey": cfg.apiKey },
      signal:  AbortSignal.timeout(10_000),
    }).catch(() => {});

    const r = await fetch(`${cfg.url}/instance/delete/${params.name}`, {
      method:  "DELETE",
      headers: { "apikey": cfg.apiKey },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!r.ok) return serverError(`Evolution ${r.status}`);
    return ok({ deletado: true });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "erro");
  }
}
