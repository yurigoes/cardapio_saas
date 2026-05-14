"use client";

/**
 * /admin/email/logs — consulta jobs de e-mail
 *
 * Filtros: status (pendente/enviando/enviado/erro), evento.
 * Ações: retry manual de jobs com erro.
 */
import { useEffect, useState, useCallback } from "react";
import {
  ScrollText, ArrowLeft, RefreshCw, Filter, ChevronLeft, ChevronRight,
  Loader2, CheckCircle2, XCircle, Clock, Send,
} from "lucide-react";
import Link from "next/link";

interface Log {
  id:             string;
  para:           string;
  assunto:        string;
  evento:         string | null;
  status:         "pendente" | "enviando" | "enviado" | "erro";
  tentativas:     number;
  max_tentativas: number;
  proximo_em:     string | null;
  enviado_em:     string | null;
  erro:           string | null;
  message_id:     string | null;
  created_at:     string;
}

function authHeader(): HeadersInit {
  const t = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
  return { Authorization: `Bearer ${t}` };
}

const STATUS_BADGE: Record<Log["status"], { label: string; cor: string; icon: React.ElementType }> = {
  pendente:  { label: "Pendente",  cor: "border-slate-500/30 bg-slate-500/10 text-slate-300", icon: Clock },
  enviando:  { label: "Enviando",  cor: "border-blue-500/30 bg-blue-500/10 text-blue-300",    icon: Loader2 },
  enviado:   { label: "Enviado",   cor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: CheckCircle2 },
  erro:      { label: "Erro",      cor: "border-red-500/30 bg-red-500/10 text-red-300",       icon: XCircle },
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function LogsPage() {
  const [logs, setLogs]       = useState<Log[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [status, setStatus]   = useState<string>("");
  const [evento, setEvento]   = useState<string>("");
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: "30" });
      if (status) sp.set("status", status);
      if (evento) sp.set("evento", evento);
      const r = await fetch(`/api/admin/email/logs?${sp}`, { headers: authHeader() });
      const d = await r.json();
      if (d.success) {
        setLogs(d.data.logs ?? []);
        setTotal(d.data.total ?? 0);
      }
    } finally { setLoading(false); }
  }, [page, status, evento]);

  useEffect(() => { carregar(); }, [carregar]);

  async function retry(id: string) {
    // Reseta job pra pendente
    await fetch(`/api/admin/email/logs?id=${id}&action=retry`, {
      method: "POST", headers: authHeader(),
    }).catch(() => {});
    carregar();
  }

  const totalPaginas = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <ScrollText className="h-5 w-5 text-emerald-400" /> Logs de e-mail
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total} job(s) registrado(s){status && ` · status="${status}"`}{evento && ` · evento="${evento}"`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/email"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Link>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="enviando">Enviando</option>
          <option value="enviado">Enviado</option>
          <option value="erro">Erro</option>
        </select>
        <select value={evento} onChange={e => { setEvento(e.target.value); setPage(1); }}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white">
          <option value="">Todos eventos</option>
          <option value="boas_vindas">Boas-vindas</option>
          <option value="reset_senha">Reset senha</option>
          <option value="pagamento_ok">Pagamento OK</option>
          <option value="pagamento_falhou">Pagamento falhou</option>
          <option value="trial_expirando">Trial expirando</option>
          <option value="manutencao_aviso">Manutenção</option>
          <option value="manual">Manual</option>
        </select>
        {(status || evento) && (
          <button onClick={() => { setStatus(""); setEvento(""); setPage(1); }}
            className="text-xs text-slate-500 hover:text-white ml-2">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Nenhum job nesse filtro</p>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map(j => {
              const cfg = STATUS_BADGE[j.status];
              const Icon = cfg.icon;
              return (
                <div key={j.id} className="p-3 grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold ${cfg.cor}`}>
                      <Icon className={`h-3 w-3 ${j.status === "enviando" ? "animate-spin" : ""}`} />
                      {cfg.label}
                    </span>
                    {j.evento && (
                      <p className="mt-1 text-[10px] font-mono text-slate-500 truncate">{j.evento}</p>
                    )}
                  </div>
                  <div className="col-span-3 min-w-0">
                    <p className="text-white truncate">{j.para}</p>
                    <p className="text-[10px] text-slate-500 truncate">{j.assunto}</p>
                  </div>
                  <div className="col-span-2 text-slate-400">
                    <p>{fmt(j.created_at)}</p>
                    {j.enviado_em && <p className="text-emerald-400 text-[10px]">↗ {fmt(j.enviado_em)}</p>}
                    {j.proximo_em && j.status === "pendente" && (
                      <p className="text-slate-500 text-[10px]">próximo: {fmt(j.proximo_em)}</p>
                    )}
                  </div>
                  <div className="col-span-1 text-center text-slate-300">
                    {j.tentativas}/{j.max_tentativas}
                  </div>
                  <div className="col-span-3 min-w-0">
                    {j.erro && (
                      <p className="text-red-400 text-[10px] break-words">{j.erro}</p>
                    )}
                    {j.message_id && (
                      <p className="font-mono text-[10px] text-slate-600 truncate">{j.message_id}</p>
                    )}
                  </div>
                  <div className="col-span-1 text-right">
                    {j.status === "erro" && (
                      <button onClick={() => retry(j.id)}
                        title="Retry"
                        className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/5 hover:text-emerald-400">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paginação */}
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
    </div>
  );
}
