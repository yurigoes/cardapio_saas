"use client";
import { useState, useEffect } from "react";
import { Activity, AlertTriangle, CheckCircle2, MonitorPlay, Megaphone, FileText } from "lucide-react";

function aapi(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

interface Health {
  ok: boolean; score: number; status: "saudavel" | "atencao" | "critico";
  telas: { total: number; online: number; offline: number; problemas: number };
  campanhas: { total: number; no_ar: number; vencendo: number; arte_pendente: number; pgto_pendente: number };
  anunciantes: number; chamados: number; problemas_total: number;
}

export function HealthcheckBar({ token }: { token: string }) {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    async function load() { try { const r = await aapi(token, "/api/admin/healthcheck"); const d = await r.json(); if (d.ok) setH(d); } catch {} }
    load(); const t = setInterval(load, 60_000); return () => clearInterval(t);
  }, [token]);
  if (!h) return null;
  const cor = h.status === "saudavel" ? "emerald" : h.status === "atencao" ? "amber" : "red";
  const corClasses = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    red: "border-red-500/30 bg-red-500/10 text-red-200",
  }[cor];
  const Icone = h.status === "saudavel" ? CheckCircle2 : h.status === "atencao" ? Activity : AlertTriangle;

  return (
    <div className={`mb-4 rounded-2xl border p-4 ${corClasses}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icone className="h-7 w-7" />
          <div>
            <p className="text-lg font-bold">
              {h.status === "saudavel" ? "Sistema saudável" : h.status === "atencao" ? "Atenção necessária" : "Problemas críticos"}
            </p>
            <p className="text-xs opacity-80">Score: {h.score}/100 · {h.problemas_total} item(ns) pra ação</p>
          </div>
        </div>
        <div className="hidden gap-4 sm:flex">
          <Indicador label="Telas" valor={`${h.telas.online}/${h.telas.total}`} sub={h.telas.problemas > 0 ? `${h.telas.problemas} off há +1h` : "OK"} alerta={h.telas.problemas > 0} icone={<MonitorPlay className="h-4 w-4" />} />
          <Indicador label="Campanhas" valor={String(h.campanhas.no_ar)} sub={h.campanhas.vencendo > 0 ? `${h.campanhas.vencendo} vencendo` : "OK"} alerta={h.campanhas.vencendo > 0} icone={<Megaphone className="h-4 w-4" />} />
          <Indicador label="Pra aprovar" valor={String(h.campanhas.arte_pendente)} sub={h.campanhas.arte_pendente > 0 ? "ação pendente" : "OK"} alerta={h.campanhas.arte_pendente > 0} icone={<FileText className="h-4 w-4" />} />
        </div>
      </div>
    </div>
  );
}
function Indicador({ label, valor, sub, alerta, icone }: { label: string; valor: string; sub: string; alerta: boolean; icone: React.ReactNode }) {
  return (
    <div className="text-right">
      <p className="flex items-center justify-end gap-1 text-xs opacity-80">{icone} {label}</p>
      <p className="text-lg font-bold">{valor}</p>
      <p className={`text-[10px] ${alerta ? "text-amber-300" : "opacity-60"}`}>{sub}</p>
    </div>
  );
}
