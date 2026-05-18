"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, Plus, Search, Edit2, Trash2, Key, X, Check,
  Shield, ChefHat, User, Coffee, DollarSign, Bike, Package,
} from "lucide-react";
import { confirmar } from "@/components/ui/ConfirmModal";

interface Usuario {
  id:           string;
  nome:         string;
  email:        string;
  role:         string;
  telefone:     string | null;
  ativo:        boolean;
  created_at:   string;
  ultimo_login: string | null;
  rede_id?:     string | null;
  filial_padrao_id?: string | null;
  opera_todas_filiais?: boolean;
}

const ROLES: { value: string; label: string; icon: React.ElementType; color: string }[] = [
  { value: "admin",      label: "Admin",      icon: Shield,     color: "text-red-400 bg-red-400/10"      },
  { value: "gerente",    label: "Gerente",    icon: User,       color: "text-orange-400 bg-orange-400/10" },
  { value: "garcom",     label: "Garçom",     icon: Coffee,     color: "text-blue-400 bg-blue-400/10"    },
  { value: "cozinha",    label: "Cozinha",    icon: ChefHat,    color: "text-yellow-400 bg-yellow-400/10" },
  { value: "atendente",  label: "Atendente",  icon: User,       color: "text-purple-400 bg-purple-400/10" },
  { value: "financeiro", label: "Financeiro", icon: DollarSign, color: "text-green-400 bg-green-400/10"  },
  { value: "delivery",   label: "Delivery",   icon: Bike,       color: "text-cyan-400 bg-cyan-400/10"    },
  { value: "motoboy",    label: "Motoboy",    icon: Package,    color: "text-slate-400 bg-slate-400/10"  },
];

function roleInfo(role: string) {
  return ROLES.find((r) => r.value === role) ?? {
    value: role, label: role, icon: User, color: "text-slate-400 bg-slate-400/10",
  };
}

function RoleBadge({ role }: { role: string }) {
  const info = roleInfo(role);
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}

interface ModalCriarProps {
  onClose: () => void;
  onSaved: () => void;
}

function ModalCriar({ onClose, onSaved }: ModalCriarProps) {
  const [form, setForm] = useState({
    nome: "", email: "", senha: "", role: "garcom", telefone: "",
    opera_todas_filiais: false,
  });
  const [redeInfo, setRedeInfo] = useState<{ rede_id: string | null; rede_nome: string | null } | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("access_token");
    if (!t) return;
    fetch("/api/painel/rede", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.scope?.rede_id) {
          setRedeInfo({ rede_id: d.data.scope.rede_id, rede_nome: d.data.scope.rede_nome });
        }
      }).catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/painel/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nome:     form.nome.trim(),
          email:    form.email.trim(),
          senha:    form.senha,
          role:     form.role,
          telefone: form.telefone.trim() || undefined,
          opera_todas_filiais: form.opera_todas_filiais,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Erro ao criar usuário"); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Novo Usuário</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome completo</label>
            <input
              required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              placeholder="Ex: João da Silva"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">E-mail</label>
            <input
              required type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              placeholder="joao@restaurante.com"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Senha inicial</label>
            <input
              required type="password" value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Papel / Função</label>
            <select
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Telefone (opcional)</label>
            <input
              value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              placeholder="11999999999"
            />
          </div>

          {/* Rede: operador cross-filial */}
          {redeInfo?.rede_id && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <label className="flex items-start gap-2 text-sm text-emerald-200 cursor-pointer">
                <input type="checkbox" checked={form.opera_todas_filiais}
                  onChange={e => setForm({ ...form, opera_todas_filiais: e.target.checked })}
                  className="mt-0.5" />
                <span>
                  <strong>Operar todas as filiais da rede {redeInfo.rede_nome}</strong>
                  <br />
                  <span className="text-xs text-emerald-300/80">
                    Habilita dropdown de troca de filial no header. Use pra gerentes/admins.
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-slate-400 hover:border-white/20 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-xl bg-brand py-2 text-sm font-medium text-white hover:brightness-110 transition disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar usuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ModalEditarProps {
  usuario: Usuario;
  onClose: () => void;
  onSaved: () => void;
}

function ModalEditar({ usuario, onClose, onSaved }: ModalEditarProps) {
  const [tab, setTab]   = useState<"dados" | "senha">("dados");
  const [form, setForm] = useState({
    nome: usuario.nome, email: usuario.email, role: usuario.role,
    telefone: usuario.telefone ?? "", ativo: usuario.ativo,
    opera_todas_filiais: usuario.opera_todas_filiais ?? false,
  });
  const [redeInfo, setRedeInfo] = useState<{ rede_id: string | null; rede_nome: string | null } | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("access_token");
    if (!t) return;
    fetch("/api/painel/rede", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.scope?.rede_id) {
          setRedeInfo({ rede_id: d.data.scope.rede_id, rede_nome: d.data.scope.rede_nome });
        }
      }).catch(() => {});
  }, []);
  const [senha, setSenha]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [ok, setOk]         = useState(false);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setOk(false);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`/api/painel/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nome:     form.nome.trim(),
          email:    form.email.trim(),
          role:     form.role,
          telefone: form.telefone.trim() || undefined,
          ativo:    form.ativo,
          opera_todas_filiais: form.opera_todas_filiais,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Erro ao salvar"); return; }
      setOk(true);
      onSaved();
      setTimeout(onClose, 800);
    } finally {
      setSaving(false);
    }
  }

  async function handleSenha(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setOk(false);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`/api/painel/usuarios/${usuario.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ senha }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Erro ao alterar senha"); return; }
      setOk(true);
      setSenha("");
      setTimeout(() => setOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Editar Usuário</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 mb-5 rounded-xl bg-slate-800 p-1">
          {(["dados", "senha"] as const).map((t) => (
            <button
              key={t} onClick={() => { setTab(t); setError(""); setOk(false); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                tab === t ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "dados" ? "Dados" : "Alterar senha"}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {ok && (
          <div className="mb-4 rounded-xl bg-brand/10 border border-brand/20 px-4 py-3 text-sm text-brand flex items-center gap-2">
            <Check className="h-4 w-4" /> Salvo com sucesso!
          </div>
        )}

        {tab === "dados" ? (
          <form onSubmit={handleSalvar} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nome</label>
              <input
                required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail</label>
              <input
                required type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Papel</label>
              <select
                value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Telefone</label>
              <input
                value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                placeholder="11999999999"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="rounded border-white/10 bg-slate-800 text-brand"
              />
              <span className="text-sm text-slate-300">Conta ativa</span>
            </label>

            {redeInfo?.rede_id && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <label className="flex items-start gap-2 text-sm text-emerald-200 cursor-pointer">
                  <input type="checkbox" checked={form.opera_todas_filiais}
                    onChange={e => setForm({ ...form, opera_todas_filiais: e.target.checked })}
                    className="mt-0.5" />
                  <span>
                    <strong>Opera todas as filiais</strong>
                    <br />
                    <span className="text-xs text-emerald-300/80">
                      Habilita dropdown de troca de filial. Rede: {redeInfo.rede_nome}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button" onClick={onClose}
                className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-slate-400 hover:border-white/20 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={saving}
                className="flex-1 rounded-xl bg-brand py-2 text-sm font-medium text-white hover:brightness-110 transition disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSenha} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nova senha</label>
              <input
                required type="password" value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <p className="text-xs text-slate-500">
              A senha deve ter ao menos 8 caracteres, uma letra maiúscula, uma minúscula e um número.
            </p>
            <button
              type="submit" disabled={saving}
              className="w-full rounded-xl bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-400 transition disabled:opacity-50"
            >
              {saving ? "Alterando..." : "Alterar senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios]   = useState<Usuario[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading]     = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [editando, setEditando]   = useState<Usuario | null>(null);
  const [deletando, setDeletando] = useState<string | null>(null);

  const LIMIT = 15;

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const sp = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (q)          sp.set("q", q);
      if (roleFilter) sp.set("role", roleFilter);

      const res  = await fetch(`/api/painel/usuarios?${sp}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsuarios(data.data);
        setTotal(data.meta?.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, q, roleFilter]);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  // reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [q, roleFilter]);

  async function handleDelete(id: string) {
    if (!await confirmar({ titulo: "Excluir usuário?", okLabel: "Excluir", perigo: true })) return;
    setDeletando(id);
    try {
      const token = localStorage.getItem("access_token");
      await fetch(`/api/painel/usuarios/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchUsuarios();
    } finally {
      setDeletando(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total} usuário{total !== 1 ? "s" : ""} cadastrado{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCriar(true)}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition"
        >
          <Plus className="h-4 w-4" />
          Novo usuário
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full rounded-xl bg-slate-800 border border-white/10 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand/50"
          />
        </div>
        <select
          value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
        >
          <option value="">Todos os papéis</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-white/5 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : usuarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <Users className="h-10 w-10" />
            <p className="text-sm">Nenhum usuário encontrado</p>
            <button
              onClick={() => setShowCriar(true)}
              className="mt-1 text-sm text-brand hover:text-brand transition"
            >
              Adicionar o primeiro usuário
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 text-xs text-slate-500">
                <th className="px-6 py-3 text-left font-medium">Usuário</th>
                <th className="px-6 py-3 text-left font-medium">Papel</th>
                <th className="px-6 py-3 text-left font-medium hidden md:table-cell">Telefone</th>
                <th className="px-6 py-3 text-left font-medium hidden lg:table-cell">Último acesso</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-white/2 transition">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-white">{u.nome}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="text-sm text-slate-400">{u.telefone ?? "—"}</span>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <span className="text-xs text-slate-500">
                      {u.ultimo_login
                        ? new Date(u.ultimo_login).toLocaleDateString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })
                        : "Nunca"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.ativo
                        ? "bg-brand/10 text-brand"
                        : "bg-slate-500/10 text-slate-400"
                    }`}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditando(u)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setEditando(u); }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-500/10 hover:text-amber-400 transition"
                        title="Alterar senha"
                      >
                        <Key className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={deletando === u.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition disabled:opacity-50"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg px-3 py-1 border border-white/10 hover:border-white/20 hover:text-white transition disabled:opacity-30"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg px-3 py-1 border border-white/10 hover:border-white/20 hover:text-white transition disabled:opacity-30"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {showCriar && (
        <ModalCriar onClose={() => setShowCriar(false)} onSaved={fetchUsuarios} />
      )}
      {editando && (
        <ModalEditar
          usuario={editando}
          onClose={() => setEditando(null)}
          onSaved={fetchUsuarios}
        />
      )}
    </div>
  );
}
