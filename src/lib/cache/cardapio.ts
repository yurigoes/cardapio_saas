/**
 * Cache do cardápio público (rota mais hot do sistema).
 *
 * Chave: cardapio:pub:{slug}
 * TTL:   5 minutos
 *
 * Mutations DEVEM invalidar via invalidarCardapioCache(slug). Endpoints
 * que alteram produto, categoria, disponibilidade, preço, foto, ou
 * config visual da empresa.
 *
 * Modo "wait stale": se Redis estiver offline (lazyConnect timeout),
 * o fetch original do banco roda normalmente — cache é opcional.
 */
import { redisDel } from "@/lib/db/redis";

export const CACHE_CARDAPIO_TTL = 300; // 5 min

export function cardapioCacheKey(slug: string): string {
  return `cardapio:pub:${slug}`;
}

/**
 * Invalida o cache do cardápio público da empresa.
 * Chamar em best-effort após qualquer mutation relevante.
 */
export async function invalidarCardapioCache(slug: string | null | undefined): Promise<void> {
  if (!slug) return;
  await redisDel(cardapioCacheKey(slug)).catch(() => null);
}

/**
 * Invalida pra múltiplas filiais de uma rede (cardápio compartilhado).
 */
export async function invalidarCardapioCacheRede(slugs: string[]): Promise<void> {
  if (!slugs.length) return;
  await Promise.all(slugs.map(s => invalidarCardapioCache(s)));
}

/**
 * Resolve slugs afetados a partir do empresaId (própria + filiais da rede
 * com cardápio sincronizado) e invalida tudo. Use após qualquer mutation
 * de produto/categoria/disponibilidade.
 */
export async function invalidarCardapioPorEmpresa(empresaId: string): Promise<void> {
  const { query } = await import("@/lib/db/client");
  // Pega slugs do escopo (a própria + filiais se rede sincronizada)
  const rows = await query<{ slug: string }>(
    `SELECT e.slug
       FROM empresas e
  LEFT JOIN redes r ON r.id = e.rede_id AND r.deleted_at IS NULL
      WHERE e.deleted_at IS NULL
        AND (
              e.id = $1
           OR (e.rede_id = (SELECT rede_id FROM empresas WHERE id = $1)
               AND COALESCE(r.cardapio_sincronizado, FALSE) = TRUE)
        )`,
    [empresaId]
  ).catch(() => [] as { slug: string }[]);

  await invalidarCardapioCacheRede(rows.map(r => r.slug));
}
