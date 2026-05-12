/**
 * Cardápio SaaS — PWA Service Worker (Totem + Cliente)
 *
 * Estratégias:
 *   - /api/pub/cardapio/[slug] — stale-while-revalidate (totem funciona offline)
 *   - /api/pub/pedidos/[slug]  — POST com fallback offline → fila IndexedDB
 *   - /totem/, /cliente/        — network-first com fallback de cache
 *   - Static assets             — cache-first
 *   - /api/*                    — network-first com erro JSON se offline
 *
 * Fila offline:
 *   - IndexedDB store "queued_orders" guarda payloads que falharam por rede
 *   - Listener "online" + "sync" tenta drenar a fila automaticamente
 *   - Cliente pode pedir status via postMessage("QUEUE_STATUS")
 *   - SW notifica cliente via postMessage("QUEUE_DRAINED" | "QUEUE_FAILED")
 */

const CACHE_NAME       = "cardapio-pwa-v3";
const CARDAPIO_CACHE   = "cardapio-data-v1";
const QUEUE_DB_NAME    = "cardapio-offline";
const QUEUE_STORE      = "queued_orders";

// ── IndexedDB helpers (Promise-based) ────────────────────────────────────────

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function queueAdd(item) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).add({
      ...item,
      created_at: Date.now(),
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function queueAll() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function queueDelete(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const req = tx.objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function queueCount() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror   = () => reject(req.error);
  });
}

// ── Notificações para clientes (broadcasting) ────────────────────────────────

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(msg));
}

// ── Drain queue: envia pedidos enfileirados em ordem ─────────────────────────

let draining = false;
async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    const items = await queueAll();
    if (items.length === 0) return;

    let okCount = 0;
    let failCount = 0;

    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method:  item.method,
          headers: item.headers,
          body:    item.body,
        });
        if (res.ok) {
          await queueDelete(item.id);
          okCount++;
        } else {
          // Erro 4xx: payload inválido, descarta para não travar a fila eternamente
          if (res.status >= 400 && res.status < 500) {
            await queueDelete(item.id);
            failCount++;
          }
          // 5xx: deixa na fila para tentar de novo
        }
      } catch {
        // Sem rede ainda — para de tentar
        break;
      }
    }

    await broadcast({
      type:  "QUEUE_DRAINED",
      ok:    okCount,
      fail:  failCount,
      remaining: await queueCount(),
    });
  } finally {
    draining = false;
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== CARDAPIO_CACHE)
            .map((k) => caches.delete(k))
        )
      ),
      self.clients.claim(),
    ])
  );
});

// Tenta drenar quando vier o evento sync (Background Sync API)
self.addEventListener("sync", (event) => {
  if (event.tag === "drain-orders") {
    event.waitUntil(drainQueue());
  }
});

// Mensagens vindas do cliente
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "DRAIN_QUEUE") drainQueue();
  if (event.data === "QUEUE_STATUS") {
    queueCount().then((count) => broadcast({ type: "QUEUE_STATUS", count }));
  }
});

// ── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ── POST /api/pub/pedidos/[slug] — fila offline ────────────────────────────
  if (
    request.method === "POST" &&
    url.pathname.startsWith("/api/pub/pedidos/")
  ) {
    event.respondWith(handlePedidoPost(request));
    return;
  }

  // ── GET /api/pub/cardapio/[slug] — stale-while-revalidate ─────────────────
  if (
    request.method === "GET" &&
    url.pathname.startsWith("/api/pub/cardapio/")
  ) {
    event.respondWith(staleWhileRevalidate(request, CARDAPIO_CACHE));
    return;
  }

  // ── Outras chamadas /api/ — network-first ─────────────────────────────────
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ success: false, error: "Sem conexão" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // ── Static assets — cache-first ──────────────────────────────────────────
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── /totem/ e /cliente/ — network-first com fallback ──────────────────────
  if (url.pathname.startsWith("/totem/") || url.pathname.startsWith("/cliente/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/")))
    );
    return;
  }

  event.respondWith(fetch(request));
});

// ── Stale-while-revalidate ───────────────────────────────────────────────────

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached); // sem rede e sem cache = falha
  // Retorna cache imediatamente (se houver), revalida em background
  return cached || fetchPromise;
}

// ── POST de pedido com fallback offline ──────────────────────────────────────

async function handlePedidoPost(request) {
  // Clone porque body só pode ser lido uma vez
  const cloned = request.clone();

  try {
    const res = await fetch(request);
    // Se sucesso e tem itens na fila, tenta drenar
    if (res.ok) {
      queueCount().then((c) => { if (c > 0) drainQueue(); });
    }
    return res;
  } catch {
    // Offline: salva na fila + responde "queued"
    try {
      const headers = {};
      cloned.headers.forEach((v, k) => { headers[k] = v; });
      const body = await cloned.text();

      const id = await queueAdd({
        url:    request.url,
        method: "POST",
        headers,
        body,
      });

      // Tenta registrar background sync para drenar quando voltar
      try {
        if ("sync" in self.registration) {
          await self.registration.sync.register("drain-orders");
        }
      } catch { /* sem suporte, ok */ }

      const count = await queueCount();
      await broadcast({ type: "QUEUE_STATUS", count });

      return new Response(
        JSON.stringify({
          success: true,
          queued:  true,
          data: {
            id:     `offline-${id}`,
            numero: 0,                // será atribuído pelo backend ao sincronizar
            queued: true,
            queue_position: count,
          },
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: "Sem conexão e fila offline indisponível" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}
