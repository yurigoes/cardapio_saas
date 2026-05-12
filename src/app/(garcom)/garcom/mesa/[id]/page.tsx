"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Plus, Minus, ShoppingCart, X,
  Clock, ChefHat, CheckCircle, Send, Users,
} from "lucide-react";

/* ─── tipos ─────────────────────────────────── */
interface Mesa {
  id: string; numero: number; nome: string | null;
  capacidade: number; setor: string | null; status: string;
  pedido_id: string | null; pedido_numero: number | null;
  pedido_total: number | null; pedido_status: string | null;
  tempo_aberta_segundos: number | null;
}

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

function getToken() { return localStorage.getItem("access_token") ?? ""; }

function formatTempo(s: number | null) {
  if (!s || s <= 0) return null;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60}min`;
}

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
  cart, mesa, onClose, onUpdate, onSubmit,
}: {
  cart: CartItem[]; mesa: Mesa; onClose: () => void;
  onUpdate: (id: string, delta: number) => void;
  onSubmit: (obs: string, clienteNome: string) => Promise<void>;
}) {
  const [obs, setObs]         = useState("");
  const [nome, setNome]       = useState("");
  const [sending, setSending] = useState(false);
  const total = cart.reduce((a, i) => a + i.produto.preco * i.qty, 0);

  async function handle() {
    setSending(true);
    try { await onSubmit(obs, nome); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
      <div className="flex items-center gap-3 border-b border-white/5 p-4">
        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-bold text-white">Carrinho — Mesa {mesa.numero}</p>
          <p className="text-xs text-slate-400">{cart.reduce((a, i) => a + i.qty, 0)} itens</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-2">
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

      <div className="border-t border-white/5 p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-slate-400">Total</span>
          <span className="text-lg font-bold text-brand">{fmt(total)}</span>
        </div>
        <input
          value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do cliente (para chamar quando pronto)"
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand/50"
        />
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
export default function MesaGarcomPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [mesa, setMesa]           = useState<Mesa | null>(null);
  const [categorias, setCats]     = useState<Categoria[]>([]);
  const [produtos, setProdutos]   = useState<Produto[]>([]);
  const [loading, setLoading]     = useState(true);

  const [catAtiva, setCatAtiva]   = useState<string>("todos");
  const [q, setQ]                 = useState("");
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]   = useState(false);
  const [obsAlvo, setObsAlvo]     = useState<Produto | null>(null);
  const [enviado, setEnviado]     = useState(false);
  const [errMsg, setErrMsg]       = useState("");

  const [token, setToken]         = useState<string>("");

  useEffect(() => {
    const t = localStorage.getItem("access_token") ?? "";
    setToken(t);
    if (!t) { window.location.href = "/login"; }
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [mesaRes, catsRes, prodsRes] = await Promise.all([
        fetch(`/api/mesas/${id}`,              { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/painel/categorias",        { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/painel/produtos?limit=200",{ headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [md, cd, pd] = await Promise.all([mesaRes.json(), catsRes.json(), prodsRes.json()]);
      if (md.success) setMesa(md.data);
      if (cd.success) setCats(cd.data);
      if (pd.success) setProdutos(pd.data);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { if (token) load(); }, [token, load]);

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
  async function handleEnviar(obsGeral: string, clienteNome: string) {
    setErrMsg("");
    const res = await fetch("/api/pedidos", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tipo:         "mesa",
        mesa_id:      id,
        cliente_nome: clienteNome || undefined,
        observacoes:  obsGeral || undefined,
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
    setCart([]);
    setCartOpen(false);
    setEnviado(true);
    load(); // recarrega mesa para atualizar status
    setTimeout(() => setEnviado(false), 3000);
  }

  /* ── render ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!mesa) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <p>Mesa não encontrada.</p>
        <button onClick={() => router.back()} className="text-brand text-sm">Voltar</button>
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
            <div className="flex items-center gap-2">
              <p className="font-bold text-white text-lg">Mesa {mesa.numero}</p>
              {mesa.nome && <span className="text-xs text-slate-400">· {mesa.nome}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                mesa.status === "ocupada"
                  ? "bg-orange-500/15 text-orange-400"
                  : "bg-brand/15 text-brand"
              }`}>
                {mesa.status === "ocupada" ? "Ocupada" : "Livre"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{mesa.capacidade}</span>
              {mesa.tempo_aberta_segundos && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />{formatTempo(mesa.tempo_aberta_segundos)}
                </span>
              )}
            </div>
          </div>
          {/* cart button */}
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

        {/* pedido ativo */}
        {mesa.pedido_id && (
          <div className="border-t border-white/5 bg-orange-500/5 px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-orange-300">
              Pedido #{mesa.pedido_numero} em aberto · {fmt(mesa.pedido_total ?? 0)}
            </p>
            <span className={`text-xs font-medium ${
              mesa.pedido_status === "pronto" ? "text-brand" : "text-orange-400"
            }`}>
              {mesa.pedido_status}
            </span>
          </div>
        )}

        {/* feedback de enviado */}
        {enviado && (
          <div className="border-t border-brand/20 bg-brand/10 px-4 py-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-brand" />
            <p className="text-xs text-brand">Pedido enviado para a cozinha!</p>
          </div>
        )}
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
              onAdd={() => {
                // se tiver descrição ou precisar de obs, abre modal; senão adiciona direto
                setObsAlvo(produto);
              }}
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
            <span>Ver pedido</span>
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
          mesa={mesa}
          onClose={() => setCartOpen(false)}
          onUpdate={updateCart}
          onSubmit={handleEnviar}
        />
      )}
    </div>
  );
}
