"use client";

/**
 * Bolinha de status do agente de impressão.
 * Verde = pelo menos 1 agente pingou nos últimos 60s.
 * Amarelo = todos offline.
 * Cinza = nenhum cadastrado (esconde por padrão).
 *
 * Faz polling de /api/painel/print-agents a cada 20s.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";

type Status = "online" | "offline" | "vazio" | "loading";

interface AgentRow { ultimo_ping: string | null; ativo: boolean }

function classify(rows: AgentRow[]): Status {
  if (rows.length === 0) return "vazio";
  const ativos = rows.filter(a => a.ativo);
  if (ativos.length === 0) return "vazio";
  const agora = Date.now();
  const algumOnline = ativos.some(a => a.ultimo_ping && (agora - new Date(a.ultimo_ping).getTime() < 60_000));
  return algumOnline ? "online" : "offline";
}

export function PrintAgentStatus({ hideWhenEmpty = true }: { hideWhenEmpty?: boolean }) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let alive = true;
    const carregar = async () => {
      try {
        const t = localStorage.getItem("access_token") ?? "";
        const r = await fetch("/api/painel/print-agents", {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!r.ok) { if (alive) setStatus("vazio"); return; }
        const d = await r.json();
        if (!alive) return;
        setStatus(classify(d.data ?? []));
      } catch {
        if (alive) setStatus("vazio");
      }
    };
    carregar();
    const i = setInterval(carregar, 20_000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  if (status === "loading") return null;
  if (status === "vazio" && hideWhenEmpty) return null;

  const label =
    status === "online"  ? "Agente impressão online"  :
    status === "offline" ? "Agente impressão offline" :
                           "Sem agente de impressão";

  const dotColor =
    status === "online"  ? "bg-emerald-400" :
    status === "offline" ? "bg-amber-400"   :
                           "bg-slate-500";

  const ringColor =
    status === "online"  ? "ring-emerald-400/30" :
    status === "offline" ? "ring-amber-400/30"   :
                           "ring-slate-600/30";

  return (
    <Link
      href="/painel/impressoras"
      title={`${label} — clique para configurar`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/10 transition ring-1 ${ringColor}`}
    >
      <span className={`relative inline-flex h-2 w-2`}>
        {status === "online" && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      <Printer className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
