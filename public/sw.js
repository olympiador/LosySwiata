const CACHE = 'losy-swiata-pwa-v1';
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
];
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function isDev() {
  try { return DEV_HOSTS.has(location.hostname); } catch { return false; }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
  if (!isDev()) {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'SW_ACTIVATED' }));
    });
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (isDev()) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'CHECK_UPDATE') return;
  if (isDev()) return;
  event.waitUntil(
    fetch('/', { cache: 'no-store' }).then((response) => {
      if (!response || response.status !== 200) return;
      return response.text().then((html) => {
        const remote = html.match(/<meta[^>]+name=["']losy-swiata-version["'][^>]+content=["']([^"']+)/i)?.[1]
          ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']losy-swiata-version["']/i)?.[1];
        if (!remote) return;
        caches.open(CACHE).then((cache) =>
          cache.match('/').then((cached) => cached?.text()).then((cachedText) => {
            const local = cachedText?.match(/<meta[^>]+name=["']losy-swiata-version["'][^>]+content=["']([^"']+)/i)?.[1]
              ?? cachedText?.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']losy-swiata-version["']/i)?.[1];
            if (local && remote && remote !== local) {
              self.clients.matchAll().then((clients) => {
                clients.forEach((client) => client.postMessage({ type: 'UPDATE_AVAILABLE', remote }));
              });
            }
          })
        );
      });
    })
  );
});
