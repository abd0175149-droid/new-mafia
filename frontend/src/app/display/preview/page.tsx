'use client';
// ══════════════════════════════════════════════════════
// 👁️ معاينة مشاهد شاشة القاعة بلا غرفة — /display/preview?scene=night|dawn&step=SHERIFF
//    للمراجعة البصريّة السريعة (المالك والمطوّر) ولاختبار الاحتواء الآليّ.
// ══════════════════════════════════════════════════════
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import NightScene from '@/components/display/NightScene';
import MorningReport from '@/components/display/MorningReport';
import StreetStage from '@/components/display/StreetStage';
import ExecutionCeremony, { executionSceneAvailable, type ExecEntry } from '@/components/display/ExecutionCeremony';
import { getStreetEngine } from '@/components/display/street/engine';

// ⚖️ سيناريوهات مشهد الإقصاء للمعاينة (أدوار وهميّة؛ الفريق يُشتقّ من تعريف الدور كما في اللعبة)
const EXEC_SCENARIOS: Record<string, { primary: ExecEntry[]; secondary: ExecEntry[]; later?: ExecEntry[]; hold?: boolean }> = {
  CITIZEN: { primary: [{ physicalId: 3, role: 'DOCTOR', cause: 'DAY_VOTE' }], secondary: [] },
  MAFIA: { primary: [{ physicalId: 5, role: 'MAFIA_REGULAR', cause: 'DAY_VOTE' }], secondary: [] },
  NEUTRAL: { primary: [{ physicalId: 8, role: 'JESTER', cause: 'DAY_VOTE' }], secondary: [] },
  DEAL_BACK: { primary: [{ physicalId: 2, role: 'CITIZEN', cause: 'DEAL' }], secondary: [{ physicalId: 9, role: 'SHERIFF', cause: 'DEAL_BACKFIRE', key: 'inline:9' }] },
  TWIN: { primary: [{ physicalId: 4, role: 'YOUNGER_BROTHER', cause: 'DAY_VOTE' }], secondary: [{ physicalId: 11, role: 'OLDER_BROTHER', cause: 'TWIN_SUICIDE', key: 'inline:11' }] },
  BOMB: { primary: [{ physicalId: 6, role: 'GODFATHER', cause: 'DAY_VOTE' }], secondary: [], hold: true, later: [{ physicalId: 7, role: 'CITIZEN', cause: 'GODFATHER_BOMB', key: 'bomb:7' }, { physicalId: 5, role: 'MAFIA_REGULAR', cause: 'GODFATHER_BOMB', key: 'bomb:5' }] },
  ASH: { primary: [{ physicalId: 10, role: 'PHOENIX', cause: 'DAY_VOTE' }], secondary: [], hold: true, later: [{ physicalId: 1, role: 'CITIZEN', cause: 'ASH_CURSE', key: 'ash:1' }] },
  TIE_ALL: { primary: [{ physicalId: 3, role: 'CITIZEN', cause: 'ELIMINATE_ALL' }, { physicalId: 5, role: 'MAFIA_REGULAR', cause: 'ELIMINATE_ALL' }], secondary: [] },
};
function ExecPreview({ scenario, arm }: { scenario: string; arm: boolean }) {
  const sc = EXEC_SCENARIOS[scenario] || EXEC_SCENARIOS.CITIZEN;
  const [ready, setReady] = useState(false); const [fired, setFired] = useState(false); const [later, setLater] = useState<ExecEntry[]>([]);
  useEffect(() => { const t = setInterval(() => { if (executionSceneAvailable()) { setReady(true); clearInterval(t); } }, 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!ready) return; const eng = getStreetEngine()!; const alive = MOCK_PLAYERS.map(p => ({ id: p.physicalId, gender: (p.gender === 'FEMALE' ? 'F' : 'M') as 'F' | 'M' }));
    if (arm) eng.exec.arm(alive);
    const t1 = setTimeout(() => { setFired(true); (window as any).__execFired = Date.now(); }, arm ? 5000 : 500); const t2 = sc.later ? setTimeout(() => setLater(sc.later!), (arm ? 5000 : 500) + 16000) : null;
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); };
  }, [ready, arm, scenario]);
  if (!fired) return null;
  return <ExecutionCeremony players={MOCK_PLAYERS} primary={sc.primary} secondary={[...sc.secondary, ...later]} holdForSecondary={!!sc.hold && later.length === 0} />;
}

const MOCK_PLAYERS = Array.from({ length: 12 }, (_, i) => ({ physicalId: i + 1, name: `لاعب ${i + 1}`, isAlive: true, gender: i % 3 ? 'MALE' : 'FEMALE' }));
const MOCK_EVENTS = [
  { type: 'ASSASSINATION', targetPhysicalId: 4, targetName: 'لاعب 4', extra: { targetRole: 'CITIZEN' } },
  { type: 'SILENCED', targetPhysicalId: 7, targetName: 'لاعب 7' },
  { type: 'ABILITY_DISABLED', targetPhysicalId: 2, extra: { disabledRole: 'SHERIFF' } },
];

function Preview() {
  const q = useSearchParams();
  const scene = q.get('scene') || 'night';
  const step = q.get('step');
  const evt = Number(q.get('event') ?? -1);
  const exec = q.get('exec');
  return (
    <div className="display-bg h-[100dvh] w-full overflow-hidden px-8 py-6 text-white">
      <div className="relative w-full h-full">
        <StreetStage mode={scene === 'dawn' ? 'dawn' : scene === 'day' ? 'day' : 'night'} event={scene === 'dawn' && evt >= 0 ? MOCK_EVENTS[evt].type : null} eventKey={evt} docked={scene === 'dawn'} ambient={scene === 'day'} debug />
        <div className="relative z-10 w-full h-full">
          {scene === 'dawn' ? (
            <MorningReport events={MOCK_EVENTS.slice(0, evt >= 0 ? evt + 1 : MOCK_EVENTS.length)} current={evt >= 0 ? MOCK_EVENTS[evt] : null} players={MOCK_PLAYERS} teamCounts={{ citizenAlive: 8, mafiaAlive: 3, neutralAlive: 1 }} round={2} />
          ) : scene === 'day' ? (exec ? <ExecPreview scenario={exec} arm={q.get('arm') !== '0'} /> : null) : (
            <NightScene stepType={step} oneNight={q.get('one') === '1'} beats={q.get('one') === '1' ? [{ id: 1, ability: 'PROTECT' }, { id: 2, ability: 'KILL' }, { id: 3, ability: 'SILENCE' }] : []} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function DisplayPreviewPage() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
