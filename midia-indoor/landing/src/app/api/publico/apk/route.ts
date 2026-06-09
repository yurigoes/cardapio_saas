/**
 * GET /api/publico/apk
 * Download direto do APK do player (público — TVs precisam baixar sem login).
 * Le do PostgreSQL (BYTEA) - sem dependencia de filesystem.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  try {
    await ensureSchema();
    const r = await db().query<{ data: Buffer | null; filename: string | null; size: string | null }>(
      `SELECT player_apk_data AS data, player_apk_filename AS filename, player_apk_size AS size
         FROM midia_branding ORDER BY id LIMIT 1`
    );
    const row = r.rows[0];
    if (!row?.data) {
      return new NextResponse("APK não disponível. O master ainda não fez upload.", { status: 404 });
    }
    return new NextResponse(row.data, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${row.filename ?? "xibo-player.apk"}"`,
        "Content-Length": String(row.size ?? row.data.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    console.error("[publico/apk]", e);
    return new NextResponse("Erro ao servir APK", { status: 500 });
  }
}
