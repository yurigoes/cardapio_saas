"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, FolderOpen, Plus, Search, X, Edit2, Trash2,
  ToggleLeft, ToggleRight, Star, Clock, ChevronDown, Upload, ImageOff,
} from "lucide-react";

interface Categoria {
  id:            string;
  nome:          string;
  descricao:     string | null;
  ordem:         number;
  ativo:         boolean;
  total_produtos: number;
}

interface Produto {
  id:                string;
  nome:              string;
  descricao:         string | null;
  preco:             number;
  preco_custo:       number | null;
  disponivel:        boolean;
  destaque:          boolean;
  tempo_preparo:     number | null;
  imagem_url:        string | null;
  tipo:              string;
  categoria_id:      string | null;
  categoria_nome:    string | null;
  pontos_fidelidade: number | null;
}

type Tab = "produtos" | "categorias";

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

const TIPOS = ["produto","combo","bebida","sobremesa","porcao"] as const;
const TIPO_LABEL: Record<string, string> = {
  produto: "Produto", combo: "Combo", bebida: "Bebida",
  sobremesa: "Sobremesa", porcao: "Porção",
};

export default function CardapioPage() {
  const [tab, setTab]               = useState<Tab>("produtos");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [catFiltro, setCatFiltro]   = useState("");
  const [loading, setLoading]       = useState(true);

  const [modalCat, setModalCat]     = useState(false);
  const [modalProd, setModalProd]   = useState(false);
  const [editCat, setEditCat]       = useState<Categoria | null>(null);
  const [editProd, setEditProd]     = useState<Produto | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [uploadingImg, setUploadingImg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formCat, setFormCat] = useState({ nome: "", descricao: "", ordem: 0, ativo: true });
  const [formProd, setFormProd] = useState({
    nome: "", descricao: "", preco: 0, preco_custo: "",
    disponivel: true, destaque: false, tempo_preparo: "",
    imagem_url: "", tipo: "produto", categoria_id: "",
    pontos_fidelidade: "",
  });

  const fetchCategorias = useCallback(async () => {
    const res  = await fetch("/api/painel/categorias", { headers: authHeader() });
    const data = await res.json();
    if (data.success) setCategorias(data.data);
  }, []);

  const fetchProdutos = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), limit: "20",
        ...(search    ? { q: search }                       : {}),
        ...(catFiltro ? { categoria_id: catFiltro }         : {}),
      });
      const res  = await fetch(`/api/painel/produtos?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (data.success) {
        setProdutos(data.data);
        setTotal(data.meta?.pagination?.total ?? 0);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }, [search, catFiltro]);

  useEffect(() => { fetchCategorias(); }, [fetchCategorias]);
  useEffect(() => {
    const t = setTimeout(() => fetchProdutos(1), 300);
    return () => clearTimeout(t);
  }, [fetchProdutos]);

  // ── Categoria CRUD ──────────────────────────────────────────────
  function openNewCat() {
    setEditCat(null);
    setFormCat({ nome: "", descricao: "", ordem: categorias.length, ativo: true });
    setError("");
    setModalCat(true);
  }

  function openEditCat(cat: Categoria) {
    setEditCat(cat);
    setFormCat({ nome: cat.nome, descricao: cat.descricao ?? "", ordem: cat.ordem, ativo: cat.ativo });
    setError("");
    setModalCat(true);
  }

  async function saveCat(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const url    = editCat ? `/api/painel/categorias/${editCat.id}` : "/api/painel/categorias";
      const method = editCat ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ ...formCat, descricao: formCat.descricao || undefined }),
      });
      const data = await res.json();
      if (data.success) { setModalCat(false); fetchCategorias(); }
      else setError(data.error ?? "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function deleteCat(id: string) {
    if (!confirm("Excluir esta categoria? Os produtos não serão excluídos.")) return;
    await fetch(`/api/painel/categorias/${id}`, { method: "DELETE", headers: authHeader() });
    fetchCategorias();
  }

  // ── Produto CRUD ─────────────────────────────────────────────────
  function openNewProd() {
    setEditProd(null);
    setFormProd({ nome: "", descricao: "", preco: 0, preco_custo: "", disponivel: true, destaque: false, tempo_preparo: "", imagem_url: "", tipo: "produto", categoria_id: "", pontos_fidelidade: "" });
    setError("");
    setModalProd(true);
  }

  function openEditProd(prod: Produto) {
    setEditProd(prod);
    setFormProd({
      nome:              prod.nome,
      descricao:         prod.descricao  ?? "",
      preco:             prod.preco,
      preco_custo:       prod.preco_custo != null ? String(prod.preco_custo) : "",
      disponivel:        prod.disponivel,
      destaque:          prod.destaque,
      tempo_preparo:     prod.tempo_preparo != null ? String(prod.tempo_preparo) : "",
      imagem_url:        prod.imagem_url  ?? "",
      tipo:              prod.tipo,
      categoria_id:      prod.categoria_id ?? "",
      pontos_fidelidade: prod.pontos_fidelidade != null ? String(prod.pontos_fidelidade) : "",
    });
    setError("");
    setModalProd(true);
  }

  async function saveProd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const body = {
        ...formProd,
        preco:             Number(formProd.preco),
        preco_custo:       formProd.preco_custo       ? Number(formProd.preco_custo)       : undefined,
        tempo_preparo:     formProd.tempo_preparo     ? Number(formProd.tempo_preparo)     : undefined,
        pontos_fidelidade: formProd.pontos_fidelidade ? Number(formProd.pontos_fidelidade) : 0,
        imagem_url:        formProd.imagem_url        || undefined,
        categoria_id:      formProd.categoria_id      || undefined,
        descricao:         formProd.descricao         || undefined,
      };
      const url    = editProd ? `/api/painel/produtos/${editProd.id}` : "/api/painel/produtos";
      const method = editProd ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { setModalProd(false); fetchProdutos(page); }
      else setError(data.error ?? "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function toggleDisponivel(prod: Produto) {
    await fetch(`/api/painel/produtos/${prod.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body:    JSON.stringify({ disponivel: !prod.disponivel }),
    });
    fetchProdutos(page);
  }

  async function deleteProd(id: string) {
    if (!confirm("Excluir este produto?")) return;
    await fetch(`/api/painel/produtos/${id}`, { method: "DELETE", headers: authHeader() });
    fetchProdutos(page);
  }

  async function handleImageUpload(file: File) {
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("pasta", "produtos");
      const res  = await fetch("/api/upload", { method: "POST", headers: authHeader(), body: fd });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setFormProd(f => ({ ...f, imagem_url: data.data.url }));
      } else {
        setError(data.error ?? "Falha no upload da imagem");
      }
    } catch {
      setError("Erro ao enviar imagem");
    } finally {
      setUploadingImg(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cardápio</h1>
          <p className="mt-1 text-sm text-slate-400">
            {total} produto{total !== 1 ? "s" : ""} · {categorias.length} categoria{categorias.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={tab === "produtos" ? openNewProd : openNewCat}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 transition"
        >
          <Plus className="h-4 w-4" />
          {tab === "produtos" ? "Novo Produto" : "Nova Categoria"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {([["produtos", ShoppingBag, "Produtos"], ["categorias", FolderOpen, "Categorias"]] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === key ? "bg-brand/20 text-brand" : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── ABA PRODUTOS ── */}
      {tab === "produtos" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={catFiltro}
                onChange={e => setCatFiltro(e.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-white/5 py-2.5 pl-4 pr-8 text-sm text-white focus:border-brand/50 focus:outline-none"
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Grid de produtos */}
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          ) : produtos.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              Nenhum produto encontrado
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {produtos.map((prod, i) => (
                <motion.div
                  key={prod.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`rounded-2xl border bg-white/5 p-4 transition ${
                    prod.disponivel ? "border-white/10" : "border-white/5 opacity-60"
                  }`}
                >
                  {prod.imagem_url && (
                    <img
                      src={prod.imagem_url}
                      alt={prod.nome}
                      className="mb-3 h-32 w-full rounded-xl object-cover"
                    />
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {prod.destaque && <Star className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                        <p className="font-medium text-white truncate">{prod.nome}</p>
                      </div>
                      {prod.categoria_nome && (
                        <p className="text-xs text-slate-500 mt-0.5">{prod.categoria_nome}</p>
                      )}
                    </div>
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-slate-300 flex-shrink-0">
                      {TIPO_LABEL[prod.tipo] ?? prod.tipo}
                    </span>
                  </div>

                  {prod.descricao && (
                    <p className="mt-2 text-xs text-slate-400 line-clamp-2">{prod.descricao}</p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold text-white">
                        {Number(prod.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {prod.tempo_preparo != null && (
                          <p className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            {prod.tempo_preparo} min
                          </p>
                        )}
                        {prod.pontos_fidelidade != null && prod.pontos_fidelidade > 0 && (
                          <p className="flex items-center gap-1 text-xs text-amber-400">
                            <Star className="h-3 w-3" />
                            {prod.pontos_fidelidade} pts
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleDisponivel(prod)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"
                        title={prod.disponivel ? "Desativar" : "Ativar"}
                      >
                        {prod.disponivel
                          ? <ToggleRight className="h-4 w-4 text-brand" />
                          : <ToggleLeft  className="h-4 w-4" />
                        }
                      </button>
                      <button
                        onClick={() => openEditProd(prod)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteProd(prod.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ABA CATEGORIAS ── */}
      {tab === "categorias" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {categorias.length === 0 ? (
            <p className="py-12 text-center text-slate-500">Nenhuma categoria criada ainda</p>
          ) : (
            <div className="divide-y divide-white/5">
              {categorias.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500 w-5 text-right">{cat.ordem}</span>
                    <div>
                      <p className="font-medium text-white">{cat.nome}</p>
                      {cat.descricao && (
                        <p className="text-xs text-slate-400 mt-0.5">{cat.descricao}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{cat.total_produtos} produto{Number(cat.total_produtos) !== 1 ? "s" : ""}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cat.ativo ? "bg-brand/15 text-brand" : "bg-slate-500/15 text-slate-400"}`}>
                      {cat.ativo ? "Ativa" : "Inativa"}
                    </span>
                    <button onClick={() => openEditCat(cat)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteCat(cat.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CATEGORIA ── */}
      <AnimatePresence>
        {modalCat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalCat(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">{editCat ? "Editar Categoria" : "Nova Categoria"}</h2>
                <button onClick={() => setModalCat(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"><X className="h-5 w-5" /></button>
              </div>
              {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
              <form onSubmit={saveCat} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                  <input value={formCat.nome} onChange={e => setFormCat(f => ({ ...f, nome: e.target.value }))}
                    required placeholder="Ex: Entradas"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrição</label>
                  <input value={formCat.descricao} onChange={e => setFormCat(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Opcional"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Ordem</label>
                  <input type="number" min={0} value={formCat.ordem} onChange={e => setFormCat(f => ({ ...f, ordem: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none" />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="cat-ativo" checked={formCat.ativo} onChange={e => setFormCat(f => ({ ...f, ativo: e.target.checked }))}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand" />
                  <label htmlFor="cat-ativo" className="text-sm text-slate-300">Categoria ativa</label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setModalCat(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition">
                    {saving ? "Salvando..." : editCat ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL PRODUTO ── */}
      <AnimatePresence>
        {modalProd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalProd(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">{editProd ? "Editar Produto" : "Novo Produto"}</h2>
                <button onClick={() => setModalProd(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"><X className="h-5 w-5" /></button>
              </div>
              {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
              <form onSubmit={saveProd} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                  <input value={formProd.nome} onChange={e => setFormProd(f => ({ ...f, nome: e.target.value }))}
                    required placeholder="Ex: X-Burguer"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrição</label>
                  <textarea value={formProd.descricao} onChange={e => setFormProd(f => ({ ...f, descricao: e.target.value }))}
                    rows={2} placeholder="Ingredientes, detalhes..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Preço de Venda (R$) *</label>
                    <input type="number" min={0} step={0.01} value={formProd.preco}
                      onChange={e => setFormProd(f => ({ ...f, preco: Number(e.target.value) }))} required
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Preço de Custo (R$)</label>
                    <input type="number" min={0} step={0.01} value={formProd.preco_custo}
                      onChange={e => setFormProd(f => ({ ...f, preco_custo: e.target.value }))}
                      placeholder="Opcional"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Categoria</label>
                    <select value={formProd.categoria_id} onChange={e => setFormProd(f => ({ ...f, categoria_id: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none">
                      <option value="">Sem categoria</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipo</label>
                    <select value={formProd.tipo} onChange={e => setFormProd(f => ({ ...f, tipo: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none">
                      {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Tempo de Preparo (min)</label>
                    <input type="number" min={1} value={formProd.tempo_preparo}
                      onChange={e => setFormProd(f => ({ ...f, tempo_preparo: e.target.value }))}
                      placeholder="Ex: 15"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Pontos Fidelidade
                      <span className="ml-1 text-slate-500">(por compra)</span>
                    </label>
                    <input type="number" min={0} value={formProd.pontos_fidelidade}
                      onChange={e => setFormProd(f => ({ ...f, pontos_fidelidade: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                </div>

                {/* Image upload */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Imagem do Produto</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
                  />
                  {formProd.imagem_url ? (
                    <div className="relative group">
                      <img
                        src={formProd.imagem_url}
                        alt="Preview"
                        className="h-36 w-full rounded-xl object-cover border border-white/10"
                      />
                      <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImg}
                          className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Trocar
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormProd(f => ({ ...f, imagem_url: "" }))}
                          className="flex items-center gap-1.5 rounded-lg bg-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/50 transition"
                        >
                          <ImageOff className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImg}
                      className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/5 text-slate-400 hover:border-brand/40 hover:text-brand transition disabled:opacity-50"
                    >
                      {uploadingImg ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                      ) : (
                        <>
                          <Upload className="h-5 w-5" />
                          <span className="text-xs">Clique para enviar imagem</span>
                          <span className="text-xs text-slate-500">JPG, PNG, WebP — máx. 5 MB</span>
                        </>
                      )}
                    </button>
                  )}
                  {/* URL fallback */}
                  <input
                    value={formProd.imagem_url}
                    onChange={e => setFormProd(f => ({ ...f, imagem_url: e.target.value }))}
                    placeholder="Ou cole a URL da imagem aqui..."
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none"
                  />
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formProd.disponivel}
                      onChange={e => setFormProd(f => ({ ...f, disponivel: e.target.checked }))}
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand" />
                    <span className="text-sm text-slate-300">Disponível</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formProd.destaque}
                      onChange={e => setFormProd(f => ({ ...f, destaque: e.target.checked }))}
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand" />
                    <span className="text-sm text-slate-300">Destaque</span>
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setModalProd(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition">
                    {saving ? "Salvando..." : editProd ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
