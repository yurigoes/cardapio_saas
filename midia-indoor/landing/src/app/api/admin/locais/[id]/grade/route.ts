/**
 * GET /api/admin/locais/[id]/grade?dia=YYYY-MM-DD
 * Retorna as campanhas ativas no local na data informada (default hoje),
 * com janela de horário (hora_inicio/hora_fim) e nº de inserções/dia.
 * Usado pela pré-visualização da grade.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  await ensureSchema();
  const dia = req.nextUrl.searchParams.get("dia") || new Date().toISOString().slice(0, 10);

  const local = await db().query<{ id: string; nome: string; cidade: string | null; largura: number; altura: number }>(
    `SELECT id, nome, cidade, largura, altura FROM midia_locais WHERE id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!local) return NextResponse.json({ ok: false, error: "local não encontrado" }, { status: 404 });

  const campanhas = await db().query(
    `SELECT c.id, c.nome, c.tipo, c.insercoes_dia, c.segundos, c.hora_inicio, c.hora_fim,
            c.data_inicio, c.data_fim, c.status, c.arte_status,
            ct.empresa
       FROM midia_campanhas c
       JOIN midia_contas ct ON ct.id = c.conta_id
       JOIN midia_campanha_locais cl ON cl.campanha_id = c.id
      WHERE cl.local_id = $1
        AND c.status IN ('no_ar','aguardando_arte')
        AND ($2::date BETWEEN c.data_inicio AND c.data_fim)
      ORDER BY c.hora_inicio NULLS FIRST, c.nome`,
    [params.id, dia]
  ).then(r => r.rows);

  // Capacidade total/dia = 24h * 3600s / segundos médios
  const totalInsercoes = campanhas.reduce((acc, c) => acc + Number(c.insercoes_dia ?? 0), 0);
  return NextResponse.json({ ok: true, local, dia, campanhas, totalInsercoes });
}
