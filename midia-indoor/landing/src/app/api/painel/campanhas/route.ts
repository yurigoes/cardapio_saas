/**
 * GET /api/painel/campanhas — campanhas do anunciante autenticado.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await db().query(
      `SELECT c.id, c.nome, c.tipo, c.dias, c.insercoes_dia, c.segundos, c.data_inicio, c.data_fim,
              c.status, c.status_pagamento, c.arte_nome, c.arte_tipo, c.valor,
              (SELECT COUNT(*) FROM midia_campanha_locais cl WHERE cl.campanha_id = c.id) AS locais
         FROM midia_campanhas c WHERE c.conta_id = $1 ORDER BY c.created_at DESC`,
      [auth.sub]
    ).then(r => r.rows);
    return NextResponse.json({ ok: true, campanhas: rows });
  } catch (err) {
    console.error("[painel/campanhas]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
