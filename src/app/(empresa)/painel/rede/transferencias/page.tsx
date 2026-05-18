"use client";

/**
 * /painel/rede/transferencias — gerencia transferências de produtos entre filiais.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Truck, ArrowRight, ArrowDown, ArrowUp, Plus, Loader2, X, Check, RefreshCw,
} from "lucide-react";
import { alertar, confirmar } from "@/components/ui/ConfirmModal";

interface Filial { id: string; nome_fantasia: string; nome_filial: string | null; is_matriz: boolean }
interface Produto { id: string; nome: string }

interface Transferencia {
  id: string; status: "pendente"|"em_transito"|"recebido"|"cancelado";
  quantidade: string; motivo: string | null; observacao: string | null;
  criado_em: string; enviado_em: string | null; recebido_em: string | null;
  filial_origem:  string; origem_nome:  string; origem_apelido:  string | null;
  filial_destino: string; destino_nome: string; destino_apelido: string | null;
  produto_id:     string; produto_nome: string;
}

const STATUS_CFG: Record<string, { label: string; cor: string }> = {
  pendente:    { label: "Pendente",    cor: "bg-amber-500/20 text-amber-300" },
  em_transito: { label: "Em trânsito", cor: "bg-blue-500/20 text-blue-300" },
  recebido:    { label: "Recebido",    cor: "bg-emerald-500/20 text-emerald-300" },
  cancelado:   { label: "Cancelado",   cor: "bg-red-500/20 text-red-300" },
};

export default function TransferenciasPage() {
  const [list, setList] = useState<Transferencia[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [direcao, setDirecao] = useState<"todas"|"entrada"|"saida">("todas");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [criando, setCriando] = useState(false);
  const [loading, setLoading] = useState(true);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (direcao !== "todas") params.set("direcao", direcao);
      if (filtroStatus)        params.set("status", filtroStatus);

      const [t, r, p] = await Promise.all([
        fetch(`/api/painel/rede/transferencias?${params}`, { headers: auth() }).then(r => r.json()),
        fetch(`/api/painel/rede`,                          { headers: auth() }).then(r => r.json()),
        fetch(`/api/painel/produtos?limit=200`,             { headers: auth() }).then(r => r.json()),
      ]);
      if (t.success) setList(t.data ?? []);
      if (r.success) {
        setFiliais(r.data?.filiais ?? []);
        setEmpresaId(r.data?.scope?.empresa_id ?? "");
      }
      if (p.success) setProdutos((p.data ?? []).map((x: Produto) => ({ id: x.id, nome: x.nome })));
    } finally { setLoading(false); }
  }, [direcao, filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(t: Transferencia, ac: "enviar"|"receber"|"cancelar") {
    if (ac === "cancelar" && !await confirmar({ titulo: "Cancelar transferência?", perigo: true })) return;
    const r = await fetch(`/api/painel/rede/transferencias/${t.id}`, {
      method: "PATCH", headers: auth(),
      body: JSON.stringify({ acao: ac }),
    });
    const d = await r.json();
    if (!d.success) {
      await alertar({ titulo: "Falha", mensagem: typeof d.error === "string" ? d.error : "?", tipo: "perigo" });
      return;
    }
    carregar();
  }

  const filiaisOutras = filiais.filter(f => f.id !== empresaId);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Transferências entre filiais</h1>
            <p className="text-xs text-slate-400">Movimentação de produtos entre suas lojas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400">
            <Plus className="h-4 w-4" /> Nova transferência
          </button>
          <button onClick={carregar} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {(["todas","entrada","saida"] as const).map(d => (
            <button key={d} onClick={() => setDirecao(d)}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                direcao === d ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-white/5"
              }`}>
              {d === "todas" ? "Todas" : d === "entrada" ? "↓ Recebidas" : "↑ Enviadas"}
            </button>
          ))}
        </div>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white">
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="em_transito">Em trânsito</option>
          <option value="recebido">Recebido</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <Truck className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Nenhuma transferência ainda</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map(t => {
            const cfg = STATUS_CFG[t.status];
            const eEntrada = t.filial_destino === empresaId;
            return (
              <div key={t.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  {eEntrada ? <ArrowDown className="h-5 w-5 text-blue-400 flex-shrink-0" /> : <ArrowUp className="h-5 w-5 text-amber-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{t.produto_nome}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.cor}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-emerald-400 font-mono">{t.quantidade} un</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 flex items-center gap-1 flex-wrap">
                      <span className={eEntrada ? "text-slate-500" : "font-bold text-white"}>
                        {t.origem_apelido ?? t.origem_nome}
                      </span>
                      <ArrowRight className="h-3 w-3" />
                      <span className={eEntrada ? "font-bold text-white" : "text-slate-500"}>
                        {t.destino_apelido ?? t.destino_nome}
                      </span>
                    </p>
                    {t.motivo && <p className="text-[11px] text-slate-500 mt-0.5 italic">{t.motivo}</p>}
                    <p className="text-[10px] text-slate-600 mt-1">
                      Criado: {new Date(t.criado_em).toLocaleString("pt-BR")}
                      {t.enviado_em && ` · Enviado: ${new Date(t.enviado_em).toLocaleString("pt-BR")}`}
                      {t.recebido_em && ` · Recebido: ${new Date(t.recebido_em).toLocaleString("pt-BR")}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {!eEntrada && t.status === "pendente" && (
                      <button onClick={() => acao(t, "enviar")}
                        className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-bold text-white">
                        Enviar
                      </button>
                    )}
                    {eEntrada && t.status === "em_transito" && (
                      <button onClick={() => acao(t, "receber")}
                        className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-white">
                        Receber
                      </button>
                    )}
                    {t.status !== "recebido" && t.status !== "cancelado" && (
                      <button onClick={() => acao(t, "cancelar")}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {criando && (
        <ModalCriar
          produtos={produtos} filiaisOutras={filiaisOutras}
          onClose={() => setCriando(false)}
          onSuccess={() => { setCriando(false); carregar(); }}
        />
      )}
    </div>
  );
}

function ModalCriar({ produtos, filiaisOutras, onClose, onSuccess }: {
  produtos: Produto[]; filiaisOutras: Filial[]; onClose: () => void; onSuccess: () => void;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [qtd, setQtd]             = useState(1);
  const [motivo, setMotivo]       = useState("");
  const [busy, setBusy]           = useState(false);

  async function salvar() {
    if (!produtoId || !destinoId || qtd <= 0) {
      await alertar({ titulo: "Preencha produto, destino e quantidade", tipo: "alerta" });
      return;
    }
    setBusy(true);
    try {
      const t = localStorage.getItem("access_token");
      const r = await fetch("/api/painel/rede/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          produto_id: produtoId, filial_destino_id: destinoId,
          quantidade: qtd, motivo: motivo || undefined,
        }),
      });
      const d = await r.json();
      if (!d.success) {
        await alertar({ titulo: "Falha", mensagem: typeof d.error === "string" ? d.error : "?", tipo: "perigo" });
        return;
      }
      onSuccess();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h3 className="font-bold text-white">Nova transferência</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <Lbl t="Produto">
            <select value={produtoId} onChange={e => setProdutoId(e.target.value)} className={INP}>
              <option value="">— escolher —</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Lbl>
          <Lbl t="Filial destino">
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className={INP}>
              <option value="">— escolher —</option>
              {filiaisOutras.map(f => (
                <option key={f.id} value={f.id}>{f.nome_filial ?? f.nome_fantasia}</option>
              ))}
            </select>
          </Lbl>
          <Lbl t="Quantidade">
            <input type="number" min={1} step="0.01" value={qtd}
              onChange={e => setQtd(Number(e.target.value))} className={INP} />
          </Lbl>
          <Lbl t="Motivo (opcional)">
            <input value={motivo} onChange={e => setMotivo(e.target.value)} className={INP} />
          </Lbl>
          <button onClick={salvar} disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Criar transferência
          </button>
        </div>
      </div>
    </div>
  );
}

const INP = "w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white";
function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">{t}</label>{children}</div>;
}
