/**
 * GET  /api/admin/migracao-hd/script  → serve migrate-disk.sh
 * POST /api/admin/migracao-hd/script  → mesma coisa, body { password }
 *
 * Requer master + senha (X-Migration-Password header OU body.password no POST).
 * Conteúdo é lido do disco do container (incluído via Dockerfile).
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAuth, isAuthError } from "@/lib/auth/middleware";

const MASTER_HD_PASSWORD = "A10babafac";

function check(provided: string): boolean {
  const a = Buffer.from(provided.padEnd(64, "\0").slice(0, 64));
  const b = Buffer.from(MASTER_HD_PASSWORD.padEnd(64, "\0").slice(0, 64));
  return a.length === b.length && timingSafeEqual(a, b)
      && provided.length === MASTER_HD_PASSWORD.length;
}

async function serveScript(): Promise<NextResponse> {
  const candidates = [
    path.resolve(process.cwd(), "scripts/migrate-disk.sh"),
    "/app/scripts/migrate-disk.sh",
  ];
  for (const p of candidates) {
    try {
      const content = await fs.readFile(p, "utf-8");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type":        "text/x-shellscript; charset=utf-8",
          "Cache-Control":       "no-store",
          "Content-Disposition": 'attachment; filename="migrate-disk.sh"',
        },
      });
    } catch { /* tenta próximo */ }
  }
  return NextResponse.json({ ok: false, error: "script não encontrado no servidor" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") {
    return NextResponse.json({ ok: false, error: "master only" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (!check(String(body?.password ?? ""))) {
    await new Promise(r => setTimeout(r, 800));
    return NextResponse.json({ ok: false, error: "senha inválida" }, { status: 401 });
  }
  return serveScript();
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.payload.role !== "master") {
    return NextResponse.json({ ok: false, error: "master only" }, { status: 403 });
  }
  const pw = req.headers.get("x-migration-password") ?? req.nextUrl.searchParams.get("password") ?? "";
  if (!check(pw)) {
    await new Promise(r => setTimeout(r, 800));
    return NextResponse.json({ ok: false, error: "senha inválida" }, { status: 401 });
  }
  return serveScript();
}
