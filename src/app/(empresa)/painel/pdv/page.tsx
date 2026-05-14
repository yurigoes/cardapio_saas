"use client";

/**
 * /painel/pdv — Ponto de Venda dedicado (balcão)
 *
 * Tela full-screen otimizada para tablet em balcão:
 *   - Grid grande de produtos com busca instant
 *   - Carrinho lateral fixo com totalizador grande
 *   - Filtros por categoria em chips horizontais
 *   - Atalhos: ESC limpa busca | Enter adiciona 1º produto | F4 finaliza
 *   - Cliente opcional (busca por telefone com auto-fill)
 *   - Finalizar abre FecharContaModal (pagamento misto, divisão)
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, X, ChefHat,
  User, Loader2, RefreshCw, Wallet, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { FecharContaModal } from "@/components/pedidos/FecharContaModal";

interface Categoria { id: string; nome: string; ordem: number; }
interface Produto {
  id: string; categoria_id: string | null; nome: string;
  descricao: string | null; preco: number; imagem_url: string | null;
  disponivel?: boolean;
}
interface CartItem { produto: Produto; qty: number; obs?: string; }
interface Cliente {
  id: string; nome: string | null; telefone: string | null;
  pontos?: number; saldo_cashback?: number;
}

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

function token() { return localStorage.getItem("access_token") ?? ""; }
function auth() { return { Authorization: `Bearer ${token()}` }; }

export default function PdvPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState("");
  const [catSel, setCatSel]         = useState<string>("todos");
  const [cart, setCart]             = useState<CartItem[]>([]);

  // Cliente
  const [telBusca, setTelBusca]     = useState("");
  const [cliente, setCliente]       = useState<Cliente | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  // Finalização
  const [criandoPedido, setCriandoPedido] = useState(false);
  const [pedidoCriado, setPedidoCriado]   = useState<{ id: string; numero: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const buscaInput = useRef<HTMLInputElement>(null);

  // Carrega catálogo
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        fetch("/api/painel/categorias?limit=100", { headers: auth() }),
        fetch("/api/painel/produtos?limit=500",   { headers: auth() }),
      ]);
      const catJ  = await catRes.json();
      const prodJ = await prodRes.json();
      if (catJ.success)  setCategorias(catJ.data ?? []);
      if (prodJ.success) setProdutos((prodJ.data ?? []).filter((p: Produto) => p.disponivel !== false));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { buscaInput.current?.focus(); }, []);

  // Filtro
  const produtosFiltrados = useMemo(() => {
    let list = catSel === "todos" ? produtos : produtos.filter(p => p.categoria_id === catSel);
    if (q.trim()) {
      const t = q.toLowerCase().trim();
      list = list.filter(p => p.nome.toLowerCase().includes(t));
    }
    return list;
  }, [produtos, catSel, q]);

  // Carrinho
  function addProduto(p: Produto) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.produto.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { produto: p, qty: 1 }];
    });
  }
  function changeQty(id: string, delta: number) {
    setCart(prev => prev.map(i => i.produto.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  }
  function removeItem(id: string) {
    setCart(prev => prev.filter(i => i.produto.id !== id));
  }

  const subtotal = cart.reduce((a, i) => a + Number(i.produto.preco) * i.qty, 0);
  const totalItens = cart.reduce((a, i) => a + i.qty, 0);

  // Atalhos teclado
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "F4" && cart.length > 0) { e.preventDefault(); finalizar(); }
      if (e.key === "Escape") { setQ(""); buscaInput.current?.focus(); }
      if (e.key === "Enter" && q.trim() && produtosFiltrados.length > 0) {
        addProduto(produtosFiltrados[0]);
        setQ("");
        buscaInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, produtosFiltrados, cart.length]);

  // Cliente — busca por telefone
  async function buscarCliente() {
    const tel = telBusca.replace(/\D/g, "");
    if (tel.length < 10) return;
    setBuscandoCliente(true);
    try {
      const r = await fetch(`/api/painel/clientes?q=${tel}&limit=1`, { headers: auth() });
      const d = await r.json();
      if (d.success && d.data && d.data.length > 0) {
        setCliente(d.data[0]);
      } else {
        setCliente(null);
      }
    } finally { setBuscandoCliente(false); }
  }

  // Finalizar — cria pedido
  async function finalizar() {
    if (cart.length === 0) return;

    // Se tem cliente identificado E o cliente tem endereço, pergunta entrega/retira
    let tipoFinal: "balcao" | "delivery" = "balcao";
    let enderecoEntrega: Record<string, string> | null = null;
    if (cliente?.id) {
      const { confirmar } = await import("@/components/ui/ConfirmModal");
      const ehDelivery = await confirmar({
        titulo:   "Entrega ou retira no balcão?",
        mensagem: `Cliente: ${cliente.nome ?? cliente.telefone}\n\nO pedido vai sair pra ENTREGA ou cliente vai RETIRAR no balcão?`,
        okLabel:     "🛵 Sair pra entrega",
        cancelLabel: "🛍 Retirar no balcão",
      });
      if (ehDelivery) {
        tipoFinal = "delivery";
        // Tenta puxar endereço cadastrado do cliente
        try {
          const c = await fetch(`/api/painel/clientes/${cliente.id}`, { headers: auth() }).then(r => r.json());
          if (c.success && c.data?.endereco) enderecoEntrega = c.data.endereco;
        } catch {}
      }
    }

    setCriandoPedido(true);
    setErro(null);
    try {
      const r = await fetch("/api/pedidos", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body:    JSON.stringify({
          tipo:        tipoFinal,
          cliente_id:  cliente?.id || undefined,
          cliente_nome: cliente?.nome || undefined,
          cliente_telefone: cliente?.telefone || undefined,
          cliente_endereco: enderecoEntrega || undefined,
          itens: cart.map(i => ({
            produto_id:     i.produto.id,
            nome:           i.produto.nome,
            preco_unitario: Number(i.produto.preco),
            quantidade:     i.qty,
          })),
        }),
      });
      const d = await r.json();
      if (!d.success) {
        setErro(d.error?.message ?? d.error ?? "Falha ao criar pedido");
        return;
      }
      setPedidoCriado({
        id:     d.data.id,
        numero: d.data.numero,
        total:  subtotal,
      });
    } finally { setCriandoPedido(false); }
  }

  function novoPedido() {
    setCart([]);
    setCliente(null);
    setTelBusca("");
    setPedidoCriado(null);
    setErro(null);
    setQ("");
    buscaInput.current?.focus();
  }

  return (
    <div className="fixed inset-0 flex bg-slate-950 text-white" style={{ paddingLeft: "var(--sidebar-w, 0)" }}>
      {/* Painel esquerdo: catálogo */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header com busca */}
        <div className="border-b border-white/10 bg-slate-900 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Link
              href="/painel"
              className="rounded-xl border border-white/10 p-2.5 text-slate-400 hover:bg-white/5 hover:text-white"
              title="Voltar ao painel"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-bold flex items-center gap-2 mr-3">
              <Wallet className="h-5 w-5 text-emerald-400" />
              PDV
            </h1>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                ref={buscaInput}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Buscar produto (Enter adiciona o 1º)..."
                className="w-full rounded-xl border border-white/10 bg-slate-800 pl-10 pr-3 py-2.5 text-base text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
            <button
              onClick={carregar}
              disabled={loading}
              className="rounded-xl border border-white/10 p-2.5 text-slate-400 hover:bg-white/5"
              title="Recarregar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Categorias chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCatSel("todos")}
              className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                catSel === "todos"
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                  : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              Todos ({produtos.length})
            </button>
            {categorias.map(c => {
              const count = produtos.filter(p => p.categoria_id === c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setCatSel(c.id)}
                  className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    catSel === c.id
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                      : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {c.nome} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid de produtos */}
        <div className="flex-1 overflow-auto p-3">
          {loading && produtos.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Nenhum produto {q ? `para "${q}"` : "nessa categoria"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {produtosFiltrados.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProduto(p)}
                  className="group flex flex-col rounded-xl border border-white/10 bg-slate-900 overflow-hidden text-left hover:border-emerald-500/40 hover:bg-slate-800 transition"
                >
                  <div className="aspect-square bg-slate-800 flex items-center justify-center overflow-hidden">
                    {p.imagem_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagem_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <ChefHat className="h-10 w-10 text-slate-700" />
                    )}
                  </div>
                  <div className="p-2 flex-1 flex flex-col">
                    <p className="text-xs text-slate-300 line-clamp-2 leading-tight flex-1">{p.nome}</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">{fmt(p.preco)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Painel direito: carrinho */}
      <div className="w-80 lg:w-96 border-l border-white/10 bg-slate-900 flex flex-col">
        {/* Cliente */}
        <div className="border-b border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <User className="h-3.5 w-3.5" />
            Cliente (opcional)
          </div>
          {cliente ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-300 truncate">{cliente.nome ?? "(sem nome)"}</p>
                <p className="text-[10px] text-slate-400">{cliente.telefone}</p>
              </div>
              <button onClick={() => { setCliente(null); setTelBusca(""); }} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={telBusca}
                onChange={e => setTelBusca(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && buscarCliente()}
                placeholder="Telefone"
                inputMode="numeric"
                className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                onClick={buscarCliente}
                disabled={buscandoCliente || telBusca.length < 10}
                className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {buscandoCliente ? "..." : "Buscar"}
              </button>
            </div>
          )}
        </div>

        {/* Itens do carrinho */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
              <ShoppingCart className="h-12 w-12 mb-3 text-slate-700" />
              <p>Carrinho vazio</p>
              <p className="text-[11px] text-slate-600 mt-2">Toque nos produtos à esquerda</p>
            </div>
          ) : (
            cart.map(i => (
              <div key={i.produto.id} className="rounded-lg border border-white/10 bg-slate-800 p-2">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{i.produto.nome}</p>
                    <p className="text-[11px] text-slate-500">{fmt(i.produto.preco)} cada</p>
                  </div>
                  <button onClick={() => removeItem(i.produto.id)} className="text-slate-500 hover:text-red-400 p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => changeQty(i.produto.id, -1)} className="rounded-md bg-slate-700 hover:bg-slate-600 p-1.5">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="font-bold text-sm w-6 text-center">{i.qty}</span>
                    <button onClick={() => changeQty(i.produto.id, +1)} className="rounded-md bg-emerald-500 hover:bg-emerald-400 p-1.5">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-emerald-400">{fmt(Number(i.produto.preco) * i.qty)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: total + finalizar */}
        <div className="border-t border-white/10 p-3 space-y-2 bg-slate-900">
          {erro && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {erro}
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">{totalItens} {totalItens === 1 ? "item" : "itens"}</span>
            <span className="text-3xl font-bold text-white">{fmt(subtotal)}</span>
          </div>
          <button
            onClick={finalizar}
            disabled={cart.length === 0 || criandoPedido}
            className="w-full rounded-xl bg-emerald-500 py-4 text-base font-bold text-white hover:brightness-110 disabled:opacity-30 transition flex items-center justify-center gap-2"
          >
            {criandoPedido ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Finalizar (F4)
          </button>
          <p className="text-center text-[9px] text-slate-600">
            ESC limpa busca · Enter adiciona 1º produto · F4 finaliza
          </p>
        </div>
      </div>

      {/* Modal de pagamento — após criar pedido */}
      {pedidoCriado && (
        <FecharContaModal
          pedido={{
            id:           pedidoCriado.id,
            numero:       pedidoCriado.numero,
            total:        pedidoCriado.total,
            cliente_nome: cliente?.nome ?? null,
          }}
          open={true}
          authToken={token()}
          onClose={() => { /* não fecha sem pagar */ }}
          onClosed={novoPedido}
        />
      )}
    </div>
  );
}
