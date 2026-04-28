'use client';

// ══════════════════════════════════════════════════════
// 🔔 بانر إشعار داخل التطبيق (Foreground)
// يعرض بانر عند وصول إشعار والتطبيق مفتوح
// عند الضغط → navigate لنفس URL الذي يستخدمه إشعار النظام
// ══════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  type?: string;
}

// ── نفس منطق resolveNotificationUrl في sw.js ──
function resolveUrl(type?: string, data?: any): string {
  if (data?.url) return data.url;
  if (!type) return '/player/home';
  switch (type) {
    case 'activity_started':
      return data?.roomCode ? `/player/join?code=${data.roomCode}` : '/player/home';
    case 'new_activity':
      return data?.activityId ? `/player/games?activityId=${data.activityId}` : '/player/games';
    case 'booking_confirmed':
    case 'game_ended':
      return '/player/home';
    case 'custom':
      return data?.url || '/player/home';
    default:
      return data?.url || '/player/home';
  }
}

export default function InAppNotificationBanner() {
  const router = useRouter();
  const [notification, setNotification] = useState<NotificationPayload | null>(null);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  const dismiss = useCallback(() => {
    setNotification(null);
    if (autoHideTimer) clearTimeout(autoHideTimer);
  }, [autoHideTimer]);

  const handleClick = useCallback(() => {
    if (!notification) return;
    const url = notification.url;
    dismiss();
    router.push(url);
  }, [notification, dismiss, router]);

  const showNotification = useCallback((payload: NotificationPayload) => {
    // مسح أي timer سابق
    if (autoHideTimer) clearTimeout(autoHideTimer);
    setNotification(payload);
    // إخفاء تلقائي بعد 8 ثوانٍ
    const timer = setTimeout(() => setNotification(null), 8000);
    setAutoHideTimer(timer);

    // اهتزاز خفيف
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }, [autoHideTimer]);

  useEffect(() => {
    // ── استقبال FCM Foreground (Chrome/Firefox/Edge) ──
    let unsubFCM: (() => void) | undefined;
    import('../lib/firebase').then(({ onForegroundMessage }) => {
      unsubFCM = onForegroundMessage((payload: any) => {
        const notif = payload.notification || {};
        const data = payload.data || {};
        const url = resolveUrl(data.type, data);
        showNotification({
          title: notif.title || '🎭 نادي المافيا',
          body: notif.body || '',
          url,
          type: data.type,
        });
      });
    }).catch(() => {});

    // ── استقبال WebPush من SW (iOS Safari) ──
    const swHandler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        const p = event.data.payload || {};
        showNotification({
          title: p.title || '🎭 نادي المافيا',
          body: p.body || '',
          url: p.data?.url || resolveUrl(p.data?.type, p.data),
          type: p.data?.type,
        });
      }
    };
    navigator.serviceWorker?.addEventListener('message', swHandler);

    return () => {
      if (unsubFCM) unsubFCM();
      navigator.serviceWorker?.removeEventListener('message', swHandler);
      if (autoHideTimer) clearTimeout(autoHideTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            position: 'fixed',
            top: 12,
            left: 12,
            right: 12,
            zIndex: 9999,
            background: 'linear-gradient(135deg, rgba(20,20,30,0.97), rgba(10,10,15,0.97))',
            border: '1px solid rgba(197,160,89,0.3)',
            borderRadius: 16,
            padding: '14px 16px',
            cursor: 'pointer',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(197,160,89,0.1)',
          }}
          onClick={handleClick}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {/* أيقونة */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(138,3,3,0.2)', border: '1px solid rgba(138,3,3,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}>
              🎭
            </div>

            {/* المحتوى */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: '#C5A059',
                marginBottom: 2, fontFamily: 'Amiri, serif',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {notification.title}
              </div>
              <div style={{
                fontSize: 13, color: '#999', lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {notification.body}
              </div>
            </div>

            {/* زر إغلاق */}
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(); }}
              style={{
                background: 'rgba(255,255,255,0.08)', border: 'none',
                borderRadius: 8, width: 28, height: 28,
                color: '#666', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* شريط تقدم — إخفاء تلقائي */}
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 8, ease: 'linear' }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: 3, background: 'rgba(197,160,89,0.4)',
              borderRadius: '0 0 16px 16px', transformOrigin: 'left',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
