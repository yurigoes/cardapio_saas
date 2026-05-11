"use client";

import { Empresa, Produto } from "@/types";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  QrCode,
  X
} from "lucide-react";
import { useEffect, useState } from "react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

type Lang = "pt" | "en";

type CartItem = Produto & {
  quantidade: number;
};

type ClienteInfo = {
  nome: string;
  telefone: string;
  cpf?: string;
  semCadastro?: boolean;
};

type Props = {
  open: boolean;
  empresa: Empresa;
  items: CartItem[];
  total: number;
  tipoConsumo: "Consumir na loja" | "Para viagem";
  cliente: ClienteInfo;
  lang: Lang;
  onClose: () => void;
  onSuccess: (data?: any) => void;
};

const copy = {
  pt: {
    finalizar: "Finalizar pedido",
    escolhaPagamento: "Escolha o pagamento",
    dinheiro: "Dinheiro",
    pix: "Pix",
    cartao: "Cartão",
    pagarCaixa: "Pagar no caixa",
    gerarQr: "Gerar QR Code",
    criando: "Criando pedido...",
    erroTitulo: "Ops, algo deu errado",
    erroPadrao:
      "Não foi possível criar o pedido. Verifique a configuração do pagamento.",
    conexao: "Erro de conexão com o servidor.",
    pedidoCriado: "Pedido criado",
    pagamentoConfirmado: "Pagamento confirmado!",
    pedidoNumero: "Pedido Nº",
    idPagamento: "ID pagamento",
    voltando: "Voltando para a tela inicial...",
    cliente: "Cliente",
    escaneie:
      "Escaneie o QR Code. O sistema confirma automaticamente quando o pagamento for aprovado.",
    tempoEncerrado:
      "Tempo de pagamento encerrado. Gere um novo pedido se necessário.",
    enviado: "Pedido enviado para o restaurante.",
    pagamento: "Pagamento"
  },
  en: {
    finalizar: "Checkout",
    escolhaPagamento: "Choose payment",
    dinheiro: "Cash",
    pix: "Pix",
    cartao: "Card",
    pagarCaixa: "Pay at cashier",
    gerarQr: "Generate QR Code",
    criando: "Creating order...",
    erroTitulo: "Something went wrong",
    erroPadrao:
      "Could not create the order. Please check the payment configuration.",
    conexao: "Server connection error.",
    pedidoCriado: "Order created",
    pagamentoConfirmado: "Payment confirmed!",
    pedidoNumero: "Order Nº",
    idPagamento: "Payment ID",
    voltando: "Returning to the start screen...",
    cliente: "Customer",
    escaneie:
      "Scan the QR Code. The system confirms automatically when payment is approved.",
    tempoEncerrado: "Payment time expired. Create a new order if necessary.",
    enviado: "Order sent to the restaurant.",
    pagamento: "Payment"
  }
};

export default function PaymentModal({
  open,
  empresa,
  items,
  total,
  tipoConsumo,
  cliente,
  lang,
  onClose,
  onSuccess
}: Props) {
  const [loading, setLoading] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<
    "Dinheiro" | "Pix" | "Cartão" | ""
  >("");
  const [pedidoCriado, setPedidoCriado] = useState<any>(null);
  const [pix, setPix] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pixSeconds, setPixSeconds] = useState(120);
  const [pixPago, setPixPago] = useState(false);
  const [paymentId, setPaymentId] = useState("");

  const text = copy[lang];

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setFormaPagamento("");
      setPedidoCriado(null);
      setPix(null);
      setErrorMessage("");
      setPixSeconds(120);
      setPixPago(false);
      setPaymentId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || formaPagamento !== "Pix" || !pedidoCriado || pixPago) return;

    const countdown = window.setInterval(() => {
      setPixSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(countdown);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(countdown);
  }, [open, formaPagamento, pedidoCriado, pixPago]);

  useEffect(() => {
    if (!open || formaPagamento !== "Pix" || !paymentId || pixPago) return;

    const monitor = window.setInterval(async () => {
      try {
        const res = await fetch(
          `${API}/api/cardapio/pagamento/${paymentId}/status`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (data.pago) {
          setPixPago(true);
          setPixSeconds(0);

          window.setTimeout(() => {
            onSuccess(pedidoCriado);
          }, 5000);
        }
      } catch {}
    }, 5000);

    return () => window.clearInterval(monitor);
  }, [open, formaPagamento, paymentId, pixPago, onSuccess, pedidoCriado]);

  if (!open) return null;

  async function criarPedido(metodo: "Dinheiro" | "Pix" | "Cartão") {
    setFormaPagamento(metodo);
    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API}/api/cardapio/pedidos/criar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          empresa,
          itens: items,
          total,
          forma_pagamento: metodo,
          cliente_nome: cliente.nome,
          cliente_telefone: cliente.telefone,
          cliente_cpf: cliente.cpf || "",
          cliente_sem_cadastro: cliente.semCadastro === true,
          mesa: tipoConsumo,
          observacao: tipoConsumo
        })
      });

      const data = await res.json();

      if (!res.ok || !data.sucesso) {
        setErrorMessage(data.error || data.message || text.erroPadrao);
        setLoading(false);
        return;
      }

      setPedidoCriado(data);
      setPix(data.pix || null);

      if (data.pix?.mercado_pago_payment_id) {
        setPaymentId(data.pix.mercado_pago_payment_id);
      }

      if (metodo !== "Pix") {
        window.setTimeout(() => {
          onSuccess(data);
        }, 3500);
      }
    } catch {
      setErrorMessage(text.conexao);
    }

    setLoading(false);
  }

  function formatTime(seconds: number) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;

    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const nomeExibicao =
    cliente.nome?.trim() || pedidoCriado?.numero_pedido || text.cliente;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 px-5 backdrop-blur-xl">
      <div className="relative w-full max-w-2xl rounded-[2rem] border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-white/10 p-2"
        >
          <X size={20} />
        </button>

        {errorMessage && (
          <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5" size={20} />
              <div>
                <strong>{text.erroTitulo}</strong>
                <p className="mt-1 text-sm text-red-100/80">
                  {errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {!pedidoCriado ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">
              {text.finalizar}
            </p>

            <h2 className="mt-3 text-3xl font-black">
              {text.escolhaPagamento}
            </h2>

            <div className="mt-5 rounded-2xl bg-white/[0.04] p-4">
              <div className="flex justify-between text-lg font-bold">
                <span>{tipoConsumo}</span>
                <span>
                  {total.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL"
                  })}
                </span>
              </div>

              <div className="mt-2 text-sm text-zinc-400">
                {text.cliente}: {cliente.nome || "-"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {empresa.pagamento_dinheiro && (
                <button
                  disabled={loading}
                  onClick={() => criarPedido("Dinheiro")}
                  className="rounded-2xl bg-white/10 p-5 text-left transition hover:bg-white/20 disabled:opacity-50"
                >
                  <Banknote />
                  <strong className="mt-4 block">{text.dinheiro}</strong>
                  <span className="text-sm text-zinc-400">
                    {text.pagarCaixa}
                  </span>
                </button>
              )}

              {empresa.pagamento_pix && (
                <button
                  disabled={loading}
                  onClick={() => criarPedido("Pix")}
                  className="rounded-2xl bg-white/10 p-5 text-left transition hover:bg-white/20 disabled:opacity-50"
                >
                  <QrCode />
                  <strong className="mt-4 block">{text.pix}</strong>
                  <span className="text-sm text-zinc-400">{text.gerarQr}</span>
                </button>
              )}

              {empresa.pagamento_cartao_pinpad && (
                <button
                  disabled={loading}
                  onClick={() => criarPedido("Cartão")}
                  className="rounded-2xl bg-white/10 p-5 text-left transition hover:bg-white/20 disabled:opacity-50"
                >
                  <CreditCard />
                  <strong className="mt-4 block">{text.cartao}</strong>
                  <span className="text-sm text-zinc-400">
                    {text.pagarCaixa}
                  </span>
                </button>
              )}
            </div>

            {loading && (
              <p className="mt-6 text-center text-zinc-400">{text.criando}</p>
            )}
          </>
        ) : (
          <>
            {pixPago ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto text-emerald-400" size={72} />

                <h2 className="mt-5 text-4xl font-black">
                  {text.pagamentoConfirmado}
                </h2>

                <p className="mt-3 text-zinc-300">
                  {text.pedidoNumero} {pedidoCriado.numero_pedido}
                </p>

                <p className="mt-2 text-sm text-zinc-500">
                  {text.idPagamento}: {paymentId}
                </p>

                <p className="mt-6 text-zinc-400">{text.voltando}</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">
                  {text.pedidoCriado}
                </p>

                <h2 className="mt-3 text-4xl font-black">
                  Nº {pedidoCriado.numero_pedido}
                </h2>

                <p className="mt-2 text-zinc-400">
                  {text.cliente}: {nomeExibicao}
                </p>

                {formaPagamento === "Pix" && pix?.pix_qr_code_base64 ? (
                  <div className="mt-6 text-center">
                    <div className="mx-auto mb-4 inline-flex rounded-full bg-white/10 px-5 py-2 font-mono text-lg font-black text-emerald-300">
                      {formatTime(pixSeconds)}
                    </div>

                    <img
                      src={`data:image/png;base64,${pix.pix_qr_code_base64}`}
                      alt="QR Code Pix"
                      className="mx-auto h-64 w-64 rounded-2xl bg-white p-3"
                    />

                    <p className="mt-4 text-sm text-zinc-400">
                      {text.escaneie}
                    </p>

                    {pixSeconds === 0 && !pixPago && (
                      <div className="mt-5 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-4 text-yellow-100">
                        {text.tempoEncerrado}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl bg-white/[0.04] p-5">
                    <p className="text-zinc-300">{text.enviado}</p>

                    <p className="mt-2 text-zinc-400">
                      {text.pagamento}: {formaPagamento}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}