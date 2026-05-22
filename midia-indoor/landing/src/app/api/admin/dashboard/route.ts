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

    const [contas, assinAtivas, mrr, telas, ultimas] = await Promise.all([
      p.query<{ n: string }>(`SELECT COUNT(*)::text n FROM midia_contas`),
      p.query<{ n: string }>(`SELECT COUNT(*)::text n FROM midia_assinaturas WHERE status='ativa'`),
      p.query<{ v: string }>(`SELECT COALESCE(SUM(preco_tela*qtd_telas),0)::text v FROM midia_assinaturas WHERE status='ativa'`),
      p.query<{ n: string }>(`SELECT COUNT(*)::text n FROM midia_telas`),
      p.query(`SELECT c.empresa, c.nome, c.email, c.status, c.created_at
                 FROM midia_contas c ORDER BY c.created_at DESC LIMIT 8`),
    ]);

    const porStatus = await p.query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text n FROM midia_contas GROUP BY status`
    );

    return NextResponse.json({
      ok: true,
      kpis: {
        contas:        Number(contas.rows[0].n),
        assinaturas_ativas: Number(assinAtivas.rows[0].n),
        mrr:           Number(mrr.rows[0].v),
        telas:         Number(telas.rows[0].n),
      },
      por_status: Object.fromEntries(porStatus.rows.map(r => [r.status, Number(r.n)])),
      ultimas: ultimas.rows,
    });
  } catch (err) {
    console.error("[admin/dashboard]", err);
    return NextResponse.json({ ok: false, error: "erro" }, { status: 500 });
  }
}
