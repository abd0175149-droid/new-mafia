'use client';

/**
 * 🎴 MafiaCard — Smart Wrapper (Drop-in Replacement)
 * 
 * هذا الملف كان الكارد القديم. تم نقل الكود القديم إلى MafiaCardLegacy.tsx
 * والآن هذا الملف يعمل كـ Wrapper ذكي:
 * 
 * - إذا `useDynamicEngine` = true → DynamicMafiaCard (يقرأ من DB)
 * - إذا `useDynamicEngine` = false → MafiaCardLegacy (switch/case القديم)
 * 
 * ⚠️ كل ملف يستورد MafiaCard سيستخدم هذا الـ wrapper تلقائياً
 *    بدون الحاجة لتعديل أي import.
 * 
 * الكود الأصلي: MafiaCardLegacy.tsx
 */

import React from 'react';
import MafiaCardLegacy, { type MafiaCardProps } from './MafiaCardLegacy';
import DynamicMafiaCard from './DynamicMafiaCard';

// re-export Props لتوافق الكود القديم
export type { MafiaCardProps };

interface SmartMafiaCardProps extends Omit<MafiaCardProps, 'role'> {
  role: string | null;
  /** هل المحرك الديناميكي مفعّل — يُمرر اختيارياً */
  useDynamicEngine?: boolean;
  rankTier?: string;
  /** مدّة حركة القلب بالمللي ثانية (افتراضي 700) */
  flipDurationMs?: number;
  /** 🪙 المظهر المشترى من خزنة الدون (يُمرَّر كما هو للمحرك الديناميكي) */
  cosmetics?: any;
}

export default function MafiaCard({
  useDynamicEngine = true,
  ...props
}: SmartMafiaCardProps) {
  if (useDynamicEngine) {
    return <DynamicMafiaCard {...props} />;
  }

  // المحرك القديم — لا يعرف المظهر المشترى، نُسقطه كي لا يصل للـ DOM
  const { cosmetics: _cos, ...legacyProps } = props as any;
  return <MafiaCardLegacy {...(legacyProps as MafiaCardProps)} />;
}
