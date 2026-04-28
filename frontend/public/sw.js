// ══════════════════════════════════════════════════════
// 📦 Service Worker — Mafia Club PWA + Firebase FCM
// BUILD_HASH يُستبدل تلقائياً عند كل deploy (Dockerfile)
// ══════════════════════════════════════════════════════
const BUILD_HASH = '__BUILD_HASH__';
const CACHE_NAME = `mafia-club-${BUILD_HASH}`;

const PRECACHE_URLS = [
  '/player',
  '/player/profile',
  '/mafia_logo.png',
];

// ══════════════════════════════════════════════════════
// 🔥 Firebase Messaging (للمتصفحات التي تدعم FCM)
// ══════════════════════════════════════════════════════
let firebaseInitialized = false;
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: 'AIzaSyCPsBtXEVEP0aV2kMfFJJ0za-vbXr891Eo',
    authDomain: 'mafia-b1c74.firebaseapp.com',
    projectId: 'mafia-b1c74',
    storageBucket: 'mafia-b1c74.firebasestorage.app',
    messagingSenderId: '557623626620',
    appId: '1:557623626620:web:6f01e44a6d165008d032f9',
  });

  const messaging = firebase.messaging();

  // ── استقبال رسالة FCM في الخلفية (Chrome/Firefox/Edge) ──
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};

    const title = notification.title || '🎭 نادي المافيا';
    const body = notification.body || '';
    const url = resolveNotificationUrl(data.type, data);

    self.registration.showNotification(title, {
      body,
      icon: '/mafia_logo.png',
      badge: '/mafia_logo.png',
      tag: data.type || 'default',
      data: { url, type: data.type || '', ...data },
      requireInteraction: true,
      renotify: true,
    });
  });

  firebaseInitialized = true;
  console.log('✅ Firebase Messaging initialized in SW');
} catch (e) {
  // Safari/iOS لا يدعم importScripts لـ Firebase — نتجاهل
  console.log('ℹ️ Firebase not available in SW (expected on Safari/iOS)');
}

// ══════════════════════════════════════════════════════
// 📦 PWA Cache Management
// ══════════════════════════════════════════════════════

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
// 🔔 Push Notifications (iOS Web Push + Android FCM)
// ══════════════════════════════════════════════════════

// ── تحديد URL التوجيه حسب نوع الإشعار ──
function resolveNotificationUrl(type, data) {
  switch (type) {
    case 'activity_started':
      return data.roomCode
        ? `/player/join?code=${data.roomCode}`
        : '/player/home';
    case 'new_activity':
      return data.activityId
        ? `/player/games?activityId=${data.activityId}`
        : '/player/games';
    case 'booking_confirmed':
      return '/player/home';
    case 'game_ended':
      return '/player/home';
    case 'custom':
      return data.url || '/player/home';
    default:
      return data.url || '/player/home';
  }
}

// ── استقبال Push عندما التطبيق مغلق/background (Web Push API — Safari/iOS) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'نادي المافيا', body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const fcmData = payload.data || {};

  const title = notification.title || fcmData.title || '🎭 نادي المافيا';
  const body = notification.body || fcmData.body || '';
  const type = fcmData.type || notification.tag || '';
  const url = resolveNotificationUrl(type, fcmData);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // إذا التطبيق مفتوح ومركّز → أرسل postMessage (بانر داخلي)
      const focusedClient = clients.find((c) => c.focused);
      if (focusedClient) {
        focusedClient.postMessage({
          type: 'PUSH_RECEIVED',
          payload: { title, body, data: { url, type, ...fcmData } },
        });
        return; // لا تعرض notification نظام
      }

      // التطبيق في الخلفية أو مغلق → notification نظام عادي
      return self.registration.showNotification(title, {
        body,
        icon: '/mafia_logo.png',
        badge: '/mafia_logo.png',
        tag: type || 'default',
        data: { url, type, ...fcmData },
        vibrate: [200, 100, 200],
        requireInteraction: true,
        renotify: true,
      });
    })
  );
});

// ── فتح التطبيق عند الضغط على الإشعار ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || resolveNotificationUrl(data.type, data);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(url);
            return client.focus();
          }
        }
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
