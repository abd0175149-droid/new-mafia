'use client';

// ══════════════════════════════════════════════════════
// 🪑 مقاعد الحجز — لكلّ شخصٍ مقعدٌ بسعره وحالة دفعه (خطّة التوحيد م٥ · ق٥، ق١٨)
//   صاحب الحجز، والأصدقاء المسمَّون (بحسابٍ أو بلا حساب)، والمرافقون بلا اسم. «دفع» لكلّ مقعد،
//   و«ادفع عن الكلّ» حين يدفع صاحب الحجز عن مجموعته.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { Armchair } from 'lucide-react';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import { apiFetch } from '@/hooks/useReservations';

const KIND: Record<string, string> = { owner: 'صاحب الحجز', friend: 'صديق', companion: 'مرافق' };
const FREE: Record<string, string> = { loyalty: 'زيارة ولاء', group: 'بالعرض', free: 'مجّانيّ' };

export default function SeatsBox({ resId, feeOnBill, onChanged }: { resId: number; feeOnBill?: boolean; onChanged?: () => void }) {
  const [v, setV] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [nm, setNm] = useState({ name: '', phone: '' });
  const [naming, setNaming] = useState(false);
  const load = useCallback(async () => { try { setV(await apiFetch(`/api/reservations/${resId}/seats`)); } catch { setV(null); } }, [resId]);
  useEffect(() => { load(); }, [load]);
  if (!v || (v.people <= 1 && v.seats[0]?.pay !== 'unpaid')) return null;

  const pay = async (body: any, label: string) => {
    if (!(await swalConfirm(label, { confirmText: 'سجّل الدفع' }))) return;
    setBusy(true);
    try { await apiFetch(`/api/reservations/${resId}/seats/pay`, { method: 'POST', body: JSON.stringify(body) }); swalToast('سُجّل الدفع', 'success'); await load(); onChanged?.(); }
    catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };
  const unpaid = v.seats.filter((s: any) => s.pay === 'unpaid');
  const comps = v.seats.filter((s: any) => s.kind === 'companion').length;
  const nameOne = async () => {
    setBusy(true);
    try { const r = await apiFetch(`/api/reservations/${resId}/friends`, { method: 'POST', body: JSON.stringify(nm) }); swalToast(String(r.text || 'أُضيف').split('\n')[0], 'success'); setNm({ name: '', phone: '' }); setNaming(false); await load(); onChanged?.(); }
    catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };
  const sendJoin = async () => {
    if (!(await swalConfirm(`إرسال رسالة رمز الانضمام لصاحب الحجز على الواتساب؟
يحوّلها لمرافقيه (${comps})، وكلّ واحد يرسل الرمز من رقمه فيأخذ مقعده باسمه — والعرض يُعاد حسابه بالأسماء.`, { confirmText: 'أرسل' }))) return;
    setBusy(true);
    try { const r = await apiFetch(`/api/reservations/${resId}/join-code`, { method: 'POST', body: JSON.stringify({ send: true }) }); swalToast(r.sent ? 'أُرسلت الرسالة' : 'لا محادثة واتساب له — انسخ الرسالة من الطلب', r.sent ? 'success' : 'info'); if (!r.sent && r.message) navigator.clipboard?.writeText(r.message).catch(() => {}); }
    catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="res-seats">
      <div className="h"><Armchair />المقاعد <small className="ltr">{v.people}</small>{v.payer === 'owner' ? <small> · صاحب الحجز يدفع عن الكلّ</small> : null}</div>
      {feeOnBill && <p className="res-fine">الدخوليّة على فاتورة المقهى في هذه الفعاليّة — التحصيل من الكاشير.</p>}
      <ul>
        {v.seats.map((s: any) => (
          <li key={s.ref}>
            <span className="n">{s.name}<small> · {KIND[s.kind]}{s.kind === 'friend' ? (s.hasAccount ? ' بحساب' : ' بلا حساب') : ''}{s.status === 'booked' ? ' · لم يؤكّد' : s.status === 'pending' ? ' · لم يرتبط' : ''}</small></span>
            <span className={`p ${s.pay}`}>{s.pay === 'free' ? FREE[s.freeReason] || 'مجّانيّ' : s.pay === 'paid' ? <>مدفوع <span className="ltr">{s.paidAmount}</span></> : <><span className="ltr">{s.price}</span> د.أ</>}</span>
            {s.pay === 'unpaid' && !feeOnBill && (
              <button type="button" className="wa-btn ghost sm" disabled={busy} onClick={() => pay({ ref: s.kind === 'companion' ? 'companion' : s.ref }, `تسجيل دفع ${s.price} د.أ عن «${s.name}»؟`)}>دفع</button>
            )}
          </li>
        ))}
      </ul>
      {comps > 0 && (
        <div className="res-seats-acts">
          {!naming
            ? <button type="button" className="wa-btn ghost sm" disabled={busy} onClick={() => setNaming(true)}>سمِّ مرافقاً</button>
            : <span className="res-seats-name">
                <input className="wa-input" value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} placeholder="الاسم" />
                <input className="wa-input ltr" dir="ltr" inputMode="tel" value={nm.phone} onChange={(e) => setNm({ ...nm, phone: e.target.value })} placeholder="07XXXXXXXX" />
                <button type="button" className="wa-btn send sm" disabled={busy || nm.name.trim().length < 2 || nm.phone.trim().length < 9} onClick={nameOne}>أضف</button>
              </span>}
          <button type="button" className="wa-btn ghost sm" disabled={busy} onClick={sendJoin}>أرسل له رسالة الانضمام</button>
        </div>
      )}
      {unpaid.length > 1 && !feeOnBill && (
        <button type="button" className="wa-btn send block" disabled={busy} onClick={() => pay({ all: true }, `تسجيل دفع ${v.due} د.أ عن ${unpaid.length} مقاعد؟`)}>
          ادفع عن الكلّ — <span className="ltr">{v.due}</span> د.أ
        </button>
      )}
    </div>
  );
}
