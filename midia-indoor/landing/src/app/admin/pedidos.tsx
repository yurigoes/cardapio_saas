"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Calculator, Check, X, Settings, RefreshCw } from "lucide-react";
import { notify, confirmModal, promptModal } from "@/components/Notify";
import { brl } from "@/lib/simulador";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface PedidoAdm {
  id: string; orientacao: string; insercoes_dia: number; segundos: number; dias: number;
  valor: string; observacao: string | null; status: string; motivo_recusa: string | null;
  campanha_id: string | null; criado_em: string; empresa: string; anunciante: string; conta_id: string;
}

interface Cfg {
  preco_segundo: number; min_insercoes_dia: number; min_dias: number; min_valor: number;
  duracoes_seg: number[]; ativo: boolean;
}

export function Pedidos({ token }: { token: string }) {
  const [pedidos, setPedidos] = useState<PedidoAdm[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [verConfig, setVerConfig] = useState(false);
  const [filtro, setFiltro] = useState<"pendente" | "todos">("pendente");

  const carregar = useCallback(async () => {
    setLoading(true);
    const q = filtro === "todos" ? "" : "?status=pendente";
    const [p, c] = await Promise.all([
      aapi(token, `/api/admin/pedidos${q}`).then(r => r.json()),
      aapi(token, "/api/admin/simulador-config").then(r => r.json()),
    ]);
    if (p.ok) setPedidos(p.pedidos);
    if (c.ok) setCfg(c.config);
    setLoading(false);
  }, [token, filtro]);
  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar(p: PedidoAdm) {
    const nome = await promptModal(`Nome da campanha (${p.empresa}):`, `Inserções ${p.orientacao} — ${p.empresa}`);
    if (nome === null) return;
    const ok = await confirmModal(`Aprovar e criar campanha?\nTodos os totens ${p.orientacao} ativos serão alvo (ajustável depois em Campanhas).`);
    if (!ok) return;
    const r = await aapi(token, "/api/admin/pedidos", { method: "POST", body: JSON.stringify({ acao: "aprovar", id: p.id, nome: nome || undefined }) });
    const d = await r.json();
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify(`Campanha criada (${d.locais} totem(ns)). Disponível em Campanhas pra arte + pagamento.`, "success");
    carregar();
  }

  async function recusar(p: PedidoAdm) {
    const motivo = await promptModal("Motivo da recusa (o anunciante vê):", "");
    if (motivo === null) return;
    const r = await aapi(token, "/api/admin/pedidos", { method: "POST", body: JSON.stringify({ acao: "recusar", id: p.id, motivo: motivo || undefined }) });
    const d = await r.json();
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Pedido recusado", "success");
    carregar();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">🛒 Pedidos de inserções</h2>
          <p className="text-xs text-slate-400">Orçamentos enviados pelo simulador do painel. Aprove pra virar campanha (a pagar).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFiltro(filtro === "pendente" ? "todos" : "pendente")} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5">
            {filtro === "pendente" ? "Ver todos" : "Só pendentes"}
          </button>
          <button onClick={carregar} className="rounded-lg border border-white/15 p-1.5 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setVerConfig(true)} className="flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-light hover:bg-brand/20">
            <Settings className="h-3.5 w-3.5" /> Config do simulador
          </button>
        </div>
      </div>

      {cfg && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
          Preço atual: <strong className="text-slate-200">{brl(cfg.preco_segundo)}/segundo de inserção</strong> ·
          mín {cfg.min_insercoes_dia} ins/dia · mín {cfg.min_dias} dias · pedido mín {brl(cfg.min_valor)} ·
          durações {cfg.duracoes_seg.join("/")}s · {cfg.ativo ? "ativo" : "DESATIVADO"}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
      ) : pedidos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-500">Nenhum pedido {filtro === "pendente" ? "pendente" : ""}.</p>
      ) : (
        <div className="space-y-2">
          {pedidos.map(p => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.empresa} <span className="text-xs font-normal text-slate-500">· {p.anunciante}</span></p>
                  <p className="text-sm text-slate-300">
                    <span className="capitalize">{p.orientacao}</span> · {p.insercoes_dia} ins/dia · {p.segundos}s · {p.dias} dias
                    · <strong className="text-brand-light">{brl(Number(p.valor))}</strong>
                  </p>
                  <p className="text-[11px] text-slate-500">{new Date(p.criado_em).toLocaleString("pt-BR")} · {(p.insercoes_dia * p.dias).toLocaleString("pt-BR")} inserções totais</p>
                  {p.observacao && <p className="mt-1 text-xs text-slate-400">Obs: {p.observacao}</p>}
                  {p.status === "recusado" && p.motivo_recusa && <p className="mt-1 text-xs text-red-300/80">Recusa: {p.motivo_recusa}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {p.status === "pendente" ? (
                    <div className="flex gap-2">
                      <button onClick={() => aprovar(p)} className="flex items-center gap-1 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10"><Check className="h-3.5 w-3.5" /> Aprovar</button>
                      <button onClick={() => recusar(p)} className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><X className="h-3.5 w-3.5" /> Recusar</button>
                    </div>
                  ) : (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${p.status === "convertido" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                      {p.status === "convertido" ? "Virou campanha" : "Recusado"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {verConfig && cfg && <ConfigModal token={token} cfg={cfg} onClose={() => setVerConfig(false)} onSaved={() => { setVerConfig(false); carregar(); }} />}
    </div>
  );
}

function ConfigModal({ token, cfg, onClose, onSaved }: { token: string; cfg: Cfg; onClose: () => void; onSaved: () => void }) {
  const [precoSeg, setPrecoSeg] = useState(String(cfg.preco_segundo));
  const [minIns, setMinIns] = useState(String(cfg.min_insercoes_dia));
  const [minDias, setMinDias] = useState(String(cfg.min_dias));
  const [minValor, setMinValor] = useState(String(cfg.min_valor));
  const [duracoes, setDuracoes] = useState(cfg.duracoes_seg.join(","));
  const [ativo, setAtivo] = useState(cfg.ativo);
  const [busy, setBusy] = useState(false);

  // preview do valor de uma inserção de 10s
  const precoNum = parseFloat(precoSeg) || 0;

  async function salvar() {
    setBusy(true);
    const r = await aapi(token, "/api/admin/simulador-config", {
      method: "PUT",
      body: JSON.stringify({
        preco_segundo: precoNum, min_insercoes_dia: parseInt(minIns) || 1,
        min_dias: parseInt(minDias) || 1, min_valor: parseFloat(minValor) || 0,
        duracoes_seg: duracoes, ativo,
      }),
    });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Config salva", "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121c] p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold"><Calculator className="h-4 w-4" /> Config do simulador</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <Campo label="Preço por SEGUNDO de inserção (R$)">
            <input type="number" step="0.001" value={precoSeg} onChange={e => setPrecoSeg(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
            <p className="mt-1 text-[11px] text-slate-500">Uma inserção de 10s/dia custaria {brl(precoNum * 10)} por dia.</p>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Mín. inserções/dia"><input type="number" value={minIns} onChange={e => setMinIns(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></Campo>
            <Campo label="Mín. dias"><input type="number" value={minDias} onChange={e => setMinDias(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></Campo>
          </div>
          <Campo label="Valor mínimo do pedido (R$)"><input type="number" step="10" value={minValor} onChange={e => setMinValor(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></Campo>
          <Campo label="Durações disponíveis (segundos, separados por vírgula)"><input value={duracoes} onChange={e => setDuracoes(e.target.value)} placeholder="10,15,20,30" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></Campo>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="h-4 w-4 accent-brand" />
            Simulador ativo no painel do anunciante
          </label>
        </div>
        <button onClick={salvar} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs text-slate-400">{label}</label>{children}</div>;
}
