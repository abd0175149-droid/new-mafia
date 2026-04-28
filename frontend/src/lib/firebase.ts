// ══════════════════════════════════════════════════════
// 🔥 Firebase Client — تهيئة Firebase في الفرونت إند
// يدعم: Chrome/Firefox/Edge عبر FCM + Safari/iOS عبر Push API
// ══════════════════════════════════════════════════════

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCPsBtXEVEP0aV2kMfFJJ0za-vbXr891Eo',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'mafia-b1c74.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'mafia-b1c74',
  storageBucket: 'mafia-b1c74.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '557623626620',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:557623626620:web:6f01e44a6d165008d032f9',
  measurementId: 'G-8ZLYCJP1NT',
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || 'BFGiTspOQlBQjZHxS8JRZREtw81LVVtB0JJyumRbi2TGBvZ7C78naUFtCfGVO6Etllyw9Nam2gi3XQJeJcGr0qk';

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) return null;
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }
  app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (messaging) return messaging;
  const fbApp = getFirebaseApp();
  if (!fbApp) return null;
  try {
    messaging = getMessaging(fbApp);
    return messaging;
  } catch (err) {
    console.warn('⚠️ Firebase Messaging init failed:', err);
    return null;
  }
}

// ── هل المتصفح Safari/iOS؟ ──
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome/.test(ua);
}

// ── تحويل VAPID key من Base64 URL لـ Uint8Array ──
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) {
    console.warn('⚠️ Notification API not available');
    return null;
  }

  const permission = await Notification.requestPermission();
  console.log('🔔 Notification permission:', permission);
  if (permission !== 'granted') return null;

  // الخطوة 1: محاولة FCM أولاً
  const m = getFirebaseMessaging();
  if (m && VAPID_KEY) {
    try {
      console.log('🔔 Attempting FCM getToken...');
      
      // تسجيل Firebase Messaging SW — مطلوب لـ FCM على كل المتصفحات
      let fcmSwReg: ServiceWorkerRegistration;
      try {
        fcmSwReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        // انتظر حتى يكون جاهز
        await navigator.serviceWorker.ready;
        console.log('🔔 Firebase Messaging SW registered, scope:', fcmSwReg.scope);
      } catch (swErr) {
        console.warn('⚠️ Firebase SW registration failed, using default:', swErr);
        fcmSwReg = await navigator.serviceWorker.ready;
      }

      const token = await getToken(m, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: fcmSwReg,
      });

      if (token) {
        console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
        return token;
      }
      console.warn('⚠️ FCM getToken returned null/empty');
    } catch (err) {
      console.warn('⚠️ FCM getToken failed, trying native Push API:', err);
    }
  }

  // الخطوة 2: Fallback — Push API مباشر (Safari iOS/macOS)
  console.log('🔔 Falling back to native Push API (Safari)...');
  try {
    const swReg = await navigator.serviceWorker.ready;
    
    // فحص إذا فيه اشتراك موجود
    let subscription = await swReg.pushManager.getSubscription();
    
    if (!subscription) {
      console.log('🔔 Creating new push subscription...');
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
    }

    if (!subscription) {
      console.error('❌ Failed to create push subscription');
      return null;
    }

    // نحوّل الـ subscription لنص JSON ونرسله كـ "token"
    // الباكند سيتعرف عليه بالبادئة WEBPUSH::
    const subJson = JSON.stringify(subscription.toJSON());
    const webpushToken = 'WEBPUSH::' + subJson;
    
    console.log('✅ Native push subscription created:', subscription.endpoint.substring(0, 50) + '...');
    return webpushToken;
  } catch (err) {
    console.error('❌ Native Push API also failed:', err);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const m = getFirebaseMessaging();
  if (!m) return () => {};
  return onMessage(m, callback);
}
