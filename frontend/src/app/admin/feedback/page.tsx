'use client';

// ══════════════════════════════════════════════════════
// 📋 لوحة تقييمات اللاعبين — Feedback Analytics (نسخة تفاعلية)
// نظرة عامة على رضى اللاعبين + تفصيل حسب الفعالية + من قام بالتقييم
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

// ── لون التقييم حسب القيمة (مقياس 1–5) ──
function ratingColor(v: number | null | undefined): string {
  if (v == null) return '#6b7280';
  if (v >= 4.5) return '#10b981';
  if (v >= 4) return '#22c55e';
  if (v >= 3) return '#eab308';
  if (v >= 2) return '#f97316';
  return '#ef4444';
}
function ratingLabel(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 4.5) return 'ممتاز';
  if (v >= 4) return 'جيد جداً';
  if (v >= 3) return 'مقبول';
  if (v >= 2) return 'ضعيف';
  return 'سيّئ';
}

// ── رقم متحرّك (count-up) ──
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value || 0, {
      duration: 0.9, ease: 'easeOut', onUpdate: v => setDisplay(v),
    });
    return () => controls.stop();
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

// ── حلقة قياس الرضى (العنصر المميّز) ──
function Ring({ value, max = 5, size = 150, stroke = 12, color }: {
  value: number | null; max?: number; size?: number; stroke?: number; color: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = value != null ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - circ * pct }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black tabular-nums" style={{ color }}>
          {value != null ? <AnimatedNumber value={value} decimals={1} /> : '—'}
        </span>
        <span className="text-[11px] text-gray-500 -mt-0.5">من 5</span>
      </div>
    </div>
  );
}

// ── شريط أفقي لقيمة 1–5 ──
function ScoreBar({ value, delay = 0 }: { value: number | null; delay?: number }) {
  const color = ratingColor(value);
  const pct = value ? (value / 5) * 100 : 0;
  return (
    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut', delay }}
      />
    </div>
  );
}

interface Q { key: string; dimension: string; text: string }

const DIM_ICON: Record<string, string> = {
  overall: '⭐', venue: '🏛️', gameplay: '🎮', clarity: '📜', pacing: '⏱️',
  seating: '🪑', leader: '🎤', fairness: '⚖️', atmosphere: '✨', value: '💎', recommend: '❤️',
};

export default function AdminFeedbackPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activityId, setActivityId] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [tab, setTab] = useState<'overview' | 'people' | 'comments'>('overview');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (activityId) qs.set('activityId', activityId);
      const res = await fetch(`/api/feedback/summary?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d.success) setData(d);
    } catch {} finally { setLoading(false); }
  }, [token, from, to, activityId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/feedback/activities', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setActivities(d.activities || []); })
      .catch(() => {});
  }, [token]);

  const selectedActivityName = useMemo(
    () => activities.find((a: any) => String(a.activityId) === activityId)?.name || '',
    [activities, activityId],
  );

  const dimLabel = useMemo(() => {
    const m: Record<string, { dim: string; text: string }> = {};
    (data?.questions || []).forEach((q: Q) => { m[q.key] = { dim: q.dimension, text: q.text }; });
    return m;
  }, [data]);

  // الأبعاد مرتّبة من الأفضل للأضعف
  const dimsSorted = useMemo(() => {
    return [...(data?.avgByDimension || [])]
      .filter((d: any) => d.avg != null)
      .sort((a: any, b: any) => (b.avg || 0) - (a.avg || 0));
  }, [data]);
  const weakestKey = dimsSorted.length ? dimsSorted[dimsSorted.length - 1].key : null;

  // مُقيّمون مُزال منهم التكرار حسب الشخص (أحدث تقييم لكل لاعب)
  const respondentsByPerson = useMemo(() => {
    const seen = new Set<number>();
    const out: any[] = [];
    for (const r of (data?.respondents || [])) {
      if (r.playerId != null) { if (seen.has(r.playerId)) continue; seen.add(r.playerId); }
      out.push(r);
    }
    return out;
  }, [data]);

  const filteredRespondents = useMemo(() => {
    const q = search.trim();
    if (!q) return respondentsByPerson;
    return respondentsByPerson.filter((r: any) => (r.playerName || '').includes(q));
  }, [respondentsByPerson, search]);

  const recommendPct = data?.totals?.avgRecommend != null
    ? Math.round((data.totals.avgRecommend / 5) * 100) : null;

  const hasData = data && data.totals?.count > 0;

  // ════════════════════ Header + Toolbar (دائماً ظاهر) ════════════════════
  const toolbar = (
    <div className="sticky top-0 z-30 -mx-3 md:-mx-6 px-3 md:px-6 py-3 mb-5 bg-gray-950/85 backdrop-blur-xl border-b border-gray-800/60">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span className="text-amber-400">📋</span> تقييمات اللاعبين
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {activityId
              ? <>عرض فعالية: <span className="text-amber-400 font-bold">{selectedActivityName || `#${activityId}`}</span></>
              : 'رضى اللاعبين بعد كل غرفة — العرض العام لكل الفعاليات'}
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500">الفعالية</span>
            <select
              value={activityId} onChange={e => setActivityId(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white cursor-pointer hover:border-amber-500/40 focus:border-amber-500 outline-none min-w-[200px] transition-colors"
            >
              <option value="">🗂️ كل الفعاليات</option>
              {activities.map((a: any) => (
                <option key={a.activityId} value={a.activityId}>{(a.name || `نشاط #${a.activityId}`)} ({a.count})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500">من</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-colors" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-500">إلى</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-colors" />
          </label>
          {(from || to || activityId) && (
            <button onClick={() => { setFrom(''); setTo(''); setActivityId(''); }}
              className="px-3 py-2 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors">
              ✕ مسح
            </button>
          )}
        </div>
      </div>

      {/* التبويبات */}
      <div className="flex gap-1 mt-4">
        {([
          ['overview', '📊 نظرة عامة'],
          ['people', `👥 المُقيّمون${hasData ? ` · ${respondentsByPerson.length}` : ''}`],
          ['comments', `💬 الملاحظات${data?.comments?.length ? ` · ${data.comments.length}` : ''}`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`relative px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
              tab === key ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {label}
            {tab === key && (
              <motion.div layoutId="tab-underline" className="absolute inset-0 bg-amber-500/10 border border-amber-500/30 rounded-lg -z-10" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div dir="rtl">
        {toolbar}
        <div className="flex items-center justify-center h-80">
          <div className="animate-spin h-9 w-9 border-4 border-amber-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div dir="rtl">
        {toolbar}
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-3 opacity-80">📭</div>
          <p className="text-gray-300 font-bold text-lg">لا توجد تقييمات في هذا النطاق بعد</p>
          <p className="text-gray-600 text-sm mt-1">
            {activityId ? 'لم يُكمل أحد الاستبيان لهذه الفعالية حتى الآن.' : 'ستظهر التقييمات هنا بمجرد أن يُكملها اللاعبون.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      {toolbar}

      <AnimatePresence mode="wait">
        {/* ════════════════ نظرة عامة ════════════════ */}
        {tab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            {/* Hero: نبض الرضا */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/15 bg-gradient-to-bl from-amber-500/[0.07] via-gray-900/40 to-gray-900/20 p-6">
              <div className="absolute -top-16 -left-16 w-56 h-56 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />
              <div className="relative flex flex-wrap items-center gap-x-10 gap-y-6">
                <div className="flex flex-col items-center">
                  <Ring value={data.totals.avgOverall} color={ratingColor(data.totals.avgOverall)} />
                  <span className="mt-2 text-sm font-bold text-white">متوسط الرضا العام</span>
                  <span className="text-xs px-2 py-0.5 rounded-full mt-1" style={{ color: ratingColor(data.totals.avgOverall), background: `${ratingColor(data.totals.avgOverall)}1a` }}>
                    {ratingLabel(data.totals.avgOverall)}
                  </span>
                </div>

                {/* مؤشر التوصية */}
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-black" style={{ color: ratingColor(data.totals.avgRecommend) }}>
                      {recommendPct != null ? <><AnimatedNumber value={recommendPct} />%</> : '—'}
                    </span>
                    <span className="text-sm text-gray-400">نية العودة والتوصية ❤️</span>
                  </div>
                  <ScoreBar value={data.totals.avgRecommend} />
                  <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                    مؤشّر ولاء اللاعبين — كم يميلون للعودة وترشيح النادي لأصدقائهم.
                  </p>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                      { label: 'تقييمات', value: data.totals.count, icon: '📝', color: '#3b82f6' },
                      { label: 'لاعبون قيّموا', value: data.totals.distinctPlayers, icon: '👤', color: '#8b5cf6' },
                      { label: 'غرف', value: data.totals.distinctRooms, icon: '🚪', color: '#06b6d4' },
                    ].map((k, i) => (
                      <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-xl px-3 py-2.5">
                        <div className="text-xl font-black text-white tabular-nums">{k.icon} <AnimatedNumber value={k.value} /></div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* الأبعاد مرتّبة (الأفضل → الأضعف) */}
            <Section title="التقييم حسب البُعد" hint="مرتّبة من الأعلى للأدنى — البُعد الأحمر هو الأضعف ويحتاج انتباهاً">
              <div className="space-y-3">
                {dimsSorted.map((d: any, i: number) => {
                  const meta = dimLabel[d.key];
                  const isWeak = d.key === weakestKey && d.avg < 4;
                  return (
                    <div key={d.key} className="group" title={meta?.text}>
                      <div className="flex items-center justify-between mb-1.5 text-sm">
                        <span className="flex items-center gap-2 text-gray-300">
                          <span className="w-5 text-center">{DIM_ICON[d.key] || '•'}</span>
                          <span className="font-medium">{meta?.dim || d.key}</span>
                          {isWeak && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">الأضعف</span>}
                        </span>
                        <span className="font-black tabular-nums" style={{ color: ratingColor(d.avg) }}>{Number(d.avg).toFixed(2)}</span>
                      </div>
                      <ScoreBar value={d.avg} delay={i * 0.04} />
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* توزيع + اتجاه */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="توزيع التقييم العام">
                <div className="space-y-2.5">
                  {[...data.distribution].reverse().map((d: any, i: number) => {
                    const total = data.totals.count || 1;
                    const pct = Math.round((d.count / total) * 100);
                    const color = d.score >= 4 ? '#22c55e' : d.score === 3 ? '#eab308' : '#ef4444';
                    return (
                      <div key={d.score} className="flex items-center gap-3">
                        <span className="w-12 text-xs text-gray-400 shrink-0 flex items-center gap-1">
                          {d.score} <span style={{ color }}>★</span>
                        </span>
                        <div className="flex-1 h-6 rounded-lg bg-white/5 overflow-hidden relative">
                          <motion.div className="h-full rounded-lg flex items-center justify-end pl-2"
                            style={{ background: `${color}33`, borderRight: `3px solid ${color}` }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: i * 0.06 }}>
                          </motion.div>
                          <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold text-gray-300">{d.count} ({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="تطوّر الرضا أسبوعياً">
                {data.trend?.length > 1 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={data.trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} tickFormatter={(v: string) => v?.slice(5)} />
                      <YAxis domain={[0, 5]} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} width={28} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }} />
                      <Line type="monotone" dataKey="avgOverall" stroke="#f59e0b" strokeWidth={2.5} name="عام" dot={{ r: 3, fill: '#f59e0b' }} />
                      <Line type="monotone" dataKey="avgRecommend" stroke="#22c55e" strokeWidth={2} name="التوصية" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[210px] flex items-center justify-center text-gray-600 text-sm">
                    يحتاج أكثر من أسبوع لعرض الاتجاه
                  </div>
                )}
              </Section>
            </div>

            {/* حسب المكان / الليدر / النشاط */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Section title="حسب المكان">
                {(data.byVenue || []).map((v: any, i: number) => (
                  <RankRow key={i} name={v.name || 'غير محدد'} count={v.count} value={v.avgOverall} delay={i * 0.05} />
                ))}
              </Section>
              <Section title="احترافية الليدر" hint="الاحترافية · والحياد">
                {(data.byLeader || []).map((l: any, i: number) => (
                  <RankRow key={i} name={l.name || 'غير محدد'} count={l.count} value={l.avgLeader} sub={`حياد ${l.avgFairness ?? '—'}`} delay={i * 0.05} />
                ))}
              </Section>
              <Section title="حسب النشاط">
                {(data.byActivity || []).map((a: any, i: number) => (
                  <RankRow key={i} name={a.name || 'غير محدد'} count={a.count} value={a.avgOverall}
                    onClick={a.activityId ? () => { setActivityId(String(a.activityId)); window.scrollTo({ top: 0, behavior: 'smooth' }); } : undefined}
                    delay={i * 0.05} />
                ))}
              </Section>
            </div>
          </motion.div>
        )}

        {/* ════════════════ المُقيّمون ════════════════ */}
        {tab === 'people' && (
          <motion.div key="people" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 ابحث عن اسم..."
                className="flex-1 min-w-[200px] bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-colors"
              />
              <span className="text-sm text-gray-500">{filteredRespondents.length} شخص</span>
            </div>

            {filteredRespondents.length === 0 ? (
              <div className="text-center py-16 text-gray-600">لا نتائج مطابقة</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredRespondents.map((r: any, i: number) => {
                  const isOpen = expanded === r.playerId;
                  return (
                    <motion.div key={r.playerId ?? i}
                      layout
                      className={`rounded-xl border bg-gray-900/50 overflow-hidden transition-colors ${isOpen ? 'border-amber-500/40' : 'border-gray-800 hover:border-gray-700'}`}>
                      <button onClick={() => setExpanded(isOpen ? null : (r.playerId ?? -1))}
                        className="w-full flex items-center gap-3 p-3 text-right">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                          style={{ background: `${ratingColor(r.overall)}22`, color: ratingColor(r.overall) }}>
                          {(r.playerName || '؟').trim().charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                            {r.playerName || 'لاعب'}
                            {r.notes && <span title="ترك ملاحظة">📝</span>}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {!activityId && r.activityName ? `${r.activityName} · ` : ''}
                            {r.playedAt ? new Date(r.playedAt).toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' }) : ''}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="font-black tabular-nums" style={{ color: ratingColor(r.overall) }}>{r.overall ?? '—'}<span className="text-[10px] text-gray-600">/5</span></div>
                        </div>
                        <span className={`text-gray-600 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-gray-800">
                            <div className="p-3 grid grid-cols-1 gap-1.5">
                              {(data.questions || []).map((q: Q) => {
                                const v = r[q.key];
                                return (
                                  <div key={q.key} className="flex items-center gap-2">
                                    <span className="w-4 text-center text-xs">{DIM_ICON[q.key] || '•'}</span>
                                    <span className="text-[11px] text-gray-400 w-24 shrink-0 truncate">{q.dimension}</span>
                                    <div className="flex-1"><ScoreBar value={v} /></div>
                                    <span className="text-[11px] font-bold tabular-nums w-5 text-left" style={{ color: ratingColor(v) }}>{v ?? '—'}</span>
                                  </div>
                                );
                              })}
                              {r.notes && (
                                <div className="mt-2 p-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 text-[12px] text-gray-200 leading-relaxed">
                                  <span className="text-amber-400">📝 </span>{r.notes}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ════════════════ الملاحظات ════════════════ */}
        {tab === 'comments' && (
          <motion.div key="comments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {(data.comments || []).length === 0 ? (
              <div className="text-center py-16 text-gray-600">لا توجد ملاحظات نصّية في هذا النطاق</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.comments.map((c: any, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-amber-400 text-sm">{c.playerName || 'لاعب'}</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ color: ratingColor(c.overall), background: `${ratingColor(c.overall)}1a` }}>
                        {c.overall ?? '—'}/5
                      </span>
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed mb-2">“{c.notes}”</p>
                    <div className="text-[10px] text-gray-600 flex flex-wrap gap-x-2">
                      {c.activityName && <span>🎯 {c.activityName}</span>}
                      {c.locationName && <span>📍 {c.locationName}</span>}
                      {c.leaderName && <span>🎤 {c.leaderName}</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── بطاقة قسم ──
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="mb-4">
        <h3 className="text-base font-bold text-white">{title}</h3>
        {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// ── صف ترتيب (مكان/ليدر/نشاط) ──
function RankRow({ name, count, value, sub, onClick, delay = 0 }: {
  name: string; count: number; value: number | null; sub?: string; onClick?: () => void; delay?: number;
}) {
  const color = ratingColor(value);
  return (
    <div className={`mb-3 last:mb-0 ${onClick ? 'cursor-pointer group' : ''}`} onClick={onClick}>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-gray-300 truncate flex items-center gap-1.5 min-w-0">
          <span className="truncate group-hover:text-amber-400 transition-colors">{name}</span>
          <span className="text-[10px] text-gray-600 shrink-0">({count})</span>
        </span>
        <span className="font-black tabular-nums shrink-0" style={{ color }}>
          {value ?? '—'}{sub && <span className="text-[10px] text-gray-500 font-normal"> · {sub}</span>}
        </span>
      </div>
      <ScoreBar value={value} delay={delay} />
    </div>
  );
}
