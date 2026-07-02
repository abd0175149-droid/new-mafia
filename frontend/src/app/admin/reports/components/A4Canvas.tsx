'use client';
import { useEffect, useRef } from 'react';
import type { LayoutConfig } from '../lib/printLayoutContract';
import { labelForElement } from '../lib/printLayoutContract';

interface Props {
  layout: LayoutConfig;
  letterheadUrl: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}

export default function A4Canvas({ layout, letterheadUrl, selectedId, onSelect, onMove }: Props) {
  const isLand = layout.orientation === 'landscape';
  const pageWmm = isLand ? 297 : 210;
  const pageHmm = isLand ? 210 : 297;
  const targetW = isLand ? 620 : 440;
  const pxPerMm = targetW / pageWmm;
  const boxW = pageWmm * pxPerMm;
  const boxH = pageHmm * pxPerMm;

  const drag = useRef<{ id: string; mx: number; my: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const nx = Math.max(0, Math.min(pageWmm, d.ox - (e.clientX - d.mx) / pxPerMm));
      const ny = Math.max(0, Math.min(pageHmm, d.oy + (e.clientY - d.my) / pxPerMm));
      onMove(d.id, Math.round(nx * 10) / 10, Math.round(ny * 10) / 10);
    };
    const up = () => { drag.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [pxPerMm, pageWmm, pageHmm, onMove]);

  const m = layout.margins;

  return (
    <div className="flex justify-center">
      <div
        className="relative bg-white shadow-2xl overflow-hidden select-none"
        style={{ width: boxW, height: boxH, direction: 'rtl' }}
        onMouseDown={() => onSelect(null)}
      >
        {/* الورق الرسمي */}
        {layout.showLetterhead && letterheadUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={letterheadUrl} alt="letterhead" className="absolute inset-0 w-full h-full object-fill pointer-events-none" />
        )}

        {/* دليل منطقة المحتوى */}
        <div
          className="absolute border border-dashed border-amber-400/60 pointer-events-none"
          style={{
            top: m.top * pxPerMm, right: m.right * pxPerMm,
            width: (pageWmm - m.left - m.right) * pxPerMm,
            height: (pageHmm - m.top - m.bottom) * pxPerMm,
          }}
        >
          <span className="absolute -top-4 right-0 text-[9px] text-amber-600">منطقة المحتوى</span>
        </div>

        {/* العناصر المسحوبة */}
        {Object.entries(layout.elements || {}).map(([id, el]) => {
          if (!el || el.hidden) return null;
          const isSel = selectedId === id;
          const text = el.text || (id === 'title' ? '«عنوان التقرير»' : id === 'subtitle' ? '«العنوان الفرعي»'
            : id === 'generated' ? '«تاريخ الإنشاء»' : id === 'filters' ? '«الفلاتر»' : labelForElement(id));
          return (
            <div
              key={id}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(id); drag.current = { id, mx: e.clientX, my: e.clientY, ox: el.x, oy: el.y }; }}
              className={`absolute cursor-move whitespace-nowrap px-1 rounded ${isSel ? 'ring-2 ring-amber-500 bg-amber-500/10' : 'hover:bg-blue-500/10'}`}
              style={{
                top: el.y * pxPerMm, right: el.x * pxPerMm,
                width: el.w ? el.w * pxPerMm : undefined,
                fontSize: Math.max(6, (el.fontSize || 11) * pxPerMm * 0.35),
                color: el.color || '#111', fontWeight: el.bold ? 800 : 400,
                textAlign: el.align || 'right',
              }}
            >
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
