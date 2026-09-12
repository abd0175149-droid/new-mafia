'use client';
// ══════════════════════════════════════════════════════
// 🌙 الليل — «المدينة تنام» (شاشة القاعة)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: الليل كان رمزاً وعنواناً وصندوقاً صغيراً — صار مشهداً كامل الشاشة:
// زقاقٌ ثلاثيّ الأبعاد بروح المافيا الإيطاليّة (StreetScene: واجهات حجريّة، أسفلت مبلّل، مصابيح،
// حبال مصابيح، سيّارة كلاسيكيّة، مطر وضباب)، شريط «من يتحرّك الليلة» بأيقونات الأدوار يُضاء فيه الدورُ الحاليّ في النمط
// اليدويّ (night:step-info) وتنبض كلّها معاً في «الليلة الواحدة» — بلا كشف أهدافٍ أو أسماء.
// مشهد كلّ خطوة (NightAnimCinematic) يكبر إلى وسط الشاشة بدل الصندوق.
// لا تصويرَ للأدوار الفعليّة في الغرفة (أدوار الأحياء سرّ): الشريط أيقوناتُ الليل المعتادة.
// ══════════════════════════════════════════════════════
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import NightAnimCinematic from '@/components/NightAnimCinematic';

// 🏙️ المشهد الثلاثيّ الأبعاد (three) — عميلٌ فقط
const StreetScene = dynamic(() => import('./StreetScene'), { ssr: false, loading: () => <div className="absolute inset-0" style={{ background: '#05060c' }} /> });

interface Props {
  animation: any | null;          // مشهد الخطوة الحاليّة (night:animation)
  stepType: string | null;        // معرّف القدرة الجارية في النمط اليدويّ (night:step-info)
  players: any[];
  oneNight?: boolean;             // الليلة الواحدة: الجميع يختار معاً
}

// أيقونات الليل (معرّفات القدرات كما يبثّها الخادم في stepType) — بلا أسماءٍ ولا أهداف
const NIGHT_ROLES: Array<{ keys: string[]; icon: string; label: string; en: string }> = [
  { keys: ['MAFIA_KILL', 'GODFATHER', 'MAFIA', 'ASSASSINATION', 'MAFIA_REGULAR'], icon: '🔪', label: 'المافيا', en: 'MAFIA' },
  { keys: ['SILENCER', 'SILENCE'], icon: '🤐', label: 'المُسكِت', en: 'SILENCER' },
  { keys: ['WITCH', 'WITCH_DISABLE', 'DISABLE_ABILITY'], icon: '🔮', label: 'الساحرة', en: 'WITCH' },
  { keys: ['SHERIFF', 'SHERIFF_INVESTIGATE', 'INVESTIGATION'], icon: '🔍', label: 'الشريف', en: 'SHERIFF' },
  { keys: ['DOCTOR', 'DOCTOR_PROTECT', 'PROTECTION', 'NURSE'], icon: '💉', label: 'الطبيب', en: 'DOCTOR' },
  { keys: ['SNIPER', 'SNIPER_SHOOT', 'SNIPE'], icon: '🎯', label: 'القنّاص', en: 'SNIPER' },
  { keys: ['ASSASSIN', 'ASSASSIN_KILL'], icon: '🗡️', label: 'السفّاح', en: 'ASSASSIN' },
];

export default function NightScene({ animation, stepType, players, oneNight }: Props) {
  const activeIdx = stepType ? NIGHT_ROLES.findIndex(r => r.keys.some(k => stepType.toUpperCase().includes(k))) : -1;

  return (
    <div className="relative w-full h-full min-h-[70vh] overflow-hidden rounded-2xl" dir="rtl">
      <style>{`
        @keyframes nsPulse { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.08); opacity: 1 } }
        .ns-role-on { animation: nsPulse 1.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .ns-role-on { animation: none !important } }
      `}</style>

      {/* 🏙️ زقاق المافيا ليلاً — three.js */}
      <StreetScene mode="night" />
      {/* تعتيمٌ خفيف أسفل الشاشة كي تُقرأ الطبقات فوقه */}
      <div className="absolute inset-x-0 bottom-0 h-[35%] pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.55))' }} />

      {/* العنوان — يتلاشى بعد ثوانٍ ليترك المشهد */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: [0, 1, 1, 0.25], y: 0 }} transition={{ duration: 9, times: [0, 0.1, 0.7, 1] }} className="absolute inset-x-0 top-[26%] text-center pointer-events-none">
        <h2 className="text-8xl font-black text-white tracking-wide" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 50px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.8)' }}>الظلام دامس</h2>
        <p className="text-[#9a8f7d] text-xl font-mono tracking-[0.5em] mt-2">OPERATION NIGHTFALL</p>
      </motion.div>

      {/* شريط «من يتحرّك الليلة» */}
      <div className="absolute right-6 top-6 bottom-6 w-[150px] flex flex-col items-center justify-center gap-3">
        <p className="text-[10px] font-mono tracking-[0.3em] text-[#8a8a8a] mb-1">TONIGHT</p>
        {NIGHT_ROLES.map((r, i) => {
          const on = oneNight ? true : i === activeIdx;
          return (
            <div key={r.en} className={`w-[130px] rounded-xl border px-3 py-2 flex items-center gap-3 backdrop-blur-sm ${on ? 'ns-role-on border-[#C5A059] bg-[#C5A059]/15' : 'border-white/10 bg-black/40 opacity-45'}`}>
              <span className="text-2xl">{r.icon}</span>
              <div className="leading-tight">
                <p className={`text-sm font-bold ${on ? 'text-[#C5A059]' : 'text-[#bbb]'}`}>{r.label}</p>
                <p className="text-[9px] font-mono tracking-widest text-[#777]">{r.en}</p>
              </div>
            </div>
          );
        })}
        {oneNight && <p className="text-[10px] text-[#C5A059] mt-1 text-center">الجميع يختار الآن</p>}
      </div>

      {/* مشهد الخطوة — وسط الشاشة، كبير */}
      <AnimatePresence>
        {animation && (
          <motion.div
            key={`${animation.type}-${animation.targetPhysicalId ?? ''}`}
            initial={{ opacity: 0, scale: 0.85, y: '-45%', x: '-50%' }} animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }} exit={{ opacity: 0, scale: 0.9, y: '-55%', x: '-50%' }}
            transition={{ type: 'spring', damping: 18, stiffness: 140 }}
            className="absolute left-1/2 top-1/2 w-[min(60vw,900px)] rounded-3xl border border-[#C5A059]/30 bg-black/70 backdrop-blur-md p-10 shadow-[0_0_80px_rgba(0,0,0,.7)]"
          >
            <NightAnimCinematic data={animation} players={players} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
