"use client";

import { useMemo, useState } from "react";
import { EmpresaPublica, CategoriaPublica, ProdutoPublico } from "@/types";
import CategoryFilter from "@/components/CategoryFilter";
import ProductCard from "@/components/ProductCard";
import Cart from "@/components/Cart";
import { motion } from "framer-motion";

type Props = {
  empresa: EmpresaPublica;
  categorias: CategoriaPublica[];
  produtos: ProdutoPublico[];
};

export default function MenuClient({ empresa, categorias, produtos }: Props) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | "todos">("todos");

  const produtosFiltrados = useMemo(() => {
    if (categoriaSelecionada === "todos") return produtos;
    return produtos.filter((p) => p.categoria_id === categoriaSelecionada);
  }, [produtos, categoriaSelecionada]);

  function adicionarAoCarrinho(produto: ProdutoPublico) {
    window.dispatchEvent(new CustomEvent("add-to-cart", { detail: produto }));
  }

  return (
    <main
      className="min-h-screen px-5 pb-32 pt-6 text-white"
      style={{
        background: empresa.cor_primaria
          ? `radial-gradient(circle at top, ${empresa.cor_primaria}33, #020617 55%)`
          : "radial-gradient(circle at top, #1e293b, #020617 55%)",
      }}
    >
      <section className="mx-auto max-w-6xl">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Cardápio Digital
            </p>
            <h1 className="mt-2 text-4xl font-black md:text-6xl">
              {empresa.nome_fantasia}
            </h1>
          </div>

          {empresa.logo_url && (
            <img
              src={empresa.logo_url}
              alt={empresa.nome_fantasia}
              className="h-16 w-16 rounded-2xl object-cover"
            />
          )}
        </motion.header>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">Escolha seu pedido</h2>
          <p className="mt-2 text-slate-300">
            Filtre por categoria e envie o pedido pelo WhatsApp.
          </p>

          {categorias.length > 0 && (
            <div className="mt-6">
              <CategoryFilter
                categorias={categorias}
                selected={categoriaSelecionada}
                onChange={setCategoriaSelecionada}
              />
            </div>
          )}

          {produtosFiltrados.length === 0 ? (
            <div className="mt-12 text-center text-slate-400">
              <p className="text-lg">Nenhum produto disponível nesta categoria.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {produtosFiltrados.map((produto) => (
                <ProductCard
                  key={produto.id}
                  produto={produto}
                  onAdd={adicionarAoCarrinho}
                />
              ))}
            </div>
          )}
        </section>
      </section>

      <Cart whatsapp={empresa.whatsapp} empresaNome={empresa.nome_fantasia} />
    </main>
  );
}
