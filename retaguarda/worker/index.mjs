/**
 * RETAGUARDA — Worker de buffer offline
 *
 * Quando a internet do restaurante cai, o master fica inalcançável.
 * Sem este worker, qualquer POST (pedido, cadastro de cliente) trava
 * o totem com erro 502. Aqui:
 *
 *  - nginx detecta erro do master → cai pro fallback @offline_queue
 *  - fallback proxia pra este worker em http://worker:3001/__queue
 *  - worker gera Idempotency-Key, salva tudo no Redis local e responde
 *    202 Accepted com {queued: true, idempotency_key, position}
 *  - drainer loop tenta replay no master a cada 5s, com backoff
 *    exponencial em caso de falha. Sucesso → remove da fila.
 *
 * O master DEVE respeitar o header Idempotency-Key pra não duplicar
 * pedido quando o drainer reenvia o mesmo request.
 *
 * Endpoints:
 *   POST /__queue                    — usado pelo nginx fallback
 *   GET  /__queue/status             — métricas (pending, sent, failed)
 *   POST /__queue/flush              — força drain manual
 *   GET  /__queue/health             — healthcheck
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

// ── Config ──────────────────────────────────────────────────────────────────
const PORT             = Number(process.env.PORT ?? 3001);
const MASTER_URL       = process.env.MASTER_URL ?? "https://app.tthreedigital.com.br";
const REDIS_HOST       = process.env.REDIS_HOST ?? "redis";
const REDIS_PORT       = Number(process.env.REDIS_PORT ?? 6379);
const QUEUE_KEY        = "retaguarda:queue:pending";       // LIST
const STATS_KEY        = "retaguarda:queue:stats";          // HASH
const DRAIN_INTERVAL_MS = Number(process.env.DRAIN_INTERVAL_MS ?? 5000);
const MAX_ATTEMPTS     = Number(process.env.MAX_ATTEMPTS ?? 20);
const REQUEST_TIMEOUT  = Number(process.env.REQUEST_TIMEOUT ?? 15000);

// Tamanho máximo do body que aceitamos enfileirar (proteção memória)
const MAX_BODY_BYTES   = 1024 * 1024; // 1 MB

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  lazyConnect: true,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  retryStrategy: (times) => Math.min(times * 500, 3000),
});

redis.on("error", (e) => console.error("[worker] redis:", e.message));
await redis.connect();

console.log(`[worker] online · master=${MASTER_URL} · redis=${REDIS_HOST}:${REDIS_PORT}`);
console.log(`[worker] drain a cada ${DRAIN_INTERVAL_MS}ms · max attempts=${MAX_ATTEMPTS}`);

// ── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/__queue/health") {
      return reply(res, 200, { ok: true, ts: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/__queue/status") {
      return await handleStatus(res);
    }

    if (req.method === "POST" && url.pathname === "/__queue/flush") {
      drainNow();
      return reply(res, 202, { ok: true, draining: true });
    }

    if (req.method === "POST" && url.pathname === "/__queue") {
      return await handleEnqueue(req, res);
    }

    reply(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    console.error("[worker] handler error:", err);
    reply(res, 500, { ok: false, error: err.message });
  }
});

function reply(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Enqueue ─────────────────────────────────────────────────────────────────
async function handleEnqueue(req, res) {
  // nginx passa o método/path/headers originais via header customizado
  const originalPath   = req.headers["x-original-path"]   ?? "/";
  const originalMethod = req.headers["x-original-method"] ?? "POST";
  const originalCT     = req.headers["content-type"]       ?? "application/json";

  const body = await readBody(req);

  // Tenta extrair idempotency-key se cliente já mandou; senão gera
  const idempotencyKey = req.headers["idempotency-key"] ?? randomUUID();

  const item = {
    id:               randomUUID(),
    idempotency_key:  idempotencyKey,
    method:           originalMethod,
    path:             originalPath,
    content_type:     originalCT,
    body_base64:      body.toString("base64"),
    enqueued_at:      Date.now(),
    attempts:         0,
    last_error:       null,
  };

  await redis.lpush(QUEUE_KEY, JSON.stringify(item));
  await redis.hincrby(STATS_KEY, "queued_total", 1);

  const pending = await redis.llen(QUEUE_KEY);

  // Resposta sintética 202 — cliente sabe que o pedido foi aceito mas
  // ainda não foi confirmado no master. UI pode mostrar "enfileirado".
  reply(res, 202, {
    success:         true,
    queued:          true,
    idempotency_key: idempotencyKey,
    queue_position:  pending,
    data: {
      // Stub com formato do master pra não quebrar UI atual
      id:              `offline-${item.id}`,
      numero:          0,        // será atribuído quando master receber
      queued:          true,
      message:         "Pedido aceito offline, será enviado quando a internet voltar",
    },
  });

  // Tenta drenar imediatamente — se master tiver voltado
  setImmediate(drainNow);
}

// ── Status ──────────────────────────────────────────────────────────────────
async function handleStatus(res) {
  const [pending, stats] = await Promise.all([
    redis.llen(QUEUE_KEY),
    redis.hgetall(STATS_KEY),
  ]);
  reply(res, 200, {
    ok: true,
    pending,
    queued_total:  Number(stats.queued_total  ?? 0),
    sent_total:    Number(stats.sent_total    ?? 0),
    failed_total:  Number(stats.failed_total  ?? 0),
    last_sent_at:  stats.last_sent_at  ?? null,
    last_failure:  stats.last_failure  ?? null,
    master_url:    MASTER_URL,
  });
}

// ── Drainer ─────────────────────────────────────────────────────────────────
let draining = false;

async function drainNow() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const raw = await redis.rpop(QUEUE_KEY);
      if (!raw) break;

      let item;
      try { item = JSON.parse(raw); }
      catch { continue; } // dado corrompido, descarta

      const result = await replay(item);
      if (result.ok) {
        await redis.hincrby(STATS_KEY, "sent_total", 1);
        await redis.hset(STATS_KEY, "last_sent_at", new Date().toISOString());
      } else {
        item.attempts += 1;
        item.last_error = result.error;
        if (item.attempts >= MAX_ATTEMPTS) {
          console.error(`[worker] DESCARTANDO após ${item.attempts} tentativas:`, item.path, result.error);
          await redis.hincrby(STATS_KEY, "failed_total", 1);
          await redis.hset(STATS_KEY, "last_failure", `${item.path}: ${result.error}`);
          await redis.lpush("retaguarda:queue:dead", JSON.stringify(item));
        } else {
          // Re-enqueue na frente da fila com delay exponencial implícito
          // (próximo drain só vai tentar de novo após DRAIN_INTERVAL_MS)
          await redis.lpush(QUEUE_KEY, JSON.stringify(item));
          // Para o loop pra esperar próximo tick — não martela master
          break;
        }
      }
    }
  } finally {
    draining = false;
  }
}

async function replay(item) {
  const url  = MASTER_URL.replace(/\/$/, "") + item.path;
  const body = Buffer.from(item.body_base64, "base64");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);

  try {
    const r = await fetch(url, {
      method: item.method,
      headers: {
        "Content-Type":      item.content_type,
        "Idempotency-Key":   item.idempotency_key,
        "X-Retaguarda-Replay": "1",
      },
      body:   item.method === "GET" || item.method === "HEAD" ? undefined : body,
      signal: ctrl.signal,
    });

    if (r.ok || r.status === 409 /* conflito = já processado */) {
      return { ok: true };
    }
    // 5xx = master indisponível, mantém na fila e tenta de novo
    if (r.status >= 500) {
      return { ok: false, error: `HTTP ${r.status}` };
    }
    // 4xx = erro do cliente (validação) — descarta pra não ficar martelando
    console.warn(`[worker] descartando ${item.path}: HTTP ${r.status} (cliente)`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Loop ────────────────────────────────────────────────────────────────────
setInterval(drainNow, DRAIN_INTERVAL_MS);

// Inicia escutando
server.listen(PORT, () => {
  console.log(`[worker] HTTP escutando em :${PORT}`);
  drainNow();
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM, encerrando…");
  server.close();
  await redis.quit();
  process.exit(0);
});
