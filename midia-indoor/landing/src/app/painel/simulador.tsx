"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, Smartphone, Monitor, Send } from "lucide-react";
import { notify } from "@/components/Notify";
import { calcularValor, insercoesPorOrcamento, validarPedido, brl, type SimuladorConfig } from "@/lib/simulador";

function api(token: string, path: string, init?: RequestInit) {
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
}

interface Pedido {
  id: string; orientacao: string; insercoes_dia: number; segundos: number; dias: number;
  valor: string; status: string; motivo_recusa: string | null; criado_em: string;
}

const STATUS_PED: Record<string, { txt: string; cls: string }> = {
  pendente:   { txt: "Em análise",  cls: "bg-amber-500/15 text-amber-300" },
  aprovado:   { txt: "Aprovado",    cls: "bg-emerald-500/15 text-emerald-300" },
  convertido: { txt: "Virou campanha", cls: "bg-emerald-500/15 text-emerald-300" },
  recusado:   { txt: "Recusado",    cls: "bg-red-500/15 text-red-300" },
};

export function Simulador({ token }: { token: string }) {
  const [cfg, setCfg] = useState<SimuladorConfig | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  // estado do simulador
  const [orientacao, setOrientacao] = useState<"retrato" | "paisagem">("retrato");
  const [modo, setModo] = useState<"insercoes" | "orcamento">("insercoes");
  const [insercoes, setInsercoes] = useState(0);
  const [segundos, setSegundos] = useState(10);
  const [dias, setDias] = useState(0);
  const [orcamento, setOrcamento] = useState(0);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      api(token, "/api/painel/simulador").then(r => r.json()),
      api(token, "/api/painel/pedidos").then(r => r.json()),
    ]);
    if (c.ok) {
      setCfg(c.config);
      setInsercoes(c.config.min_insercoes_dia);
      setDias(c.config.min_dias);
      setOrcamento(c.config.min_valor);
      setSegundos(c.config.duracoes_seg?.[0] ?? 10);
    }
    if (p.ok) setPedidos(p.pedidos);
    setLoading(false);
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  if (!cfg || !cfg.ativo) return <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-500">Simulador indisponível no momento. Fale com a Three Digital.</div>;

  // cálculo: no modo orçamento, deriva inserções; no modo inserções, deriva valor
  const insEfetivo = modo === "orcamento" ? insercoesPorOrcamento(cfg.preco_segundo, orcamento, segundos, dias) : insercoes;
  const valor = calcularValor(cfg.preco_segundo, { insercoes_dia: insEfetivo, segundos, dias });
  const erros = validarPedido(cfg, { insercoes_dia: insEfetivo, segundos, dias });
  const totalInsercoes = insEfetivo * dias;

  async function enviar() {
    if (erros.length) { notify(erros[0], "error"); return; }
    setBusy(true);
    const r = await api(token, "/api/painel/pedidos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orientacao, insercoes_dia: insEfetivo, segundos, dias, observacao: obs || undefined }),
    });
    const d = await r.json(); setBusy(false);
    if (!d.ok) { notify(d.error || "Erro", "error"); return; }
    notify("Pedido enviado! A Three Digital vai revisar e liberar pra pagamento.", "success");
    setObs("");
    carregar();
  }

  return (
    <div className="mt-6 space-y-6">
      {/* ─── Orientação (com mockups) ─── */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-300">1. Escolha o formato do totem</p>
        <div className="grid grid-cols-2 gap-3">
          <OrientacaoCard tipo="retrato" ativo={orientacao === "retrato"} onClick={() => setOrientacao("retrato")} />
          <OrientacaoCard tipo="paisagem" ativo={orientacao === "paisagem"} onClick={() => setOrientacao("paisagem")} />
        </div>
      </div>

      {/* ─── Parâmetros ─── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="mb-3 text-sm font-semibold text-slate-300">2. Monte seu pedido</p>

        {/* modo */}
        <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1 text-sm">
          <button onClick={() => setModo("insercoes")} className={`rounded-lg px-3 py-1.5 font-medium transition ${modo === "insercoes" ? "bg-brand text-white" : "text-slate-400"}`}>Por inserções</button>
          <button onClick={() => setModo("orcamento")} className={`rounded-lg px-3 py-1.5 font-medium transition ${modo === "orcamento" ? "bg-brand text-white" : "text-slate-400"}`}>Por orçamento</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {modo === "insercoes" ? (
            <Campo label={`Inserções por dia (mín. ${cfg.min_insercoes_dia})`}>
              <input type="number" min={cfg.min_insercoes_dia} value={insercoes} onChange={e => setInsercoes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
            </Campo>
          ) : (
            <Campo label={`Seu orçamento (mín. ${brl(cfg.min_valor)})`}>
              <input type="number" min={0} step="10" value={orcamento} onChange={e => setOrcamento(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
            </Campo>
          )}

          <Campo label="Duração de cada inserção">
            <select value={segundos} onChange={e => setSegundos(parseInt(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50">
              {cfg.duracoes_seg.map(s => <option key={s} value={s}>{s} segundos</option>)}
            </select>
          </Campo>

          <Campo label={`Duração da campanha (mín. ${cfg.min_dias} dias)`}>
            <input type="number" min={cfg.min_dias} value={dias} onChange={e => setDias(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
          </Campo>

          <Campo label="Observação (opcional)">
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="ex: prefiro tal cidade"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand/50" />
          </Campo>
        </div>
      </div>

      {/* ─── Resumo ─── */}
      <div className="rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 to-transparent p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1 text-sm text-slate-300">
            <p>Formato: <strong className="capitalize">{orientacao}</strong></p>
            <p>{insEfetivo.toLocaleString("pt-BR")} inserções/dia · {segundos}s · {dias} dias</p>
            <p className="text-xs text-slate-400">{totalInsercoes.toLocaleString("pt-BR")} inserções no total</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-400">Valor estimado</p>
            <p className="text-3xl font-bold text-brand-light">{brl(valor)}</p>
          </div>
        </div>
        {erros.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
            {erros.map((e, i) => <p key={i}>⚠ {e}</p>)}
          </div>
        )}
        <button onClick={enviar} disabled={busy || erros.length > 0} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar pedido pra análise
        </button>
        <p className="mt-2 text-center text-[11px] text-slate-500">A Three Digital revisa o pedido e libera pra pagamento no painel.</p>
      </div>

      {/* ─── Meus pedidos ─── */}
      {pedidos.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-300">Meus pedidos</p>
          <div className="space-y-2">
            {pedidos.map(p => {
              const st = STATUS_PED[p.status] ?? { txt: p.status, cls: "bg-slate-500/15 text-slate-300" };
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <div>
                    <span className="capitalize">{p.orientacao}</span> · {p.insercoes_dia} ins/dia · {p.segundos}s · {p.dias} dias
                    <span className="ml-2 font-semibold text-brand-light">{brl(Number(p.valor))}</span>
                    {p.status === "recusado" && p.motivo_recusa && <p className="text-xs text-red-300/80">Motivo: {p.motivo_recusa}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.txt}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function OrientacaoCard({ tipo, ativo, onClick }: { tipo: "retrato" | "paisagem"; ativo: boolean; onClick: () => void }) {
  const Icon = tipo === "retrato" ? Smartphone : Monitor;
  const img = tipo === "retrato" ? "/mockups/totem-retrato.png" : "/mockups/totem-paisagem.png";
  return (
    <button onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-3 text-left transition ${ativo ? "border-brand bg-brand/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
      <div className={`mb-2 flex items-center justify-center overflow-hidden rounded-xl bg-black/30 ${tipo === "retrato" ? "h-44" : "h-44"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={`Totem ${tipo}`} className={tipo === "retrato" ? "h-full w-auto object-contain" : "w-full h-auto object-contain"}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      </div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-light" />
        <span className="font-semibold capitalize">{tipo}</span>
        {ativo && <Check className="ml-auto h-4 w-4 text-brand-light" />}
      </div>
      <p className="text-[11px] text-slate-400">{tipo === "retrato" ? "Totem em pé (vertical)" : "Tela deitada (horizontal)"}</p>
    </button>
  );
}
