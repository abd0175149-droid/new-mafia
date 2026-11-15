'use client';

// ══════════════════════════════════════════════════════
// 🕴️ فعاليّة التدريب في «الألعاب» — «ليلة تجريبيّة» (2026-11-15)
//
// تظهر أوّلَ القائمة لصاحب الجولة وحده ما دامت جولته مفتوحة، ثمّ تختفي عند الختم.
// بطاقةٌ بشكل بطاقات الفعاليّات الحقيقيّة لتعلّم قراءتها — لكنّ حجزها محلّيّ كلّه:
// لا صفّ في bookings، لا ختم ولاء، لا خصم غياب، لا تقرير. والدخول من زرّ «دخول ←»
// داخل البطاقة نفسها (قرار المالك: لا من الزرّ السفليّ).
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GuideSafe, useGuide, arNum } from './GuideProvider';
import './guide.css';

export default function TrainingCard() {
  return <GuideSafe><Card /></GuideSafe>;
}

function Card() {
  const g = useGuide();
  const [sheet, setSheet] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!g.showTraining) return null;

  const now = new Date();
  const day = arNum(now.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Amman' }));
  const month = now.toLocaleDateString('ar-JO', { month: 'long', timeZone: 'Asia/Amman' });
  const booked = g.trainingBooked;

  return (
    <div data-guide="training-card" className="relative rounded-2xl"
      style={{
        background: 'linear-gradient(155deg, rgba(245,158,11,0.13), rgba(5,5,5,0) 58%), rgba(255,255,255,0.03)',
        border: booked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.07)',
      }}>
      <span className="gd-ribbon">تدريب · لك وحدك</span>
      <div className="p-4">
        <div className="flex gap-3.5 items-start">
          <div className="text-center shrink-0 border-l border-white/10 pl-3.5 pt-0.5">
            <p className="text-[34px] font-black text-amber-400 leading-none tracking-tight">{day}</p>
            <p className="text-[13px] text-gray-300 font-bold mt-1 leading-none">{month}</p>
            <p className="text-[16px] font-black mt-2 leading-none" style={{ color: '#fbbf24' }}>الآن</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[15px] font-bold leading-snug truncate">قاعة التدريب</p>
            <p className="text-gray-300 text-[13px] font-bold mt-1">ليلة تجريبيّة</p>
            <p className="text-gray-500 text-[11px] mt-1">📍 داخل التطبيق · مع الدون</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#22c55e18', color: '#22c55e' }}>🟢 سهل</span>
              <span className="text-[9px] text-gray-500">مجّاناً</span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between mt-3.5 pt-3.5 border-t border-white/[0.06]">
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-black text-amber-400 leading-none">9</span>
            <div>
              <p className="text-[11.5px] font-bold text-gray-200 leading-none">قادماً</p>
              <p className="text-[9.5px] mt-1 leading-none" style={{ color: '#22c55e' }}>مقعدٌ واحد بانتظارك</p>
            </div>
          </div>
          {booked ? (
            <button type="button" onClick={() => g.setTrainingBooked(false)}
              className="text-green-400 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0 active:bg-green-500/20 transition-colors">
              ✅ محجوز
            </button>
          ) : (
            <button type="button" data-guide="training-book" onClick={() => setSheet(true)}
              className="text-xs px-4 py-2 rounded-lg font-bold text-black shrink-0"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
              احجز
            </button>
          )}
        </div>

        {booked && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-amber-400 mb-2 font-medium">🎮 الغرف المتاحة حالياً:</p>
            <button type="button" data-guide="training-enter" onClick={g.enterRoom}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
              <span className="text-sm text-white font-bold">غرفة التدريب</span>
              <span className="text-xs px-3 py-1.5 bg-amber-500 text-black font-bold rounded-lg">دخول ←</span>
            </button>
          </div>
        )}
      </div>

      {/* ورقة «تأكيد الحجز» — بشكل الورقة الحقيقيّة */}
      {sheet && mounted && createPortal(
        <div className="fixed top-0 left-0 right-0 bottom-20 z-40 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4" dir="rtl" onClick={() => setSheet(false)}>
          <div data-guide="training-sheet" className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-6"
            style={{ background: 'linear-gradient(to bottom, #111827, #000)', borderTop: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-4" />
            <h3 className="text-white text-lg font-bold mb-1 text-center">تأكيد الحجز</h3>
            <p className="text-gray-400 text-sm text-center mb-4">ليلة تجريبيّة</p>
            <div className="space-y-1.5 mb-4 text-sm text-gray-300">
              <p>📅 {now.toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Amman' })} — الآن</p>
              <p>📍 قاعة التدريب · داخل التطبيق</p>
              <p>👥 9/10 لاعب</p>
              <p>💰 مجّاناً</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSheet(false)} className="flex-1 py-3 rounded-xl text-sm text-gray-400"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>إلغاء</button>
              <button type="button" data-guide="training-confirm" onClick={() => { g.setTrainingBooked(true); setSheet(false); }}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-black"
                style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>✅ تأكيد الحجز</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
