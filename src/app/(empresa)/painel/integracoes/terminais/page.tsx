"use client";

/**
 * /painel/integracoes/terminais
 * Cliente cadastra terminais de pagamento (Cielo, futuramente Stone/PagSeguro etc).
 */
import { useEffect, useState, useCallback } from "react";
import {
  CreditCard, Plus, Trash2, Power, Loader2, X, Save, ExternalLink,
  AlertCircle, Check,
} from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface DriverMeta {
  id: string; nome: string; descricao: string; banco: string;
  tipo: string; docs_url?: string;
  campos_cred: Array<{
    chave: string; label: string; tipo: "text" | "password" | "select";
    opcoes?: Array<{ valor: string; label: string }>;
    placeholder?: string; obrigatorio?: boolean;
  }>;
  metodos_suportados: string[];
}

interface Terminal {
  id: string; nome: string; driver: string; ativo: boolean;
  padrao_pdv: boolean; padrao_totem: boolean;
  credenciais: Record<string, string>;
  config: Record<string, unknown>;
  observacao: string | null;
  created_at: string;
}

export default function TerminaisPage() {
  const [list, setList]       = useState<Terminal[]>([]);
  const [drivers, setDrivers] = useState<DriverMeta[]>([]);
  const [editing, setEditing] = useState<Terminal | "novo" | null>(null);
  const [loading, setLoading] = useState(true);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.all([
        fetch("/api/painel/integracoes/terminais", { headers: auth() }).then(r => r.json()),
        fetch("/api/pub/terminal/drivers").then(r => r.json()),
      ]);
      if (t.success) setList(t.data ?? []);
      if (d.success) setDrivers(d.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleAtivo(t: Terminal) {
    await fetch(`/api/painel/integracoes/terminais/${t.id}`, {
      method: "PATCH", headers: auth(),
      body: JSON.stringify({ ativo: !t.ativo }),
    });
    carregar();
  }

  async function remover(t: Terminal) {
    if (!await confirmar({ titulo: `Remover "${t.nome}"?`, mensagem: "O terminal será desativado.", perigo: true })) return;
    await fetch(`/api/painel/integracoes/terminais/${t.id}`, { method: "DELETE", headers: auth() });
    carregar();
  }

  async function marcarPadrao(t: Terminal, tipo: "pdv" | "totem") {
    await fetch(`/api/painel/integracoes/terminais/${t.id}`, {
      method: "PATCH", headers: auth(),
      body: JSON.stringify({ [tipo === "pdv" ? "padrao_pdv" : "padrao_totem"]: true }),
    });
    carregar();
  }

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Terminais de pagamento</h1>
            <p className="text-xs text-slate-400">
              Configure suas maquininhas (PDV) e meios de pagamento do totem
            </p>
          </div>
        </div>
        <button onClick={() => setEditing("novo")}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400">
          <Plus className="h-4 w-4" /> Novo terminal
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-10 text-center">
          <CreditCard className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Nenhum terminal cadastrado ainda.</p>
          <p className="mt-1 text-xs text-slate-500">
            Cadastre Cielo, Stone, PagSeguro e outros pra começar a receber pagamentos.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map(t => {
            const meta = drivers.find(d => d.id === t.driver);
            return (
              <div key={t.id} className={`rounded-2xl border p-4 ${
                t.ativo ? "border-white/10 bg-white/5" : "border-white/10 bg-white/[0.02] opacity-60"
              }`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                    <CreditCard className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-white">{t.nome}</h3>
                      {t.padrao_pdv && (
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">PADRÃO PDV</span>
                      )}
                      {t.padrao_totem && (
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">PADRÃO TOTEM</span>
                      )}
                      {!t.ativo && (
                        <span className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">DESATIVADO</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {meta?.banco ?? "—"} · {meta?.nome ?? t.driver}
                    </p>
                    {t.observacao && (
                      <p className="text-[11px] text-slate-500 italic mt-1">{t.observacao}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {meta?.metodos_suportados.map(m => (
                        <span key={m} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 uppercase">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {!t.padrao_pdv && (
                      <button onClick={() => marcarPadrao(t, "pdv")}
                        title="Marcar como padrão PDV"
                        className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5">
                        Padrão PDV
                      </button>
                    )}
                    {!t.padrao_totem && (
                      <button onClick={() => marcarPadrao(t, "totem")}
                        title="Marcar como padrão Totem"
                        className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/5">
                        Padrão Totem
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setEditing(t)}
                      className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5">
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleAtivo(t)}
                      className={`rounded-lg border p-2 ${
                        t.ativo ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                                : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                      }`}>
                      <Power className="h-4 w-4" />
                    </button>
                    <button onClick={() => remover(t)}
                      className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditorModal
          terminal={editing === "novo" ? null : editing}
          drivers={drivers}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); carregar(); }}
        />
      )}
    </div>
  );
}

function EditorModal({ terminal, drivers, onClose, onSuccess }: {
  terminal: Terminal | null;
  drivers: DriverMeta[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nome, setNome]         = useState(terminal?.nome ?? "");
  const [driver, setDriver]     = useState(terminal?.driver ?? drivers[0]?.id ?? "");
  const [cred, setCred]         = useState<Record<string, string>>(terminal?.credenciais ?? {});
  const [obs, setObs]           = useState(terminal?.observacao ?? "");
  const [padraoPdv, setPp]      = useState(terminal?.padrao_pdv ?? false);
  const [padraoTotem, setPt]    = useState(terminal?.padrao_totem ?? false);
  const [busy, setBusy]         = useState(false);

  const driverMeta = drivers.find(d => d.id === driver);

  async function salvar() {
    if (!nome || !driver) { await alertar({ titulo: "Nome e driver obrigatórios", tipo: "alerta" }); return; }
    if (driverMeta) {
      for (const campo of driverMeta.campos_cred) {
        if (campo.obrigatorio && !cred[campo.chave]) {
          await alertar({ titulo: `${campo.label} é obrigatório`, tipo: "alerta" });
          return;
        }
      }
    }
    setBusy(true);
    try {
      const url    = terminal ? `/api/painel/integracoes/terminais/${terminal.id}` : "/api/painel/integracoes/terminais";
      const method = terminal ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome, driver, credenciais: cred, observacao: obs || undefined,
          padrao_pdv: padraoPdv, padrao_totem: padraoTotem,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      onSuccess();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="text-base font-bold text-white">
            {terminal ? "Editar terminal" : "Novo terminal"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Apelido do terminal</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Caixa 1, Totem da entrada"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Driver / Banco</label>
            <select value={driver} onChange={e => { setDriver(e.target.value); setCred({}); }}
              disabled={!!terminal}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.banco} — {d.nome}</option>
              ))}
            </select>
            {driverMeta && (
              <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
                <p className="text-xs text-blue-200 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{driverMeta.descricao}</span>
                </p>
                {driverMeta.docs_url && (
                  <a href={driverMeta.docs_url} target="_blank" rel="noopener"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-300 hover:underline">
                    Documentação <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Campos de credencial dinâmicos */}
          {driverMeta?.campos_cred.map(campo => (
            <div key={campo.chave}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                {campo.label}{campo.obrigatorio && <span className="text-red-400 ml-1">*</span>}
              </label>
              {campo.tipo === "select" ? (
                <select value={cred[campo.chave] ?? ""}
                  onChange={e => setCred(c => ({ ...c, [campo.chave]: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white">
                  <option value="">— escolher —</option>
                  {campo.opcoes?.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                </select>
              ) : (
                <input type={campo.tipo} value={cred[campo.chave] ?? ""}
                  placeholder={campo.placeholder}
                  onChange={e => setCred(c => ({ ...c, [campo.chave]: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
              )}
            </div>
          ))}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={padraoPdv} onChange={e => setPp(e.target.checked)} />
              Usar como padrão no <strong>PDV</strong>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={padraoTotem} onChange={e => setPt(e.target.checked)} />
              Usar como padrão no <strong>Totem</strong>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Observação</label>
            <input value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Notas internas (opcional)"
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <div className="flex gap-2 border-t border-white/10 px-5 py-3">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
            Cancelar
          </button>
          <button onClick={salvar} disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {terminal ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
