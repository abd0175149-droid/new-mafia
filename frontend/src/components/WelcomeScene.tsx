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

/** سقفُ إنقاذٍ مطلق (لم يعمل المقطع أصلاً) — أمّا السقفُ الفعليّ فيُضبط من مدّة المقطع عند أوّل إطارٍ حقيقيّ: كان 9000 مس من لحظة التركيب يساوي طولَ المقطع، فأيّ تأخّرٍ في التحميل يقصّ الوصولَ إلى الباب */
const HARD_MS = 15000, GRACE_MS = 1500;
/** يُرفع عند كلّ إعادة تصيير للمقطع (scripts/render-welcome.mjs) كي لا يعلق القديم في كاش المتصفّح/الوكيل — 2026-09-26: البيئة الجديدة ولافتتا النادي */
const VIDEO_V = '20260926';
export default function WelcomeScene() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>('show');
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPhase('done'); return; }
    const t = setTimeout(() => setPhase('fade'), HARD_MS); return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (phase === 'fade') { const t = setTimeout(() => setPhase('done'), 700); return () => clearTimeout(t); } }, [phase]);
  useEffect(() => { const v = vid.current; if (!v) return; v.play().catch(() => setPhase('fade')); }, []);
  const armed = useRef(false);
  const onPlaying = () => { if (armed.current) return; armed.current = true; const v = vid.current; const d = v && isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : 9000; setTimeout(() => setPhase('fade'), d + GRACE_MS); };
  if (phase === 'done') return null;
  return (
    <div onClick={() => setPhase('fade')} className="fixed inset-0 z-[400] bg-[#05060c] transition-opacity duration-700" style={{ opacity: phase === 'fade' ? 0 : 1 }} aria-label="مرحباً في نادي المافيا">
      <video ref={vid} src={`/video/club-entry.mp4?v=${VIDEO_V}`} poster={`/video/club-entry.jpg?v=${VIDEO_V}`} muted playsInline autoPlay preload="auto" onPlaying={onPlaying} onEnded={() => setPhase('fade')} onError={() => setPhase('fade')} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(5,6,12,0), rgba(5,6,12,.85))' }} />
      <div className="absolute inset-x-0 bottom-12 text-center pointer-events-none" dir="rtl">
        <p className="font-mono text-[10px] tracking-[0.45em] text-[#C5A059]/90">MAFIA CLUB · LITTLE ITALY 1931</p>
        <p className="mt-1 text-4xl font-black" style={{ fontFamily: 'Amiri, serif', background: 'linear-gradient(180deg, #f6e7bd 0%, #C5A059 52%, #7d5f2a 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.85))' }}>نادي المافيا</p>
        <p className="mt-2 text-[11px] text-[#9a8f7d]">المس الشاشة للمتابعة</p>
      </div>
    </div>
  );
}
