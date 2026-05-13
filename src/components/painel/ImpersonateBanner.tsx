"use client";

/**
 * ImpersonateBanner — banner persistente quando master está "vestindo" empresa.
 *
 * Como funciona:
 *  - Ao impersonar, /admin/empresas troca o access_token e SALVA o original em
 *    localStorage 'master_token_backup'.
 *  - Banner detecta a presença desse backup + decodifica o token atual.
 *  - Botão "Voltar para master" restaura o backup.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";

interface JwtPayload {
  empresaId?: string;
  nome?:      string;
  impersonating?: boolean;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch { return null; }
}

export function ImpersonateBanner() {
  const [info, setInfo] = useState<{ nome: string } | null>(null);

  useEffect(() => {
    const token  = localStorage.getItem("access_token");
    const backup = localStorage.getItem("master_token_backup");
    if (!token || !backup) return;
    const payload = decodeJwt(token);
    if (payload?.impersonating) {
      setInfo({ nome: payload.nome ?? "empresa" });
    }
  }, []);

  function voltarParaMaster() {
    const backup = localStorage.getItem("master_token_backup");
    if (!backup) return;
    localStorage.setItem("access_token", backup);
    localStorage.removeItem("master_token_backup");
    window.location.href = "/admin";
  }

  if (!info) return null;

  // Pega só a parte depois da seta (nome da empresa)
  const empresaNome = info.nome.includes("→")
    ? info.nome.split("→").pop()?.trim()
    : info.nome;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center gap-3">
      <Building2 className="h-5 w-5 text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-amber-300">
          Modo impersonação ativo
        </p>
        <p className="text-xs text-amber-200/80 truncate">
          Você está operando como <span className="font-semibold">{empresaNome}</span> —
          ações ficam registradas com seu usuário master.
        </p>
      </div>
      <button
        onClick={voltarParaMaster}
        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:brightness-110 transition flex-shrink-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para master
      </button>
    </div>
  );
}
