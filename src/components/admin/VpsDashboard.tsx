"use client";

/**
 * Dashboard visual do VPS — gauges/gráficos consumindo dados do
 * vps-agent. Auto-refresh a cada 30s. Renderiza:
 *   - Gauge de uso de disco (donut SVG)
 *   - Bar de RAM
 *   - Cards: uptime, CPU load, containers
 *   - Speedtest se disponível
 *
 * Não usa lib de gráficos — SVG nativo + tailwind.
 */
import { useEffect, useState, useCallback } from "react";
import { HardDrive, Cpu, Activity, Server, Clock, Wifi } from "lucide-react";

interface Status {
  hostname: string;
  uptime_sec: number;
  memoria: { total_mb: number; livre_mb: number; uso_pct: number };
  cpu:     { cores: number; load1: string; load5: string; load15: string };
  docker_version: string | null;
}
interface DiskRow {
  source: string; target: string; fstype: string;
  size_gb: string; used_gb: string; avail_gb: string; uso_pct: number;
}
interface DockerRow { Names: string; Status: string; Image: string }
interface Speed { download_mbps: string; tempo_s: string }

interface DashboardProps {
  agentOnline: boolean;
  exec: (comando: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export function VpsDashboard({ agentOnline, exec }: DashboardProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [disks,  setDisks]  = useState<DiskRow[]>([]);
  const [docker, setDocker] = useState<DockerRow[]>([]);
  const [speed,  setSpeed]  = useState<Speed | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    if (!agentOnline) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, d, dk] = await Promise.all([
        exec("status").catch(() => null),
        exec("disk").catch(() => null),
        exec("docker_ps").catch(() => null),
      ]);
      if (s)  setStatus(s as Status);
      if (Array.isArray(d))  setDisks(d as DiskRow[]);
      if (Array.isArray(dk)) setDocker(dk as DockerRow[]);
      setUpdatedAt(new Date());
    } finally { setLoading(false); }
  }, [agentOnline, exec]);

  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 30_000);
    return () => clearInterval(i);
  }, [carregar]);

  if (!agentOnline) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
        <Server className="h-10 w-10 text-amber-400 mx-auto mb-2" />
        <p className="font-bold text-white">Aguardando agente VPS conectar</p>
        <p className="text-sm text-amber-200 mt-1">
          Configure e inicie o vps-agent (instruções no card abaixo).
        </p>
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-32 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        ))}
      </div>
    );
  }

  const containersUp = docker.filter(c => c.Status?.startsWith("Up")).length;

  return (
    <div className="space-y-4">
      {/* Cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={Clock} titulo="Uptime"
          valor={status ? formatUptime(status.uptime_sec) : "—"}
          subtitulo={status?.hostname} />
        <Card icon={Cpu}   titulo="CPU Load"
          valor={status ? `${status.cpu.load5}` : "—"}
          subtitulo={status ? `${status.cpu.cores} cores · 1m: ${status.cpu.load1}` : ""}
          alerta={status && parseFloat(status.cpu.load5) > 2 ? "warn" : "ok"} />
        <Card icon={Activity} titulo="Containers"
          valor={`${containersUp}/${docker.length}`}
          subtitulo="rodando / total" />
        <Card icon={Server} titulo="Docker"
          valor={status?.docker_version?.split(" ")[2]?.replace(",", "") ?? "—"}
          subtitulo={status?.docker_version ? "instalado" : "não detectado"} />
      </div>

      {/* RAM bar grande */}
      {status && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Cpu className="h-4 w-4" /> Memória RAM
            </h3>
            <span className="text-xs text-slate-500">
              {status.memoria.livre_mb.toLocaleString("pt-BR")} MB livres de {status.memoria.total_mb.toLocaleString("pt-BR")} MB
            </span>
          </div>
          <BarUso pct={status.memoria.uso_pct} label={`${status.memoria.uso_pct}% em uso`} />
        </div>
      )}

      {/* Discos com donut */}
      {disks.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
            <HardDrive className="h-4 w-4" /> Armazenamento
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {disks.map(d => (
              <DiscoDonut key={d.source} disk={d} />
            ))}
          </div>
        </div>
      )}

      {/* Speed test */}
      {speed && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <Wifi className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-bold text-white">Última velocidade: {speed.download_mbps} Mbps</p>
            <p className="text-xs text-emerald-200">Medido em {speed.tempo_s}s</p>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 text-right">
        {updatedAt ? `Atualizado ${updatedAt.toLocaleTimeString("pt-BR")}` : ""}
        {" · "}auto-refresh 30s
      </p>
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────

function Card({
  icon: Icon, titulo, valor, subtitulo, alerta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string; valor: string;
  subtitulo?: string | null;
  alerta?: "ok" | "warn" | "erro";
}) {
  const corBorda = alerta === "warn" ? "border-amber-500/30 bg-amber-500/5"
                : alerta === "erro" ? "border-red-500/30 bg-red-500/5"
                : "border-white/10 bg-white/5";
  return (
    <div className={`rounded-2xl border p-4 ${corBorda}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="text-xs uppercase font-semibold text-slate-500">{titulo}</p>
      </div>
      <p className="text-2xl font-bold text-white">{valor}</p>
      {subtitulo && <p className="text-xs text-slate-500 mt-1 truncate">{subtitulo}</p>}
    </div>
  );
}

function BarUso({ pct, label }: { pct: number; label: string }) {
  const cor = pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${cor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-2">{label}</p>
    </div>
  );
}

function DiscoDonut({ disk }: { disk: DiskRow }) {
  const pct = disk.uso_pct;
  const r = 36, c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const cor = pct > 90 ? "stroke-red-500" : pct > 75 ? "stroke-amber-500" : "stroke-emerald-500";

  return (
    <div className="rounded-xl bg-slate-900/50 p-4 flex items-center gap-4">
      <svg width="90" height="90" viewBox="0 0 90 90" className="flex-shrink-0">
        <circle cx="45" cy="45" r={r} fill="none" className="stroke-slate-700" strokeWidth="8" />
        <circle cx="45" cy="45" r={r} fill="none" className={cor} strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 45 45)" style={{ transition: "stroke-dashoffset 0.5s" }} />
        <text x="45" y="48" textAnchor="middle" className="fill-white text-lg font-bold">
          {pct}%
        </text>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate" title={disk.target}>{disk.target}</p>
        <p className="text-xs text-slate-400 truncate">{disk.source} · {disk.fstype}</p>
        <p className="text-xs text-slate-300 mt-1">
          {disk.used_gb} GB / {disk.size_gb} GB
        </p>
        <p className="text-xs text-emerald-400">
          {disk.avail_gb} GB livres
        </p>
      </div>
    </div>
  );
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
