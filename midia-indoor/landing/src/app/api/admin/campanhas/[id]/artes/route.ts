/**
 * GET  /api/admin/campanhas/[id]/artes — histórico de criativos
 * POST /api/admin/campanhas/[id]/artes — { arte_id } reativa uma versão
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { reativarArte } from "@/lib/campanhas";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT id, arte_nome, arte_tipo, xibo_layout_id, ativa, criada_em, enviada_por FROM midia_campanha_artes WHERE campanha_id = $1 ORDER BY criada_em DESC`,
    [params.id]
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, artes: rows });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await exigirMaster(req)) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { arte_id?: string };
  if (!b.arte_id) return NextResponse.json({ ok: false, error: "arte_id obrigatório" }, { status: 400 });
  const r = await reativarArte(params.id, b.arte_id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
