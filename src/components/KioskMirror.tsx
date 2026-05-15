"use client";

/**
 * KioskMirror — captura screenshot da página atual via html2canvas e envia
 * pra /api/sync/kiosk-frame periodicamente. Master pode então ver o que
 * o kiosk está mostrando em /admin/maquinas/[id]/espelho.
 *
 * Só ativa se localStorage.agent_token existir — então kiosks precisam
 * ser registrados em /painel/maquinas (tipo 'kiosk' ou 'tv') primeiro.
 *
 * Sem consentimento adicional pq são displays públicos sem dado pessoal.
 *
 * Uso: <KioskMirror /> em layouts/páginas de kiosk/totem/painel-tv.
 *
 * Performance: html2canvas é importado dinâmicamente (~250KB), só baixa
 * quando montado. Captura escala pra max 1280px de largura, JPEG quality 0.7.
 */
import { useEffect, useRef } from "react";

const STORAGE_KEY = "agent_token";
const INTERVAL_MS = 8000;          // captura a cada 8s
const MAX_W = 1280;                // limite de resolução
const QUALITY = 0.7;

export function KioskMirror({ enabled = true }: { enabled?: boolean }) {
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return;   // não tem agent_token → não captura

    let stopped = false;
    let html2canvas: typeof import("html2canvas").default | null = null;

    async function init() {
      try {
        const mod = await import("html2canvas");
        html2canvas = mod.default;
      } catch (err) {
        console.warn("[KioskMirror] não consegui carregar html2canvas:", err);
      }
    }

    async function capture() {
      if (!html2canvas || stopped) return;
      // Throttle defensivo se outro tick disparou
      if (Date.now() - lastRef.current < INTERVAL_MS - 500) return;
      lastRef.current = Date.now();

      try {
        const canvas = await html2canvas(document.body, {
          backgroundColor: "#0f172a",
          scale: 1,
          logging: false,
          useCORS: true,
          ignoreElements: (el) => {
            // Ignora o próprio component + popups
            return (el as HTMLElement).dataset?.kioskMirror === "skip";
          },
        });

        // Reescala se grande
        let target: HTMLCanvasElement = canvas;
        if (canvas.width > MAX_W) {
          const scale = MAX_W / canvas.width;
          const c2 = document.createElement("canvas");
          c2.width = MAX_W;
          c2.height = Math.round(canvas.height * scale);
          const ctx = c2.getContext("2d");
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
            target = c2;
          }
        }

        const dataUrl = target.toDataURL("image/jpeg", QUALITY);

        await fetch("/api/sync/kiosk-frame", {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ data: dataUrl, w: target.width, h: target.height }),
        });
      } catch (err) {
        // Silencioso — falha de captura não pode quebrar o kiosk
        console.warn("[KioskMirror] erro na captura:", err);
      }
    }

    init().then(() => {
      capture();
      const id = setInterval(capture, INTERVAL_MS);
      return () => clearInterval(id);
    });

    return () => { stopped = true; };
  }, [enabled]);

  return null;
}
