// ══════════════════════════════════════════════════════
// 🔥 تهيئة Firebase Admin — Firebase Configuration
// ══════════════════════════════════════════════════════

import admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

export function initFirebase(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('⚠️ Firebase credentials not configured — push notifications disabled');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log('✅ Firebase Admin initialized');
    return firebaseApp;
  } catch (err: any) {
    console.error('❌ Firebase init failed:', err.message);
    return null;
  }
}

export function getFirebaseApp(): admin.app.App | null {
  return firebaseApp;
}

export function getMessaging(): admin.messaging.Messaging | null {
  const app = firebaseApp || initFirebase();
  if (!app) return null;
  return admin.messaging(app);
}
