'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';
import MafiaCard from '@/components/MafiaCard';
import { ChipsEmblem, type EmblemId } from '@/components/ChipsEmblems';

// ══════════════════════════════════════════════════════
// 🪙 معاينة إطارات متجر التشبس — على الكارد الحقيقي
// /card-demo/chips
// كل إطار مبني كـ rankEffectsOverride كامل يمر عبر محرك
// التأثيرات الفعلي في DynamicMafiaCard. العناصر التي لا
// يدعمها المحرك بعد تُعرض كطبقة «امتداد» قابلة للإخفاء.
// ══════════════════════════════════════════════════════

// ── كائن تأثيرات كامل (المحرك يقرأ كل المفاتيح مباشرة) ──
function fxBase(): any {
  return {
    border: { enabled: false, color: '#f59e0b', width: 2, inset: 0, style: 'solid', gradientColors: ['#f59e0b'], travelSpeed: 3 },
    glow: { enabled: false, color: '#f59e0b', size: 12, opacity: 0.4, pulseEnabled: false, pulseDuration: 2.5 },
    shimmer: { enabled: false, color: '#ffffff', opacity: 0.1, duration: 4 },
    particles: { enabled: false, count: 4, color: '#f59e0b', size: 3, orbitRadius: '90px', baseDuration: 5, animationType: 'orbit' },
    corners: { enabled: false, color: '#f59e0b', size: 12, width: 2, pulseEnabled: false },
    frame: { enabled: false, type: 'none', color: '#f59e0b', opacity: 0.7, strokeWidth: 1.5, animate: true },
    gradientOverlay: { enabled: false, color: '#f59e0b', opacity: 0.1, direction: 'to top' },
    floating: { enabled: false, content: '👑', position: 'top', size: 18, animation: 'float', glowColor: '#f59e0b' },
    badge: { enabled: false, emoji: '👑', label: '', bgColor: 'rgba(0,0,0,0.6)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)', position: 'top-left' },
    nameEffect: { enabled: false, color: '#ffffff', glowColor: '#f59e0b', glowSize: 8 },
  };
}

function fx(over: Record<string, any>): any {
  const b = fxBase();
  for (const k of Object.keys(over)) b[k] = { ...b[k], ...over[k] };
  return b;
}

// ── تعريف الإطارات الثمانية ──────────────────────────

type Rarity = 'common' | 'rare' | 'epic' | 'myth' | 'champ';

interface FrameDef {
  id: EmblemId;
  nameAr: string;
  rarity: Rarity;
  price: string;
  hook: string;
  pure: boolean;       // المحرك الحالي + الشعار يكفيان (لا primitives إضافية)
  extras?: string;     // الـ primitive الإضافي الناقص (غير الشعار)
  emblemSize: number;  // حجم الشعار فوق الكارد
  emblemTop: number;   // إزاحة الشعار عن حافة الكارد العليا
  fx: any;
  player: { number: number; name: string; role: string; gender: 'MALE' | 'FEMALE' };
}

const FRAMES: FrameDef[] = [
  {
    id: 'don', nameAr: 'تاج العرّاب', rarity: 'myth', price: '🪙 120 — موسمي محدود',
    hook: 'ذهب متحرك + تاج مرصّع يعلو البطاقة. يُعرف صاحبه من آخر الصالة.',
    pure: true, emblemSize: 66, emblemTop: -36,
    fx: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#b45309', '#fcd34d', '#f59e0b', '#fde68a'], width: 3, travelSpeed: 3 },
      glow: { enabled: true, color: '#f59e0b', size: 26, opacity: 0.55, pulseEnabled: true, pulseDuration: 2.2 },
      shimmer: { enabled: true, color: '#fde68a', opacity: 0.35, duration: 3 },
      particles: { enabled: true, count: 6, color: '#fcd34d', size: 3, orbitRadius: '95px', baseDuration: 6 },
      frame: { enabled: true, type: 'royal', color: '#f59e0b', opacity: 0.85, strokeWidth: 1.6, animate: true },
      gradientOverlay: { enabled: true, color: '#f59e0b', opacity: 0.12, direction: 'to top' },
      badge: { enabled: true, emoji: '👑', label: 'أسطوري', bgColor: 'rgba(69,26,3,0.75)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.5)' },
      nameEffect: { enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 10 },
    }),
    player: { number: 1, name: 'عبدالله', role: 'GODFATHER', gender: 'MALE' },
  },
  {
    id: 'blood', nameAr: 'قَسَم الدم', rarity: 'epic', price: '🪙 60',
    hook: 'نبض شرياني + خنجر القَسَم ينزف فوق البطاقة. لأصحاب الولاء الأعمى.',
    pure: false, extras: 'قطرات الدم', emblemSize: 66, emblemTop: -26,
    fx: fx({
      border: { enabled: true, style: 'gradient', gradientColors: ['#7f1d1d', '#ef4444', '#450a0a'], width: 3 },
      glow: { enabled: true, color: '#dc2626', size: 20, opacity: 0.5, pulseEnabled: true, pulseDuration: 1.5 },
      frame: { enabled: true, type: 'simple', color: '#b91c1c', opacity: 0.8, strokeWidth: 2, animate: false },
      gradientOverlay: { enabled: true, color: '#7f1d1d', opacity: 0.18, direction: 'to bottom' },
      badge: { enabled: true, emoji: '🩸', label: 'ملحمي', bgColor: 'rgba(69,10,10,0.75)', textColor: '#fca5a5', borderColor: 'rgba(220,38,38,0.5)' },
      nameEffect: { enabled: true, color: '#fca5a5', glowColor: '#dc2626', glowSize: 8 },
    }),
    player: { number: 2, name: 'طارق', role: 'MAFIA_REGULAR', gender: 'MALE' },
  },
  {
    id: 'neon', nameAr: 'نيون الليل', rarity: 'epic', price: '🪙 60',
    hook: 'لافتة نيون شخصية: سبيد سماوي داخل حلقة وردية يرفّان رفة كهرباء حقيقية.',
    pure: false, extras: 'رفّة النيون', emblemSize: 58, emblemTop: -30,
    fx: fx({
      border: { enabled: true, style: 'solid', color: '#22d3ee', width: 2, inset: 2 },
      glow: { enabled: true, color: '#22d3ee', size: 24, opacity: 0.6, pulseEnabled: true, pulseDuration: 3.2 },
      frame: { enabled: true, type: 'simple', color: '#ec4899', opacity: 0.9, strokeWidth: 2, animate: false },
      gradientOverlay: { enabled: true, color: '#0ea5e9', opacity: 0.08, direction: 'to top' },
      badge: { enabled: true, emoji: '⚡', label: 'ملحمي', bgColor: 'rgba(8,51,68,0.75)', textColor: '#67e8f9', borderColor: 'rgba(34,211,238,0.5)' },
      nameEffect: { enabled: true, color: '#67e8f9', glowColor: '#06b6d4', glowSize: 10 },
    }),
    player: { number: 3, name: 'نورة', role: 'SHERIFF', gender: 'FEMALE' },
  },
  {
    id: 'bullet', nameAr: 'رصاص ونحاس', rarity: 'rare', price: '🪙 35',
    hook: 'آرت-ديكو نحاسي بثقوب رصاص ورصاصتين متقاطعتين. ثابت بلا وميض.',
    pure: false, extras: 'ثقوب الرصاص (ثابتة)', emblemSize: 60, emblemTop: -26,
    fx: fx({
      border: { enabled: true, style: 'solid', color: '#b45309', width: 2 },
      glow: { enabled: true, color: '#d97706', size: 10, opacity: 0.3 },
      frame: { enabled: true, type: 'deco', color: '#d97706', opacity: 0.9, strokeWidth: 1.6, animate: false },
      badge: { enabled: true, emoji: '🎯', label: 'نادر', bgColor: 'rgba(69,39,3,0.75)', textColor: '#fbbf24', borderColor: 'rgba(217,119,6,0.5)' },
    }),
    player: { number: 4, name: 'عمر', role: 'SNIPER', gender: 'MALE' },
  },
  {
    id: 'smoke', nameAr: 'دخان الحانة', rarity: 'rare', price: '🪙 35',
    hook: 'نوار كلاسيكي: فيدورا تعتمر البطاقة ودخان يتصاعد بلا توقف.',
    pure: false, extras: 'الدخان الصاعد', emblemSize: 62, emblemTop: -30,
    fx: fx({
      border: { enabled: true, style: 'solid', color: '#71717a', width: 2 },
      glow: { enabled: true, color: '#a1a1aa', size: 14, opacity: 0.35, pulseEnabled: true, pulseDuration: 4 },
      frame: { enabled: true, type: 'simple', color: '#d4d4d8', opacity: 0.7, strokeWidth: 1.2, animate: false },
      gradientOverlay: { enabled: true, color: '#ffffff', opacity: 0.06, direction: 'to bottom' },
      badge: { enabled: true, emoji: '🚬', label: 'نادر', bgColor: 'rgba(39,39,42,0.75)', textColor: '#d4d4d8', borderColor: 'rgba(161,161,170,0.5)' },
    }),
    player: { number: 5, name: 'خالد', role: 'DOCTOR', gender: 'MALE' },
  },
  {
    id: 'deal', nameAr: 'طاولة القمار', rarity: 'rare', price: '🪙 35',
    hook: 'جوخ أخضر + رقاقة كازينو تدور فوق البطاقة ورقاقات ذهبية حول صورتك.',
    pure: true, emblemSize: 54, emblemTop: -28,
    fx: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#064e3b', '#10b981', '#065f46', '#34d399'], width: 2.5, travelSpeed: 5 },
      glow: { enabled: true, color: '#10b981', size: 18, opacity: 0.45, pulseEnabled: true, pulseDuration: 3 },
      particles: { enabled: true, count: 5, color: '#fbbf24', size: 4, orbitRadius: '85px', baseDuration: 7 },
      frame: { enabled: true, type: 'simple', color: '#10b981', opacity: 0.8, strokeWidth: 1.5, animate: false },
      badge: { enabled: true, emoji: '♠️', label: 'نادر', bgColor: 'rgba(6,78,59,0.75)', textColor: '#6ee7b7', borderColor: 'rgba(16,185,129,0.5)' },
    }),
    player: { number: 6, name: 'سارة', role: 'JESTER', gender: 'FEMALE' },
  },
  {
    id: 'crime', nameAr: 'مسرح الجريمة', rarity: 'common', price: '🪙 20',
    hook: 'شريط الشرطة ورسم الطبشورة. «المضحك» الذي يفتح باب أول شراء.',
    pure: false, extras: 'شريط الشرطة', emblemSize: 52, emblemTop: -24,
    fx: fx({
      border: { enabled: true, style: 'solid', color: '#eab308', width: 2 },
      glow: { enabled: true, color: '#eab308', size: 10, opacity: 0.3 },
      badge: { enabled: true, emoji: '🚧', label: 'شائع', bgColor: 'rgba(66,50,3,0.75)', textColor: '#fde047', borderColor: 'rgba(234,179,8,0.5)' },
    }),
    player: { number: 7, name: 'سعد', role: 'CITIZEN', gender: 'MALE' },
  },
  {
    id: 'champ', nameAr: 'إكليل البطل', rarity: 'champ', price: 'لا يُشترى — بطل الموسم فقط',
    hook: 'إكليل غار بلاتيني بنجمة البطولة. معروض في المتجر كإعلان دائم عن التنافس.',
    pure: true, emblemSize: 70, emblemTop: -34,
    fx: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#94a3b8', '#f8fafc', '#cbd5e1', '#e2e8f0'], width: 3, travelSpeed: 4 },
      glow: { enabled: true, color: '#e2e8f0', size: 22, opacity: 0.5, pulseEnabled: true, pulseDuration: 2.8 },
      shimmer: { enabled: true, color: '#ffffff', opacity: 0.4, duration: 2.6 },
      particles: { enabled: true, count: 4, color: '#f1f5f9', size: 3, orbitRadius: '92px', baseDuration: 6 },
      frame: { enabled: true, type: 'greek', color: '#cbd5e1', opacity: 0.8, strokeWidth: 1.4, animate: true },
      badge: { enabled: true, emoji: '🏆', label: 'إنجاز فقط', bgColor: 'rgba(30,41,59,0.75)', textColor: '#f1f5f9', borderColor: 'rgba(203,213,225,0.5)' },
      nameEffect: { enabled: true, color: '#f1f5f9', glowColor: '#94a3b8', glowSize: 8 },
    }),
    player: { number: 8, name: 'ريم', role: 'MAYOR', gender: 'FEMALE' },
  },
];

const RARITY_STYLE: Record<Rarity, { label: string; cls: string }> = {
  common: { label: 'شائع', cls: 'bg-zinc-800 text-zinc-300 border-zinc-600' },
  rare: { label: 'نادر', cls: 'bg-sky-950 text-sky-300 border-sky-700' },
  epic: { label: 'ملحمي', cls: 'bg-purple-950 text-purple-300 border-purple-700' },
  myth: { label: 'أسطوري', cls: 'bg-amber-950 text-amber-300 border-amber-600' },
  champ: { label: 'بطل الموسم', cls: 'bg-slate-800 text-slate-200 border-slate-500' },
};

// ── طبقة الامتداد: عناصر لا يدعمها المحرك الحالي بعد ──

function ExtraLayer({ id }: { id: string }) {
  switch (id) {
    case 'blood':
      return (
        <>
          {[{ l: '22%', d: '0s', h: 22 }, { l: '52%', d: '1.1s', h: 30 }, { l: '78%', d: '2.2s', h: 18 }].map((p, i) => (
            <div key={i} className="chips-drip" style={{ left: p.l, height: p.h, animationDelay: p.d }} />
          ))}
        </>
      );
    case 'neon':
      return <div className="chips-neonline" />;
    case 'bullet':
      return (
        <>
          {[{ t: '12%', l: '14%' }, { t: '30%', r: '10%' }, { b: '20%', l: '20%' }].map((p, i) => (
            <div key={i} className="chips-hole" style={p as React.CSSProperties} />
          ))}
        </>
      );
    case 'smoke':
      return (
        <>
          {[{ l: '20%', d: '0s' }, { l: '48%', d: '1.7s' }, { l: '70%', d: '3.4s' }].map((p, i) => (
            <div key={i} className="chips-smoke" style={{ left: p.l, animationDelay: p.d }} />
          ))}
        </>
      );
    case 'deal':
      return (
        <>
          <span className="chips-suit" style={{ top: 6, left: 8, color: '#f87171' }}>♥</span>
          <span className="chips-suit" style={{ top: 6, right: 8, color: '#f87171' }}>♦</span>
          <span className="chips-suit" style={{ bottom: 6, left: 8, color: '#e4e4e7' }}>♣</span>
          <span className="chips-suit" style={{ bottom: 6, right: 8, color: '#e4e4e7' }}>♠</span>
        </>
      );
    case 'crime':
      return (
        <>
          <div className="chips-tape" style={{ top: '18%', transform: 'rotate(-12deg)' }}>⚠ CRIME SCENE ⚠ مسرح الجريمة ⚠</div>
          <div className="chips-tape" style={{ bottom: '14%', transform: 'rotate(9deg)' }}>⚠ DO NOT CROSS ⚠ ممنوع الاقتراب ⚠</div>
        </>
      );
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════
// 🖥️ محاكاة شاشة العرض — طبق الأصل عن display/page.tsx
// نفس الخلفية (display-bg + blood-vignette)، نفس روستر
// اللوبي (ACTIVE ROSTER + MafiaCard + AnimatePresence)،
// نفس نمط أوفرلاي «اختيار رابح»، ونفس مراحل RevealCeremony
// ══════════════════════════════════════════════════════

interface SimPlayer { id: number; name: string; gender: 'MALE' | 'FEMALE'; rankTier: string; alive: boolean }

const SIM_BASE: SimPlayer[] = [
  { id: 3, name: 'أحمد', gender: 'MALE', rankTier: 'SOLDIER', alive: true },
  { id: 5, name: 'شهد', gender: 'FEMALE', rankTier: 'CAPO', alive: true },
  { id: 7, name: 'قصي', gender: 'MALE', rankTier: 'INFORMANT', alive: true },
  { id: 9, name: 'لين', gender: 'FEMALE', rankTier: 'UNDERBOSS', alive: true },
  { id: 11, name: 'زيد', gender: 'MALE', rankTier: 'INFORMANT', alive: true },
];

type EntranceKey = 'don' | 'seal' | 'neon' | 'file';

const ENTRANCES: { key: EntranceKey; label: string; price: string; joiner: SimPlayer }[] = [
  { key: 'don', label: 'موكب العرّاب', price: '🪙 50', joiner: { id: 12, name: 'عبدالرزاق', gender: 'MALE', rankTier: 'GODFATHER', alive: true } },
  { key: 'seal', label: 'ختم العائلة', price: '🪙 35', joiner: { id: 13, name: 'ليث', gender: 'MALE', rankTier: 'CAPO', alive: true } },
  { key: 'neon', label: 'لافتة النيون', price: '🪙 35', joiner: { id: 14, name: 'دانة', gender: 'FEMALE', rankTier: 'SOLDIER', alive: true } },
  { key: 'file', label: 'الملف السري', price: '🪙 25', joiner: { id: 15, name: 'سيف', gender: 'MALE', rankTier: 'INFORMANT', alive: true } },
];

// مقياس الحاوية: الشاشة مُصمَّمة 1280×720 ثم تُصغَّر لتلائم العرض
function useSimScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.55);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setScale(e.contentRect.width / 1280);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, scale };
}

// ── رسائل الدخول الأربعة (نمط أوفرلاي «اختيار رابح» الحقيقي) ──
function EntranceOverlay({ design, player }: { design: EntranceKey; player: SimPlayer }) {
  const base = 'absolute inset-0 z-[300] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md';
  if (design === 'don') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={base}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(197,160,89,0.25), transparent 60%)' }} />
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="absolute top-[16%] left-0 right-0 h-1.5" style={{ background: 'linear-gradient(90deg, transparent, #C5A059, #fde68a, #C5A059, transparent)' }} />
        <motion.div initial={{ y: -160, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 10, stiffness: 120, delay: 0.4 }} style={{ filter: 'drop-shadow(0 8px 20px rgba(197,160,89,0.5))' }}>
          <ChipsEmblem id="don" size={92} />
        </motion.div>
        <motion.h2 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7, type: 'spring', damping: 12 }} className="text-6xl font-black text-[#C5A059] mb-1 drop-shadow-[0_0_30px_rgba(197,160,89,0.6)]" style={{ fontFamily: 'Amiri, serif' }}>
          {player.name}
        </motion.h2>
        <p className="text-[#808080] text-sm tracking-[0.3em] uppercase mb-6">THE DON HAS ARRIVED</p>
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[380px] bg-[#C5A059]/35 blur-[60px] rounded-full pointer-events-none -z-10" />
          <MafiaCard playerNumber={player.id} playerName={player.name} role={null} gender={player.gender} flippable={false} isAlive size="md" rankTier={player.rankTier} className="shadow-[0_0_60px_rgba(197,160,89,0.6)] border-2 border-[#C5A059] rounded-2xl" />
        </motion.div>
        <p className="mt-4 text-[10px] font-mono text-[#555] tracking-[0.3em] uppercase">تشريفة الدخول: موكب العرّاب — 🪙 50</p>
      </motion.div>
    );
  }
  if (design === 'seal') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={base}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(138,3,3,0.3), transparent 60%)' }} />
        <motion.div
          initial={{ scale: 3, opacity: 0, rotate: -25 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.25 }}
          className="w-32 h-32 rounded-full flex items-center justify-center mb-4"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #b91c1c, #8A0303 55%, #450a0a)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.7), inset 0 0 18px rgba(0,0,0,0.55), 0 0 40px rgba(138,3,3,0.5)',
            border: '5px solid #7f1d1d',
          }}
        >
          <span className="text-6xl font-black text-[#fecaca]" style={{ fontFamily: 'Amiri, serif', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>م</span>
        </motion.div>
        <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="text-5xl font-black text-[#fca5a5] mb-1" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 25px rgba(138,3,3,0.7)' }}>
          {player.name}
        </motion.h2>
        <p className="text-[#808080] text-sm tracking-[0.3em] uppercase mb-5">SEALED BY THE FAMILY</p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <MafiaCard playerNumber={player.id} playerName={player.name} role={null} gender={player.gender} flippable={false} isAlive size="sm" rankTier={player.rankTier} className="shadow-[0_0_40px_rgba(138,3,3,0.5)] border-2 border-[#8A0303]/70 rounded-2xl" />
        </motion.div>
        <p className="mt-4 text-[10px] font-mono text-[#555] tracking-[0.3em] uppercase">تشريفة الدخول: ختم العائلة — 🪙 35</p>
      </motion.div>
    );
  }
  if (design === 'neon') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={base}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(34,211,238,0.15), transparent 60%)' }} />
        <h2 className="emblem-flick text-7xl font-black mb-2" style={{ fontFamily: 'Amiri, serif', color: '#67e8f9', textShadow: '0 0 10px rgba(34,211,238,0.9), 0 0 30px rgba(34,211,238,0.6), 0 0 60px rgba(34,211,238,0.35)' }}>
          {player.name}
        </h2>
        <div className="emblem-flick h-1 w-64 rounded-full mb-6" style={{ background: '#ec4899', boxShadow: '0 0 12px rgba(236,72,153,0.9)' }} />
        <p className="text-[#808080] text-sm tracking-[0.3em] uppercase mb-5">NOW ENTERING THE CLUB</p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <MafiaCard playerNumber={player.id} playerName={player.name} role={null} gender={player.gender} flippable={false} isAlive size="sm" rankTier={player.rankTier} className="shadow-[0_0_40px_rgba(34,211,238,0.45)] border-2 border-[#22d3ee]/60 rounded-2xl" />
        </motion.div>
        <p className="mt-4 text-[10px] font-mono text-[#555] tracking-[0.3em] uppercase">تشريفة الدخول: لافتة النيون — 🪙 35</p>
      </motion.div>
    );
  }
  // design === 'file' — الملف السري
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={base}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(161,161,170,0.1), transparent 60%)' }} />
      <motion.div
        initial={{ x: -500, opacity: 0, rotate: -6 }}
        animate={{ x: 0, opacity: 1, rotate: -2 }}
        transition={{ type: 'spring', damping: 16, stiffness: 130 }}
        className="relative w-[430px] bg-[#141414] border border-[#3a3a3a] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
      >
        <div className="absolute -top-4 right-8 w-28 h-5 bg-[#141414] border border-b-0 border-[#3a3a3a] rounded-t-md" />
        <p className="absolute top-2 left-3 text-[9px] font-mono text-[#444] tracking-[0.3em]">TOP SECRET // MAFIA CLUB</p>
        <div className="flex items-center gap-4 mt-3">
          <MafiaCard playerNumber={player.id} playerName={player.name} role={null} gender={player.gender} flippable={false} isAlive size="sm" rankTier={player.rankTier} />
          <div className="text-right flex-1">
            <p className="text-[10px] font-mono text-[#555] tracking-widest mb-1">الاسم الحركي:</p>
            <h2 className="text-4xl font-black text-[#d4d4d8] mb-3" style={{ fontFamily: 'Amiri, serif' }}>{player.name}</h2>
            <p className="text-[10px] font-mono text-[#555] tracking-widest mb-1">الحالة:</p>
            <p className="text-sm font-mono text-[#a1a1aa]">قيد المراقبة…</p>
          </div>
        </div>
        <motion.div
          initial={{ scale: 2.6, opacity: 0, rotate: -14 }}
          animate={{ scale: 1, opacity: 1, rotate: -14 }}
          transition={{ type: 'spring', damping: 11, stiffness: 260, delay: 0.9 }}
          className="absolute bottom-6 left-6 px-3 py-1.5 border-4 border-[#dc2626] rounded-md"
        >
          <span className="text-xl font-black text-[#dc2626]" style={{ fontFamily: 'Amiri, serif' }}>وصل للتوّ</span>
        </motion.div>
      </motion.div>
      <p className="mt-5 text-[10px] font-mono text-[#555] tracking-[0.3em] uppercase">تشريفة الدخول: الملف السري — 🪙 25</p>
    </motion.div>
  );
}

// ── مراسم الإقصاء (نسخة RevealCeremony) + طبقة الحرق المدفوعة ──
type BurnStage = 'facedown' | 'flipping' | 'revealed' | 'burning' | 'grayed';

function BurnCeremony({ player, stage }: { player: SimPlayer; stage: BurnStage }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[200] flex flex-col items-center justify-center" style={{ background: 'rgba(5,5,5,0.97)' }}>
      <motion.div className="absolute inset-0 pointer-events-none" animate={{ opacity: [0, 0.15, 0] }} transition={{ duration: 3, repeat: Infinity }} style={{ background: 'radial-gradient(ellipse at center, rgba(138,3,3,0.3) 0%, transparent 60%)' }} />
      <div className="text-center mb-8">
        <h1 className="text-5xl font-black text-white uppercase tracking-widest mb-2" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 40px rgba(138,3,3,0.5)' }}>تم الإقصاء</h1>
        <p className="text-[#808080] font-mono text-sm tracking-[0.5em] uppercase">IDENTITY DECLASSIFIED</p>
      </div>
      <div className="z-10" style={{ transform: 'scale(1.15)' }}>
        <div className={`relative transition-all duration-1000 ${stage === 'grayed' ? 'grayscale opacity-70' : ''} ${stage === 'flipping' ? 'animate-pulse' : ''}`} style={{ perspective: '1200px' }}>
          {(stage === 'flipping' || stage === 'revealed') && (
            <motion.div className="absolute -inset-3 rounded-2xl z-0" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.8, 0] }} transition={{ duration: 1.5, repeat: stage === 'flipping' ? Infinity : 0 }} style={{ background: 'linear-gradient(135deg, rgba(138,3,3,0.4), rgba(220,38,38,0.2))', boxShadow: '0 0 40px rgba(138,3,3,0.5)' }} />
          )}
          <div className="relative z-10">
            <MafiaCard playerNumber={player.id} playerName={player.name} role="MAFIA_REGULAR" isFlipped={stage !== 'facedown'} flippable={false} isAlive={stage !== 'grayed'} size="md" rankTier={player.rankTier} />
          </div>
          {stage === 'burning' && (
            <div className="absolute inset-0 z-20 rounded-2xl overflow-hidden pointer-events-none">
              <div className="burn-char" />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="burn-flame" style={{ left: `${4 + i * 13}%`, animationDelay: `${i * 0.18}s`, height: `${34 + (i % 3) * 14}%` }} />
              ))}
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`e${i}`} className="burn-ember" style={{ left: `${8 + i * 9}%`, animationDelay: `${i * 0.3}s` }} />
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-8 text-sm font-mono tracking-[0.3em] uppercase text-[#808080]">
        {stage === 'burning' ? '🔥 موت بالنار — أنيميشن الإقصاء المدفوع 🪙 40' : stage === 'grayed' ? 'ELIMINATION COMPLETE' : 'ELIMINATION PROTOCOL'}
      </p>
    </motion.div>
  );
}

// ── لحظة النصر (نسخة winner-buildup) + موضع نغمة النصر ──
function VictoryBuildup() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[250] flex flex-col items-center justify-center overflow-hidden" style={{ background: 'radial-gradient(ellipse at center, rgba(138,3,3,0.35) 0%, rgba(0,0,0,0.92) 70%)' }}>
      <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(138,3,3,0.35) 0%, transparent 60%)' }} animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="text-[9rem] leading-none" style={{ filter: 'drop-shadow(0 0 60px rgba(138,3,3,0.6))' }} animate={{ scale: [0.85, 1.12, 0.95, 1.05], rotate: [0, -4, 4, 0] }} transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}>
        🩸
      </motion.div>
      <motion.p className="mt-4 font-black tracking-[0.4em] text-3xl" style={{ color: '#8A0303', fontFamily: 'Amiri, serif' }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }}>
        النتيجة قادمة…
      </motion.p>
      <div className="mt-8 w-64 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div className="h-full rounded-full" style={{ background: '#8A0303' }} initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 5, ease: 'linear' }} />
      </div>
      <div className="mt-8 flex items-center gap-3 px-5 py-2.5 rounded-full border border-[#8A0303]/50 bg-black/50">
        <div className="flex items-end gap-[3px]">
          {[8, 15, 10, 19, 7].map((h, i) => (
            <div key={i} className="victory-eq" style={{ height: h, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <span className="text-[11px] font-mono text-[#fca5a5] tracking-widest">نغمة النصر الخاصة بالفائز — تُعزف عبر مكبّر القائد 🪙 15</span>
      </div>
    </motion.div>
  );
}

// ── حاوية المحاكاة الرئيسية ──
function DisplaySim() {
  const { ref, scale } = useSimScale();
  const [players, setPlayers] = useState<SimPlayer[]>(SIM_BASE);
  const [entrance, setEntrance] = useState<{ design: EntranceKey; player: SimPlayer } | null>(null);
  const [burn, setBurn] = useState<{ player: SimPlayer; stage: BurnStage } | null>(null);
  const [victory, setVictory] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = !!entrance || !!burn || victory;

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const runEntrance = (e: (typeof ENTRANCES)[number]) => {
    if (busy) return;
    setPlayers(p => p.filter(x => x.id !== e.joiner.id));
    setEntrance({ design: e.key, player: e.joiner });
    later(() => { setEntrance(null); setPlayers(p => [...p, e.joiner]); }, 3500);
  };

  const runBurn = () => {
    if (busy) return;
    const victim = players[1] || players[0];
    if (!victim) return;
    setBurn({ player: victim, stage: 'facedown' });
    const seq: [BurnStage, number][] = [['flipping', 700], ['revealed', 2100], ['burning', 3300], ['grayed', 5100]];
    seq.forEach(([st, t]) => later(() => setBurn(b => (b ? { ...b, stage: st } : b)), t));
    later(() => { setBurn(null); setPlayers(p => p.filter(x => x.id !== victim.id)); }, 6600);
  };

  const runVictory = () => { if (busy) return; setVictory(true); later(() => setVictory(false), 5300); };
  const reset = () => { timers.current.forEach(clearTimeout); timers.current = []; setPlayers(SIM_BASE); setEntrance(null); setBurn(null); setVictory(false); };

  return (
    <div className="max-w-7xl mx-auto mt-20">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-black text-zinc-200 mb-2" style={{ fontFamily: 'Amiri, serif' }}>
          🖥️ محاكاة شاشة العرض — متى تظهر العناصر وكيف
        </h2>
        <p className="text-zinc-500 text-sm max-w-3xl mx-auto leading-relaxed">
          نسخة طبق الأصل عن صفحة العرض الحقيقية: نفس الخلفية والـvignette، نفس روستر اللوبي (ACTIVE ROSTER)،
          نفس نمط أوفرلاي «اختيار رابح» للتشريفات، ونفس مراحل مراسم الإقصاء. حالياً في النظام الفعلي
          <b className="text-amber-400"> لا يوجد أي إعلان دخول</b> — اللاعب «يظهر» في الروستر بصمت، وهنا بالضبط قيمة تشريفة الدخول.
        </p>
      </div>

      {/* أزرار التشغيل */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
        {ENTRANCES.map(e => (
          <button key={e.key} onClick={() => runEntrance(e)} disabled={busy}
            className="px-4 py-2 bg-[#111] border border-[#C5A059]/40 text-[#C5A059] font-mono text-[11px] tracking-wider uppercase hover:bg-[#C5A059]/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            🚪 دخول: {e.label} <span className="text-zinc-500">{e.price}</span>
          </button>
        ))}
        <button onClick={runBurn} disabled={busy || players.length === 0}
          className="px-4 py-2 bg-[#111] border border-red-900/50 text-red-400 font-mono text-[11px] tracking-wider uppercase hover:bg-red-900/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          🔥 إقصاء: موت بالنار 🪙 40
        </button>
        <button onClick={runVictory} disabled={busy}
          className="px-4 py-2 bg-[#111] border border-[#8A0303]/50 text-[#fca5a5] font-mono text-[11px] tracking-wider uppercase hover:bg-[#8A0303]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          🔊 نغمة النصر 🪙 15
        </button>
        <button onClick={reset}
          className="px-4 py-2 bg-[#111] border border-zinc-700 text-zinc-400 font-mono text-[11px] tracking-wider uppercase hover:bg-zinc-800 transition-all">
          ↺ إعادة
        </button>
      </div>

      {/* الشاشة المُصغَّرة 1280×720 */}
      <div ref={ref} className="w-full rounded-xl border border-[#2a2a2a] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)]" style={{ height: 720 * scale }}>
        <div className="relative overflow-hidden flex flex-col items-center justify-center font-sans" style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {/* display-bg الحقيقية */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 0%, #111111 0%, #050505 70%)' }} />
          {/* blood-vignette (absolute بدل fixed لتبقى داخل الإطار) */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at top left, rgba(138,3,3,0.3) 0%, transparent 50%), radial-gradient(ellipse at top right, rgba(138,3,3,0.25) 0%, transparent 50%), radial-gradient(ellipse at bottom left, rgba(138,3,3,0.15) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(138,3,3,0.25) 0%, transparent 50%), radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)',
          }} />

          {/* اللوبي — كما في الصفحة الحقيقية */}
          <div className="relative z-10 w-full h-full flex flex-col px-10 pt-10">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-2 mb-6">
              <p className="text-[#555] text-sm tracking-[0.3em] uppercase">ACTIVE ROSTER</p>
              <p className="text-[#808080] text-xs font-mono tracking-widest uppercase">SATURDAY NIGHT — MAFIA CLUB</p>
            </div>
            <div className="flex flex-wrap justify-center gap-6 w-full pb-12 overflow-visible">
              <AnimatePresence mode="popLayout">
                {players.filter(p => p.alive).map((p, i) => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ delay: i * 0.05 }} className="relative">
                    <MafiaCard playerNumber={p.id} playerName={p.name} role={null} gender={p.gender} isFlipped={false} flippable={false} showVoting={false} isAlive size="md" rankTier={p.rankTier} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* الأوفرلايات — فوق كل شيء كما في نمط «اختيار رابح» */}
          <AnimatePresence>
            {entrance && <EntranceOverlay key="ent" design={entrance.design} player={entrance.player} />}
            {burn && <BurnCeremony key="burn" player={burn.player} stage={burn.stage} />}
            {victory && <VictoryBuildup key="vic" />}
          </AnimatePresence>
        </div>
      </div>
      <p className="text-zinc-600 text-xs text-center mt-3">
        التشريفة 3.5 ثانية ثم يهبط اللاعب إلى الروستر — وأثناء المباريات الجارية تُعرض نسخة صامتة مختصرة كي لا تقطع النقاش (قاعدة إنتاج مثبتة في الخطة).
      </p>
    </div>
  );
}

// ── الألقاب على الكارد — جرّب قبل الشراء ──
const TITLE_OPTIONS = [
  { key: 'none', btn: 'بلا لقب', text: null as string | null, cls: '' },
  { key: 'gold', btn: '☠️ سفّاح الليل (ذهبي) 🪙 25', text: '☠️ سفّاح الليل', cls: 'title-gold' },
  { key: 'blood', btn: '🩸 صوت العائلة (دموي) 🪙 25', text: '🩸 صوت العائلة', cls: 'title-blood' },
  { key: 'ghost', btn: '👻 الشبح (متلاشٍ) 🪙 25', text: '👻 الشبح', cls: 'title-ghost' },
];

function TitleShowcase({ cardSize }: { cardSize: 'sm' | 'md' | 'lg' }) {
  const [sel, setSel] = useState('gold');
  const t = TITLE_OPTIONS.find(o => o.key === sel)!;
  return (
    <div className="max-w-7xl mx-auto mt-20 text-center">
      <h2 className="text-2xl md:text-3xl font-black text-zinc-200 mb-2" style={{ fontFamily: 'Amiri, serif' }}>
        🏷️ الألقاب على الكارد — جرّب قبل الشراء
      </h2>
      <p className="text-zinc-500 text-sm max-w-2xl mx-auto mb-6 leading-relaxed">
        اللقب لوحة صغيرة تحت اسم اللاعب على الوجه الأمامي — يظهر في اللوبي وعلى شاشة العرض طوال الأمسية.
        بدّل بين الأنماط لتحكم على القيمة (هذه تجربة «القياس قبل الشراء» نفسها المخططة للمتجر).
      </p>
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {TITLE_OPTIONS.map(o => (
          <button key={o.key} onClick={() => setSel(o.key)}
            className={`px-4 py-2 border font-mono text-[11px] tracking-wider transition-all ${sel === o.key ? 'bg-[#C5A059]/15 border-[#C5A059]/60 text-[#C5A059]' : 'bg-[#111] border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
            {o.btn}
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        <div className="relative">
          <DynamicMafiaCard playerNumber={17} playerName="مالك اللقب" role="CITIZEN" gender="MALE" size={cardSize} rankTier="CAPO" flippable={false} />
          {t.text && <div className={`title-plaque ${t.cls}`}>{t.text}</div>}
        </div>
      </div>
    </div>
  );
}

// ── الصفحة ────────────────────────────────────────────

export default function ChipsFramesPreviewPage() {
  const [cardSize, setCardSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [showVoting, setShowVoting] = useState(false);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [extrasOn, setExtrasOn] = useState(true);

  const toggleFlip = (id: string) => setFlipped(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-10" dir="rtl">
      <style>{`
        @keyframes chips-drip-fall {
          0% { transform: scaleY(0.25); opacity: 0.9; }
          55% { transform: scaleY(1); opacity: 0.95; }
          80% { transform: scaleY(0.9); opacity: 0.6; }
          100% { transform: scaleY(0.25); opacity: 0.9; }
        }
        .chips-drip {
          position: absolute; top: 0; width: 5px;
          background: linear-gradient(to bottom, #7f1d1d, #dc2626 70%, #ef4444);
          border-radius: 0 0 50% 50%;
          transform-origin: top;
          animation: chips-drip-fall 3.2s ease-in-out infinite;
          box-shadow: 0 0 4px rgba(220,38,38,0.5);
        }
        @keyframes chips-neon-flick {
          0%, 100% { opacity: 1; }
          7% { opacity: 0.35; } 8% { opacity: 1; }
          9.5% { opacity: 0.5; } 10.5% { opacity: 1; }
          48% { opacity: 1; } 49% { opacity: 0.3; } 50% { opacity: 1; }
          84% { opacity: 1; } 85% { opacity: 0.45; } 86.5% { opacity: 1; }
        }
        .chips-neonline {
          position: absolute; inset: 2px; border-radius: 1rem;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 14px rgba(34,211,238,0.8), inset 0 0 10px rgba(34,211,238,0.3);
          animation: chips-neon-flick 4.2s steps(1, end) infinite;
        }
        .chips-hole {
          position: absolute; width: 11px; height: 11px; border-radius: 50%;
          background: radial-gradient(circle, #000 32%, #3f2f18 55%, rgba(180,120,50,0.65) 72%, transparent 78%);
          box-shadow: inset 0 0 5px rgba(0,0,0,0.9), 0 0 4px rgba(217,119,6,0.45);
        }
        @keyframes chips-smoke-rise {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          20% { opacity: 0.45; }
          100% { transform: translateY(-130px) scale(1.7); opacity: 0; }
        }
        .chips-smoke {
          position: absolute; bottom: 28%; width: 28px; height: 28px; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%);
          filter: blur(4px);
          animation: chips-smoke-rise 5s ease-out infinite;
        }
        .chips-suit { position: absolute; font-size: 13px; opacity: 0.55; line-height: 1; }
        .chips-tape {
          position: absolute; left: -18%; width: 136%;
          background: #eab308; color: #111; font-weight: 900; font-size: 8px;
          letter-spacing: 0.15em; text-align: center; padding: 3px 0;
          border-top: 1.5px solid #111; border-bottom: 1.5px solid #111;
          box-shadow: 0 2px 6px rgba(0,0,0,0.6);
          white-space: nowrap; overflow: hidden;
        }
        /* ── حركات الشعارات ── */
        @keyframes emblem-float-kf {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .emblem-float { animation: emblem-float-kf 3s ease-in-out infinite; }
        @keyframes emblem-spark-kf {
          0%, 100% { opacity: 0.15; transform: scale(0.7); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .emblem-spark { animation: emblem-spark-kf 2.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes emblem-drop-kf {
          0% { transform: translateY(0) scale(0.4); opacity: 0; }
          30% { transform: translateY(0) scale(1); opacity: 1; }
          75% { transform: translateY(12px) scale(1); opacity: 0.9; }
          100% { transform: translateY(26px) scale(0.9); opacity: 0; }
        }
        .emblem-drop { animation: emblem-drop-kf 2.6s ease-in infinite; }
        @keyframes emblem-wisp-kf {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50% { opacity: 0.65; transform: translateY(-3px); }
        }
        .emblem-smoke-wisp { animation: emblem-wisp-kf 3.5s ease-in-out infinite; }
        @keyframes emblem-spin-kf {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .emblem-spin { animation: emblem-spin-kf 14s linear infinite; }
        .emblem-flick { animation: chips-neon-flick 4.2s steps(1, end) infinite; }
        /* ── الحرق (أنيميشن الإقصاء المدفوع) ── */
        @keyframes burn-flame-kf {
          0%, 100% { transform: scaleY(0.75) scaleX(0.95); }
          50% { transform: scaleY(1.15) scaleX(1.05); }
        }
        .burn-flame {
          position: absolute; bottom: 0; width: 15%;
          transform-origin: bottom; border-radius: 50% 50% 20% 20%;
          background: radial-gradient(ellipse at 50% 100%, rgba(254,240,138,0.95) 0%, rgba(249,115,22,0.85) 35%, rgba(220,38,38,0.5) 65%, transparent 82%);
          filter: blur(3px);
          animation: burn-flame-kf 0.55s ease-in-out infinite;
        }
        @keyframes burn-ember-kf {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(-330px) scale(0.3); opacity: 0; }
        }
        .burn-ember {
          position: absolute; bottom: 12%; width: 5px; height: 5px; border-radius: 50%;
          background: #fb923c; box-shadow: 0 0 6px #f97316;
          animation: burn-ember-kf 1.6s ease-out infinite;
        }
        @keyframes burn-char-kf { 0% { opacity: 0; } 100% { opacity: 0.85; } }
        .burn-char {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(20,10,5,0.55) 55%, transparent);
          animation: burn-char-kf 1.8s ease-in forwards;
        }
        /* ── نغمة النصر: أشرطة الموازن ── */
        @keyframes victory-eq-kf { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        .victory-eq {
          width: 3.5px; border-radius: 2px; background: #dc2626;
          transform-origin: bottom;
          animation: victory-eq-kf 0.8s ease-in-out infinite;
        }
        /* ── لوحات الألقاب ── */
        .title-plaque {
          position: absolute; left: 50%; transform: translateX(-50%); bottom: 26%;
          z-index: 80; padding: 2px 10px; border-radius: 8px;
          font-size: 11px; font-weight: 900; white-space: nowrap;
          border: 1px solid; backdrop-filter: blur(4px); pointer-events: none;
        }
        .title-gold {
          background: rgba(69,26,3,0.8); color: #fcd34d;
          border-color: rgba(245,158,11,0.6); text-shadow: 0 0 8px rgba(245,158,11,0.5);
        }
        @keyframes title-pulse-kf {
          0%, 100% { box-shadow: 0 0 4px rgba(220,38,38,0.3); }
          50% { box-shadow: 0 0 14px rgba(220,38,38,0.8); }
        }
        .title-blood {
          background: rgba(69,10,10,0.8); color: #fca5a5;
          border-color: rgba(220,38,38,0.6);
          animation: title-pulse-kf 1.6s ease-in-out infinite;
        }
        @keyframes title-ghost-kf { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .title-ghost {
          background: rgba(24,24,27,0.7); color: #d4d4d8;
          border-color: rgba(161,161,170,0.5);
          animation: title-ghost-kf 3s ease-in-out infinite;
        }
      `}</style>

      {/* الهيدر */}
      <div className="max-w-7xl mx-auto mb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-black text-[#C5A059] mb-3" style={{ fontFamily: 'Amiri, serif' }}>
          🪙 إطارات خزنة الدون — على الكارد الحقيقي
        </h1>
        <p className="text-zinc-500 font-mono text-xs tracking-widest uppercase mb-2">
          CHIPS STORE FRAMES — RENDERED ON THE REAL DynamicMafiaCard
        </p>
        <p className="text-zinc-400 text-sm max-w-2xl mx-auto leading-relaxed">
          كل إطار هنا يمرّ عبر محرك التأثيرات الفعلي (rankEffectsOverride). زر «طبقة الامتداد»
          يُظهر/يُخفي العناصر التي تحتاج إضافة بسيطة للمحرك — لتقارن ما ينبني اليوم كبيانات صرفة
          وما يحتاج تطويراً.
        </p>

        {/* أزرار التحكم */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setExtrasOn(v => !v)}
            className={`px-5 py-2 border font-mono text-xs tracking-widest uppercase transition-all ${
              extrasOn ? 'bg-[#C5A059]/15 border-[#C5A059]/60 text-[#C5A059]' : 'bg-[#111] border-zinc-700 text-zinc-500'
            }`}
          >
            {extrasOn ? '🧩 طبقة الامتداد: ظاهرة' : '🧩 طبقة الامتداد: مخفية'}
          </button>
          <button
            onClick={() => setShowVoting(v => !v)}
            className="px-5 py-2 bg-[#111] border border-zinc-700 text-zinc-400 font-mono text-xs tracking-widest uppercase hover:bg-zinc-800 transition-all"
          >
            {showVoting ? '🔒 إخفاء التصويت' : '🗳️ وضع التصويت'}
          </button>
          <div className="flex border border-zinc-800 rounded overflow-hidden">
            {(['sm', 'md', 'lg'] as const).map(s => (
              <button
                key={s}
                onClick={() => setCardSize(s)}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all ${
                  cardSize === s ? 'bg-[#C5A059] text-black font-bold' : 'bg-[#111] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <p className="text-zinc-600 text-xs mt-3">اضغط أي كارد لقلبه — لاحظ أن التأثيرات على الوجه الأمامي فقط (سلوك المحرك الحالي).</p>
      </div>

      {/* شبكة الإطارات */}
      <div className="max-w-7xl mx-auto flex flex-wrap justify-center gap-x-8 gap-y-12 pt-6">
        {FRAMES.map(f => {
          const r = RARITY_STYLE[f.rarity];
          return (
            <div key={f.id} className="flex flex-col items-center gap-3" style={{ maxWidth: 300 }}>
              {/* الكارد الحقيقي + الشعار + طبقة الامتداد */}
              <div className="relative" style={{ paddingTop: 44 }}>
                <DynamicMafiaCard
                  playerNumber={f.player.number}
                  playerName={f.player.name}
                  role={f.player.role}
                  gender={f.player.gender}
                  size={cardSize}
                  rankTier="INFORMANT"
                  rankEffectsOverride={f.fx}
                  isFlipped={flipped[f.id] || false}
                  onFlip={() => toggleFlip(f.id)}
                  showVoting={showVoting}
                  votes={votes[f.id] || 0}
                  onVote={() => setVotes(p => ({ ...p, [f.id]: (p[f.id] || 0) + 1 }))}
                />
                {extrasOn && !flipped[f.id] && f.extras && (
                  <div className="absolute rounded-2xl overflow-hidden pointer-events-none" style={{ inset: '44px 0 0 0', zIndex: 70 }}>
                    <ExtraLayer id={f.id} />
                  </div>
                )}
                {extrasOn && !flipped[f.id] && (
                  <div className="absolute pointer-events-none" style={{ top: 44 + f.emblemTop, left: '50%', transform: 'translateX(-50%)', zIndex: 75, filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.65))' }}>
                    <div className="emblem-float"><ChipsEmblem id={f.id} size={f.emblemSize} /></div>
                  </div>
                )}
              </div>

              {/* بطاقة المعلومات */}
              <div className="text-center w-full">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>{f.nameAr}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${r.cls}`}>{r.label}</span>
                </div>
                <p className="text-[#C5A059] text-sm font-bold mb-1">{f.price}</p>
                <p className="text-zinc-500 text-xs leading-relaxed mb-2">{f.hook}</p>
                {f.pure ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-950 text-emerald-300 border-emerald-700 font-bold">
                    ✅ المحرك الحالي + الشعار الموحّد
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-950 text-amber-300 border-amber-700 font-bold">
                    🧩 + امتداد إضافي: {f.extras}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* محاكاة شاشة العرض — رسائل الدخول + الإقصاء + نغمة النصر */}
      <DisplaySim />

      {/* الألقاب على الكارد */}
      <TitleShowcase cardSize={cardSize} />

      {/* المقارنة مع رتب اليوم */}
      <div className="max-w-7xl mx-auto mt-20 text-center">
        <h2 className="text-2xl font-black text-zinc-300 mb-2" style={{ fontFamily: 'Amiri, serif' }}>
          ⚖️ المقارنة الحاسمة: هل يستحق الدفع؟
        </h2>
        <p className="text-zinc-500 text-sm max-w-2xl mx-auto mb-8 leading-relaxed">
          الإطار المدفوع <span className="text-amber-400">يستبدل</span> تأثير الرتبة الحالي (وليس فوقه).
          إذاً يجب أن يتفوق بوضوح على أعلى رتبة مجانية — قارن بنفسك: نائب الرئيس والعرّاب (مجاناً بالرتب)
          مقابل «تاج العرّاب» المدفوع.
        </p>
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-10 pt-6">
          {[
            { tier: 'UNDERBOSS', label: 'رتبة نائب الرئيس (مجانية)', name: 'لاعب مثابر', num: 20 },
            { tier: 'GODFATHER', label: 'رتبة العرّاب (مجانية — قمة السلم)', name: 'قمة الرتب', num: 21 },
          ].map(c => (
            <div key={c.tier} className="flex flex-col items-center gap-3">
              <div style={{ paddingTop: 44 }}>
                <DynamicMafiaCard
                  playerNumber={c.num}
                  playerName={c.name}
                  role="CITIZEN"
                  gender="MALE"
                  size={cardSize}
                  rankTier={c.tier}
                />
              </div>
              <p className="text-zinc-400 text-xs font-bold">{c.label}</p>
            </div>
          ))}
          <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ paddingTop: 44 }}>
              <DynamicMafiaCard
                playerNumber={22}
                playerName="مشتري الإطار"
                role="CITIZEN"
                gender="MALE"
                size={cardSize}
                rankTier="INFORMANT"
                rankEffectsOverride={FRAMES[0].fx}
              />
              <div className="absolute pointer-events-none" style={{ top: 44 - 36, left: '50%', transform: 'translateX(-50%)', zIndex: 75, filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.65))' }}>
                <div className="emblem-float"><ChipsEmblem id="don" size={66} /></div>
              </div>
            </div>
            <p className="text-amber-400 text-xs font-bold">👑 تاج العرّاب المدفوع (🪙 120)</p>
          </div>
        </div>
      </div>

      {/* ملاحظات فنية */}
      <div className="max-w-3xl mx-auto mt-16 mb-10 bg-[#0b0b0b] border border-zinc-800 rounded-xl p-6 text-right">
        <h3 className="text-[#C5A059] font-black mb-3" style={{ fontFamily: 'Amiri, serif' }}>📌 ملاحظات فنية من المعاينة</h3>
        <ul className="text-zinc-400 text-sm leading-relaxed space-y-2 list-disc pr-5">
          <li>الشعارات (تاج، خنجر، فيدورا…) صارت <b className="text-emerald-400">SVG مرسومة بتدرجات وأحجار</b> بدل الإيموجي — تُضاف للمحرك كـ primitive واحد «emblem» بمكتبة شعارات موحّدة تخدم كل الإطارات.</li>
          <li>٣ إطارات تكتمل بـ<b className="text-emerald-400">المحرك الحالي + الشعار</b> (تاج العرّاب، طاولة القمار، إكليل البطل)؛ و٥ تحتاج primitive إضافياً صغيراً: قطرات، دخان، رفّة نيون، ثقوب، شريط (~٣٠ سطر CSS للواحد، يُضاف مرة ويُعاد استخدامه).</li>
          <li>محاكاة الشاشة أعلاه <b>منقولة حرفياً</b> عن صفحة العرض: خلفية display-bg وvignette الدم، روستر ACTIVE ROSTER، نمط أوفرلاي «اختيار رابح» (z-[300] + bg-black/85 + توهج خلف الكارد)، ومراحل RevealCeremony (مقلوب → قلب → كشف → تعتيم).</li>
          <li>في النظام الفعلي <b className="text-amber-400">لا يوجد إعلان دخول إطلاقاً</b> — وأنيميشن الإقصاء المدفوع يحلّ محل مرحلة «التعتيم الرمادي» المجانية فقط (باقي المراسم كما هي).</li>
          <li>التأثيرات تظهر على <b>الوجه الأمامي فقط</b> — اقلب أي كارد لتتأكد (سؤال «الوجهين» المفتوح في الخطة).</li>
          <li>تأثير اسم اللاعب (nameEffect) يظهر حالياً <b>في وضع التصويت فقط</b> — لو سنبيعه يجب تفعيله بالوضع العادي أيضاً (سطر واحد).</li>
          <li>الإطار المدفوع يستبدل تأثير الرتبة (fx = override ?? rankDef) — قرار منتج مطلوب: استبدال أم دمج؟</li>
          <li>أصوات النصر تُعزف من جهاز القائد حصراً (نظام الصوت leader-source) — الشاشة تعرض المؤشر البصري فقط.</li>
        </ul>
      </div>
    </div>
  );
}
