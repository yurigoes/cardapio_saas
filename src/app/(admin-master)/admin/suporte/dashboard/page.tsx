"use client";

/**
 * /admin/suporte/dashboard — TV grande pra equipe acompanhar fila
 *
 * Modo kiosk: tela cheia, fonte grande, atualiza a cada 5s, alerta sonoro
 * em chamado urgente novo.
 */
import { useEffect, useRef, useState } from "react";
import { Inbox, Clock, AlertTriangle, CheckCircle2, Activity, Maximize2 } from "lucide-react";

interface Chamado {
  id:           string;
  assunto:      string;
  prioridade:   string;
  status:       string;
  empresa_nome: string;
  criado_em:    string;
  atualizado_em: string;
  msgs_nao_lidas: string;
  atribuido_nome: string | null;
}

interface Stats {
  abertos: number;
  em_andamento: number;
  aguardando: number;
  resolvidos_hoje: number;
  fechados_hoje: number;
  urgentes: number;
  tempo_medio_resposta: number; // minutos
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function tempoAtras(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function playAlerta() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1100, 1320].forEach((freq, i) => {
      setTimeout(() => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine"; o.frequency.value = freq; g.gain.value = 0.4;
        o.start(); o.stop(ctx.currentTime + 0.2);
      }, i * 250);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {/* */}
}

const PRIORIDADE_COR: Record<string, string> = {
  urgente: "bg-red-500/20 border-red-500/50 text-red-300",
  alta:    "bg-amber-500/20 border-amber-500/50 text-amber-300",
  normal:  "bg-blue-500/20 border-blue-500/50 text-blue-300",
  baixa:   "bg-slate-500/20 border-slate-500/50 text-slate-300",
};

const STATUS_COR: Record<string, string> = {
  aberto:             "bg-emerald-500",
  em_andamento:       "bg-blue-500",
  aguardando_cliente: "bg-amber-500",
  resolvido:          "bg-purple-500",
  fechado:            "bg-slate-600",
};

export default function DashboardSuportePage() {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const seenUrgentes = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);

  async function carregar() {
    try {
      const r = await fetch("/api/painel/suporte/chamados", { headers: authHeaders(), cache: "no-store" });
      const d = await r.json();
      if (!d.success) return;
      const lista: Chamado[] = d.data.chamados ?? [];
      setChamados(lista);

      // Calcula stats
      const hoje = new Date().toDateString();
      const s: Stats = {
        abertos:        lista.filter(c => c.status === "aberto").length,
        em_andamento:   lista.filter(c => c.status === "em_andamento").length,
        aguardando:     lista.filter(c => c.status === "aguardando_cliente").length,
        resolvidos_hoje: lista.filter(c => c.status === "resolvido" && new Date(c.atualizado_em).toDateString() === hoje).length,
        fechados_hoje:  lista.filter(c => c.status === "fechado"   && new Date(c.atualizado_em).toDateString() === hoje).length,
        urgentes:       lista.filter(c => c.prioridade === "urgente" && c.status !== "fechado" && c.status !== "resolvido").length,
        tempo_medio_resposta: 0,
      };
      setStats(s);

      // Beep em urgente novo (não na primeira passagem)
      const urgentesAbertos = lista.filter(c =>
        c.prioridade === "urgente" && c.status !== "fechado" && c.status !== "resolvido"
      );
      if (firstRun.current) {
        urgentesAbertos.forEach(c => seenUrgentes.current.add(c.id));
        firstRun.current = false;
      } else {
        const novos = urgentesAbertos.filter(c => !seenUrgentes.current.has(c.id));
        if (novos.length > 0) {
          novos.forEach(c => seenUrgentes.current.add(c.id));
          playAlerta();
        }
      }
    } catch {/* */}
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 5000);
    return () => clearInterval(t);
  }, []);

  function fullscreen() {
    document.documentElement.requestFullscreen?.();
  }

  const ativos = chamados.filter(c => c.status !== "fechado" && c.status !== "resolvido").slice(0, 12);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Central de Suporte</h1>
          <p className="text-sm text-slate-400">{new Date().toLocaleString("pt-BR")} · atualiza a cada 5s</p>
        </div>
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-emerald-400 animate-pulse" />
          <button onClick={fullscreen} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5">
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Stat icon={Inbox}          label="Abertos"      valor={stats?.abertos ?? 0}      cor="text-emerald-400" />
        <Stat icon={Activity}       label="Em andamento" valor={stats?.em_andamento ?? 0} cor="text-blue-400" />
        <Stat icon={Clock}          label="Aguardando"   valor={stats?.aguardando ?? 0}   cor="text-amber-400" />
        <Stat icon={AlertTriangle}  label="URGENTES"     valor={stats?.urgentes ?? 0}     cor="text-red-400 animate-pulse" />
        <Stat icon={CheckCircle2}   label="Resolvidos hoje" valor={stats?.resolvidos_hoje ?? 0} cor="text-purple-400" />
        <Stat icon={CheckCircle2}   label="Fechados hoje"   valor={stats?.fechados_hoje ?? 0}   cor="text-slate-400" />
      </div>

      {/* Chamados ativos */}
      <h2 className="text-lg font-semibold mb-3 text-slate-300">Fila ativa ({ativos.length})</h2>
      {ativos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900 p-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-3" />
          <p className="text-2xl font-bold text-emerald-300">Tudo em dia! 🎉</p>
          <p className="text-sm text-slate-400 mt-1">Nenhum chamado pendente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ativos.map(c => {
            const naoLidas = parseInt(c.msgs_nao_lidas);
            return (
              <div key={c.id}
                className={`rounded-xl border-2 p-4 ${PRIORIDADE_COR[c.prioridade] ?? PRIORIDADE_COR.normal} ${
                  c.prioridade === "urgente" ? "animate-pulse" : ""
                }`}>
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${STATUS_COR[c.status]} text-white`}>
                    {c.status.replace("_", " ")}
                  </span>
                  {naoLidas > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {naoLidas}
                    </span>
                  )}
                </div>
                <p className="font-bold text-base mb-1 line-clamp-2">{c.assunto}</p>
                <p className="text-xs opacity-75 mb-2">{c.empresa_nome}</p>
                <div className="flex items-center justify-between text-[10px] opacity-60">
                  <span>{tempoAtras(c.criado_em)} atrás</span>
                  {c.atribuido_nome && <span>→ {c.atribuido_nome}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, valor, cor }: {
  icon: React.ComponentType<{ className?: string }>; label: string; valor: number; cor: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${cor}`} />
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}
