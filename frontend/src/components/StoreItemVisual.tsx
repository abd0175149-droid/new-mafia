'use client';

import React from 'react';
import './RankEffects.css';
import { ChipsEmblem, type EmblemId } from './ChipsEmblems';
import { normalizeFx } from '@/lib/chips-fx';
import TitlePlaque from './TitlePlaque';
import EliminationFx from './EliminationFx';
import { buildNameFxStyle } from '@/lib/name-fx';

// ══════════════════════════════════════════════════════
// 🖼️ صورة العنصر في المتجر
//
// ⚠️ كان المتجر يرسم صورة **للإطارات وحدها** (لأنها الوحيدة التي تحمل شعاراً)،
//    فثلاثة عشر عنصراً من واحد وعشرين — الألقاب وتأثيرات الأسماء والتشريفات
//    والإقصاء والنغمة والمعزّز — تُعرض كنصّ خالص. متجر ثلثا بضاعته غير مرئية
//    لا يبيع.
//
// لكل نوع تمثيل يشبه ما سيراه اللاعب فعلاً، لا أيقونة عامة.
// ══════════════════════════════════════════════════════

const ENTRANCE_TONE: Record<string, { bg: string; bd: string; fg: string; label: string }> = {
  don:  { bg: 'rgba(69,26,3,0.9)',  bd: 'rgba(245,158,11,0.55)', fg: '#fcd34d', label: 'موكب' },
  seal: { bg: 'rgba(69,10,10,0.9)', bd: 'rgba(220,38,38,0.55)',  fg: '#fca5a5', label: 'ختم' },
  neon: { bg: 'rgba(8,51,68,0.9)',  bd: 'rgba(34,211,238,0.55)', fg: '#67e8f9', label: 'نيون' },
  file: { bg: 'rgba(24,24,27,0.9)', bd: 'rgba(161,161,170,0.5)', fg: '#d4d4d8', label: 'ملف' },
};

export interface StoreItemVisualProps {
  item: any;
  /** اسم اللاعب — يجعل تأثير الاسم معاينةً شخصية لا عيّنة عامة */
  playerName?: string;
  size?: number;
}

export default function StoreItemVisual({ item, playerName = 'اسمك', size = 56 }: StoreItemVisualProps) {
  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0, position: 'relative',
    background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)',
  };

  // ── الإطار: الشعار إن وُجد، وإلا مصغّرة حيّة من ألوان الإعداد نفسه ──
  if (item.kind === 'frame') {
    if (item.emblemId) {
      return <div style={box}><ChipsEmblem id={item.emblemId as EmblemId} size={Math.round(size * 0.72)} /></div>;
    }
    const fx = normalizeFx(item.config);
    const colors = fx.border.style !== 'solid' && fx.border.gradientColors.length >= 2
      ? fx.border.gradientColors
      : [fx.border.color, fx.border.color];
    return (
      <div style={box}>
        <div style={{
          width: size - 16, height: size - 16, borderRadius: 8,
          border: `${Math.max(2, fx.border.width)}px solid transparent`,
          background: `linear-gradient(135deg, ${colors.join(', ')}) border-box`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor', maskComposite: 'exclude',
          boxShadow: fx.glow.enabled ? `0 0 ${Math.min(14, fx.glow.size)}px ${fx.glow.color}` : undefined,
        }} />
      </div>
    );
  }

  // ── اللقب: لوحة اللقب الحقيقية بأصنافها ──
  if (item.kind === 'title') {
    return (
      <div style={{ ...box, width: 'auto', minWidth: size, padding: '0 8px' }}>
        {/* اللوحة الحقيقية لا نسخة يدوية — فما يراه المشتري هو ما سيُرسم */}
        <TitlePlaque
          text={item.config?.text || 'لقب'}
          style={item.config?.style}
          plaque={item.config?.plaque}
          className="!m-0"
        />
      </div>
    );
  }

  // ── تأثير الاسم: اسم اللاعب نفسه بالتأثير المعروض للبيع ──
  if (item.kind === 'name_fx') {
    // نفس باني الأنماط الذي تستعمله البطاقة — فلا تعد المعاينة
    // تعرض غير ما يُرسم (النسخة اليدوية هنا كانت تتجاهل التدرّج والحركة).
    const nf = buildNameFxStyle({ ...(item.config?.nameEffect || {}), enabled: true });
    return (
      <div style={{ ...box, width: 'auto', minWidth: size, padding: '0 10px' }}>
        <span className={nf.className}
          style={{ fontFamily: 'Amiri, serif', fontWeight: 900, fontSize: 15, ...nf.style }}>
          {playerName}
        </span>
      </div>
    );
  }

  // ── التشريفة: ملصق بلون تخطيطها ──
  if (item.kind === 'entrance') {
    const t = ENTRANCE_TONE[item.config?.design] || ENTRANCE_TONE.file;
    return (
      <div style={{ ...box, background: t.bg, border: `1px solid ${t.bd}` }}>
        <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
          <div style={{ fontSize: 14 }}>🚪</div>
          <div style={{ fontSize: 8, color: t.fg, fontWeight: 900, letterSpacing: '0.05em' }}>{t.label}</div>
        </div>
      </div>
    );
  }

  // ── الإقصاء: لهب حيّ بأصناف الحرق نفسها ──
  if (item.kind === 'elimination') {
    // المكوّن الإنتاجي نفسه — النسخة اليدوية هنا كانت ترسم ناراً
    // دائماً ولو كان العنصر مباعاً بتصميم آخر.
    return (
      <div style={{ ...box, background: 'rgba(20,18,22,0.92)', border: '1px solid rgba(120,120,130,0.35)' }}>
        <EliminationFx config={item.config} className="!rounded-xl" />
        <span style={{ position: 'relative', fontSize: 15, opacity: 0.55 }}>☠︎</span>
      </div>
    );
  }

  // ── النغمة: مُعادِل صوتي ساكن ──
  if (item.kind === 'victory_sting') {
    return (
      <div style={{ ...box, background: 'rgba(6,30,24,0.9)', border: '1px solid rgba(52,211,153,0.4)' }}>
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '46%' }}>
          {[0.5, 0.9, 0.65, 1, 0.75].map((h, i) => (
            <span key={i} style={{ width: 3, height: `${h * 100}%`, background: '#34d399', borderRadius: 2, opacity: 0.55 + h * 0.4 }} />
          ))}
        </span>
      </div>
    );
  }

  // ── المعزّز: هادئ عمداً — لا يُسوَّق كقوّة ──
  if (item.kind === 'xp_boost') {
    return (
      <div style={{ ...box, background: 'rgba(24,24,27,0.9)' }}>
        <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 900 }}>×{item.config?.multiplier ?? 2}</span>
      </div>
    );
  }

  return <div style={box}><span style={{ fontSize: 18, opacity: 0.5 }}>🪙</span></div>;
}
