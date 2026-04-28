// ══════════════════════════════════════════════════════
// 🔥 تهيئة Firebase Admin — Firebase Configuration
// يدعم: ملف JSON أو متغيرات بيئة
// ══════════════════════════════════════════════════════

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let firebaseApp: admin.app.App | null = null;

export function initFirebase(): admin.app.App | null {
  if (firebaseApp) return firebaseApp;

  try {
    let serviceAccount: any = null;

    // الطريقة 1: ملف Service Account JSON
    const possiblePaths = [
      join(process.cwd(), 'firebase-service-account.json'),
      join(process.cwd(), 'serviceAccountKey.json'),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        serviceAccount = JSON.parse(readFileSync(p, 'utf-8'));
        console.log(`🔥 Firebase: Using service account from ${p}`);
        break;
      }
    }

    // الطريقة 2: متغيرات البيئة
    if (!serviceAccount) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        serviceAccount = { projectId, clientEmail, privateKey };
        console.log('🔥 Firebase: Using environment variables');
      }
    }

    if (!serviceAccount) {
      console.warn('⚠️ Firebase credentials not found — push notifications disabled');
      console.warn('   Place firebase-service-account.json in backend root, or set FIREBASE_* env vars');
      return null;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin initialized successfully');
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
