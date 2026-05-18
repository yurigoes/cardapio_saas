/**
 * RETAGUARDA — Reporter (heartbeat com métricas)
 *
 * A cada INTERVAL_SEC (default 60s):
 *  1. GET worker:3001/__queue/status  → pendentes, enviados, falhados
 *  2. GET purger:3002/__stats         → uso disco dos 3 caches
 *  3. POST master/api/retaguarda/heartbeat com tudo em `metricas`
 *
 * O master persiste em `retaguardas.metricas` (JSONB) e mostra em
 * /admin/retaguardas/[id].
 */
const MASTER_URL       = process.env.MASTER_URL ?? "https://app.tthreedigital.com.br";
const EMPRESA_SLUG     = process.env.EMPRESA_SLUG ?? "";
const RETAGUARDA_ID    = process.env.RETAGUARDA_ID ?? "";
const HEARTBEAT_SECRET = process.env.HEARTBEAT_SECRET ?? "";
const WORKER_URL       = process.env.WORKER_URL ?? "http://worker:3001";
const PURGER_URL       = process.env.PURGER_URL ?? "http://purger:3002";
const INTERVAL_MS      = Number(process.env.INTERVAL_SEC ?? 60) * 1000;
const VERSAO           = process.env.RETAGUARDA_VERSAO ?? "1.0.0";

if (!EMPRESA_SLUG || !RETAGUARDA_ID || !HEARTBEAT_SECRET) {
  console.error("[reporter] EMPRESA_SLUG, RETAGUARDA_ID e HEARTBEAT_SECRET são obrigatórios");
  process.exit(1);
}

console.log(`[reporter] iniciando · empresa=${EMPRESA_SLUG} · master=${MASTER_URL} · intervalo=${INTERVAL_MS}ms`);

async function fetchJson(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(t); }
}

async function sendHeartbeat() {
  const [queue, stats] = await Promise.all([
    fetchJson(`${WORKER_URL}/__queue/status`),
    fetchJson(`${PURGER_URL}/__stats`),
  ]);

  const metricas = {
    coletado_em: new Date().toISOString(),
    queue: queue
      ? {
          pending:       queue.pending ?? 0,
          sent_total:    queue.sent_total ?? 0,
          failed_total:  queue.failed_total ?? 0,
          queued_total:  queue.queued_total ?? 0,
          last_sent_at:  queue.last_sent_at ?? null,
          last_failure:  queue.last_failure ?? null,
        }
      : { error: "worker offline" },
    cache: stats
      ? {
          html_mb:       stats.html?.mb ?? 0,
          html_files:    stats.html?.files ?? 0,
          media_mb:      stats.media?.mb ?? 0,
          media_files:   stats.media?.files ?? 0,
          static_mb:     stats.static?.mb ?? 0,
          static_files:  stats.static?.files ?? 0,
          total_mb:      Math.round(((stats.html?.mb ?? 0) + (stats.media?.mb ?? 0) + (stats.static?.mb ?? 0)) * 10) / 10,
        }
      : { error: "purger offline" },
  };

  const body = {
    empresa_slug:  EMPRESA_SLUG,
    retaguarda_id: RETAGUARDA_ID,
    versao:        VERSAO,
    metricas,
  };

  try {
    const r = await fetch(`${MASTER_URL}/api/retaguarda/heartbeat`, {
      method:  "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-retaguarda-secret":  HEARTBEAT_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      console.info(`[reporter] HB ok · queue=${metricas.queue.pending ?? "?"} pending · cache=${metricas.cache.total_mb ?? "?"} MB`);
    } else {
      console.warn(`[reporter] HB master HTTP ${r.status}`);
    }
  } catch (err) {
    console.warn(`[reporter] HB falhou: ${err.message}`);
  }
}

// Primeiro envio imediato + intervalo
sendHeartbeat();
setInterval(sendHeartbeat, INTERVAL_MS);
