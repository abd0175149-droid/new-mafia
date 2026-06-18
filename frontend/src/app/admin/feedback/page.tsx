'use client';

// ══════════════════════════════════════════════════════
// 📋 لوحة تحليلات تقييمات اللاعبين — Feedback Analytics
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, Cell,
} from 'recharts';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14, padding: 16,
};

function ratingColor(v: number | null): string {
  if (v == null) return '#6b7280';
  if (v >= 4) return '#22c55e';
  if (v >= 3) return '#eab308';
  return '#ef4444';
}

export default function AdminFeedbackPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res = await fetch(`/api/feedback/summary?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d.success) setData(d);
    } catch {} finally { setLoading(false); }
  }, [token, from, to]);

  useEffect(() => { load(); }, [load]);

  // خريطة المفتاح → التسمية العربية القصيرة
  const dimLabel = useMemo(() => {
    const m: Record<string, string> = {};
    (data?.questions || []).forEach((q: any) => { m[q.key] = q.dimension; });
    return m;
  }, [data]);

  const radarData = useMemo(
    () => (data?.avgByDimension || []).map((d: any) => ({ dim: dimLabel[d.key] || d.key, avg: d.avg || 0 })),
    [data, dimLabel],
  );

  return (
    <div dir="rtl" style={{ maxWidth: 1000, margin: '0 auto', color: '#fff' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>📋 تقييمات اللاعبين</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>تحليل رضى اللاعبين بعد كل غرفة (مقياس 1–5)</p>
      </div>

      {/* فلاتر التاريخ */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>من</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '8px 12px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>إلى</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '8px 12px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff' }} />
        </div>
        <button onClick={load} style={{ padding: '9px 18px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>تطبيق</button>
        {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} style={{ padding: '9px 14px', background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer' }}>مسح</button>}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>⏳ جاري التحميل...</div>
      ) : !data || data.totals.count === 0 ? (
        <div style={{ ...card, padding: 50, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📭</div>
          لا توجد تقييمات في هذه الفترة بعد
        </div>
      ) : (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'متوسط الرضى العام', value: data.totals.avgOverall ?? '—', color: ratingColor(data.totals.avgOverall), suffix: '/5' },
              { label: 'مؤشر الولاء (التوصية)', value: data.totals.avgRecommend ?? '—', color: ratingColor(data.totals.avgRecommend), suffix: '/5' },
              { label: 'عدد التقييمات', value: data.totals.count, color: '#3b82f6', suffix: '' },
              { label: 'لاعبون قيّموا', value: data.totals.distinctPlayers, color: '#8b5cf6', suffix: '' },
            ].map((k, i) => (
              <div key={i} style={card}>
                <div style={{ fontSize: 30, fontWeight: 800, color: k.color }}>{k.value}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{k.suffix}</span></div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* الرادار + التوزيع */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>متوسط كل بُعد</h3>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.12)" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 5]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                  <Radar dataKey="avg" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.35} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>توزيع التقييم العام (1–5)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="score" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {data.distribution.map((d: any, i: number) => (
                      <Cell key={i} fill={d.score >= 4 ? '#22c55e' : d.score === 3 ? '#eab308' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* الاتجاه الزمني */}
          {data.trend?.length > 1 && (
            <div style={{ ...card, marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>تطوّر الرضى أسبوعياً</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                  <YAxis domain={[0, 5]} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="avgOverall" stroke="#f59e0b" strokeWidth={2} name="عام" dot={false} />
                  <Line type="monotone" dataKey="avgRecommend" stroke="#22c55e" strokeWidth={2} name="التوصية" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* حسب المكان + الليدر */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, marginBottom: 14 }}>
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>الرضى حسب المكان</h3>
              {(data.byVenue || []).map((v: any, i: number) => (
                <Row key={i} name={v.name || 'غير محدد'} count={v.count} value={v.avgOverall} />
              ))}
            </div>
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>تقييم الليدر (احترافية / حياد)</h3>
              {(data.byLeader || []).map((l: any, i: number) => (
                <Row key={i} name={l.name || 'غير محدد'} count={l.count} value={l.avgLeader} sub={`حياد: ${l.avgFairness ?? '—'}`} />
              ))}
            </div>
          </div>

          {/* حسب النشاط */}
          <div style={{ ...card, marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>الرضى حسب النشاط</h3>
            {(data.byActivity || []).map((a: any, i: number) => (
              <Row key={i} name={a.name || 'غير محدد'} count={a.count} value={a.avgOverall} />
            ))}
          </div>

          {/* الملاحظات */}
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>الملاحظات ({data.comments?.length || 0})</h3>
            {(data.comments || []).length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 12 }}>لا توجد ملاحظات نصّية</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.comments.map((c: any, i: number) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{c.playerName || 'لاعب'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ratingColor(c.overall) }}>عام: {c.overall ?? '—'}/5</span>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 4 }}>{c.notes}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                      {c.activityName ? `${c.activityName} · ` : ''}{c.locationName ? `📍 ${c.locationName} · ` : ''}{c.leaderName ? `🎮 ${c.leaderName}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ name, count, value, sub }: { name: string; count: number; value: number | null; sub?: string }) {
  const pct = value ? (value / 5) * 100 : 0;
  const color = ratingColor(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: '#fff' }}>{name} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>({count})</span></span>
        <span style={{ color, fontWeight: 700 }}>{value ?? '—'}{sub ? ` · ${sub}` : ''}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );
}
