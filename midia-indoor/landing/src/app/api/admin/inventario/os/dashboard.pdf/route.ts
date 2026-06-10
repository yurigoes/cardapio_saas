/**
 * GET /api/admin/inventario/os/dashboard.pdf
 * Retorna HTML print-friendly do dashboard (abre/imprime no navegador).
 * Nao gera PDF binario — usa o "Imprimir como PDF" do navegador,
 * que e robusto e nao requer dependencia extra (Puppeteer, etc).
 */
import { NextRequest, NextResponse } from "next/server";
import { autenticarAdmin } from "@/lib/admin-auth";
import { db, ensureSchema } from "@/lib/db";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function GET(req: NextRequest) {
  if (!(await autenticarAdmin(req))) return new NextResponse("nao autenticado", { status: 401 });
  await ensureSchema();
  const p = db();
  const b = await getBranding();

  const [totais, porMotivo, porTipo, porMes, topItens, atrasadasRow, slaResolucaoRow] = await Promise.all([
    p.query<{ status: string; n: number; custo_total: number }>(`SELECT status, COUNT(*)::int n, COALESCE(SUM(custo_centavos),0)::int custo_total FROM midia_inventario_os GROUP BY status`).then(r => r.rows),
    p.query<{ motivo: string; n: number; custo_total: number }>(`SELECT motivo, COUNT(*)::int n, COALESCE(SUM(custo_centavos),0)::int custo_total FROM midia_inventario_os WHERE status IN ('resolvido','descartado') GROUP BY motivo ORDER BY n DESC`).then(r => r.rows),
    p.query<{ tipo: string; n: number; custo_total: number }>(`SELECT i.tipo, COUNT(*)::int n, COALESCE(SUM(os.custo_centavos),0)::int custo_total FROM midia_inventario_os os JOIN midia_inventario i ON i.id = os.inventario_id WHERE os.status IN ('resolvido','descartado') GROUP BY i.tipo ORDER BY n DESC`).then(r => r.rows),
    p.query<{ mes: string; n: number; custo_total: number }>(`SELECT to_char(criada_em,'YYYY-MM') mes, COUNT(*)::int n, COALESCE(SUM(custo_centavos),0)::int custo_total FROM midia_inventario_os WHERE criada_em >= NOW() - INTERVAL '12 months' GROUP BY mes ORDER BY mes`).then(r => r.rows),
    p.query<{ nome: string; tipo: string; n_os: number; custo_total: number; local_nome: string | null }>(`SELECT i.nome, i.tipo, COUNT(os.id)::int n_os, COALESCE(SUM(os.custo_centavos),0)::int custo_total, l.nome AS local_nome FROM midia_inventario i JOIN midia_inventario_os os ON os.inventario_id = i.id LEFT JOIN midia_locais l ON l.id = i.local_id GROUP BY i.id, i.nome, i.tipo, l.nome ORDER BY n_os DESC, custo_total DESC LIMIT 20`).then(r => r.rows),
    p.query<{ n: number }>(`SELECT COUNT(*)::int n FROM midia_inventario_os WHERE status IN ('aberto','em_analise') AND prazo_sla IS NOT NULL AND prazo_sla < NOW()`).then(r => r.rows[0]?.n ?? 0),
    p.query<{ horas: number }>(`SELECT COALESCE(EXTRACT(EPOCH FROM AVG(fechada_em - criada_em)) / 3600, 0)::float horas FROM midia_inventario_os WHERE status='resolvido' AND fechada_em IS NOT NULL`).then(r => r.rows[0]?.horas ?? 0),
  ]);

  const custoTotal = totais.filter(t => t.status === "resolvido").reduce((s,t) => s + t.custo_total, 0);
  const atrasadas = atrasadasRow as number;
  const slaMedio = Math.round((slaResolucaoRow as number) * 10) / 10;
  const data = new Date().toLocaleString("pt-BR");

  const html = `<!doctype html><html><head>
<meta charset="utf-8" />
<title>Dashboard Manutenção · ${b.nome}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  body { font: 12px/1.5 -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif; color: #1a1f2e; margin: 0; }
  header { border-bottom: 3px solid ${b.cor}; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  header h1 { color: ${b.cor}; margin: 0; font-size: 22px; }
  header p { margin: 4px 0 0; color: #666; font-size: 11px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
  .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #888; }
  .kpi .value { font-size: 22px; font-weight: 800; margin-top: 4px; }
  .kpi.danger .value { color: #dc2626; }
  .kpi.success .value { color: #16a34a; }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 { font-size: 14px; color: #4b5563; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f4f6f8; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #999; text-align: center; }
  @media print { .noprint { display: none !important; } }
  .noprint { position: fixed; top: 10px; right: 10px; background: ${b.cor}; color: #fff; padding: 8px 14px; border-radius: 6px; cursor: pointer; border: none; font-size: 13px; font-weight: 600; }
</style>
</head><body>
<button class="noprint" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
<header>
  <div><h1>Dashboard de Manutenção</h1><p>${b.nome} · gerado em ${data}</p></div>
</header>

<div class="kpis">
  <div class="kpi success"><div class="label">Custo total resolvido</div><div class="value">${brl(custoTotal)}</div></div>
  <div class="kpi"><div class="label">SLA médio resolução</div><div class="value">${slaMedio}h</div></div>
  <div class="kpi ${atrasadas > 0 ? "danger" : ""}"><div class="label">OS atrasadas (SLA)</div><div class="value">${atrasadas}</div></div>
  <div class="kpi"><div class="label">Total OS</div><div class="value">${totais.reduce((s,t) => s + t.n, 0)}</div></div>
</div>

<section>
  <h2>Por status</h2>
  <table><thead><tr><th>Status</th><th class="num">Quantidade</th><th class="num">Custo</th></tr></thead><tbody>
    ${totais.map(t => `<tr><td>${t.status}</td><td class="num">${t.n}</td><td class="num">${brl(t.custo_total)}</td></tr>`).join("")}
  </tbody></table>
</section>

<section>
  <h2>Por motivo (resolvidas)</h2>
  <table><thead><tr><th>Motivo</th><th class="num">Quantidade</th><th class="num">Custo</th></tr></thead><tbody>
    ${porMotivo.map(t => `<tr><td>${t.motivo}</td><td class="num">${t.n}</td><td class="num">${brl(t.custo_total)}</td></tr>`).join("")}
    ${porMotivo.length === 0 ? `<tr><td colspan="3" style="color:#999;text-align:center;">Nenhuma OS resolvida ainda</td></tr>` : ""}
  </tbody></table>
</section>

<section>
  <h2>Por tipo de equipamento</h2>
  <table><thead><tr><th>Tipo</th><th class="num">Quantidade</th><th class="num">Custo</th></tr></thead><tbody>
    ${porTipo.map(t => `<tr><td>${t.tipo}</td><td class="num">${t.n}</td><td class="num">${brl(t.custo_total)}</td></tr>`).join("")}
    ${porTipo.length === 0 ? `<tr><td colspan="3" style="color:#999;text-align:center;">—</td></tr>` : ""}
  </tbody></table>
</section>

<section>
  <h2>Por mês (12 meses)</h2>
  <table><thead><tr><th>Mês</th><th class="num">Quantidade</th><th class="num">Custo</th></tr></thead><tbody>
    ${porMes.map(t => `<tr><td>${t.mes}</td><td class="num">${t.n}</td><td class="num">${brl(t.custo_total)}</td></tr>`).join("")}
    ${porMes.length === 0 ? `<tr><td colspan="3" style="color:#999;text-align:center;">—</td></tr>` : ""}
  </tbody></table>
</section>

<section>
  <h2>Top 20 itens problemáticos</h2>
  <table><thead><tr><th>Item</th><th>Tipo</th><th>Local</th><th class="num">OS</th><th class="num">Custo</th></tr></thead><tbody>
    ${topItens.map(t => `<tr><td>${t.nome}</td><td>${t.tipo}</td><td>${t.local_nome ?? "—"}</td><td class="num">${t.n_os}</td><td class="num">${brl(t.custo_total)}</td></tr>`).join("")}
    ${topItens.length === 0 ? `<tr><td colspan="5" style="color:#999;text-align:center;">—</td></tr>` : ""}
  </tbody></table>
</section>

<footer>${b.nome} · suporte técnico · ${data}</footer>
</body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
