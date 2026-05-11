"use client";

import { ProdutoPublico } from "@/types";
import { Send, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type CartItem = ProdutoPublico & {
  quantidade: number;
};

type Props = {
  whatsapp?: string | null;
  empresaNome?: string;
};

export default function Cart({ whatsapp, empresaNome }: Props) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("cardapio_cart");
    if (saved) {
      try { setItems(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("cardapio_cart", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    function handleAdd(event: Event) {
      const produto = (event as CustomEvent<ProdutoPublico>).detail;

      setItems((current) => {
        const exists = current.find((item) => item.id === produto.id);

        if (exists) {
          return current.map((item) =>
            item.id === produto.id
              ? { ...item, quantidade: item.quantidade + 1 }
              : item
          );
        }

        return [...current, { ...produto, quantidade: 1 }];
      });
    }

    window.addEventListener("add-to-cart", handleAdd);
    return () => window.removeEventListener("add-to-cart", handleAdd);
  }, []);

  const total = items.reduce(
    (sum, item) => sum + Number(item.preco) * item.quantidade,
    0
  );

  function enviarWhatsApp() {
    const numero = whatsapp || process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT || "5571999952268";

    const lista = items
      .map((item) => `${item.quantidade}x ${item.nome}`)
      .join("\n");

    const saudacao = empresaNome ? `Olá, ${empresaNome}!` : "Olá!";
    const texto = `${saudacao} Quero fazer este pedido:\n\n${lista}\n\nTotal: ${total.toLocaleString(
      "pt-BR",
      { style: "currency", currency: "BRL" }
    )}`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank");
  }

  if (!items.length) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-[2rem] border border-white/10 bg-black/90 p-4 text-white shadow-2xl backdrop-blur md:left-auto md:w-[420px]">
      <div className="mb-3 flex items-center justify-between">
        <strong className="flex items-center gap-2">
          <ShoppingCart size={18} />
          Carrinho
        </strong>

        <button onClick={() => setItems([])} className="text-slate-400">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="max-h-40 space-y-2 overflow-auto text-sm text-slate-300">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between gap-3">
            <span>
              {item.quantidade}x {item.nome}
            </span>
            <span>
              {(Number(item.preco) * item.quantidade).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <strong>
          {total.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </strong>

        <button
          onClick={enviarWhatsApp}
          className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold"
        >
          <Send size={16} />
          Enviar
        </button>
      </div>
    </div>
  );
}
