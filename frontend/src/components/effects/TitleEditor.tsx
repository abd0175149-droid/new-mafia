'use client';

import React, { useMemo } from 'react';
import {
  normalizeTitlePlaque, TITLE_PLAQUE_DEFAULTS, TITLE_ANIMS,
  type TitlePlaqueConfig,
} from '../TitlePlaque';

// ══════════════════════════════════════════════════════
// 🏷️ محرّر لوحة اللقب — مكوّن مُتحكَّم فيه
//
// ⚠️ لماذا وُجد: اللقب كان ثلاثة أنماط ثابتة لا غير. المؤلّف يختار من
//    قائمة من ثلاثة، وأي شكل رابع يحتاج CSS جديداً ونشرة.
//
// على نمط FxEditor نفسه: كل ضغطة مفتاح تمرّ من المُطبِّع فوراً، فلا يمكن
// لهذه اللوحة أن تُنتج إعداداً يرفضه الخادم أو يعجز المُصيّر عن رسمه.
// ══════════════════════════════════════════════════════

const ANIM_LABELS: Record<string, string> = {
  none: 'بلا حركة',
  pulse: 'نبض التوهّج',
  breathe: 'تنفّس (شفافية)',
  shimmer: 'لمعة تمرّ',
  float: 'طفو خفيف',
};

const WEIGHTS = [400, 600, 700, 800, 900];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400">
      <span className="w-24 shrink-0" title={hint}>{label}</span>
      {children}
    </div>
  );
}

function Color({ v, on }: { v: string; on: (x: string) => void }) {
  // القيم قد تكون rgba() — وحقل color لا يقبلها، فيبقى النصّ هو المصدر
  const hexish = /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#f59e0b';
  return (
    <span className="flex items-center gap-1.5 flex-1">
      <input type="color" value={hexish} onChange={e => on(e.target.value)}
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

function Toggle({ on, set, label }: { on: boolean; set: (b: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} className="accent-amber-500" />
      <span className="text-[11px] text-gray-300">{label}</span>
    </label>
  );
}

function Card({ title, children, active = true }: { title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 space-y-2 transition-colors ${
      active ? 'border-amber-500/30 bg-gray-800/40' : 'border-gray-700/30 bg-gray-900/20'
    }`}>
      <div className="text-xs font-bold text-gray-300">{title}</div>
      {children}
    </div>
  );
}

export default function TitleEditor({ value, onChange }: {
  value: any;
  onChange: (v: TitlePlaqueConfig) => void;
}) {
  const p = useMemo(() => normalizeTitlePlaque(value), [value]);

  /** كل تعديل يعود مُطبَّعاً — لا حالة محلّية تنحرف عن المصدر */
  const set = (channel: keyof TitlePlaqueConfig, patch: any) =>
    onChange(normalizeTitlePlaque({ ...p, [channel]: { ...(p as any)[channel], ...patch } }));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500">ابدأ من:</span>
        {(['gold', 'blood', 'ghost'] as const).map(k => (
          <button key={k} type="button"
            onClick={() => onChange(normalizeTitlePlaque(PRESETS[k]))}
            className="px-2.5 py-1 rounded-lg text-[11px] bg-gray-800/70 border border-gray-700/40 text-gray-300 hover:border-amber-500/50 hover:text-amber-300 transition-all">
            {k === 'gold' ? 'ذهبي' : k === 'blood' ? 'دموي' : 'شبحي'}
          </button>
        ))}
        <button type="button" onClick={() => onChange(normalizeTitlePlaque({}))}
          className="px-2.5 py-1 rounded-lg text-[11px] bg-gray-800/40 border border-gray-700/40 text-gray-500 hover:text-gray-300 transition-all">
          تصفير
        </button>
      </div>

      <Card title="🎨 الخلفية">
        <Row label="النوع">
          <select value={p.bg.type} onChange={e => set('bg', { type: e.target.value })}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
            <option value="solid">لون واحد</option>
            <option value="gradient">تدرّج</option>
          </select>
        </Row>
        <Row label="اللون"><Color v={p.bg.color} on={c => set('bg', { color: c })} /></Row>
        {p.bg.type === 'gradient' && (
          <>
            <Row label="اللون الثاني"><Color v={p.bg.color2} on={c => set('bg', { color2: c })} /></Row>
            <Row label="الزاوية"><Num v={p.bg.angle} on={n => set('bg', { angle: n })} min={0} max={360} unit="°" /></Row>
          </>
        )}
        <Row label="ضبابية" hint="backdrop blur — صفر يُلغي الخاصية كلياً">
          <Num v={p.bg.blur} on={n => set('bg', { blur: n })} min={0} max={12} unit="px" />
        </Row>
      </Card>

      <Card title="🔤 النص">
        <Row label="اللون"><Color v={p.text.color} on={c => set('text', { color: c })} /></Row>
        <Row label="الحجم"><Num v={p.text.size} on={n => set('text', { size: n })} min={8} max={20} unit="px" /></Row>
        <Row label="السماكة">
          <select value={p.text.weight} onChange={e => set('text', { weight: Number(e.target.value) })}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
            {WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </Row>
        <Row label="تباعد الحروف">
          <Num v={p.text.letterSpacing} on={n => set('text', { letterSpacing: n })} min={-0.5} max={4} step={0.1} unit="px" />
        </Row>
      </Card>

      <Card title="🔲 الحدود" active={p.border.enabled}>
        <Toggle on={p.border.enabled} set={b => set('border', { enabled: b })} label="مفعّلة" />
        {p.border.enabled && (
          <>
            <Row label="اللون"><Color v={p.border.color} on={c => set('border', { color: c })} /></Row>
            <Row label="السماكة"><Num v={p.border.width} on={n => set('border', { width: n })} min={0} max={4} step={0.5} unit="px" /></Row>
            <Row label="النمط">
              <select value={p.border.style} onChange={e => set('border', { style: e.target.value })}
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
                <option value="solid">متصل</option>
                <option value="dashed">متقطّع</option>
                <option value="dotted">منقّط</option>
                <option value="double">مزدوج</option>
              </select>
            </Row>
          </>
        )}
        <Row label="الاستدارة"><Num v={p.border.radius} on={n => set('border', { radius: n })} min={0} max={20} unit="px" /></Row>
      </Card>

      <Card title="💡 التوهّج" active={p.glow.enabled}>
        <Toggle on={p.glow.enabled} set={b => set('glow', { enabled: b })} label="مفعّل" />
        {p.glow.enabled && (
          <>
            <Row label="اللون"><Color v={p.glow.color} on={c => set('glow', { color: c })} /></Row>
            <Row label="الحجم"><Num v={p.glow.size} on={n => set('glow', { size: n })} min={0} max={24} unit="px" /></Row>
          </>
        )}
      </Card>

      <Card title="🌑 الظلّ" active={p.shadow.enabled}>
        <Toggle on={p.shadow.enabled} set={b => set('shadow', { enabled: b })} label="مفعّل" />
        {p.shadow.enabled && (
          <>
            <Row label="اللون"><Color v={p.shadow.color} on={c => set('shadow', { color: c })} /></Row>
            <Row label="الحجم"><Num v={p.shadow.size} on={n => set('shadow', { size: n })} min={0} max={30} unit="px" /></Row>
          </>
        )}
      </Card>

      <Card title="🎬 الحركة" active={p.anim.type !== 'none'}>
        <Row label="النوع">
          <select value={p.anim.type} onChange={e => set('anim', { type: e.target.value })}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
            {TITLE_ANIMS.map(a => <option key={a} value={a}>{ANIM_LABELS[a] || a}</option>)}
          </select>
        </Row>
        {p.anim.type !== 'none' && (
          <>
            <Row label="المدّة"><Num v={p.anim.duration} on={n => set('anim', { duration: n })} min={0.4} max={20} step={0.1} unit="ث" /></Row>
            <Row label="الشدّة"><Num v={p.anim.intensity} on={n => set('anim', { intensity: n })} min={0} max={1} step={0.05} /></Row>
            {p.anim.type === 'pulse' && !p.glow.enabled && (
              <p className="text-[10px] text-amber-500/80">النبض يُرسم على التوهّج — فعّل التوهّج ليظهر.</p>
            )}
          </>
        )}
      </Card>

      <Card title="📐 التخطيط">
        <Row label="حشو أفقي"><Num v={p.layout.paddingX} on={n => set('layout', { paddingX: n })} min={0} max={24} unit="px" /></Row>
        <Row label="حشو رأسي"><Num v={p.layout.paddingY} on={n => set('layout', { paddingY: n })} min={0} max={12} unit="px" /></Row>
        <Row label="مسافة علوية"><Num v={p.layout.marginTop} on={n => set('layout', { marginTop: n })} min={0} max={16} unit="px" /></Row>
        <Row label="أقصى عرض"><Num v={p.layout.maxWidth} on={n => set('layout', { maxWidth: n })} min={40} max={100} unit="%" /></Row>
      </Card>
    </div>
  );
}

/** قوالب البداية — تُنتج شكل الأنماط الثلاثة بالبيانات */
const PRESETS: Record<string, any> = {
  gold: TITLE_PLAQUE_DEFAULTS,
  blood: {
    ...TITLE_PLAQUE_DEFAULTS,
    bg: { ...TITLE_PLAQUE_DEFAULTS.bg, color: 'rgba(69,10,10,0.8)' },
    text: { ...TITLE_PLAQUE_DEFAULTS.text, color: '#fca5a5' },
    border: { ...TITLE_PLAQUE_DEFAULTS.border, color: 'rgba(220,38,38,0.6)' },
    glow: { enabled: true, color: 'rgba(220,38,38,0.6)', size: 10 },
    anim: { type: 'pulse', duration: 1.6, intensity: 0.75 },
  },
  ghost: {
    ...TITLE_PLAQUE_DEFAULTS,
    bg: { ...TITLE_PLAQUE_DEFAULTS.bg, color: 'rgba(24,24,27,0.7)' },
    text: { ...TITLE_PLAQUE_DEFAULTS.text, color: '#d4d4d8' },
    border: { ...TITLE_PLAQUE_DEFAULTS.border, color: 'rgba(161,161,170,0.5)' },
    glow: { enabled: false, color: 'rgba(161,161,170,0.4)', size: 6 },
    anim: { type: 'breathe', duration: 3, intensity: 0.58 },
  },
};
