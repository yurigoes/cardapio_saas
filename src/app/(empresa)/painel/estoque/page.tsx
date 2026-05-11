"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Package, AlertTriangle, CheckCircle, MinusCircle, Edit3 } from "lucide-react";

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
        className="w-20 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-sm text-white text-center focus:outline-none"
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
          <Package className="h-5 w-5 text-emerald-400" />
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
          color="text-emerald-400"
          bg="bg-emerald-500/5"
          border="border-emerald-500/10"
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

      {/* Filters */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {(Object.keys(FILTRO_LABELS) as Filtro[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filtro === f ? "bg-emerald-500/20 text-emerald-400" : "text-slate-400 hover:text-white"
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
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
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
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_100px_140px_140px_80px_60px] items-center gap-x-4 px-6 py-3.5"
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
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-emerald-500 cursor-pointer"
                      title={p.controla_estoque ? "Desativar controle de estoque" : "Ativar controle de estoque"}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "ok" | "baixo" | "na" }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
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
