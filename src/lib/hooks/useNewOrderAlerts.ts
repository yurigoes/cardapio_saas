"use client";

/**
 * Hook que dispara alerta sonoro + notificação do navegador quando aparecem
 * novos pedidos numa lista observada.
 *
 * Uso:
 *   const { habilitado, toggle, permitir } = useNewOrderAlerts(pedidos, {
 *     storageKey: "alerts_pedidos",
 *   });
 *
 * Comportamento:
 *   - Primeira renderização: marca todos os IDs como "vistos" (não alerta)
 *   - Próximas renderizações: para cada ID novo, toca beep e mostra Notification
 *   - Permissão de notificação é pedida só quando o usuário liga o toggle
 *   - Estado on/off persiste em localStorage por chave
 *
 * Limitação consciente: só funciona com a aba aberta (foreground).
 * Push real (Web Push API + VAPID) seria v2.
 */
import { useEffect, useRef, useState, useCallback } from "react";

interface OrderLike {
  id:     string;
  numero: number;
  cliente_nome?: string | null;
  total?: number;
}

interface Options {
  storageKey?: string;        // chave para persistir habilitado (default: "new_order_alerts")
  voice?:      boolean;        // se true, fala "Novo pedido número X" (default false)
  badgeIcon?:  string;         // URL do ícone para Notification (default: /icon.svg)
}

/** Beep curto via Web Audio API (sem dependência de arquivo MP3). */
function playBeep(durationMs = 220, frequency = 880, volume = 0.25) {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => ctx.close();
  } catch {
    /* navegador sem WebAudio: silencioso */
  }
}

/** Sequência de 2 beeps (mais distintivo). */
function playAlertSound() {
  playBeep(200, 880);
  setTimeout(() => playBeep(280, 1100), 230);
}

function falar(texto: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch { /* sem TTS, ok */ }
}

export function useNewOrderAlerts<T extends OrderLike>(
  pedidos: T[],
  options: Options = {}
) {
  const {
    storageKey = "new_order_alerts",
    voice      = false,
    badgeIcon  = "/icon.svg",
  } = options;

  const [habilitado, setHabilitado] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "1";
  });
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return "default";
    return Notification.permission;
  });

  const seenRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);

  // Persiste habilitado
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, habilitado ? "1" : "0");
  }, [habilitado, storageKey]);

  // Detecta novos pedidos
  useEffect(() => {
    if (firstRunRef.current) {
      // Primeira passagem: marca tudo como visto
      pedidos.forEach((p) => seenRef.current.add(p.id));
      firstRunRef.current = false;
      return;
    }
    if (!habilitado) {
      // Mesmo desabilitado, atualiza o conjunto para não soar tudo quando ligar
      pedidos.forEach((p) => seenRef.current.add(p.id));
      return;
    }

    const novos = pedidos.filter((p) => !seenRef.current.has(p.id));
    if (novos.length === 0) return;

    // Marca como vistos antes de qualquer side-effect (evita re-disparo se re-render)
    novos.forEach((p) => seenRef.current.add(p.id));

    playAlertSound();

    // Notification do SO (se permissão concedida)
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const titulo = novos.length === 1
        ? `Pedido #${novos[0].numero}`
        : `${novos.length} novos pedidos`;
      const corpo = novos.length === 1
        ? `${novos[0].cliente_nome ?? "Cliente"} · ${novos[0].total != null ? novos[0].total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""}`.trim()
        : novos.map((p) => `#${p.numero}`).join(" · ");

      try {
        const n = new Notification(titulo, {
          body: corpo,
          icon: badgeIcon,
          tag:  "new-order",            // agrega notificações sucessivas
          requireInteraction: false,
        });
        // Auto-fecha após 10s (alguns SOs ignoram)
        setTimeout(() => { try { n.close(); } catch {} }, 10000);
      } catch { /* sem suporte */ }
    }

    if (voice) {
      falar(novos.length === 1
        ? `Novo pedido número ${novos[0].numero}`
        : `${novos.length} novos pedidos`);
    }
  }, [pedidos, habilitado, voice, badgeIcon]);

  /** Chama isto numa interação do usuário (gesture) para pedir permissão e ligar. */
  const permitir = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === "undefined") {
      setHabilitado(true);
      return true; // tem som mesmo sem notification
    }
    if (Notification.permission === "granted") {
      setPermission("granted");
      setHabilitado(true);
      return true;
    }
    if (Notification.permission === "denied") {
      // Não pode reverter, mas ainda pode habilitar só som
      setHabilitado(true);
      return false;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    setHabilitado(true);
    return result === "granted";
  }, []);

  const toggle = useCallback(() => {
    if (habilitado) setHabilitado(false);
    else permitir();
  }, [habilitado, permitir]);

  return {
    habilitado,
    toggle,
    permitir,
    permission,
  };
}
