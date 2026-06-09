/**
 * POST /api/admin/inventario/screenshot — upload de print (chamado pelo agente ADB local)
 *   Body: multipart com 'file' (PNG/JPG) + 'mac' + 'secret'
 * GET  /api/admin/inventario/screenshot?mac=XX:XX  — última imagem da TV (autenticado)
 * GET  /api/admin/inventario/screenshot?id=UUID    — última imagem pelo id do inventário
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.PROVISION_SECRET || "td-provision-2026";

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const form = await req.formData();
    const secret = String(form.get("secret") ?? "");
    if (secret !== SECRET) return NextResponse.json({ ok: false, error: "secret inválido" }, { status: 401 });

    const macRaw = String(form.get("mac") ?? "").toUpperCase().trim();
    if (!macRaw) return NextResponse.json({ ok: false, error: "mac obrigatório" }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file ausente" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: "máx 8MB" }, { status: 413 });

    const buf = Buffer.from(await file.arrayBuffer());

    // Acha o item do inventário pelo MAC (se existir)
    const inv = await db().query<{ id: string }>(`SELECT id FROM midia_inventario WHERE mac = $1 LIMIT 1`, [macRaw]);
    const invId = inv.rows[0]?.id ?? null;

    await db().query(
      `INSERT INTO midia_screenshots (inventario_id, mac, data, mime, size) VALUES ($1, $2, $3, $4, $5)`,
      [invId, macRaw, buf, file.type || "image/png", buf.length]
    );

    // Mantem só as últimas 5 por MAC (limpa antigas)
    await db().query(
      `DELETE FROM midia_screenshots
        WHERE mac = $1
          AND id NOT IN (SELECT id FROM midia_screenshots WHERE mac = $1 ORDER BY taken_at DESC LIMIT 5)`,
      [macRaw]
    );

    return NextResponse.json({ ok: true, size: buf.length, inventario_id: invId });
  } catch (e) {
    console.error("[screenshot POST]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const mac = req.nextUrl.searchParams.get("mac")?.toUpperCase().trim();
  const id  = req.nextUrl.searchParams.get("id");
  if (!mac && !id) return NextResponse.json({ ok: false, error: "informe mac ou id" }, { status: 400 });

  const r = mac
    ? await db().query<{ data: Buffer; mime: string; size: string; taken_at: string }>(
        `SELECT data, mime, size, taken_at FROM midia_screenshots WHERE mac = $1 ORDER BY taken_at DESC LIMIT 1`, [mac])
    : await db().query<{ data: Buffer; mime: string; size: string; taken_at: string }>(
        `SELECT data, mime, size, taken_at FROM midia_screenshots WHERE inventario_id = $1 ORDER BY taken_at DESC LIMIT 1`, [id]);

  const row = r.rows[0];
  if (!row) return new NextResponse("Sem screenshot ainda. Rode o script tirar-prints.ps1 no PC local.", { status: 404 });

  const bytes = new Uint8Array(row.data);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": row.mime ?? "image/png",
      "Content-Length": String(row.size ?? bytes.byteLength),
      "X-Taken-At": row.taken_at,
      "Cache-Control": "no-store",
    },
  });
}
