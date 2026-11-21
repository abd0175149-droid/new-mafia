'use client';

// ══════════════════════════════════════════════════════
// 💸 العرض والولاء على هذا الحجز — في بطاقة الشخص (خطّة التوحيد م٤-ب)
//   ق٤: حجز الموظّف بالسعر العاديّ، و«طبّق عرضاً» يدويّاً بسببٍ يُكتب في سجلّ الحجز.
//   ق٦: زيارة الولاء من الباب — على صاحب الحجز وحده، و«أعدها له» يرجعها متاحة.
//   ق١٣: الزيارة حصريّة على الحجز كلّه: تطبيقها يزيل العرض المقفول.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { Gift, Tag, Undo2 } from 'lucide-react';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import { apiFetch } from '@/hooks/useReservations';
import { Field } from './Sheet';

export default function OfferLoyaltyBox({ resId, onChanged }: { resId: number; onChanged?: () => void }) {
  const [x, setX] = useState<any>(null);
  const [pick, setPick] = useState<number | 'none' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setX(await apiFetch(`/api/reservations/${resId}/extras`)); } catch { setX(null); }
  }, [resId]);
  useEffect(() => { setPick(null); setReason(''); load(); }, [load]);
  if (!x) return null;
  const hasOffers = x.offers?.length > 0;
  if (!x.lock && !hasOffers && !x.visit?.available && !x.visit?.applied) return null;

  const done = async (msg: string) => { swalToast(msg, 'success'); setPick(null); setReason(''); await load(); onChanged?.(); };
  const applyOffer = async () => {
    if (pick == null) return;
    setBusy(true);
    try {
      await apiFetch(`/api/reservations/${resId}/offer`, { method: 'POST', body: JSON.stringify({ promoId: pick === 'none' ? null : pick, reason }) });
      await done(pick === 'none' ? 'أُزيل العرض — بالسعر العاديّ' : 'طُبّق العرض');
    } catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };
  const visit = async (on: boolean) => {
    const ok = await swalConfirm(on
      ? `تطبيق زيارة الولاء المجّانيّة على صاحب الحجز؟${x.lock ? '\n\nالزيارة حصريّة على الحجز كلّه: يُزال السعر المبكّر عنه.' : ''}`
      : 'إعادة زيارة الولاء إليه؟ يعود دخوله بالسعر العاديّ وتبقى المكافأة متاحة له.', { confirmText: on ? 'طبّقها 🎟️' : 'أعدها له' });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/api/reservations/${resId}/loyalty-visit`, { method: 'POST', body: JSON.stringify({ on, reason: on ? 'طبّقها الموظّف عند الباب' : 'أعادها الموظّف' }) });
      await done(on ? 'طُبّقت زيارة الولاء' : 'أُعيدت الزيارة متاحة');
    } catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="res-offerbox">
      <div className="h"><Tag />العرض والولاء</div>
      {x.paid && <p className="res-fine">الحجز مدفوع — تعديل السعر من نافذة الدفع.</p>}
      <div className="row">
        <span>{x.visit?.applied ? '🎟️ زيارة ولاء — دخوله مجّاناً' : x.lock ? `💸 بسعر ${x.lock.unitPrice} د.أ للشخص` : 'بالسعر العاديّ'}</span>
      </div>
      {!x.paid && !x.visit?.applied && (hasOffers || x.lock) && (
        <>
          <div className="res-reasons" role="group" aria-label="العرض">
            {x.offers.map((o: any) => (
              <button key={o.id} type="button" className="wa-pill" aria-pressed={pick === o.id} disabled={x.lock?.promoId === o.id}
                onClick={() => setPick(pick === o.id ? null : o.id)}>طبّق «{o.name}» — {o.price} د.أ</button>
            ))}
            {x.lock && <button type="button" className="wa-pill" aria-pressed={pick === 'none'} onClick={() => setPick(pick === 'none' ? null : 'none')}>أزل العرض</button>}
          </div>
          {pick != null && (
            <>
              <Field value={reason} onChange={setReason} placeholder="السبب (إلزاميّ) — مثال: حجز بالهاتف قبل الموعد" />
              <button type="button" className="wa-btn send block" disabled={busy || !reason.trim()} onClick={applyOffer}>
                {pick === 'none' ? 'أزل العرض' : 'طبّق العرض'}
              </button>
            </>
          )}
        </>
      )}
      {!x.paid && x.visit?.available && !x.visit?.applied && (
        <button type="button" className="wa-btn ghost block" disabled={busy} onClick={() => visit(true)}>
          <Gift />عنده زيارة ولاء مجّانيّة — طبّقها
        </button>
      )}
      {x.visit?.applied && (
        <button type="button" className="wa-btn ghost block" disabled={busy} onClick={() => visit(false)}>
          <Undo2 />أعد زيارة الولاء إليه
        </button>
      )}
    </div>
  );
}
