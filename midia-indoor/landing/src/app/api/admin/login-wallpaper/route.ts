/**
 * POST   /api/admin/login-wallpaper  — multipart com campo "file" (master only)
 * DELETE /api/admin/login-wallpaper  — remove wallpaper atual
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  try {
    await ensureSchema();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "arquivo ausente (campo 'file')" }, { status: 400 });
    }
    if (!MIMES.has(file.type)) {
      return NextResponse.json({ ok: false, error: `formato inválido: ${file.type}. Use JPG, PNG ou WebP.` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: `arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máx 5 MB.` }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    await db().query(
      `UPDATE midia_branding
          SET login_wallpaper_data = $1,
              login_wallpaper_mime = $2,
              login_wallpaper_updated_at = NOW()
        WHERE id = 1`,
      [buf, file.type]
    );
    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "branding.login_wallpaper_upload", entidade: "branding", entidade_id: "1", detalhes: { mime: file.type, size: file.size } });
    return NextResponse.json({ ok: true, mime: file.type, size: file.size });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  await db().query(`UPDATE midia_branding SET login_wallpaper_data = NULL, login_wallpaper_mime = NULL, login_wallpaper_updated_at = NOW() WHERE id = 1`);
  logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "branding.login_wallpaper_remove", entidade: "branding", entidade_id: "1" });
  return NextResponse.json({ ok: true });
}
