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
    case 'feedback_survey':
      return data?.sessionId ? `/player/feedback?sessionId=${data.sessionId}` : '/player/feedback';
    case 'custom':
      return data?.url || null;
    default:
      return null;
  }
}

function isExternalUrl(u?: string): boolean {
  return !!u && /^https?:\/\//i.test(u);
}
// إشعار غنيّ = يحمل صورة أو فيديو → يُفتح في شاشة تفصيل داخل التطبيق
function isRich(data: any): boolean {
  return !!(data && (data.imageUrl || data.videoUrl));
}

const TYPE_ICONS: Record<string, string> = {
  new_activity: '📅', game_ended: '🎮', custom: '📢', reminder: '⏰',
  friend_booked: '👥', level_up: '🏆', booking_confirmed: '✅', comeback: '🔥',
  feedback_survey: '📋', order_status: '🍽️',
};

const TYPE_COLORS: Record<string, string> = {
  new_activity: '#f59e0b', game_ended: '#ef4444', custom: '#8b5cf6', reminder: '#3b82f6',
  friend_booked: '#22c55e', level_up: '#f59e0b', booking_confirmed: '#22c55e', comeback: '#ef4444',
  feedback_survey: '#8b5cf6', order_status: '#10b981',
};

export function NotificationBell() {
  const {
    notifications, unreadCount, permissionState, needsInstall,
    markAsRead, markAllAsRead, requestPermission,
  } = usePushNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [detail, setDetail] = useState<any | null>(null); // 🖼️ إشعار غنيّ مفتوح
  const ref = useRef<HTMLDivElement>(null);

  // فتح هدفٍ: رابط خارجيّ بتبويب جديد، أو مسار داخليّ عبر الراوتر
  const go = (url?: string | null) => {
    if (!url) return;
    if (isExternalUrl(url)) { window.open(url, '_blank', 'noopener,noreferrer'); }
    else { setOpen(false); router.push(url); }
  };

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
                notifications.slice(0, 30).map(n => {
                  const rich = isRich(n.data);
                  const thumb = n.data?.imageUrl as string | undefined;
                  const isVideo = !!n.data?.videoUrl;
                  return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markAsRead(n.id);
                      if (rich) { setDetail(n); return; }            // إشعار غنيّ → شاشة تفصيل داخل التطبيق
                      go(resolveNotificationUrl(n.type, n.data));     // وإلّا: توجيه (داخليّ/خارجيّ)
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
                      {thumb ? (
                        <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#000' }}>
                          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {isVideo && (
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', fontSize: 16 }}>▶️</span>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          fontSize: 22, width: 32, height: 32, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${TYPE_COLORS[n.type] || '#666'}20`, flexShrink: 0,
                        }}>
                          {TYPE_ICONS[n.type] || '🔔'}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: n.isRead ? 'rgba(255,255,255,0.6)' : '#fff',
                          fontWeight: n.isRead ? 400 : 600, fontSize: 13, marginBottom: 2,
                        }}>
                          {n.title}
                        </div>
                        <div style={{
                          color: 'rgba(255,255,255,0.4)', fontSize: 12,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
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
                        {(rich || resolveNotificationUrl(n.type, n.data)) && (
                          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>◀</span>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── شاشة تفصيل الإشعار الغنيّ (صورة/فيديو/رابط) ── */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDetail(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              dir="rtl"
              style={{ width: '100%', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{TYPE_ICONS[detail.type] || '🔔'}</span>{detail.title}
                </span>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>

              {detail.data?.videoUrl ? (
                <video src={detail.data.videoUrl} poster={detail.data.imageUrl || undefined} controls playsInline
                  style={{ width: '100%', maxHeight: '50vh', background: '#000', display: 'block' }} />
              ) : detail.data?.imageUrl ? (
                <img src={detail.data.imageUrl} alt="" style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain', background: '#000', display: 'block' }} />
              ) : null}

              {(detail.data?.richBody || detail.body) && (
                <div style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {detail.data?.richBody || detail.body}
                </div>
              )}

              {detail.data?.url && (
                <div style={{ padding: '0 16px 16px' }}>
                  <button
                    onClick={() => { const u = detail.data.url; setDetail(null); go(u); }}
                    style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                  >
                    {isExternalUrl(detail.data.url) ? '🔗 فتح الرابط' : 'انتقال ◀'}
                  </button>
                </div>
              )}

              <div style={{ padding: '0 16px 14px', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>{formatTimeAgo(detail.createdAt)}</div>
            </motion.div>
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
