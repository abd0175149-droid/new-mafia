'use client';

import React, { useState } from 'react';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';

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
  id: string;
  nameAr: string;
  rarity: Rarity;
  price: string;
  hook: string;
  pure: boolean;       // يُبنى 100% كبيانات عبر المحرك الحالي
  extras?: string;     // اسم الـ primitive الناقص
  fx: any;
  player: { number: number; name: string; role: string; gender: 'MALE' | 'FEMALE' };
}

const FRAMES: FrameDef[] = [
  {
    id: 'don', nameAr: 'تاج العرّاب', rarity: 'myth', price: '🪙 120 — موسمي محدود',
    hook: 'ذهب متحرك + تاج يطفو فوق البطاقة. يُعرف صاحبه من آخر الصالة.',
    pure: true,
    fx: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#b45309', '#fcd34d', '#f59e0b', '#fde68a'], width: 3, travelSpeed: 3 },
      glow: { enabled: true, color: '#f59e0b', size: 26, opacity: 0.55, pulseEnabled: true, pulseDuration: 2.2 },
      shimmer: { enabled: true, color: '#fde68a', opacity: 0.35, duration: 3 },
      particles: { enabled: true, count: 6, color: '#fcd34d', size: 3, orbitRadius: '95px', baseDuration: 6 },
      frame: { enabled: true, type: 'royal', color: '#f59e0b', opacity: 0.85, strokeWidth: 1.6, animate: true },
      gradientOverlay: { enabled: true, color: '#f59e0b', opacity: 0.12, direction: 'to top' },
      floating: { enabled: true, content: '👑', size: 22, glowColor: '#f59e0b' },
      badge: { enabled: true, emoji: '👑', label: 'أسطوري', bgColor: 'rgba(69,26,3,0.75)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.5)' },
      nameEffect: { enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 10 },
    }),
    player: { number: 1, name: 'عبدالله', role: 'GODFATHER', gender: 'MALE' },
  },
  {
    id: 'blood', nameAr: 'قَسَم الدم', rarity: 'epic', price: '🪙 60',
    hook: 'نبض شرياني + دم يسيل من الحافة. لأصحاب الولاء الأعمى للعائلة.',
    pure: false, extras: 'قطرات الدم',
    fx: fx({
      border: { enabled: true, style: 'gradient', gradientColors: ['#7f1d1d', '#ef4444', '#450a0a'], width: 3 },
      glow: { enabled: true, color: '#dc2626', size: 20, opacity: 0.5, pulseEnabled: true, pulseDuration: 1.5 },
      frame: { enabled: true, type: 'simple', color: '#b91c1c', opacity: 0.8, strokeWidth: 2, animate: false },
      gradientOverlay: { enabled: true, color: '#7f1d1d', opacity: 0.18, direction: 'to bottom' },
      floating: { enabled: true, content: '🗡️', size: 18, glowColor: '#dc2626' },
      badge: { enabled: true, emoji: '🩸', label: 'ملحمي', bgColor: 'rgba(69,10,10,0.75)', textColor: '#fca5a5', borderColor: 'rgba(220,38,38,0.5)' },
      nameEffect: { enabled: true, color: '#fca5a5', glowColor: '#dc2626', glowSize: 8 },
    }),
    player: { number: 2, name: 'طارق', role: 'MAFIA_REGULAR', gender: 'MALE' },
  },
  {
    id: 'neon', nameAr: 'نيون الليل', rarity: 'epic', price: '🪙 60',
    hook: 'أنبوب سماوي يرفّ رفة كهرباء حقيقية + أقواس وردية. لافتة حانة شخصية.',
    pure: false, extras: 'رفّة النيون',
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
    hook: 'آرت-ديكو نحاسي بثقوب رصاص. ثابت بلا وميض — لمن يكره الحركة.',
    pure: false, extras: 'ثقوب الرصاص (ثابتة)',
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
    hook: 'نوار كلاسيكي بدخان يتصاعد بلا توقف. أجواء فيلم أبيض وأسود.',
    pure: false, extras: 'الدخان الصاعد',
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
    hook: 'جوخ أخضر + رقاقات ذهبية تدور حول صورتك طوال الليل.',
    pure: true,
    fx: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#064e3b', '#10b981', '#065f46', '#34d399'], width: 2.5, travelSpeed: 5 },
      glow: { enabled: true, color: '#10b981', size: 18, opacity: 0.45, pulseEnabled: true, pulseDuration: 3 },
      particles: { enabled: true, count: 5, color: '#fbbf24', size: 4, orbitRadius: '85px', baseDuration: 7 },
      frame: { enabled: true, type: 'simple', color: '#10b981', opacity: 0.8, strokeWidth: 1.5, animate: false },
      floating: { enabled: true, content: '♠️', size: 16, glowColor: '#10b981' },
      badge: { enabled: true, emoji: '♠️', label: 'نادر', bgColor: 'rgba(6,78,59,0.75)', textColor: '#6ee7b7', borderColor: 'rgba(16,185,129,0.5)' },
    }),
    player: { number: 6, name: 'سارة', role: 'JESTER', gender: 'FEMALE' },
  },
  {
    id: 'crime', nameAr: 'مسرح الجريمة', rarity: 'common', price: '🪙 20',
    hook: 'شريط الشرطة يلف بطاقتك. «المضحك» الذي يفتح باب أول شراء.',
    pure: false, extras: 'شريط الشرطة',
    fx: fx({
      border: { enabled: true, style: 'solid', color: '#eab308', width: 2 },
      glow: { enabled: true, color: '#eab308', size: 10, opacity: 0.3 },
      badge: { enabled: true, emoji: '🚧', label: 'شائع', bgColor: 'rgba(66,50,3,0.75)', textColor: '#fde047', borderColor: 'rgba(234,179,8,0.5)' },
    }),
    player: { number: 7, name: 'سعد', role: 'CITIZEN', gender: 'MALE' },
  },
  {
    id: 'champ', nameAr: 'إكليل البطل', rarity: 'champ', price: 'لا يُشترى — بطل الموسم فقط',
    hook: 'بلاتينيوم وغار. معروض في المتجر كإعلان دائم عن التنافس.',
    pure: true,
    fx: fx({
      border: { enabled: true, style: 'traveling', gradientColors: ['#94a3b8', '#f8fafc', '#cbd5e1', '#e2e8f0'], width: 3, travelSpeed: 4 },
      glow: { enabled: true, color: '#e2e8f0', size: 22, opacity: 0.5, pulseEnabled: true, pulseDuration: 2.8 },
      shimmer: { enabled: true, color: '#ffffff', opacity: 0.4, duration: 2.6 },
      particles: { enabled: true, count: 4, color: '#f1f5f9', size: 3, orbitRadius: '92px', baseDuration: 6 },
      frame: { enabled: true, type: 'greek', color: '#cbd5e1', opacity: 0.8, strokeWidth: 1.4, animate: true },
      floating: { enabled: true, content: '🏆', size: 20, glowColor: '#e2e8f0' },
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
              {/* الكارد الحقيقي + طبقة الامتداد */}
              <div className="relative" style={{ paddingTop: 18 }}>
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
                  <div className="absolute rounded-2xl overflow-hidden pointer-events-none" style={{ inset: '18px 0 0 0', zIndex: 70 }}>
                    <ExtraLayer id={f.id} />
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
                    ✅ بيانات 100% — يعمل بالمحرك الحالي
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-950 text-amber-300 border-amber-700 font-bold">
                    🧩 يحتاج امتداد: {f.extras}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

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
              <div style={{ paddingTop: 18 }}>
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
            <div className="relative" style={{ paddingTop: 18 }}>
              <DynamicMafiaCard
                playerNumber={22}
                playerName="مشتري الإطار"
                role="CITIZEN"
                gender="MALE"
                size={cardSize}
                rankTier="INFORMANT"
                rankEffectsOverride={FRAMES[0].fx}
              />
            </div>
            <p className="text-amber-400 text-xs font-bold">👑 تاج العرّاب المدفوع (🪙 120)</p>
          </div>
        </div>
      </div>

      {/* ملاحظات فنية */}
      <div className="max-w-3xl mx-auto mt-16 mb-10 bg-[#0b0b0b] border border-zinc-800 rounded-xl p-6 text-right">
        <h3 className="text-[#C5A059] font-black mb-3" style={{ fontFamily: 'Amiri, serif' }}>📌 ملاحظات فنية من المعاينة</h3>
        <ul className="text-zinc-400 text-sm leading-relaxed space-y-2 list-disc pr-5">
          <li>٣ إطارات تعمل <b className="text-emerald-400">كبيانات صرفة</b> بالمحرك الحالي (تاج العرّاب، طاولة القمار، إكليل البطل) — تُحفظ في جدول وتُباع فوراً بلا كود جديد.</li>
          <li>٥ إطارات تحتاج <b className="text-amber-400">primitives جديدة صغيرة</b> بمحرك التأثيرات: قطرات، دخان، رفّة نيون، ثقوب، شريط — كل واحدة ~٣٠ سطر CSS تُضاف مرة وتُعاد استخدامها.</li>
          <li>التأثيرات تظهر على <b>الوجه الأمامي فقط</b> — اقلب أي كارد لتتأكد (هذا سؤال «الوجهين» المفتوح في الخطة).</li>
          <li>تأثير اسم اللاعب (nameEffect) يظهر حالياً <b>في وضع التصويت فقط</b> — لو سنبيعه يجب تفعيله بالوضع العادي أيضاً (سطر واحد).</li>
          <li>الإطار المدفوع يستبدل تأثير الرتبة (fx = override ?? rankDef) — قرار منتج مطلوب: استبدال أم دمج؟</li>
        </ul>
      </div>
    </div>
  );
}
