// Cardápio SaaS — PWA Service Worker (Totem + Cliente)
const CACHE_NAME = "cardapio-pwa-v2";

// Assets to pre-cache
const PRECACHE = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network-first for API routes
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ success: false, error: "Sem conexão" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Totem + Cliente pages: network-first with cache fallback
  if (url.pathname.startsWith("/totem/") || url.pathname.startsWith("/cliente/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(c => c || caches.match("/")))
    );
    return;
  }

  event.respondWith(fetch(request));
});

// Permite o cliente disparar updates manualmente
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
