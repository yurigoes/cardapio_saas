"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogIn, Megaphone, ShieldCheck, ChevronDown } from "lucide-react";

export function LoginDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10"
      >
        <LogIn className="h-4 w-4" /> Entrar
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/20 bg-[#0a0a12]/90 shadow-2xl ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150">
          <Link
            href="/painel"
            onClick={() => setOpen(false)}
            className="group flex items-start gap-3 border-b border-white/10 p-4 transition hover:bg-white/10"
          >
            <div className="rounded-lg bg-brand/20 p-2 ring-1 ring-brand/30">
              <Megaphone className="h-5 w-5 text-brand-light" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Sou anunciante</p>
              <p className="text-xs text-slate-400">Gerencie suas campanhas, artes e relatórios</p>
            </div>
          </Link>
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="group flex items-start gap-3 p-4 transition hover:bg-white/10"
          >
            <div className="rounded-lg bg-emerald-500/20 p-2 ring-1 ring-emerald-500/30">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Sou admin</p>
              <p className="text-xs text-slate-400">Painel operacional da rede</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
