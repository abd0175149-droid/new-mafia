'use client';

// ══════════════════════════════════════════════════════
// 🪑 السعة وقائمة الانتظار — أعلى المتابعة (خطّة التوحيد م٥ج · ق١، ق٢٠، ق٢٢)
//   السقف اختياريّ لكلّ فعاليّة ومطفأٌ افتراضاً (= بلا سقف في كلّ القنوات). مشغَّلاً: من يتجاوز السعة
//   ينتظر بالدور في كلّ القنوات، والمقعد الذي يفرغ يُعرض على أوّل الدور بمهلة، ثمّ التالي.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { Armchair, Play } from 'lucide-react';
import { swalAlert, swalConfirm, swalToast } from '@/lib/swal';
import { apiFetch } from '@/hooks/useReservations';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit' });

export default function CapacityBar({ activityId, isAdmin, onChanged }: { activityId: number; isAdmin: boolean; onChanged?: () => void }) {
  const [c, setC] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setC(await apiFetch(`/api/reservations/capacity/${activityId}`)); } catch { setC(null); }
  }, [activityId]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  if (!c) return null;

  const toggle = async () => {
    const on = !c.enabled;
    const ok = await swalConfirm(on
      ? `تشغيل سقف هذه الفعاليّة (${c.total} مقعداً)؟\n\nمن يتجاوز السعة ينتظر بالدور في التطبيق والدون والمتابعة، والمقعد الذي يفرغ يُعرض على أوّل الدور ${c.holdMinutes} دقيقة.`
      : 'إطفاء السقف؟\n\nيصير الحجز بلا سقف في كلّ القنوات. من على قائمة الانتظار يبقى عليها حتّى تثبّته.', { confirmText: on ? 'شغّل السقف' : 'أطفئ السقف' });
    if (!ok) return;
    setBusy(true);
    try { await apiFetch(`/api/reservations/capacity/${activityId}`, { method: 'PUT', body: JSON.stringify({ on }) }); await load(); onChanged?.(); }
    catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };
  const run = async () => {
    setBusy(true);
    try { const r = await apiFetch(`/api/reservations/capacity/${activityId}/run`, { method: 'POST' }); swalToast(r.offered ? `عُرض المقعد على ${r.offered}` : 'لا متّسع لأحدٍ من الدور الآن', 'info'); await load(); }
    catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };
  const take = async (q: any) => {
    const offered = q.offerUntil && new Date(q.offerUntil).getTime() > Date.now();
    const over = !offered && c.remaining < Number(q.peopleCount || 1);
    if (!(await swalConfirm(over
      ? `المتاح ${c.remaining} فقط — تثبيت «${q.contactName || q.phone}» (${q.peopleCount}) فوق السعة؟\nيُكتب في سجلّ الحجز.`
      : `تثبيت «${q.contactName || q.phone}» (${q.peopleCount}) من قائمة الانتظار؟`, { confirmText: over ? 'ثبّت فوق السعة' : 'ثبّت' }))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/reservations/${q.id}/waitlist-take`, { method: 'POST', body: JSON.stringify(over ? { overCap: true, reason: 'ثُبّت فوق السعة من المتابعة' } : {}) });
      await load(); onChanged?.();
    } catch (e: any) { swalAlert(e?.message || 'تعذّر', 'error'); }
    finally { setBusy(false); }
  };

  if (!c.enabled && !c.queue?.length && !isAdmin) return null;
  return (
    <div className="res-cap">
      <div className="top">
        <Armchair aria-hidden="true" />
        {c.enabled
          ? <span><b>السقف مشغَّل</b> · محجوز <span className="ltr">{c.booked}</span> من <span className="ltr">{c.total}</span>{c.held ? <> · معروض <span className="ltr">{c.held}</span></> : null} · متاح <span className="ltr">{c.remaining}</span>{c.queue?.length ? <> · ينتظر <span className="ltr">{c.queue.length}</span></> : null}</span>
          : <span><b>بلا سقف</b> · محجوز <span className="ltr">{c.booked}</span> وسعة القاعة <span className="ltr">{c.total}</span></span>}
        {isAdmin && <button type="button" className="wa-btn ghost sm" disabled={busy} onClick={toggle}>{c.enabled ? 'أطفئ السقف' : 'شغّل السقف'}</button>}
        {c.enabled && c.queue?.length > 0 && <button type="button" className="wa-btn ghost sm" disabled={busy} onClick={run}><Play aria-hidden="true" />شغّل الدور</button>}
      </div>
      {c.queue?.length > 0 && (
        <ol className="q">
          {c.queue.map((q: any) => {
            const offered = q.offerUntil && new Date(q.offerUntil).getTime() > Date.now();
            return (
              <li key={q.id}>
                <span className="n ltr">{q.position}</span>
                <span className="who">{q.contactName || q.phone}{Number(q.peopleCount) > 1 ? ` (${q.peopleCount})` : ''}</span>
                {offered ? <small className="off">معروضٌ عليه حتّى <span className="ltr">{hm(q.offerUntil)}</span></small> : <small>منذ <span className="ltr">{hm(q.rankAt)}</span></small>}
                <button type="button" className="wa-btn ghost sm" disabled={busy} onClick={() => take(q)}>ثبّت</button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
