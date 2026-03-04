const CACHE_VERSION = "superteam-academy-v2";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_CACHE_SIZE = 200;

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

// ── Activate — clean up old caches ──────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Helpers ─────────────────────────────────────────────────────────────────
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

// ── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API requests — network only
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests — network first, fallback to offline page
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, clone);
            trimCache(CACHE_VERSION, MAX_CACHE_SIZE);
          });
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline.html"))),
    );
    return;
  }

  // Static assets (/_next/static/*) — cache first (immutable hashed)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            return response;
          }),
      ),
    );
    return;
  }

  // Course pages — stale while revalidate
  if (url.pathname.includes("/courses/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      }),
    );
    return;
  }

  // Images and fonts — cache first
  if (
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/) ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else — network first
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(request, clone);
          trimCache(CACHE_VERSION, MAX_CACHE_SIZE);
        });
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

// ── Message handler for course pre-caching ──────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_COURSES" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(CACHE_VERSION).then((cache) =>
        Promise.allSettled(
          event.data.urls.map((url) =>
            fetch(url).then((response) => {
              if (response.ok) cache.put(url, response);
            }),
          ),
        ),
      ),
    );
  }
});
