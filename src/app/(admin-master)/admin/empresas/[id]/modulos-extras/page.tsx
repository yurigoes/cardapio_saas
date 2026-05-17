"use client";

/**
 * /admin/empresas/[id]/modulos-extras
 * Master libera módulos fora do plano: experimental, à la carte ou gratuito.
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Crown, Clock, DollarSign, Gift } from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Extra {
  id: string;
  modulo: string;
  tipo: "experimental" | "alacarte" | "gratuito";
  preco: number;
  expira_em: string | null;
  bloqueado: boolean;
  observacao: string | null;
  created_at: string;
}

const MODULOS = [
  "ifood","whatsapp","kiosk","totem","relatorios","estoque","cupons",
  "comandas","caixa","cozinha","tv","delivery","mesa","balcao",
];

export default function ExtrasPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [list, setList] = useState<Extra[]>([]);
  const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState({
    modulo: "ifood",
    tipo:   "experimental" as Extra["tipo"],
    dias:   7,
    preco:  0,
    observacao: "",
  });

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/admin/empresas/${id}/modulos-extras`, { headers: auth() }).then(r => r.json());
    if (r.success) setList(r.data ?? []);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        modulo: novo.modulo,
        tipo:   novo.tipo,
        observacao: novo.observacao || undefined,
      };
      if (novo.tipo === "experimental") payload.dias = novo.dias;
      if (novo.tipo === "alacarte")     payload.preco = novo.preco;

      const r = await fetch(`/api/admin/empresas/${id}/modulos-extras`, {
        method: "POST", headers: auth(), body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error?.message ?? "Falha");
      setNovo({ ...novo, observacao: "" });
      carregar();
    } catch (e) {
      await alertar({ titulo: "Falha", mensagem: (e as Error).message, tipo: "perigo" });
    } finally { setBusy(false); }
  }

  async function revogar(e: Extra) {
    if (!await confirmar({ titulo: `Revogar ${e.modulo}?`, mensagem: "Cliente perde acesso imediato.", perigo: true })) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/empresas/${id}/modulos-extras?modulo=${e.modulo}`, {
        method: "DELETE", headers: auth(),
      });
      carregar();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/admin/empresas/${id}/editar`)}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Crown className="h-5 w-5 text-amber-400" />
            Módulos extras
          </h1>
          <p className="text-xs text-slate-400">Liberações fora do plano: experimental / à la carte / gratuito</p>
        </div>
      </div>

      {/* Novo */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-300">
          <Plus className="h-4 w-4" /> Liberar novo módulo
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase font-semibold text-slate-400">Módulo</label>
            <select value={novo.modulo} onChange={e => setNovo({ ...novo, modulo: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase font-semibold text-slate-400">Tipo de liberação</label>
            <select value={novo.tipo} onChange={e => setNovo({ ...novo, tipo: e.target.value as Extra["tipo"] })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
              <option value="experimental">🔬 Experimental (vence em X dias)</option>
              <option value="alacarte">💰 À la carte (cobrança, bloqueia em 24h se não pagar)</option>
              <option value="gratuito">🎁 Gratuito (sem expiração)</option>
            </select>
          </div>
          {novo.tipo === "experimental" && (
            <div>
              <label className="mb-1 block text-[11px] uppercase font-semibold text-slate-400">Dias ativos</label>
              <input type="number" value={novo.dias} min={1} max={365}
                onChange={e => setNovo({ ...novo, dias: Number(e.target.value) })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </div>
          )}
          {novo.tipo === "alacarte" && (
            <div>
              <label className="mb-1 block text-[11px] uppercase font-semibold text-slate-400">Preço mensal (R$)</label>
              <input type="number" step="0.01" value={novo.preco}
                onChange={e => setNovo({ ...novo, preco: Number(e.target.value) })}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] uppercase font-semibold text-slate-400">Observação (opcional)</label>
            <input value={novo.observacao}
              onChange={e => setNovo({ ...novo, observacao: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <button onClick={adicionar} disabled={busy}
          className="mt-3 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
          {busy ? "Liberando..." : "Liberar módulo"}
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Liberados ({list.length})</h2>
        {list.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-500">
            Nenhum módulo extra ativo.
          </p>
        ) : list.map(e => {
          const Icon = e.tipo === "experimental" ? Clock : e.tipo === "alacarte" ? DollarSign : Gift;
          const cor  = e.tipo === "experimental" ? "blue" : e.tipo === "alacarte" ? "amber" : "emerald";
          const venceEm = e.expira_em ? new Date(e.expira_em) : null;
          const restaMs = venceEm ? venceEm.getTime() - Date.now() : Infinity;
          const restaDias = Math.ceil(restaMs / 86400000);
          return (
            <div key={e.id} className={`flex items-center gap-3 rounded-xl border border-${cor}-500/30 bg-${cor}-500/5 p-3`}>
              <Icon className={`h-5 w-5 text-${cor}-400 flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{e.modulo}</p>
                <p className="text-xs text-slate-400">
                  {e.tipo} {e.tipo === "alacarte" && `· R$ ${Number(e.preco).toFixed(2)}/mês`}
                  {venceEm && ` · vence em ${restaDias}d (${venceEm.toLocaleDateString("pt-BR")})`}
                  {e.bloqueado && " · 🚫 BLOQUEADO"}
                </p>
                {e.observacao && <p className="text-[11px] text-slate-500 italic">{e.observacao}</p>}
              </div>
              <button onClick={() => revogar(e)}
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
