'use client';

import React, { useMemo } from 'react';
import EliminationFx, {
  normalizeElimFx, ELIMINATION_DESIGNS, type ElimFx,
} from '../EliminationFx';

// ══════════════════════════════════════════════════════
// 🔥 محرّر أنيميشن الإقصاء
//
// ⚠️ ما كان: تصميم واحد بلا أي معامل. المؤلّف يختار «نار» أو لا يختار شيئاً.
//
// المعاينة هنا تُشغّل **المكوّن الإنتاجي نفسه** فوق مستطيل معتم يحاكي
// البطاقة المُقصاة — فما يراه المؤلّف هو ما ترسمه شاشة القاعة حرفياً.
// ══════════════════════════════════════════════════════

const DESIGN_LABEL: Record<string, string> = {
  burn: '🔥 احتراق',
  ash: '🌫️ رماد',
  drain: '🩸 نزف',
  shatter: '💠 تحطّم',
  static: '📺 تشويش',
};

const DESIGN_HINT: Record<string, string> = {
  burn: 'ألسنة تصعد من أسفل البطاقة مع نثار متطاير — التصميم الأصلي.',
  ash: 'الوجه يبهت إلى رمادي وجسيمات رماد تتصاعد.',
  drain: 'موجة تنزل من أعلى وتُفرغ اللون، ثم تتجمّع أسفل البطاقة.',
  shatter: 'ومضة ثم شظايا تتباعد من المركز — أسرع التصاميم إيقاعاً.',
  static: 'البطاقة تفقد الإشارة: تشويش وخطّ مسح يمرّ.',
};

/** التصاميم التي لا تستعمل جسيمات — إخفاء المزلق أصدق من تعطيله */
const NO_PARTICLES = new Set(['drain', 'static']);

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
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#f97316'}
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

export default function ElimEditor({ value, onChange }: {
  value: any;
  onChange: (v: ElimFx) => void;
}) {
  const fx = useMemo(() => normalizeElimFx(value), [value]);
  const set = (patch: Partial<ElimFx>) => onChange(normalizeElimFx({ ...fx, ...patch }));

  // تبديل التصميم يعيد المعاملات إلى أفضل صورة له، لا يورّثها من السابق
  const pickDesign = (design: string) => onChange(normalizeElimFx({ design, showInRecap: fx.showInRecap }));

  return (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">التصميم</label>
        <div className="grid grid-cols-2 gap-1.5">
          {ELIMINATION_DESIGNS.map(d => (
            <button key={d} type="button" onClick={() => pickDesign(d)}
              className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border text-right transition-all ${
                fx.design === d ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/40 text-gray-400 hover:border-gray-600'
              }`}>
              {DESIGN_LABEL[d] || d}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">{DESIGN_HINT[fx.design]}</p>
      </div>

      {/* المعاينة — المكوّن الإنتاجي فوق بطاقة معتمة */}
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">المعاينة الحيّة</label>
        <div className="relative w-full h-40 rounded-2xl overflow-hidden border border-gray-700/40"
          style={{ background: 'linear-gradient(to bottom, #3f3f46, #18181b)', filter: 'grayscale(1)' }}>
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm font-black">
            بطاقة اللاعب
          </div>
          {/* key يُعيد تركيب المكوّن فتُعاد الحركات من بدايتها عند كل تعديل */}
          <EliminationFx key={JSON.stringify(fx)} config={fx} />
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-gray-800/40 p-3 space-y-2">
        <Row label="اللون الأساسي"><Color v={fx.color} on={c => set({ color: c })} /></Row>
        <Row label="اللون الثانوي"><Color v={fx.color2} on={c => set({ color2: c })} /></Row>

        {!NO_PARTICLES.has(fx.design) && (
          <Row label={fx.design === 'burn' ? 'عدد الألسنة' : fx.design === 'shatter' ? 'عدد الشظايا' : 'عدد الجسيمات'}>
            <Num v={fx.particles} on={v => set({ particles: v })} min={0} max={16} />
          </Row>
        )}

        <Row label="السرعة"><Num v={fx.speed} on={v => set({ speed: v })} min={0.25} max={3} step={0.05} unit="×" /></Row>
        <Row label="الشدّة"><Num v={fx.intensity} on={v => set({ intensity: v })} min={0} max={1} step={0.05} /></Row>

        {fx.particles > 10 && (
          <p className="text-[10px] text-amber-500/80 leading-relaxed">
            ⚠️ يُرسم لكل لاعب مُقصى على الشاشة نفسها. عشرة مُقصين × {fx.particles} جسيماً
            يُثقل جهاز العرض — أبقِه منخفضاً ما لم تُجرّبه على الشاشة فعلاً.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={fx.showInRecap}
          onChange={e => set({ showInRecap: e.target.checked })} className="accent-amber-500" />
        <span className="text-[11px] text-gray-300">يظهر في شبكة نتائج نهاية اللعبة أيضاً</span>
      </label>
      <p className="text-[10px] text-gray-600 -mt-1">
        قرار المالك (٥): الإقصاء مطفأ في شبكة النتائج افتراضياً — عشر بطاقات مشتعلة معاً تُفقد المشهد معناه.
      </p>
    </div>
  );
}
