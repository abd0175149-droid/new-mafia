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

function tierFor(mode: StageMode): Tier {
  try { const q = new URLSearchParams(location.search).get('q') || localStorage.getItem('display3dQuality') || 'high'; if (mode === 'day') return q === 'high' ? 'live' : 'poster'; return q === 'low' ? 'poster' : 'live'; } catch { return 'live'; }
}

export default function StreetStage({ mode, event, eventKey, docked, ambient }: { mode: StageMode; event?: string | null; eventKey?: string | number; docked?: boolean; ambient?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);
  const [poster, setPoster] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>('live');

  useEffect(() => {
    const el = ref.current; const eng = getStreetEngine(); if (!el || !eng) { setOk(false); return; }
    eng.mount(el); return () => eng.unmount();
  }, []);

  useEffect(() => {
    const eng = getStreetEngine(); if (!eng) return;
    if (mode === 'off') { eng.setActive(false); return; }
    const t = tierFor(mode); setTier(t);
    eng.setMode(mode); eng.setAmbient(!!ambient && mode === 'day'); eng.setFrameShift(docked ? .17 : 0);
    if (t === 'poster') { eng.setActive(true); eng.capturePoster().then(url => { if (url) setPoster(url); eng.setActive(false); }); }
    else { setPoster(null); eng.setActive(true); }
  }, [mode, docked, ambient]);

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
      <style>{`@keyframes kb { from { transform: scale(1) translateX(0) } to { transform: scale(1.06) translateX(-2%) } }`}</style>
    </div>
  );
}
