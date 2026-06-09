/**
 * Componentes premium reutilizáveis pro admin.
 * Padrão: glass + gradients + sombras coloridas.
 */
"use client";

import { Loader2, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/* ─── PageHeader ──────────────────────────────────────────────────── */
export function PageHeader({
  icon: Icon, title, subtitle, badge, actions,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/30">
            <Icon className="h-5 w-5 text-brand-light" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ─── PrimaryButton ───────────────────────────────────────────────── */
export function PrimaryBtn({
  children, onClick, icon: Icon = Plus, disabled, busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:shadow-brand/50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function GhostBtn({
  children, onClick, icon: Icon, disabled, busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:border-white/25 hover:bg-white/10 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ─── GlassCard ───────────────────────────────────────────────────── */
export function GlassCard({
  children, className = "", hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md ${
      hover ? "transition hover:border-brand/30 hover:bg-white/[0.08]" : ""
    } ${className}`}>{children}</div>
  );
}

/* ─── Table premium ───────────────────────────────────────────────── */
export function PremiumTable({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
      {empty}
    </div>
  );
}

export function THead({ cols }: { cols: string[] }) {
  return (
    <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
      <tr>{cols.map((c, i) => <th key={i} className="px-4 py-3 font-semibold">{c}</th>)}</tr>
    </thead>
  );
}

export function TRow({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-t border-white/5 transition ${onClick ? "cursor-pointer hover:bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}
    >
      {children}
    </tr>
  );
}

/* ─── StatusBadge ─────────────────────────────────────────────────── */
type StatusColor = "emerald" | "amber" | "red" | "slate" | "violet" | "cyan" | "blue";

const STATUS_BG: Record<StatusColor, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
  amber:   "bg-amber-500/15 text-amber-300 ring-amber-500/25",
  red:     "bg-red-500/15 text-red-300 ring-red-500/25",
  slate:   "bg-slate-500/15 text-slate-300 ring-slate-500/25",
  violet:  "bg-violet-500/15 text-violet-300 ring-violet-500/25",
  cyan:    "bg-cyan-500/15 text-cyan-300 ring-cyan-500/25",
  blue:    "bg-blue-500/15 text-blue-300 ring-blue-500/25",
};

export function StatusBadge({ label, color = "slate", dot }: { label: string; color?: StatusColor; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_BG[color]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${
        color === "emerald" ? "bg-emerald-400" :
        color === "amber"   ? "bg-amber-400" :
        color === "red"     ? "bg-red-400" :
        color === "violet"  ? "bg-violet-400" :
        color === "cyan"    ? "bg-cyan-400" :
        color === "blue"    ? "bg-blue-400" : "bg-slate-400"
      }`} />}
      {label}
    </span>
  );
}

/* ─── EmptyState ──────────────────────────────────────────────────── */
export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-10 w-10 text-slate-500" />}
      <p className="font-semibold text-slate-300">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ─── SearchInput ─────────────────────────────────────────────────── */
export function SearchInput({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-brand/40 focus:bg-white/10"
    />
  );
}
