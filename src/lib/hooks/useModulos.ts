"use client";

/**
 * Hook que carrega o estado dos módulos da empresa logada.
 * Faz cache em memória + revalida a cada N segundos.
 */
import { useEffect, useState, useCallback } from "react";

export interface ModuloStatus {
  key:           string;
  nome:          string;
  preco:         number;
  ativo:         boolean;
  incluso:       boolean;
  trial_ativo:   string | null;   // expira_em ISO ou null
  comprado_ate:  string | null;
  pode_testar:   boolean;
  pode_comprar:  boolean;
}

let cacheGlobal: { data: ModuloStatus[]; ts: number } | null = null;
const TTL = 30_000;

export function useModulos() {
  const [modulos, setModulos] = useState<ModuloStatus[]>(cacheGlobal?.data ?? []);
  const [loading, setLoading] = useState(!cacheGlobal);

  const carregar = useCallback(async (forcar = false) => {
    if (!forcar && cacheGlobal && Date.now() - cacheGlobal.ts < TTL) {
      setModulos(cacheGlobal.data);
      setLoading(false);
      return;
    }
    try {
      const t = localStorage.getItem("access_token") ?? "";
      const r = await fetch("/api/painel/modulos", { headers: { Authorization: `Bearer ${t}` } });
      const d = await r.json();
      if (d.success) {
        cacheGlobal = { data: d.data.modulos, ts: Date.now() };
        setModulos(d.data.modulos);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const get = useCallback(
    (key: string) => modulos.find(m => m.key === key),
    [modulos],
  );

  const isAtivo = useCallback(
    (key: string) => modulos.find(m => m.key === key)?.ativo ?? true, // default true (não bloqueia se ainda carregando)
    [modulos],
  );

  return { modulos, loading, get, isAtivo, recarregar: () => carregar(true) };
}
