"use client";
import { useEffect } from "react";

/** Registra o service worker. Carregado uma vez no root layout. */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // evita problemas em dev
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[pwa] sw falhou:", err));
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
