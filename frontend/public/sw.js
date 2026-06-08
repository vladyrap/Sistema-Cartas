/** Service Worker — cache-first para assets estáticos, network-first para /api.
 * Activación inmediata + claim de clients para que la primera carga lo use.
 */
const VERSION = 'ec-v1';
const STATIC_CACHE = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No interceptamos POST / mutaciones ni WebSocket upgrades.
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/rt/ws')) return;

  // API: network-first con fallback a cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          // Solo cachear GETs OK
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || new Response(
          JSON.stringify({ offline: true }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        )))
    );
    return;
  }

  // Static: cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});

// Push notification handler.
self.addEventListener('push', (event) => {
  let data = { title: 'EliteCards', body: 'Tienes una nueva notificación' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { /* texto plano */
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag || 'elitecards',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(url)) { c.focus(); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});
