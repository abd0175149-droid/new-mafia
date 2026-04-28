'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── أنواع الإشعارات وأيقوناتها ──
const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  new_booking: { icon: '🎟️', color: '#22c55e', label: 'حجز جديد' },
  financial: { icon: '💳', color: '#3b82f6', label: 'دفعة' },
  cost_alert: { icon: '💰', color: '#ef4444', label: 'مصروف' },
  foundational_cost: { icon: '🏗️', color: '#f59e0b', label: 'تكلفة تأسيسية' },
  new_activity: { icon: '📅', color: '#8b5cf6', label: 'نشاط جديد' },
  new_location: { icon: '📍', color: '#06b6d4', label: 'مكان جديد' },
  game_started: { icon: '🎮', color: '#22c55e', label: 'لعبة بدأت' },
  game_ended: { icon: '🏆', color: '#f59e0b', label: 'لعبة انتهت' },
};

interface AdminNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  targetId: string | null;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<'inbox' | 'send'>('inbox');

  // ── حالة الإشعارات الواردة ──
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // ── حالة الإرسال ──
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'booked' | 'specific'>('all');
  const [targetAudience, setTargetAudience] = useState<'players' | 'staff' | 'both'>('players');
  const [activityId, setActivityId] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; sentCount?: number; error?: string } | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // ── جلب الإشعارات الواردة ──
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setNotifications(data);
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
    fetch('/api/activities', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setActivities(data); })
      .catch(() => {});

    // polling كل 15 ثانية
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications, token]);

  // ── تعليم كمقروء ──
  const markAsRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // ── إرسال مخصص ──
  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/staff-notifications/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(), body: body.trim(), target, targetAudience,
          activityId: target === 'booked' ? parseInt(activityId) : null,
          data: { url: '/player/home' },
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) { setTitle(''); setBody(''); }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally { setSending(false); }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div dir="rtl" style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>🔔 الإشعارات</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>
          إشعارات النظام وإرسال إشعارات مخصصة
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setTab('inbox')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: `1px solid ${tab === 'inbox' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
            background: tab === 'inbox' ? 'rgba(245,158,11,0.1)' : 'transparent',
            color: tab === 'inbox' ? '#f59e0b' : 'rgba(255,255,255,0.5)',
            cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
          }}
        >
          📥 الوارد
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -6, left: -6,
              background: '#ef4444', color: '#fff', borderRadius: '50%',
              minWidth: 20, height: 20, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            }}>{unreadCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('send')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: `1px solid ${tab === 'send' ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
            background: tab === 'send' ? 'rgba(139,92,246,0.1)' : 'transparent',
            color: tab === 'send' ? '#8b5cf6' : 'rgba(255,255,255,0.5)',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          📢 إرسال إشعار
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* ══════════ TAB: الوارد ══════════ */}
        {tab === 'inbox' && (
          <motion.div key="inbox" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            {/* أزرار التحكم */}
            {unreadCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button onClick={markAllAsRead} style={{
                  background: 'none', border: 'none', color: '#f59e0b', fontSize: 13,
                  cursor: 'pointer', fontWeight: 600,
                }}>
                  قراءة الكل ✓
                </button>
              </div>
            )}

            {/* قائمة الإشعارات */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              overflow: 'hidden',
            }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                  ⏳ جاري التحميل...
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🔕</div>
                  لا توجد إشعارات
                </div>
              ) : (
                notifications.map((n, i) => {
                  const config = TYPE_CONFIG[n.type] || { icon: '🔔', color: '#999', label: n.type };
                  return (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => { if (!n.read) markAsRead(n.id); }}
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: n.read ? 'default' : 'pointer',
                        background: n.read ? 'transparent' : 'rgba(245,158,11,0.03)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        {/* أيقونة */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `${config.color}15`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20, flexShrink: 0,
                        }}>
                          {config.icon}
                        </div>

                        {/* المحتوى */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, color: config.color,
                              background: `${config.color}15`, padding: '2px 8px', borderRadius: 6,
                            }}>
                              {config.label}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                              {formatTimeAgo(n.createdAt)}
                            </span>
                          </div>
                          <div style={{
                            color: n.read ? 'rgba(255,255,255,0.5)' : '#fff',
                            fontWeight: n.read ? 400 : 600,
                            fontSize: 14, marginBottom: 2,
                          }}>
                            {n.title}
                          </div>
                          <div style={{
                            color: 'rgba(255,255,255,0.4)', fontSize: 13,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {n.message}
                          </div>
                        </div>

                        {/* نقطة غير مقروء */}
                        {!n.read && (
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#f59e0b', flexShrink: 0, marginTop: 8,
                          }} />
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {/* ══════════ TAB: إرسال ══════════ */}
        {tab === 'send' && (
          <motion.div key="send" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: 24,
              display: 'flex', flexDirection: 'column', gap: 20,
            }}>
              {/* العنوان */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>العنوان</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="مثال: 🎉 عرض خاص الليلة!"
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                  }}
                />
              </div>

              {/* النص */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>النص</label>
                <textarea value={body} onChange={e => setBody(e.target.value)}
                  placeholder="اكتب نص الإشعار..." rows={3}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical',
                  }}
                />
              </div>

              {/* الجمهور */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>إرسال إلى</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { val: 'players' as const, label: '🎮 اللاعبين', color: '#22c55e' },
                    { val: 'staff' as const, label: '👔 الموظفين', color: '#3b82f6' },
                    { val: 'both' as const, label: '🔔 الجميع', color: '#f59e0b' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setTargetAudience(opt.val)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        border: `1px solid ${targetAudience === opt.val ? opt.color : 'rgba(255,255,255,0.1)'}`,
                        background: targetAudience === opt.val ? `${opt.color}15` : 'transparent',
                        color: targetAudience === opt.val ? opt.color : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer', fontSize: 13, fontWeight: targetAudience === opt.val ? 600 : 400,
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* الفئة */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>الفئة</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { val: 'all' as const, label: 'الكل' },
                    { val: 'booked' as const, label: 'حاجزو نشاط' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setTarget(opt.val)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10,
                        border: `1px solid ${target === opt.val ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                        background: target === opt.val ? 'rgba(245,158,11,0.1)' : 'transparent',
                        color: target === opt.val ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer', fontSize: 13, fontWeight: target === opt.val ? 600 : 400,
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* اختيار نشاط */}
              {target === 'booked' && (
                <div>
                  <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>النشاط</label>
                  <select value={activityId} onChange={e => setActivityId(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                    }}
                  >
                    <option value="" style={{ background: '#1a1a1a', color: '#999' }}>اختر النشاط</option>
                    {activities.map(a => <option key={a.id} value={a.id} style={{ background: '#1a1a1a', color: '#fff' }}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* معاينة */}
              {title && (
                <div style={{
                  background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)',
                  borderRadius: 12, padding: 16,
                }}>
                  <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8, fontWeight: 600 }}>🔔 معاينة</div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span>🎭</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>نادي المافيا</span>
                    </div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 }}>{body}</div>
                  </div>
                </div>
              )}

              {/* النتيجة */}
              {result && (
                <div style={{
                  padding: 12, borderRadius: 10,
                  background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${result.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: result.success ? '#22c55e' : '#ef4444', fontSize: 13,
                }}>
                  {result.success ? `✅ تم الإرسال بنجاح — ${result.sentCount || 0} مستلم` : `❌ ${result.error}`}
                </div>
              )}

              {/* زر الإرسال */}
              <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()}
                style={{
                  padding: '14px 0', borderRadius: 12, border: 'none',
                  background: sending ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#fff', fontWeight: 700, fontSize: 15,
                  cursor: sending ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? '⏳ جاري الإرسال...' : '🚀 إرسال الآن'}
              </button>
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
