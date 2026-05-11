"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingCart, X, Plus, Minus, ChefHat, CheckCircle, ArrowLeft,
  Search, MapPin, User, Phone, RotateCcw, Clock, Star, Gift,
} from "lucide-react";

// ─── Translations ─────────────────────────────────────────────────────────────

const TR = {
  pt: {
    iniciar: "Toque para fazer seu pedido",
    identificacao_titulo: "Identificação",
    identificacao_sub: "Para acumular pontos e ver seu histórico",
    telefone: "Telefone",
    cpf: "CPF",
    continuar: "Continuar",
    sem_identificacao: "Continuar sem identificação",
    cadastro_titulo: "Complete seu cadastro",
    nome: "Nome completo",
    email: "E-mail",
    salvar: "Salvar e continuar",
    repetir_titulo: "Repetir último pedido?",
    repetir_sim: "Repetir pedido",
    repetir_nao: "Ver cardápio completo",
    buscar: "Buscar no cardápio...",
    todos: "Todos",
    destaques: "✦ Destaques",
    ver_pedido: "Ver pedido",
    confirmar: "Confirmar Pedido",
    enviando: "Enviando...",
    obs_geral: "Observação geral (opcional)",
    obs_item: "Observações",
    adicionar: "Adicionar",
    pedido_titulo: "Pedido",
    sucesso: "Pedido recebido com sucesso!",
    pontos_ganhos: "pontos adicionados",
    pontos_total: "Total de pontos",
    novo_pedido: "Fazer novo pedido",
    bebidas_titulo: "Que tal uma bebida?",
    bebidas_sub: "Complemente seu pedido",
    bebidas_nao: "Não, obrigado",
    aberto: "ABERTO AGORA",
    autoatendimento: "AUTOATENDIMENTO",
    cliente_identificado: "Cliente identificado",
    pontos_acumulados: "pontos acumulados",
  },
  en: {
    iniciar: "Tap to place your order",
    identificacao_titulo: "Identification",
    identificacao_sub: "To earn points and see your history",
    telefone: "Phone",
    cpf: "CPF/ID",
    continuar: "Continue",
    sem_identificacao: "Continue without identification",
    cadastro_titulo: "Complete your registration",
    nome: "Full name",
    email: "E-mail",
    salvar: "Save and continue",
    repetir_titulo: "Repeat last order?",
    repetir_sim: "Repeat order",
    repetir_nao: "View full menu",
    buscar: "Search menu...",
    todos: "All",
    destaques: "✦ Featured",
    ver_pedido: "View order",
    confirmar: "Confirm Order",
    enviando: "Sending...",
    obs_geral: "General note (optional)",
    obs_item: "Notes",
    adicionar: "Add",
    pedido_titulo: "Order",
    sucesso: "Order received successfully!",
    pontos_ganhos: "points added",
    pontos_total: "Total points",
    novo_pedido: "Place new order",
    bebidas_titulo: "How about a drink?",
    bebidas_sub: "Complete your order",
    bebidas_nao: "No, thank you",
    aberto: "OPEN NOW",
    autoatendimento: "SELF-SERVICE",
    cliente_identificado: "Identified customer",
    pontos_acumulados: "points accumulated",
  },
} as const;

type Idioma = keyof typeof TR;

function t(idioma: Idioma, key: keyof (typeof TR)["pt"]): string {
  return TR[idioma][key];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmpresaInfo {
  id: string; nome_fantasia: string; logo_url: string | null;
  cor_primaria: string | null; whatsapp: string | null;
  totem_bg_video_url: string | null;
  totem_bg_image_url: string | null;
  totem_cta_text: string | null;
  totem_slogan: string | null;
  horario_abertura: string | null;
  horario_fechamento: string | null;
}

interface Categoria {
  id: string; nome: string; descricao: string | null;
  imagem_url: string | null; ordem: number;
}

interface Produto {
  id: string; categoria_id: string | null; nome: string;
  descricao: string | null; preco: number; imagem_url: string | null;
  tempo_preparo: number | null; tipo: string; destaque: boolean;
}

interface CartItem {
  produto:    Produto;
  quantidade: number;
  obs:        string;
}

interface ClienteIdentificado {
  id:       string;
  nome:     string | null;
  telefone: string | null;
  cpf:      string | null;
  pontos:   number;
}

interface UltimoPedidoItem {
  nome:        string;
  quantidade:  number;
  preco:       number;
}

interface UltimoPedido {
  id:         string;
  numero:     number;
  total:      number;
  created_at: string;
  itens:      UltimoPedidoItem[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (src) return <img src={src} alt={alt} className="h-full w-full object-cover" />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-800">
      <ChefHat className="h-8 w-8 text-slate-600" />
    </div>
  );
}

// ─── Language Switcher ────────────────────────────────────────────────────────

function LangSwitcher({ idioma, setIdioma }: { idioma: Idioma; setIdioma: (i: Idioma) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/30 p-1 backdrop-blur">
      <button
        onClick={() => setIdioma("pt")}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
          idioma === "pt" ? "bg-white/20 text-white" : "text-white/50 hover:text-white/80"
        }`}
      >
        🇧🇷 PT
      </button>
      <button
        onClick={() => setIdioma("en")}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
          idioma === "en" ? "bg-white/20 text-white" : "text-white/50 hover:text-white/80"
        }`}
      >
        🇺🇸 EN
      </button>
    </div>
  );
}

// ─── StartScreen ──────────────────────────────────────────────────────────────

function StartScreen({
  empresa, idioma, setIdioma, onStart,
}: {
  empresa: EmpresaInfo;
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  onStart: () => void;
}) {
  // Split slogan: first line is the hero title, rest is subtitle
  const sloganLines = (empresa.totem_slogan || "").split("\n").map(l => l.trim()).filter(Boolean);
  const heroTitle   = sloganLines[0] || empresa.nome_fantasia;
  const subtitle    = sloganLines[1] || null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Background layer */}
      {empresa.totem_bg_video_url ? (
        <video
          src={empresa.totem_bg_video_url}
          autoPlay muted loop playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : empresa.totem_bg_image_url ? (
        <img
          src={empresa.totem_bg_image_url}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-stone-900 to-slate-900" />
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.72) 100%)" }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col px-8 py-10">

        {/* TOP ROW: logo+name on left, lang+badge on right */}
        <div className="flex items-start justify-between">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            {empresa.logo_url ? (
              <img
                src={empresa.logo_url}
                alt={empresa.nome_fantasia}
                className="h-14 w-14 rounded-xl object-cover shadow-xl ring-1 ring-white/20"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 shadow-xl ring-1 ring-white/20 backdrop-blur">
                <ChefHat className="h-7 w-7 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold tracking-wide text-white/90">
                {empresa.nome_fantasia}
              </p>
            </div>
          </div>

          {/* Right: lang switcher + open badge */}
          <div className="flex flex-col items-end gap-2">
            <LangSwitcher idioma={idioma} setIdioma={setIdioma} />
            <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/40 px-3 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                {t(idioma, "aberto")}
              </span>
            </div>
          </div>
        </div>

        {/* CENTER: subtitle + hero title */}
        <div className="flex flex-1 flex-col items-center justify-center text-center gap-5">
          {subtitle && (
            <p
              className="uppercase text-white/40"
              style={{ letterSpacing: "0.3em", fontSize: "0.7rem", fontWeight: 500 }}
            >
              — {subtitle} —
            </p>
          )}

          <h1
            style={{
              fontSize: "clamp(3rem, 10vw, 8rem)",
              fontWeight: 900,
              lineHeight: 1.05,
              fontFamily: "Georgia, 'Times New Roman', serif",
              background: "linear-gradient(135deg, #f5e6c8 0%, #d4a853 50%, #f5e6c8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "none",
              filter: "drop-shadow(0 4px 24px rgba(212,168,83,0.35))",
              maxWidth: "90vw",
            }}
          >
            {heroTitle}
          </h1>

          {!subtitle && empresa.totem_slogan && (
            <p
              className="uppercase text-white/40"
              style={{ letterSpacing: "0.2em", fontSize: "0.75rem", fontWeight: 500 }}
            >
              {empresa.nome_fantasia}
            </p>
          )}
        </div>

        {/* BOTTOM: CTA button + autoatendimento text */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={onStart}
            style={{
              background: "linear-gradient(135deg, #d4a853, #f5e6c8, #d4a853)",
              boxShadow: "0 0 30px rgba(212,168,83,0.4), 0 8px 32px rgba(0,0,0,0.4)",
            }}
            className="
              group flex items-center gap-3 rounded-full px-10 py-5
              text-lg font-black uppercase tracking-widest text-slate-900
              transition-all duration-200
              hover:scale-105 hover:brightness-110
              active:scale-95
            "
          >
            <span>{t(idioma, "iniciar")}</span>
            <span className="text-2xl transition-transform duration-200 group-hover:translate-x-1">›</span>
          </button>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/20">
            {t(idioma, "autoatendimento")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── RegisterModal (when customer not found) ──────────────────────────────────

interface RegisterModalProps {
  slug:          string;
  idioma:        Idioma;
  tipo:          "telefone" | "cpf";
  valorInicial:  string; // digits only from search
  onCreated:     (cliente: ClienteIdentificado) => void;
  onSkip:        () => void;
}

function RegisterModal({ slug, idioma, tipo, valorInicial, onCreated, onSkip }: RegisterModalProps) {
  const [nome,  setNome]  = useState("");
  const [email, setEmail] = useState("");
  const [tel,   setTel]   = useState(tipo === "telefone" ? valorInicial : "");
  const [cpf,   setCpf]   = useState(tipo === "cpf"      ? valorInicial : "");
  const [loading, setLoading] = useState(false);
  const [erro,    setErro]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErro("Nome é obrigatório"); return; }
    setLoading(true); setErro("");
    try {
      const body: Record<string, string> = { nome: nome.trim() };
      if (tel)   body.telefone = tel.replace(/\D/g, "");
      if (cpf)   body.cpf     = cpf.replace(/\D/g, "");
      if (email) body.email   = email.trim();

      const res  = await fetch(`/api/painel/clientes?slug=${slug}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success || data.data) {
        onCreated({
          id:       data.data?.id ?? "",
          nome:     data.data?.nome ?? nome.trim(),
          telefone: data.data?.telefone ?? (tel ? tel.replace(/\D/g, "") : null),
          cpf:      data.data?.cpf      ?? (cpf ? cpf.replace(/\D/g, "") : null),
          pontos:   0,
        });
      } else {
        setErro(data.error || "Erro ao criar cadastro");
      }
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <button onClick={onSkip} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-white">{t(idioma, "cadastro_titulo")}</h2>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 pb-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t(idioma, "nome")} *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder={t(idioma, "nome")}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t(idioma, "telefone")}</label>
            <input
              value={tel}
              onChange={e => setTel(e.target.value)}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t(idioma, "cpf")}</label>
            <input
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              inputMode="numeric"
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">{t(idioma, "email")} (opcional)</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              type="email"
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          {erro && <p className="text-sm text-red-400 text-center">{erro}</p>}

          <button
            type="submit"
            disabled={loading || !nome.trim()}
            className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-white hover:bg-emerald-400 disabled:opacity-40 transition"
          >
            {loading ? "..." : t(idioma, "salvar")}
          </button>
        </form>

        <button
          onClick={onSkip}
          className="mt-4 text-center text-sm text-slate-500 hover:text-slate-300 transition"
        >
          {t(idioma, "sem_identificacao")}
        </button>
      </div>
    </div>
  );
}

// ─── CustomerModal ────────────────────────────────────────────────────────────

interface CustomerModalProps {
  slug:          string;
  idioma:        Idioma;
  onIdentified:  (cliente: ClienteIdentificado, ultimoPedido: UltimoPedido | null) => void;
  onSkip:        () => void;
}

function CustomerModal({ slug, idioma, onIdentified, onSkip }: CustomerModalProps) {
  const [tipo, setTipo]   = useState<"telefone" | "cpf">("telefone");
  const [valor, setValor] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro]   = useState("");

  // When customer not found, show registration modal
  const [showRegister, setShowRegister]   = useState(false);
  const [digitsParaReg, setDigitosParaReg] = useState("");

  function formatInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (tipo === "cpf") {
      return digits
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
    }
    return digits
      .slice(0, 11)
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\(\d{2}\) )(\d{5})(\d)/, "$1$2-$3");
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    const digits = valor.replace(/\D/g, "");
    if (tipo === "telefone" && digits.length < 10) { setErro("Telefone inválido"); return; }
    if (tipo === "cpf"      && digits.length !== 11) { setErro("CPF inválido"); return; }

    setLoading(true); setErro("");
    try {
      const res  = await fetch(`/api/pub/cliente?slug=${slug}&tipo=${tipo}&valor=${digits}`);
      const data = await res.json();
      if (!data.success) { setErro("Erro na consulta"); return; }
      if (!data.data.encontrado) {
        // Open registration modal instead of auto-creating
        setDigitosParaReg(digits);
        setShowRegister(true);
      } else {
        onIdentified(
          data.data.cliente as ClienteIdentificado,
          data.data.ultimoPedido as UltimoPedido | null,
        );
      }
    } catch {
      setErro("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  if (showRegister) {
    return (
      <RegisterModal
        slug={slug}
        idioma={idioma}
        tipo={tipo}
        valorInicial={digitsParaReg}
        onCreated={(c) => onIdentified(c, null)}
        onSkip={onSkip}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <button onClick={onSkip} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-white">{t(idioma, "identificacao_titulo")}</h2>
          <p className="text-xs text-slate-500">{t(idioma, "identificacao_sub")}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 pb-8 space-y-6">
        <div className="flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
            <User className="h-10 w-10 text-emerald-400" />
          </div>
        </div>

        {/* Type toggle */}
        <div className="flex rounded-xl bg-slate-900 p-1">
          <button
            onClick={() => { setTipo("telefone"); setValor(""); setErro(""); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              tipo === "telefone" ? "bg-emerald-500 text-white" : "text-slate-400"
            }`}
          >
            <Phone className="h-4 w-4" /> {t(idioma, "telefone")}
          </button>
          <button
            onClick={() => { setTipo("cpf"); setValor(""); setErro(""); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              tipo === "cpf" ? "bg-emerald-500 text-white" : "text-slate-400"
            }`}
          >
            <User className="h-4 w-4" /> {t(idioma, "cpf")}
          </button>
        </div>

        <form onSubmit={handleBuscar} className="space-y-4">
          <input
            value={valor}
            onChange={e => setValor(formatInput(e.target.value))}
            placeholder={tipo === "telefone" ? "(00) 00000-0000" : "000.000.000-00"}
            inputMode="numeric"
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-4 py-4 text-center text-xl font-mono tracking-widest text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
          />
          {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
          <button
            type="submit"
            disabled={loading || valor.replace(/\D/g, "").length < (tipo === "cpf" ? 11 : 10)}
            className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-white hover:bg-emerald-400 disabled:opacity-40 transition"
          >
            {loading ? "..." : t(idioma, "continuar")}
          </button>
        </form>

        <button
          onClick={onSkip}
          className="text-center text-sm text-slate-500 hover:text-slate-300 transition"
        >
          {t(idioma, "sem_identificacao")}
        </button>
      </div>
    </div>
  );
}

// ─── RepeatOrderModal ─────────────────────────────────────────────────────────

interface RepeatOrderModalProps {
  cliente:      ClienteIdentificado;
  ultimoPedido: UltimoPedido;
  idioma:       Idioma;
  produtos:     Produto[];
  onRepeat:     (items: CartItem[]) => void;
  onSkip:       () => void;
}

function RepeatOrderModal({ cliente, ultimoPedido, idioma, produtos, onRepeat, onSkip }: RepeatOrderModalProps) {
  const itens = ultimoPedido.itens ?? [];

  function handleRepeat() {
    const cartItems: CartItem[] = [];
    for (const item of itens) {
      const prod = produtos.find(p => p.nome === item.nome);
      if (prod) cartItems.push({ produto: prod, quantidade: item.quantidade, obs: "" });
    }
    if (cartItems.length > 0) onRepeat(cartItems);
    else onSkip();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            {t(idioma, "cliente_identificado")}: {cliente.nome || ""}
          </h2>
          {cliente.pontos > 0 && (
            <p className="flex items-center gap-1 text-xs text-emerald-400">
              <Gift className="h-3 w-3" /> {cliente.pontos} {t(idioma, "pontos_acumulados")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 pb-8 space-y-5">
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
            <RotateCcw className="h-8 w-8 text-amber-400" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-white font-semibold text-lg">{t(idioma, "repetir_titulo")}</p>
          <p className="mt-1 text-xs text-slate-400">
            #{ultimoPedido.numero} · {formatBRL(Number(ultimoPedido.total))}
          </p>
        </div>

        {itens.length > 0 && (
          <div className="rounded-2xl bg-slate-900 divide-y divide-white/5 overflow-hidden">
            {itens.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                    {item.quantidade}
                  </span>
                  <span className="text-sm text-white">{item.nome}</span>
                </div>
                <span className="text-xs text-slate-400">{formatBRL(Number(item.preco) * item.quantidade)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            onClick={handleRepeat}
            className="w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-white hover:bg-emerald-400 transition"
          >
            <RotateCcw className="inline h-5 w-5 mr-2" />
            {t(idioma, "repetir_sim")}
          </button>
          <button
            onClick={onSkip}
            className="w-full rounded-xl bg-slate-800 py-4 text-base font-medium text-slate-300 hover:bg-slate-700 transition"
          >
            {t(idioma, "repetir_nao")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProductDetail ────────────────────────────────────────────────────────────

interface ProductDetailProps {
  produto:     Produto;
  idioma:      Idioma;
  onClose:     () => void;
  onAddToCart: (produto: Produto, qty: number, obs: string) => void;
}

function ProductDetail({ produto, idioma, onClose, onAddToCart }: ProductDetailProps) {
  const [qty, setQty] = useState(1);
  const [obs, setObs] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="relative h-56 flex-shrink-0">
        <ProductImage src={produto.imagem_url} alt={produto.nome} />
        <button
          onClick={onClose}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {produto.destaque && (
          <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-xs font-bold text-white">
            <Star className="h-3 w-3" /> Destaque
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-auto p-5">
        <h2 className="text-2xl font-bold text-white">{produto.nome}</h2>
        {produto.descricao && (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{produto.descricao}</p>
        )}
        {produto.tempo_preparo && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" /> ~{produto.tempo_preparo} min
          </p>
        )}
        <p className="mt-4 text-2xl font-bold text-emerald-400">{formatBRL(produto.preco)}</p>

        <div className="mt-6">
          <label className="block text-sm text-slate-400 mb-2">{t(idioma, "obs_item")}</label>
          <textarea
            value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Ex: sem cebola, bem passado..."
            rows={3}
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 resize-none"
          />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-800 px-4 py-2">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="text-slate-400 hover:text-white transition">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-bold text-white">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="text-slate-400 hover:text-white transition">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => { onAddToCart(produto, qty, obs); onClose(); }}
            className="flex-1 rounded-xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 transition"
          >
            {t(idioma, "adicionar")} · {formatBRL(produto.preco * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DrinksModal ──────────────────────────────────────────────────────────────

interface DrinksModalProps {
  bebidas:     Produto[];
  idioma:      Idioma;
  onAdd:       (produto: Produto) => void;
  onSkip:      () => void;
}

function DrinksModal({ bebidas, idioma, onAdd, onSkip }: DrinksModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl bg-slate-900 p-6 pb-8">
        <div className="mb-1 text-center">
          <h2 className="text-xl font-bold text-white">{t(idioma, "bebidas_titulo")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t(idioma, "bebidas_sub")}</p>
        </div>

        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {bebidas.map(b => (
            <button
              key={b.id}
              onClick={() => { onAdd(b); onSkip(); }}
              className="flex-shrink-0 w-36 rounded-2xl bg-slate-800 border border-white/5 overflow-hidden text-left hover:border-emerald-500/30 transition"
            >
              <div className="h-24">
                <ProductImage src={b.imagem_url} alt={b.nome} />
              </div>
              <div className="p-2.5">
                <p className="text-xs font-semibold text-white line-clamp-2">{b.nome}</p>
                <p className="mt-1 text-sm font-bold text-emerald-400">{formatBRL(b.preco)}</p>
                <div className="mt-1.5 flex items-center justify-center rounded-lg bg-emerald-500/20 py-1">
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onSkip}
          className="mt-5 w-full rounded-xl bg-slate-800 py-3 text-sm font-medium text-slate-400 hover:bg-slate-700 hover:text-white transition"
        >
          {t(idioma, "bebidas_nao")}
        </button>
      </div>
    </div>
  );
}

// ─── CartDrawer ───────────────────────────────────────────────────────────────

interface CartDrawerProps {
  cart:        CartItem[];
  mesaNumero:  number | null;
  cliente:     ClienteIdentificado | null;
  idioma:      Idioma;
  onClose:     () => void;
  onUpdate:    (produtoId: string, delta: number) => void;
  onConfirm:   (clienteNome: string, clienteTel: string, obs: string) => Promise<void>;
}

function CartDrawer({ cart, mesaNumero, cliente, idioma, onClose, onUpdate, onConfirm }: CartDrawerProps) {
  const [nome, setNome]     = useState(cliente?.nome ?? "");
  const [tel, setTel]       = useState(cliente?.telefone ?? "");
  const [obs, setObs]       = useState("");
  const [sending, setSending] = useState(false);

  const total = cart.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0);

  async function handleOrder() {
    setSending(true);
    try { await onConfirm(nome, tel, obs); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-white">{t(idioma, "pedido_titulo")}</h2>
          {mesaNumero && (
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Mesa {mesaNumero}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {cart.map((item) => (
          <div key={item.produto.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3">
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
              <ProductImage src={item.produto.imagem_url} alt={item.produto.nome} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">{item.produto.nome}</p>
              {item.obs && <p className="text-xs text-slate-500 truncate">{item.obs}</p>}
              <p className="text-sm font-bold text-emerald-400">{formatBRL(item.produto.preco * item.quantidade)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdate(item.produto.id, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition">
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 text-center text-sm font-bold text-white">{item.quantidade}</span>
              <button onClick={() => onUpdate(item.produto.id, +1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition">
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-400">Total</span>
          <span className="text-xl font-bold text-white">{formatBRL(total)}</span>
        </div>

        {!cliente && (
          <>
            <input
              value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder={t(idioma, "nome")}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
            <input
              value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, ""))}
              placeholder={t(idioma, "telefone") + " (opcional)"}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </>
        )}
        {cliente && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <User className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{cliente.nome || t(idioma, "cliente_identificado")}</p>
              <p className="text-xs text-emerald-400">{cliente.pontos} {t(idioma, "pontos_acumulados")}</p>
            </div>
          </div>
        )}

        <input
          value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder={t(idioma, "obs_geral")}
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
        />

        <button
          onClick={handleOrder} disabled={sending || cart.length === 0}
          className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 transition disabled:opacity-50"
        >
          {sending ? t(idioma, "enviando") : t(idioma, "confirmar")}
        </button>
      </div>
    </div>
  );
}

// ─── SuccessScreen (rich, with points + countdown ring) ───────────────────────

interface SuccessScreenProps {
  numero:      number;
  mesaNumero:  number | null;
  clienteNome: string;
  pontosGanhos?: number;
  totalPontos?:  number;
  idioma:      Idioma;
  onReset:     () => void;
}

function SuccessScreen({
  numero, mesaNumero, clienteNome, pontosGanhos, totalPontos, idioma, onReset,
}: SuccessScreenProps) {
  const [remaining, setRemaining] = useState(15);
  const TOTAL = 15;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(interval); onReset(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReset]);

  const radius    = 30;
  const circumference = 2 * Math.PI * radius;
  const dashOffset  = circumference * (1 - remaining / TOTAL);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-950 p-8 text-center">
      {/* Animated checkmark */}
      <div className="relative flex items-center justify-center">
        {/* Countdown ring */}
        <svg className="absolute" width="120" height="120" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="#1e293b" strokeWidth="4" />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <CheckCircle className="h-14 w-14 text-emerald-400" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
          {t(idioma, "sucesso")}
        </p>
        <h2 className="text-4xl font-black text-white">#{numero}</h2>

        {mesaNumero && (
          <p className="text-emerald-400 font-semibold flex items-center justify-center gap-1">
            <MapPin className="h-4 w-4" /> Mesa {mesaNumero}
          </p>
        )}

        {clienteNome && (
          <p className="text-slate-300">
            {clienteNome}
          </p>
        )}

        {(pontosGanhos !== undefined && pontosGanhos > 0) && (
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/20 px-4 py-2 mt-2">
            <Gift className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-bold text-amber-300">
              +{pontosGanhos} {t(idioma, "pontos_ganhos")}
            </span>
          </div>
        )}

        {(totalPontos !== undefined && totalPontos > 0) && (
          <p className="text-xs text-slate-500 mt-1">
            {t(idioma, "pontos_total")}: {totalPontos}
          </p>
        )}
      </div>

      <button
        onClick={onReset}
        className="mt-2 rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-white hover:bg-emerald-400 transition"
      >
        {t(idioma, "novo_pedido")}
      </button>

      <p className="text-xs text-slate-600">
        {remaining}s
      </p>
    </div>
  );
}

// ─── ProductRow ───────────────────────────────────────────────────────────────

function ProductRow({ produto, onOpen }: { produto: Produto; onOpen: (p: Produto) => void }) {
  return (
    <button
      onClick={() => onOpen(produto)}
      className="flex w-full items-center gap-3 rounded-2xl bg-slate-900 border border-white/5 p-3 text-left hover:border-emerald-500/20 transition"
    >
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl">
        <ProductImage src={produto.imagem_url} alt={produto.nome} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {produto.destaque && <Star className="h-3 w-3 text-amber-400 flex-shrink-0" />}
          <p className="font-semibold text-white line-clamp-1">{produto.nome}</p>
        </div>
        {produto.descricao && (
          <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{produto.descricao}</p>
        )}
        <p className="mt-1.5 text-sm font-bold text-emerald-400">{formatBRL(produto.preco)}</p>
      </div>
      <Plus className="h-5 w-5 flex-shrink-0 text-slate-600" />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const IDLE_MS = 3 * 60 * 1000;

type Fase = "start" | "identificacao" | "repeat" | "cardapio";

// Framer Motion variants for page-level transitions
const pageVariants = {
  initial: { opacity: 0, x: 60 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -60 },
};
const pageTransition = { duration: 0.35, ease: "easeInOut" as const };

export default function TotemPage({ params }: { params: { slug: string } }) {
  const searchParams = useSearchParams();
  const mesaId       = searchParams.get("mesa");
  const mesaNumero   = searchParams.get("mesa_numero");

  const [empresa, setEmpresa]       = useState<EmpresaInfo | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [mesaNumeroReal]            = useState<number | null>(mesaNumero ? Number(mesaNumero) : null);

  // Language
  const [idioma, setIdioma] = useState<Idioma>("pt");

  // Totem flow
  const [fase, setFase]                 = useState<Fase>("start");
  const [cliente, setCliente]           = useState<ClienteIdentificado | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<UltimoPedido | null>(null);
  const [pedidoFeito, setPedidoFeito]   = useState<{
    numero: number; clienteNome: string; pontosGanhos?: number; totalPontos?: number;
  } | null>(null);

  // Menu nav
  const [catSelecionada, setCatSelecionada] = useState<string>("todos");
  const [q, setQ]                           = useState("");
  const [produtoAberto, setProdutoAberto]   = useState<Produto | null>(null);
  const [cartOpen, setCartOpen]             = useState(false);
  const [cart, setCart]                     = useState<CartItem[]>([]);

  // Drinks modal
  const [showDrinksModal, setShowDrinksModal] = useState(false);
  const drinksShownRef = useRef(false);

  // Idle timer
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetIdleTimer() {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (fase === "cardapio" && !cartOpen && !produtoAberto) {
      idleRef.current = setTimeout(handleFullReset, IDLE_MS);
    }
  }

  useEffect(() => {
    if (fase !== "cardapio") return;
    resetIdleTimer();
    const events = ["touchstart", "click", "keydown"];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, cartOpen, produtoAberto]);

  // Load cardápio data
  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/pub/cardapio/${params.slug}`);
        const data = await res.json();
        if (!data.success) { setNotFound(true); return; }
        setEmpresa(data.data.empresa);
        setCategorias(data.data.categorias);
        setProdutos(data.data.produtos);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.slug]);

  // ── Flow handlers ──────────────────────────────────────────────────────────

  function handleStart() {
    setFase("identificacao");
  }

  function handleIdentified(c: ClienteIdentificado, up: UltimoPedido | null) {
    setCliente(c);
    setUltimoPedido(up);
    if (up && up.itens && up.itens.length > 0) {
      setFase("repeat");
    } else {
      setFase("cardapio");
    }
  }

  function handleSkipIdentificacao() {
    setCliente(null);
    setUltimoPedido(null);
    setFase("cardapio");
  }

  function handleRepeatOrder(items: CartItem[]) {
    setCart(items);
    setFase("cardapio");
    setCartOpen(true);
  }

  function handleFullReset() {
    setFase("start");
    setCliente(null);
    setUltimoPedido(null);
    setCart([]);
    setCartOpen(false);
    setProdutoAberto(null);
    setPedidoFeito(null);
    setQ("");
    setCatSelecionada("todos");
    setShowDrinksModal(false);
    drinksShownRef.current = false;
    setIdioma("pt");
  }

  // ── Cart ───────────────────────────────────────────────────────────────────

  const addToCart = useCallback((produto: Produto, qty: number, obs: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.produto.id === produto.id);
      if (existing) return prev.map(i => i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + qty } : i);
      return [...prev, { produto, quantidade: qty, obs }];
    });
  }, []);

  const updateCart = useCallback((produtoId: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i)
          .filter(i => i.quantidade > 0)
    );
  }, []);

  const cartTotal = cart.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0);
  const cartCount = cart.reduce((acc, i) => acc + i.quantidade, 0);

  // Bebidas available
  const bebidas = useMemo(() => produtos.filter(p => p.tipo === "bebida"), [produtos]);

  // ── Open cart (with drinks interstitial) ──────────────────────────────────

  function handleOpenCart() {
    // Show drinks modal if: not shown yet, no drink in cart, there are bebidas
    const hasDrinkInCart = cart.some(i => i.produto.tipo === "bebida");
    if (!drinksShownRef.current && !hasDrinkInCart && bebidas.length > 0) {
      drinksShownRef.current = true;
      setShowDrinksModal(true);
    } else {
      setCartOpen(true);
    }
  }

  // ── Confirm order ──────────────────────────────────────────────────────────

  async function handleConfirmarPedido(clienteNome: string, clienteTel: string, obs: string) {
    const res = await fetch(`/api/pub/pedidos/${params.slug}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        cliente_nome:     clienteNome || cliente?.nome || undefined,
        cliente_telefone: clienteTel  || cliente?.telefone || undefined,
        cliente_id:       cliente?.id || undefined,
        observacoes:      obs         || undefined,
        mesa_id:          mesaId      || undefined,
        itens: cart.map(i => ({
          produto_id:     i.produto.id,
          nome:           i.produto.nome,
          preco_unitario: i.produto.preco,
          quantidade:     i.quantidade,
          observacoes:    i.obs || undefined,
        })),
      }),
    });

    const data = await res.json();
    if (!data.success) { alert(data.error || "Erro ao enviar pedido"); return; }

    const pontosGanhos = data.data.pontos_ganhos as number | undefined;
    const totalPontos  = (cliente?.pontos ?? 0) + (pontosGanhos ?? 0);

    setCart([]);
    setCartOpen(false);
    setPedidoFeito({
      numero:      data.data.numero,
      clienteNome: clienteNome || cliente?.nome || "",
      pontosGanhos,
      totalPontos: totalPontos > 0 ? totalPontos : undefined,
    });
  }

  // ── Filtered products ──────────────────────────────────────────────────────

  const produtosFiltrados = useMemo(() => {
    let list = produtos;
    if (catSelecionada !== "todos") list = list.filter(p => p.categoria_id === catSelecionada);
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(p =>
        p.nome.toLowerCase().includes(lower) || p.descricao?.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [produtos, catSelecionada, q]);

  const destaques = useMemo(() => produtos.filter(p => p.destaque), [produtos]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (notFound || !empresa) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-white">
        <ChefHat className="h-16 w-16 text-slate-600" />
        <h1 className="text-2xl font-bold">Cardápio não encontrado</h1>
        <p className="text-slate-500">Este restaurante não existe ou está indisponível.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">

      {/* ── Animated phase container ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {fase === "start" && (
          <motion.div
            key="start"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ position: "absolute", inset: 0 }}
          >
            <StartScreen
              empresa={empresa}
              idioma={idioma}
              setIdioma={setIdioma}
              onStart={handleStart}
            />
          </motion.div>
        )}

        {fase === "identificacao" && (
          <motion.div
            key="identificacao"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ position: "absolute", inset: 0 }}
          >
            <CustomerModal
              slug={params.slug}
              idioma={idioma}
              onIdentified={handleIdentified}
              onSkip={handleSkipIdentificacao}
            />
          </motion.div>
        )}

        {fase === "repeat" && cliente && ultimoPedido && (
          <motion.div
            key="repeat"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ position: "absolute", inset: 0 }}
          >
            <RepeatOrderModal
              cliente={cliente}
              ultimoPedido={ultimoPedido}
              idioma={idioma}
              produtos={produtos}
              onRepeat={handleRepeatOrder}
              onSkip={() => setFase("cardapio")}
            />
          </motion.div>
        )}

        {fase === "cardapio" && (
          <motion.div
            key="cardapio"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ position: "absolute", inset: 0, overflowY: "auto" }}
            className="pb-32"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-white/5 bg-slate-950/90 backdrop-blur">
              <div className="flex items-center gap-3 px-4 py-3">
                {empresa.logo_url ? (
                  <img src={empresa.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
                    <ChefHat className="h-4 w-4 text-emerald-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-bold">{empresa.nome_fantasia}</p>
                  {mesaNumeroReal ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Mesa {mesaNumeroReal}
                    </p>
                  ) : cliente ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <User className="h-3 w-3" /> {cliente.nome || t(idioma, "cliente_identificado")} · {cliente.pontos} pts
                    </p>
                  ) : null}
                </div>
                <button
                  onClick={handleOpenCart}
                  className="relative flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {cartCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
                      {cartCount}
                    </span>
                  )}
                  {cartCount > 0 && <span>{formatBRL(cartTotal)}</span>}
                </button>
              </div>

              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    value={q} onChange={e => setQ(e.target.value)}
                    placeholder={t(idioma, "buscar")}
                    className="w-full rounded-xl bg-slate-800 border border-white/10 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                  {q && (
                    <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {!q && (
                <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
                  <button
                    onClick={() => setCatSelecionada("todos")}
                    className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      catSelecionada === "todos" ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {t(idioma, "todos")}
                  </button>
                  {categorias.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCatSelecionada(c.id)}
                      className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                        catSelecionada === c.id ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="px-4 pt-4 space-y-8">
              {catSelecionada === "todos" && !q && destaques.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-400">
                    {t(idioma, "destaques")}
                  </h2>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {destaques.map(produto => (
                      <button
                        key={produto.id}
                        onClick={() => setProdutoAberto(produto)}
                        className="flex-shrink-0 w-40 rounded-2xl bg-slate-900 border border-white/5 overflow-hidden text-left hover:border-emerald-500/30 transition"
                      >
                        <div className="h-28">
                          <ProductImage src={produto.imagem_url} alt={produto.nome} />
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-semibold text-white line-clamp-2">{produto.nome}</p>
                          <p className="mt-1 text-sm font-bold text-emerald-400">{formatBRL(produto.preco)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {catSelecionada === "todos" && !q
                ? categorias.map(cat => {
                    const catProdutos = produtosFiltrados.filter(p => p.categoria_id === cat.id);
                    if (catProdutos.length === 0) return null;
                    return (
                      <section key={cat.id}>
                        <h2 className="mb-3 text-base font-bold text-white">{cat.nome}</h2>
                        <div className="space-y-2">
                          {catProdutos.map(produto => (
                            <ProductRow key={produto.id} produto={produto} onOpen={setProdutoAberto} />
                          ))}
                        </div>
                      </section>
                    );
                  })
                : (
                  <section>
                    {q && (
                      <p className="mb-3 text-sm text-slate-400">
                        {produtosFiltrados.length} resultado{produtosFiltrados.length !== 1 ? "s" : ""} para &ldquo;{q}&rdquo;
                      </p>
                    )}
                    {produtosFiltrados.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
                        <ChefHat className="h-10 w-10" />
                        <p className="text-sm">Nenhum produto encontrado</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {produtosFiltrados.map(produto => (
                          <ProductRow key={produto.id} produto={produto} onOpen={setProdutoAberto} />
                        ))}
                      </div>
                    )}
                  </section>
                )
              }
            </div>

            {/* Sticky cart button */}
            {cartCount > 0 && !cartOpen && (
              <div className="fixed bottom-6 left-4 right-4 z-20">
                <button
                  onClick={handleOpenCart}
                  className="w-full flex items-center justify-between rounded-2xl bg-emerald-500 px-5 py-4 font-semibold text-white shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{cartCount}</span>
                  <span>{t(idioma, "ver_pedido")}</span>
                  <span>{formatBRL(cartTotal)}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Overlays (always on top, outside AnimatePresence) ─────────────────── */}

      {produtoAberto && (
        <ProductDetail
          produto={produtoAberto}
          idioma={idioma}
          onClose={() => setProdutoAberto(null)}
          onAddToCart={addToCart}
        />
      )}

      {showDrinksModal && (
        <DrinksModal
          bebidas={bebidas}
          idioma={idioma}
          onAdd={(b) => addToCart(b, 1, "")}
          onSkip={() => { setShowDrinksModal(false); setCartOpen(true); }}
        />
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          mesaNumero={mesaNumeroReal}
          cliente={cliente}
          idioma={idioma}
          onClose={() => setCartOpen(false)}
          onUpdate={updateCart}
          onConfirm={handleConfirmarPedido}
        />
      )}

      {pedidoFeito && (
        <SuccessScreen
          numero={pedidoFeito.numero}
          mesaNumero={mesaNumeroReal}
          clienteNome={pedidoFeito.clienteNome}
          pontosGanhos={pedidoFeito.pontosGanhos}
          totalPontos={pedidoFeito.totalPontos}
          idioma={idioma}
          onReset={handleFullReset}
        />
      )}
    </div>
  );
}
