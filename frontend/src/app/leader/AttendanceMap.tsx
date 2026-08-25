'use client';

// ══════════════════════════════════════════════════════
// 🗺️ خريطة الحضور — لوحةٌ معلّقة في كونسول الليدر
//
// زرٌّ في الرأس بجوار المقاعد والمراقبة، فلا يغادر الليدر شاشة اللعبة.
//
// 🔴 العمود الذي يحمل الصدق كلّه هو «آخر تحديث». التطبيق لا يُبلّغ في الخلفيّة
//    (إذن الخلفيّة يستدعي مراجعة متجر ولا نطلبه)، فنقطة من أغلق تطبيقه تتجمّد
//    حيث كان. بلا هذا العمود تصير الخريطة كاذبةً بثقة: النقطة الباهتة تعني
//    «هنا كان» لا «هنا هو».
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getSocket } from '@/lib/socket';

const VenueMap = dynamic(() => import('@/components/VenueMap'), { ssr: false });

// ── سُلّم الحالة ──
const CLR = {
  ok: '#3E9E72', far: '#C0392B', old: '#C98A2B', fake: '#8A0303', none: '#55504A',
};
const LBL: Record<string, string> = {
  ok: 'داخل', far: 'خارج', old: 'قديمة', fake: 'مزيَّف', none: 'بلا موقع',
};
/** قراءةٌ أقدم من خمس دقائق لم تعد تصف الآن. */
const STALE_MS = 5 * 60 * 1000;

export interface MapPlayer {
  physicalId: number; playerId: number | null; name: string; isAlive: boolean;
  lat: number | null; lng: number | null; accuracyM: number | null;
  isMocked: boolean; source: string | null; capturedAt: number | null; distanceM: number | null;
}

function statusOf(p: MapPlayer, radiusM: number, now: number): keyof typeof CLR {
  if (p.lat === null || p.capturedAt === null) return 'none';
  if (p.isMocked) return 'fake';
  if (now - p.capturedAt > STALE_MS) return 'old';
  if (p.distanceM === null) return 'none';
  const slack = Math.min(p.accuracyM ?? 0, 200);
  return p.distanceM <= radiusM + slack ? 'ok' : 'far';
}

const ago = (t: number | null, now: number) => {
  if (t === null) return 'لم يُبلّغ قطّ';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `قبل ${s} ث`;
  if (s < 3600) return `قبل ${Math.round(s / 60)} د`;
  return `قبل ${(s / 3600).toFixed(1)} س`;
};
const dist = (d: number | null) => d === null ? '—' : (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`);

export function AttendanceMapToggle({ roomId, label = '🗺️ الحضور' }: { roomId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [venue, setVenue] = useState<{ name: string; lat: number; lng: number; radiusM: number; enabled: boolean } | null>(null);
  const [players, setPlayers] = useState<MapPlayer[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!roomId) return;
    setLoading(true);
    getSocket().emit('geofence:map', { roomId }, (res: any) => {
      setLoading(false);
      if (!res?.success) return;
      setVenue(res.venue || null);
      setPlayers(res.players || []);
      setNow(Date.now());
    });
  }, [roomId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // نبضةٌ للعرض: الأوقات تتقدّم أمام العين بدل قفزةٍ عند كلّ تحديث
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    const r = setInterval(load, 45_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [open, load]);

  // ── قراءةٌ لحظيّة تصل من لاعبٍ فتح تطبيقه ──
  useEffect(() => {
    const s = getSocket();
    const onFix = (d: any) => {
      setPlayers(prev => prev.map(p => p.physicalId === d.physicalId ? {
        ...p, lat: d.lat, lng: d.lng, accuracyM: d.accuracyM, isMocked: d.isMocked,
        source: d.source, capturedAt: d.capturedAt, distanceM: d.distanceM,
      } : p));
      setNow(Date.now());
    };
    s.on('geofence:fix', onFix);
    return () => { s.off('geofence:fix', onFix); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const radiusM = venue?.radiusM ?? 200;

  const withStatus = useMemo(
    () => players.map(p => ({ ...p, st: statusOf(p, radiusM, now) })),
    [players, radiusM, now],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { ok: 0, far: 0, old: 0, fake: 0, none: 0 };
    withStatus.forEach(p => { c[p.st]++; });
    return c;
  }, [withStatus]);

  const shown = useMemo(
    () => withStatus
      .filter(p => !filter || p.st === filter)
      .sort((a, b) => (b.distanceM ?? -1) - (a.distanceM ?? -1)),   // الأبعد أوّلاً
    [withStatus, filter],
  );

  const dots = useMemo(
    () => shown.filter(p => p.lat !== null && p.lng !== null).map(p => ({
      id: p.physicalId, lat: p.lat!, lng: p.lng!,
      color: CLR[p.st], faded: p.st === 'old',
      label: `${p.physicalId} · ${p.name} · ${dist(p.distanceM)}`,
      onClick: () => setSel(s => s === p.physicalId ? null : p.physicalId),
    })),
    [shown],
  );

  const selP = withStatus.find(p => p.physicalId === sel) || null;

  return (
    <>
      <button onClick={() => setOpen(v => !v)}
        className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
          open ? 'border-[#C5A059] bg-[#C5A059]/12 text-[#C5A059]' : 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:text-white'
        }`}>
        {label}
        {counts.far + counts.fake > 0 && (
          <span className="mr-1.5 rounded-full px-1.5 py-[1px] text-[9px] font-black"
            style={{ background: 'rgba(192,57,43,.22)', color: '#E8756F' }}>
            {counts.far + counts.fake}
          </span>
        )}
      </button>

      {open && (
        <div data-attmap
          className="fixed bottom-4 right-4 z-[115] w-[min(96vw,44rem)] max-h-[84vh] flex flex-col rounded-2xl border border-[#C5A059]/30 bg-[#080808]/97 backdrop-blur-md shadow-2xl overflow-hidden"
          dir="rtl">

          {/* الرأس */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07] shrink-0">
            <span className="text-[13px]">🗺️</span>
            <b className="text-[13px] text-[#C5A059]">خريطة الحضور</b>
            <span className="text-[10.5px] text-zinc-500 truncate">
              {venue ? `${venue.name} · ${radiusM}م` : 'لم يُضبَط موقع المكان'}
            </span>
            <button onClick={load} className="mr-auto text-[10.5px] text-zinc-400 hover:text-white px-2">
              {loading ? '…' : '↻ تحديث'}
            </button>
            <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white text-sm px-1">✕</button>
          </div>

          {!venue && (
            <div className="px-3 py-2 text-[11px] border-b border-white/[0.07]"
              style={{ background: 'rgba(201,138,43,.1)', color: '#C98A2B' }}>
              ⚠️ لا نقطة لهذا المكان — المسافات غير محسوبة. اضبطها من كونسول المكان ← الموقع.
            </div>
          )}

          {/* المؤشّرات */}
          <div className="grid grid-cols-5 gap-1.5 px-3 py-2 border-b border-white/[0.07] shrink-0">
            {(['ok', 'far', 'old', 'none', 'fake'] as const).map(k => (
              <button key={k} onClick={() => { setFilter(f => f === k ? null : k); setSel(null); }}
                className={`rounded-lg px-1 py-1.5 text-center border transition-colors ${
                  filter === k ? 'bg-white/[0.07]' : 'border-transparent hover:bg-white/[0.03]'
                }`}
                style={{ borderColor: filter === k ? CLR[k] : undefined }}>
                <b className="block text-[17px] leading-none tabular-nums" style={{ color: CLR[k] }}>{counts[k]}</b>
                <span className="text-[9.5px] text-zinc-500">{LBL[k]}</span>
              </button>
            ))}
          </div>

          <div className="overflow-y-auto flex-1">
            {venue && (
              <div className="p-2.5">
                <VenueMap center={{ lat: venue.lat, lng: venue.lng }} radiusM={radiusM} dots={dots} height={230} />
              </div>
            )}

            {/* القائمة */}
            <div className="px-1 pb-2">
              {shown.length === 0 ? (
                <p className="text-center text-[11.5px] text-zinc-600 py-6">لا أحد في هذه الفئة</p>
              ) : shown.map(p => (
                <button key={p.physicalId}
                  onClick={() => setSel(s => s === p.physicalId ? null : p.physicalId)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-right transition-colors ${
                    sel === p.physicalId ? 'bg-[#C5A059]/10' : 'hover:bg-white/[0.03]'
                  } ${p.st === 'old' ? 'opacity-60' : ''}`}>
                  <span className="shrink-0 w-7 h-7 rounded-lg grid place-items-center text-[11.5px] font-mono text-zinc-400 border border-white/[0.07] bg-white/[0.04]">
                    {p.physicalId}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-semibold text-zinc-200 truncate">
                      {p.name}{!p.isAlive && <span className="text-zinc-600 text-[10px] mr-1">· مُقصى</span>}
                    </span>
                    <span className="block text-[10px] text-zinc-600 font-mono" dir="ltr">{ago(p.capturedAt, now)}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-mono tabular-nums" dir="ltr"
                    style={{ color: p.st === 'far' ? CLR.far : p.lat === null ? CLR.none : '#D8CDBB' }}>
                    {dist(p.distanceM)}
                  </span>
                  <span className="shrink-0 text-[9.5px] font-bold px-2 py-[3px] rounded-full border"
                    style={{ color: CLR[p.st], background: `${CLR[p.st]}1f`, borderColor: `${CLR[p.st]}55` }}>
                    {LBL[p.st]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* التفصيل */}
          {selP && (
            <div className="border-t border-white/[0.07] bg-black/40 px-3 py-2.5 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <b className="text-[13px] text-zinc-200">{selP.name}</b>
                <span className="text-[9.5px] font-bold px-2 py-[3px] rounded-full border"
                  style={{ color: CLR[selP.st], background: `${CLR[selP.st]}1f`, borderColor: `${CLR[selP.st]}55` }}>
                  {LBL[selP.st]}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  ['المسافة', dist(selP.distanceM)],
                  ['آخر تحديث', ago(selP.capturedAt, now)],
                  ['الدقّة', selP.accuracyM === null ? '—' : `±${selP.accuracyM} m`],
                  ['المصدر', selP.source || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg px-1.5 py-1.5 bg-white/[0.03] border border-white/[0.06]">
                    <span className="block text-[9px] text-zinc-600 mb-0.5">{k}</span>
                    <b className="block text-[11.5px] font-mono text-zinc-300 tabular-nums" dir="ltr">{v}</b>
                  </div>
                ))}
              </div>
              {(selP.st === 'far' || selP.st === 'none' || selP.st === 'fake') && (
                <p className="text-[10.5px] text-zinc-500 mt-2 leading-relaxed">
                  لإدخاله رغم ذلك: استعمل «إضافة لاعب» من لوحة المقاعد — السياج يمنع الانضمام
                  الذاتيّ وحده، وإضافتك أنت تمرّ دائماً.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
