/**
 * POST   /api/admin/player-apk  — multipart com 'file' (.apk) + opcional 'versao'
 * DELETE /api/admin/player-apk  — remove o APK atual
 * GET    /api/admin/player-apk  — info do APK atual (size, sha, versao)
 *
 * O arquivo é gravado direto no PostgreSQL (BYTEA) — não precisa volume montado
 * nem permissão de escrita no FS. Servido publicamente em /api/publico/apk.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin, exigirMaster } from "@/lib/admin-auth";
import { logAudit } from "@/lib/auditoria";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const APK_FILENAME = "xibo-player.apk";
const MAX = 100 * 1024 * 1024; // 100MB

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const row = await db().query<{
    player_versao: string | null; player_apk_size: string | null; player_apk_sha256: string | null;
    player_apk_uploaded_at: string | null; tem_data: boolean;
  }>(
    `SELECT player_versao, player_apk_size, player_apk_sha256, player_apk_uploaded_at,
            (player_apk_data IS NOT NULL) AS tem_data
       FROM midia_branding ORDER BY id LIMIT 1`
  ).then(r => r.rows[0]).catch(() => null);

  return NextResponse.json({
    ok: true,
    existe: !!row?.tem_data,
    size_real: row?.player_apk_size ? Number(row.player_apk_size) : 0,
    size_db: row?.player_apk_size ? Number(row.player_apk_size) : null,
    sha256: row?.player_apk_sha256 ?? null,
    versao: row?.player_versao ?? null,
    uploaded_at: row?.player_apk_uploaded_at ?? null,
    download_url: row?.tem_data ? "/api/publico/apk" : null,
  });
}

export async function POST(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const versao = String(form.get("versao") ?? "").trim() || null;
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "arquivo ausente" }, { status: 400 });
    if (file.size > MAX) return NextResponse.json({ ok: false, error: `arquivo muito grande (máx ${MAX / 1024 / 1024}MB)` }, { status: 413 });
    if (!file.name.toLowerCase().endsWith(".apk")) return NextResponse.json({ ok: false, error: "arquivo precisa ser .apk" }, { status: 415 });

    const buf = Buffer.from(await file.arrayBuffer());
    const sha = crypto.createHash("sha256").update(buf).digest("hex");

    await ensureSchema();
    const ja = await db().query(`SELECT 1 FROM midia_branding LIMIT 1`);
    if (!ja.rows.length) await db().query(`INSERT INTO midia_branding DEFAULT VALUES`);

    await db().query(
      `UPDATE midia_branding
          SET player_apk_data       = $1,
              player_apk_filename   = $2,
              player_apk_size       = $3,
              player_apk_sha256     = $4,
              player_apk_uploaded_at= NOW(),
              player_versao         = COALESCE($5, player_versao),
              player_apk_url        = $6
        WHERE id IN (SELECT id FROM midia_branding ORDER BY id LIMIT 1)`,
      [buf, APK_FILENAME, buf.length, sha, versao, "/api/publico/apk"]
    );

    logAudit(req, { autor_tipo: "admin", autor_id: master.sub, autor_nome: master.nome, acao: "player-apk.upload", entidade: "branding", detalhes: { size: buf.length, sha, versao } });
    return NextResponse.json({ ok: true, size: buf.length, sha256: sha, versao, download_url: "/api/publico/apk" });
  } catch (err) {
    console.error("[player-apk POST]", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const master = await exigirMaster(req);
  if (!master) return NextResponse.json({ ok: false, error: "apenas master" }, { status: 403 });
  await db().query(
    `UPDATE midia_branding
        SET player_apk_data = NULL, player_apk_filename = NULL, player_apk_size = NULL,
            player_apk_sha256 = NULL, player_apk_uploaded_at = NULL, player_apk_url = NULL`
  );
  return NextResponse.json({ ok: true });
}
