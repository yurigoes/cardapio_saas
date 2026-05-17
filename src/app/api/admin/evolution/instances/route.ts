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

async function getCfg(): Promise<{ url: string; apiKey: string } | { error: string }> {
  const cfg = await queryOne<{ url: string | null; api_key: string | null }>(
    `SELECT url, api_key FROM master_evolution_config WHERE id = 1`
  );
  if (!cfg?.url) return { error: "URL não configurada" };
  if (!cfg?.api_key) return { error: "API key não configurada" };

  // Limpa URL: remove trailing /, /manager, /api
  let url = cfg.url.trim().replace(/\/+$/, "");
  url = url.replace(/\/(manager|api)$/, "");

  // Decifra api_key
  let apiKey = cfg.api_key;
  if (apiKey.startsWith("encrypted:")) {
    const dec = decryptIfNeeded(apiKey.slice(10));
    if (!dec) return { error: "Falha ao decifrar api_key — verifique ENCRYPTION_KEY ou re-salve a chave" };
    apiKey = dec;
  }
  if (!apiKey || apiKey.length < 8) return { error: "API key inválida (vazia ou muito curta)" };
  return { url, apiKey };
}

async function callEvolution(url: string, opts: RequestInit): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  try {
    const r = await fetch(url, {
      ...opts,
      signal: AbortSignal.timeout(15_000),
    });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) {
      const body = (await r.text()).slice(0, 500);
      return { ok: false, status: r.status, error: `Evolution HTTP ${r.status}: ${body}` };
    }
    if (!ct.includes("application/json")) {
      const body = (await r.text()).slice(0, 200);
      return { ok: false, status: r.status, error: `Evolution retornou ${ct} em vez de JSON. URL correta? Body: ${body}` };
    }
    return { ok: true, status: r.status, data: await r.json() };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") return forbidden();

  const cfg = await getCfg();
  if ("error" in cfg) return badRequest(cfg.error);

  const r = await callEvolution(`${cfg.url}/instance/fetchInstances`, {
    headers: { "apikey": cfg.apiKey },
  });
  if (!r.ok) {
    console.error("[Evolution/instances/GET]", r.error);
    return serverError(r.error ?? "erro Evolution");
  }
  return ok({ instances: r.data });
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
  if ("error" in cfg) return badRequest(cfg.error);

  const r = await callEvolution(`${cfg.url}/instance/create`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": cfg.apiKey },
    body:    JSON.stringify({
      instanceName: body.instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  if (!r.ok) {
    console.error("[Evolution/instances/POST]", r.error);
    return serverError(r.error ?? "erro Evolution");
  }
  return ok(r.data, undefined, 201);
}
