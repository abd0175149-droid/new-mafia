'use client';
// ══════════════════════════════════════════════════════
// 🗣️ النقاش — الإعداد · الجاري · بعد آخر متحدّث (مواجهات + اتفاقيّات + مدّة التصويت)
// الأحداث كما في LeaderDayView: day:start-discussion · day:timer-action {START|PAUSE|RESUME|RESET}
//   day:next-speaker · day:prev-speaker · day:adjust-timer {DISCUSSION} · day:create-deal
//   day:remove-deal · day:start-voting {durationSeconds}
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useSeatMove } from '../../../SeatMove';
import {
  ActionBar, BigTimer, BottomSheet, Hint, ListRow, Section, Seg, SeatGrid, Status, seatCells, useCockpit,
} from '../../kit';
import { ConfFull, ConfRequests, useConfrontations } from './Confront';
import { AdjRow, MiniBtn, TeamCounts, aliveOf, nameAt, playerAt } from './shared';

export default function Discussion() {
  const { gameState } = useCockpit();
  const conf = useConfrontations();
  const ds = gameState.discussionState;
  if (!ds) return <Setup conf={conf} />;
  if (!ds.isFinished) return <Active conf={conf} />;
  return <Finished conf={conf} />;
}

type ConfApi = ReturnType<typeof useConfrontations>;

// ── الإعداد ──
function Setup({ conf }: { conf: ConfApi }) {
  const { gameState, emit, run } = useCockpit();
  const seatMove = useSeatMove();
  const alive = aliveOf(gameState);
  const [start, setStart] = useState<number | null>(null);
  const [per, setPer] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (seatMove.remapVersion) setStart(null); }, [seatMove.remapVersion]);
  const startSeat = start != null && alive.some(p => p.physicalId === start) ? start : alive[0]?.physicalId ?? null;
  const silenced = alive.filter(p => p.isSilenced);
  const cells = seatCells(gameState).filter(c => c.player);

  return (
    <>
      <Status meta={`${alive.length} أحياء${silenced.length ? ` · ${silenced.length} مُسكَت` : ''}`} />
      <TeamCounts />
      <ConfRequests api={conf} />
      <DealRows />
      <Section title="من يبدأ" aside={startSeat ? `${startSeat} ${nameAt(gameState, startSeat)}` : ''}>
        <SeatGrid cells={cells}
          mark={(c) => ({ selected: c.seat === startSeat, disabled: c.player?.isAlive === false })}
          onSeat={(c) => setStart(c.seat)} />
      </Section>
      <Section title="وقت كلّ متحدّث">
        <Seg<number> value={per} onChange={setPer} options={[15, 30, 45, 60, 90].map(s => ({ v: s, l: `${s} ث` }))} />
        <Hint>{silenced.length ? silenced.map(p => `🔇 ${p.physicalId} ${p.name} مُسكَت — يُعلَن إسكاتُه حين يأتي دوره`).join(' · ') : 'لا أحد مُسكَت اليوم.'}</Hint>
      </Section>
      <ActionBar primary={{
        label: startSeat ? `ابدأ النقاش من ${startSeat}` : 'لا أحياء',
        disabled: !startSeat || busy,
        onPress: async () => {
          if (!startSeat) return;
          setBusy(true);
          await run(() => emit('day:start-discussion', { roomId: gameState.roomId, startPhysicalId: startSeat, timeLimitSeconds: per }));
          setBusy(false);
        },
      }} />
    </>
  );
}

// ── الجاري ──
function Active({ conf }: { conf: ConfApi }) {
  const { gameState, emit, run } = useCockpit();
  const ds = gameState.discussionState;
  const roomId = gameState.roomId;
  const [left, setLeft] = useState<number>(ds?.timeRemaining ?? 0);

  // ⏱ نفس منطق الواجهة القديمة: يتكتك من startTime ما دام SPEAKING، وإلا يعرض timeRemaining
  useEffect(() => {
    if (!ds || ds.status !== 'SPEAKING' || ds.startTime === null) {
      if (ds && ds.status !== 'SPEAKING') setLeft(ds.timeRemaining);
      return;
    }
    const tick = () => setLeft(Math.max(0, ds.timeRemaining - Math.floor((Date.now() - ds.startTime) / 1000)));
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [ds]);

  const cur = playerAt(gameState, ds.currentSpeakerId);
  const isSilenced = cur?.isSilenced === true;
  const hasSpoken: number[] = ds.hasSpoken || [];
  const queue: number[] = ds.speakingQueue || [];
  const order: number[] = [...hasSpoken, ...(ds.currentSpeakerId != null ? [ds.currentSpeakerId] : []), ...queue];
  // الخادم يتخطّى الموتى في الطابور
  const nextId = queue.find(id => playerAt(gameState, id)?.isAlive) ?? null;

  const timer = (action: 'START' | 'PAUSE' | 'RESUME' | 'RESET') => run(() => emit('day:timer-action', { roomId, action }));
  const secondary = ds.status === 'SPEAKING'
    ? { label: '⏸ إيقاف', onPress: () => timer('PAUSE') }
    : isSilenced
      ? { label: '🔇 أعلن الإسكات', onPress: () => timer(ds.status === 'WAITING' ? 'START' : 'RESUME') }
      : { label: ds.status === 'WAITING' ? '▶ ابدأ الوقت' : '▶ استئناف', onPress: () => timer(ds.status === 'WAITING' ? 'START' : 'RESUME') };

  const stateLine = isSilenced ? '🔇 مُسكَت — أعلن إسكاته ثمّ انتقل للتالي'
    : ds.status === 'WAITING' ? 'بانتظار البدء'
    : ds.status === 'PAUSED' ? 'متوقّف — الميكروفون مغلق'
    : left > 0 ? 'يتكلّم الآن' : 'انتهى الوقت';

  return (
    <>
      <Status meta={`تكلّم ${hasSpoken.length} · بقي ${queue.length}`} />
      <div className="flex gap-1.5 overflow-x-auto pb-1 pt-2 [scrollbar-width:none]" aria-label="ترتيب الكلام">
        {order.map((id, i) => {
          const p = playerAt(gameState, id);
          const done = i < hasSpoken.length;
          const now = id === ds.currentSpeakerId && i === hasSpoken.length;
          const dead = p && !p.isAlive;
          return (
            <span key={`${id}-${i}`} className={`relative shrink-0 w-11 h-11 rounded-xl grid place-items-center font-extrabold tabular-nums border ${now ? 'bg-[#C5A059] text-[#110d08] border-[#C5A059]' : 'bg-[#16130f] border-[#2a241c]'} ${done || dead ? 'opacity-30' : ''}`}>
              {id}
              {p?.isSilenced && <span className="absolute -top-2 -left-1 text-[12px] leading-none">🔇</span>}
            </span>
          );
        })}
      </div>
      <BigTimer state={stateLine} who={cur ? `${cur.physicalId} · ${cur.name}` : '—'} left={isSilenced ? 0 : left} />
      {!isSilenced && <AdjRow onAdj={(d) => run(() => emit('day:adjust-timer', { roomId, phase: 'DISCUSSION', delta: d }))} />}
      <div className="grid grid-cols-2 gap-1.5">
        <MiniBtn disabled={hasSpoken.length === 0} onClick={() => run(() => emit('day:prev-speaker', { roomId }))}>⏮ السابق</MiniBtn>
        <MiniBtn onClick={() => timer('RESET')}>↺ أعد الوقت</MiniBtn>
      </div>
      {/* ⚔️ طلبات المواجهة — تحت أزرار الوقت دائماً فلا تدفعها */}
      <ConfRequests api={conf} />
      {/* 🤝 الاتفاقيّات المسجّلة — بمنطق المواجهات نفسه: صفٌّ لكلٍّ منها تحت أزرار الوقت */}
      <DealRows />
      <ActionBar
        primary={{
          label: nextId != null ? `التالي ← ${nextId} ${nameAt(gameState, nextId)}` : 'أنهِ النقاش',
          onPress: () => run(() => emit('day:next-speaker', { roomId })),
        }}
        secondary={secondary} />
    </>
  );
}

// ── بعد آخر متحدّث ──
function Finished({ conf }: { conf: ConfApi }) {
  const { gameState, emit, run } = useCockpit();
  const roomId = gameState.roomId;
  const [dur, setDur] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Status meta="انتهت جولة النقاش" />
      <TeamCounts />
      <ConfFull api={conf} />
      <Deals />
      <Section title="مدّة التصويت">
        <Seg<number> value={dur} onChange={setDur} options={[0, 10, 20, 30, 45].map(s => ({ v: s, l: s ? `${s} ث` : 'بلا' }))} />
      </Section>
      <ActionBar
        primary={{
          label: 'ابدأ التصويت', disabled: busy,
          onPress: async () => {
            setBusy(true);
            await run(() => emit('day:start-voting', { roomId, durationSeconds: dur || undefined }));
            setBusy(false);
          },
        }}
        secondary={{ label: 'رجوع للنقاش', onPress: () => run(() => emit('day:prev-speaker', { roomId })) }} />
    </>
  );
}

// ── 🤝 أثناء النقاش: صفوف الاتفاقيّات المسجّلة (كصفوف المواجهات المقبولة) — لا شيء إن لم تُسجَّل ──
function DealRows() {
  const { gameState, emit, run } = useCockpit();
  const deals: any[] = gameState.votingState?.deals || [];
  if (!deals.length) return null;
  return (
    <>
      {deals.map((d: any) => (
        <ListRow key={d.id} n="🤝"
          title={<>{d.initiatorPhysicalId} {nameAt(gameState, d.initiatorPhysicalId)} ← {d.targetPhysicalId} {nameAt(gameState, d.targetPhysicalId)}</>}
          sub={`اتفاقيّة ${deals.indexOf(d) + 1}/3 — تُضاف للتصويت بعد آخر متحدّث`}
          right={<MiniBtn ariaLabel="حذف الاتفاقيّة" onClick={() => run(() => emit('day:remove-deal', { roomId: gameState.roomId, dealId: d.id }), 'حُذفت الاتفاقيّة')}>✕</MiniBtn>} />
      ))}
    </>
  );
}

// ── 🤝 الاتفاقيّات ──
function Deals() {
  const { gameState, emit, run } = useCockpit();
  const [open, setOpen] = useState(false);
  const deals: any[] = gameState.votingState?.deals || [];
  const round = gameState.round || 0;
  const full = deals.length >= 3;
  return (
    <Section title="🤝 الاتفاقيّات" aside={round <= 1 ? '🔒 من الجولة الثانية' : `${deals.length}/3 هذه الجولة`}>
      {deals.map((d: any) => (
        <ListRow key={d.id} n="🤝"
          title={<>{d.initiatorPhysicalId} {nameAt(gameState, d.initiatorPhysicalId)} ← {d.targetPhysicalId} {nameAt(gameState, d.targetPhysicalId)}</>}
          sub="إن كان المستهدَف مواطناً خرج المبادر معه"
          right={<MiniBtn tone="red" ariaLabel="حذف الاتفاقيّة" onClick={() => run(() => emit('day:remove-deal', { roomId: gameState.roomId, dealId: d.id }), 'حُذفت الاتفاقيّة')}>✕</MiniBtn>} />
      ))}
      {round > 1 && deals.length === 0 && <Hint>لا اتفاقيّات في هذه الجولة.</Hint>}
      {round > 1 && !full && <MiniBtn tone="gold" onClick={() => setOpen(true)}>+ تسجيل اتفاقيّة نيابةً عن لاعب</MiniBtn>}
      <DealSheet open={open} onClose={() => setOpen(false)} />
    </Section>
  );
}

function DealSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const seatMove = useSeatMove();
  const [ini, setIni] = useState<number | null>(null);
  const [tgt, setTgt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (seatMove.remapVersion) { setIni(null); setTgt(null); } }, [seatMove.remapVersion]);
  const deals: any[] = gameState.votingState?.deals || [];
  const locked = new Set(deals.map((d: any) => d.targetPhysicalId));
  const close = () => { setIni(null); setTgt(null); onClose(); };
  const cells = seatCells(gameState).filter(c => c.player);
  return (
    <BottomSheet open={open} title="تسجيل اتفاقيّة" onClose={close}>
      <Hint>{!ini ? 'المس المُبادر.' : !tgt ? `المُبادر ${ini} ${nameAt(gameState, ini)} — المس المستهدَف (المقفل 🔒 مستهدَفٌ في اتفاقيّةٍ أخرى).` : `${ini} ${nameAt(gameState, ini)} ← ${tgt} ${nameAt(gameState, tgt)}`}</Hint>
      <SeatGrid cells={cells}
        mark={(c) => ({
          selected: c.seat === ini, target: c.seat === tgt,
          topRight: ini && c.seat !== ini && locked.has(c.seat) ? '🔒' : undefined,
          disabled: c.player?.isAlive === false || (!!ini && c.seat !== ini && locked.has(c.seat)),
        })}
        onSeat={(c) => {
          if (!ini) { setIni(c.seat); return; }
          if (c.seat === ini) { setIni(null); setTgt(null); return; }
          setTgt(c.seat);
        }} />
      <button type="button" disabled={!ini || !tgt || busy}
        onClick={async () => {
          if (!ini || !tgt) return;
          setBusy(true);
          const r = await run(() => emit('day:create-deal', { roomId: gameState.roomId, initiatorPhysicalId: ini, targetPhysicalId: tgt }), `🤝 سُجّلت: ${ini} ← ${tgt}`);
          setBusy(false);
          if (r) close();
        }}
        className="min-h-[50px] rounded-[13px] bg-[#C5A059] text-[#110d08] font-bold disabled:opacity-40">سجّل الاتفاقيّة</button>
      {ini && <button type="button" onClick={() => { setIni(null); setTgt(null); }} className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold">ابدأ من جديد</button>}
    </BottomSheet>
  );
}
