'use client';
// ══════════════════════════════════════════════════════
// ⚖️ التبرير والقرار (DAY_JUSTIFICATION) + التعادل القديم (DAY_TIEBREAKER)
// الأحداث كما في LeaderDayView:
//   day:start-justification-timer · day:reset-justification-timer · day:stop-justification-timer
//   day:adjust-timer {JUSTIFICATION} · player:withdraw-vote (وكالة) · day:tie-action
//   day:execute-elimination {skipWithdrawal:true} ⇒ قد تُفتح نافذة العمدة أو تُعاد الجولة
// ══════════════════════════════════════════════════════
import { useState } from 'react';
import { withdrawalNumbers, voterWeight } from '@/lib/voteCounts';
import { ActionBar, BigTimer, Chip, Chips, Hint, HoldButton, ListRow, Section, Seg, Status, roleName, teamOf, useCockpit, useDeadline } from '../../kit';
import { AdjRow, MiniBtn, nameAt, playerAt } from './shared';

export interface JustState {
  idx: number; started: boolean; allDone: boolean; dur: number;
  set: (p: Partial<{ idx: number; started: boolean; allDone: boolean; dur: number }>) => void;
  reset: () => void;
}
export type PulseSuggestion = { physicalId: number; pct: number; winnerPhysicalId: number } | null;

const lockTone = (role?: string | null) => (teamOf(role) === 'M' ? 'text-[#f2a6a9]' : teamOf(role) === 'N' ? 'text-[#f0c879]' : 'text-[#a9d4ee]');

export default function Justification({ js, pulse, onMayorWindow }: { js: JustState; pulse: PulseSuggestion; onMayorWindow: (w: any) => void }) {
  const { gameState } = useCockpit();
  const jd = gameState.justificationData;
  if (!jd) return (
    <>
      <Status meta="بانتظار بيانات التبرير" />
      <Hint>لم تصل بيانات التبرير بعد — تُستعاد مع مزامنة الحالة.</Hint>
      <ActionBar primary={{ label: 'بانتظار الخادم', disabled: true, onPress: () => {} }} />
    </>
  );
  const canJustify: any[] = jd.canJustifyList || jd.accused || [];
  const showDecision = jd.allExhausted || js.allDone;
  const cur = !showDecision ? canJustify[js.idx] : null;
  if (cur) return <Defense js={js} cur={cur} list={canJustify} />;
  return <Decision js={js} pulse={pulse} onMayorWindow={onMayorWindow} />;
}

// ── دفاعُ متّهم ──
function Defense({ js, cur, list }: { js: JustState; cur: any; list: any[] }) {
  const { gameState, emit, run } = useCockpit();
  const roomId = gameState.roomId;
  const jd = gameState.justificationData;
  const accused: any[] = jd.accused || [];
  const maxJ = jd.maxJustifications || 2;
  const timer = jd.timer;
  const seat = cur.targetPhysicalId;
  // 🔁 بعد تحديث الصفحة: المؤقّت الجاري على الخادم لهذا المتّهم يُعدّ «بدأ»
  const srvStarted = !!timer?.startTime && timer.physicalId === seat;
  const started = js.started || srvStarted;
  const deadline = srvStarted ? Number(timer.startTime) + Number(timer.timeLimitSeconds) * 1000 : null;
  const left = useDeadline(deadline);
  const [busy, setBusy] = useState(false);
  const last = js.idx >= list.length - 1;
  const next = !last ? list[js.idx + 1] : null;
  const exhausted = accused.filter((a: any) => !a.canJustify);

  const advance = async () => {
    try { await emit('day:stop-justification-timer', { roomId }); } catch { /* الواجهة القديمة تتجاهله أيضاً */ }
    if (!last) js.set({ idx: js.idx + 1, started: false });
    else js.set({ allDone: true });
  };

  return (
    <>
      <Status meta={`${list.length > 1 ? `متّهم ${js.idx + 1} من ${list.length}` : 'متّهمٌ واحد'} · ${jd.topVotes} أصوات`} />
      <BigTimer
        state={`يبرّر — ${jd.topVotes} أصوات · تبرير ${cur.justificationCount || 0}/${maxJ}`}
        who={`${seat} · ${cur.name || nameAt(gameState, seat)}`}
        left={started ? (deadline ? left : js.dur) : js.dur}
        extra={cur.role ? <span className={`text-[13px] font-bold ${lockTone(cur.role)}`}>🔒 {roleName(cur.role)} — للّيدر</span> : null} />
      {started ? (
        <AdjRow onAdj={(d) => run(() => emit('day:adjust-timer', { roomId, phase: 'JUSTIFICATION', delta: d }))} />
      ) : (
        <Section title="وقت التبرير">
          <Seg<number> value={js.dur} onChange={(v) => js.set({ dur: v })} options={[15, 30, 45, 60].map(s => ({ v: s, l: `${s} ث` }))} />
        </Section>
      )}
      {(list.length > 1 || exhausted.length > 0) && (
        <Chips>
          {list.map((a: any, i: number) => <Chip key={a.targetPhysicalId} on={i === js.idx} tone={i < js.idx ? 'ok' : undefined}>{a.targetPhysicalId} · {a.name || nameAt(gameState, a.targetPhysicalId)}</Chip>)}
          {exhausted.map((a: any) => <Chip key={`x${a.targetPhysicalId}`} tone="m">{a.targetPhysicalId} استنفد ({maxJ}/{maxJ})</Chip>)}
        </Chips>
      )}
      {started ? (
        <ActionBar
          primary={{ label: last ? 'أنهِ التبرير' : `التالي ← ${next.targetPhysicalId} ${next.name || nameAt(gameState, next.targetPhysicalId)}`, onPress: advance }}
          secondary={{ label: '↺ أعد الوقت', onPress: () => run(() => emit('day:reset-justification-timer', { roomId, physicalId: seat, timeLimitSeconds: js.dur })) }} />
      ) : (
        <ActionBar primary={{
          label: `ابدأ تبرير ${seat} (${js.dur} ث)`, disabled: busy,
          onPress: async () => {
            setBusy(true);
            const r = await run(() => emit('day:start-justification-timer', { roomId, physicalId: seat, timeLimitSeconds: js.dur }));
            setBusy(false);
            if (r) js.set({ started: true });
          },
        }} />
      )}
    </>
  );
}

// ── القرار ──
function Decision({ js, pulse, onMayorWindow }: { js: JustState; pulse: PulseSuggestion; onMayorWindow: (w: any) => void }) {
  const { gameState, emit, run, toast } = useCockpit();
  const roomId = gameState.roomId;
  const jd = gameState.justificationData;
  const accused: any[] = jd.accused || [];
  const isTie = jd.resultType === 'TIE';
  const maxJ = jd.maxJustifications || 2;
  const wn = withdrawalNumbers(gameState.withdrawalState, jd);
  const [busy, setBusy] = useState(false);

  const tie = async (action: string, okMsg?: string) => {
    js.reset();
    const tiedCandidates = jd.accused || jd.candidates || [];
    await run(() => emit('day:tie-action', { roomId, action, tiedCandidates }), okMsg);
  };

  const execute = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res: any = await run(() => emit('day:execute-elimination', { roomId, skipWithdrawal: true }));
      if (res?.mayorWindow) onMayorWindow(res.window || null);
      if (res?.revote) { js.reset(); toast('🗳️ بلغ السحبُ النصاب — تُعاد عمليّة التصويت'); }
    } finally { setBusy(false); }
  };

  const proxyEntries = Object.entries(jd.leaderProxyVotes || {});
  const accusedIds = accused.map((a: any) => a.targetPhysicalId);
  const first = accused[0];

  return (
    <>
      <Status meta={isTie ? `تعادل · ${jd.topVotes} أصوات لكلٍّ` : 'انتهت التبريرات — اتّخذ القرار'} />
      {accused.map((a: any) => {
        const p = playerAt(gameState, a.targetPhysicalId);
        return (
          <ListRow key={a.targetPhysicalId} n={a.targetPhysicalId}
            title={<>{a.name || p?.name} — {jd.topVotes} أصوات</>}
            sub={<><span className={lockTone(a.role)}>🔒 {roleName(a.role)}</span> · تبرير {a.justificationCount || 0}/{maxJ}{a.type === 'DEAL' && a.initiatorPhysicalId ? ` · اتفاقيّة من ${a.initiatorPhysicalId}` : ''}</>}
            right={<Chip tone="m">{isTie ? 'متعادل' : 'المُقصى'}</Chip>} />
        );
      })}

      {wn.voters > 0 && (
        <Section title="🗳️ سحب الأصوات" tone="sky" aside={`${wn.withdrawnPeople} لاعب سحب`}>
          <div className="flex items-end justify-center gap-4 tabular-nums">
            <span className="text-center"><b className="block text-[28px]">{wn.count}</b><small className="text-[12px] text-[#9a8f7e]">سُحب</small></span>
            <span className="text-[#9a8f7e] pb-4">/</span>
            <span className="text-center"><b className="block text-[28px] text-[#C5A059]">{wn.needed}</b><small className="text-[12px] text-[#9a8f7e]">المطلوب</small></span>
            <span className="text-[#9a8f7e] pb-4">من</span>
            <span className="text-center"><b className="block text-[28px] text-[#9a8f7e]">{wn.total}</b><small className="text-[12px] text-[#9a8f7e]">صوت · {wn.voters} لاعب</small></span>
          </div>
          <div className="h-2 rounded-full bg-[#1a1612] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${wn.reached ? 'bg-[#43b27f]' : 'bg-[#63afd9]/60'}`} style={{ width: `${wn.needed > 0 ? Math.min(100, (wn.count / wn.needed) * 100) : 0}%` }} />
          </div>
          <Hint>{wn.reached ? '✅ بلغ النصاب — «نفّذ» يعيد التصويت بدل الإقصاء.' : `⏳ ${Math.max(0, wn.needed - wn.count)} صوت إضافيّ للنصاب (نصف الأصوات أو أكثر).`}</Hint>
        </Section>
      )}

      {proxyEntries.length > 0 && (
        <Section title="✋ أصواتك بالوكالة" aside="اسحب نيابةً عمّن يطلب">
          {proxyEntries.map(([vid, idx]) => {
            const voterId = parseInt(vid, 10);
            const cand = jd.candidates?.[idx as number];
            const forAccused = cand && accusedIds.includes(cand.targetPhysicalId);
            const withdrawn = gameState.withdrawalState?.withdrawn?.includes(voterId);
            const w = voterWeight(jd, voterId);
            return (
              <ListRow key={vid} n={voterId}
                title={<>{nameAt(gameState, voterId)}{w > 1 ? ` 🎩×${w}` : ''} ← {cand?.targetPhysicalId ?? '—'}</>}
                sub={forAccused ? 'صوّت على المتّهم' : 'صوّت على غير المتّهم'}
                right={withdrawn ? <Chip tone="ok">✓ سُحب</Chip> : forAccused ? (
                  <MiniBtn tone="sky" onClick={() => run(() => emit('player:withdraw-vote', { physicalId: voterId }), `🗳️ سُحب صوت ${voterId}`)}>سحب</MiniBtn>
                ) : null} />
            );
          })}
        </Section>
      )}

      {isTie && (
        <Section title="تعادل — اختر طريقة الفضّ">
          <MiniBtn className="w-full min-h-[50px]" onClick={() => tie('REVOTE', '🔁 إعادة التصويت على الجميع')}>🔁 إعادة التصويت على الجميع{wn.reached ? ' (النصاب مكتمل ✅)' : ''}</MiniBtn>
          <MiniBtn className="w-full min-h-[50px]" onClick={() => tie('NARROW', '🎯 التصويت محصورٌ بين المتعادلين')}>🎯 حصر التصويت بين المتعادلين</MiniBtn>
          {pulse && (
            <MiniBtn tone="sky" className="w-full min-h-[50px]" onClick={() => tie('PULSE')}>
              🗳️ فضّ بنبض القاعة — إقصاء {pulse.physicalId} {nameAt(gameState, pulse.physicalId)} (خسر أمام {pulse.winnerPhysicalId} بنسبة {pulse.pct}٪)
            </MiniBtn>
          )}
          <HoldButton className="w-full min-h-[52px]" onHold={() => tie('ELIMINATE_ALL')}>اضغط مطوّلاً: أقصِ المتعادلين جميعاً</HoldButton>
        </Section>
      )}

      {isTie ? (
        <ActionBar primary={{ label: 'اختر طريقة فضّ التعادل', disabled: true, onPress: () => {} }} />
      ) : (
        <ActionBar
          primary={{
            label: first ? `اضغط مطوّلاً: نفّذ إقصاء ${first.targetPhysicalId}` : 'لا متّهم', hold: true, disabled: !first || busy,
            sub: wn.reached ? 'بلغ السحبُ النصاب — سيُعاد التصويت' : 'لا رجعة بعد التنفيذ',
            onPress: execute,
          }}
          secondary={{ label: '🔁 إعادة التصويت', disabled: busy, onPress: () => tie('REVOTE', '🔁 إعادة التصويت على الجميع') }} />
      )}
    </>
  );
}

// ── التعادل القديم (DAY_TIEBREAKER) ──
export function TieBreaker({ js, pulse }: { js: JustState; pulse: PulseSuggestion }) {
  const { gameState, emit, run } = useCockpit();
  const tie = async (action: string) => {
    js.reset();
    const tiedCandidates = gameState.justificationData?.accused || gameState.justificationData?.candidates || [];
    await run(() => emit('day:tie-action', { roomId: gameState.roomId, action, tiedCandidates }));
  };
  return (
    <>
      <Status meta="حالة تعادل" />
      <Section title="تعادل — اختر طريقة الفضّ">
        <MiniBtn className="w-full min-h-[50px]" onClick={() => tie('REVOTE')}>🔁 إعادة التصويت</MiniBtn>
        <MiniBtn className="w-full min-h-[50px]" onClick={() => tie('NARROW')}>🎯 حصر التصويت بالمتعادلين</MiniBtn>
        <MiniBtn className="w-full min-h-[50px]" onClick={() => tie('CANCEL')}>✕ إلغاء التصويت — العودة للنقاش</MiniBtn>
        {pulse && (
          <MiniBtn tone="sky" className="w-full min-h-[50px]" onClick={() => tie('PULSE')}>
            🗳️ فضّ بنبض القاعة — إقصاء {pulse.physicalId} {nameAt(gameState, pulse.physicalId)} ({pulse.pct}٪ ضدّه)
          </MiniBtn>
        )}
        <HoldButton className="w-full min-h-[52px]" onHold={() => tie('ELIMINATE_ALL')}>اضغط مطوّلاً: أقصِ المتعادلين جميعاً</HoldButton>
      </Section>
      <ActionBar primary={{ label: 'اختر طريقة فضّ التعادل', disabled: true, onPress: () => {} }} />
    </>
  );
}
