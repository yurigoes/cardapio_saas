/**
 * GET /api/admin/auditoria — últimos eventos do audit log (filtros simples).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  const q   = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const lim = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200), 1000);
  try {
    await ensureSchema();
    const vals: unknown[] = []; let where = "";
    if (q) { vals.push(`%${q}%`); where = `WHERE acao ILIKE $1 OR autor_nome ILIKE $1 OR entidade ILIKE $1`; }
    const rows = await db().query(
      `SELECT id, autor_tipo, autor_nome, acao, entidade, entidade_id, detalhes, ip, created_at
         FROM midia_auditoria ${where} ORDER BY created_at DESC LIMIT ${lim}`, vals
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, eventos: rows });
  } catch (err) {
    console.error("[admin/auditoria GET]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
