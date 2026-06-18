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
  // data-only message — هذا هو المصدر الوحيد للعرض على المتصفحات الداعمة لـ FCM.
  // مستمع push أدناه يتخطّى العرض عندما يكون Firebase مُهيّأ (لمنع التكرار نهائياً).
  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    const title = d.title || '🎭 نادي المافيا';
    const body = d.body || '';
    const tag = d.tag || 'default';
    const type = d.type || '';
    const url = d.url || '/player/home';

    // تحديث أي نافذة مفتوحة لإعادة جلب قائمة الإشعارات
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({
        type: 'PUSH_RECEIVED',
        payload: { title, body, data: { url, type, ...d } },
      }));
    });

    return self.registration.showNotification(title, {
      body,
      icon: '/mafia_logo.png',
      badge: '/mafia_logo.png',
      tag,
      data: { url, type, ...d },
      vibrate: [200, 100, 200],
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

  // على المتصفحات الداعمة لـ FCM (Android/Chrome/Firefox) يتولّى onBackgroundMessage
  // العرض. هنا نعالج فقط Web Push الخام (iOS/Safari) حيث Firebase غير مُهيّأ.
  // → مصدر عرض واحد لكل بيئة = بلا تكرار وبلا اعتماد على توقيت هشّ.
  if (firebaseInitialized) {
    return;
  }

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
  const tag = fcmData.tag || `${type || 'default'}-${Date.now()}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // إرسال postMessage لتحديث الواجهة إذا التطبيق مفتوح
      const focusedClient = clients.find((c) => c.focused);
      if (focusedClient) {
        focusedClient.postMessage({
          type: 'PUSH_RECEIVED',
          payload: { title, body, data: { url, type, ...fcmData } },
        });
      }

      return self.registration.showNotification(title, {
        body,
        icon: '/mafia_logo.png',
        badge: '/mafia_logo.png',
        tag,
        data: { url, type, ...fcmData },
        vibrate: [200, 100, 200],
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

// ══════════════════════════════════════════════════════
// 🔁 تجديد اشتراك Web Push (iOS) + إعادة تسجيله في السيرفر
// ══════════════════════════════════════════════════════

const AUTH_CACHE = 'mafia-auth';
const AUTH_KEY = '/__player_token';

// تحويل VAPID key (Base64URL) إلى Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// تخزين/قراءة توكن اللاعب (يبقى متاحاً للـ SW حتى بعد إعادة تشغيله)
async function storePlayerToken(token) {
  try {
    const cache = await caches.open(AUTH_CACHE);
    await cache.put(AUTH_KEY, new Response(token));
  } catch (e) { /* تجاهل */ }
}
async function getPlayerToken() {
  try {
    const cache = await caches.open(AUTH_CACHE);
    const res = await cache.match(AUTH_KEY);
    if (res) return await res.text();
  } catch (e) { /* تجاهل */ }
  return null;
}

// استقبال توكن اللاعب من التطبيق لتخزينه (لإعادة التسجيل لاحقاً)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SET_AUTH_TOKEN' && data.token) {
    event.waitUntil(storePlayerToken(data.token));
  }
});

// عند تدوير الاشتراك (شائع على iOS): أنشئ اشتراكاً جديداً بنفس مفتاح السيرفر وأعد تسجيله
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      // جلب نفس المفتاح العام الذي يوقّع به السيرفر (لتفادي عدم التطابق)
      let appServerKey;
      try {
        const vpRes = await fetch('/api/push/vapid-public-key');
        const { publicKey } = await vpRes.json();
        if (publicKey) appServerKey = urlBase64ToUint8Array(publicKey);
      } catch (e) { /* fallback أدناه */ }

      const subscription = await self.registration.pushManager.subscribe(
        appServerKey
          ? { userVisibleOnly: true, applicationServerKey: appServerKey }
          : (event.oldSubscription && event.oldSubscription.options) || { userVisibleOnly: true }
      );

      const token = await getPlayerToken();
      if (token && subscription) {
        await fetch('/api/player-notifications/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({
            token: 'WEBPUSH::' + JSON.stringify(subscription.toJSON()),
            // نفس deviceInfo المستخدم في التطبيق (User-Agent) ليتم إزالة التكرار حسب الجهاز
            deviceInfo: (self.navigator && self.navigator.userAgent ? self.navigator.userAgent.slice(0, 200) : 'sw-resubscribe'),
          }),
        });
        console.log('🔄 Push subscription renewed and re-registered with server');
      } else {
        console.log('🔄 Push subscription renewed (no stored auth token — skipped server re-register)');
      }
    } catch (err) {
      console.error('❌ Failed to renew push subscription:', err);
    }
  })());
});
