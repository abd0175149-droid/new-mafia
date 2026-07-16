'use client';

// ══════════════════════════════════════════════════════
// 🧾 فواتير المنيو — /venue/invoices
// اختر الفعاليّة → لاعبون بطلبات → فاتورة A6 PDF لكل لاعب (عرض/حفظ/طباعة)
// الرقم التسلسليّ يثبت من أوّل إصدار؛ إعادة الطباعة لا تستهلك رقماً جديداً
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { useVenue } from '../context';

interface Candidate {
  playerId: number;
  playerName: string;
  ordersCount: number;
  ordersTotal: number;
  gameFee: number;
  grandTotal: number;
  invoiceNo: number | null;
  printedAt: string | null;
}

export default function VenueInvoicesPage() {
  const { locationId, authHeaders, can, isHQ } = useVenue();
  const [acts, setActs] = useState<{ id: number; name: string; date: string }[]>([]);
  const [actId, setActId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [gameFeeEnabled, setGameFeeEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (!locationId) return;
    fetch(withLoc('/api/venue/invoice-activities'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setActs(d.activities);
          if (d.activities.length > 0) setActId(d.activities[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const loadCandidates = useCallback(() => {
    if (!actId) { setCandidates([]); return; }
    setLoading(true);
    fetch(withLoc(`/api/venue/invoices/candidates?activityId=${actId}`), { headers: authHeaders })
      .then(r => r.json())
      .then(d => {
        if (d.success) { setCandidates(d.candidates); setGameFeeEnabled(d.gameFeeEnabled); }
        else flash(`❌ ${d.error || 'فشل التحميل'}`);
      })
      .catch(() => flash('❌ خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actId, locationId]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const openInvoice = async (c: Candidate) => {
    if (!actId) return;
    setBusyId(c.playerId);
    try {
      const r = await fetch(withLoc(`/api/venue/invoices/${actId}/${c.playerId}/pdf`), { method: 'POST', headers: authHeaders });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        flash(`❌ ${(d as any).error || 'فشل توليد الفاتورة'}`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      loadCandidates(); // تحديث رقم الفاتورة وختم الطباعة
    } catch { flash('❌ خطأ في الاتصال'); }
    finally { setBusyId(null); }
  };

  if (!can('invoices.print')) {
    return <div className="text-center py-16 text-gray-500 text-sm">ليس لدى حسابك صلاحيّة طباعة الفواتير</div>;
  }

  const totals = candidates.reduce((s, c) => ({ orders: s.orders + c.ordersTotal, grand: s.grand + c.grandTotal }), { orders: 0, grand: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold">🧾 الفواتير</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">فاتورة A6 لكل لاعب — تُعرض PDF ويمكن حفظها أو طباعتها</p>
        </div>
        <select
          value={actId ?? ''}
          onChange={e => setActId(parseInt(e.target.value) || null)}
          className="bg-gray-800 border border-gray-700 rounded-lg text-xs px-3 py-2 max-w-[220px]"
        >
          {acts.length === 0 && <option value="">لا فعاليّات مفعَّلة المنيو مؤخّراً</option>}
          {acts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} — {new Date(a.date).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      {gameFeeEnabled && (
        <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          💰 رسوم اللعبة مفعَّلة لهذه الفعاليّة — تُضاف تلقائيّاً لفاتورة من لم يدفع حجزه (تحصيلها يبقى عبر صفحة الحجوزات)
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">🧾</div>
          <p className="text-gray-400 text-sm">لا طلبات في هذه الفعاليّة بعد</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {candidates.map(c => (
              <div key={c.playerId} className="rounded-xl p-3.5 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">{c.playerName}</p>
                    {c.invoiceNo != null && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shrink-0">
                        فاتورة #{c.invoiceNo}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {c.ordersCount} {c.ordersCount === 1 ? 'طلب' : 'طلبات'} • طلبات {c.ordersTotal.toFixed(2)}
                    {c.gameFee > 0 && <span className="text-amber-400/90"> + رسوم لعبة {c.gameFee.toFixed(2)}</span>}
                  </p>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-emerald-400 text-sm font-bold">{c.grandTotal.toFixed(2)} د.أ</p>
                </div>
                <button
                  onClick={() => openInvoice(c)}
                  disabled={busyId === c.playerId}
                  className="shrink-0 text-[11px] px-3 py-2 rounded-lg font-bold bg-gradient-to-l from-emerald-500 to-teal-600 text-white disabled:opacity-50"
                >
                  {busyId === c.playerId ? '⏳…' : c.invoiceNo != null ? '🖨️ إعادة طباعة' : '🧾 فاتورة PDF'}
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-3.5 flex items-center justify-between"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span className="text-gray-300 text-xs">إجماليّ الفعاليّة ({candidates.length} لاعباً)</span>
            <span className="text-emerald-400 text-sm font-bold">
              {totals.grand.toFixed(2)} د.أ
              {totals.grand !== totals.orders && <span className="text-[10px] text-gray-500 font-normal"> (طلبات {totals.orders.toFixed(2)})</span>}
            </span>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 border border-emerald-500/30 rounded-xl px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
