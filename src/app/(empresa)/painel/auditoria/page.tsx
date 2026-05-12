"use client";

/**
 * /painel/auditoria — Visualizador de audit_log
 *
 * Lista paginada de eventos com filtros (ação, recurso, usuário, datas).
 * Detalhe expansível mostra dados antes/depois em JSON.
 */
import { useEffect, useState, useCallback } from "react";
import {
  ScrollText, Search, ChevronDown, ChevronRight,
  RefreshCw, Filter, X, User, Activity, Calendar,
} from "lucide-react";

interface AuditEntry {
  id:               string;
  acao:             string;
  recurso:          string | null;
  recurso_id:       string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos:      Record<string, unknown> | null;
  ip_address:       string | null;
  duracao_ms:       number | null;
  created_at:       string;
  usuario_id:       string | null;
  usuario_nome:     string | null;
}

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader(): HeadersInit { return { Authorization: `Bearer ${getToken()}` }; }

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Cor por categoria de ação */
function corAcao(acao: string): { bg: string; text: string } {
  if (acao.includes(":criar")    || acao.includes(":login"))    return { bg: "bg-brand/15",     text: "text-brand" };
  if (acao.includes(":editar")   || acao.includes(":status")
                                  || acao.includes(":acumular")) return { bg: "bg-blue-500/15",  text: "text-blue-400" };
  if (acao.includes(":excluir")  || acao.includes(":cancelar")) return { bg: "bg-red-500/15",   text: "text-red-400" };
  if (acao.includes(":login_falha"))                            return { bg: "bg-amber-500/15", text: "text-amber-300" };
  return { bg: "bg-slate-500/15", text: "text-slate-300" };
}

export default function AuditoriaPage() {
  const [rows, setRows]       = useState<AuditEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  // Filtros
  const [acao, setAcao]       = useState("");
  const [recurso, setRecurso] = useState("");
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");

  const LIMIT = 50;

  const fetchAuditoria = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (acao)    sp.set("acao", acao);
      if (recurso) sp.set("recurso", recurso);
      if (from)    sp.set("from", from);
      if (to)      sp.set("to", to);
      const res  = await fetch(`/api/painel/auditoria?${sp}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setRows(data.data ?? []);
        setTotal(data.meta?.pagination?.total ?? 0);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }, [acao, recurso, from, to]);

  useEffect(() => {
    const t = setTimeout(() => fetchAuditoria(1), 300);
    return () => clearTimeout(t);
  }, [fetchAuditoria]);

  function toggleExpand(id: string) {
    setExpandido(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function limparFiltros() {
    setAcao(""); setRecurso(""); setFrom(""); setTo("");
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = !!(acao || recurso || from || to);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <ScrollText className="h-6 w-6 text-brand" />
            Auditoria
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {total.toLocaleString("pt-BR")} evento{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => fetchAuditoria(page)}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Filtros</span>
          {hasFilters && (
            <button
              onClick={limparFiltros}
              className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-white"
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="relative">
            <Activity className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              placeholder="Ação (ex: pedido:criar)"
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={recurso}
              onChange={(e) => setRecurso(e.target.value)}
              placeholder="Recurso (ex: pedidos)"
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white focus:border-brand/50 focus:outline-none"
            />
          </div>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 py-2 pl-8 pr-2 text-xs text-white focus:border-brand/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Nenhum evento encontrado
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r) => {
              const aberto = expandido.has(r.id);
              const cor = corAcao(r.acao);
              const temDados = !!(r.dados_anteriores || r.dados_novos);
              return (
                <div key={r.id}>
                  <button
                    onClick={() => temDados && toggleExpand(r.id)}
                    disabled={!temDados}
                    className={`flex w-full items-start gap-3 px-5 py-3 text-left transition ${temDados ? "hover:bg-white/5" : ""}`}
                  >
                    <div className="flex-shrink-0 pt-0.5">
                      {temDados ? (
                        aberto ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                      ) : (
                        <span className="h-3.5 w-3.5 inline-block" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className={`rounded px-2 py-0.5 text-[11px] font-bold font-mono ${cor.bg} ${cor.text}`}>
                          {r.acao}
                        </code>
                        {r.recurso && (
                          <span className="text-[11px] text-slate-500">
                            {r.recurso}{r.recurso_id ? ` #${r.recurso_id.slice(0, 8)}` : ""}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {fmtDateTime(r.created_at)}
                        {r.usuario_nome && (
                          <> · <User className="inline h-3 w-3" /> {r.usuario_nome}</>
                        )}
                        {r.ip_address && <> · {r.ip_address}</>}
                        {r.duracao_ms != null && <> · {r.duracao_ms}ms</>}
                      </p>
                    </div>
                  </button>

                  {aberto && temDados && (
                    <div className="grid gap-3 border-t border-white/5 bg-slate-950 px-5 py-3 sm:grid-cols-2">
                      {r.dados_anteriores && (
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Antes</p>
                          <pre className="overflow-x-auto rounded-lg bg-white/5 p-2 text-[10px] leading-tight text-slate-300 font-mono">
                            {JSON.stringify(r.dados_anteriores, null, 2)}
                          </pre>
                        </div>
                      )}
                      {r.dados_novos && (
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Depois</p>
                          <pre className="overflow-x-auto rounded-lg bg-white/5 p-2 text-[10px] leading-tight text-brand font-mono">
                            {JSON.stringify(r.dados_novos, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchAuditoria(page - 1)}
              disabled={page === 1 || loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >
              Anterior
            </button>
            <button
              onClick={() => fetchAuditoria(page + 1)}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
