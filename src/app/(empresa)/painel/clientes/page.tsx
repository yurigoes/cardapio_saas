"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, ChevronDown, ChevronLeft, ChevronRight,
  X, Trophy, Phone, Mail, FileText, ShoppingBag, Tag,
  Plus, Minus, CheckCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Cliente {
  id:             string;
  nome:           string;
  telefone:       string | null;
  email:          string | null;
  cpf:            string | null;
  pontos:         number;
  total_pedidos:  number;
  total_gasto:    number;
  ultimo_pedido:  string | null;
  rank?:          number;
}

interface Pedido {
  id:          string;
  numero:      number;
  status:      string;
  total:       number;
  criado_em:   string;
}

interface Cupom {
  id:          string;
  codigo:      string;
  tipo:        string;
  valor:       number;
  validade:    string | null;
}

interface ClienteDetalhe extends Cliente {
  pedidos:  Pedido[];
  cupons:   Cupom[];
}

type OrderBy = "pontos" | "total_gasto" | "total_pedidos" | "ultimo_pedido";

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
  return new Date(date).toLocaleDateString("pt-BR", {
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
  });
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return phone;
}

function formatCPF(cpf: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return cpf;
}

const ORDER_LABELS: Record<OrderBy, string> = {
  pontos:         "Pontos",
  total_gasto:    "Total Gasto",
  total_pedidos:  "Nº de Pedidos",
  ultimo_pedido:  "Último Pedido",
};

const PODIUM_STYLE: Record<number, {
  border: string;
  bg:     string;
  badge:  string;
  emoji:  string;
  text:   string;
}> = {
  1: {
    border: "border-amber-400/50",
    bg:     "bg-gradient-to-br from-amber-500/20 to-amber-900/10",
    badge:  "bg-amber-400/20 text-amber-300",
    emoji:  "🥇",
    text:   "text-amber-300",
  },
  2: {
    border: "border-slate-400/40",
    bg:     "bg-gradient-to-br from-slate-400/15 to-slate-700/10",
    badge:  "bg-slate-400/20 text-slate-300",
    emoji:  "🥈",
    text:   "text-slate-300",
  },
  3: {
    border: "border-amber-700/40",
    bg:     "bg-gradient-to-br from-amber-700/20 to-amber-950/10",
    badge:  "bg-amber-700/20 text-amber-500",
    emoji:  "🥉",
    text:   "text-amber-500",
  },
};

const STATUS_LABEL: Record<string, string> = {
  pendente:    "Pendente",
  confirmado:  "Confirmado",
  preparando:  "Preparando",
  pronto:      "Pronto",
  entregue:    "Entregue",
  cancelado:   "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  pendente:    "bg-yellow-500/15 text-yellow-400",
  confirmado:  "bg-blue-500/15 text-blue-400",
  preparando:  "bg-orange-500/15 text-orange-400",
  pronto:      "bg-emerald-500/15 text-emerald-400",
  entregue:    "bg-emerald-500/15 text-emerald-400",
  cancelado:   "bg-red-500/15 text-red-400",
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function ClientesPage() {
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [orderBy, setOrderBy]           = useState<OrderBy>("pontos");
  const [modalCliente, setModalCliente] = useState<ClienteDetalhe | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Points adjustment state
  const [ajusteValor, setAjusteValor]   = useState("");
  const [ajusteObs, setAjusteObs]       = useState("");
  const [ajusteSaving, setAjusteSaving] = useState(false);
  const [ajusteOk, setAjusteOk]         = useState(false);
  const [ajusteErro, setAjusteErro]     = useState("");

  const LIMIT = 20;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const fetchClientes = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(LIMIT),
        order: orderBy,
        ...(search.trim() ? { q: search.trim() } : {}),
      });
      const res  = await fetch(`/api/painel/clientes?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setClientes(data.data ?? []);
        setTotal(data.meta?.pagination?.total ?? 0);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }, [search, orderBy]);

  useEffect(() => {
    const t = setTimeout(() => fetchClientes(1), 300);
    return () => clearTimeout(t);
  }, [fetchClientes]);

  // ── Fetch detail ────────────────────────────────────────────────────────────

  async function openCliente(id: string) {
    setModalLoading(true);
    setModalCliente(null);
    resetAjuste();
    try {
      const res  = await fetch(`/api/painel/clientes/${id}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) setModalCliente(data.data);
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalCliente(null);
    resetAjuste();
  }

  // ── Points adjustment ───────────────────────────────────────────────────────

  function resetAjuste() {
    setAjusteValor("");
    setAjusteObs("");
    setAjusteSaving(false);
    setAjusteOk(false);
    setAjusteErro("");
  }

  async function salvarAjuste() {
    if (!modalCliente || !ajusteValor) return;
    const delta = parseInt(ajusteValor, 10);
    if (isNaN(delta) || delta === 0) {
      setAjusteErro("Informe um valor diferente de zero.");
      return;
    }
    setAjusteSaving(true);
    setAjusteErro("");
    try {
      const res  = await fetch(`/api/painel/clientes/${modalCliente.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ pontos_ajuste: delta, observacao: ajusteObs || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setAjusteOk(true);
        setModalCliente(prev =>
          prev ? { ...prev, pontos: (prev.pontos ?? 0) + delta } : prev
        );
        setClientes(prev =>
          prev.map(c => c.id === modalCliente.id
            ? { ...c, pontos: (c.pontos ?? 0) + delta }
            : c
          )
        );
        setAjusteValor("");
        setAjusteObs("");
      } else {
        setAjusteErro(data.error ?? "Erro ao ajustar pontos.");
      }
    } finally {
      setAjusteSaving(false);
    }
  }

  // ── Top 3 (first fetch, order=pontos) ───────────────────────────────────────

  const top3 = clientes.slice(0, 3).map((c, i) => ({ ...c, rank: i + 1 + (page - 1) * LIMIT }));
  const showPodium = orderBy === "pontos" && page === 1 && !search.trim() && !loading && top3.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes &amp; Fidelidade</h1>
          <p className="mt-1 text-sm text-slate-400">
            {loading
              ? "Carregando..."
              : `${total.toLocaleString("pt-BR")} cliente${total !== 1 ? "s" : ""} cadastrado${total !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
          <Users className="h-5 w-5 text-emerald-400" />
        </div>
      </div>

      {/* ── Podium Top 3 ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPodium && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-4 sm:grid-cols-3"
          >
            {top3.map((c) => {
              const rank = c.rank as 1 | 2 | 3;
              const style = PODIUM_STYLE[rank] ?? PODIUM_STYLE[3];
              return (
                <button
                  key={c.id}
                  onClick={() => openCliente(c.id)}
                  className={`rounded-2xl border ${style.border} ${style.bg} p-5 text-left transition hover:scale-[1.02] active:scale-100`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{style.emoji}</span>
                    <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${style.badge}`}>
                      #{rank}
                    </span>
                  </div>
                  <p className={`font-semibold text-white truncate`}>{c.nome}</p>
                  {c.telefone && (
                    <p className="mt-0.5 text-xs text-slate-400 truncate">{formatPhone(c.telefone)}</p>
                  )}
                  <div className="mt-3 flex items-center gap-1.5">
                    <Trophy className={`h-4 w-4 ${style.text}`} />
                    <span className={`text-lg font-bold ${style.text}`}>
                      {c.pontos.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-xs text-slate-500">pts</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatBRL(c.total_gasto)} em {c.total_pedidos} pedido{c.total_pedidos !== 1 ? "s" : ""}
                  </p>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
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

        <div className="relative">
          <select
            value={orderBy}
            onChange={e => setOrderBy(e.target.value as OrderBy)}
            className="appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-4 pr-9 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
          >
            {(Object.keys(ORDER_LABELS) as OrderBy[]).map(k => (
              <option key={k} value={k}>Ordenar: {ORDER_LABELS[k]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {/* Table head */}
        <div className="hidden sm:grid grid-cols-[40px_1fr_100px_80px_110px_110px_44px] gap-x-4 border-b border-white/5 px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span>#</span>
          <span>Cliente</span>
          <span className="text-right">Pontos</span>
          <span className="text-right">Pedidos</span>
          <span className="text-right">Total Gasto</span>
          <span className="text-right">Últ. Pedido</span>
          <span />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        )}

        {/* Empty */}
        {!loading && clientes.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {search ? "Nenhum cliente encontrado para esta busca." : "Nenhum cliente cadastrado ainda."}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && clientes.map((c, i) => {
          const globalRank = (page - 1) * LIMIT + i + 1;
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="grid grid-cols-[40px_1fr] gap-x-4 border-b border-white/5 px-5 py-4 transition hover:bg-white/5 sm:grid-cols-[40px_1fr_100px_80px_110px_110px_44px] sm:items-center last:border-0"
            >
              {/* Rank */}
              <span className="text-sm font-medium text-slate-500 self-center">{globalRank}</span>

              {/* Name + contact */}
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{c.nome}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {c.telefone && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Phone className="h-3 w-3" />
                      {formatPhone(c.telefone)}
                    </span>
                  )}
                  {c.email && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 truncate">
                      <Mail className="h-3 w-3" />
                      <span className="truncate max-w-[160px]">{c.email}</span>
                    </span>
                  )}
                </div>

                {/* Mobile-only stats */}
                <div className="mt-2 flex items-center gap-3 sm:hidden">
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Trophy className="h-3 w-3" />
                    {c.pontos.toLocaleString("pt-BR")} pts
                  </span>
                  <span className="text-xs text-slate-400">{c.total_pedidos} pedidos</span>
                  <span className="text-xs text-slate-400">{formatBRL(c.total_gasto)}</span>
                </div>
              </div>

              {/* Points */}
              <div className="hidden sm:flex items-center justify-end gap-1">
                <Trophy className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-semibold text-emerald-400">
                  {c.pontos.toLocaleString("pt-BR")}
                </span>
              </div>

              {/* Pedidos */}
              <p className="hidden sm:block text-right text-sm text-slate-300">
                {c.total_pedidos}
              </p>

              {/* Total gasto */}
              <p className="hidden sm:block text-right text-sm text-slate-300">
                {formatBRL(c.total_gasto)}
              </p>

              {/* Último pedido */}
              <p className="hidden sm:block text-right text-sm text-slate-400">
                {formatDate(c.ultimo_pedido)}
              </p>

              {/* Action */}
              <button
                onClick={() => openCliente(c.id)}
                className="hidden sm:flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                title="Ver detalhes"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages} · {total.toLocaleString("pt-BR")} clientes
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchClientes(page - 1)}
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
                  onClick={() => fetchClientes(p)}
                  disabled={loading}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition ${
                    p === page
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => fetchClientes(page + 1)}
              disabled={page === totalPages || loading}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 disabled:opacity-30 transition"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(modalCliente !== null || modalLoading) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeModal}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            >
              {/* Loading state */}
              {modalLoading && !modalCliente && (
                <div className="flex h-40 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                </div>
              )}

              {modalCliente && (
                <>
                  {/* Modal header */}
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white">{modalCliente.nome}</h2>
                      <p className="mt-0.5 text-sm text-slate-400">Perfil do cliente</p>
                    </div>
                    <button
                      onClick={closeModal}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Identity */}
                  <div className="mb-5 grid grid-cols-2 gap-3">
                    <InfoField label="Telefone" icon={Phone}>
                      {formatPhone(modalCliente.telefone)}
                    </InfoField>
                    <InfoField label="CPF" icon={FileText}>
                      {formatCPF(modalCliente.cpf)}
                    </InfoField>
                    <InfoField label="E-mail" icon={Mail} className="col-span-2">
                      {modalCliente.email ?? "—"}
                    </InfoField>
                  </div>

                  {/* Points banner */}
                  <div className="mb-5 flex items-center gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4">
                    <Trophy className="h-8 w-8 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-3xl font-bold text-emerald-400 leading-none">
                        {modalCliente.pontos.toLocaleString("pt-BR")}
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-500">pontos de fidelidade</p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="mb-5 grid grid-cols-3 gap-3">
                    <StatCard label="Total Pedidos" value={String(modalCliente.total_pedidos)} />
                    <StatCard label="Total Gasto" value={formatBRL(modalCliente.total_gasto)} />
                    <StatCard label="Último Pedido" value={formatDate(modalCliente.ultimo_pedido)} />
                  </div>

                  {/* ── Ajuste de pontos ─────────────────────────────────────── */}
                  <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Ajustar Pontos
                    </p>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={ajusteValor}
                          onChange={e => { setAjusteValor(e.target.value); setAjusteOk(false); setAjusteErro(""); }}
                          placeholder="Ex: +50 ou -20"
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={salvarAjuste}
                        disabled={ajusteSaving || !ajusteValor}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-40 transition"
                      >
                        {ajusteSaving
                          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          : parseInt(ajusteValor || "0") < 0
                            ? <Minus className="h-4 w-4" />
                            : <Plus className="h-4 w-4" />
                        }
                        Aplicar
                      </button>
                    </div>

                    <div className="mt-2">
                      <input
                        value={ajusteObs}
                        onChange={e => setAjusteObs(e.target.value)}
                        placeholder="Observação (opcional)"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>

                    {ajusteOk && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Pontos ajustados com sucesso.
                      </p>
                    )}
                    {ajusteErro && (
                      <p className="mt-2 text-xs text-red-400">{ajusteErro}</p>
                    )}
                  </div>

                  {/* ── Últimos pedidos ──────────────────────────────────────── */}
                  <div className="mb-5">
                    <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Últimos Pedidos
                    </p>

                    {modalCliente.pedidos.length === 0 ? (
                      <p className="text-sm text-slate-500 py-2">Nenhum pedido encontrado.</p>
                    ) : (
                      <div className="space-y-2">
                        {modalCliente.pedidos.slice(0, 5).map(p => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-500">#{p.numero}</span>
                              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                                {STATUS_LABEL[p.status] ?? p.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-white">{formatBRL(p.total)}</span>
                              <span className="text-xs text-slate-500">{formatDate(p.criado_em)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Cupons ativos ─────────────────────────────────────────── */}
                  <div>
                    <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      <Tag className="h-3.5 w-3.5" />
                      Cupons Ativos
                    </p>

                    {modalCliente.cupons.length === 0 ? (
                      <p className="text-sm text-slate-500 py-2">Nenhum cupom ativo.</p>
                    ) : (
                      <div className="space-y-2">
                        {modalCliente.cupons.map(cupom => (
                          <div
                            key={cupom.id}
                            className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <code className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold tracking-widest text-emerald-300">
                                {cupom.codigo}
                              </code>
                              <span className="text-xs text-slate-400 capitalize">{cupom.tipo}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-white">
                                {cupom.tipo === "percentual"
                                  ? `${cupom.valor}%`
                                  : formatBRL(cupom.valor)}
                              </span>
                              {cupom.validade && (
                                <span className="text-xs text-slate-500">até {formatDate(cupom.validade)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoField({
  label,
  icon: Icon,
  children,
  className = "",
}: {
  label:     string;
  icon:      React.ElementType;
  children:  React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/5 bg-white/5 px-4 py-3 ${className}`}>
      <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="text-sm text-white truncate">{children}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white truncate">{value}</p>
    </div>
  );
}
