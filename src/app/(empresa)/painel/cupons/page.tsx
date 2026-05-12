"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tag, Plus, Copy, Check, Trash2, ToggleLeft, ToggleRight,
  Search, Gift, Award, Loader2, X, ChevronDown, Calendar,
  ChevronLeft, ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CupomTipo = "percentual" | "fixo" | "frete_gratis";
type FiltroTab = "todos" | "ativos" | "inativos" | "fidelidade";

interface Cupom {
  id:                    string;
  codigo:                string;
  descricao:             string | null;
  tipo:                  CupomTipo;
  valor:                 number;
  valido_ate:            string | null;
  uso_maximo:            number | null;
  uso_por_cliente:       number | null;
  uso_atual:             number;
  valor_minimo_pedido:   number | null;
  ativo:                 boolean;
  cliente_id:            string | null;
  cliente_nome:          string | null;
  pontos_resgatados:     number | null;
  criado_em:             string;
}

interface ClienteBusca {
  id:       string;
  nome:     string;
  telefone: string | null;
  pontos:   number;
}

interface CupomForm {
  codigo:               string;
  descricao:            string;
  tipo:                 CupomTipo;
  valor:                string;
  valido_ate:           string;
  uso_maximo:           string;
  valor_minimo_pedido:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(): string {
  return typeof window !== "undefined" ? (localStorage.getItem("access_token") ?? "") : "";
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}` };
}

function formatBRL(value: number): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function generateCodigo(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CUP";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CuponsPage() {
  const [cupons, setCupons]           = useState<Cupom[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filtro, setFiltro]           = useState<FiltroTab>("todos");

  const [modalCreate, setModalCreate] = useState(false);
  const [modalResgate, setModalResgate] = useState(false);

  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [toggling, setToggling]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  const LIMIT = 20;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const defaultForm = (): CupomForm => ({
    codigo:              generateCodigo(),
    descricao:           "",
    tipo:                "percentual",
    valor:               "",
    valido_ate:          "",
    uso_maximo:          "",
    valor_minimo_pedido: "",
  });

  const [form, setForm] = useState<CupomForm>(defaultForm);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const fetchCupons = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(LIMIT),
        ...(search.trim() ? { q: search.trim() } : {}),
        ...(filtro === "ativos"     ? { ativo: "true" }       : {}),
        ...(filtro === "inativos"   ? { ativo: "false" }      : {}),
        ...(filtro === "fidelidade" ? { fidelidade: "true" }  : {}),
      });
      const res  = await fetch(`/api/painel/cupons?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setCupons(data.data ?? []);
        setTotal(data.meta?.pagination?.total ?? 0);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filtro]);

  useEffect(() => {
    const t = setTimeout(() => fetchCupons(1), 300);
    return () => clearTimeout(t);
  }, [fetchCupons]);

  // ── Create coupon ───────────────────────────────────────────────────────────

  function openCreate() {
    setForm(defaultForm());
    setSaveError("");
    setModalCreate(true);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const payload: Record<string, unknown> = {
        codigo:   form.codigo.trim().toUpperCase() || generateCodigo(),
        descricao: form.descricao.trim() || undefined,
        tipo:     form.tipo,
        valor:    form.tipo === "frete_gratis" ? 0 : parseFloat(form.valor) || 0,
      };
      if (form.valido_ate)          payload.valido_ate           = form.valido_ate;
      if (form.uso_maximo)          payload.uso_maximo           = parseInt(form.uso_maximo, 10);
      if (form.valor_minimo_pedido) payload.valor_minimo_pedido  = parseFloat(form.valor_minimo_pedido);

      const res  = await fetch("/api/painel/cupons", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setModalCreate(false);
        fetchCupons(1);
      } else {
        setSaveError(data.error ?? "Erro ao criar cupom.");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle ativo ────────────────────────────────────────────────────────────

  async function toggleAtivo(cupom: Cupom) {
    setToggling(cupom.id);
    try {
      const res  = await fetch(`/api/painel/cupons/${cupom.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ ativo: !cupom.ativo }),
      });
      const data = await res.json();
      if (data.success) {
        setCupons(prev => prev.map(c => c.id === cupom.id ? { ...c, ativo: !c.ativo } : c));
      }
    } finally {
      setToggling(null);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function deleteCupom(id: string) {
    if (!confirm("Excluir este cupom? Isso não pode ser desfeito.")) return;
    setDeleting(id);
    try {
      const res  = await fetch(`/api/painel/cupons/${id}`, {
        method:  "DELETE",
        headers: authHeader(),
      });
      const data = await res.json();
      if (data.success) {
        setCupons(prev => prev.filter(c => c.id !== id));
        setTotal(prev => prev - 1);
      } else {
        alert(data.error ?? "Erro ao excluir cupom.");
      }
    } finally {
      setDeleting(null);
    }
  }

  // ── Copy code ───────────────────────────────────────────────────────────────

  function copyCode(id: string, codigo: string) {
    navigator.clipboard.writeText(codigo).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const FILTROS: { key: FiltroTab; label: string }[] = [
    { key: "todos",      label: "Todos"      },
    { key: "ativos",     label: "Ativos"     },
    { key: "inativos",   label: "Inativos"   },
    { key: "fidelidade", label: "Fidelidade" },
  ];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Cupons</h1>
          <p className="mt-1 text-sm text-slate-400">
            {loading
              ? "Carregando..."
              : `${total.toLocaleString("pt-BR")} cupom${total !== 1 ? "ns" : ""} cadastrado${total !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSaveError(""); setModalResgate(true); }}
            className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm font-medium text-brand hover:bg-brand/20 transition"
          >
            <Gift className="h-4 w-4" />
            Resgatar pontos
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 transition"
          >
            <Plus className="h-4 w-4" />
            Novo cupom
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código ou descrição..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filtro === f.key
                  ? "bg-brand/20 text-brand"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {/* Head */}
        <div className="hidden lg:grid grid-cols-[130px_1fr_80px_90px_90px_110px_1fr_100px_80px] gap-x-3 border-b border-white/5 px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span>Código</span>
          <span>Descrição</span>
          <span className="text-center">Tipo</span>
          <span className="text-right">Valor</span>
          <span className="text-center">Usos</span>
          <span className="text-right">Válido até</span>
          <span>Origem</span>
          <span className="text-center">Status</span>
          <span />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        )}

        {/* Empty */}
        {!loading && cupons.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <Tag className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {search || filtro !== "todos"
                ? "Nenhum cupom encontrado para este filtro."
                : "Nenhum cupom cadastrado ainda."}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && cupons.map((cupom, i) => (
          <CupomRow
            key={cupom.id}
            cupom={cupom}
            index={i}
            copiedId={copiedId}
            toggling={toggling}
            deleting={deleting}
            onCopy={copyCode}
            onToggle={toggleAtivo}
            onDelete={deleteCupom}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages} · {total.toLocaleString("pt-BR")} cupons
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchCupons(page - 1)}
              disabled={page === 1 || loading}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 disabled:opacity-30 transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i + 1;
              if (totalPages > 5) {
                if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => fetchCupons(p)}
                  disabled={loading}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition ${
                    p === page
                      ? "bg-brand/20 text-brand"
                      : "text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => fetchCupons(page + 1)}
              disabled={page === totalPages || loading}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 disabled:opacity-30 transition"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: Criar cupom ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalCreate && (
          <Modal onClose={() => setModalCreate(false)}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Novo cupom</h2>
                <p className="mt-0.5 text-sm text-slate-400">Preencha os dados do cupom de desconto</p>
              </div>
              <button
                onClick={() => setModalCreate(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitCreate} className="space-y-4">
              {/* Código */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Código do cupom
                </label>
                <div className="flex gap-2">
                  <input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                    placeholder="Ex: PROMO20"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm uppercase text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, codigo: generateCodigo() }))}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition whitespace-nowrap"
                  >
                    Gerar
                  </button>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Descrição (opcional)
                </label>
                <input
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Desconto de lançamento"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                />
              </div>

              {/* Tipo + Valor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Tipo</label>
                  <div className="relative">
                    <select
                      value={form.tipo}
                      onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CupomTipo, valor: "" }))}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-4 pr-9 text-sm text-white focus:border-brand/50 focus:outline-none"
                    >
                      <option value="percentual">Percentual (%)</option>
                      <option value="fixo">Valor fixo (R$)</option>
                      <option value="frete_gratis">Frete grátis</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    {form.tipo === "percentual" ? "Percentual (%)" : form.tipo === "fixo" ? "Valor (R$)" : "Valor"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={form.tipo === "percentual" ? "1" : "0.01"}
                    max={form.tipo === "percentual" ? "100" : undefined}
                    value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    disabled={form.tipo === "frete_gratis"}
                    placeholder={form.tipo === "frete_gratis" ? "—" : form.tipo === "percentual" ? "10" : "15,00"}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Válido até + Uso máximo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Válido até (opcional)
                  </label>
                  <input
                    type="date"
                    value={form.valido_ate}
                    onChange={e => setForm(f => ({ ...f, valido_ate: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Uso máximo (opcional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.uso_maximo}
                    onChange={e => setForm(f => ({ ...f, uso_maximo: e.target.value }))}
                    placeholder="∞ ilimitado"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Pedido mínimo */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Valor mínimo do pedido (opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor_minimo_pedido}
                  onChange={e => setForm(f => ({ ...f, valor_minimo_pedido: e.target.value }))}
                  placeholder="Ex: 30,00"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                />
              </div>

              {saveError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  {saveError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCreate(false)}
                  className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-slate-400 hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar cupom
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── Modal: Resgate de pontos ────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalResgate && (
          <ResgateModal
            onClose={() => setModalResgate(false)}
            onSuccess={() => { setModalResgate(false); fetchCupons(1); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── CupomRow ──────────────────────────────────────────────────────────────────

function CupomRow({
  cupom, index, copiedId, toggling, deleting,
  onCopy, onToggle, onDelete,
}: {
  cupom:     Cupom;
  index:     number;
  copiedId:  string | null;
  toggling:  string | null;
  deleting:  string | null;
  onCopy:    (id: string, codigo: string) => void;
  onToggle:  (cupom: Cupom) => void;
  onDelete:  (id: string) => void;
}) {
  const isCopied   = copiedId === cupom.id;
  const isToggling = toggling === cupom.id;
  const isDeleting = deleting === cupom.id;

  const tipoBadge = {
    percentual:   { label: "%",     cls: "bg-blue-500/15 text-blue-400"     },
    fixo:         { label: "R$",    cls: "bg-brand/15 text-brand" },
    frete_gratis: { label: "Frete", cls: "bg-purple-500/15 text-purple-400"  },
  }[cupom.tipo] ?? { label: cupom.tipo, cls: "bg-slate-500/15 text-slate-400" };

  const usoText = cupom.uso_maximo
    ? `${cupom.uso_atual} / ${cupom.uso_maximo}`
    : `${cupom.uso_atual} / ∞`;

  const valorText = cupom.tipo === "percentual"
    ? `${cupom.valor}%`
    : cupom.tipo === "frete_gratis"
    ? "Grátis"
    : formatBRL(cupom.valor);

  const origemText = cupom.cliente_nome
    ? `Fidelidade — ${cupom.cliente_nome}`
    : "Manual";

  const isExpired = cupom.valido_ate ? new Date(cupom.valido_ate) < new Date() : false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.03 }}
      className={`border-b border-white/5 px-5 py-4 last:border-0 transition hover:bg-white/5 ${
        !cupom.ativo || isExpired ? "opacity-60" : ""
      }`}
    >
      {/* Desktop row */}
      <div className="hidden lg:grid grid-cols-[130px_1fr_80px_90px_90px_110px_1fr_100px_80px] gap-x-3 items-center">
        {/* Código */}
        <div className="flex items-center gap-1.5">
          <code className="truncate rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold tracking-widest text-brand">
            {cupom.codigo}
          </code>
          <button
            onClick={() => onCopy(cupom.id, cupom.codigo)}
            className="flex-shrink-0 rounded p-0.5 text-slate-500 hover:text-white transition"
            title="Copiar código"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Descrição */}
        <span className="truncate text-sm text-slate-300">
          {cupom.descricao || <span className="text-slate-600">—</span>}
        </span>

        {/* Tipo badge */}
        <div className="flex justify-center">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tipoBadge.cls}`}>
            {tipoBadge.label}
          </span>
        </div>

        {/* Valor */}
        <span className="text-right text-sm font-medium text-white">{valorText}</span>

        {/* Usos */}
        <span className="text-center text-xs text-slate-400">{usoText}</span>

        {/* Válido até */}
        <div className="flex items-center justify-end gap-1">
          {cupom.valido_ate && <Calendar className="h-3 w-3 text-slate-500 flex-shrink-0" />}
          <span className={`text-sm ${isExpired ? "text-red-400" : "text-slate-400"}`}>
            {formatDate(cupom.valido_ate)}
          </span>
        </div>

        {/* Origem */}
        <div className="flex items-center gap-1.5 min-w-0">
          {cupom.cliente_nome ? (
            <Award className="h-3.5 w-3.5 text-brand flex-shrink-0" />
          ) : (
            <Tag className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          )}
          <span className="truncate text-xs text-slate-400">{origemText}</span>
        </div>

        {/* Status toggle */}
        <div className="flex justify-center">
          <button
            onClick={() => onToggle(cupom)}
            disabled={isToggling}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition hover:bg-white/10 disabled:opacity-40"
            title={cupom.ativo ? "Desativar" : "Ativar"}
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : cupom.ativo ? (
              <>
                <ToggleRight className="h-5 w-5 text-brand" />
                <span className="text-brand">Ativo</span>
              </>
            ) : (
              <>
                <ToggleLeft className="h-5 w-5 text-slate-500" />
                <span className="text-slate-500">Inativo</span>
              </>
            )}
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={() => onDelete(cupom.id)}
            disabled={isDeleting || cupom.uso_atual > 0}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 transition"
            title={cupom.uso_atual > 0 ? "Cupom já utilizado — não pode ser excluído" : "Excluir"}
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile card */}
      <div className="flex flex-col gap-2 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <code className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold tracking-widest text-brand">
              {cupom.codigo}
            </code>
            <button onClick={() => onCopy(cupom.id, cupom.codigo)} className="text-slate-500 hover:text-white">
              {isCopied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tipoBadge.cls}`}>
              {tipoBadge.label}
            </span>
          </div>
          <button
            onClick={() => onToggle(cupom)}
            disabled={isToggling}
            className="flex-shrink-0"
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : cupom.ativo ? (
              <ToggleRight className="h-6 w-6 text-brand" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-slate-500" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="font-medium text-white">{valorText}</span>
          <span>Usos: {usoText}</span>
          {cupom.valido_ate && (
            <span className={isExpired ? "text-red-400" : ""}>
              Até {formatDate(cupom.valido_ate)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {cupom.cliente_nome
              ? <Award className="h-3 w-3 text-brand" />
              : <Tag className="h-3 w-3 text-slate-500" />}
            <span className="text-xs text-slate-400">{origemText}</span>
          </div>
          <button
            onClick={() => onDelete(cupom.id)}
            disabled={isDeleting || cupom.uso_atual > 0}
            className="rounded p-1 text-slate-500 hover:text-red-400 disabled:opacity-30 transition"
          >
            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        {children}
      </motion.div>
    </div>
  );
}

// ── ResgateModal ──────────────────────────────────────────────────────────────

function ResgateModal({
  onClose,
  onSuccess,
}: {
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [searchQ, setSearchQ]                 = useState("");
  const [searchLoading, setSearchLoading]     = useState(false);
  const [resultados, setResultados]           = useState<ClienteBusca[]>([]);
  const [cliente, setCliente]                 = useState<ClienteBusca | null>(null);
  const [realPorPonto, setRealPorPonto]       = useState<number | null>(null);
  const [pontosResgate, setPontosResgate]     = useState("");
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState("");
  const [success, setSuccess]                 = useState(false);
  const [geradoCodigo, setGeradoCodigo]       = useState("");
  const debounceRef                           = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch real_por_ponto from config
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch("/api/painel/config", { headers: authHeader() });
        const data = await res.json();
        if (data.success) {
          setRealPorPonto(data.data?.real_por_ponto ?? data.data?.fidelidade?.real_por_ponto ?? 0.01);
        }
      } catch {
        setRealPorPonto(0.01);
      }
    })();
  }, []);

  // Search customers
  function handleSearch(q: string) {
    setSearchQ(q);
    setCliente(null);
    setResultados([]);
    if (!q.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ q: q.trim(), limit: "5" });
        const res    = await fetch(`/api/painel/clientes?${params}`, { headers: authHeader() });
        const data   = await res.json();
        if (data.success) setResultados(data.data ?? []);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
  }

  function selectCliente(c: ClienteBusca) {
    setCliente(c);
    setResultados([]);
    setSearchQ(c.nome);
    setPontosResgate("");
    setError("");
  }

  const pontosNum   = parseInt(pontosResgate, 10) || 0;
  const valorGerado = realPorPonto !== null ? pontosNum * realPorPonto : 0;
  const podeGerar   = cliente !== null && pontosNum > 0 && pontosNum <= (cliente?.pontos ?? 0) && !saving;

  async function handleGerar() {
    if (!cliente || pontosNum <= 0) return;
    if (pontosNum > cliente.pontos) {
      setError(`Cliente possui apenas ${cliente.pontos} pontos.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        cliente_id:        cliente.id,
        pontos_resgatados: pontosNum,
        tipo:              "fixo",
        valor:             parseFloat(valorGerado.toFixed(2)),
        uso_maximo:        1,
        uso_por_cliente:   1,
        descricao:         `Resgate de ${pontosNum} pontos — ${cliente.nome}`,
      };
      const res  = await fetch("/api/painel/cupons", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setGeradoCodigo(data.data?.codigo ?? "");
        setSuccess(true);
      } else {
        setError(data.error ?? "Erro ao gerar cupom.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Resgate de Pontos</h2>
          <p className="mt-0.5 text-sm text-slate-400">Gere um cupom usando os pontos de fidelidade do cliente</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {success ? (
        /* ── Success state ──────────────────────────────────────────────────── */
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-brand/30 bg-brand/15">
            <Check className="h-8 w-8 text-brand" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">Cupom gerado!</p>
            <p className="mt-1 text-sm text-slate-400">
              {pontosNum} pontos de <strong className="text-white">{cliente?.nome}</strong> foram resgatados.
            </p>
          </div>
          {geradoCodigo && (
            <div className="rounded-2xl border border-brand/25 bg-brand/10 px-8 py-4">
              <code className="text-2xl font-bold tracking-[0.25em] text-brand">{geradoCodigo}</code>
              <p className="mt-1 text-xs text-brand">Código do cupom</p>
            </div>
          )}
          <button
            onClick={onSuccess}
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-medium text-white hover:brightness-110 transition"
          >
            Fechar
          </button>
        </div>
      ) : (
        /* ── Form ───────────────────────────────────────────────────────────── */
        <div className="space-y-5">
          {/* Search customer */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Buscar cliente por nome, telefone ou CPF
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQ}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Ex: 11999887766"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>

            {/* Dropdown results */}
            {resultados.length > 0 && (
              <div className="mt-1 rounded-xl border border-white/10 bg-slate-800 py-1 shadow-xl">
                {resultados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectCliente(c)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-white/5 transition"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{c.nome}</p>
                      {c.telefone && (
                        <p className="text-xs text-slate-500">{c.telefone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      <Award className="h-3.5 w-3.5 text-brand" />
                      <span className="text-sm font-semibold text-brand">
                        {c.pontos.toLocaleString("pt-BR")}
                      </span>
                      <span className="text-xs text-slate-500">pts</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cliente selecionado */}
          {cliente && (
            <div className="rounded-2xl border border-brand/25 bg-brand/10 flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-semibold text-white">{cliente.nome}</p>
                <p className="mt-0.5 text-xs text-slate-400">{cliente.telefone ?? "Sem telefone"}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-brand leading-none">
                  {cliente.pontos.toLocaleString("pt-BR")}
                </p>
                <p className="mt-0.5 text-xs text-brand">pontos disponíveis</p>
              </div>
            </div>
          )}

          {/* Pontos a resgatar */}
          {cliente && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Pontos a resgatar
              </label>
              <input
                type="number"
                min="1"
                max={cliente.pontos}
                value={pontosResgate}
                onChange={e => { setPontosResgate(e.target.value); setError(""); }}
                placeholder={`Máx. ${cliente.pontos}`}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
              />

              {/* Preview */}
              {pontosNum > 0 && realPorPonto !== null && (
                <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Gift className="h-4 w-4" />
                    <span>
                      <span className="font-medium text-white">{pontosNum.toLocaleString("pt-BR")} pts</span>
                      {" "}&rarr;{" "}
                      <span className="font-bold text-brand">{formatBRL(valorGerado)}</span> de desconto
                    </span>
                  </div>
                  {pontosNum > cliente.pontos && (
                    <span className="text-xs text-red-400">Insuficiente</span>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-slate-400 hover:bg-white/5 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleGerar}
              disabled={!podeGerar}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40 transition"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Gift className="h-4 w-4" />
              Gerar cupom
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
