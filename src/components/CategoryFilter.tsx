"use client";

import { CategoriaPublica } from "@/types";

type Props = {
  categorias: CategoriaPublica[];
  selected: string | "todos";
  onChange: (value: string | "todos") => void;
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
          key={categoria.id}
          onClick={() => onChange(categoria.id)}
          className={`rounded-full px-5 py-2 text-sm ${
            selected === categoria.id
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
