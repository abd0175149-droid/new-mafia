'use client';
// ══════════════════════════════════════════════════════
// 🌙 الليل — الليلة الواحدة (الإرسال ← المراجعة) أو الطابور خطوةً خطوة
//
// الترتيب: مراجعةٌ مفتوحة ← ليلةٌ جارية ← الوضع الآليّ (غرف بعيدة) ← اكتمال الطابور
//          ← خطوة طابور ← لا شيء (بعد night:start {oneNight} أو تحديث الصفحة).
// 🔴 لا تُعرض اختيارات اللاعبين أثناء الإرسال: نقطةٌ خضراء لمن أرسل فقط.
// 🔴 بعد تحديث الصفحة وسط المراجعة لا يُعاد بثّ night:one-review ⇒ نسأل الخادم
//    (night:one-review-get) قبل أن نعرض «ابدأ الليلة الواحدة»: بدءٌ جديد فوق مراجعةٍ
//    مفتوحة يبني الليلة من الصفر ويمحو ما اختاره اللاعبون.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { ActionBar, Chip, Chips, Hint, Section, SeatGrid, Status, seatCells, useCockpit, useDeadline } from '../kit';
import { useHost } from '../host';
import ReviewView, { type ReviewRow } from './night/Review';
import { QueueCompleteView, QueueStepView, SheriffSheet } from './night/Queue';
import { useBusy } from './night/meta';

export default function NightScreen() {
  const { gameState, emit } = useCockpit();
  const host = useHost();
  const on = host.oneNight;
  const idle = !on.review && !on.running && !gameState?.nightStep && !gameState?.nightComplete;

  // 🔁 استعادة مراجعةٍ مفتوحة بعد التحديث.
  // 🔴 لا تُفتح تلقائيّاً: الخادم لا يمحو `oneNight` بين الألعاب، فمراجعةٌ لم تُحسب في لعبةٍ
  //    أُنهيت إداريّاً تبقى «مفتوحة». الموجّه يرى عددها ويختار: يفتحها أو يبدأ من جديد.
  const [restored, setRestored] = useState<{ acting: ReviewRow[]; idle: ReviewRow[] } | null>(null);
  const [openRestored, setOpenRestored] = useState(false);
  const [probing, setProbing] = useState(false);
  const emitRef = useRef(emit);
  emitRef.current = emit;
  const roomId = gameState?.roomId;
  const round = gameState?.round;
  useEffect(() => {
    if (!idle || !roomId) return;
    let alive = true;
    setProbing(true);
    emitRef.current('night:one-review-get', { roomId })
      .then((r: any) => { if (alive && r?.success && r.review) setRestored({ acting: r.acting || [], idle: r.idle || [] }); })
      .catch(() => { /* لا مراجعة — الصمت صحيح */ })
      .finally(() => { if (alive) setProbing(false); });
    return () => { alive = false; };
  }, [idle, roomId, round]);
  // مراجعةٌ أو ليلةٌ من الصفحة تعلو المستعادة
  useEffect(() => { if (on.review || on.running) { setRestored(null); setOpenRestored(false); } }, [on.review, on.running]);

  let body;
  if (on.review) body = <ReviewView acting={on.review.acting} idle={on.review.idle} />;
  else if (on.running) body = <RunningView />;
  else if (restored && openRestored) body = <ReviewView acting={restored.acting} idle={restored.idle} />;
  else if (gameState?.config?.nightMode === 'auto' && !restored) body = <AutoNotice />;
  else if (gameState?.nightComplete) body = <QueueCompleteView />;
  else if (gameState?.nightStep) body = <QueueStepView />;
  else body = <IdleView probing={probing} restored={restored ? restored.acting.length : null} onOpenRestored={() => setOpenRestored(true)} />;

  return (
    <>
      {body}
      <SheriffSheet />
    </>
  );
}

// ── الليلة الواحدة جارية: من أرسل، بلا ما اختار ──
function RunningView() {
  const { gameState, run } = useCockpit();
  const host = useHost();
  const on = host.oneNight;
  const left = useDeadline(on.running?.deadline ?? null);
  const roster = on.roster || [];
  const bySeat = new Map(roster.map(r => [Number(r.seat), r]));
  const done = on.progress?.done ?? roster.filter(r => r.submitted).length;
  const total = on.progress?.total ?? (roster.length || on.running?.total || 0);
  const pending = roster.filter(r => !r.submitted);
  const players: any[] = gameState?.players || [];
  const offline = pending.filter(r => players.find(p => p.physicalId === r.seat)?.isConnected === false);

  return (
    <>
      <Status meta={`الليلة الواحدة · أرسل ${done} من ${total}`} clock={on.running?.deadline ? { left } : null} />
      <ActionBar primary={{ label: 'أنهِ المهلة وراجِع', disabled: on.busy, onPress: () => run(() => on.close()) }} />

      <Section title="من أرسل" aside="لا يظهر ماذا اختار">
        <SeatGrid cells={seatCells(gameState)}
          mark={(c) => {
            const r = bySeat.get(c.seat);
            return r ? { dot: r.submitted ? 'ok' : 'off' } : { disabled: true };
          }} />
        <Chips>
          <Chip tone="ok">أرسل {done}</Chip>
          <Chip tone={pending.length ? 'g' : 'ok'}>{pending.length ? `بانتظار ${pending.length}` : 'أرسل الجميع'}</Chip>
        </Chips>
      </Section>

      {offline.length > 0 && (
        <Section tone="sky" title="📵 بلا اتّصال">
          <Hint>{offline.map(r => r.seat).join('، ')} — اسألهم بالإشارة وصحّح اختيارهم في المراجعة.</Hint>
        </Section>
      )}

      <Hint>من لم يُرسل يُملأ اختياره عشوائيّاً عند انتهاء المهلة — والقنّاص يُتخطّى ولا يُرمى له نرد. الشاشة تعزف ضربات الأدوار بجدولٍ ثابت لا يكشف من اختار.</Hint>
    </>
  );
}

// ── الغرف البعيدة: الوضع الآليّ القديم يبقى في الواجهة القديمة ──
function AutoNotice() {
  const host = useHost();
  return (
    <>
      <Status meta="الليل الآليّ" />
      <ActionBar primary={{ label: 'افتح الواجهة القديمة', onPress: () => host.showClassic() }} />
      <Section title="🌐 ليلٌ آليّ">
        <Hint>هذه الغرفة على الوضع الآليّ (اللاعبون يختارون من هواتفهم خطوةً خطوة). لوحته في الواجهة القديمة — افتحها لمتابعة الليلة.</Hint>
      </Section>
    </>
  );
}

// ── لا شيء جارٍ: الليل حلّ ولم تبدأ الليلة الواحدة، أو أُعيد تحميل الصفحة ──
function IdleView({ probing, restored, onOpenRestored }: { probing: boolean; restored: number | null; onOpenRestored: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const host = useHost();
  const { busy, wrap } = useBusy();
  const start = () => wrap(() => run(() => host.oneNight.start(60)));
  const resume = () => wrap(() => run(() => emit('night:resume', { roomId: gameState.roomId })));
  const off = probing || busy || host.oneNight.busy;
  if (restored != null) {
    return (
      <>
        <Status meta="الليل · مراجعة معلّقة" />
        <ActionBar
          primary={{ label: 'افتح المراجعة', disabled: off, onPress: onOpenRestored }}
          secondary={{ label: 'ابدأ من جديد', disabled: off, onPress: start }}
        />
        <Section title="🧾 مراجعةٌ لم تُحسب">
          <Hint>الخادم يحمل مراجعة ليلةٍ واحدة لم تُحسب بعد ({restored} قدرة) — غالباً هذه الليلة قبل تحديث الصفحة. افتحها وتأكّد من الأهداف ثمّ احسب.</Hint>
          <Hint>«ابدأ من جديد» يرسل السؤال للهواتف ثانيةً (60 ث) ويمحو تلك المراجعة.</Hint>
        </Section>
      </>
    );
  }
  return (
    <>
      <Status meta="الليل" />
      <ActionBar
        primary={{ label: probing ? 'يتحقّق…' : 'ابدأ الليلة الواحدة', sub: probing ? undefined : 'مهلة الاختيار 60 ث', disabled: off, onPress: start }}
        secondary={{ label: 'استعِد الطابور', disabled: off, onPress: resume }}
      />
      <Section title="🌙 الليل جاهز">
        <Hint>القاعة تغمض أعينها ولم يبدأ الاختيار بعد. «ابدأ الليلة الواحدة» يرسل السؤال لكلّ الهواتف معاً.</Hint>
        <Hint>إن كانت هذه ليلة طابور وأُعيد تحميل الصفحة فالخطوة تعود وحدها خلال لحظة — أو المس «استعِد الطابور».</Hint>
      </Section>
    </>
  );
}
