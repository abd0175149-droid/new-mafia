// ══════════════════════════════════════════════════════
// 🔥 Firebase Messaging Service Worker
// مطلوب لأن Firebase SDK يبحث عن هذا الملف بالتحديد
// يتضمن: استقبال + عرض + توجيه عند الضغط
// ══════════════════════════════════════════════════════

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

// ── استقبال رسالة FCM في الخلفية ──
messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  
  const title = notification.title || '🎭 نادي المافيا';
  const body = notification.body || '';

  // تحديد URL التوجيه حسب نوع الإشعار
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

// ── فتح التطبيق عند الضغط على الإشعار ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data || {};
  const url = data.url || resolveNotificationUrl(data.type, data);

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

// ── تحديد URL التوجيه حسب نوع الإشعار ──
function resolveNotificationUrl(type, data) {
  switch (type) {
    case 'activity_started':
      // النشاط بدأ → صفحة اختيار المقعد
      return data.roomCode 
        ? `/player/join?code=${data.roomCode}` 
        : '/player/home';
    
    case 'new_activity':
      // نشاط جديد → الصفحة الرئيسية (فيها الأنشطة القادمة)
      return '/player/home';
    
    case 'booking_confirmed':
      // تم الحجز → الصفحة الرئيسية
      return '/player/home';
    
    case 'game_ended':
      // انتهت اللعبة → الصفحة الرئيسية
      return '/player/home';
    
    case 'custom':
      // إشعار مخصص → URL محدد أو الرئيسية
      return data.url || '/player/home';
    
    default:
      return data.url || '/player/home';
  }
}
