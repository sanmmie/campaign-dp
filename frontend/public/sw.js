// ΔOs Core Service Worker
// Offline support for the app shell and a small set of public API reads.

const CACHE_NAME = 'deltadp-v2';
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Only read-only, non-personalised endpoints are cached.
// Anything that depends on the signed-in session is always fetched from the
// network, so a shared device can never be served another person's data.
const CACHEABLE_API_PREFIXES = [
  '/api/templates',
  '/api/packs',
  '/api/presets',
  '/api/public/',
  '/api/share/config',
  '/api/upload/config',
];

const API_CACHE_NAME = 'deltadp-api-v2';

function isCacheableApiPath(pathname) {
  return CACHEABLE_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

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
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The document shell is fetched network-first so that a new deployment
  // reaches browsers that still hold the previous version in cache.
  if (request.mode === 'navigate' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Public, non-personalised API reads: cache-first with a background refresh.
  if (url.pathname.startsWith('/api')) {
    if (!isCacheableApiPath(url.pathname)) {
      return;
    }

    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Static build assets are content-hashed, so cache-first is safe.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
