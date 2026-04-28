'use client';

// ══════════════════════════════════════════════════════
// 🔧 صفحة تشخيص الإشعارات — Debug Push Notifications
// تعرض كل التفاصيل على الشاشة بدون Console
// الرابط: /player/debug-push
// ══════════════════════════════════════════════════════

import { useState } from 'react';

export default function DebugPushPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  function log(msg: string) {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function runDiagnostics() {
    setLogs([]);
    setRunning(true);

    try {
      // 1. معلومات الجهاز
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
      const isStandalone = (window.navigator as any).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;
      
      log(`📱 User Agent: ${ua.substring(0, 100)}`);
      log(`📱 iOS: ${isIOS}`);
      log(`📱 Safari: ${isSafari}`);
      log(`📱 Standalone (PWA): ${isStandalone}`);

      // 2. Notification API
      if (!('Notification' in window)) {
        log('❌ Notification API غير موجود!');
        setRunning(false);
        return;
      }
      log(`🔔 Notification API: موجود ✅`);
      log(`🔔 Permission الحالي: ${Notification.permission}`);

      // 3. Service Worker
      if (!('serviceWorker' in navigator)) {
        log('❌ Service Worker غير مدعوم!');
        setRunning(false);
        return;
      }
      log('⚙️ Service Worker: مدعوم ✅');

      const registrations = await navigator.serviceWorker.getRegistrations();
      log(`⚙️ عدد SW المسجلة: ${registrations.length}`);
      registrations.forEach((reg, i) => {
        log(`⚙️ SW[${i}]: scope=${reg.scope}, active=${!!reg.active}, waiting=${!!reg.waiting}`);
      });

      // 4. طلب إذن الإشعارات
      log('🔔 جاري طلب إذن الإشعارات...');
      const permission = await Notification.requestPermission();
      log(`🔔 نتيجة الإذن: ${permission}`);
      if (permission !== 'granted') {
        log('❌ الإذن مرفوض — لا يمكن المتابعة');
        setRunning(false);
        return;
      }

      // 5. تسجيل SW
      log('⚙️ جاري تسجيل sw.js...');
      let swReg: ServiceWorkerRegistration;
      try {
        swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        log(`⚙️ sw.js تسجّل ✅ scope: ${swReg.scope}`);
      } catch (swErr: any) {
        log(`❌ فشل تسجيل sw.js: ${swErr.message}`);
        setRunning(false);
        return;
      }

      await navigator.serviceWorker.ready;
      log('⚙️ SW جاهز ✅');

      // 6. محاولة FCM (Firebase) — فقط على Android/Chrome, ليس iOS!
      let fcmToken: string | null = null;
      const isIOSSafari = isIOS && isSafari;
      
      if (isIOSSafari) {
        log('🍎 iOS Safari → نتجاوز FCM (tokens وهمية!) → Web Push API مباشرة');
      } else {
        log('🔥 جاري محاولة FCM...');
        try {
          const { getFirebaseMessaging } = await import('@/lib/firebase');
          const m = getFirebaseMessaging();
          log(`🔥 Firebase Messaging object: ${m ? 'موجود' : 'null'}`);
          
          if (m) {
            const { getToken } = await import('firebase/messaging');
            const VAPID_KEY = 'BFGiTspOQlBQjZHxS8JRZREtw81LVVtB0JJyumRbi2TGBvZ7C78naUFtCfGVO6Etllyw9Nam2gi3XQJeJcGr0qk';
            log('🔥 جاري getToken...');
            fcmToken = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
            if (fcmToken) {
              log(`✅ FCM Token: ${fcmToken.substring(0, 30)}...`);
              log(`📝 Token type: FCM (Android/Chrome)`);
            } else {
              log('⚠️ FCM getToken رجع null');
            }
          }
        } catch (fcmErr: any) {
          log(`⚠️ FCM فشل: ${fcmErr.message}`);
        }
      }

      // 7. محاولة Web Push API (لـ iOS أو fallback)
      if (!fcmToken) {
        log('🍎 جاري محاولة Web Push API (iOS fallback)...');
        try {
          // جلب VAPID public key من السيرفر
          log('🔑 جاري جلب VAPID public key...');
          const vpRes = await fetch('/api/push/vapid-public-key');
          const vpData = await vpRes.json();
          log(`🔑 VAPID Public Key: ${vpData.publicKey ? vpData.publicKey.substring(0, 30) + '...' : 'غير موجود!'}`);

          if (!vpData.publicKey) {
            log('❌ لا يوجد VAPID public key!');
            setRunning(false);
            return;
          }

          // تحويل المفتاح
          const padding = '='.repeat((4 - (vpData.publicKey.length % 4)) % 4);
          const base64 = (vpData.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = atob(base64);
          const applicationServerKey = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            applicationServerKey[i] = rawData.charCodeAt(i);
          }

          // فحص اشتراك موجود
          const existingSub = await swReg.pushManager.getSubscription();
          log(`📌 اشتراك موجود: ${existingSub ? 'نعم' : 'لا'}`);

          let subscription = existingSub;
          if (!subscription) {
            log('📌 جاري إنشاء اشتراك جديد...');
            try {
              subscription = await swReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey,
              });
              log('✅ تم إنشاء اشتراك Web Push!');
            } catch (subErr: any) {
              log(`❌ فشل إنشاء اشتراك: ${subErr.message}`);
              log(`❌ تفاصيل: ${subErr.stack || 'لا توجد'}`);
              setRunning(false);
              return;
            }
          }

          if (subscription) {
            const subJson = JSON.stringify(subscription.toJSON());
            const webpushToken = 'WEBPUSH::' + subJson;
            log(`✅ Web Push Token: WEBPUSH::${subJson.substring(0, 50)}...`);
            log(`📝 Token type: WEBPUSH (iOS/Safari)`);
            log(`📌 Endpoint: ${subscription.endpoint.substring(0, 60)}...`);

            // 8. إرسال Token للسيرفر
            log('📤 جاري إرسال Token للسيرفر...');
            const playerData = localStorage.getItem('mafia_player_auth');
            if (playerData) {
              const player = JSON.parse(playerData);
              const res = await fetch('/api/player-notifications/register-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${player.token}`,
                },
                body: JSON.stringify({ token: webpushToken, deviceInfo: ua.slice(0, 200) }),
              });
              const result = await res.json();
              log(`📤 نتيجة التسجيل: ${JSON.stringify(result)}`);
            } else {
              log('⚠️ لا يوجد بيانات لاعب في localStorage');
            }
          }
        } catch (wpErr: any) {
          log(`❌ Web Push فشل: ${wpErr.message}`);
          log(`❌ Stack: ${wpErr.stack || 'لا توجد'}`);
        }
      } else {
        // FCM نجح — سجل Token
        log('📤 جاري إرسال FCM Token للسيرفر...');
        const playerData = localStorage.getItem('mafia_player_auth');
        if (playerData) {
          const player = JSON.parse(playerData);
          const res = await fetch('/api/player-notifications/register-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${player.token}`,
            },
            body: JSON.stringify({ token: fcmToken, deviceInfo: ua.slice(0, 200) }),
          });
          const result = await res.json();
          log(`📤 نتيجة التسجيل: ${JSON.stringify(result)}`);
        }
      }

      log('🏁 التشخيص اكتمل!');
    } catch (err: any) {
      log(`💥 خطأ غير متوقع: ${err.message}`);
      log(`💥 Stack: ${err.stack || ''}`);
    }
    setRunning(false);
  }

  return (
    <div style={{ padding: 20, background: '#111', color: '#eee', minHeight: '100vh', direction: 'ltr', fontFamily: 'monospace' }}>
      <h1 style={{ color: '#f59e0b', fontSize: 20, marginBottom: 16 }}>🔧 Push Notifications Debug</h1>
      
      <button
        onClick={runDiagnostics}
        disabled={running}
        style={{
          padding: '12px 24px',
          background: running ? '#555' : '#f59e0b',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 'bold',
          cursor: running ? 'not-allowed' : 'pointer',
          marginBottom: 16,
          width: '100%',
        }}
      >
        {running ? '⏳ Running...' : '▶️ Run Diagnostics'}
      </button>

      <div style={{ background: '#1a1a1a', borderRadius: 8, padding: 12, maxHeight: '70vh', overflow: 'auto' }}>
        {logs.length === 0 && <p style={{ color: '#666' }}>اضغط Run Diagnostics لبدء التشخيص</p>}
        {logs.map((line, i) => (
          <div key={i} style={{
            padding: '4px 0',
            borderBottom: '1px solid #222',
            fontSize: 12,
            lineHeight: 1.5,
            color: line.includes('❌') ? '#ef4444' : line.includes('✅') ? '#22c55e' : line.includes('⚠️') ? '#f59e0b' : '#ccc',
            wordBreak: 'break-all',
          }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
