'use client';

// ══════════════════════════════════════════════════════
// ❌ الملغى — قسمٌ في متابعة الحجوزات (خطّة التوحيد م٣ · ق٩)
// ══════════════════════════════════════════════════════
// الإلغاء حالةٌ ظاهرة: من ألغى، ومن أيّ قناة، ومتى، ولماذا — و«استرجاع» يعيده كما كان.
// الحذف كإدخالٍ خاطئ لا يظهر هنا. يختفي القسم إن لم يكن فيه شيء.

import { useCallback, useEffect, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';
import { apiFetch } from '@/hooks/useReservations';
import { CHANNEL_LABEL } from '@/components/reservations/BookingTimeline';

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Amman', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CancelledSection({ activityId, onChanged }: { activityId: number; onChanged?: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async () => {
    try { setRows(await apiFetch(`/api/reservations/cancelled/${activityId}`)); } catch { setRows([]); }
  }, [activityId]);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  if (!rows || rows.length === 0) return null;

  async function restore(r: any) {
    if (!(await swalConfirm(`استرجاع حجز «${r.contactName || r.phone}»؟\nيعود كما كان${r.status === 'confirmed' ? ' مثبَّتاً، ويعود مقعده في التطبيق' : ''}.`, { confirmText: 'استرجع ↩️', icon: 'question' }))) return;
    setBusy(r.id);
    try {
      await apiFetch(`/api/reservations/${r.id}/restore`, { method: 'POST' });
      await load(); onChanged?.();
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(null);
  }

  const people = rows.reduce((s, r) => s + Number(r.peopleCount || 1), 0);
  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden" dir="rtl">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full px-5 py-4 flex items-center justify-between gap-2 flex-wrap text-right">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">❌</span>
          <span className="font-bold text-white">ملغى</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25">{rows.length}</span>
          <span className="text-xs text-gray-400">{people} {people > 1 ? 'أشخاص' : 'شخص'}</span>
        </span>
        <span className="text-[11px] text-gray-500">{open ? 'إخفاء' : 'عرض'} · من ألغى ولماذا · «استرجاع» يعيده</span>
      </button>
      {open && (
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 text-[10.5px]">
              <tr><th className="text-right px-2 py-1.5">الحجز</th><th className="text-right px-2 py-1.5">القناة</th><th className="text-right px-2 py-1.5">السبب</th><th className="text-right px-2 py-1.5">متى</th><th className="px-2 py-1.5"></th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-gray-700/40">
                  <td className="px-2 py-1.5 text-gray-200">{r.contactName || '—'}{Number(r.peopleCount) > 1 && <span className="text-gray-500"> (+{Number(r.peopleCount) - 1})</span>}<span className="block text-[10px] text-gray-500 font-mono" dir="ltr">{r.phone}</span></td>
                  <td className="px-2 py-1.5 text-gray-400">{CHANNEL_LABEL[r.cancelChannel] || r.cancelChannel || '—'}{r.cancelledBy && <span className="block text-[10px] text-gray-500">{r.cancelledBy}</span>}</td>
                  <td className="px-2 py-1.5 text-gray-300">{r.cancelReason || '—'}</td>
                  <td className="px-2 py-1.5 text-gray-400" dir="ltr">{when(r.cancelledAt)}</td>
                  <td className="px-2 py-1.5 text-left">
                    <button disabled={busy === r.id} onClick={() => restore(r)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25 disabled:opacity-50">استرجاع ↩️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
