/**
 * GET /api/publico/locais — endpoint público, lista locais disponíveis pra venda.
 * Não exige auth (usado na página /inventario).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  await ensureSchema();
  const rows = await db().query(
    `SELECT id, nome, cidade, descricao, lat, lng, passantes_dia, largura, altura, orientacao
       FROM midia_locais
      WHERE archived_at IS NULL AND ativo = true AND (tipo IS NULL OR tipo='individual')
      ORDER BY cidade NULLS LAST, nome`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, locais: rows });
}
