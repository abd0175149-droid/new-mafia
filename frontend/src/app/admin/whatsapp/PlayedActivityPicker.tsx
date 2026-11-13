'use client';

// ══════════════════════════════════════════════════════
// 🎲 منتقي «لعبوا معنا» — أيّ الفعاليّات السابقة؟
// ══════════════════════════════════════════════════════
// الفعاليّات السابقة كثيرة، فالقائمة المنسدلة لا تصلح: هنا الأحدث أوّلاً مجمّعةً بالشهر،
// مع عدد من لعب في كلٍّ منها، وبحثٌ بالاسم أو المكان، وتصفيةٌ بالمكان، واختصارات
// «آخر فعاليّة / آخر ٣ / آخر ٥» (تحترم المكان المختار)، وزرّ «عرض الأقدم» بصفحات.
// المختار رقاقاتٌ فوق القائمة تُزال بلمسة. الخادم وحده يحسب الجمهور.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, Users, X } from 'lucide-react';
import { Chip } from './wa-ui';

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
  const small = { font: '500 12px/16px var(--font-sans)' } as const;

  return (
    <div className="wa-card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b style={{ font: '700 14px/20px var(--font-sans)' }}>لعبوا معنا في أيٍّ من هذه الفعاليّات:</b>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="wa-btn ghost sm">مسح الاختيار</button>
        )}
      </div>

      {/* المختار */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map(a => (
            <button type="button" key={a.id} onClick={() => toggle(a.id)} title="إزالة" className="wa-chip" aria-pressed="true">
              <X className="s" aria-hidden /> {a.name} · {dayOf(a.date)}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ ...small, color: 'var(--warn)' }}>لم تختر فعاليّة بعد — اختر من القائمة أو من الاختصارات.</div>
      )}

      {/* اختصارات + بحث + أماكن */}
      <div className="flex flex-wrap items-center gap-2">
        {[1, 3, 5].map(n => (
          <button type="button" key={n} disabled={!list.length} onClick={() => onChange(list.slice(0, n).map(a => a.id))}
            className="wa-chip" style={!list.length ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            {n === 1 ? 'آخر فعاليّة' : `آخر ${n}`}{loc ? ' هنا' : ''}
          </button>
        ))}
        <div className="wa-search grow" style={{ minWidth: 160 }}>
          <Search aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو المكان…"
            className="wa-input" aria-label="بحث في الفعاليّات السابقة" />
        </div>
      </div>
      {locs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip on={loc === null} onClick={() => setLoc(null)}>كلّ الأماكن</Chip>
          {locs.map(l => (
            <Chip key={l.id} on={loc === l.id} onClick={() => setLoc(loc === l.id ? null : l.id)}>{l.name}</Chip>
          ))}
        </div>
      )}

      {/* القائمة مجمّعةً بالشهر */}
      <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
        {groups.map(g => {
          const ids = g.items.map(a => a.id);
          const allOn = ids.every(id => selected.has(id));
          return (
            <div key={g.month}>
              <div className="wa-grouphead" style={{ justifyContent: 'space-between', paddingInline: 'var(--space-3)', background: 'var(--bg-200)' }}>
                <span className="muted">{g.month}</span>
                <button type="button" onClick={() => setMany(ids, !allOn)} className="wa-btn ghost sm">
                  {allOn ? 'إلغاء الشهر' : 'اختر الشهر كلّه'}
                </button>
              </div>
              {g.items.map(a => {
                const on = selected.has(a.id);
                return (
                  <label key={a.id} className="row"
                    style={{ gap: 'var(--space-3)', minHeight: 52, padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: on ? 'var(--gold-soft)' : undefined }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(a.id)}
                      disabled={!on && value.length >= MAX} style={{ width: 18, height: 18, accentColor: 'var(--gold)', flex: 'none' }} />
                    <div className="grow">
                      <div className="trunc" style={{ font: '700 14px/20px var(--font-sans)', color: on ? 'var(--gold)' : 'var(--ink)' }}>{a.name}</div>
                      <div className="trunc muted" style={{ font: '400 13px/18px var(--font-sans)' }}>{dayOf(a.date)}{a.venue ? ` · ${a.venue}` : ''}</div>
                    </div>
                    <span className="row muted" style={{ gap: 4, flex: 'none' }} title="عدد من لعب فيها"><Users className="s" aria-hidden /><span className="ltr">{a.played}</span></span>
                  </label>
                );
              })}
            </div>
          );
        })}
        {!loading && list.length === 0 && (
          <div className="muted" style={{ ...small, padding: 'var(--space-6) var(--space-3)', textAlign: 'center' }}>{err || 'لا فعاليّات سابقة لعب فيها أحد تطابق البحث.'}</div>
        )}
        {nextBefore && (
          <button type="button" onClick={() => fetchPage(nextBefore)} disabled={loading} className="wa-btn ghost block">
            {loading ? 'جارٍ التحميل…' : <>عرض الأقدم <ChevronDown aria-hidden /></>}
          </button>
        )}
        {loading && !nextBefore && list.length === 0 && <div className="muted" style={{ ...small, padding: 'var(--space-6) var(--space-3)', textAlign: 'center' }}>جارٍ التحميل…</div>}
      </div>
      {value.length >= MAX && <div style={{ ...small, color: 'var(--warn)' }}>الحدّ <span className="ltr">{MAX}</span> فعاليّة في البثّ الواحد.</div>}
    </div>
  );
}
