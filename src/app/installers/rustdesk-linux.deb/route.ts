/**
 * GET /installers/rustdesk-linux.deb?arch=amd64|arm64
 *
 * Proxy/cache do .deb do RustDesk pra Linux Debian/Ubuntu.
 * Mesmo esquema do .exe — cache 7 dias.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export const dynamic = "force-dynamic";

const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
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

async function baixar(arch: "x86_64" | "aarch64"): Promise<Buffer> {
  const ver = await descobrirVersao();
  const url = `https://github.com/rustdesk/rustdesk/releases/download/${ver}/rustdesk-${ver}-${arch}.deb`;
  console.log(`[Installers/Linux/${arch}] baixando ${url}`);
  const r = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { "User-Agent": "cardapio-saas-installer-proxy" },
  });
  if (!r.ok) throw new Error(`GitHub retornou ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5 * 1024 * 1024) throw new Error(`Arquivo muito pequeno (${buf.length} bytes)`);
  return buf;
}

async function obterInstalador(arch: "x86_64" | "aarch64"): Promise<Buffer> {
  const cachePath = join(tmpdir(), `rustdesk-cache-${arch}.deb`);
  try {
    const st = await stat(cachePath);
    const age = Date.now() - st.mtimeMs;
    if (age < CACHE_MAX_AGE && st.size > 5 * 1024 * 1024) {
      return await readFile(cachePath);
    }
  } catch {/* */}
  const buf = await baixar(arch);
  await writeFile(cachePath, buf);
  return buf;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const archParam = url.searchParams.get("arch") ?? "amd64";
  const arch: "x86_64" | "aarch64" =
    archParam === "arm64" || archParam === "aarch64" ? "aarch64" : "x86_64";

  try {
    const buf = await obterInstalador(arch);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":        "application/vnd.debian.binary-package",
        "Content-Disposition": `attachment; filename=rustdesk-${arch}.deb`,
        "Content-Length":      String(buf.length),
        "Cache-Control":       "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[Installers/Linux]", err);
    return NextResponse.json({
      error: "Falha ao obter instalador",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 502 });
  }
}
