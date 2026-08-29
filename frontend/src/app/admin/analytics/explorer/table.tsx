'use client';

// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — الجدول وتفاصيل اللاعب
// ══════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import type { Player } from './lib';
import { fillTemplate, fmtMoney, fmtNum, normalizePhone, pushNotify } from './lib';

// ── الأعمدة ──────────────────────────────────────────
export type ColKey =
  | 'gender' | 'createdAt' | 'rank'
  | 'activities' | 'matches' | 'winPct' | 'firstActivityAt' | 'lastActivityAt'
  | 'daysToFirst' | 'daysSinceLast' | 'longestGap' | 'locations' | 'missedSince'
  | 'booked' | 'noShows' | 'walkIns'
  | 'spend' | 'paid' | 'fnb' | 'unpaid' | 'chips'
  | 'feedbackAvg' | 'feedbackCount' | 'push' | 'penalties' | 'cheat' | 'social';

interface ColDef {
  key: ColKey; label: string; group: 'id' | 'attend' | 'convert' | 'money' | 'quality';
  align?: 'center' | 'right'; width?: string;
  value: (p: Player) => number | string | null;      // للفرز
  cell: (p: Player) => React.ReactNode;              // للعرض
}

const dash = <span className="text-gray-600">—</span>;
const numCell = (n: number, zeroDim = true) =>
  <span className={`tabular-nums ${zeroDim && !n ? 'text-gray-600' : ''}`}>{fmtNum(n)}</span>;

export const COLUMNS: ColDef[] = [
  { key: 'gender', label: 'الجنس', group: 'id', align: 'center',
    value: (p) => p.gender, cell: (p) => (
      <span className={`text-[10.5px] px-2 py-0.5 rounded-full ${p.gender === 'FEMALE' ? 'bg-teal-500/15 text-teal-300' : 'bg-gray-700/50 text-gray-300'}`}>
        {p.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}</span>) },
  { key: 'createdAt', label: 'التسجيل', group: 'id',
    value: (p) => p.createdAt, cell: (p) => <span className="tabular-nums text-gray-400" dir="ltr">{p.createdAt.slice(0, 10)}</span> },
  { key: 'rank', label: 'الرتبة', group: 'id',
    value: (p) => p.level, cell: (p) => <span className="text-[11px] text-gray-400">{p.rankTier || '—'} <span className="tabular-nums text-gray-600">ل{p.level}</span></span> },

  { key: 'activities', label: 'فعاليّات', group: 'attend', align: 'center',
    value: (p) => p.activities, cell: (p) => (
      <span className={`tabular-nums font-bold text-[14px] ${p.activities === 0 ? 'text-rose-400' : p.activities === 1 ? 'text-gray-300' : 'text-amber-400'}`}>
        {p.activities}</span>) },
  { key: 'matches', label: 'مباريات', group: 'attend', align: 'center',
    value: (p) => p.matches, cell: (p) => numCell(p.matches) },
  { key: 'winPct', label: 'الفوز', group: 'attend', align: 'center',
    value: (p) => (p.matches ? p.wins / p.matches : null),
    cell: (p) => p.matches
      ? <span className="tabular-nums" dir="ltr">{Math.round((p.wins / p.matches) * 100)}% <span className="text-gray-600 text-[10.5px]">{p.wins}/{p.matches}</span></span>
      : dash },
  { key: 'firstActivityAt', label: 'أوّل حضور', group: 'attend',
    value: (p) => p.firstActivityAt, cell: (p) => p.firstActivityAt ? <span className="tabular-nums text-gray-400" dir="ltr">{p.firstActivityAt}</span> : dash },
  { key: 'lastActivityAt', label: 'آخر حضور', group: 'attend',
    value: (p) => p.lastActivityAt, cell: (p) => p.lastActivityAt ? <span className="tabular-nums text-gray-400" dir="ltr">{p.lastActivityAt}</span> : dash },
  { key: 'daysToFirst', label: 'أيّام حتّى أوّل حضور', group: 'attend', align: 'center',
    value: (p) => p.daysToFirstActivity, cell: (p) => p.daysToFirstActivity == null ? dash : numCell(p.daysToFirstActivity, false) },
  { key: 'daysSinceLast', label: 'منذ آخر حضور', group: 'attend', align: 'center',
    value: (p) => p.daysSinceLastActivity,
    cell: (p) => p.daysSinceLastActivity == null ? dash : (
      <span className="tabular-nums" style={{ color: p.daysSinceLastActivity <= 21 ? '#34d399' : p.daysSinceLastActivity <= 45 ? '#f5a524' : '#e5484d' }}>
        {p.daysSinceLastActivity}ي</span>) },
  { key: 'longestGap', label: 'أطول انقطاع', group: 'attend', align: 'center',
    value: (p) => p.longestGapDays, cell: (p) => numCell(p.longestGapDays) },
  { key: 'locations', label: 'مواقع', group: 'attend', align: 'center',
    value: (p) => p.locationsCount, cell: (p) => numCell(p.locationsCount) },
  { key: 'missedSince', label: 'فاتته', group: 'attend', align: 'center',
    value: (p) => p.activitiesMissedSince, cell: (p) => numCell(p.activitiesMissedSince) },

  { key: 'booked', label: 'حجز', group: 'convert', align: 'center',
    value: (p) => p.bookedActivities, cell: (p) => numCell(p.bookedActivities) },
  { key: 'noShows', label: 'لم يحضر', group: 'convert', align: 'center',
    value: (p) => p.noShows,
    cell: (p) => p.noShows ? <span className="tabular-nums text-rose-400 font-semibold">{p.noShows}</span> : numCell(0) },
  { key: 'walkIns', label: 'بلا حجز', group: 'convert', align: 'center',
    value: (p) => p.walkIns, cell: (p) => p.walkIns ? <span className="tabular-nums text-sky-400">{p.walkIns}</span> : numCell(0) },

  { key: 'spend', label: 'أنفق', group: 'money', align: 'center',
    value: (p) => p.paidTotal + p.fnbTotal,
    cell: (p) => { const v = p.paidTotal + p.fnbTotal; return v ? <span className="tabular-nums text-emerald-400" dir="ltr">{v.toFixed(2)}</span> : numCell(0); } },
  { key: 'paid', label: 'حجوزات', group: 'money', align: 'center',
    value: (p) => p.paidTotal, cell: (p) => <span className={`tabular-nums ${p.paidTotal ? '' : 'text-gray-600'}`} dir="ltr">{p.paidTotal.toFixed(2)}</span> },
  { key: 'fnb', label: 'منيو', group: 'money', align: 'center',
    value: (p) => p.fnbTotal, cell: (p) => <span className={`tabular-nums ${p.fnbTotal ? '' : 'text-gray-600'}`} dir="ltr">{p.fnbTotal.toFixed(2)}</span> },
  { key: 'unpaid', label: 'مستحقّ', group: 'money', align: 'center',
    value: (p) => p.unpaidTotal,
    cell: (p) => p.unpaidTotal ? <span className="tabular-nums text-amber-400" dir="ltr">{p.unpaidTotal.toFixed(2)}</span> : numCell(0) },
  { key: 'chips', label: 'تشبس ± ', group: 'money', align: 'center',
    value: (p) => p.chipsEarned - p.chipsSpent,
    cell: (p) => <span className="tabular-nums text-[11px] text-gray-400" dir="ltr">+{p.chipsEarned}/−{p.chipsSpent}</span> },

  { key: 'feedbackAvg', label: 'تقييمه', group: 'quality', align: 'center',
    value: (p) => p.feedbackAvg,
    cell: (p) => p.feedbackAvg == null ? dash : (
      <span className={`tabular-nums font-semibold ${p.feedbackAvg >= 4.5 ? 'text-emerald-400' : p.feedbackAvg >= 3.5 ? 'text-amber-400' : 'text-rose-400'}`} dir="ltr">
        {p.feedbackAvg.toFixed(2)}</span>) },
  { key: 'feedbackCount', label: 'تقييمات', group: 'quality', align: 'center',
    value: (p) => p.feedbackCount, cell: (p) => numCell(p.feedbackCount) },
  { key: 'push', label: 'إشعارات', group: 'quality', align: 'center',
    value: (p) => (p.hasPush ? 1 : 0),
    cell: (p) => p.hasPush ? <span className="text-sky-400">🔔</span> : <span className="text-gray-700">—</span> },
  { key: 'penalties', label: 'عقوبات', group: 'quality', align: 'center',
    value: (p) => p.penalties,
    cell: (p) => p.penalties ? <span className="tabular-nums text-rose-400">{p.penalties}</span> : numCell(0) },
  { key: 'cheat', label: 'إشارات غش', group: 'quality', align: 'center',
    value: (p) => (p.matches ? p.cheatSignals / p.matches : null),
    cell: (p) => p.matches
      ? <span className="tabular-nums text-[11px] text-gray-400" dir="ltr">{(p.cheatSignals / p.matches).toFixed(0)}/مباراة</span>
      : dash },
  { key: 'social', label: 'متابعون', group: 'quality', align: 'center',
    value: (p) => p.followers, cell: (p) => <span className="tabular-nums text-[11px] text-gray-400" dir="ltr">{p.followers}/{p.following}</span> },
];

export const COL_GROUPS: { key: ColDef['group']; label: string }[] = [
  { key: 'id', label: 'الهويّة' }, { key: 'attend', label: 'الحضور' },
  { key: 'convert', label: 'التحويل' }, { key: 'money', label: 'المال' }, { key: 'quality', label: 'الجودة' },
];

export const DEFAULT_COLS: ColKey[] = [
  'gender', 'createdAt', 'activities', 'matches', 'winPct',
  'booked', 'noShows', 'spend', 'feedbackAvg', 'lastActivityAt', 'daysSinceLast',
];

// ── الجدول ───────────────────────────────────────────
export function PlayerTable({ players, cols, waTemplate, notifTitle, onToast }: {
  players: Player[]; cols: ColKey[]; waTemplate: string; notifTitle: string;
  onToast: (m: string) => void;
}) {
  const [sort, setSort] = useState<ColKey | 'name'>('activities');
  const [dir, setDir] = useState(-1);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const active = useMemo(() => COLUMNS.filter((c) => cols.includes(c.key)), [cols]);

  const rows = useMemo(() => {
    const def = COLUMNS.find((c) => c.key === sort);
    const val = (p: Player) => (sort === 'name' ? p.name : def ? def.value(p) : null);
    return [...players].sort((a, b) => {
      const x = val(a), y = val(b);
      // الفراغ آخِراً في الاتّجاهين — وإلّا احتلّ صدارةَ الترتيب التصاعديّ بلا معنى
      if (x == null && y == null) return a.id - b.id;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x < y) return -dir;
      if (x > y) return dir;
      return a.id - b.id;
    });
  }, [players, sort, dir]);

  const toggleSort = (k: ColKey | 'name') => {
    if (sort === k) setDir((d) => -d);
    else { setSort(k); setDir(k === 'name' ? 1 : -1); }
  };
  const toggleRow = (id: number) =>
    setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const arrow = (k: ColKey | 'name') => sort === k
    ? <span className="text-amber-400 mr-1 text-[9px]">{dir < 0 ? '▼' : '▲'}</span> : null;

  return (
    <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse min-w-[820px]">
          <thead>
            <tr className="bg-gray-900/50 border-b border-gray-700/40">
              <th className="text-right sticky right-0 bg-gray-900/95 z-10" aria-sort={sort === 'name' ? (dir < 0 ? 'descending' : 'ascending') : 'none'}>
                <button type="button" onClick={() => toggleSort('name')}
                  className="w-full text-right px-3.5 py-2.5 text-[10px] uppercase tracking-wider text-gray-500 hover:text-amber-400">
                  اللاعب{arrow('name')}
                </button>
              </th>
              {active.map((c) => (
                <th key={c.key} aria-sort={sort === c.key ? (dir < 0 ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(c.key)}
                    className={`w-full px-2.5 py-2.5 text-[10px] uppercase tracking-wider text-gray-500 hover:text-amber-400 whitespace-nowrap ${c.align === 'center' ? 'text-center' : 'text-right'}`}>
                    {c.label}{arrow(c.key)}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2.5 text-[10px] uppercase tracking-wider text-gray-500 text-center w-[92px]">تواصل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const isOpen = open.has(p.id);
              const stripe = p.activities === 0 ? 'bg-rose-500' : p.activities === 1 ? 'bg-gray-600' : 'bg-amber-500';
              return [
                <tr key={p.id} onClick={() => toggleRow(p.id)}
                  className={`border-b border-gray-800/40 cursor-pointer ${isOpen ? 'bg-gray-800/50' : 'hover:bg-gray-800/30'}`}>
                  <td className={`sticky right-0 z-10 ${isOpen ? 'bg-gray-800/95' : 'bg-gray-900/80'}`}>
                    <div className="flex items-center gap-2.5 px-3.5 py-2">
                      <i className={`w-[3px] h-8 rounded-full shrink-0 ${stripe}`} />
                      <span className={`text-[9px] transition-transform ${isOpen ? 'rotate-[-90deg] text-amber-400' : 'text-gray-600'}`}>◀</span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-white truncate max-w-[190px]">
                          {p.name || '—'}
                          {p.isTestAccount && <span className="text-[9px] text-amber-400 border border-amber-500/40 rounded px-1 mr-1.5">اختبار</span>}
                        </span>
                        <span className="block text-[10px] text-gray-500 tabular-nums" dir="ltr">{p.phone}</span>
                      </span>
                    </div>
                  </td>
                  {active.map((c) => (
                    <td key={c.key} className={`px-2.5 py-2 ${c.align === 'center' ? 'text-center' : ''}`}>{c.cell(p)}</td>
                  ))}
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <Contact p={p} waTemplate={waTemplate} notifTitle={notifTitle} onToast={onToast} />
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${p.id}-d`}>
                    <td colSpan={active.length + 2} className="bg-gray-900/40 border-b border-gray-700/40 p-0">
                      <Detail p={p} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="py-12 text-center text-gray-600 text-sm">لا لاعبين مطابقين لهذه العدسة.</div>}
    </div>
  );
}

// ── أزرار التواصل ────────────────────────────────────
function Contact({ p, waTemplate, notifTitle, onToast }: {
  p: Player; waTemplate: string; notifTitle: string; onToast: (m: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const intl = normalizePhone(p.phone);
  return (
    <div className="flex justify-center items-center gap-1.5">
      {intl && (
        <button type="button" title="رسالة واتساب"
          onClick={() => window.open(`https://wa.me/${intl}?text=${encodeURIComponent(fillTemplate(waTemplate, p))}`, '_blank')}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" /></svg>
        </button>
      )}
      {p.hasPush && (
        <button type="button" title="دفع الرسالة كإشعار" disabled={sending}
          onClick={async () => {
            setSending(true);
            try { await pushNotify(p.id, notifTitle, fillTemplate(waTemplate, p)); onToast(`أُرسل الإشعار إلى ${p.name}`); }
            catch (e: any) { onToast(e.message || 'فشل الإرسال'); }
            finally { setSending(false); }
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-500/15 border border-sky-500/30 text-sky-400 hover:bg-sky-500/25 transition disabled:opacity-50">
          {sending ? '⏳' : '🔔'}
        </button>
      )}
    </div>
  );
}

// ── تفاصيل اللاعب ────────────────────────────────────
function Detail({ p }: { p: Player }) {
  const kv: [string, React.ReactNode][] = [
    ['المعرّف', <span className="tabular-nums" dir="ltr">{p.id}</span>],
    ['تاريخ الميلاد', <span className="tabular-nums" dir="ltr">{p.dob || '—'}</span>],
    ['البريد', p.email || '—'],
    ['آخر ظهور', <span className="tabular-nums" dir="ltr">{p.lastActiveAt?.replace('T', ' ') || '—'}</span>],
    ['الرتبة', `${p.rankTier || '—'} · مستوى ${p.level}`],
    ['نجا حتّى النهاية', <span className="tabular-nums">{p.survived} من {p.matches}</span>],
    ['أطول انقطاع', <span className="tabular-nums">{p.longestGapDays} يوم</span>],
    ['فعاليّات فاتته منذ آخر حضور', <span className="tabular-nums">{p.activitiesMissedSince}</span>],
    ['حجوزاته', <span className="tabular-nums">{p.bookedActivities} · لم يحضر {p.noShows}</span>],
    ['إنفاقه', <span className="tabular-nums" dir="ltr">{fmtMoney(p.paidTotal + p.fnbTotal)}</span>],
    ['منها منيو', <span className="tabular-nums" dir="ltr">{fmtMoney(p.fnbTotal)}</span>],
    ['مستحقّ عليه', <span className="tabular-nums" dir="ltr">{fmtMoney(p.unpaidTotal)}</span>],
    ['التشبس (تفاعل لا مال)', <span className="tabular-nums" dir="ltr">+{p.chipsEarned} / −{p.chipsSpent}</span>],
    ['تقييمه', p.feedbackAvg == null ? '—' : <span className="tabular-nums" dir="ltr">{p.feedbackAvg.toFixed(2)} من {p.feedbackCount} تقييم</span>],
    ['إشارات غش', <span className="tabular-nums">{fmtNum(p.cheatSignals)} (وزن {fmtNum(p.cheatWeight)})</span>],
    ['متابعون / يتابع', <span className="tabular-nums" dir="ltr">{p.followers} / {p.following}</span>],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_1fr] gap-6 p-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[12px] content-start">
        {kv.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500 whitespace-nowrap">{k}</dt>
            <dd className="text-gray-200 m-0">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="text-[10.5px] tracking-wider text-gray-500 font-semibold mb-3">سجلّ الحضور ({p.acts.length})</p>
        {p.acts.length === 0 ? (
          <p className="text-[12px] text-gray-600">لا فعاليّات في هذه النافذة.</p>
        ) : (
          <div className="relative pr-4 before:absolute before:right-[3px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-gray-700">
            {p.acts.map((a) => (
              <div key={a.id} className="relative pb-3 last:pb-0
                before:absolute before:right-[-16px] before:top-1.5 before:w-[7px] before:h-[7px] before:rounded-full before:bg-amber-500 before:ring-2 before:ring-gray-900">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="text-[11px] text-gray-500 tabular-nums" dir="ltr">{a.date || '—'}</span>
                  <span className="text-[12.5px] font-medium text-white">{a.name}</span>
                </div>
                <div className="flex gap-3 flex-wrap text-[11px] text-gray-400 mt-0.5">
                  <span>{a.location || '—'}</span>
                  <span className="tabular-nums" dir="ltr">{a.matches} مباراة</span>
                  <span className="tabular-nums" dir="ltr">{a.wins} فوز</span>
                  {a.spend > 0 && <span className="tabular-nums text-emerald-400" dir="ltr">منيو {a.spend.toFixed(2)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {p.matchesWithoutActivity > 0 && (
          <p className="text-[11px] text-rose-400 border-r-2 border-rose-500 pr-2.5 mt-3 leading-relaxed">
            {p.matchesWithoutActivity} مباراة في غرفةٍ أونلاين بلا فعاليّة مرتبطة — محسوبةٌ ضمن المباريات لا ضمن الحضور.
          </p>
        )}
      </div>
    </div>
  );
}
