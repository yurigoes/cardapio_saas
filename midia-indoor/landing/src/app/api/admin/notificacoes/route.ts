/**
 * GET   /api/admin/notificacoes        — lista últimas 100 do master
 * PATCH /api/admin/notificacoes        — { id?, todas? } marca como lida
 * DELETE /api/admin/notificacoes?id=   — remove uma
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT id, tipo, titulo, mensagem, link, icone, lida, created_at
       FROM midia_notificacoes WHERE destino = 'master' ORDER BY created_at DESC LIMIT 100`
  ).then(r => r.rows);
  const naoLidas = rows.filter(r => !r.lida).length;
  return NextResponse.json({ ok: true, notificacoes: rows, nao_lidas: naoLidas });
}

export async function PATCH(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { id?: string; todas?: boolean };
  if (b.todas) {
    await db().query(`UPDATE midia_notificacoes SET lida=true, lida_em=NOW() WHERE destino='master' AND lida=false`);
  } else if (b.id) {
    await db().query(`UPDATE midia_notificacoes SET lida=true, lida_em=NOW() WHERE id=$1`, [b.id]);
  } else {
    return NextResponse.json({ ok: false, error: "id ou todas obrigatório" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 });
  await db().query(`DELETE FROM midia_notificacoes WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
