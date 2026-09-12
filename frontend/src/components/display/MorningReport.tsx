'use client';
// ══════════════════════════════════════════════════════
// ☀️ الصباح — «تقرير الفجر» (شاشة القاعة)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: كان الصباح رمزاً وعنواناً وصندوقاً واحداً. صار شروقاً يمسح الشاشة
// ثمّ صفحةَ صحيفةٍ: الحدث الجاري في العنوان الرئيس (كبيراً في المنتصف بمشهده)، والأحداث
// السابقة عناوين فرعيّة على الجانب، وعدّادا الأحياء في الأسفل. الأحداث تصل واحداً واحداً
// (display:morning-event) والصفحة تجمعها؛ كلّ حدثٍ جديد يدخل بطبولٍ وقلبٍ للعنوان.
// 🔒 لا أسماءَ في العناوين الفرعيّة أبداً: سياسة الكشف (من يُسمّى ومن يبقى مجهولاً كصاحب
//    القدرة المعطَّلة) تعيش في NightAnimCinematic وحده — الصفحة لا تضيف معلومةً فوقه.
// ══════════════════════════════════════════════════════
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import NightAnimCinematic from '@/components/NightAnimCinematic';

const StreetScene = dynamic(() => import('./StreetScene'), { ssr: false, loading: () => <div className="absolute inset-0" style={{ background: '#2a1a2e' }} /> });
// 🔒 الاسم في بطاقة الحدث فقط؛ المشهد ثلاثيّ الأبعاد يتلقّى نوع الحدث لا أكثر.

interface Props {
  events: any[];            // كلّ أحداث هذا الصباح بترتيب وصولها
  current: any | null;      // الحدث المعروض الآن (آخر ما وصل، خلال نافذته)
  players: any[];
  teamCounts?: { citizenAlive: number; mafiaAlive: number; neutralAlive?: number };
  round?: number;
}

const HEADLINES: Record<string, { title: string; icon: string; tone: 'blood' | 'gold' | 'ash' }> = {
  ASSASSINATION: { title: 'جريمةٌ في الحيّ', icon: '🩸', tone: 'blood' },
  ASSASSINATION_BLOCKED: { title: 'نجا من الموت', icon: '🛡️', tone: 'gold' },
  SILENCED: { title: 'صوتٌ أُخرس', icon: '🤐', tone: 'ash' },
  SNIPE_MAFIA: { title: 'رصاصةٌ في الهدف', icon: '🎯', tone: 'gold' },
  SNIPE_CITIZEN: { title: 'رصاصةٌ طائشة', icon: '💀', tone: 'blood' },
  ABILITY_DISABLED: { title: 'قدرةٌ مُعطَّلة', icon: '🔮', tone: 'ash' },
  ASSASSIN_KILL: { title: 'السفّاح ضرب', icon: '🗡️', tone: 'blood' },
  ASSASSIN_BLOCKED: { title: 'أفلت من السفّاح', icon: '🛡️', tone: 'gold' },
  SHERIFF_REVENGE: { title: 'انتقام الشريف', icon: '⚖️', tone: 'gold' },
  PHOENIX_BURN: { title: 'احترق العنقاء', icon: '🔥', tone: 'blood' },
  PHOENIX_ASH: { title: 'من الرماد', icon: '🔥', tone: 'gold' },
  POLICEWOMAN: { title: 'صلاحيّة الشرطيّة', icon: '👮', tone: 'ash' },
};
const headline = (t: string) => HEADLINES[t] || { title: 'خبرٌ من الليل', icon: '📰', tone: 'ash' as const };
const toneColor = { blood: '#ff6b6b', gold: '#C5A059', ash: '#c7b9ff' };

export default function MorningReport({ events, current, players, teamCounts, round }: Props) {
  const past = events.filter(e => e !== current);
  const quiet = events.length === 0;

  return (
    <div className="relative w-full h-full min-h-[70vh] overflow-hidden rounded-2xl" dir="rtl">
      <style>{`
        @keyframes mrSun { from { transform: translateY(70%) scale(.8); opacity: .3 } to { transform: translateY(0) scale(1); opacity: 1 } }
        @keyframes mrRays { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes mrSweep { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .mr-sun { animation: mrSun 2.8s cubic-bezier(.2,.8,.2,1) 1 both } .mr-rays { animation: mrRays 80s linear infinite }
        .mr-sweep { animation: mrSweep 2.2s cubic-bezier(.2,.8,.2,1) 1 both }
        @media (prefers-reduced-motion: reduce) { .mr-sun, .mr-rays, .mr-sweep { animation: none !important } }
      `}</style>

      {/* 🏙️ الزقاق نفسه عند الفجر — three.js — مع شروقٍ يمسح الشاشة فوقه */}
      <StreetScene mode="dawn" event={current?.type ?? null} eventKey={events.length} />
      <div className="mr-sweep absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(10,8,20,.55) 0%, rgba(255,190,110,0) 45%, rgba(255,190,110,.18) 100%)' }} />
      <div className="absolute inset-x-0 top-0 h-[180px] pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.6), transparent)' }} />

      {/* رأس الصحيفة */}
      <div className="absolute inset-x-0 top-0 px-10 pt-6 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3"><span className="h-px w-12 bg-[#C5A059]/70" /><p className="text-[10px] font-mono tracking-[0.5em] text-[#C5A059]/90">MORNING INTELLIGENCE REPORT{round ? ` · ROUND ${round}` : ''}</p></div>
          <h2 className="text-7xl font-black leading-none mt-1" style={{ fontFamily: 'Amiri, serif', background: 'linear-gradient(180deg, #f6e7bd 0%, #C5A059 52%, #7d5f2a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.85)) drop-shadow(0 0 22px rgba(197,160,89,.35))' }}>تقرير الفجر</h2>
        </div>
        {teamCounts && (
          <div className="flex items-center gap-8 pb-2">
            <div className="text-center"><p className="text-5xl font-black font-mono text-[#7fb0d6]">{teamCounts.citizenAlive}</p><p className="text-[10px] font-mono tracking-widest text-[#bbb]">CITIZENS</p></div>
            <div className="text-center"><p className="text-5xl font-black font-mono text-[#ff6b6b]">{teamCounts.mafiaAlive}</p><p className="text-[10px] font-mono tracking-widest text-[#bbb]">MAFIA</p></div>
            {!!teamCounts.neutralAlive && <div className="text-center"><p className="text-5xl font-black font-mono text-[#c7b9ff]">{teamCounts.neutralAlive}</p><p className="text-[10px] font-mono tracking-widest text-[#bbb]">NEUTRAL</p></div>}
          </div>
        )}
      </div>
      <div className="absolute inset-x-10 top-[132px] h-px bg-white/25" />

      {/* العنوان الرئيس: الحدث الجاري بمشهده */}
      <div className="absolute inset-x-0 top-[150px] bottom-[60px] flex items-stretch gap-6 px-10">
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={`${current.type}-${current.targetPhysicalId ?? ''}-${events.length}`}
                initial={{ opacity: 0, rotateX: -70, y: 40 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} exit={{ opacity: 0, y: -30 }}
                transition={{ type: 'spring', damping: 16, stiffness: 120 }}
                style={{ transformPerspective: 1200 }}
                className="w-full max-w-[1000px] rounded-3xl border bg-black/60 backdrop-blur-md p-8 shadow-2xl"
              >
                {(() => { const h = headline(current.type); return (
                  <div className="flex items-center gap-4 mb-4 border-b border-white/15 pb-3">
                    <span className="text-5xl">{h.icon}</span>
                    <h3 className="text-5xl font-black" style={{ fontFamily: 'Amiri, serif', color: toneColor[h.tone] }}>{h.title}</h3>
                  </div>
                ); })()}
                <NightAnimCinematic data={current} players={players} />
              </motion.div>
            ) : quiet ? (
              <motion.div key="quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <p className="text-6xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>ليلةٌ هادئة</p>
                <p className="text-[#ffe7a8]/70 font-mono tracking-[0.4em] mt-2">NOTHING TO REPORT… YET</p>
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <p className="text-5xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>هذا ما جرى الليلة</p>
                <p className="text-[#ffe7a8]/70 font-mono tracking-[0.4em] mt-2">{events.length} EVENTS · التفاصيل على اليسار</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* العناوين الفرعيّة: ما سبق من أحداث */}
        {past.length > 0 && (
          <div className="w-[300px] shrink-0 flex flex-col gap-3 justify-center">
            <p className="text-[10px] font-mono tracking-[0.4em] text-[#ffe7a8]/60">EARLIER TONIGHT</p>
            {past.slice(-6).map((e, i) => { const h = headline(e.type); return (
              <motion.div key={`${e.type}-${e.targetPhysicalId ?? ''}-${i}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border border-white/15 bg-black/45 backdrop-blur px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">{h.icon}</span>
                <div className="min-w-0">
                  <p className="text-lg font-bold truncate" style={{ fontFamily: 'Amiri, serif', color: toneColor[h.tone] }}>{h.title}</p>
                </div>
              </motion.div>
            ); })}
          </div>
        )}
      </div>
    </div>
  );
}
