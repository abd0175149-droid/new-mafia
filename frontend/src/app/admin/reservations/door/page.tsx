'use client';

// ══════════════════════════════════════════════════════
// 🚪 وضعُ الباب — شاشةٌ لفعلٍ واحد
//
// 🔴 مسارٌ مستقلٌّ لا وضعٌ داخل الصفحة (قرار المالك): الموظّفُ يبقى فيه الليلةَ
//    كلَّها بلا أن تعترضه بقيّةُ الأدوات، ولا يُضاف حالٌ إلى مكوّنٍ سطورُه ألف.
//
// 🔴 على الباب لا يُحرَّر حجزٌ ولا يُصدَّر كشف — يُبحث عن اسمٍ ويُعلَّم حاضراً.
//    فالهدفُ ٦٤ بكسل، والصفُّ يخرج من القائمة فور تعليمه، والقائمةُ تقصر كلّما
//    تقدّم العمل. و«تراجع» يبقى ثوانيَ بدل نافذة تأكيدٍ تعترض إيقاع الباب.
// ══════════════════════════════════════════════════════

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { RES_COLORS, matchesSearch, isPending, isWaitlist } from '@/lib/reservation-status';
import { useReservations, apiFetch } from '@/hooks/useReservations';
import { ar } from '@/components/reservations/ResRow';

export default function DoorMode() {
  const R = useReservations();
  const [toast, setToast] = useState<{ id: number; name: string } | null>(null);
  const [showDone, setShowDone] = useState(false);

  const c = R.counts;

  /** مَن لم يُعلَّم بعد — هؤلاء عملُ الليلة. ومَن عُلّم يظهر بطلبٍ صريح. */
  const queue = useMemo(() => {
    const base = R.scoped.filter(r => (showDone ? true : r.attended == null));
    return base
      .filter(r => matchesSearch(r, R.search))
      .sort((a, b) => {
        const o = (x: any) => (x.attended == null ? 0 : 1);
        return o(a) - o(b) || String(a.contactName).localeCompare(String(b.contactName), 'ar');
      });
  }, [R.scoped, R.search, showDone]);

  const mark = useCallback((id: number, name: string) => {
    R.setAttendance(id, true);
    setToast({ id, name });
    window.setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 4200);
  }, [R]);

  // 🪑 المقعدُ يُقرَّر لحظة الوصول لا لحظة الانضمام (C1).
  // كان الموظّف يقول «تفضّل» بلا رقم، واللاعب يكتشف مقعده على هاتفه بعد الدخول،
  // والليدر يعيد التوزيع يدويّاً حين يتضح أنّ الأصدقاء تجاوروا. الرقم هنا محسوبٌ
  // بمحرّك القيود نفسه ومثبَّتٌ للشخص فلا يأخذه غيره.
  const [seatBusy, setSeatBusy] = useState<number | null>(null);
  const [seatOf, setSeatOf] = useState<Record<number, number>>({});
  const assignSeat = useCallback(async (r: any) => {
    if (!R.activityId || R.activityId === 'all') return;
    setSeatBusy(r.id);
    try {
      const res = await apiFetch('/api/seating/door-assign', {
        method: 'POST',
        body: JSON.stringify({
          activityId: Number(R.activityId),
          phone: r.phone || null,
          name: r.contactName,
          playerId: r.playerId || null,
        }),
      });
      const seat = (res as any)?.seat;
      if (seat) {
        setSeatOf(prev => ({ ...prev, [r.id]: seat }));
        if (r.attended == null) R.setAttendance(r.id, true);
      }
    } catch (e: any) {
      alert(e?.message || 'تعذّر تخصيص مقعد — تأكّد أنّ الليدر فتح الغرفة');
    } finally {
      setSeatBusy(null);
    }
  }, [R]);

  if (R.loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-2xl mx-auto -mx-3 sm:mx-auto">
      {/* ══ الرأس ══ */}
      <div className="sticky top-0 z-30 px-3 pt-2 pb-3 space-y-2.5"
        style={{ background: 'rgba(10,10,12,.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div className="flex items-center gap-2">
          <Link href="/admin/reservations"
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[18px] text-gray-400"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
            →
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-white truncate">🚪 وضع الباب</p>
            <p className="text-[11.5px] text-gray-500 truncate">
              {R.activity?.name || (R.activityId === 'all' ? 'كلّ الفعاليّات' : 'اختر فعاليّة')}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <b className="text-[34px] font-black text-white tabular-nums leading-none">{ar(c.attended)}</b>
          <span className="text-[13.5px] text-gray-400">
            حضروا من {ar(c.total)} · بقي <b className="text-white">{ar(c.unmarked)}</b>
          </span>
        </div>

        <div className="flex items-center gap-2 h-12 px-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)' }}>
          <span className="text-[16px]">🔍</span>
          <input
            value={R.search}
            onChange={e => R.setSearch(e.target.value)}
            placeholder="اكتب أوّل حروف الاسم…"
            autoFocus
            className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-white text-[16px] placeholder-gray-600"
          />
          {R.search && <button onClick={() => R.setSearch('')} className="text-gray-500 text-[16px] px-1">✕</button>}
        </div>

        <button
          onClick={() => setShowDone(v => !v)}
          className="text-[12.5px] font-bold px-4 h-11 rounded-full"
          style={showDone
            ? { background: RES_COLORS.attended + '1f', border: `1px solid ${RES_COLORS.attended}66`, color: RES_COLORS.attended }
            : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: '#9ca3af' }}
        >
          {showDone ? '✓ يعرض من عُلّم أيضاً' : 'أظهر من عُلّم'}
        </button>
      </div>

      {/* ══ الطابور ══ */}
      <div className="px-3 pt-3 pb-24 space-y-2">
        {!R.activityId ? (
          <p className="text-center text-gray-500 text-sm py-20">
            اختر فعاليّةً من صفحة الحجوزات أوّلاً
          </p>
        ) : !queue.length ? (
          <div className="text-center py-24 px-6">
            <span className="text-5xl block mb-4">{R.search ? '🔍' : '🎉'}</span>
            <p className="text-gray-400 text-[15px] font-bold">
              {R.search ? 'لا أحدَ بهذا الاسم' : 'الجميعُ عُلّم — لم يبقَ أحد'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {queue.map(r => {
              const done = r.attended != null;
              return (
                <motion.button
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  onClick={() => { if (!done) mark(r.id, r.contactName); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-right"
                  style={{
                    minHeight: 84,
                    background: done ? RES_COLORS.attended + '0f' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${done ? RES_COLORS.attended + '44' : 'rgba(255,255,255,.07)'}`,
                  }}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[18px] font-bold text-white truncate leading-tight">{r.contactName}</span>
                    <span className="flex items-center gap-1.5 mt-1">
                      {r.phone && <span className="text-[12px] text-gray-500 font-mono" dir="ltr">{r.phone}</span>}
                      {(r.peopleCount ?? 1) > 1 && (
                        <span className="text-[12px] font-bold px-1.5 rounded-full border"
                          style={{ color: '#9ca3af', borderColor: 'rgba(255,255,255,.15)' }}>
                          +{ar((r.peopleCount ?? 1) - 1)}
                        </span>
                      )}
                      {/* الباب هو أخطرُ موضعٍ لإخفاء الحالة: مَن على قائمة الانتظار
                          قد لا يكون له مقعد، فالشارةُ هنا ليست زينةً بل تحذير. */}
                      {isWaitlist(r) && (
                        <span className="text-[11px] px-1.5 rounded-full border font-bold"
                          style={{ color: RES_COLORS.waitlist, borderColor: RES_COLORS.waitlist + '66' }}>
                          قائمة انتظار
                        </span>
                      )}
                      {isPending(r) && (
                        <span className="text-[11px] px-1.5 rounded-full border font-bold"
                          style={{ color: RES_COLORS.pending, borderColor: RES_COLORS.pending + '66' }}>
                          غير مثبّت
                        </span>
                      )}
                      {seatOf[r.id] && (
                        <span className="text-[12px] px-2 rounded-full border font-black"
                          style={{ color: '#C5A059', borderColor: '#C5A05988', background: '#C5A05918' }}>
                          🪑 مقعد {ar(seatOf[r.id])}
                        </span>
                      )}
                    </span>
                  </span>

                  {/* 🪑 اعطِه رقمه على الباب — قبل أن يدخل ويجلس عشوائيّاً */}
                  {!seatOf[r.id] && R.activityId && R.activityId !== 'all' && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); void assignSeat(r); }}
                      className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-[12px] font-bold border-2 leading-tight text-center"
                      style={{
                        borderColor: '#C5A05966', background: '#C5A05910', color: '#C5A059',
                        opacity: seatBusy === r.id ? 0.5 : 1,
                      }}
                    >
                      {seatBusy === r.id ? '…' : 'أعطِ مقعداً'}
                    </span>
                  )}
                  <span
                    className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-[24px] border-2"
                    style={
                      r.attended === true
                        ? { borderColor: RES_COLORS.attended, background: RES_COLORS.attended + '22', color: RES_COLORS.attended }
                        : r.attended === false
                        ? { borderColor: RES_COLORS.noShow, background: RES_COLORS.noShow + '1a', color: RES_COLORS.noShow }
                        : { borderColor: RES_COLORS.attended + '80', background: RES_COLORS.attended + '14', color: RES_COLORS.attended }
                    }
                  >
                    {r.attended === false ? '✕' : '✓'}
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ══ تراجع ══ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed left-3 right-3 z-40 flex items-center gap-2.5 px-4 py-3.5 rounded-2xl max-w-lg mx-auto"
            style={{ bottom: 'max(16px,env(safe-area-inset-bottom))', background: '#12211d', border: `1px solid ${RES_COLORS.attended}66` }}
          >
            <span style={{ color: RES_COLORS.attended }}>✓</span>
            <span className="flex-1 text-[14px] text-gray-200 truncate">{toast.name} — حضر</span>
            <button
              onClick={() => { R.setAttendance(toast.id, null); setToast(null); }}
              className="text-[14px] font-extrabold px-2" style={{ color: RES_COLORS.pending }}
            >
              تراجع
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
