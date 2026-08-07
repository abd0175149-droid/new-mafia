'use client';

// ══════════════════════════════════════════════════════
// 💰 الدخل والحصص — /venue/revenue
// متابعة الدخل المحصَّل وحصّتَي النادي والمكان بدقّة.
// 🔢 كل الأرقام من **لقطات بنود الطلبات** لا من أسعار المنيو الحاليّة —
//    فتعديل سعرٍ اليوم لا يغيّر تسوية الشهر الماضي.
// «محصَّل» = فاتورةٌ وُسمت مدفوعة؛ وما عداه مستحقّ لم يُقبض بعد.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { useVenue } from '../context';

interface ActivityRow {
  activityId: number; activityName: string; activityDate: string;
  gross: number; club: number; venue: number;
  ordersCount: number; playersCount: number;
  invoicesIssued: number; invoicesPaid: number;
  collected: number; outstanding: number; gameFeesCollected: number;
}
interface ItemRow { name: string; qty: number; gross: number; club: number; venue: number }
interface RevenueData {
  locationName: string;
  totals: {
    gross: number; club: number; venue: number; ordersCount: number;
    collected: number; outstanding: number; gameFeesCollected: number;
    invoicesIssued: number; invoicesPaid: number;
  };
  activities: ActivityRow[];
  topItems: ItemRow[];
}

const jod = (n: number) => `${n.toFixed(2)} د.أ`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const PRESETS = [
  { key: '7', label: 'آخر ٧ أيّام', days: 7 },
  { key: '30', label: 'آخر ٣٠ يوماً', days: 30 },
  { key: '90', label: 'آخر ٩٠ يوماً', days: 90 },
];

export default function VenueRevenuePage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'activities' | 'items'>('activities');

  const locParam = isHQ && locationId ? `&locationId=${locationId}` : '';

  const load = useCallback(() => {
    if (!locationId) return;
    setLoading(true); setErr('');
    fetch(`/api/venue/revenue?from=${from}&to=${to}${locParam}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); else setErr(d.error || 'فشل التحميل'); })
      .catch(() => setErr('خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, from, to]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (days: number) => {
    setFrom(iso(new Date(Date.now() - days * 864e5)));
    setTo(iso(new Date()));
  };

  if (!can('invoices.print')) {
    return <div className="text-center py-16 text-gray-500 text-sm">ليس لدى حسابك صلاحيّة الاطّلاع على الدخل</div>;
  }

  const t = data?.totals;
  // نسبة كل طرف من المبيعات — تُحسب هنا لا في الخادم (عرضٌ لا حقيقة)
  const clubPct = t && t.gross > 0 ? (t.club / t.gross) * 100 : 0;
  const venuePct = t && t.gross > 0 ? (t.venue / t.gross) * 100 : 0;
  const collectedPct = t && t.gross > 0 ? Math.min((t.collected / t.gross) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">💰 الدخل والحصص</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {data?.locationName ? `${data.locationName} • ` : ''}من لقطات الطلبات — لا تتأثّر بتعديل الأسعار لاحقاً
        </p>
      </div>

      {/* ── الفترة ── */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-3 space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p.days)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/5 border border-white/10 hover:border-emerald-500/40 transition-colors">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs" />
          <span className="text-gray-600 text-xs">←</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs" />
        </div>
      </div>

      {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : !data || data.activities.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">💰</div>
          <p className="text-gray-400 text-sm">لا مبيعات في هذه الفترة</p>
        </div>
      ) : (
        <>
          {/* ── الحصص ── */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-xs text-gray-400">مبيعات المنيو</span>
              <span className="text-lg font-bold tabular-nums">{jod(t!.gross)}</span>
            </div>

            {/* شريط الحصص */}
            <div className="flex h-8 rounded-lg overflow-hidden border border-white/10 mb-2">
              <div className="flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${Math.max(venuePct, 12)}%`, background: '#2563eb' }}>
                {venuePct.toFixed(0)}%
              </div>
              <div className="flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${Math.max(clubPct, 12)}%`, background: '#10b981' }}>
                {clubPct.toFixed(0)}%
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)' }}>
                <p className="text-[10px] text-blue-300">🏪 حصّة المكان</p>
                <p className="text-sm font-bold text-blue-400 tabular-nums">{jod(t!.venue)}</p>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <p className="text-[10px] text-emerald-300">💰 حصّة النادي</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{jod(t!.club)}</p>
              </div>
            </div>
            <p className="text-[9px] text-gray-600 mt-2">
              حصّة النادي = مجموع حصص الأصناف المباعة. فروق أسعار الخيارات تعود للمكان.
            </p>
          </div>

          {/* ── التحصيل ── */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-gray-400">التحصيل</span>
              <span className="text-[11px] text-gray-500">
                {t!.invoicesPaid}/{t!.invoicesIssued} فاتورة
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/5 overflow-hidden mb-2.5">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${collectedPct}%`, background: 'linear-gradient(90deg,#10b981,#0d9488)' }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg px-3 py-2 bg-emerald-500/[0.08] border border-emerald-500/20">
                <p className="text-[10px] text-emerald-300">✅ محصَّل</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{jod(t!.collected)}</p>
              </div>
              <div className="rounded-lg px-3 py-2 bg-amber-500/[0.08] border border-amber-500/20">
                <p className="text-[10px] text-amber-300">⏳ مستحقّ</p>
                <p className="text-sm font-bold text-amber-400 tabular-nums">{jod(t!.outstanding)}</p>
              </div>
            </div>
            {t!.gameFeesCollected > 0 && (
              <p className="text-[10px] text-gray-500 mt-2">
                🎮 منها رسوم لعبة محصَّلة عندك: <span className="text-gray-300 tabular-nums">{jod(t!.gameFeesCollected)}</span>
              </p>
            )}
          </div>

          {/* ── التفصيل ── */}
          <div className="flex gap-1.5">
            <button onClick={() => setTab('activities')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${tab === 'activities' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-gray-400 border-white/10'}`}>
              حسب الفعاليّة ({data.activities.length})
            </button>
            <button onClick={() => setTab('items')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${tab === 'items' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-gray-400 border-white/10'}`}>
              حسب الصنف ({data.topItems.length})
            </button>
          </div>

          {tab === 'activities' ? (
            <div className="space-y-2">
              {data.activities.map(a => (
                <div key={a.activityId} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.activityName}</p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(a.activityDate).toLocaleDateString('ar-JO', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' • '}{a.ordersCount} طلب • {a.playersCount} لاعب
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0">{jod(a.gross)}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] flex-wrap">
                    <span className="text-blue-400">🏪 {jod(a.venue)}</span>
                    <span className="text-emerald-400">💰 {jod(a.club)}</span>
                    <span className="text-gray-500">•</span>
                    <span className="text-emerald-300">✅ محصَّل {jod(a.collected)}</span>
                    {a.outstanding > 0 && <span className="text-amber-400">⏳ مستحقّ {jod(a.outstanding)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.07] overflow-hidden">
              <div className="flex text-[10px] text-gray-500 bg-white/[0.04] px-3 py-1.5">
                <span className="flex-1">الصنف</span>
                <span className="w-10 text-center">كمّية</span>
                <span className="w-16 text-left">مبيعات</span>
                <span className="w-16 text-left">المكان</span>
                <span className="w-16 text-left">النادي</span>
              </div>
              {data.topItems.map((it, i) => (
                <div key={i} className="flex text-xs px-3 py-2 border-t border-white/[0.05] items-center">
                  <span className="flex-1 min-w-0 truncate pl-1">{it.name}</span>
                  <span className="w-10 text-center tabular-nums text-gray-400">{it.qty}</span>
                  <span className="w-16 text-left tabular-nums">{it.gross.toFixed(2)}</span>
                  <span className="w-16 text-left tabular-nums text-blue-400">{it.venue.toFixed(2)}</span>
                  <span className="w-16 text-left tabular-nums text-emerald-400">{it.club.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
