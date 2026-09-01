'use client';

// ══════════════════════════════════════════════════════
// 📋 صفُّ حجزٍ واحد — ٧٦ بكسل بدل ١٧٥
//
// 🔴 الاسمُ لا يُقصّ: كان يتقاسم السطر مع خمس شاراتٍ كلُّها `whitespace-nowrap`،
//    وهو وحده يملك `truncate` — فقُصّ «عبدالرزاق الخطيب» إلى «عبدا…».
//    الشاراتُ نزلت سطراً، والحالةُ صارت شريطاً لونيّاً عند الحافّة.
//
// 🔴 السحبُ لتعليم الحضور (قرار المالك):
//    • السحبُ يبدأ فقط بعد تجاوز عتبةٍ **أفقيّةٍ أوضح من العموديّة** — وإلّا
//      اختطف كلَّ محاولة تمريرٍ للقائمة داخل WebView.
//    • ويُلغى إن غلبت الحركةُ العموديّة، فيعود الصفّ ولا يُعلَّم شيء.
//    • والاتّجاهُ منطقيٌّ في RTL: السحبُ إلى **اليسار** (باتّجاه التقدّم) = حضر،
//      وإلى **اليمين** (رجوعاً) = لم يحضر.
//    • ولمن لا يعرف السحب: النقرةُ تفتح ورقةً فيها الزرّان كبيرَين.
// ══════════════════════════════════════════════════════

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RES_COLORS, rowAccent, statusMeta, resStatus, isWaSent, waAgo } from '@/lib/reservation-status';
import type { Reservation } from '@/hooks/useReservations';

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
export const ar = (v: any) => String(v ?? 0).replace(/[0-9]/g, d => AR[+d]);

/** المسافةُ التي يُعتدّ بها فعلاً */
const TRIGGER = 84;
/** عتبةُ البدء — أفقيٌّ أوضحُ من عموديٍّ بمرّةٍ ونصف قبل أن نأخذ الإيماءة */
const START = 12;

export default function ResRow({ r, onOpen, onAttend }: {
  r: Reservation;
  onOpen: (r: Reservation) => void;
  onAttend: (id: number, v: boolean | null) => void;
}) {
  const [dx, setDx] = useState(0);
  const st = resStatus(r);
  const meta = statusMeta(r);
  const accent = rowAccent(r);

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'none' | 'x' | 'y'>('none');

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = 'none';
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (axis.current === 'none') {
      if (Math.abs(my) > START && Math.abs(my) > Math.abs(mx)) { axis.current = 'y'; return; }
      if (Math.abs(mx) > START && Math.abs(mx) > Math.abs(my) * 1.5) {
        axis.current = 'x';
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* لا شيء */ }
      } else return;
    }
    if (axis.current !== 'x') return;
    // مقاومةٌ بعد العتبة: لا ينزلق الصفّ بلا حدّ
    const capped = Math.sign(mx) * Math.min(Math.abs(mx), TRIGGER + (Math.abs(mx) - TRIGGER) * 0.25);
    setDx(Math.abs(mx) > TRIGGER ? capped : mx);
  };
  const onUp = () => {
    if (axis.current === 'x' && Math.abs(dx) >= TRIGGER) {
      // RTL: يساراً = تقدّمٌ = حضر · يميناً = رجوعٌ = لم يحضر
      const want = dx < 0;
      onAttend(r.id, r.attended === want ? null : want);
    }
    start.current = null; axis.current = 'none'; setDx(0);
  };

  const revealHere = dx < 0;
  const armed = Math.abs(dx) >= TRIGGER;

  return (
    <div className="relative select-none" style={{ touchAction: 'pan-y' }}>
      {/* ما يظهر خلف الصفّ أثناء السحب */}
      {dx !== 0 && (
        <div
          className="absolute inset-0 rounded-2xl flex items-center px-5 text-[15px] font-extrabold"
          style={{
            background: revealHere ? `${RES_COLORS.attended}22` : `${RES_COLORS.noShow}22`,
            border: `1px solid ${(revealHere ? RES_COLORS.attended : RES_COLORS.noShow)}${armed ? '99' : '44'}`,
            color: revealHere ? RES_COLORS.attended : RES_COLORS.noShow,
            justifyContent: revealHere ? 'flex-start' : 'flex-end',
          }}
        >
          {revealHere ? '✓ حضر' : '✕ لم يحضر'}
        </div>
      )}

      <motion.button
        layout
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => { if (axis.current !== 'x' && dx === 0) onOpen(r); }}
        animate={{ x: dx }}
        transition={dx === 0 ? { type: 'spring', stiffness: 520, damping: 38 } : { duration: 0 }}
        className="relative w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-right"
        style={{
          minHeight: 76,
          background: 'rgba(255,255,255,.03)',
          border: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <span className="self-stretch w-1 rounded-full shrink-0" style={{ background: accent }} />

        <span className="flex-1 min-w-0">
          {/* الاسمُ وحده على سطره — لا شيء يزاحمه */}
          <span className="block text-[16px] font-bold text-white truncate leading-tight">{r.contactName}</span>
          <span className="flex items-center gap-1.5 mt-1 flex-wrap">
            {r.phone && (
              <span className="text-[11.5px] text-gray-500 font-mono" dir="ltr">{r.phone}</span>
            )}
            {(r.peopleCount ?? 1) > 1 && (
              <span className="text-[11.5px] text-gray-500">· {ar(r.peopleCount)} أشخاص</span>
            )}
            {st !== 'confirmed' && (
              <span
                className="text-[10.5px] px-1.5 py-px rounded-full border font-bold"
                style={{ color: meta.color, borderColor: meta.color + '66' }}
              >
                {meta.short}
              </span>
            )}
            {/* 💬 أُرسلت له رسالةٌ يدويّة — الوقتُ جزءٌ من الشارة، فـ«أُرسلت»
                وحدها لا تُميّز رسالةَ اليوم من رسالةِ الأسبوع الماضي. */}
            {isWaSent(r) && (
              <span
                className="text-[10.5px] px-1.5 py-px rounded-full border font-bold flex items-center gap-1"
                style={{ color: RES_COLORS.waSent, borderColor: RES_COLORS.waSent + '55' }}
                title={`رسالةُ واتساب${r.waSentBy ? ' — ' + r.waSentBy : ''}`}
              >
                <span>✓</span>
                <span className="tabular-nums">{waAgo(r.waSentAt)}</span>
              </span>
            )}
            {r.appConfirmed && <span className="text-[11px]" title="تأكّد من التطبيق">📱</span>}
            {r.remindOptIn === false && (
              <span className="text-[11px]" title="طلب عدم إرسال تذكيرات">🔕</span>
            )}
            {r.notes && <span className="text-[11px]" title={r.notes}>💬</span>}
          </span>
        </span>

        {/* علامةُ الحضور — ٤٤ بكسل، تُقرأ بالرمز لا باللون وحده */}
        <span
          className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-[17px] border-[1.5px]"
          style={
            r.attended === true
              ? { borderColor: RES_COLORS.attended, background: RES_COLORS.attended + '1f', color: RES_COLORS.attended }
              : r.attended === false
              ? { borderColor: RES_COLORS.noShow, background: RES_COLORS.noShow + '1a', color: RES_COLORS.noShow }
              : { borderColor: 'rgba(255,255,255,.14)', color: '#4b5563' }
          }
        >
          {r.attended === true ? '✓' : r.attended === false ? '✕' : '○'}
        </span>
      </motion.button>
    </div>
  );
}
