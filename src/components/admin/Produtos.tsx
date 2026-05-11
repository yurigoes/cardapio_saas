"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import MinioUploadField from "@/components/admin/MinioUploadField";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://connect.yugochat.com.br";

type Produto = {
  Id?: number;
  empresa_id?: number | string;
  produto_id?: string | number | null;
  nome?: string;
  descricao?: string;
  preco?: number | string;
  imagem_url?: string;
  modelo_3d_url?: string | null;
  video_url?: string | null;
  categoria_id?: any;
  categoria_nome?: string;
  disponivel?: boolean | string | number;
  ativo?: boolean | string | number;
  permite_insumos?: boolean | string | number;
  tipo?: string;
  setor_impressao?: string | null;
  pontos_fidelidade?: number | string | null;
  variacoes_ativas?: boolean | string | number;
  variacoes_json?: string | null;
};

type Categoria = {
  Id?: number;
  id?: number;
  nome?: string;
  name?: string;
  ativo?: boolean | string | number;
};

type VariacaoProduto = {
  id: string;
  nome: string;
  descricao?: string;
  preco: number | string;
  ativo: boolean;
};

const TIPOS_PRODUTO = ["Produto", "Adicional", "Combo", "Insumo", "Bebida"];

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

function money(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getRelationId(value: any): string {
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "object" && first !== null) {
      return String(first.Id || first.id || "");
    }
    return String(first || "");
  }

  if (typeof value === "object" && value !== null) {
    return String(value.Id || value.id || "");
  }

  return value !== undefined && value !== null ? String(value) : "";
}

function getCategoriaNome(produto: Produto, categorias: Categoria[]) {
  if (produto.categoria_nome) return produto.categoria_nome;

  const categoriaId = getRelationId(produto.categoria_id);
  const categoria = categorias.find(
    (cat) => String(cat.Id || cat.id) === String(categoriaId)
  );

  return categoria?.nome || categoria?.name || "Sem categoria";
}

function criarProdutoId(empresaId: string | number) {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `P${empresaId}-${Date.now()}-${random}`;
}

function criarVariacaoVazia(): VariacaoProduto {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nome: "",
    descricao: "",
    preco: 0,
    ativo: true,
  };
}

function parseVariacoes(value: any): VariacaoProduto[] {
  if (!value) return [];

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => ({
      id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      nome: String(item.nome || ""),
      descricao: String(item.descricao || ""),
      preco: Number(item.preco || 0),
      ativo: isAtivo(item.ativo),
    }));
  } catch {
    return [];
  }
}

function stringifyVariacoes(variacoes: VariacaoProduto[]) {
  const limpas = variacoes
    .map((item) => ({
      id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      nome: String(item.nome || "").trim(),
      descricao: String(item.descricao || "").trim(),
      preco: Number(item.preco || 0),
      ativo: isAtivo(item.ativo),
    }))
    .filter((item) => item.nome && Number(item.preco || 0) >= 0);

  return JSON.stringify(limpas);
}

export default function Produtos({
  empresaId,
  empresa,
}: {
  empresaId: string;
  empresa?: any;
}) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [variacoes, setVariacoes] = useState<VariacaoProduto[]>([]);

  const [form, setForm] = useState<Produto>({
    produto_id: "",
    nome: "",
    descricao: "",
    preco: "0",
    imagem_url: "",
    categoria_id: "",
    categoria_nome: "",
    disponivel: true,
    permite_insumos: false,
    tipo: "Produto",
    setor_impressao: "cozinha",
    pontos_fidelidade: 1,
    variacoes_ativas: false,
    variacoes_json: "",
  });

  const slug =
    empresa?.slug ||
    empresa?.subdominio ||
    empresa?.nome_fantasia ||
    `empresa-${empresaId}`;

  async function carregar() {
    try {
      setLoading(true);
      setErro("");

      const [produtosRes, categoriasRes] = await Promise.all([
        fetch(
          `${API}/api/db/produtos_cardapio?where=(empresa_id,eq,${empresaId})&limit=1000&sort=nome`,
          { cache: "no-store" }
        ),
        fetch(
          `${API}/api/db/categorias_cardapio?where=(empresa_id,eq,${empresaId})&limit=1000&sort=nome`,
          { cache: "no-store" }
        ),
      ]);

      const produtosData = await produtosRes.json();
      const categoriasData = await categoriasRes.json();

      setProdutos(Array.isArray(produtosData?.list) ? produtosData.list : []);
      setCategorias(Array.isArray(categoriasData?.list) ? categoriasData.list : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [empresaId]);

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return produtos.filter((produto) => {
      if (!termo) return true;

      return [
        produto.nome,
        produto.descricao,
        produto.categoria_nome,
        getCategoriaNome(produto, categorias),
        produto.tipo,
        produto.produto_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo);
    });
  }, [produtos, categorias, busca]);

  function resetForm() {
    setForm({
      produto_id: criarProdutoId(empresaId),
      nome: "",
      descricao: "",
      preco: "0",
      imagem_url: "",
      categoria_id: "",
      categoria_nome: "",
      disponivel: true,
      permite_insumos: false,
      tipo: "Produto",
      setor_impressao: "cozinha",
      pontos_fidelidade: 1,
      variacoes_ativas: false,
      variacoes_json: "",
    });
    setVariacoes([]);
  }

  function abrirNovo() {
    setEditando(null);
    resetForm();
    setModalOpen(true);
  }

  function abrirEditar(produto: Produto) {
    setEditando(produto);

    setForm({
      ...produto,
      produto_id: produto.produto_id || criarProdutoId(empresaId),
      categoria_id: getRelationId(produto.categoria_id),
      categoria_nome: getCategoriaNome(produto, categorias),
      disponivel:
        produto.disponivel !== undefined ? produto.disponivel : produto.ativo,
      permite_insumos: produto.permite_insumos || false,
      tipo: produto.tipo || "Produto",
      setor_impressao: produto.setor_impressao || "cozinha",
      pontos_fidelidade: produto.pontos_fidelidade ?? 1,
      variacoes_ativas: produto.variacoes_ativas || false,
      variacoes_json: produto.variacoes_json || "",
    });

    setVariacoes(parseVariacoes(produto.variacoes_json));
    setModalOpen(true);
  }

  function update(key: keyof Produto, value: any) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleCategoriaChange(value: string) {
    const categoria = categorias.find((cat) => String(cat.Id || cat.id) === String(value));

    setForm((current) => ({
      ...current,
      categoria_id: value,
      categoria_nome: categoria?.nome || categoria?.name || "",
    }));
  }

  function adicionarVariacao() {
    setVariacoes((current) => [...current, criarVariacaoVazia()]);
    setForm((current) => ({ ...current, variacoes_ativas: true }));
  }

  function atualizarVariacao(id: string, key: keyof VariacaoProduto, value: any) {
    setVariacoes((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  }

  function removerVariacao(id: string) {
    setVariacoes((current) => current.filter((item) => item.id !== id));
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();

    try {
      setSalvando(true);
      setErro("");

      const categoria = categorias.find(
        (cat) => String(cat.Id || cat.id) === String(form.categoria_id)
      );

      const produtoIdFinal = form.produto_id || criarProdutoId(empresaId);
      const disponivelFinal = isAtivo(form.disponivel);
      const permiteInsumosFinal = isAtivo(form.permite_insumos);
      const temVariacoes =
        isAtivo(form.variacoes_ativas) &&
        variacoes.some((item) => item.nome && Number(item.preco || 0) >= 0);

      const payload: any = {
        empresa_id: Number(empresaId),
        produto_id: produtoIdFinal,
        nome: form.nome || "",
        descricao: form.descricao || "",
        preco: Number(form.preco || 0),
        imagem_url: form.imagem_url || "",
        categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
        categoria_nome: categoria?.nome || categoria?.name || form.categoria_nome || "",
        disponivel: disponivelFinal,
        permite_insumos: permiteInsumosFinal,
        tipo: form.tipo || "Produto",
        setor_impressao: form.setor_impressao || "cozinha",
        pontos_fidelidade:
          form.pontos_fidelidade === null || form.pontos_fidelidade === ""
            ? null
            : Number(form.pontos_fidelidade || 0),
        variacoes_ativas: temVariacoes,
        variacoes_json: temVariacoes ? stringifyVariacoes(variacoes) : null,
        atualizado_em: new Date().toISOString(),
      };

      if (editando?.Id) {
        const res = await fetch(`${API}/api/db/produtos_cardapio/${editando.Id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || data?.message || "Erro ao atualizar produto.");
        }
      } else {
        payload.criado_em = new Date().toISOString();

        const res = await fetch(`${API}/api/db/produtos_cardapio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || data?.message || "Erro ao criar produto.");
        }
      }

      setModalOpen(false);
      await carregar();
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(produto: Produto) {
    if (!produto.Id) return;
    if (!confirm(`Excluir produto ${produto.nome}?`)) return;

    await fetch(`${API}/api/db/produtos_cardapio/${produto.Id}`, {
      method: "DELETE",
    });

    await carregar();
  }

  return (
    <section className="space-y-6 text-white">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-black">Produtos</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Cadastre produtos, adicionais, combos, insumos e bebidas. A imagem pode ser por link ou upload no MinIO.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              className="bg-transparent text-sm outline-none placeholder:text-zinc-500"
            />
          </div>

          <button
            onClick={carregar}
            type="button"
            className="rounded-2xl bg-white/10 px-4 py-3 font-black hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={abrirNovo}
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black hover:bg-emerald-300"
          >
            <Plus className="h-4 w-4" /> Novo cadastro
          </button>
        </div>
      </header>

      {erro && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtrados.map((produto) => {
          const disponivel = isAtivo(
            produto.disponivel !== undefined ? produto.disponivel : produto.ativo
          );

          return (
            <article
              key={produto.Id}
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]"
            >
              <div className="h-48 bg-black/30">
                {produto.imagem_url ? (
                  <img
                    src={produto.imagem_url}
                    alt={produto.nome}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-600">
                    Sem imagem
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
                          disponivel
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-red-500/10 text-red-300"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            disponivel ? "bg-emerald-400" : "bg-red-500"
                          }`}
                        />
                        {disponivel ? "Ativo" : "Inativo"}
                      </span>

                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-zinc-300">
                        {produto.tipo || "Produto"}
                      </span>
                    </div>

                    <h2 className="text-xl font-black">{produto.nome}</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {getCategoriaNome(produto, categorias)}
                    </p>

                    {produto.produto_id && (
                      <p className="mt-1 text-xs text-zinc-600">
                        ID produto: {produto.produto_id}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <strong className="text-emerald-300">{money(produto.preco)}</strong>
                    {isAtivo(produto.variacoes_ativas) &&
                      parseVariacoes(produto.variacoes_json).filter((v) => isAtivo(v.ativo))
                        .length > 0 && (
                        <p className="mt-1 text-xs font-bold text-amber-300">
                          Com variações
                        </p>
                      )}
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-zinc-400">
                  {produto.descricao}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => abrirEditar(produto)}
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black hover:bg-white/20"
                  >
                    <Edit3 className="h-4 w-4" /> Editar
                  </button>

                  <button
                    onClick={() => excluir(produto)}
                    type="button"
                    className="flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 hover:bg-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={salvar}
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="text-2xl font-black">
                  {editando ? "Editar cadastro" : "Novo cadastro"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Produto, adicional, combo, insumo ou bebida.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-2xl bg-white/10 p-3"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 xl:grid-cols-[1fr_.85fr]">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-[1fr_.55fr]">
                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        Nome
                      </span>
                      <input
                        value={form.nome || ""}
                        onChange={(e) => update("nome", e.target.value)}
                        required
                        className="input-admin"
                      />
                    </label>

                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        Tipo
                      </span>
                      <select
                        value={form.tipo || "Produto"}
                        onChange={(e) => update("tipo", e.target.value)}
                        className="input-admin select-admin"
                      >
                        {TIPOS_PRODUTO.map((tipo) => (
                          <option className="option-admin" key={tipo} value={tipo}>
                            {tipo}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    <span className="mb-2 block text-sm font-bold text-zinc-400">
                      Descrição
                    </span>
                    <textarea
                      value={form.descricao || ""}
                      onChange={(e) => update("descricao", e.target.value)}
                      className="input-admin min-h-24"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        Preço
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={form.preco || ""}
                        onChange={(e) => update("preco", e.target.value)}
                        className="input-admin"
                      />
                    </label>

                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        Pontos fidelidade
                      </span>
                      <input
                        type="number"
                        value={form.pontos_fidelidade ?? ""}
                        onChange={(e) => update("pontos_fidelidade", e.target.value)}
                        className="input-admin"
                      />
                    </label>

                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        ID único produto
                      </span>
                      <div className="flex gap-2">
                        <input
                          value={String(form.produto_id || "")}
                          onChange={(e) => update("produto_id", e.target.value)}
                          className="input-admin"
                        />
                        <button
                          type="button"
                          onClick={() => update("produto_id", criarProdutoId(empresaId))}
                          className="rounded-2xl bg-white/10 px-4 text-xs font-black hover:bg-white/20"
                        >
                          Gerar
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        Categoria
                      </span>
                      <select
                        value={String(form.categoria_id || "")}
                        onChange={(e) => handleCategoriaChange(e.target.value)}
                        className="input-admin select-admin"
                      >
                        <option className="option-admin" value="">
                          Sem categoria
                        </option>
                        {categorias.map((cat) => (
                          <option className="option-admin" key={cat.Id || cat.id} value={cat.Id || cat.id}>
                            {cat.nome || cat.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="mb-2 block text-sm font-bold text-zinc-400">
                        Setor impressão
                      </span>
                      <select
                        value={form.setor_impressao || "cozinha"}
                        onChange={(e) => update("setor_impressao", e.target.value)}
                        className="input-admin select-admin"
                      >
                        <option className="option-admin" value="cozinha">
                          Cozinha
                        </option>
                        <option className="option-admin" value="bar">
                          Bar/Bebidas
                        </option>
                        <option className="option-admin" value="producao">
                          Produção
                        </option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div>
                        <span className="font-black text-white">Cadastro ativo</span>
                        <p className="mt-1 text-xs text-zinc-500">
                          Atualiza a coluna <strong>disponivel</strong>.
                        </p>
                      </div>

                      <input
                        type="checkbox"
                        checked={isAtivo(form.disponivel)}
                        onChange={(e) => update("disponivel", e.target.checked)}
                        className="h-5 w-5"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div>
                        <span className="font-black text-white">
                          Permite adicional?
                        </span>
                        <p className="mt-1 text-xs text-zinc-500">
                          Atualiza a coluna <strong>permite_insumos</strong>.
                        </p>
                      </div>

                      <input
                        type="checkbox"
                        checked={isAtivo(form.permite_insumos)}
                        onChange={(e) => update("permite_insumos", e.target.checked)}
                        className="h-5 w-5"
                      />
                    </label>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black text-white">
                          Variações de tamanho/prato
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          Opcional. Só aparece no cardápio quando estiver ativo e houver variações cadastradas.
                        </p>
                      </div>

                      <label className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                        <input
                          type="checkbox"
                          checked={isAtivo(form.variacoes_ativas)}
                          onChange={(e) => update("variacoes_ativas", e.target.checked)}
                        />
                        Ativo
                      </label>
                    </div>

                    <div className="mt-4 space-y-3">
                      {variacoes.map((variacao) => (
                        <div
                          key={variacao.id}
                          className="rounded-2xl border border-white/10 bg-black/30 p-3"
                        >
                          <div className="grid gap-3 md:grid-cols-[1fr_.55fr_auto]">
                            <input
                              value={variacao.nome}
                              onChange={(e) =>
                                atualizarVariacao(variacao.id, "nome", e.target.value)
                              }
                              placeholder="Ex: P (300g)"
                              className="input-admin"
                            />

                            <input
                              type="number"
                              step="0.01"
                              value={variacao.preco}
                              onChange={(e) =>
                                atualizarVariacao(variacao.id, "preco", e.target.value)
                              }
                              placeholder="Valor"
                              className="input-admin"
                            />

                            <button
                              type="button"
                              onClick={() => removerVariacao(variacao.id)}
                              className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 hover:bg-red-500/20"
                            >
                              Remover
                            </button>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                            <input
                              value={variacao.descricao || ""}
                              onChange={(e) =>
                                atualizarVariacao(variacao.id, "descricao", e.target.value)
                              }
                              placeholder="Descrição opcional. Ex: serve 1 pessoa"
                              className="input-admin"
                            />

                            <label className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-300">
                              <input
                                type="checkbox"
                                checked={isAtivo(variacao.ativo)}
                                onChange={(e) =>
                                  atualizarVariacao(variacao.id, "ativo", e.target.checked)
                                }
                              />
                              Visível
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={adicionarVariacao}
                      className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/20"
                    >
                      + Adicionar variação
                    </button>
                  </div>
                </div>

                <MinioUploadField
                  empresaId={empresaId}
                  slug={slug}
                  tipo="produto"
                  label="Imagem do cadastro"
                  value={form.imagem_url || ""}
                  table="produtos_cardapio"
                  recordId={editando?.Id || ""}
                  field="imagem_url"
                  onChange={(url) => update("imagem_url", url)}
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 p-5">
              <button
                type="submit"
                disabled={salvando}
                className="flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 font-black text-black hover:bg-emerald-300 disabled:opacity-60"
              >
                {salvando ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {salvando ? "Salvando..." : "Salvar cadastro"}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx global>{`
        .input-admin {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          padding: 0.85rem 1rem;
          color: white;
          outline: none;
        }

        .input-admin:focus {
          border-color: rgba(52, 211, 153, 0.8);
        }

        .select-admin {
          color-scheme: dark;
          background: #18181b !important;
          color: #fff !important;
        }

        .select-admin option,
        .option-admin {
          background: #18181b !important;
          color: #fff !important;
        }
      `}</style>
    </section>
  );
}
