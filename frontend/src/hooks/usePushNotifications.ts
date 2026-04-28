'use client';

// ══════════════════════════════════════════════════════
// 🔔 Hook لإدارة Push Notifications
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
  const [permissionGranted, setPermissionGranted] = useState(false);
  const registeredRef = useRef(false);

  // ── تسجيل FCM Token ──
  const registerToken = useCallback(async () => {
    if (!player || registeredRef.current) return;
    registeredRef.current = true;

    try {
      const { requestNotificationPermission } = await import('../lib/firebase');
      const token = await requestNotificationPermission();
      if (!token) return;

      setPermissionGranted(true);

      await fetch('/api/player-notifications/register-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${player.token}`,
        },
        body: JSON.stringify({ token, deviceInfo: navigator.userAgent.slice(0, 200) }),
      });

      console.log('🔔 FCM token registered');
    } catch (err) {
      console.error('FCM registration error:', err);
      registeredRef.current = false;
    }
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

  // ── تسجيل عند تسجيل الدخول ──
  useEffect(() => {
    if (player) {
      registerToken();
      fetchNotifications();

      // Foreground messages
      import('../lib/firebase').then(({ onForegroundMessage }) => {
        onForegroundMessage((payload: any) => {
          console.log('🔔 Foreground message:', payload);
          fetchNotifications();
        });
      }).catch(() => {});

      // Polling كل 60 ثانية
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [player, registerToken, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    permissionGranted,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    registerToken,
  };
}
