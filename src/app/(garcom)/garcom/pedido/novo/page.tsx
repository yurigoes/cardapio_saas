"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Plus, Minus, ShoppingCart, X,
  ChefHat, CheckCircle, Send, User,
} from "lucide-react";

/* ─── tipos ─────────────────────────────────── */
interface Categoria { id: string; nome: string; ordem: number; }
interface Produto {
  id: string; categoria_id: string | null; nome: string;
  descricao: string | null; preco: number; imagem_url: string | null;
  tempo_preparo: number | null; tipo: string;
}
interface CartItem { produto: Produto; qty: number; obs: string; }

/* ─── helpers ────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/* ─── componente de card de produto ──────────── */
function ProdutoCard({
  produto, qty, onAdd, onRemove,
}: { produto: Produto; qty: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800 border border-white/5 p-3">
      {produto.imagem_url ? (
        <img src={produto.imagem_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-slate-700">
          <ChefHat className="h-5 w-5 text-slate-500" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white line-clamp-1">{produto.nome}</p>
        {produto.descricao && (
          <p className="text-xs text-slate-500 line-clamp-1">{produto.descricao}</p>
        )}
        <p className="text-sm font-bold text-brand">{fmt(produto.preco)}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {qty > 0 ? (
          <>
            <button
              onClick={onRemove}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-5 text-center text-sm font-bold text-white">{qty}</span>
          </>
        ) : null}
        <button
          onClick={onAdd}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white hover:brightness-110 transition"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── modal de obs de item ────────────────────── */
function ObsModal({
  produto, onConfirm, onClose,
}: { produto: Produto; onConfirm: (obs: string) => void; onClose: () => void }) {
  const [obs, setObs] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-5">
        <p className="font-semibold text-white mb-1">{produto.nome}</p>
        <p className="text-xs text-slate-400 mb-3">{fmt(produto.preco)} · Observação (opcional)</p>
        <textarea
          value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Ex: sem cebola, bem passado..."
          rows={3}
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand/50 resize-none"
          autoFocus
        />
        <div className="flex gap-3 mt-3">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-slate-400 hover:text-white transition">
            Cancelar
          </button>
          <button onClick={() => { onConfirm(obs); onClose(); }}
            className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white hover:brightness-110 transition">
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── drawer do carrinho ─────────────────────── */
function CartDrawer({
  cart, clienteNome, onClose, onUpdate, onSubmit,
}: {
  cart: CartItem[];
  clienteNome: string;
  onClose: () => void;
  onUpdate: (id: string, delta: number) => void;
  onSubmit: (opts: { obs: string; nome: string; telefone: string }) => Promise<void>;
}) {
  const [obs, setObs]         = useState("");
  const [nome, setNome]       = useState(clienteNome);
  const [telefone, setTel]    = useState("");
  const [sending, setSending] = useState(false);
  const total = cart.reduce((a, i) => a + i.produto.preco * i.qty, 0);

  async function handle() {
    setSending(true);
    try { await onSubmit({ obs, nome, telefone }); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-bold text-white">Pedido de Balcão</p>
          <p className="text-xs text-slate-400">{cart.reduce((a, i) => a + i.qty, 0)} itens · {fmt(total)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* dados do cliente */}
        <div className="rounded-xl bg-slate-900 border border-white/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cliente (opcional)</p>
          <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
            <User className="h-4 w-4 text-slate-500 flex-shrink-0" />
            <input
              value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cliente"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <input
            value={telefone} onChange={(e) => setTel(e.target.value)}
            placeholder="Telefone (opcional)"
            type="tel"
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none border border-white/5"
          />
        </div>

        {/* itens */}
        <div className="space-y-2">
          {cart.map((item) => (
            <div key={item.produto.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{item.produto.nome}</p>
                {item.obs && <p className="text-xs text-slate-500 truncate">{item.obs}</p>}
                <p className="text-sm font-bold text-brand">{fmt(item.produto.preco * item.qty)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => onUpdate(item.produto.id, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-sm font-bold text-white">{item.qty}</span>
                <button onClick={() => onUpdate(item.produto.id, +1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5 p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-slate-400">Total</span>
          <span className="text-lg font-bold text-brand">{fmt(total)}</span>
        </div>
        <input
          value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Observação geral do pedido (opcional)"
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand/50"
        />
        <button
          onClick={handle} disabled={sending || cart.length === 0}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white hover:brightness-110 transition disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "Enviando..." : "Enviar para cozinha"}
        </button>
      </div>
    </div>
  );
}

/* ─── página principal ───────────────────────── */
export default function PedidoNovoPage() {
  const router = useRouter();

  const [categorias, setCats]   = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading]   = useState(true);

  const [catAtiva, setCatAtiva] = useState<string>("todos");
  const [q, setQ]               = useState("");
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [obsAlvo, setObsAlvo]   = useState<Produto | null>(null);
  const [enviado, setEnviado]   = useState(false);
  const [numeroPedido, setNumPedido] = useState<number | null>(null);
  const [errMsg, setErrMsg]     = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") ?? "" : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catsRes, prodsRes] = await Promise.all([
        fetch("/api/painel/categorias",         { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/painel/produtos?limit=200", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [cd, pd] = await Promise.all([catsRes.json(), prodsRes.json()]);
      if (cd.success) setCats(cd.data);
      if (pd.success) setProdutos(pd.data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /* filtro */
  const filtrados = useMemo(() => {
    let list = catAtiva === "todos" ? produtos : produtos.filter((p) => p.categoria_id === catAtiva);
    if (q.trim()) {
      const low = q.toLowerCase();
      list = list.filter((p) => p.nome.toLowerCase().includes(low));
    }
    return list;
  }, [produtos, catAtiva, q]);

  /* cart helpers */
  function addToCart(produto: Produto, obs = "") {
    setCart((prev) => {
      const ex = prev.find((i) => i.produto.id === produto.id);
      if (ex) return prev.map((i) => i.produto.id === produto.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { produto, qty: 1, obs }];
    });
  }

  function updateCart(produtoId: string, delta: number) {
    setCart((prev) =>
      prev.map((i) => i.produto.id === produtoId ? { ...i, qty: i.qty + delta } : i)
          .filter((i) => i.qty > 0)
    );
  }

  function cartQty(produtoId: string) {
    return cart.find((i) => i.produto.id === produtoId)?.qty ?? 0;
  }

  const cartTotal = cart.reduce((a, i) => a + i.produto.preco * i.qty, 0);
  const cartCount = cart.reduce((a, i) => a + i.qty, 0);

  /* submit */
  async function handleEnviar({ obs, nome, telefone }: { obs: string; nome: string; telefone: string }) {
    setErrMsg("");
    const res = await fetch("/api/pedidos", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tipo:             "balcao",
        cliente_nome:     nome      || undefined,
        cliente_telefone: telefone  || undefined,
        observacoes:   obs     || undefined,
        itens: cart.map((i) => ({
          produto_id:     i.produto.id,
          nome:           i.produto.nome,
          preco_unitario: i.produto.preco,
          quantidade:     i.qty,
          observacoes:    i.obs || undefined,
        })),
      }),
    });
    const data = await res.json();
    if (!data.success) { setErrMsg(data.error || "Erro ao enviar pedido"); return; }
    setNumPedido(data.data?.numero ?? null);
    setCart([]);
    setCartOpen(false);
    setEnviado(true);
  }

  function novosPedido() {
    setEnviado(false);
    setNumPedido(null);
    setErrMsg("");
  }

  /* ── tela de sucesso ── */
  if (enviado) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 mb-6">
          <CheckCircle className="h-10 w-10 text-brand" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">Pedido enviado!</h2>
        {numeroPedido && (
          <p className="text-slate-400 text-sm mb-6">Pedido #{numeroPedido} registrado</p>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={novosPedido}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white hover:brightness-110 transition"
          >
            Novo pedido
          </button>
          <button
            onClick={() => router.push("/garcom")}
            className="w-full rounded-xl border border-white/10 py-3 text-sm text-slate-400 hover:text-white transition"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  /* ── loading ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* header */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-slate-900/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="font-bold text-white text-lg">Pedido de Balcão</p>
            <p className="text-xs text-slate-400">Sem mesa · Retirada ou consumo local</p>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-medium"
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
                {cartCount}
              </span>
            )}
            {cartCount > 0 && <span>{fmt(cartTotal)}</span>}
          </button>
        </div>

        {/* erro */}
        {errMsg && (
          <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-2">
            <p className="text-xs text-red-400">{errMsg}</p>
          </div>
        )}

        {/* busca */}
        <div className="px-4 pb-2 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full rounded-xl bg-slate-800 border border-white/10 pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* categorias */}
        {!q && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
            <button
              onClick={() => setCatAtiva("todos")}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                catAtiva === "todos" ? "bg-brand text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              Todos
            </button>
            {categorias.map((c) => (
              <button
                key={c.id} onClick={() => setCatAtiva(c.id)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  catAtiva === c.id ? "bg-brand text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* lista de produtos */}
      <div className="flex-1 overflow-auto p-4 pb-28 space-y-2">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
            <ChefHat className="h-10 w-10" />
            <p className="text-sm">Nenhum produto encontrado</p>
          </div>
        ) : (
          filtrados.map((produto) => (
            <ProdutoCard
              key={produto.id}
              produto={produto}
              qty={cartQty(produto.id)}
              onAdd={() => setObsAlvo(produto)}
              onRemove={() => updateCart(produto.id, -1)}
            />
          ))
        )}
      </div>

      {/* FAB do carrinho */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-20 bg-gradient-to-t from-slate-950 to-transparent">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between rounded-2xl bg-brand px-5 py-4 font-semibold text-white shadow-xl shadow-brand/20 hover:brightness-110 transition"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {cartCount}
            </span>
            <span>Revisar pedido</span>
            <span>{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* modal de obs */}
      {obsAlvo && (
        <ObsModal
          produto={obsAlvo}
          onConfirm={(obs) => addToCart(obsAlvo, obs)}
          onClose={() => setObsAlvo(null)}
        />
      )}

      {/* drawer do carrinho */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          clienteNome=""
          onClose={() => setCartOpen(false)}
          onUpdate={updateCart}
          onSubmit={handleEnviar}
        />
      )}
    </div>
  );
}
