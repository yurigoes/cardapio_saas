"use client";

/**
 * /admin/retaguardas/[id] — detalhes da retaguarda
 *
 * Mostra métricas em tempo real, identidade, info técnica, e ações:
 *  - Purgar cache (slug específico ou tudo)
 *  - Desativar (soft-delete)
 */
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Server, RefreshCw, Trash2, Trash, Globe, Wifi, Cpu, Database,
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, HardDrive,
  ListChecks, Activity,
} from "lucide-react";
import { confirmar } from "@/components/ui/ConfirmModal";

interface Detalhe {
  id: string;
  retaguarda_id: string;
  empresa_id: string | null;
  empresa_slug: string;
  dominio: string | null;
  ip_publico: string | null;
  versao: string | null;
  primeira_vez: string;
  ultimo_heartbeat: string;
  ativo: boolean;
  segundos_desde: number;
  online: boolean;
  label_status: "online" | "instavel" | "offline";
  metricas: {
    coletado_em?: string;
    queue?: {
      pending?: number;
      sent_total?: number;
      failed_total?: number;
      queued_total?: number;
      last_sent_at?: string | null;
      last_failure?: string | null;
    };
    cache?: {
      html_mb?: number; html_files?: number;
      media_mb?: number; media_files?: number;
      static_mb?: number; static_files?: number;
      total_mb?: number;
    };
  };
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function tempoRel(s: number): string {
  if (s < 60)    return `${s}s atrás`;
  if (s < 3600)  return `${Math.floor(s/60)}min atrás`;
  if (s < 86400) return `${Math.floor(s/3600)}h atrás`;
  return `${Math.floor(s/86400)}d atrás`;
}

export default function RetaguardaDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [data, setData]       = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [busy, setBusy]       = useState<string | null>(null);
  const [purgeSlug, setPurgeSlug] = useState("");
  const [purgeMsg, setPurgeMsg]   = useState("");

  async function load() {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/admin/retaguardas/${params.id}`, { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      if (!d.success) { setErr(d.error || "Erro"); return; }
      setData(d.data);
    } catch { setErr("Erro de conexão"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function purgar(slug: string | null) {
    if (!data) return;
    setBusy("purge"); setPurgeMsg("");
    try {
      const r = await fetch(`/api/admin/retaguardas/${data.id}/purgar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(slug ? { slug } : {}),
      });
      const d = await r.json();
      if (!d.success) { setPurgeMsg("✗ " + (d.error || "Falha")); return; }
      setPurgeMsg(`✓ Purge ok: ${JSON.stringify(d.data?.response ?? d.data)}`);
      setPurgeSlug("");
    } finally { setBusy(null); }
  }

  async function desativar() {
    if (!data) return;
    if (!await confirmar({ titulo: "Desativar retaguarda?", mensagem: "A retaguarda continua rodando, só some da listagem ativa. Pode reativar enviando heartbeat novo.", okLabel: "Desativar", perigo: true })) return;
    setBusy("delete");
    try {
      const r = await fetch(`/api/admin/retaguardas/${data.id}`, { method: "DELETE", headers: authHeaders() });
      const d = await r.json();
      if (d.success) router.push("/admin/retaguardas");
      else setErr(d.error || "Erro");
    } finally { setBusy(null); }
  }

  if (loading && !data) return <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent"/></div>;
  if (err && !data)     return <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">{err}</div>;
  if (!data)            return null;

  const m = data.metricas ?? {};
  const q = m.queue ?? {};
  const c = m.cache ?? {};

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push("/admin/retaguardas")} className="mt-1 rounded-lg border border-white/10 p-2 hover:bg-white/5 transition">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <Server className="h-6 w-6 text-brand" />
              {data.empresa_slug}
            </h1>
            <p className="mt-1 text-sm text-slate-400 font-mono">{data.dominio ?? "(sem domínio)"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}/>
            Atualizar
          </button>
          <button onClick={desativar} disabled={busy === "delete"} className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15 disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5"/>
            Desativar
          </button>
        </div>
      </header>

      {/* Status hero */}
      <section className={`rounded-2xl border p-5 ${
        data.label_status === "online"   ? "border-emerald-400/30 bg-emerald-500/5" :
        data.label_status === "instavel" ? "border-amber-400/30 bg-amber-500/5" :
                                            "border-red-400/30 bg-red-500/5"
      }`}>
        <div className="flex items-center gap-3">
          {data.label_status === "online" ? <CheckCircle2 className="h-6 w-6 text-emerald-400"/>
            : data.label_status === "instavel" ? <Clock className="h-6 w-6 text-amber-400"/>
            : <AlertTriangle className="h-6 w-6 text-red-400"/>}
          <div>
            <p className="text-lg font-bold text-white capitalize">{data.label_status}</p>
            <p className="text-xs text-slate-400">Último heartbeat {tempoRel(data.segundos_desde)}</p>
          </div>
        </div>
      </section>

      {/* Identificação */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card icon={Globe}  label="Domínio"        value={data.dominio ?? "—"} />
        <Card icon={Wifi}   label="IP público"     value={data.ip_publico ?? "—"} mono />
        <Card icon={Cpu}    label="Versão"         value={data.versao ?? "—"} />
        <Card icon={Database} label="Retaguarda ID" value={data.retaguarda_id.slice(0,8)+"…"} mono />
      </section>

      {/* Queue offline */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3">
          <ListChecks className="h-4 w-4 text-brand"/>
          Buffer offline (worker)
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Pendentes"        value={q.pending ?? 0} highlight={Number(q.pending ?? 0) > 0 ? "amber" : undefined}/>
          <Stat label="Já enviados"      value={q.sent_total ?? 0}/>
          <Stat label="Falhados (dead)"  value={q.failed_total ?? 0} highlight={Number(q.failed_total ?? 0) > 0 ? "red" : undefined}/>
          <Stat label="Total enfileirado" value={q.queued_total ?? 0}/>
        </div>
        {q.last_sent_at  && <p className="mt-2 text-xs text-slate-500">Último envio ok: {new Date(q.last_sent_at).toLocaleString("pt-BR")}</p>}
        {q.last_failure  && <p className="mt-1 text-xs text-red-400 break-all">Última falha: {q.last_failure}</p>}
      </section>

      {/* Cache */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3">
          <HardDrive className="h-4 w-4 text-brand"/>
          Cache em disco
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="HTML (cardápio)"  value={`${c.html_mb ?? 0} MB`} sub={`${c.html_files ?? 0} arq.`}/>
          <Stat label="Mídia (imagens)"  value={`${c.media_mb ?? 0} MB`} sub={`${c.media_files ?? 0} arq.`}/>
          <Stat label="Estáticos (Next)" value={`${c.static_mb ?? 0} MB`} sub={`${c.static_files ?? 0} arq.`}/>
          <Stat label="Total"            value={`${c.total_mb ?? 0} MB`} highlight="brand"/>
        </div>
      </section>

      {/* Ações: purge */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3">
          <Trash className="h-4 w-4 text-brand"/>
          Invalidar cache remotamente
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Força refresh do cache HTML na retaguarda. Útil após mudança grande no cardápio sem esperar TTL 5min.
        </p>
        <div className="flex gap-2">
          <input
            value={purgeSlug}
            onChange={e => setPurgeSlug(e.target.value)}
            placeholder="slug específico (vazio = purga tudo)"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none"
          />
          <button
            onClick={() => purgar(purgeSlug || null)}
            disabled={busy === "purge"}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy === "purge" ? "Purgando..." : "Purgar"}
          </button>
        </div>
        {purgeMsg && (
          <p className={`mt-3 text-xs ${purgeMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{purgeMsg}</p>
        )}
      </section>

      {/* Histórico raw */}
      <section className="rounded-2xl border border-white/5 bg-white/5 p-5 text-xs text-slate-500">
        <p>Primeira ativação: {new Date(data.primeira_vez).toLocaleString("pt-BR")}</p>
        <p>Status master: {data.ativo ? "ativa" : "desativada"}</p>
        {m.coletado_em && <p>Métricas coletadas em: {new Date(m.coletado_em).toLocaleString("pt-BR")}</p>}
      </section>
    </div>
  );
}

function Card({ icon: Icon, label, value, mono }: { icon: React.ComponentType<{className?:string}>; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3"/>
        {label}
      </div>
      <p className={`mt-1 text-sm text-white break-all ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: number | string; sub?: string; highlight?: "amber" | "red" | "brand" }) {
  const color = highlight === "amber" ? "text-amber-400"
              : highlight === "red"   ? "text-red-400"
              : highlight === "brand" ? "text-brand"
              : "text-white";
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
