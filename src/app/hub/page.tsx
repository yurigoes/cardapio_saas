"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, ChefHat,
  Bike, MapPin, DollarSign, Users, LogOut, Settings,
  ShieldCheck, Building2, Plus, X, ChevronDown, Trash2,
  Eye, EyeOff, Tag, Monitor, LifeBuoy,
} from "lucide-react";
import { confirmar } from "@/components/ui/ConfirmModal";
import { useSaasBranding } from "@/lib/hooks/useSaasBranding";

/* ─── módulos por role ───────────────────────── */
interface ModuloCard {
  href: string; label: string; descricao: string;
  icon: React.ElementType; cor: string; roles: string[];
}

const MODULOS: ModuloCard[] = [
  {
    href: "/painel", label: "Administração",
    descricao: "Dashboard completo, equipe, cardápio e configurações",
    icon: Settings,
    cor: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-500/60",
    roles: ["admin"],
  },
  {
    href: "/painel", label: "Painel Gerencial",
    descricao: "Visão geral, relatórios e pedidos do dia",
    icon: LayoutDashboard,
    cor: "from-slate-500/20 to-slate-600/10 border-slate-500/30 hover:border-slate-500/60",
    roles: ["gerente", "atendente", "financeiro"],
  },
  {
    href: "/painel/pedidos", label: "Pedidos",
    descricao: "Acompanhe e gerencie os pedidos em tempo real",
    icon: ShoppingBag,
    cor: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-500/60",
    roles: ["admin", "gerente", "garcom", "atendente", "cozinha"],
  },
  {
    href: "/painel/cardapio", label: "Cardápio",
    descricao: "Gerencie produtos, categorias e preços",
    icon: UtensilsCrossed,
    cor: "from-violet-500/20 to-violet-600/10 border-violet-500/30 hover:border-violet-500/60",
    roles: ["gerente"],
  },
  {
    href: "/painel/cozinha", label: "Cozinha (KDS)",
    descricao: "Display de produção para a equipe da cozinha",
    icon: ChefHat,
    cor: "from-orange-500/20 to-orange-600/10 border-orange-500/30 hover:border-orange-500/60",
    roles: ["admin", "gerente", "cozinha"],
  },
  {
    href: "/garcom", label: "Garçom",
    descricao: "Anotar pedidos de mesas e balcão",
    icon: ShoppingBag,
    cor: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 hover:border-cyan-500/60",
    roles: ["admin", "gerente", "garcom", "atendente"],
  },
  {
    href: "/delivery", label: "Delivery",
    descricao: "Gestão de entregas e motoboys",
    icon: Bike,
    cor: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 hover:border-yellow-500/60",
    roles: ["admin", "gerente", "delivery"],
  },
  {
    href: "/motoboy", label: "Minhas entregas",
    descricao: "PWA do motoboy: rota, status, fechamento de pedido",
    icon: Bike,
    cor: "from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-500/60",
    roles: ["motoboy"],
  },
  {
    href: "/painel/mesas", label: "Mesas",
    descricao: "Mapa de mesas e controle de ocupação",
    icon: MapPin,
    cor: "from-pink-500/20 to-pink-600/10 border-pink-500/30 hover:border-pink-500/60",
    roles: ["admin", "gerente", "garcom", "atendente"],
  },
  {
    href: "/painel/financeiro", label: "Financeiro",
    descricao: "Caixa, faturamento e relatórios financeiros",
    icon: DollarSign,
    cor: "from-green-500/20 to-green-600/10 border-green-500/30 hover:border-green-500/60",
    roles: ["admin", "gerente", "financeiro"],
  },
  {
    href: "/painel/usuarios", label: "Equipe",
    descricao: "Gerencie usuários e permissões de acesso",
    icon: Users,
    cor: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 hover:border-indigo-500/60",
    roles: ["admin", "gerente"],
  },
  {
    href: "/painel/clientes", label: "Clientes",
    descricao: "Fidelidade e ranking de compradores",
    icon: Users,
    cor: "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-500/60",
    roles: ["admin", "gerente"],
  },
  {
    href: "/painel/cupons", label: "Cupons",
    descricao: "Cupons e resgate de pontos",
    icon: Tag,
    cor: "from-purple-500/20 to-purple-600/10 border-purple-500/30 hover:border-purple-500/60",
    roles: ["admin", "gerente"],
  },
  {
    href: "/painel/config", label: "Configurações",
    descricao: "Personalização e totem",
    icon: Settings,
    cor: "from-slate-500/20 to-slate-600/10 border-slate-500/30 hover:border-slate-500/60",
    roles: ["admin"],
  },
  {
    href: "/totem", label: "Totem",
    descricao: "Autoatendimento PWA",
    icon: Monitor,
    cor: "from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-500/60",
    roles: ["admin", "gerente"],
  },
];

const ROLE_LABELS: Record<string, string> = {
  master: "Master Admin", admin: "Administrador", gerente: "Gerente",
  garcom: "Garçom", cozinha: "Cozinha", atendente: "Atendente",
  financeiro: "Financeiro", delivery: "Delivery", motoboy: "Motoboy",
};

/* ─── tipos ──────────────────────────────────── */
interface Usuario { nome: string; role: string; email: string; }
interface Empresa { id: string; nome_fantasia: string; slug: string; logo_url: string | null; }
interface EmpresaLista { id: string; nome_fantasia: string; slug: string; status: string; }
interface UsuarioEmpresa {
  id: string; nome: string; email: string; role: string;
  telefone: string | null; ativo: boolean; created_at: string;
}

/* ─── modal criar usuário ─────────────────────── */
function ModalCriarUsuario({
  empresaId, onClose, onSaved,
}: { empresaId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", senha: "", role: "admin", telefone: "" });
  const [showSenha, setShowSenha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res  = await fetch(`/api/admin/empresas/${empresaId}/usuarios`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ ...form, telefone: form.telefone || undefined }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Erro ao criar usuário"); return; }
      onSaved(); onClose();
    } finally {
      setSaving(false);
    }
  }

  const ROLES = ["admin","gerente","garcom","cozinha","atendente","financeiro","delivery","motoboy"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-white">Novo usuário</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>
        )}

        <form onSubmit={handle} className="space-y-3">
          <input
            required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome completo"
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
          <input
            required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="E-mail"
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
          <div className="relative">
            <input
              required type={showSenha ? "text" : "password"}
              value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })}
              placeholder="Senha (mín. 8 caracteres)"
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 pr-9 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
            <button type="button" onClick={() => setShowSenha(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <select
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </select>
          <input
            value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value.replace(/\D/g, "") })}
            placeholder="Telefone (opcional)"
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-slate-400 hover:text-white transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50 transition">
              {saving ? "Criando..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── visão master ────────────────────────────── */
function MasterView({ usuario }: { usuario: Usuario }) {
  const branding                        = useSaasBranding();
  const [empresas, setEmpresas]         = useState<EmpresaLista[]>([]);
  const [empresaSel, setEmpresaSel]     = useState<EmpresaLista | null>(null);
  const [usuarios, setUsuarios]         = useState<UsuarioEmpresa[]>([]);
  const [loadingEmp, setLoadingEmp]     = useState(true);
  const [loadingUsr, setLoadingUsr]     = useState(false);
  const [showCriar, setShowCriar]       = useState(false);
  const [dropOpen, setDropOpen]         = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";

  useEffect(() => {
    fetch("/api/admin/empresas?limit=200", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmpresas(d.data); })
      .finally(() => setLoadingEmp(false));
  }, [token]);

  const carregarUsuarios = useCallback(async (emp: EmpresaLista) => {
    setLoadingUsr(true);
    try {
      const res  = await fetch(`/api/admin/empresas/${emp.id}/usuarios`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUsuarios(data.data);
    } finally {
      setLoadingUsr(false);
    }
  }, [token]);

  function selecionarEmpresa(emp: EmpresaLista) {
    setEmpresaSel(emp);
    setDropOpen(false);
    carregarUsuarios(emp);
  }

  async function removerUsuario(userId: string) {
    if (!empresaSel) return;
    if (!await confirmar({ titulo: "Remover este usuário?", okLabel: "Remover", perigo: true })) return;
    await fetch(`/api/admin/empresas/${empresaSel.id}/usuarios?userId=${userId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    carregarUsuarios(empresaSel);
  }

  function handleLogout() {
    fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .finally(() => { localStorage.clear(); window.location.href = "/login"; });
  }

  const ROLE_COR: Record<string, string> = {
    admin: "bg-red-500/15 text-red-400", gerente: "bg-orange-500/15 text-orange-400",
    garcom: "bg-blue-500/15 text-blue-400", cozinha: "bg-yellow-500/15 text-yellow-400",
    atendente: "bg-cyan-500/15 text-cyan-400", financeiro: "bg-green-500/15 text-green-400",
    delivery: "bg-violet-500/15 text-violet-400", motoboy: "bg-pink-500/15 text-pink-400",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* top bar */}
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {branding.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo_url}
                alt={branding.nome}
                className="h-10 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{usuario.nome}</p>
              <p className="text-xs text-slate-500">Master Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition"
            >
              <ShieldCheck className="h-4 w-4" />
              Acesso Admin
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 hover:border-red-500/30 hover:text-red-400 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black">Gerenciar Empresa</h1>
          <p className="text-sm text-slate-400 mt-1">Selecione uma empresa para ver e gerenciar seus usuários</p>
        </div>

        {/* seletor de empresa */}
        <div className="relative">
          <button
            onClick={() => setDropOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-left transition hover:border-white/20"
          >
            {empresaSel ? (
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-white">{empresaSel.nome_fantasia}</p>
                  <p className="text-xs text-slate-500">{empresaSel.slug} · {empresaSel.status}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-slate-400">
                <Building2 className="h-5 w-5" />
                <span className="text-sm">
                  {loadingEmp ? "Carregando empresas..." : `Selecionar empresa (${empresas.length} disponíveis)`}
                </span>
              </div>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${dropOpen ? "rotate-180" : ""}`} />
          </button>

          {dropOpen && (
            <div className="absolute z-30 mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
              {empresas.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhuma empresa cadastrada</p>
              ) : (
                empresas.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => selecionarEmpresa(emp)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5 border-b border-white/5 last:border-0 ${
                      empresaSel?.id === emp.id ? "bg-emerald-500/10" : ""
                    }`}
                  >
                    <Building2 className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{emp.nome_fantasia}</p>
                      <p className="text-xs text-slate-500">{emp.slug}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${
                      emp.status === "ativo" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"
                    }`}>
                      {emp.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* usuários da empresa selecionada */}
        {empresaSel && (
          <div className="rounded-2xl border border-white/5 bg-slate-900 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div>
                <p className="font-semibold text-white">Usuários — {empresaSel.nome_fantasia}</p>
                <p className="text-xs text-slate-500 mt-0.5">{usuarios.length} usuário{usuarios.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={() => setShowCriar(true)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-400 transition"
              >
                <Plus className="h-4 w-4" />
                Novo usuário
              </button>
            </div>

            {loadingUsr ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            ) : usuarios.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-slate-500">
                <Users className="h-8 w-8" />
                <p className="text-sm">Nenhum usuário cadastrado</p>
                <button onClick={() => setShowCriar(true)} className="text-xs text-emerald-400 hover:text-emerald-300">
                  Criar primeiro usuário
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {usuarios.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800 text-sm font-bold text-white">
                      {u.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{u.nome}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COR[u.role] ?? "bg-slate-700 text-slate-300"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    <span className={`flex-shrink-0 text-xs ${u.ativo ? "text-emerald-400" : "text-slate-600"}`}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </span>
                    <button
                      onClick={() => removerUsuario(u.id)}
                      className="flex-shrink-0 text-slate-600 hover:text-red-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showCriar && empresaSel && (
        <ModalCriarUsuario
          empresaId={empresaSel.id}
          onClose={() => setShowCriar(false)}
          onSaved={() => carregarUsuarios(empresaSel)}
        />
      )}
    </div>
  );
}

/* ─── visão normal (operadores) ──────────────── */
function OperadorView({ usuario, empresa }: { usuario: Usuario; empresa: Empresa | null }) {
  const role = usuario.role;
  const [suporteLiberado, setSuporteLiberado] = useState(false);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!t) return;
    fetch("/api/painel/suporte/status", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setSuporteLiberado(!!d.data.liberado); })
      .catch(() => {});
  }, []);

  const cardSuporte: ModuloCard = {
    href: "/painel/suporte",
    label: "Suporte",
    descricao: "Centro de ajuda + tutoriais de instalação",
    icon: LifeBuoy,
    cor: "from-amber-500/20 to-amber-600/10 border-amber-500/30 hover:border-amber-500/60",
    roles: ["admin", "master", "operador", "garcom", "caixa", "cozinha", "gerente"],
  };

  const modulosDisponiveis = [
    ...MODULOS.filter((m) => m.roles.includes(role)),
    ...(suporteLiberado ? [cardSuporte] : []),
  ];

  function handleLogout() {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";
    fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .finally(() => { localStorage.clear(); window.location.href = "/login"; });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {empresa?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={empresa.logo_url}
                alt={empresa.nome_fantasia ?? ""}
                className="h-10 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20">
                <ChefHat className="h-4 w-4 text-emerald-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{empresa?.nome_fantasia ?? "—"}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[role] ?? role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-slate-500">{usuario.nome}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-red-500/30 hover:text-red-400 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black">Olá, {usuario.nome?.split(" ")[0]}</h1>
          <p className="mt-2 text-slate-400">Escolha o módulo para acessar:</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modulosDisponiveis.map((mod) => {
            const Icon = mod.icon;
            const href = mod.label === "Totem"
              ? `/totem/${empresa?.slug || "demo"}`
              : mod.href;
            return (
              <Link
                key={mod.href + mod.label}
                href={href}
                className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-200 ${mod.cor}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white">{mod.label}</p>
                    <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{mod.descricao}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {modulosDisponiveis.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <p className="text-sm">Nenhum módulo disponível para o seu perfil.</p>
            <p className="text-xs">Entre em contato com o administrador.</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── página principal ───────────────────────── */
export default function HubPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/login"; return; }

    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) { window.location.href = "/login"; return; }
        setUsuario(data.data?.usuario);
        setEmpresa(data.data?.empresa);
        setLoading(false);
      })
      .catch(() => (window.location.href = "/login"));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!usuario) return null;

  if (usuario.role === "master") {
    return <MasterView usuario={usuario} />;
  }

  return <OperadorView usuario={usuario} empresa={empresa} />;
}
