"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Plus, Search, X, ChevronLeft, ChevronRight,
  ExternalLink, AlertTriangle, CheckCircle, Clock, Ban,
  Settings, Check, Eye, EyeOff, Copy, RefreshCw, Wifi, WifiOff,
} from "lucide-react";
import { MODULOS_REGISTRY } from "@/lib/modules/registry";

interface Empresa {
  id:                  string;
  nome_fantasia:       string;
  slug:                string;
  status:              string;
  cnpj:                string | null;
  email:               string | null;
  whatsapp:            string | null;
  plano_id:            string | null;
  plano_nome:          string | null;
  modulos_ativos:      string[];
  total_usuarios:      number;
  total_pedidos:       number;
  created_at:          string;
  assinatura_expira_em: string | null;
  // Campos slave
  slave_key?:          string | null;
  slave_ativo?:        boolean;
  slave_ultimo_sync?:  string | null;
}

interface Plano {
  id:   string;
  nome: string;
  preco: number;
}

interface Pagination {
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
}

const STATUS_CONFIG: Record<string, { label: string; style: string; icon: React.ElementType }> = {
  ativo:     { label: "Ativo",     style: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle },
  inativo:   { label: "Inativo",   style: "bg-slate-500/15 text-slate-400",     icon: Clock       },
  teste:     { label: "Teste",     style: "bg-amber-500/15 text-amber-400",     icon: Clock       },
  suspenso:  { label: "Suspenso",  style: "bg-red-500/15 text-red-400",         icon: AlertTriangle },
  bloqueado: { label: "Bloqueado", style: "bg-red-500/20 text-red-500",         icon: Ban         },
};

const MODULO_CATEGORIAS = Object.entries(
  Object.values(MODULOS_REGISTRY).reduce<Record<string, typeof MODULOS_REGISTRY[keyof typeof MODULOS_REGISTRY][]>>(
    (acc, m) => { (acc[m.categoria] ??= []).push(m); return acc; },
    {}
  )
);

function getToken() {
  return localStorage.getItem("access_token") ?? "";
}

/* ───────────────────────── Modal Configurar Empresa ───────────────────────── */
function ModalConfigurar({
  empresa,
  planos,
  onClose,
  onSaved,
}: {
  empresa: Empresa;
  planos: Plano[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nome_fantasia:  empresa.nome_fantasia,
    email:          empresa.email ?? "",
    whatsapp:       empresa.whatsapp ?? "",
    status:         empresa.status,
    plano_id:       empresa.plano_id ?? "",
    modulos_ativos: Array.isArray(empresa.modulos_ativos) ? [...empresa.modulos_ativos] : [],
  });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [slaveKey,    setSlaveKey]    = useState(empresa.slave_key ?? "");
  const [slaveAtivo,  setSlaveAtivo]  = useState(empresa.slave_ativo ?? false);
  const [slaveSync,   setSlaveSync]   = useState(empresa.slave_ultimo_sync ?? null);
  const [showKey,     setShowKey]     = useState(false);
  const [keyCopied,   setKeyCopied]   = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);

  // Carrega dados completos da empresa (incluindo slave_key) ao abrir o modal
  useEffect(() => {
    async function loadEmpresaDetails() {
      try {
        const res  = await fetch(`/api/admin/empresas/${empresa.id}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.success) {
          setSlaveKey(data.data.slave_key ?? "");
          setSlaveAtivo(data.data.slave_ativo ?? false);
          setSlaveSync(data.data.slave_ultimo_sync ?? null);
        }
      } catch { /* silent */ }
    }
    loadEmpresaDetails();
  }, [empresa.id]);

  async function handleCopyKey() {
    if (!slaveKey) return;
    await navigator.clipboard.writeText(slaveKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  async function handleRegenKey() {
    if (!confirm("Regenerar a chave irá invalidar o slave atual. Confirma?")) return;
    setRegenLoading(true);
    try {
      // Primeiro revoga
      await fetch(`/api/sync/key?id=${empresa.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      // Depois gera nova
      const res  = await fetch(`/api/sync/key?id=${empresa.id}`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setSlaveKey(data.data.slave_key ?? "");
        setSlaveAtivo(false);
        setSlaveSync(null);
      }
    } finally {
      setRegenLoading(false);
    }
  }

  function toggleModulo(id: string) {
    setForm(f => ({
      ...f,
      modulos_ativos: f.modulos_ativos.includes(id)
        ? f.modulos_ativos.filter(m => m !== id)
        : [...f.modulos_ativos, id],
    }));
  }

  function selectAllCategory(mods: { id: string }[]) {
    const ids = mods.map(m => m.id);
    setForm(f => {
      const allSelected = ids.every(id => f.modulos_ativos.includes(id));
      if (allSelected) {
        return { ...f, modulos_ativos: f.modulos_ativos.filter(m => !ids.includes(m)) };
      } else {
        return { ...f, modulos_ativos: Array.from(new Set([...f.modulos_ativos, ...ids])) };
      }
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        status:         form.status,
        modulos_ativos: form.modulos_ativos,
      };
      if (form.nome_fantasia.trim()) body.nome_fantasia = form.nome_fantasia.trim();
      if (form.email.trim())         body.email         = form.email.trim();
      if (form.whatsapp.trim())      body.whatsapp       = form.whatsapp.replace(/\D/g, "");
      if (form.plano_id)             body.plano_id       = form.plano_id;

      const res  = await fetch(`/api/admin/empresas/${empresa.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error ?? "Erro ao salvar");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-slate-900 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
              <Settings className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Configurar Empresa</h2>
              <p className="text-xs text-slate-400">{empresa.slug}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          {/* Dados básicos */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dados da Empresa</p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome Fantasia</label>
              <input
                value={form.nome_fantasia}
                onChange={e => setForm(f => ({ ...f, nome_fantasia: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contato@empresa.com"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">WhatsApp</label>
                <input
                  value={form.whatsapp}
                  onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                >
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Plano</label>
                <select
                  value={form.plano_id}
                  onChange={e => setForm(f => ({ ...f, plano_id: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                >
                  <option value="">Sem plano</option>
                  {planos.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Módulos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Módulos Ativos ({form.modulos_ativos.length} de {Object.keys(MODULOS_REGISTRY).length})
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, modulos_ativos: Object.keys(MODULOS_REGISTRY) }))}
                  className="rounded-lg px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 transition"
                >
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, modulos_ativos: [] }))}
                  className="rounded-lg px-2.5 py-1 text-xs text-slate-400 hover:bg-white/5 transition"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-72 overflow-y-auto pr-1 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              {MODULO_CATEGORIAS.map(([categoria, mods]) => {
                const allSel = mods.every(m => form.modulos_ativos.includes(m.id));
                return (
                  <div key={categoria}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{categoria}</p>
                      <button
                        type="button"
                        onClick={() => selectAllCategory(mods)}
                        className={`text-xs transition ${allSel ? "text-emerald-400 hover:text-emerald-300" : "text-slate-500 hover:text-slate-300"}`}
                      >
                        {allSel ? "Desmarcar" : "Marcar todos"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {mods.map(mod => {
                        const ativo = form.modulos_ativos.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => toggleModulo(mod.id)}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                              ativo
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border border-white/5 bg-white/5 text-slate-400 hover:border-white/10 hover:text-white"
                            }`}
                          >
                            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                              ativo ? "border-emerald-500 bg-emerald-500" : "border-white/20 bg-transparent"
                            }`}>
                              {ativo && <Check className="h-2.5 w-2.5 text-white" />}
                            </span>
                            <span className="truncate">{mod.nome}</span>
                            {mod.premium && <span className="ml-auto flex-shrink-0 text-amber-400">★</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Servidor Local (Slave) ── */}
          <div className="space-y-4 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Servidor Local (Slave)
              </p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                slaveAtivo
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-slate-500/15 text-slate-400"
              }`}>
                {slaveAtivo ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {slaveAtivo ? "Slave Ativo" : "Não instalado"}
              </span>
            </div>

            {slaveSync && (
              <p className="text-xs text-slate-500">
                Última sincronização: {new Date(slaveSync).toLocaleString("pt-BR")}
              </p>
            )}

            {/* Campo de chave */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Chave de Instalação
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    readOnly
                    value={slaveKey}
                    placeholder="Nenhuma chave gerada"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white font-mono placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    title={showKey ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyKey}
                  disabled={!slaveKey}
                  title="Copiar chave"
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {keyCopied ? "Copiado!" : "Copiar"}
                </button>

                <button
                  type="button"
                  onClick={handleRegenKey}
                  disabled={regenLoading}
                  title="Regenerar chave"
                  className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${regenLoading ? "animate-spin" : ""}`} />
                  Regenerar
                </button>
              </div>
            </div>

            {/* Instruções rápidas — print agent */}
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400">Agente local de impressão</p>
              <p className="text-xs text-slate-500">
                Vai em <a href="/painel/impressoras" className="text-emerald-400 underline">/painel/impressoras</a>,
                gera uma key e baixa o agente. Funciona em Windows (.tar.gz com setup.bat)
                e Linux (Node + systemd).
              </p>
              <a href="/painel/impressoras"
                className="inline-block mt-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/25">
                Abrir painel de impressoras →
              </a>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50 transition"
            >
              {saving ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────── Main Page ─────────────────────────────── */
export default function EmpresasPage() {
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [planos,   setPlanos]       = useState<Plano[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [status, setStatus]         = useState("");
  const [showModal, setShowModal]   = useState(false);
  const [editEmpresa, setEditEmpresa] = useState<Empresa | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  const [form, setForm] = useState({
    nome_fantasia: "",
    slug:          "",
    cnpj:          "",
    email:         "",
    whatsapp:      "",
  });

  const fetchEmpresas = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: "15",
        ...(search ? { q: search } : {}),
        ...(status ? { status }   : {}),
      });

      const res  = await fetch(`/api/admin/empresas?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();

      if (data.success) {
        setEmpresas(data.data);
        if (data.meta?.pagination) setPagination(data.meta.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  async function fetchPlanos() {
    try {
      const res  = await fetch("/api/admin/planos", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setPlanos(data.data ?? []);
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchPlanos();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchEmpresas(1), 300);
    return () => clearTimeout(t);
  }, [fetchEmpresas]);

  function slugify(text: string) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res  = await fetch("/api/admin/empresas", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          ...form,
          cnpj:     form.cnpj.replace(/\D/g, "") || undefined,
          whatsapp: form.whatsapp.replace(/\D/g, "") || undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setShowModal(false);
        setForm({ nome_fantasia: "", slug: "", cnpj: "", email: "", whatsapp: "" });
        fetchEmpresas(1);
      } else {
        setError(data.error ?? "Erro ao criar empresa");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="mt-1 text-sm text-slate-400">
            {pagination.total} empresa{pagination.total !== 1 ? "s" : ""} cadastrada{pagination.total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 transition"
        >
          <Plus className="h-4 w-4" />
          Nova Empresa
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou slug..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Empresa</th>
                <th className="px-6 py-4">Plano</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Módulos</th>
                <th className="px-6 py-4">Usuários</th>
                <th className="px-6 py-4">Criado em</th>
                <th className="px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  </td>
                </tr>
              )}

              {!loading && empresas.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Nenhuma empresa encontrada
                  </td>
                </tr>
              )}

              {!loading && empresas.map((empresa) => {
                const cfg  = STATUS_CONFIG[empresa.status] ?? STATUS_CONFIG.inativo;
                const Icon = cfg.icon;
                const expirando = empresa.assinatura_expira_em &&
                  new Date(empresa.assinatura_expira_em) < new Date(Date.now() + 7 * 86400_000);
                const totalModulos = Array.isArray(empresa.modulos_ativos) ? empresa.modulos_ativos.length : 0;

                return (
                  <motion.tr
                    key={empresa.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-white/[0.03] transition"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-white">{empresa.nome_fantasia}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {empresa.slug}
                        {empresa.cnpj && ` · ${empresa.cnpj}`}
                      </p>
                      {expirando && (
                        <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Expira {new Date(empresa.assinatura_expira_em!).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-300">{empresa.plano_nome ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.style}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-300">{totalModulos}</span>
                      <span className="text-xs text-slate-500"> módulos</span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{empresa.total_usuarios}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs">
                      {new Date(empresa.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/totem/${empresa.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                          title="Ver cardápio"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>

                        <button
                          onClick={async () => {
                            if (!confirm(`Operar como "${empresa.nome_fantasia}"?\n\nVocê será redirecionado ao painel da empresa. Banner amarelo aparece pra voltar.`)) return;
                            try {
                              const t = localStorage.getItem("access_token");
                              const r = await fetch(`/api/admin/empresas/${empresa.id}/impersonar`, {
                                method: "POST",
                                headers: { Authorization: `Bearer ${t}` },
                              });
                              const d = await r.json();
                              if (!d.success) { alert(d.error?.message ?? "Falha"); return; }
                              // Salva token original em backup + troca pelo novo
                              localStorage.setItem("master_token_backup", t ?? "");
                              localStorage.setItem("access_token", d.data.access_token);
                              window.location.href = "/painel";
                            } catch (e) {
                              alert("Erro: " + (e as Error).message);
                            }
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400 transition"
                          title="Operar como esta empresa (impersonar)"
                        >
                          <Building2 className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => setEditEmpresa(empresa)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-emerald-400 transition"
                          title="Configurar empresa"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
            <p className="text-xs text-slate-400">
              Página {pagination.page} de {pagination.totalPages} · {pagination.total} resultados
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchEmpresas(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => fetchEmpresas(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Configurar */}
      <AnimatePresence>
        {editEmpresa && (
          <ModalConfigurar
            empresa={editEmpresa}
            planos={planos}
            onClose={() => setEditEmpresa(null)}
            onSaved={() => fetchEmpresas(pagination.page)}
          />
        )}
      </AnimatePresence>

      {/* Modal Nova Empresa */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
                    <Building2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Nova Empresa</h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Nome Fantasia *
                  </label>
                  <input
                    value={form.nome_fantasia}
                    onChange={e => setForm(f => ({
                      ...f,
                      nome_fantasia: e.target.value,
                      slug: slugify(e.target.value),
                    }))}
                    required
                    placeholder="Ex: Restaurante do João"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Slug (URL) *
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
                    <span className="text-xs text-slate-500">cardapio.com/</span>
                    <input
                      value={form.slug}
                      onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                      required
                      placeholder="restaurante-do-joao"
                      className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">CNPJ</label>
                    <input
                      value={form.cnpj}
                      onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                      placeholder="00.000.000/0001-00"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">WhatsApp</label>
                    <input
                      value={form.whatsapp}
                      onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="(11) 99999-9999"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="contato@restaurante.com"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50 transition"
                  >
                    {saving ? "Criando..." : "Criar Empresa"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
