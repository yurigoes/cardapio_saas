/* Service worker minimalista — network-first com fallback offline */
const CACHE = "td-midia-v1";
const OFFLINE = "/offline.html";
const PRECACHE = ["/manifest.webmanifest", OFFLINE];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Não cachear /api e auth — sempre rede
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data")) return;

  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.status === 200 && resp.type === "basic") {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then((c) => c || caches.match(OFFLINE))
      )
  );
});
