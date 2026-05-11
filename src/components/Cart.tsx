"use client";

import { Empresa, Produto } from "@/types";
import {
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
  Gift,
  TicketPercent,
  Star,
  Search,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PaymentModal from "@/components/PaymentModal";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type Lang = "pt" | "en";

type CategoriaLike = {
  Id?: number | string;
  id?: number | string;
  nome?: string;
  name?: string;
};

type ProdutoComPontos = Produto & {
  produto_id?: number | string | null;
  pontos_fidelidade?: number | string | null;
  categoria_id?: any;
  categoria_nome?: string;
  tipo?: string | null;
};

type CartItem = ProdutoComPontos & {
  quantidade: number;
  cart_key?: string;
  insumos?: any[];
  observacao?: string;
};

type ClienteInfo = {
  nome: string;
  telefone: string;
  cpf?: string;
};

type RegraFidelidade = {
  Id?: number;
  empresa_id?: number | string;
  valor_por_ponto?: number | string;
  minimo_pontos_resgate?: number | string;
  permitir_resgate?: boolean | string | number;
  ativo?: boolean | string | number;
};

type VoucherAplicado = {
  codigo: string;
  tipo?: "percentual" | "valor";
  valor?: number;
  desconto: number;
  mensagem?: string;
};

type Props = {
  empresa: Empresa;
  tipoConsumo: "Consumir na loja" | "Para viagem";
  cliente: ClienteInfo;
  lang: Lang;
  primaryColor?: string;
  produtos?: ProdutoComPontos[];
  categorias?: CategoriaLike[];
};

const copy = {
  pt: {
    carrinho: "Carrinho",
    irCarrinho: "Ir para carrinho",
    resumo: "Resumo do pedido",
    vazio: "Seu carrinho está vazio.",
    cada: "cada",
    adicionais: "Adicionais",
    observacao: "Observação",
    limpar: "Limpar carrinho",
    continuar: "Continuar para pagamento",
    voltar: "Continuar comprando",
    finalizarPedido: "Finalizar pedido",
    pedidoFinalizado: "Pedido finalizado!",
    enviado: "Seu pedido foi enviado para o restaurante.",
    voltara: "A tela voltará ao início automaticamente.",
    bebidasTitulo: "Que tal adicionar uma bebida?",
    bebidasSubtitulo: "Escolha a quantidade e adicione ao pedido antes de finalizar.",
    pularBebidas: "Finalizar pedido",
    adicionarBebida: "Adicionar ao carrinho",
    revisarCarrinho: "Finalizar pedido",
    voucher: "Voucher / Cupom",
    aplicarVoucher: "Aplicar",
    usarPontos: "Usar pontos fidelidade",
    desconto: "Desconto",
    subtotal: "Subtotal",
    total: "Total"
  },
  en: {
    carrinho: "Cart",
    irCarrinho: "Go to cart",
    resumo: "Order summary",
    vazio: "Your cart is empty.",
    cada: "each",
    adicionais: "Add-ons",
    observacao: "Note",
    limpar: "Clear cart",
    continuar: "Continue to payment",
    voltar: "Continue shopping",
    finalizarPedido: "Checkout",
    pedidoFinalizado: "Order completed!",
    enviado: "Your order was sent to the restaurant.",
    voltara: "The screen will return to the beginning automatically.",
    bebidasTitulo: "Add a drink?",
    bebidasSubtitulo: "Choose the quantity and add it before checkout.",
    pularBebidas: "Checkout",
    adicionarBebida: "Add to cart",
    revisarCarrinho: "Checkout",
    voucher: "Voucher / Coupon",
    aplicarVoucher: "Apply",
    usarPontos: "Use loyalty points",
    desconto: "Discount",
    subtotal: "Subtotal",
    total: "Total"
  }
};

function isAtivo(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  return (
    value === true ||
    value === "true" ||
    value === "Ativo" ||
    value === "ativo" ||
    value === 1 ||
    value === "1"
  );
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

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizarTexto(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isBebida(produto: ProdutoComPontos, categorias: CategoriaLike[] = []) {
  const categoriaId = getRelationId(produto.categoria_id);
  const categoria = categorias.find((cat) => Number(cat.Id || cat.id) === categoriaId);
  const texto = normalizarTexto([
    produto.nome,
    produto.categoria_nome,
    categoria?.nome,
    categoria?.name,
  ].filter(Boolean).join(" "));

  return (
    texto.includes("bebida") ||
    texto.includes("refrigerante") ||
    texto.includes("suco") ||
    texto.includes("agua") ||
    texto.includes("água") ||
    texto.includes("drink") ||
    texto.includes("coca") ||
    texto.includes("guarana") ||
    texto.includes("guaraná") ||
    texto.includes("cerveja")
  );
}

function itemTotal(item: CartItem) {
  const base = Number(item.preco || 0) * Number(item.quantidade || 1);
  const adicionais = Array.isArray(item.insumos)
    ? item.insumos.reduce((sum, insumo) => {
        return (
          sum +
          Number(insumo.preco || 0) *
            Number(insumo.quantidade || 1) *
            Number(item.quantidade || 1)
        );
      }, 0)
    : 0;

  return base + adicionais;
}

function makeCartKey(item: CartItem) {
  return item.cart_key || `${item.Id || item.produto_id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Cart({
  empresa,
  tipoConsumo,
  cliente,
  lang,
  primaryColor = "#d9b35f",
  produtos = [],
  categorias = []
}: Props) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const [bebidasOpen, setBebidasOpen] = useState(false);
  const [bebidasJaOferecidas, setBebidasJaOferecidas] = useState(false);
  const [bebidasQuantidades, setBebidasQuantidades] = useState<Record<string, number>>({});
  const [bebidasAdicionadas, setBebidasAdicionadas] = useState<Record<string, number>>({});
  const [finalizandoPedidoZero, setFinalizandoPedidoZero] = useState(false);
  const [erroFinalizacao, setErroFinalizacao] = useState("");
  const [pontosGanhosUltimoPedido, setPontosGanhosUltimoPedido] = useState(0);
  const [pontosTotalUltimoPedido, setPontosTotalUltimoPedido] = useState(0);
  const [successPontos, setSuccessPontos] = useState<{
    ganhos_hoje: number;
    total_geral: number;
    pontos_usados: number;
  } | null>(null);

  const [voucherCodigo, setVoucherCodigo] = useState("");
  const [voucherAplicado, setVoucherAplicado] = useState<VoucherAplicado | null>(null);
  const [voucherMsg, setVoucherMsg] = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);

  const [regraFidelidade, setRegraFidelidade] = useState<RegraFidelidade | null>(null);
  const [clientePontos, setClientePontos] = useState(0);
  const [usarPontos, setUsarPontos] = useState(false);

  const text = copy[lang];

  const bebidasDisponiveis = useMemo(() => {
    return produtos
      .filter((produto) => {
        if ((produto.tipo || "").toLowerCase() === "adicional") return false;
        if ((produto as any).disponivel === false) return false;
        return isBebida(produto, categorias);
      })
      .slice(0, 8);
  }, [produtos, categorias]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + itemTotal(item), 0);
  }, [items]);

  const pontosGerados = useMemo(() => {
    return items.reduce((total, item) => {
      const produtoBase = produtos.find(
        (produto) =>
          Number(produto.Id) === Number(item.Id) ||
          Number(produto.produto_id) === Number(item.produto_id)
      );

      const pontosProduto = Number(
        item.pontos_fidelidade || produtoBase?.pontos_fidelidade || 1
      );

      return total + pontosProduto * Number(item.quantidade || 1);
    }, 0);
  }, [items, produtos]);

  const descontoPontos = useMemo(() => {
    if (!usarPontos || !regraFidelidade) return 0;

    const permitir = isAtivo(regraFidelidade.permitir_resgate) && isAtivo(regraFidelidade.ativo);
    if (!permitir) return 0;

    const minimo = Number(regraFidelidade.minimo_pontos_resgate || 0);
    if (clientePontos < minimo) return 0;

    const valorPorPonto = Number(regraFidelidade.valor_por_ponto || 0);
    if (valorPorPonto <= 0) return 0;

    return Math.min(clientePontos * valorPorPonto, subtotal);
  }, [usarPontos, regraFidelidade, clientePontos, subtotal]);

  const pontosUsados = useMemo(() => {
    if (!usarPontos || !regraFidelidade || descontoPontos <= 0) return 0;

    const valorPorPonto = Number(regraFidelidade.valor_por_ponto || 0);
    if (valorPorPonto <= 0) return 0;

    return Math.min(clientePontos, Math.ceil(Math.min(descontoPontos, subtotal) / valorPorPonto));
  }, [usarPontos, regraFidelidade, descontoPontos, clientePontos]);

  const descontoVoucher = useMemo(() => {
    return Math.min(Number(voucherAplicado?.desconto || 0), subtotal);
  }, [voucherAplicado, subtotal]);

  const descontoTotal = useMemo(() => {
    return Math.min(descontoPontos + descontoVoucher, subtotal);
  }, [descontoPontos, descontoVoucher, subtotal]);

  const totalFinal = useMemo(() => {
    return Math.max(subtotal - descontoTotal, 0);
  }, [subtotal, descontoTotal]);

  useEffect(() => {
    const saved = localStorage.getItem("cardapio_cart");

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        localStorage.removeItem("cardapio_cart");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("cardapio_cart", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    async function carregarRegraFidelidade() {
      try {
        const res = await fetch(
          `${API}/api/cardapio/public/regras-fidelidade/${empresa.Id}`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (res.ok && data?.regra) {
          setRegraFidelidade(data.regra);
        }
      } catch {}
    }

    carregarRegraFidelidade();
  }, [empresa.Id]);

  useEffect(() => {
    async function carregarFidelidadeCliente() {
      try {
        const identificador = cliente?.telefone || cliente?.cpf;
        if (!identificador) {
          setClientePontos(0);
          return;
        }

        const tipo = cliente?.cpf ? "cpf" : "telefone";

        const res = await fetch(
          `${API}/api/cardapio/public/fidelidade/${empresa.Id}/${encodeURIComponent(
            identificador
          )}?tipo=${tipo}&total=${subtotal}`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (res.ok) {
          if (data?.regra) setRegraFidelidade(data.regra);
          setClientePontos(Number(data?.pontos_fidelidade || data?.cliente?.pontos_fidelidade || 0));
        }
      } catch {
        setClientePontos(0);
      }
    }

    carregarFidelidadeCliente();
  }, [empresa.Id, cliente?.telefone, cliente?.cpf, subtotal]);

  useEffect(() => {
    function handleAdd(event: Event) {
      const produto = (event as CustomEvent<CartItem>).detail;

      setItems((current) => {
        const key = makeCartKey(produto);

        return [
          ...current,
          {
            ...produto,
            cart_key: key,
            quantidade: Number(produto.quantidade || 1),
            insumos: produto.insumos || [],
            observacao: produto.observacao || ""
          }
        ];
      });

      setCartOpen(false);
    }

    window.addEventListener("add-to-cart-direct", handleAdd);
    window.addEventListener("add-to-cart", handleAdd);

    return () => {
      window.removeEventListener("add-to-cart-direct", handleAdd);
      window.removeEventListener("add-to-cart", handleAdd);
    };
  }, []);

  useEffect(() => {
    function clearCart() {
      setItems([]);
      setPaymentOpen(false);
      setSuccessOpen(false);
      setBebidasOpen(false);
      setBebidasJaOferecidas(false);
      setVoucherCodigo("");
      setVoucherAplicado(null);
      setVoucherMsg("");
      setUsarPontos(false);
      setSuccessPontos(null);
      localStorage.removeItem("cardapio_cart");
    }

    window.addEventListener("clear-cart", clearCart);

    return () => {
      window.removeEventListener("clear-cart", clearCart);
    };
  }, []);

  useEffect(() => {
    if (!successOpen) return;

    const timer = setTimeout(() => {
      setSuccessOpen(false);
      setItems([]);
      setPaymentOpen(false);
      setCartOpen(false);
      localStorage.removeItem("cardapio_cart");
      window.dispatchEvent(new CustomEvent("reset-totem"));
    }, 10000);

    return () => clearTimeout(timer);
  }, [successOpen]);

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.cart_key !== key));
  }

  function increaseItem(key: string) {
    setItems((current) =>
      current.map((item) =>
        item.cart_key === key
          ? { ...item, quantidade: Number(item.quantidade || 1) + 1 }
          : item
      )
    );
  }

  function decreaseItem(key: string) {
    setItems((current) =>
      current
        .map((item) =>
          item.cart_key === key
            ? { ...item, quantidade: Math.max(Number(item.quantidade || 1) - 1, 0) }
            : item
        )
        .filter((item) => Number(item.quantidade || 0) > 0)
    );
  }

  function clearCart() {
    setItems([]);
    setPaymentOpen(false);
    setSuccessOpen(false);
    setBebidasOpen(false);
    setVoucherCodigo("");
    setVoucherAplicado(null);
    setVoucherMsg("");
    setUsarPontos(false);
    setSuccessPontos(null);
    localStorage.removeItem("cardapio_cart");
  }

  function calcularPontosSucessoLocal(responsePontos?: any) {
    const pontosUsadosResponse =
      Number(responsePontos?.resgate?.pontos_usados || responsePontos?.resgate_pontos?.pontos_usados || 0);

    const ganhosHojeResponse =
      responsePontos?.ganhos_hoje !== undefined || responsePontos?.gerados !== undefined
        ? Number(responsePontos?.ganhos_hoje ?? responsePontos?.gerados ?? 0)
        : null;

    const totalGeralResponse =
      responsePontos?.total_geral !== undefined || responsePontos?.saldo_atual !== undefined
        ? Number(responsePontos?.total_geral ?? responsePontos?.saldo_atual ?? 0)
        : null;

    const pontosUsadosFinal = pontosUsadosResponse || pontosUsados || 0;
    const ganhosHojeFinal =
      ganhosHojeResponse !== null ? ganhosHojeResponse : pontosUsadosFinal > 0 ? 0 : pontosGerados;

    const totalGeralFinal =
      totalGeralResponse !== null && totalGeralResponse > 0
        ? totalGeralResponse
        : Math.max(Number(clientePontos || 0) - pontosUsadosFinal, 0) + ganhosHojeFinal;

    return {
      ganhos_hoje: Math.max(Number(ganhosHojeFinal || 0), 0),
      total_geral: Math.max(Number(totalGeralFinal || 0), 0),
      pontos_usados: Math.max(Number(pontosUsadosFinal || 0), 0)
    };
  }

  async function criarPedidoSemPagamento() {
    if (!items.length || finalizandoPedidoZero) return;

    try {
      setFinalizandoPedidoZero(true);
      setErroFinalizacao("");

      const res = await fetch(`${API}/api/cardapio/pedidos/criar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          empresa,
          itens: itemsPagamento,
          total: 0,
          forma_pagamento: "Dinheiro",
          cliente_nome: cliente?.nome || "Totem",
          cliente_telefone: cliente?.telefone || "",
          cliente_cpf: cliente?.cpf || "",
          mesa: tipoConsumo,
          observacao: [
            tipoConsumo,
            "Pedido quitado com desconto/voucher/pontos",
            voucherAplicado?.codigo ? `Voucher: ${voucherAplicado.codigo}` : "",
            pontosUsados > 0 ? `Pontos usados: ${pontosUsados}` : ""
          ]
            .filter(Boolean)
            .join(" | ")
        })
      });

      const data = await res.json();

      if (!res.ok || !data?.sucesso) {
        throw new Error(data?.error || data?.message || "Erro ao finalizar pedido.");
      }

      setSuccessPontos(calcularPontosSucessoLocal(data?.pontos));
      setPaymentOpen(false);
      setCartOpen(false);
      setPontosGanhosUltimoPedido(Number(data?.pontos?.ganhos_hoje ?? data?.pontos?.gerados ?? data?.pontos_ganhos ?? 0));
      setPontosTotalUltimoPedido(Number(data?.pontos?.total_geral ?? data?.pontos?.saldo_atual ?? data?.total_pontos ?? 0));
      setSuccessOpen(true);
    } catch (error: any) {
      setErroFinalizacao(error?.message || "Erro ao finalizar pedido.");
    } finally {
      setFinalizandoPedidoZero(false);
    }
  }

  function openPayment() {
    if (!items.length) return;

    const carrinhoTemBebida = items.some((item) => isBebida(item, categorias));

    if (!bebidasJaOferecidas && !carrinhoTemBebida && bebidasDisponiveis.length > 0) {
      setBebidasOpen(true);
      setBebidasJaOferecidas(true);
      setCartOpen(false);
      return;
    }

    if (totalFinal <= 0.009) {
      criarPedidoSemPagamento();
      return;
    }

    setCartOpen(false);
    setPaymentOpen(true);
  }

  function finalizarAposBebidas() {
    setBebidasOpen(false);
    setCartOpen(true);
  }

  function addBebidaQuantidade(produto: ProdutoComPontos) {
    const key = String(produto.Id || produto.produto_id);
    const qtd = Math.max(1, Number(bebidasQuantidades[key] || 1));

    setItems((current) => [
      ...current,
      {
        ...produto,
        produto_id: produto.produto_id || produto.Id,
        cart_key: `${produto.Id || produto.produto_id}-bebida-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`,
        quantidade: qtd,
        insumos: [],
        observacao: "Bebida adicionada na finalização"
      }
    ]);

    setBebidasAdicionadas((current) => ({
      ...current,
      [key]: Number(current[key] || 0) + qtd
    }));

    setBebidasQuantidades((current) => ({
      ...current,
      [key]: 1
    }));
  }

  function changeBebidaQtd(produto: ProdutoComPontos, delta: number) {
    const key = String(produto.Id || produto.produto_id);

    setBebidasQuantidades((current) => ({
      ...current,
      [key]: Math.max(1, Number(current[key] || 1) + delta)
    }));
  }

  async function aplicarVoucher() {
    try {
      const codigo = voucherCodigo.trim();

      if (!codigo) {
        setVoucherMsg("Informe o código do voucher.");
        return;
      }

      setVoucherLoading(true);
      setVoucherMsg("");

      const res = await fetch(`${API}/api/cardapio/public/voucher/validar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          empresa_id: empresa.Id,
          codigo,
          total: subtotal,
          cliente_telefone: cliente?.telefone || "",
          cliente_cpf: cliente?.cpf || ""
        })
      });

      const data = await res.json();

      if (!res.ok || !data?.valido) {
        setVoucherAplicado(null);
        setVoucherMsg(data?.error || data?.mensagem || "Voucher inválido.");
        return;
      }

      setVoucherAplicado({
        codigo,
        tipo: data.tipo,
        valor: Number(data.valor || 0),
        desconto: Number(data.desconto || 0),
        mensagem: data.mensagem || "Voucher aplicado."
      });

      setVoucherMsg(data.mensagem || "Voucher aplicado.");
    } catch {
      setVoucherAplicado(null);
      setVoucherMsg("Não foi possível validar o voucher agora.");
    } finally {
      setVoucherLoading(false);
    }
  }

  const itemsPagamento = useMemo(() => {
    const descontoUnitario = items.length > 0 ? descontoTotal / items.length : 0;

    return items.map((item, index) => ({
      ...item,
      nome: (item as any).variacao_nome && !String(item.nome || "").toLowerCase().includes(String((item as any).variacao_nome).toLowerCase())
        ? `${(item as any).nome_exibicao || ((item as any).variacao_nome ? `${item.nome} - ${(item as any).variacao_nome}` : item.nome)} - ${(item as any).variacao_nome}`
        : item.nome,
      preco: Number((item as any).variacao_preco ?? item.preco ?? 0),
      variacao_nome: (item as any).variacao_nome || "",
      variacao_preco: Number((item as any).variacao_preco ?? item.preco ?? 0),
      desconto_total_pedido: descontoTotal,
      desconto_pontos_fidelidade: descontoPontos,
      pontos_usados_fidelidade: pontosUsados,
      voucher_codigo: voucherAplicado?.codigo || "",
      usar_pontos_fidelidade: usarPontos && pontosUsados > 0,
      desconto_rateado: index === 0 ? descontoTotal : 0,
      observacao: [
        item.observacao || "",
        voucherAplicado?.codigo ? `Voucher: ${voucherAplicado.codigo}` : "",
        usarPontos && pontosUsados > 0 ? `Resgate de pontos: ${pontosUsados} pontos (${money(descontoPontos)})` : ""
      ]
        .filter(Boolean)
        .join(" | ")
    }));
  }, [items, descontoTotal, voucherAplicado, usarPontos, descontoPontos, pontosUsados]);

  if (!items.length && !successOpen) return null;

  return (
    <>
      {!!items.length && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-[2rem] border border-white/10 bg-black/90 p-4 text-white shadow-2xl backdrop-blur md:left-auto md:w-[460px]"
        >
          <span className="flex items-center gap-3 font-black">
            <ShoppingCart size={22} />
            {items.length} {text.carrinho}
          </span>

          <span className="rounded-full px-4 py-2 text-sm font-black text-black" style={{ background: primaryColor }}>
            {money(totalFinal)}
          </span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-[320] flex items-end justify-center bg-black/70 p-0 text-white backdrop-blur-sm md:items-center md:p-5">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-zinc-950 shadow-2xl md:rounded-[2rem]">
            <header className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="text-2xl font-black">{text.resumo}</h2>
                <p className="text-sm text-white/40">{cliente?.nome || "Cliente"} • {tipoConsumo}</p>
              </div>

              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-full bg-white/10 p-3 transition hover:bg-white/20"
              >
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {items.length === 0 ? (
                <div className="rounded-2xl bg-white/5 p-6 text-center text-white/40">
                  {text.vazio}
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => {
                    const key = item.cart_key || String(item.Id);

                    return (
                      <article
                        key={key}
                        className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-black">{(item as any).nome_exibicao || ((item as any).variacao_nome ? `${item.nome} - ${(item as any).variacao_nome}` : item.nome)}</h3>
                            <p className="mt-1 text-sm text-white/40">
                              {money(Number(item.preco || 0))} {text.cada}
                            </p>
                          </div>

                          <strong style={{ color: primaryColor }}>
                            {money(itemTotal(item))}
                          </strong>
                        </div>

                        {Array.isArray(item.insumos) && item.insumos.length > 0 && (
                          <div className="mt-3 rounded-2xl bg-black/30 p-3">
                            <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white/40">
                              {text.adicionais}
                            </p>

                            {item.insumos.map((insumo, index) => (
                              <p key={`${insumo.Id || insumo.nome}-${index}`} className="text-sm text-white/70">
                                + {Number(insumo.quantidade || 1)}x {insumo.nome}
                              </p>
                            ))}
                          </div>
                        )}

                        {item.observacao && (
                          <div className="mt-3 rounded-2xl bg-yellow-400/10 p-3 text-sm text-yellow-100">
                            {text.observacao}: {item.observacao}
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => decreaseItem(key)}
                              className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
                            >
                              <Minus size={16} />
                            </button>

                            <span className="min-w-8 text-center text-lg font-black">
                              {item.quantidade}
                            </span>

                            <button
                              type="button"
                              onClick={() => increaseItem(key)}
                              className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItem(key)}
                            className="rounded-full bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <TicketPercent size={18} style={{ color: primaryColor }} />
                  <h3 className="font-black">{text.voucher}</h3>
                  <span className="text-xs text-white/35">opcional</span>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={voucherCodigo}
                    onChange={(event) => {
                      setVoucherCodigo(event.target.value.toUpperCase());
                      setVoucherAplicado(null);
                      setVoucherMsg("");
                    }}
                    placeholder="EX: FIDELIDADE10"
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/30"
                  />

                  <button
                    type="button"
                    onClick={aplicarVoucher}
                    disabled={voucherLoading}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 font-black text-white transition hover:bg-white/20 disabled:opacity-60"
                  >
                    <Search size={16} />
                    {voucherLoading ? "..." : text.aplicarVoucher}
                  </button>
                </div>

                {voucherMsg && (
                  <p
                    className={`mt-2 text-sm ${
                      voucherAplicado ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {voucherMsg}
                  </p>
                )}

                {voucherAplicado && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-200">
                    <CheckCircle2 size={16} />
                    {voucherAplicado.codigo} aplicado: -{money(voucherAplicado.desconto)}
                  </div>
                )}
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <input
                  type="checkbox"
                  checked={usarPontos}
                  onChange={(event) => setUsarPontos(event.target.checked)}
                  className="mt-1 h-5 w-5"
                />

                <div>
                  <div className="flex items-center gap-2 font-black">
                    <Star size={18} style={{ color: primaryColor }} />
                    {text.usarPontos}
                  </div>

                  <p className="mt-1 text-sm text-white/45">
                    Saldo: {clientePontos} pontos
                    {regraFidelidade?.valor_por_ponto
                      ? ` • Cada ponto vale ${money(Number(regraFidelidade.valor_por_ponto))}`
                      : " • Resgate configurado pela empresa"}
                  </p>

                  {usarPontos && (
                    <p className="mt-2 text-sm text-emerald-300">
                      Desconto por pontos: {money(descontoPontos)} • serão usados {pontosUsados} pontos
                    </p>
                  )}
                </div>
              </label>
            </div>

            <footer className="border-t border-white/10 p-5">
              <div className="space-y-2 rounded-[1.5rem] bg-black/30 p-4">
                <LinhaResumo label={text.subtotal} value={money(subtotal)} />
                {descontoTotal > 0 && (
                  <LinhaResumo label={text.desconto} value={`-${money(descontoTotal)}`} destaque />
                )}
                <LinhaResumo label={text.total} value={money(totalFinal)} total color={primaryColor} />
              </div>

              {erroFinalizacao && (
                <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {erroFinalizacao}
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr]">
                <button
                  type="button"
                  onClick={clearCart}
                  className="rounded-full bg-white/10 px-5 py-4 font-black text-white transition hover:bg-white/20"
                >
                  {text.limpar}
                </button>

                <button
                  type="button"
                  onClick={openPayment}
                  disabled={finalizandoPedidoZero}
                  className="rounded-full px-5 py-4 font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  {finalizandoPedidoZero
                    ? "Finalizando..."
                    : totalFinal <= 0.009
                    ? "Finalizar pedido sem pagamento"
                    : text.continuar}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="mt-3 w-full rounded-full px-5 py-3 font-bold text-white/60 transition hover:text-white"
              >
                {text.voltar}
              </button>
            </footer>
          </div>
        </div>
      )}

      {bebidasOpen && (
        <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/80 p-5 text-white backdrop-blur-xl">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-black" style={{ background: primaryColor }}>
                  <Gift size={22} />
                </div>

                <h2 className="text-3xl font-black">{text.bebidasTitulo}</h2>
                <p className="mt-2 text-white/50">{text.bebidasSubtitulo}</p>
              </div>

              <button
                type="button"
                onClick={finalizarAposBebidas}
                className="rounded-full bg-white/10 p-3 transition hover:bg-white/20"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {bebidasDisponiveis.map((produto) => {
                const key = String(produto.Id || produto.produto_id);
                const qtd = Math.max(1, Number(bebidasQuantidades[key] || 1));
                const adicionadas = Number(bebidasAdicionadas[key] || 0);

                return (
                  <article
                    key={key}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4"
                  >
                    {(produto as any).imagem_url && (
                      <img
                        src={(produto as any).imagem_url}
                        alt={(produto as any).nome_exibicao || ((produto as any).variacao_nome ? `${produto.nome} - ${(produto as any).variacao_nome}` : produto.nome)}
                        className="mb-4 h-24 w-full rounded-2xl bg-white/5 object-contain p-2"
                      />
                    )}

                    <h3 className="text-lg font-black">{(produto as any).nome_exibicao || ((produto as any).variacao_nome ? `${produto.nome} - ${(produto as any).variacao_nome}` : produto.nome)}</h3>
                    <p className="mt-1 text-sm text-white/45 line-clamp-2">
                      {(produto as any).descricao || "Bebida para acompanhar seu pedido."}
                    </p>

                    <div className="mt-4 flex items-center justify-between">
                      <strong style={{ color: primaryColor }}>
                        {money(Number(produto.preco || 0))}
                      </strong>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeBebidaQtd(produto, -1)}
                          className="rounded-full bg-white/10 p-2"
                        >
                          <Minus size={15} />
                        </button>

                        <span className="min-w-8 text-center text-lg font-black">
                          {qtd}
                        </span>

                        <button
                          type="button"
                          onClick={() => changeBebidaQtd(produto, 1)}
                          className="rounded-full bg-white/10 p-2"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>

                    {adicionadas > 0 && (
                      <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-center text-sm font-black text-emerald-200">
                        {adicionadas} adicionada(s) ao carrinho
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => addBebidaQuantidade(produto)}
                      className="mt-4 w-full rounded-2xl px-4 py-3 font-black text-black"
                      style={{ background: primaryColor }}
                    >
                      {text.adicionarBebida}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl bg-white/5 p-4 text-center text-sm text-white/60">
              Carrinho atual: {items.reduce((sum, item) => sum + Number(item.quantidade || 0), 0)} item(ns) • {money(totalFinal)}
            </div>

            <button
              type="button"
              onClick={finalizarAposBebidas}
              className="mt-4 w-full rounded-2xl bg-white px-5 py-4 text-lg font-black text-black transition hover:bg-white/90"
            >
              {text.revisarCarrinho}
            </button>
          </div>
        </div>
      )}

      <PaymentModal
        open={paymentOpen}
        empresa={empresa}
        items={itemsPagamento}
        total={totalFinal}
        tipoConsumo={tipoConsumo}
        cliente={cliente}
        lang={lang}
        onClose={() => setPaymentOpen(false)}
        onSuccess={(resultado?: any) => {
          setSuccessPontos(calcularPontosSucessoLocal(resultado?.pontos || resultado?.data?.pontos || resultado));
          setPaymentOpen(false);
          setCartOpen(false);
          setSuccessOpen(true);
        }}
      />

      {successOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
          <div className="max-w-md rounded-[2rem] border border-emerald-400/30 bg-zinc-950 p-8 text-center text-white shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl font-black">
              ✓
            </div>

            <h2 className="mt-5 text-3xl font-black">{text.pedidoFinalizado}</h2>
            <p className="mt-3 text-zinc-300">{text.enviado}</p>

            {(pontosGanhosUltimoPedido > 0 || pontosTotalUltimoPedido > 0) && (
              <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 text-left">
                <div className="rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  Pontos ganhos neste pedido: <strong>{pontosGanhosUltimoPedido}</strong>
                </div>

                <div className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/80">
                  Total geral de pontos no cadastro: <strong>{pontosTotalUltimoPedido}</strong>
                </div>
              </div>
            )}

            {successPontos && (
              <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 text-left">
                {successPontos.pontos_usados > 0 ? (
                  <div className="rounded-2xl bg-blue-500/10 p-3 text-sm text-blue-100">
                    Resgate utilizado: <strong>{successPontos.pontos_usados}</strong> pontos.
                    Como este pedido foi pago com pontos, ele não gera nova pontuação.
                  </div>
                ) : (
                  <div className="rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    Pontos ganhos neste pedido: <strong>{successPontos.ganhos_hoje}</strong>
                  </div>
                )}

                <div className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-white/80">
                  Total geral de pontos no cadastro: <strong>{successPontos.total_geral}</strong>
                </div>
              </div>
            )}

            <p className="mt-4 text-sm text-zinc-500">{text.voltara}</p>
          </div>
        </div>
      )}
    </>
  );
}

function LinhaResumo({
  label,
  value,
  destaque,
  total,
  color
}: {
  label: string;
  value: string;
  destaque?: boolean;
  total?: boolean;
  color?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${total ? "text-xl font-black" : "text-sm"}`}>
      <span className={destaque ? "text-emerald-300" : "text-white/60"}>{label}</span>
      <strong style={total && color ? { color } : undefined}>{value}</strong>
    </div>
  );
}
