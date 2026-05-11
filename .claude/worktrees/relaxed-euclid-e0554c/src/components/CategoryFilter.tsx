"use client";

import { Categoria } from "@/types";

type Props = {
  categorias: Categoria[];
  selected: number | "todos";
  onChange: (value: number | "todos") => void;
};

export default function CategoryFilter({ categorias, selected, onChange }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      <button
        onClick={() => onChange("todos")}
        className={`rounded-full px-5 py-2 text-sm ${
          selected === "todos"
            ? "bg-white text-slate-950"
            : "bg-white/10 text-white"
        }`}
      >
        Todos
      </button>

      {categorias.map((categoria) => (
        <button
          key={categoria.Id}
          onClick={() => onChange(categoria.Id)}
          className={`rounded-full px-5 py-2 text-sm ${
            selected === categoria.Id
              ? "bg-white text-slate-950"
              : "bg-white/10 text-white"
          }`}
        >
          {categoria.nome}
        </button>
      ))}
    </div>
  );
}
