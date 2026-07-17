'use client';

// ══════════════════════════════════════════════════════
// 📊 تحليلات سلوك اللاعبين — صفحة حيّة داخل لوحة التحكّم
// بيانات من كاش الخادم (تحديث ليليّ + زرّ يدويّ)؛ التصنيف يُطبَّق هنا عبر قواعد قابلة للتخصيص.
// ══════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${res.status}`);
  return data;
}

// ── محرّك القواعد (جهة العميل) ──
const OPS: Record<string, (a: number, b: number) => boolean> = {
  '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b, '!=': (a, b) => a !== b,
};
const OP_LABELS: Record<string, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '==': '=', '!=': '≠' };
function matchesSeg(p: any, seg: any): boolean {
  const conds = seg.conditions || [];
  if (!conds.length) return false; // قاعدة بلا شروط لا تطابق (يلتقطها التصنيف الاحتياطيّ)
  const results = conds.map((c: any) => { const fn = OPS[c.op]; return fn ? fn(Number(p[c.metric]), Number(c.value)) : false; });
  return seg.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}
function segmentOf(p: any, config: any): any {
  for (const seg of (config?.segments || [])) if (matchesSeg(p, seg)) return seg;
  return config?.fallback || { id: 'other', name: 'غير مصنّف', color: '#6b6660' };
}

const SEASON: Record<number, { label: string; raw: string }> = { 1: { label: 'موسم ١', raw: '#c5a059' }, 2: { label: 'موسم ٢', raw: '#38bdf8' }, 3: { label: 'أونلاين', raw: '#a78bfa' } };
const seasonMeta = (s: number) => SEASON[s] || { label: 'موسم ' + s, raw: '#6b6660' };
const monthShort = (mk: string) => ['', 'ينا', 'فبر', 'مار', 'أبر', 'مايو', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'][+mk.split('-')[1]];
const hexa = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const initials = (n: string) => (n || '?').trim()[0] || '?';
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// ── 💬 واتساب: تطبيع الرقم (الأردن +962) + قالب رسالة بمتغيّرات اللاعب ──
const WA_COUNTRY = '962';
function normalizePhoneIntl(raw: string): string | null {
  let p = String(raw || '').replace(/\D/g, '');
  if (!p || p.length < 6) return null;
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith(WA_COUNTRY)) return p;
  if (p.startsWith('0')) return WA_COUNTRY + p.slice(1);
  return WA_COUNTRY + p;
}
const fmtDay = (s: string | null) => s ? new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
// المتغيّرات المتاحة في القالب — تُستبدل بقيم اللاعب عند الإرسال
const WA_VARS: { token: string; label: string; get: (p: any) => string }[] = [
  { token: '{الاسم}', label: 'الاسم', get: p => (p.name || '').trim() },
  { token: '{الأيام}', label: 'أيّام منذ آخر لعبة', get: p => String(p.daysSince ?? '') },
  { token: '{المباريات}', label: 'مباريات فاتته', get: p => String(p.matchesSince ?? '') },
  { token: '{الفعاليات}', label: 'عدد فعاليّاته', get: p => String(p.activitiesAll ?? '') },
  { token: '{آخر_ظهور}', label: 'تاريخ آخر ظهور', get: p => fmtDay(p.lastSeen) },
  { token: '{الشريحة}', label: 'الشريحة', get: p => p._seg?.name || '' },
  { token: '{المستوى}', label: 'المستوى', get: p => String(p.level ?? '') },
];
const WA_DEFAULT_TEMPLATE = 'مرحباً {الاسم} 👋\nاشتقنالك في نادي المافيا 🎭 آخر مرّة لعبت معنا كانت قبل {الأيام} يوم.\nفي فعاليّات جديدة قريباً — احجز مكانك وتعال نلعب! 🎟️';
function fillTemplate(tpl: string, p: any): string {
  let out = tpl || '';
  for (const v of WA_VARS) out = out.split(v.token).join(v.get(p));
  return out;
}
function openWhatsApp(p: any, tpl: string, onErr: (m: string) => void) {
  const intl = normalizePhoneIntl(p.phone);
  if (!intl) { onErr('رقم هاتف اللاعب غير صالح — لا يمكن فتح واتساب'); return; }
  window.open(`https://wa.me/${intl}?text=${encodeURIComponent(fillTemplate(tpl, p))}`, '_blank');
}

export default function AnalyticsPlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [metricDefs, setMetricDefs] = useState<any[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'dash' | 'rules'>('dash');
  const [showTest, setShowTest] = useState(false);
  const [segFilter, setSegFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('gamesAll');
  const [sortDir, setSortDir] = useState(-1);
  const [detail, setDetail] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  // 💬 قالب رسالة الواتساب (محفوظ محليّاً) + لوحة تحريره
  const [waTemplate, setWaTemplate] = useState(WA_DEFAULT_TEMPLATE);
  const [showTemplate, setShowTemplate] = useState(false);
  // 🎯 شريحة «لم يلعب آخر N مباراة» — فلتر عرض قابل للضبط
  const [unplayed, setUnplayed] = useState(false);
  const [unplayedN, setUnplayedN] = useState(10);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { const t = localStorage.getItem('analytics_wa_template'); if (t) setWaTemplate(t); } catch { /* ignore */ }
  }, []);
  const saveTemplate = (t: string) => { setWaTemplate(t); try { localStorage.setItem('analytics_wa_template', t); } catch { /* ignore */ } };

  useEffect(() => {
    (async () => {
      try {
        const [m, c] = await Promise.all([apiFetch('/api/analytics/players'), apiFetch('/api/analytics/config')]);
        setPlayers(m.players || []); setRefreshedAt(m.refreshedAt);
        setConfig(c.config); setDefaults(c.defaults); setMetricDefs(c.metrics || []);
      } catch (e: any) { setToast(e.message || 'فشل التحميل'); }
      finally { setLoading(false); }
    })();
  }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const pool = useMemo(() => players.filter(p => showTest || !p.isTest), [players, showTest]);
  const segmented = useMemo(() => config ? pool.map(p => ({ ...p, _seg: segmentOf(p, config) })) : [], [pool, config]);
  const segList = useMemo(() => config ? [...(config.segments || []), config.fallback] : [], [config]);
  const segCounts = useMemo(() => { const m: Record<string, number> = {}; segmented.forEach((p: any) => { m[p._seg.id] = (m[p._seg.id] || 0) + 1; }); return m; }, [segmented]);

  const refresh = async () => {
    setRefreshing(true);
    try { const r = await apiFetch('/api/analytics/refresh', { method: 'POST' }); const m = await apiFetch('/api/analytics/players'); setPlayers(m.players || []); setRefreshedAt(m.refreshedAt); flash(`تم تحديث البيانات · ${r.count} لاعب`); }
    catch (e: any) { flash(e.message || 'فشل التحديث'); }
    finally { setRefreshing(false); }
  };
  const saveConfig = async () => {
    setSaving(true);
    try { await apiFetch('/api/analytics/config', { method: 'PUT', body: JSON.stringify({ config }) }); setDirty(false); flash('حُفظت القواعد'); }
    catch (e: any) { flash(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };
  const resetConfig = () => { if (defaults) { setConfig(JSON.parse(JSON.stringify(defaults))); setDirty(true); flash('استُعيدت الإعدادات الافتراضيّة (اضغط حفظ للتثبيت)'); } };
  const editConfig = (fn: (c: any) => void) => { setConfig((prev: any) => { const c = JSON.parse(JSON.stringify(prev)); fn(c); return c; }); setDirty(true); };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  // ── مقاييس للجدول والتفاصيل ──
  const kpis = (() => {
    const active = pool.filter(p => p.games30 > 0).length;
    const gA = pool.reduce((s, p) => s + p.gamesAll, 0), aA = pool.reduce((s, p) => s + p.activitiesAll, 0);
    const news = pool.filter(p => p.accountAgeDays <= 30 && p.games30 > 0).length; // نشط جديد تقريبيّاً
    const seg = segCounts;
    const core = (seg['loyal'] || 0) + (seg['regular'] || 0);
    const winback = (seg['at_risk'] || 0) + (seg['churned'] || 0);
    return [
      { v: pool.length, c: 'إجمالي اللاعبين', d: 'بحساب مسجّل', col: 'text-amber-400' },
      { v: active, c: 'نشطون آخر ٣٠ يوم', d: 'لعبوا لعبة+', col: 'text-emerald-400' },
      { v: core, c: 'النواة الوفيّة', d: 'وفيّ + منتظم', col: 'text-sky-400' },
      { v: winback, c: 'قائمة الاسترجاع', d: 'معرّض + منقطع', col: 'text-rose-400' },
      { v: news, c: 'جدد نشطون', d: 'حساب حديث ونشط', col: 'text-violet-400' },
      { v: aA ? (gA / aA).toFixed(2) : '0', c: 'ألعاب/فعاليّة', d: 'متوسّط عامّ', col: 'text-amber-400' },
    ];
  })();

  const unplayedCount = pool.filter(p => Number(p.matchesSince) >= unplayedN).length;
  const rows = (() => {
    let r = segmented as any[];
    if (segFilter) r = r.filter(p => p._seg.id === segFilter);
    if (unplayed) r = r.filter(p => Number(p.matchesSince) >= unplayedN); // 🎯 لم يلعب آخر N مباراة
    const s = q.trim().toLowerCase();
    if (s) r = r.filter(p => (p.name || '').toLowerCase().includes(s) || (p.phone || '').includes(s));
    return r.slice().sort((a, b) => {
      if (sortKey === 'name') return (a.name || '').localeCompare(b.name || '', 'ar') * sortDir;
      if (sortKey === 'seg') return ((a._seg.name || '').localeCompare(b._seg.name || '', 'ar')) * sortDir;
      return (a[sortKey] - b[sortKey]) * sortDir;
    });
  })();
  const sortBy = (k: string) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(k === 'name' ? 1 : -1); } };

  return (
    <div className="space-y-5 max-w-6xl mx-auto" dir="rtl">
      {/* ── الرأس ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 تحليلات سلوك اللاعبين</h1>
          <p className="text-gray-500 text-xs mt-1">عدّادات المشاركة لآخر ٣٠ يوماً · الشرائح على كامل التاريخ عبر كل المواسم · آخر تحديث بيانات: <span className="text-gray-400">{fmtDate(refreshedAt)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTest(v => !v)} className={`px-3 py-2 rounded-xl text-xs border ${showTest ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-gray-800/40 text-gray-400 border-gray-700/40'}`}>{showTest ? '✓ ' : ''}حسابات الاختبار</button>
          <button onClick={refresh} disabled={refreshing} className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-black disabled:opacity-50">{refreshing ? '⏳ جارٍ التحديث…' : '↻ تحديث البيانات'}</button>
        </div>
      </div>

      {/* ── التبويبات ── */}
      <div className="flex gap-2 border-b border-gray-800/60">
        {[['dash', '📈 اللوحة'], ['rules', '⚙️ قواعد الشرائح']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === k ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>{l}{k === 'rules' && dirty ? ' •' : ''}</button>
        ))}
      </div>

      {tab === 'dash' ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {kpis.map((k, i) => (
              <div key={i} className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4">
                <div className="text-[11px] text-gray-400 font-semibold">{k.c}</div>
                <div className={`text-2xl font-bold mt-1.5 tabular-nums ${k.col}`}>{k.v}</div>
                <div className="text-[10px] text-gray-600 mt-1">{k.d}</div>
              </div>
            ))}
          </div>

          {/* شرائح + حداثة */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-bold text-white">شرائح اللاعبين</h2><span className="text-[10px] text-gray-500">اضغط شريحة لتصفية الجدول</span></div>
              <div className="flex h-8 rounded-lg overflow-hidden border border-gray-700/40">
                {segList.map((s: any) => { const w = (segCounts[s.id] || 0) / (pool.length || 1) * 100; return w > 0 ? <button key={s.id} onClick={() => setSegFilter(f => f === s.id ? null : s.id)} style={{ width: w + '%', background: s.color }} title={`${s.name}: ${segCounts[s.id]}`} /> : null; })}
              </div>
              <div className="mt-3 space-y-0.5">
                {segList.map((s: any) => (
                  <button key={s.id} onClick={() => setSegFilter(f => f === s.id ? null : s.id)} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-right ${segFilter === s.id ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : 'hover:bg-gray-800/50'}`}>
                    <span className="w-3 h-3 rounded" style={{ background: s.color }} />
                    <span className="flex-1 text-[12.5px] text-gray-200 font-semibold">{s.name}</span>
                    <span className="text-sm font-bold tabular-nums text-white">{segCounts[s.id] || 0}</span>
                    <span className="text-[10px] text-gray-500 w-10 text-left tabular-nums">{Math.round((segCounts[s.id] || 0) / (pool.length || 1) * 100)}%</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-white mb-3">الحداثة — منذ آخر لعبة</h2>
              <div className="flex items-end gap-3 h-40 pt-2">
                {[{ l: '≤ ٧ي', c: '#34d399', f: (p: any) => p.daysSince <= 7 }, { l: '٨–٢١ي', c: '#38bdf8', f: (p: any) => p.daysSince > 7 && p.daysSince <= 21 }, { l: '٢٢–٤٥ي', c: '#f5a524', f: (p: any) => p.daysSince > 21 && p.daysSince <= 45 }, { l: '+٤٥ي', c: '#e5484d', f: (p: any) => p.daysSince > 45 }].map((b, i, arr) => {
                  const v = pool.filter(b.f).length, mx = Math.max(1, ...arr.map(x => pool.filter(x.f).length));
                  return <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                    <span className="text-sm font-bold tabular-nums">{v}</span>
                    <div className="w-full max-w-[70px] rounded-t-md" style={{ height: (v / mx * 100) + '%', minHeight: 3, background: b.c }} />
                    <span className="text-[10px] text-gray-400">{b.l}</span>
                  </div>;
                })}
              </div>
            </div>
          </div>

          {/* أدوات + جدول */}
          <div className="flex flex-wrap gap-2 items-center">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ابحث باسم اللاعب أو رقم هاتفه…" className="flex-1 min-w-[220px] bg-gray-900/50 border border-gray-700/50 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-amber-500/50" />
            {segFilter && <button onClick={() => setSegFilter(null)} className="px-3 py-2 rounded-full text-xs border bg-amber-500/10 text-amber-400 border-amber-500/30">الكل ✕</button>}
            <button onClick={() => setShowTemplate(v => !v)} className={`px-3 py-2 rounded-xl text-xs border ${showTemplate ? 'bg-green-500/15 text-green-400 border-green-500/40' : 'bg-gray-800/40 text-gray-300 border-gray-700/40'}`}>💬 قالب الرسالة</button>
          </div>

          {/* 🎯 شريحة: لم يلعب آخر N مباراة (فلتر عرض قابل للضبط) */}
          <div className="flex flex-wrap items-center gap-2.5 bg-gray-800/20 border border-gray-700/30 rounded-xl px-3 py-2.5">
            <button onClick={() => setUnplayed(v => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${unplayed ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' : 'bg-gray-800/50 text-gray-300 border-gray-700/50'}`}>
              {unplayed ? '✓ ' : ''}🎯 لم يلعب آخر
            </button>
            <div className="flex items-center gap-1">
              <button onClick={() => setUnplayedN(n => Math.max(1, n - 5))} className="w-7 h-7 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-300 text-sm">−</button>
              <input type="number" min={1} value={unplayedN} onChange={e => setUnplayedN(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 text-center bg-gray-900/60 border border-gray-700/50 rounded-lg py-1 text-sm text-white tabular-nums outline-none focus:border-rose-500/50" />
              <button onClick={() => setUnplayedN(n => n + 5)} className="w-7 h-7 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-300 text-sm">+</button>
            </div>
            <span className="text-xs text-gray-400">مباراة من مباريات النادي</span>
            <span className="text-[11px] text-rose-300/80 mr-auto">مطابقون: <b className="tabular-nums">{unplayedCount}</b></span>
          </div>

          {/* 💬 محرّر قالب رسالة الواتساب */}
          {showTemplate && (
            <div className="bg-gray-800/30 border border-green-500/20 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-green-400">💬 قالب رسالة الواتساب</h3>
                <button onClick={() => saveTemplate(WA_DEFAULT_TEMPLATE)} className="text-[11px] text-gray-400 hover:text-white">استعادة الافتراضيّ</button>
              </div>
              <textarea value={waTemplate} onChange={e => saveTemplate(e.target.value)} rows={4}
                className="w-full bg-gray-900/60 border border-gray-700/50 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-green-500/50 leading-relaxed resize-y"
                placeholder="اكتب نصّ الرسالة… استخدم المتغيّرات أدناه" dir="rtl" />
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] text-gray-500 self-center">أدرِج متغيّراً:</span>
                {WA_VARS.map(v => (
                  <button key={v.token} onClick={() => saveTemplate(waTemplate + v.token)}
                    className="text-[11px] px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/25 text-green-300 hover:bg-green-500/20" title={v.token}>
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                المتغيّرات تُستبدل بقيم كلّ لاعب عند الضغط على 💬 في صفّه. القالب يُحفظ على جهازك تلقائيّاً.
              </p>
            </div>
          )}

          <div className="text-[11px] text-gray-500">عرض <b className="tabular-nums">{rows.length}</b> لاعب{segFilter ? ` · ${segList.find((s: any) => s.id === segFilter)?.name}` : ''}{unplayed ? ` · لم يلعب آخر ${unplayedN} مباراة` : ''}</div>

          <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[2.1fr_1.1fr_.7fr_.7fr_.8fr_.5fr] bg-gray-900/40 border-b border-gray-700/30 text-[10px] uppercase tracking-wider text-gray-500">
              {[['name', 'اللاعب'], ['seg', 'الشريحة'], ['activitiesAll', 'فعاليّات'], ['games30', 'آخر ٣٠ي'], ['daysSince', 'آخر ظهور']].map(([k, l]) => (
                <button key={k} onClick={() => sortBy(k)} className="px-3.5 py-2.5 text-right hover:text-gray-300">{l}{sortKey === k && <span className="text-amber-400 mr-1">{sortDir < 0 ? '▼' : '▲'}</span>}</button>
              ))}
              <div className="px-2 py-2.5 text-center">تواصل</div>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {rows.length === 0 ? <div className="p-10 text-center text-gray-600 text-sm">لا لاعبين مطابقين</div> :
                rows.map(p => (
                  <div key={p.id} onClick={() => setDetail(p)} className="grid grid-cols-[2.1fr_1.1fr_.7fr_.7fr_.8fr_.5fr] items-center border-b border-gray-800/40 hover:bg-gray-800/40 cursor-pointer">
                    <div className="px-3.5 py-2.5 flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-black shrink-0" style={{ background: p._seg.color }}>{initials(p.name)}</span>
                      <span className="min-w-0"><div className="text-[13px] font-semibold text-white truncate">{p.name || '—'}{p.isTest && <span className="text-[9px] text-amber-400 border border-amber-500/40 rounded px-1 mr-1.5">اختبار</span>}</div><div className="text-[10px] text-gray-500 tabular-nums" dir="ltr">{p.phone}</div></span>
                    </div>
                    <div className="px-3.5"><span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: hexa(p._seg.color, .13), color: p._seg.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: p._seg.color }} />{p._seg.name}</span></div>
                    <div className="px-3.5 text-center text-[13px] tabular-nums">{p.activitiesAll}</div>
                    <div className="px-3.5 text-center text-[13px] tabular-nums text-gray-400">{p.games30 || '·'}</div>
                    <div className="px-3.5 text-center text-[13px] tabular-nums" style={{ color: p.daysSince <= 21 ? '#34d399' : p.daysSince <= 45 ? '#f5a524' : '#e5484d' }}>{p.daysSince}ي</div>
                    <div className="px-2 flex justify-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (normalizePhoneIntl(p.phone)) openWhatsApp(p, waTemplate, flash); else flash('لا رقم هاتف صالح لهذا اللاعب'); }}
                        title={normalizePhoneIntl(p.phone) ? 'إرسال رسالة واتساب' : 'لا رقم هاتف'}
                        disabled={!normalizePhoneIntl(p.phone)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${normalizePhoneIntl(p.phone) ? 'bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25' : 'bg-gray-800/40 border border-gray-700/40 text-gray-600 cursor-not-allowed'}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </>
      ) : (
        <RuleBuilder config={config} metricDefs={metricDefs} segCounts={segCounts} pool={pool}
          onEdit={editConfig} onSave={saveConfig} onReset={resetConfig} saving={saving} dirty={dirty} />
      )}

      {detail && <PlayerDetail p={detail} onClose={() => setDetail(null)} onWa={(pp: any) => openWhatsApp(pp, waTemplate, flash)} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 border border-amber-500/40 text-amber-200 text-sm px-4 py-2.5 rounded-xl shadow-2xl">{toast}</div>}
    </div>
  );
}

// ═══════════ بنّاء القواعد ═══════════
function RuleBuilder({ config, metricDefs, segCounts, pool, onEdit, onSave, onReset, saving, dirty }: any) {
  const move = (i: number, dir: number) => onEdit((c: any) => { const s = c.segments; const j = i + dir; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; });
  const addSeg = () => onEdit((c: any) => c.segments.push({ id: 'seg_' + Date.now(), name: 'شريحة جديدة', color: '#c5a059', match: 'all', conditions: [{ metric: 'activitiesAll', op: '>=', value: 1 }] }));
  const delSeg = (i: number) => onEdit((c: any) => c.segments.splice(i, 1));
  const setSeg = (i: number, k: string, v: any) => onEdit((c: any) => { c.segments[i][k] = v; });
  const addCond = (i: number) => onEdit((c: any) => c.segments[i].conditions.push({ metric: 'daysSince', op: '<=', value: 21 }));
  const setCond = (i: number, ci: number, k: string, v: any) => onEdit((c: any) => { c.segments[i].conditions[ci][k] = k === 'value' ? Number(v) : v; });
  const delCond = (i: number, ci: number) => onEdit((c: any) => c.segments[i].conditions.splice(ci, 1));
  const setFb = (k: string, v: any) => onEdit((c: any) => { c.fallback[k] = v; });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500 max-w-2xl leading-relaxed">تُطبَّق القواعد بالترتيب و<b className="text-gray-300">أوّل شريحة تنطبق شروطها تفوز</b>. القاعدة الذهبيّة: <b className="text-amber-400/90">رتّب من الأخصّ (الأضيق) في الأعلى إلى الأعمّ (الأوسع) في الأسفل</b>. «يلتقط» = ما تأخذه فعليّاً بعد الأولويّة؛ التغييرات تنعكس فوراً، واضغط حفظ للتثبيت.</p>
        <div className="flex gap-2">
          <button onClick={onReset} className="px-3 py-2 rounded-xl text-xs bg-gray-800/40 text-gray-400 border border-gray-700/40">استعادة الافتراضيّ</button>
          <button onClick={onSave} disabled={saving || !dirty} className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-black disabled:opacity-40">{saving ? '⏳' : dirty ? '💾 حفظ القواعد' : '✓ محفوظ'}</button>
        </div>
      </div>

      {(config?.segments || []).map((seg: any, i: number) => {
        const captured = segCounts[seg.id] || 0;
        const iso = (pool || []).filter((p: any) => matchesSeg(p, seg)).length;   // يحقّق الشروط بمعزل عن الترتيب
        const shadowed = iso - captured;                                          // فقدهم لشرائح أعلى
        return (
        <div key={seg.id} className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4" style={{ borderInlineStartWidth: 3, borderInlineStartColor: seg.color }}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <input type="color" value={seg.color} onChange={e => setSeg(i, 'color', e.target.value)} className="w-8 h-8 rounded-lg bg-transparent border border-gray-700/40 cursor-pointer p-0.5" />
            <input value={seg.name} onChange={e => setSeg(i, 'name', e.target.value)} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-white font-semibold outline-none focus:border-amber-500/50 min-w-[140px]" />
            <div className="flex bg-gray-900/50 border border-gray-700/40 rounded-lg overflow-hidden text-[11px]">
              <button onClick={() => setSeg(i, 'match', 'all')} className={`px-2.5 py-1.5 ${seg.match !== 'any' ? 'bg-amber-500/15 text-amber-400' : 'text-gray-500'}`}>كل الشروط (و)</button>
              <button onClick={() => setSeg(i, 'match', 'any')} className={`px-2.5 py-1.5 ${seg.match === 'any' ? 'bg-amber-500/15 text-amber-400' : 'text-gray-500'}`}>أيّ شرط (أو)</button>
            </div>
            <span className="text-[11px] text-gray-400">يلتقط <b className="text-white tabular-nums">{captured}</b>{shadowed > 0 && <span className="text-gray-600"> / <span className="tabular-nums">{iso}</span> محقّق</span>}</span>
            <div className="flex gap-1 mr-auto">
              <button onClick={() => move(i, -1)} title="تحريك للأعلى" className="w-7 h-7 rounded-lg bg-gray-800/50 text-gray-400 hover:text-white text-xs">▲</button>
              <button onClick={() => move(i, 1)} title="تحريك للأسفل" className="w-7 h-7 rounded-lg bg-gray-800/50 text-gray-400 hover:text-white text-xs">▼</button>
              <button onClick={() => delSeg(i)} className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs">🗑</button>
            </div>
          </div>
          {shadowed > 0 && (
            <div className="mt-2.5 flex items-center gap-2 text-[11px] bg-amber-500/8 border border-amber-500/25 text-amber-300/90 rounded-lg px-3 py-2">
              <span>⚠️</span>
              <span><b className="tabular-nums">{shadowed}</b> لاعباً يحقّقون شروط هذه الشريحة لكن التقطتهم شرائح أعلى منها. حرّكها للأعلى <button onClick={() => move(i, -1)} className="text-amber-400 underline underline-offset-2">▲</button> لتلتقطهم.</span>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {(seg.conditions || []).map((c: any, ci: number) => (
              <div key={ci} className="flex items-center gap-2 flex-wrap">
                <select value={c.metric} onChange={e => setCond(i, ci, 'metric', e.target.value)} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2 py-1.5 text-[12px] text-gray-200 outline-none focus:border-amber-500/50">
                  {metricDefs.map((m: any) => <option key={m.key} value={m.key}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>)}
                </select>
                <select value={c.op} onChange={e => setCond(i, ci, 'op', e.target.value)} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2 py-1.5 text-[13px] text-amber-400 outline-none w-14 text-center">
                  {Object.keys(OP_LABELS).map(o => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                </select>
                <input type="number" value={c.value} onChange={e => setCond(i, ci, 'value', e.target.value)} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2 py-1.5 text-[13px] text-white outline-none w-20 tabular-nums" />
                <button onClick={() => delCond(i, ci)} className="text-gray-600 hover:text-rose-400 text-sm px-1">✕</button>
              </div>
            ))}
            <button onClick={() => addCond(i)} className="text-[11px] text-amber-400/80 hover:text-amber-400 mt-1">+ إضافة شرط</button>
          </div>
        </div>
        );
      })}

      <button onClick={addSeg} className="w-full py-3 rounded-2xl border border-dashed border-gray-700/50 text-gray-400 text-sm hover:border-amber-500/40 hover:text-amber-400">+ إضافة شريحة</button>

      {config?.fallback && (
        <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl p-4 flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] text-gray-500">الاحتياطيّ (من لا تنطبق عليه أيّ قاعدة):</span>
          <input type="color" value={config.fallback.color} onChange={e => setFb('color', e.target.value)} className="w-8 h-8 rounded-lg bg-transparent border border-gray-700/40 cursor-pointer p-0.5" />
          <input value={config.fallback.name} onChange={e => setFb('name', e.target.value)} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-white outline-none min-w-[140px]" />
          <span className="text-[11px] text-gray-400">يطابق <b className="text-white tabular-nums">{segCounts[config.fallback.id] || 0}</b> لاعباً</span>
        </div>
      )}
    </div>
  );
}

// ═══════════ تفاصيل اللاعب (بصريّ) ═══════════
function PlayerDetail({ p, onClose, onWa }: any) {
  const waOk = !!normalizePhoneIntl(p.phone);
  const c = p._seg.color, acts = p.acts || [];
  const bm: Record<string, { g: number; a: number }> = {};
  acts.forEach((a: any) => { const mk = a.d.slice(0, 7); (bm[mk] = bm[mk] || { g: 0, a: 0 }); bm[mk].g += a.g; bm[mk].a++; });
  const mks = Object.keys(bm).sort(), mmx = Math.max(1, ...mks.map(m => bm[m].g));
  const ts = acts.map((a: any) => +new Date(a.d)); const mn = Math.min(...ts), mx = Math.max(...ts), span = Math.max(1, mx - mn), gmx = Math.max(1, ...acts.map((a: any) => a.g));
  const seasons = (p.seasons || []).slice().sort();
  const stats = [
    { v: p.activitiesAll, c: 'فعاليّات (كلّيّاً)' }, { v: p.gamesAll, c: 'ألعاب (كلّيّاً)' },
    { v: p.activities30, c: 'فعاليّات ٣٠ي' }, { v: p.games30, c: 'ألعاب ٣٠ي' },
    { v: p.daysSince + 'ي', c: 'منذ آخر لعبة' }, { v: (p.matchesSince ?? 0) + ' مباراة', c: 'مباريات فاتته' },
    { v: p.tenureDays + 'ي', c: 'مدّة النشاط' },
    { v: p.avgGpa, c: 'ألعاب/فعاليّة' }, { v: p.freqPerMonth, c: 'فعاليّات/شهر' },
    { v: p.longestGapDays + 'ي', c: 'أطول انقطاع' }, { v: p.seasonsCount, c: 'عدد المواسم' },
    { v: p.survivalPct + '%', c: 'نسبة النجاة' }, { v: p.remotePct + '%', c: 'عن بُعد' },
  ];
  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700/50 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex items-center gap-3.5 p-5" style={{ background: `linear-gradient(180deg, ${hexa(c, .08)}, transparent)` }}>
          <span className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-black" style={{ background: c }}>{initials(p.name)}</span>
          <div className="min-w-0"><div className="text-lg font-bold text-white">{p.name || '—'}{p.isTest && <span className="text-[9px] text-amber-400 border border-amber-500/40 rounded px-1 mr-2">اختبار</span>}</div><div className="text-xs text-gray-500 tabular-nums" dir="ltr">{p.phone}</div></div>
          <div className="mr-auto self-start flex items-center gap-2">
            {waOk && (
              <button onClick={() => onWa?.(p)} title="إرسال رسالة واتساب"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                واتساب
              </button>
            )}
            <button onClick={onClose} className="self-start text-gray-500 hover:text-white text-2xl leading-none">✕</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center px-5 pb-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: hexa(c, .14), color: c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{p._seg.name}</span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">الرتبة</span><b className="text-xs text-amber-400">{p.rank || '—'}</b>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">المواسم</span>
          {seasons.length ? seasons.map((s: number) => { const m = seasonMeta(s); return <span key={s} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border" style={{ borderColor: hexa(m.raw, .5), color: m.raw }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: m.raw }} />{m.label}</span>; }) : <span className="text-gray-600 text-xs">—</span>}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-5 pt-3">
          {stats.map((s, i) => <div key={i} className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-2.5"><div className="text-lg font-bold text-white tabular-nums">{s.v}</div><div className="text-[10px] text-gray-500 mt-0.5">{s.c}</div></div>)}
        </div>
        <div className="px-5 pb-2">
          <h3 className="text-[11.5px] text-gray-400 font-bold mb-2.5">النشاط الشهريّ</h3>
          <div className="flex gap-1.5 flex-wrap">
            {mks.length ? mks.map(m => <div key={m} className="flex-1 min-w-[58px] border border-gray-700/30 rounded-lg p-2 text-center relative overflow-hidden"><div className="absolute inset-x-0 bottom-0" style={{ height: bm[m].g / mmx * 100 + '%', background: hexa(c, .16) }} /><div className="text-[10px] text-gray-500 relative">{monthShort(m)} {m.slice(2, 4)}</div><div className="text-base font-bold tabular-nums relative">{bm[m].g}</div><div className="text-[9px] text-gray-600 relative">{bm[m].a} فعاليّة</div></div>) : <span className="text-gray-600 text-xs">—</span>}
          </div>
        </div>
        <div className="px-5 pb-2">
          <h3 className="text-[11.5px] text-gray-400 font-bold mb-2">خطّ الحضور{acts.length ? ` (${acts.length} فعاليّة)` : ''}</h3>
          <div className="relative h-11 rounded-lg border border-gray-700/40" style={{ background: 'linear-gradient(90deg,#17171b,#1d1d22)' }}>
            {acts.map((a: any, i: number) => { const x = (+new Date(a.d) - mn) / span * 100, r = 6 + a.g / gmx * 9, col = seasonMeta(a.s).raw; return <span key={i} className="absolute top-1/2 rounded-full" style={{ right: x + '%', transform: 'translate(50%,-50%)', width: r, height: r, background: col, border: '1.5px solid #0b0b0d' }} title={`${a.n} · ${a.d} · ${a.g} لعبة`} />; })}
          </div>
          <div className="flex justify-between text-[9.5px] text-gray-500 mt-1 tabular-nums" dir="ltr"><span>{p.firstSeen}</span><span>{p.lastSeen}</span></div>
        </div>
        <div className="px-5 pb-5">
          <h3 className="text-[11.5px] text-gray-400 font-bold mb-2">ألعاب كلّ فعاليّة</h3>
          <div className="max-h-52 overflow-y-auto pl-1 space-y-0.5">
            {acts.length ? acts.slice().reverse().map((a: any, i: number) => { const col = seasonMeta(a.s).raw; return (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-2.5 items-center py-1.5 border-b border-gray-800/40">
                <span className="w-2 h-2 rounded-full" style={{ background: col }} title={seasonMeta(a.s).label} />
                <div className="min-w-0"><div className="text-[12.5px] text-gray-200 truncate">{a.n || '—'}</div><div className="text-[10px] text-gray-500 tabular-nums" dir="ltr">{a.d}</div></div>
                <div className="flex items-center gap-2 justify-end"><span className="h-2 rounded" style={{ width: a.g / gmx * 100, background: col }} /><b className="text-xs tabular-nums w-4 text-left" style={{ color: col }}>{a.g}</b></div>
              </div>); }) : <div className="text-gray-600 text-xs">ألعاب غير مرتبطة بفعاليّة.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
