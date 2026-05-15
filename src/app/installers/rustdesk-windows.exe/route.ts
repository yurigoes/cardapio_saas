/**
 * GET /installers/rustdesk-windows.exe
 *
 * Proxy/cache do instalador oficial RustDesk pra Windows. Baixa do GitHub
 * 1x e armazena em /tmp/rustdesk-cache.exe; subsequentes requests servem
 * do cache (mais rápido + não depende de GitHub fora do ar).
 *
 * Cache TTL: 7 dias. Se mais velho, re-baixa.
 *
 * Deixa o instalador no nosso domínio = clientes não precisam acessar
 * github.com (alguns firewalls corporativos bloqueiam).
 */
import { NextResponse } from "next/server";
import { readFile, writeFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export const dynamic = "force-dynamic";
// Cache de 7 dias na revalidação por segurança (Next dedup automático)
export const revalidate = 604800;

const CACHE_PATH    = join(tmpdir(), "rustdesk-cache.exe");
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dias
const FALLBACK_VER  = "1.4.6";

async function descobrirVersao(): Promise<string> {
  try {
    const r = await fetch("https://api.github.com/repos/rustdesk/rustdesk/releases/latest", {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "cardapio-saas-installer-proxy" },
    });
    if (!r.ok) return FALLBACK_VER;
    const data = await r.json() as { tag_name?: string };
    return data.tag_name || FALLBACK_VER;
  } catch { return FALLBACK_VER; }
}

async function baixarFresh(): Promise<Buffer> {
  const ver = await descobrirVersao();
  const url = `https://github.com/rustdesk/rustdesk/releases/download/${ver}/rustdesk-${ver}-x86_64.exe`;
  console.log(`[Installers/Windows] baixando ${url}`);
  const r = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { "User-Agent": "cardapio-saas-installer-proxy" },
  });
  if (!r.ok) throw new Error(`GitHub retornou ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5 * 1024 * 1024) throw new Error(`Arquivo muito pequeno (${buf.length} bytes)`);
  await writeFile(CACHE_PATH, buf);
  console.log(`[Installers/Windows] cache atualizado (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  return buf;
}

async function obterInstalador(): Promise<Buffer> {
  try {
    const st = await stat(CACHE_PATH);
    const age = Date.now() - st.mtimeMs;
    if (age < CACHE_MAX_AGE && st.size > 5 * 1024 * 1024) {
      return await readFile(CACHE_PATH);
    }
  } catch {/* não existe ainda */}
  return await baixarFresh();
}

export async function GET() {
  try {
    const buf = await obterInstalador();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": "attachment; filename=rustdesk-setup.exe",
        "Content-Length":      String(buf.length),
        "Cache-Control":       "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[Installers/Windows]", err);
    return NextResponse.json({
      error: "Falha ao obter instalador",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 502 });
  }
}
