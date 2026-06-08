/**
 * GET /api/admin/locais/selecionaveis
 * Retorna locais individuais + grupos numa lista única (pra dropdown do
 * NovaCampanha). Grupos vêm com flag is_grupo=true e contagem de membros.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const rows = await db().query(
    `SELECT l.id, l.nome, l.cidade, l.largura, l.altura, l.tipo, l.sincronia,
            CASE WHEN l.tipo='grupo' THEN (SELECT COUNT(*) FROM midia_local_grupo_membros m WHERE m.grupo_id=l.id) ELSE NULL END AS qtd_membros
       FROM midia_locais l
      WHERE l.archived_at IS NULL AND l.ativo = true
      ORDER BY (CASE WHEN l.tipo='grupo' THEN 0 ELSE 1 END), l.nome`
  ).then(r => r.rows);
  return NextResponse.json({ ok: true, locais: rows });
}
