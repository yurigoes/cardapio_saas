"use client";

/**
 * /cliente/[slug] — Painel público do cliente
 *
 * Fluxo:
 *   1. Cliente entra com telefone ou CPF
 *   2. Sistema busca em /api/pub/cliente?slug=&tipo=&valor=
 *   3. Se encontrado, carrega perfil completo via /api/pub/cliente/[id]?slug=
 *   4. Mostra: saldo, ranking, histórico, cupons, próximo benefício
 *
 * Mobile-first, segue cor primária da empresa.
 */
import { useEffect, useState } from "react";
import {
  Trophy, ShoppingBag, Tag, Phone, FileText, ChefHat,
  Sparkles, ArrowLeft, Clock, TrendingUp, LogOut,
} from "lucide-react";

interface EmpresaPub {
  nome_fantasia: string;
  cor_primaria:  string | null;
  logo_url:      string | null;
}

interface Cliente {
  id:            string;
  nome:          string | null;
  telefone:      string | null;
  cpf:           string | null;
  pontos:        number;
  total_pedidos: number;
  total_gasto:   number;
  ultimo_pedido: string | null;
  created_at:    string;
}

interface PedidoRecente {
  id:        string;
  numero:    number;
  total:     number;
  status:    string;
  tipo:      string;
  criado_em: string;
}

interface Cupom {
  id:             string;
  codigo:         string;
  tipo:           string;
  valor:          number;
  validade:       string | null;
  pontos_resgate: number | null;
}

interface ProximoBeneficio {
  codigo: string;
  tipo:   string;
  valor:  number;
  pontos: number;
  faltam: number;
}

interface PerfilCompleto {
  empresa: { nome_fantasia: string; slug: string };
  cliente: Cliente;
  pedidos: PedidoRecente[];
  cupons:  Cupom[];
  proximo_beneficio: ProximoBeneficio | null;
}

const STORAGE_KEY = (slug: string) => `cliente_${slug}_id`;

const STATUS_LABEL: Record<string, string> = {
  pendente:   "Pendente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  pronto:     "Pronto",
  entregue:   "Entregue",
  cancelado:  "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  pendente:   "bg-yellow-500/15 text-yellow-400",
  confirmado: "bg-blue-500/15 text-blue-400",
  preparando: "bg-orange-500/15 text-orange-400",
  pronto:     "bg-emerald-500/15 text-emerald-400",
  entregue:   "bg-emerald-500/15 text-emerald-400",
  cancelado:  "bg-red-500/15 text-red-400",
};

const TIPO_LABEL: Record<string, string> = {
  mesa:    "Mesa",
  balcao:  "Balcão",
  delivery:"Delivery",
  totem:   "Totem",
  whatsapp:"WhatsApp",
  app:     "App",
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function formatPhone(p: string | null) {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return p;
}

export default function ClientePainelPage({ params }: { params: { slug: string } }) {
  const [empresa, setEmpresa]   = useState<EmpresaPub | null>(null);
  const [perfil,  setPerfil]    = useState<PerfilCompleto | null>(null);
  const [loading, setLoading]   = useState(true);

  // Login form
  const [tipo,  setTipo]    = useState<"telefone" | "cpf">("telefone");
  const [valor, setValor]   = useState("");
  const [erro,  setErro]    = useState("");
  const [searching, setSearching] = useState(false);

  // ── Apply brand color ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/pub/cardapio/${params.slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const emp = d.data.empresa as EmpresaPub;
        setEmpresa(emp);
        const primary = emp.cor_primaria || "#10b981";
        document.documentElement.style.setProperty("--color-primary", primary);
        document.documentElement.style.setProperty("--color-primary-15", primary + "26");
        document.documentElement.style.setProperty("--color-primary-50", primary + "80");
      })
      .catch(() => {});
  }, [params.slug]);

  // ── Auto-login se cliente já está salvo no localStorage ────────────────────
  useEffect(() => {
    const id = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY(params.slug)) : null;
    if (id) loadPerfil(id);
    else    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  async function loadPerfil(id: string) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/pub/cliente/${id}?slug=${params.slug}`);
      const data = await res.json();
      if (data.success) {
        setPerfil(data.data);
      } else {
        // ID inválido → limpa storage
        localStorage.removeItem(STORAGE_KEY(params.slug));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const valorLimpo = valor.replace(/\D/g, "");
    if (!valorLimpo) { setErro("Digite seu " + (tipo === "telefone" ? "telefone" : "CPF")); return; }

    setSearching(true);
    try {
      const res  = await fetch(
        `/api/pub/cliente?slug=${params.slug}&tipo=${tipo}&valor=${valorLimpo}`
      );
      const data = await res.json();
      if (!data.success) { setErro(data.error || "Erro ao buscar"); return; }

      if (!data.data.encontrado) {
        setErro(`Não encontramos um cliente com este ${tipo === "telefone" ? "telefone" : "CPF"}. Faça um pedido primeiro!`);
        return;
      }

      const id = data.data.cliente.id as string;
      localStorage.setItem(STORAGE_KEY(params.slug), id);
      await loadPerfil(id);
    } catch {
      setErro("Erro de conexão");
    } finally {
      setSearching(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY(params.slug));
    setPerfil(null);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--color-primary, #10b981)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  // ── Login screen ───────────────────────────────────────────────────────────
  if (!perfil) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-950 text-white">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          {empresa?.logo_url ? (
            <img src={empresa.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: "var(--color-primary-15, rgba(16,185,129,0.12))" }}
            >
              <ChefHat className="h-5 w-5" style={{ color: "var(--color-primary, #10b981)" }} />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-white">{empresa?.nome_fantasia ?? "Cliente"}</p>
            <p className="text-xs text-slate-400">Meus Pontos &amp; Pedidos</p>
          </div>
        </header>

        {/* Login form */}
        <main className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center space-y-2">
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: "var(--color-primary-15, rgba(16,185,129,0.12))" }}
              >
                <Sparkles className="h-8 w-8" style={{ color: "var(--color-primary, #10b981)" }} />
              </div>
              <h1 className="text-2xl font-bold text-white">Acesse sua conta</h1>
              <p className="text-sm text-slate-400">
                Veja seus pontos, histórico e cupons
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
                {(["telefone", "cpf"] as const).map((t) => {
                  const ativo = tipo === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTipo(t); setValor(""); setErro(""); }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition"
                      style={ativo ? {
                        background: "var(--color-primary-15, rgba(16,185,129,0.15))",
                        color:      "var(--color-primary, #10b981)",
                      } : { color: "rgb(148,163,184)" }}
                    >
                      {t === "telefone" ? <Phone className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      {t === "telefone" ? "Telefone" : "CPF"}
                    </button>
                  );
                })}
              </div>

              <input
                type="tel"
                inputMode="numeric"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                placeholder={tipo === "telefone" ? "(00) 00000-0000" : "000.000.000-00"}
                maxLength={tipo === "telefone" ? 11 : 11}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg text-white placeholder-slate-500 focus:outline-none"
              />

              {erro && (
                <p className="text-center text-sm text-red-400">{erro}</p>
              )}

              <button
                type="submit"
                disabled={searching || !valor}
                style={{ background: "var(--color-primary, #10b981)" }}
                className="w-full rounded-xl py-3 font-semibold text-white transition disabled:opacity-50"
              >
                {searching ? "Buscando..." : "Entrar"}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500">
              Ainda não é cliente? Faça seu primeiro pedido no totem ou pelo cardápio.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ── Profile dashboard ──────────────────────────────────────────────────────
  const { cliente, pedidos, cupons, proximo_beneficio } = perfil;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          {empresa?.logo_url ? (
            <img src={empresa.logo_url} alt="" className="h-9 w-9 flex-shrink-0 rounded-lg object-cover" />
          ) : (
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--color-primary-15, rgba(16,185,129,0.12))" }}
            >
              <ChefHat className="h-4 w-4" style={{ color: "var(--color-primary, #10b981)" }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{cliente.nome ?? "Cliente"}</p>
            <p className="text-xs text-slate-400">{empresa?.nome_fantasia}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
          title="Sair"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair
        </button>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-5 py-6 pb-20">

        {/* ── Pontos hero ───────────────────────────────────────────────────── */}
        <section
          className="rounded-3xl border p-6 text-center"
          style={{
            borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))",
            background:  "linear-gradient(135deg, var(--color-primary-15, rgba(16,185,129,0.15)) 0%, transparent 100%)",
          }}
        >
          <Trophy
            className="mx-auto h-10 w-10"
            style={{ color: "var(--color-primary, #10b981)" }}
          />
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Saldo de pontos
          </p>
          <p
            className="mt-1 text-5xl font-black"
            style={{ color: "var(--color-primary, #10b981)" }}
          >
            {cliente.pontos.toLocaleString("pt-BR")}
          </p>

          {proximo_beneficio && (
            <div className="mt-4 rounded-xl bg-white/5 p-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wider text-slate-400">
                    Próximo benefício
                  </p>
                  <p className="truncate text-sm font-semibold text-white">
                    Cupom <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono">{proximo_beneficio.codigo}</code>
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-slate-400">Faltam</p>
                  <p
                    className="text-sm font-bold"
                    style={{ color: "var(--color-primary, #10b981)" }}
                  >
                    {proximo_beneficio.faltam.toLocaleString("pt-BR")} pts
                  </p>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, (cliente.pontos / proximo_beneficio.pontos) * 100)}%`,
                    background: "var(--color-primary, #10b981)",
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* ── Stats grid ────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <ShoppingBag className="h-5 w-5 text-slate-400" />
            <p className="mt-2 text-2xl font-bold text-white">{cliente.total_pedidos}</p>
            <p className="text-xs text-slate-400">Pedidos</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <TrendingUp className="h-5 w-5 text-slate-400" />
            <p className="mt-2 text-2xl font-bold text-white">{formatBRL(cliente.total_gasto)}</p>
            <p className="text-xs text-slate-400">Total gasto</p>
          </div>
        </section>

        {/* ── Cupons ────────────────────────────────────────────────────────── */}
        {cupons.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
              <Tag className="h-4 w-4" />
              Cupons disponíveis
            </h2>

            <div className="space-y-2">
              {cupons.slice(0, 6).map((c) => {
                const podeResgatar = c.pontos_resgate == null
                  || cliente.pontos >= c.pontos_resgate;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    style={podeResgatar ? {
                      borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))",
                    } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <code
                        className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold tracking-widest"
                        style={{ color: "var(--color-primary, #10b981)" }}
                      >
                        {c.codigo}
                      </code>
                      <p className="mt-1 text-xs text-slate-400 capitalize">
                        {c.tipo === "percentual"
                          ? `${c.valor}% off`
                          : c.tipo === "frete_gratis"
                            ? "Frete grátis"
                            : `${formatBRL(c.valor)} off`}
                        {c.validade && ` · até ${formatDate(c.validade)}`}
                      </p>
                    </div>
                    {c.pontos_resgate != null && (
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-slate-400">Pontos</p>
                        <p
                          className="text-sm font-bold"
                          style={{ color: podeResgatar
                            ? "var(--color-primary, #10b981)"
                            : "rgb(100,116,139)" }}
                        >
                          {c.pontos_resgate}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Histórico de pedidos ──────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            <Clock className="h-4 w-4" />
            Últimos pedidos
          </h2>

          {pedidos.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-center text-sm text-slate-500">
              Nenhum pedido ainda. Faça seu primeiro!
            </div>
          ) : (
            <div className="space-y-2">
              {pedidos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 text-xs text-slate-500">#{p.numero}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {formatBRL(p.total)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDate(p.criado_em)} · {TIPO_LABEL[p.tipo] ?? p.tipo}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-slate-500/15 text-slate-400"}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Cliente info footer ───────────────────────────────────────────── */}
        <section className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Seus dados
          </p>
          <div className="space-y-1 text-sm text-slate-300">
            {cliente.telefone && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-500" />
                {formatPhone(cliente.telefone)}
              </p>
            )}
            {cliente.cpf && (
              <p className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                {cliente.cpf}
              </p>
            )}
            <p className="text-xs text-slate-500 pt-1">
              Cliente desde {formatDate(cliente.created_at)}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
