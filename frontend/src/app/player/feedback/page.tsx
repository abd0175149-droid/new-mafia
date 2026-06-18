'use client';

// ══════════════════════════════════════════════════════
// 📋 استبيان رضى ما بعد الغرفة (إلزامي) — Player Feedback
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';

const SCALE = [
  { v: 1, label: 'سيّئ جداً', color: '#ef4444' },
  { v: 2, label: 'سيّئ', color: '#f97316' },
  { v: 3, label: 'متوسط', color: '#eab308' },
  { v: 4, label: 'جيد', color: '#84cc16' },
  { v: 5, label: 'ممتاز', color: '#22c55e' },
];

interface Q { key: string; dimension: string; text: string }

function FeedbackInner() {
  const { player } = usePlayer();
  const router = useRouter();
  const sp = useSearchParams();
  const queryMatchId = sp.get('matchId');

  const [pending, setPending] = useState<any[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(queryMatchId ? Number(queryMatchId) : null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [context, setContext] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${player?.token}` }),
    [player],
  );

  const loadPending = useCallback(async (): Promise<any[]> => {
    if (!player) return [];
    try {
      const res = await fetch('/api/player-feedback/pending', { headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setPending(data.pending || []); return data.pending || []; }
    } catch {}
    return [];
  }, [player, authHeaders]);

  const loadSurvey = useCallback(async (matchId: number) => {
    if (!player) return;
    try {
      const res = await fetch(`/api/player-feedback/${matchId}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions || []);
        setContext(data.context || null);
        setAnswers({});
        setNotes('');
        if (data.alreadyDone) {
          // عُبّئ مسبقاً → انتقل للتالي
          const p = await loadPending();
          const next = p.find((x: any) => x.matchId !== matchId);
          if (next) { setActiveMatchId(next.matchId); await loadSurvey(next.matchId); }
          else setDone(true);
        }
      }
    } catch {}
  }, [player, authHeaders, loadPending]);

  useEffect(() => {
    if (!player) return;
    (async () => {
      setLoading(true);
      const p = await loadPending();
      const target = activeMatchId || (p.length ? p[0].matchId : null);
      if (target) { setActiveMatchId(target); await loadSurvey(target); }
      else setDone(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const allAnswered = questions.length > 0 && questions.every(q => (answers[q.key] || 0) >= 1);

  const submit = async () => {
    if (!activeMatchId || !allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/player-feedback/${activeMatchId}`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ answers, notes }),
      });
      const data = await res.json();
      if (data.success) {
        const remaining = (await loadPending()).filter((x: any) => x.matchId !== activeMatchId);
        if (remaining.length) {
          setActiveMatchId(remaining[0].matchId);
          await loadSurvey(remaining[0].matchId);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          setDone(true);
        }
      } else {
        alert(data.error || 'تعذّر الإرسال');
      }
    } catch { alert('تعذّر الإرسال'); }
    finally { setSubmitting(false); }
  };

  const wrap = (children: React.ReactNode) => (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#050505', padding: '20px 16px 40px', color: '#fff' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>{children}</div>
    </div>
  );

  if (loading) return wrap(<div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.5)' }}>⏳ جاري التحميل...</div>);

  if (done) return wrap(
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>شكراً لك!</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 24 }}>
        أكملت كل الاستبيانات المطلوبة. رأيك يساعدنا على التحسين.
      </p>
      <button onClick={() => router.replace('/player/games')} style={{
        padding: '12px 28px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 15,
        background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', cursor: 'pointer',
      }}>تصفّح الفعاليات 🎮</button>
    </div>
  );

  const answeredCount = questions.filter(q => (answers[q.key] || 0) >= 1).length;

  return wrap(
    <>
      {/* رأس السياق */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', margin: 0 }}>📋 قيّم تجربتك</h1>
        {context && (
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>
            {context.activityName ? <>🎯 {context.activityName} · </> : null}
            {context.locationName ? <>📍 {context.locationName} · </> : null}
            {context.playedAt ? <>🗓️ {new Date(context.playedAt).toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' })}</> : null}
            {' '}<span style={{ color: 'rgba(255,255,255,0.3)' }}>(غرفة #{context.roomCode})</span>
          </p>
        )}
        {pending.length > 1 && (
          <p style={{ color: '#8b5cf6', fontSize: 12, marginTop: 4 }}>لديك {pending.length} استبيانات معلّقة — هذا أحدها</p>
        )}
      </div>

      {/* شريط التقدّم */}
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(answeredCount / (questions.length || 1)) * 100}%`, background: '#22c55e', transition: 'width .25s' }} />
      </div>

      {/* الأسئلة */}
      {questions.map((q, i) => (
        <div key={q.key} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14, padding: 14, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 700 }}>{i + 1}.</span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{q.text}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {SCALE.map(s => {
              const sel = answers[q.key] === s.v;
              return (
                <button key={s.v}
                  onClick={() => setAnswers(prev => ({ ...prev, [q.key]: s.v }))}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${sel ? s.color : 'rgba(255,255,255,0.12)'}`,
                    background: sel ? s.color : 'transparent',
                    color: sel ? '#000' : 'rgba(255,255,255,0.7)',
                    fontWeight: 800, fontSize: 16, transition: 'all .15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <span>{s.v}</span>
                  <span style={{ fontSize: 8, fontWeight: 600 }}>{sel ? s.label : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ملاحظات */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>
          أي ملاحظة أو اقتراح؟ (اختياري)
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={1000}
          placeholder="اكتب ملاحظتك هنا..."
          style={{
            width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff',
            fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* إرسال */}
      <button onClick={submit} disabled={!allAnswered || submitting}
        style={{
          width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16,
          background: allAnswered && !submitting ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'rgba(255,255,255,0.1)',
          color: allAnswered && !submitting ? '#000' : 'rgba(255,255,255,0.4)',
          cursor: allAnswered && !submitting ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? '⏳ جاري الإرسال...' : allAnswered ? 'إرسال ✓' : `أجب على كل الأسئلة (${answeredCount}/${questions.length})`}
      </button>
    </>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<div dir="rtl" style={{ minHeight: '100vh', background: '#050505' }} />}>
      <FeedbackInner />
    </Suspense>
  );
}
