'use client';
// ══════════════════════════════════════════════════════
// 🌙 الليل — طبقة الواجهة فوق مشهد المدينة (المشهد نفسه يعيش في StreetStage على مستوى الصفحة)
// ══════════════════════════════════════════════════════
// خطّة الإصلاح المعتمدة 2026-09-12:
// • «ليلة واحدة»: كلّ الأدوار مضاءة، وكلّ إرسالٍ يدخل «طابور الضربات» بترتيب التنفيذ الرسميّ
//   ويُعرض 4 ثوانٍ بلا تراكب: أداةٌ ثلاثيّة الأبعاد للدور + جملة — بلا هدفٍ ولا اسم.
// • «دورٌ فدور»: الدور الجاري يُضاء في الشريط، وتُضاف ضربةٌ عند إتمام كلّ خطوة.
// • قبل اختيار النمط: شارة «بانتظار الموجّه».
// 🔒 لا أسماءَ ولا أهدافَ هنا أبداً.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropStage from './PropStage';

export type NightBeat = { id: number; ability: string };
interface Props { stepType: string | null; oneNight?: boolean; abilities?: string[]; beats?: NightBeat[]; }

// ترتيب التنفيذ الرسميّ للّيل (يطابق NIGHT_QUEUE_ORDER في الخادم)
const ORDER = ['KILL', 'SILENCE', 'DISABLE_ABILITY', 'INVESTIGATE', 'PROTECT', 'SNIPE', 'ASSASSINATE'];
const rank = (a: string) => { const i = ORDER.findIndex(k => a.toUpperCase().includes(k)); return i < 0 ? 99 : i; };
const NIGHT_ROLES: Array<{ keys: string[]; icon: string; label: string; en: string; beat: string }> = [
  { keys: ['KILL', 'GODFATHER', 'MAFIA', 'ASSASSINATION', 'MAFIA_REGULAR'], icon: '🔪', label: 'المافيا', en: 'MAFIA', beat: 'المافيا اختارت هدفها' },
  { keys: ['SILENCER', 'SILENCE'], icon: '🤐', label: 'المُسكِت', en: 'SILENCER', beat: 'المُسكِت أخرس صوتاً' },
  { keys: ['WITCH', 'DISABLE'], icon: '🔮', label: 'الساحرة', en: 'WITCH', beat: 'الساحرة عطّلت قدرةً' },
  { keys: ['SHERIFF', 'INVESTIGAT'], icon: '🔍', label: 'الشريف', en: 'SHERIFF', beat: 'الشريف حقّق في هويّة' },
  { keys: ['DOCTOR', 'PROTECT', 'NURSE'], icon: '💉', label: 'الطبيب', en: 'DOCTOR', beat: 'الطبيب حمى أحدهم' },
  { keys: ['SNIPER', 'SNIPE'], icon: '🎯', label: 'القنّاص', en: 'SNIPER', beat: 'القنّاص صوّب' },
  { keys: ['ASSASSIN', 'ASSASSINATE'], icon: '🗡️', label: 'السفّاح', en: 'ASSASSIN', beat: 'السفّاح نفّذ عقداً' },
];
const roleOf = (a: string | null | undefined) => { const u = (a || '').toUpperCase(); return NIGHT_ROLES.find(r => r.keys.some(k => u.includes(k))) || null; };
const GOLD = { fontFamily: 'Amiri, serif', background: 'linear-gradient(180deg, #f6e7bd 0%, #C5A059 52%, #7d5f2a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.85)) drop-shadow(0 0 22px rgba(197,160,89,.35))' } as const;

export default function NightScene({ stepType, oneNight, abilities, beats }: Props) {
  const [showing, setShowing] = useState<NightBeat | null>(null);
  const queue = useRef<NightBeat[]>([]); const seen = useRef(0); const busy = useRef(false);
  useEffect(() => {
    const list = beats || []; if (!list.length) { queue.current = []; seen.current = 0; return; }
    const fresh = list.slice(seen.current); seen.current = list.length; if (!fresh.length) return;
    queue.current.push(...fresh); queue.current.sort((a, b) => rank(a.ability) - rank(b.ability) || a.id - b.id);
    const pump = () => { if (busy.current || !queue.current.length) return; const b = queue.current.shift()!; busy.current = true; setShowing(b); setTimeout(() => { setShowing(null); busy.current = false; setTimeout(pump, 500); }, 3800); };
    pump();
  }, [beats]);

  const activeKeys = new Set<string>();
  if (oneNight) (abilities?.length ? abilities : ORDER).forEach(a => { const r = roleOf(a); if (r) activeKeys.add(r.en); });
  else if (stepType) { const r = roleOf(stepType); if (r) activeKeys.add(r.en); }
  const showingRole = showing ? roleOf(showing.ability) : null;
  const waiting = !oneNight && !stepType && !showing;

  return (
    <div className="relative w-full h-full min-h-[70vh] overflow-hidden" dir="rtl">
      <style>{`
        @keyframes nsPulse { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.08); opacity: 1 } }
        .ns-role-on { animation: nsPulse 1.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .ns-role-on { animation: none !important } }
      `}</style>

      {/* العنوان الذهبيّ في الزاوية */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: .4 }} className="absolute left-8 bottom-7 pointer-events-none text-left" dir="ltr">
        <div className="flex items-center gap-3 mb-1"><span className="h-px w-12 bg-[#C5A059]/70" /><span className="text-[10px] font-mono tracking-[0.5em] text-[#C5A059]/90">OPERATION NIGHTFALL</span></div>
        <h2 className="text-6xl font-black leading-none" dir="rtl" style={GOLD}>الظلام دامس</h2>
        <p className="text-[11px] font-mono tracking-[0.35em] text-[#9a8f7d] mt-2">THE CITY SLEEPS · NOBODY TALKS</p>
      </motion.div>

      {/* شريط «من يتحرّك الليلة» */}
      <div className="absolute right-6 top-6 bottom-6 w-[150px] flex flex-col items-center justify-center gap-3">
        <p className="text-[10px] font-mono tracking-[0.3em] text-[#8a8a8a] mb-1">TONIGHT</p>
        {NIGHT_ROLES.map(r => { const on = activeKeys.has(r.en); const now = showingRole?.en === r.en; return (
          <div key={r.en} className={`w-[130px] rounded-xl border px-3 py-2 flex items-center gap-3 backdrop-blur-sm transition-all duration-500 ${now ? 'border-[#f6e7bd] bg-[#C5A059]/30 scale-105' : on ? 'ns-role-on border-[#C5A059] bg-[#C5A059]/15' : 'border-white/10 bg-black/40 opacity-45'}`}>
            <span className="text-2xl">{r.icon}</span>
            <div className="leading-tight"><p className={`text-sm font-bold ${on || now ? 'text-[#C5A059]' : 'text-[#bbb]'}`}>{r.label}</p><p className="text-[9px] font-mono tracking-widest text-[#777]">{r.en}</p></div>
          </div>); })}
        {oneNight && <p className="text-[10px] text-[#C5A059] mt-1 text-center">الجميع يختار الآن</p>}
      </div>

      {/* شارة انتظار النمط */}
      {waiting && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#C5A059]/40 bg-black/60 backdrop-blur-sm px-7 py-4 text-center">
          <p className="text-[10px] font-mono tracking-[0.35em] text-[#C5A059] mb-1">NIGHT MODE · بانتظار الموجّه</p>
          <p className="text-sm text-[#cfc6b8]">ليلة واحدة أم دورٌ فدور؟</p>
        </motion.div>
      )}

      {/* ضربة الليل: أداةٌ ثلاثيّة الأبعاد + جملة الدور — بلا هدف */}
      <AnimatePresence>
        {showing && showingRole && (
          <motion.div key={showing.id} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: .45 }}
            className="absolute left-[3%] top-[9%] flex items-center gap-4 rounded-2xl border border-[#C5A059]/40 bg-black/65 backdrop-blur-sm px-4 py-3" dir="rtl">
            <PropStage type={showing.ability} size={112} />
            <div className="text-right">
              <h4 className="text-3xl font-black text-[#e2c07a] leading-tight" style={{ fontFamily: 'Amiri, serif' }}>{showingRole.beat}</h4>
              <p className="text-xs text-[#a9a293] mt-1">{showingRole.label} · بلا كشف هدفٍ أو اسم</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
