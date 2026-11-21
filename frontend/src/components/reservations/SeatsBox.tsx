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
      {unpaid.length > 1 && !feeOnBill && (
        <button type="button" className="wa-btn send block" disabled={busy} onClick={() => pay({ all: true }, `تسجيل دفع ${v.due} د.أ عن ${unpaid.length} مقاعد؟`)}>
          ادفع عن الكلّ — <span className="ltr">{v.due}</span> د.أ
        </button>
      )}
    </div>
  );
}
