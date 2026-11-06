'use client';
// ══════════════════════════════════════════════════════
// ☀️ النهار في القمرة — كلّ أطوار DAY_* (نقلٌ لـ LeaderDayView بالأحداث نفسها)
//
// هذا المكوّن يبقى مركّباً عبر أطوار النهار كلّها (الهيكل يرسمه لكلّ DAY_*)، فيحمل:
//   • حالة التبرير المحلّيّة (المتّهم الحاليّ/بدأ/انتهى/المدّة) — كما كانت في LeaderDayView
//   • نافذة العمدة (من day:mayor-window مباشرةً، وحالة الخادم احتياطاً لإعادة الاتصال)
//   • اقتراح فضّ التعادل بالنبض (day:tie → pulseSuggestion)
// وما يعلو أيَّ طور: لعنة الرماد ونافذة العمدة، ثمّ شريط المُقصَين بالعقوبات أسفل كلّ شاشة.
// ══════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSeatMove } from '../../SeatMove';
import { ActionBar, Hint, Status, useCockpit } from '../kit';
import Discussion from './day/Discussion';
import Voting from './day/Voting';
import Justification, { TieBreaker, type JustState, type PulseSuggestion } from './day/Justify';
import Reveal from './day/Reveal';
import { AshCurse, MayorWindow } from './day/Overlays';
import { PenalizedRow, nameAt } from './day/shared';

export default function DayScreen() {
  const { gameState, on } = useCockpit();
  const phase: string = gameState?.phase || '';
  const seatMove = useSeatMove();

  // ── ⚖️ حالة التبرير المحلّيّة ──
  const [just, setJust] = useState({ idx: 0, started: false, allDone: false, dur: 30 });
  const resetJust = useCallback(() => setJust(j => ({ ...j, idx: 0, started: false, allDone: false })), []);
  const js: JustState = useMemo(() => ({
    ...just,
    set: (p) => setJust(j => ({ ...j, ...p })),
    reset: resetJust,
  }), [just, resetJust]);

  // تصفيرٌ مرّةً واحدة عند الدخول لطور التبرير (لا مع كلّ استطلاعٍ للحالة)
  const wasJustRef = useRef(false);
  useEffect(() => {
    const isJust = phase === 'DAY_JUSTIFICATION' && !!gameState?.justificationData;
    if (isJust && !wasJustRef.current) resetJust();
    wasJustRef.current = isJust;
  }, [phase, gameState?.justificationData, resetJust]);

  // نقصت قائمة المبرِّرين أثناء الطور (إقصاءٌ إداريّ لمتّهم) ⇒ أعد الجولة للباقين
  const canLen: number = (gameState?.justificationData?.canJustifyList || gameState?.justificationData?.accused || []).length;
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (phase === 'DAY_JUSTIFICATION' && canLen > 0 && canLen < prevLenRef.current) resetJust();
    prevLenRef.current = canLen;
  }, [canLen, phase, resetJust]);

  // ── 🎩 نافذة العمدة + 🗳️ اقتراح النبض — اشتراكٌ مباشر كما في LeaderDayView ──
  const [mayorLocal, setMayorLocal] = useState<any>(null);
  const [pulse, setPulse] = useState<PulseSuggestion>(null);
  useEffect(() => {
    const offs = [
      on('day:mayor-window', (p: any) => { if (p?.winner) setMayorLocal({ winner: p.winner, topVotes: p.topVotes }); }),
      on('day:mayor-window-closed', () => setMayorLocal(null)),
      on('day:mayor-revealed', () => setMayorLocal(null)),
      on('day:tie', (d: any) => setPulse(d?.pulseSuggestion || null)),
      on('day:voting-started', () => setPulse(null)),
    ];
    return () => offs.forEach(f => f());
  }, [on]);
  // 🪑 بعد نقل مقعد: نافذة الخادم (mayorState) هي البديل المحدَّث
  useEffect(() => { if (seatMove.remapVersion) setMayorLocal(null); }, [seatMove.remapVersion]);

  const ms = gameState?.mayorState || null;
  const describe = (c: any) => c ? {
    type: c.type,
    targetPhysicalId: c.targetPhysicalId ?? null,
    targetName: c.targetName || nameAt(gameState, c.targetPhysicalId),
    initiatorPhysicalId: c.initiatorPhysicalId ?? null,
    initiatorName: c.initiatorName || (c.initiatorPhysicalId ? nameAt(gameState, c.initiatorPhysicalId) : null),
    votes: c.votes,
  } : null;
  // بعد قرارٍ ناجح تبقى نافذة الخادم في الحالة حتى تصل المزامنة — لا تُعاد للشاشة
  const srvKey = ms?.window ? `${gameState?.round}:${ms.window.winner?.targetPhysicalId}:${ms.window.topVotes}` : '';
  const [dismissed, setDismissed] = useState('');
  const serverWindow = ms?.window && srvKey !== dismissed ? { winner: describe(ms.window.winner), topVotes: ms.window.topVotes } : null;
  const mayorWindow = ms?.vetoUsed ? null : (mayorLocal || serverWindow);

  let body;
  if (gameState?.pendingAshCurse) body = <AshCurse />;
  else if (mayorWindow?.winner) body = <MayorWindow win={mayorWindow} onClosed={() => { setMayorLocal(null); setDismissed(srvKey); }} onRevote={resetJust} />;
  else switch (phase) {
    case 'DAY_DISCUSSION': body = <Discussion />; break;
    case 'DAY_VOTING': body = <Voting />; break;
    case 'DAY_JUSTIFICATION': body = <Justification js={js} pulse={pulse} onMayorWindow={(w) => { if (w?.winner) setMayorLocal(w); }} />; break;
    case 'DAY_ELIMINATION':
    case 'DAY_REVEALED': body = <Reveal />; break;
    case 'DAY_TIEBREAKER': body = <TieBreaker js={js} pulse={pulse} />; break;
    default: body = (
      <>
        <Status meta={phase} />
        <Hint>طورٌ نهاريّ غير معروف: {phase}</Hint>
        <ActionBar primary={{ label: 'بانتظار الخادم', disabled: true, onPress: () => {} }} />
      </>
    );
  }

  return (
    <>
      {body}
      <PenalizedRow />
    </>
  );
}
