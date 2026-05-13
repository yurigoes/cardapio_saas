"use client";

/**
 * /admin/vps — painel de controle da VPS via vps-agent
 *
 * Permite ao master executar comandos no host sem SSH:
 *   - status (uptime, ram, cpu, docker)
 *   - disco (df)
 *   - docker ps + prune
 *   - lista discos (sem formatar — só visualizar)
 *   - speedtest, backup db, restart container, exec migration
 *   - modo manutenção
 */
import { useEffect, useState, useCallback } from "react";
import {
  Server, HardDrive, Cpu, RefreshCw, Trash2, AlertTriangle, Check,
  Copy, Power, Database, Wrench, Wifi, Activity, Plus, X,
} from "lucide-react";

interface Agent {
  id: string; nome: string; prefix: string; ativo: boolean;
  ultimo_ping: string | null; ultimo_ip: string | null;
  versao: string | null; hostname: string | null;
}

interface ManutencaoCfg {
  ativo: boolean;
  mensagem?: string;
}

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

function isOnline(ts: string | null) {
  return ts ? Date.now() - new Date(ts).getTime() < 60_000 : false;
}

export default function VpsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [keyCriada, setKeyCriada] = useState<{ nome: string; key: string } | null>(null);
  const [manutencao, setManutencao] = useState<ManutencaoCfg>({ ativo: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<{ titulo: string; conteudo: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const auth = () => ({
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("access_token") : ""}`,
    "Content-Type": "application/json",
  });

  const carregar = useCallback(async () => {
    const [a, m] = await Promise.all([
      fetch("/api/admin/vps/agents",        { headers: auth() }).then(r => r.json()).catch(() => ({})),
      fetch("/api/admin/settings/manutencao",{ headers: auth() }).then(r => r.json()).catch(() => ({})),
    ]);
    if (a.success) setAgents(a.data ?? []);
    if (m.success && m.data?.valor) setManutencao(m.data.valor as ManutencaoCfg);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const i = setInterval(carregar, 15_000);
    return () => clearInterval(i);
  }, [carregar]);

  async function gerarKey() {
    if (!novoNome.trim()) return;
    const r = await fetch("/api/admin/vps/agents", {
      method: "POST", headers: auth(),
      body: JSON.stringify({ nome: novoNome.trim() }),
    }).then(r => r.json());
    if (r.success) {
      setKeyCriada({ nome: r.data.nome, key: r.data.agent_key });
      setNovoNome("");
      carregar();
    } else alert(r.error?.message ?? "Falha");
  }

  async function exec(comando: string, params?: Record<string, unknown>, titulo?: string) {
    setBusy(comando);
    setOutput(null);
    try {
      const r = await fetch("/api/admin/vps/exec", {
        method: "POST", headers: auth(),
        body: JSON.stringify({ comando, params }),
      });
      const d = await r.json();
      if (d.success) {
        const c = d.data?.status === "sucesso"
          ? JSON.stringify(d.data.resultado, null, 2)
          : `${d.data?.status === "timeout" ? "⏱ TIMEOUT" : "✗ ERRO"}: ${d.data?.erro ?? d.data?.mensagem ?? "?"}`;
        setOutput({ titulo: titulo ?? comando, conteudo: c });
      } else {
        setOutput({ titulo: comando, conteudo: `Falha: ${d.error?.message ?? d.error}` });
      }
    } finally { setBusy(null); }
  }

  async function toggleManutencao() {
    const novo = { ...manutencao, ativo: !manutencao.ativo };
    const r = await fetch("/api/admin/settings/manutencao", {
      method: "PATCH", headers: auth(),
      body: JSON.stringify({ valor: novo }),
    }).then(r => r.json());
    if (r.success) setManutencao(novo);
  }

  function copiar(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const algumOnline = agents.some(a => a.ativo && isOnline(a.ultimo_ping));

  return (
    <div className="space-y-6 pb-12 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Server className="h-5 w-5 text-emerald-400" />
            Controle da VPS
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Comandos no servidor sem precisar de SSH (via vps-agent local)
          </p>
        </div>
        <button onClick={carregar}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {/* Modo manutenção */}
      <section className={`rounded-2xl border p-5 ${
        manutencao.ativo
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-white/10 bg-white/5"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className={`h-6 w-6 ${manutencao.ativo ? "text-amber-400" : "text-slate-400"}`} />
            <div>
              <h2 className="font-bold text-white">
                Modo manutenção {manutencao.ativo
                  ? <span className="text-amber-400">ATIVO</span>
                  : <span className="text-slate-500">desligado</span>}
              </h2>
              <p className="text-xs text-slate-400">
                {manutencao.ativo
                  ? "POST /api/pedidos retorna 403 — clientes não conseguem fazer pedido"
                  : "Sistema operando normalmente"}
              </p>
            </div>
          </div>
          <button onClick={toggleManutencao}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              manutencao.ativo
                ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                : "bg-amber-500 hover:bg-amber-400 text-white"
            }`}>
            {manutencao.ativo ? "Desativar" : "Ativar manutenção"}
          </button>
        </div>
      </section>

      {/* Agentes */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <Wifi className="h-4 w-4" /> Agentes VPS
          {algumOnline ? <span className="text-emerald-400 text-xs">● online</span>
                       : <span className="text-amber-400 text-xs">● offline</span>}
        </h2>

        {keyCriada && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">Agente "{keyCriada.nome}" criado</h3>
              <button onClick={() => setKeyCriada(null)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl bg-slate-900 p-3 flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-emerald-300 break-all">{keyCriada.key}</code>
              <button onClick={() => copiar(keyCriada.key)}
                className="rounded-lg bg-emerald-500 p-2 text-white hover:brightness-110">
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="text-xs text-slate-300 space-y-1">
              <p className="font-bold text-amber-300">⚠ Salve agora — não vai aparecer de novo</p>
              <p className="font-bold text-white mt-2">Instalar na VPS:</p>
              <pre className="bg-slate-900 p-2 rounded text-xs overflow-x-auto">{`cd /opt/cardapio_saas/vps-agent
sudo node setup.js
# (cola a key acima)
sudo bash install-systemd.sh`}</pre>
            </div>
          </div>
        )}

        {!keyCriada && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex gap-2">
            <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
              placeholder="Nome (ex: vps-principal, vps-backup)"
              className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white" />
            <button onClick={gerarKey} disabled={!novoNome.trim()}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
              <Plus className="h-4 w-4" /> Gerar key
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5">
          {agents.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nenhum agente cadastrado</p>
          ) : (
            <div className="divide-y divide-white/5">
              {agents.map(a => {
                const on = isOnline(a.ultimo_ping);
                return (
                  <div key={a.id} className="p-4 flex items-center gap-3">
                    <Server className={`h-5 w-5 ${on ? "text-emerald-400" : "text-slate-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white">
                        {a.nome}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          on ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"
                        }`}>{on ? "ONLINE" : "offline"}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.hostname && `${a.hostname} · `}{a.prefix}*** · v{a.versao ?? "?"} · ping {fmtData(a.ultimo_ping)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Comandos */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
          <Activity className="h-4 w-4" /> Comandos
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Btn icon={Cpu}   label="Status" onClick={() => exec("status",     {}, "Status do servidor")} busy={busy === "status"} />
          <Btn icon={HardDrive} label="Disco" onClick={() => exec("disk",     {}, "Espaço em disco")} busy={busy === "disk"} />
          <Btn icon={Server} label="Docker ps" onClick={() => exec("docker_ps",{}, "Containers")} busy={busy === "docker_ps"} />
          <Btn icon={HardDrive} label="Discos detectados" onClick={() => exec("lista_discos",{}, "Discos físicos")} busy={busy === "lista_discos"} />
          <Btn icon={Activity} label="Speed test" onClick={() => exec("speedtest", {}, "Teste de internet")} busy={busy === "speedtest"} />
          <Btn icon={Database} label="Backup banco" onClick={() => exec("backup_db", {}, "Backup Postgres")} busy={busy === "backup_db"} />
          <Btn icon={Power} label="Restart app" variant="warning"
               onClick={() => confirm("Reiniciar cardapio_app? Vai dar downtime de ~10s.") && exec("restart_container", { nome: "cardapio_app" }, "Restart cardapio_app")}
               busy={busy === "restart_container"} />
          <Btn icon={Trash2} label="Limpar Docker" variant="danger"
               onClick={() => confirm("Roda 'docker system prune --volumes -f'. Apaga imagens/volumes não usados. Continuar?") && exec("docker_prune", { volumes: true }, "Limpeza Docker")}
               busy={busy === "docker_prune"} />
        </div>
      </section>

      {/* Output */}
      {output && (
        <section className="rounded-2xl border border-white/10 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white">{output.titulo}</h3>
            <div className="flex gap-2">
              <button onClick={() => copiar(output.conteudo)}
                className="rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5 text-slate-300">
                {copiado ? "Copiado!" : "Copiar"}
              </button>
              <button onClick={() => setOutput(null)}
                className="rounded-lg border border-white/10 p-1 text-slate-400 hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all overflow-x-auto max-h-[60vh]">
            {output.conteudo}
          </pre>
        </section>
      )}
    </div>
  );
}

function Btn({
  label, icon: Icon, variant = "default", onClick, busy,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "danger";
  onClick: () => void;
  busy?: boolean;
}) {
  const cls = {
    default: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    danger:  "border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  }[variant];
  return (
    <button onClick={onClick} disabled={busy}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${cls}`}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{busy ? "..." : label}</span>
    </button>
  );
}
