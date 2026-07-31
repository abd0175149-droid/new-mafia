'use client';

// ══════════════════════════════════════════════════════
// 🚪 تشريفة الدخول — طبقة شاشة العرض
//
// قواعد إنتاج مثبّتة (أرتفاكت v4):
//  • الطبقة بمستوى الصفحة كطبقة «اختيار رابح» — لا داخل فرع طور.
//  • 3.5 ثانية باللوبي · نسخة مختصرة صامتة (1.6ث) أثناء المباراة
//    كي لا تقطع نقاشاً محتدماً.
//  • الصوت مسؤولية جهاز القائد (مصدر الصوت الحصري) — لا شيء هنا.
// ══════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import './RankEffects.css';   // رفّة النيون (entrance-flick)
import MafiaCard from './MafiaCard';
import { ChipsEmblem } from './ChipsEmblems';
import EntranceStage from './EntranceStage';

export type EntranceDesign = 'don' | 'seal' | 'neon' | 'file' | 'custom';

export interface EntrancePayload {
  design: EntranceDesign;
  /** عناصر التشريفة المؤلَّفة — تُقرأ فقط حين design === 'custom' */
  elements?: any;
  name: string;
  physicalId: number;
  gender?: 'MALE' | 'FEMALE';
  avatarUrl?: string | null;
  rankTier?: string | null;
  cosmetics?: any;
  /** نسخة مختصرة صامتة — أثناء مباراة جارية */
  compact?: boolean;
}

export const ENTRANCE_FULL_MS = 3500;
export const ENTRANCE_COMPACT_MS = 1600;

export function EntranceOverlay({ data }: { data: EntrancePayload }) {
  const { design, name, compact } = data;

  // ── النسخة المختصرة: شريط علوي هادئ لا يحجب اللعب ──
  if (compact) {
    const tone =
      design === 'don' ? { bg: 'rgba(69,26,3,0.92)', bd: 'rgba(245,158,11,0.55)', fg: '#fcd34d' }
      : design === 'seal' ? { bg: 'rgba(69,10,10,0.92)', bd: 'rgba(220,38,38,0.55)', fg: '#fca5a5' }
      : design === 'neon' ? { bg: 'rgba(8,51,68,0.92)', bd: 'rgba(34,211,238,0.55)', fg: '#67e8f9' }
      : { bg: 'rgba(24,24,27,0.92)', bd: 'rgba(161,161,170,0.5)', fg: '#d4d4d8' };   // يشمل 'custom' و'file'
    return (
      <motion.div
        initial={{ y: -70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -70, opacity: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 220 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[295] px-5 py-2.5 rounded-2xl flex items-center gap-3 pointer-events-none"
        style={{ background: tone.bg, border: `1px solid ${tone.bd}`, backdropFilter: 'blur(10px)' }}
      >
        {/* المختصرة أثناء المباراة تبقى شريطاً هادئاً مهما كان التصميم —
            مسرح كامل في منتصف نقاش محتدم يقطع اللعب لا يزيّنه. */}
        <ChipsEmblem id={design === 'don' ? 'don' : design === 'seal' ? 'blood' : design === 'neon' ? 'neon' : 'smoke'} size={30} />
        <span className="text-xl font-black" style={{ fontFamily: 'Amiri, serif', color: tone.fg }}>{name}</span>
        <span className="text-[10px] font-mono tracking-[0.25em] uppercase" style={{ color: tone.fg, opacity: 0.6 }}>JOINED</span>
      </motion.div>
    );
  }

  // ── ✨ تشريفة مؤلَّفة — تمرّ من المسرح لا من فرع مكتوب بخطّ اليد ──
  //    الفروع الأربعة أدناه تبقى كما هي بلا لمس: من اشترى «موكب العرّاب»
  //    يراه كما رآه أمس. هذا المسار للتصاميم الجديدة وحدها.
  if (design === 'custom') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[295] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md pointer-events-none">
        <EntranceStage elements={data.elements} playerName={name} />
      </motion.div>
    );
  }

  const card = (size: 'sm' | 'md') => (
    <MafiaCard
      playerNumber={data.physicalId}
      playerName={name}
      role={null}
      gender={data.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
      isFlipped={false}
      flippable={false}
      isAlive
      size={size}
      avatarUrl={data.avatarUrl || null}
      rankTier={data.rankTier || 'INFORMANT'}
      cosmetics={data.cosmetics}
    />
  );

  const shell = 'fixed inset-0 z-[295] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md pointer-events-none';

  // ── 👑 موكب العرّاب ──
  if (design === 'don') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(197,160,89,0.25), transparent 60%)' }} />
        <motion.div
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute top-[16%] left-0 right-0 h-1.5"
          style={{ background: 'linear-gradient(90deg, transparent, #C5A059, #fde68a, #C5A059, transparent)' }}
        />
        <motion.div
          initial={{ y: -180, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 10, stiffness: 120, delay: 0.35 }}
          style={{ filter: 'drop-shadow(0 8px 22px rgba(197,160,89,0.55))' }}
        >
          <ChipsEmblem id="don" size={110} />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', damping: 12 }}
          className="text-6xl font-black text-[#C5A059] mt-2 mb-1 drop-shadow-[0_0_30px_rgba(197,160,89,0.6)]"
          style={{ fontFamily: 'Amiri, serif' }}
        >
          {name}
        </motion.h2>
        <p className="text-[#808080] text-sm tracking-[0.3em] uppercase mb-6">THE DON HAS ARRIVED</p>
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[400px] bg-[#C5A059]/35 blur-[60px] rounded-full -z-10" />
          {card('md')}
        </motion.div>
      </motion.div>
    );
  }

  // ── 🩸 ختم العائلة ──
  if (design === 'seal') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(138,3,3,0.3), transparent 60%)' }} />
        <motion.div
          initial={{ scale: 3.2, opacity: 0, rotate: -28 }} animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.2 }}
          className="w-40 h-40 rounded-full flex items-center justify-center mb-5"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #b91c1c, #8A0303 55%, #450a0a)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.75), inset 0 0 22px rgba(0,0,0,0.55), 0 0 50px rgba(138,3,3,0.5)',
            border: '6px solid #7f1d1d',
          }}
        >
          <span className="text-7xl font-black text-[#fecaca]" style={{ fontFamily: 'Amiri, serif', textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>م</span>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="text-5xl font-black text-[#fca5a5] mb-1"
          style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 28px rgba(138,3,3,0.7)' }}
        >
          {name}
        </motion.h2>
        <p className="text-[#808080] text-sm tracking-[0.3em] uppercase mb-5">SEALED BY THE FAMILY</p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          {card('sm')}
        </motion.div>
      </motion.div>
    );
  }

  // ── ⚡ لافتة النيون ──
  if (design === 'neon') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(34,211,238,0.15), transparent 60%)' }} />
        <h2
          className="entrance-flick text-7xl font-black mb-3"
          style={{ fontFamily: 'Amiri, serif', color: '#67e8f9', textShadow: '0 0 12px rgba(34,211,238,0.9), 0 0 34px rgba(34,211,238,0.6), 0 0 70px rgba(34,211,238,0.35)' }}
        >
          {name}
        </h2>
        <div className="entrance-flick h-1 w-72 rounded-full mb-7" style={{ background: '#ec4899', boxShadow: '0 0 14px rgba(236,72,153,0.9)' }} />
        <p className="text-[#808080] text-sm tracking-[0.3em] uppercase mb-5">NOW ENTERING THE CLUB</p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          {card('sm')}
        </motion.div>
      </motion.div>
    );
  }

  // ── 🗂️ الملف السري ──
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={shell}>
      <motion.div
        initial={{ x: -600, opacity: 0, rotate: -7 }} animate={{ x: 0, opacity: 1, rotate: -2 }}
        transition={{ type: 'spring', damping: 16, stiffness: 130 }}
        className="relative w-[520px] bg-[#141414] border border-[#3a3a3a] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
      >
        <div className="absolute -top-5 right-10 w-32 h-6 bg-[#141414] border border-b-0 border-[#3a3a3a] rounded-t-md" />
        <p className="absolute top-2 left-4 text-[10px] font-mono text-[#444] tracking-[0.3em]">TOP SECRET // MAFIA CLUB</p>
        <div className="flex items-center gap-5 mt-4">
          {card('sm')}
          <div className="text-right flex-1">
            <p className="text-[11px] font-mono text-[#555] tracking-widest mb-1">الاسم الحركي:</p>
            <h2 className="text-4xl font-black text-[#d4d4d8] mb-4" style={{ fontFamily: 'Amiri, serif' }}>{name}</h2>
            <p className="text-[11px] font-mono text-[#555] tracking-widest mb-1">الحالة:</p>
            <p className="text-sm font-mono text-[#a1a1aa]">قيد المراقبة…</p>
          </div>
        </div>
        <motion.div
          initial={{ scale: 2.8, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -14 }}
          transition={{ type: 'spring', damping: 11, stiffness: 260, delay: 0.85 }}
          className="absolute bottom-7 left-7 px-4 py-2 border-4 border-[#dc2626] rounded-md"
        >
          <span className="text-2xl font-black text-[#dc2626]" style={{ fontFamily: 'Amiri, serif' }}>وصل للتوّ</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
