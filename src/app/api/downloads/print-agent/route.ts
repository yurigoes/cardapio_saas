/**
 * GET /api/downloads/print-agent
 *
 * Empacota e devolve a pasta print-agent/ como .zip pra o usuário baixar
 * e instalar na máquina do restaurante.
 *
 * Sem dependências externas — usa o `tar` interno do Node? Não, Node não
 * tem zip nativo. Vamos servir como tar.gz que abre fácil em Windows
 * (7-zip / WinRAR) e nativo em Linux/Mac.
 */
import { NextRequest, NextResponse } from "next/server";
import { createGzip } from "zlib";
import { Readable } from "stream";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

// Tar minimal escritor (USTAR) — sem dependências
function tarHeader(name: string, size: number, mode = 0o644, type: "0" | "5" = "0"): Buffer {
  const buf = Buffer.alloc(512);
  buf.write(name.slice(0, 100), 0);
  buf.write(mode.toString(8).padStart(7, "0") + "\0", 100);
  buf.write("0000000\0", 108);                                // uid
  buf.write("0000000\0", 116);                                // gid
  buf.write(size.toString(8).padStart(11, "0") + "\0", 124);
  buf.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136);
  buf.write("        ", 148);                                 // checksum placeholder
  buf.write(type, 156);
  buf.write("ustar\0", 257);
  buf.write("00", 263);
  let cs = 0;
  for (let i = 0; i < 512; i++) cs += buf[i];
  buf.write(cs.toString(8).padStart(6, "0") + "\0 ", 148);
  return buf;
}

async function buildTar(rootDir: string, prefix: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  async function walk(rel: string) {
    const full = path.join(rootDir, rel);
    const entries = await fs.readdir(full, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "config.json" || e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        chunks.push(tarHeader(`${prefix}/${childRel}/`, 0, 0o755, "5"));
        await walk(childRel);
      } else {
        const data = await fs.readFile(path.join(rootDir, childRel));
        chunks.push(tarHeader(`${prefix}/${childRel}`, data.length));
        chunks.push(data);
        const pad = (512 - (data.length % 512)) % 512;
        if (pad) chunks.push(Buffer.alloc(pad));
      }
    }
  }
  chunks.push(tarHeader(`${prefix}/`, 0, 0o755, "5"));
  await walk("");
  chunks.push(Buffer.alloc(1024)); // 2 blocos de zero = fim
  return Buffer.concat(chunks);
}

export async function GET(_req: NextRequest) {
  // No build standalone do Next, process.cwd() = /app
  // Fora do container, usa o repo. Tenta os 2.
  const candidates = [
    path.resolve(process.cwd(), "print-agent"),
    "/app/print-agent",
  ];
  let dir = "";
  for (const c of candidates) {
    try { await fs.access(c); dir = c; break; } catch {}
  }
  if (!dir) {
    return NextResponse.json(
      { ok: false, error: "print-agent não encontrado no servidor" },
      { status: 404 },
    );
  }

  try {
    const tar = await buildTar(dir, "cardapio-print-agent");
    const gz  = await new Promise<Buffer>((resolve, reject) => {
      const out: Buffer[] = [];
      const z = createGzip({ level: 6 });
      z.on("data", c => out.push(c));
      z.on("end",  () => resolve(Buffer.concat(out)));
      z.on("error", reject);
      Readable.from(tar).pipe(z);
    });

    return new NextResponse(gz, {
      status: 200,
      headers: {
        "Content-Type":        "application/gzip",
        "Content-Disposition": `attachment; filename="cardapio-print-agent.tar.gz"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    console.error("[downloads/print-agent]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
