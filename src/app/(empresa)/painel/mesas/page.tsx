"use client";

import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  MapPin, Plus, Users, Clock, CheckCircle, X, RefreshCw, Eye, QrCode, Copy, Check,
  XCircle, ArrowLeftRight, Trash2, AlertCircle, Loader2,
} from "lucide-react";

interface Mesa {
  id:                     string;
  numero:                 number;
  nome:                   string | null;
  capacidade:             number;
  setor:                  string | null;
  status:                 string;
  qrcode_url:             string | null;
  pedido_id:              string | null;
  pedido_numero:          number | null;
  pedido_total:           number | null;
  tempo_aberta_segundos:  number | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  livre:    { label: "Livre",    color: "text-brand", bg: "bg-brand/10 border-brand/20" },
  ocupada:  { label: "Ocupada",  color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20"  },
  reservada:{ label: "Reservada",color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20"      },
  fechando: { label: "Fechando", color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20"  },
};

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatTempo(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

interface ModalCriarMesaProps {
  onClose:  () => void;
  onSaved:  () => void;
}

function ModalCriarMesa({ onClose, onSaved }: ModalCriarMesaProps) {
  const [form, setForm] = useState({ numero: "", nome: "", capacidade: "4", setor: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/mesas", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          numero:     Number(form.numero),
          nome:       form.nome.trim() || undefined,
          capacidade: Number(form.capacidade),
          setor:      form.setor.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Erro ao criar mesa"); return; }
      onSaved(); onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Nova Mesa</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Número *</label>
              <input
                required type="number" min="1" max="9999"
                value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Capacidade</label>
              <input
                type="number" min="1" max="100"
                value={form.capacidade} onChange={(e) => setForm({ ...form, capacidade: e.target.value })}
                className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome (opcional)</label>
            <input
              value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              placeholder="Ex: Varanda, Terraço..."
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Setor (opcional)</label>
            <input
              value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}
              className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
              placeholder="Ex: Salão, Área externa..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-slate-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-xl bg-brand py-2 text-sm font-medium text-white hover:brightness-110 transition disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar mesa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MesaCard({
  mesa, onVerPedido, onQrCode, onFechar, onTransferir, onExcluir,
}: {
  mesa: Mesa;
  onVerPedido:  (id: string) => void;
  onQrCode:     (mesa: Mesa) => void;
  onFechar:     (mesa: Mesa) => void;
  onTransferir: (mesa: Mesa) => void;
  onExcluir:    (mesa: Mesa) => void;
}) {
  const cfg = STATUS_CONFIG[mesa.status] ?? STATUS_CONFIG.livre;

  return (
    <div className={`relative rounded-2xl border p-4 transition ${cfg.bg}`}>
      {/* número */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-2xl font-black text-white">{mesa.numero}</p>
          {mesa.nome && <p className="text-xs text-slate-400">{mesa.nome}</p>}
        </div>
        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
      </div>

      {/* info */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {mesa.capacidade}
        </span>
        {mesa.setor && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {mesa.setor}
          </span>
        )}
      </div>

      {/* pedido ativo */}
      {mesa.pedido_id && (
        <div className="mt-3 rounded-xl bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">
                Pedido #{mesa.pedido_numero}
              </p>
              <p className="text-sm font-bold text-brand">
                {mesa.pedido_total != null ? formatBRL(mesa.pedido_total) : "—"}
              </p>
            </div>
            <div className="text-right">
              {mesa.tempo_aberta_segundos != null && mesa.tempo_aberta_segundos > 0 && (
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {formatTempo(mesa.tempo_aberta_segundos)}
                </p>
              )}
              <button
                onClick={() => onVerPedido(mesa.pedido_id!)}
                className="mt-1 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
              >
                <Eye className="h-3 w-3" /> Ver
              </button>
            </div>
          </div>

          {/* Ações da mesa ocupada */}
          <div className="mt-2.5 flex gap-1.5 border-t border-white/5 pt-2.5">
            <button
              onClick={() => onFechar(mesa)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/25 transition"
              title="Fechar mesa (libera para próximo cliente)"
            >
              <XCircle className="h-3 w-3" /> Fechar
            </button>
            <button
              onClick={() => onTransferir(mesa)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/5 transition"
              title="Transferir pedido para outra mesa"
            >
              <ArrowLeftRight className="h-3 w-3" /> Mover
            </button>
          </div>
        </div>
      )}

      {mesa.status === "livre" && (
        <div className="mt-3 flex items-center gap-1 text-xs text-brand">
          <CheckCircle className="h-3 w-3" />
          Disponível
        </div>
      )}

      {/* Ações secundárias (canto inferior direito) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1">
        {mesa.status === "livre" && (
          <button
            onClick={(e) => { e.stopPropagation(); onExcluir(mesa); }}
            className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
            title="Excluir mesa"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onQrCode(mesa); }}
          className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:bg-white/10 transition"
          title="Ver QR Code"
        >
          <QrCode className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ModalQrCode({ mesa, slug, onClose }: { mesa: Mesa; slug: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url    = `${origin}/totem/${slug}?mesa=${mesa.id}&mesa_numero=${mesa.numero}`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const svg   = document.getElementById("qr-svg");
    if (!svg) return;
    const blob  = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const a     = document.createElement("a");
    a.href      = URL.createObjectURL(blob);
    a.download  = `qrcode-mesa-${mesa.numero}.svg`;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">QR Code — Mesa {mesa.numero}</h2>
            {mesa.nome && <p className="text-xs text-slate-400">{mesa.nome}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR */}
        <div className="flex justify-center rounded-2xl bg-white p-5 mb-4">
          <QRCodeSVG
            id="qr-svg"
            value={url}
            size={200}
            level="M"
            includeMargin={false}
          />
        </div>

        <p className="text-xs text-slate-500 text-center break-all mb-4">{url}</p>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 py-2 text-sm text-slate-400 hover:text-white transition"
          >
            {copied ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado!" : "Copiar link"}
          </button>
          <button
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2 text-sm font-medium text-white hover:brightness-110 transition"
          >
            <QrCode className="h-4 w-4" />
            Baixar SVG
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MesasPage() {
  const [mesas, setMesas]       = useState<Mesa[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modError, setModError] = useState(false);
  const [showCriar, setShowCriar] = useState(false);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<string | null>(null);
  const [setor, setSetor] = useState("todos");
  const [qrMesa, setQrMesa]     = useState<Mesa | null>(null);
  const [empresaSlug, setSlug]  = useState("");

  // Modal transferir
  const [transferOrigem, setTransferOrigem] = useState<Mesa | null>(null);
  const [transferDestino, setTransferDestino] = useState<string>("");
  const [transferLoading, setTransferLoading] = useState(false);

  // Toast simples
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchMesas = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const [mesasRes, meRes] = await Promise.all([
        fetch("/api/mesas",    { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/auth/me",  { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [mesasData, meData] = await Promise.all([mesasRes.json(), meRes.json()]);
      if (mesasRes.status === 403) { setModError(true); return; }
      if (mesasData.success) setMesas(mesasData.data);
      if (meData.success)    setSlug(meData.data?.empresa?.slug ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMesas(); }, [fetchMesas]);

  // auto-refresh
  useEffect(() => {
    const id = setInterval(fetchMesas, 30_000);
    return () => clearInterval(id);
  }, [fetchMesas]);

  const setores  = ["todos", ...Array.from(new Set(mesas.map((m) => m.setor ?? "Sem setor")))];
  const filtradas = setor === "todos"
    ? mesas
    : mesas.filter((m) => (m.setor ?? "Sem setor") === setor);

  const livres  = mesas.filter((m) => m.status === "livre").length;
  const ocupadas = mesas.filter((m) => m.status === "ocupada").length;

  if (modError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-500">
        <MapPin className="h-12 w-12" />
        <p className="text-lg font-semibold text-white">Módulo Mesas não ativo</p>
        <p className="text-sm">Ative o módulo &quot;Mesa&quot; no seu plano para usar esta funcionalidade.</p>
      </div>
    );
  }

  // ── Ações ────────────────────────────────────────────────────────────────

  async function handleFechar(mesa: Mesa) {
    if (!confirm(`Fechar mesa ${mesa.numero}? O pedido será marcado como entregue e a mesa liberada.`)) return;
    const token = localStorage.getItem("access_token");
    const res = await fetch(`/api/mesas/${mesa.id}/fechar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setToast({ type: "ok", msg: `Mesa ${mesa.numero} fechada` });
      fetchMesas();
    } else {
      setToast({ type: "err", msg: data.error || "Erro ao fechar mesa" });
    }
  }

  function handleAbrirTransferir(mesa: Mesa) {
    setTransferOrigem(mesa);
    setTransferDestino("");
  }

  async function handleTransferir() {
    if (!transferOrigem || !transferDestino) return;
    setTransferLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`/api/mesas/${transferOrigem.id}/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mesa_destino_id: transferDestino }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ type: "ok", msg: `Pedido transferido para mesa ${data.data.para.numero}` });
        setTransferOrigem(null);
        fetchMesas();
      } else {
        setToast({ type: "err", msg: data.error || "Erro ao transferir" });
      }
    } finally {
      setTransferLoading(false);
    }
  }

  async function handleExcluir(mesa: Mesa) {
    if (!confirm(`Excluir mesa ${mesa.numero}? Esta ação não pode ser desfeita.`)) return;
    const token = localStorage.getItem("access_token");
    const res = await fetch(`/api/mesas/${mesa.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setToast({ type: "ok", msg: "Mesa excluída" });
      fetchMesas();
    } else {
      setToast({ type: "err", msg: data.error || "Erro ao excluir" });
    }
  }

  // Mesas livres para destino da transferência
  const mesasLivres = mesas.filter((m) => m.status === "livre" && m.id !== transferOrigem?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mesas</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {livres} livre{livres !== 1 ? "s" : ""} · {ocupadas} ocupada{ocupadas !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchMesas}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
          <button
            onClick={() => setShowCriar(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-110 transition"
          >
            <Plus className="h-4 w-4" />
            Nova mesa
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total",   value: mesas.length, color: "text-white"        },
          { label: "Livres",  value: livres,        color: "text-brand"  },
          { label: "Ocupadas",value: ocupadas,      color: "text-orange-400"   },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-white/5 bg-slate-900 p-4 text-center">
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtro por setor */}
      {setores.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {setores.map((s) => (
            <button
              key={s}
              onClick={() => setSetor(s)}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                setor === s
                  ? "bg-brand text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s === "todos" ? "Todos os setores" : s}
            </button>
          ))}
        </div>
      )}

      {/* Grid de mesas */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <MapPin className="h-10 w-10" />
          <p className="text-sm">Nenhuma mesa cadastrada</p>
          <button
            onClick={() => setShowCriar(true)}
            className="text-sm text-brand hover:text-brand transition"
          >
            Criar primeira mesa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtradas.map((mesa) => (
            <MesaCard
              key={mesa.id}
              mesa={mesa}
              onVerPedido={(id) => setPedidoDetalhe(id)}
              onQrCode={(m) => setQrMesa(m)}
              onFechar={handleFechar}
              onTransferir={handleAbrirTransferir}
              onExcluir={handleExcluir}
            />
          ))}
        </div>
      )}

      {showCriar && (
        <ModalCriarMesa onClose={() => setShowCriar(false)} onSaved={fetchMesas} />
      )}

      {qrMesa && empresaSlug && (
        <ModalQrCode mesa={qrMesa} slug={empresaSlug} onClose={() => setQrMesa(null)} />
      )}

      {/* Pedido detalhe inline redirect to pedidos page for now */}
      {pedidoDetalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl bg-slate-900 border border-white/10 p-6 text-center">
            <p className="text-slate-400 text-sm">
              Ver detalhes do pedido na página de{" "}
              <a href="/painel/pedidos" className="text-brand underline">Pedidos</a>
            </p>
            <button
              onClick={() => setPedidoDetalhe(null)}
              className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white transition"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: transferir mesa */}
      {transferOrigem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTransferOrigem(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Transferir mesa {transferOrigem.numero}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Pedido #{transferOrigem.pedido_numero} será movido para a mesa selecionada
                </p>
              </div>
              <button onClick={() => setTransferOrigem(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Mesa de destino</label>
                {mesasLivres.length === 0 ? (
                  <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                    Não há mesas livres disponíveis
                  </p>
                ) : (
                  <select
                    value={transferDestino}
                    onChange={(e) => setTransferDestino(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-brand/50 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {mesasLivres.map((m) => (
                      <option key={m.id} value={m.id}>
                        Mesa {m.numero}{m.nome ? ` — ${m.nome}` : ""}{m.setor ? ` (${m.setor})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTransferOrigem(null)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleTransferir}
                  disabled={transferLoading || !transferDestino}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50 transition"
                >
                  {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                  Transferir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur ${
            toast.type === "ok"
              ? "border-brand/30 bg-brand/15 text-brand"
              : "border-red-500/30 bg-red-500/15 text-red-300"
          }`}>
            {toast.type === "ok" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
