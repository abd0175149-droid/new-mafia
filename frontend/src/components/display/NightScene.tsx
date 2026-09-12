'use client';
// ══════════════════════════════════════════════════════
// 🌙 الليل — «المدينة تنام» (شاشة القاعة)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: الليل كان رمزاً وعنواناً وصندوقاً صغيراً — صار مشهداً كامل الشاشة:
// أفقُ مدينةٍ مولَّد إجرائيّاً (نوافذ تُطفأ واحدةً واحدة عند بدء الليل)، قمرٌ وسحبٌ وضباب
// بحركةٍ بطيئة، شريط «من يتحرّك الليلة» بأيقونات الأدوار يُضاء فيه الدورُ الحاليّ في النمط
// اليدويّ (night:step-info) وتنبض كلّها معاً في «الليلة الواحدة» — بلا كشف أهدافٍ أو أسماء.
// مشهد كلّ خطوة (NightAnimCinematic) يكبر إلى وسط الشاشة بدل الصندوق.
// لا تصويرَ للأدوار الفعليّة في الغرفة (أدوار الأحياء سرّ): الشريط أيقوناتُ الليل المعتادة.
// ══════════════════════════════════════════════════════
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NightAnimCinematic from '@/components/NightAnimCinematic';

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

/** أفقٌ مولَّد بذرّيّاً: ثابتٌ عبر إعادة الرسم كي لا تقفز المباني. */
function useSkyline(seed = 7) {
  return useMemo(() => {
    let x = seed;
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    const buildings: Array<{ x: number; w: number; h: number; windows: Array<{ x: number; y: number; on: boolean; delay: number }> }> = [];
    let cursor = 0;
    while (cursor < 1000) {
      const w = 28 + Math.floor(rnd() * 60);
      const h = 60 + Math.floor(rnd() * 200);
      const windows: Array<{ x: number; y: number; on: boolean; delay: number }> = [];
      for (let wy = 10; wy < h - 10; wy += 14) for (let wx = 6; wx < w - 6; wx += 12) if (rnd() < 0.55) windows.push({ x: wx, y: wy, on: rnd() < 0.85, delay: rnd() * 6 });
      buildings.push({ x: cursor, w, h, windows });
      cursor += w + 2 + Math.floor(rnd() * 8);
    }
    return buildings;
  }, [seed]);
}

export default function NightScene({ animation, stepType, players, oneNight }: Props) {
  const buildings = useSkyline();
  const activeIdx = stepType ? NIGHT_ROLES.findIndex(r => r.keys.some(k => stepType.toUpperCase().includes(k))) : -1;

  return (
    <div className="relative w-full h-full min-h-[70vh] overflow-hidden rounded-2xl" dir="rtl">
      <style>{`
        @keyframes nsDrift { from { transform: translateX(0) } to { transform: translateX(-12%) } }
        @keyframes nsDrift2 { from { transform: translateX(-6%) } to { transform: translateX(6%) } }
        @keyframes nsFog { 0%,100% { opacity: .35; transform: translateX(0) } 50% { opacity: .55; transform: translateX(4%) } }
        @keyframes nsTwinkle { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        @keyframes nsWindowOff { to { opacity: 0.08 } }
        @keyframes nsMoon { 0%,100% { filter: drop-shadow(0 0 40px rgba(230,225,200,.45)) } 50% { filter: drop-shadow(0 0 70px rgba(230,225,200,.7)) } }
        @keyframes nsPulse { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.08); opacity: 1 } }
        .ns-cloud { animation: nsDrift 90s linear infinite alternate } .ns-cloud2 { animation: nsDrift2 120s ease-in-out infinite alternate }
        .ns-fog { animation: nsFog 14s ease-in-out infinite } .ns-star { animation: nsTwinkle 3.2s ease-in-out infinite }
        .ns-win { animation: nsWindowOff 1.2s ease-out forwards } .ns-moon { animation: nsMoon 6s ease-in-out infinite }
        .ns-role-on { animation: nsPulse 1.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .ns-cloud, .ns-cloud2, .ns-fog, .ns-star, .ns-moon, .ns-role-on { animation: none !important } }
      `}</style>

      {/* السماء */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#05060d 0%,#0a0f22 45%,#141433 75%,#1b1020 100%)' }} />
      {Array.from({ length: 70 }).map((_, i) => (
        <span key={i} className="ns-star absolute rounded-full bg-white" style={{ left: `${(i * 137) % 100}%`, top: `${(i * 71) % 55}%`, width: i % 7 === 0 ? 3 : 2, height: i % 7 === 0 ? 3 : 2, animationDelay: `${(i % 9) * 0.4}s` }} />
      ))}
      {/* القمر */}
      <div className="ns-moon absolute rounded-full" style={{ right: '14%', top: '9%', width: 150, height: 150, background: 'radial-gradient(circle at 38% 38%, #f3efe0 0%, #d9d2b8 55%, #b9b39a 100%)' }}>
        <span className="absolute rounded-full bg-black/10" style={{ left: 40, top: 55, width: 22, height: 22 }} />
        <span className="absolute rounded-full bg-black/10" style={{ left: 88, top: 32, width: 14, height: 14 }} />
      </div>
      {/* السحب */}
      <div className="ns-cloud absolute left-0 right-0 top-[8%] h-40 opacity-60" style={{ background: 'radial-gradient(ellipse 22% 60% at 20% 50%, rgba(80,85,120,.55), transparent 70%), radial-gradient(ellipse 28% 50% at 62% 40%, rgba(70,75,110,.5), transparent 70%)' }} />
      <div className="ns-cloud2 absolute left-0 right-0 top-[20%] h-32 opacity-50" style={{ background: 'radial-gradient(ellipse 30% 60% at 40% 50%, rgba(60,65,100,.5), transparent 70%), radial-gradient(ellipse 18% 50% at 85% 50%, rgba(60,65,100,.45), transparent 70%)' }} />

      {/* الأفق */}
      <svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 w-full h-[46%]">
        <defs>
          <linearGradient id="nsB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c0d18" /><stop offset="1" stopColor="#040409" /></linearGradient>
        </defs>
        {buildings.map((b, i) => (
          <g key={i} transform={`translate(${b.x},${300 - b.h})`}>
            <rect width={b.w} height={b.h} fill="url(#nsB)" />
            {b.windows.map((w, j) => (
              <rect key={j} x={w.x} y={w.y} width="6" height="8" fill="#e6c36a" opacity={w.on ? 0.85 : 0.08}
                className={w.on ? 'ns-win' : undefined} style={w.on ? { animationDelay: `${w.delay + 1.5}s` } : undefined} />
            ))}
          </g>
        ))}
        {/* مصباح شارعٍ يرتجف */}
        <circle cx="500" cy="262" r="5" fill="#f2d27a"><animate attributeName="opacity" values="1;.35;1;.8;1" dur="3.4s" repeatCount="indefinite" /></circle>
        <rect x="498" y="262" width="4" height="38" fill="#1a1a22" />
      </svg>
      {/* الضباب */}
      <div className="ns-fog absolute inset-x-0 bottom-0 h-[30%] pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(120,120,150,.18) 60%, rgba(120,120,150,.28))' }} />

      {/* العنوان — يتلاشى بعد ثوانٍ ليترك المشهد */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: [0, 1, 1, 0.25], y: 0 }} transition={{ duration: 9, times: [0, 0.1, 0.7, 1] }} className="absolute inset-x-0 top-[26%] text-center pointer-events-none">
        <h2 className="text-8xl font-black text-white tracking-wide" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 50px rgba(138,3,3,.55), 0 0 12px rgba(0,0,0,.8)' }}>الظلام دامس</h2>
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
            initial={{ opacity: 0, scale: 0.85, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: 'spring', damping: 18, stiffness: 140 }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(60vw,900px)] rounded-3xl border border-[#8A0303]/40 bg-black/70 backdrop-blur-md p-10 shadow-[0_0_80px_rgba(138,3,3,.35)]"
          >
            <NightAnimCinematic data={animation} players={players} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
