/**
 * GET /api/publico/logo-print
 * Serve o logo de impressao/documentos (publico - sem auth, pois e usado em
 * janela de print que carrega a imagem direto pela URL).
 * Retorna 404 se nao houver logo de impressao configurado.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    await ensureSchema();
    const r = await db().query<{ data: Buffer | null; mime: string | null }>(
      `SELECT logo_print_data AS data, logo_print_mime AS mime
         FROM midia_branding WHERE id = 1 LIMIT 1`
    );
    const row = r.rows[0];
    if (!row?.data || !row.mime) {
      return NextResponse.json({ ok: false, error: "sem logo de impressao" }, { status: 404 });
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
