"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingCart, X, Plus, Minus, ChefHat, CheckCircle, ArrowLeft, Search, MapPin } from "lucide-react";

interface EmpresaInfo {
  id: string; nome_fantasia: string; logo_url: string | null;
  cor_primaria: string | null; whatsapp: string | null;
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

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return <img src={src} alt={alt} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-800">
      <ChefHat className="h-8 w-8 text-slate-600" />
    </div>
  );
}

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
      </div>

      <div className="flex flex-1 flex-col overflow-auto p-5">
        <h2 className="text-2xl font-bold text-white">{produto.nome}</h2>
        {produto.descricao && (
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{produto.descricao}</p>
        )}
        {produto.tempo_preparo && (
          <p className="mt-2 text-xs text-slate-500">⏱ Preparo: ~{produto.tempo_preparo} min</p>
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
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="text-slate-400 hover:text-white transition"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-bold text-white">{qty}</span>
            <button
              onClick={() => setQty(qty + 1)}
              className="text-slate-400 hover:text-white transition"
            >
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

interface CartDrawerProps {
  cart:        CartItem[];
  mesaNumero:  number | null;
  onClose:     () => void;
  onUpdate:    (produtoId: string, delta: number) => void;
  onConfirm:   (clienteNome: string, clienteTel: string, obs: string) => Promise<void>;
}

function CartDrawer({ cart, mesaNumero, onClose, onUpdate, onConfirm }: CartDrawerProps) {
  const [nome, setNome]   = useState("");
  const [tel, setTel]     = useState("");
  const [obs, setObs]     = useState("");
  const [sending, setSending] = useState(false);

  const total = cart.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0);

  async function handleOrder() {
    setSending(true);
    try {
      await onConfirm(nome, tel, obs);
    } finally {
      setSending(false);
    }
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
              <p className="text-sm font-bold text-emerald-400">
                {formatBRL(item.produto.preco * item.quantidade)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdate(item.produto.id, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 text-center text-sm font-bold text-white">{item.quantidade}</span>
              <button
                onClick={() => onUpdate(item.produto.id, +1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/5 p-4 space-y-3">
        <div className="flex justify-between text-sm text-slate-400">
          <span>Total</span>
          <span className="text-lg font-bold text-white">{formatBRL(total)}</span>
        </div>

        <input
          value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder={mesaNumero ? "Seu nome (para chamar quando ficar pronto)" : "Seu nome (opcional)"}
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
        />
        <input
          value={tel} onChange={(e) => setTel(e.target.value.replace(/\D/g, ""))}
          placeholder="Telefone (opcional)"
          className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
        />
        <input
          value={obs} onChange={(e) => setObs(e.target.value)}
          placeholder="Observação geral do pedido (opcional)"
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

interface SuccessScreenProps {
  numero:      number;
  mesaNumero:  number | null;
  clienteNome: string;
  onReset:     () => void;
}

function SuccessScreen({ numero, mesaNumero, clienteNome, onReset }: SuccessScreenProps) {
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
          <p className="mt-1 text-slate-300">Olá, <span className="font-semibold">{clienteNome}</span>!</p>
        )}
        <p className="mt-2 text-slate-400">Seu pedido foi recebido com sucesso!</p>
        <p className="mt-1 text-sm text-slate-500">
          {mesaNumero
            ? "Iremos trazer até sua mesa quando estiver pronto."
            : "Aguarde, em breve estará pronto."}
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

export default function TotemPage({ params }: { params: { slug: string } }) {
  const searchParams = useSearchParams();
  const mesaId     = searchParams.get("mesa");
  const mesaNumero = searchParams.get("mesa_numero");

  const [empresa, setEmpresa]         = useState<EmpresaInfo | null>(null);
  const [categorias, setCategorias]   = useState<Categoria[]>([]);
  const [produtos, setProdutos]       = useState<Produto[]>([]);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [mesaNumeroReal, setMesaNumeroReal] = useState<number | null>(
    mesaNumero ? Number(mesaNumero) : null
  );

  const [catSelecionada, setCatSelecionada] = useState<string>("todos");
  const [q, setQ]                           = useState("");
  const [produtoAberto, setProdutoAberto]   = useState<Produto | null>(null);
  const [cartOpen, setCartOpen]             = useState(false);
  const [cart, setCart]                     = useState<CartItem[]>([]);
  const [pedidoFeito, setPedidoFeito]       = useState<{ numero: number; clienteNome: string } | null>(null);

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

  const produtosFiltrados = useMemo(() => {
    let list = produtos;
    if (catSelecionada !== "todos") {
      list = list.filter((p) => p.categoria_id === catSelecionada);
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(
        (p) => p.nome.toLowerCase().includes(lower) || p.descricao?.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [produtos, catSelecionada, q]);

  const destaques = useMemo(() => produtos.filter((p) => p.destaque), [produtos]);

  const addToCart = useCallback((produto: Produto, qty: number, obs: string) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.produto.id === produto.id);
      if (existing) {
        return prev.map((i) =>
          i.produto.id === produto.id
            ? { ...i, quantidade: i.quantidade + qty }
            : i
        );
      }
      return [...prev, { produto, quantidade: qty, obs }];
    });
  }, []);

  const updateCart = useCallback((produtoId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i)
        .filter((i) => i.quantidade > 0)
    );
  }, []);

  const cartTotal = cart.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0);
  const cartCount = cart.reduce((acc, i) => acc + i.quantidade, 0);

  async function handleConfirmarPedido(clienteNome: string, clienteTel: string, obs: string) {
    const res = await fetch(`/api/pub/pedidos/${params.slug}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        cliente_nome:     clienteNome || undefined,
        cliente_telefone: clienteTel  || undefined,
        observacoes:      obs         || undefined,
        mesa_id:          mesaId      || undefined,
        itens: cart.map((i) => ({
          produto_id:     i.produto.id,
          nome:           i.produto.nome,
          preco_unitario: i.produto.preco,
          quantidade:     i.quantidade,
          observacoes:    i.obs || undefined,
        })),
      }),
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.error || "Erro ao enviar pedido");
      return;
    }

    setCart([]);
    setCartOpen(false);
    setPedidoFeito({ numero: data.data.numero, clienteNome: clienteNome });
  }

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
            {mesaNumeroReal && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Mesa {mesaNumeroReal}
              </p>
            )}
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

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
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

        {/* Category tabs */}
        {!q && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
            <button
              onClick={() => setCatSelecionada("todos")}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                catSelecionada === "todos"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Todos
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatSelecionada(c.id)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  catSelecionada === c.id
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {c.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-8">
        {/* Destaques */}
        {catSelecionada === "todos" && !q && destaques.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-400">
              ✦ Destaques
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {destaques.map((produto) => (
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

        {/* Products by category */}
        {catSelecionada === "todos" && !q
          ? categorias.map((cat) => {
              const catProdutos = produtosFiltrados.filter((p) => p.categoria_id === cat.id);
              if (catProdutos.length === 0) return null;
              return (
                <section key={cat.id}>
                  <h2 className="mb-3 text-base font-bold text-white">{cat.nome}</h2>
                  <div className="space-y-2">
                    {catProdutos.map((produto) => (
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
                  {produtosFiltrados.map((produto) => (
                    <ProductRow key={produto.id} produto={produto} onOpen={setProdutoAberto} />
                  ))}
                </div>
              )}
            </section>
          )
        }
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-4 right-4 z-20">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between rounded-2xl bg-emerald-500 px-5 py-4 font-semibold text-white shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
              {cartCount}
            </span>
            <span>Ver pedido</span>
            <span>{formatBRL(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Overlays */}
      {produtoAberto && (
        <ProductDetail
          produto={produtoAberto}
          onClose={() => setProdutoAberto(null)}
          onAddToCart={addToCart}
        />
      )}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          mesaNumero={mesaNumeroReal}
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
          onReset={() => setPedidoFeito(null)}
        />
      )}
    </div>
  );
}

function ProductRow({
  produto, onOpen,
}: { produto: Produto; onOpen: (p: Produto) => void }) {
  return (
    <button
      onClick={() => onOpen(produto)}
      className="flex w-full items-center gap-3 rounded-2xl bg-slate-900 border border-white/5 p-3 text-left hover:border-emerald-500/20 transition"
    >
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl">
        <ProductImage src={produto.imagem_url} alt={produto.nome} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white line-clamp-1">{produto.nome}</p>
        {produto.descricao && (
          <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{produto.descricao}</p>
        )}
        <p className="mt-1.5 text-sm font-bold text-emerald-400">{formatBRL(produto.preco)}</p>
      </div>
      <Plus className="h-5 w-5 flex-shrink-0 text-slate-600" />
    </button>
  );
}
