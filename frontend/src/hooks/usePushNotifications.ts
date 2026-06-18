'use client';

// ══════════════════════════════════════════════════════
// 🔔 Hook لإدارة Push Notifications
// يدعم iOS PWA + Android + Desktop
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';

interface Notification {
  id: number;
  title: string;
  body: string;
  type: string;
  data: any;
  isRead: boolean;
  createdAt: string;
}

// ── أدوات مساعدة لاشتراكات Web Push ──
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) arr[i] = rawData.charCodeAt(i);
  return arr;
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function fetchServerVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    const data = await res.json();
    return data.publicKey || null;
  } catch { return null; }
}

// هل الاشتراك القائم مُنشأ بنفس مفتاح السيرفر الحالي؟ (إن لا → يجب إعادة إنشائه)
async function subscriptionMatchesServerKey(sub: PushSubscription): Promise<boolean> {
  try {
    const key = (sub.options as any)?.applicationServerKey as ArrayBuffer | null;
    if (!key) return false;
    const subKey = bufferToBase64Url(key);
    const serverKey = ((await fetchServerVapidKey()) || '').replace(/=+$/, '');
    return !!serverKey && subKey === serverKey;
  } catch { return false; }
}

async function createWebPushSubscription(swReg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  const serverKey = await fetchServerVapidKey();
  if (!serverKey) return null;
  // أزل أي اشتراك قديم بمفتاح مختلف ثم أنشئ واحداً جديداً مطابقاً
  const old = await swReg.pushManager.getSubscription();
  if (old) { try { await old.unsubscribe(); } catch {} }
  return swReg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(serverKey) as BufferSource,
  });
}

async function registerTokenToServer(token: string, auth: string): Promise<void> {
  await fetch('/api/player-notifications/register-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth}` },
    body: JSON.stringify({ token, deviceInfo: navigator.userAgent.slice(0, 200) }),
  });
}

export function usePushNotifications() {
  const { player } = usePlayer();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // 🔑 القيمة الأولية تُقرأ فوراً من localStorage لمنع ظهور شاشة الحجب لحظياً عند تحديث الصفحة
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>(() => {
    if (typeof window === 'undefined') return 'prompt';
    const locallyGranted = localStorage.getItem('push_notifications_enabled') === 'true';
    if (locallyGranted) return 'granted';
    if ('Notification' in window && Notification.permission === 'granted') return 'granted';
    return 'prompt';
  });

  const [isIOSPWA, setIsIOSPWA] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const registeredRef = useRef(false);

  // ── اكتشاف بيئة التشغيل (تحديث دقيق بعد أول render) ──
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isStandalone) {
      setNeedsInstall(true);
      setPermissionState('unsupported');
      return;
    }

    if (isIOS && isStandalone) {
      setIsIOSPWA(true);
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermissionState('unsupported');
      return;
    }

    (async () => {
      const perm = Notification.permission;
      let granted = perm === 'granted' || localStorage.getItem('push_notifications_enabled') === 'true';

      // 🔑 مصدر الحقيقة الأقوى: وجود اشتراك Push فعلي = الإشعارات مفعّلة بالفعل،
      // بغضّ النظر عمّا يقوله Notification.permission (غير موثوق على iOS PWA عبر الفتحات).
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          granted = true;
          localStorage.setItem('push_notifications_enabled', 'true');
        }
      } catch {}

      if (granted) {
        setPermissionState('granted');
      } else if (perm === 'denied' && !isIOS) {
        // 'denied' موثوق على Android/Desktop فقط
        setPermissionState('denied');
      } else {
        // iOS: لا نثق بـ 'denied' عند الإقلاع (قد يكون خاطئاً) — نُتيح للمستخدم محاولة التفعيل.
        // إن فشل الطلب فعلياً بـ denied سيُحدّثها requestPermission إلى 'denied' حينها.
        setPermissionState('prompt');
      }
    })();
  }, []);

  // ── طلب إذن + تسجيل Token (يُستدعى بنقرة المستخدم) ──
  const requestPermission = useCallback(async () => {
    if (!player) return false;
    if (typeof window === 'undefined') return false;
    if (!('Notification' in window)) return false;

    try {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        setPermissionState(permission as any);
        return false;
      }

      // ضبط حالة الإذن فوراً إلى granted محلياً لحماية الشاشة من الحجب
      setPermissionState('granted');
      localStorage.setItem('push_notifications_enabled', 'true');

      const { requestNotificationPermission } = await import('../lib/firebase');
      const token = await requestNotificationPermission();
      if (!token) {
        console.warn('⚠️ Push permission granted but failed to generate token');
        return true; // نعتبره ناجحاً لتجنب حجب الشاشة، ولكن بدون توكن
      }

      await fetch('/api/player-notifications/register-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${player.token}`,
        },
        body: JSON.stringify({ token, deviceInfo: navigator.userAgent.slice(0, 200) }),
      });

      registeredRef.current = true;
      console.log('🔔 FCM token registered');
      return true;
    } catch (err) {
      console.error('FCM registration error:', err);
      // في حال حدوث خطأ وكان الإذن granted بالفعل لا نحجب الشاشة
      if (Notification.permission === 'granted') {
        setPermissionState('granted');
        localStorage.setItem('push_notifications_enabled', 'true');
      }
      return false;
    }
  }, [player]);

  // ── تسجيل تلقائي (بلا churn: يعيد استخدام الاشتراك القائم بدل إعادة إنشائه) ──
  useEffect(() => {
    if (!player || registeredRef.current) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    (async () => {
      try {
        const swReg = await navigator.serviceWorker.ready;
        const existing = await swReg.pushManager.getSubscription();

        // ① اشتراك Web Push قائم بنفس مفتاح السيرفر → أعِد تسجيله كما هو (بلا إعادة إنشاء = بلا churn)
        if (existing && (await subscriptionMatchesServerKey(existing))) {
          const token = 'WEBPUSH::' + JSON.stringify(existing.toJSON());
          await registerTokenToServer(token, player.token);
          registeredRef.current = true;
          localStorage.setItem('push_notifications_enabled', 'true');
          console.log('♻️ Reused existing Web Push subscription (no churn)');
          return;
        }

        const browserPerm = ('Notification' in window) ? Notification.permission : 'default';
        const locallyGranted = localStorage.getItem('push_notifications_enabled') === 'true';

        // ② غير iOS مع إذن ممنوح → FCM (getToken يعيد نفس التوكن، بلا churn على أندرويد)
        if (!isIOS && browserPerm === 'granted') {
          requestPermission();
          return;
        }

        // ③ iOS بلا اشتراك صالح لكن سبق الموافقة → أنشئ اشتراكاً واحداً (مرّة واحدة فقط)
        if (isIOS && (browserPerm === 'granted' || (locallyGranted && browserPerm === 'default'))) {
          const subscription = await createWebPushSubscription(swReg);
          if (subscription) {
            const token = 'WEBPUSH::' + JSON.stringify(subscription.toJSON());
            await registerTokenToServer(token, player.token);
            registeredRef.current = true;
            localStorage.setItem('push_notifications_enabled', 'true');
            console.log('🍎✅ iOS: created and registered new Web Push subscription');
          }
        }
      } catch (err) {
        console.warn('⚠️ auto-register failed:', err);
      }
    })();
  }, [player, requestPermission]);

  // ── تزويد الـ SW بتوكن اللاعب (لإعادة تسجيل اشتراك Web Push عند تدويره على iOS) ──
  useEffect(() => {
    if (!player?.token) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      const target = reg.active || navigator.serviceWorker.controller;
      target?.postMessage({ type: 'SET_AUTH_TOKEN', token: player.token });
    }).catch(() => {});
  }, [player]);

  // ── جلب الإشعارات ──
  const fetchNotifications = useCallback(async () => {
    if (!player) return;
    try {
      const res = await fetch('/api/player-notifications', {
        headers: { 'Authorization': `Bearer ${player.token}` },
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadCount((data.notifications || []).filter((n: Notification) => !n.isRead).length);
      }
    } catch {}
  }, [player]);

  // ── تعليم كمقروء ──
  const markAsRead = useCallback(async (id: number) => {
    if (!player) return;
    await fetch(`/api/player-notifications/${id}/read`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${player.token}` },
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [player]);

  // ── تعليم الكل كمقروء ──
  const markAllAsRead = useCallback(async () => {
    if (!player) return;
    await fetch('/api/player-notifications/read-all', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${player.token}` },
    });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [player]);

  // ── Foreground messages + polling ──
  useEffect(() => {
    if (!player) return;
    fetchNotifications();

    if (permissionState === 'granted') {
      import('../lib/firebase').then(({ onForegroundMessage }) => {
        onForegroundMessage(() => fetchNotifications());
      }).catch(() => {});
    }

    // ── استقبال WebPush من SW (iOS) — تحديث الإشعارات ──
    const swHandler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        fetchNotifications();
      }
    };
    navigator.serviceWorker?.addEventListener('message', swHandler);

    const interval = setInterval(fetchNotifications, 60000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker?.removeEventListener('message', swHandler);
    };
  }, [player, fetchNotifications, permissionState]);

  return {
    notifications,
    unreadCount,
    permissionState,
    isIOSPWA,
    needsInstall,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    requestPermission,
  };
}
