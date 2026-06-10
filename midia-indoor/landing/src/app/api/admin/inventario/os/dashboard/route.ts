/**
 * GET /api/admin/inventario/os/dashboard
 * Resumo financeiro + operacional de OS pra master.
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autenticarAdmin(req))) return NextResponse.json({ ok: false, error: "nao autenticado" }, { status: 401 });
  await ensureSchema();
  const p = db();

  const totais = await p.query<{ status: string; n: number; custo_total: number }>(
    `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(custo_centavos), 0)::int AS custo_total
       FROM midia_inventario_os GROUP BY status`
  ).then(r => r.rows);
  const porMotivo = await p.query<{ motivo: string; n: number; custo_total: number }>(
    `SELECT motivo, COUNT(*)::int AS n, COALESCE(SUM(custo_centavos), 0)::int AS custo_total
       FROM midia_inventario_os WHERE status IN ('resolvido','descartado') GROUP BY motivo ORDER BY n DESC`
  ).then(r => r.rows);
  const porTipo = await p.query<{ tipo: string; n: number; custo_total: number }>(
    `SELECT i.tipo, COUNT(*)::int AS n, COALESCE(SUM(os.custo_centavos), 0)::int AS custo_total
       FROM midia_inventario_os os JOIN midia_inventario i ON i.id = os.inventario_id
      WHERE os.status IN ('resolvido','descartado') GROUP BY i.tipo ORDER BY n DESC`
  ).then(r => r.rows);
  // Gasto por mes (12 meses)
  const porMes = await p.query<{ mes: string; n: number; custo_total: number }>(
    `SELECT to_char(criada_em, 'YYYY-MM') AS mes, COUNT(*)::int AS n,
            COALESCE(SUM(custo_centavos), 0)::int AS custo_total
       FROM midia_inventario_os
      WHERE criada_em >= NOW() - INTERVAL '12 months'
      GROUP BY mes ORDER BY mes`
  ).then(r => r.rows);
  // Top 10 itens com mais OS
  const topItens = await p.query<{ inventario_id: string; nome: string; tipo: string; n_os: number; custo_total: number }>(
    `SELECT i.id AS inventario_id, i.nome, i.tipo,
            COUNT(os.id)::int AS n_os,
            COALESCE(SUM(os.custo_centavos), 0)::int AS custo_total
       FROM midia_inventario i JOIN midia_inventario_os os ON os.inventario_id = i.id
      GROUP BY i.id, i.nome, i.tipo
      ORDER BY n_os DESC, custo_total DESC LIMIT 10`
  ).then(r => r.rows);
  // OS atrasadas (passou SLA e ainda aberto/em_analise)
  const atrasadas = await p.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM midia_inventario_os
      WHERE status IN ('aberto','em_analise')
        AND prazo_sla IS NOT NULL AND prazo_sla < NOW()`
  ).then(r => r.rows[0]?.n ?? 0);
  // SLA medio de resolucao (horas)
  const slaResolucao = await p.query<{ horas: number }>(
    `SELECT COALESCE(EXTRACT(EPOCH FROM AVG(fechada_em - criada_em)) / 3600, 0)::float AS horas
       FROM midia_inventario_os WHERE status = 'resolvido' AND fechada_em IS NOT NULL`
  ).then(r => r.rows[0]?.horas ?? 0);

  return NextResponse.json({
    ok: true,
    totais, por_motivo: porMotivo, por_tipo: porTipo, por_mes: porMes,
    top_itens: topItens, atrasadas, sla_medio_horas: Math.round(slaResolucao * 10) / 10,
  });
}
