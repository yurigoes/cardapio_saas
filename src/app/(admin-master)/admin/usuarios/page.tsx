"use client";

/**
 * /admin/usuarios — lista todos usuários do sistema (todas empresas).
 */
import { useEffect, useState, useCallback } from "react";
import MasterShell from "@/components/admin/MasterShell";
import {
  Users, Search, RefreshCw, Filter, Building2, Shield, KeyRound,
} from "lucide-react";

interface Usuario {
  id: string; nome: string; email: string; role: string;
  ativo: boolean; bloqueado_ate: string | null;
  tentativas_login: number; ultimo_login: string | null;
  created_at: string; empresa_id: string | null;
  empresa_nome: string | null; empresa_slug: string | null;
}

const ROLES = ["", "master", "admin", "gerente", "garcom", "cozinha", "financeiro", "atendente", "delivery", "motoboy"];
const fmtData = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR") : "—";
const isBloqueado = (iso: string | null) => !!iso && new Date(iso) > new Date();

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [total, setTotal]       = useState(0);
  const [filtroRole, setFR]     = useState("");
  const [busca, setBusca]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);

  const auth = () => ({ Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}` });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (filtroRole) sp.set("role", filtroRole);
      if (busca)      sp.set("search", busca);
      sp.set("page", String(page)); sp.set("limit", "50");
      const r = await fetch(`/api/admin/usuarios?${sp}`, { headers: auth() });
      const d = await r.json();
      if (d.success) {
        setUsuarios(d.data ?? []);
        setTotal(d.meta?.pagination?.total ?? 0);
      }
    } finally { setLoading(false); }
  }, [filtroRole, busca, page]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <MasterShell>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <Users className="h-5 w-5 text-emerald-400" /> Usuários
            </h1>
            <p className="text-sm text-slate-400">Todos usuários do sistema (todas empresas + masters)</p>
          </div>
          <button onClick={carregar}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-slate-400" />
          <select value={filtroRole} onChange={e => { setFR(e.target.value); setPage(1); }}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white">
            {ROLES.map(r => <option key={r} value={r}>{r || "Todos roles"}</option>)}
          </select>
          <div className="flex-1 relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1); }}
              placeholder="Buscar nome ou e-mail..."
              className="w-full rounded-lg border border-white/10 bg-slate-800 pl-9 pr-3 py-2 text-xs text-white" />
          </div>
        </div>

        <div className="text-xs text-slate-500">{total.toLocaleString("pt-BR")} usuário(s)</div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {usuarios.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {loading ? "Carregando..." : "Nenhum usuário"}
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {usuarios.map(u => (
                <div key={u.id} className="p-4 flex items-start gap-3">
                  <div className={`rounded-lg p-2 flex-shrink-0 ${u.role === "master" ? "bg-amber-500/15" : "bg-slate-700"}`}>
                    {u.role === "master"
                      ? <Shield className="h-4 w-4 text-amber-400" />
                      : <Users className="h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white truncate">{u.nome}</p>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        u.role === "master"   ? "bg-amber-500/20 text-amber-300" :
                        u.role === "admin"    ? "bg-emerald-500/20 text-emerald-300" :
                        u.role === "gerente"  ? "bg-blue-500/20 text-blue-300" :
                                                "bg-slate-700 text-slate-300"
                      }`}>{u.role}</span>
                      {!u.ativo && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">INATIVO</span>}
                      {isBloqueado(u.bloqueado_ate) && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                          BLOQUEADO ({u.tentativas_login} tent.)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                      {u.empresa_nome ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {u.empresa_nome}
                          {u.empresa_slug && <code className="text-slate-600">/{u.empresa_slug}</code>}
                        </span>
                      ) : <span className="text-amber-400">(sem empresa)</span>}
                      <span>· criado {fmtData(u.created_at)}</span>
                      {u.ultimo_login && <span>· login {fmtData(u.ultimo_login)}</span>}
                    </div>
                  </div>
                  {u.empresa_id && (
                    <a href={`/admin/empresas/${u.empresa_id}/gerenciar`}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 flex-shrink-0">
                      <KeyRound className="h-3 w-3" /> Gerenciar
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {total > 50 && (
          <div className="flex items-center justify-between text-xs text-slate-400">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-30 hover:bg-white/5">Anterior</button>
            <span>Página {page} de {Math.ceil(total / 50)}</span>
            <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
              className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-30 hover:bg-white/5">Próxima</button>
          </div>
        )}
      </div>
    </MasterShell>
  );
}
