/**
 * GET /api/admin/whatsapp-logs?status=enviado|falha|todos&limit=100
 * Lista os ultimos envios pra auditoria/debug.
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autenticarAdmin(req))) return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  await ensureSchema();
  const status = req.nextUrl.searchParams.get("status") ?? "todos";
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? 100));
  const filtro = status === "todos" ? "" : "WHERE l.status = $1";
  const args = status === "todos" ? [] : [status];
  const rows = await db().query(
    `SELECT l.*, c.nome AS conta_nome, c.empresa
       FROM midia_whatsapp_logs l
  LEFT JOIN midia_contas c ON c.id = l.conta_id
       ${filtro}
   ORDER BY l.criado_em DESC LIMIT ${limit}`, args
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, logs: rows });
}
