"use client";

/**
 * Hook simples para alternar tema claro/escuro no painel admin.
 * Persiste em localStorage e aplica `data-theme` no <html>.
 *
 * Não usado em /totem nem /cliente — esses são dark-only por design.
 */
import { useEffect, useState, useCallback } from "react";

type Tema = "dark" | "light";
const STORAGE_KEY = "painel_tema";

function getInicial(): Tema {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

function aplicar(t: Tema) {
  if (typeof document === "undefined") return;
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else               document.documentElement.removeAttribute("data-theme");
}

export function useTheme() {
  const [tema, setTema] = useState<Tema>(getInicial);

  // Aplica no mount + sempre que mudar
  useEffect(() => { aplicar(tema); }, [tema]);

  const toggle = useCallback(() => {
    setTema(prev => {
      const novo = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem(STORAGE_KEY, novo); } catch {}
      return novo;
    });
  }, []);

  return { tema, toggle, isLight: tema === "light", isDark: tema === "dark" };
}
