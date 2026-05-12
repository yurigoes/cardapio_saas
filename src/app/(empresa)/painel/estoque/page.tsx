"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Package, AlertTriangle, CheckCircle, MinusCircle, Edit3,
  Loader2, X, History, ArrowUpCircle, ArrowDownCircle, Settings,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Produto {
  id:               string;
  nome:             string;
  categoria_nome:   string | null;
  preco:            number;
  estoque_atual:    number | null;
  estoque_minimo:   number | null;
  controla_estoque: boolean;
}

type Filtro = "todos" | "baixo" | "sem_controle";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

function stockStatus(p: Produto): "ok" | "baixo" | "na" {
  if (!p.controla_estoque) return "na";
  const atual = p.estoque_atual ?? 0;
  const min   = p.estoque_minimo ?? 0;
  return atual > min ? "ok" : "baixo";
}

const FILTRO_LABELS: Record<Filtro, string> = {
  todos:        "Todos",
  baixo:        "Estoque baixo",
  sem_controle: "Sem controle",
};

// ── Inline edit cell ──────────────────────────────────────────────────────────

function InlineNumber({
  value,
  onSave,
  placeholder = "0",
}: {
  value:       number | null;
  onSave:      (n: number) => Promise<void>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n) && n !== value) {
      setSaving(true);
      try { await onSave(n); } finally { setSaving(false); }
    }
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter")  commit();
    if (e.key === "Escape") setEditing(false);
  }

  if (saving) return <span className="text-slate-400 animate-pulse text-sm">...</span>;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="w-20 rounded-lg border border-brand/50 bg-brand/10 px-2 py-1 text-sm text-white text-center focus:outline-none"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10 transition"
      title="Clique para editar"
    >
      <span>{value != null ? value : placeholder}</span>
      <Edit3 className="h-3 w-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EstoquePage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState<Filtro>("todos");

  // Modal de movimento
  const [movProd, setMovProd]     = useState<Produto | null>(null);
  const [movTipo, setMovTipo]     = useState<"entrada" | "ajuste" | "perda">("entrada");
  const [movQtd,  setMovQtd]      = useState("");
  const [movMot,  setMovMot]      = useState("");
  const [movSaving, setMovSaving] = useState(false);
  const [movErro, setMovErro]     = useState("");

  // Modal de histórico
  const [histProd, setHistProd]   = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<Array<{
    id: string; tipo: string; quantidade: number;
    estoque_anterior: number | null; estoque_atual: number | null;
    motivo: string | null; criado_em: string;
    pedido_numero: number | null; usuario_nome: string | null;
  }>>([]);
  const [histLoading, setHistLoading] = useState(false);

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchProdutos = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/painel/produtos?limit=100", { headers: authHeader() });
      const data = await res.json();
      if (data.success) setProdutos(data.data ?? []);
    } catch {
      setProdutos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProdutos(); }, [fetchProdutos]);

  // ── Patch product ──────────────────────────────────────────────────────────

  async function patchProduto(id: string, body: Record<string, unknown>) {
    await fetch(`/api/painel/produtos/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body:    JSON.stringify(body),
    });
    // optimistic: update local state
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...body } : p));
  }

  async function saveEstoqueAtual(p: Produto, n: number) {
    await patchProduto(p.id, { estoque_atual: n, controla_estoque: true });
  }

  async function saveEstoqueMinimo(p: Produto, n: number) {
    await patchProduto(p.id, { estoque_minimo: n });
  }

  async function toggleControla(p: Produto) {
    await patchProduto(p.id, { controla_estoque: !p.controla_estoque });
  }

  // ── Movimento (entrada/ajuste/perda) ──────────────────────────────────────
  function abrirMovimento(p: Produto, tipo: "entrada" | "ajuste" | "perda") {
    setMovProd(p);
    setMovTipo(tipo);
    setMovQtd(tipo === "ajuste" ? String(p.estoque_atual ?? 0) : "");
    setMovMot("");
    setMovErro("");
  }

  async function salvarMovimento() {
    if (!movProd) return;
    const n = parseInt(movQtd, 10);
    if (isNaN(n) || n < 0) { setMovErro("Quantidade inválida"); return; }
    setMovSaving(true);
    try {
      const res = await fetch(`/api/painel/estoque/${movProd.id}/movimento`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({
          tipo: movTipo,
          quantidade: Math.max(1, movTipo === "ajuste" ? n : n),
          motivo: movMot || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { setMovErro(data.error || "Erro"); return; }
      setMovProd(null);
      setToast({ type: "ok", msg: `Estoque atualizado: ${data.data.estoque_atual} un.` });
      fetchProdutos();
    } catch {
      setMovErro("Erro de conexão");
    } finally { setMovSaving(false); }
  }

  // ── Histórico ──────────────────────────────────────────────────────────────
  async function abrirHistorico(p: Produto) {
    setHistProd(p);
    setHistorico([]);
    setHistLoading(true);
    try {
      const res = await fetch(`/api/painel/estoque/movimentos?produto_id=${p.id}&limit=50`, {
        headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) setHistorico(data.data ?? []);
    } finally { setHistLoading(false); }
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const totalProdutos   = produtos.length;
  const emEstoqueNormal = produtos.filter(p => stockStatus(p) === "ok").length;
  const estoqueBaixo    = produtos.filter(p => stockStatus(p) === "baixo").length;

  const filtered = produtos.filter(p => {
    if (filtro === "baixo")        return stockStatus(p) === "baixo";
    if (filtro === "sem_controle") return !p.controla_estoque;
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Estoque</h1>
          <p className="mt-1 text-sm text-slate-400">
            Clique nos valores de estoque para editar inline
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15">
          <Package className="h-5 w-5 text-brand" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Total produtos"
          value={String(totalProdutos)}
          icon={Package}
          color="text-slate-300"
          bg="bg-white/5"
        />
        <SummaryCard
          label="Em estoque normal"
          value={String(emEstoqueNormal)}
          icon={CheckCircle}
          color="text-brand"
          bg="bg-brand/5"
          border="border-brand/10"
        />
        <SummaryCard
          label="Estoque baixo"
          value={String(estoqueBaixo)}
          icon={AlertTriangle}
          color={estoqueBaixo > 0 ? "text-red-400" : "text-slate-400"}
          bg={estoqueBaixo > 0 ? "bg-red-500/5" : "bg-white/5"}
          border={estoqueBaixo > 0 ? "border-red-500/15" : undefined}
        />
      </div>

      {/* Alerta de estoque baixo */}
      {estoqueBaixo > 0 && (
        <button
          onClick={() => setFiltro("baixo")}
          className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-300 hover:bg-red-500/15 transition"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>{estoqueBaixo}</strong> produto{estoqueBaixo !== 1 ? "s" : ""} com estoque
            no mínimo ou abaixo · clique para filtrar
          </span>
        </button>
      )}

      {/* Filters */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {(Object.keys(FILTRO_LABELS) as Filtro[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filtro === f ? "bg-brand/20 text-brand" : "text-slate-400 hover:text-white"
            }`}
          >
            {FILTRO_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {/* Head */}
        <div className="hidden md:grid grid-cols-[1fr_120px_100px_140px_140px_80px_60px] gap-x-4 border-b border-white/5 px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span>Produto</span>
          <span>Categoria</span>
          <span className="text-right">Preço</span>
          <span className="text-center">Estoque Atual</span>
          <span className="text-center">Estoque Mínimo</span>
          <span className="text-center">Status</span>
          <span className="text-center">Controla</span>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhum produto nesta categoria</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((p, i) => {
              const status = stockStatus(p);
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.025 }}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_100px_120px_120px_80px_50px_140px] items-center gap-x-4 px-6 py-3.5"
                >
                  {/* Nome */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{p.nome}</p>
                    <p className="text-xs text-slate-500 md:hidden">{p.categoria_nome ?? "Sem categoria"}</p>
                    {/* Mobile status */}
                    <div className="flex items-center gap-2 mt-1 md:hidden">
                      <StatusBadge status={status} />
                      <span className="text-xs text-slate-400">
                        Atual: {p.estoque_atual ?? "—"} · Min: {p.estoque_minimo ?? "—"}
                      </span>
                    </div>
                  </div>

                  {/* Categoria */}
                  <p className="hidden md:block text-xs text-slate-400 truncate">{p.categoria_nome ?? "—"}</p>

                  {/* Preço */}
                  <p className="hidden md:block text-right text-sm text-slate-300">
                    {Number(p.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>

                  {/* Estoque atual (inline edit) */}
                  <div className="hidden md:flex justify-center">
                    <InlineNumber
                      value={p.estoque_atual}
                      onSave={n => saveEstoqueAtual(p, n)}
                      placeholder="—"
                    />
                  </div>

                  {/* Estoque mínimo (inline edit) */}
                  <div className="hidden md:flex justify-center">
                    <InlineNumber
                      value={p.estoque_minimo}
                      onSave={n => saveEstoqueMinimo(p, n)}
                      placeholder="—"
                    />
                  </div>

                  {/* Status badge */}
                  <div className="hidden md:flex justify-center">
                    <StatusBadge status={status} />
                  </div>

                  {/* Controla estoque toggle */}
                  <div className="hidden md:flex justify-center">
                    <input
                      type="checkbox"
                      checked={p.controla_estoque}
                      onChange={() => toggleControla(p)}
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand cursor-pointer"
                      title={p.controla_estoque ? "Desativar controle de estoque" : "Ativar controle de estoque"}
                    />
                  </div>

                  {/* Ações */}
                  <div className="hidden md:flex items-center gap-1">
                    <button
                      onClick={() => abrirMovimento(p, "entrada")}
                      title="Entrada de estoque (reposição)"
                      className="flex items-center justify-center h-7 w-7 rounded-lg bg-brand/15 text-brand hover:bg-brand/25 transition"
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirMovimento(p, "perda")}
                      title="Perda (avaria/vencimento)"
                      className="flex items-center justify-center h-7 w-7 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition"
                    >
                      <ArrowDownCircle className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirMovimento(p, "ajuste")}
                      title="Ajuste manual (substitui valor)"
                      className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => abrirHistorico(p)}
                      title="Histórico"
                      className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: movimento (entrada/perda/ajuste) */}
      {movProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMovProd(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {movTipo === "entrada" ? "Entrada de estoque" :
                   movTipo === "perda"   ? "Registrar perda" : "Ajustar estoque"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400 truncate">{movProd.nome}</p>
              </div>
              <button onClick={() => setMovProd(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">
                Estoque atual: <strong className="text-white">{movProd.estoque_atual ?? 0}</strong> un.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {movTipo === "ajuste" ? "Novo valor (un.)" : "Quantidade (un.)"}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={movQtd}
                  onChange={(e) => setMovQtd(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-2xl font-bold text-white text-center focus:border-brand/50 focus:outline-none"
                />
                {movTipo !== "ajuste" && movQtd && (
                  <p className="mt-1 text-xs text-slate-500 text-center">
                    Estoque ficará em <strong className="text-white">
                      {movTipo === "entrada"
                        ? (movProd.estoque_atual ?? 0) + (parseInt(movQtd) || 0)
                        : (movProd.estoque_atual ?? 0) - (parseInt(movQtd) || 0)} un.
                    </strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Motivo (opcional)</label>
                <input
                  value={movMot}
                  onChange={(e) => setMovMot(e.target.value)}
                  placeholder={movTipo === "entrada" ? "Ex: nota fiscal 1234" :
                               movTipo === "perda"   ? "Ex: vencimento" :
                               "Ex: contagem física"}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                />
              </div>

              {movErro && <p className="text-xs text-red-400">{movErro}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMovProd(null)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarMovimento}
                  disabled={movSaving || !movQtd}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                    movTipo === "perda" ? "bg-red-500 hover:bg-red-400" : "bg-brand hover:brightness-110"
                  }`}
                >
                  {movSaving ? <Loader2 className="h-4 w-4 animate-spin" /> :
                    movTipo === "entrada" ? <ArrowUpCircle className="h-4 w-4" /> :
                    movTipo === "perda"   ? <ArrowDownCircle className="h-4 w-4" /> :
                    <Settings className="h-4 w-4" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: histórico de movimentos */}
      {histProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setHistProd(null)} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                  <History className="h-5 w-5 text-brand" />
                  Histórico
                </h3>
                <p className="mt-0.5 text-xs text-slate-400 truncate">{histProd.nome}</p>
              </div>
              <button onClick={() => setHistProd(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {histLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            ) : historico.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Nenhum movimento registrado</p>
            ) : (
              <div className="space-y-2">
                {historico.map((m) => {
                  const sinal = m.tipo === "entrada" || (m.tipo === "ajuste" && (m.estoque_atual ?? 0) >= (m.estoque_anterior ?? 0)) ? "+" : "−";
                  const cor   = m.tipo === "entrada" ? "text-brand" :
                                m.tipo === "perda"   ? "text-red-400" :
                                m.tipo === "saida"   ? "text-amber-400" : "text-slate-300";
                  return (
                    <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            m.tipo === "entrada" ? "bg-brand/15 text-brand" :
                            m.tipo === "perda"   ? "bg-red-500/15 text-red-400" :
                            m.tipo === "saida"   ? "bg-amber-500/15 text-amber-400" :
                                                   "bg-white/10 text-slate-400"
                          }`}>{m.tipo}</span>
                          {m.pedido_numero && <span className="text-[11px] font-mono text-slate-500">#{m.pedido_numero}</span>}
                        </div>
                        {m.motivo && <p className="mt-0.5 truncate text-xs text-slate-300">{m.motivo}</p>}
                        <p className="mt-0.5 text-[10px] text-slate-600">
                          {new Date(m.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {m.usuario_nome && ` · ${m.usuario_nome}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${cor}`}>{sinal}{m.quantidade}</p>
                        <p className="text-[10px] text-slate-500">
                          {m.estoque_anterior ?? 0} → {m.estoque_atual ?? 0}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur ${
            toast.type === "ok"
              ? "border-brand/30 bg-brand/15 text-brand"
              : "border-red-500/30 bg-red-500/15 text-red-300"
          }`}>
            {toast.type === "ok" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "ok" | "baixo" | "na" }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-brand">
        <CheckCircle className="h-3 w-3" /> OK
      </span>
    );
  }
  if (status === "baixo") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400">
        <AlertTriangle className="h-3 w-3" /> Baixo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-400">
      <MinusCircle className="h-3 w-3" /> N/A
    </span>
  );
}

function SummaryCard({
  label, value, icon: Icon, color, bg, border,
}: {
  label:   string;
  value:   string;
  icon:    React.ElementType;
  color:   string;
  bg:      string;
  border?: string;
}) {
  return (
    <div className={`rounded-2xl border ${border ?? "border-white/10"} ${bg} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-xs text-slate-400">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
