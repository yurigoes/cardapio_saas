"use client";

/**
 * /admin/permissoes — Master ajusta permissões por role ou por usuário individual.
 *
 * Modelo:
 * - Cada role tem permissões default (PERMISSOES_POR_ROLE em rbac.ts)
 * - Master pode adicionar override allow/deny por role (afeta todos da role)
 * - Master pode adicionar override allow/deny por usuário (mais específico)
 *
 * Precedência: user override > role override > default da role.
 */
import { useEffect, useState, useCallback } from "react";
import { Shield, RefreshCw, Plus, Trash2, Check, X, ChevronDown } from "lucide-react";

interface Override {
  permissao: string;
  acao:      "allow" | "deny";
  motivo:    string | null;
  criado_em: string;
}

interface Snapshot {
  escopo:                 "role" | "user";
  escopo_id:              string;
  defaults:               string[];
  overrides:              Override[];
  permissoes_disponiveis: string[];
}

const ROLES = ["master","suporte","admin","gerente","garcom","cozinha","atendente","financeiro","delivery","motoboy","cliente"];

interface Usuario { id: string; nome: string; email: string; role: string; empresa_nome: string | null; }

function authH(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function PermissoesPage() {
  const [escopo, setEscopo]     = useState<"role" | "user">("role");
  const [escopoId, setEscopoId] = useState<string>("admin");
  const [snap, setSnap]         = useState<Snapshot | null>(null);
  const [loading, setLoading]   = useState(false);

  // Pra escopo=user
  const [busca, setBusca]       = useState("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/permissoes?escopo=${escopo}&escopo_id=${encodeURIComponent(escopoId)}`,
        { headers: authH(), cache: "no-store" }
      );
      const d = await r.json();
      if (d.success) setSnap(d.data);
    } finally { setLoading(false); }
  }, [escopo, escopoId]);

  useEffect(() => { if (escopoId) carregar(); }, [carregar, escopoId]);

  // Busca usuários quando escopo=user
  useEffect(() => {
    if (escopo !== "user") return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (busca) sp.set("search", busca);
      sp.set("limit", "20");
      fetch(`/api/admin/usuarios?${sp}`, { headers: authH() })
        .then(r => r.json())
        .then(d => { if (d.success) setUsuarios(d.data ?? []); });
    }, 300);
    return () => clearTimeout(t);
  }, [escopo, busca]);

  async function setOverride(permissao: string, acao: "allow" | "deny" | null) {
    if (acao === null) {
      // Remove
      await fetch(
        `/api/admin/permissoes?escopo=${escopo}&escopo_id=${encodeURIComponent(escopoId)}&permissao=${permissao}`,
        { method: "DELETE", headers: authH() }
      );
    } else {
      await fetch("/api/admin/permissoes", {
        method:  "POST",
        headers: { ...authH(), "Content-Type": "application/json" },
        body:    JSON.stringify({ escopo, escopo_id: escopoId, permissao, acao }),
      });
    }
    carregar();
  }

  // Status efetivo da permissão pra UI
  function getEffectiveState(perm: string): "allow_default" | "allow_override" | "deny_override" | "off" {
    const ov = snap?.overrides.find(o => o.permissao === perm);
    if (ov) return ov.acao === "allow" ? "allow_override" : "deny_override";
    if (escopo === "role" && snap?.defaults.includes(perm)) return "allow_default";
    return "off";
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Shield className="h-5 w-5 text-emerald-400" /> Permissões
        </h1>
        <p className="text-sm text-slate-400">
          Master ajusta permissões por role inteira ou por usuário específico (override).
          Precedência: usuário &gt; role &gt; default.
        </p>
      </header>

      {/* Seletor de escopo */}
      <div className="rounded-xl border border-white/10 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Tipo:</span>
          <button onClick={() => { setEscopo("role"); setEscopoId("admin"); }}
            className={`rounded px-3 py-1.5 text-xs ${escopo === "role"
              ? "bg-emerald-500 text-white"
              : "border border-white/10 text-slate-300 hover:bg-white/5"}`}>
            Por Role (afeta todos da role)
          </button>
          <button onClick={() => { setEscopo("user"); setEscopoId(""); }}
            className={`rounded px-3 py-1.5 text-xs ${escopo === "user"
              ? "bg-emerald-500 text-white"
              : "border border-white/10 text-slate-300 hover:bg-white/5"}`}>
            Por Usuário (override individual)
          </button>
        </div>

        {escopo === "role" ? (
          <select value={escopoId} onChange={e => setEscopoId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <div className="space-y-2">
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Busca usuário (nome ou email)..."
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
            {usuarios.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-lg border border-white/5 divide-y divide-white/5">
                {usuarios.map(u => (
                  <button key={u.id} onClick={() => setEscopoId(u.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 ${
                      escopoId === u.id ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300"
                    }`}>
                    {u.nome} <span className="opacity-60">· {u.email} · {u.role}</span>
                    {u.empresa_nome && <span className="opacity-50"> · {u.empresa_nome}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de permissões */}
      {snap && escopoId && (
        <div className="rounded-xl border border-white/10 bg-slate-900">
          <div className="border-b border-white/10 px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Permissões disponíveis ({snap.permissoes_disponiveis.length})
              {escopo === "role" && (
                <span className="ml-2">· {snap.defaults.length} default(s) ativos</span>
              )}
            </p>
            <button onClick={carregar}
              className="rounded p-1 text-slate-400 hover:bg-white/5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {snap.permissoes_disponiveis.map(p => {
              const state = getEffectiveState(p);
              return (
                <div key={p} className="flex items-center justify-between px-4 py-2 hover:bg-white/[.02]">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-slate-300 font-mono">{p}</code>
                    {state === "allow_default" && (
                      <span className="text-[10px] uppercase rounded bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5">default</span>
                    )}
                    {state === "allow_override" && (
                      <span className="text-[10px] uppercase rounded bg-blue-500/15 text-blue-300 px-1.5 py-0.5">override allow</span>
                    )}
                    {state === "deny_override" && (
                      <span className="text-[10px] uppercase rounded bg-red-500/15 text-red-300 px-1.5 py-0.5">override deny</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setOverride(p, "allow")}
                      className={`rounded px-2 py-0.5 text-[10px] ${
                        state === "allow_override"
                          ? "bg-emerald-500 text-white"
                          : "border border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                      }`}>
                      <Check className="h-3 w-3 inline" /> Permitir
                    </button>
                    <button onClick={() => setOverride(p, "deny")}
                      className={`rounded px-2 py-0.5 text-[10px] ${
                        state === "deny_override"
                          ? "bg-red-500 text-white"
                          : "border border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                      }`}>
                      <X className="h-3 w-3 inline" /> Negar
                    </button>
                    {(state === "allow_override" || state === "deny_override") && (
                      <button onClick={() => setOverride(p, null)} title="Remover override"
                        className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-red-500/10 hover:text-red-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!escopoId && escopo === "user" && (
        <div className="rounded-xl border border-white/10 bg-slate-900 p-8 text-center text-sm text-slate-500">
          Busque e selecione um usuário pra editar permissões individuais
        </div>
      )}
    </div>
  );
}
