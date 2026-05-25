/**
 * GET /api/admin/locais/[id]/ocupacao
 * Campanhas que rodam neste local + soma de inserções/dia (mix de anunciantes).
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  try {
    await ensureSchema();
    const p = db();

    const local = await p.query<{ nome: string }>(`SELECT nome FROM midia_locais WHERE id = $1`, [params.id]).then(r => r.rows[0]);
    if (!local) return NextResponse.json({ ok: false, error: "local não encontrado" }, { status: 404 });

    const campanhas = await p.query(
      `SELECT c.id, c.nome, c.status, c.status_pagamento, c.insercoes_dia, c.segundos, c.tipo,
              c.data_inicio, c.data_fim, ct.empresa, ct.nome AS anunciante
         FROM midia_campanha_locais cl
         JOIN midia_campanhas c ON c.id = cl.campanha_id
         JOIN midia_contas ct ON ct.id = c.conta_id
        WHERE cl.local_id = $1
        ORDER BY (c.status='no_ar') DESC, c.created_at DESC`,
      [params.id]
    ).then(r => r.rows);

    const noAr = campanhas.filter(c => c.status === "no_ar");
    const insercoesDia = noAr.reduce((s, c) => s + Number(c.insercoes_dia || 0), 0);
    const segundosDia  = noAr.reduce((s, c) => s + Number(c.insercoes_dia || 0) * Number(c.segundos || 0), 0);

    return NextResponse.json({
      ok: true,
      local: local.nome,
      resumo: {
        anunciantes_no_ar: noAr.length,
        insercoes_dia: insercoesDia,
        segundos_dia: segundosDia,           // tempo total de anúncio por dia (s)
        minutos_dia: Math.round(segundosDia / 60),
      },
      campanhas,
    });
  } catch (err) {
    console.error("[admin/locais/ocupacao]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
