'use client';

import React, { useMemo, useState } from 'react';
import EntranceStage from '../EntranceStage';
import { ChipsEmblem, type EmblemId } from '../ChipsEmblems';
import {
  normalizeElements, ELEMENT_DEFAULTS, ENTRANCE_ELEMENT_TYPES, ENTRANCE_ENTER_FX,
  ENTRANCE_FROM, ENTRANCE_PRESETS, MAX_ELEMENTS, timelineEndMs, type EntranceElement,
} from '@/lib/entrance-schema';

// ══════════════════════════════════════════════════════
// 🚪 مصمّم تشريفة الدخول
//
// ⚠️ شكوى المالك: «أكثر عنصر فيه مشاكل — بدي أصمّم تشريفة وأتحكّم كاملاً
//    بالعناصر وحركتها وتأثيراتها». وكان الاختيار من أربعة تصاميم مثبّتة لا غير.
//
// اللوحة: قائمة عناصر تُضاف وتُحذف وتُرتَّب، لكل عنصر موضعه ولونه وحركة
// دخوله بتأخيرها ومدّتها — ومعاينة تُشغّل **مسرح الإنتاج نفسه** بزرّ إعادة.
// ══════════════════════════════════════════════════════

const TYPE_LABEL: Record<string, string> = {
  text: '📝 نصّ',
  name: '👤 اسم اللاعب',
  emblem: '🛡️ شعار',
  bar: '➖ شريط',
  seal: '⭕ ختم',
  wash: '🌑 خلفية',
  sparks: '✨ شرر',
};

const FX_LABEL: Record<string, string> = {
  fade: 'ظهور', slide: 'انزلاق', scale: 'تكبير', stamp: 'ختم', flip: 'قلب',
};

const FROM_LABEL: Record<string, string> = {
  top: 'من فوق', bottom: 'من تحت', left: 'من اليسار', right: 'من اليمين', center: 'من المركز',
};

const EMBLEMS: EmblemId[] = ['don', 'blood', 'neon', 'bullet', 'smoke', 'deal', 'crime', 'champ'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400">
      <span className="w-20 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Num({ v, on, min, max, step = 1, unit = '' }: {
  v: number; on: (x: number) => void; min: number; max: number; step?: number; unit?: string;
}) {
  return (
    <span className="flex items-center gap-2 flex-1">
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => on(Number(e.target.value))} className="flex-1 accent-amber-500" />
      <span className="w-14 text-[10px] text-gray-500 tabular-nums text-left">{v}{unit}</span>
    </span>
  );
}

function Color({ v, on }: { v: string; on: (x: string) => void }) {
  return (
    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#fcd34d'}
      onChange={e => on(e.target.value)}
      className="w-8 h-7 rounded border border-gray-600 bg-transparent cursor-pointer" />
  );
}

export default function EntranceEditor({ value, onChange }: {
  value: any;
  onChange: (els: EntranceElement[]) => void;
}) {
  const els = useMemo(() => normalizeElements(value), [value]);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [replay, setReplay] = useState(0);

  const commit = (next: EntranceElement[]) => onChange(normalizeElements(next));

  const patch = (i: number, p: Partial<EntranceElement>) =>
    commit(els.map((e, j) => (j === i ? { ...e, ...p } : e)));

  const add = (type: string) => {
    if (els.length >= MAX_ELEMENTS) return;
    const el: EntranceElement = {
      ...ELEMENT_DEFAULTS,
      id: `el${Date.now().toString(36).slice(-5)}`,
      type,
      // العنصر الجديد يبدأ بعد آخر ما على الخطّ الزمني، فلا يُدفن تحت سابقه
      delayMs: Math.min(5500, timelineEndMs(els)),
      text: type === 'text' ? 'نصّ' : '',
    };
    commit([...els, el]);
    setOpenIdx(els.length);
  };

  const remove = (i: number) => {
    commit(els.filter((_, j) => j !== i));
    setOpenIdx(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= els.length) return;
    const next = [...els];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
    setOpenIdx(j);
  };

  const endMs = timelineEndMs(els);

  return (
    <div className="space-y-3">
      {/* القوالب */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500">ابدأ من:</span>
        {Object.keys(ENTRANCE_PRESETS).map(k => (
          <button key={k} type="button"
            onClick={() => { commit(ENTRANCE_PRESETS[k]); setOpenIdx(null); setReplay(r => r + 1); }}
            className="px-2.5 py-1 rounded-lg text-[11px] bg-gray-800/70 border border-gray-700/40 text-gray-300 hover:border-amber-500/50 hover:text-amber-300 transition-all">
            {k === 'don' ? 'موكب العرّاب' : k === 'seal' ? 'ختم العائلة' : k === 'neon' ? 'لافتة النيون' : 'الملف السري'}
          </button>
        ))}
        {els.length > 0 && (
          <button type="button" onClick={() => { commit([]); setOpenIdx(null); }}
            className="px-2.5 py-1 rounded-lg text-[11px] bg-gray-800/40 border border-gray-700/40 text-gray-500 hover:text-rose-300 transition-all">
            تفريغ
          </button>
        )}
      </div>

      {/* المعاينة — مسرح الإنتاج نفسه */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-gray-500">
            المعاينة — الخطّ الزمني ينتهي عند {(endMs / 1000).toFixed(1)}ث
          </label>
          <button type="button" onClick={() => setReplay(r => r + 1)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-600/90 hover:bg-amber-500 text-black transition-all">
            ▶︎ إعادة التشغيل
          </button>
        </div>
        <div className="relative w-full rounded-2xl overflow-hidden border border-gray-700/40 bg-black"
          style={{ aspectRatio: '16 / 9' }}>
          {els.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
              أضف عنصراً لتبدأ — أو ابدأ من قالب
            </div>
          ) : (
            <EntranceStage key={replay} elements={els} playerName="محمّد" />
          )}
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">
          هذه نسبة شاشة القاعة نفسها. أثناء مباراة جارية تُختصر التشريفة إلى شريط علوي
          هادئ تلقائياً — مسرح كامل في منتصف نقاش محتدم يقطع اللعب لا يزيّنه.
        </p>
      </div>

      {/* إضافة عنصر */}
      <div>
        <label className="block text-[11px] text-gray-500 mb-1.5">
          أضف عنصراً ({els.length}/{MAX_ELEMENTS})
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ENTRANCE_ELEMENT_TYPES.map(t => (
            <button key={t} type="button" onClick={() => add(t)} disabled={els.length >= MAX_ELEMENTS}
              className="px-2.5 py-1.5 rounded-lg text-[11px] bg-gray-900/50 border border-gray-700/40 text-gray-300 hover:border-amber-500/50 hover:text-amber-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              {TYPE_LABEL[t] || t}
            </button>
          ))}
        </div>
      </div>

      {/* قائمة العناصر */}
      <div className="space-y-1.5">
        {els.map((el, i) => (
          <div key={`${el.id}-${i}`}
            className={`rounded-xl border transition-colors ${
              openIdx === i ? 'border-amber-500/40 bg-gray-800/40' : 'border-gray-700/30 bg-gray-900/25'
            }`}>
            <div className="flex items-center gap-2 p-2">
              <button type="button" onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="flex-1 flex items-center gap-2 text-right">
                <span className="text-[11px] text-gray-300">{TYPE_LABEL[el.type] || el.type}</span>
                <span className="text-[10px] text-gray-600 tabular-nums">
                  {el.delayMs}ms · {FX_LABEL[el.enterFx]}
                </span>
              </button>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="px-1.5 text-gray-500 hover:text-gray-200 disabled:opacity-20">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === els.length - 1}
                className="px-1.5 text-gray-500 hover:text-gray-200 disabled:opacity-20">↓</button>
              <button type="button" onClick={() => remove(i)}
                className="px-1.5 text-gray-600 hover:text-rose-400">✕</button>
            </div>

            {openIdx === i && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-700/30 pt-2">
                {(el.type === 'text' || el.type === 'seal') && (
                  <Row label="النصّ">
                    <input value={el.text} onChange={e => patch(i, { text: e.target.value })}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200" />
                  </Row>
                )}

                {el.type === 'emblem' && (
                  <Row label="الشعار">
                    <div className="flex flex-wrap gap-1 flex-1">
                      {EMBLEMS.map(id => (
                        <button key={id} type="button" onClick={() => patch(i, { emblemId: id })}
                          className={`p-1 rounded-lg border ${el.emblemId === id ? 'border-amber-500 bg-amber-900/20' : 'border-gray-700/40'}`}>
                          <ChipsEmblem id={id} size={22} />
                        </button>
                      ))}
                    </div>
                  </Row>
                )}

                <Row label="أفقياً"><Num v={el.x} on={v => patch(i, { x: v })} min={-50} max={50} unit="%" /></Row>
                <Row label="رأسياً"><Num v={el.y} on={v => patch(i, { y: v })} min={-50} max={50} unit="%" /></Row>
                <Row label="الحجم"><Num v={el.size} on={v => patch(i, { size: v })} min={10} max={400} /></Row>

                <Row label="اللون">
                  <span className="flex items-center gap-2 flex-1">
                    <Color v={el.color} on={c => patch(i, { color: c })} />
                    <span className="text-[10px] text-gray-600">ثانوي</span>
                    <Color v={el.color2} on={c => patch(i, { color2: c })} />
                  </span>
                </Row>

                <Row label="الحركة">
                  <select value={el.enterFx} onChange={e => patch(i, { enterFx: e.target.value })}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
                    {ENTRANCE_ENTER_FX.map(f => <option key={f} value={f}>{FX_LABEL[f] || f}</option>)}
                  </select>
                </Row>

                {el.enterFx === 'slide' && (
                  <Row label="الاتجاه">
                    <select value={el.from} onChange={e => patch(i, { from: e.target.value })}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300">
                      {ENTRANCE_FROM.map(f => <option key={f} value={f}>{FROM_LABEL[f] || f}</option>)}
                    </select>
                  </Row>
                )}

                <Row label="يبدأ عند"><Num v={el.delayMs} on={v => patch(i, { delayMs: v })} min={0} max={5500} step={50} unit="ms" /></Row>
                <Row label="مدّة الحركة"><Num v={el.durationMs} on={v => patch(i, { durationMs: v })} min={100} max={3000} step={50} unit="ms" /></Row>
                <Row label="الشفافية"><Num v={el.opacity} on={v => patch(i, { opacity: v })} min={0} max={1} step={0.05} /></Row>
              </div>
            )}
          </div>
        ))}
      </div>

      {els.length === 0 && (
        <p className="text-[11px] text-amber-500/80">
          التشريفة المخصّصة تحتاج عنصراً واحداً على الأقل — لا يُباع مسرح فارغ.
        </p>
      )}
    </div>
  );
}
