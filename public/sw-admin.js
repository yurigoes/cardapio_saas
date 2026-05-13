/**
 * Service Worker minimal pro PWA do painel admin.
 * Não faz cache agressivo (admin é online-first), só habilita installable.
 */
const CACHE = "admin-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Network-first sempre. Service worker existe só para a flag installable.
self.addEventListener("fetch", () => {});
