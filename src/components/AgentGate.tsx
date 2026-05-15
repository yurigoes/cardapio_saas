"use client";

/**
 * Gate que exige token de agente registrado pra operar o painel.
 *
 * Comportamento:
 *   1. Lê empresa.exige_agente_terminal via /api/auth/me
 *   2. Lê token salvo em localStorage 'agent_token'
 *   3. Se exige=true e não tem token → modal bloqueante pedindo o token
 *   4. Valida via POST /api/sync/agent-validate (server amarra ao empresaId do JWT)
 *   5. Após validar, salva token no localStorage e dispara heartbeat
 *      a cada 60s + ao voltar foco
 *
 * Token vem do painel /painel/maquinas (admin gera pra cada máquina).
 *
 * IMPORTANTE: Não montar dentro do PDV full-screen (já é gate visual).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Server, KeyRound, AlertTriangle, LogOut, ShieldCheck } from "lucide-react";

const STORAGE_KEY = "agent_token";

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function fingerprint(): string {
  // Fingerprint barato — não é anti-fraude, só pra correlação visual no master
  if (typeof window === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 100; c.height = 30;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.font = "12px sans-serif";
    ctx.fillText("agent-fp:" + (navigator.userAgent ?? ""), 2, 15);
  }
  const dataUrl = c.toDataURL();
  return dataUrl.slice(-40);   // últimos 40 chars como hash leve
}

function resolucao(): string {
  if (typeof window === "undefined") return "";
  return `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`;
}

interface Props {
  /** Quando true, força exibir modal mesmo se backend não exigir. Útil pra debug. */
  force?: boolean;
}

export function AgentGate({ force = false }: Props) {
  const [exige,    setExige]    = useState<boolean | null>(null);
  const [tokenOk,  setTokenOk]  = useState<boolean>(false);
  const [agenteNome, setAgenteNome] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [enviando,   setEnviando]   = useState(false);
  const [erro,       setErro]       = useState<string | null>(null);

  const hbInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHbRef  = useRef<number>(0);

  // 1) Verifica se empresa exige agente
  useEffect(() => {
    let cancel = false;
    fetch("/api/auth/me", { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (cancel) return;
        const exigeBackend = !!data?.data?.empresa?.exige_agente_terminal;
        setExige(force || exigeBackend);
      })
      .catch(() => setExige(force));
    return () => { cancel = true; };
  }, [force]);

  // 2) Tenta validar token salvo
  const validarTokenSalvo = useCallback(async () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) { setTokenOk(false); return; }

    try {
      const r = await fetch("/api/sync/agent-validate", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:                saved,
          browser_fingerprint:  fingerprint(),
          resolucao:            resolucao(),
        }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        setTokenOk(true);
        setAgenteNome(data.data?.agente?.nome ?? null);
        lastHbRef.current = Date.now();
      } else {
        // Token inválido (apagado, desativado, etc) — limpa
        localStorage.removeItem(STORAGE_KEY);
        setTokenOk(false);
      }
    } catch {
      // Sem rede — assume ok provisoriamente pra não travar o caixa
      setTokenOk(true);
    }
  }, []);

  useEffect(() => { validarTokenSalvo(); }, [validarTokenSalvo]);

  // 3) Heartbeat embarcado a cada 60s
  useEffect(() => {
    if (!tokenOk) return;
    const enviarHb = async () => {
      if (typeof window === "undefined") return;
      const tk = localStorage.getItem(STORAGE_KEY);
      if (!tk) return;
      try {
        await fetch("/api/sync/heartbeat", {
          method:  "POST",
          headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            plataforma: "web",
            versao:     "browser-1.0",
            metadados:  { ua: navigator.userAgent.slice(0, 200) },
          }),
        });
        lastHbRef.current = Date.now();
      } catch {/* */}
    };
    // Bate logo
    enviarHb();
    hbInterval.current = setInterval(enviarHb, 60_000);
    const onFocus = () => {
      // Se ficou parado > 90s, força hb pra "voltar online"
      if (Date.now() - lastHbRef.current > 90_000) enviarHb();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      if (hbInterval.current) clearInterval(hbInterval.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [tokenOk]);

  async function registrar() {
    if (!tokenInput.startsWith("rdt_") || tokenInput.length < 24) {
      setErro("Token deve começar com 'rdt_' e ter pelo menos 24 caracteres");
      return;
    }
    setEnviando(true); setErro(null);
    try {
      const r = await fetch("/api/sync/agent-validate", {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({
          token:               tokenInput.trim(),
          browser_fingerprint: fingerprint(),
          resolucao:           resolucao(),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) throw new Error(data?.error || "Token inválido");
      localStorage.setItem(STORAGE_KEY, tokenInput.trim());
      setTokenOk(true);
      setAgenteNome(data.data?.agente?.nome ?? null);
      setTokenInput("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(false); }
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = "/login";
  }

  // Não bloqueia se: empresa não exige, ou token já validado, ou ainda não sabe
  if (exige === null) return null;
  if (!exige) return null;
  if (tokenOk) {
    // Indicador discreto canto inferior esquerdo
    return (
      <div className="fixed bottom-3 left-3 z-30 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-slate-900/80 px-2.5 py-1 text-[10px] text-emerald-400 backdrop-blur">
        <ShieldCheck className="h-3 w-3" />
        {agenteNome ?? "Agente OK"}
      </div>
    );
  }

  // Modal bloqueante
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-amber-500/50 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-amber-500/15 p-2">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Máquina não registrada</h2>
            <p className="mt-1 text-xs text-slate-400">
              Esta empresa exige que cada terminal seja registrado antes de operar.
              Cole abaixo o token gerado em <code className="rounded bg-slate-800 px-1">/painel/maquinas</code> pra esta máquina.
            </p>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-400">Token de agente</label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && registrar()}
            placeholder="rdt_..."
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-slate-950 pl-10 pr-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        {erro && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300">{erro}</div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={logout}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/5"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
          <button
            onClick={registrar}
            disabled={enviando || tokenInput.length < 8}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {enviando ? "Validando..." : <><Server className="h-3.5 w-3.5" /> Registrar máquina</>}
          </button>
        </div>

        <p className="mt-4 text-[10px] text-slate-600">
          Não tem o token? Avise o administrador desta loja pra gerar em <strong>Painel → Máquinas → Adicionar</strong>.
        </p>
      </div>
    </div>
  );
}
