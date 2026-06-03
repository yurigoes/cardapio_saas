/** GET /api/admin/backups — histórico. POST { acao: "rodar" } dispara backup agora (master). */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT id, tipo, tamanho_bytes, caminho, sha256, status, mensagem, criado_em FROM midia_backups ORDER BY criado_em DESC LIMIT 100`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, backups: rows });
}

export async function POST(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET não configurada" }, { status: 500 });
  // chama o próprio cron internamente
  try {
    const base = req.nextUrl.origin;
    const r = await fetch(`${base}/api/cron/backup?key=${encodeURIComponent(secret)}`, { method: "POST" });
    const d = await r.json();
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
