"use client";

/**
 * /painel/ifood — configuração da integração iFood.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Zap, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Eye, EyeOff,
  Play, ScrollText, KeyRound,
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
  mode:              "centralizado" | "distribuido";
  authorized_em:     string | null;
}

interface IfoodPageData {
  cfg:                            IfoodConfig | null;
  master_distribuido_disponivel:  boolean;
  master_app_nome:                string | null;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
};

export default function IfoodPage() {
  const [cfg, setCfg]                 = useState<IfoodConfig | null>(null);
  const [masterDistribuido, setMasterDistribuido] = useState(false);
  const [masterAppNome, setMasterAppNome] = useState<string | null>(null);
  // Distribuído flow state
  const [userCodeData, setUserCodeData] = useState<{ user_code: string; verification_url_complete: string; expires_in: number } | null>(null);
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [conectando, setConectando]   = useState(false);
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
        const data = d.data as IfoodPageData;
        setMasterDistribuido(data.master_distribuido_disponivel);
        setMasterAppNome(data.master_app_nome);
        if (data.cfg) {
          setCfg(data.cfg);
          setClientId(data.cfg.client_id ?? "");
          setMerchantId(data.cfg.merchant_id ?? "");
          setAmbiente(data.cfg.ambiente ?? "producao");
          setAtivo(data.cfg.ativo ?? true);
          setPollingAtivo(data.cfg.polling_ativo ?? false);
        }
      }
    } finally { setLoading(false); }
  }, []);

  // ─── Distribuído: 2-step flow (start → connect) ─────────────────────────
  async function iniciarConexaoDistribuido() {
    setMsg("Solicitando código ao iFood...");
    const t = localStorage.getItem("access_token") ?? "";
    try {
      const r = await fetch("/api/painel/ifood/distribuido/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      if (d.success) {
        setUserCodeData(d.data);
        setMsg(null);
        // Abre URL automaticamente
        window.open(d.data.verification_url_complete, "_blank", "noopener");
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } catch (e) {
      await alertar({ titulo: "Erro de rede", mensagem: (e as Error).message, tipo: "perigo" });
    }
  }

  async function finalizarConexaoDistribuido() {
    if (!authorizationCode.trim()) return;
    setConectando(true);
    const t = localStorage.getItem("access_token") ?? "";
    try {
      const r = await fetch("/api/painel/ifood/distribuido/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ authorization_code: authorizationCode.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        await alertar({
          titulo:   "✓ Conectado!",
          mensagem: d.data.mensagem ?? "iFood conectado.",
          tipo:     "sucesso",
        });
        setUserCodeData(null);
        setAuthorizationCode("");
        carregar();
      } else {
        await alertar({ titulo: "Falha", mensagem: d.error?.message ?? "?", tipo: "perigo" });
      }
    } finally { setConectando(false); }
  }

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

  async function testarCredenciais() {
    setMsg("Testando OAuth iFood (sem polling)...");
    const t = localStorage.getItem("access_token") ?? "";
    try {
      const r = await fetch("/api/painel/ifood/testar-credenciais", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      });
      const d = await r.json();
      const data = d.data ?? d;
      if (data.ok) {
        await alertar({
          titulo:   "✓ Credenciais OK",
          mensagem: data.mensagem,
          tipo:     "sucesso",
        });
        setMsg("✓ " + data.mensagem);
      } else {
        const detalhes = data.ifood_response
          ? `\n\nResposta iFood:\n${typeof data.ifood_response === "string" ? data.ifood_response : JSON.stringify(data.ifood_response, null, 2)}`
          : "";
        await alertar({
          titulo:   `✗ Falha em "${data.etapa}"`,
          mensagem: `${data.mensagem}\n\n${data.diagnostico ?? ""}${detalhes}`,
          tipo:     "perigo",
        });
        setMsg(`✗ ${data.etapa}: ${data.mensagem}`);
      }
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

      {/* DISTRIBUÍDO — fluxo simplificado quando master configurou */}
      {masterDistribuido && cfg?.mode !== "distribuido" && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Conexão simplificada disponível!
            </h3>
            <p className="mt-1 text-xs text-emerald-200">
              {masterAppNome ?? "App SaaS"} já está aprovada no iFood.
              Você só precisa autorizar SUA loja — sem precisar criar app própria, sem cliente_id/secret.
            </p>
          </div>

          {!userCodeData ? (
            <button onClick={iniciarConexaoDistribuido}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-sm font-bold text-white">
              <Zap className="h-4 w-4" /> Conectar com iFood (1 clique)
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-slate-900 p-4">
              <p className="text-xs text-slate-300">
                <strong className="text-emerald-300">Passo 1:</strong> abrimos o portal iFood pra você.
                Faça login com a conta da loja → autorize a app → vai aparecer um <strong>código</strong>.
              </p>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-center">
                <p className="text-xs text-blue-300 mb-1">Código de verificação:</p>
                <p className="text-2xl font-bold font-mono tracking-wider text-white">{userCodeData.user_code}</p>
                <a href={userCodeData.verification_url_complete} target="_blank" rel="noopener"
                  className="text-xs text-blue-300 underline mt-1 inline-block">
                  Reabrir portal iFood
                </a>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  <strong className="text-emerald-300">Passo 2:</strong> cole o <strong>authorization code</strong> que apareceu no portal:
                </label>
                <input value={authorizationCode}
                  onChange={e => setAuthorizationCode(e.target.value)}
                  placeholder="ex: A1B2C3D4-..."
                  className="w-full rounded-lg border border-emerald-500/30 bg-slate-800 px-3 py-2 text-sm font-mono text-white" />
              </div>
              <div className="flex gap-2">
                <button onClick={finalizarConexaoDistribuido}
                  disabled={conectando || !authorizationCode.trim()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                  {conectando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Finalizar conexão
                </button>
                <button onClick={() => { setUserCodeData(null); setAuthorizationCode(""); }}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
                  Cancelar
                </button>
              </div>
              <p className="text-[10px] text-amber-300">⚠ Código expira em {Math.floor((userCodeData.expires_in ?? 600) / 60)} min</p>
            </div>
          )}
        </section>
      )}

      {/* Status — empresa já conectada via Distribuído */}
      {cfg?.mode === "distribuido" && cfg.authorized_em && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                ✓ Conectado via app Distribuída ({masterAppNome ?? "Master SaaS"})
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Autorizado em {fmtDate(cfg.authorized_em)} · Refresh token salvo · Token renova automático
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Form CENTRALIZADO — só mostra se distribuído NÃO disponível ou se já é centralizado */}
      {(!masterDistribuido || cfg?.mode === "centralizado") && (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Credenciais (Centralizado)</h3>
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
              <button onClick={testarCredenciais}
                className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-300 hover:bg-blue-500/20"
                title="Testa OAuth do iFood — sem polling, sem importação. Diagnostica 401 e dá erro real do iFood.">
                <KeyRound className="h-4 w-4" /> Verificar credenciais
              </button>
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
      )}

      {/* Pré-requisitos iFood */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs space-y-3">
        <h4 className="font-bold text-blue-300 flex items-center gap-2">
          📋 Pré-requisitos do iFood (FAÇA ANTES DE TESTAR)
        </h4>
        <div className="text-slate-300 space-y-2">
          <p>
            Mesmo com client_id/secret corretos, iFood retorna <strong className="text-red-300">401 Unauthorized</strong>
            {" "}até a loja autorizar a app no portal. Esses passos são obrigatórios:
          </p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>
              No <a href="https://developer.ifood.com.br" target="_blank" rel="noopener" className="text-blue-300 underline">
                iFood Developer
              </a>: <strong>Meus Apps</strong> → seu app → aba <strong>Permissões</strong>
            </li>
            <li>
              Localiza loja por <strong>ID</strong> ou <strong>CNPJ</strong> → confirma → <strong>&quot;Solicitar acesso&quot;</strong>
            </li>
            <li>
              Dono da loja entra em <a href="https://portal.ifood.com.br" target="_blank" rel="noopener" className="text-blue-300 underline">
                portal.ifood.com.br
              </a> → aba <strong>Apps Integrados</strong> ou notificações → <strong>APROVA</strong> a request
            </li>
            <li>Volta aqui → <strong>&quot;Verificar credenciais&quot;</strong> → agora deve dar ✓</li>
          </ol>
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-amber-200">
            ⚠ <strong>Sem o passo 3 (aprovação no Portal)</strong>, polling sempre dá 401 — não é bug nosso, é fluxo do iFood.
          </p>
        </div>
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
          <strong className="text-amber-300"> Use aspas simples no heredoc (&lt;&lt;&apos;EOF&apos;)</strong> pra
          evitar expansão da var $CRON_SECRET.
        </p>
      </div>
    </div>
  );
}
