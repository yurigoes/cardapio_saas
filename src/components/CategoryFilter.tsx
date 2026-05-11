"use client";

import { Categoria } from "@/types";

type Props = {
  categorias: Categoria[];
  selected: number | "todos";
  onChange: (value: number | "todos") => void;
  primaryColor?: string;
};

export default function CategoryFilter({
  categorias,
  selected,
  onChange,
  primaryColor = "#d9b35f"
}: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onChange("todos")}
        className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition-all duration-200 ${
          selected === "todos"
            ? "scale-[1.03] text-black shadow-2xl"
            : "bg-white/10 text-white hover:bg-white/20"
        }`}
        style={
          selected === "todos"
            ? {
                background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`,
                boxShadow: `0 12px 35px ${primaryColor}35`
              }
            : undefined
        }
      >
        Todos
      </button>

      {categorias.map((categoria) => {
        const ativo = selected === categoria.Id;

        return (
          <button
            key={categoria.Id}
            type="button"
            onClick={() => onChange(categoria.Id)}
            className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition-all duration-200 ${
              ativo
                ? "scale-[1.03] text-black shadow-2xl"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            style={
              ativo
                ? {
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`,
                    boxShadow: `0 12px 35px ${primaryColor}35`
                  }
                : undefined
            }
          >
            <span className="block max-w-[170px] whitespace-normal text-center leading-tight">
              {categoria.nome}
            </span>
          </button>
        );
      })}
    </div>
  );
}
