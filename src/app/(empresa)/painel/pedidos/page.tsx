"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingBag, Clock, CheckCircle, XCircle, Truck, ChefHat,
  RefreshCw, Eye, X, Filter,
} from "lucide-react";

interface Pedido {
  id:             string;
  numero:         number;
  tipo:           string;
  status:         string;
  total:          number;
  created_at:     string;
  cliente_nome:   string | null;
  mesa_numero:    number | null;
  comanda:        string | null;
  atendente_nome: string | null;
}

interface PedidoDetalhe extends Pedido {
  subtotal:          number;
  desconto:          number;
  taxa_entrega:      number;
  observacoes:       string | null;
  cliente_telefone:  string | null;
  itens: {
    id:             string;
    nome:           string;
    quantidade:     number;
    preco_unitario: number;
    subtotal:       number;
    observacoes:    string | null;
  }[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pendente:   { label: "Pendente",    icon: Clock,         color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  confirmado: { label: "Confirmado",  icon: CheckCircle,   color: "text-blue-400 bg-blue-400/10 border-blue-400/20"       },
  preparo:    { label: "Em preparo",  icon: ChefHat,       color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  pronto:     { label: "Pronto",      icon: CheckCircle,   color: "text-brand bg-brand/10 border-brand/20" },
  entregue:   { label: "Entregue",    icon: Truck,         color: "text-green-400 bg-green-400/10 border-green-400/20"    },
  cancelado:  { label: "Cancelado",   icon: XCircle,       color: "text-red-400 bg-red-400/10 border-red-400/20"          },
};

const TIPO_LABELS: Record<string, string> = {
  mesa:      "Mesa",
  balcao:    "Balcão",
  delivery:  "Delivery",
  totem:     "Totem",
  whatsapp:  "WhatsApp",
  app:       "App",
};

const PROXIMOS_STATUS: Record<string, string[]> = {
  pendente:   ["confirmado", "cancelado"],
  confirmado: ["preparo", "cancelado"],
  preparo:    ["pronto"],
  pronto:     ["entregue"],
  entregue:   [],
  cancelado:  [],
};

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

interface PedidoModalProps {
  pedidoId: string;
  onClose:  () => void;
  onUpdate: () => void;
}

function PedidoModal({ pedidoId, onClose, onUpdate }: PedidoModalProps) {
  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`/api/pedidos/${pedidoId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.success) setPedido(d.data); });
  }, [pedidoId]);

  async function handleStatus(novoStatus: string) {
    setUpdating(true);
    try {
      const token = localStorage.getItem("access_token");
      await fetch(`/api/pedidos/${pedidoId}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: novoStatus }),
      });
      onUpdate();
      onClose();
    } finally {
      setUpdating(false);
    }
  }

  if (!pedido) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const proximos = PROXIMOS_STATUS[pedido.status] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">Pedido #{pedido.numero}</h2>
            <StatusBadge status={pedido.status} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Tipo</p>
              <p className="font-medium">{TIPO_LABELS[pedido.tipo] ?? pedido.tipo}</p>
            </div>
            {pedido.mesa_numero && (
              <div>
                <p className="text-xs text-slate-500">Mesa</p>
                <p className="font-medium">{pedido.mesa_numero}</p>
              </div>
            )}
            {pedido.comanda && (
              <div>
                <p className="text-xs text-slate-500">Comanda</p>
                <p className="font-medium">{pedido.comanda}</p>
              </div>
            )}
            {pedido.cliente_nome && (
              <div>
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="font-medium">{pedido.cliente_nome}</p>
              </div>
            )}
            {pedido.cliente_telefone && (
              <div>
                <p className="text-xs text-slate-500">Telefone</p>
                <p className="font-medium">{pedido.cliente_telefone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Horário</p>
              <p className="font-medium">{formatDateTime(pedido.created_at)}</p>
            </div>
          </div>

          {pedido.observacoes && (
            <div className="rounded-xl bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
              <p className="text-xs text-slate-500 mb-1">Observação</p>
              {pedido.observacoes}
            </div>
          )}

          {/* Itens */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Itens</p>
            <div className="space-y-2">
              {pedido.itens.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      <span className="text-brand mr-2">{item.quantidade}×</span>
                      {item.nome}
                    </p>
                    {item.observacoes && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.observacoes}</p>
                    )}
                  </div>
                  <p className="text-sm font-medium">{formatBRL(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Totais */}
          <div className="border-t border-white/5 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span>{formatBRL(pedido.subtotal)}</span>
            </div>
            {pedido.desconto > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Desconto</span>
                <span className="text-red-400">-{formatBRL(pedido.desconto)}</span>
              </div>
            )}
            {pedido.taxa_entrega > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Taxa de entrega</span>
                <span>{formatBRL(pedido.taxa_entrega)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1">
              <span>Total</span>
              <span className="text-brand">{formatBRL(pedido.total)}</span>
            </div>
          </div>
        </div>

        {/* Ações */}
        {proximos.length > 0 && (
          <div className="flex gap-2 border-t border-white/5 p-4">
            {proximos.map((s) => {
              const cfg  = STATUS_CONFIG[s];
              const isCancelamento = s === "cancelado";
              return (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={updating}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                    isCancelamento
                      ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
                      : "bg-brand text-white hover:brightness-110"
                  }`}
                >
                  {cfg?.label ?? s}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PedidosPage() {
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [tipoFilter, setTipoFilter]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [detalhe, setDetalhe]   = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const LIMIT = 20;

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const sp = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter) sp.set("status", statusFilter);
      if (tipoFilter)   sp.set("tipo", tipoFilter);

      const res  = await fetch(`/api/pedidos?${sp}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPedidos(data.data);
        setTotal(data.meta?.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, tipoFilter]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);
  useEffect(() => { setPage(1); }, [statusFilter, tipoFilter]);

  // auto-refresh a cada 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchPedidos, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchPedidos]);

  const pendentes  = pedidos.filter((p) => p.status === "pendente").length;
  const emPreparo  = pedidos.filter((p) => p.status === "preparo").length;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="mt-0.5 text-sm text-slate-400">{total} pedido{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              autoRefresh
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
            Auto-refresh
          </button>
          <button
            onClick={fetchPedidos}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Pendentes",  value: pendentes, color: "text-yellow-400", icon: Clock },
          { label: "Em preparo", value: emPreparo,  color: "text-orange-400", icon: ChefHat },
          { label: "Total hoje", value: total,       color: "text-blue-400",   icon: ShoppingBag },
          {
            label: "Receita",
            value: formatBRL(pedidos.filter((p) => p.status !== "cancelado").reduce((acc, p) => acc + p.total, 0)),
            color: "text-brand",
            icon:  CheckCircle,
          },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-white/5 bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">{label}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-slate-400">
          <Filter className="h-4 w-4" />
        </div>
        <select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}
          className="rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/5 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <ShoppingBag className="h-10 w-10" />
            <p className="text-sm">Nenhum pedido encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5 text-xs text-slate-500">
                <th className="px-6 py-3 text-left font-medium">#</th>
                <th className="px-6 py-3 text-left font-medium">Tipo / Mesa</th>
                <th className="px-6 py-3 text-left font-medium hidden sm:table-cell">Cliente</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium hidden md:table-cell">Horário</th>
                <th className="px-6 py-3 text-right font-medium">Total</th>
                <th className="px-6 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pedidos.map((p) => (
                <tr key={p.id} className="hover:bg-white/2 transition">
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-bold text-white">#{p.numero}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium">{TIPO_LABELS[p.tipo] ?? p.tipo}</p>
                      {p.mesa_numero && (
                        <p className="text-xs text-slate-500">Mesa {p.mesa_numero}</p>
                      )}
                      {p.comanda && (
                        <p className="text-xs text-slate-500">Comanda {p.comanda}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    <span className="text-sm text-slate-400">{p.cliente_nome ?? "—"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="text-xs text-slate-500">{formatTime(p.created_at)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-brand">{formatBRL(p.total)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setDetalhe(p.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition ml-auto"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg px-3 py-1 border border-white/10 hover:border-white/20 hover:text-white transition disabled:opacity-30"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg px-3 py-1 border border-white/10 hover:border-white/20 hover:text-white transition disabled:opacity-30"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {detalhe && (
        <PedidoModal
          pedidoId={detalhe}
          onClose={() => setDetalhe(null)}
          onUpdate={fetchPedidos}
        />
      )}
    </div>
  );
}
