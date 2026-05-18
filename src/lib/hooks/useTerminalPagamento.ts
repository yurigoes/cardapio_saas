"use client";

/**
 * Hook que abstrai pagamento no totem.
 *
 * Uso:
 *   const { iniciar, status, transacao, cancelar } = useTerminalPagamento(empresaId);
 *
 *   await iniciar({ valor: 50, metodo: "pix" });
 *   // hook automaticamente:
 *   //   - chama /api/pub/terminal/iniciar
 *   //   - se modo=intent_android, abre intent (window.location)
 *   //   - se modo=qr_code, expõe qr_code no `transacao`
 *   //   - polla /api/pub/terminal/[id]/status até aprovada/recusada/expirada
 *   //   - expõe `status` atualizado
 */
import { useState, useRef, useCallback, useEffect } from "react";

export interface IniciarOpts {
  valor:       number;
  metodo:      "credito" | "debito" | "voucher" | "pix" | "qrcode";
  parcelas?:   number;
  pedido_id?:  string;
  terminal_id?: string;  // opcional, usa padrão se não passar
}

export interface TransacaoTerminal {
  transacao_id: string;
  modo:         "intent_android" | "qr_code" | "checkout_url" | "polling_local" | "imediato";
  intent_uri?:  string;
  qr_code?:     string;
  qr_code_img?: string;
  checkout_url?: string;
  status:       "pendente" | "processando" | "aprovada" | "recusada" | "cancelada" | "expirada" | "erro";
  mensagem?:    string;
  authorization_id?: string;
  bandeira?:    string;
  ultimos_4?:   string;
}

const TIMEOUT_MS  = 3 * 60 * 1000; // 3min até expirar
const POLL_EVERY  = 2000;

export function useTerminalPagamento(empresaId: string) {
  const [transacao, setTransacao] = useState<TransacaoTerminal | null>(null);
  const [erro, setErro]           = useState<string | null>(null);
  const [carregando, setCarr]     = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pararPoll() {
    if (pollRef.current)    { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  useEffect(() => () => pararPoll(), []);

  const polling = useCallback(async (txId: string) => {
    try {
      const r = await fetch(`/api/pub/terminal/${txId}/status`);
      const d = await r.json();
      if (!d.success) return;
      const novo = d.data.status as TransacaoTerminal["status"];
      setTransacao(prev => prev ? { ...prev, ...d.data } : prev);
      if (["aprovada","recusada","cancelada","expirada","erro"].includes(novo)) {
        pararPoll();
      }
    } catch {}
  }, []);

  const iniciar = useCallback(async (opts: IniciarOpts) => {
    setCarr(true); setErro(null); setTransacao(null); pararPoll();
    try {
      const r = await fetch("/api/pub/terminal/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opts, empresa_id: empresaId, origem: "totem" }),
      });
      const d = await r.json();
      if (!d.success) { setErro(d.error?.message ?? "Falha"); return null; }
      const tx: TransacaoTerminal = d.data;
      setTransacao(tx);

      // Dispara Intent Android se for esse modo
      if (tx.modo === "intent_android" && tx.intent_uri && typeof window !== "undefined") {
        // Pequeno delay pra UI atualizar antes de redirecionar pra intent
        setTimeout(() => { window.location.href = tx.intent_uri!; }, 200);
      }
      if (tx.modo === "checkout_url" && tx.checkout_url && typeof window !== "undefined") {
        window.open(tx.checkout_url, "_blank", "noopener");
      }

      // Inicia polling
      if (!["aprovada","recusada","erro"].includes(tx.status)) {
        pollRef.current = setInterval(() => polling(tx.transacao_id), POLL_EVERY);
        timeoutRef.current = setTimeout(() => {
          pararPoll();
          setTransacao(prev => prev ? { ...prev, status: "expirada" } : prev);
        }, TIMEOUT_MS);
      }
      return tx;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally { setCarr(false); }
  }, [empresaId, polling]);

  const cancelar = useCallback(() => {
    pararPoll();
    setTransacao(prev => prev ? { ...prev, status: "cancelada" } : prev);
  }, []);

  return { transacao, erro, carregando, iniciar, cancelar };
}
