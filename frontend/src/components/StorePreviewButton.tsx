'use client';

import React, { useState } from 'react';
import EntranceStage from './EntranceStage';
import EliminationFx from './EliminationFx';
import { EntranceOverlay } from './EntranceOverlay';

// ══════════════════════════════════════════════════════
// ▶︎ معاينة ما لا يُرى في المتجر
//
// ⚠️ أربعة أنواع تُباع بلا أي معاينة — أغلاها مسرحيةً — و**نغمة النصر
//    لا يمكن سماعها قبل الشراء إطلاقاً**. اللاعب يدفع ثمن شيء لم يره.
//
// 🔇 قيد معماري: جهاز القائد هو مصدر صوت القاعة الحصري والشاشة تابعة.
//    فمعاينة المتجر تُشغَّل **محلّياً على هاتف اللاعب** عبر عنصر Audio
//    خاص بها، ولا تمرّ بأي مسار بثّ — وإلا سمع الحضور نغمة نصر في منتصف
//    مباراة لأن أحدهم يتصفّح المتجر.
// ══════════════════════════════════════════════════════

const PREVIEWABLE = new Set(['entrance', 'elimination', 'victory_sting']);

export function canPreview(item: any): boolean {
  if (!item) return false;
  if (item.kind === 'victory_sting') return !!item.soundUrl;
  return PREVIEWABLE.has(item.kind);
}

export default function StorePreviewButton({ item, playerName }: {
  item: any;
  playerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  if (!canPreview(item)) return null;

  const playSting = () => {
    try {
      audioRef.current?.pause();
      const a = new Audio(item.soundUrl);
      a.volume = 0.85;
      audioRef.current = a;
      setPlaying(true);
      a.onended = () => setPlaying(false);
      void a.play().catch(() => setPlaying(false));
    } catch { setPlaying(false); }
  };

  const label = item.kind === 'victory_sting' ? (playing ? '🔊 تُعزف…' : '▶︎ اسمعها')
    : item.kind === 'entrance' ? '▶︎ شاهد التشريفة'
    : '▶︎ شاهد الإقصاء';

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (item.kind === 'victory_sting') playSting();
          else setOpen(true);
        }}
        className="mt-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 border border-white/15 text-gray-200 hover:border-amber-500/50 hover:text-amber-300 transition-all">
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/15 bg-black"
              style={{ aspectRatio: '16 / 9' }}>
              {item.kind === 'entrance' && (
                item.config?.design === 'custom'
                  ? <EntranceStage elements={item.config?.elements} playerName={playerName} />
                  : (
                    // التصاميم الجاهزة تُعرض بمكوّنها الحقيقي مصغَّراً
                    <div className="absolute inset-0 scale-[0.42] origin-center">
                      <EntranceOverlay data={{
                        design: item.config?.design || 'don',
                        name: playerName,
                        physicalId: 0,
                        compact: false,
                      } as any} />
                    </div>
                  )
              )}

              {item.kind === 'elimination' && (
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'linear-gradient(to bottom, #3f3f46, #18181b)', filter: 'grayscale(1)' }}>
                  <span className="text-gray-500 text-sm font-black">{playerName}</span>
                  <EliminationFx config={item.config} />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white/10 border border-white/15 text-white">
                إغلاق
              </button>
              {/* إعادة التشغيل بإعادة التركيب — أبسط من إدارة حالة الحركات */}
              <button onClick={() => { setOpen(false); setTimeout(() => setOpen(true), 60); }}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-600 text-black">
                ↻ أعِد
              </button>
            </div>
            <p className="text-[10px] text-gray-500 text-center mt-2">
              هذه معاينة على جهازك وحدك — لا تُبَثّ لشاشة القاعة.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
