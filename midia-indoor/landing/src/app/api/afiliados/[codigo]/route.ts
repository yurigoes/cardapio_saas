/** GET /api/afiliados/[codigo] — público, retorna { ok, nome } se válido. Usado pra exibir "indicado por X" na landing. */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { codigo: string } }) {
  try {
    await ensureSchema();
    const r = await db().query<{ nome: string; ativo: boolean }>(
      `SELECT nome, ativo FROM midia_afiliados WHERE codigo = $1`, [params.codigo.toUpperCase()]
    );
    if (!r.rows[0] || !r.rows[0].ativo) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json({ ok: true, nome: r.rows[0].nome });
  } catch { return NextResponse.json({ ok: false }, { status: 500 }); }
}
