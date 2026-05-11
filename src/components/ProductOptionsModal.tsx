"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";

type Props = {
  open: boolean;
  produto: any;
  insumos?: any[];
  lang?: "pt" | "en" | string;
  primaryColor?: string;
  empresa?: any;
  onClose: () => void;
  onAdd?: (item: any) => void;
};

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function isAtivo(value: any) {
  if (value === undefined || value === null || value === "") return true;
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "ativo" ||
    String(value).toLowerCase() === "sim"
  );
}

function parseVariacoes(value: any) {
  if (!value) return [];

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any) => ({
        id: String(item.id || item.nome || Math.random()),
        nome: String(item.nome || ""),
        descricao: String(item.descricao || ""),
        preco: Number(item.preco || 0),
        ativo: isAtivo(item.ativo),
      }))
      .filter((item: any) => item.nome && item.ativo);
  } catch {
    return [];
  }
}

function getInsumoId(insumo: any) {
  return String(insumo.Id || insumo.id || insumo.nome || Math.random());
}

function filtrarInsumosDoProduto(produto: any, insumos: any[]) {
  const produtoId = String(produto?.produto_id || produto?.Id || produto?.id || "");

  return (Array.isArray(insumos) ? insumos : []).filter((insumo: any) => {
    if (!isAtivo(insumo.ativo)) return false;

    const insumoProdutoId = String(insumo.produto_id || insumo.produtoId || "");
    if (!insumoProdutoId) return false;

    return insumoProdutoId === produtoId;
  });
}

export default function ProductOptionsModal({
  open,
  produto,
  insumos = [],
  lang = "pt",
  primaryColor = "#f5f500",
  empresa,
  onClose,
  onAdd,
}: Props) {
  const [quantidade, setQuantidade] = useState(1);
  const [selecionados, setSelecionados] = useState<Record<string, number>>({});
  const [observacao, setObservacao] = useState("");
  const [variacaoSelecionadaId, setVariacaoSelecionadaId] = useState("");

  const variacoes = useMemo(() => parseVariacoes(produto?.variacoes_json), [produto]);
  const produtoTemVariacoes = isAtivo(produto?.variacoes_ativas) && variacoes.length > 0;
  const variacaoSelecionada =
    variacoes.find((item: any) => item.id === variacaoSelecionadaId) ||
    (produtoTemVariacoes ? variacoes[0] : null);

  const insumosProduto = useMemo(
    () => filtrarInsumosDoProduto(produto, insumos),
    [produto, insumos]
  );

  const adicionaisSelecionados = useMemo(() => {
    return insumosProduto
      .map((insumo: any) => {
        const qtd = Number(selecionados[getInsumoId(insumo)] || 0);
        return {
          ...insumo,
          quantidade: qtd,
          preco: Number(insumo.preco || 0),
        };
      })
      .filter((item: any) => item.quantidade > 0);
  }, [insumosProduto, selecionados]);

  const precoBase = Number(
    variacaoSelecionada?.preco ?? (produto?.preco || produto?.preco_unitario || 0)
  );

  const totalAdicionais = adicionaisSelecionados.reduce(
    (sum: number, item: any) => sum + Number(item.preco || 0) * Number(item.quantidade || 1),
    0
  );

  const total = (precoBase + totalAdicionais) * quantidade;

  const idiomaAtual = lang || "pt";
  const empresaAtual = empresa || null;

  if (!open || !produto) return null;

  function alterarAdicional(insumo: any, delta: number) {
    const key = getInsumoId(insumo);
    const atual = Number(selecionados[key] || 0);
    const maximo = Number(insumo.maximo || 99);
    const novo = Math.max(0, Math.min(atual + delta, maximo));

    setSelecionados((current) => ({
      ...current,
      [key]: novo,
    }));
  }

  function adicionarAoCarrinho() {
    const nomeProduto = produto?.nome || produto?.nome_produto || "Produto";
    const variacaoNome = variacaoSelecionada?.nome || "";
    const nomeComVariacao = variacaoNome ? `${nomeProduto} - ${variacaoNome}` : nomeProduto;

    const item = {
      ...produto,
      produto_id: produto.produto_id || produto.Id || produto.id,
      nome: nomeProduto,
      nome_produto: nomeProduto,
      nome_exibicao: nomeComVariacao,
      quantidade,
      preco: precoBase,
      preco_unitario: precoBase,
      variacao_nome: variacaoNome,
      variacao_preco: precoBase,
      variacao_descricao: variacaoSelecionada?.descricao || "",
      variacao_selecionada: variacaoSelecionada || null,
      insumos: adicionaisSelecionados,
      adicionais: adicionaisSelecionados,
      observacao,
      subtotal: total,
      subtotal_total: total,
    };

    if (onAdd) {
      onAdd(item);
    } else {
      window.dispatchEvent(new CustomEvent("add-to-cart", { detail: item }));
      window.dispatchEvent(new CustomEvent("add-to-cart-direct", { detail: item }));
    }

    setQuantidade(1);
    setSelecionados({});
    setObservacao("");
    onClose();
  }

  return (
    <div
      data-lang={idiomaAtual}
      data-empresa-id={empresaAtual?.Id || empresaAtual?.id || ""}
      className="fixed inset-0 z-[500] flex items-end justify-center bg-black/75 p-0 text-white backdrop-blur-sm md:items-center md:p-5"
    >
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-zinc-950 shadow-2xl md:rounded-[2rem]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h2 className="text-2xl font-black">{produto.nome}</h2>
            <p className="mt-1 text-sm text-zinc-400">{produto.descricao}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white/10 p-3 transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
            <div className="space-y-4">
              {produto.imagem_url && (
                <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/30">
                  <img
                    src={produto.imagem_url}
                    alt={produto.nome}
                    className="h-56 w-full object-cover"
                  />
                </div>
              )}

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-bold text-zinc-500">Quantidade</p>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setQuantidade((q) => Math.max(q - 1, 1))}
                    className="rounded-2xl bg-white/10 p-3"
                  >
                    <Minus className="h-5 w-5" />
                  </button>

                  <span className="text-3xl font-black">{quantidade}</span>

                  <button
                    type="button"
                    onClick={() => setQuantidade((q) => q + 1)}
                    className="rounded-2xl bg-white/10 p-3"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-zinc-400">Total</p>
                <p className="mt-1 text-3xl font-black" style={{ color: primaryColor }}>
                  {money(total)}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {produtoTemVariacoes && (
                <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-lg font-black">Escolha o tamanho/prato</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    A variação será enviada para a cozinha e para a impressão.
                  </p>

                  <div className="mt-4 grid gap-3">
                    {variacoes.map((variacao: any) => {
                      const selected = (variacaoSelecionada?.id || "") === variacao.id;

                      return (
                        <button
                          key={variacao.id}
                          type="button"
                          onClick={() => setVariacaoSelecionadaId(variacao.id)}
                          className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                            selected
                              ? "border-yellow-300 bg-yellow-300/10"
                              : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div>
                            <strong className="block text-base">{variacao.nome}</strong>
                            {variacao.descricao && (
                              <span className="mt-1 block text-sm text-zinc-500">
                                {variacao.descricao}
                              </span>
                            )}
                          </div>

                          <span className="shrink-0 font-black" style={{ color: primaryColor }}>
                            {money(variacao.preco)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {insumosProduto.length > 0 && (
                <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="text-lg font-black">Adicionais</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Selecione os adicionais disponíveis para este produto.
                  </p>

                  <div className="mt-4 grid gap-3">
                    {insumosProduto.map((insumo: any) => {
                      const key = getInsumoId(insumo);
                      const qtd = Number(selecionados[key] || 0);

                      return (
                        <div
                          key={key}
                          className="rounded-2xl border border-white/10 bg-black/25 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <strong className="block whitespace-normal break-words text-base leading-snug">
                                {insumo.nome}
                              </strong>
                              {insumo.descricao && (
                                <p className="mt-1 whitespace-normal break-words text-sm text-zinc-500">
                                  {insumo.descricao}
                                </p>
                              )}
                              <p className="mt-2 text-sm font-black text-emerald-300">
                                {money(insumo.preco)}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => alterarAdicional(insumo, -1)}
                                className="rounded-xl bg-white/10 p-2 disabled:opacity-30"
                                disabled={qtd <= 0}
                              >
                                <Minus className="h-4 w-4" />
                              </button>

                              <span className="min-w-8 text-center text-lg font-black">{qtd}</span>

                              <button
                                type="button"
                                onClick={() => alterarAdicional(insumo, 1)}
                                className="rounded-xl bg-white/10 p-2"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <label className="block rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                <span className="mb-2 block text-sm font-bold text-zinc-400">
                  Observação
                </span>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: sem cebola, ponto da carne, embalagem separada..."
                  className="min-h-24 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white outline-none placeholder:text-zinc-600"
                />
              </label>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 p-5">
          <button
            type="button"
            onClick={adicionarAoCarrinho}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-lg font-black text-black"
            style={{ background: primaryColor }}
          >
            <ShoppingCart className="h-5 w-5" />
            Adicionar ao carrinho • {money(total)}
          </button>
        </footer>
      </div>
    </div>
  );
}
