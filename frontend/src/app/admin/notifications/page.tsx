'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'booked' | 'specific'>('all');
  const [targetAudience, setTargetAudience] = useState<'players' | 'staff' | 'both'>('players');
  const [activityId, setActivityId] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; sentCount?: number; error?: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/activities', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setActivities(data); })
      .catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/staff-notifications/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          target,
          targetAudience,
          activityId: target === 'booked' ? parseInt(activityId) : null,
          data: { url: '/player/home' },
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) { setTitle(''); setBody(''); }
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div dir="rtl" style={{ maxWidth: 640, margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>📢 إرسال إشعار</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>أرسل إشعار Push مخصص للاعبين أو الموظفين</p>
        </div>

        {/* Form */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* العنوان */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>العنوان</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="مثال: 🎉 عرض خاص الليلة!"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                color: '#fff',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {/* النص */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>النص</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="اكتب نص الإشعار..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* الجمهور المستهدف */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>إرسال إلى</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: 'players' as const, label: '🎮 اللاعبين', color: '#22c55e' },
                { val: 'staff' as const, label: '👔 الموظفين', color: '#3b82f6' },
                { val: 'both' as const, label: '🔔 الجميع', color: '#f59e0b' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setTargetAudience(opt.val)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    border: `1px solid ${targetAudience === opt.val ? opt.color : 'rgba(255,255,255,0.1)'}`,
                    background: targetAudience === opt.val ? `${opt.color}15` : 'transparent',
                    color: targetAudience === opt.val ? opt.color : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: targetAudience === opt.val ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* الفئة المستهدفة */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 8 }}>الفئة</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: 'all' as const, label: 'الكل' },
                { val: 'booked' as const, label: 'حاجزو نشاط' },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setTarget(opt.val)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    border: `1px solid ${target === opt.val ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                    background: target === opt.val ? 'rgba(245,158,11,0.1)' : 'transparent',
                    color: target === opt.val ? '#f59e0b' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: target === opt.val ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* اختيار نشاط */}
          {target === 'booked' && (
            <div>
              <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>النشاط</label>
              <select
                value={activityId}
                onChange={e => setActivityId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                }}
              >
                <option value="">اختر النشاط</option>
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* معاينة */}
          {title && (
            <div style={{
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8, fontWeight: 600 }}>🔔 معاينة</div>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 10,
                padding: 12,
              }}>
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
              padding: 12,
              borderRadius: 10,
              background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${result.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: result.success ? '#22c55e' : '#ef4444',
              fontSize: 13,
            }}>
              {result.success ? `✅ تم الإرسال بنجاح — ${result.sentCount || 0} مستلم` : `❌ ${result.error}`}
            </div>
          )}

          {/* زر الإرسال */}
          <button
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            style={{
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              background: sending ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              cursor: sending ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {sending ? '⏳ جاري الإرسال...' : '🚀 إرسال الآن'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
