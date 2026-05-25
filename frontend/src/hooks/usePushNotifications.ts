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

export function usePushNotifications() {
  const { player } = usePlayer();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [isIOSPWA, setIsIOSPWA] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const registeredRef = useRef(false);

  // ── اكتشاف بيئة التشغيل ──
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

    // Notification.permission returns 'default' | 'granted' | 'denied'
    const perm = Notification.permission;
    
    // 💡 حل مشكلة آيفون (iOS PWA Bug): المتصفح يعيد حالة الإذن إلى default بالخطأ عند إعادة فتح التطبيق
    // نعتمد على localStorage كحافظة إضافية لحالة الإذن الممنوحة مسبقاً
    const hasGrantedLocally = localStorage.getItem('push_notifications_enabled') === 'true';
    if (hasGrantedLocally || perm === 'granted') {
      setPermissionState('granted');
    } else {
      setPermissionState(perm === 'default' ? 'prompt' : perm as any);
    }
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

  // ── تسجيل تلقائي (فقط إذا الإذن ممنوح مسبقاً) ──
  useEffect(() => {
    if (!player || registeredRef.current) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const browserPerm = Notification.permission;
    const locallyGranted = localStorage.getItem('push_notifications_enabled') === 'true';

    if (browserPerm === 'granted') {
      // المتصفح يقول granted → نسجل عبر المسار الطبيعي
      requestPermission();
    } else if (locallyGranted && browserPerm === 'default') {
      // 🍎 iOS PWA Bug: المتصفح أرجع 'default' لكننا نعرف أن المستخدم وافق سابقاً
      // نسجل مباشرة عبر Web Push بدون استدعاء requestPermission() لتجنب NotAllowedError
      (async () => {
        try {
          const swReg = await navigator.serviceWorker.ready;
          // جلب VAPID key من السيرفر
          const vpRes = await fetch('/api/push/vapid-public-key');
          const vpData = await vpRes.json();
          if (!vpData.publicKey) return;

          // حذف اشتراك قديم (تجنب VapidPkHashMismatch)
          const oldSub = await swReg.pushManager.getSubscription();
          if (oldSub) await oldSub.unsubscribe();

          // إنشاء اشتراك جديد
          const padding = '='.repeat((4 - (vpData.publicKey.length % 4)) % 4);
          const base64 = (vpData.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = atob(base64);
          const appServerKey = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) appServerKey[i] = rawData.charCodeAt(i);

          const subscription = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey as BufferSource,
          });

          if (subscription) {
            const subJson = JSON.stringify(subscription.toJSON());
            const webpushToken = 'WEBPUSH::' + subJson;
            await fetch('/api/player-notifications/register-token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${player.token}`,
              },
              body: JSON.stringify({ token: webpushToken, deviceInfo: navigator.userAgent.slice(0, 200) }),
            });
            registeredRef.current = true;
            console.log('🍎✅ iOS PWA: silent re-registration successful');
          }
        } catch (err) {
          console.warn('🍎⚠️ iOS PWA silent re-registration failed:', err);
        }
      })();
    }
  }, [player, requestPermission]);

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
