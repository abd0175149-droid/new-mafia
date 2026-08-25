'use client';

// ══════════════════════════════════════════════════════
// 📍 موقع المكان — نقطة السياج ونصف قطره
//
// 🔴 لماذا يدويّاً لا من رابط الخرائط: الرابط المختصر يحمل زوجَي إحداثيّات —
//    `@lat,lng` مركزُ عرض الخريطة، و`!3d…!4d…` الدبّوس — ويفترقان ٢٤٥ متراً في
//    أحد مكانينا، أي أكثر من نصف قطرٍ كامل. ودبّوس Google أصلاً ليس بابك
//    بالضرورة، بل ما وضعه أوّل من أضاف النشاط. المصدر الوحيد الموثوق هو من
//    يقف على الباب ويضغط «خذ موقعي الحاليّ».
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useVenue } from '../context';
import { EM, MONO } from '../ember';
import { useGeolocation } from '@/hooks/useGeolocation';

// MapLibre يلمس window عند التحميل — لا تُصيَّر على الخادم
const VenueMap = dynamic(() => import('@/components/VenueMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 380, borderRadius: 12, background: EM.card, border: `1px solid ${EM.line}` }}
      className="grid place-items-center text-xs" >
      <span style={{ color: EM.faint }}>تحميل الخريطة…</span>
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function VenueLocationPage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const geo = useGeolocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const [name, setName] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(200);
  const [setByName, setSetByName] = useState('');
  const [setAt, setSetAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const locParam = isHQ && locationId ? `?locationId=${locationId}` : '';
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/api/venue/location${locParam}`, { headers: authHeaders });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'تعذّر التحميل');
      const L = d.location;
      setName(L.name || '');
      setMapUrl(L.mapUrl || '');
      setLat(L.latitude === null ? null : parseFloat(L.latitude));
      setLng(L.longitude === null ? null : parseFloat(L.longitude));
      setRadius(L.geofenceRadiusM ?? 200);
      setSetByName(L.setByName || '');
      setSetAt(L.geofenceSetAt || null);
      setDirty(false);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  const useMyPosition = async () => {
    const f = await geo.read();
    if (!f) return;
    setLat(f.lat); setLng(f.lng); setDirty(true);
    flash(`أُخذ موقعك · دقّة ±${f.accuracyM ?? '؟'} م`);
  };

  const save = async () => {
    if (lat === null || lng === null) { setErr('حدّد النقطة أوّلاً'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/api/venue/location${locParam}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ latitude: lat, longitude: lng, geofenceRadiusM: radius }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'تعذّر الحفظ');
      flash('حُفظ موقع المكان');
      setDirty(false);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!can('location.geofence')) {
    return <div className="p-6 text-center text-sm" style={{ color: EM.dim }}>
      ليس لدى حسابك صلاحيّة ضبط موقع المكان
    </div>;
  }

  const center = lat !== null && lng !== null ? { lat, lng } : null;

  return (
    <div className="px-3 pb-24 pt-3 max-w-3xl mx-auto" dir="rtl">

      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0"
          style={{ background: 'rgba(37,192,138,0.14)', border: `1px solid ${EM.line2}` }}>📍</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate" style={{ color: EM.text }}>موقع {name || 'المكان'}</h1>
          <p className="text-[10.5px]" style={{ color: EM.faint }}>
            نقطة السياج — يُمنع الدخول والطلب خارج دائرتها حين يُفعَّل السياج على الفعاليّة
          </p>
        </div>
      </div>

      {/* حالة الضبط */}
      <div className="rounded-xl px-3 py-2.5 mb-3 text-[11.5px] flex items-center gap-2 flex-wrap"
        style={{
          background: center ? 'rgba(37,192,138,0.08)' : 'rgba(217,138,43,0.09)',
          border: `1px solid ${center ? 'rgba(37,192,138,0.3)' : 'rgba(217,138,43,0.32)'}`,
          color: center ? EM.go : EM.warm,
        }}>
        {center ? '✓ الموقع مضبوط' : '⚠️ لم يُضبَط موقع هذا المكان بعد — لا يمكن تفعيل السياج على أيّ فعاليّة قبله'}
        {setAt && (
          <span className="mr-auto" style={{ color: EM.faint, fontFamily: MONO }}>
            {setByName ? `${setByName} · ` : ''}{new Date(setAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-xs" style={{ color: EM.faint }}>تحميل…</div>
      ) : (
        <>
          <VenueMap
            center={center}
            radiusM={radius}
            draggablePin
            onPinMove={(la, ln) => { setLat(la); setLng(ln); setDirty(true); }}
            onMapClick={(la, ln) => { setLat(la); setLng(ln); setDirty(true); }}
            height={380}
          />
          <p className="text-[10.5px] mt-1.5 mb-3" style={{ color: EM.faint }}>
            اسحب الدبّوس إلى باب المكان بالضبط — أو قف على الباب واضغط «خذ موقعي الحاليّ».
          </p>

          {/* الأدوات */}
          <div className="rounded-2xl p-3.5 mb-3" style={{ background: EM.card, border: `1px solid ${EM.line}` }}>
            <button onClick={useMyPosition} disabled={geo.busy}
              className="w-full py-2.5 rounded-xl text-[12.5px] font-bold mb-3 disabled:opacity-50"
              style={{ background: 'rgba(37,192,138,0.14)', border: '1px solid rgba(37,192,138,0.35)', color: EM.go }}>
              {geo.busy ? 'يقرأ موقعك…' : '📡 خذ موقعي الحاليّ (الأدقّ)'}
            </button>
            {geo.error && <p className="text-[11px] mb-3" style={{ color: EM.hot }}>{geo.error}</p>}

            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <label className="block">
                <span className="text-[10.5px] block mb-1" style={{ color: EM.faint }}>خط العرض</span>
                <input type="number" step="0.000001" value={lat ?? ''} dir="ltr"
                  onChange={e => { setLat(e.target.value === '' ? null : parseFloat(e.target.value)); setDirty(true); }}
                  className="w-full rounded-lg px-2 py-1.5 text-[12.5px] outline-none"
                  style={{ background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text, fontFamily: MONO }} />
              </label>
              <label className="block">
                <span className="text-[10.5px] block mb-1" style={{ color: EM.faint }}>خط الطول</span>
                <input type="number" step="0.000001" value={lng ?? ''} dir="ltr"
                  onChange={e => { setLng(e.target.value === '' ? null : parseFloat(e.target.value)); setDirty(true); }}
                  className="w-full rounded-lg px-2 py-1.5 text-[12.5px] outline-none"
                  style={{ background: EM.ink, border: `1px solid ${EM.line2}`, color: EM.text, fontFamily: MONO }} />
              </label>
            </div>

            <label className="block mb-1">
              <span className="text-[10.5px] block mb-1.5" style={{ color: EM.faint }}>
                نصف قطر السياج — <b style={{ color: EM.text, fontFamily: MONO }}>{radius} م</b>
              </span>
              <input type="range" min={50} max={1000} step={10} value={radius}
                onChange={e => { setRadius(parseInt(e.target.value)); setDirty(true); }}
                className="w-full" style={{ accentColor: EM.go }} />
            </label>
            <p className="text-[10.5px]" style={{ color: EM.faint }}>
              ٢٠٠م افتراضٌ معقول: دقّة GPS داخل مقهىً مسقوف وحدها قد تتجاوز ٨٠م، فنصف قطرٍ ضيّق
              يرفض جالساً على الطاولة.
            </p>
          </div>

          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="block text-center text-[11px] underline mb-3" style={{ color: EM.cool }}>
              افتح رابط الخرائط المحفوظ للمقارنة ↗
            </a>
          )}

          {err && (
            <div className="rounded-xl px-3 py-2 mb-3 text-[11.5px]"
              style={{ background: 'rgba(224,73,43,0.1)', border: '1px solid rgba(224,73,43,0.3)', color: EM.hot }}>
              {err}
            </div>
          )}

          <button onClick={save} disabled={saving || !dirty || lat === null || lng === null}
            className="w-full py-3 rounded-xl text-[13px] font-black disabled:opacity-40"
            style={{ background: EM.go, color: EM.ink }}>
            {saving ? 'يحفظ…' : dirty ? 'احفظ الموقع' : 'لا تغييرات'}
          </button>
        </>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-[12px] font-bold z-50"
          style={{ background: EM.ink2, border: `1px solid ${EM.line2}`, color: EM.text }}>
          {toast}
        </div>
      )}
    </div>
  );
}
