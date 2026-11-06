'use client';
// ══════════════════════════════════════════════════════
// ☀️ ملخّص الصباح — الأحداث بالترتيب، تُعرض على الشاشة واحداً واحداً
//
// «عُرض» = event.revealed من الخادم أو ما عرضناه محلّيّاً (التحديث لا يعيدك للبداية).
// ما للموجّه وحده (نتيجة الشريف، الإسكات، نهوض العنقاء…) يُعلَّم «🔒 للّيدر» ولا يُبثّ.
// الأحداث كما في LeaderNightView: night:display-event {eventIndex}، night:end-recap،
// game:confirm-end، policewoman:execute {targetPhysicalId}، policewoman:skip.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { ActionBar, Chip, Chips, Hint, HoldButton, ListRow, Section, SeatGrid, Status, seatCells, roleName, teamOf, TEAM_AR, useCockpit } from '../kit';
import { useHost } from '../host';
import { useSeatMove } from '../../SeatMove';
import { eventDetail, eventMeta, isDisplayable, useBusy, winnerOf } from './night/meta';

export default function RecapScreen() {
  const host = useHost();
  const [pwResult, setPwResult] = useState<any>(null);
  if (pwResult) return <PoliceResult res={pwResult} onDone={() => setPwResult(null)} />;
  if (host.policewomanChoice) return <PoliceChoice data={host.policewomanChoice} onResult={(r) => { setPwResult(r); host.setPolicewomanChoice(null); }} />;
  return <EventsView />;
}

function TeamCounts() {
  const { gameState } = useCockpit();
  const alive = (gameState?.players || []).filter((p: any) => p.isAlive !== false && !p.seatHeld && p.role);
  const m = alive.filter((p: any) => teamOf(p.role) === 'M').length;
  const c = alive.filter((p: any) => teamOf(p.role) === 'C').length;
  const n = alive.filter((p: any) => teamOf(p.role) === 'N').length;
  return (
    <Chips>
      <Chip tone="m">مافيا {m}</Chip>
      <Chip tone="c">مدينة {c}</Chip>
      {n > 0 && <Chip tone="n">محايد {n}</Chip>}
      <Chip>أحياء {alive.length}</Chip>
    </Chips>
  );
}

function WinnerBox({ winner, hint }: { winner: string; hint: string }) {
  const w = winnerOf(winner);
  return (
    <Section tone="red" title={<>{w.icon} {w.text}</>}>
      <Hint>{hint}</Hint>
    </Section>
  );
}

// ══════════ الأحداث ══════════
function EventsView() {
  const { gameState, emit, run, toast } = useCockpit();
  const { busy, wrap } = useBusy();
  const events: any[] = gameState?.morningEvents || [];
  const [local, setLocal] = useState<Set<number>>(() => new Set());
  const [last, setLast] = useState<number | null>(null);
  const round = gameState?.round;
  useEffect(() => { setLocal(new Set()); setLast(null); }, [round]);
  // 💾 لا يبقى اختيار طابورٍ جارٍ بعد انتهاء الليل
  useEffect(() => { try { localStorage.removeItem('mafia_leader_night_sel'); } catch { /* */ } }, []);

  const shown = (i: number) => local.has(i) || events[i]?.revealed === true;
  const disp = events.map((e, i) => (isDisplayable(e) ? i : -1)).filter(i => i >= 0);
  const next = disp.find(i => !shown(i));
  const shownCount = disp.filter(shown).length;
  const lastShown = last ?? [...disp].reverse().find(shown) ?? null;
  const pendingWinner: string | null = gameState?.pendingWinner || null;

  const display = (i: number) => wrap(async () => {
    const replay = shown(i);
    const r = await run(() => emit('night:display-event', { roomId: gameState.roomId, eventIndex: i }), replay ? 'أُعيد عرض الحدث' : 'عُرض على شاشة القاعة');
    if (r) { setLocal(prev => new Set(prev).add(i)); setLast(i); }
  });
  const startDay = () => wrap(async () => {
    const r: any = await run(() => emit('night:end-recap', { roomId: gameState.roomId }));
    if (r?.policewomanPending) toast('👮‍♀️ الشرطيّة بلغت العتبة — اختر مقعداً');
  });
  const confirmEnd = () => wrap(() => run(() => emit('game:confirm-end', { roomId: gameState.roomId })));

  const replay = { label: 'إعادة العرض', disabled: busy || lastShown == null, onPress: () => { if (lastShown != null) display(lastShown); } };
  const primary = next != null
    ? { label: 'اعرض الحدث التالي على الشاشة', disabled: busy, onPress: () => display(next) }
    : pendingWinner
      ? { label: 'اعرض النتيجة', disabled: busy, onPress: confirmEnd }
      : { label: 'ابدأ النهار', disabled: busy, onPress: startDay };

  return (
    <>
      <Status meta={disp.length ? `ملخّص الصباح · عُرض ${shownCount} من ${disp.length}` : 'ملخّص الصباح'} />
      <ActionBar primary={primary} secondary={disp.length ? replay : undefined} />

      <TeamCounts />
      {pendingWinner && <WinnerBox winner={pendingWinner} hint="انتهت اللعبة بهذه الليلة. اعرض الأحداث ثمّ النتيجة." />}

      {events.length === 0 ? (
        <Section title="☾ ليلةٌ هادئة"><Hint>لا أحداث هذه الليلة — لا خروج.</Hint></Section>
      ) : events.map((e, i) => {
        const m = eventMeta(e.type);
        const can = isDisplayable(e);
        const st = !can ? <Chip tone="n">🔒 للّيدر</Chip>
          : shown(i) ? <Chip tone="ok">عُرض ✓</Chip>
          : i === next ? <Chip tone="g">التالي</Chip>
          : <Chip>بالدور</Chip>;
        const color = m.tone === 'm' ? 'text-[#f2a6a9]' : m.tone === 'ok' ? 'text-[#99dcba]' : m.tone === 'c' ? 'text-[#a9d4ee]' : m.tone === 'n' ? 'text-[#f0c879]' : 'text-[#C5A059]';
        const sheriff = e.type === 'SHERIFF_RESULT' && e.extra;
        return (
          <ListRow key={`${round}:${i}`} n={e.targetPhysicalId || m.icon}
            selected={can && i === next}
            onClick={can && !busy ? () => display(i) : undefined}
            title={<span className={`font-bold ${color}`}>{m.icon} {m.title}{sheriff && <> — <span style={{ color: e.extra.result === 'MAFIA' ? '#d0474c' : '#63afd9' }}>{e.extra.result === 'MAFIA' ? 'مافيا' : 'مواطن'}</span></>}</span>}
            sub={eventDetail(e)}
            right={<span className="shrink-0">{st}</span>} />
        );
      })}

      <Hint>{disp.length ? 'المس حدثاً لعرضه أو إعادته. حالة «عُرض» محفوظة في الخادم — التحديث لا يعيدك للبداية.' : 'لا شيء يُعرض على الشاشة من هذه الليلة.'}</Hint>
    </>
  );
}

// ══════════ الشرطيّة: الاختيار ══════════
function PoliceChoice({ data, onResult }: { data: any; onResult: (r: any) => void }) {
  const { gameState, emit, run } = useCockpit();
  const host = useHost();
  const seatMove = useSeatMove();
  const { busy, wrap } = useBusy();
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { if (seatMove.remapVersion) setSel(null); }, [seatMove.remapVersion]);
  const targets = new Set<number>((data?.targets || []).map((t: any) => Number(t.physicalId)));
  const selName = sel != null ? (data?.targets || []).find((t: any) => t.physicalId === sel)?.name : null;

  const exec = () => wrap(async () => {
    if (sel == null) return;
    const target = sel;
    const r: any = await run(() => emit('policewoman:execute', { roomId: gameState.roomId, targetPhysicalId: target }));
    if (r?.success) onResult({ ...r, seat: target });
  });
  const skip = () => wrap(async () => {
    const r = await run(() => emit('policewoman:skip', { roomId: gameState.roomId }), 'تُخطّيت الشرطيّة');
    if (r) host.setPolicewomanChoice(null);
  });

  return (
    <>
      <Status meta="الشرطيّة" />
      <ActionBar
        primary={sel != null
          ? { label: `اضغط مطوّلاً: أقصِ ${sel}`, sub: selName || undefined, hold: true, disabled: busy, onPress: exec }
          : { label: 'اختر مقعداً', disabled: true, onPress: () => {} }}
      />
      <Section title={<>👮‍♀️ {data?.policewomanName || 'الشرطيّة'} ({data?.policewomanPhysicalId})</>}>
        <Chips>
          <Chip tone="g">العتبة {data?.threshold ?? '—'}</Chip>
          <Chip tone="m">الوفيات {data?.citizenDeaths ?? '—'}</Chip>
        </Chips>
        <Hint>الشرطيّة بلغت العتبة: تُقصي لاعباً تختاره. إن كان مافيا نالت نقاط رانك. المس المقعد ثمّ اضغط مطوّلاً.</Hint>
      </Section>
      <Section title="الهدف" aside={`${targets.size} متاح`}>
        <SeatGrid cells={seatCells(gameState)}
          mark={(c) => ({ selected: sel === c.seat, target: sel === c.seat, disabled: busy || !targets.has(c.seat) })}
          onSeat={(c) => setSel(c.seat)} />
      </Section>
      {/* التخطّي يُفقدها صلاحيتها نهائيّاً — ضغطٌ مطوّل كأيّ فعلٍ لا رجعة فيه */}
      <HoldButton tone="gold" disabled={busy} onHold={skip} className="w-full min-h-[50px]">اضغط مطوّلاً: تخطَّ الشرطيّة<small className="block text-[11.5px] font-medium opacity-80">تفقد صلاحيتها لبقيّة اللعبة</small></HoldButton>
    </>
  );
}

// ══════════ الشرطيّة: النتيجة ══════════
function PoliceResult({ res, onDone }: { res: any; onDone: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const { busy, wrap } = useBusy();
  const hit = !!res.targetIsMafia;
  const winner: string | null = res.pendingWinner || null;
  const t = teamOf(res.targetRole);
  const go = () => wrap(async () => {
    const r = winner
      ? await run(() => emit('game:confirm-end', { roomId: gameState.roomId }))
      : await run(() => emit('night:end-recap', { roomId: gameState.roomId }));
    if (r) onDone();
  });
  return (
    <>
      <Status meta="الشرطيّة · النتيجة" />
      <ActionBar primary={{ label: winner ? 'اعرض النتيجة' : 'ابدأ النهار', disabled: busy, onPress: go }} />
      <Section tone={hit ? undefined : 'red'} title={hit ? '🎯 الشرطيّة أصابت' : '💔 الشرطيّة أخطأت'}>
        <ListRow n={res.seat ?? '—'} title={res.targetName || ''} sub={`${roleName(res.targetRole)}${t ? ` · ${TEAM_AR[t]}` : ''}`} />
        {hit && <Hint>+ نقاط رانك للشرطيّة 🏆</Hint>}
        <Hint>يُقلب كرته على شاشة القاعة الآن.</Hint>
      </Section>
      {winner && <WinnerBox winner={winner} hint="انتهت اللعبة بإقصاء الشرطيّة. اعرض النتيجة على الشاشة." />}
    </>
  );
}
