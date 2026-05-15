"use client";

/**
 * /admin/usuarios — lista todos usuários do sistema (todas empresas).
 */
import { useEffect, useState, useCallback } from "react";
import {
  Users, Search, RefreshCw, Filter, Building2, Shield, KeyRound, Plus, X,
} from "lucide-react";

interface Usuario {
  id: string; nome: string; email: string; role: string;
  ativo: boolean; bloqueado_ate: string | null;
  tentativas_login: number; ultimo_login: string | null;
  created_at: string; empresa_id: string | null;
  empresa_nome: string | null; empresa_slug: string | null;
}

const ROLES = ["", "master", "suporte", "admin", "gerente", "garcom", "cozinha", "financeiro", "atendente", "delivery", "motoboy"];
const ROLES_CRIAR = ["suporte", "master", "admin", "gerente", "garcom", "cozinha", "financeiro", "atendente", "delivery", "motoboy"];
const fmtData = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR") : "—";
const isBloqueado = (iso: string | null) => !!iso && new Date(iso) > new Date();

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [total, setTotal]       = useState(0);
  const [filtroRole, setFR]     = useState("");
  const [busca, setBusca]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);

  // Modal Novo
  const [modalNovo, setModalNovo] = useState(false);
  const [empresas, setEmpresas]   = useState<Array<{ id: string; nome_fantasia: string }>>([]);
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", role: "suporte", empresa_id: "" as string });
  const [salvando, setSalvando] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  // Carrega empresas pra select
  useEffect(() => {
    if (!modalNovo) return;
    fetch("/api/admin/empresas?limit=500", { headers: auth() })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const lista = d.data?.empresas ?? d.data ?? [];
          setEmpresas(lista.map((e: { id: string; nome_fantasia?: string; nome?: string }) =>
            ({ id: e.id, nome_fantasia: e.nome_fantasia ?? e.nome ?? "?" })));
        }
      });
    // eslint-disable-next-line
  }, [modalNovo]);

  async function criarUsuario() {
    setSalvando(true); setErroNovo(null);
    try {
      const exigeEmpresa = novo.role !== "master" && novo.role !== "suporte";
      const r = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          nome:  novo.nome,
          email: novo.email,
          senha: novo.senha,
          role:  novo.role,
          empresa_id: exigeEmpresa ? (novo.empresa_id || null) : null,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || "Falha");
      setModalNovo(false);
      setNovo({ nome: "", email: "", senha: "", role: "suporte", empresa_id: "" });
      carregar();
    } catch (e) {
      setErroNovo(e instanceof Error ? e.message : "Erro");
    } finally { setSalvando(false); }
  }

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
    <div className="space-y-6 max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <Users className="h-5 w-5 text-emerald-400" /> Usuários
            </h1>
            <p className="text-sm text-slate-400">Todos usuários do sistema (todas empresas + masters)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={carregar}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button onClick={() => setModalNovo(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">
              <Plus className="h-3.5 w-3.5" /> Novo usuário
            </button>
          </div>
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

      {modalNovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalNovo(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-base font-bold text-white">Novo usuário</h3>
              <button onClick={() => setModalNovo(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-400">Nome</label>
            <input value={novo.nome} onChange={e => setNovo(s => ({ ...s, nome: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">E-mail</label>
            <input type="email" value={novo.email} onChange={e => setNovo(s => ({ ...s, email: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Senha (mín 8)</label>
            <input type="password" value={novo.senha} onChange={e => setNovo(s => ({ ...s, senha: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-white" />

            <label className="mb-1 block text-xs font-medium text-slate-400">Função</label>
            <select value={novo.role} onChange={e => setNovo(s => ({ ...s, role: e.target.value }))}
              className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
              {ROLES_CRIAR.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {novo.role !== "master" && novo.role !== "suporte" && (
              <>
                <label className="mb-1 block text-xs font-medium text-slate-400">Empresa</label>
                <select value={novo.empresa_id} onChange={e => setNovo(s => ({ ...s, empresa_id: e.target.value }))}
                  className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="">— Escolha —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_fantasia}</option>)}
                </select>
              </>
            )}

            {(novo.role === "suporte" || novo.role === "master") && (
              <p className="mb-3 text-[11px] text-emerald-300 bg-emerald-500/10 rounded p-2">
                {novo.role === "suporte"
                  ? "Agente de suporte: vê e responde chamados de TODAS as empresas. Sem vínculo a empresa específica."
                  : "Master: acesso total ao sistema."}
              </p>
            )}

            {erroNovo && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">{erroNovo}</div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModalNovo(false)} disabled={salvando}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={criarUsuario}
                disabled={salvando || novo.nome.length < 2 || novo.email.length < 3 || novo.senha.length < 8}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                {salvando ? "Criando..." : "Criar usuário"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>);
}
