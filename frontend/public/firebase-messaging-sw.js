// Firebase Messaging Service Worker
// يُعيد التوجيه لـ sw.js الرئيسي
// مطلوب لأن Firebase SDK يبحث عن هذا الملف بالتحديد

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

// عند استقبال رسالة في الخلفية
messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  
  const title = notification.title || '🎭 نادي المافيا';
  const body = notification.body || '';

  self.registration.showNotification(title, {
    body,
    icon: '/mafia_logo.png',
    badge: '/mafia_logo.png',
    tag: data.type || 'default',
    data: { url: data.url || '/player/home', type: data.type || '' },
    requireInteraction: true,
    renotify: true,
  });
});
