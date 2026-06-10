/**
 * GET  /api/admin/inventario/os?status=aberto|em_analise|resolvido|descartado|todos
 * POST /api/admin/inventario/os    — abre OS direto (sem desvincular)
 *   Body: { inventario_id, motivo, descricao, fotos?[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";
import { abrirOS, type OsMotivo } from "@/lib/inventario-os";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autenticarAdmin(req))) return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  await ensureSchema();
  const status = req.nextUrl.searchParams.get("status") ?? "aberto";
  const filtro = status === "todos" ? "" : `WHERE os.status = $1`;
  const args = status === "todos" ? [] : [status];
  const rows = await db().query(
    `SELECT os.*, i.nome AS item_nome, i.tipo AS item_tipo, i.modelo AS item_modelo, i.mac AS item_mac,
            l.nome AS local_nome, sub.nome AS substituido_por_nome
       FROM midia_inventario_os os
       JOIN midia_inventario i ON i.id = os.inventario_id
  LEFT JOIN midia_locais l ON l.id = i.local_id
  LEFT JOIN midia_inventario sub ON sub.id = os.substituido_por_id
       ${filtro}
   ORDER BY os.criada_em DESC
      LIMIT 200`, args
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, ordens: rows });
}

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const body = await req.json().catch(() => null) as { inventario_id?: string; motivo?: OsMotivo; descricao?: string; fotos?: string[] } | null;
  if (!body?.inventario_id || !body.motivo || !body.descricao) {
    return NextResponse.json({ ok: false, error: "inventario_id, motivo e descricao obrigatorios" }, { status: 400 });
  }
  const r = await abrirOS({
    inventarioId: body.inventario_id,
    motivo: body.motivo,
    descricao: body.descricao,
    fotos: body.fotos,
    autor: { tipo: "admin", id: master.sub, nome: master.nome },
  });
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
