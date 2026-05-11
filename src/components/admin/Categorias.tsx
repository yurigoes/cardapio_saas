"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Search, Trash2, X } from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

type Categoria = {
  Id?: number;
  empresa_id?: number;
  nome: string;
  descricao?: string;
  ativo?: boolean;
  ordem?: number;
};

const emptyCategoria: Categoria = {
  nome: "",
  descricao: "",
  ativo: true,
  ordem: 0
};

export default function Categorias({
  empresaId
}: {
  empresaId: string | number;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [categoriaAtual, setCategoriaAtual] =
    useState<Categoria>(emptyCategoria);
  const [salvando, setSalvando] = useState(false);

  async function loadCategorias() {
    setLoading(true);

    const res = await fetch(
      `${API}/api/db/categorias_cardapio?where=(empresa_id,eq,${empresaId})&limit=300`,
      { cache: "no-store" }
    );

    const data = await res.json();

    setCategorias(data.list || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCategorias();
  }, [empresaId]);

  const categoriasFiltradas = useMemo(() => {
    return categorias
      .filter((categoria) =>
        String(categoria.nome || "")
          .toLowerCase()
          .includes(busca.toLowerCase())
      )
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  }, [categorias, busca]);

  function abrirNova() {
    setCategoriaAtual({
      ...emptyCategoria,
      empresa_id: Number(empresaId)
    });
    setModalOpen(true);
  }

  function editarCategoria(categoria: Categoria) {
    setCategoriaAtual({
      ...emptyCategoria,
      ...categoria
    });
    setModalOpen(true);
  }

  async function salvarCategoria() {
    if (!categoriaAtual.nome.trim()) {
      alert("Informe o nome da categoria.");
      return;
    }

    setSalvando(true);

    const payload = {
      empresa_id: Number(empresaId),
      nome: categoriaAtual.nome,
      descricao: categoriaAtual.descricao || "",
      ativo: categoriaAtual.ativo !== false,
      ordem: Number(categoriaAtual.ordem || 0)
    };

    const isEdit = Boolean(categoriaAtual.Id);

    const url = isEdit
      ? `${API}/api/db/categorias_cardapio/${categoriaAtual.Id}`
      : `${API}/api/db/categorias_cardapio`;

    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    setSalvando(false);

    if (!res.ok) {
      const erro = await res.text();
      alert(`Erro ao salvar categoria: ${erro}`);
      return;
    }

    setModalOpen(false);
    await loadCategorias();
  }

  async function excluirCategoria(categoria: Categoria) {
    if (!categoria.Id) return;

    const ok = confirm(`Deseja excluir "${categoria.nome}"?`);

    if (!ok) return;

    const res = await fetch(`${API}/api/db/categorias_cardapio/${categoria.Id}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      const erro = await res.text();
      alert(`Erro ao excluir categoria: ${erro}`);
      return;
    }

    await loadCategorias();
  }

  async function toggleCategoria(categoria: Categoria) {
    if (!categoria.Id) return;

    const novoValor = !(categoria.ativo !== false);

    const res = await fetch(`${API}/api/db/categorias_cardapio/${categoria.Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ativo: novoValor
      })
    });

    if (!res.ok) {
      const erro = await res.text();
      alert(`Erro ao atualizar categoria: ${erro}`);
      return;
    }

    setCategorias((current) =>
      current.map((item) =>
        item.Id === categoria.Id ? { ...item, ativo: novoValor } : item
      )
    );
  }

  return (
    <div className="min-h-screen text-white">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p
            className="text-xs font-black uppercase tracking-[0.45em]"
            style={{ color: "var(--primary-color)" }}
          >
            Cardápio
          </p>

          <h1 className="font-serif text-4xl tracking-wide text-white">
            Categorias
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Organize seu cardápio em grupos como lanches, pizzas, bebidas e combos.
          </p>
        </div>

        <button
          onClick={abrirNova}
          className="flex items-center gap-2 rounded-2xl px-6 py-4 font-black text-black shadow-xl transition hover:scale-[1.02]"
          style={{
            background:
              "linear-gradient(135deg, var(--primary-color), #fff0b8)"
          }}
        >
          <Plus size={18} />
          Nova categoria
        </button>
      </div>

      <section className="mb-6">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4">
          <Search size={18} className="text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar categoria..."
            className="h-14 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </section>

      {loading ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center text-zinc-400">
          Carregando categorias...
        </div>
      ) : categoriasFiltradas.length === 0 ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center text-zinc-400">
          Nenhuma categoria encontrada.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3 lg:grid-cols-2">
          {categoriasFiltradas.map((categoria) => (
            <div
              key={categoria.Id}
              className="rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-zinc-900/80 to-black p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-serif text-2xl text-white">
                    {categoria.nome}
                  </h3>

                  <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
                    {categoria.descricao || "Sem descrição"}
                  </p>

                  <p className="mt-3 text-xs text-zinc-500">
                    Ordem: {categoria.ordem || 0}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    categoria.ativo !== false
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-red-400/10 text-red-400"
                  }`}
                >
                  {categoria.ativo !== false ? "Ativa" : "Inativa"}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <button
                  onClick={() => editarCategoria(categoria)}
                  className="rounded-xl border border-white/10 bg-black/50 p-3 text-white transition hover:border-white/30"
                  title="Editar"
                >
                  <Edit3 size={16} />
                </button>

                <button
                  onClick={() => toggleCategoria(categoria)}
                  className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10"
                >
                  {categoria.ativo !== false ? "Desativar" : "Ativar"}
                </button>

                <button
                  onClick={() => excluirCategoria(categoria)}
                  className="rounded-xl border border-red-500/40 bg-black/50 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={16} className="inline-block" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 px-4 backdrop-blur-xl">
          <div className="w-full max-w-xl rounded-[1.8rem] border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-serif text-2xl text-white">
                {categoriaAtual.Id ? "Editar categoria" : "Nova categoria"}
              </h2>

              <button
                onClick={() => setModalOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-zinc-300">Nome</span>
                <input
                  autoFocus
                  value={categoriaAtual.nome}
                  onChange={(e) =>
                    setCategoriaAtual((c) => ({ ...c, nome: e.target.value }))
                  }
                  className="h-14 rounded-2xl border border-white/10 bg-black px-4 outline-none"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-zinc-300">
                  Descrição
                </span>
                <textarea
                  value={categoriaAtual.descricao || ""}
                  onChange={(e) =>
                    setCategoriaAtual((c) => ({
                      ...c,
                      descricao: e.target.value
                    }))
                  }
                  className="min-h-24 rounded-2xl border border-white/10 bg-black p-4 outline-none"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-zinc-300">Ordem</span>
                <input
                  type="number"
                  value={categoriaAtual.ordem || 0}
                  onChange={(e) =>
                    setCategoriaAtual((c) => ({
                      ...c,
                      ordem: Number(e.target.value)
                    }))
                  }
                  className="h-14 rounded-2xl border border-white/10 bg-black px-4 outline-none"
                />
              </label>

              <button
                onClick={() =>
                  setCategoriaAtual((c) => ({
                    ...c,
                    ativo: !(c.ativo !== false)
                  }))
                }
                className="flex items-center gap-2"
              >
                <span
                  className={`h-6 w-11 rounded-full p-1 transition ${
                    categoriaAtual.ativo !== false
                      ? "bg-emerald-400"
                      : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-black transition ${
                      categoriaAtual.ativo !== false ? "translate-x-5" : ""
                    }`}
                  />
                </span>
                Categoria ativa
              </button>

              <button
                disabled={salvando}
                onClick={salvarCategoria}
                className="mt-3 rounded-2xl px-6 py-4 font-black text-black disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, var(--primary-color), #fff0b8)"
                }}
              >
                {salvando ? "Salvando..." : "Salvar categoria"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
