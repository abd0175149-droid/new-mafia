'use client';

// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — اللوحات البصريّة
// كلُّ لوحةٍ هنا **مِقبضُ فلترة** لا زينة: الضغط عليها يغيّر العدسة نفسها
// (لا فلترةً محليّة) كي يبقى ما تراه هو ما يُصدَّر حرفيّاً.
// ══════════════════════════════════════════════════════

import { useMemo } from 'react';
import type { CohortRow, ExploreResult, Lens, Player } from './lib';
import { buildCohorts, fmtNum, pctOf } from './lib';

// ── بطاقة مؤشّر ──────────────────────────────────────
export function Kpi({ icon, label, value, sub, tone = 'gray' }: {
  icon: string; label: string; value: string | number; sub?: string;
  tone?: 'gold' | 'green' | 'red' | 'sky' | 'violet' | 'gray';
}) {
  const ring: Record<string, string> = {
    gold: 'text-amber-400', green: 'text-emerald-400', red: 'text-rose-400',
    sky: 'text-sky-400', violet: 'text-violet-400', gray: 'text-gray-200',
  };
  return (
    <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <span className="text-sm">{icon}</span>{label}
      </div>
      <div className={`text-2xl font-black mt-1 tabular-nums ${ring[tone]}`} dir="ltr">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── قمع التحويل ──────────────────────────────────────
// الضغط على درجةٍ يضبط «فعاليّات من = العتبة» في العدسة، فيتبعه الجدول والتصدير.
const FUNNEL_GATE: Record<string, number | null> = {
  signed: null, booked: null, attended: 1, returned: 2, regular: 3,
};

export function Funnel({ data, total, lens, onGate }: {
  data: ExploreResult['funnel']; total: number; lens: Lens; onGate: (min: number | null) => void;
}) {
  if (!data?.length) return null;
  return (
    <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl overflow-hidden">
      {data.map((s, i) => {
        const gate = FUNNEL_GATE[s.key];
        const active = gate !== null && gate !== undefined && lens.minActivities === gate;
        const prev = i ? data[i - 1].count : null;
        const drop = prev === null ? null : prev - s.count;
        return (
          <div key={s.key}>
            {drop !== null && drop > 0 && (
              <div className="px-4 pr-[172px] py-0.5">
                <span className="text-[10.5px] text-rose-400/80 flex items-center gap-1.5">
                  <i className="w-3 h-px bg-rose-400/50 inline-block" />−{fmtNum(drop)} تسرّبوا هنا
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onGate(active ? null : gate)}
              disabled={gate === null}
              aria-pressed={active}
              className={`w-full grid grid-cols-[150px_1fr_auto] items-center gap-4 px-4 py-2.5 text-right transition
                border-r-[3px] ${active ? 'bg-amber-500/10 border-amber-500' : 'border-transparent hover:bg-gray-800/40'}
                ${gate === null ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <span className={`text-[12.5px] ${active ? 'text-white font-semibold' : 'text-gray-300'}`}>{s.labelAr}</span>
              <span className="h-6 bg-gray-900/60 rounded overflow-hidden">
                <span className={`block h-full rounded transition-all ${active ? 'bg-amber-500' : 'bg-amber-500/35'}`}
                  style={{ width: `${total ? (s.count / total) * 100 : 0}%` }} />
              </span>
              <span className="flex items-baseline gap-2" dir="ltr">
                <b className="text-lg font-bold tabular-nums text-white min-w-[3ch] text-left">{fmtNum(s.count)}</b>
                <i className="not-italic text-[11px] text-gray-500 tabular-nums min-w-[4ch]">{s.pct}%</i>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── الوافل: مربّعٌ لكلّ لاعب ──────────────────────────
const BUCKETS: { label: string; cls: string; min: number; max: number }[] = [
  { label: 'لم يحضر', cls: 'bg-rose-500', min: 0, max: 0 },
  { label: 'فعاليّة واحدة', cls: 'bg-gray-600', min: 1, max: 1 },
  { label: 'فعاليّتان', cls: 'bg-amber-500/40', min: 2, max: 2 },
  { label: '٣ – ٤', cls: 'bg-amber-500/70', min: 3, max: 4 },
  { label: '٥ – ٩', cls: 'bg-amber-500', min: 5, max: 9 },
  { label: '١٠ فأكثر', cls: 'bg-amber-300', min: 10, max: 9999 },
];

export function Waffle({ players, lens, onRange, dimmed }: {
  players: Player[]; lens: Lens;
  onRange: (min: number | null, max: number | null) => void;
  dimmed: Set<number>;
}) {
  const ordered = useMemo(
    () => [...players].sort((a, b) => a.activities - b.activities || a.id - b.id), [players]);
  const bucketOf = (n: number) => BUCKETS.findIndex((b) => n >= b.min && n <= b.max);
  // شريحة «١٠ فأكثر» تُخزَّن بحدٍّ أعلى null لا 9999 — فالمقارنة تراعي الحالتين
  const activeBucket = BUCKETS.findIndex((b) =>
    lens.minActivities === b.min &&
    (b.max === 9999 ? lens.maxActivities === null : lens.maxActivities === b.max));

  return (
    <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-sm font-bold text-white">🧩 الفوج كاملاً</h3>
        <span className="text-[10.5px] text-gray-500 max-w-[46ch] leading-relaxed">
          مربّعٌ لكلّ لاعب — بلا أيّ مقياسٍ مضغوط. الباهت خارج البحث الحاليّ.
        </span>
      </div>
      <div className="grid gap-[3px] mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill, 11px)', justifyContent: 'space-between' }}>
        {ordered.map((p) => (
          <span key={p.id} title={`${p.name} — ${p.activities} فعاليّة`}
            className={`w-[11px] h-[11px] rounded-[2px] ${BUCKETS[bucketOf(p.activities)]?.cls || 'bg-gray-600'} ${dimmed.has(p.id) ? 'opacity-15' : ''}`} />
        ))}
        {!ordered.length && <span className="text-xs text-gray-600 col-span-full py-6 text-center">لا لاعبين</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-gray-700/30 pt-3">
        {BUCKETS.map((b, i) => {
          const n = players.filter((p) => p.activities >= b.min && p.activities <= b.max).length;
          const on = activeBucket === i;
          return (
            <button key={b.label} type="button" aria-pressed={on}
              onClick={() => onRange(on ? null : b.min, on ? null : (b.max === 9999 ? null : b.max))}
              className={`inline-flex items-center gap-1.5 text-[11px] rounded-full px-2.5 py-1 border transition
                ${on ? 'border-amber-500 bg-amber-500/15 text-white font-semibold' : 'border-transparent bg-gray-800/50 text-gray-300 hover:border-amber-500/50'}`}>
              <i className={`w-2.5 h-2.5 rounded-[2px] ${b.cls}`} />{b.label}
              <span className="tabular-nums text-gray-500">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── مصفوفة الاحتفاظ ──────────────────────────────────
function heat(pct: number): string {
  if (pct <= 0) return 'bg-gray-800/40 text-gray-600';
  if (pct < 10) return 'bg-amber-500/10 text-amber-200/70';
  if (pct < 25) return 'bg-amber-500/25 text-amber-100';
  if (pct < 50) return 'bg-amber-500/45 text-white';
  if (pct < 75) return 'bg-amber-500/70 text-black';
  return 'bg-amber-400 text-black';
}

export function CohortMatrix({ players }: { players: Player[] }) {
  const { rows, weeks } = useMemo(() => buildCohorts(players), [players]);
  if (!rows.length) return null;

  return (
    <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-sm font-bold text-white">📅 احتفاظ الأفواج</h3>
        <span className="text-[10.5px] text-gray-500 max-w-[52ch] leading-relaxed">
          صفٌّ لكلّ أسبوع تسجيل، وعمودٌ للأسبوع رقم N بعده. الخليّة = نسبة من حضر فعاليّةً في ذلك الأسبوع.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-[11px]">
          <thead>
            <tr>
              <th className="text-right text-gray-500 font-medium px-2 whitespace-nowrap">أسبوع التسجيل</th>
              <th className="text-gray-500 font-medium px-1.5 whitespace-nowrap">حجمه</th>
              {Array.from({ length: weeks }, (_, k) => (
                <th key={k} className="text-gray-500 font-medium px-1 tabular-nums w-11">أ{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: CohortRow) => (
              <tr key={r.week}>
                <td className="text-gray-400 px-2 tabular-nums whitespace-nowrap" dir="ltr">{r.week}</td>
                <td className="text-center text-gray-300 tabular-nums px-1.5">{r.size}</td>
                {Array.from({ length: weeks }, (_, k) => {
                  const c = r.cells[k];
                  if (!c) return <td key={k} className="bg-transparent" />;
                  return (
                    <td key={k}
                      title={`${c.count} من ${r.size}${c.censored ? ' · الأسبوع لم يكتمل بعد' : ''}`}
                      className={`text-center tabular-nums rounded px-1 py-1 ${heat(c.pct)} ${c.censored ? 'opacity-40 ring-1 ring-inset ring-gray-500/40' : ''}`}>
                      {c.pct}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-gray-500 mt-3 border-r-2 border-rose-500/60 pr-2.5 leading-relaxed">
        الخلايا المُعتَّمة أسابيعُ لم تكتمل بعد — نسبتُها منقوصةٌ بطبيعتها لا لضعفٍ في الاحتفاظ.
      </p>
    </div>
  );
}

// ── توزيع الأسابيع (تسجيلٌ ومصير) ────────────────────
export function SignupWeeks({ players }: { players: Player[] }) {
  const weeks = useMemo(() => {
    const m = new Map<string, { k: string; n: number; never: number; once: number; ret: number }>();
    players.forEach((p) => {
      const d = new Date(p.createdAt.slice(0, 10) + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      const k = d.toISOString().slice(0, 10);
      const b = m.get(k) || { k, n: 0, never: 0, once: 0, ret: 0 };
      b.n++;
      if (p.activities === 0) b.never++; else if (p.activities === 1) b.once++; else b.ret++;
      m.set(k, b);
    });
    return Array.from(m.values()).sort((a, b) => (a.k < b.k ? -1 : 1));
  }, [players]);

  if (weeks.length < 2) return null;
  const max = Math.max(...weeks.map((w) => w.n), 1);
  const h = (v: number) => Math.round((v / max) * 110);

  return (
    <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-sm font-bold text-white">📈 التسجيل أسبوعيّاً ومصيره</h3>
        <div className="flex gap-3 text-[10.5px] text-gray-400">
          <span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-amber-500 ml-1.5" />عاد</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-gray-600 ml-1.5" />مرّة واحدة</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-rose-500 ml-1.5" />لم يحضر</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-[160px]">
        {weeks.map((w) => (
          <div key={w.k} className="flex-1 flex flex-col justify-end gap-1.5 h-full"
            title={`${w.k} · ${w.n} تسجيل · عاد ${w.ret} · مرّة ${w.once} · لم يحضر ${w.never}`}>
            <span className="text-[10px] text-gray-500 text-center tabular-nums">{w.n}</span>
            <span className="flex flex-col justify-end gap-[2px]">
              {w.ret > 0 && <span className="bg-amber-500 rounded-[1px]" style={{ height: h(w.ret) }} />}
              {w.once > 0 && <span className="bg-gray-600 rounded-[1px]" style={{ height: h(w.once) }} />}
              {w.never > 0 && <span className="bg-rose-500 rounded-[1px]" style={{ height: h(w.never) }} />}
            </span>
            <span className="text-[9.5px] text-gray-500 text-center tabular-nums border-t border-gray-700/40 pt-1" dir="ltr">
              {w.k.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── شريط تحويلٍ صغير: الحجز مقابل الحضور ─────────────
export function ConversionStrip({ t }: { t: ExploreResult['totals'] }) {
  const bars: { label: string; value: number; of: number; cls: string; hint: string }[] = [
    { label: 'حجزوا وحضروا', value: t.bookings - t.noShows, of: t.bookings, cls: 'bg-emerald-500',
      hint: `${t.bookings - t.noShows} من ${t.bookings} حجزاً` },
    { label: 'حجزوا ولم يحضروا', value: t.noShows, of: t.bookings, cls: 'bg-rose-500',
      hint: `${t.noShowRate}٪ من الحجوزات` },
    { label: 'حضروا بلا حجز', value: t.walkIns, of: Math.max(t.activities, 1), cls: 'bg-sky-500',
      hint: `${pctOf(t.walkIns, t.activities)}٪ من مرّات الحضور` },
  ];
  return (
    <div className="bg-gray-800/20 border border-gray-700/30 rounded-2xl p-4">
      <h3 className="text-sm font-bold text-white mb-3">🎟️ الحجز مقابل الحضور</h3>
      <div className="space-y-2.5">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex justify-between text-[11.5px] mb-1">
              <span className="text-gray-300">{b.label}</span>
              <span className="text-gray-500 tabular-nums" dir="ltr">{fmtNum(b.value)} · {b.hint}</span>
            </div>
            <div className="h-2 bg-gray-900/60 rounded overflow-hidden">
              <div className={`h-full rounded ${b.cls}`} style={{ width: `${pctOf(b.value, b.of)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10.5px] text-gray-500 mt-3.5 border-r-2 border-gray-600 pr-2.5 leading-relaxed">
        الحضور يُشتقّ من سجلّ المباريات لا من وسم <span dir="ltr" className="font-mono">checked_in</span> —
        فذلك الحقل غير مُستعمَل عمليّاً في النظام.
      </p>
    </div>
  );
}
