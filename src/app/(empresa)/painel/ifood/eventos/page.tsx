"use client";

/**
 * /painel/ifood/eventos — log estruturado de eventos iFood.
 *
 * Mostra todos eventos recebidos (PLACED, CONFIRMED, CANCELLED, ...)
 * com payload completo, status (processado/erro/pendente), link pro pedido
 * importado.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Zap, RefreshCw, Loader2, Filter, AlertTriangle, CheckCircle2, Clock,
  ArrowLeft, Eye, ChevronLeft, ChevronRight,
} from "lucide-react";
import Link from "next/link";

interface Evento {
  id:               string;
  evento_id:        string;
  tipo:             string;        // PLACED | CONFIRMED | CANCELLED | ...
  pedido_ifood_id:  string | null;
  pedido_id:        string | null; // FK pra pedidos.id (interno)
  payload:          Record<string, unknown>;
  processado_em:    string | null;
  ack_em:           string | null;
  erro:             string | null;
  criado_em:        string;
}

interface Stats {
  total_24h:    string;
  pedidos_24h:  string;
  erros_24h:    string;
}

const TIPO_BADGE: Record<string, string> = {
  PLACED:    "border-blue-500/30 bg-blue-500/10 text-blue-300",
  CONFIRMED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CANCELLED: "border-red-500/30 bg-red-500/10 text-red-300",
  DISPATCHED:"border-amber-500/30 bg-amber-500/10 text-amber-300",
  CONCLUDED: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  UNKNOWN:   "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}` };
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function EventosIfoodPage() {
  const [list, setList]       = useState<Evento[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [tipo, setTipo]       = useState("");
  const [apenasErro, setApenasErro] = useState(false);
  const [verPayload, setVerPayload] = useState<Evento | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: "30" });
      if (tipo)      sp.set("tipo", tipo);
      if (apenasErro) sp.set("apenas_erro", "1");
      const r = await fetch(`/api/painel/ifood/eventos?${sp}`, { headers: authHeader() });
      const d = await r.json();
      if (d.success) {
        setList(d.data.eventos ?? []);
        setStats(d.data.stats ?? null);
        setTotal(d.data.total ?? 0);
      }
    } finally { setLoading(false); }
  }, [page, tipo, apenasErro]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalPaginas = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Zap className="h-5 w-5 text-red-400" /> Eventos iFood
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Log de tudo que vem do iFood (polling + simulações)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/painel/ifood"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <ArrowLeft className="h-3.5 w-3.5" /> Config
          </Link>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Stats 24h */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-blue-300">Eventos 24h</p>
            <p className="mt-2 text-2xl font-black text-white">{stats.total_24h}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-emerald-300">Pedidos importados</p>
            <p className="mt-2 text-2xl font-black text-white">{stats.pedidos_24h}</p>
          </div>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-red-300">Erros</p>
            <p className="mt-2 text-2xl font-black text-white">{stats.erros_24h}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select value={tipo} onChange={e => { setTipo(e.target.value); setPage(1); }}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos tipos</option>
          <option value="PLACED">PLACED (novo)</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="DISPATCHED">DISPATCHED</option>
          <option value="CONCLUDED">CONCLUDED</option>
          <option value="CANCELLED">CANCELLED</option>
          <option value="UNKNOWN">UNKNOWN</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={apenasErro}
            onChange={e => { setApenasErro(e.target.checked); setPage(1); }}
            className="accent-red-500" />
          Apenas com erro
        </label>
        {(tipo || apenasErro) && (
          <button onClick={() => { setTipo(""); setApenasErro(false); setPage(1); }}
            className="text-xs text-slate-500 hover:text-white">Limpar</button>
        )}
        <span className="text-xs text-slate-500 ml-auto">{total} evento(s)</span>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-red-500" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Nenhum evento ainda. Configure cred + ative polling em <Link href="/painel/ifood" className="text-emerald-400">/painel/ifood</Link>.
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {list.map(ev => {
              const tipoCor = TIPO_BADGE[ev.tipo] ?? TIPO_BADGE.UNKNOWN;
              const isSim   = ev.evento_id.startsWith("SIM-");
              return (
                <div key={ev.id} className="p-3 grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${tipoCor}`}>
                      {ev.tipo}
                    </span>
                    {isSim && (
                      <span className="ml-1 rounded bg-amber-500/15 px-1 text-[9px] font-bold text-amber-300">
                        SIMUL
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="font-mono text-[10px] text-slate-500 truncate" title={ev.evento_id}>{ev.evento_id}</p>
                    {ev.pedido_ifood_id && (
                      <p className="font-mono text-[10px] text-slate-600 truncate">→ ifood: {ev.pedido_ifood_id}</p>
                    )}
                  </div>
                  <div className="col-span-3 text-slate-400">
                    <p>Recebido: {fmt(ev.criado_em)}</p>
                    {ev.processado_em && (
                      <p className="text-emerald-400 text-[10px]">↗ processado {fmt(ev.processado_em)}</p>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    {ev.erro ? (
                      <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                        <AlertTriangle className="h-3 w-3" /> Erro
                      </span>
                    ) : ev.pedido_id ? (
                      <Link href={`/painel/pedidos`}
                        className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:brightness-110">
                        <CheckCircle2 className="h-3 w-3" /> Importado
                      </Link>
                    ) : ev.ack_em ? (
                      <span className="inline-flex items-center gap-1 rounded border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        ack
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <Clock className="h-3 w-3" /> Pendente
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button onClick={() => setVerPayload(ev)}
                      className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
                      title="Ver payload completo">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {ev.erro && (
                    <div className="col-span-12 mt-1 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[10px] text-red-300 break-words">
                      {ev.erro}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {total > 30 && (
          <div className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-3">
            <p className="text-xs text-slate-500">Página {page} de {totalPaginas}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="rounded border border-white/10 p-1 text-slate-400 hover:bg-white/5 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas}
                className="rounded border border-white/10 p-1 text-slate-400 hover:bg-white/5 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payload viewer */}
      {verPayload && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
             onClick={() => setVerPayload(null)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-white/5 bg-slate-900 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">{verPayload.tipo} · {verPayload.evento_id}</p>
                <p className="text-xs text-slate-500">{fmt(verPayload.criado_em)}</p>
              </div>
              <button onClick={() => setVerPayload(null)}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5">
                Fechar
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-emerald-300 whitespace-pre-wrap break-all">
              {JSON.stringify(verPayload.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
