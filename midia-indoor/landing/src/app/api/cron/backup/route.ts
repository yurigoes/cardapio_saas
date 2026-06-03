/**
 * GET/POST /api/cron/backup?key=CRON_SECRET
 * Dispara backup do Postgres (pg_dump) e opcionalmente da library do Xibo (rsync).
 * Configure no host:
 *   - pg_dump precisa estar no PATH do container, OU monte um shellscript /backups/run.sh e use ?via=shell
 *   - BACKUP_DIR (default /backups), BACKUP_LIB_PATH (opcional, ex: /var/www/xibo/library), BACKUP_RETENTION_DIAS (default 14)
 */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";
const execp = promisify(exec);

async function sha256OfFile(file: string): Promise<string> {
  const h = crypto.createHash("sha256");
  const buf = await fs.readFile(file);
  h.update(buf);
  return h.digest("hex");
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const provided = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-cron-key") ?? "";
  if (!secret || provided !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await ensureSchema();
  const dir = process.env.BACKUP_DIR ?? "/backups";
  const libPath = process.env.BACKUP_LIB_PATH ?? "";
  const retentionDias = Number(process.env.BACKUP_RETENTION_DIAS ?? "14");
  await fs.mkdir(dir, { recursive: true }).catch(() => {});

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dbFile = path.join(dir, `${stamp}_db.sql.gz`);
  const resultados: Array<{ tipo: string; arquivo: string; tamanho: number; sha: string }> = [];
  const erros: string[] = [];

  // 1) Dump do Postgres (gzip)
  try {
    const url = process.env.DATABASE_URL ?? "";
    if (!url) throw new Error("DATABASE_URL não configurada");
    // pg_dump -d $URL --no-owner --clean | gzip > arquivo
    await execp(`pg_dump --no-owner --clean "${url}" | gzip > "${dbFile}"`, { shell: "/bin/sh", maxBuffer: 1024 * 1024 * 1024 });
    const st = await fs.stat(dbFile);
    const sha = await sha256OfFile(dbFile);
    await db().query(
      `INSERT INTO midia_backups (tipo, tamanho_bytes, caminho, sha256, status) VALUES ('db', $1, $2, $3, 'ok')`,
      [st.size, dbFile, sha]
    );
    resultados.push({ tipo: "db", arquivo: dbFile, tamanho: st.size, sha });
  } catch (e) {
    const msg = (e as Error).message;
    await db().query(`INSERT INTO midia_backups (tipo, status, mensagem) VALUES ('db','falha',$1)`, [msg.slice(0, 1000)]);
    erros.push(`db: ${msg}`);
  }

  // 2) Library do Xibo (tar.gz incremental simples)
  if (libPath) {
    const libFile = path.join(dir, `${stamp}_library.tar.gz`);
    try {
      await execp(`tar -czf "${libFile}" -C "${path.dirname(libPath)}" "${path.basename(libPath)}"`, { shell: "/bin/sh", maxBuffer: 1024 * 1024 * 1024 });
      const st = await fs.stat(libFile);
      const sha = await sha256OfFile(libFile);
      await db().query(
        `INSERT INTO midia_backups (tipo, tamanho_bytes, caminho, sha256, status) VALUES ('library', $1, $2, $3, 'ok')`,
        [st.size, libFile, sha]
      );
      resultados.push({ tipo: "library", arquivo: libFile, tamanho: st.size, sha });
    } catch (e) {
      const msg = (e as Error).message;
      await db().query(`INSERT INTO midia_backups (tipo, status, mensagem) VALUES ('library','falha',$1)`, [msg.slice(0, 1000)]);
      erros.push(`library: ${msg}`);
    }
  }

  // 3) Retenção: apaga arquivos mais antigos que retentionDias
  try {
    const arquivos = await fs.readdir(dir);
    const limite = Date.now() - retentionDias * 86400000;
    for (const f of arquivos) {
      if (!/\.(sql\.gz|tar\.gz)$/.test(f)) continue;
      const fp = path.join(dir, f);
      const st = await fs.stat(fp).catch(() => null);
      if (st && st.mtimeMs < limite) await fs.unlink(fp).catch(() => {});
    }
  } catch (e) { console.warn("[backup] retenção falhou:", (e as Error).message); }

  return NextResponse.json({ ok: erros.length === 0, resultados, erros });
}
