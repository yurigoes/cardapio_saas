"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Categoria, Empresa, Insumo, Produto } from "@/types";
import CategoryFilter from "@/components/CategoryFilter";
import ProductCard from "@/components/ProductCard";
import Cart from "@/components/Cart";
import StartScreen from "@/components/StartScreen";
import SessionWatcher from "@/components/SessionWatcher";
import TrialBadge from "@/components/TrialBadge";
import CustomerModal from "@/components/CustomerModal";
import ProductOptionsModal from "@/components/ProductOptionsModal";

type Lang = "pt" | "en";
type TipoConsumo = "Consumir na loja" | "Para viagem";

type ClienteInfo = {
  nome: string;
  telefone: string;
  cpf?: string;
};

type ProdutoCardapio = Produto & {
  produto_id?: number | string | null;
  tipo?: string | null;
  disponivel?: boolean | null;
  pontos_fidelidade?: number | string | null;
  variacoes_ativas?: boolean | string | number | null;
  variacoes_json?: string | null;
};

type VariacaoProdutoCardapio = {
  id: string;
  nome: string;
  descricao?: string;
  preco: number;
  ativo: boolean;
};

type InsumoCardapio = Insumo & {
  produto_id?: number | string | null | { Id?: number; id?: number } | Array<{ Id?: number; id?: number }>;
  ativo?: boolean | string | number | null;
};

type Props = {
  empresa: Empresa;
  categorias: Categoria[];
  produtos: ProdutoCardapio[];
  trialSeconds: number;
  insumos: InsumoCardapio[];
};

const textos = {
  pt: {
    antes: "Antes de começar",
    como: "Como será seu pedido?",
    consumir: "Consumir na loja",
    viagem: "Para viagem",
    idioma: "Escolha seu idioma",
    premium: "Experiência premium",
    titulo: "Escolha seu pedido",
    subtitulo:
      "Navegue por categorias, personalize seus produtos e finalize de forma simples e rápida.",
    categorias: "Categorias",
    montar: "Monte sua experiência",
    sair: "Sair",
    cliente: "Cliente"
  },
  en: {
    antes: "Before starting",
    como: "How would you like your order?",
    consumir: "Eat here",
    viagem: "Take away",
    idioma: "Choose your language",
    premium: "Premium experience",
    titulo: "Choose your order",
    subtitulo:
      "Browse categories, customize your products and checkout quickly.",
    categorias: "Categories",
    montar: "Build your experience",
    sair: "Exit",
    cliente: "Customer"
  }
};

function isAtivo(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  return value === true || value === "true" || value === "Ativo" || value === "ativo" || value === 1 || value === "1";
}

function getRelationId(value: unknown): number {
  if (Array.isArray(value)) {
    const first = value[0] as any;
    return Number(first?.Id || first?.id || first || 0);
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as any;
    return Number(obj.Id || obj.id || 0);
  }

  return Number(value || 0);
}

function getProdutoId(produto: ProdutoCardapio) {
  return Number(produto.produto_id || produto.Id || 0);
}

function parseVariacoesProduto(produto?: ProdutoCardapio | null): VariacaoProdutoCardapio[] {
  if (!produto?.variacoes_json || !isAtivo(produto.variacoes_ativas)) return [];

  try {
    const parsed = JSON.parse(String(produto.variacoes_json || "[]"));
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => ({
        id: String(item.id || item.nome || Math.random()),
        nome: String(item.nome || ""),
        descricao: String(item.descricao || ""),
        preco: Number(item.preco || 0),
        ativo: isAtivo(item.ativo)
      }))
      .filter((item) => item.nome && item.ativo);
  } catch {
    return [];
  }
}

export default function MenuClient({
  empresa,
  categorias,
  produtos,
  trialSeconds,
  insumos
}: Props) {
  const [started, setStarted] = useState(false);
  const [lang, setLang] = useState<Lang>("pt");
  const [tipoConsumo, setTipoConsumo] = useState<TipoConsumo | null>(null);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [cliente, setCliente] = useState<ClienteInfo>({
    nome: "",
    telefone: "",
    cpf: ""
  });
  const [ultimoPedidoModalOpen, setUltimoPedidoModalOpen] = useState(false);
  const [ultimoPedidoCliente, setUltimoPedidoCliente] = useState<any | null>(null);
  const [buscandoUltimoPedido, setBuscandoUltimoPedido] = useState(false);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<
    number | "todos"
  >("todos");
  const [produtoSelecionado, setProdutoSelecionado] =
    useState<ProdutoCardapio | null>(null);
  const [produtoVariacaoSelecionado, setProdutoVariacaoSelecionado] =
    useState<ProdutoCardapio | null>(null);
  const [insumosProdutoSelecionado, setInsumosProdutoSelecionado] = useState<InsumoCardapio[]>([]);
  const [logoClicks, setLogoClicks] = useState(0);
  const [idleConfirmOpen, setIdleConfirmOpen] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(10);

  const primaryColor = empresa.cor_primaria || "#d9b35f";
  const isVertical = empresa.orientacao_totem === "Vertical";
  const copy = textos[lang];

  const produtosSeguros = useMemo(() => {
    return Array.isArray(produtos) ? produtos : [];
  }, [produtos]);

  const insumosSeguros = useMemo(() => {
    return Array.isArray(insumos) ? insumos : [];
  }, [insumos]);

  const produtosFiltrados = useMemo(() => {
    const lista = produtosSeguros.filter((produto) => {
      if ((produto.tipo || "").toLowerCase() === "adicional") return false;
      if (produto.disponivel === false) return false;
      return true;
    });

    if (categoriaSelecionada === "todos") return lista;

    return lista.filter(
      (produto) => Number(getRelationId(produto.categoria_id)) === Number(categoriaSelecionada)
    );
  }, [produtosSeguros, categoriaSelecionada]);

  function resetTotem() {
    localStorage.removeItem("cardapio_cart");
    window.dispatchEvent(new CustomEvent("clear-cart"));

    setCategoriaSelecionada("todos");
    setTipoConsumo(null);
    setCliente({ nome: "", telefone: "", cpf: "" });
    setClienteModalOpen(false);
    setProdutoSelecionado(null);
    setProdutoVariacaoSelecionado(null);
    setInsumosProdutoSelecionado([]);
    setStarted(false);
  }

  function escolherConsumo(tipo: TipoConsumo) {
    setTipoConsumo(tipo);
    setClienteModalOpen(true);
  }

  function toggleLang() {
    setLang((current) => (current === "pt" ? "en" : "pt"));
  }

  function handleLogoClick() {
    setLogoClicks((current) => {
      const next = current + 1;

      if (next >= 3) {
        localStorage.removeItem("cardapio_cart");
        sessionStorage.clear();
        window.location.reload();
        return 0;
      }

      setTimeout(() => {
        setLogoClicks(0);
      }, 1200);

      return next;
    });
  }

  function selecionarProduto(produto: ProdutoCardapio) {
    const produtoId = getProdutoId(produto);
    const variacoesAtivas = parseVariacoesProduto(produto);

    if (variacoesAtivas.length > 0 && !(produto as any).variacao_selecionada) {
      setProdutoVariacaoSelecionado(produto);
      return;
    }

    const adicionaisDoProduto = insumosSeguros.filter((insumo) => {
      const insumoProdutoId = getRelationId(insumo.produto_id);
      return insumoProdutoId === produtoId && isAtivo(insumo.ativo);
    });

    if (adicionaisDoProduto.length > 0) {
      setProdutoSelecionado(produto);
      setInsumosProdutoSelecionado(adicionaisDoProduto);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("add-to-cart-direct", {
        detail: {
          ...produto,
          produto_id: produto.produto_id || produto.Id,
          quantidade: 1,
          insumos: [],
          observacao: ""
        }
      })
    );
  }

  useEffect(() => {
    function handleResetTotem() {
      resetTotem();
    }

    window.addEventListener("reset-totem", handleResetTotem);

    return () => {
      window.removeEventListener("reset-totem", handleResetTotem);
    };
  }, []);

  useEffect(() => {
    function handleOpenProduct(event: Event) {
      const produto = (event as CustomEvent<ProdutoCardapio>).detail;
      selecionarProduto(produto);
    }

    window.addEventListener("open-product-options", handleOpenProduct);

    return () => {
      window.removeEventListener("open-product-options", handleOpenProduct);
    };
  }, [insumosSeguros]);



  async function buscarUltimoPedidoCliente(clienteAtual: ClienteInfo) {
    const identificador = clienteAtual.cpf || clienteAtual.telefone;
    if (!identificador) return;

    try {
      setBuscandoUltimoPedido(true);

      const queryParts = [
        `(empresa_id,eq,${empresa.Id})`
      ];

      if (clienteAtual.cpf) {
        queryParts.push(`(cliente_cpf,eq,${encodeURIComponent(clienteAtual.cpf)})`);
      } else if (clienteAtual.telefone) {
        queryParts.push(`(cliente_telefone,eq,${encodeURIComponent(clienteAtual.telefone)})`);
      }

      const where = queryParts.join("~and");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_CONNECT_API || process.env.NEXT_PUBLIC_BACKEND_URL || "https://connect.yugochat.com.br"}/api/db/pedidos_cardapio?where=${where}&limit=1&sort=-Id`,
        { cache: "no-store" }
      );

      const data = await response.json();
      const pedido = Array.isArray(data?.list) ? data.list[0] : null;

      if (pedido && pedido.Id) {
        setUltimoPedidoCliente(pedido);
        setUltimoPedidoModalOpen(true);
      }
    } catch {
      setUltimoPedidoCliente(null);
      setUltimoPedidoModalOpen(false);
    } finally {
      setBuscandoUltimoPedido(false);
    }
  }

  function repetirUltimoPedido() {
    if (!ultimoPedidoCliente) return;

    let itens: any[] = [];

    try {
      const raw =
        ultimoPedidoCliente.itens_json ||
        ultimoPedidoCliente.items_json ||
        ultimoPedidoCliente.produtos_json ||
        ultimoPedidoCliente.payload_json ||
        "[]";

      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

      if (Array.isArray(parsed)) {
        itens = parsed;
      } else if (Array.isArray(parsed?.itens)) {
        itens = parsed.itens;
      } else if (Array.isArray(parsed?.pedido?.itens)) {
        itens = parsed.pedido.itens;
      }
    } catch {
      itens = [];
    }

    if (itens.length === 0) {
      setUltimoPedidoModalOpen(false);
      return;
    }

    window.dispatchEvent(new CustomEvent("clear-cart"));

    setTimeout(() => {
      itens.forEach((item) => {
        window.dispatchEvent(
          new CustomEvent("add-to-cart-direct", {
            detail: {
              ...item,
              quantidade: Number(item.quantidade || 1)
            }
          })
        );
      });
    }, 100);

    setUltimoPedidoModalOpen(false);
  }


  useEffect(() => {
    if (!started) return;

    let confirmTimer: ReturnType<typeof setTimeout>;
    let resetTimer: ReturnType<typeof setTimeout>;
    let countdownTimer: ReturnType<typeof setInterval>;

    function clearAll() {
      clearTimeout(confirmTimer);
      clearTimeout(resetTimer);
      clearInterval(countdownTimer);
    }

    function startTimers() {
      clearAll();
      setIdleConfirmOpen(false);
      setIdleCountdown(10);

      confirmTimer = setTimeout(() => {
        setIdleConfirmOpen(true);
        setIdleCountdown(10);

        countdownTimer = setInterval(() => {
          setIdleCountdown((current) => Math.max(0, current - 1));
        }, 1000);

        resetTimer = setTimeout(() => {
          resetTotem();
        }, 10000);
      }, 15000);
    }

    const events = ["click", "touchstart", "keydown", "mousemove"];

    function handleActivity() {
      startTimers();
    }

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    startTimers();

    return () => {
      clearAll();
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [started]);

  return (
    <AnimatePresence mode="wait">
      {!started ? (
        <StartScreen
          key="start"
          empresa={empresa}
          onStart={() => {
            setStarted(true);
            setTipoConsumo(null);
            setCliente({ nome: "", telefone: "", cpf: "" });
            setProdutoSelecionado(null);
            setProdutoVariacaoSelecionado(null);
            setInsumosProdutoSelecionado([]);
          }}
        />
      ) : (
        <motion.main
          key="menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className={`relative min-h-screen overflow-hidden bg-black pt-28 text-white ${
            isVertical ? "px-5 pb-40 md:px-8" : "px-4 pb-36 md:px-6"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(circle at top left, ${primaryColor}33, transparent 34%), radial-gradient(circle at bottom right, ${primaryColor}22, transparent 36%), #050505`
            }}
          />

          <TrialBadge empresaId={empresa.Id} initialSeconds={trialSeconds} />

          <SessionWatcher
            active={started}
            onTimeout={resetTotem}
            primaryColor={primaryColor}
          />

          <header className="fixed left-0 right-0 top-0 z-[100] border-b border-white/10 bg-black/85 px-5 py-3 shadow-2xl backdrop-blur-2xl md:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div
                onClick={handleLogoClick}
                className="flex h-14 w-40 cursor-pointer select-none items-center justify-start"
              >
                {empresa.logo_url ? (
                  <img
                    src={empresa.logo_url}
                    alt={empresa.nome_fantasia}
                    className="max-h-full max-w-full object-contain drop-shadow-2xl"
                  />
                ) : (
                  <span className="text-lg font-black">{empresa.nome_fantasia}</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {cliente?.nome ? (
                  <button
                    onClick={() => setClienteModalOpen(true)}
                    className="max-w-[220px] truncate rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white shadow-xl backdrop-blur transition hover:bg-white/20"
                    title={cliente.nome}
                  >
                    {cliente.nome}
                  </button>
                ) : (
                  <button
                    onClick={() => setClienteModalOpen(true)}
                    className="rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white shadow-xl backdrop-blur transition hover:bg-white/20"
                  >
                    {copy.cliente}
                  </button>
                )}

                <button
                  onClick={toggleLang}
                  className="rounded-full bg-white/10 px-4 py-3 text-xl shadow-xl backdrop-blur transition hover:bg-white/20"
                  title={lang === "pt" ? "Português" : "English"}
                >
                  {lang === "pt" ? "🇧🇷" : "🇺🇸"}
                </button>

                <button
                  onClick={resetTotem}
                  className="rounded-full bg-red-500 px-6 py-3 font-bold text-white shadow-xl transition hover:bg-red-400"
                >
                  {copy.sair}
                </button>
              </div>
            </div>
          </header>

          {!tipoConsumo && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
              <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center text-white shadow-2xl">
                <p
                  className="text-xs font-black uppercase tracking-[0.35em]"
                  style={{ color: primaryColor }}
                >
                  {copy.antes}
                </p>

                <h2 className="mt-4 text-4xl font-black">{copy.como}</h2>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <button
                    onClick={() => escolherConsumo("Consumir na loja")}
                    className="rounded-2xl bg-white/10 p-8 text-xl font-black transition hover:bg-white/20"
                  >
                    {copy.consumir}
                  </button>

                  <button
                    onClick={() => escolherConsumo("Para viagem")}
                    className="rounded-2xl bg-white/10 p-8 text-xl font-black transition hover:bg-white/20"
                  >
                    {copy.viagem}
                  </button>
                </div>

                <div className="mt-8 border-t border-white/10 pt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">
                    {copy.idioma}
                  </p>

                  <div className="mt-4 flex justify-center gap-3">
                    <button
                      onClick={() => setLang("pt")}
                      className={`rounded-full px-5 py-3 font-bold transition ${
                        lang === "pt"
                          ? "bg-white text-black"
                          : "bg-white/10 text-white"
                      }`}
                    >
                      🇧🇷 Português
                    </button>

                    <button
                      onClick={() => setLang("en")}
                      className={`rounded-full px-5 py-3 font-bold transition ${
                        lang === "en"
                          ? "bg-white text-black"
                          : "bg-white/10 text-white"
                      }`}
                    >
                      🇺🇸 English
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <CustomerModal
            open={clienteModalOpen}
            empresaId={empresa.Id}
            empresa={empresa}
            lang={lang}
            primaryColor={primaryColor}
            onConfirm={(data) => {
              const clienteAtual = {
                nome: data.nome || "",
                telefone: data.telefone || "",
                cpf: data.cpf || ""
              };

              setCliente(clienteAtual);
              setClienteModalOpen(false);
              buscarUltimoPedidoCliente(clienteAtual);
            }}
          />


          <ProdutoVariacaoModal
            produto={produtoVariacaoSelecionado}
            primaryColor={primaryColor}
            lang={lang}
            onClose={() => setProdutoVariacaoSelecionado(null)}
            onSelect={(variacao) => {
              if (!produtoVariacaoSelecionado) return;

              const produtoComVariacao = {
                ...produtoVariacaoSelecionado,
                preco: variacao.preco,
                variacao_selecionada: variacao,
                variacao_nome: variacao.nome,
                variacao_preco: variacao.preco,
                observacao_variacao: `${variacao.nome}${variacao.descricao ? ` - ${variacao.descricao}` : ""}`
              } as ProdutoCardapio;

              setProdutoVariacaoSelecionado(null);
              selecionarProduto(produtoComVariacao);
            }}
          />

          <ProductOptionsModal
            open={!!produtoSelecionado}
            produto={produtoSelecionado}
            insumos={insumosProdutoSelecionado}
            lang={lang}
            primaryColor={primaryColor}
            empresa={empresa}
            onClose={() => {
              setProdutoSelecionado(null);
              setInsumosProdutoSelecionado([]);
            }}
          />

          <section className="relative z-10 mx-auto w-full max-w-[1500px]">
            <section className="rounded-[2rem] border border-white/10 bg-zinc-900/80 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.50)] backdrop-blur-2xl md:p-8">
              <p
                className="text-xs font-black uppercase tracking-[0.45em]"
                style={{ color: primaryColor }}
              >
                {copy.premium}
              </p>

              <h1 className="mt-4 font-serif text-4xl font-black uppercase leading-tight md:text-5xl">
                {copy.titulo}
              </h1>

              <p className="mt-4 max-w-2xl text-base text-white/70 md:text-lg">
                {copy.subtitulo}
              </p>

              <div
                className="mt-8 h-1 w-32 rounded-full"
                style={{ background: primaryColor }}
              />
            </section>

            <section className="mt-10">
              <div className="mb-6">
                <p
                  className="text-xs font-black uppercase tracking-[0.4em]"
                  style={{ color: primaryColor }}
                >
                  {copy.categorias}
                </p>

                <h2 className="mt-2 text-3xl font-black">{copy.montar}</h2>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-zinc-900/80 p-4 shadow-[0_14px_45px_rgba(0,0,0,0.40)] backdrop-blur-xl">
                <CategoryFilter
                  categorias={categorias}
                  selected={categoriaSelecionada}
                  onChange={setCategoriaSelecionada}
                  primaryColor={primaryColor}
                />
              </div>

              <div className="mt-8 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                {produtosFiltrados.map((produto, index) => (
                  <motion.div
                    key={produto.Id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.025, duration: 0.25 }}
                  >
                    <ProductCard
                      produto={produto}
                      primaryColor={primaryColor}
                      onSelect={(item) => selecionarProduto(item as ProdutoCardapio)}
                    />
                  </motion.div>
                ))}
              </div>
            </section>
          </section>

          {tipoConsumo && !clienteModalOpen && (
            <Cart
              empresa={empresa}
              tipoConsumo={tipoConsumo}
              cliente={cliente}
              lang={lang}
              primaryColor={primaryColor}
              produtos={produtosSeguros}
              categorias={categorias}
            />
          )}


          {ultimoPedidoModalOpen && ultimoPedidoCliente && (
            <div className="fixed inset-0 z-[590] flex items-center justify-center bg-black/85 px-6 text-white backdrop-blur-xl">
              <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
                {empresa.logo_url && (
                  <img
                    src={empresa.logo_url}
                    alt={empresa.nome_fantasia}
                    className="mx-auto mb-5 h-20 w-20 rounded-3xl object-contain"
                  />
                )}

                <p
                  className="text-xs font-black uppercase tracking-[0.35em]"
                  style={{ color: primaryColor }}
                >
                  Pedido anterior
                </p>

                <h2 className="mt-4 text-3xl font-black">
                  Deseja repetir seu último pedido?
                </h2>

                <p className="mt-3 text-white/60">
                  Encontramos um pedido anterior no seu cadastro. Você pode repetir os itens ou continuar escolhendo normalmente.
                </p>

                <button
                  type="button"
                  onClick={repetirUltimoPedido}
                  className="mt-6 w-full rounded-2xl px-5 py-4 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Sim, repetir último pedido
                </button>

                <button
                  type="button"
                  onClick={() => setUltimoPedidoModalOpen(false)}
                  className="mt-3 w-full rounded-2xl bg-white/10 px-5 py-4 font-black text-white"
                >
                  Não, continuar escolhendo
                </button>
              </div>
            </div>
          )}

          {idleConfirmOpen && (
            <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/85 px-6 text-white backdrop-blur-xl">
              <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
                {empresa.logo_url && (
                  <img
                    src={empresa.logo_url}
                    alt={empresa.nome_fantasia}
                    className="mx-auto mb-5 h-20 w-20 rounded-3xl object-contain"
                  />
                )}

                <p
                  className="text-xs font-black uppercase tracking-[0.35em]"
                  style={{ color: primaryColor }}
                >
                  Você ainda está aí?
                </p>

                <h2 className="mt-4 text-3xl font-black">
                  Deseja continuar o pedido?
                </h2>

                <p className="mt-3 text-white/60">
                  Sem interação, voltaremos ao início em {idleCountdown}s.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setIdleConfirmOpen(false);
                    setIdleCountdown(10);
                  }}
                  className="mt-6 w-full rounded-2xl px-5 py-4 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Sim, continuar
                </button>

                <button
                  type="button"
                  onClick={resetTotem}
                  className="mt-3 w-full rounded-2xl bg-white/10 px-5 py-4 font-black text-white"
                >
                  Voltar ao início
                </button>
              </div>
            </div>
          )}
        </motion.main>
      )}
    </AnimatePresence>
  );
}

function ProdutoVariacaoModal({
  produto,
  primaryColor,
  lang,
  onClose,
  onSelect
}: {
  produto: ProdutoCardapio | null;
  primaryColor: string;
  lang: Lang;
  onClose: () => void;
  onSelect: (variacao: VariacaoProdutoCardapio) => void;
}) {
  if (!produto) return null;

  const variacoes = parseVariacoesProduto(produto);

  if (variacoes.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[420] flex items-center justify-center bg-black/80 px-5 text-white backdrop-blur-xl">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.28em]"
              style={{ color: primaryColor }}
            >
              {lang === "pt" ? "Escolha o tamanho" : "Choose a size"}
            </p>
            <h2 className="mt-3 text-3xl font-black">{produto.nome}</h2>
            {produto.descricao && (
              <p className="mt-2 text-sm text-white/50">{produto.descricao}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/10 px-4 py-3 font-black text-white"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {variacoes.map((variacao) => (
            <button
              key={variacao.id}
              type="button"
              onClick={() => onSelect(variacao)}
              className="flex w-full items-center justify-between gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.08]"
            >
              <div>
                <h3 className="text-lg font-black">{variacao.nome}</h3>
                {variacao.descricao && (
                  <p className="mt-1 text-sm text-white/45">{variacao.descricao}</p>
                )}
              </div>

              <strong style={{ color: primaryColor }}>
                {Number(variacao.preco || 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL"
                })}
              </strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
