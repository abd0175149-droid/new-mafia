'use client';
// 🗡️ أداة ثلاثيّة الأبعاد تدور داخل بطاقة (منصّة الأدوات) — تُستعمل في ضربات الليل وبطاقات الصباح
import { useEffect, useRef } from 'react';
import { PropStage as Stage, propFor } from './street/props';

export default function PropStage({ type, size = 160, className = '' }: { type: string | null | undefined; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const stage = useRef<Stage | null>(null);
  useEffect(() => { const c = ref.current; if (!c) return; try { stage.current = new Stage(c, 220); } catch { stage.current = null; } return () => { stage.current?.dispose(); stage.current = null; }; }, []);
  useEffect(() => { stage.current?.show(propFor(type)); }, [type]);
  return <canvas ref={ref} width={220} height={220} className={className} style={{ width: size, height: size, borderRadius: 14, background: 'radial-gradient(circle at 50% 40%, rgba(197,160,89,.18), rgba(0,0,0,0) 70%)' }} />;
}
