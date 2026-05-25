'use client';

// ══════════════════════════════════════════════════════
// 🔧 صفحة تشخيص الإشعارات الفائقة — Debug Push v2
// تعرض كل خطوة وأخطائها على الشاشة مباشرة
// الرابط: /player/debug-push
// ══════════════════════════════════════════════════════

import { useState, useRef } from 'react';

export default function DebugPushPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  function log(msg: string) {
    setLogs(prev => {
      const next = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      return next;
    });
  }

  // ══════════════════════════════════════════════════════
  // الخطوة 1: فحص البيئة والجهاز
  // ══════════════════════════════════════════════════════
  async function step1_environment() {
    log('═══════════ الخطوة 1: فحص البيئة ═══════════');
    const ua = navigator.userAgent;
    log(`📱 User-Agent: ${ua}`);

    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const hasSafariInUA = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';

    log(`📱 iOS device: ${isIOS}`);
    log(`📱 Safari keyword in UA: ${hasSafariInUA}`);
    log(`📱 Standalone PWA mode: ${isStandalone}`);
    log(`🔒 Secure context (HTTPS): ${isSecure}`);
    log(`🌐 Current URL: ${location.href}`);
    log(`🌐 Protocol: ${location.protocol}`);

    if (!isSecure) {
      log('🚨🚨🚨 الاتصال غير آمن (HTTP)! الإشعارات لن تعمل على iOS أبداً بدون HTTPS! 🚨🚨🚨');
    }

    if (isIOS && !isStandalone) {
      log('⚠️ iOS + ليس PWA standalone → Apple تمنع الإشعارات في Safari العادي');
      log('⚠️ يجب إضافة التطبيق للشاشة الرئيسية أولاً');
    }

    return { isIOS, isStandalone, isSecure };
  }

  // ══════════════════════════════════════════════════════
  // الخطوة 2: فحص Notification API
  // ══════════════════════════════════════════════════════
  async function step2_notificationAPI() {
    log('═══════════ الخطوة 2: فحص Notification API ═══════════');

    if (!('Notification' in window)) {
      log('❌ Notification API غير موجود في هذا المتصفح!');
      return null;
    }
    log('✅ Notification API: موجود');

    const currentPerm = Notification.permission;
    log(`🔔 الإذن الحالي قبل الطلب: "${currentPerm}"`);

    if (currentPerm === 'denied') {
      log('🚨 الإذن مرفوض (denied) مسبقاً! المتصفح لن يعرض نافذة الطلب مجدداً!');
      log('🚨 يجب تغييره يدوياً من إعدادات الهاتف/المتصفح');
      return 'denied';
    }

    log('🔔 جاري طلب الإذن من المستخدم (requestPermission)...');
    try {
      const permission = await Notification.requestPermission();
      log(`🔔 نتيجة requestPermission(): "${permission}"`);
      if (permission !== 'granted') {
        log('❌ المستخدم رفض الإذن أو المتصفح حظره تلقائياً');
      }
      return permission;
    } catch (err: any) {
      log(`❌ requestPermission() رمى خطأ: ${err.name}: ${err.message}`);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // الخطوة 3: تسجيل Service Worker
  // ══════════════════════════════════════════════════════
  async function step3_serviceWorker() {
    log('═══════════ الخطوة 3: Service Worker ═══════════');

    if (!('serviceWorker' in navigator)) {
      log('❌ Service Worker غير مدعوم!');
      return null;
    }
    log('✅ Service Worker API: مدعوم');

    // عرض SW المسجلة حالياً
    const existing = await navigator.serviceWorker.getRegistrations();
    log(`⚙️ عدد SW المسجلة حالياً: ${existing.length}`);
    existing.forEach((reg, i) => {
      log(`   SW[${i}]: scope="${reg.scope}" active=${!!reg.active} waiting=${!!reg.waiting} installing=${!!reg.installing}`);
    });

    // تسجيل sw.js
    log('⚙️ جاري تسجيل /sw.js ...');
    let swReg: ServiceWorkerRegistration;
    try {
      swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      log(`✅ sw.js تسجّل بنجاح! scope: "${swReg.scope}"`);
      log(`   active: ${!!swReg.active}, waiting: ${!!swReg.waiting}, installing: ${!!swReg.installing}`);
    } catch (err: any) {
      log(`❌ فشل تسجيل sw.js: ${err.name}: ${err.message}`);
      return null;
    }

    // انتظار الجاهزية
    log('⚙️ جاري انتظار SW ready...');
    try {
      const readyReg = await navigator.serviceWorker.ready;
      log(`✅ SW جاهز! scope: "${readyReg.scope}", active: ${!!readyReg.active}`);
      return readyReg;
    } catch (err: any) {
      log(`❌ SW ready فشل: ${err.name}: ${err.message}`);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // الخطوة 4: جلب VAPID Key من السيرفر
  // ══════════════════════════════════════════════════════
  async function step4_vapidKey() {
    log('═══════════ الخطوة 4: VAPID Key ═══════════');
    log('🔑 جاري جلب VAPID public key من /api/push/vapid-public-key ...');

    try {
      const res = await fetch('/api/push/vapid-public-key');
      log(`🔑 HTTP status: ${res.status}`);
      const data = await res.json();
      if (data.publicKey) {
        log(`✅ VAPID Key: ${data.publicKey.substring(0, 40)}...`);
        log(`🔑 طول المفتاح: ${data.publicKey.length} حرف`);
        return data.publicKey;
      } else {
        log(`❌ السيرفر لم يرجع publicKey! الرد: ${JSON.stringify(data)}`);
        return null;
      }
    } catch (err: any) {
      log(`❌ فشل جلب VAPID key: ${err.name}: ${err.message}`);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // الخطوة 5: إنشاء Push Subscription (Web Push)
  // ══════════════════════════════════════════════════════
  async function step5_subscribe(swReg: ServiceWorkerRegistration, vapidKey: string) {
    log('═══════════ الخطوة 5: Push Subscription ═══════════');

    // فحص الاشتراك الحالي
    try {
      const existingSub = await swReg.pushManager.getSubscription();
      if (existingSub) {
        log(`📌 اشتراك قديم موجود — endpoint: ${existingSub.endpoint.substring(0, 60)}...`);
        log('📌 جاري حذفه لإعادة الإنشاء بالمفتاح الصحيح...');
        const ok = await existingSub.unsubscribe();
        log(`📌 حذف الاشتراك القديم: ${ok ? '✅ نجح' : '❌ فشل'}`);
      } else {
        log('📌 لا يوجد اشتراك سابق');
      }
    } catch (err: any) {
      log(`⚠️ خطأ أثناء فحص/حذف الاشتراك القديم: ${err.message}`);
    }

    // تحويل VAPID key إلى Uint8Array
    log('🔑 جاري تحويل VAPID key إلى applicationServerKey...');
    let applicationServerKey: Uint8Array;
    try {
      const padding = '='.repeat((4 - (vapidKey.length % 4)) % 4);
      const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      applicationServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }
      log(`✅ applicationServerKey جاهز (${applicationServerKey.length} bytes)`);
    } catch (err: any) {
      log(`❌ فشل تحويل VAPID key: ${err.name}: ${err.message}`);
      return null;
    }

    // محاولة الاشتراك
    log('📌 جاري pushManager.subscribe()...');
    try {
      const subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      if (!subscription) {
        log('❌ pushManager.subscribe() أرجع null!');
        return null;
      }

      const subJson = JSON.stringify(subscription.toJSON());
      log('✅✅✅ تم إنشاء Push Subscription بنجاح! ✅✅✅');
      log(`📌 Endpoint: ${subscription.endpoint.substring(0, 80)}...`);
      log(`📌 Token (أول 80 حرف): WEBPUSH::${subJson.substring(0, 80)}...`);
      return 'WEBPUSH::' + subJson;
    } catch (err: any) {
      log(`❌❌❌ pushManager.subscribe() فشل! ❌❌❌`);
      log(`❌ Error name: ${err.name}`);
      log(`❌ Error message: ${err.message}`);
      if (err.name === 'NotAllowedError') {
        log('🚨 NotAllowedError = المتصفح حظر الاشتراك! أسباب محتملة:');
        log('   1. الإذن مرفوض (denied) في إعدادات الهاتف');
        log('   2. انتهت صلاحية تفاعل المستخدم (user gesture expired)');
        log('   3. الاتصال غير آمن (HTTP وليس HTTPS)');
      }
      if (err.name === 'InvalidStateError') {
        log('🚨 InvalidStateError = SW في حالة غير صالحة. جرب إعادة تحميل الصفحة');
      }
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // الخطوة 6: إرسال Token للسيرفر
  // ══════════════════════════════════════════════════════
  async function step6_register(token: string) {
    log('═══════════ الخطوة 6: تسجيل Token في السيرفر ═══════════');

    const playerData = localStorage.getItem('mafia_player_auth');
    if (!playerData) {
      log('⚠️ لا توجد بيانات لاعب في localStorage (غير مسجل دخوله)');
      log('⚠️ سنحاول الإرسال بدون Authorization للتحقق من وصول الطلب للسيرفر');
    }

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (playerData) {
      try {
        const player = JSON.parse(playerData);
        headers['Authorization'] = `Bearer ${player.token}`;
        log(`👤 اللاعب: ${player.name || player.playerId} (token موجود)`);
      } catch { log('⚠️ فشل قراءة بيانات اللاعب من localStorage'); }
    }

    log('📤 جاري إرسال POST /api/player-notifications/register-token ...');
    try {
      const res = await fetch('/api/player-notifications/register-token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token,
          deviceInfo: navigator.userAgent.slice(0, 200),
        }),
      });
      log(`📤 HTTP status: ${res.status}`);
      const result = await res.json();
      log(`📤 الرد: ${JSON.stringify(result)}`);
      if (result.success) {
        log('✅✅✅ Token تم تسجيله في السيرفر بنجاح! ✅✅✅');
      } else {
        log('❌ السيرفر رفض التسجيل');
      }
    } catch (err: any) {
      log(`❌ فشل إرسال Token: ${err.name}: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════
  // التشغيل الكامل
  // ══════════════════════════════════════════════════════
  async function runFullDiagnostics() {
    setLogs([]);
    setRunning(true);
    log('🚀 بدء التشخيص الشامل...');

    try {
      // 1. البيئة
      const env = await step1_environment();

      // 2. Notification API
      const perm = await step2_notificationAPI();
      if (!perm || perm !== 'granted') {
        log('🛑 توقف: الإذن غير ممنوح — لا يمكن المتابعة');
        setRunning(false);
        return;
      }

      // 3. Service Worker
      const swReg = await step3_serviceWorker();
      if (!swReg) {
        log('🛑 توقف: Service Worker غير جاهز');
        setRunning(false);
        return;
      }

      // 4. VAPID Key
      const vapidKey = await step4_vapidKey();
      if (!vapidKey) {
        log('🛑 توقف: لا يوجد VAPID key');
        setRunning(false);
        return;
      }

      // 5. Push Subscription
      const token = await step5_subscribe(swReg, vapidKey);
      if (!token) {
        log('🛑 توقف: فشل إنشاء Push Subscription');
        setRunning(false);
        return;
      }

      // 6. تسجيل في السيرفر
      await step6_register(token);

      log('');
      log('🏁🏁🏁 التشخيص اكتمل بنجاح! 🏁🏁🏁');
    } catch (err: any) {
      log(`💥 خطأ غير متوقع: ${err.name}: ${err.message}`);
      log(`💥 Stack: ${err.stack || ''}`);
    }
    setRunning(false);
  }

  return (
    <div style={{ padding: 16, background: '#0a0a0a', color: '#eee', minHeight: '100vh', direction: 'ltr', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
      <h1 style={{ color: '#f59e0b', fontSize: 18, marginBottom: 12, textAlign: 'center' }}>
        🔧 Push Notifications Debugger v2
      </h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button
        onClick={runFullDiagnostics}
        disabled={running}
        style={{
          padding: '14px 20px',
          background: running ? '#333' : 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#000',
          border: 'none',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 'bold',
          cursor: running ? 'not-allowed' : 'pointer',
          marginBottom: 12,
          width: '100%',
          opacity: running ? 0.6 : 1,
        }}
      >
        {running ? '⏳ جاري...' : '▶️ ابدأ التشخيص'}
      </button>

      <button
        onClick={() => {
          const text = logs.join('\n');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => alert('✅ تم نسخ التشخيص!')).catch(() => {
              const ta = document.createElement('textarea');
              ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
              alert('✅ تم نسخ التشخيص!');
            });
          } else {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            alert('✅ تم نسخ التشخيص!');
          }
        }}
        disabled={logs.length === 0}
        style={{
          padding: '14px 20px',
          background: logs.length === 0 ? '#222' : '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 'bold',
          cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
          flex: '0 0 auto',
          opacity: logs.length === 0 ? 0.4 : 1,
        }}
      >
        📋 نسخ
      </button>
      </div>

      <div style={{
        background: '#111',
        borderRadius: 10,
        padding: 10,
        maxHeight: '75vh',
        overflow: 'auto',
        border: '1px solid #222',
      }}>
        {logs.length === 0 && (
          <p style={{ color: '#555', textAlign: 'center', padding: 20 }}>
            اضغط الزر أعلاه لبدء التشخيص الشامل خطوة بخطوة
          </p>
        )}
        {logs.map((line, i) => (
          <div key={i} style={{
            padding: '3px 4px',
            borderBottom: '1px solid #1a1a1a',
            lineHeight: 1.6,
            color: line.includes('❌') || line.includes('🚨') ? '#ef4444'
              : line.includes('✅') ? '#22c55e'
              : line.includes('⚠️') ? '#f59e0b'
              : line.includes('═══') ? '#60a5fa'
              : '#aaa',
            fontWeight: line.includes('═══') ? 'bold' : 'normal',
            wordBreak: 'break-all',
          }}>
            {line}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
