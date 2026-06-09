"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, Trash2, Box, Calendar, DollarSign, TrendingDown, MapPin } from "lucide-react";
import { notify, confirmModal } from "@/components/Notify";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ItemInv { id: string; nome: string; tipo: string; modelo: string | null; }
interface LocalSimples { id: string; nome: string; cidade?: string | null; }

interface KitItem {
  id?: string; inventario_id: string | null; descricao: string;
  quantidade: number; valor_unit: number; comprado_em: string | null;
}
interface Kit {
  id: string; nome: string; local_id: string | null; local_nome: string | null;
  vida_util_anos: number; observacao: string | null; ativo: boolean;
  itens: KitItem[]; valor_total: number; dep_mensal: number; meses_uso: number; valor_residual: number;
}

export function KitsInventario({ token, itensDisponiveis, locais }: { token: string; itensDisponiveis: ItemInv[]; locais: LocalSimples[] }) {
  const [kits, setKits] = useState<Kit[]>([]);
  const [loading, setLoading] = useState(false);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Kit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await aapi(token, "/api/admin/inventario/kits").then(r => r.json());
    if (r.ok) setKits(r.kits);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function excluir(k: Kit) {
    if (!await confirmModal(`Excluir kit "${k.nome}"?`)) return;
    await aapi(token, `/api/admin/inventario/kits?id=${k.id}`, { method: "DELETE" });
    notify("Kit excluído", "success");
    load();
  }

  const totalGeral = kits.reduce((s, k) => s + k.valor_total, 0);
  const residualGeral = kits.reduce((s, k) => s + k.valor_residual, 0);
  const depMensalTotal = kits.reduce((s, k) => s + k.dep_mensal, 0);

  return (
    <div>
      {/* KPIs */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KitKpi label="Kits cadastrados" valor={kits.length.toString()} cor="cyan" icon={<Box className="h-5 w-5" />} />
        <KitKpi label="Investimento total" valor={brl(totalGeral)} cor="violet" icon={<DollarSign className="h-5 w-5" />} />
        <KitKpi label="Valor residual atual" valor={brl(residualGeral)} cor="emerald" icon={<TrendingDown className="h-5 w-5" />} />
        <KitKpi label="Depreciação/mês" valor={brl(depMensalTotal)} cor="amber" icon={<Calendar className="h-5 w-5" />} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">Agrupe TV + Box + cabos + suporte como um <strong>kit</strong> (ex: totem). Veja valor total, depreciação por tempo e custo mensal de operação.</p>
        <button onClick={() => setNovo(true)} className="flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand-dark">
          <Plus className="h-4 w-4" /> Novo kit
        </button>
      </div>

      {loading && !kits.length ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : !kits.length ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
          <Box className="mx-auto mb-3 h-10 w-10 text-slate-500" />
          <p className="font-semibold text-slate-300">Nenhum kit cadastrado</p>
          <p className="mt-1 text-sm text-slate-500">Crie kits pra controlar totens completos com valor + depreciação.</p>
          <button onClick={() => setNovo(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold hover:bg-brand-dark">
            <Plus className="h-4 w-4" /> Criar primeiro kit
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {kits.map(k => (
            <div key={k.id} className={`group rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md transition hover:border-brand/30 hover:bg-white/[0.07] ${!k.ativo ? "opacity-50" : ""}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold">{k.nome}</h3>
                  {k.local_nome && <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3 w-3" /> {k.local_nome}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditar(k)} className="rounded border border-amber-400/40 p-1 text-amber-300 hover:bg-amber-500/10" title="Editar"><Plus className="h-3 w-3 rotate-45" /></button>
                  <button onClick={() => excluir(k)} className="rounded border border-red-500/30 p-1 text-red-300 hover:bg-red-500/10" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>

              <ul className="mb-3 space-y-1 text-xs">
                {k.itens.map(it => (
                  <li key={it.id} className="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                    <span className="truncate"><span className="text-slate-400">{it.quantidade}×</span> {it.descricao}</span>
                    <span className="font-mono text-slate-400">{brl(Number(it.valor_unit) * it.quantidade)}</span>
                  </li>
                ))}
                {!k.itens.length && <li className="text-slate-500 italic">Sem componentes</li>}
              </ul>

              <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-xs">
                <div>
                  <p className="text-slate-500">Valor total</p>
                  <p className="font-bold text-violet-300">{brl(k.valor_total)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Residual ({k.meses_uso}m uso)</p>
                  <p className="font-bold text-emerald-300">{brl(k.valor_residual)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Depreciação/mês</p>
                  <p className="font-bold text-amber-300">{brl(k.dep_mensal)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {novo && <KitModal token={token} itensDisponiveis={itensDisponiveis} locais={locais} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {editar && <KitModal token={token} itensDisponiveis={itensDisponiveis} locais={locais} kit={editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); load(); }} />}
    </div>
  );
}

function KitKpi({ label, valor, cor, icon }: { label: string; valor: string; cor: "violet" | "emerald" | "amber" | "cyan"; icon: React.ReactNode }) {
  const cores = {
    cyan:    { bg: "from-cyan-500/15 to-cyan-500/5",       border: "border-cyan-500/25",    text: "text-cyan-300",    icon: "bg-cyan-500/20" },
    violet:  { bg: "from-violet-500/15 to-violet-500/5",   border: "border-violet-500/25",  text: "text-violet-300",  icon: "bg-violet-500/20" },
    emerald: { bg: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/25", text: "text-emerald-300", icon: "bg-emerald-500/20" },
    amber:   { bg: "from-amber-500/15 to-amber-500/5",     border: "border-amber-500/25",   text: "text-amber-300",   icon: "bg-amber-500/20" },
  }[cor];
  return (
    <div className={`rounded-2xl border ${cores.border} bg-gradient-to-br ${cores.bg} p-4 backdrop-blur-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className={`mt-1 text-xl font-black ${cores.text}`}>{valor}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cores.icon}`}>{icon}</div>
      </div>
    </div>
  );
}

function KitModal({ token, itensDisponiveis, locais, kit, onClose, onSaved }: { token: string; itensDisponiveis: ItemInv[]; locais: LocalSimples[]; kit?: Kit; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(kit?.nome ?? "");
  const [localId, setLocalId] = useState(kit?.local_id ?? "");
  const [vidaUtil, setVidaUtil] = useState((kit?.vida_util_anos ?? 5).toString());
  const [obs, setObs] = useState(kit?.observacao ?? "");
  const [itens, setItens] = useState<KitItem[]>(kit?.itens ?? []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  function addItem() {
    setItens(s => [...s, { inventario_id: null, descricao: "", quantidade: 1, valor_unit: 0, comprado_em: null }]);
  }
  function delItem(i: number) { setItens(s => s.filter((_, idx) => idx !== i)); }
  function updItem(i: number, p: Partial<KitItem>) { setItens(s => s.map((it, idx) => idx === i ? { ...it, ...p } : it)); }

  async function salvar() {
    if (!nome.trim()) { setErr("Nome obrigatório"); return; }
    setBusy(true); setErr("");
    const body = {
      ...(kit ? { id: kit.id } : {}),
      nome, local_id: localId || null, vida_util_anos: Number(vidaUtil) || 5,
      observacao: obs || undefined,
      itens: itens.filter(i => i.descricao.trim()).map(i => ({
        descricao: i.descricao, quantidade: i.quantidade, valor_unit: i.valor_unit,
        inventario_id: i.inventario_id || null, comprado_em: i.comprado_em || null,
      })),
    };
    const r = await aapi(token, "/api/admin/inventario/kits", { method: kit ? "PATCH" : "POST", body: JSON.stringify(body) });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { setErr(d.error || "Erro"); return; }
    notify(kit ? "Kit atualizado" : "Kit criado", "success");
    onSaved();
  }

  const valorTotal = itens.reduce((s, i) => s + Number(i.valor_unit) * Number(i.quantidade), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#12121c]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-5">
          <h3 className="font-bold">{kit ? "Editar kit" : "Novo kit"} (ex: Totem completo)</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldK label="Nome do kit *" value={nome} onChange={setNome} placeholder="ex: Totem Atacadão Loja 1" />
            <div>
              <label className="mb-1 block text-xs text-slate-400">Local</label>
              <select value={localId} onChange={e => setLocalId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none">
                <option value="">— sem local —</option>
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` · ${l.cidade}` : ""}</option>)}
              </select>
            </div>
            <FieldK label="Vida útil (anos)" value={vidaUtil} onChange={setVidaUtil} type="number" placeholder="5" />
            <FieldK label="Observação" value={obs} onChange={setObs} />
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-semibold">Componentes do kit</h4>
              <button onClick={addItem} className="flex items-center gap-1 rounded-lg bg-brand/20 px-3 py-1 text-xs font-semibold text-brand-light hover:bg-brand/30">
                <Plus className="h-3 w-3" /> Adicionar componente
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs text-slate-400">
                  <tr>
                    <th className="p-2">Descrição *</th>
                    <th className="p-2 w-24">Item do inv.</th>
                    <th className="p-2 w-16">Qtd</th>
                    <th className="p-2 w-32">Valor unit</th>
                    <th className="p-2 w-32">Comprado em</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="p-1">
                        <input value={it.descricao} onChange={e => updItem(i, { descricao: e.target.value })} placeholder="ex: TV Samsung 43''"
                          className="w-full rounded border border-white/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-brand/50" />
                      </td>
                      <td className="p-1">
                        <select value={it.inventario_id ?? ""} onChange={e => updItem(i, { inventario_id: e.target.value || null })}
                          className="w-full rounded border border-white/10 bg-white/5 px-1 py-1 text-xs outline-none">
                          <option value="">—</option>
                          {itensDisponiveis.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </td>
                      <td className="p-1">
                        <input type="number" min={1} value={it.quantidade} onChange={e => updItem(i, { quantidade: Number(e.target.value) || 1 })}
                          className="w-full rounded border border-white/10 bg-transparent px-2 py-1 text-center text-sm outline-none" />
                      </td>
                      <td className="p-1">
                        <input type="number" step="0.01" value={it.valor_unit} onChange={e => updItem(i, { valor_unit: Number(e.target.value) || 0 })}
                          className="w-full rounded border border-white/10 bg-transparent px-2 py-1 text-right text-sm outline-none" />
                      </td>
                      <td className="p-1">
                        <input type="date" value={it.comprado_em ?? ""} onChange={e => updItem(i, { comprado_em: e.target.value || null })}
                          className="w-full rounded border border-white/10 bg-transparent px-2 py-1 text-xs outline-none" />
                      </td>
                      <td className="p-1 text-center">
                        <button onClick={() => delItem(i)} className="rounded p-1 text-red-300 hover:bg-red-500/10"><X className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  ))}
                  {!itens.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500 italic">Clique em "Adicionar componente" pra começar</td></tr>}
                </tbody>
                {itens.length > 0 && (
                  <tfoot className="bg-white/5 border-t border-white/10">
                    <tr>
                      <td colSpan={3} className="p-2 text-right font-semibold text-slate-400">Valor total do kit:</td>
                      <td className="p-2 text-right font-bold text-violet-300">{brl(valorTotal)}</td>
                      <td colSpan={2} className="p-2 text-xs text-slate-500">
                        Dep/mês: {brl(valorTotal / (Number(vidaUtil) * 12 || 60))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {err && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
          <button onClick={salvar} disabled={busy || !nome} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold hover:bg-brand-dark disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {kit ? "Salvar alterações" : "Criar kit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldK({ label, value, onChange, placeholder = "", type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
    </div>
  );
}
