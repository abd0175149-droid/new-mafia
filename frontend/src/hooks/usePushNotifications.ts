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
    // 'default' means the user hasn't been asked yet
    const perm = Notification.permission;
    setPermissionState(perm === 'default' ? 'prompt' : perm as any);
  }, []);

  // ── طلب إذن + تسجيل Token (يُستدعى بنقرة المستخدم) ──
  const requestPermission = useCallback(async () => {
    if (!player) return false;
    if (typeof window === 'undefined') return false;
    if (!('Notification' in window)) return false;

    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission as any);

      if (permission !== 'granted') return false;

      const { requestNotificationPermission } = await import('../lib/firebase');
      const token = await requestNotificationPermission();
      if (!token) return false;

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
      return false;
    }
  }, [player]);

  // ── تسجيل تلقائي (فقط إذا الإذن ممنوح مسبقاً) ──
  useEffect(() => {
    if (!player || registeredRef.current) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    // فقط إذا كان الإذن ممنوح مسبقاً — لا نطلب تلقائياً
    if (Notification.permission === 'granted') {
      requestPermission();
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

    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
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
