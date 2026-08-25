const CACHE_NAME = "creatix-learn-linux-v2";
const scope = self.registration.scope;
const essentials = [
  scope,
  new URL("manifest.webmanifest", scope).href,
  new URL("favicon.svg", scope).href,
  new URL("icon-192.png", scope).href,
  new URL("icon-512.png", scope).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(essentials)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(scope, copy));
      return response;
    }).catch(() => caches.match(scope, { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached ?? new Response("Ressource indisponible hors connexion.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }));
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return network;
  }));
});
