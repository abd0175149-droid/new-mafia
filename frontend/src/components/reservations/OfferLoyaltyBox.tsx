'use client';

// ══════════════════════════════════════════════════════
// 💸 العرض والولاء على هذا الحجز — في بطاقة الشخص (خطّة التوحيد م٤-ب)
//   ق٤: حجز الموظّف بالسعر العاديّ، و«طبّق عرضاً» يدويّاً بسببٍ يُكتب في سجلّ الحجز.
//   ق٦: زيارة الولاء من الباب — على صاحب الحجز وحده، و«أعدها له» يرجعها متاحة.
//   ق١٣: الزيارة حصريّة على الحجز كلّه: تطبيقها يزيل العرض المقفول.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Gift, Tag, Undo2 } from 'lucide-react';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import { apiFetch, withCapChoice } from '@/hooks/useReservations';
import { Field } from './Sheet';

export default function OfferLoyaltyBox({ resId, onChanged }: { resId: number; onChanged?: () => void }) {
  const [x, setX] = useState<any>(null);
  const [pick, setPick] = useState<number | 'none' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // 🔀 م٦: الدفع والنقل والسعر اليدويّ من بطاقة الشخص
  const [moveOpen, setMoveOpen] = useState(false);
  const [acts, setActs] = useState<any[]>([]);
  const [moveTo, setMoveTo] = useState('');
  const [priceOpen, setPriceOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [priceWhy, setPriceWhy] = useState('');
  const me = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isAdmin = me?.role === 'admin';
  const load = useCallback(async () => {
    try { setX(await apiFetch(`/api/reservations/${resId}/extras`)); } catch { setX(null); }
  }, [resId]);
  useEffect(() => { setPick(null); setReason(''); setMoveOpen(false); setPriceOpen(false); load(); }, [load]);
  if (!x) return null;
  const hasOffers = x.offers?.length > 0;

  const openMove = async () => {
    setMoveOpen(!moveOpen);
    if (!acts.length) {
      try {
        const r: any = await apiFetch('/api/activities');
        const list = (Array.isArray(r) ? r : r?.activities || []).filter((a: any) => ['planned', 'active'].includes(a.status) && Number(a.id) !== Number(x.activityId)
          && new Date(a.date).getTime() > Date.now() - 6 * 3600e3).sort((p: any, q: any) => new Date(p.date).getTime() - new Date(q.date).getTime()).slice(0, 20);
        setActs(list); if (list[0]) setMoveTo(String(list[0].id));
      } catch { /* بلا قائمة */ }
    }
  };
  const move = async () => {
    if (!moveTo) return;
    const a = acts.find((z) => String(z.id) === moveTo);
    if (!(await swalConfirm(`نقل الحجز إلى «${a?.name || ''}»؟\nيُنقل معه مقعده في التطبيق، ويُعاد تقييم السعر المبكّر، وتصله رسالة تثبيت للموعد الجديد.`, { confirmText: 'انقل' }))) return;
    setBusy(true);
    try {
      await withCapChoice((extra) => apiFetch(`/api/reservations/${resId}/move`, { method: 'POST', body: JSON.stringify({ toActivityId: Number(moveTo), ...extra }) }));
      swalToast('نُقل الحجز', 'success'); onChanged?.();
    } catch (e: any) { if (!e?.cancelled) swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };
  const setManual = async (clear: boolean) => {
    setBusy(true);
    try {
      await apiFetch(`/api/reservations/${resId}/price`, { method: 'POST', body: JSON.stringify({ price: clear ? null : Number(price), reason: priceWhy || (clear ? 'أُعيد للسعر العاديّ' : '') }) });
      setPriceOpen(false); setPrice(''); setPriceWhy('');
      await done(clear ? 'عاد للسعر العاديّ' : 'حُفظ السعر اليدويّ');
    } catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };

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
      <div className="h"><Tag />المال والعروض</div>
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

      {/* 💵 الدفع — صفّ حجز صاحبه (المرافقون بلا صفوف مالٍ حتّى م٥) */}
      <div className="row">
        <span>المتوقَّع <span className="ltr">{x.expected}</span> د.أ{x.people > 1 ? ` (${x.people} أشخاص)` : ''} · {x.pay?.isFree ? 'مجّانيّ' : x.pay?.isPaid ? <>مدفوع <span className="ltr">{x.pay.paidAmount}</span> د.أ</> : 'غير مدفوع'}</span>
      </div>
      {/* 💵 الدفع لكلّ مقعد في «المقاعد» أعلاه (م٥) */}
      {x.feeOnBill && x.pay && !x.pay.isPaid && !x.pay.isFree && <p className="res-fine">الدخوليّة على فاتورة المقهى أيضاً — ما يُسجَّل هنا لا يُحمَّل على الفاتورة.</p>}

      {/* 🔀 النقل لفعاليّةٍ أخرى */}
      <button type="button" className="wa-btn ghost block" disabled={busy} onClick={openMove}><ArrowLeftRight />انقل لفعاليّةٍ أخرى</button>
      {moveOpen && (
        <>
          <select className="wa-input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="الفعاليّة">
            {acts.map((a) => <option key={a.id} value={a.id}>{a.name} — {new Date(a.date).toLocaleDateString('ar-JO', { timeZone: 'Asia/Amman', weekday: 'long', day: 'numeric', month: 'numeric' })}</option>)}
          </select>
          <button type="button" className="wa-btn send block" disabled={busy || !moveTo} onClick={move}>انقل الحجز</button>
        </>
      )}

      {/* 💵 سعرٌ يدويّ — للأدمن وحده، بسبب */}
      {isAdmin && !x.paid && !x.visit?.applied && (
        !priceOpen
          ? <button type="button" className="wa-btn ghost block" disabled={busy} onClick={() => setPriceOpen(true)}>سعرٌ يدويّ للشخص</button>
          : <>
              <Field value={price} onChange={setPrice} placeholder="السعر للشخص (د.أ)" dir="ltr" inputMode="numeric" />
              <Field value={priceWhy} onChange={setPriceWhy} placeholder="السبب (إلزاميّ)" />
              <button type="button" className="wa-btn send block" disabled={busy || price === '' || !priceWhy.trim()} onClick={() => setManual(false)}>احفظ السعر</button>
              {x.lock && <button type="button" className="wa-btn ghost block" disabled={busy} onClick={() => setManual(true)}>أعده للسعر العاديّ</button>}
            </>
      )}
    </div>
  );
}
