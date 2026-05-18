"use client";

/**
 * /painel/impressoras — gerencia impressoras térmicas + agentes locais.
 * Master/admin/gerente.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Printer, Plus, Trash2, Copy, Check, AlertTriangle, RefreshCw,
  Wifi, WifiOff, Cpu, Download,
} from "lucide-react";
import { confirmar, alertar } from "@/components/ui/ConfirmModal";

interface Impressora {
  id:           string;
  nome:         string;
  setor:        "cozinha" | "bar" | "balcao" | "retirada" | "caixa";
  tipo:         "tcp" | "usb" | "system";
  ip:           string | null;
  porta:        number;
  largura_cols: number;
  ativa:        boolean;
  ultimo_ping:  string | null;
  created_at:   string;
}

interface Agent {
  id:          string;
  nome:        string;
  prefix:      string;
  ativo:       boolean;
  ultimo_ping: string | null;
  pingou_ha_seg: number | null;
  ultimo_ip:   string | null;
  versao:      string | null;
  created_at:  string;
}

const SETORES: Impressora["setor"][] = ["cozinha", "bar", "balcao", "retirada", "caixa"];

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function isOnline(a: { pingou_ha_seg?: number | null; ultimo_ping?: string | null }) {
  if (a.pingou_ha_seg != null) return a.pingou_ha_seg < 60;
  return a.ultimo_ping ? Date.now() - new Date(a.ultimo_ping).getTime() < 60_000 : false;
}

export default function ImpressorasPage() {
  const [imps, setImps]       = useState<Impressora[]>([]);
  const [agents, setAgents]   = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // form impressora
  const [novaImp, setNovaImp] = useState({
    nome: "", setor: "cozinha" as Impressora["setor"], tipo: "tcp" as Impressora["tipo"],
    ip: "", porta: 9100, largura_cols: 48,
  });

  // form agent
  const [novoAgentNome, setNovoAgentNome] = useState("");
  const [keyCriada, setKeyCriada]         = useState<{ nome: string; key: string } | null>(null);
  const [copiado, setCopiado]             = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const h = { Authorization: `Bearer ${t}` };
      const [r1, r2] = await Promise.all([
        fetch("/api/painel/impressoras",  { headers: h }).then(r => r.json()),
        fetch("/api/painel/print-agents", { headers: h }).then(r => r.json()),
      ]);
      if (r1.success) setImps(r1.data ?? []);
      if (r2.success) setAgents(r2.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const i = setInterval(carregar, 15000);
    return () => clearInterval(i);
  }, [carregar]);

  async function criarImp() {
    if (!novaImp.nome.trim()) return;
    const t = localStorage.getItem("access_token") ?? "";
    const r = await fetch("/api/painel/impressoras", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        ...novaImp,
        nome: novaImp.nome.trim(),
        ip:   novaImp.ip.trim() || undefined,
      }),
    }).then(r => r.json());
    if (r.success) {
      setNovaImp({ nome: "", setor: "cozinha", tipo: "tcp", ip: "", porta: 9100, largura_cols: 48 });
      carregar();
    } else {
      await alertar({ titulo: "Falha ao adicionar impressora", mensagem: r.error?.message ?? "", tipo: "perigo" });
    }
  }

  async function toggleAtiva(imp: Impressora) {
    const t = localStorage.getItem("access_token") ?? "";
    await fetch(`/api/painel/impressoras/${imp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ ativa: !imp.ativa }),
    });
    carregar();
  }

  async function removerImp(imp: Impressora) {
    if (!await confirmar({ titulo: `Remover impressora "${imp.nome}"?`, okLabel: "Remover", perigo: true })) return;
    const t = localStorage.getItem("access_token") ?? "";
    await fetch(`/api/painel/impressoras/${imp.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    carregar();
  }

  async function toggleAgent(a: Agent) {
    const t = localStorage.getItem("access_token") ?? "";
    await fetch(`/api/painel/print-agents/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ ativo: !a.ativo }),
    });
    carregar();
  }

  async function removerAgent(a: Agent) {
    if (!await confirmar({ titulo: `Remover agente "${a.nome}"?`, mensagem: "A key fica inválida imediatamente.", okLabel: "Remover", perigo: true })) return;
    const t = localStorage.getItem("access_token") ?? "";
    await fetch(`/api/painel/print-agents/${a.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
    carregar();
  }

  async function criarAgent() {
    if (!novoAgentNome.trim()) return;
    const t = localStorage.getItem("access_token") ?? "";
    const r = await fetch("/api/painel/print-agents", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ nome: novoAgentNome.trim() }),
    }).then(r => r.json());
    if (r.success) {
      setKeyCriada({ nome: r.data.nome, key: r.data.agent_key });
      setNovoAgentNome("");
      carregar();
    } else {
      await alertar({ titulo: "Falha ao criar agente", mensagem: r.error?.message ?? "", tipo: "perigo" });
    }
  }

  function copiar(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Printer className="h-5 w-5 text-emerald-400" />
            Impressoras &amp; Agente local
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Configure impressoras térmicas (ESC/POS) por setor e instale o agente local
            para imprimir sem precisar de popup no navegador.
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* ─── AGENTES ─── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <Cpu className="h-4 w-4" /> Agentes locais
        </h2>

        {keyCriada && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-400" />
              <h3 className="font-bold text-white">Agente &ldquo;{keyCriada.nome}&rdquo; criado</h3>
            </div>
            <div className="rounded-xl bg-slate-900 p-3 flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-emerald-300 break-all">{keyCriada.key}</code>
              <button
                onClick={() => copiar(keyCriada.key)}
                className="rounded-lg bg-emerald-500 p-2 text-white hover:brightness-110"
              >
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <p>Salve esta key agora. Ela não vai ser exibida de novo — só revogar e gerar nova.</p>
            </div>
            <div className="rounded-lg bg-slate-900/50 p-3 text-xs text-slate-300 space-y-2">
              <p className="font-bold text-white flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" /> Como instalar:
              </p>
              <a
                href={`/api/downloads/print-agent?token=${encodeURIComponent(typeof window !== "undefined" ? (localStorage.getItem("access_token") ?? "") : "")}`}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
              >
                <Download className="h-3.5 w-3.5" /> Baixar agente (.tar.gz)
              </a>
              <ol className="list-decimal pl-5 space-y-0.5 text-slate-400">
                <li>Extrai o .tar.gz na máquina do restaurante (precisa Node.js 18+ — baixe em nodejs.org)</li>
                <li><b className="text-white">Windows:</b> duplo clique em <code className="text-emerald-300">setup.bat</code> — detecta impressoras automaticamente</li>
                <li>Cola a key acima e escolhe pra cada setor: rede (IP) ou Windows (lista de impressoras instaladas)</li>
                <li>Pra rodar em segundo plano: clique direito em <code className="text-emerald-300">install-service.bat</code> → "Executar como administrador"</li>
              </ol>
            </div>
            <button
              onClick={() => setKeyCriada(null)}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:brightness-110"
            >
              Já salvei, fechar
            </button>
          </div>
        )}

        {!keyCriada && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex gap-2">
            <input
              value={novoAgentNome}
              onChange={e => setNovoAgentNome(e.target.value)}
              placeholder="Nome do agente (ex: PC-Caixa, Servidor-Cozinha)"
              className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
            <button
              onClick={criarAgent}
              disabled={!novoAgentNome.trim()}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Gerar key
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {agents.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nenhum agente cadastrado</p>
          ) : (
            <div className="divide-y divide-white/5">
              {agents.map(a => {
                const online = isOnline(a);
                return (
                  <div key={a.id} className="p-4 flex items-center gap-3">
                    {online
                      ? <Wifi    className="h-5 w-5 text-emerald-400" />
                      : <WifiOff className="h-5 w-5 text-slate-500" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white truncate">{a.nome}</p>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          online ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"
                        }`}>
                          {online ? "ONLINE" : "offline"}
                        </span>
                        {!a.ativo && (
                          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
                            DESATIVADO
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs font-mono text-slate-500">{a.prefix}***</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        último ping {fmtDate(a.ultimo_ping)}
                        {a.ultimo_ip && ` · ${a.ultimo_ip}`}
                        {a.versao && ` · v${a.versao}`}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleAgent(a)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
                    >
                      {a.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => removerAgent(a)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                      title="Remover agente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─── IMPRESSORAS ─── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <Printer className="h-4 w-4" /> Impressoras
        </h2>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <input
              value={novaImp.nome}
              onChange={e => setNovaImp({ ...novaImp, nome: e.target.value })}
              placeholder="Nome"
              className="md:col-span-2 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
            <select
              value={novaImp.setor}
              onChange={e => setNovaImp({ ...novaImp, setor: e.target.value as Impressora["setor"] })}
              className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={novaImp.ip}
              onChange={e => setNovaImp({ ...novaImp, ip: e.target.value })}
              placeholder="IP (ex: 192.168.0.100)"
              className="md:col-span-2 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
            <input
              type="number"
              value={novaImp.porta}
              onChange={e => setNovaImp({ ...novaImp, porta: parseInt(e.target.value, 10) || 9100 })}
              placeholder="Porta"
              className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <button
            onClick={criarImp}
            disabled={!novaImp.nome.trim()}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Adicionar impressora
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {imps.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nenhuma impressora cadastrada</p>
          ) : (
            <div className="divide-y divide-white/5">
              {imps.map(imp => (
                <div key={imp.id} className="p-4 flex items-center gap-3">
                  <Printer className={`h-5 w-5 ${imp.ativa ? "text-emerald-400" : "text-slate-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white truncate">{imp.nome}</p>
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                        {imp.setor}
                      </span>
                      {!imp.ativa && (
                        <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
                          DESATIVADA
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {imp.tipo === "tcp"
                        ? `${imp.ip ?? "?"}:${imp.porta}`
                        : imp.tipo}
                      {" · "}{imp.largura_cols} cols
                    </p>
                  </div>
                  <button
                    onClick={() => toggleAtiva(imp)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
                  >
                    {imp.ativa ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => removerImp(imp)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
