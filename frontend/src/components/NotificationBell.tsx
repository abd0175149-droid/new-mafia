'use client';

// ══════════════════════════════════════════════════════
// 🔔 مركز الإشعارات — Notification Bell + Center
// يدعم iOS PWA + طلب إذن بنقرة المستخدم
// ══════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { usePushNotifications } from '../hooks/usePushNotifications';

// ── نفس منطق resolveNotificationUrl في sw.js ──
function resolveNotificationUrl(type: string, data: any): string | null {
  if (data?.url) return data.url;
  switch (type) {
    case 'activity_started':
      return data?.roomCode ? `/player/join?code=${data.roomCode}` : null;
    case 'new_activity':
      return data?.activityId ? `/player/games?activityId=${data.activityId}` : '/player/games';
    case 'booking_confirmed':
      return '/player/home';
    case 'game_ended':
      return '/player/home';
    case 'custom':
      return data?.url || null;
    default:
      return null;
  }
}

const TYPE_ICONS: Record<string, string> = {
  new_activity: '📅', game_ended: '🎮', custom: '📢', reminder: '⏰',
  friend_booked: '👥', level_up: '🏆', booking_confirmed: '✅', comeback: '🔥',
};

const TYPE_COLORS: Record<string, string> = {
  new_activity: '#f59e0b', game_ended: '#ef4444', custom: '#8b5cf6', reminder: '#3b82f6',
  friend_booked: '#22c55e', level_up: '#f59e0b', booking_confirmed: '#22c55e', comeback: '#ef4444',
};

export function NotificationBell() {
  const {
    notifications, unreadCount, permissionState, needsInstall,
    markAsRead, markAllAsRead, requestPermission,
  } = usePushNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleEnableNotifications = async () => {
    setEnabling(true);
    await requestPermission();
    setEnabling(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, width: 42, height: 42,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444', color: '#fff', borderRadius: '50%',
            minWidth: 20, height: 20, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute', top: 50, left: 0,
              width: 340, maxHeight: 480,
              background: 'rgba(17,17,17,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16, overflow: 'hidden', zIndex: 100,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
                الإشعارات {unreadCount > 0 && `(${unreadCount})`}
              </span>
              {unreadCount > 0 && (
                <button onClick={() => markAllAsRead()} style={{
                  background: 'none', border: 'none', color: '#f59e0b', fontSize: 12, cursor: 'pointer',
                }}>
                  قراءة الكل ✓
                </button>
              )}
            </div>

            {/* ── زر تفعيل الإشعارات (iOS + أول مرة) ── */}
            {permissionState === 'prompt' && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(59,130,246,0.08)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <button
                  onClick={handleEnableNotifications}
                  disabled={enabling}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: 10,
                    border: 'none',
                    background: enabling ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: '#fff', fontWeight: 600, fontSize: 13,
                    cursor: enabling ? 'wait' : 'pointer',
                  }}
                >
                  {enabling ? '⏳ جاري التفعيل...' : '🔔 تفعيل الإشعارات على هاتفك'}
                </button>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '6px 0 0', textAlign: 'center' }}>
                  اضغط للحصول على إشعارات فورية
                </p>
              </div>
            )}

            {/* ── رسالة iOS — يحتاج إضافة للشاشة الرئيسية ── */}
            {needsInstall && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(245,158,11,0.08)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ color: '#f59e0b', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  📱 لتفعيل الإشعارات على iPhone
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.6 }}>
                  1. اضغط على <span style={{ fontSize: 16 }}>⎙</span> (مشاركة) في أسفل Safari
                  <br />
                  2. اختر <strong style={{ color: '#fff' }}>"إضافة إلى الشاشة الرئيسية"</strong>
                  <br />
                  3. افتح التطبيق من الشاشة الرئيسية
                </div>
              </div>
            )}

            {permissionState === 'denied' && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.08)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ color: '#ef4444', fontSize: 12 }}>
                  ❌ تم رفض الإشعارات — يمكنك تفعيلها من إعدادات المتصفح
                </div>
              </div>
            )}

            {/* List */}
            <div style={{ overflowY: 'auto', maxHeight: 340 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                  لا توجد إشعارات
                </div>
              ) : (
                notifications.slice(0, 30).map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markAsRead(n.id);
                      const url = resolveNotificationUrl(n.type, n.data);
                      if (url) {
                        setOpen(false);
                        router.push(url);
                      }
                    }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      background: n.isRead ? 'transparent' : 'rgba(245,158,11,0.05)',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{
                        fontSize: 22, width: 32, height: 32, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${TYPE_COLORS[n.type] || '#666'}20`, flexShrink: 0,
                      }}>
                        {TYPE_ICONS[n.type] || '🔔'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: n.isRead ? 'rgba(255,255,255,0.6)' : '#fff',
                          fontWeight: n.isRead ? 400 : 600, fontSize: 13, marginBottom: 2,
                        }}>
                          {n.title}
                        </div>
                        <div style={{
                          color: 'rgba(255,255,255,0.4)', fontSize: 12,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {n.body}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 4 }}>
                          {formatTimeAgo(n.createdAt)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {!n.isRead && (
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#f59e0b',
                          }} />
                        )}
                        {resolveNotificationUrl(n.type, n.data) && (
                          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>◀</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}
