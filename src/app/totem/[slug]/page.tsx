"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingCart, X, Plus, Minus, ChefHat, CheckCircle, ArrowLeft,
  Search, MapPin, User, Phone, RotateCcw, Clock, Star, Gift,
  UtensilsCrossed, PackageCheck, Bike,
  Copy, Banknote, QrCode, Tag, CheckCircle2, CreditCard,
  WifiOff, CloudUpload, Lock,
} from "lucide-react";
import { applyBrandColors } from "@/lib/theme";

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
    consumo_titulo: "Como você prefere?",
    consumo_local: "Consumir no local",
    consumo_retirada: "Retirar no balcão",
    consumo_delivery: "Delivery",
    pagamento_titulo: "Como vai pagar?",
    pagamento_pix: "PIX",
    pagamento_dinheiro: "Dinheiro / Outro",
    pagamento_aguardando: "Aguardando pagamento...",
    pagamento_copiar: "Copiar código PIX",
    pagamento_copiado: "Copiado!",
    pagamento_expirou: "Escaneie o QR Code no app do banco",
    pagamento_aprovado: "Pagamento confirmado!",
    cupom_titulo: "Cupom de desconto",
    cupom_placeholder: "Tem um código?",
    cupom_aplicar: "Aplicar",
    cupom_aplicado: "Cupom aplicado",
    cupom_remover: "Remover",
    cupom_invalido: "Cupom inválido",
    subtotal: "Subtotal",
    desconto: "Desconto",
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
    consumo_titulo: "How would you like it?",
    consumo_local: "Dine in",
    consumo_retirada: "Take away",
    consumo_delivery: "Delivery",
    pagamento_titulo: "How would you like to pay?",
    pagamento_pix: "PIX",
    pagamento_dinheiro: "Cash / Other",
    pagamento_aguardando: "Waiting for payment...",
    pagamento_copiar: "Copy PIX code",
    pagamento_copiado: "Copied!",
    pagamento_expirou: "Scan the QR Code in your banking app",
    pagamento_aprovado: "Payment confirmed!",
    cupom_titulo: "Discount coupon",
    cupom_placeholder: "Have a code?",
    cupom_aplicar: "Apply",
    cupom_aplicado: "Coupon applied",
    cupom_remover: "Remove",
    cupom_invalido: "Invalid coupon",
    subtotal: "Subtotal",
    desconto: "Discount",
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
  totem_cor_destaque?: string | null;
  horario_abertura: string | null;
  horario_fechamento: string | null;
  caixa_obrigatorio?: boolean;
  caixa_aberto?:      boolean;
}

interface Categoria {
  id: string; nome: string; descricao: string | null;
  imagem_url: string | null; ordem: number;
}

interface OpcaoVariacao {
  id:          string;
  nome:        string;
  preco_extra: number;
  disponivel?: boolean;
}

interface GrupoVariacao {
  id:          string;
  nome:        string;
  tipo:        "single" | "multiple";
  obrigatorio?: boolean;
  min?:        number;
  max?:        number;
  opcoes:      OpcaoVariacao[];
}

interface Variacoes {
  grupos: GrupoVariacao[];
}

interface Produto {
  id: string; categoria_id: string | null; nome: string;
  descricao: string | null; preco: number; imagem_url: string | null;
  tempo_preparo: number | null; tipo: string; destaque: boolean;
  pontos_fidelidade?: number | null;
  variacoes?: Variacoes | null;
}

/** Seleção de uma opção em um grupo de variação (vai para pedido_itens.adicionais) */
interface OpcaoSelecionada {
  grupo_id:    string;
  grupo_nome:  string;
  opcao_id:    string;
  opcao_nome:  string;
  preco_extra: number;
}

interface CartItem {
  produto:    Produto;
  quantidade: number;
  obs:        string;
  variacoes?: OpcaoSelecionada[];   // opções escolhidas
  uid?:       string;                // chave única para diferenciar mesmas produto+variações
}

interface EnderecoCliente {
  cep?:         string;
  rua?:         string;
  numero?:      string;
  complemento?: string;
  bairro?:      string;
  cidade?:      string;
  uf?:          string;
  referencia?:  string;
}

interface ClienteIdentificado {
  id:             string;
  nome:           string | null;
  telefone:       string | null;
  cpf:            string | null;
  pontos:         number;
  saldo_cashback?: number;
  endereco?:      EnderecoCliente | null;
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={empresa.logo_url}
                alt={empresa.nome_fantasia}
                className="h-16 w-auto max-w-[260px] object-contain drop-shadow-lg"
              />
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 shadow-xl ring-1 ring-white/20 backdrop-blur">
                  <ChefHat className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-wide text-white/90">
                    {empresa.nome_fantasia}
                  </p>
                </div>
              </>
            )}
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
              color: "white",
              textShadow: "0 4px 40px rgba(0,0,0,0.5)",
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
              background: "var(--color-primary, #10b981)",
              boxShadow: "0 0 40px var(--color-primary-50, rgba(16,185,129,0.5)), 0 8px 32px rgba(0,0,0,0.4)",
            }}
            className="
              group flex items-center gap-3 rounded-full px-10 py-5
              text-lg font-black uppercase tracking-widest text-white
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

// Cabeçalho compartilhado entre todas as fases — mostra logo absoluta da
// empresa (ou ChefHat fallback) + título + botão voltar.
function TotemBrandHeader({
  empresa, titulo, onBack,
}: {
  empresa?: { logo_url: string | null; nome_fantasia: string } | null;
  titulo:   string;
  onBack?:  () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 p-4">
      {onBack && (
        <button onClick={onBack}
          aria-label="Voltar"
          className="text-slate-400 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      {empresa?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={empresa.logo_url}
          alt={empresa.nome_fantasia ?? ""}
          className="h-10 w-auto max-w-[140px] object-contain flex-shrink-0"
        />
      ) : empresa?.nome_fantasia ? (
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 flex-shrink-0">
          <ChefHat className="h-4 w-4 text-emerald-400" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-white truncate">{titulo}</h2>
      </div>
    </div>
  );
}

interface RegisterModalProps {
  slug:          string;
  idioma:        Idioma;
  tipo:          "telefone" | "cpf";
  valorInicial:  string; // digits only from search
  empresa?:      { logo_url: string | null; nome_fantasia: string } | null;
  onCreated:     (cliente: ClienteIdentificado) => void;
  onSkip:        () => void;
}

function RegisterModal({ slug, idioma, tipo, valorInicial, empresa, onCreated, onSkip }: RegisterModalProps) {
  const [nome,  setNome]  = useState("");
  const [email, setEmail] = useState("");
  const [tel,   setTel]   = useState(tipo === "telefone" ? valorInicial : "");
  const [cpf,   setCpf]   = useState(tipo === "cpf"      ? valorInicial : "");
  const [dataNasc, setDataNasc] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro,    setErro]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErro("Nome é obrigatório"); return; }
    setLoading(true); setErro("");
    try {
      const body: Record<string, string> = { nome: nome.trim() };
      if (tel)      body.telefone = tel.replace(/\D/g, "");
      if (cpf)      body.cpf     = cpf.replace(/\D/g, "");
      if (email)    body.email   = email.trim();
      if (dataNasc) body.data_nascimento = dataNasc;

      const res  = await fetch(`/api/pub/cliente?slug=${slug}`, {
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
      <TotemBrandHeader empresa={empresa} titulo={t(idioma, "cadastro_titulo")} onBack={onSkip} />

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

          <div>
            <label className="mb-1 block text-xs text-slate-400">Data de nascimento (opcional — pra receber felicitações)</label>
            <input
              value={dataNasc}
              onChange={e => setDataNasc(e.target.value)}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
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
  empresa?:      { logo_url: string | null; nome_fantasia: string } | null;
  onIdentified:  (cliente: ClienteIdentificado, ultimoPedido: UltimoPedido | null) => void;
  onSkip:        () => void;
}

function CustomerModal({ slug, idioma, empresa, onIdentified, onSkip }: CustomerModalProps) {
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
        empresa={empresa}
        onCreated={(c) => onIdentified(c, null)}
        onSkip={onSkip}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <TotemBrandHeader empresa={empresa} titulo={t(idioma, "identificacao_titulo")} onBack={onSkip} />
      <p className="px-4 -mt-2 mb-1 text-xs text-slate-500">{t(idioma, "identificacao_sub")}</p>

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
  empresa?:     { logo_url: string | null; nome_fantasia: string } | null;
  onRepeat:     (items: CartItem[]) => void;
  onSkip:       () => void;
}

function RepeatOrderModal({ cliente, ultimoPedido, idioma, produtos, empresa, onRepeat, onSkip }: RepeatOrderModalProps) {
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
      <TotemBrandHeader
        empresa={empresa}
        titulo={`${t(idioma, "cliente_identificado")}: ${cliente.nome || ""}`}
      />
      {cliente.pontos > 0 && (
        <p className="px-4 -mt-2 mb-1 flex items-center gap-1 text-xs text-emerald-400">
          <Gift className="h-3 w-3" /> {cliente.pontos} {t(idioma, "pontos_acumulados")}
        </p>
      )}

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

// ─── TipoConsumoModal ─────────────────────────────────────────────────────────

type TipoConsumo = "local" | "retirada" | "delivery";

interface TipoConsumoModalProps {
  idioma:    Idioma;
  temMesa:   boolean;
  empresa?:  { logo_url: string | null; nome_fantasia: string } | null;
  onSelect:  (tipo: TipoConsumo) => void;
}

function TipoConsumoModal({ idioma, temMesa, empresa, onSelect }: TipoConsumoModalProps) {
  const opcoes: { tipo: TipoConsumo; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      tipo:  "local",
      label: t(idioma, "consumo_local"),
      icon:  <UtensilsCrossed className="h-10 w-10" />,
      desc:  temMesa ? "Na sua mesa" : "No restaurante",
    },
    {
      tipo:  "retirada",
      label: t(idioma, "consumo_retirada"),
      icon:  <PackageCheck className="h-10 w-10" />,
      desc:  "Retire no balcão",
    },
    {
      tipo:  "delivery",
      label: t(idioma, "consumo_delivery"),
      icon:  <Bike className="h-10 w-10" />,
      desc:  "Entrega em casa",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <TotemBrandHeader empresa={empresa} titulo={t(idioma, "consumo_titulo")} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <div className="grid w-full max-w-sm grid-cols-1 gap-4">
        {opcoes.map((o) => (
          <button
            key={o.tipo}
            onClick={() => onSelect(o.tipo)}
            className="group flex items-center gap-5 rounded-2xl border border-white/10 bg-slate-900 px-6 py-5 text-left transition hover:border-emerald-500/40 hover:bg-slate-800"
          >
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 transition group-hover:bg-emerald-500/20">
              {o.icon}
            </div>
            <div>
              <p className="text-lg font-bold text-white">{o.label}</p>
              <p className="text-sm text-slate-400">{o.desc}</p>
            </div>
          </button>
        ))}
        </div>
      </div>
    </div>
  );
}

// ─── EnderecoModal ────────────────────────────────────────────────────────────

interface EnderecoModalProps {
  enderecoSalvo: EnderecoCliente | null;
  valorAtual:    EnderecoCliente | null;
  empresa?:      { logo_url: string | null; nome_fantasia: string } | null;
  onConfirm:     (e: EnderecoCliente) => void;
  onBack:        () => void;
}

function EnderecoModal({ enderecoSalvo, valorAtual, empresa, onConfirm, onBack }: EnderecoModalProps) {
  // Se cliente tem endereço salvo e ainda não escolheu, mostra escolha
  const [modo, setModo] = useState<"escolha" | "form">(
    enderecoSalvo && !valorAtual ? "escolha" : "form"
  );
  const [form, setForm] = useState<EnderecoCliente>(
    valorAtual ?? enderecoSalvo ?? {}
  );
  const [buscandoCep, setBuscandoCep] = useState(false);

  const set = (k: keyof EnderecoCliente, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // Auto-busca ViaCEP quando o usuário digita 8 dígitos
  async function buscarViaCep(cepRaw: string) {
    const cep = cepRaw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!r.ok) return;
      const j = await r.json() as {
        erro?: boolean; logradouro?: string; bairro?: string;
        localidade?: string; uf?: string;
      };
      if (j.erro) return;
      setForm(prev => ({
        ...prev,
        cep:    cepRaw,
        rua:    prev.rua    || j.logradouro || "",
        bairro: prev.bairro || j.bairro     || "",
        cidade: prev.cidade || j.localidade || "",
        uf:     prev.uf     || j.uf         || "",
      }));
    } catch { /* ignora erro de rede — usuário preenche manual */ }
    finally { setBuscandoCep(false); }
  }

  function podeConfirmar(): boolean {
    return !!(form.rua && form.numero && form.bairro);
  }

  // ── Tela de escolha (cliente retornante) ─────────────────────────────────
  if (modo === "escolha" && enderecoSalvo) {
    const linha1 = `${enderecoSalvo.rua ?? ""}, ${enderecoSalvo.numero ?? ""}`;
    const linha2 = [enderecoSalvo.bairro, enderecoSalvo.cidade, enderecoSalvo.uf]
      .filter(Boolean).join(" · ");
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
        <TotemBrandHeader empresa={empresa} titulo="Para qual endereço?" onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <p className="text-center text-sm text-slate-400">Você tem um endereço salvo</p>

          <button
            onClick={() => onConfirm(enderecoSalvo)}
            className="group flex w-full max-w-sm items-start gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-left transition hover:bg-emerald-500/15"
          >
          <div className="mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            ✓
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Mesmo endereço</p>
            <p className="mt-1 text-base font-bold text-white">{linha1}</p>
            {enderecoSalvo.complemento && (
              <p className="text-sm text-slate-400">{enderecoSalvo.complemento}</p>
            )}
            <p className="text-sm text-slate-400">{linha2}</p>
          </div>
        </button>

        <button
          onClick={() => { setForm({}); setModo("form"); }}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-slate-800"
        >
          + Endereço diferente
        </button>

          <button onClick={onBack} className="mt-2 text-sm text-slate-500 hover:text-white">
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  // ── Formulário de endereço ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <TotemBrandHeader empresa={empresa} titulo="Endereço de entrega" onBack={onBack} />
      <p className="px-4 -mt-2 mb-1 text-xs text-slate-500">Para onde devemos entregar?</p>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-md space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                CEP {buscandoCep && <span className="text-emerald-400">· buscando…</span>}
              </label>
              <input
                value={form.cep ?? ""}
                onChange={e => {
                  set("cep", e.target.value);
                  if (e.target.value.replace(/\D/g, "").length === 8) {
                    buscarViaCep(e.target.value);
                  }
                }}
                placeholder="00000-000"
                inputMode="numeric"
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">UF</label>
              <input
                value={form.uf ?? ""}
                onChange={e => set("uf", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="SP"
                maxLength={2}
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white uppercase focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Rua *</label>
            <input
              value={form.rua ?? ""}
              onChange={e => set("rua", e.target.value)}
              placeholder="Nome da rua"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Número *</label>
              <input
                value={form.numero ?? ""}
                onChange={e => set("numero", e.target.value)}
                placeholder="123"
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Complemento</label>
              <input
                value={form.complemento ?? ""}
                onChange={e => set("complemento", e.target.value)}
                placeholder="Apto 12, fundos…"
                className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Bairro *</label>
            <input
              value={form.bairro ?? ""}
              onChange={e => set("bairro", e.target.value)}
              placeholder="Bairro"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Cidade</label>
            <input
              value={form.cidade ?? ""}
              onChange={e => set("cidade", e.target.value)}
              placeholder="Cidade"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Ponto de referência</label>
            <input
              value={form.referencia ?? ""}
              onChange={e => set("referencia", e.target.value)}
              placeholder="Próximo ao mercado X"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 p-4 bg-slate-950/95">
        <button
          onClick={() => podeConfirmar() && onConfirm(form)}
          disabled={!podeConfirmar()}
          className="w-full rounded-xl bg-emerald-500 px-6 py-4 text-base font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Confirmar endereço
        </button>
      </div>
    </div>
  );
}

// ─── ProductDetail ────────────────────────────────────────────────────────────

interface ProductDetailProps {
  produto:     Produto;
  idioma:      Idioma;
  onClose:     () => void;
  onAddToCart: (produto: Produto, qty: number, obs: string, variacoes: OpcaoSelecionada[]) => void;
}

function ProductDetail({ produto, idioma, onClose, onAddToCart }: ProductDetailProps) {
  const [qty, setQty] = useState(1);
  const [obs, setObs] = useState("");
  // Estado das opções selecionadas: { [grupo_id]: Set<opcao_id> }
  const [selecoes, setSelecoes] = useState<Record<string, Set<string>>>({});

  const grupos = produto.variacoes?.grupos ?? [];

  function toggleOpcao(grupo: GrupoVariacao, opcaoId: string) {
    setSelecoes((prev) => {
      const atual = new Set(prev[grupo.id] ?? []);
      const max = grupo.max ?? (grupo.tipo === "single" ? 1 : 99);

      if (grupo.tipo === "single") {
        // single: substitui sempre
        return { ...prev, [grupo.id]: new Set([opcaoId]) };
      }

      // multiple: toggle
      if (atual.has(opcaoId)) {
        atual.delete(opcaoId);
      } else if (atual.size < max) {
        atual.add(opcaoId);
      }
      return { ...prev, [grupo.id]: atual };
    });
  }

  // Computa opções escolhidas e preço extra total
  const variacoesEscolhidas: OpcaoSelecionada[] = grupos.flatMap((g) => {
    const ids = Array.from(selecoes[g.id] ?? []);
    return ids
      .map((opId) => {
        const op = g.opcoes.find((o) => o.id === opId);
        if (!op) return null;
        return {
          grupo_id:    g.id,
          grupo_nome:  g.nome,
          opcao_id:    op.id,
          opcao_nome:  op.nome,
          preco_extra: Number(op.preco_extra ?? 0),
        };
      })
      .filter((x): x is OpcaoSelecionada => x !== null);
  });

  const precoExtra = variacoesEscolhidas.reduce((acc, v) => acc + v.preco_extra, 0);
  const precoUnitario = Number(produto.preco) + precoExtra;
  const precoTotal = precoUnitario * qty;

  // Validação: todos os grupos obrigatórios precisam ter min satisfeito
  const erroValidacao = (() => {
    for (const g of grupos) {
      if (!g.obrigatorio) continue;
      const qtdEscolhida = (selecoes[g.id]?.size ?? 0);
      const min = g.min ?? 1;
      if (qtdEscolhida < min) {
        return `Escolha ${min === 1 ? "uma opção" : `${min} opções`} em "${g.nome}"`;
      }
    }
    return null;
  })();

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

      <div className="flex flex-1 flex-col overflow-auto p-5 pb-32">
        <h2 className="text-2xl font-bold text-white">{produto.nome}</h2>
        {produto.descricao && (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{produto.descricao}</p>
        )}
        {produto.tempo_preparo && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" /> ~{produto.tempo_preparo} min
          </p>
        )}
        <p className="mt-4 text-2xl font-bold text-brand">{formatBRL(produto.preco)}</p>

        {/* ── Grupos de variações ───────────────────────────────────────────── */}
        {grupos.map((grupo) => {
          const escolhidos = selecoes[grupo.id] ?? new Set();
          const max = grupo.max ?? (grupo.tipo === "single" ? 1 : 99);
          return (
            <section key={grupo.id} className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white">{grupo.nome}</h3>
                  <p className="text-xs text-slate-500">
                    {grupo.tipo === "single"
                      ? "Escolha 1"
                      : `Escolha até ${max}`}
                    {grupo.obrigatorio && (
                      <span className="ml-1.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                        OBRIGATÓRIO
                      </span>
                    )}
                  </p>
                </div>
                {grupo.tipo === "multiple" && (
                  <span className="text-xs text-slate-500">
                    {escolhidos.size}/{max}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {grupo.opcoes.map((op) => {
                  const ativo = escolhidos.has(op.id);
                  const cheio = grupo.tipo === "multiple" && escolhidos.size >= max && !ativo;
                  return (
                    <button
                      key={op.id}
                      onClick={() => !cheio && toggleOpcao(grupo, op.id)}
                      disabled={cheio || op.disponivel === false}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border bg-white/5 px-4 py-3 text-left transition disabled:opacity-40"
                      style={ativo ? {
                        borderColor: "var(--color-primary-50, rgba(16,185,129,0.5))",
                        background:  "var(--color-primary-15, rgba(16,185,129,0.12))",
                      } : {
                        borderColor: "rgba(255,255,255,0.10)",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* radio/check indicator */}
                        <div
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${
                            grupo.tipo === "single" ? "rounded-full" : "rounded"
                          } border-2`}
                          style={ativo ? {
                            borderColor: "var(--color-primary, #10b981)",
                            background:  "var(--color-primary, #10b981)",
                          } : { borderColor: "rgba(148,163,184,0.5)" }}
                        >
                          {ativo && (grupo.tipo === "single"
                            ? <span className="h-2 w-2 rounded-full bg-white" />
                            : <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-white truncate">{op.nome}</span>
                      </div>
                      {Number(op.preco_extra) !== 0 && (
                        <span className="flex-shrink-0 text-sm font-semibold text-slate-400">
                          {Number(op.preco_extra) > 0 ? "+" : ""}{formatBRL(Number(op.preco_extra))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="mt-6">
          <label className="block text-sm text-slate-400 mb-2">{t(idioma, "obs_item")}</label>
          <textarea
            value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Ex: sem cebola, bem passado..."
            rows={3}
            className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand/50 resize-none"
          />
        </div>
      </div>

      {/* Footer fixo */}
      <div className="sticky bottom-0 border-t border-white/10 bg-slate-950 p-4">
        {erroValidacao && (
          <p className="mb-2 text-center text-xs text-red-400">{erroValidacao}</p>
        )}
        <div className="flex items-center gap-4">
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
            onClick={() => {
              if (erroValidacao) return;
              onAddToCart(produto, qty, obs, variacoesEscolhidas);
              onClose();
            }}
            disabled={!!erroValidacao}
            style={!erroValidacao ? { background: "var(--color-primary, #10b981)" } : undefined}
            className="flex-1 rounded-xl py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-40 disabled:bg-slate-700 disabled:hover:brightness-100"
          >
            {t(idioma, "adicionar")} · {formatBRL(precoTotal)}
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
    // NOTA: NÃO usar backdrop-blur aqui. Em GPUs Android certas (Mali/Adreno
    // antigos), backdrop-filter sobre <video> autoplay causa corrupção visual
    // nas crianças (cards aparecem com pixels glitchados). Solução: overlay
    // 100% opaco sem filter.
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-slate-950">
      <div className="w-full max-w-lg rounded-t-3xl bg-slate-900 p-6 pb-8 shadow-2xl border-t border-white/10">
        <div className="mb-1 text-center">
          <h2 className="text-xl font-bold text-white">{t(idioma, "bebidas_titulo")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t(idioma, "bebidas_sub")}</p>
        </div>

        {/* Grid 3-col com no máx 6 sugestões. Evitamos overflow-x-auto/snap
            que disparava artefato de composição em GPUs Android antigas. */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {bebidas.slice(0, 6).map(b => (
            <button
              key={b.id}
              onClick={() => { onAdd(b); onSkip(); }}
              className="rounded-2xl bg-slate-800 border border-white/5 overflow-hidden text-left hover:border-white/20 transition"
            >
              <div className="h-24 relative bg-slate-900">
                <ProductImage src={b.imagem_url} alt={b.nome} />
                {b.pontos_fidelidade != null && b.pontos_fidelidade > 0 && (
                  <span
                    className="absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
                    style={{ background: "var(--color-primary, #10b981)" }}
                  >
                    +{b.pontos_fidelidade} pts
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-semibold text-white line-clamp-2 min-h-[2.4em]">{b.nome}</p>
                <p className="mt-1 text-sm font-bold" style={{ color: "var(--color-primary, #10b981)" }}>
                  {formatBRL(b.preco)}
                </p>
                <div
                  className="mt-1.5 flex items-center justify-center rounded-lg py-1"
                  style={{ background: "var(--color-primary-15, rgba(16,185,129,0.15))" }}
                >
                  <Plus className="h-3.5 w-3.5" style={{ color: "var(--color-primary, #10b981)" }} />
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

interface GatewayInfo {
  slug:    string;
  nome:    string;
  padrao:  boolean;
  metodos: string[];
}

type FormaPagTotem = "pix" | "dinheiro" | "cartao_caixa" | "pagar_entrega";

interface CartDrawerProps {
  cart:        CartItem[];
  mesaNumero:  number | null;
  cliente:     ClienteIdentificado | null;
  slug:        string;
  idioma:      Idioma;
  isOnline:    boolean;
  tipoConsumo: TipoConsumo;
  taxaInfo?:   { taxa: number; zona_nome: string | null; tempo_min: number | null; fallback: boolean } | null;
  aceitaDinheiro?: boolean;
  onClose:     () => void;
  onUpdate:    (uid: string, delta: number) => void;
  onConfirm:   (clienteNome: string, clienteTel: string, obs: string, formaPagamento: FormaPagTotem, cupom: { codigo: string; desconto: number } | null, gatewaySlug: string | null, cashbackUsar: number) => Promise<void>;
}

function CartDrawer({ cart, mesaNumero, cliente, slug, idioma, isOnline, tipoConsumo, taxaInfo, aceitaDinheiro, onClose, onUpdate, onConfirm }: CartDrawerProps) {
  const [nome, setNome]           = useState(cliente?.nome ?? "");
  const [tel, setTel]             = useState(cliente?.telefone ?? "");
  const [obs, setObs]             = useState("");
  const [formaPag, setFormaPag]   = useState<FormaPagTotem>(
    tipoConsumo === "delivery" ? "pagar_entrega" : (aceitaDinheiro ? "dinheiro" : "pix")
  );
  const [sending, setSending]     = useState(false);

  // Cashback (usar saldo)
  const saldoCashback = Number(cliente?.saldo_cashback ?? 0);
  const [cashbackUsar, setCashbackUsar] = useState(0);

  // Se ficou offline com PIX selecionado, força dinheiro
  useEffect(() => {
    if (!isOnline && formaPag === "pix") setFormaPag("dinheiro");
  }, [isOnline, formaPag]);

  // Gateways disponíveis (carregados na primeira vez que PIX é selecionado)
  const [gateways, setGateways]               = useState<GatewayInfo[]>([]);
  const [gatewaySelecionado, setGatewaySelecionado] = useState<string | null>(null);
  const [gatewaysCarregados, setGatewaysCarregados] = useState(false);

  // Cupom
  const [cupomCodigo, setCupomCodigo]   = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; desconto: number; tipo: string } | null>(null);
  const [cupomErro, setCupomErro]       = useState("");
  const [cupomLoading, setCupomLoading] = useState(false);

  // Carrega gateways uma vez quando PIX é selecionado pela primeira vez
  useEffect(() => {
    if (formaPag !== "pix" || gatewaysCarregados) return;
    setGatewaysCarregados(true);
    fetch(`/api/pub/pagamentos/${slug}/gateways`)
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const pixGateways = (data.data.gateways as GatewayInfo[])
          .filter(g => g.metodos.includes("pix"));
        setGateways(pixGateways);
        // Default = padrão; se nenhum padrão, primeiro
        const padrao = pixGateways.find(g => g.padrao) ?? pixGateways[0];
        if (padrao) setGatewaySelecionado(padrao.slug);
      })
      .catch(() => { /* silencioso — usa gateway padrão no servidor */ });
  }, [formaPag, gatewaysCarregados, slug]);

  // Preço unitário considerando variações
  const precoComVariacoes = (i: CartItem) => {
    const extras = (i.variacoes ?? []).reduce((acc, v) => acc + Number(v.preco_extra ?? 0), 0);
    return Number(i.produto.preco) + extras;
  };
  const subtotal = cart.reduce((acc, i) => acc + precoComVariacoes(i) * i.quantidade, 0);
  const desconto = cupomAplicado?.desconto ?? 0;
  // Cashback efetivamente aplicado (limitado ao saldo + ao valor após desconto de cupom)
  const totalAposCupom = Math.max(0, subtotal - desconto);
  const cashbackEfetivo = Math.min(cashbackUsar, saldoCashback, totalAposCupom);
  const taxa     = taxaInfo?.taxa ?? 0;
  const total    = Math.max(0, totalAposCupom - cashbackEfetivo + taxa);

  async function aplicarCupom() {
    if (!cupomCodigo.trim()) return;
    setCupomLoading(true); setCupomErro("");
    try {
      const sp = new URLSearchParams({
        codigo: cupomCodigo.trim().toUpperCase(),
        total:  String(subtotal),
      });
      if (cliente?.id) sp.set("cliente_id", cliente.id);
      const res  = await fetch(`/api/pub/cupons/${slug}?${sp}`);
      const data = await res.json();
      if (!data.success) {
        setCupomErro(data.error || t(idioma, "cupom_invalido"));
        return;
      }
      if (!data.data.valido) {
        setCupomErro(data.data.motivo || t(idioma, "cupom_invalido"));
        return;
      }
      setCupomAplicado({
        codigo:   data.data.codigo,
        desconto: data.data.desconto,
        tipo:     data.data.tipo,
      });
      setCupomCodigo("");
    } catch {
      setCupomErro("Erro de conexão");
    } finally {
      setCupomLoading(false);
    }
  }

  function removerCupom() {
    setCupomAplicado(null);
    setCupomErro("");
  }

  async function handleOrder() {
    setSending(true);
    try {
      await onConfirm(
        nome, tel, obs, formaPag,
        cupomAplicado ? { codigo: cupomAplicado.codigo, desconto: cupomAplicado.desconto } : null,
        formaPag === "pix" ? gatewaySelecionado : null,
        cashbackEfetivo,
      );
    } finally { setSending(false); }
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
        {cart.map((item) => {
          const itemKey = item.uid ?? item.produto.id;
          const precoUnit = precoComVariacoes(item);
          return (
            <div key={itemKey} className="flex items-start gap-3 rounded-xl bg-slate-900 p-3">
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
                <ProductImage src={item.produto.imagem_url} alt={item.produto.nome} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">{item.produto.nome}</p>
                {item.variacoes && item.variacoes.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {item.variacoes.map(v => v.opcao_nome).join(" · ")}
                  </p>
                )}
                {item.obs && <p className="text-xs text-slate-500 truncate">{item.obs}</p>}
                <p className="mt-1 text-sm font-bold text-brand">{formatBRL(precoUnit * item.quantidade)}</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => onUpdate(itemKey, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-white">{item.quantidade}</span>
                <button onClick={() => onUpdate(itemKey, +1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/5 p-4 space-y-3">

        {/* Cashback (saldo do cliente) */}
        {saldoCashback > 0 && (
          <div
            className="rounded-xl border px-3 py-2.5"
            style={{
              borderColor: cashbackEfetivo > 0
                ? "var(--color-primary-50, rgba(16,185,129,0.4))"
                : "rgba(255,255,255,0.10)",
              background: cashbackEfetivo > 0
                ? "var(--color-primary-15, rgba(16,185,129,0.12))"
                : "rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                💵 Saldo Cashback
              </p>
              <span className="text-xs font-bold text-white">
                {formatBRL(saldoCashback)} disponível
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.min(saldoCashback, totalAposCupom)}
                step={0.5}
                value={cashbackUsar}
                onChange={(e) => setCashbackUsar(Number(e.target.value))}
                className="flex-1 accent-brand"
              />
              <span className="w-20 text-right text-sm font-bold" style={{ color: "var(--color-primary, #10b981)" }}>
                −{formatBRL(cashbackEfetivo)}
              </span>
            </div>
            {cashbackUsar > 0 && (
              <button
                onClick={() => setCashbackUsar(0)}
                className="mt-1 text-[10px] text-slate-500 hover:text-white transition"
              >
                Não usar cashback
              </button>
            )}
          </div>
        )}

        {/* Cupom */}
        {cupomAplicado ? (
          <div
            className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
            style={{
              borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))",
              background:  "var(--color-primary-15, rgba(16,185,129,0.12))",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "var(--color-primary, #10b981)" }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: "var(--color-primary, #10b981)" }}>
                  {t(idioma, "cupom_aplicado")}
                </p>
                <p className="truncate text-xs text-slate-300 font-mono">{cupomAplicado.codigo}</p>
              </div>
            </div>
            <button onClick={removerCupom} className="text-xs text-slate-400 hover:text-white transition">
              {t(idioma, "cupom_remover")}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={cupomCodigo}
                  onChange={(e) => { setCupomCodigo(e.target.value.toUpperCase()); setCupomErro(""); }}
                  placeholder={t(idioma, "cupom_placeholder")}
                  maxLength={30}
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 pl-8 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-white/20 uppercase font-mono"
                />
              </div>
              <button
                onClick={aplicarCupom}
                disabled={cupomLoading || !cupomCodigo.trim()}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition disabled:opacity-40"
              >
                {cupomLoading ? "..." : t(idioma, "cupom_aplicar")}
              </button>
            </div>
            {cupomErro && (
              <p className="text-xs text-red-400 px-1">{cupomErro}</p>
            )}
          </div>
        )}

        {/* Totais */}
        <div className="space-y-1 pt-1">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">{t(idioma, "subtotal")}</span>
            <span className="text-slate-300">{formatBRL(subtotal)}</span>
          </div>
          {desconto > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">{t(idioma, "desconto")}</span>
              <span style={{ color: "var(--color-primary, #10b981)" }}>−{formatBRL(desconto)}</span>
            </div>
          )}
          {cashbackEfetivo > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Cashback</span>
              <span className="text-amber-300">−{formatBRL(cashbackEfetivo)}</span>
            </div>
          )}
          {taxa > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">
                Taxa de entrega
                {taxaInfo?.zona_nome && <span className="text-[10px] text-slate-500"> · {taxaInfo.zona_nome}</span>}
                {taxaInfo?.fallback && <span className="text-[10px] text-amber-500"> · padrão</span>}
              </span>
              <span className="text-slate-300">{formatBRL(taxa)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-white/5">
            <span className="text-sm font-semibold text-slate-400">Total</span>
            <span className="text-xl font-bold text-white">{formatBRL(total)}</span>
          </div>
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

        {/* Forma de pagamento */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">{t(idioma, "pagamento_titulo")}</p>
          <div className={`grid gap-2 ${tipoConsumo === "delivery" ? "grid-cols-3" : "grid-cols-3"}`}>
            {((tipoConsumo === "delivery"
              ? (["dinheiro", "pix", "pagar_entrega"] as const)
              // Local/retirada: dinheiro (opcional), pix, cartão no caixa
              : (["dinheiro", "pix", "cartao_caixa"] as const)) as readonly FormaPagTotem[])
              .filter(m => m !== "dinheiro" || aceitaDinheiro === true)
              .map((metodo) => {
              const ativo      = formaPag === metodo;
              const desabilitado = metodo === "pix" && !isOnline;
              const labelEntrega = "Pagar na entrega";
              return (
                <button
                  key={metodo}
                  type="button"
                  onClick={() => !desabilitado && setFormaPag(metodo)}
                  disabled={desabilitado}
                  title={desabilitado ? "PIX requer conexão com a internet" : undefined}
                  className="flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={ativo ? {
                    borderColor: "var(--color-primary-50, rgba(16,185,129,0.5))",
                    background:  "var(--color-primary-15, rgba(16,185,129,0.15))",
                    color:       "var(--color-primary, #10b981)",
                  } : {
                    borderColor: "rgba(255,255,255,0.1)",
                    background:  "rgb(30,41,59)",
                    color:       "rgb(148,163,184)",
                  }}
                >
                  {metodo === "pix"            ? <QrCode className="h-5 w-5" />
                   : metodo === "dinheiro"    ? <Banknote className="h-5 w-5" />
                   : metodo === "cartao_caixa" ? <CreditCard className="h-5 w-5" />
                   :                            <Bike className="h-5 w-5" />}
                  <span className="text-center leading-tight">
                    {metodo === "pix"           ? t(idioma, "pagamento_pix")
                     : metodo === "dinheiro"   ? t(idioma, "pagamento_dinheiro")
                     : metodo === "cartao_caixa" ? "Cartão no caixa"
                     :                           labelEntrega}
                  </span>
                  {desabilitado && (
                    <span className="text-[9px] font-normal text-slate-500 leading-tight">
                      requer internet
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {formaPag === "pagar_entrega" && (
            <p className="mt-2 text-[10px] text-amber-400 leading-snug">
              💵 Você escolherá a forma de pagamento com o entregador (PIX, dinheiro, cartão).
            </p>
          )}

          {/* Seletor de gateway PIX (só aparece se há 2+ gateways disponíveis E online) */}
          {isOnline && formaPag === "pix" && gateways.length > 1 && (
            <div className="mt-2.5 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Pagar com</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {gateways.map((g) => {
                  const ativo = gatewaySelecionado === g.slug;
                  return (
                    <button
                      key={g.slug}
                      type="button"
                      onClick={() => setGatewaySelecionado(g.slug)}
                      className="flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
                      style={ativo ? {
                        borderColor: "var(--color-primary-50, rgba(16,185,129,0.5))",
                        background:  "var(--color-primary-15, rgba(16,185,129,0.15))",
                        color:       "var(--color-primary, #10b981)",
                      } : {
                        borderColor: "rgba(255,255,255,0.1)",
                        background:  "transparent",
                        color:       "rgb(148,163,184)",
                      }}
                    >
                      {g.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleOrder} disabled={sending || cart.length === 0}
          style={!sending && cart.length > 0 ? { background: "var(--color-primary, #10b981)" } : undefined}
          className="w-full rounded-xl py-3 font-semibold text-white transition disabled:opacity-50 disabled:bg-slate-700"
        >
          {sending
            ? t(idioma, "enviando")
            : formaPag === "pix"
              ? `${t(idioma, "confirmar")} — PIX`
              : t(idioma, "confirmar")}
        </button>
      </div>
    </div>
  );
}

// ─── PixPaymentScreen ─────────────────────────────────────────────────────────

interface PixPaymentScreenProps {
  slug:         string;
  pedidoNumero: number;
  clienteNome:  string;
  pontosGanhos?: number;
  totalPontos?:  number;
  gatewayId:    string;
  gateway:      string;
  pixCopiaCola?: string;
  pixQrcodeUrl?: string;
  total:        number;
  idioma:       Idioma;
  onPago:       (numero: number, clienteNome: string, pontosGanhos?: number, totalPontos?: number) => void;
  onPular:      () => void;
}

function PixPaymentScreen({
  slug, pedidoNumero, clienteNome, pontosGanhos, totalPontos,
  gatewayId, gateway, pixCopiaCola, pixQrcodeUrl, total, idioma, onPago, onPular,
}: PixPaymentScreenProps) {
  const [copiado, setCopiado]     = useState(false);
  const [aprovado, setAprovado]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll a cada 3s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(
          `/api/pub/pagamentos/${slug}?gateway_id=${gatewayId}&gateway=${gateway}`
        );
        const data = await res.json();
        if (data.success && data.data?.status === "aprovado") {
          clearInterval(pollRef.current!);
          setAprovado(true);
          setTimeout(() => onPago(pedidoNumero, clienteNome, pontosGanhos, totalPontos), 2000);
        }
      } catch { /* non-fatal */ }
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copiar() {
    if (!pixCopiaCola) return;
    navigator.clipboard.writeText(pixCopiaCola).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <button onClick={onPular} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold">Pedido #{pedidoNumero}</h2>
          <p className="text-xs text-slate-400">
            {formatBRL(total)} — PIX
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
        {aprovado ? (
          <>
            <CheckCircle className="h-20 w-20 text-emerald-400" />
            <p className="text-xl font-bold text-emerald-400">{t(idioma, "pagamento_aprovado")}</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              <span className="text-sm font-semibold text-amber-300">{t(idioma, "pagamento_aguardando")}</span>
            </div>

            {/* QR Code */}
            {pixQrcodeUrl ? (
              <div className="rounded-2xl border border-white/10 bg-white p-3">
                <img src={pixQrcodeUrl} alt="QR PIX" className="h-52 w-52 object-contain" />
              </div>
            ) : (
              <div className="flex h-52 w-52 items-center justify-center rounded-2xl border border-white/10 bg-slate-900">
                <QrCode className="h-16 w-16 text-slate-600" />
              </div>
            )}

            <p className="text-center text-xs text-slate-400 max-w-xs">
              {t(idioma, "pagamento_expirou")}
            </p>

            {/* Copia e cola */}
            {pixCopiaCola && (
              <div className="w-full max-w-xs space-y-2">
                <div className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5">
                  <p className="truncate text-center font-mono text-xs text-slate-300 select-all">
                    {pixCopiaCola.slice(0, 40)}…
                  </p>
                </div>
                <button
                  onClick={copiar}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
                    copiado
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <Copy className="h-4 w-4" />
                  {copiado ? t(idioma, "pagamento_copiado") : t(idioma, "pagamento_copiar")}
                </button>
              </div>
            )}

            <button
              onClick={onPular}
              className="mt-2 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition"
            >
              Já paguei / Continuar sem PIX
            </button>
          </>
        )}
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
  // Quando forma_pagamento = cartao_caixa, mostramos tela grande
  // "Pague no caixa" em vez do success simples.
  pagueNoCaixa?: boolean;
  total?:       number;
}

function SuccessScreen({
  numero, mesaNumero, clienteNome, pontosGanhos, totalPontos, idioma, onReset,
  pagueNoCaixa, total,
}: SuccessScreenProps) {
  // Tela "Pague no caixa": countdown maior (30s) pra dar tempo do cliente ir e
  // o caixa identificar o pedido.
  const TOTAL = pagueNoCaixa ? 30 : 15;
  const [remaining, setRemaining] = useState(TOTAL);

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

  // ── Variante "Pague no caixa" ─────────────────────────────────────────────
  // Tela grande, número de pedido GIGANTE, valor destacado, instrução clara.
  // O atendente do caixa identifica o pedido pelo número e processa o cartão
  // na maquininha manualmente.
  if (pagueNoCaixa) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full mb-4"
          style={{ background: "var(--color-primary-15, rgba(16,185,129,0.15))" }}
        >
          <CreditCard className="h-10 w-10" style={{ color: "var(--color-primary, #10b981)" }} />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-2">
          Vá ao caixa para pagar
        </p>

        <p
          className="text-[12rem] leading-none font-black mb-4"
          style={{ color: "var(--color-primary, #10b981)" }}
        >
          #{numero}
        </p>

        {typeof total === "number" && (
          <div className="rounded-2xl border-2 border-dashed px-8 py-4 mb-4"
               style={{ borderColor: "var(--color-primary-50, rgba(16,185,129,0.4))" }}>
            <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total a pagar</p>
            <p className="text-5xl font-black text-white">
              {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
        )}

        <p className="max-w-md text-sm text-slate-400 leading-relaxed mb-6">
          Diga o número <strong className="text-white">#{numero}</strong> ao atendente do caixa.
          Ele(a) vai cobrar você na maquininha de cartão.
        </p>

        {clienteNome && (
          <p className="text-xs text-slate-500 mb-4">{clienteNome}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          Volta à tela inicial em {remaining}s
        </div>

        <button
          onClick={onReset}
          className="mt-6 rounded-2xl border border-white/10 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
        >
          Já entendi, voltar
        </button>
      </div>
    );
  }

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
          {numero === 0 ? "PEDIDO ENFILEIRADO" : t(idioma, "sucesso")}
        </p>
        {numero > 0 ? (
          <h2 className="text-4xl font-black text-white">#{numero}</h2>
        ) : (
          <div className="space-y-1">
            <p className="text-base font-semibold text-amber-300">Sem conexão no momento</p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Seu pedido será enviado automaticamente assim que a internet voltar.
            </p>
          </div>
        )}

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

// Idle: 30s sem interagir → modal "ainda está aí?", 10s sem responder → reset
const IDLE_MS    = 30 * 1000;
const WARNING_MS = 10 * 1000;

type Fase = "start" | "identificacao" | "tipoConsumo" | "endereco" | "repeat" | "cardapio";

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
  const [tipoConsumo, setTipoConsumo]   = useState<TipoConsumo>("local");
  const [endereco, setEndereco]         = useState<EnderecoCliente | null>(null);
  const [taxaEntrega, setTaxaEntrega]   = useState<{
    taxa: number; zona_nome: string | null; tempo_min: number | null; fallback: boolean;
  } | null>(null);
  const [pedidoFeito, setPedidoFeito]   = useState<{
    numero: number; clienteNome: string; pontosGanhos?: number; totalPontos?: number;
    formaPagamento?: FormaPagTotem; total?: number;
  } | null>(null);

  // PIX payment state
  const [pixInfo, setPixInfo] = useState<{
    pedidoNumero: number;
    clienteNome:  string;
    pontosGanhos?: number;
    totalPontos?:  number;
    gatewayId:    string;
    gateway:      string;
    pixCopiaCola?: string;
    pixQrcodeUrl?: string;
    total:        number;
  } | null>(null);

  // Offline-first state
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  // Detecta online/offline + escuta mensagens do SW (fila)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const onOnline  = () => {
      setIsOnline(true);
      // Pede ao SW para drenar a fila
      navigator.serviceWorker?.controller?.postMessage("DRAIN_QUEUE");
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    // Mensagens do SW
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.type === "QUEUE_STATUS")  setQueueCount(data.count ?? 0);
      if (data?.type === "QUEUE_DRAINED") {
        setQueueCount(data.remaining ?? 0);
        if (data.ok > 0) {
          // Pequeno feedback — no totem o usuário já está em outra tela
          console.info(`[OFFLINE] ${data.ok} pedido(s) sincronizado(s)`);
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    // Pede status inicial
    navigator.serviceWorker?.controller?.postMessage("QUEUE_STATUS");

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  // Menu nav
  const [catSelecionada, setCatSelecionada] = useState<string>("todos");
  const [q, setQ]                           = useState("");
  const [produtoAberto, setProdutoAberto]   = useState<Produto | null>(null);
  const [cartOpen, setCartOpen]             = useState(false);
  const [cart, setCart]                     = useState<CartItem[]>([]);

  // Drinks modal
  const [showDrinksModal, setShowDrinksModal] = useState(false);
  const drinksShownRef = useRef(false);

  // Idle timer + modal de aviso
  const idleRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown,   setIdleCountdown]   = useState(WARNING_MS / 1000);

  function clearIdleTimers() {
    if (idleRef.current)      clearTimeout(idleRef.current);
    if (warningRef.current)   clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }

  function startWarningCountdown() {
    setIdleCountdown(WARNING_MS / 1000);
    setShowIdleWarning(true);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setIdleCountdown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    warningRef.current = setTimeout(() => {
      setShowIdleWarning(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      handleFullReset();
    }, WARNING_MS);
  }

  function resetIdleTimer() {
    clearIdleTimers();
    // Se o aviso está aberto, qualquer interação cancela e mantém sessão
    if (showIdleWarning) setShowIdleWarning(false);
    // Só roda timer na fase de cardápio (não no início/identificação)
    if (fase === "cardapio" && !produtoAberto) {
      idleRef.current = setTimeout(() => {
        startWarningCountdown();
      }, IDLE_MS);
    }
  }

  function continuarSessao() {
    setShowIdleWarning(false);
    clearIdleTimers();
    resetIdleTimer();
  }

  useEffect(() => {
    if (fase !== "cardapio") {
      clearIdleTimers();
      setShowIdleWarning(false);
      return;
    }
    resetIdleTimer();
    const events = ["touchstart", "click", "keydown"];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
    return () => {
      clearIdleTimers();
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, cartOpen, produtoAberto]);

  // Load cardápio data + apply brand colors
  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/pub/cardapio/${params.slug}`);
        const data = await res.json();
        if (!data.success) { setNotFound(true); return; }
        const emp = data.data.empresa as EmpresaInfo;
        setEmpresa(emp);
        setCategorias(data.data.categorias);
        setProdutos(data.data.produtos);
        // Apply brand colors (incl. --color-primary-rgb p/ Tailwind brand)
        // Prefere totem_cor_destaque (config específica do totem) se houver
        applyBrandColors({ primary: emp.totem_cor_destaque || emp.cor_primaria });
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
    // Always ask tipo_consumo first (unless coming from QR mesa)
    if (mesaId) {
      setTipoConsumo("local");
      if (up && up.itens && up.itens.length > 0) setFase("repeat");
      else setFase("cardapio");
    } else {
      setFase("tipoConsumo");
    }
  }

  function handleSkipIdentificacao() {
    setCliente(null);
    setUltimoPedido(null);
    if (mesaId) {
      setTipoConsumo("local");
      setFase("cardapio");
    } else {
      setFase("tipoConsumo");
    }
  }

  function handleTipoConsumoSelected(tipo: TipoConsumo) {
    setTipoConsumo(tipo);
    // Delivery: precisa de endereço antes de seguir
    if (tipo === "delivery") {
      // Pré-popula com último endereço do cliente, se houver
      if (cliente?.endereco) setEndereco(cliente.endereco);
      setFase("endereco");
      return;
    }
    if (ultimoPedido && ultimoPedido.itens && ultimoPedido.itens.length > 0) {
      setFase("repeat");
    } else {
      setFase("cardapio");
    }
  }

  async function handleEnderecoConfirmado(e: EnderecoCliente) {
    setEndereco(e);
    // Consulta taxa antes de prosseguir (mostra no carrinho)
    try {
      const sp = new URLSearchParams();
      if (e.cep)    sp.set("cep",    e.cep.replace(/\D/g, ""));
      if (e.bairro) sp.set("bairro", e.bairro);
      const r = await fetch(`/api/pub/cardapio/${params.slug}/taxa-entrega?${sp}`);
      const d = await r.json();
      if (d.success) setTaxaEntrega(d.data);
    } catch { /* ignora — backend recalcula no checkout */ }

    if (ultimoPedido && ultimoPedido.itens && ultimoPedido.itens.length > 0) {
      setFase("repeat");
    } else {
      setFase("cardapio");
    }
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
    setTipoConsumo("local");
    setEndereco(null);
    setTaxaEntrega(null);
    setCart([]);
    setCartOpen(false);
    setProdutoAberto(null);
    setPedidoFeito(null);
    setPixInfo(null);
    setQ("");
    setCatSelecionada("todos");
    setShowDrinksModal(false);
    drinksShownRef.current = false;
    setIdioma("pt");
  }

  // ── Cart ───────────────────────────────────────────────────────────────────

  /** Computa preço unitário de um item considerando variações */
  function precoUnitarioItem(item: CartItem): number {
    const extras = (item.variacoes ?? []).reduce((acc, v) => acc + Number(v.preco_extra ?? 0), 0);
    return Number(item.produto.preco) + extras;
  }

  /** Gera UID único para combinar produto + variações
   *  Mesma combinação → mesmo UID (permite agregação) */
  function gerarUid(produto: Produto, variacoes: OpcaoSelecionada[], obs: string): string {
    const opIds = (variacoes ?? [])
      .map(v => `${v.grupo_id}:${v.opcao_id}`)
      .sort()
      .join("|");
    // Inclui hash da observação para diferenciar mesmo produto com obs distintas
    const obsHash = obs ? `_obs${obs.length}` : "";
    return `${produto.id}__${opIds}${obsHash}`;
  }

  const addToCart = useCallback((
    produto: Produto,
    qty: number,
    obs: string,
    variacoes: OpcaoSelecionada[] = []
  ) => {
    const uid = gerarUid(produto, variacoes, obs);
    setCart(prev => {
      const existing = prev.find(i => i.uid === uid);
      if (existing) {
        return prev.map(i => i.uid === uid ? { ...i, quantidade: i.quantidade + qty } : i);
      }
      return [...prev, { produto, quantidade: qty, obs, variacoes, uid }];
    });
  }, []);

  /** updateCart agora usa uid (não produto.id) para diferenciar variações */
  const updateCart = useCallback((uid: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.uid === uid ? { ...i, quantidade: i.quantidade + delta } : i)
          .filter(i => i.quantidade > 0)
    );
  }, []);

  const cartTotal = cart.reduce((acc, i) => acc + precoUnitarioItem(i) * i.quantidade, 0);
  const cartCount = cart.reduce((acc, i) => acc + i.quantidade, 0);

  // Bebidas available — considera tipo='bebida' OU produtos cuja categoria
  // tenha nome contendo palavras-chave (cerveja/refrigerante/suco/água/drink).
  // Resiliente a cardápios em que tudo foi cadastrado como tipo='produto'.
  const BEBIDA_KEYWORDS = /\b(bebida|cerveja|refriger|suco|água|agua|drink|bebid|chopp|vinho)\b/i;
  const bebidaCatIds = useMemo(() => {
    return new Set(
      categorias
        .filter(c => BEBIDA_KEYWORDS.test(c.nome ?? ""))
        .map(c => c.id)
    );
  }, [categorias]);
  const isBebida = (p: Produto) => p.tipo === "bebida" || (p.categoria_id != null && bebidaCatIds.has(p.categoria_id));
  const bebidas  = useMemo(() => produtos.filter(isBebida), [produtos, bebidaCatIds]);

  // ── Open cart (with drinks interstitial) ──────────────────────────────────

  function handleOpenCart() {
    // Show drinks modal if: not shown yet, no drink in cart, there are bebidas
    const hasDrinkInCart = cart.some(i => isBebida(i.produto));
    if (!drinksShownRef.current && !hasDrinkInCart && bebidas.length > 0) {
      drinksShownRef.current = true;
      setShowDrinksModal(true);
    } else {
      setCartOpen(true);
    }
  }

  // ── Confirm order ──────────────────────────────────────────────────────────

  async function handleConfirmarPedido(
    clienteNome: string,
    clienteTel: string,
    obs: string,
    formaPagamento: FormaPagTotem = "dinheiro",
    cupom: { codigo: string; desconto: number } | null = null,
    gatewaySlug: string | null = null,
    cashbackUsar: number = 0,
  ) {
    // Calcula subtotal considerando variações (preço extra de cada opção)
    const subtotal  = cart.reduce((acc, i) => acc + precoUnitarioItem(i) * i.quantidade, 0);
    const desconto  = cupom?.desconto ?? 0;
    const cartTotal = Math.max(0, subtotal - desconto - cashbackUsar);

    const res = await fetch(`/api/pub/pedidos/${params.slug}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        cliente_nome:     clienteNome || cliente?.nome || undefined,
        cliente_telefone: clienteTel  || cliente?.telefone || undefined,
        cliente_id:       cliente?.id || undefined,
        cliente_endereco: tipoConsumo === "delivery" ? (endereco ?? undefined) : undefined,
        observacoes:      obs         || undefined,
        mesa_id:          mesaId      || undefined,
        tipo_consumo:     tipoConsumo,
        forma_pagamento:  formaPagamento,
        cupom_codigo:     cupom?.codigo  || undefined,
        desconto:         desconto       || undefined,
        cashback_usar:    cashbackUsar > 0 ? cashbackUsar : undefined,
        itens: cart.map(i => ({
          produto_id:     i.produto.id,
          nome:           i.produto.nome,
          // preço unitário JÁ inclui as variações (preço extra somado)
          preco_unitario: precoUnitarioItem(i),
          quantidade:     i.quantidade,
          observacoes:    i.obs || undefined,
          // variações vão no adicionais do pedido_item
          adicionais:     i.variacoes && i.variacoes.length > 0 ? i.variacoes : undefined,
        })),
      }),
    });

    const data = await res.json();
    if (!data.success) { alert(data.error || "Erro ao enviar pedido"); return; }

    const pontosGanhos = data.data.pontos_ganhos as number | undefined;
    const totalPontos  = (cliente?.pontos ?? 0) + (pontosGanhos ?? 0);
    const nomeExibido  = clienteNome || cliente?.nome || "";

    setCart([]);
    setCartOpen(false);

    // Pedido enfileirado offline (SW interceptou)
    if (data.queued || data.data?.queued) {
      setQueueCount((c) => c + 1);
      setPedidoFeito({
        numero:      data.data.numero ?? 0,    // 0 = será atribuído ao sincronizar
        clienteNome: nomeExibido,
        pontosGanhos: undefined,
        totalPontos: undefined,
      });
      return;
    }

    // Se PIX, cria cobrança e mostra tela de QR
    if (formaPagamento === "pix") {
      try {
        const pixRes = await fetch(`/api/pub/pagamentos/${params.slug}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            pedido_id:     data.data.id,
            metodo:        "pix",
            gateway:       gatewaySlug || undefined,  // null/undefined → backend usa o padrão
            cliente_nome:  nomeExibido || undefined,
            cliente_email: cliente?.cpf ? undefined : undefined,
          }),
        });
        const pixData = await pixRes.json();
        if (pixData.success && pixData.data) {
          setPixInfo({
            pedidoNumero: data.data.numero,
            clienteNome:  nomeExibido,
            pontosGanhos,
            totalPontos:  totalPontos > 0 ? totalPontos : undefined,
            gatewayId:    pixData.data.gateway_id,
            gateway:      pixData.data.gateway,
            pixCopiaCola: pixData.data.pix_copia_cola,
            pixQrcodeUrl: pixData.data.pix_qrcode_url,
            total:        cartTotal,
          });
          return; // não mostra tela de sucesso ainda
        }
      } catch (e) {
        console.warn("[PIX] Falha ao criar cobrança:", e);
      }
      // Se PIX falhar, cai no fluxo normal de sucesso
    }

    setPedidoFeito({
      numero:      data.data.numero,
      clienteNome: nomeExibido,
      pontosGanhos,
      totalPontos: totalPontos > 0 ? totalPontos : undefined,
      formaPagamento,
      total:       cartTotal,
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
    <div
      data-totem
      data-totem-tema={(empresa as { totem_tema?: string })?.totem_tema ?? "escuro"}
      className={`totem-root relative min-h-screen overflow-hidden ${
        (empresa as { totem_tema?: string })?.totem_tema === "claro"
          ? "bg-slate-50 text-slate-900"
          : "bg-slate-950 text-white"
      }`}
    >
      {/* Override de utilities Tailwind hardcoded — usa cor de destaque
          configurada pelo restaurante (totem_cor_destaque ou cor_primaria).
          Usa color-mix() pra derivar variantes claras/escuras SEM filter:
          brightness(), que cria stacking context e degrada anti-aliasing
          de texto/bordas (causa "serrilhado" no totem). */}
      <style jsx global>{`
        [data-totem] {
          /* Variantes pré-calculadas via color-mix — sem filter() */
          --color-primary-200: color-mix(in srgb, var(--color-primary), white 50%);
          --color-primary-300: color-mix(in srgb, var(--color-primary), white 30%);
          --color-primary-400: color-mix(in srgb, var(--color-primary), white 15%);
          --color-primary-600: color-mix(in srgb, var(--color-primary), black 15%);
        }

        /* Backgrounds sólidos */
        [data-totem] .bg-emerald-500 { background-color: var(--color-primary) !important; }
        [data-totem] .bg-emerald-400 { background-color: var(--color-primary-400) !important; }
        [data-totem] .hover\\:bg-emerald-400:hover { background-color: var(--color-primary-400) !important; }
        [data-totem] .hover\\:bg-emerald-500:hover { background-color: var(--color-primary) !important; }

        /* Texto — sem filter, cor sólida real */
        [data-totem] .text-emerald-400 { color: var(--color-primary) !important; }
        [data-totem] .text-emerald-300 { color: var(--color-primary-300) !important; }
        [data-totem] .text-emerald-200 { color: var(--color-primary-200) !important; }

        /* Bordas + bg translúcidos via rgb() com alpha */
        [data-totem] .border-emerald-500\\/30 { border-color: rgb(var(--color-primary-rgb) / 0.3) !important; }
        [data-totem] .border-emerald-500\\/40 { border-color: rgb(var(--color-primary-rgb) / 0.4) !important; }
        [data-totem] .border-emerald-500\\/50 { border-color: rgb(var(--color-primary-rgb) / 0.5) !important; }
        [data-totem] .bg-emerald-500\\/10  { background-color: rgb(var(--color-primary-rgb) / 0.1) !important; }
        [data-totem] .bg-emerald-500\\/15  { background-color: rgb(var(--color-primary-rgb) / 0.15) !important; }
        [data-totem] .bg-emerald-500\\/20  { background-color: rgb(var(--color-primary-rgb) / 0.2) !important; }
        [data-totem] .bg-emerald-500\\/25  { background-color: rgb(var(--color-primary-rgb) / 0.25) !important; }
        [data-totem] .focus\\:border-emerald-500\\/50:focus { border-color: rgb(var(--color-primary-rgb) / 0.5) !important; }
        [data-totem] .hover\\:border-emerald-500\\/40:hover { border-color: rgb(var(--color-primary-rgb) / 0.4) !important; }
        [data-totem] .hover\\:bg-emerald-500\\/15:hover { background-color: rgb(var(--color-primary-rgb) / 0.15) !important; }
        [data-totem] .hover\\:bg-emerald-500\\/20:hover { background-color: rgb(var(--color-primary-rgb) / 0.2) !important; }

        /* Anti-aliasing: melhora renderização de texto em qualquer cor */
        [data-totem] {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
      `}</style>

      {/* ── Caixa fechado (só se exigido e for tipo presencial) ─────────── */}
      {empresa?.caixa_obrigatorio && empresa?.caixa_aberto === false && fase !== "start" && (
        <div className="fixed top-3 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-3.5 py-1.5 text-xs font-bold text-amber-300 backdrop-blur-md shadow-2xl">
            <Lock className="h-3.5 w-3.5" />
            Caixa fechado — aguarde abertura
          </div>
        </div>
      )}

      {/* ── Offline / Queue indicator (sempre visível quando relevante) ─ */}
      {(!isOnline || queueCount > 0) && (
        <div className="fixed top-3 left-1/2 z-[60] -translate-x-1/2">
          <div
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold backdrop-blur-md shadow-2xl ${
              !isOnline
                ? "border-red-400/40 bg-red-500/20 text-red-300"
                : "border-amber-400/40 bg-amber-500/20 text-amber-300"
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                Sem conexão
                {queueCount > 0 && <span className="opacity-80">· {queueCount} na fila</span>}
              </>
            ) : (
              <>
                <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
                Sincronizando {queueCount} pedido{queueCount !== 1 ? "s" : ""}…
              </>
            )}
          </div>
        </div>
      )}


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
              empresa={empresa}
              onIdentified={handleIdentified}
              onSkip={handleSkipIdentificacao}
            />
          </motion.div>
        )}

        {fase === "tipoConsumo" && (
          <motion.div
            key="tipoConsumo"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ position: "absolute", inset: 0 }}
          >
            <TipoConsumoModal
              idioma={idioma}
              temMesa={!!mesaId}
              empresa={empresa}
              onSelect={handleTipoConsumoSelected}
            />
          </motion.div>
        )}

        {fase === "endereco" && (
          <motion.div
            key="endereco"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            style={{ position: "absolute", inset: 0 }}
          >
            <EnderecoModal
              enderecoSalvo={cliente?.endereco ?? null}
              valorAtual={endereco}
              empresa={empresa}
              onConfirm={handleEnderecoConfirmado}
              onBack={() => setFase("tipoConsumo")}
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
              empresa={empresa}
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={empresa.logo_url}
                    alt={empresa.nome_fantasia}
                    className="h-12 w-auto max-w-[180px] object-contain"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
                    <ChefHat className="h-4 w-4 text-emerald-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {!empresa.logo_url && <p className="truncate font-bold">{empresa.nome_fantasia}</p>}
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

      {/* Idle: ainda está aí? */}
      {showIdleWarning && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950"
          onClick={continuarSessao}
        >
          <div
            className="mx-6 max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                 style={{ background: "var(--color-primary-15, rgba(16,185,129,0.15))" }}>
              <span className="text-3xl">👋</span>
            </div>
            <h3 className="text-2xl font-bold text-white">Ainda está aí?</h3>
            <p className="mt-2 text-sm text-slate-400">
              Detectamos um tempo sem uso. Toque pra continuar — caso contrário, a sessão será reiniciada em
            </p>
            <p className="mt-3 text-5xl font-black tabular-nums" style={{ color: "var(--color-primary, #10b981)" }}>
              {idleCountdown}s
            </p>
            <button
              onClick={continuarSessao}
              className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white transition hover:brightness-110"
              style={{ background: "var(--color-primary, #10b981)" }}
            >
              Sim, estou aqui
            </button>
            <button
              onClick={() => { setShowIdleWarning(false); clearIdleTimers(); handleFullReset(); }}
              className="mt-2 w-full rounded-2xl border border-white/10 py-3 text-sm text-slate-400 hover:bg-white/5 transition"
            >
              Reiniciar agora
            </button>
          </div>
        </div>
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          mesaNumero={mesaNumeroReal}
          cliente={cliente}
          slug={params.slug}
          idioma={idioma}
          isOnline={isOnline}
          tipoConsumo={tipoConsumo}
          taxaInfo={tipoConsumo === "delivery" ? taxaEntrega : null}
          aceitaDinheiro={(empresa as { totem_aceita_dinheiro?: boolean })?.totem_aceita_dinheiro === true}
          onClose={() => setCartOpen(false)}
          onUpdate={updateCart}
          onConfirm={handleConfirmarPedido}
        />
      )}

      {/* PIX payment screen */}
      {pixInfo && !pedidoFeito && (
        <PixPaymentScreen
          slug={params.slug}
          pedidoNumero={pixInfo.pedidoNumero}
          clienteNome={pixInfo.clienteNome}
          pontosGanhos={pixInfo.pontosGanhos}
          totalPontos={pixInfo.totalPontos}
          gatewayId={pixInfo.gatewayId}
          gateway={pixInfo.gateway}
          pixCopiaCola={pixInfo.pixCopiaCola}
          pixQrcodeUrl={pixInfo.pixQrcodeUrl}
          total={pixInfo.total}
          idioma={idioma}
          onPago={(numero, nome, pg, tp) => {
            setPixInfo(null);
            setPedidoFeito({ numero, clienteNome: nome, pontosGanhos: pg, totalPontos: tp });
          }}
          onPular={() => {
            // Mostra sucesso sem aguardar confirmação do PIX
            setPedidoFeito({
              numero:      pixInfo.pedidoNumero,
              clienteNome: pixInfo.clienteNome,
              pontosGanhos: pixInfo.pontosGanhos,
              totalPontos:  pixInfo.totalPontos,
            });
            setPixInfo(null);
          }}
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
          pagueNoCaixa={pedidoFeito.formaPagamento === "cartao_caixa"}
          total={pedidoFeito.total}
        />
      )}
    </div>
  );
}
