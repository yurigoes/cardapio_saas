/**
 * GET /api/admin/inventario/os/tecnicos
 * Lista nomes de tecnicos ja usados em OS (autocomplete).
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autenticarAdmin(req))) return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  await ensureSchema();
  const r = await db().query<{ nome: string }>(
    `SELECT DISTINCT atribuido_a AS nome FROM midia_inventario_os
      WHERE atribuido_a IS NOT NULL AND TRIM(atribuido_a) <> ''
      ORDER BY atribuido_a`
  );
  return NextResponse.json({ ok: true, tecnicos: r.rows.map(x => x.nome) });
}
