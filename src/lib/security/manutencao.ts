/**
 * Helper: checa se sistema está em modo manutenção.
 * Cache em memória 30s pra não bater no DB toda chamada.
 */
import { queryOne } from "@/lib/db/client";

interface ManutencaoConfig {
  ativo: boolean;
  mensagem?: string;
  janela_inicio?: string | null;
  janela_fim?: string | null;
}

let cache: { config: ManutencaoConfig; ts: number } | null = null;
const TTL_MS = 30_000;

export async function emManutencao(): Promise<ManutencaoConfig> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.config;

  try {
    const r = await queryOne<{ valor: ManutencaoConfig }>(
      `SELECT valor FROM settings WHERE chave = 'manutencao'`
    );
    const config = r?.valor ?? { ativo: false };
    cache = { config, ts: Date.now() };
    return config;
  } catch {
    return { ativo: false };
  }
}

export function invalidarCacheManutencao() { cache = null; }
