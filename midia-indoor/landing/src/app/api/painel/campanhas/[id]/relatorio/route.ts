/**
 * GET /api/painel/campanhas/[id]/relatorio — proof-of-play da própria campanha.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticar } from "@/lib/auth";
import { relatorioDetalhado } from "@/lib/campanhas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  await ensureSchema();
  const dono = await db().query(`SELECT 1 FROM midia_campanhas WHERE id = $1 AND conta_id = $2`, [params.id, auth.sub]);
  if (!dono.rows.length) return NextResponse.json({ ok: false, error: "campanha não encontrada" }, { status: 404 });

  try {
    const r = await relatorioDetalhado(params.id);
    return NextResponse.json({ ok: true, relatorio: r?.resumo ?? null, exibicoes: r?.exibicoes ?? [] });
  } catch (err) {
    console.error("[painel/campanhas relatorio]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
