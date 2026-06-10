/**
 * GET /api/admin/xibo-v4-test?key=CRON_SECRET
 *
 * Suite de smoke test contra um Xibo alternativo (POC v4). Aponta pra
 * XIBO_V4_URL / XIBO_V4_CLIENT_ID / XIBO_V4_CLIENT_SECRET do .env e roda
 * as 20+ chamadas mais usadas do sistema. Relata o que quebra.
 *
 * NAO mexe em produçao — usa fetch direto com env paralelo.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const URL_V4    = (process.env.XIBO_V4_URL ?? "").replace(/\/+$/, "");
const CLIENT_ID = process.env.XIBO_V4_CLIENT_ID ?? "";
const SECRET_V4 = process.env.XIBO_V4_CLIENT_SECRET ?? "";

interface TestRes { nome: string; endpoint: string; ok: boolean; status?: number; sample?: unknown; erro?: string }

async function token(): Promise<string> {
  const r = await fetch(`${URL_V4}/api/authorize/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: SECRET_V4,
    }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}: ${await r.text().catch(() => "")}`);
  const d = await r.json() as { access_token: string };
  return d.access_token;
}

async function call(t: string, path: string, init?: RequestInit & { sampleSize?: number }): Promise<TestRes> {
  try {
    const r = await fetch(`${URL_V4}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}` },
    });
    const tx = await r.text();
    let body: unknown = tx;
    try { body = JSON.parse(tx); } catch { /* nao json */ }
    const arr = Array.isArray(body) ? body : null;
    const sample = arr ? arr.slice(0, init?.sampleSize ?? 1) : (typeof body === "object" && body ? body : tx.slice(0, 200));
    return { nome: path, endpoint: path, ok: r.ok, status: r.status, sample, erro: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { nome: path, endpoint: path, ok: false, erro: (e as Error).message };
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || key !== secret) return NextResponse.json({ ok: false, error: "nao autorizado" }, { status: 401 });

  if (!URL_V4 || !CLIENT_ID || !SECRET_V4) {
    return NextResponse.json({ ok: false, error: "configure XIBO_V4_URL, XIBO_V4_CLIENT_ID e XIBO_V4_CLIENT_SECRET no .env" }, { status: 400 });
  }

  const inicio = Date.now();
  let t: string;
  try {
    t = await token();
  } catch (e) {
    return NextResponse.json({ ok: false, error: "auth falhou: " + (e as Error).message }, { status: 500 });
  }

  // Smoke suite — endpoints que nosso lib/xibo.ts usa
  const testes: TestRes[] = [];
  testes.push({ nome: "auth", endpoint: "/api/authorize/access_token", ok: true, sample: "[token OK]" });

  // Leitura basica
  testes.push(await call(t, "/api/displayprofile"));
  testes.push(await call(t, "/api/display?length=3"));
  testes.push(await call(t, "/api/displaygroup?length=3"));
  testes.push(await call(t, "/api/layout?length=3"));
  testes.push(await call(t, "/api/campaign?length=3"));
  testes.push(await call(t, "/api/library?length=3"));
  testes.push(await call(t, "/api/folder?length=3"));
  testes.push(await call(t, "/api/resolution"));
  testes.push(await call(t, "/api/command"));
  testes.push(await call(t, "/api/schedule/data/events?from=2026-01-01%2000:00:00&to=2026-12-31%2023:59:59"));
  testes.push(await call(t, "/api/notification?length=3"));

  // SyncGroups (NOVO no v4)
  testes.push(await call(t, "/api/syncgroup?length=3"));

  // Estatisticas
  testes.push(await call(t, "/api/stats?fromDt=2026-01-01&toDt=2026-12-31&length=3"));

  // Campos / shape (importante pra ver se nosso tipo bate)
  const layoutRes = testes.find(r => r.endpoint === "/api/layout?length=3");
  const camposLayout = Array.isArray(layoutRes?.sample) && layoutRes.sample[0] && typeof layoutRes.sample[0] === "object"
    ? Object.keys(layoutRes.sample[0] as object) : [];
  const displayRes = testes.find(r => r.endpoint === "/api/display?length=3");
  const camposDisplay = Array.isArray(displayRes?.sample) && displayRes.sample[0] && typeof displayRes.sample[0] === "object"
    ? Object.keys(displayRes.sample[0] as object) : [];

  const total = testes.length;
  const passou = testes.filter(r => r.ok).length;
  const falhou = total - passou;

  return NextResponse.json({
    ok: true,
    url_testada: URL_V4,
    duracao_ms: Date.now() - inicio,
    resumo: { total, passou, falhou },
    shape_layout: camposLayout,
    shape_display: camposDisplay,
    testes,
  });
}
