const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const IS_DEV_HOST = DEV_HOSTS.has(self.location.hostname);
const CACHE_NAME = "asmr-shinkansen-v3";
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

if (IS_DEV_HOST) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.clients.claim())
        .then(() => self.registration.unregister())
    );
  });

  self.addEventListener("fetch", () => undefined);
} else {

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

// Cache budget: skip very large responses and cap entry count so origin
// storage stays bounded over long sessions.
const MAX_CACHED_BYTES = 6 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 120;

const putWithBudget = async (request, response) => {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_CACHED_BYTES) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_CACHE_ENTRIES; i += 1) {
    await cache.delete(keys[i]);
  }
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        event.waitUntil(putWithBudget(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

}
