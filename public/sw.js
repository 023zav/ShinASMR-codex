const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const IS_DEV_HOST = DEV_HOSTS.has(self.location.hostname);
const CACHE_NAME = "asmr-shinkansen-v3";
// Resolve against the registration scope so the worker also functions when
// the app is served from a subpath (e.g. GitHub Pages project sites).
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const CORE_ASSETS = [SCOPE_PATH, `${SCOPE_PATH}index.html`, `${SCOPE_PATH}manifest.webmanifest`, `${SCOPE_PATH}icon.svg`];

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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(`${SCOPE_PATH}index.html`))
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

}
