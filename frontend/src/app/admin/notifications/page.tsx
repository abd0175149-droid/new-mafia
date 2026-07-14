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
  const [tab, setTab] = useState<'inbox' | 'send' | 'devices'>('inbox');

  // ── حالة الإشعارات الواردة ──
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // ── حالة الإرسال ──
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // 🖼️ إشعار غنيّ: وسائط (صورة/فيديو) + رابط (داخليّ أو خارجيّ)
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [target, setTarget] = useState<'all' | 'booked' | 'specific'>('all');
  const [targetAudience, setTargetAudience] = useState<'players' | 'staff' | 'both'>('players');
  const [activityId, setActivityId] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; sentCount?: number; error?: string } | null>(null);

  // ── حالة اختيار اللاعبين ──
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<any[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [playerGroups, setPlayerGroups] = useState<{ name: string; playerIds: number[]; players: any[] }[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('mafia_player_groups') || '[]'); } catch { return []; }
  });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number | null>(null);

  // ── حالة تبويب الأجهزة ──
  const [devicesData, setDevicesData] = useState<{ totalPlayers: number; totalDevices: number; players: any[] } | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [testingPlayer, setTestingPlayer] = useState<number | null>(null);

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
    fetch('/api/staff', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setStaffList(data); })
      .catch(() => {});

    // polling كل 15 ثانية
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications, token]);

  // ── جلب أجهزة اللاعبين المفعّلين ──
  const fetchDevices = useCallback(async () => {
    if (!token) return;
    setDevicesLoading(true);
    try {
      const res = await fetch('/api/staff-notifications/devices', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setDevicesData(data);
    } catch {} finally { setDevicesLoading(false); }
  }, [token]);

  useEffect(() => { if (tab === 'devices') fetchDevices(); }, [tab, fetchDevices]);

  // ── إرسال إشعار اختبار للاعب محدد ──
  const sendTestToPlayer = async (playerId: number, name: string) => {
    setTestingPlayer(playerId);
    try {
      const res = await fetch('/api/staff-notifications/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: '🔔 إشعار اختبار',
          body: 'هذا إشعار تجريبي للتأكد من وصول الإشعارات لجهازك ✅',
          target: 'specific', targetAudience: 'players', targetIds: [playerId],
          data: { url: '/player/home' },
        }),
      });
      const data = await res.json();
      alert(data.success ? `✅ أُرسل إشعار اختبار إلى ${name}` : `❌ ${data.error || 'فشل الإرسال'}`);
    } catch { alert('❌ فشل الإرسال'); }
    finally { setTestingPlayer(null); }
  };

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

  // ── رفع وسائط الإشعار (صورة/فيديو) ──
  const uploadMedia = async (file: File) => {
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      const res = await fetch('/api/staff-notifications/upload-media', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const d = await res.json();
      if (d.success) {
        if (d.mediaType === 'video') { setVideoUrl(d.url); }
        else { setImageUrl(d.url); }
      } else { alert(d.error || 'فشل رفع الملف'); }
    } catch (e: any) { alert(e.message || 'فشل الرفع'); }
    finally { setUploadingMedia(false); }
  };

  // ── إرسال مخصص ──
  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      // تحديد الـ targetIds حسب الحالة
      let ids: number[] = [];
      if (target === 'specific') {
        if (targetAudience === 'staff' || targetAudience === 'both') {
          ids = selectedStaffIds;
        }
        if (targetAudience === 'players' || targetAudience === 'both') {
          ids = [...ids, ...selectedPlayers.map(p => p.id)];
        }
      }

      const res = await fetch('/api/staff-notifications/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(), body: body.trim(), target, targetAudience,
          activityId: target === 'booked' ? parseInt(activityId) : null,
          targetIds: target === 'specific' ? ids : [],
          data: {
            url: linkUrl.trim() || '/player/home',
            ...(imageUrl ? { imageUrl } : {}),
            ...(videoUrl ? { videoUrl, mediaType: 'video' } : {}),
          },
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) { setTitle(''); setBody(''); setImageUrl(''); setVideoUrl(''); setLinkUrl(''); }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally { setSending(false); }
  };

  // ── بحث اللاعبين ──
  const searchPlayers = async (q: string) => {
    setPlayerSearch(q);
    if (q.length < 1) { setPlayerResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/staff-notifications/players/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPlayerResults(data.players || []);
    } catch {} finally { setSearchLoading(false); }
  };

  const togglePlayer = (p: any) => {
    setSelectedPlayers(prev =>
      prev.find(x => x.id === p.id)
        ? prev.filter(x => x.id !== p.id)
        : [...prev, p]
    );
  };

  // ── إدارة المجموعات ──
  const saveGroup = () => {
    if (!newGroupName.trim() || selectedPlayers.length === 0) return;
    const updated = [...playerGroups, {
      name: newGroupName.trim(),
      playerIds: selectedPlayers.map(p => p.id),
      players: selectedPlayers.map(p => ({ id: p.id, name: p.name, phone: p.phone })),
    }];
    setPlayerGroups(updated);
    localStorage.setItem('mafia_player_groups', JSON.stringify(updated));
    setNewGroupName('');
    setShowGroupModal(false);
  };

  const deleteGroup = (idx: number) => {
    const updated = playerGroups.filter((_, i) => i !== idx);
    setPlayerGroups(updated);
    localStorage.setItem('mafia_player_groups', JSON.stringify(updated));
    if (selectedGroupIdx === idx) setSelectedGroupIdx(null);
  };

  const loadGroup = (idx: number) => {
    setSelectedGroupIdx(idx);
    setSelectedPlayers(playerGroups[idx].players);
    setTarget('specific');
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
        <button
          onClick={() => setTab('devices')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
            border: `1px solid ${tab === 'devices' ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
            background: tab === 'devices' ? 'rgba(34,197,94,0.1)' : 'transparent',
            color: tab === 'devices' ? '#22c55e' : 'rgba(255,255,255,0.5)',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          📲 الأجهزة
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

              {/* 🖼️ وسائط غنيّة: صورة/فيديو + رابط */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>وسائط (اختياريّ)</label>
                {!imageUrl && !videoUrl ? (
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, cursor: uploadingMedia ? 'wait' : 'pointer',
                    padding: '10px 14px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.6)', fontSize: 13,
                  }}>
                    {uploadingMedia ? '⏳ جارٍ الرفع…' : '📎 إرفاق صورة أو فيديو'}
                    <input type="file" accept="image/*,video/*" disabled={uploadingMedia}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.currentTarget.value = ''; }}
                      style={{ display: 'none' }} />
                  </label>
                ) : (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#000' }}>
                    {videoUrl ? (
                      <video src={videoUrl} controls playsInline style={{ width: '100%', maxHeight: 220, display: 'block' }} />
                    ) : (
                      <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} />
                    )}
                    <button type="button" onClick={() => { setImageUrl(''); setVideoUrl(''); }}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                )}
              </div>

              {/* 🔗 رابط عند النقر (داخليّ /player/... أو خارجيّ https://) */}
              <div>
                <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>رابط عند النقر (اختياريّ)</label>
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} dir="ltr"
                  placeholder="https://example.com  أو  /player/games"
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none',
                  }}
                />
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: '4px 0 0' }}>
                  رابط يبدأ بـ http يُفتح خارجيّاً بتبويب جديد؛ وإلّا يُوجَّه داخل التطبيق.
                </p>
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
                    { val: 'specific' as const, label: '🎯 محدد' },
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

              {/* ══════ اختيار محدد: لاعبين + موظفين ══════ */}
              {target === 'specific' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* ── المجموعات المحفوظة ── */}
                  {playerGroups.length > 0 && (targetAudience === 'players' || targetAudience === 'both') && (
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>📁 المجموعات المحفوظة</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {playerGroups.map((g, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => loadGroup(i)}
                              style={{
                                padding: '6px 14px', borderRadius: 20, fontSize: 13,
                                border: `1px solid ${selectedGroupIdx === i ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`,
                                background: selectedGroupIdx === i ? 'rgba(139,92,246,0.15)' : 'transparent',
                                color: selectedGroupIdx === i ? '#8b5cf6' : 'rgba(255,255,255,0.6)',
                                cursor: 'pointer', fontWeight: selectedGroupIdx === i ? 600 : 400,
                              }}
                            >📁 {g.name} ({g.playerIds.length})</button>
                            <button onClick={() => deleteGroup(i)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── بحث اللاعبين ── */}
                  {(targetAudience === 'players' || targetAudience === 'both') && (
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>
                        🔍 بحث لاعب (بالاسم أو الهاتف)
                      </label>
                      <input value={playerSearch} onChange={e => searchPlayers(e.target.value)}
                        placeholder="ابحث..."
                        style={{
                          width: '100%', padding: '10px 14px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', marginBottom: 8,
                        }}
                      />

                      {/* نتائج البحث */}
                      {playerResults.length > 0 && (
                        <div style={{
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12, maxHeight: 180, overflowY: 'auto',
                        }}>
                          {playerResults.map(p => {
                            const isSel = selectedPlayers.find(x => x.id === p.id);
                            return (
                              <div key={p.id} onClick={() => togglePlayer(p)}
                                style={{
                                  padding: '10px 14px', cursor: 'pointer',
                                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                                  background: isSel ? 'rgba(34,197,94,0.08)' : 'transparent',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}
                              >
                                <div>
                                  <span style={{ color: isSel ? '#22c55e' : '#fff', fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginRight: 8 }}>{p.phone}</span>
                                </div>
                                <span style={{ fontSize: 16 }}>{isSel ? '✅' : '➕'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {searchLoading && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: 8 }}>⏳ جاري البحث...</div>}

                      {/* اللاعبون المحددون */}
                      {selectedPlayers.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>✅ المحددون ({selectedPlayers.length})</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => setShowGroupModal(true)}
                                style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                              >💾 حفظ كمجموعة</button>
                              <button onClick={() => { setSelectedPlayers([]); setSelectedGroupIdx(null); }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                              >🗑️ مسح الكل</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {selectedPlayers.map(p => (
                              <span key={p.id} onClick={() => togglePlayer(p)}
                                style={{
                                  padding: '4px 12px', borderRadius: 20, fontSize: 12,
                                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                                  color: '#22c55e', cursor: 'pointer',
                                }}
                              >{p.name} ✕</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── اختيار موظفين ── */}
                  {(targetAudience === 'staff' || targetAudience === 'both') && (
                    <div>
                      <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>
                        اختر الموظفين ({selectedStaffIds.length} محدد)
                      </label>
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 8,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12, padding: 12, maxHeight: 200, overflowY: 'auto',
                      }}>
                        {staffList.map(s => {
                          const isSelected = selectedStaffIds.includes(s.id);
                          const roleLabel = s.role === 'admin' ? '👑' : s.role === 'manager' ? '👔' : s.role === 'leader' ? '🎮' : '📍';
                          return (
                            <button key={s.id}
                              onClick={() => setSelectedStaffIds(prev =>
                                isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id]
                              )}
                              style={{
                                padding: '6px 14px', borderRadius: 20, fontSize: 13,
                                border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                                background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                                color: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.6)',
                                cursor: 'pointer', fontWeight: isSelected ? 600 : 400,
                              }}
                            >
                              {roleLabel} {s.name}
                              {isSelected && ' ✓'}
                            </button>
                          );
                        })}
                        {staffList.length === 0 && (
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>لا يوجد موظفون</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── مودال حفظ مجموعة ── */}
              {showGroupModal && (
                <div style={{
                  background: 'rgba(0,0,0,0.8)', position: 'fixed', inset: 0, zIndex: 999,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }} onClick={() => setShowGroupModal(false)}>
                  <div onClick={e => e.stopPropagation()} style={{
                    background: '#1a1a1a', border: '1px solid rgba(139,92,246,0.3)',
                    borderRadius: 16, padding: 24, width: 340,
                  }}>
                    <h3 style={{ color: '#8b5cf6', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>💾 حفظ كمجموعة</h3>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      placeholder="اسم المجموعة (مثال: VIP)"
                      style={{
                        width: '100%', padding: '10px 14px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', marginBottom: 12,
                      }}
                    />
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 16 }}>
                      سيتم حفظ {selectedPlayers.length} لاعب في هذه المجموعة
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setShowGroupModal(false)}
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                      >إلغاء</button>
                      <button onClick={saveGroup} disabled={!newGroupName.trim()}
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                      >حفظ</button>
                    </div>
                  </div>
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

        {/* ══════════ TAB: الأجهزة ══════════ */}
        {tab === 'devices' && (
          <motion.div key="devices" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* ملخّص */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                <div style={{ color: '#22c55e', fontSize: 26, fontWeight: 800 }}>{devicesData?.totalPlayers ?? '—'}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>لاعب مفعّل الإشعارات</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                <div style={{ color: '#3b82f6', fontSize: 26, fontWeight: 800 }}>{devicesData?.totalDevices ?? '—'}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>جهاز مسجّل</div>
              </div>
              <button onClick={fetchDevices} title="تحديث" style={{
                width: 52, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 20, cursor: 'pointer',
              }}>🔄</button>
            </div>

            {/* بحث */}
            <input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)}
              placeholder="🔍 ابحث باسم اللاعب أو الهاتف"
              style={{
                width: '100%', padding: '10px 14px', marginBottom: 12,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
              }}
            />

            {/* القائمة */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
              {devicesLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>⏳ جاري التحميل...</div>
              ) : !devicesData || devicesData.players.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                  لا يوجد لاعبون فعّلوا الإشعارات بعد
                </div>
              ) : (
                devicesData.players
                  .filter((p: any) => !deviceSearch || (p.name || '').includes(deviceSearch) || (p.phone || '').includes(deviceSearch))
                  .map((p: any) => (
                    <div key={p.playerId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {/* صف اللاعب */}
                      <div
                        onClick={() => setExpandedPlayer(expandedPlayer === p.playerId ? null : p.playerId)}
                        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{p.phone}</div>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#22c55e',
                          background: 'rgba(34,197,94,0.12)', padding: '3px 10px', borderRadius: 20,
                        }}>{p.deviceCount} 📱</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); sendTestToPlayer(p.playerId, p.name); }}
                          disabled={testingPlayer === p.playerId}
                          style={{
                            fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
                            background: testingPlayer === p.playerId ? 'rgba(139,92,246,0.3)' : '#8b5cf6',
                            border: 'none', borderRadius: 8, padding: '6px 12px', whiteSpace: 'nowrap',
                          }}
                        >{testingPlayer === p.playerId ? '⏳' : '🔔 اختبار'}</button>
                        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>{expandedPlayer === p.playerId ? '▲' : '▼'}</span>
                      </div>

                      {/* تفاصيل الأجهزة */}
                      {expandedPlayer === p.playerId && (
                        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {p.devices.map((d: any, i: number) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                              background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                            }}>
                              <span style={{ fontSize: 18 }}>
                                {d.os === 'iPhone' || d.os === 'iPad' ? '📱' : d.os === 'Android' ? '🤖' : '🖥️'}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: '#fff', fontSize: 13 }}>{d.os} · {d.browser}</div>
                                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                                  {d.channel} · {formatTimeAgo(d.registeredAt)}
                                  {!d.hasDeviceId && ' · (قديم)'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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
