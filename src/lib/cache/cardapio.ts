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
 *
 * Faz 2 coisas em paralelo:
 *  1. DEL no Redis do master (cache curto)
 *  2. POST /__purge nas retaguardas online da(s) empresa(s) afetada(s)
 */
export async function invalidarCardapioPorEmpresa(empresaId: string): Promise<void> {
  const { query } = await import("@/lib/db/client");
  // Pega slugs + empresa_ids do escopo
  const rows = await query<{ slug: string; id: string }>(
    `SELECT e.slug, e.id
       FROM empresas e
  LEFT JOIN redes r ON r.id = e.rede_id AND r.deleted_at IS NULL
      WHERE e.deleted_at IS NULL
        AND (
              e.id = $1
           OR (e.rede_id = (SELECT rede_id FROM empresas WHERE id = $1)
               AND COALESCE(r.cardapio_sincronizado, FALSE) = TRUE)
        )`,
    [empresaId]
  ).catch(() => [] as { slug: string; id: string }[]);

  const slugs       = rows.map(r => r.slug);
  const empresaIds  = rows.map(r => r.id);

  await Promise.all([
    invalidarCardapioCacheRede(slugs),
    purgarRetaguardasAfetadas(slugs, empresaIds),
  ]);
}

/**
 * Dispara POST /__purge nas retaguardas que atendem qualquer das empresas
 * informadas. Considera apenas as online (heartbeat <5min). Best-effort,
 * ignora erros — TTL de 5min cobre se falhar.
 */
async function purgarRetaguardasAfetadas(slugs: string[], empresaIds: string[]): Promise<void> {
  if (!slugs.length) return;

  const secret = process.env.RETAGUARDA_HEARTBEAT_SECRET;
  if (!secret) return; // master sem secret configurado — pula

  const { query } = await import("@/lib/db/client");
  const retaguardas = await query<{ dominio: string }>(
    `SELECT DISTINCT dominio
       FROM retaguardas
      WHERE ativo = TRUE
        AND dominio IS NOT NULL
        AND ultimo_heartbeat > NOW() - INTERVAL '5 minutes'
        AND empresa_id = ANY($1::uuid[])`,
    [empresaIds]
  ).catch(() => [] as { dominio: string }[]);

  if (!retaguardas.length) return;

  // Dispara em paralelo, com timeout curto pra não segurar a response
  const jobs: Promise<void>[] = [];
  for (const r of retaguardas) {
    for (const slug of slugs) {
      jobs.push(
        fetch(`https://${r.dominio}/__purge`, {
          method:  "POST",
          headers: {
            "Content-Type":   "application/json",
            "X-Purge-Secret": secret,
          },
          body:   JSON.stringify({ slug }),
          signal: AbortSignal.timeout(3000),
        })
        .then(() => undefined)
        .catch(() => undefined) // silencioso
      );
    }
  }
  // Não aguarda — fire-and-forget pra não bloquear mutation no painel
  Promise.allSettled(jobs);
}
