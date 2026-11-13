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
import { Check, ChevronLeft, X } from 'lucide-react';
import type { Reservation } from '@/hooks/useReservations';

const DISMISS_MS = 14_000;

export default function WaConfirmBar({ row, remaining, onUndo, onNext, onClose, shiftBottom }: {
  /** الصفُّ الذي أُرسلت له للتوّ — null يُخفي الشريط */
  row: Reservation | null;
  /** كم بقي بلا رسالة (بعد هذا) — يظهر على زرّ «التالي» */
  remaining: number;
  onUndo: () => void;
  onNext: () => void;
  onClose: () => void;
  /** انزياح آيفون بعد لوحة المفاتيح (useVisibleViewport) */
  shiftBottom?: number;
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
        <div className="res-float" style={{ zIndex: 50, transform: shiftBottom ? `translateY(${shiftBottom}px)` : undefined }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="res-wabar" role="status"
          >
            <div className="who">
              <span className="res-mark yes"><Check /></span>
              <span className="grow">
                <b>{row!.contactName}</b>
                <span className="s">سُجّلت الرسالة</span>
              </span>
              <button type="button" onClick={onClose} className="wa-iconbtn" aria-label="إغلاق"><X /></button>
            </div>

            <div className="row">
              <button type="button" onClick={onUndo} className="wa-btn">لم أُرسلها</button>
              <button type="button" onClick={onNext} disabled={remaining <= 0} className="wa-btn send grow">
                {remaining > 0 ? (
                  <>التالي <span>· بقي <span className="ltr">{remaining}</span></span><ChevronLeft /></>
                ) : (
                  <>لم يبقَ أحد <Check /></>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
