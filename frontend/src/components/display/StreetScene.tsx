'use client';
// ══════════════════════════════════════════════════════
// 🏙️ StreetScene — غلاف React لمحرّك «Via dei Segreti» (three خام، مفرد يبقى حيّاً بين الليل والفجر)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: النموذج المعتمد في الارتفاكت نُقل كما هو (street/engine.ts).
//   mode  : 'night' | 'dawn' — الفجر يُعرض انتقالاً من الليل إن كان المحرّك في الليل قبله.
//   event : نوع حدث الصباح (display:morning-event) → لقطة حدثٍ في المشهد (بلا أيّ هويّة).
//   eventKey: يتغيّر مع كلّ حدثٍ جديد ولو تكرّر النوع.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { getStreetEngine, type StreetEvent, type StreetMode } from './street/engine';

export type { StreetMode };

// خريطة أنواع أحداث الصباح إلى لقطات المشهد
const EVENT_MAP: Record<string, StreetEvent> = {
  ASSASSINATION: 'KILL', ASSASSIN_KILL: 'KILL', PHOENIX_BURN: 'KILL', TWIN_SUICIDE: 'KILL', POLICEWOMAN_EXECUTION: 'KILL',
  ASSASSINATION_BLOCKED: 'SAVED', ASSASSIN_BLOCKED: 'SAVED', PHOENIX_ASH: 'SAVED',
  SILENCED: 'SILENCE', POLICEWOMAN: 'SILENCE',
  ABILITY_DISABLED: 'DISABLE',
  SNIPE_MAFIA: 'SNIPE', SNIPE_CITIZEN: 'SNIPE', SHERIFF_REVENGE: 'SNIPE',
};

export default function StreetScene({ mode, event, eventKey }: { mode: StreetMode; event?: string | null; eventKey?: string | number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dip, setDip] = useState(false);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const el = ref.current; const eng = getStreetEngine();
    if (!el || !eng) { setOk(false); return; }
    eng.mount(el); eng.onCut = (d) => setDip(d);
    return () => { eng.onCut = null; eng.unmount(); };
  }, []);

  useEffect(() => { getStreetEngine()?.setMode(mode); }, [mode]);

  useEffect(() => {
    if (!event) return; const k = EVENT_MAP[event]; if (!k) return;
    getStreetEngine()?.fireEvent(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, eventKey]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" style={{ background: mode === 'night' ? '#05060c' : '#2a1a2e' }}>
      {!ok && <div className="absolute inset-0" style={{ background: mode === 'night' ? 'radial-gradient(ellipse at 50% 80%, #1a1712 0%, #05060c 70%)' : 'linear-gradient(180deg, #5b6f9a 0%, #f2a86b 60%, #4a3a2a 100%)' }} />}
      <div className="absolute inset-0 pointer-events-none bg-black transition-opacity duration-300" style={{ opacity: dip ? 1 : 0 }} />
    </div>
  );
}
