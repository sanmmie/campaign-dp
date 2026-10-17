// ΔOs Core Service Worker
// Provides offline caching for shell assets and API resilience.

const CACHE_NAME = 'deltadp-v1';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const API_CACHE_NAME = 'deltadp-api-v1';
const API_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for shell assets
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for API calls
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkPromise = fetch(event.request).then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const copy = response.clone();
            cache.put(event.request, copy).then(() => {
              setTimeout(() => caches.open(API_CACHE_NAME).then((c) => c.delete(event.request)), API_CACHE_TTL_MS);
            });
          }
          return response;
        });
        return cached || networkPromise;
      })
    );
    return;
  }
});
