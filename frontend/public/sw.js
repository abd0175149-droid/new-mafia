const CACHE_NAME = 'mafia-club-v2.3.1';

const PRECACHE_URLS = [
  '/player',
  '/player/profile',
  '/mafia_logo.png',
];

// ── Install: تخزين الملفات الأساسية ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA: Caching app shell');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// ── Activate: حذف الكاشات القديمة ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network-first مع fallback للكاش ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // لا تخزن API أو Socket.IO أو uploads
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/uploads/') ||
    request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // خزّن النسخة الجديدة
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // إذا ما في إنترنت → ارجع الكاش
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // صفحة offline fallback
          if (request.destination === 'document') {
            return caches.match('/player');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
