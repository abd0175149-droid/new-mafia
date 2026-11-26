'use client';
// ══════════════════════════════════════════════════════
// ☀️ الصباح — «تقرير الفجر» طبقةً فوق مشهد المدينة (المشهد يعيش في StreetStage على مستوى الصفحة)
// ══════════════════════════════════════════════════════
// خطّة الإصلاح المعتمدة 2026-09-12: البطاقة تُرسى على الجانب الأيمن (36%) فيبقى المشهد وحدث الشارع
// (سقوط القبّعة، دخان التعطيل…) مكشوفاً في الثلثين الأيسرين؛ أداةٌ ثلاثيّة الأبعاد لكلّ حدث بدل الأيقونة.
// 🔒 لا أسماءَ في العناوين الفرعيّة: سياسة الكشف تعيش في NightAnimCinematic وحده.
// ══════════════════════════════════════════════════════
import { motion, AnimatePresence } from 'framer-motion';
import NightAnimCinematic from '@/components/NightAnimCinematic';
import PropStage from './PropStage';
import FitToScreen from '@/components/FitToScreen';
import { useEffect, useState } from 'react';
import { useRoleFaces } from '@/app/leader/cockpit/screens/Setup';
import { PROPHECY_HEADLINES, ProphecyMorningCard, isProphecyMorning } from './ProphecyMorning';

interface Props { events: any[]; current: any | null; players: any[]; teamCounts?: { citizenAlive: number; mafiaAlive: number; neutralAlive?: number }; round?: number; }
const HEADLINES: Record<string, { title: string; tone: 'blood' | 'gold' | 'ash' }> = {
  ASSASSINATION: { title: 'جريمةٌ في الحيّ', tone: 'blood' }, ASSASSINATION_BLOCKED: { title: 'نجا من الموت', tone: 'gold' }, SILENCED: { title: 'صوتٌ أُخرس', tone: 'ash' },
  SNIPE_MAFIA: { title: 'رصاصةٌ في الهدف', tone: 'gold' }, SNIPE_CITIZEN: { title: 'رصاصةٌ طائشة', tone: 'blood' }, ABILITY_DISABLED: { title: 'قدرةٌ مُعطَّلة', tone: 'ash' },
  ASSASSIN_KILL: { title: 'السفّاح ضرب', tone: 'blood' }, ASSASSIN_BLOCKED: { title: 'أفلت من السفّاح', tone: 'gold' }, SHERIFF_REVENGE: { title: 'انتقام الشريف', tone: 'gold' },
  SHERIFF_CARD: { title: 'سؤال الشريف', tone: 'gold' },
  PHOENIX_BURN: { title: 'احترق العنقاء', tone: 'blood' }, PHOENIX_ASH: { title: 'من الرماد', tone: 'gold' }, POLICEWOMAN: { title: 'صلاحيّة الشرطيّة', tone: 'ash' }, POLICEWOMAN_EXECUTION: { title: 'إعدام الشرطيّة', tone: 'blood' },
};
const headline = (t: string) => HEADLINES[t] || PROPHECY_HEADLINES[t] || { title: 'خبرٌ من الليل', tone: 'ash' as const };
/** 🔮 بطاقات النبوءة بأيقونتها لا بأداة المشهد ثلاثيّة الأبعاد */
const propIcon = (t: string) => PROPHECY_HEADLINES[t]?.icon;
const toneColor = { blood: '#ff6b6b', gold: '#C5A059', ash: '#c7b9ff' };
const GOLD = { fontFamily: 'Amiri, serif', background: 'linear-gradient(180deg, #f6e7bd 0%, #C5A059 52%, #7d5f2a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.85)) drop-shadow(0 0 22px rgba(197,160,89,.35))' } as const;
const keyOf = (e: any) => e?.eventKey ?? `${e?.type}:${e?.targetPhysicalId ?? ''}`;

export default function MorningReport({ events, current, players, teamCounts, round }: Props) {
  const past = events.filter(e => e !== current && (!current || keyOf(e) !== keyOf(current)));
  const quiet = events.length === 0;
  return (
    <div className="relative w-full h-full min-h-[70vh] overflow-hidden" dir="rtl">
      <div className="absolute inset-x-0 top-0 h-[180px] pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.55), transparent)' }} />
      {/* رأس الصحيفة */}
      <div className="absolute inset-x-0 top-0 px-10 pt-6 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3"><span className="h-px w-12 bg-[#C5A059]/70" /><p className="text-[10px] font-mono tracking-[0.5em] text-[#C5A059]/90">MORNING INTELLIGENCE REPORT{round ? ` · ROUND ${round}` : ''}</p></div>
          <h2 className="text-7xl font-black leading-none mt-1" style={GOLD}>تقرير الفجر</h2>
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

      {/* البطاقة المرساة يميناً — الثلثان الأيسران للمشهد وحدثه */}
      <div className="absolute right-[3%] top-[150px] bottom-[40px] w-[36%] flex flex-col gap-3">
        <div className="flex-1 min-h-0 flex items-stretch">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div key={`${keyOf(current)}-${events.length}`}
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', damping: 18, stiffness: 120 }}
                className="w-full h-full min-h-0 flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-black/60 backdrop-blur-sm p-6 shadow-2xl">
                {(() => { const h = headline(current.type); return (
                  <div className="flex items-center gap-4 mb-3 border-b border-white/15 pb-3">
                    {current.type === 'SHERIFF_CARD' ? <span className="text-[72px] leading-none">🔍</span> : propIcon(current.type) ? <span className="text-[72px] leading-none">{propIcon(current.type)}</span> : <PropStage type={current.type} size={96} />}
                    <h3 className="text-4xl font-black leading-tight" style={{ fontFamily: 'Amiri, serif', color: toneColor[h.tone] }}>{h.title}</h3>
                  </div>); })()}
                {current.type === 'SHERIFF_CARD'
                  ? <div className="flex-1 min-h-0"><SheriffCard result={current.extra?.result} k={keyOf(current)} /></div>
                  : isProphecyMorning(current.type)
                  ? <div className="flex-1 min-h-0"><ProphecyMorningCard ev={current} players={players} /></div>
                  : <div className="morning-cinematic flex-1 min-h-0"><FitToScreen><NightAnimCinematic data={current} players={players} /></FitToScreen></div>}
                {/* 📜 سطرُ الدور حين يُقلب (موسم النبوءة) */}
                {current.flipLine && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }} className="mt-3 text-center text-2xl text-[#ffe7a8]" style={{ fontFamily: 'Amiri, serif' }}>{current.flipLine}</motion.p>}
              </motion.div>
            ) : quiet ? (
              <motion.div key="quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full rounded-3xl border border-white/15 bg-black/55 backdrop-blur-sm p-8 text-center">
                <p className="text-5xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>ليلةٌ هادئة</p>
                <p className="text-[#ffe7a8]/70 font-mono tracking-[0.4em] mt-2 text-xs">NOTHING TO REPORT… YET</p>
              </motion.div>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full rounded-3xl border border-white/15 bg-black/55 backdrop-blur-sm p-8 text-center">
                <p className="text-4xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>هذا ما جرى الليلة</p>
                <p className="text-[#ffe7a8]/70 font-mono tracking-[0.4em] mt-2 text-xs">{events.length} EVENTS</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {past.length > 0 && (
          <div className="shrink-0 rounded-2xl border border-white/10 bg-black/50 backdrop-blur px-4 py-3">
            <p className="text-[10px] font-mono tracking-[0.4em] text-[#ffe7a8]/60 mb-1">EARLIER TONIGHT</p>
            <div className="flex flex-col divide-y divide-white/10">
              {past.slice(-5).map((e, i) => { const h = headline(e.type); return (
                <motion.div key={`${keyOf(e)}-${i}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="py-1.5 flex items-center gap-3">
                  {e.type === 'SHERIFF_CARD' ? <span className="text-[26px]">🔍</span> : propIcon(e.type) ? <span className="text-[26px]">{propIcon(e.type)}</span> : <PropStage type={e.type} size={34} />}
                  <p className="text-base font-bold truncate" style={{ fontFamily: 'Amiri, serif', color: toneColor[h.tone] }}>{h.title}</p>
                </motion.div>); })}
            </div>
          </div>
        )}
      </div>
      <style>{`.morning-cinematic .text-7xl, .morning-cinematic .text-8xl, .morning-cinematic .md\\:text-8xl { font-size: 3rem !important; line-height: 1 } .morning-cinematic { overflow: hidden }`}</style>
    </div>
  );
}

// ══════════ 🔍 سؤال الشريف — الكرت وحده ══════════
// قرار المالك 2026-11-20: الشاشة لا تعرض رقماً ولا اسماً — فقط «مواطن صالح» أو «مافيا» بصورة الكرت
// العاديّ (المواطن / المافيا العاديّ) فلا يُكشف دورٌ. الخادم لا يرسل الهدف أصلاً (night:display-event).
function SheriffCard({ result, k }: { result?: string; k: string }) {
  const faces = useRoleFaces();
  const mafia = result === 'MAFIA';
  const [flipped, setFlipped] = useState(false);
  useEffect(() => { setFlipped(false); const t = setTimeout(() => setFlipped(true), 900); return () => clearTimeout(t); }, [k]);
  const face = faces[mafia ? 'MAFIA_REGULAR' : 'CITIZEN'];
  const col = mafia ? '#ff6b6b' : '#7fb0d6';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5" style={{ perspective: 1200 }}>
      <div className="relative" style={{ width: 'min(62%, 300px)', aspectRatio: '5 / 7' }}>
        <motion.div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }} animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}>
          <div className="absolute inset-0 rounded-2xl border-2 border-[#C5A059]/70 grid place-items-center" style={{ backfaceVisibility: 'hidden', background: 'repeating-linear-gradient(135deg,#1b1610 0 12px,#120f0b 12px 24px)' }}>
            <span className="text-[90px]">🔍</span>
          </div>
          <div className="absolute inset-0 overflow-hidden rounded-2xl border-2" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderColor: col, boxShadow: `0 0 60px ${col}55` }}>
            {face ? <img src={face} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-black text-[110px]">{mafia ? '🔪' : '🙂'}</div>}
          </div>
        </motion.div>
      </div>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 12 }} transition={{ delay: 0.5 }}
        className="text-6xl font-black" style={{ fontFamily: 'Amiri, serif', color: col }}>{mafia ? 'مافيا' : 'مواطن صالح'}</motion.p>
    </div>
  );
}
