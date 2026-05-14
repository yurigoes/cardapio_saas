"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, X, Users, ShoppingBag, Check, LayoutGrid, Calendar, Pencil, Trash2, Power } from "lucide-react";
import { MODULOS_REGISTRY } from "@/lib/modules/registry";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Plano {
  id:             string;
  nome:           string;
  descricao:      string | null;
  preco:          number;
  periodo:        string;
  modulos:        string[];
  limites:        { usuarios: number; produtos: number; mesas: number; pedidos_mes: number };
  ativo:          boolean;
  destaque:       boolean;
  total_empresas: number;
}

function getToken() {
  return localStorage.getItem("access_token") ?? "";
}

const MODULO_CATEGORIAS = Object.entries(
  Object.values(MODULOS_REGISTRY).reduce<Record<string, typeof MODULOS_REGISTRY[keyof typeof MODULOS_REGISTRY][]>>(
    (acc, m) => { (acc[m.categoria] ??= []).push(m); return acc; },
    {}
  )
);

const PERIODO_LABELS: Record<string, string> = {
  mensal: "Mensal",
  anual:  "Anual",
  unico:  "Pagamento único",
};

const DEFAULT_FORM = {
  nome:      "",
  descricao: "",
  preco:     0,
  periodo:   "mensal" as "mensal" | "anual" | "unico",
  limites: {
    usuarios:    5,
    produtos:    100,
    mesas:       20,
    pedidos_mes: 1000,
  },
  modulos:  [] as string[],
  ativo:    true,
  destaque: false,
};

export default function PlanosPage() {
  const [planos, setPlanos]       = useState<Plano[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [form, setForm]           = useState(DEFAULT_FORM);

  async function fetchPlanos() {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/planos", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setPlanos(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlanos(); }, []);

  /** Edita: carrega plano no modal pra editar */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  function abrirEdicao(p: Plano) {
    setForm({
      nome:      p.nome,
      descricao: p.descricao ?? "",
      preco:     Number(p.preco) || 0,
      periodo:   (p.periodo as "mensal" | "anual" | "unico") ?? "mensal",
      limites:   { ...DEFAULT_FORM.limites, ...(p.limites ?? {}) },
      modulos:   p.modulos ?? [],
      ativo:     p.ativo,
      destaque:  p.destaque,
    });
    setEditandoId(p.id);
    setShowModal(true);
  }
  function abrirNovo() {
    setForm(DEFAULT_FORM);
    setEditandoId(null);
    setShowModal(true);
  }

  /** Toggle ativo/inativo (rápido, sem abrir modal) */
  async function toggleAtivo(p: Plano) {
    const r = await fetch(`/api/admin/planos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ativo: !p.ativo }),
    });
    const d = await r.json();
    if (d.success) fetchPlanos();
    else await alertar({ titulo: "Falha", mensagem: String(d.error ?? ""), tipo: "perigo" });
  }

  /** Excluir — backend protege (vira inativo se tem empresa) */
  async function excluir(p: Plano) {
    if (!await confirmar({ titulo: `Excluir plano "${p.nome}"?`, mensagem: "Se houver empresas usando, ele será apenas DESATIVADO (não excluído).", okLabel: "Excluir", perigo: true })) return;
    const r = await fetch(`/api/admin/planos/${p.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const d = await r.json();
    if (d.success) {
      await alertar({ titulo: "Plano excluído", tipo: "sucesso" });
      fetchPlanos();
    } else if (d.code === "CONFLICT") {
      await alertar({ titulo: String(d.error ?? "Conflito"), mensagem: d.data?.empresas_vinculadas ? `${d.data.empresas_vinculadas} empresa(s) vinculadas.` : "", tipo: "alerta" });
      fetchPlanos();
    } else {
      await alertar({ titulo: "Falha", mensagem: String(d.error ?? ""), tipo: "perigo" });
    }
  }

  function toggleModulo(id: string) {
    setForm(f => ({
      ...f,
      modulos: f.modulos.includes(id)
        ? f.modulos.filter(m => m !== id)
        : [...f.modulos, id],
    }));
  }

  function setLimite(key: keyof typeof DEFAULT_FORM["limites"], value: number) {
    setForm(f => ({ ...f, limites: { ...f.limites, [key]: value } }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url    = editandoId ? `/api/admin/planos/${editandoId}` : "/api/admin/planos";
      const method = editandoId ? "PATCH" : "POST";
      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify(form),
      });
      const data = await res.json();

      if (data.success) {
        setShowModal(false);
        setEditandoId(null);
        setForm(DEFAULT_FORM);
        fetchPlanos();
      } else {
        setError(data.error ?? `Erro ao ${editandoId ? "editar" : "criar"} plano`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Planos</h1>
          <p className="mt-1 text-sm text-slate-400">
            {planos.length} plano{planos.length !== 1 ? "s" : ""} cadastrado{planos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 transition"
        >
          <Plus className="h-4 w-4" />
          Novo Plano
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planos.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500">
              Nenhum plano cadastrado ainda
            </div>
          )}
          {planos.map((plano, i) => {
            const limites = plano.limites ?? {};
            return (
              <motion.div
                key={plano.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`rounded-2xl border bg-white/5 p-6 space-y-4 ${plano.destaque ? "border-emerald-500/40" : "border-white/10"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
                      <Package className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{plano.nome}</p>
                      {plano.descricao && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{plano.descricao}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${plano.ativo ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                      {plano.ativo ? "Ativo" : "Inativo"}
                    </span>
                    {plano.destaque && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">Destaque</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-2xl font-bold text-white">
                    {plano.preco === 0 ? "Grátis" : plano.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{PERIODO_LABELS[plano.periodo] ?? plano.periodo}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {limites.usuarios === -1 ? "Usuários ilimitados" : `Até ${limites.usuarios} usuários`}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {limites.produtos === -1 ? "Produtos ilimitados" : `Até ${limites.produtos} produtos`}
                  </span>
                  <span className="flex items-center gap-1">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    {limites.mesas === -1 ? "Mesas ilimitadas" : `Até ${limites.mesas} mesas`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {limites.pedidos_mes === -1 ? "Pedidos ilimitados" : `${limites.pedidos_mes}/mês`}
                  </span>
                </div>

                <div className="border-t border-white/5 pt-3">
                  <p className="text-xs text-slate-500 mb-2">{plano.modulos?.length ?? 0} módulos incluídos</p>
                  <div className="flex flex-wrap gap-1">
                    {(plano.modulos ?? []).slice(0, 5).map(m => (
                      <span key={m} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        {MODULOS_REGISTRY[m as keyof typeof MODULOS_REGISTRY]?.nome ?? m}
                      </span>
                    ))}
                    {(plano.modulos ?? []).length > 5 && (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                        +{plano.modulos.length - 5} mais
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3 text-xs text-slate-400">
                  {Number(plano.total_empresas)} empresa{Number(plano.total_empresas) !== 1 ? "s" : ""} usando
                </div>

                {/* Toolbar de ações */}
                <div className="border-t border-white/5 pt-3 flex gap-2">
                  <button onClick={() => abrirEdicao(plano)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button onClick={() => toggleAtivo(plano)} title={plano.ativo ? "Desativar" : "Ativar"}
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5">
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => excluir(plano)} title="Excluir (vira inativo se tiver empresa)"
                    className="inline-flex items-center justify-center rounded-lg border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Novo Plano */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
            >
              {/* Sticky header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-slate-900 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">Novo Plano</h2>
                <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-6 space-y-6">
                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
                )}

                {/* Dados básicos */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Informações do Plano</p>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                    <input
                      value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                      required placeholder="Ex: Plano Básico"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrição</label>
                    <textarea
                      value={form.descricao}
                      onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                      rows={2} placeholder="Descrição do plano..."
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Preço (R$)</label>
                      <input
                        type="number" min={0} step={0.01}
                        value={form.preco}
                        onChange={e => setForm(f => ({ ...f, preco: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Período</label>
                      <select
                        value={form.periodo}
                        onChange={e => setForm(f => ({ ...f, periodo: e.target.value as typeof form.periodo }))}
                        className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                      >
                        <option value="mensal">Mensal</option>
                        <option value="anual">Anual</option>
                        <option value="unico">Pagamento único</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Limites */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Limites <span className="text-slate-600 normal-case font-normal">(-1 = ilimitado)</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { key: "usuarios",    label: "Máx. Usuários" },
                      { key: "produtos",    label: "Máx. Produtos" },
                      { key: "mesas",       label: "Máx. Mesas" },
                      { key: "pedidos_mes", label: "Pedidos/mês" },
                    ] as { key: keyof typeof DEFAULT_FORM["limites"]; label: string }[]).map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
                        <input
                          type="number" min={-1}
                          value={form.limites[key]}
                          onChange={e => setLimite(key, Number(e.target.value))}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Módulos */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Módulos Incluídos ({form.modulos.length} selecionados)
                    </p>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, modulos: Object.keys(MODULOS_REGISTRY) }))}
                        className="rounded-lg px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 transition">
                        Todos
                      </button>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, modulos: [] }))}
                        className="rounded-lg px-2.5 py-1 text-xs text-slate-400 hover:bg-white/5 transition">
                        Limpar
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-64 overflow-y-auto pr-1 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    {MODULO_CATEGORIAS.map(([categoria, mods]) => (
                      <div key={categoria}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{categoria}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {mods.map(mod => {
                            const ativo = form.modulos.includes(mod.id);
                            return (
                              <button
                                key={mod.id}
                                type="button"
                                onClick={() => toggleModulo(mod.id)}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                                  ativo
                                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                    : "border border-white/5 bg-white/5 text-slate-400 hover:border-white/10 hover:text-white"
                                }`}
                              >
                                <Check className={`h-3 w-3 flex-shrink-0 ${ativo ? "opacity-100" : "opacity-0"}`} />
                                <span className="truncate">{mod.nome}</span>
                                {mod.premium && <span className="ml-auto flex-shrink-0 text-amber-400">★</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flags */}
                <div className="flex gap-6">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                      className="h-4 w-4 rounded border-white/20 bg-white/10 accent-emerald-500"
                    />
                    <span className="text-sm text-slate-300">Plano ativo</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.destaque}
                      onChange={e => setForm(f => ({ ...f, destaque: e.target.checked }))}
                      className="h-4 w-4 rounded border-white/20 bg-white/10 accent-emerald-500"
                    />
                    <span className="text-sm text-slate-300">Destacado</span>
                  </label>
                </div>

                <div className="flex gap-3 pt-2 border-t border-white/5">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-50 transition">
                    {saving ? "Criando..." : "Criar Plano"}
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
