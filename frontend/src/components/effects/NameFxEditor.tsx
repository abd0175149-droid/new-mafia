'use client';

import React, { useMemo } from 'react';
import { normalizeNameFx, NAME_FX_STYLES, NAME_FX_ANIMS, NAME_FX_ENTERS, type NameFx } from '@/lib/name-fx';

// ══════════════════════════════════════════════════════
// 🔤 محرّر تأثير الاسم
//
// ⚠️ ما كان: ثلاثة حقول فقط ولا حركة إطلاقاً — رغم أن الاسم أوسع سطح
//    في اللعبة (وجها البطاقة · شاشة القاعة · كل مشهد).
//
// كل تغيير يمرّ من normalizeNameFx فوراً، فلا يمكن أن تُنتج هذه اللوحة
// إعداداً يرفضه الخادم أو يعجز المُصيّر عن رسمه.
// ══════════════════════════════════════════════════════

const STYLE_LABEL: Record<string, string> = {
  glow: '💡 توهّج',
  gradient: '🌈 تدرّج',
  outline: '⬛ حدّ خارجي',
  engraved: '🪨 نقش',
};

const STYLE_HINT: Record<string, string> = {
  glow: 'اللون مع هالة حوله — الشكل المعتمد اليوم.',
  gradient: 'الحروف نفسها متدرّجة بين لونين. التوهّج هنا مرشّح لا ظلّ نصّ.',
  outline: 'حرف ملوّن بحدّ خارجي — يُقرأ من بعيد على أي خلفية.',
  engraved: 'ضوء من فوق وظلّ من تحت — كأن الاسم محفور في معدن.',
};

const ANIM_LABEL: Record<string, string> = {
  none: 'بلا حركة',
  pulse: 'نبض التوهّج',
  flicker: 'رفّة نيون',
  sweep: 'لمعة تمرّ (للتدرّج)',
  cycle: 'تبديل لوني',
};

const ENTER_LABEL: Record<string, string> = {
  none: 'بلا',
  fade: 'ظهور تدريجي',
  rise: 'صعود خفيف',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400">
      <span className="w-24 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Color({ v, on }: { v: string; on: (x: string) => void }) {
  return (
    <span className="flex items-center gap-1.5 flex-1">
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#ffffff'}
        onChange={e => on(e.target.value)}
        className="w-7 h-7 rounded border border-gray-600 bg-transparent cursor-pointer shrink-0" />
      <input value={v} onChange={e => on(e.target.value)} dir="ltr"
        className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 font-mono" />
    </span>
  );
}

function Num({ v, on, min, max, step = 1, unit = '' }: {
  v: number; on: (x: number) => void; min: number; max: number; step?: number; unit?: string;
}) {
  return (
    <span className="flex items-center gap-2 flex-1">
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => on(Number(e.target.value))} className="flex-1 accent-amber-500" />
      <span className="w-12 text-[10px] text-gray-500 tabular-nums text-left">{v}{unit}</span>
    </span>
  );
}

export default function NameFxEditor({ value, onChange }: {
  value: any;
  onChange: (v: NameFx) => void;
}) {
  const n = useMemo(() => normalizeNameFx({ ...value, enabled: true }), [value]);
  const set = (patch: Partial<NameFx>) => onChange(normalizeNameFx({ ...n, ...patch, enabled: true }));

  return (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">النمط</label>
        <div className="grid grid-cols-2 gap-1.5">
          {NAME_FX_STYLES.map(s => (
            <button key={s} type="button" onClick={() => set({ style: s })}
              className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border text-right transition-all ${
                n.style === s ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/40 text-gray-400 hover:border-gray-600'
              }`}>
              {STYLE_LABEL[s] || s}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">{STYLE_HINT[n.style]}</p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-gray-800/40 p-3 space-y-2">
        <Row label="اللون"><Color v={n.color} on={c => set({ color: c })} /></Row>

        {n.style === 'gradient' && (
          <>
            <Row label="اللون الثاني"><Color v={n.color2} on={c => set({ color2: c })} /></Row>
            <Row label="الزاوية"><Num v={n.angle} on={v => set({ angle: v })} min={0} max={360} unit="°" /></Row>
          </>
        )}

        {n.style === 'outline' && (
          <>
            <Row label="لون الحدّ"><Color v={n.outlineColor} on={c => set({ outlineColor: c })} /></Row>
            <Row label="سماكة الحدّ">
              <Num v={n.outlineWidth} on={v => set({ outlineWidth: v })} min={0} max={2} step={0.25} unit="px" />
            </Row>
          </>
        )}

        <Row label="لون التوهّج"><Color v={n.glowColor} on={c => set({ glowColor: c })} /></Row>
        <Row label="حجم التوهّج"><Num v={n.glowSize} on={v => set({ glowSize: v })} min={0} max={30} unit="px" /></Row>
        {n.style === 'gradient' && n.glowSize > 12 && (
          <p className="text-[10px] text-amber-500/80">
            في التدرّج يُرسم التوهّج كمرشّح ويُقصّ عند ١٢px — فوق ذلك يُذيب حدّ الحرف ويضرّ القراءة من بعيد.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-700/30 bg-gray-900/20 p-3 space-y-2">
        <Row label="الحركة">
          <select value={n.anim} onChange={e => set({ anim: e.target.value })}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
            {NAME_FX_ANIMS.map(a => <option key={a} value={a}>{ANIM_LABEL[a] || a}</option>)}
          </select>
        </Row>
        {n.anim !== 'none' && (
          <Row label="المدّة">
            <Num v={n.animDuration} on={v => set({ animDuration: v })} min={0.4} max={20} step={0.1} unit="ث" />
          </Row>
        )}
        {n.anim === 'sweep' && n.style !== 'gradient' && (
          <p className="text-[10px] text-amber-500/80">
            اللمعة تمرّ عبر التدرّج المقصوص على الحروف — اختر نمط «تدرّج» لتظهر.
          </p>
        )}
        {n.anim === 'cycle' && (
          <p className="text-[10px] text-gray-600">يبدّل بين اللون واللون الثاني، فيبقى ضمن اختيارك ولا يشحب.</p>
        )}

        <Row label="الدخول">
          <select value={n.enter} onChange={e => set({ enter: e.target.value })}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
            {NAME_FX_ENTERS.map(a => <option key={a} value={a}>{ENTER_LABEL[a] || a}</option>)}
          </select>
        </Row>
        <p className="text-[10px] text-gray-600">يُلعب مرّة عند ظهور البطاقة — والبطاقة تنقلب في مراسم الكشف.</p>
      </div>
    </div>
  );
}
