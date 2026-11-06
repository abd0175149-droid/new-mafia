'use client';
// ══════════════════════════════════════════════════════
// 🎩 نافذة العمدة · 🜂 لعنة الرماد — تعلوان أيَّ طورٍ نهاريّ ما دامتا مفتوحتين
// (كما المودالان العامّان في LeaderDayView: لا تتعلّقان بفرع طورٍ بعينه)
//   day:mayor-decision {PASS|REVOTE|POSTPONE} · day:ash-curse {targetPhysicalId|skip}
// ══════════════════════════════════════════════════════
import { useState } from 'react';
import { ActionBar, Hint, HoldButton, ListRow, Section, Seg, Status, useCockpit } from '../../kit';
import { nameAt } from './shared';

type MayorChoice = 'PASS' | 'REVOTE' | 'POSTPONE';

export function MayorWindow({ win, onClosed, onRevote }: { win: { winner: any; topVotes: number }; onClosed: () => void; onRevote: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const [choice, setChoice] = useState<MayorChoice>('PASS');
  const [busy, setBusy] = useState(false);
  const w = win.winner;
  const weight = gameState.config?.mayorVoteWeight ?? 2;
  const mayorSeat = gameState.mayorState?.mayorPhysicalId ?? null;
  const target = w.type === 'DEAL'
    ? `اتفاقيّة: ${w.initiatorPhysicalId} ${w.initiatorName || nameAt(gameState, w.initiatorPhysicalId)} ← ${w.targetPhysicalId} ${w.targetName || nameAt(gameState, w.targetPhysicalId)}`
    : `${w.targetPhysicalId} ${w.targetName || nameAt(gameState, w.targetPhysicalId)}`;

  const decide = async () => {
    if (busy) return;
    setBusy(true);
    const okMsg = choice === 'PASS' ? '⚔️ لا تدخّل — يُنفَّذ الإعدام' : choice === 'REVOTE' ? '🎩 العمدة ألغى الإعدام — تصويتٌ جديد' : '🎩 العمدة أجّل — لا موت اليوم';
    const r = await run(() => emit('day:mayor-decision', { roomId: gameState.roomId, decision: choice }), okMsg);
    setBusy(false);
    if (r) { onClosed(); if (choice === 'REVOTE') onRevote(); }
  };

  return (
    <>
      <Status meta="🎩 نافذة العمدة — قبل تنفيذ الإعدام" />
      <Section title="🎩 نافذة العمدة" aside={mayorSeat ? `العمدة ${mayorSeat} ${nameAt(gameState, mayorSeat)}` : ''}>
        <ListRow n="⚔️" title={<>نتيجة التصويت: إعدام {target}</>} sub={`${win.topVotes} أصوات · اسأل: هل يُعلن العمدة نفسه؟`} />
        <Seg<MayorChoice> vertical value={choice} onChange={setChoice} options={[
          { v: 'PASS', l: '⚔️ لم يتدخّل', sub: 'يُنفَّذ الإعدام كالمعتاد — تبقى القدرة' },
          { v: 'REVOTE', l: '🎩 ألغِ الإعدام', sub: 'تصويتٌ جديد على الجميع عدا من أنقذه' },
          { v: 'POSTPONE', l: '🌙 أجّل', sub: 'لا موت اليوم وتبدأ الليلة' },
        ]} />
        <Hint>أيّ خيارٍ للعمدة = كشفٌ دائم للجميع + صوت ×{weight} فوريّ + تُستهلك القدرة (مرّة في اللعبة). قد يقرّر العمدة من هاتفه أيضاً.</Hint>
      </Section>
      <ActionBar primary={choice === 'PASS'
        ? { label: 'لم يتدخّل: نفّذ الإعدام', disabled: busy, onPress: decide }
        : { label: choice === 'REVOTE' ? 'اضغط مطوّلاً: العمدة يُلغي — صوّتوا من جديد' : 'اضغط مطوّلاً: العمدة يؤجّل — لا موت اليوم', hold: true, disabled: busy, sub: 'كشفٌ دائم — لا رجعة', onPress: decide }} />
    </>
  );
}

export function AshCurse() {
  const { gameState, emit, run } = useCockpit();
  const [busy, setBusy] = useState(false);
  const ash = gameState.pendingAshCurse;
  const send = async (targetPhysicalId: number | null) => {
    if (busy) return;
    setBusy(true);
    await run(() => emit('day:ash-curse', { roomId: gameState.roomId, targetPhysicalId, skip: targetPhysicalId == null }),
      targetPhysicalId == null ? 'سقطت اللعنة — لا أحد يخرج معه' : `🔥 ${targetPhysicalId} يخرج مع العنقاء`);
    setBusy(false);
  };
  return (
    <>
      <Status meta="🜂 لعنة الرماد — للّيدر وحده" />
      <Section title="🜂 لعنة الرماد" tone="red" aside="🔒 للّيدر">
        <Hint>كُشف أنّ <b className="text-[#efe8da]">{ash.phoenixPhysicalId} {ash.phoenixName}</b> هو العنقاء وقد أعدمته المدينة. اسأله همساً: أيَّ واحدٍ ممّن صوّتوا عليه يأخذ معه؟</Hint>
        <div className="grid grid-cols-2 gap-2">
          {(ash.eligible || []).map((e: any) => (
            <HoldButton key={e.physicalId} disabled={busy} className="min-h-[64px] px-2 text-[14px]" ariaLabel={`اضغط مطوّلاً: ${e.physicalId} يخرج معه`} onHold={() => send(e.physicalId)}>
              <b className="block text-[20px] tabular-nums">{e.physicalId}</b>
              <span className="block truncate">{e.name}</span>
              <small className="block text-[12px] font-medium opacity-85">مطوّلاً: يخرج معه</small>
            </HoldButton>
          ))}
        </div>
      </Section>
      <ActionBar
        primary={{ label: 'اضغط مطوّلاً على من يأخذه معه', disabled: true, onPress: () => {} }}
        secondary={{ label: 'أسقط اللعنة', disabled: busy, onPress: () => send(null) }} />
    </>
  );
}
