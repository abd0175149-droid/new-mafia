'use client';
// ══════════════════════════════════════════════════════
// 🏙️ StreetStage — المضيف الدائم لمشهد المدينة على مستوى صفحة القاعة
// ══════════════════════════════════════════════════════
// خطّة الإصلاح المعتمدة 2026-09-12: مضيفٌ واحد يبقى مركّباً عبر المراحل (لا فكّ/تركيب بين الليل والصباح)،
// الطور يُترجَم إلى وضعٍ (night/dawn/day) والطبقات وحدها تتبدّل فوقه.
//   mode      : الوضع المطلوب؛ 'off' يوقف الرسم ويخفي اللوحة (اللوبي، النهاية…)
//   event     : نوع حدث الصباح → لقطة حدث (بلا هويّة)؛ eventKey يتغيّر مع كلّ حدثٍ ولو تكرّر النوع
//   docked    : الإطار يُزاح كي يبقى المشهد في الثلثين الأيسرين (بطاقة الصباح يميناً)
//   ambient   : خلفيّة النهار خلف الكروت (جودةٌ محيطيّة + تعتيم)، وعلى الأجهزة الضعيفة ملصقٌ ثابت
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { getStreetEngine, type StreetEvent, type StreetMode } from './street/engine';

const EVENT_MAP: Record<string, StreetEvent> = {
  ASSASSINATION: 'KILL', ASSASSIN_KILL: 'KILL', PHOENIX_BURN: 'KILL', TWIN_SUICIDE: 'KILL', POLICEWOMAN_EXECUTION: 'KILL',
  ASSASSINATION_BLOCKED: 'SAVED', ASSASSIN_BLOCKED: 'SAVED', PHOENIX_ASH: 'SAVED',
  SILENCED: 'SILENCE', POLICEWOMAN: 'SILENCE', ABILITY_DISABLED: 'DISABLE',
  SNIPE_MAFIA: 'SNIPE', SNIPE_CITIZEN: 'SNIPE', SHERIFF_REVENGE: 'SNIPE',
};
export type StageMode = StreetMode | 'off';
type Tier = 'live' | 'poster';

// الملصق الثابت فقط عندما تثبت الجودة «منخفض» بعد الفحص (أقلّ من 18 إطاراً)؛ 30 إطاراً كافية للمشهد الحيّ
function tierFor(q: string): Tier { return q === 'low' ? 'poster' : 'live'; }

export default function StreetStage({ mode, event, eventKey, docked, ambient, debug, hint }: { mode: StageMode; event?: string | null; eventKey?: string | number; docked?: boolean; ambient?: boolean; debug?: boolean; hint?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);
  const [poster, setPoster] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>('live');
  const [stats, setStats] = useState('');
  // 🧪 شارة التشخيص (مؤقّتة حتى الاختبار على جهاز القاعة): أيّ نسخةٍ تعمل وبأيّ جودة — تُخفى بـ ?dbg=0 أو localStorage display3dDebug=0
  useEffect(() => {
    if (!debug) return; let hide = false; try { hide = new URLSearchParams(location.search).get('dbg') === '0' || localStorage.getItem('display3dDebug') === '0'; } catch { /* noop */ }
    if (hide) return; const t = setInterval(() => { const e = getStreetEngine(); if (!e) { setStats('NO WEBGL'); return; } const st = e.stats(); setStats(`ENV ${st.mode.toUpperCase()} · QUALITY ${st.quality.toUpperCase()}${st.ambient ? ' (AMBIENT)' : ''} · ${tier === 'poster' ? 'STATIC POSTER' : 'LIVE 3D'} · ${st.ready ? (st.prewarm ? `WARM ${st.prewarmMs}ms` : 'WARMING') : 'LOADING'} · ${st.fps} FPS · ${st.tris} TRIS · ${st.calls} CALLS · LAST SWITCH ${st.lastTransitionMs}ms`); }, 1000); return () => clearInterval(t);
  }, [debug, tier, mode]);

  const [quality, setQuality] = useState('high');
  useEffect(() => {
    const el = ref.current; const eng = getStreetEngine(); if (!el || !eng) { setOk(false); return; }
    eng.mount(el); setQuality(eng.quality); eng.onQuality = (q) => setQuality(q); (window as any).__street = eng; return () => { eng.onQuality = null; eng.unmount(); };
  }, []);

  useEffect(() => {
    const eng = getStreetEngine(); if (!eng) return;
    if (mode === 'off') { eng.setActive(false); return; }
    const t = tierFor(quality); setTier(t);
    eng.setMode(mode); eng.setAmbient(!!ambient && mode === 'day'); eng.setFrameShift(docked ? .17 : 0);
    if (t === 'poster') { eng.setActive(true); eng.capturePoster().then(url => { if (url) setPoster(url); eng.setActive(false); }); }
    else { setPoster(null); eng.setActive(true); }
  }, [mode, docked, ambient, quality]);

  // 🔮 تلميح الموجّه: الغسق يبدأ قبل الضغط على «بدء الليل» ويعود إن تراجع
  useEffect(() => { const eng = getStreetEngine(); if (!eng) return; if (hint === 'night-arming') eng.setDusk(true); else if (hint === 'night-disarm') eng.setDusk(false); }, [hint]);
  useEffect(() => {
    if (!event) return; const k = EVENT_MAP[event]; if (!k) return; getStreetEngine()?.fireEvent(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, eventKey]);

  const hidden = mode === 'off';
  return (
    <div className="absolute inset-0 overflow-hidden transition-opacity duration-700" style={{ opacity: hidden ? 0 : 1, pointerEvents: 'none' }} aria-hidden>
      <div ref={ref} className="absolute inset-0" style={{ background: mode === 'night' ? '#05060c' : '#2a2a30', visibility: poster && tier === 'poster' ? 'hidden' : 'visible' }} />
      {!ok && <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 80%, #1a1712 0%, #05060c 70%)' }} />}
      {poster && tier === 'poster' && !hidden && (
        // 📷 الأجهزة الضعيفة: صورةٌ من المشهد نفسه بحركة كاميرا بطيئة
        <img src={poster} alt="" className="absolute" style={{ inset: '-4%', width: '108%', height: '108%', objectFit: 'cover', animation: 'kb 40s ease-in-out infinite alternate' }} />
      )}
      {ambient && mode === 'day' && !hidden && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,5,7,.58), rgba(5,5,7,.8))' }} />}
      {!!stats && <div className="absolute left-2 bottom-2 z-[999] font-mono text-[11px] tracking-wider text-[#9fe0a8] bg-black/70 border border-[#9fe0a8]/30 rounded px-2 py-0.5" dir="ltr" style={{ pointerEvents: 'none' }}>{stats}</div>}
      <style>{`@keyframes kb { from { transform: scale(1) translateX(0) } to { transform: scale(1.06) translateX(-2%) } }`}</style>
    </div>
  );
}
