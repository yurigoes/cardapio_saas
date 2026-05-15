"use client";

/**
 * /painel/maquinas — UI da empresa pra ver suas máquinas + registrar nova.
 *
 * - Lista todas as máquinas/agentes
 * - Botão "Adicionar máquina" abre modal: escolhe tipo + nome → gera token único
 * - Token é mostrado UMA vez com botão de copiar — depois só hash fica
 * - Pode renomear ou desativar máquinas existentes
 */
import { useEffect, useState } from "react";
import {
  Server, Monitor, Tv2, Smartphone, Printer, Box,
  Plus, RefreshCw, Trash2, Copy, CheckCircle2,
  XCircle, Clock, AlertTriangle, X, KeyRound,
} from "lucide-react";

interface Agente {
  id:                string;
  agente_id:         string;
  tipo:              string;
  nome:              string;
  hostname:          string | null;
  ip_ultimo:         string | null;
  plataforma:        string | null;
  versao:            string | null;
  status:            "online" | "offline" | "aguardando" | "desativado";
  ultimo_hb_em:      string | null;
  registrado_em:     string;
  fila_pendente:     number;
  token_prefix:      string;
}

const TIPOS: Array<{ value: string; label: string; icon: typeof Server; desc: string }> = [
  { value: "retaguarda", label: "Retaguarda local",   icon: Server,     desc: "Mini-PC do balcão (servidor local offline-first)" },
  { value: "terminal",   label: "Terminal / PDV",     icon: Monitor,    desc: "Computador de caixa, escritório, atendimento" },
  { value: "kiosk",      label: "Kiosk / Totem",      icon: Tv2,        desc: "Auto-atendimento do cliente" },
  { value: "tv",         label: "TV / Painel cozinha", icon: Tv2,       desc: "Display da cozinha (KDS) ou senha" },
  { value: "garcom",     label: "Tablet do garçom",   icon: Smartphone, desc: "Pedido na mesa via dispositivo móvel" },
  { value: "impressora", label: "Impressora de rede", icon: Printer,    desc: "Impressora térmica com agente próprio" },
  { value: "outro",      label: "Outro",              icon: Box,        desc: "Qualquer outra integração" },
];

const STATUS_BADGES: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  online:     { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2, label: "Online" },
  offline:    { color: "bg-red-500/15 text-red-400 border-red-500/30",            icon: XCircle,      label: "Offline" },
  aguardando: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: Clock,        label: "Aguardando 1º hb" },
  desativado: { color: "bg-slate-500/15 text-slate-400 border-slate-500/30",      icon: AlertTriangle,label: "Desativado" },
};

function tempoAtras(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const s = Math.floor(ms / 1000); if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);    if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);    if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);    return `${d}d atrás`;
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function PainelMaquinasPage() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [novoTipo, setNovoTipo] = useState<string>("retaguarda");
  const [novoNome, setNovoNome] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [tokenGerado, setTokenGerado] = useState<{ raw: string; nome: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/painel/agentes", { headers: authHeaders(), cache: "no-store" });
      const data = await r.json();
      if (data.success) setAgentes(data.data.agentes ?? []);
    } catch {/* */}
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, []);

  async function criar() {
    if (novoNome.trim().length < 2) { setErro("Nome muito curto"); return; }
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/painel/agentes", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ tipo: novoTipo, nome: novoNome.trim() }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data?.error || "Falha ao criar");
      setTokenGerado({ raw: data.data.token, nome: data.data.agente.nome });
      setModal(false);
      setNovoNome("");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setSalvando(false); }
  }

  async function desativar(a: Agente) {
    if (!confirm(`Desativar ${a.nome}? O token ficará inválido.`)) return;
    try {
      await fetch(`/api/painel/agentes/${a.id}`, { method: "DELETE", headers: authHeaders() });
      carregar();
    } catch {/* */}
  }

  function copyToken() {
    if (!tokenGerado) return;
    navigator.clipboard.writeText(tokenGerado.raw).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Máquinas</h1>
          <p className="text-xs text-slate-400">
            Retaguarda local, terminais, kiosks e impressoras conectadas a esta empresa.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={() => { setModal(true); setNovoNome(""); setErro(null); }}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"
          >
            <Plus className="h-4 w-4" />
            Adicionar máquina
          </button>
        </div>
      </header>

      {/* Lista */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {agentes.length === 0 && !loading && (
          <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-white/10 bg-slate-900 p-12 text-center">
            <Server className="mx-auto mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">Nenhuma máquina registrada ainda</p>
            <p className="mt-1 text-xs text-slate-500">
              Adicione sua retaguarda local, terminais ou kiosk pra começar a monitorar.
            </p>
          </div>
        )}
        {agentes.map((a) => {
          const tipoCfg = TIPOS.find(t => t.value === a.tipo) ?? TIPOS.find(t => t.value === "outro")!;
          const Icon  = tipoCfg.icon;
          const cfg   = STATUS_BADGES[a.status] ?? STATUS_BADGES.aguardando;
          const StIcon = cfg.icon;
          return (
            <div key={a.id} className="rounded-xl border border-white/10 bg-slate-900 p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-lg bg-white/5 p-2">
                    <Icon className="h-4 w-4 text-slate-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{a.nome}</p>
                    <p className="text-[10px] uppercase text-slate-500">{tipoCfg.label}</p>
                  </div>
                </div>
                <button
                  onClick={() => desativar(a)}
                  className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                  title="Desativar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium mb-3 ${cfg.color}`}>
                <StIcon className="h-3 w-3" />
                {cfg.label}
              </span>

              <dl className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Último heartbeat:</dt>
                  <dd className="text-slate-300">{tempoAtras(a.ultimo_hb_em)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">IP:</dt>
                  <dd className="text-slate-300 font-mono text-[10px]">{a.ip_ultimo ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Versão:</dt>
                  <dd className="text-slate-300">{a.versao ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Token:</dt>
                  <dd className="text-slate-400 font-mono text-[10px]">{a.token_prefix}…</dd>
                </div>
                {a.fila_pendente > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Fila pendente:</dt>
                    <dd className="text-amber-400 font-semibold">{a.fila_pendente}</dd>
                  </div>
                )}
              </dl>
            </div>
          );
        })}
      </div>

      {/* Modal: criar máquina */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Adicionar máquina</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Gera token único pra autenticar o agente local.
                </p>
              </div>
              <button onClick={() => setModal(false)} className="rounded p-1 text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Tipo</p>
            <div className="mb-4 grid grid-cols-2 gap-2 max-h-[260px] overflow-auto pr-1">
              {TIPOS.map((t) => {
                const TIcon = t.icon;
                const sel = novoTipo === t.value;
                return (
                  <label
                    key={t.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition ${
                      sel
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipo"
                      checked={sel}
                      onChange={() => setNovoTipo(t.value)}
                      className="mt-1 h-3.5 w-3.5 accent-emerald-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <TIcon className="h-3.5 w-3.5 text-slate-300" />
                        <p className="text-xs font-semibold text-white">{t.label}</p>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500">{t.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-400">Nome amigável</label>
            <input
              type="text"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex: PDV Caixa 1, Retaguarda Loja, Kiosk Entrada"
              maxLength={100}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none"
            />

            {erro && (
              <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">
                {erro}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setModal(false)}
                disabled={salvando}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={criar}
                disabled={salvando || novoNome.trim().length < 2}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {salvando ? "Gerando..." : "Gerar token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: token gerado (mostrado UMA vez) */}
      {tokenGerado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border-2 border-amber-500/50 bg-slate-900 p-6 shadow-2xl shadow-amber-900/30">
            <div className="mb-4 flex items-start gap-3">
              <KeyRound className="h-8 w-8 text-amber-400 flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white">Token gerado para {tokenGerado.nome}</h3>
                <p className="mt-1 text-xs text-amber-300">
                  ⚠ Copie agora — esse token <strong>não pode ser recuperado depois</strong>.
                  Se perder, terá que gerar uma nova máquina.
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-amber-500/30 bg-slate-950 p-3 font-mono text-xs text-amber-200 break-all">
              {tokenGerado.raw}
            </div>

            <button
              onClick={copyToken}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              {copiado ? <><CheckCircle2 className="h-4 w-4" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar token</>}
            </button>
            <p className="mb-4 text-[10px] text-slate-500">
              Use no agente:{" "}
              <code className="rounded bg-slate-800 px-1.5 py-0.5">Authorization: Bearer {tokenGerado.raw.slice(0, 16)}...</code>
            </p>

            <button
              onClick={() => { setTokenGerado(null); setCopiado(false); }}
              className="w-full rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
            >
              Já copiei, fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
