'use client';
// ══════════════════════════════════════════════════════
// 🚶 شاشة الترحيب — مشيٌ في زقاق «ليتل إيتالي» حتى باب النادي، عند كلّ فتحٍ للتطبيق (قرار المالك 2026-09-12)
// ══════════════════════════════════════════════════════
// المقطع مُصيَّر من محرّك شاشة القاعة نفسه (مصدرٌ واحد للحقيقة): /video/club-entry.mp4 عموديّ 720×1280.
// يُعرض فوق كلّ شيء عند تركيب تخطيط اللاعب (فتح التطبيق أو إعادة تحميله)، مسجَّلاً كان اللاعب أم لا،
// ثمّ يتلاشى عند انتهاء المقطع أو بعد 9 ثوانٍ أو بلمسة. صامتٌ وinline كي يعمل على iOS وPWA.
// لا يُعرض عند التنقّل داخل التطبيق (التخطيط لا يُعاد تركيبه)، ولا في المسارات المضمّنة (/join).
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';

const MAX_MS = 9000;
export default function WelcomeScene() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>('show');
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPhase('done'); return; }
    const t = setTimeout(() => setPhase('fade'), MAX_MS); return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (phase === 'fade') { const t = setTimeout(() => setPhase('done'), 700); return () => clearTimeout(t); } }, [phase]);
  useEffect(() => { const v = vid.current; if (!v) return; v.play().catch(() => setPhase('fade')); }, []);
  if (phase === 'done') return null;
  return (
    <div onClick={() => setPhase('fade')} className="fixed inset-0 z-[400] bg-[#05060c] transition-opacity duration-700" style={{ opacity: phase === 'fade' ? 0 : 1 }} aria-label="مرحباً في نادي المافيا">
      <video ref={vid} src="/video/club-entry.mp4" poster="/video/club-entry.jpg" muted playsInline autoPlay preload="auto" onEnded={() => setPhase('fade')} onError={() => setPhase('fade')} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(5,6,12,0), rgba(5,6,12,.85))' }} />
      <div className="absolute inset-x-0 bottom-12 text-center pointer-events-none" dir="rtl">
        <p className="font-mono text-[10px] tracking-[0.45em] text-[#C5A059]/90">MAFIA CLUB · LITTLE ITALY 1931</p>
        <p className="mt-1 text-4xl font-black" style={{ fontFamily: 'Amiri, serif', background: 'linear-gradient(180deg, #f6e7bd 0%, #C5A059 52%, #7d5f2a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.85))' }}>نادي المافيا</p>
        <p className="mt-2 text-[11px] text-[#9a8f7d]">المس الشاشة للمتابعة</p>
      </div>
    </div>
  );
}
