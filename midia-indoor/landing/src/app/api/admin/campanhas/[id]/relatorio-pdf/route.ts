/**
 * GET /api/admin/campanhas/[id]/relatorio-pdf
 * Retorna HTML formatado pra impressão/PDF do navegador (white-label com logo da marca).
 * Cliente abre, faz Ctrl+P → Salvar como PDF.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { autenticarAdmin } from "@/lib/admin-auth";
import { relatorioDetalhado } from "@/lib/campanhas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autenticarAdmin(req)) return new NextResponse("não autenticado", { status: 401 });
  await ensureSchema();

  const camp = await db().query<{ id: string; nome: string; data_inicio: string; data_fim: string; insercoes_dia: number; segundos: number; status: string; empresa: string }>(
    `SELECT c.id, c.nome, c.data_inicio, c.data_fim, c.insercoes_dia, c.segundos, c.status, ct.empresa
       FROM midia_campanhas c JOIN midia_contas ct ON ct.id = c.conta_id WHERE c.id = $1`, [params.id]
  ).then(r => r.rows[0]);
  if (!camp) return new NextResponse("não encontrada", { status: 404 });

  const locais = await db().query<{ nome: string; cidade: string | null }>(
    `SELECT l.nome, l.cidade FROM midia_campanha_locais cl JOIN midia_locais l ON l.id = cl.local_id WHERE cl.campanha_id = $1`, [params.id]
  ).then(r => r.rows);

  const branding = await db().query<{ nome: string; cor: string | null; logo_url: string | null; cnpj: string | null; site: string | null }>(
    `SELECT nome, cor, logo_url, cnpj, site FROM midia_branding ORDER BY id LIMIT 1`
  ).then(r => r.rows[0]).catch(() => null);

  const rel = await relatorioDetalhado(params.id);
  const plays = rel?.resumo.plays ?? 0;
  const duracao = rel?.resumo.duracao ?? 0;
  const meta = (camp.insercoes_dia ?? 0) * Math.max(1, Math.ceil(((new Date(camp.data_fim).getTime() - new Date(camp.data_inicio).getTime()) / 86400000) + 1));
  const pct = meta > 0 ? Math.round((plays / meta) * 100) : 0;

  // Agrupa exibições por dia
  const porDia = new Map<string, { plays: number; duracao: number }>();
  for (const e of rel?.exibicoes ?? []) {
    const dia = (e.start ?? "").slice(0, 10);
    const cur = porDia.get(dia) ?? { plays: 0, duracao: 0 };
    cur.plays += e.numberPlays; cur.duracao += e.duration;
    porDia.set(dia, cur);
  }

  const corPrim = branding?.cor ?? "#7c3aed";
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório — ${camp.nome}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;line-height:1.5;padding:40px;max-width:900px;margin:auto}
  .header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:3px solid ${corPrim};margin-bottom:30px}
  .logo{height:60px;max-width:200px;object-fit:contain}
  .marca-nome{font-size:18px;font-weight:bold;color:${corPrim}}
  h1{font-size:28px;color:${corPrim};margin-bottom:5px}
  .subtitle{color:#666;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:30px 0}
  .kpi{padding:20px;background:#f8f9fc;border-radius:12px;text-align:center;border:1px solid #e2e4ed}
  .kpi-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px}
  .kpi-value{font-size:28px;font-weight:bold;color:${corPrim};margin-top:5px}
  .kpi-sub{font-size:11px;color:#888;margin-top:3px}
  h2{font-size:18px;color:${corPrim};margin:30px 0 10px;padding-bottom:5px;border-bottom:1px solid #ddd}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{padding:10px;text-align:left;border-bottom:1px solid #eee;font-size:13px}
  th{background:#f8f9fc;font-weight:600;color:#555}
  .footer{margin-top:50px;padding-top:20px;border-top:1px solid #ddd;text-align:center;color:#999;font-size:11px}
  .bar{height:8px;background:#e2e4ed;border-radius:4px;overflow:hidden}
  .bar-fill{height:100%;background:${corPrim}}
  .print-hint{background:#fff3cd;color:#856404;padding:10px 15px;border-radius:8px;margin-bottom:20px;font-size:13px}
  @media print{.print-hint{display:none}body{padding:20px}}
</style></head><body>

<div class="print-hint">💡 Pressione <strong>Ctrl+P</strong> (ou Cmd+P no Mac) → "Salvar como PDF" pra gerar o arquivo.</div>

<div class="header">
  <div>
    ${branding?.logo_url ? `<img src="${branding.logo_url}" class="logo" alt="${branding.nome ?? ""}">` : `<div class="marca-nome">${branding?.nome ?? "Three Digital Mídia"}</div>`}
    ${branding?.cnpj ? `<div style="font-size:11px;color:#888;margin-top:5px">CNPJ: ${branding.cnpj}</div>` : ""}
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#888">RELATÓRIO DE EXIBIÇÕES</div>
    <div style="font-size:14px;font-weight:600">Emitido em ${new Date().toLocaleDateString("pt-BR")}</div>
  </div>
</div>

<h1>${camp.nome}</h1>
<p class="subtitle"><strong>Anunciante:</strong> ${camp.empresa} · <strong>Período:</strong> ${camp.data_inicio} → ${camp.data_fim} · <strong>Status:</strong> ${camp.status}</p>

<div class="grid">
  <div class="kpi"><div class="kpi-label">Inserções realizadas</div><div class="kpi-value">${plays.toLocaleString("pt-BR")}</div><div class="kpi-sub">de ${meta.toLocaleString("pt-BR")} previstas</div></div>
  <div class="kpi"><div class="kpi-label">Tempo total no ar</div><div class="kpi-value">${Math.floor(duracao / 60)}<span style="font-size:14px"> min</span></div><div class="kpi-sub">${duracao}s</div></div>
  <div class="kpi"><div class="kpi-label">Cumprimento</div><div class="kpi-value">${pct}%</div><div class="kpi-sub">da meta</div></div>
  <div class="kpi"><div class="kpi-label">Pontos de exibição</div><div class="kpi-value">${locais.length}</div><div class="kpi-sub">locais ativos</div></div>
</div>

<div style="margin:20px 0">
  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span>Progresso da meta</span><span>${pct}%</span></div>
  <div class="bar"><div class="bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
</div>

<h2>Pontos de exibição</h2>
<table><thead><tr><th>Local</th><th>Cidade</th></tr></thead><tbody>
${locais.map(l => `<tr><td>${l.nome}</td><td>${l.cidade ?? "—"}</td></tr>`).join("")}
</tbody></table>

<h2>Exibições por dia (top 30)</h2>
<table><thead><tr><th>Data</th><th>Inserções</th><th>Tempo (s)</th></tr></thead><tbody>
${Array.from(porDia.entries()).sort().slice(-30).map(([d, v]) => `<tr><td>${d}</td><td>${v.plays}</td><td>${v.duracao}</td></tr>`).join("") || "<tr><td colspan='3' style='text-align:center;color:#888'>Sem exibições registradas ainda.</td></tr>"}
</tbody></table>

<div class="footer">
  Relatório gerado por ${branding?.nome ?? "Three Digital Mídia"}${branding?.site ? ` · ${branding.site}` : ""}<br>
  Dados de proof-of-play coletados diretamente dos players (Xibo CMS). Pode haver atraso de algumas horas na sincronização.
</div>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
