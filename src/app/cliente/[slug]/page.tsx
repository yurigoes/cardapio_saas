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
  Sparkles, Clock, TrendingUp, LogOut,
  Gift, Check, X, Copy,
} from "lucide-react";
import { applyBrandColors } from "@/lib/theme";

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
  empresa: {
    nome_fantasia:     string;
    slug:              string;
    fidelidade_ativo?: boolean;
    real_por_ponto?:   number;
    pontos_por_real?:  number;
  };
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
  pronto:     "bg-brand/15 text-brand",
  entregue:   "bg-brand/15 text-brand",
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

interface CashbackData {
  empresa:  { cashback_ativo: boolean; cashback_percentual: number };
  saldo:    number;
  movimentos: Array<{
    id: string; tipo: string; valor: number;
    saldo_anterior: number | null; saldo_atual: number | null;
    motivo: string | null; criado_em: string;
    pedido_numero: number | null;
  }>;
}

export default function ClientePainelPage({ params }: { params: { slug: string } }) {
  const [empresa, setEmpresa]   = useState<EmpresaPub | null>(null);
  const [perfil,  setPerfil]    = useState<PerfilCompleto | null>(null);
  const [cashback, setCashback] = useState<CashbackData | null>(null);
  const [loading, setLoading]   = useState(true);

  // Login form
  const [tipo,  setTipo]    = useState<"telefone" | "cpf">("telefone");
  const [valor, setValor]   = useState("");
  const [erro,  setErro]    = useState("");
  const [searching, setSearching] = useState(false);

  // Resgate
  const [resgateAlvo,  setResgateAlvo]  = useState<Cupom | null>(null);
  const [resgateLoad,  setResgateLoad]  = useState(false);
  const [resgateErro,  setResgateErro]  = useState("");
  const [resgateOk,    setResgateOk]    = useState<{ codigo: string; pontos: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Troca livre de pontos → cupom
  const [trocaPontos, setTrocaPontos] = useState("");
  const [trocaLoad,   setTrocaLoad]   = useState(false);
  const [trocaErro,   setTrocaErro]   = useState("");
  const [trocaOk,     setTrocaOk]     = useState<{ codigo: string; valor: number; pontos: number } | null>(null);

  // ── Apply brand color ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/pub/cardapio/${params.slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const emp = d.data.empresa as EmpresaPub;
        setEmpresa(emp);
        applyBrandColors({ primary: emp.cor_primaria });
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
      const [resPerfil, resCb] = await Promise.all([
        fetch(`/api/pub/cliente/${id}?slug=${params.slug}`),
        fetch(`/api/pub/cliente/${id}/cashback?slug=${params.slug}`),
      ]);
      const data = await resPerfil.json();
      if (data.success) {
        setPerfil(data.data);
      } else {
        localStorage.removeItem(STORAGE_KEY(params.slug));
        return;
      }
      const cbData = await resCb.json().catch(() => null);
      if (cbData?.success) setCashback(cbData.data);
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

  // ── Resgate ────────────────────────────────────────────────────────────────
  async function confirmarResgate() {
    if (!resgateAlvo || !perfil) return;
    setResgateLoad(true); setResgateErro("");
    try {
      const res  = await fetch(`/api/pub/cliente/${perfil.cliente.id}/resgatar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ cupom_id: resgateAlvo.id, slug: params.slug }),
      });
      const data = await res.json();
      if (!data.success) {
        setResgateErro(data.error || "Erro ao resgatar");
        return;
      }
      setResgateOk({
        codigo: data.data.cupom.codigo,
        pontos: data.data.pontos_debitados,
      });
      // Recarrega o perfil para refletir saldo e novo cupom
      await loadPerfil(perfil.cliente.id);
    } catch {
      setResgateErro("Erro de conexão");
    } finally {
      setResgateLoad(false);
    }
  }

  function fecharResgate() {
    setResgateAlvo(null);
    setResgateErro("");
    setResgateOk(null);
    setCopiado(false);
  }

  async function trocarPontos() {
    if (!perfil) return;
    const pts = parseInt(trocaPontos, 10);
    if (!pts || pts <= 0) { setTrocaErro("Informe uma quantidade válida"); return; }
    if (pts > perfil.cliente.pontos) { setTrocaErro("Saldo insuficiente"); return; }
    setTrocaLoad(true); setTrocaErro("");
    try {
      const res = await fetch(`/api/pub/cliente/${perfil.cliente.id}/trocar-pontos`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ slug: params.slug, pontos: pts }),
      });
      const data = await res.json();
      if (!data.success) { setTrocaErro(data.error || "Erro ao trocar"); return; }
      setTrocaOk({
        codigo: data.data.cupom.codigo,
        valor:  data.data.cupom.valor,
        pontos: data.data.pontos_debitados,
      });
      setTrocaPontos("");
      await loadPerfil(perfil.cliente.id);
    } catch {
      setTrocaErro("Erro de conexão");
    } finally {
      setTrocaLoad(false);
    }
  }

  function copiarCodigo(codigo: string) {
    navigator.clipboard.writeText(codigo).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={empresa.logo_url}
              alt={empresa.nome_fantasia ?? ""}
              className="h-12 w-auto max-w-[200px] object-contain"
            />
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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={empresa.logo_url}
              alt={empresa.nome_fantasia ?? ""}
              className="h-11 w-auto max-w-[180px] flex-shrink-0 object-contain"
            />
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

        {/* ── Trocar pontos por cupom ───────────────────────────────────────── */}
        {perfil.empresa.fidelidade_ativo && (perfil.empresa.real_por_ponto ?? 0) > 0 && cliente.pontos > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="h-4 w-4" style={{ color: "var(--color-primary, #10b981)" }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Trocar pontos por cupom
              </h2>
            </div>

            {trocaOk ? (
              <div className="space-y-3">
                <div className="rounded-xl border-2 border-dashed p-4 text-center"
                     style={{ borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))" }}>
                  <p className="text-xs text-slate-400">Cupom gerado · {formatBRL(trocaOk.valor)} de desconto</p>
                  <code className="block mt-1 text-2xl font-black tracking-widest"
                        style={{ color: "var(--color-primary, #10b981)" }}>
                    {trocaOk.codigo}
                  </code>
                  <p className="mt-2 text-xs text-slate-500">−{trocaOk.pontos} pts · válido por 30 dias</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copiarCodigo(trocaOk.codigo)}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition">
                    <Copy className="h-3.5 w-3.5" />
                    {copiado ? "Copiado!" : "Copiar código"}
                  </button>
                  <button onClick={() => setTrocaOk(null)}
                          className="flex-1 rounded-lg py-2 text-xs font-semibold text-white transition hover:brightness-110"
                          style={{ background: "var(--color-primary, #10b981)" }}>
                    Trocar mais
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">
                  Regra: <strong className="text-white">1 pt = {formatBRL(perfil.empresa.real_por_ponto ?? 0)}</strong>.
                  Você tem <strong className="text-white">{cliente.pontos.toLocaleString("pt-BR")}</strong> pts
                  {" "}(até {formatBRL(cliente.pontos * (perfil.empresa.real_por_ponto ?? 0))} em cupons).
                </p>

                <div className="flex gap-2 items-stretch">
                  <input
                    type="number" inputMode="numeric" min={1} max={cliente.pontos}
                    value={trocaPontos}
                    onChange={e => { setTrocaPontos(e.target.value.replace(/\D/g, "")); setTrocaErro(""); }}
                    placeholder="Pontos a trocar"
                    className="flex-1 min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button onClick={trocarPontos} disabled={trocaLoad || !trocaPontos}
                          className="flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                          style={{ background: "var(--color-primary, #10b981)" }}>
                    {trocaLoad ? "..." : "Trocar"}
                  </button>
                </div>

                {trocaPontos && parseInt(trocaPontos, 10) > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    = cupom de <strong style={{ color: "var(--color-primary, #10b981)" }}>
                      {formatBRL(parseInt(trocaPontos, 10) * (perfil.empresa.real_por_ponto ?? 0))}
                    </strong>
                  </p>
                )}

                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[10, 50, 100, 500].filter(n => n <= cliente.pontos).map(n => (
                    <button key={n} onClick={() => setTrocaPontos(String(n))}
                            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 transition">
                      {n} pts
                    </button>
                  ))}
                  {cliente.pontos > 0 && (
                    <button onClick={() => setTrocaPontos(String(cliente.pontos))}
                            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 transition">
                      Tudo ({cliente.pontos} pts)
                    </button>
                  )}
                </div>

                {trocaErro && (
                  <p className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                    {trocaErro}
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Saldo de cashback ─────────────────────────────────────────────── */}
        {cashback?.empresa.cashback_ativo && (
          <section className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
                  💵 Saldo Cashback
                </p>
                <p className="mt-1 text-3xl font-black text-white">
                  {formatBRL(cashback.saldo)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Você ganha <strong className="text-amber-300">{cashback.empresa.cashback_percentual}%</strong> em cada compra
                </p>
              </div>
            </div>
            {cashback.movimentos.length > 0 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300">
                  Ver últimos movimentos
                </summary>
                <div className="mt-2 space-y-1">
                  {cashback.movimentos.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        {m.tipo === "credito" ? "+ Crédito" :
                         m.tipo === "debito"  ? "− Uso"     : "Ajuste"}
                        {m.pedido_numero && ` · pedido #${m.pedido_numero}`}
                      </span>
                      <span className={m.tipo === "debito" ? "text-red-400" : "text-amber-300"}>
                        {m.tipo === "debito" ? "−" : "+"}{formatBRL(m.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

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
                const eResgate     = c.pontos_resgate != null && c.pontos_resgate > 0;
                const podeResgatar = eResgate && cliente.pontos >= (c.pontos_resgate ?? 0);
                const meuPersonal  = !eResgate && c.codigo.startsWith("RGT-");

                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    style={podeResgatar || meuPersonal ? {
                      borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))",
                    } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {meuPersonal && (
                          <Gift className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--color-primary, #10b981)" }} />
                        )}
                        <code
                          className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold tracking-widest"
                          style={{ color: "var(--color-primary, #10b981)" }}
                        >
                          {c.codigo}
                        </code>
                      </div>
                      <p className="mt-1 text-xs text-slate-400 capitalize">
                        {c.tipo === "percentual"
                          ? `${c.valor}% off`
                          : c.tipo === "frete_gratis"
                            ? "Frete grátis"
                            : `${formatBRL(c.valor)} off`}
                        {c.validade && ` · até ${formatDate(c.validade)}`}
                      </p>
                    </div>

                    {eResgate ? (
                      <button
                        onClick={() => podeResgatar && setResgateAlvo(c)}
                        disabled={!podeResgatar}
                        className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed"
                        style={podeResgatar ? {
                          background: "var(--color-primary, #10b981)",
                          color: "white",
                        } : {
                          background: "rgba(148,163,184,0.1)",
                          color:      "rgb(100,116,139)",
                        }}
                      >
                        <Gift className="h-3.5 w-3.5" />
                        {podeResgatar
                          ? `Resgatar · ${c.pontos_resgate} pts`
                          : `Faltam ${(c.pontos_resgate ?? 0) - cliente.pontos} pts`}
                      </button>
                    ) : meuPersonal ? (
                      <button
                        onClick={() => copiarCodigo(c.codigo)}
                        className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 transition"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiado ? "Copiado!" : "Copiar"}
                      </button>
                    ) : null}
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

      {/* ── Modal de resgate ─────────────────────────────────────────────────── */}
      {resgateAlvo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fecharResgate} />
          <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-white/10 p-6 shadow-2xl">
            {resgateOk ? (
              // ── Tela de sucesso ──────────────────────────────────────────────
              <div className="text-center space-y-4">
                <div
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ background: "var(--color-primary-15, rgba(16,185,129,0.15))" }}
                >
                  <Check className="h-10 w-10" style={{ color: "var(--color-primary, #10b981)" }} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Cupom resgatado!</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    −{resgateOk.pontos} pontos · use o código abaixo no seu próximo pedido
                  </p>
                </div>

                <div
                  className="rounded-2xl border-2 border-dashed p-4"
                  style={{ borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))" }}
                >
                  <code
                    className="block text-2xl font-black tracking-widest"
                    style={{ color: "var(--color-primary, #10b981)" }}
                  >
                    {resgateOk.codigo}
                  </code>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => copiarCodigo(resgateOk.codigo)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-medium text-white hover:bg-white/5 transition"
                  >
                    <Copy className="h-4 w-4" />
                    {copiado ? "Copiado!" : "Copiar"}
                  </button>
                  <button
                    onClick={fecharResgate}
                    style={{ background: "var(--color-primary, #10b981)" }}
                    className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition hover:brightness-110"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              // ── Tela de confirmação ──────────────────────────────────────────
              <>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-white">Confirmar resgate</h3>
                    <p className="mt-0.5 text-xs text-slate-400">Você está prestes a trocar pontos por um cupom</p>
                  </div>
                  <button onClick={fecharResgate} className="text-slate-400 hover:text-white transition">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Cupom info */}
                <div className="space-y-3 rounded-2xl bg-white/5 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Benefício</span>
                    <span className="text-sm font-semibold text-white capitalize">
                      {resgateAlvo.tipo === "percentual"
                        ? `${resgateAlvo.valor}% de desconto`
                        : resgateAlvo.tipo === "frete_gratis"
                          ? "Frete grátis"
                          : `${formatBRL(resgateAlvo.valor)} de desconto`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Custo</span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: "var(--color-primary, #10b981)" }}
                    >
                      −{resgateAlvo.pontos_resgate} pts
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <span className="text-xs text-slate-400">Saldo após resgate</span>
                    <span className="text-sm font-bold text-white">
                      {(cliente.pontos - (resgateAlvo.pontos_resgate ?? 0)).toLocaleString("pt-BR")} pts
                    </span>
                  </div>
                </div>

                {resgateErro && (
                  <p className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                    {resgateErro}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={fecharResgate}
                    className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarResgate}
                    disabled={resgateLoad}
                    style={{ background: "var(--color-primary, #10b981)" }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {resgateLoad ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <Gift className="h-4 w-4" />
                        Resgatar
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
