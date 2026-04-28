// ══════════════════════════════════════════════════════
// 🔥 Firebase Client — تهيئة Firebase في الفرونت إند
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
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const m = getFirebaseMessaging();
  if (!m || !VAPID_KEY) return null;

  try {
    const token = await getToken(m, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration(),
    });
    return token;
  } catch (err) {
    console.error('FCM getToken error:', err);
    return null;
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const m = getFirebaseMessaging();
  if (!m) return () => {};
  return onMessage(m, callback);
}
