"use client";

/**
 * Simulador do app do terminal (Three Pay) — pra testar o fluxo de pagamento
 * por agente SEM precisar do L400 real homologado.
 *
 * Cole o agent_token do terminal (Painel > Integrações > Terminais), clique
 * "Conectar". A página faz polling de cobranças pendentes e te deixa
 * aprovar/recusar — exatamente o que o app no L400 fará automaticamente.
 *
 * URL: /terminal-sim
 */
import { useState, useRef, useCallback, useEffect } from "react";

interface Cobranca {
  transacao_id: string; valor: number; metodo: string; parcelas: number; pedido_id: string | null;
}

export default function TerminalSimPage() {
  const [token, setToken] = useState("");
  const [conectado, setConectado] = useState(false);
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = (m: string) => setLog(l => [`${new Date().toLocaleTimeString("pt-BR")} · ${m}`, ...l].slice(0, 30));

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/terminal-agent/proxima?token=${encodeURIComponent(token)}`);
      const d = await r.json();
      if (!r.ok || d?.success === false) { addLog(`erro: ${d?.error ?? r.status}`); setConectado(false); return; }
      const c = d.data?.cobranca ?? null;
      if (c && !cobranca) { setCobranca(c); addLog(`📥 nova cobrança ${c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${c.metodo})`); }
    } catch (e) {
      addLog(`falha de rede`);
    }
  }, [token, cobranca]);

  useEffect(() => {
    if (!conectado) return;
    timer.current = setTimeout(async function loop() {
      await poll();
      timer.current = setTimeout(loop, 3000);
    }, 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [conectado, poll]);

  async function responder(resultado: "aprovada" | "recusada" | "cancelada") {
    if (!cobranca) return;
    setBusy(true);
    const r = await fetch("/api/terminal-agent/resultado", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token, transacao_id: cobranca.transacao_id, resultado,
        authorization_id: resultado === "aprovada" ? "SIM" + Math.floor(Math.random() * 1e6) : undefined,
        bandeira: resultado === "aprovada" ? "visa" : undefined,
        ultimos_4: resultado === "aprovada" ? "1234" : undefined,
        nsu: String(Math.floor(Math.random() * 1e6)),
        mensagem: resultado === "aprovada" ? "Aprovado (simulado)" : "Recusado (simulado)",
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok && d?.success !== false) { addLog(`✅ enviado: ${resultado}`); setCobranca(null); }
    else addLog(`erro ao responder: ${d?.error ?? r.status}`);
  }

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "0 auto", padding: 24, color: "#111" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>🧪 Simulador do Terminal (Three Pay)</h1>
      <p style={{ color: "#666", fontSize: 13 }}>Simula o app que rodará no L400. Cole o token do terminal e conecte.</p>

      {!conectado ? (
        <div style={{ marginTop: 16 }}>
          <input value={token} onChange={e => setToken(e.target.value.trim())} placeholder="agent_token do terminal"
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }} />
          <button onClick={() => { if (token) { setConectado(true); addLog("conectado, aguardando cobranças…"); } }}
            style={{ marginTop: 10, width: "100%", padding: 12, background: "#7c3aed", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            Conectar
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {cobranca ? (
            <div style={{ border: "2px solid #7c3aed", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <p style={{ color: "#666", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Cobrança recebida</p>
              <p style={{ fontSize: 36, fontWeight: 800, margin: "6px 0" }}>{fmt(cobranca.valor)}</p>
              <p style={{ color: "#666", fontSize: 13 }}>{cobranca.metodo} · {cobranca.parcelas}x</p>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => responder("aprovada")} disabled={busy}
                  style={{ flex: 1, padding: 12, background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Aprovar</button>
                <button onClick={() => responder("recusada")} disabled={busy}
                  style={{ flex: 1, padding: 12, background: "#dc2626", color: "#fff", border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Recusar</button>
              </div>
            </div>
          ) : (
            <div style={{ border: "1px dashed #ccc", borderRadius: 12, padding: 24, textAlign: "center", color: "#888" }}>
              Aguardando cobrança do totem…
            </div>
          )}
          <button onClick={() => { setConectado(false); setCobranca(null); }} style={{ marginTop: 12, fontSize: 12, color: "#888", background: "none", border: 0, cursor: "pointer" }}>desconectar</button>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>Log</p>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", background: "#f5f5f5", borderRadius: 8, padding: 10, maxHeight: 200, overflow: "auto" }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
          {!log.length && <span>—</span>}
        </div>
      </div>
    </main>
  );
}
