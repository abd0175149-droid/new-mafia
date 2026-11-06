'use client';
// ══════════════════════════════════════════════════════
// 🧪 معاينة شاشة اللاعب الجديدة ببياناتٍ افتراضيّة — /preview/player-room?phase=NIGHT&role=SHERIFF
//
// لفحص الرسم على الخادم (Playwright) قبل تشغيل المفتاح: لا مقبس ولا مصادقة،
// والأفعال تغيّر حالةً محلّيّة فقط. الأسماء والأدوار أمثلة لا شيء حقيقيّ فيها.
// ══════════════════════════════════════════════════════
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PlayerRoom, { useFaceOf } from '@/components/player-room/PlayerRoom';
import { PlayerRoomBoundary } from '@/components/player-room/Boundary';
import PlayerPhaseView from '@/components/PlayerPhaseView';
import BottomNav from '@/components/BottomNav';

const NAMES = ['أحمد', 'سارة', 'يزن', 'ليلى', 'محمد', 'رنا', 'عمر', 'هند', 'دانة', 'فارس', 'نور', 'قيس'];

function Preview() {
  const q = useSearchParams();
  const phase = q.get('phase') || 'ROLE_BINDING';
  const role = q.get('role') || 'SHERIFF';
  const seat = Number(q.get('seat') || 5);
  const dead = q.get('dead') === '1';
  const faceOf = useFaceOf();
  const [myVote, setMyVote] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const roster = useMemo(() => NAMES.map((n, i) => ({ physicalId: i + 1, name: n, avatarUrl: null, isAlive: i !== 8 || phase !== 'GAME_OVER' })), [phase]);
  const now = useMemo(() => Date.now(), []);
  const candidates = [2, 3, 8, 9, 11].map((t, i) => ({ id: `c${i}`, type: i === 4 ? 'DEAL' : 'NORMAL', targetPhysicalId: t, initiatorPhysicalId: i === 4 ? 7 : undefined, votes: [2, 1, 0, 4, 0][i] + (myVote === i ? 1 : 0) }));
  const playerVotes: Record<string, number> = { 1: 3, 3: 3, 4: 3, 8: 3, 7: 0, 12: 0, 10: 1, ...(myVote !== null ? { [seat]: myVote } : {}) };
  const mafiaRoles = ['GODFATHER', 'MAFIA_REGULAR', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER'];
  const isMafia = mafiaRoles.includes(role);
  const steps = [{ abilityId: role === 'CITIZEN' ? null : 'X', ask: '-', canSkip: role === 'SNIPER', targets: roster.filter(p => p.physicalId !== seat && !(isMafia && [3, 9].includes(p.physicalId))) }];

  return (
    <div className="min-h-screen font-sans relative overflow-x-hidden display-bg blood-vignette" style={{ paddingBottom: 'calc(var(--nav-h) + 16px)' }}>
      <PlayerRoomBoundary onFail={() => {}}>
        <PlayerRoom host={{
          roomCode: '4821', gameName: 'The hub · معاينة',
          seat, displayName: NAMES[seat - 1], gender: 'MALE', avatarUrl: null,
          role: ['LOBBY', 'ROLE_GENERATION'].includes(phase) ? null : role, isDead: dead, phase, round: 1,
          teamCounts: phase === 'LOBBY' ? null : { mafiaAlive: 3, citizenAlive: 8, neutralAlive: 1 },
          roster, watermark: `${NAMES[seat - 1]} · مقعد ${seat} · 4821 · 19:42`,
          oneNight: phase === 'NIGHT' ? { steps, deadline: now + 40000 } : null, oneNightSent: sent,
          submitOneNight: async () => { setSent(true); return true; },
          nightAsk: null, nightCountdown: null, nightSubmitted: false, submitNightAction: () => {},
          candidates, playersInfo: roster, myVote, playerVotes, votingCountdown: phase === 'DAY_VOTING' ? 28 : null, voteSubmitting: false,
          castVote: (i) => setMyVote(i),
          mafiaTeam: isMafia ? [{ physicalId: 3, name: NAMES[2], role: 'GODFATHER' }, { physicalId: 9, name: NAMES[8], role: 'MAFIA_REGULAR' }] : [],
          sibling: null,
          assassinContracts: role === 'ASSASSIN' ? { contracts: [
            { id: 1, descriptionAr: '🔪 اغتل الشريف', completed: true }, { id: 2, descriptionAr: '🔪 اغتل الطبيب', completed: false },
            { id: 3, descriptionAr: '🔪 اغتل شيخ المافيا', completed: false }, { id: 4, descriptionAr: '🔪 اغتل القناص', completed: false }],
            completedCount: 1, totalRequired: 4, currentIndex: 1 } : null,
          sheriffResults: role === 'SHERIFF' ? [{ round: 1, result: 'MAFIA', targetPhysicalId: 9, targetName: NAMES[8] }] : [],
          cartCount: 2,
          openRoles: () => {}, openNotes: () => {}, openOrder: () => {}, closeOrder: () => {}, onGalleryOpen: () => {},
          requestTasksOpen: async () => ({ ok: !dead, error: dead ? 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.' : undefined }),
          leave: () => {},
          phaseView: (
            <PlayerPhaseView gamePhase={phase} physicalId={String(seat)} assignedRole={role} isPlayerDead={dead}
              on={() => () => {}} emit={async () => ({ success: true })} myVote={null} votingCandidates={candidates} votingPlayersInfo={roster}
              pollData={{
                round: 1,
                discussionState: phase === 'DAY_DISCUSSION' ? { status: 'SPEAKING', currentSpeakerId: 3, startTime: now, timeRemaining: 45, timeLimitSeconds: 60,
                  speakers: roster.map(p => ({ physicalId: p.physicalId, name: p.name, hasSpoken: p.physicalId < 3 })) } : undefined,
                justificationData: phase === 'DAY_JUSTIFICATION' ? { accused: [{ targetPhysicalId: 9, canJustify: true }], topVotes: 4, votersForAccused: [1, 3, 4, 8], playerVotes: { 1: 0, 3: 0, 4: 0, 8: 0 }, candidates: [{ targetPhysicalId: 9 }] } : undefined,
              }}
              roomId="preview" isRemote={false} v2 avatarOf={() => null} faceOf={faceOf} />
          ),
        }} />
      </PlayerRoomBoundary>
      <BottomNav />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
