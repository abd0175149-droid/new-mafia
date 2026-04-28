// ══════════════════════════════════════════════════════
// 📦 Service Worker — Mafia Club PWA
// BUILD_HASH يُستبدل تلقائياً عند كل deploy (Dockerfile)
// ══════════════════════════════════════════════════════
const BUILD_HASH = '__BUILD_HASH__';
const CACHE_NAME = `mafia-club-${BUILD_HASH}`;

const PRECACHE_URLS = [
  '/player',
  '/player/profile',
  '/mafia_logo.png',
];

// ── Install: تخزين الملفات الأساسية ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log(`📦 PWA: Caching app shell [${BUILD_HASH}]`);
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // فرض التفعيل الفوري بدون انتظار الصفحات القديمة
  self.skipWaiting();
});

// ── Activate: حذف الكاشات القديمة ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log(`🗑️ PWA: Deleting old cache [${k}]`);
          return caches.delete(k);
        })
      )
    )
  );
  // السيطرة الفورية على كل الصفحات المفتوحة
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

// ══════════════════════════════════════════════════════
// 🔔 Push Notifications — Firebase FCM (iOS + Android)
// ══════════════════════════════════════════════════════

// ── استقبال Push عندما التطبيق مغلق/background ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'نادي المافيا', body: event.data.text() } };
  }

  // FCM notification payload — استخراج البيانات
  const notification = payload.notification || {};
  const fcmData = payload.data || {};

  // إذا FCM أرسل notification مباشرة (بعض المتصفحات تعرضها تلقائياً)
  // لكن iOS Safari لا يعرضها — لازم showNotification يدوياً
  const title = notification.title || fcmData.title || '🎭 نادي المافيا';
  const body = notification.body || fcmData.body || '';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/mafia_logo.png',
      badge: '/mafia_logo.png',
      tag: fcmData.type || notification.tag || 'default',
      data: {
        url: fcmData.url || notification.data?.url || '/player/home',
        type: fcmData.type || '',
      },
      // iOS Safari لا يدعم vibrate — نتجاهلها بأمان
      vibrate: [200, 100, 200],
      // مطلوب لـ iOS: أن الإشعار يبقى حتى يضغطه المستخدم
      requireInteraction: true,
      // iOS يحتاج renotify مع tag
      renotify: true,
    })
  );
});

// ── فتح التطبيق عند الضغط على الإشعار ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/player/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // لو التطبيق مفتوح → انتقل للصفحة
        for (const client of clients) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(url);
            return client.focus();
          }
        }
        // لو مغلق → افتح صفحة جديدة
        return self.clients.openWindow(url);
      })
  );
});

// ── تحديث الاشتراك (مطلوب لـ iOS) ──
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription?.options || { userVisibleOnly: true })
      .then((subscription) => {
        console.log('🔄 Push subscription renewed');
      })
      .catch((err) => {
        console.error('❌ Failed to renew push subscription:', err);
      })
  );
});
