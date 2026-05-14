"use client";

/**
 * /painel/ifood — configuração da integração iFood.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Zap, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Eye, EyeOff,
  Play, ScrollText,
} from "lucide-react";
import Link from "next/link";
import { alertar } from "@/components/ui/ConfirmModal";

interface IfoodConfig {
  id:              string;
  client_id:       string;
  merchant_id:     string | null;
  ambiente:        "sandbox" | "producao";
  ativo:           boolean;
  polling_ativo:   boolean;
  ultimo_polling_em: string | null;
  ultimo_evento_id:  string | null;
  ultimo_erro:       string | null;
  ultimo_erro_em:    string | null;
  token_expira_em:   string | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
};

export default function IfoodPage() {
  const [cfg, setCfg]         = useState<IfoodConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);

  // Form
  const [clientId, setClientId]         = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [merchantId, setMerchantId]     = useState("");
  const [ambiente, setAmbiente]         = useState<"sandbox" | "producao">("producao");
  const [ativo, setAtivo]               = useState(true);
  const [pollingAtivo, setPollingAtivo] = useState(false);
  const [showSecret, setShowSecret]     = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/ifood", { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (d.success && d.data) {
        setCfg(d.data);
        setClientId(d.data.client_id ?? "");
        setMerchantId(d.data.merchant_id ?? "");
        setAmbiente(d.data.ambiente ?? "producao");
        setAtivo(d.data.ativo ?? true);
        setPollingAtivo(d.data.polling_ativo ?? false);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setSaving(true); setMsg(null);
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/ifood", {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          client_id:     clientId,
          client_secret: clientSecret || undefined,
          merchant_id:   merchantId || undefined,
          ambiente, ativo, polling_ativo: pollingAtivo,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg("✓ Configuração salva!");
        setClientSecret("");  // limpa por segurança
        setTimeout(() => setMsg(null), 3000);
        carregar();
      } else {
        setMsg(d.error?.message ?? "Falha");
      }
    } finally { setSaving(false); }
  }

  async function testarPoll() {
    setMsg("Disparando polling de teste...");
    try {
      // Usa CRON_SECRET via header (precisa adicionar no .env do servidor + admin saber)
      const cron = prompt("Cole o CRON_SECRET do servidor (ou cancele):");
      if (!cron) { setMsg(null); return; }
      const r = await fetch("/api/ifood/poll", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": cron },
        body:    JSON.stringify({ empresaId: undefined }),
      });
      const d = await r.json();
      setMsg(d.ok ? `Resultado: ${JSON.stringify(d.empresas)}` : `Falha: ${d.error}`);
    } catch (e) {
      setMsg("Erro: " + (e as Error).message);
    }
  }

  async function simularPedido() {
    const t = localStorage.getItem("access_token") ?? "";
    setMsg("Simulando pedido iFood (sem chamar API)...");
    try {
      const r = await fetch("/api/painel/ifood/simular", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body:    JSON.stringify({ mode: "delivery" }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({
          titulo:   "✓ Pedido simulado criado",
          mensagem: `Pedido #${d.data.pedido_numero} criado.\n\nVá em /painel/pedidos pra ver — cozinha imprimiu automaticamente. Use /painel/ifood/eventos pra ver o log.`,
          tipo:     "sucesso",
        });
        setMsg(`✓ Pedido #${d.data.pedido_numero} simulado (ifood: ${d.data.ifood_order_id})`);
      } else {
        setMsg(`Falha: ${d.error?.message ?? "?"}`);
      }
    } catch (e) {
      setMsg("Erro: " + (e as Error).message);
    }
  }

  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Zap className="h-5 w-5 text-red-400" />
            Integração iFood
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Receba pedidos do iFood automaticamente. Cron externo chama
            <code className="text-emerald-400"> /api/ifood/poll</code> a cada 30s.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/painel/ifood/eventos"
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5">
            <ScrollText className="h-3.5 w-3.5" /> Eventos
          </Link>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Status */}
      {cfg && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Status atual</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Polling</p>
              <p className={cfg.polling_ativo ? "text-emerald-400 font-bold" : "text-slate-500"}>
                {cfg.polling_ativo ? "Ativo" : "Inativo"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Ambiente</p>
              <p className="text-white font-bold">{cfg.ambiente.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-slate-500">Último polling</p>
              <p className="text-white">{fmtDate(cfg.ultimo_polling_em)}</p>
            </div>
            <div>
              <p className="text-slate-500">Token expira em</p>
              <p className="text-white">{fmtDate(cfg.token_expira_em)}</p>
            </div>
          </div>
          {cfg.ultimo_erro && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs">
              <div className="flex items-center gap-1.5 text-red-400 font-bold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Último erro · {fmtDate(cfg.ultimo_erro_em)}
              </div>
              <p className="mt-1 text-red-300 font-mono">{cfg.ultimo_erro}</p>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Credenciais</h3>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Client ID</label>
          <input value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder="Obtido no portal do desenvolvedor iFood"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-red-500/50 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Client Secret {cfg && <span className="text-amber-400">(deixe vazio pra manter atual)</span>}
          </label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={clientSecret} onChange={e => setClientSecret(e.target.value)}
              placeholder={cfg ? "•••••••••••••••• (cadastrado)" : "Obrigatório no primeiro setup"}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 pr-10 text-sm text-white font-mono focus:border-red-500/50 focus:outline-none"
            />
            <button onClick={() => setShowSecret(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Merchant ID (loja)</label>
          <input value={merchantId} onChange={e => setMerchantId(e.target.value)}
            placeholder="ID do restaurante/loja no iFood"
            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-red-500/50 focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ambiente</label>
            <select value={ambiente} onChange={e => setAmbiente(e.target.value as typeof ambiente)}
              className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-red-500/50 focus:outline-none">
              <option value="sandbox">Sandbox (testes)</option>
              <option value="producao">Produção</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-red-500" />
              Integração ativa
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={pollingAtivo} onChange={e => setPollingAtivo(e.target.checked)} className="accent-red-500" />
              Polling ligado
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={salvar} disabled={saving || !clientId}
            className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Salvar
          </button>
          {cfg && (
            <>
              <button onClick={testarPoll}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10">
                Testar polling agora
              </button>
              <button onClick={simularPedido}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
                title="Cria pedido fake (não chama API iFood) — testa fluxo completo: importer + cozinha + pedidos">
                <Play className="h-4 w-4" /> Simular pedido
              </button>
            </>
          )}
        </div>
        {msg && (
          <p className={`text-xs ${msg.includes("✓") ? "text-emerald-400" : "text-amber-400"}`}>
            {msg}
          </p>
        )}
      </div>

      {/* Setup do cron */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs">
        <h4 className="font-bold text-amber-300 mb-2">⚙ Setup do cron no servidor</h4>
        <p className="text-slate-300 mb-2">Adicione ao crontab do host (uma vez por instalação):</p>
        <pre className="rounded-lg bg-slate-900 p-2 overflow-auto text-emerald-300 font-mono text-[10px]">
{`* * * * * curl -sX POST -H "x-cron-secret: $CRON_SECRET" \\
  http://localhost:3000/api/ifood/poll`}
        </pre>
        <p className="mt-2 text-slate-500">
          Roda 1x/min. Cada execução faz 1 long-poll de até 30s no iFood.
        </p>
      </div>
    </div>
  );
}
