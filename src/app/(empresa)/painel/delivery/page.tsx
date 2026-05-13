"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bike, MapPin, Plus, Trash2, Edit2, X,
  Phone, Car, ToggleLeft, ToggleRight, AlertCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Motoboy {
  id:       string;
  nome:     string;
  telefone: string | null;
  veiculo:  string | null;
  placa:    string | null;
  status:   "disponivel" | "em_rota" | "inativo";
}

interface ZonaEntrega {
  id:             string;
  nome:           string;
  descricao?:     string | null;
  bairro?:        string | null;
  cep_inicio?:    string | null;
  cep_fim?:       string | null;
  valor_cobrado:  number;
  valor_motoboy:  number;
  taxa?:          number;             // legado
  tempo_min:      number | null;
  ativo:          boolean;
}

type Tab = "motoboys" | "zonas";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem("access_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

function formatBRL(v: number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<Motoboy["status"], string> = {
  disponivel: "Disponível",
  em_rota:    "Em rota",
  inativo:    "Inativo",
};

const STATUS_COLOR: Record<Motoboy["status"], string> = {
  disponivel: "bg-brand/15 text-brand",
  em_rota:    "bg-yellow-500/15 text-yellow-400",
  inativo:    "bg-slate-500/15 text-slate-400",
};

// ── Default forms ─────────────────────────────────────────────────────────────

const DEFAULT_MOTOBOY = { nome: "", telefone: "", veiculo: "", placa: "", status: "disponivel" as Motoboy["status"] };
const DEFAULT_ZONA = {
  nome: "", descricao: "",
  bairro: "", cep_inicio: "", cep_fim: "",
  valor_cobrado: "", valor_motoboy: "",
  tempo_min: "", ativo: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [tab, setTab]           = useState<Tab>("motoboys");
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [zonas, setZonas]       = useState<ZonaEntrega[]>([]);
  const [loading, setLoading]   = useState(true);
  const [apiOk, setApiOk]       = useState(true);

  // modal state
  const [modalMotoboy, setModalMotoboy] = useState(false);
  const [modalZona, setModalZona]       = useState(false);
  const [editMotoboy, setEditMotoboy]   = useState<Motoboy | null>(null);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");

  const [formMotoboy, setFormMotoboy] = useState(DEFAULT_MOTOBOY);
  const [formZona, setFormZona]       = useState(DEFAULT_ZONA);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchMotoboys = useCallback(async () => {
    try {
      const res  = await fetch("/api/painel/motoboys", { headers: authHeader() });
      if (res.status === 404) { setApiOk(false); return; }
      const data = await res.json();
      if (data.success) setMotoboys(data.data ?? []);
      setApiOk(true);
    } catch {
      setMotoboys([]);
    }
  }, []);

  const fetchZonas = useCallback(async () => {
    try {
      const res  = await fetch("/api/painel/zonas-entrega", { headers: authHeader() });
      if (res.status === 404) { setApiOk(false); return; }
      const data = await res.json();
      if (data.success) setZonas(data.data ?? []);
      setApiOk(true);
    } catch {
      setZonas([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchMotoboys(), fetchZonas()]);
      setLoading(false);
    })();
  }, [fetchMotoboys, fetchZonas]);

  // ── Motoboy CRUD ───────────────────────────────────────────────────────────

  function openNewMotoboy() {
    setEditMotoboy(null);
    setFormMotoboy(DEFAULT_MOTOBOY);
    setError("");
    setModalMotoboy(true);
  }

  function openEditMotoboy(m: Motoboy) {
    setEditMotoboy(m);
    setFormMotoboy({
      nome:     m.nome,
      telefone: m.telefone ?? "",
      veiculo:  m.veiculo  ?? "",
      placa:    m.placa    ?? "",
      status:   m.status,
    });
    setError("");
    setModalMotoboy(true);
  }

  async function saveMotoboy(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const url    = editMotoboy ? `/api/painel/motoboys/${editMotoboy.id}` : "/api/painel/motoboys";
      const method = editMotoboy ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({
          ...formMotoboy,
          telefone: formMotoboy.telefone || undefined,
          veiculo:  formMotoboy.veiculo  || undefined,
          placa:    formMotoboy.placa    || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) { setModalMotoboy(false); fetchMotoboys(); }
      else setError(data.error ?? "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function toggleMotoboyStatus(m: Motoboy) {
    const next = m.status === "inativo" ? "disponivel" : "inativo";
    await fetch(`/api/painel/motoboys/${m.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body:    JSON.stringify({ status: next }),
    });
    fetchMotoboys();
  }

  async function deleteMotoboy(id: string) {
    if (!confirm("Remover este motoboy?")) return;
    await fetch(`/api/painel/motoboys/${id}`, { method: "DELETE", headers: authHeader() });
    fetchMotoboys();
  }

  // ── Zona CRUD ──────────────────────────────────────────────────────────────

  function openNewZona() {
    setFormZona(DEFAULT_ZONA);
    setError("");
    setModalZona(true);
  }

  async function saveZona(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/painel/zonas-entrega", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({
          nome:          formZona.nome,
          bairro:        formZona.bairro      || undefined,
          cep_inicio:    formZona.cep_inicio?.replace(/\D/g,"") || undefined,
          cep_fim:       formZona.cep_fim?.replace(/\D/g,"")    || undefined,
          valor_cobrado: Number(formZona.valor_cobrado || 0),
          valor_motoboy: Number(formZona.valor_motoboy || 0),
          tempo_min:     formZona.tempo_min ? Number(formZona.tempo_min) : undefined,
          ativo:         formZona.ativo,
        }),
      });
      const data = await res.json();
      if (data.success) { setModalZona(false); fetchZonas(); }
      else setError(data.error ?? "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function deleteZona(id: string) {
    if (!confirm("Remover esta zona de entrega?")) return;
    await fetch(`/api/painel/zonas-entrega/${id}`, { method: "DELETE", headers: authHeader() });
    fetchZonas();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Delivery</h1>
          <p className="mt-1 text-sm text-slate-400">
            {motoboys.length} motoboy{motoboys.length !== 1 ? "s" : ""} · {zonas.length} zona{zonas.length !== 1 ? "s" : ""} de entrega
          </p>
        </div>
        <button
          onClick={tab === "motoboys" ? openNewMotoboy : openNewZona}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 transition"
        >
          <Plus className="h-4 w-4" />
          {tab === "motoboys" ? "Novo Motoboy" : "Nova Zona"}
        </button>
      </div>

      {/* API not ready notice */}
      {!apiOk && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Configuração em breve — os endpoints de delivery ainda não estão disponíveis.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {([["motoboys", Bike, "Motoboys"], ["zonas", MapPin, "Zonas de Entrega"]] as const).map(([key, Icon, label]) => (
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

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── ABA MOTOBOYS ── */}
          {tab === "motoboys" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              {/* Head */}
              <div className="hidden sm:grid grid-cols-[1fr_130px_120px_100px_100px_84px] gap-x-4 border-b border-white/5 px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                <span>Nome</span>
                <span>Telefone</span>
                <span>Veículo</span>
                <span>Placa</span>
                <span>Status</span>
                <span />
              </div>

              {motoboys.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                  <Bike className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Nenhum motoboy cadastrado</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {motoboys.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_130px_120px_100px_100px_84px] items-center gap-x-4 px-6 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{m.nome}</p>
                        <p className="mt-0.5 text-xs text-slate-400 sm:hidden">
                          {m.telefone ?? "—"} · {m.veiculo ?? "—"} · {m.placa ?? "—"}
                        </p>
                        <span className={`mt-1 inline-flex sm:hidden rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}>
                          {STATUS_LABEL[m.status]}
                        </span>
                      </div>
                      <p className="hidden sm:block text-sm text-slate-300">
                        {m.telefone ? (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-slate-500" />{m.telefone}</span>
                        ) : "—"}
                      </p>
                      <p className="hidden sm:block text-sm text-slate-300">
                        {m.veiculo ? (
                          <span className="flex items-center gap-1"><Car className="h-3 w-3 text-slate-500" />{m.veiculo}</span>
                        ) : "—"}
                      </p>
                      <p className="hidden sm:block text-sm text-slate-400 font-mono">{m.placa ?? "—"}</p>
                      <span className={`hidden sm:inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}>
                        {STATUS_LABEL[m.status]}
                      </span>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => toggleMotoboyStatus(m)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition"
                          title={m.status === "inativo" ? "Ativar" : "Desativar"}
                        >
                          {m.status !== "inativo"
                            ? <ToggleRight className="h-4 w-4 text-brand" />
                            : <ToggleLeft  className="h-4 w-4" />
                          }
                        </button>
                        <button onClick={() => openEditMotoboy(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteMotoboy(m.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ABA ZONAS ── */}
          {tab === "zonas" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              {/* Head */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_110px_120px_80px_44px] gap-x-4 border-b border-white/5 px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                <span>Nome</span>
                <span>Descrição</span>
                <span className="text-right">Taxa</span>
                <span className="text-right">Tempo estimado</span>
                <span>Status</span>
                <span />
              </div>

              {zonas.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                  <MapPin className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Nenhuma zona de entrega cadastrada</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {zonas.map((z, i) => (
                    <motion.div
                      key={z.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_110px_120px_80px_44px] items-center gap-x-4 px-6 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{z.nome}</p>
                        <div className="mt-0.5 flex items-center gap-2 sm:hidden text-xs text-slate-400">
                          <span>{formatBRL(z.taxa)}</span>
                          {z.tempo_min && <span>{z.tempo_min} min</span>}
                        </div>
                      </div>
                      <p className="hidden sm:block text-sm text-slate-400 truncate">{z.descricao ?? "—"}</p>
                      <p className="hidden sm:block text-right text-sm font-medium text-white">{formatBRL(z.taxa)}</p>
                      <p className="hidden sm:block text-right text-sm text-slate-400">
                        {z.tempo_min ? `${z.tempo_min} min` : "—"}
                      </p>
                      <span className={`hidden sm:inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${z.ativo ? "bg-brand/15 text-brand" : "bg-slate-500/15 text-slate-400"}`}>
                        {z.ativo ? "Ativa" : "Inativa"}
                      </span>
                      <div className="flex justify-end">
                        <button onClick={() => deleteZona(z.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MODAL MOTOBOY ── */}
      <AnimatePresence>
        {modalMotoboy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalMotoboy(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">{editMotoboy ? "Editar Motoboy" : "Novo Motoboy"}</h2>
                <button onClick={() => setModalMotoboy(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
              <form onSubmit={saveMotoboy} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                  <input value={formMotoboy.nome} onChange={e => setFormMotoboy(f => ({ ...f, nome: e.target.value }))}
                    required placeholder="Nome completo"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Telefone</label>
                  <input value={formMotoboy.telefone} onChange={e => setFormMotoboy(f => ({ ...f, telefone: e.target.value }))}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Veículo</label>
                    <input value={formMotoboy.veiculo} onChange={e => setFormMotoboy(f => ({ ...f, veiculo: e.target.value }))}
                      placeholder="Moto, Bicicleta..."
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Placa</label>
                    <input value={formMotoboy.placa} onChange={e => setFormMotoboy(f => ({ ...f, placa: e.target.value }))}
                      placeholder="ABC-1234"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
                  <select value={formMotoboy.status} onChange={e => setFormMotoboy(f => ({ ...f, status: e.target.value as Motoboy["status"] }))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none">
                    <option value="disponivel">Disponível</option>
                    <option value="em_rota">Em rota</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setModalMotoboy(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition">
                    {saving ? "Salvando..." : editMotoboy ? "Salvar" : "Criar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL ZONA ── */}
      <AnimatePresence>
        {modalZona && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalZona(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">Nova Zona de Entrega</h2>
                <button onClick={() => setModalZona(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 transition">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
              <form onSubmit={saveZona} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                  <input value={formZona.nome} onChange={e => setFormZona(f => ({ ...f, nome: e.target.value }))}
                    required placeholder="Ex: Centro, Bairro Norte..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Bairro (match exato)</label>
                  <input value={formZona.bairro} onChange={e => setFormZona(f => ({ ...f, bairro: e.target.value }))}
                    placeholder="Ex: Centro (case-insensitive)"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">CEP início</label>
                    <input value={formZona.cep_inicio} onChange={e => setFormZona(f => ({ ...f, cep_inicio: e.target.value.replace(/\D/g,'').slice(0,8) }))}
                      placeholder="00000000" inputMode="numeric"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">CEP fim</label>
                    <input value={formZona.cep_fim} onChange={e => setFormZona(f => ({ ...f, cep_fim: e.target.value.replace(/\D/g,'').slice(0,8) }))}
                      placeholder="99999999" inputMode="numeric"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none font-mono" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 -mt-2">
                  Match acontece por CEP range OU bairro. Deixe um deles preenchido.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Taxa cobrada (R$) *</label>
                    <input type="number" min={0} step={0.01} value={formZona.valor_cobrado}
                      onChange={e => setFormZona(f => ({ ...f, valor_cobrado: e.target.value }))} required
                      placeholder="0,00"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Pago ao motoboy (R$)</label>
                    <input type="number" min={0} step={0.01} value={formZona.valor_motoboy}
                      onChange={e => setFormZona(f => ({ ...f, valor_motoboy: e.target.value }))}
                      placeholder="0,00 = sem pagamento"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">&nbsp;</label>
                    <div className="text-[11px] text-slate-500 pt-2.5">Sem valor = motoboy não recebe taxa</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Tempo estimado (min)</label>
                    <input type="number" min={1} value={formZona.tempo_min}
                      onChange={e => setFormZona(f => ({ ...f, tempo_min: e.target.value }))}
                      placeholder="Ex: 30"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand/50 focus:outline-none" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="zona-ativo" checked={formZona.ativo}
                    onChange={e => setFormZona(f => ({ ...f, ativo: e.target.checked }))}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand" />
                  <label htmlFor="zona-ativo" className="text-sm text-slate-300">Zona ativa</label>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setModalZona(false)}
                    className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition">
                    {saving ? "Salvando..." : "Criar Zona"}
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
