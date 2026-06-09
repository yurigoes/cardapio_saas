/**
 * GET /api/publico/login-wallpaper
 * Serve a imagem de fundo da tela de login (publica - sem auth)
 * Cache curto pra refletir trocas rapidas mas evitar hit em todo render
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    await ensureSchema();
    const r = await db().query<{ data: Buffer | null; mime: string | null }>(
      `SELECT login_wallpaper_data AS data, login_wallpaper_mime AS mime
         FROM midia_branding WHERE id = 1 LIMIT 1`
    );
    const row = r.rows[0];
    if (!row?.data || !row.mime) {
      return NextResponse.json({ ok: false, error: "sem wallpaper" }, { status: 404 });
    }
    return new NextResponse(row.data as unknown as BodyInit, {
      headers: {
        "Content-Type": row.mime,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
