/**
 * GET /api/publico/apk
 * Download direto do APK do player (público — TVs precisam baixar sem login).
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const APK_DIR = process.env.APK_DIR ?? "/apks";
const APK_PATH = path.join(APK_DIR, "xibo-player.apk");

export async function GET(_req: NextRequest) {
  try {
    const buf = await fs.readFile(APK_PATH);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="xibo-player.apk"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse("APK não disponível. O master ainda não fez upload.", { status: 404 });
  }
}
