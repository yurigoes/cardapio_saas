"use client";

import { ProdutoPublico } from "@/types";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  produto: ProdutoPublico;
  onAdd: (produto: ProdutoPublico) => void;
};

export default function ProductCard({ produto, onAdd }: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {produto.imagem_url && (
            <img
              src={produto.imagem_url}
              alt={produto.nome}
              className="mb-3 h-32 w-full rounded-xl object-cover"
            />
          )}
          <h3 className="text-lg font-bold">{produto.nome}</h3>
          {produto.descricao && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {produto.descricao}
            </p>
          )}
          <p className="mt-4 text-xl font-black">
            {Number(produto.preco).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
          {produto.tempo_preparo && (
            <p className="mt-1 text-xs text-slate-400">
              ⏱ {produto.tempo_preparo} min
            </p>
          )}
        </div>

        <button
          onClick={() => onAdd(produto)}
          className="flex-shrink-0 rounded-full bg-white p-3 text-slate-950 transition hover:scale-105"
        >
          <Plus size={18} />
        </button>
      </div>
    </motion.div>
  );
}
