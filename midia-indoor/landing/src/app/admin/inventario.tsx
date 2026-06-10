"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Plus, X, QrCode, Trash2, Printer, RefreshCw, Monitor, Copy, Pencil, Camera, FileText } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";
import { KitsInventario } from "./kits-inventario";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

interface ItemInv {
  id: string; tipo: string; nome: string; mac: string | null; serial: string | null;
  fabricante: string | null; modelo: string | null; local_id: string | null; local_nome: string | null;
  xibo_display_id: number | null; qr_token: string; ip_local: string | null;
  valor: string | null; nota_fiscal: string | null; observacao: string | null; ativo: boolean;
  rustdesk_id: string | null; rustdesk_senha: string | null;
  monitor_modelo: string | null; monitor_serial: string | null;
  monitor_resolucao: string | null; monitor_polegadas: number | null;
  resolucao: string | null; polegadas: number | null;
  vinculado_a_id: string | null; vinculado_nome: string | null; vinculado_tipo: string | null;
}
interface LocalSimples { id: string; nome: string; cidade?: string | null; }

/** URL de imagem QR gerada server-side por api.qrserver.com (sem dependencia JS).
 *  Funciona sempre, mesmo se CSP bloquear scripts externos. */
function qrImgUrl(data: string, sizePx = 300): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&data=${encodeURIComponent(data)}&format=png&margin=4`;
}

export function Inventario({ token }: { token: string }) {
  const [itens, setItens] = useState<ItemInv[]>([]);
  const [locais, setLocais] = useState<LocalSimples[]>([]);
  const [novo, setNovo] = useState(false);
  const [verQR, setVerQR] = useState<ItemInv | null>(null);
  const [editar, setEditar] = useState<ItemInv | null>(null);
  const [verPrint, setVerPrint] = useState<ItemInv | null>(null);
  const [vincular, setVincular] = useState<ItemInv | null>(null);
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<"itens" | "kits" | "os">("itens");
  const [desvincularItem, setDesvincularItem] = useState<ItemInv | null>(null);
  const [moverItem, setMoverItem] = useState<ItemInv | null>(null);

  function toggleSel(id: string) {
    setSelecionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function imprimirSelecionados() {
    const ids = selecionados.size > 0 ? Array.from(selecionados).join(",") : null;
    const url = ids ? `/admin/etiquetas?ids=${ids}` : `/admin/etiquetas?all=1`;
    window.open(url, "_blank");
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      aapi(token, "/api/admin/inventario").then(r => r.json()),
      aapi(token, "/api/admin/locais").then(r => r.json()),
    ]);
    if (r1.ok) setItens(r1.itens);
    if (r2.ok) setLocais(r2.locais);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const filtrados = itens.filter(i => !filtro || (i.nome + " " + (i.mac ?? "") + " " + (i.serial ?? "") + " " + (i.local_nome ?? "") + " " + i.qr_token).toLowerCase().includes(filtro.toLowerCase()));

  async function excluir(item: ItemInv) {
    if (!await confirmModal(`Excluir "${item.nome}" do inventário?`)) return;
    await aapi(token, `/api/admin/inventario?id=${item.id}`, { method: "DELETE" });
    notify("Item excluído", "success");
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📦 Inventário ({itens.length})</h2>
          <p className="text-xs text-slate-400">Controle de equipamentos: TVs, boxes, totens, cabos, suportes. Cada item gera um QR code pra colar fisicamente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar nome / MAC / serial..." className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none" />
          <button onClick={load} disabled={loading} className="rounded-lg border border-white/15 p-1.5 hover:bg-white/5 disabled:opacity-50" title="Atualizar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <button onClick={imprimirSelecionados} className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20" title="Imprime etiquetas em PDF (8 por pagina A4)">
            <FileText className="h-3.5 w-3.5" /> {selecionados.size > 0 ? `Etiquetas (${selecionados.size})` : "Todas etiquetas"}
          </button>
          <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand-dark"><Plus className="h-4 w-4" /> Novo item</button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-white/10">
        <button onClick={() => setAba("itens")} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${aba === "itens" ? "border-brand text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
          📦 Itens ({itens.length})
        </button>
        <button onClick={() => setAba("kits")} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${aba === "kits" ? "border-brand text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
          🔗 Pares (Box ↔ TV)
        </button>
        <button onClick={() => setAba("os")} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${aba === "os" ? "border-brand text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
          🚨 Chamados (OS)
        </button>
      </div>

      {aba === "kits" && <ParesInventario token={token} itens={itens} locais={locais} onChange={load} onDesvincular={setDesvincularItem} onMover={setMoverItem} />}
      {aba === "os" && <OSInventario token={token} />}

      {aba === "itens" && (
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-400">
            <tr>
              <th className="w-10 p-3">
                <input type="checkbox" checked={selecionados.size === filtrados.length && filtrados.length > 0}
                  onChange={e => setSelecionados(e.target.checked ? new Set(filtrados.map(i => i.id)) : new Set())}
                  className="h-4 w-4 cursor-pointer accent-brand" />
              </th>
              <th className="p-3">Tipo</th><th className="p-3">Nome</th><th className="p-3">MAC</th><th className="p-3">Serial</th><th className="p-3">Local</th><th className="p-3">Xibo</th><th className="p-3">RustDesk</th><th className="p-3">Vínculo</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(i => (
              <tr key={i.id} className={`border-t border-white/5 ${!i.ativo ? "opacity-50" : ""} ${selecionados.has(i.id) ? "bg-cyan-500/5" : ""}`}>
                <td className="p-3">
                  <input type="checkbox" checked={selecionados.has(i.id)} onChange={() => toggleSel(i.id)} className="h-4 w-4 cursor-pointer accent-brand" />
                </td>
                <td className="p-3 text-xs uppercase">{i.tipo}</td>
                <td className="p-3"><div className="font-medium">{i.nome}</div><div className="text-[10px] font-mono text-slate-500">{i.qr_token}</div></td>
                <td className="p-3 font-mono text-xs">{i.mac ?? "—"}</td>
                <td className="p-3 font-mono text-xs">{i.serial ?? "—"}</td>
                <td className="p-3 text-xs">{i.local_nome ?? "—"}</td>
                <td className="p-3 text-xs">{i.xibo_display_id ? `#${i.xibo_display_id}` : "—"}</td>
                <td className="p-3 text-xs font-mono">{i.rustdesk_id ?? "—"}</td>
                <td className="p-3 text-xs">
                  {i.vinculado_nome ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300" title={`Vinculado a ${i.vinculado_tipo}`}>
                      🔗 {i.vinculado_nome}
                    </span>
                  ) : (i.tipo === "box" || i.tipo === "tv" || i.tipo === "tv-box") ? (
                    <button onClick={() => setVincular(i)} className="text-[11px] text-slate-500 underline hover:text-slate-300">vincular</button>
                  ) : "—"}
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    {(i.tipo === "box" || i.tipo === "tv" || i.tipo === "tv-box") && i.mac && (
                      <button onClick={() => setVerPrint(i)} className="rounded border border-cyan-400/40 p-1.5 text-cyan-300 hover:bg-cyan-500/10" title="Ver print da tela"><Camera className="h-3.5 w-3.5" /></button>
                    )}
                    {i.rustdesk_id && <RemotoBtn id={i.rustdesk_id} senha={i.rustdesk_senha} />}
                    <button onClick={() => setEditar(i)} className="rounded border border-amber-400/40 p-1.5 text-amber-300 hover:bg-amber-500/10" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setVerQR(i)} className="rounded border border-brand/40 p-1.5 text-brand-light hover:bg-brand/10" title="QR Code"><QrCode className="h-3.5 w-3.5" /></button>
                    <button onClick={() => excluir(i)} className="rounded border border-red-500/30 p-1.5 text-red-300 hover:bg-red-500/10" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtrados.length && <tr><td colSpan={10} className="p-6 text-center text-slate-500">Nenhum item.</td></tr>}
          </tbody>
        </table>
      </div>
      )}

      {novo && <NovoItemModal token={token} locais={locais} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {verQR && <QRCodeModal item={verQR} onClose={() => setVerQR(null)} />}
      {editar && <EditarItemModal token={token} item={editar} locais={locais} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load(); }} />}
      {verPrint && <PrintModal token={token} item={verPrint} onClose={() => setVerPrint(null)} />}
      {vincular && <VincularModal token={token} item={vincular} todos={itens} onClose={() => setVincular(null)} onSaved={() => { setVincular(null); load(); }} />}
      {desvincularItem && <DesvincularModal token={token} item={desvincularItem} onClose={() => setDesvincularItem(null)} onSaved={() => { setDesvincularItem(null); load(); }} />}
      {moverItem && <MoverLocalModal token={token} item={moverItem} locais={locais} onClose={() => setMoverItem(null)} onSaved={() => { setMoverItem(null); load(); }} />}
    </div>
  );
}

// ════════ Aba: Pares (kits Box ↔ TV) ════════
function ParesInventario({ token, itens, locais, onChange, onDesvincular, onMover }: { token: string; itens: ItemInv[]; locais: LocalSimples[]; onChange: () => void; onDesvincular: (i: ItemInv) => void; onMover: (i: ItemInv) => void }) {
  void token; void onChange;
  // Cada par = lado A (qualquer) + lado B (vinculado_a_id). Pega só pares com vínculo bidirecional.
  const pares: Array<{ a: ItemInv; b: ItemInv | null }> = [];
  const visto = new Set<string>();
  for (const a of itens) {
    if (visto.has(a.id)) continue;
    if (!a.vinculado_a_id) continue;
    const b = itens.find(x => x.id === a.vinculado_a_id);
    visto.add(a.id);
    if (b) visto.add(b.id);
    pares.push({ a, b: b ?? null });
  }
  if (!pares.length) return <p className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">Nenhum par vinculado ainda. Vincule um Box a uma TV/Monitor na aba “Itens” → coluna “Vínculo”.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {pares.map(({ a, b }) => (
        <div key={a.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-emerald-300">
            🔗 KIT · <code className="text-[10px]">{a.local_nome ?? "estoque"}</code>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ItemMini i={a} />
            <ItemMini i={b} fallback="(item órfão)" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => onMover(a)} className="flex-1 rounded-lg border border-white/15 py-1.5 text-xs hover:bg-white/10">📍 Mover local</button>
            <button onClick={() => onDesvincular(a)} className="flex-1 rounded-lg border border-red-500/30 py-1.5 text-xs text-red-300 hover:bg-red-500/10">🔌 Desvincular</button>
          </div>
          {locais.length === 0 && <p className="mt-2 text-[10px] text-amber-400">⚠ Sem locais cadastrados</p>}
        </div>
      ))}
    </div>
  );
}
function ItemMini({ i, fallback }: { i: ItemInv | null; fallback?: string }) {
  if (!i) return <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-300">{fallback ?? "—"}</div>;
  return (
    <div className="rounded-lg bg-white/5 p-2 text-xs">
      <p className="font-medium">
        {i.tipo === "box" ? "📦" : i.tipo === "tv" ? "📺" : i.tipo === "totem" ? "🗼" : "📎"} {i.nome}
      </p>
      {i.modelo && <p className="text-slate-500">{i.modelo}</p>}
      {i.mac && <p className="font-mono text-[10px] text-slate-500">{i.mac}</p>}
    </div>
  );
}

// ════════ Aba: Ordens de Servico ════════
interface OsRow {
  id: string; status: string; motivo: string; descricao: string; criada_em: string;
  item_nome: string; item_tipo: string; local_nome: string | null;
  veredito: string | null; em_garantia: boolean; aberta_por_nome: string | null; atribuido_a: string | null;
  prazo_sla: string | null;
}
function OSInventario({ token }: { token: string }) {
  const [status, setStatus] = useState<"aberto" | "em_analise" | "resolvido" | "descartado" | "todos">("aberto");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroLocal, setFiltroLocal] = useState("");
  const [lista, setLista] = useState<OsRow[]>([]);
  const [verOs, setVerOs] = useState<OsRow | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [dash, setDash] = useState<{ totais: { status: string; n: number; custo_total: number }[]; por_motivo: { motivo: string; n: number; custo_total: number }[]; por_tipo: { tipo: string; n: number; custo_total: number }[]; top_itens: { nome: string; tipo: string; n_os: number; custo_total: number }[]; atrasadas: number; sla_medio_horas: number } | null>(null);
  const load = useCallback(async () => {
    setCarregando(true);
    const [r, dr] = await Promise.all([
      aapi(token, `/api/admin/inventario/os?status=${status}`).then(r => r.json()),
      aapi(token, "/api/admin/inventario/os/dashboard").then(r => r.json()).catch(() => null),
    ]);
    setCarregando(false);
    if (r.ok) setLista(r.ordens);
    if (dr?.ok) setDash(dr);
  }, [token, status]);
  useEffect(() => { load(); }, [load]);
  const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // Listas unicas de tecnicos/locais pros filtros (da propria lista atual)
  const tecnicosUnicos = Array.from(new Set(lista.map(l => l.atribuido_a).filter((x): x is string => Boolean(x)))).sort();
  const locaisUnicos = Array.from(new Set(lista.map(l => l.local_nome).filter((x): x is string => Boolean(x)))).sort();
  const listaFiltrada = lista.filter(o => {
    if (filtroTecnico && o.atribuido_a !== filtroTecnico) return false;
    if (filtroLocal && o.local_nome !== filtroLocal) return false;
    if (filtroTexto) {
      const t = filtroTexto.toLowerCase();
      const blob = `${o.item_nome} ${o.descricao} ${o.atribuido_a ?? ""} ${o.aberta_por_nome ?? ""} ${o.local_nome ?? ""}`.toLowerCase();
      if (!blob.includes(t)) return false;
    }
    return true;
  });
  return (
    <div>
      {/* DASHBOARD FINANCEIRO */}
      {dash && (
        <>
        <div className="mb-2 flex justify-end">
          <button onClick={async () => {
            const r = await aapi(token, "/api/admin/inventario/os/dashboard.pdf");
            const html = await r.text();
            const blob = new Blob([html], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }} className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/5">
            <FileText className="h-3.5 w-3.5" /> Exportar dashboard
          </button>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Total custo resolvido</p>
            <p className="mt-1 text-xl font-black text-emerald-300">{brl(dash.totais.filter(t => t.status === "resolvido").reduce((s,t) => s + t.custo_total, 0))}</p>
            <p className="text-[10px] text-slate-500">SLA médio: {dash.sla_medio_horas}h</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-red-300">Atrasadas (SLA)</p>
            <p className="mt-1 text-xl font-black text-red-300">{dash.atrasadas}</p>
            <p className="text-[10px] text-slate-500">passaram do prazo</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Por tipo (top)</p>
            <div className="mt-1 space-y-0.5">
              {dash.por_tipo.slice(0, 3).map(p => (
                <p key={p.tipo} className="text-xs"><span className="font-semibold">{p.tipo}</span>: {p.n} OS · {brl(p.custo_total)}</p>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Top itens com mais OS</p>
            <div className="mt-1 space-y-0.5">
              {dash.top_itens.slice(0, 3).map((p, i) => (
                <p key={i} className="truncate text-xs"><span className="font-semibold">{p.nome}</span>: {p.n_os}× · {brl(p.custo_total)}</p>
              ))}
            </div>
          </div>
        </div>
        </>
      )}

      <div className="mb-3 flex gap-1">
        {(["aberto","em_analise","resolvido","descartado","todos"] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-lg px-3 py-1 text-xs ${status === s ? "bg-brand text-white" : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}>
            {s === "aberto" ? "🔴 Aberto" : s === "em_analise" ? "🟡 Análise" : s === "resolvido" ? "🟢 Resolvido" : s === "descartado" ? "⚫ Descartado" : "Todos"}
          </button>
        ))}
        <button onClick={load} disabled={carregando} className="ml-2 rounded-lg border border-white/15 p-1.5 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /></button>
      </div>

      {/* FILTROS */}
      <div className="mb-3 grid gap-2 md:grid-cols-3">
        <input type="text" value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)} placeholder="🔍 Busca livre (item, descrição, técnico…)"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none" />
        <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none">
          <option value="">👷 Todos os técnicos</option>
          {tecnicosUnicos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filtroLocal} onChange={e => setFiltroLocal(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none">
          <option value="">📍 Todos os locais</option>
          {locaisUnicos.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {(filtroTexto || filtroTecnico || filtroLocal) && (
        <p className="mb-2 text-xs text-slate-400">
          Mostrando {listaFiltrada.length} de {lista.length} OS
          <button onClick={() => { setFiltroTexto(""); setFiltroTecnico(""); setFiltroLocal(""); }} className="ml-2 text-brand-light underline">limpar filtros</button>
        </p>
      )}
      {listaFiltrada.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">{lista.length === 0 ? `Nenhuma OS ${status === "todos" ? "" : `em ${status}`}.` : "Nenhuma OS bate com os filtros."}</p>
      ) : (
        <div className="space-y-2">
          {listaFiltrada.map(o => {
            const slaMs = o.prazo_sla ? new Date(o.prazo_sla).getTime() : null;
            const atrasada = slaMs && slaMs < Date.now() && (o.status === "aberto" || o.status === "em_analise");
            const slaRest = slaMs ? Math.round((slaMs - Date.now()) / 3600_000) : null;
            return (
              <button key={o.id} onClick={() => setVerOs(o)} className={`w-full rounded-xl border p-3 text-left hover:bg-white/5 ${atrasada ? "border-red-500/50 bg-red-500/10" : o.status === "aberto" ? "border-red-500/30 bg-red-500/5" : o.status === "em_analise" ? "border-amber-500/30 bg-amber-500/5" : o.status === "resolvido" ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-white/[0.02] opacity-70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {o.motivo === "problema" ? "🚨" : o.motivo === "manutencao" ? "🔧" : "📎"} {o.item_nome}
                      {o.em_garantia && <span className="ml-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300">🛡 garantia</span>}
                      {atrasada && <span className="ml-1 rounded bg-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-200">⚠ atrasada</span>}
                      {o.atribuido_a && <span className="ml-1 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-300">👷 {o.atribuido_a}</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {o.local_nome ? `📍 ${o.local_nome} · ` : ""}
                      {new Date(o.criada_em).toLocaleDateString("pt-BR")}
                      {o.aberta_por_nome ? ` · por ${o.aberta_por_nome}` : ""}
                      {slaRest != null && !atrasada && (o.status === "aberto" || o.status === "em_analise") && (
                        <span className={`ml-2 ${slaRest < 8 ? "text-amber-300" : "text-slate-500"}`}>· {slaRest < 24 ? `${slaRest}h` : `${Math.round(slaRest/24)}d`} restantes</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-300 line-clamp-2">{o.descricao}</p>
                  </div>
                  <div className="text-right">
                    <code className="text-[10px] text-slate-500">{o.id.slice(0, 8)}</code>
                    {o.veredito && <p className="mt-1 text-[10px] text-emerald-300">→ {o.veredito}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {verOs && <OSDetalheModal token={token} osId={verOs.id} onClose={() => setVerOs(null)} onSaved={() => { setVerOs(null); load(); }} />}
    </div>
  );
}

function OSDetalheModal({ token, osId, onClose, onSaved }: { token: string; osId: string; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<{ os: Record<string, unknown>; movimentos: Record<string, unknown>[]; candidatos_substituicao: { id: string; nome: string; modelo: string | null }[] } | null>(null);
  const [veredito, setVeredito] = useState<"consertado" | "queimado" | "sem_problema" | "substituir" | "descartar">("consertado");
  const [obs, setObs] = useState("");
  const [custoReais, setCustoReais] = useState("");
  const [subst, setSubst] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [tecnicosDisp, setTecnicosDisp] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(() => { aapi(token, `/api/admin/inventario/os/${osId}`).then(r => r.json()).then(x => x.ok && setD(x)); }, [token, osId]);
  useEffect(() => { reload(); aapi(token, "/api/admin/inventario/os/tecnicos").then(r => r.json()).then(x => x.ok && setTecnicosDisp(x.tecnicos)); }, [reload, token]);
  async function uploadFoto(f: File) {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch(`/api/admin/inventario/os/${osId}/foto`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const x = await r.json();
    if (fotoRef.current) fotoRef.current.value = "";
    if (!x.ok) { notify(x.error || "Erro upload", "error"); return; }
    notify(`Foto adicionada (${x.total}/5)`, "success"); reload();
  }
  async function removerFoto(idx: number) {
    const r = await aapi(token, `/api/admin/inventario/os/${osId}/foto?idx=${idx}`, { method: "DELETE" });
    const x = await r.json();
    if (!x.ok) { notify(x.error || "Erro", "error"); return; }
    reload();
  }
  async function atribuir() {
    if (!tecnico.trim()) return;
    const r = await aapi(token, `/api/admin/inventario/os/${osId}`, { method: "PATCH", body: JSON.stringify({ atribuido_a: tecnico.trim() }) });
    const x = await r.json();
    if (!x.ok) { notify(x.error || "Erro", "error"); return; }
    notify("Atribuído!", "success"); reload();
  }
  async function resolver() {
    setBusy(true);
    const custo = custoReais ? Math.round(Number(custoReais.replace(",", ".")) * 100) : undefined;
    const r = await aapi(token, `/api/admin/inventario/os/${osId}/resolver`, { method: "POST", body: JSON.stringify({ veredito, veredito_obs: obs, custo_centavos: custo, substituido_por_id: veredito === "substituir" ? subst : undefined }) });
    const x = await r.json(); setBusy(false);
    if (!x.ok) { notify(x.error || "Erro", "error"); return; }
    notify("OS resolvida!", "success"); onSaved();
  }
  async function patch(status: string) {
    await aapi(token, `/api/admin/inventario/os/${osId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    onSaved();
  }
  if (!d) return null;
  const o = d.os as { id: string; item_nome: string; item_tipo: string; item_modelo?: string; item_mac?: string; local_nome?: string; motivo: string; descricao: string; status: string; veredito?: string; aberta_por_nome?: string; criada_em: string; em_garantia: boolean; fotos?: string[]; atribuido_a?: string; prazo_sla?: string };
  const fotos: string[] = Array.isArray(o.fotos) ? o.fotos : [];
  const slaMs = o.prazo_sla ? new Date(o.prazo_sla).getTime() : null;
  const atrasada = slaMs && slaMs < Date.now() && (o.status === "aberto" || o.status === "em_analise");
  const slaRestante = slaMs ? Math.round((slaMs - Date.now()) / 3600_000) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#12121c]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-5">
          <div>
            <h3 className="font-bold">OS #{o.id.slice(0, 8)} · {o.item_nome}</h3>
            <p className="text-xs text-slate-400">{o.item_tipo}{o.item_modelo ? ` · ${o.item_modelo}` : ""}{o.local_nome ? ` · 📍 ${o.local_nome}` : ""}</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="mb-3 grid grid-cols-4 gap-2 text-xs">
            <div><p className="text-slate-500">Status</p><p className="font-medium">{o.status}</p></div>
            <div><p className="text-slate-500">Motivo</p><p className="font-medium">{o.motivo}</p></div>
            <div><p className="text-slate-500">Aberta</p><p className="font-medium">{new Date(o.criada_em).toLocaleDateString("pt-BR")}</p></div>
            <div>
              <p className="text-slate-500">SLA</p>
              {slaMs ? (
                <p className={`font-medium ${atrasada ? "text-red-300" : slaRestante! < 8 ? "text-amber-300" : "text-emerald-300"}`}>
                  {atrasada ? `⚠ ${Math.abs(slaRestante!)}h atrasada` : slaRestante! < 24 ? `${slaRestante}h restantes` : `${Math.round(slaRestante! / 24)}d restantes`}
                </p>
              ) : <p className="text-slate-500">—</p>}
            </div>
          </div>
          {o.em_garantia && <p className="mb-3 rounded bg-blue-500/15 px-2 py-1 text-xs text-blue-300">🛡 Item em garantia</p>}
          {atrasada && <p className="mb-3 rounded bg-red-500/15 px-2 py-1 text-xs text-red-300">⚠ Esta OS passou do prazo de SLA</p>}

          {/* TECNICO ATRIBUIDO */}
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="mb-1 text-xs text-slate-400">Técnico responsável</p>
            <div className="flex gap-2">
              <input value={tecnico || (o.atribuido_a ?? "")} onChange={e => setTecnico(e.target.value)} placeholder="Nome do técnico" list="lista-tecnicos"
                className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm" />
              <datalist id="lista-tecnicos">{tecnicosDisp.map(t => <option key={t} value={t} />)}</datalist>
              <button onClick={atribuir} className="rounded border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-brand-light hover:bg-brand/20">Atribuir</button>
            </div>
            {o.atribuido_a && <p className="mt-1 text-[11px] text-slate-500">Atual: {o.atribuido_a}</p>}
          </div>
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-slate-400">Descrição</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{o.descricao}</p>
            {o.aberta_por_nome && <p className="mt-2 text-[11px] text-slate-500">— por {o.aberta_por_nome}</p>}
          </div>

          {/* FOTOS */}
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400">📷 Fotos ({fotos.length}/5)</p>
              {fotos.length < 5 && (
                <label className="cursor-pointer rounded border border-cyan-500/30 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/10">
                  📤 Adicionar foto
                  <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFoto(f); }} />
                </label>
              )}
            </div>
            {fotos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((src, i) => (
                  <div key={i} className="group relative">
                    <a href={src} target="_blank" rel="noreferrer">
                      <img src={src} alt={`Foto ${i+1}`} className="h-24 w-full rounded object-cover" />
                    </a>
                    <button onClick={() => removerFoto(i)} className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] text-white group-hover:flex">×</button>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-slate-500">Sem fotos. Clique no botão acima pra adicionar.</p>}
          </div>
          {o.status !== "resolvido" && o.status !== "descartado" && (
            <>
              <div className="mb-3 flex gap-2">
                {o.status === "aberto" && <button onClick={() => patch("em_analise")} className="rounded-lg border border-amber-500/30 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/10">→ Em análise</button>}
                <button onClick={() => patch("descartado")} className="rounded-lg border border-white/15 px-3 py-1 text-xs text-slate-400 hover:bg-white/10">Descartar (sem ação)</button>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="mb-2 text-xs font-semibold text-emerald-300">Resolver com veredito</p>
                <select value={veredito} onChange={e => setVeredito(e.target.value as typeof veredito)} className="mb-2 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm">
                  <option value="consertado">✓ Consertado (volta a ativo)</option>
                  <option value="sem_problema">✓ Sem problema (volta a ativo)</option>
                  <option value="queimado">💀 Queimado (marca como fora de uso)</option>
                  <option value="substituir">🔄 Substituir por outro item</option>
                  <option value="descartar">🗑 Descartar (não usar mais)</option>
                </select>
                {veredito === "substituir" && (
                  <select value={subst} onChange={e => setSubst(e.target.value)} className="mb-2 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm">
                    <option value="">— escolha um item livre —</option>
                    {d.candidatos_substituicao.map(c => <option key={c.id} value={c.id}>{c.nome}{c.modelo ? ` · ${c.modelo}` : ""}</option>)}
                  </select>
                )}
                <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" rows={2}
                  className="mb-2 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-sm" />
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Custo R$:</span>
                  <input type="text" value={custoReais} onChange={e => setCustoReais(e.target.value)} placeholder="0,00" inputMode="decimal"
                    className="w-24 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm" />
                  <span className="text-[10px] text-slate-500">(opcional — entra no dashboard)</span>
                </div>
                <button onClick={resolver} disabled={busy || (veredito === "substituir" && !subst)} className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? "Resolvendo…" : "Resolver OS"}
                </button>
              </div>
            </>
          )}
          {d.movimentos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-slate-400">Histórico do item</p>
              <div className="space-y-1 text-xs">
                {d.movimentos.slice(0, 10).map((m, i) => {
                  const mm = m as { tipo: string; criado_em: string; autor_nome?: string };
                  return (
                    <div key={i} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1">
                      <span className="text-slate-500">{new Date(mm.criado_em).toLocaleString("pt-BR")}</span>
                      <span className="font-medium">{mm.tipo}</span>
                      {mm.autor_nome && <span className="text-slate-400">· {mm.autor_nome}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════ Modal: Desvincular ════════
function DesvincularModal({ token, item, onClose, onSaved }: { token: string; item: ItemInv; onClose: () => void; onSaved: () => void }) {
  const [motivo, setMotivo] = useState<"substituicao" | "manutencao" | "problema" | "outro">("substituicao");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  async function enviar() {
    setBusy(true);
    const r = await aapi(token, `/api/admin/inventario/${item.id}/desvincular`, { method: "POST", body: JSON.stringify({ motivo, descricao: desc }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify(d.osId ? `Desvinculado · OS aberta #${d.osId.slice(0,8)}` : "Desvinculado", "success");
    onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">Desvincular: {item.nome}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <label className="mb-1 block text-xs text-slate-400">Motivo</label>
        <select value={motivo} onChange={e => setMotivo(e.target.value as typeof motivo)} className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <option value="substituicao">🔄 Substituição planejada</option>
          <option value="manutencao">🔧 Manutenção preventiva</option>
          <option value="problema">🚨 Problema (abre OS automática)</option>
          <option value="outro">📎 Outro</option>
        </select>
        <label className="mb-1 block text-xs text-slate-400">Descrição{motivo === "problema" ? " *" : " (opcional)"}</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
        {motivo === "problema" && <p className="mb-2 text-[11px] text-amber-300">⚠ Vai abrir uma OS automaticamente.</p>}
        <button onClick={enviar} disabled={busy || (motivo === "problema" && desc.trim().length < 10)} className="w-full rounded-xl bg-red-600 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Desvinculando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

// ════════ Modal: Mover de local ════════
function MoverLocalModal({ token, item, locais, onClose, onSaved }: { token: string; item: ItemInv; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [novoLocal, setNovoLocal] = useState(item.local_id ?? "");
  const [moverXibo, setMoverXibo] = useState(true);
  const [busy, setBusy] = useState(false);
  async function enviar() {
    setBusy(true);
    const r = await aapi(token, `/api/admin/inventario/${item.id}/mover-local`, { method: "POST", body: JSON.stringify({ local_id: novoLocal || null, mover_display_xibo: moverXibo }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Movido!", "success"); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">Mover {item.nome}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <p className="mb-2 text-xs text-slate-400">De: <strong>{item.local_nome ?? "estoque"}</strong></p>
        <label className="mb-1 block text-xs text-slate-400">Para</label>
        <select value={novoLocal} onChange={e => setNovoLocal(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <option value="">— estoque (sem local) —</option>
          {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
        </select>
        {item.xibo_display_id && (
          <label className="mb-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={moverXibo} onChange={e => setMoverXibo(e.target.checked)} className="h-4 w-4 accent-brand" />
            <span>Também mover display Xibo #{item.xibo_display_id} entre display groups</span>
          </label>
        )}
        <button onClick={enviar} disabled={busy} className="w-full rounded-xl bg-brand py-2 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? "Movendo…" : "Mover"}
        </button>
      </div>
    </div>
  );
}

function VincularModal({ token, item, todos, onClose, onSaved }: { token: string; item: ItemInv; todos: ItemInv[]; onClose: () => void; onSaved: () => void }) {
  // Candidatos: tipo oposto + sem vínculo
  // 'box' e 'tv-box' são equivalentes (ambos são players Android com display interno opcional)
  const ehBox = item.tipo === "box" || item.tipo === "tv-box";
  const ehTv  = item.tipo === "tv";
  const alvo: "tv" | "box" | null = ehBox ? "tv" : ehTv ? "box" : null;
  const tiposAlvo = alvo === "box" ? ["box", "tv-box"] : alvo === "tv" ? ["tv"] : [];
  const candidatos = alvo ? todos.filter(t => tiposAlvo.includes(t.tipo) && !t.vinculado_a_id && t.id !== item.id) : [];
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  async function salvar() {
    if (!selId) { notify("Escolha um item pra vincular", "error"); return; }
    setBusy(true);
    const r = await aapi(token, "/api/admin/inventario", { method: "PATCH", body: JSON.stringify({ id: item.id, vinculado_a_id: selId }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Vinculado!", "success"); onSaved();
  }
  async function desvincular() {
    setBusy(true);
    const r = await aapi(token, "/api/admin/inventario", { method: "PATCH", body: JSON.stringify({ id: item.id, vinculado_a_id: "" }) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Desvinculado", "success"); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">Vincular {item.nome}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        {item.vinculado_nome ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-sm">Atualmente vinculado a: <strong>{item.vinculado_nome}</strong></p>
            <p className="text-xs text-slate-400 capitalize">{item.vinculado_tipo}</p>
            <button onClick={desvincular} disabled={busy} className="mt-3 w-full rounded-lg border border-red-500/30 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Desvincular"}
            </button>
          </div>
        ) : !alvo ? (
          <p className="text-sm text-slate-400">Vínculo 1:1 só faz sentido entre <strong>Box ↔ TV/Monitor</strong>. Este item é {LABELS_TIPO[item.tipo] ?? item.tipo}.</p>
        ) : candidatos.length === 0 ? (
          <p className="text-sm text-slate-400">
            Não há {alvo === "tv" ? "TVs/Monitores" : "Boxes"} disponíveis sem vínculo.
            <br />Cadastre primeiro um {alvo === "tv" ? "monitor" : "box"} no inventário.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-sm text-slate-300">Vincular a:</label>
            <select value={selId} onChange={e => setSelId(e.target.value)} className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
              <option value="">— escolha —</option>
              {candidatos.map(c => <option key={c.id} value={c.id}>{c.nome}{c.modelo ? ` · ${c.modelo}` : ""}</option>)}
            </select>
            <button onClick={salvar} disabled={busy || !selId} className="w-full rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Vincular"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PrintModal({ token, item, onClose }: { token: string; item: ItemInv; onClose: () => void }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [solicitando, setSolicitando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true); setErro(""); setImgUrl(null);
    try {
      const r = await fetch(`/api/admin/inventario/screenshot?id=${item.id}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const txt = await r.text();
        setErro(txt || "Sem print disponível");
        setCarregando(false);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setImgUrl(url);
      setTakenAt(r.headers.get("X-Taken-At"));
    } catch (e) { setErro(String(e)); }
    setCarregando(false);
  }

  async function solicitarPrint() {
    setSolicitando(true);
    const r = await aapi(token, "/api/admin/inventario/screenshot-request", { method: "POST", body: JSON.stringify({ id: item.id }) });
    const d = await r.json();
    if (!d.ok) { notify(d.error || "Erro ao solicitar", "error"); setSolicitando(false); return; }
    notify(d.ja_pendente ? "Já tem solicitação pendente — o agente vai capturar em até 15s" : "Print solicitado — o agente vai capturar em até 15s", "info");
    // Poll a cada 5s por até 60s pra mostrar quando chegar
    let tentativas = 0;
    const lastTaken = takenAt;
    const poll = setInterval(async () => {
      tentativas++;
      try {
        const r2 = await fetch(`/api/admin/inventario/screenshot?id=${item.id}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } });
        const novaTaken = r2.headers.get("X-Taken-At");
        if (r2.ok && novaTaken && novaTaken !== lastTaken) {
          clearInterval(poll); setSolicitando(false);
          await carregar();
          notify("Print atualizado!", "success");
          return;
        }
      } catch {}
      if (tentativas >= 12) { clearInterval(poll); setSolicitando(false); notify("Sem resposta do agente. Confirme que ele está rodando (-WatchRequests).", "error"); }
    }, 5000);
  }

  useEffect(() => { carregar(); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">📷 Print · {item.nome}</h3>
            {takenAt && <p className="text-xs text-slate-400">Capturado {new Date(takenAt).toLocaleString("pt-BR")}</p>}
            {!takenAt && imgUrl === null && !carregando && <p className="text-xs text-amber-300">Sem print disponível ainda</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={solicitarPrint} disabled={solicitando} title="Solicitar novo print" className="flex items-center gap-1 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-cyan-700/30 hover:shadow-cyan-700/50 disabled:opacity-50">
              {solicitando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} {solicitando ? "Aguardando agente..." : "Tirar print agora"}
            </button>
            <button onClick={carregar} disabled={carregando} title="Recarregar" className="rounded-lg border border-white/15 p-2 hover:bg-white/5"><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /></button>
            <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
          </div>
        </div>

        {carregando ? (
          <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-500" /></div>
        ) : erro ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
            <p className="text-sm font-semibold text-amber-200">Sem print disponível ainda</p>
            <p className="mt-2 text-xs text-slate-400">{erro}</p>
            <div className="mt-4 rounded-lg bg-black/30 p-3 text-left text-xs">
              <p className="mb-2 font-semibold text-cyan-300">📥 Como capturar pela primeira vez:</p>
              <p className="mb-2 text-slate-300">No PC da rede local (mesma LAN das TVs), rode o agente em modo WATCH:</p>
              <code className="block rounded bg-black/40 p-2 font-mono text-emerald-300">A:\Sistemas\xibo-mod\tirar-prints.ps1 -WatchRequests</code>
              <p className="mt-2 text-slate-400">Aí volta aqui e clica em <strong>"Tirar print agora"</strong> no topo — o agente captura em 15s.</p>
            </div>
          </div>
        ) : imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt="Screenshot" className="mx-auto max-h-[70vh] rounded-xl border border-white/10" />
        ) : null}
      </div>
    </div>
  );
}

function EditarItemModal({ token, item, locais, onClose, onSaved }: { token: string; item: ItemInv; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(item.nome);
  const [mac, setMac] = useState(item.mac ?? "");
  const [serial, setSerial] = useState(item.serial ?? "");
  const [fabricante, setFabricante] = useState(item.fabricante ?? "");
  const [modelo, setModelo] = useState(item.modelo ?? "");
  const [localId, setLocalId] = useState(item.local_id ?? "");
  const [xiboDisplayId, setXiboDisplayId] = useState(item.xibo_display_id?.toString() ?? "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/inventario", { method: "PATCH", body: JSON.stringify({
      id: item.id, nome, mac, serial, fabricante, modelo,
      local_id: localId || "",
      xibo_display_id: xiboDisplayId ? Number(xiboDisplayId) : undefined,
    })});
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify("Item atualizado", "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#12121c]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-5"><h3 className="font-bold">Editar item · {item.qr_token}</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        <div className="overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" value={nome} onChange={setNome} />
          <Field label="MAC" value={mac} onChange={v => setMac(v.toUpperCase())} mono />
          <Field label="Serial" value={serial} onChange={setSerial} mono />
          <Field label="Display Xibo ID" value={xiboDisplayId} onChange={setXiboDisplayId} type="number" placeholder="ex: 12" />
          <Field label="Fabricante" value={fabricante} onChange={setFabricante} />
          <Field label="Modelo" value={modelo} onChange={setModelo} />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-slate-400">Local</label>
          <select value={localId} onChange={e => setLocalId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
            <option value="">— sem local —</option>
            {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
          </select>
        </div>
        {err && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
        <button onClick={salvar} disabled={busy || !nome} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar alterações
        </button>
        </div>
      </div>
    </div>
  );
}

function NovoItemModal({ token, locais, onClose, onSaved }: { token: string; locais: LocalSimples[]; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<"box" | "tv" | "totem" | "cabo" | "fonte" | "suporte" | "outro">("box");
  const [nome, setNome] = useState("");
  const [mac, setMac] = useState("");
  const [serial, setSerial] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [localId, setLocalId] = useState("");
  const [valor, setValor] = useState("");
  const [nf, setNf] = useState("");
  const [obs, setObs] = useState("");
  // TV/Monitor (direto, sem prefixo)
  const [resolucao, setResolucao] = useState("");
  const [polegadas, setPolegadas] = useState("");
  // Totem (tem TV + box num só)
  const [monitorModelo, setMonitorModelo] = useState("");
  const [monitorPolegadas, setMonitorPolegadas] = useState("");
  // Vincular já no cadastro?
  const [vinculadoA, setVinculadoA] = useState("");
  // Lista de candidatos pra vínculo (carrega quando tipo = tv ou box)
  const [candidatos, setCandidatos] = useState<Array<{ id: string; nome: string; tipo: string; vinculado_a_id: string | null }>>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  // Sugere nome auto quando troca tipo
  useEffect(() => {
    if (!nome) {
      const labels: Record<string, string> = { box: "Box-", tv: "TV-", totem: "Totem-", cabo: "Cabo-", fonte: "Fonte-", suporte: "Suporte-", outro: "Item-" };
      setNome(labels[tipo] ?? "");
    }
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega candidatos pra vincular (tipo oposto: tv carrega boxes, box carrega tvs)
  useEffect(() => {
    const alvo = tipo === "tv" ? "box" : tipo === "box" ? "tv" : null;
    if (!alvo) { setCandidatos([]); return; }
    aapi(token, "/api/admin/inventario").then(r => r.json()).then(d => {
      if (!d.ok) return;
      const livres = (d.itens as Array<{ id: string; nome: string; tipo: string; vinculado_a_id: string | null }>)
        .filter(i => i.tipo === alvo && !i.vinculado_a_id);
      setCandidatos(livres);
    });
  }, [tipo, token]);

  async function salvar() {
    setBusy(true); setErr("");
    const r = await aapi(token, "/api/admin/inventario", { method: "POST", body: JSON.stringify({
      tipo, nome,
      mac: mac || undefined,
      serial: serial || undefined,
      fabricante: fabricante || undefined,
      modelo: modelo || undefined,
      local_id: localId || undefined,
      valor: valor ? Number(valor) : undefined,
      nota_fiscal: nf || undefined,
      observacao: obs || undefined,
      // TV/Monitor — usa campos diretos
      resolucao: tipo === "tv" ? (resolucao || undefined) : undefined,
      polegadas: tipo === "tv" ? (polegadas ? Number(polegadas) : undefined) : undefined,
      // Totem — usa monitor_* (totem = box+tv integrados)
      monitor_modelo: tipo === "totem" ? (monitorModelo || undefined) : undefined,
      monitor_polegadas: tipo === "totem" ? (monitorPolegadas ? Number(monitorPolegadas) : undefined) : undefined,
      vinculado_a_id: vinculadoA || undefined,
    })});
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify(`${LABELS_TIPO[tipo]} criado · QR: ${d.qr_token}${vinculadoA ? " · vinculado" : ""}`, "success");
    onSaved();
  }

  const isBox = tipo === "box";
  const isTv  = tipo === "tv";
  const isTotem = tipo === "totem";
  const labelVincular = isBox ? "Vincular já a uma TV/Monitor?" : isTv ? "Vincular já a um Box?" : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#12121c]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-5">
          <h3 className="font-bold">Novo item no inventário</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="overflow-y-auto p-5">

        {/* TIPO em destaque (linha cheia) */}
        <label className="mb-1 block text-xs text-slate-400">Tipo de equipamento</label>
        <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)} className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
          <option value="box">📦 Android Box (TV box que roda o player)</option>
          <option value="tv">📺 TV / Monitor (display em si)</option>
          <option value="totem">🗼 Totem (box + monitor integrados)</option>
          <option value="cabo">🔌 Cabo HDMI</option>
          <option value="fonte">⚡ Fonte</option>
          <option value="suporte">🔩 Suporte / Bracket</option>
          <option value="outro">📎 Outro</option>
        </select>

        <Field label="Nome / identificação *" value={nome} onChange={setNome} placeholder={isBox ? "ex: Box-001" : isTv ? "ex: TV-Samsung-43-001" : "ex: Item-001"} />

        {/* CAMPOS POR TIPO */}
        {(isBox || isTotem) && (
          <div className="mb-3 mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-cyan-300">📦 Dados do TV Box</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="MAC Address" value={mac} onChange={v => setMac(v.toUpperCase())} placeholder="AA:BB:CC:DD:EE:FF" mono />
              <Field label="Serial do box" value={serial} onChange={setSerial} mono />
              <Field label="Fabricante" value={fabricante} onChange={setFabricante} placeholder="ex: Rockchip" />
              <Field label="Modelo" value={modelo} onChange={setModelo} placeholder="ex: RK322x" />
            </div>
          </div>
        )}

        {(isTv || isTotem) && (
          <div className="mb-3 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-300">📺 Dados da TV / Monitor</p>
            <div className="grid grid-cols-2 gap-3">
              {isTv && <Field label="Marca" value={fabricante} onChange={setFabricante} placeholder="ex: Samsung" />}
              {isTv && <Field label="Modelo" value={modelo} onChange={setModelo} placeholder="ex: UN43J5290" />}
              {isTv && <Field label="Serial" value={serial} onChange={setSerial} mono />}
              {isTotem && <Field label="Modelo do monitor" value={monitorModelo} onChange={setMonitorModelo} placeholder="ex: Samsung UN43J5290" />}
              <Field label="Resolução" value={isTotem ? "" : resolucao} onChange={isTotem ? () => {} : setResolucao} placeholder="1920x1080" mono />
              <Field label="Polegadas" value={isTotem ? monitorPolegadas : polegadas} onChange={isTotem ? setMonitorPolegadas : setPolegadas} type="number" placeholder="43" />
            </div>
          </div>
        )}

        {!isBox && !isTv && !isTotem && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca/Fabricante" value={fabricante} onChange={setFabricante} />
            <Field label="Modelo" value={modelo} onChange={setModelo} />
            <Field label="Serial" value={serial} onChange={setSerial} mono />
            <Field label="MAC (se aplicável)" value={mac} onChange={v => setMac(v.toUpperCase())} mono />
          </div>
        )}

        {/* VÍNCULO TV ↔ BOX */}
        {labelVincular && (
          <div className="mb-3 mt-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <label className="mb-1 block text-xs text-emerald-300">{labelVincular}</label>
            <select value={vinculadoA} onChange={e => setVinculadoA(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
              <option value="">— não vincular agora —</option>
              {candidatos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <p className="mt-1 text-[10px] text-slate-500">
              Mostra só {isBox ? "TVs/Monitores" : "Boxes"} ainda não pareadas. Você também pode vincular depois no card.
            </p>
          </div>
        )}

        {/* LOCAL + VALOR + NF */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-slate-400">Local (opcional — onde está fisicamente)</label>
            <select value={localId} onChange={e => setLocalId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
              <option value="">— estoque (sem local) —</option>
              {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
            </select>
          </div>
          <Field label="Valor (R$)" value={valor} onChange={setValor} type="number" placeholder="0.00" />
          <Field label="Nota fiscal" value={nf} onChange={setNf} placeholder="000123" />
        </div>

        <Field label="Observação" value={obs} onChange={setObs} />

        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
        <button onClick={salvar} disabled={busy || !nome} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Adicionar ao inventário
        </button>
        </div>
      </div>
    </div>
  );
}

const LABELS_TIPO: Record<string, string> = {
  box: "Android Box", tv: "TV/Monitor", totem: "Totem",
  cabo: "Cabo", fonte: "Fonte", suporte: "Suporte", outro: "Item",
};

function Field({ label, value, onChange, placeholder = "", type = "text", mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none ${mono ? "font-mono" : ""}`} />
    </div>
  );
}

function RemotoBtn({ id, senha }: { id: string; senha: string | null }) {
  function abrir() {
    // RustDesk schema: rustdesk://connection/new/connect?id=XXXX&password=YYYY
    // No Windows com client instalado, abre direto. Senao mostra modal.
    const url = `rustdesk://connection/new/connect?id=${id}${senha ? `&password=${encodeURIComponent(senha)}` : ""}`;
    window.location.href = url;
  }
  function copiar() {
    navigator.clipboard.writeText(id);
    notify(`ID ${id} copiado`, "success");
  }
  return (
    <>
      <button onClick={abrir} className="rounded border border-emerald-500/40 p-1.5 text-emerald-300 hover:bg-emerald-500/10" title={`Acessar via RustDesk (ID ${id}${senha ? `, senha ${senha}` : ""})`}>
        <Monitor className="h-3.5 w-3.5" />
      </button>
      <button onClick={copiar} className="rounded border border-slate-500/40 p-1.5 text-slate-300 hover:bg-slate-500/10" title="Copiar ID RustDesk">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

function QRCodeModal({ item, onClose }: { item: ItemInv; onClose: () => void }) {
  const [origem, setOrigem] = useState("");
  useEffect(() => { if (typeof window !== "undefined") setOrigem(window.location.origin); }, []);
  const targetUrl = origem ? `${origem}/q/${item.qr_token}` : "";
  const qrUrl = origem ? qrImgUrl(targetUrl, 320) : "";

  function imprimir() {
    if (!origem) { notify("Aguarde a página carregar", "error"); return; }
    const url = `${origem}/q/${item.qr_token}`;
    // Usa imagem direto da API (sem depender de lib JS no popup)
    const qrSrc = qrImgUrl(url, 400);

    const html = `<!DOCTYPE html><html><head><title>Etiqueta · ${escapeHtml(item.nome)}</title>
<meta charset="utf-8">
<style>
  @page { size: 90mm 60mm; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0; color: #1a1a2e; background: white; }
  .etiqueta { width: 90mm; height: 60mm; padding: 5mm; display: flex; gap: 4mm; align-items: center; }
  .info { flex: 1; min-width: 0; }
  .info .marca { font-size: 6pt; letter-spacing: 1.2pt; color: #888; margin: 0 0 2mm 0; font-weight: 600; }
  .info h1 { margin: 0 0 1.5mm 0; font-size: 13pt; color: #7c3aed; font-weight: 800; line-height: 1.1; word-wrap: break-word; }
  .info p { margin: 0.8mm 0; font-size: 8pt; color: #333; line-height: 1.2; }
  .info code { font-family: ui-monospace, monospace; font-size: 7.5pt; background: #f0f0f0; padding: 0.5mm 1mm; border-radius: 1pt; }
  .info .escaneie { font-size: 6pt; color: #999; margin-top: 2mm; }
  .qr { width: 35mm; height: 35mm; flex-shrink: 0; }
  .qr img { width: 100%; height: 100%; display: block; }
  .btn-print { position: fixed; top: 10px; right: 10px; background: #7c3aed; color: white; border: 0; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  @media print { .btn-print { display: none; } }
</style></head>
<body>
  <button class="btn-print" onclick="window.print()">Imprimir agora</button>
  <div class="etiqueta">
    <div class="info">
      <p class="marca">THREE DIGITAL · INVENTÁRIO</p>
      <h1>${escapeHtml(item.nome)}</h1>
      <p><b>${escapeHtml(item.tipo.toUpperCase())}</b> · <code>${item.qr_token}</code></p>
      ${item.mac ? `<p>MAC: <code>${escapeHtml(item.mac)}</code></p>` : ""}
      ${item.serial ? `<p>SN: <code>${escapeHtml(item.serial)}</code></p>` : ""}
      ${item.modelo ? `<p>${escapeHtml((item.fabricante ?? "") + " " + item.modelo).trim()}</p>` : ""}
      <p class="escaneie">↗ Escaneie pra ver detalhes</p>
    </div>
    <div class="qr"><img src="${qrSrc}" alt="QR" crossorigin="anonymous"></div>
  </div>
  <script>
    // Espera a imagem do QR carregar e dispara o print automaticamente
    const img = document.querySelector('.qr img');
    if (img.complete) setTimeout(() => window.print(), 200);
    else img.addEventListener('load', () => setTimeout(() => window.print(), 200));
    img.addEventListener('error', () => alert('Falha ao carregar QR. Clica em Imprimir agora.'));
  </script>
</body></html>`;

    const w = window.open("", "_blank", "width=720,height=480");
    if (!w) {
      notify("Popup bloqueado! Permita popups deste site no navegador e tente de novo.", "error");
      return;
    }
    w.document.open(); w.document.write(html); w.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">QR · {item.nome}</h3><button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-white p-3">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt={`QR ${item.qr_token}`} width={300} height={300} className="block" />
            ) : (
              <div className="flex h-[300px] w-[300px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            )}
          </div>
          <p className="text-center text-xs text-slate-400">URL: <code className="text-brand-light">{origem}/q/{item.qr_token}</code></p>
          <button onClick={imprimir} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
            <Printer className="h-4 w-4" /> Imprimir etiqueta (90×60mm)
          </button>
          <p className="text-center text-[10px] text-slate-500">Cole a etiqueta impressa no equipamento. Ao escanear, abre a página de detalhes pra técnicos.</p>
        </div>
      </div>
    </div>
  );
}
