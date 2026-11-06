'use client';
// ══════════════════════════════════════════════════════
// 🗳️ التصويت — شبكة المقاعد بعدد الأصوات؛ المضيء بالأزرق لم يصوّت.
// الوكالة: المس المصوّت ثمّ المرشّح ⇒ day:cast-vote {candidateIndex, delta:+1, voterPhysicalId}
// الإلغاء: «تراجع» في التنبيه أو لمس مقعدٍ صوّتَّ عنه ⇒ day:cast-vote {delta:-1, voterPhysicalId}
// الحسم: day:resolve (معطّل حتى الاكتمال) · أنهِ الوقت: day:voting-timeout · day:un-narrow
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSeatMove } from '../../../SeatMove';
import { candidateCounts } from '@/lib/voteCounts';
import { ActionBar, Chip, Chips, Hint, PendingSeats, Section, SeatGrid, Status, seatCells, useCockpit, useDeadline, useLocalCountdown } from '../../kit';
import { MiniBtn, TeamCounts, aliveOf, nameAt } from './shared';

export default function Voting() {
  const { gameState, emit, run, toast } = useCockpit();
  const seatMove = useSeatMove();
  const roomId = gameState.roomId;
  const vs = gameState.votingState || {};
  const candidates: any[] = vs.candidates || [];
  const playerVotes: Record<string, number> = vs.playerVotes || {};
  const proxyVotes: Record<string, number> = vs.leaderProxyVotes || {};
  const alive = aliveOf(gameState);
  const totalVotes: number = vs.totalVotesCast ?? candidates.reduce((s: number, c: any) => s + (Number(c.votes) || 0), 0);
  const weighted = candidates.reduce((s: number, c: any) => s + (Number(c.votes) || 0), 0);
  const isComplete = totalVotes >= alive.length;
  const level: number = vs.tieBreakerLevel || 0;
  const isMayorRevote = vs.mayorRevote === true;
  const mayorRevealedId = gameState.mayorState?.revealed ? gameState.mayorState.mayorPhysicalId : null;
  const mayorW = gameState.config?.mayorVoteWeight ?? 2;

  const [voter, setVoter] = useState<number | null>(null);
  const pendingRef = useRef(0);   // أصواتٌ أُرسلت ولم يصل تحديثُها — يمنع تجاوز عدد الأحياء
  useEffect(() => { setVoter(null); }, [seatMove.remapVersion, level, candidates.length]);
  useEffect(() => { pendingRef.current = 0; }, [totalVotes, candidates]);

  // مقعد ← فهرس المرشّح (لكلّ مقعدٍ مرشّحٌ واحدٌ على الأكثر: هدفُ الاتفاقيّة يُحذف من المرشّحين العاديّين)
  const candBySeat = useMemo(() => {
    const m = new Map<number, number>();
    candidates.forEach((c: any, i: number) => m.set(Number(c.targetPhysicalId), i));
    return m;
  }, [candidates]);

  // ⏱ عدّاد المدّة: من الخادم (votingStartTime + durationSeconds)، وإلّا محلّيّاً من لحظة دخول الطور
  const dur: number | null = vs.durationSeconds || null;
  const deadline = dur && vs.votingStartTime ? Number(vs.votingStartTime) + dur * 1000 : null;
  const srvLeft = useDeadline(deadline);
  const localLeft = useLocalCountdown(dur && !deadline ? dur : null, `${gameState.phase}:${level}`, !!dur && !deadline);
  const clockLeft = dur ? (deadline ? srvLeft : localLeft) : null;

  const removeProxy = async (voterId: number) => {
    const idx = proxyVotes[voterId];
    if (idx === undefined) return;
    await run(() => emit('day:cast-vote', { roomId, candidateIndex: idx, delta: -1, voterPhysicalId: voterId }), `↩ أُلغي صوت ${voterId}`);
  };

  const cast = async (voterId: number, idx: number) => {
    if (isComplete || totalVotes + pendingRef.current >= alive.length) { toast('اكتمل التصويت — لا صوت جديد'); return; }
    pendingRef.current += 1;
    const target = candidates[idx]?.targetPhysicalId;
    const r = await run(() => emit('day:cast-vote', { roomId, candidateIndex: idx, delta: 1, voterPhysicalId: voterId }));
    if (!r) { pendingRef.current = Math.max(0, pendingRef.current - 1); return; }
    setVoter(null);
    toast(`✓ صوّت ${voterId} ${nameAt(gameState, voterId)} ← ${target}`, {
      undo: () => { emit('day:cast-vote', { roomId, candidateIndex: idx, delta: -1, voterPhysicalId: voterId }).catch((e: any) => toast(e?.message || 'تعذّر الإلغاء', { tone: 'red' })); },
    });
  };

  const onSeat = (seat: number) => {
    const p = gameState.players.find((x: any) => x.physicalId === seat);
    if (voter == null) {
      if (!p?.isAlive) return;
      if (proxyVotes[seat] !== undefined) {
        const t = candidates[proxyVotes[seat]]?.targetPhysicalId;
        toast(`صوّتَّ عن ${seat} ← ${t}`, { undo: () => { removeProxy(seat); } });
        return;
      }
      if (playerVotes[seat] !== undefined) {
        toast(`${seat} صوّت من هاتفه ← ${candidates[playerVotes[seat]]?.targetPhysicalId ?? '—'}`);
        return;
      }
      if (isComplete) { toast('اكتمل التصويت'); return; }
      setVoter(seat);
      return;
    }
    if (seat === voter) { setVoter(null); return; }
    const idx = candBySeat.get(seat);
    if (idx === undefined) { toast(`${seat} ليس مرشّحاً في هذا التصويت`); return; }
    cast(voter, idx);
  };

  const cells = seatCells(gameState).filter(c => c.player);
  const deals = candidates.filter((c: any) => c.type === 'DEAL');
  const votedEntries = Object.entries(playerVotes);
  const pendingSeats = alive.filter(p => playerVotes[p.physicalId] === undefined).map(p => Number(p.physicalId)).sort((a, b) => a - b);
  const remaining = pendingSeats.length;

  return (
    <>
      <Status meta={`صوّت ${totalVotes} من ${alive.length}${weighted !== totalVotes ? ` · ${weighted} صوت` : ''}`} clock={clockLeft != null ? { left: clockLeft } : null} />
      <PendingSeats title="لم يصوّت بعد" seats={pendingSeats} nameOf={(n) => nameAt(gameState, n)} doneLabel="وصلت أصوات الجميع — «احسم التصويت»" />
      <TeamCounts />
      {(isMayorRevote || level > 0) && (
        <Chips>
          {isMayorRevote ? <Chip tone="g">🎩 إعادة تصويت بأمر العمدة</Chip> : <Chip tone={level >= 2 ? 'm' : 'g'}>{level >= 2 ? '🎯 تصويتٌ محصور بين المتعادلين' : '🔁 إعادة تصويت'}</Chip>}
          {mayorRevealedId && <Chip tone="g">🎩 {mayorRevealedId} صوتُه ×{mayorW}</Chip>}
        </Chips>
      )}
      <Hint>
        {voter != null
          ? `يصوّت ${voter} ${nameAt(gameState, voter)} — المس المرشّح، أو المسه ثانيةً للإلغاء.`
          : remaining ? 'المضيء بالأزرق لم يصوّت: المسه ثمّ المس من يصوّت عليه.' : 'وصلت أصوات الجميع.'}
        {clockLeft === 0 && !isComplete ? ' · انتهى الوقت — «أنهِ الوقت» يصوّت للمتغيّبين على أنفسهم.' : ''}
      </Hint>
      <Section title="الأصوات" aside={`${remaining} بلا صوت · ${Object.keys(proxyVotes).length} بالوكالة`}>
        <SeatGrid cells={cells}
          mark={(c) => {
            const seat = c.seat;
            const p = c.player;
            const idx = candBySeat.get(seat);
            const cand = idx !== undefined ? candidates[idx] : null;
            const voted = playerVotes[seat] !== undefined;
            const proxy = proxyVotes[seat] !== undefined;
            return {
              selected: voter === seat,
              need: !!p?.isAlive && !voted,
              count: cand ? Number(cand.votes) || 0 : 0,
              ghost: !!p?.isAlive && !cand && voter != null && seat !== voter,
              done: !!p?.isAlive && voted && voter !== seat,
              topRight: cand?.type === 'DEAL' ? '🤝' : seat === mayorRevealedId ? '🎩' : proxy ? '✋' : undefined,
              disabled: !p?.isAlive,
            };
          }}
          onSeat={(c) => onSeat(c.seat)} />
        <Hint>⏳ أزرق = لم يصوّت · ✓ أخضر = صوّت · الرقم الأحمر = الأصوات (موزونة) · 🤝 هدف اتفاقيّة · ✋ صوّتَّ عنه بالوكالة.</Hint>
      </Section>

      {deals.length > 0 && (
        <Section title="🤝 الاتفاقيّات في التصويت">
          <Chips>
            {deals.map((d: any) => {
              const cc = candidateCounts(d);
              return <Chip key={d.id || d.targetPhysicalId} tone="g">{d.initiatorPhysicalId} ← {d.targetPhysicalId} · {cc.votes} صوت{cc.differs ? ` (${cc.voters} مصوّت)` : ''}</Chip>;
            })}
          </Chips>
        </Section>
      )}

      {votedEntries.length > 0 && (
        <Section title="من صوّت لمن" aside="المس صوت الوكالة لإلغائه">
          <div className="flex flex-wrap gap-1.5">
            {votedEntries.map(([v, idx]) => {
              const t = candidates[Number(idx)]?.targetPhysicalId;
              const isProxy = proxyVotes[v] !== undefined;
              return isProxy ? (
                <MiniBtn key={v} tone="gold" ariaLabel={`ألغِ صوت ${v}`} onClick={() => removeProxy(Number(v))}>✋ {v} ← {t} ✕</MiniBtn>
              ) : (
                <Chip key={v}>{v} ← {t}</Chip>
              );
            })}
          </div>
        </Section>
      )}

      {level > 0 && (
        <MiniBtn tone="gold" onClick={() => run(() => emit('day:un-narrow', { roomId }), 'عاد التصويت على الجميع')}>🔓 العودة للتصويت العادي على الجميع</MiniBtn>
      )}

      <ActionBar
        primary={{ label: 'احسم التصويت', disabled: !isComplete, sub: isComplete ? undefined : 'بانتظار الأصوات', onPress: () => run(() => emit('day:resolve', { roomId })) }}
        secondary={{
          label: 'أنهِ الوقت', disabled: isComplete,
          onPress: async () => {
            const r: any = await run(() => emit('day:voting-timeout', { roomId }));
            if (r) toast(r.autoVotedCount ? `⏰ صوّت ${r.autoVotedCount} متغيّب على نفسه` : '⏰ لا متغيّبين');
          },
        }} />
    </>
  );
}
