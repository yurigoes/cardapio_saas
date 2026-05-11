"use client";

import { Produto } from "@/types";

type Props = {
  produto: Produto;
  primaryColor?: string;
  onSelect: (produto: Produto) => void;
};

function money(value: number | string | undefined | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default function ProductCard({
  produto,
  primaryColor = "#d9b35f",
  onSelect
}: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(produto)}
      className="group flex h-full min-h-[360px] w-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/90 text-left text-white shadow-[0_14px_44px_rgba(0,0,0,0.45)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-zinc-900"
    >
      <div className="relative h-48 w-full overflow-hidden bg-black/40">
        {produto.imagem_url ? (
          <img
            src={produto.imagem_url}
            alt={produto.nome}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-xs font-bold text-white/30">
            Sem imagem
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="line-clamp-2 text-xl font-black leading-tight">
            {produto.nome}
          </h3>

          {produto.descricao && (
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/60">
              {produto.descricao}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <strong className="text-2xl font-black leading-none" style={{ color: primaryColor }}>
            {money(produto.preco)}
          </strong>

          <span
            className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black text-black shadow-xl transition group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`,
              boxShadow: `0 10px 28px ${primaryColor}30`
            }}
          >
            Adicionar
          </span>
        </div>
      </div>
    </button>
  );
}
