'use client';

// ══════════════════════════════════════════════════════
// 🎲 منتقي «لعبوا معنا» — أيّ الفعاليّات السابقة؟
// ══════════════════════════════════════════════════════
// الفعاليّات السابقة كثيرة، فالقائمة المنسدلة لا تصلح: هنا الأحدث أوّلاً مجمّعةً بالشهر،
// مع عدد من لعب في كلٍّ منها، وبحثٌ بالاسم أو المكان، وتصفيةٌ بالمكان، واختصارات
// «آخر فعاليّة / آخر ٣ / آخر ٥» (تحترم المكان المختار)، وزرّ «عرض الأقدم» بصفحات.
// المختار رقاقاتٌ فوق القائمة تُزال بلمسة. الخادم وحده يحسب الجمهور.

import { useCallback, useEffect, useMemo, useState } from 'react';

type Fetcher = (path: string, opts?: RequestInit) => Promise<any>;
interface PastAct { id: number; name: string; date: string; venue: string; locationId: number | null; played: number }
interface Loc { id: number; name: string; count: number }

const MAX = 60;   // = PLAYED_MAX_ACTIVITIES في الخادم
const TZ = 'Asia/Amman';
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('ar-JO', { month: 'long', year: 'numeric', timeZone: TZ });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ar-JO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });

export default function PlayedActivityPicker({ apiFetch, value, onChange }: {
  apiFetch: Fetcher;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [loc, setLoc] = useState<number | null>(null);
  const [list, setList] = useState<PastAct[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [known, setKnown] = useState<Map<number, PastAct>>(new Map());
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const remember = (rows: PastAct[]) => setKnown(prev => {
    const m = new Map(prev);
    for (const r of rows) m.set(r.id, r);
    return m;
  });

  const fetchPage = useCallback(async (before: string | null) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (qDebounced) qs.set('q', qDebounced);
      if (loc) qs.set('location', String(loc));
      if (before) qs.set('before', before);
      if (!before && value.length) qs.set('ids', value.join(','));
      const d = await apiFetch(`/api/whatsapp/open-window-broadcast/past-activities?${qs.toString()}`);
      const rows: PastAct[] = d.activities || [];
      setList(prev => before ? [...prev, ...rows] : rows);
      setNextBefore(d.nextBefore || null);
      if (!before) setLocs(d.locations || []);
      remember([...rows, ...(d.selected || [])]);
      setErr(null);
    } catch (e: any) { setErr(e.message || 'تعذّر تحميل الفعاليّات'); }
    setLoading(false);
    // value مقصودٌ خارج الاعتماديّات: الاختيار لا يعيد تحميل القائمة، و`ids` للتحميل الأوّل فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, qDebounced, loc]);

  useEffect(() => { fetchPage(null); }, [fetchPage]);

  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (id: number) => {
    if (selected.has(id)) onChange(value.filter(x => x !== id));
    else if (value.length < MAX) onChange([...value, id]);
  };
  const setMany = (ids: number[], on: boolean) => {
    if (on) onChange(Array.from(new Set([...value, ...ids])).slice(0, MAX));
    else { const drop = new Set(ids); onChange(value.filter(x => !drop.has(x))); }
  };

  const groups = useMemo(() => {
    const out: Array<{ month: string; items: PastAct[] }> = [];
    for (const a of list) {
      const m = monthOf(a.date);
      const g = out[out.length - 1];
      if (g && g.month === m) g.items.push(a); else out.push({ month: m, items: [a] });
    }
    return out;
  }, [list]);

  const chips = value.map(id => known.get(id)).filter(Boolean) as PastAct[];
  const chipBtn = 'px-2.5 py-1 rounded-lg text-[11.5px] font-bold border transition-colors';

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-gray-300">لعبوا معنا في أيٍّ من هذه الفعاليّات:</div>
        {value.length > 0 && (
          <button onClick={() => onChange([])} className="text-[11px] text-gray-500 hover:text-rose-300">مسح الاختيار</button>
        )}
      </div>

      {/* المختار */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(a => (
            <button key={a.id} onClick={() => toggle(a.id)} title="إزالة"
              className="px-2.5 py-1 rounded-lg text-[11.5px] border bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20">
              ✕ {a.name} · {dayOf(a.date)}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-amber-300/80">لم تختر فعاليّة بعد — اختر من القائمة أو من الاختصارات.</div>
      )}

      {/* اختصارات + بحث + أماكن */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 3, 5].map(n => (
          <button key={n} disabled={!list.length} onClick={() => onChange(list.slice(0, n).map(a => a.id))}
            className={`${chipBtn} border-gray-800 text-gray-300 hover:text-white disabled:opacity-40`}>
            {n === 1 ? 'آخر فعاليّة' : `آخر ${n}`}{loc ? ' هنا' : ''}
          </button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو المكان…"
          className="flex-1 min-w-[160px] bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-white outline-none focus:border-amber-500/40"
          style={{ fontSize: 16 }} aria-label="بحث في الفعاليّات السابقة" />
      </div>
      {locs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setLoc(null)}
            className={`${chipBtn} ${loc === null ? 'bg-teal-500/10 text-teal-300 border-teal-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>كلّ الأماكن</button>
          {locs.map(l => (
            <button key={l.id} onClick={() => setLoc(loc === l.id ? null : l.id)}
              className={`${chipBtn} ${loc === l.id ? 'bg-teal-500/10 text-teal-300 border-teal-500/40' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* القائمة مجمّعةً بالشهر */}
      <div className="max-h-[340px] overflow-y-auto rounded-lg border border-gray-900 divide-y divide-gray-900">
        {groups.map(g => {
          const ids = g.items.map(a => a.id);
          const allOn = ids.every(id => selected.has(id));
          return (
            <div key={g.month}>
              <div className="sticky top-0 z-10 flex items-center justify-between bg-gray-900/95 px-3 py-1.5">
                <span className="text-[11.5px] font-bold text-gray-400">{g.month}</span>
                <button onClick={() => setMany(ids, !allOn)} className="text-[11px] text-gray-500 hover:text-amber-300">
                  {allOn ? 'إلغاء الشهر' : 'اختر الشهر كلّه'}
                </button>
              </div>
              {g.items.map(a => {
                const on = selected.has(a.id);
                return (
                  <label key={a.id}
                    className={`flex items-center gap-3 px-3 min-h-[48px] py-2 cursor-pointer transition-colors ${on ? 'bg-amber-500/5' : 'hover:bg-gray-900/60'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(a.id)}
                      disabled={!on && value.length >= MAX} className="w-4 h-4 accent-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-bold truncate ${on ? 'text-amber-200' : 'text-white'}`}>{a.name}</div>
                      <div className="text-[11.5px] text-gray-500 truncate">{dayOf(a.date)}{a.venue ? ` · ${a.venue}` : ''}</div>
                    </div>
                    <span className="text-[11.5px] text-gray-400 shrink-0" title="عدد من لعب فيها">👥 {a.played}</span>
                  </label>
                );
              })}
            </div>
          );
        })}
        {!loading && list.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-gray-500">{err || 'لا فعاليّات سابقة لعب فيها أحد تطابق البحث.'}</div>
        )}
        {nextBefore && (
          <button onClick={() => fetchPage(nextBefore)} disabled={loading}
            className="w-full min-h-[44px] text-[12px] font-bold text-gray-400 hover:text-white disabled:opacity-50">
            {loading ? 'جارٍ التحميل…' : 'عرض الأقدم ↓'}
          </button>
        )}
        {loading && !nextBefore && list.length === 0 && <div className="px-3 py-6 text-center text-xs text-gray-500">جارٍ التحميل…</div>}
      </div>
      {value.length >= MAX && <div className="text-[11px] text-amber-300/80">الحدّ {MAX} فعاليّة في البثّ الواحد.</div>}
    </div>
  );
}
