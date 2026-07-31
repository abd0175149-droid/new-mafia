'use client';

// ══════════════════════════════════════════════════════
// 🎬 مسرح التشريفة — يرسم تشريفةً مؤلَّفة من بيانات
//
// يُستعمل في موضعين بلا اختلاف: طبقة شاشة القاعة، ومعاينة المؤلّف.
// فما يعتمده المؤلّف هو ما تراه القاعة — لا نسخة يدوية ثانية تنحرف.
// ══════════════════════════════════════════════════════

import React from 'react';
import { motion } from 'framer-motion';
import { ChipsEmblem, type EmblemId } from './ChipsEmblems';
import { normalizeElements, type EntranceElement } from '@/lib/entrance-schema';

/** حركة الدخول → حالة البداية. الخروج ليس مطلوباً: الطبقة كلّها تختفي معاً. */
function initialOf(e: EntranceElement) {
  const dist = 60;
  switch (e.enterFx) {
    case 'slide':
      return {
        opacity: 0,
        x: e.from === 'left' ? -dist : e.from === 'right' ? dist : 0,
        y: e.from === 'top' ? -dist : e.from === 'bottom' ? dist : 0,
      };
    case 'scale': return { opacity: 0, scale: 0.6 };
    // الختم يهبط من فوق بحجم أكبر ثم يستقرّ — الإحساس بالضربة من التباطؤ
    case 'stamp': return { opacity: 0, scale: 2.4, rotate: -12 };
    case 'flip': return { opacity: 0, rotateY: 90 };
    case 'fade':
    default: return { opacity: 0 };
  }
}

function animateOf(e: EntranceElement) {
  return { opacity: e.opacity, x: 0, y: 0, scale: 1, rotate: 0, rotateY: 0 };
}

function easeOf(e: EntranceElement) {
  // الختم يحتاج تباطؤاً حادّاً كي يُقرأ كضربة لا كهبوط ناعم
  return e.enterFx === 'stamp' ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1];
}

function ElementView({ el, playerName }: { el: EntranceElement; playerName: string }) {
  const common: React.CSSProperties = {
    position: 'absolute',
    left: `${50 + el.x}%`,
    top: `${50 + el.y}%`,
    transform: 'translate(-50%, -50%)',
  };

  const body = (() => {
    switch (el.type) {
      case 'wash':
        return (
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at 50% 45%, ${el.color}, ${el.color2})`,
          }} />
        );

      case 'bar':
        return (
          <div style={{
            ...common,
            width: `${el.size}px`, height: `${Math.max(2, el.size / 60)}px`,
            background: `linear-gradient(90deg, transparent, ${el.color}, transparent)`,
            boxShadow: `0 0 18px ${el.color}`,
          }} />
        );

      case 'emblem':
        return (
          <div style={common}>
            <ChipsEmblem id={el.emblemId as EmblemId} size={el.size} />
          </div>
        );

      case 'seal':
        return (
          <div style={{
            ...common,
            width: `${el.size}px`, height: `${el.size}px`, borderRadius: '50%',
            border: `${Math.max(2, el.size / 25)}px solid ${el.color}`,
            background: `radial-gradient(circle, ${el.color2}, transparent 72%)`,
            boxShadow: `0 0 24px ${el.color}88`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: el.color, fontFamily: 'Amiri, serif',
            fontSize: `${Math.max(10, el.size / 5)}px`, fontWeight: 900,
          }}>
            {el.text || '★'}
          </div>
        );

      case 'sparks':
        return (
          <div style={{ ...common, width: el.size, height: el.size }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const a = (Math.PI * 2 * i) / 10;
              return (
                <motion.span key={i}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: Math.cos(a) * el.size * 0.7, y: Math.sin(a) * el.size * 0.7, opacity: 0 }}
                  transition={{ duration: el.durationMs / 1000, delay: el.delayMs / 1000, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', left: '50%', top: '50%',
                    width: 5, height: 5, borderRadius: '50%',
                    background: el.color, boxShadow: `0 0 8px ${el.color}`,
                  }} />
              );
            })}
          </div>
        );

      case 'name':
      case 'text':
      default:
        return (
          <div style={{
            ...common,
            color: el.color,
            fontFamily: 'Amiri, serif',
            fontWeight: 900,
            fontSize: `${el.size / 3}px`,
            textShadow: `0 0 ${Math.max(6, el.size / 8)}px ${el.color2}`,
            whiteSpace: 'nowrap',
          }}>
            {el.type === 'name' ? playerName : el.text}
          </div>
        );
    }
  })();

  // الجسيمات تُحرّك نفسها داخلياً — تغليفها بحركة ثانية يُلغي انتشارها
  if (el.type === 'sparks') return body;

  return (
    <motion.div
      initial={initialOf(el)}
      animate={animateOf(el)}
      transition={{
        duration: el.durationMs / 1000,
        delay: el.delayMs / 1000,
        ease: easeOf(el) as any,
      }}
      style={el.type === 'wash' ? { position: 'absolute', inset: 0 } : undefined}
    >
      {body}
    </motion.div>
  );
}

export default function EntranceStage({ elements, playerName, className = '' }: {
  elements: any;
  playerName: string;
  className?: string;
}) {
  const els = React.useMemo(() => normalizeElements(elements), [elements]);
  if (!els.length) return null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {els.map((el, i) => (
        <ElementView key={`${el.id}-${i}`} el={el} playerName={playerName} />
      ))}
    </div>
  );
}
