// Service worker: يجعل الصفحتين قابلتين للتثبيت ويعملان بلا اتصال قدر الإمكان.
// الشبكة أولاً دائماً (حتى يصل كل نشر جديد فوراً)، والنسخة المحفوظة احتياط عند انقطاع الاتصال.
// لا يُخزَّن أي شيء من /api/ ولا version.json — البيانات لا تُحفظ في الجهاز.
const CACHE = 'contacts-shell-v1';
const SHELL = [
  '/', '/style.css', '/app.js', '/core.js', '/vendor/xlsx.full.min.js', '/manifest.webmanifest',
  '/admin', '/admin.css', '/admin.js', '/admin-wa.js', '/template.js', '/admin.webmanifest',
  '/offline', '/offline.js', '/icon.svg', '/icons/icon-192.png', '/icons/admin-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/version.json' || url.pathname === '/sw.js') return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && !res.redirected && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match(url.pathname.startsWith('/admin') ? '/admin' : '/')) || cache.match('/offline');
      return Response.error();
    }
  })());
});
