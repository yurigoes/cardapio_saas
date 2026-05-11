"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShoppingCart, X, Plus, Minus, ChefHat, CheckCircle, ArrowLeft,
  Search, MapPin, User, Phone, RotateCcw, Clock, Star, Gift,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── StartScreen ─────────────────────────────────────────────────────────────

function StartScreen({
  empresa, onStart,
}: { empresa: EmpresaInfo; onStart: () => void }) {
  const ctaText = empresa.totem_cta_text || "Toque para fazer seu pedido";
  const primaryColor = empresa.cor_primaria || "#f59e0b"; // amber fallback

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* ── Background layer ── */}
      {empresa.totem_bg_video_url ? (
        <video
          src={empresa.totem_bg_video_url}
          autoPlay muted loop playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : empresa.totem_bg_image_url ? (
        <img
          src={empresa.totem_bg_image_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800" />
      )}

      {/* ── Dark overlay for readability ── */}
      <div className="absolute inset-0 bg-black/60" />

      {/* ── Content ── */}
      <div className="relative z-10 flex h-full flex-col items-center justify-between px-8 py-12">

        {/* Top: logo + nome + badge */}
        <div className="flex flex-col items-center gap-4 text-center">
          {empresa.logo_url ? (
            <img
              src={empresa.logo_url}
              alt={empresa.nome_fantasia}
              className="h-24 w-24 rounded-2xl object-cover shadow-2xl ring-2 ring-white/20"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/10 shadow-2xl ring-2 ring-white/20 backdrop-blur">
              <ChefHat className="h-12 w-12 text-white" />
            </div>
          )}

          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-white/70">
              {empresa.nome_fantasia}
            </p>
          </div>

          {/* ABERTO AGORA badge */}
          <div className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-4 py-1.5 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">
              Aberto Agora
            </span>
          </div>
        </div>

        {/* Center: main title + slogan */}
        <div className="flex flex-col items-center gap-4 text-center">
          <h1
            className="max-w-sm text-5xl font-black leading-tight tracking-tight text-white drop-shadow-2xl"
            style={{ textShadow: "0 4px 24px rgba(0,0,0,0.7)" }}
          >
            {empresa.totem_slogan || empresa.nome_fantasia}
          </h1>
          {empresa.totem_slogan && (
            <p className="text-lg font-medium text-white/60">
              {empresa.nome_fantasia}
            </p>
          )}
        </div>

        {/* Bottom: CTA button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onStart}
            style={{ backgroundColor: primaryColor }}
            className="
              group flex items-center gap-3 rounded-full px-12 py-6
              text-xl font-black uppercase tracking-widest text-white
              shadow-2xl transition-all duration-200
              hover:scale-105 hover:brightness-110
              active:scale-95
              animate-[pulse_3s_ease-in-out_infinite]
            "
          >
            <span>{ctaText}</span>
            <span className="text-2xl transition-transform duration-200 group-hover:translate-x-1">›</span>
          </button>
          <p className="text-xs font-medium uppercase tracking-widest text-white/30">
            Autoatendimento
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── CustomerModal ────────────────────────────────────────────────────────────

interface CustomerModalProps {
  slug:          string;
  onIdentified:  (cliente: ClienteIdentificado, ultimoPedido: UltimoPedido | null) => void;
  onSkip:        () => void;
}

function CustomerModal({ slug, onIdentified, onSkip }: CustomerModalProps) {
  const [tipo, setTipo]       = useState<"telefone" | "cpf">("telefone");
  const [valor, setValor]     = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState("");

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
        // Auto-create customer
        const res2 = await fetch(`/api/painel/clientes?slug=${slug}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ [tipo]: digits }),
        });
        const data2 = await res2.json();
        if (data2.success || data2.data) {
          onIdentified({
            id: data2.data?.id ?? "",
            nome: data2.data?.nome ?? null,
            telefone: tipo === "telefone" ? digits : data2.data?.telefone ?? null,
            cpf: tipo === "cpf" ? digits : null,
            pontos: 0,
          }, null);
        } else {
          onSkip();
        }
      } else {
        onIdentified(data.data.cliente as ClienteIdentificado, data.data.ultimoPedido as UltimoPedido | null);
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
          <h2 className="text-lg font-bold text-white">Identificação</h2>
          <p className="text-xs text-slate-500">Para acumular pontos e ver seu histórico</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 pb-8 space-y-6">
        <div className="flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
            <User className="h-10 w-10 text-emerald-400" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-white font-semibold text-lg">Como quer se identificar?</p>
          <p className="mt-1 text-sm text-slate-400">Ganhe pontos a cada pedido!</p>
        </div>

        {/* Type toggle */}
        <div className="flex rounded-xl bg-slate-900 p-1">
          <button
            onClick={() => { setTipo("telefone"); setValor(""); setErro(""); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              tipo === "telefone" ? "bg-emerald-500 text-white" : "text-slate-400"
            }`}
          >
            <Phone className="h-4 w-4" /> Telefone
          </button>
          <button
            onClick={() => { setTipo("cpf"); setValor(""); setErro(""); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
              tipo === "cpf" ? "bg-emerald-500 text-white" : "text-slate-400"
            }`}
          >
            <User className="h-4 w-4" /> CPF
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
            {loading ? "Buscando..." : "Continuar"}
          </button>
        </form>

        <button
          onClick={onSkip}
          className="text-center text-sm text-slate-500 hover:text-slate-300 transition"
        >
          Continuar sem identificação
        </button>
      </div>
    </div>
  );
}

// ─── RepeatOrderModal ────────────────────────────────────────────────────────

interface RepeatOrderModalProps {
  cliente:      ClienteIdentificado;
  ultimoPedido: UltimoPedido;
  produtos:     Produto[];
  onRepeat:     (items: CartItem[]) => void;
  onSkip:       () => void;
}

function RepeatOrderModal({ cliente, ultimoPedido, produtos, onRepeat, onSkip }: RepeatOrderModalProps) {
  const itens = ultimoPedido.itens ?? [];

  function handleRepeat() {
    const cartItems: CartItem[] = [];
    for (const item of itens) {
      const prod = produtos.find(p => p.nome === item.nome);
      if (prod) {
        cartItems.push({ produto: prod, quantidade: item.quantidade, obs: "" });
      }
    }
    if (cartItems.length > 0) onRepeat(cartItems);
    else onSkip();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            Olá, {cliente.nome || "bem-vindo"}! 👋
          </h2>
          {cliente.pontos > 0 && (
            <p className="flex items-center gap-1 text-xs text-emerald-400">
              <Gift className="h-3 w-3" /> {cliente.pontos} pontos acumulados
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
          <p className="text-white font-semibold text-lg">Repetir último pedido?</p>
          <p className="mt-1 text-xs text-slate-400">
            Pedido #{ultimoPedido.numero} · {formatBRL(Number(ultimoPedido.total))}
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
            Repetir pedido
          </button>
          <button
            onClick={onSkip}
            className="w-full rounded-xl bg-slate-800 py-4 text-base font-medium text-slate-300 hover:bg-slate-700 transition"
          >
            Ver cardápio completo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProductDetail ────────────────────────────────────────────────────────────

interface ProductDetailProps {
  produto:     Produto;
  onClose:     () => void;
  onAddToCart: (produto: Produto, qty: number, obs: string) => void;
}

function ProductDetail({ produto, onClose, onAddToCart }: ProductDetailProps) {
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
            <Clock className="h-3.5 w-3.5" /> Preparo: ~{produto.tempo_preparo} min
          </p>
        )}
        <p className="mt-4 text-2xl font-bold text-emerald-400">{formatBRL(produto.preco)}</p>

        <div className="mt-6">
          <label className="block text-sm text-slate-400 mb-2">Observações</label>
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
            Adicionar · {formatBRL(produto.preco * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CartDrawer ───────────────────────────────────────────────────────────────

interface CartDrawerProps {
  cart:        CartItem[];
  mesaNumero:  number | null;
  cliente:     ClienteIdentificado | null;
  onClose:     () => void;
  onUpdate:    (produtoId: string, delta: number) => void;
  onConfirm:   (clienteNome: string, clienteTel: string, obs: string) => Promise<void>;
}

function CartDrawer({ cart, mesaNumero, cliente, onClose, onUpdate, onConfirm }: CartDrawerProps) {
  const [nome, setNome]   = useState(cliente?.nome ?? "");
  const [tel, setTel]     = useState(cliente?.telefone ?? "");
  const [obs, setObs]     = useState("");
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
          <h2 className="text-lg font-bold text-white">Seu Pedido</h2>
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
              placeholder="Seu nome (para chamar quando ficar pronto)"
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
            <input
              value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, ""))}
              placeholder="Telefone (opcional)"
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </>
        )}
        {cliente && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <User className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{cliente.nome || "Cliente identificado"}</p>
              <p className="text-xs text-emerald-400">{cliente.pontos} pontos acumulados</p>
            </div>
          </div>
        )}

        <input
          value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Observação geral (opcional)"
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
        />

        <button
          onClick={handleOrder} disabled={sending || cart.length === 0}
          className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 transition disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Confirmar Pedido"}
        </button>
      </div>
    </div>
  );
}

// ─── SuccessScreen ────────────────────────────────────────────────────────────

function SuccessScreen({
  numero, mesaNumero, clienteNome, pontos, onReset,
}: { numero: number; mesaNumero: number | null; clienteNome: string; pontos?: number; onReset: () => void }) {
  // Auto-reset after 15 s
  useEffect(() => {
    const t = setTimeout(onReset, 15_000);
    return () => clearTimeout(t);
  }, [onReset]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-950 p-8 text-center">
      <CheckCircle className="h-20 w-20 text-emerald-400" />
      <div>
        <h2 className="text-3xl font-black text-white">Pedido #{numero}</h2>
        {mesaNumero && (
          <p className="mt-2 text-emerald-400 font-semibold text-lg flex items-center justify-center gap-1">
            <MapPin className="h-4 w-4" /> Mesa {mesaNumero}
          </p>
        )}
        {clienteNome && (
          <p className="mt-1 text-slate-300">Obrigado, <span className="font-semibold">{clienteNome}</span>!</p>
        )}
        {pontos !== undefined && pontos > 0 && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-amber-400">
            <Gift className="h-4 w-4" /> +{pontos} pontos adicionados
          </p>
        )}
        <p className="mt-2 text-slate-400">Seu pedido foi recebido com sucesso!</p>
        <p className="mt-1 text-sm text-slate-500">
          {mesaNumero ? "Iremos trazer até sua mesa quando estiver pronto." : "Aguarde, em breve estará pronto."}
        </p>
      </div>
      <button
        onClick={onReset}
        className="mt-4 rounded-xl bg-emerald-500 px-8 py-3 font-semibold text-white hover:bg-emerald-400 transition"
      >
        Fazer novo pedido
      </button>
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

// Idle timeout: 3 minutes
const IDLE_MS = 3 * 60 * 1000;

type Fase = "start" | "identificacao" | "repeat" | "cardapio";

export default function TotemPage({ params }: { params: { slug: string } }) {
  const searchParams   = useSearchParams();
  const mesaId         = searchParams.get("mesa");
  const mesaNumero     = searchParams.get("mesa_numero");

  const [empresa, setEmpresa]       = useState<EmpresaInfo | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [mesaNumeroReal]            = useState<number | null>(mesaNumero ? Number(mesaNumero) : null);

  // Totem flow
  const [fase, setFase]                     = useState<Fase>("start");
  const [cliente, setCliente]               = useState<ClienteIdentificado | null>(null);
  const [ultimoPedido, setUltimoPedido]     = useState<UltimoPedido | null>(null);
  const [pedidoFeito, setPedidoFeito]       = useState<{ numero: number; clienteNome: string; pontos?: number } | null>(null);

  // Menu nav
  const [catSelecionada, setCatSelecionada] = useState<string>("todos");
  const [q, setQ]                           = useState("");
  const [produtoAberto, setProdutoAberto]   = useState<Produto | null>(null);
  const [cartOpen, setCartOpen]             = useState(false);
  const [cart, setCart]                     = useState<CartItem[]>([]);

  // Idle timer
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetIdleTimer() {
    if (idleRef.current) clearTimeout(idleRef.current);
    // Only set idle timer when in cardapio phase
    if (fase === "cardapio" && !cartOpen && !produtoAberto) {
      idleRef.current = setTimeout(() => {
        handleFullReset();
      }, IDLE_MS);
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

    setCart([]);
    setCartOpen(false);
    setPedidoFeito({
      numero:      data.data.numero,
      clienteNome: clienteNome || cliente?.nome || "",
      pontos:      data.data.pontos_ganhos,
    });
  }

  // ── Filtered products ──────────────────────────────────────────────────────

  const produtosFiltrados = useMemo(() => {
    let list = produtos;
    if (catSelecionada !== "todos") list = list.filter(p => p.categoria_id === catSelecionada);
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(p => p.nome.toLowerCase().includes(lower) || p.descricao?.toLowerCase().includes(lower));
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
    <div className="min-h-screen bg-slate-950 pb-32 text-white">
      {/* ── Start Screen ── */}
      {fase === "start" && <StartScreen empresa={empresa} onStart={handleStart} />}

      {/* ── Customer Identification ── */}
      {fase === "identificacao" && (
        <CustomerModal slug={params.slug} onIdentified={handleIdentified} onSkip={handleSkipIdentificacao} />
      )}

      {/* ── Repeat last order ── */}
      {fase === "repeat" && cliente && ultimoPedido && (
        <RepeatOrderModal
          cliente={cliente}
          ultimoPedido={ultimoPedido}
          produtos={produtos}
          onRepeat={handleRepeatOrder}
          onSkip={() => setFase("cardapio")}
        />
      )}

      {/* ── Cardápio ── */}
      {fase === "cardapio" && (
        <>
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
                    <User className="h-3 w-3" /> {cliente.nome || "Cliente"} · {cliente.pontos} pts
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => setCartOpen(true)}
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
                  placeholder="Buscar no cardápio..."
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
                  Todos
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

          <div className="px-4 pt-4 space-y-8">
            {catSelecionada === "todos" && !q && destaques.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-400">✦ Destaques</h2>
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

          {cartCount > 0 && !cartOpen && (
            <div className="fixed bottom-6 left-4 right-4 z-20">
              <button
                onClick={() => setCartOpen(true)}
                className="w-full flex items-center justify-between rounded-2xl bg-emerald-500 px-5 py-4 font-semibold text-white shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{cartCount}</span>
                <span>Ver pedido</span>
                <span>{formatBRL(cartTotal)}</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Overlays (always on top) ── */}
      {produtoAberto && (
        <ProductDetail produto={produtoAberto} onClose={() => setProdutoAberto(null)} onAddToCart={addToCart} />
      )}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          mesaNumero={mesaNumeroReal}
          cliente={cliente}
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
          pontos={pedidoFeito.pontos}
          onReset={handleFullReset}
        />
      )}
    </div>
  );
}
