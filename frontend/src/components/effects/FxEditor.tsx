'use client';

import React from 'react';
import { normalizeFx, FX_CHANNELS, type FxChannels } from '@/lib/chips-fx';

// ══════════════════════════════════════════════════════
// 🎛️ محرّر كائن التأثيرات — مكوّن مُتحكَّم فيه
//
// ⚠️ لماذا وُجد: المحرّر الوحيد للتأثيرات كان محبوساً داخل صفحة تأثيرات
//    الرتب ومربوطاً بمسارها، رغم أن إعداد الإطار المشترى **مطابق البنية
//    حرفياً**. فكانت الإطارات — أغلى نوع في الخزنة — غير قابلة للتأليف
//    من لوحة الكتالوج إطلاقاً.
//
// كل تغيير يمرّ من normalizeFx فوراً، فلا يمكن أن تُنتج هذه اللوحة كائناً
// يرفضه الخادم أو يعجز المُصيّر عن رسمه.
// ══════════════════════════════════════════════════════

const CHANNEL_LABELS: Record<string, string> = {
  border: '🔲 الحدود',
  glow: '💡 التوهّج',
  shimmer: '✨ اللمعة',
  particles: '🟡 الجزيئات',
  corners: '⌜ الزوايا',
  frame: '🖼️ الإطار الزخرفي',
  gradientOverlay: '🌈 طبقة التدرّج',
  floating: '🎈 عنصر عائم',
  badge: '🏷️ الشارة',
  nameEffect: '🔤 تأثير الاسم',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-gray-400">
      <span className="w-24 shrink-0">{label}</span>
      {children}
    </label>
  );
}

function Color({ v, on }: { v: string; on: (x: string) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <input type="color" value={v} onChange={e => on(e.target.value)}
        className="w-7 h-7 rounded border border-gray-600 bg-transparent cursor-pointer" />
      <input value={v} onChange={e => on(e.target.value)}
        className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 font-mono" />
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

function Pick<T extends string>({ v, on, options }: { v: T; on: (x: T) => void; options: readonly T[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map(o => (
        <button key={o} type="button" onClick={() => on(o)}
          className={`text-[10px] px-2 py-0.5 rounded border ${v === o
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : 'text-gray-500 border-gray-700/40 hover:text-gray-300'}`}>
          {o}
        </button>
      ))}
    </span>
  );
}

export interface FxEditorProps {
  value: any;
  onChange: (next: FxChannels) => void;
  /** أشكال الإطار الزخرفي المتاحة — تأتي من سجلّ الخادم لا من ثوابت منسوخة */
  frameTypes?: readonly string[];
}

export default function FxEditor({ value, onChange, frameTypes }: FxEditorProps) {
  const fx = React.useMemo(() => normalizeFx(value), [value]);
  const set = (channel: string, patch: any) =>
    onChange(normalizeFx({ ...fx, [channel]: { ...(fx as any)[channel], ...patch } }));

  const types = (frameTypes && frameTypes.length ? frameTypes : ['none', 'simple', 'greek', 'islamic', 'deco', 'royal']) as readonly string[];

  return (
    <div className="space-y-2">
      {FX_CHANNELS.map(ch => {
        const c: any = (fx as any)[ch];
        const enabled = !!c.enabled;
        // 💡 التوهّج يُرسم داخل كتلة الحدود حصراً — نُعطّل مفتاحه ونقول السبب
        //    بدل أن نعرض خياراً لا يفعل شيئاً (كما كان المحرّر القديم).
        const blocked = ch === 'glow' && !fx.border.enabled;
        return (
          <div key={ch} className={`rounded-xl border overflow-hidden ${enabled ? 'border-amber-500/30 bg-gray-800/40' : 'border-gray-700/30 bg-gray-900/20'}`}>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-bold text-gray-300">{CHANNEL_LABELS[ch] || ch}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                {blocked && <span className="text-[9px] text-amber-500/80">فعّل الحدود أولاً</span>}
                <input type="checkbox" checked={enabled} disabled={blocked}
                  onChange={e => set(ch, { enabled: e.target.checked })}
                  className="accent-amber-500 disabled:opacity-30" />
              </label>
            </div>

            {enabled && (
              <div className="px-3 pb-3 space-y-1.5 border-t border-gray-700/30 pt-2">
                {ch === 'border' && <>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="السمك"><Num v={c.width} on={v => set(ch, { width: v })} min={0.5} max={6} step={0.5} unit="px" /></Row>
                  <Row label="الإزاحة"><Num v={c.inset} on={v => set(ch, { inset: v })} min={-10} max={10} unit="px" /></Row>
                  <Row label="النمط"><Pick v={c.style} on={v => set(ch, { style: v })} options={['solid', 'gradient', 'traveling'] as const} /></Row>
                  {c.style !== 'solid' && <>
                    <Row label="ألوان التدرّج">
                      <input value={(c.gradientColors || []).join(',')}
                        onChange={e => set(ch, { gradientColors: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                        placeholder="#aabbcc,#ddeeff"
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 font-mono" />
                    </Row>
                    {c.style === 'traveling' && <Row label="سرعة الدوران"><Num v={c.travelSpeed} on={v => set(ch, { travelSpeed: v })} min={0.5} max={20} step={0.5} unit="s" /></Row>}
                  </>}
                </>}

                {ch === 'glow' && <>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="الحجم"><Num v={c.size} on={v => set(ch, { size: v })} min={0} max={60} unit="px" /></Row>
                  <Row label="الشفافية"><Num v={c.opacity} on={v => set(ch, { opacity: v })} min={0} max={1} step={0.05} /></Row>
                  <Row label="نبض">
                    <input type="checkbox" checked={c.pulseEnabled} onChange={e => set(ch, { pulseEnabled: e.target.checked })} className="accent-amber-500" />
                  </Row>
                  {c.pulseEnabled && <Row label="سرعة النبض"><Num v={c.pulseDuration} on={v => set(ch, { pulseDuration: v })} min={0.4} max={10} step={0.1} unit="s" /></Row>}
                </>}

                {ch === 'shimmer' && <>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="الشفافية"><Num v={c.opacity} on={v => set(ch, { opacity: v })} min={0} max={1} step={0.05} /></Row>
                  <Row label="المدّة"><Num v={c.duration} on={v => set(ch, { duration: v })} min={0.5} max={20} step={0.5} unit="s" /></Row>
                </>}

                {ch === 'particles' && <>
                  <Row label="الحركة"><Pick v={c.animationType} on={v => set(ch, { animationType: v })} options={['orbit', 'burst'] as const} /></Row>
                  <Row label="العدد"><Num v={c.count} on={v => set(ch, { count: v })} min={0} max={12} /></Row>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="الحجم"><Num v={c.size} on={v => set(ch, { size: v })} min={1} max={12} unit="px" /></Row>
                  <Row label="المدار">
                    <input value={c.orbitRadius} onChange={e => set(ch, { orbitRadius: e.target.value })}
                      placeholder="90px"
                      className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 font-mono" />
                  </Row>
                  <Row label="السرعة"><Num v={c.baseDuration} on={v => set(ch, { baseDuration: v })} min={0.5} max={20} step={0.5} unit="s" /></Row>
                </>}

                {ch === 'corners' && <>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="الطول"><Num v={c.size} on={v => set(ch, { size: v })} min={4} max={40} unit="px" /></Row>
                  <Row label="السمك"><Num v={c.width} on={v => set(ch, { width: v })} min={1} max={6} unit="px" /></Row>
                  <Row label="نبض">
                    <input type="checkbox" checked={c.pulseEnabled} onChange={e => set(ch, { pulseEnabled: e.target.checked })} className="accent-amber-500" />
                  </Row>
                </>}

                {ch === 'frame' && <>
                  <Row label="الشكل"><Pick v={c.type} on={v => set(ch, { type: v })} options={types as any} /></Row>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="الشفافية"><Num v={c.opacity} on={v => set(ch, { opacity: v })} min={0} max={1} step={0.05} /></Row>
                  <Row label="سمك الخط"><Num v={c.strokeWidth} on={v => set(ch, { strokeWidth: v })} min={0.5} max={6} step={0.1} /></Row>
                </>}

                {ch === 'gradientOverlay' && <>
                  <Row label="اللون"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="الشفافية"><Num v={c.opacity} on={v => set(ch, { opacity: v })} min={0} max={1} step={0.02} /></Row>
                  <Row label="الاتجاه"><Pick v={c.direction} on={v => set(ch, { direction: v })} options={['to top', 'to bottom', 'to left', 'to right'] as const} /></Row>
                </>}

                {ch === 'floating' && <>
                  <Row label="المحتوى">
                    <input value={c.content} onChange={e => set(ch, { content: e.target.value })} placeholder="👑"
                      className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-sm text-center" />
                  </Row>
                  <Row label="الحجم"><Num v={c.size} on={v => set(ch, { size: v })} min={6} max={80} unit="px" /></Row>
                  <Row label="الحركة"><Pick v={c.animation} on={v => set(ch, { animation: v })} options={['float', 'bounce', 'spin'] as const} /></Row>
                  <Row label="توهّجه"><Color v={c.glowColor} on={v => set(ch, { glowColor: v })} /></Row>
                </>}

                {ch === 'badge' && <>
                  <Row label="الرمز">
                    <input value={c.emoji} onChange={e => set(ch, { emoji: e.target.value })} placeholder="👑"
                      className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-sm text-center" />
                  </Row>
                  <Row label="النص">
                    <input value={c.label} onChange={e => set(ch, { label: e.target.value })} placeholder="أسطوري"
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-[11px]" />
                  </Row>
                  <Row label="لون النص"><Color v={/^#/.test(c.textColor) ? c.textColor : '#fcd34d'} on={v => set(ch, { textColor: v })} /></Row>
                </>}

                {ch === 'nameEffect' && <>
                  <Row label="لون الاسم"><Color v={c.color} on={v => set(ch, { color: v })} /></Row>
                  <Row label="لون التوهّج"><Color v={c.glowColor} on={v => set(ch, { glowColor: v })} /></Row>
                  <Row label="حجم التوهّج"><Num v={c.glowSize} on={v => set(ch, { glowSize: v })} min={0} max={30} unit="px" /></Row>
                </>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
