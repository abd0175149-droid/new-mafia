'use client';

// ══════════════════════════════════════════════════════
// 💬 شريطُ تأكيد الإرسال — يظهر لحظةَ العودة من واتساب
//
// المسألة: الموظّفُ يرسل من حسابه هو (لا من البوت — طبقةُ الإرسال الرسميّة
// ترفض بدءَ محادثةٍ خارج نافذة ٢٤ ساعة)، فلا سبيلَ للنظام أن يعرف أنّ الرسالة
// وصلت. والسؤالُ عمليٌّ: كيف نسجّل ذلك بلا أن نُبطئ مَن يراسل عشرين شخصاً؟
//
// 🔴 الجواب: التعليمُ يقع **عند الضغط** لا عند التأكيد، وهذا الشريطُ وظيفتُه
//    **النفي** لا الإثبات. فمَن أرسل فعلاً — وهو الغالب — لا يلمس شيئاً،
//    ومَن لم يُرسل يضغط «لم تُرسل» فيُمحى التعليم. صفرُ نقراتٍ في الشائع.
//
// 🔴 ولأنّ الشريط ظهر مجّاناً، جعلناه يكسب وقتاً بدل أن يأخذه: «التالي»
//    يفتح محادثةَ مَن لم تُرسل له بعدُ مباشرةً — فتصير مراسلةُ عشرين شخصاً
//    نقرةً لكلٍّ منهم بدل تمريرٍ وفتحِ ورقةٍ وضغطِ زرّ.
//
// 🔴 ويُسلَّح مؤقّتُ الاختفاء عند **العودة** لا عند الإرسال: لو بدأ فوراً
//    لانقضى والموظّفُ ما زال داخل واتساب، فلا يرى الشريطَ أصلاً.
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RES_COLORS } from '@/lib/reservation-status';
import type { Reservation } from '@/hooks/useReservations';

const DISMISS_MS = 14_000;

export default function WaConfirmBar({ row, remaining, onUndo, onNext, onClose }: {
  /** الصفُّ الذي أُرسلت له للتوّ — null يُخفي الشريط */
  row: Reservation | null;
  /** كم بقي بلا رسالة (بعد هذا) — يظهر على زرّ «التالي» */
  remaining: number;
  onUndo: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<any>(null);

  // 🔴 المرجعُ ضروريّ: `onClose` سهمٌ يُبنى في كلّ عرضٍ للصفحة، فلو دخل قائمةَ
  //    اعتماد الأثر لأُعيد تشغيلُه مع كلّ استطلاعٍ دوريّ — فيعود `armed` صفراً
  //    ويختفي الشريطُ من تحت يد الموظّف. الأثرُ يتعلّق بالصفّ وحده.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const rowId = row?.id ?? null;

  useEffect(() => {
    setArmed(false);
    if (rowId == null) return;

    const arm = () => {
      if (document.visibilityState !== 'visible') return;
      setArmed(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => closeRef.current(), DISMISS_MS);
    };

    // الحالةُ الشائعة: الصفحةُ تُخفى ثمّ تعود ⇒ نُسلّح عند العودة.
    document.addEventListener('visibilitychange', arm);
    // وحالةٌ لا تُخفى فيها الصفحة أصلاً (تبويبٌ جانبيّ على سطح المكتب،
    // أو تعذّر فتحُ التطبيق) — فلا ننتظر حدثاً لن يقع.
    const fallback = setTimeout(arm, 2500);

    return () => {
      document.removeEventListener('visibilitychange', arm);
      clearTimeout(fallback);
      clearTimeout(timer.current);
    };
  }, [rowId]);

  const show = !!row && armed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="fixed left-3 right-3 z-50 rounded-2xl overflow-hidden max-w-lg mx-auto"
          style={{ bottom: 84, background: '#0d1a14', border: `1px solid ${RES_COLORS.waSent}55` }}
        >
          <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
            <span
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[15px]"
              style={{ background: RES_COLORS.waSent + '22', color: RES_COLORS.waSent }}
            >
              ✓
            </span>
            <span className="flex-1 min-w-0">
              <b className="block text-[14px] font-bold text-white truncate">{row!.contactName}</b>
              <span className="block text-[11.5px]" style={{ color: RES_COLORS.waSent }}>
                سُجّلت الرسالة
              </span>
            </span>
            <button
              onClick={onClose}
              className="w-9 h-9 shrink-0 rounded-full text-gray-500 text-[15px]"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-2 px-3 pb-3">
            <button
              onClick={onUndo}
              className="h-12 px-4 rounded-xl text-[13.5px] font-bold shrink-0"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: '#d1d5db' }}
            >
              لم أُرسلها
            </button>
            <button
              onClick={onNext}
              disabled={remaining <= 0}
              className="flex-1 min-w-0 h-12 rounded-xl text-[14.5px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: RES_COLORS.waSent, color: '#04150d' }}
            >
              {remaining > 0 ? (
                <>
                  <span className="truncate">التالي</span>
                  <span className="text-[12px] font-bold opacity-70 tabular-nums">
                    بقي {String(remaining).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d])}
                  </span>
                  <span>←</span>
                </>
              ) : (
                <span>لم يبقَ أحد ✓</span>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
