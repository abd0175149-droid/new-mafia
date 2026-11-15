'use client';

// ══════════════════════════════════════════════════════
// 🕴️ مداخل الجولة خارج الدعوة (2026-11-15)
//   • لافتة الرئيسيّة: لمن أجّل الجولة أو توقّف في منتصفها — «لاحقاً» تؤجّل ولا تلغي.
//   • سطر «حسابي»: «أعد جولة الليلة الأولى» لكلّ لاعب ما دام المفتاح يعمل
//     (ومنه يدخلها الموظّفون وحسابات الاختبار، فهم لا يُدعون تلقائيّاً).
// ══════════════════════════════════════════════════════

import { DonSeal } from '../DonSeal';
import { GuideSafe, useGuide } from './GuideProvider';
import { chapterStart } from './pageSteps';

export const GuideHomeBanner = () => <GuideSafe><HomeBanner /></GuideSafe>;
export const GuideProfileRow = () => <GuideSafe><ProfileRow /></GuideSafe>;

function HomeBanner() {
  const g = useGuide();
  const m = g.me;
  if (!m?.enabled || !m.required || g.run || (m.status !== 'deferred' && m.status !== 'started')) return null;
  return (
    <button type="button" onClick={() => g.begin({ from: chapterStart(m.step) })}
      className="w-full p-4 text-right flex items-center gap-3"
      style={{ background: '#0d0a05', border: '1px solid rgba(197,160,89,0.55)', boxShadow: 'inset 0 0 0 3px #0d0a05, inset 0 0 0 4px rgba(197,160,89,0.18)' }}>
      <DonSeal size={40} tilt={-6} />
      <span className="flex-1 min-w-0">
        <span className="block text-[#C5A059] text-[17px] font-bold leading-snug" style={{ fontFamily: 'Amiri, serif' }}>جولة الليلة الأولى بانتظارك</span>
        <span className="block text-[12.5px] text-[#a8a091] mt-0.5">{m.status === 'started' ? 'تابع من حيث توقّفت' : 'ليلةٌ تجريبيّة مع الدون قبل ليلتك الحقيقيّة'}</span>
      </span>
      <span className="shrink-0 px-4 py-2 text-sm font-black" style={{ background: '#C5A059', color: '#120d04' }}>{m.status === 'started' ? 'تابع' : 'ابدأ'}</span>
    </button>
  );
}

function ProfileRow() {
  const g = useGuide();
  if (!g.me?.enabled) return null;
  return (
    <button type="button" data-guide="guide-replay" onClick={() => { if (!g.run) g.begin({ replay: g.me?.status === 'done' || !g.me?.required }); }}
      className="w-full rounded-2xl p-4 text-right flex items-center gap-3"
      style={{ background: 'rgba(197,160,89,0.07)', border: '1px solid rgba(197,160,89,0.35)' }}>
      <DonSeal size={34} tilt={-6} />
      <span className="flex-1 min-w-0">
        <b className="block text-[14px] text-white font-bold">{g.me.status === 'done' ? 'أعد جولة الليلة الأولى' : 'جولة الليلة الأولى'}</b>
        <span className="block text-[11px] text-gray-500 mt-0.5">ثماني دقائق مع الدون: الحجز والدخول ولعبةٌ تجريبيّة كاملة</span>
      </span>
      <span className="text-[#C5A059] text-sm shrink-0">←</span>
    </button>
  );
}
