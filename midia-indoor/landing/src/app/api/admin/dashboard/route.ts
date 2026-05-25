/**
 * GET /api/admin/dashboard — KPIs do master.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await autenticarAdmin(req)) return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });

  try {
    await ensureSchema();
    const p = db();

    const [anunc, noAr, receita, aReceber, locais, aVencer, ultimas] = await Promise.all([
      p.query<{ n: string }>(`SELECT COUNT(*)::text n FROM midia_contas`),
      p.query<{ n: string }>(`SELECT COUNT(*)::text n FROM midia_campanhas WHERE status='no_ar'`),
      p.query<{ v: string }>(`SELECT COALESCE(SUM(valor),0)::text v FROM midia_campanhas WHERE status_pagamento='pago'`),
      p.query<{ v: string }>(`SELECT COALESCE(SUM(valor),0)::text v FROM midia_campanhas WHERE status_pagamento='pendente' AND status IN ('no_ar','rascunho','aguardando_arte')`),
      p.query<{ n: string }>(`SELECT COUNT(*)::text n FROM midia_locais WHERE ativo=true`),
      p.query(`SELECT c.nome, ct.empresa, c.data_fim
                 FROM midia_campanhas c JOIN midia_contas ct ON ct.id=c.conta_id
                WHERE c.status='no_ar' AND c.data_fim IS NOT NULL AND c.data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
                ORDER BY c.data_fim LIMIT 10`),
      p.query(`SELECT c.nome, ct.empresa, c.status, c.status_pagamento, c.valor, c.created_at
                 FROM midia_campanhas c JOIN midia_contas ct ON ct.id=c.conta_id
                ORDER BY c.created_at DESC LIMIT 8`),
    ]);

    return NextResponse.json({
      ok: true,
      kpis: {
        anunciantes:    Number(anunc.rows[0].n),
        campanhas_no_ar: Number(noAr.rows[0].n),
        receita_paga:   Number(receita.rows[0].v),
        a_receber:      Number(aReceber.rows[0].v),
        locais:         Number(locais.rows[0].n),
      },
      a_vencer: aVencer.rows,
      ultimas: ultimas.rows,
    });
  } catch (err) {
    console.error("[admin/dashboard]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
