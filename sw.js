/*
  Vocab — companion service worker (optional).

  Browsers require a service worker to be its own same-origin script file, so this
  is the ONE piece that cannot live inside vocab.html. It makes Android/Chrome
  install + offline robust. Without it (e.g. opened as file://) the app still works
  fully — it's self-contained.

  Strategy: NETWORK-FIRST for same-origin GETs. Always fetch fresh when online (so a
  new deploy is picked up immediately), fall back to cache only when offline. This
  avoids the "stale HTML served from cache forever" trap that cache-first caused.
  The Anthropic API (cross-origin) is never intercepted or cached.

  On each new deploy, bump CACHE (e.g. vocab-v2 -> vocab-v3). activate() deletes every
  cache except the current one, so old cached HTML/JS is purged.
*/
const CACHE = "vocab-v7";

self.addEventListener("install", () => {
  // Activate this version as soon as it's installed (page shows an update banner).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Allow the page to trigger an immediate takeover after the user confirms an update.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Cross-origin (Anthropic API, etc.) → straight to the network, never cached.
  if (url.origin !== self.location.origin) return;

  // Network-first: fresh when online, cache as offline fallback.
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone));
      }
      return res;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw e;
    }
  })());
});
