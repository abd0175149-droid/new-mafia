'use client';
// 🗡️ أداة ثلاثيّة الأبعاد تدور داخل بطاقة — تُرسم من إطاراتٍ مُصيَّرة مسبقاً على لوحةٍ ثنائيّة الأبعاد (لا WebGL لكلّ بطاقة)
import { useEffect, useRef } from 'react';
import { prerenderProp, framesOf, propFor, FRAMES, FRAME_PX } from './street/props';

export default function PropStage({ type, size = 160, className = '' }: { type: string | null | undefined; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return; const kind = propFor(type); let raf = 0, i = 0, last = 0, alive = true;
    const draw = (t: number) => { raf = requestAnimationFrame(draw); if (t - last < 83) return; last = t; const fr = framesOf(kind); if (!fr) return; ctx.clearRect(0, 0, FRAME_PX, FRAME_PX); ctx.drawImage(fr[i % FRAMES], 0, 0); i++; };
    prerenderProp(kind).then(() => { if (alive) raf = requestAnimationFrame(draw); });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [type]);
  return <canvas ref={ref} width={FRAME_PX} height={FRAME_PX} className={className} style={{ width: size, height: size, borderRadius: 14, background: 'radial-gradient(circle at 50% 40%, rgba(197,160,89,.18), rgba(0,0,0,0) 70%)' }} />;
}
