'use client';

// ══════════════════════════════════════════════════════
// 🗺️ مواقع اللاعبين — آخر موقعٍ مسجَّل لكلّ لاعب
//
// خلاف خريطة الليدر (المربوطة بغرفةٍ حيّة)، هذه تعرض الجميع بلا حاجةٍ للعبة —
// لمراجعة من كان أين ومتى.
//
// 🔴 عمود «آخر تحديث» ليس تفصيلاً: التطبيق لا يُبلّغ في الخلفيّة، فنقطة من أغلق
//    تطبيقه تتجمّد حيث كان. النقطة الباهتة تعني «هنا كان» لا «هنا هو» — وبلا
//    هذا العمود تصير الخريطة كاذبةً بثقة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

const VenueMap = dynamic(() => import('@/components/VenueMap'), {
  ssr: false,
  loading: () => <div className="h-[420px] rounded-xl bg-gray-900/40 border border-gray-800 grid place-items-center text-xs text-gray-600">تحميل الخريطة…</div>,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

const CLR = { ok: '#34d399', far: '#f87171', old: '#fbbf24', fake: '#dc2626', none: '#6b7280' };
const LBL: Record<string, string> = { ok: 'داخل', far: 'خارج', old: 'قديمة', fake: 'مزيَّف', none: 'بلا موقع' };
const STALE_MS = 30 * 60 * 1000;   // نصف ساعة — أوسع من خريطة الليدر لأنّ المدى هنا أيّام

interface Row {
  playerId: number; name: string; phone: string; isTest: boolean;
  lat: number; lng: number; accuracyM: number | null; isMocked: boolean;
  source: string | null; capturedAt: number; distanceM: number | null;
}
interface Venue { id: number; name: string; latitude: number | null; longitude: number | null; geofenceRadiusM: number }

const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `قبل ${s} ث`;
  if (s < 3600) return `قبل ${Math.round(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.round(s / 3600)} س`;
  return `قبل ${Math.round(s / 86400)} يوم`;
};
const dist = (d: number | null) => d === null ? '—' : (d >= 1000 ? `${(d / 1000).toFixed(1)} كم` : `${d} م`);

export default function PlayersMapPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  const load = useCallback(async (vid: number | null) => {
    setLoading(true); setErr('');
    try {
      const url = `${API_URL}/api/player/locations/map${vid ? `?locationId=${vid}` : ''}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'تعذّر التحميل');
      setVenues(d.venues || []);
      setRows(d.players || []);
      setNow(Date.now());
      // أوّل تحميل: اختر أوّل مكانٍ له نقطة كي تُحسب المسافات فوراً
      if (vid === null) {
        const first = (d.venues || []).find((v: Venue) => v.latitude !== null);
        if (first) { setVenueId(first.id); load(first.id); }
      }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(null); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const venue = venues.find(v => v.id === venueId) || null;
  const radiusM = venue?.geofenceRadiusM ?? 200;
  const hasPoint = !!(venue && venue.latitude !== null && venue.longitude !== null);

  const withStatus = useMemo(() => rows
    .filter(r => showTest || !r.isTest)
    .map(r => {
      let st: keyof typeof CLR;
      if (r.isMocked) st = 'fake';
      else if (now - r.capturedAt > STALE_MS) st = 'old';
      else if (!hasPoint || r.distanceM === null) st = 'none';
      else st = r.distanceM <= radiusM + Math.min(r.accuracyM ?? 0, 200) ? 'ok' : 'far';
      return { ...r, st };
    }), [rows, now, hasPoint, radiusM, showTest]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ok: 0, far: 0, old: 0, fake: 0, none: 0 };
    withStatus.forEach(r => { c[r.st]++; });
    return c;
  }, [withStatus]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return withStatus
      .filter(r => !filter || r.st === filter)
      .filter(r => !s || r.name?.toLowerCase().includes(s) || (r.phone || '').includes(s))
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }, [withStatus, filter, q]);

  const dots = useMemo(() => shown.map(r => ({
    id: r.playerId, lat: r.lat, lng: r.lng, color: CLR[r.st],
    faded: r.st === 'old',
    label: `${r.name} · ${dist(r.distanceM)} · ${ago(r.capturedAt, now)}`,
    onClick: () => setSel(s => s === r.playerId ? null : r.playerId),
  })), [shown, now]);

  const selRow = withStatus.find(r => r.playerId === sel) || null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="w-11 h-11 rounded-2xl grid place-items-center text-xl bg-emerald-500/10 border border-emerald-500/25">🗺️</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-white">مواقع اللاعبين</h1>
          <p className="text-xs text-gray-500 mt-0.5">آخر موقعٍ مسجَّل لكلّ لاعب — يُحدَّث عند كلّ فتحةٍ للتطبيق</p>
        </div>
        <button onClick={() => load(venueId)}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:text-white">
          {loading ? '…' : '↻ تحديث'}
        </button>
      </div>

      {err && <div className="mb-4 rounded-xl px-4 py-3 text-sm bg-rose-500/10 border border-rose-500/30 text-rose-300">{err}</div>}

      {/* المكان المرجع */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <span className="text-xs text-gray-500">قِس المسافة إلى:</span>
        {venues.filter(v => v.latitude !== null).map(v => (
          <button key={v.id} onClick={() => { setVenueId(v.id); load(v.id); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              venueId === v.id ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'border-gray-700/50 text-gray-400 hover:text-white'
            }`}>
            📍 {v.name} · {v.geofenceRadiusM}م
          </button>
        ))}
        {venues.filter(v => v.latitude !== null).length === 0 && (
          <span className="text-xs text-amber-400">
            ⚠️ لا مكان مضبوط الموقع بعد — اضبطه من «الأماكن والحسابات»، وبدونه لا تُحسب المسافات
          </span>
        )}
        <label className="mr-auto flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} className="accent-emerald-500" />
          حسابات الاختبار
        </label>
      </div>

      {/* المؤشّرات */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {(['ok', 'far', 'old', 'none', 'fake'] as const).map(k => (
          <button key={k} onClick={() => { setFilter(f => f === k ? null : k); setSel(null); }}
            className={`rounded-xl px-2 py-2.5 text-center border transition ${
              filter === k ? 'bg-white/[0.06]' : 'bg-gray-900/40 border-gray-800 hover:border-gray-700'
            }`}
            style={{ borderColor: filter === k ? CLR[k] : undefined }}>
            <b className="block text-xl leading-none tabular-nums" style={{ color: CLR[k] }}>{counts[k]}</b>
            <span className="text-[10px] text-gray-500">{LBL[k]}</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4 items-start">

        <div className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900/40">
          {hasPoint ? (
            <VenueMap center={{ lat: venue!.latitude!, lng: venue!.longitude! }} radiusM={radiusM} dots={dots} height={440} />
          ) : dots.length > 0 ? (
            <VenueMap center={{ lat: dots[0].lat, lng: dots[0].lng }} dots={dots} height={440} />
          ) : (
            <div className="h-[440px] grid place-items-center p-8">
              <div className="text-center max-w-md">
                <div className="text-4xl mb-3">📍</div>
                <p className="text-sm text-gray-400 mb-3 font-bold">لا موقع مسجَّل لأيّ لاعب بعد</p>
                <p className="text-[12px] text-gray-500 leading-relaxed text-right">
                  الموقع يُسجَّل حين <b className="text-gray-400">يفتح اللاعب التطبيق ويمنح الإذن</b> —
                  لا عند الحجز. تحقّق من:
                </p>
                <ul className="text-[12px] text-gray-500 leading-relaxed text-right mt-2 space-y-1.5 list-disc pr-4">
                  <li>هل فتح اللاعب <b className="text-gray-400">الويب</b>؟ نسخة الأندرويد المثبَّتة
                    بُنيت قبل هذه الميزة ولا تحوي الموقع إطلاقاً.</li>
                  <li>هل ظهرت له شاشة «نحتاج إذن موقعك» وضغط «تابع»؟</li>
                  <li>هل الإذن مرفوضٌ في إعدادات المتصفّح؟ الرفض لاصقٌ ولا يمكن إعادة سؤاله برمجيّاً.</li>
                </ul>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-gray-800 text-[11px] text-gray-500">
            {(['ok', 'far', 'old', 'fake'] as const).map(k => (
              <span key={k} className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CLR[k] }} />{LBL[k]}
              </span>
            ))}
            <span className="mr-auto">النقطة الباهتة = آخر موقعٍ معروف لا موقعٌ حاليّ</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم…"
              className="w-full bg-gray-900/60 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {shown.length === 0 ? (
              <p className="text-center text-xs text-gray-600 py-10">لا نتائج</p>
            ) : shown.map(r => (
              <button key={r.playerId} onClick={() => setSel(s => s === r.playerId ? null : r.playerId)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-right border-b border-gray-800/60 transition ${
                  sel === r.playerId ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'
                } ${r.st === 'old' ? 'opacity-60' : ''}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-gray-200 truncate">{r.name}</span>
                  <span className="block text-[10.5px] text-gray-600 font-mono" dir="ltr">{ago(r.capturedAt, now)}</span>
                </span>
                <span className="shrink-0 text-[12px] font-mono tabular-nums"
                  style={{ color: r.st === 'far' ? CLR.far : '#d1d5db' }}>{dist(r.distanceM)}</span>
                <span className="shrink-0 text-[10px] font-bold px-2 py-[3px] rounded-full border"
                  style={{ color: CLR[r.st], background: `${CLR[r.st]}1f`, borderColor: `${CLR[r.st]}55` }}>
                  {LBL[r.st]}
                </span>
              </button>
            ))}
          </div>

          {selRow && (
            <div className="border-t border-gray-800 bg-black/30 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <b className="text-sm text-white">{selRow.name}</b>
                <span className="text-[11px] text-gray-500 font-mono" dir="ltr">{selRow.phone}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['المسافة', dist(selRow.distanceM)],
                  ['آخر تحديث', ago(selRow.capturedAt, now)],
                  ['الدقّة', selRow.accuracyM === null ? '—' : `±${selRow.accuracyM} م`],
                  ['المصدر', selRow.source === 'app' ? 'تطبيق' : selRow.source === 'web' ? 'ويب' : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg px-2 py-1.5 bg-white/[0.03] border border-gray-800 text-center">
                    <span className="block text-[9.5px] text-gray-600 mb-0.5">{k}</span>
                    <b className="block text-[11.5px] font-mono text-gray-300 tabular-nums" dir="ltr">{v}</b>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-gray-600 mt-2 font-mono" dir="ltr">
                {selRow.lat.toFixed(6)}, {selRow.lng.toFixed(6)}
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-600 mt-4 leading-relaxed max-w-3xl">
        الموقع يُقرأ عند فتح اللاعب للتطبيق وعند عودته إليه — <b className="text-gray-400">ولا يُقرأ في الخلفيّة</b>.
        فمن أغلق تطبيقه تبقى نقطته حيث كان، و«آخر تحديث» هو ما يقول لك ذلك. والإحداثيّات تصل من جهاز
        اللاعب فهي غير موثوقةٍ تماماً — الموقع المزيَّف يُكشف على أندرويد وحده.
      </p>
    </div>
  );
}
