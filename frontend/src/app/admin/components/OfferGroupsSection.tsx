'use client';

// ══════════════════════════════════════════════════════
// 🎟️ مجموعات عروض الحجز — قسمٌ في صفحة الفعاليّة (الحسمُ عند الباب)
// ══════════════════════════════════════════════════════
// العرضُ يُحسب على **الحضور الفعليّ**: يؤشّر الموظّف من حضر من صفوف المجموعة،
// فيُحسب المجّانيّ من الدافعين الحاضرين وحدهم (الحساب المجّانيّ والزيارة
// المجّانيّة لا يُكملان العدد)، ويقع على غير المدفوع — الأعضاء قبل صاحبها.
// صديقٌ «بانتظار» بلا صفّ حجز: يُسجَّل برقمه من قائمة الحجوزات فيرتبط تلقائيّاً.

import { useCallback, useEffect, useState } from 'react';
import { swalConfirm, swalAlert } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function offFetch(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* بلا جسم */ }
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}

const ORD = ['', 'الأوّل', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
function ruleText(t: any) {
  if (!t?.N) return 'بلا عرض';
  const N = t.N, K = t.K;
  const base = N - K === 1 ? `${K === 1 ? 'واحد بيدفع' : `${K} بيدفعوا`} و${ORD[N] || 'الأخير'} مجاناً` : K === 1 ? `${N} بسعر واحد` : `${N} بسعر ${K}`;
  return base + (t.repeat ? ` — يتكرّر` : '');
}
const freeFor = (t: any, size: number) => !t?.N || size < t.N ? 0 : (t.repeat ? Math.floor(size / t.N) : 1) * (t.N - t.K);

const MEMBER: Record<string, { label: string; cls: string }> = {
  joined: { label: '✅ أكّد', cls: 'text-emerald-300' },
  booked: { label: '⏳ لم يؤكّد بعد', cls: 'text-amber-300' },
  pending: { label: '🆕 بانتظار حجزه', cls: 'text-sky-300' },
  declined: { label: '✖️ رفض', cls: 'text-rose-300' },
  removed: { label: '— خرج', cls: 'text-gray-500' },
};

export default function OfferGroupsSection({ activityId, onChanged }: { activityId: number; onChanged?: () => void }) {
  const [groups, setGroups] = useState<any[] | null>(null);
  const [open, setOpen] = useState(true);
  const [present, setPresent] = useState<Record<number, Set<number>>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await offFetch(`/api/booking-offers/activity/${activityId}/groups`);
      const gs = d.groups || [];
      setGroups(gs);
      // الافتراضيّ: من حُسم سابقاً + كلّ صفوف المجموعة (الموظّف يُسقط الغائب)
      setPresent(prev => {
        const next: Record<number, Set<number>> = {};
        for (const g of gs) next[g.id] = prev[g.id] ?? new Set(g.bookings.map((b: any) => b.id));
        return next;
      });
    } catch { setGroups([]); }
  }, [activityId]);
  useEffect(() => { load(); }, [load]);

  if (!groups || groups.length === 0) return null;

  const toggle = (gid: number, bid: number) => setPresent(p => {
    const s = new Set(p[gid] || []); s.has(bid) ? s.delete(bid) : s.add(bid);
    return { ...p, [gid]: s };
  });

  async function settle(g: any) {
    const ids = Array.from(present[g.id] || []);
    const paying = g.bookings.filter((b: any) => ids.includes(b.id) && (b.offerFree || (!b.freeAccount && !b.loyalty)));
    const free = freeFor(g.terms, paying.length);
    const ok = await swalConfirm(
      `مجموعة ${g.ownerName}: حضر ${ids.length} — منهم ${paying.length} دافعاً.\n`
      + (free ? `⟵ ${free} ببلاش بعرض «${g.terms?.name || ''}».` : `⟵ لا مجّانيّ (العرض بدّه ${g.terms?.N || '—'} دافعين حاضرين).`)
      + (g.status === 'settled' ? '\nالحسم السابق يُلغى ويُعاد.' : ''),
      { confirmText: 'احسم', icon: 'question' });
    if (!ok) return;
    setBusy(g.id);
    try {
      const r = await offFetch(`/api/booking-offers/groups/${g.id}/settle`, { method: 'POST', body: JSON.stringify({ present: ids }) });
      swalAlert(r.short
        ? `⚠️ حُسم ${r.free} ببلاش — وبقي ${r.short} لم يُطبَّق لأنّ الباقين دفعوا نقداً فعلاً. ردّ لهم ${r.short} يدويّاً إن لزم.`
        : `✅ حُسم: ${r.free} ببلاش`);
      await load(); onChanged?.();
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(null);
  }

  async function removeMember(g: any, m: any) {
    if (!(await swalConfirm(`إخراج ${m.name} من مجموعة ${g.ownerName}؟\nحجزُه (إن وُجد) يبقى مستقلّاً، ويُبلَّغ صاحب المجموعة.`, { danger: true, confirmText: 'أخرجه' }))) return;
    setBusy(g.id);
    try { await offFetch(`/api/booking-offers/members/${m.id}`, { method: 'DELETE' }); await load(); onChanged?.(); }
    catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(null);
  }

  const settled = groups.filter(g => g.status === 'settled').length;

  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden" dir="rtl">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/20 transition-colors">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">🎟️</span>
          <span className="font-bold text-white">مجموعات العروض</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">{groups.length} مجموعة</span>
          {settled > 0 && <span className="text-xs text-emerald-400">{settled} محسومة</span>}
        </div>
        <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            العرض على <b className="text-gray-300">الحضور الفعليّ</b>: أشّر من حضر ثمّ «احسم». الحسابات المجّانيّة والزيارات المجّانيّة لا تُكمل العدد،
            والمجّانيّ يقع على غير المدفوع (الأصحاب قبل صاحب المجموعة). صديقٌ «بانتظار حجزه» إن حضر: سجّله برقمه في الحجوزات فيرتبط تلقائيّاً.
          </p>
          {groups.map(g => {
            const ids = present[g.id] || new Set<number>();
            const paying = g.bookings.filter((b: any) => ids.has(b.id) && (b.offerFree || (!b.freeAccount && !b.loyalty)));
            const free = freeFor(g.terms, paying.length);
            const pendingMembers = g.members.filter((m: any) => m.status === 'pending');
            const bookedMembers = new Map<number, any>(g.members.filter((m: any) => m.bookingId).map((m: any) => [m.bookingId, m]));
            return (
              <div key={g.id} className={`rounded-xl border p-3 ${g.status === 'settled' ? 'border-emerald-500/25 bg-emerald-500/[0.03]' : 'border-gray-700/60 bg-gray-900/40'}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">
                      {g.ownerName} <span className="text-[11px] font-normal text-gray-500 font-mono" dir="ltr">{g.ownerPhone}</span>
                      {g.priority && <span className="text-[10px] text-sky-300 mr-2">⭐ أولويّة</span>}
                      {g.source === 'upgrade' && <span className="text-[10px] text-gray-400 mr-2">↑ ترقية حجز</span>}
                    </div>
                    <div className="text-[11px] text-amber-200/90 mt-0.5">🎁 {g.terms?.name ? `«${g.terms.name}» — ` : ''}{ruleText(g.terms)} · صرّح بـ{g.declaredPeople} · موعود {g.promisedFree} ببلاش</div>
                  </div>
                  {g.status === 'settled' && <span className="text-[11px] font-bold text-emerald-300 shrink-0">✅ حُسم: {g.settledFree} ببلاش{g.settledBy ? ` · ${g.settledBy}` : ''}</span>}
                </div>

                <div className="mt-2 flex flex-col gap-1">
                  {g.bookings.map((b: any) => {
                    const m = bookedMembers.get(b.id);
                    const on = ids.has(b.id);
                    const isOwner = b.phone === g.ownerPhone;
                    return (
                      <label key={b.id} className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer ${on ? 'bg-gray-800/70' : 'opacity-60 hover:opacity-90'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(g.id, b.id)} className="accent-amber-500" />
                        <span className="text-gray-200 font-bold">{b.name}</span>
                        {isOwner && <span className="text-[10px] text-gray-500">صاحب المجموعة</span>}
                        {m && <span className={`text-[10px] ${MEMBER[m.status]?.cls || ''}`}>{MEMBER[m.status]?.label}</span>}
                        {b.freeAccount && <span className="text-[10px] text-violet-300">حساب مجّانيّ — لا يُحسب</span>}
                        {b.loyalty && <span className="text-[10px] text-violet-300">زيارة ولاء — لا تُحسب</span>}
                        {b.offerFree && <span className="text-[10px] text-emerald-300">🎁 ببلاش بالعرض</span>}
                        {!b.offerFree && b.isPaid && b.paidAmount > 0 && <span className="text-[10px] text-gray-400">دفع {b.paidAmount} د.أ</span>}
                        {m && m.status !== 'removed' && (
                          <button type="button" onClick={e => { e.preventDefault(); removeMember(g, m); }} className="mr-auto text-[10px] text-gray-500 hover:text-rose-300">إخراج</button>
                        )}
                      </label>
                    );
                  })}
                  {pendingMembers.map((m: any) => (
                    <div key={'p' + m.id} className="flex items-center gap-2 text-xs px-2 py-1.5 text-gray-400">
                      <span className="w-3.5" />
                      <span>{m.name}</span>
                      <span className="text-[10px] text-gray-600 font-mono" dir="ltr">{m.phone}</span>
                      <span className={`text-[10px] ${MEMBER.pending.cls}`}>{MEMBER.pending.label}</span>
                      <button type="button" onClick={() => removeMember(g, m)} className="mr-auto text-[10px] text-gray-500 hover:text-rose-300">إخراج</button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <button disabled={busy === g.id} onClick={() => settle(g)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50">
                    {g.status === 'settled' ? '↻ أعد الحسم' : '✓ احسم'}
                  </button>
                  <span className="text-[11px] text-gray-400">حاضرون {ids.size} · دافعون {paying.length} ⟵ <b className={free ? 'text-emerald-300' : 'text-gray-500'}>{free} ببلاش</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
