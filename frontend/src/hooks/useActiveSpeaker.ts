'use client';

// ══════════════════════════════════════════════════════
// 🎯 useActiveSpeaker — من يُسمح له بالكلام الآن (للصوت + المواجهة)
// ══════════════════════════════════════════════════════
// نقاش: currentSpeakerId + status===SPEAKING. تبرير: صاحب المؤقّت.
// مواجهة نشطة: الطرفان معاً. allowedPids = مجموعة من يُفتح مايكهم الآن.

import { useEffect, useState } from 'react';

export interface ConfrontationState {
  status: 'PENDING_TARGET' | 'PENDING_LEADER' | 'ACTIVE';
  requesterId: number;
  targetId: number;
  requesterName?: string;
  targetName?: string;
  durationSeconds?: number;
  startedAt?: number;
}

export function useActiveSpeaker(opts: {
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
  gamePhase: string | null;
  initialDiscussionState?: any;
}): {
  activeSpeakerId: number | null;
  isLive: boolean;
  confrontation: ConfrontationState | null;
  allowedPids: number[];
} {
  const { on, gamePhase } = opts;
  const [discussion, setDiscussion] = useState<any>(opts.initialDiscussionState || null);
  const [defenderId, setDefenderId] = useState<number | null>(null);
  const [confrontation, setConfrontation] = useState<ConfrontationState | null>(null);

  useEffect(() => {
    const subs = [
      on('day:discussion-updated', (d: any) => setDiscussion(d?.discussionState ?? null)),
      on('day:justification-timer-started', (d: any) => setDefenderId(d?.physicalId ?? null)),
      on('day:justification-timer-stopped', () => setDefenderId(null)),
      on('game:phase-changed', (d: any) => {
        if (d?.phase && d.phase !== 'DAY_DISCUSSION') setDiscussion(null);
        if (d?.phase !== 'DAY_JUSTIFICATION') setDefenderId(null);
        if (d?.phase !== 'DAY_DISCUSSION') setConfrontation(null); // المواجهة نقاشيّة فقط
      }),
      on('confrontation:pending', (d: any) => setConfrontation(d)),
      on('confrontation:started', (d: any) => setConfrontation({ status: 'ACTIVE', ...d })),
      on('confrontation:ended', () => setConfrontation(null)),
    ];
    return () => subs.forEach((u) => u && u());
  }, [on]);

  const activeSpeakerId =
    gamePhase === 'DAY_JUSTIFICATION' ? defenderId :
    gamePhase === 'DAY_DISCUSSION' ? (discussion?.currentSpeakerId ?? null) :
    null;

  const isLive =
    gamePhase === 'DAY_JUSTIFICATION' ? defenderId != null :
    gamePhase === 'DAY_DISCUSSION' ? discussion?.status === 'SPEAKING' :
    false;

  const allowedPids =
    confrontation?.status === 'ACTIVE'
      ? [confrontation.requesterId, confrontation.targetId]
      : isLive && activeSpeakerId != null
      ? [activeSpeakerId]
      : [];

  return { activeSpeakerId, isLive, confrontation, allowedPids };
}
