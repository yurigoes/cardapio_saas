/**
 * POST /api/admin/inventario/os/[id]/foto
 * Multipart: file (cap 2MB, image/*)
 * Anexa foto base64 na OS (cap 5 fotos).
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirMaster, autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await autenticarAdmin(req)) && !(await exigirMaster(req))) {
    return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file ausente" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: "max 2MB" }, { status: 413 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ ok: false, error: "so imagem" }, { status: 415 });

  await ensureSchema();
  const os = await db().query<{ fotos: string[] | null }>(
    `SELECT fotos FROM midia_inventario_os WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!os) return NextResponse.json({ ok: false, error: "OS nao encontrada" }, { status: 404 });

  const fotos = Array.isArray(os.fotos) ? os.fotos : [];
  if (fotos.length >= 5) return NextResponse.json({ ok: false, error: "max 5 fotos por OS" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  fotos.push(dataUrl);
  await db().query(`UPDATE midia_inventario_os SET fotos = $1 WHERE id = $2`, [JSON.stringify(fotos), params.id]);
  return NextResponse.json({ ok: true, total: fotos.length });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await exigirMaster(req))) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  const idx = Number(req.nextUrl.searchParams.get("idx"));
  if (!Number.isFinite(idx) || idx < 0) return NextResponse.json({ ok: false, error: "idx invalido" }, { status: 400 });

  await ensureSchema();
  const os = await db().query<{ fotos: string[] | null }>(
    `SELECT fotos FROM midia_inventario_os WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!os) return NextResponse.json({ ok: false, error: "OS nao encontrada" }, { status: 404 });
  const fotos = Array.isArray(os.fotos) ? os.fotos : [];
  if (idx >= fotos.length) return NextResponse.json({ ok: false, error: "idx fora do range" }, { status: 400 });
  fotos.splice(idx, 1);
  await db().query(`UPDATE midia_inventario_os SET fotos = $1 WHERE id = $2`, [JSON.stringify(fotos), params.id]);
  return NextResponse.json({ ok: true, total: fotos.length });
}
