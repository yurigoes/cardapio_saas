"use client";

/**
 * Hook para gerenciar inscrição de Web Push no cliente.
 *
 * Uso:
 *   const push = useWebPush();
 *   if (push.disponivel) <button onClick={push.toggle}>...</button>
 *
 * Estados:
 *   - "indisponivel"  : navegador não suporta ou VAPID não configurado
 *   - "inativo"       : suportado mas usuário não inscreveu
 *   - "ativo"         : inscrito e funcional
 *   - "negado"        : permissão negada (sem reverter sem ação manual no SO)
 */
import { useEffect, useState, useCallback } from "react";

type Estado = "indisponivel" | "inativo" | "ativo" | "negado" | "carregando";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(b64);
  const buf     = new ArrayBuffer(raw.length);
  const arr     = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function useWebPush() {
  const [estado, setEstado] = useState<Estado>("carregando");

  function getToken() { return localStorage.getItem("access_token") ?? ""; }
  function authHeader(): HeadersInit {
    return { Authorization: `Bearer ${getToken()}` };
  }

  // Verifica suporte e estado inicial
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (typeof window === "undefined" ||
          !("serviceWorker" in navigator) ||
          !("PushManager"   in window) ||
          typeof Notification === "undefined") {
        setEstado("indisponivel");
        return;
      }

      // VAPID configurada no servidor?
      try {
        const r = await fetch("/api/painel/push/vapid-public-key");
        const d = await r.json();
        if (!d.success || !d.configured) {
          setEstado("indisponivel");
          return;
        }
      } catch {
        setEstado("indisponivel");
        return;
      }

      // Permissão atual
      if (Notification.permission === "denied") {
        if (!cancel) setEstado("negado");
        return;
      }

      // Inscrição existente?
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancel) setEstado(sub ? "ativo" : "inativo");
      } catch {
        if (!cancel) setEstado("inativo");
      }
    })();
    return () => { cancel = true; };
  }, []);

  /** Pede permissão + cria inscrição + envia ao servidor. */
  const ativar = useCallback(async (): Promise<boolean> => {
    try {
      // Permissão
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "negado" : "inativo");
        return false;
      }

      // Chave pública
      const r = await fetch("/api/painel/push/vapid-public-key");
      const d = await r.json();
      if (!d.success || !d.key) return false;

      // Inscreve no PushManager do SW
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(d.key),
      });

      const json = sub.toJSON() as PushSubscriptionJSON;
      // Manda pro servidor
      const res = await fetch("/api/painel/push/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body:    JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("falha ao registrar inscrição");

      setEstado("ativo");
      return true;
    } catch (e) {
      console.warn("[Push] ativar falhou:", e);
      setEstado("inativo");
      return false;
    }
  }, []);

  /** Remove inscrição local + servidor. */
  const desativar = useCallback(async (): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/painel/push/subscribe", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body:    JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setEstado("inativo");
    } catch (e) {
      console.warn("[Push] desativar falhou:", e);
    }
  }, []);

  const toggle = useCallback(() => {
    if (estado === "ativo") desativar();
    else if (estado === "inativo") ativar();
  }, [estado, ativar, desativar]);

  return {
    estado,
    disponivel:    estado !== "indisponivel" && estado !== "carregando",
    ativo:         estado === "ativo",
    negado:        estado === "negado",
    toggle,
    ativar,
    desativar,
  };
}
