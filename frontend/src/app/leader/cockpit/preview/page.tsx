'use client';
// ══════════════════════════════════════════════════════
// 🧪 معاينة القمرة ببياناتٍ افتراضيّة — /leader/cockpit/preview?phase=NIGHT
//
// لفحص الرسم على الخادم (Playwright) قبل أن يلمسها الليدر: لا مقبس ولا مصادقة،
// كلّ نداءٍ يعود {success:true}. لا تكشف شيئاً حقيقيّاً — الأسماء والأدوار أمثلة.
// ══════════════════════════════════════════════════════
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Cockpit from '../Cockpit';
import CockpitBoundary from '../Boundary';
import type { CockpitHost } from '../host';

const NAMES = ['أحمد', 'سارة', 'يزن', 'ليلى', 'محمد', 'رنا', 'عمر', 'هند', 'دانة', 'فارس', 'نور'];
const ROLES = ['DOCTOR', 'JESTER', 'GODFATHER', 'SHERIFF', 'SNIPER', 'CITIZEN', 'SILENCER', 'CITIZEN', 'CHAMELEON', 'MAYOR', 'POLICEWOMAN'];

function fixture(phase: string): any {
  const withRoles = !['LOBBY', 'ROLE_GENERATION'].includes(phase);
  const players = NAMES.map((n, i) => ({
    physicalId: i + 1, name: n, role: withRoles ? ROLES[i] : null, isAlive: !(withRoles && phase !== 'ROLE_BINDING' && i === 6),
    isSilenced: phase.startsWith('DAY_') && i === 3, penalties: i === 4 ? 1 : 0, isConnected: i !== 1, noPhoto: i === 1 || i === 5,
  }));
  const alive = players.filter(p => p.isAlive).map(p => p.physicalId);
  const now = Date.now();
  return {
    roomId: 'preview', roomCode: 'MX7K', phase, round: phase === 'LOBBY' ? 0 : 1,
    config: { gameName: 'معاينة', maxPlayers: 12, displayPin: '4821', maxPenalties: 3, penaltyScope: 'room', bombEnabled: true, mayorVoteWeight: 2, nightMode: 'manual', confrontationEnabled: true, confrontationsPerPlayer: 1 },
    players: [...players, ...(phase === 'LOBBY' ? [{ physicalId: 12, name: 'خالد', seatHeld: true, isAlive: true }] : [])],
    spectators: phase === 'LOBBY' ? [{ physicalId: 0, name: 'قيس', status: 'waiting' }] : [],
    rolesPool: withRoles ? ROLES : [], rolesConfirmed: phase !== 'ROLE_BINDING' && withRoles,
    locationName: 'The hub', cityName: 'عمّان', seasonName: 'العنقاء', counted: true,
    nightStep: phase === 'NIGHT' ? { role: 'KILL', roleName: 'اغتيال المافيا', performerPhysicalId: 3, performerName: 'يزن', availableTargets: players.filter(p => p.isAlive && p.physicalId !== 3).map(p => ({ physicalId: p.physicalId, name: p.name })), canSkip: true, isDynamic: true } : null,
    nightComplete: false,
    morningEvents: phase === 'MORNING_RECAP' ? [
      { type: 'SHERIFF_RESULT', targetPhysicalId: 9, targetName: 'دانة', extra: { result: 'CITIZEN', team: 'CITIZEN' } },
      { type: 'ASSASSINATION_BLOCKED', targetPhysicalId: 6, targetName: 'رنا', performerPhysicalId: 1, performerName: 'أحمد' },
      { type: 'SNIPE_MAFIA', targetPhysicalId: 7, targetName: 'عمر', extra: { targetRole: 'SILENCER', sniperName: 'محمد' }, revealed: true },
      { type: 'SILENCED', targetPhysicalId: 4, targetName: 'ليلى' },
    ] : [],
    discussionState: phase === 'DAY_DISCUSSION' ? { status: 'SPEAKING', speakingQueue: alive, currentSpeakerId: alive[2], hasSpoken: alive.slice(0, 2), startTime: now - 12000, timeRemaining: 45, isFinished: false } : null,
    votingState: phase === 'DAY_VOTING' ? { candidates: alive.map(id => ({ targetPhysicalId: id, votes: id === 9 ? 4 : id === 2 ? 2 : 0, type: 'PLAYER' })), playerVotes: { 1: 9, 3: 2, 4: 9, 5: 9, 6: 2, 8: 9 }, leaderProxyVotes: {}, totalVotesCast: 6, votingStartTime: now - 8000, durationSeconds: 30, deals: [], tieBreakerLevel: 0, hiddenPlayersFromVoting: [] } : { deals: phase === 'DAY_DISCUSSION' ? [{ id: 'd1', initiatorPhysicalId: 4, targetPhysicalId: 7 }] : [] },
    justificationData: phase === 'DAY_JUSTIFICATION' ? { accused: [{ targetPhysicalId: 9, votes: 6 }], candidates: [{ targetPhysicalId: 9, votes: 6 }], canJustifyList: [9], topVotes: 6, resultType: 'SINGLE', maxJustifications: 2, leaderProxyVotes: {} } : null,
    pendingResolution: phase === 'DAY_ELIMINATION' ? { eliminated: [9], revealedRoles: [{ physicalId: 9, role: 'CHAMELEON' }], winResult: 'GAME_CONTINUES' } : null,
    mayorState: { mayorPhysicalId: 10, revealed: false },
    winner: phase === 'GAME_OVER' ? 'CITIZEN' : undefined,
    pinnedSeats: [], doors: [], doorSeats: [],
  };
}

function CockpitPreview() {
  const sp = useSearchParams();
  const phase = sp.get('phase') || 'LOBBY';
  const one = sp.get('one');
  // حالةٌ حقيقيّة تُحقن للفحص (Playwright: window.__COCKPIT_STATE__) — وإلّا البيانات الافتراضيّة
  const [gs, setGs] = useState<any>(() => (typeof window !== 'undefined' && (window as any).__COCKPIT_STATE__) || fixture(phase));
  const [failed, setFailed] = useState<string | null>(null);
  const emit = async (_e: string, _d: any) => ({ success: true });
  const on = () => () => {};
  const host: CockpitHost = useMemo(() => ({
    alerts: [{ kind: 'gallery', physicalId: 8, name: 'هند', role: 'CITIZEN', teamAr: 'المدينة', at: Date.now() - 60000 }],
    dismissAlert: () => {}, clearAlerts: () => {},
    gameTimer: { remaining: 2400, expired: false },
    oneNight: {
      running: one === 'run' ? { deadline: Date.now() + 42000, acting: 7, total: 10 } : null,
      progress: one === 'run' ? { done: 5, total: 10 } : null,
      roster: one === 'run' ? NAMES.map((n, i) => ({ seat: i + 1, name: n, submitted: i % 2 === 0 })) : [],
      review: one === 'review' ? {
        acting: [
          { seat: 3, name: 'يزن', role: 'GODFATHER', abilityId: 'KILL', abilityName: 'اغتيال المافيا', targetPhysicalId: 6, targetName: 'رنا' },
          { seat: 1, name: 'أحمد', role: 'DOCTOR', abilityId: 'PROTECT', abilityName: 'حماية', targetPhysicalId: 6, targetName: 'رنا' },
          { seat: 4, name: 'ليلى', role: 'SHERIFF', abilityId: 'INVESTIGATE', abilityName: 'تحقيق', targetPhysicalId: 9, targetName: 'دانة' },
          { seat: 5, name: 'محمد', role: 'SNIPER', abilityId: 'SNIPE', abilityName: 'قنص', targetPhysicalId: null, targetName: null },
        ],
        idle: [{ seat: 6, name: 'رنا', role: 'CITIZEN', targetPhysicalId: 2 }],
      } : null,
      busy: false, start: async () => {}, close: async () => {}, apply: async () => {},
    },
    policewomanChoice: sp.get('police') ? { policewomanPhysicalId: 11, policewomanName: 'نور', threshold: 2, citizenDeaths: 2, eligibleTargets: [1, 2, 3, 4, 5] } : null,
    setPolicewomanChoice: () => {},
    mafiaChatUnread: 0, soundOn: true,
    open: { luckyDraw: () => {}, birthday: () => {}, settings: () => {}, mixer: () => {}, rename: () => {}, mafiaChat: () => {} },
    toggleSound: () => {}, adjustGameTimer: async () => {},
    terminate: async () => {}, deleteRoom: async () => {}, closeEvent: async () => {}, leave: () => {},
    startGeneration: async () => {}, newGame: async () => {}, adminEliminate: async () => {},
    adminReveal: null, dismissAdminReveal: () => {}, showClassic: () => {},
  }), [one, sp]);
  if (failed) return <pre data-cockpit-error style={{ color: '#f88', padding: 16, whiteSpace: 'pre-wrap' }}>COCKPIT_ERROR: {failed}</pre>;
  return (
    <CockpitBoundary onFail={setFailed}>
      <Cockpit gameState={gs} setGameState={(fn) => setGs((p: any) => fn(p))} emit={emit} on={on as any} host={host} />
    </CockpitBoundary>
  );
}

export default function Page() {
  return <Suspense fallback={null}><CockpitPreview /></Suspense>;
}
