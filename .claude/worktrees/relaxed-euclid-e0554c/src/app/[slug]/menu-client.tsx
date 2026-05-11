"use client";

import { useMemo, useState } from "react";
import { Categoria, Empresa, Produto } from "@/types";
import Product3DViewer from "@/components/Product3DViewer";
import CategoryFilter from "@/components/CategoryFilter";
import ProductCard from "@/components/ProductCard";
import Cart from "@/components/Cart";
import { motion } from "framer-motion";

type Props = {
  empresa: Empresa;
  categorias: Categoria[];
  produtos: Produto[];
};

export default function MenuClient({ empresa, categorias, produtos }: Props) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<number | "todos">("todos");

  const produtoDestaque = produtos.find((produto) => produto.modelo_3d_url);

  const produtosFiltrados = useMemo(() => {
    if (categoriaSelecionada === "todos") return produtos;

    return produtos.filter(
      (produto) => Number(produto.categoria_id) === Number(categoriaSelecionada)
    );
  }, [produtos, categoriaSelecionada]);

  function adicionarAoCarrinho(produto: Produto) {
    window.dispatchEvent(new CustomEvent("add-to-cart", { detail: produto }));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,#020617_55%)] px-5 pb-32 pt-6 text-white">
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

        <Product3DViewer modelUrl={produtoDestaque?.modelo_3d_url} />

        <section className="mt-10">
          <h2 className="text-2xl font-bold">Escolha seu pedido</h2>
          <p className="mt-2 text-slate-300">
            Filtre por categoria, veja os produtos e envie o pedido pelo WhatsApp.
          </p>

          <div className="mt-6">
            <CategoryFilter
              categorias={categorias}
              selected={categoriaSelecionada}
              onChange={setCategoriaSelecionada}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {produtosFiltrados.map((produto) => (
              <ProductCard
                key={produto.Id}
                produto={produto}
                onAdd={adicionarAoCarrinho}
              />
            ))}
          </div>
        </section>
      </section>

      <Cart />
    </main>
  );
}
