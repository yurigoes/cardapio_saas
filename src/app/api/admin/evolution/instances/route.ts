/**
 * GET /api/admin/evolution/instances
 *   Proxy pra listar instâncias na Evolution (usa config master).
 *   Retorna lista crua da Evolution.
 *
 * POST /api/admin/evolution/instances
 *   Body: { instanceName, qrcode? }
 *   Cria instância nova via Evolution Manager.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db/client";
import { ok, forbidden, badRequest, serverError } from "@/lib/utils/response";
import { decryptIfNeeded } from "@/lib/security/encrypt";

async function getCfg() {
  const cfg = await queryOne<{ url: string | null; api_key: string | null }>(
    `SELECT url, api_key FROM master_evolution_config WHERE id = 1`
  );
  if (!cfg?.url || !cfg?.api_key) return null;
  let apiKey = cfg.api_key;
  if (apiKey.startsWith("encrypted:")) {
    const dec = decryptIfNeeded(apiKey.slice(10));
    if (!dec) return null;
    apiKey = dec;
  }
  return { url: cfg.url.replace(/\/+$/, ""), apiKey };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const cfg = await getCfg();
  if (!cfg) return badRequest("Configure URL + api_key em /admin/integracoes/evolution");

  try {
    const r = await fetch(`${cfg.url}/instance/fetchInstances`, {
      headers: { "apikey": cfg.apiKey },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!r.ok) return serverError(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    return ok({ instances: data });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "erro");
  }
}

const postSchema = z.object({
  instanceName: z.string().min(2).max(60),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  let body: z.infer<typeof postSchema>;
  try { body = postSchema.parse(await req.json()); }
  catch (err) { return badRequest(err instanceof Error ? err.message : "Body inválido"); }

  const cfg = await getCfg();
  if (!cfg) return badRequest("Configure URL + api_key primeiro");

  try {
    const r = await fetch(`${cfg.url}/instance/create`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": cfg.apiKey },
      body:    JSON.stringify({
        instanceName: body.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return serverError(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return ok(await r.json(), undefined, 201);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "erro");
  }
}
