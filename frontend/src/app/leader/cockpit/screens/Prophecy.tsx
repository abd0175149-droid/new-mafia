'use client';
// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة في القمرة — للموجّه وحده
//
//   ProphecyNightPanel  ليلاً: طلبُ العرّاف (أ/ب)، والفنجان المكشوف، وختمُ قدر الغد،
//                        واختيارُ المنقسم — حالتها، وتسجيلها نيابةً عن اللاعب (بالإشارة).
//   ProphecyDayPanel    نهاراً: صفقة النبوءة وصاحبها الحقيقيّ، و«حقّ الشكّ» نيابةً عنه.
//   KafalaWindow        بعد الفرز وقبل العمدة: «أكفله» أو «لم يكفل» (ب٥: الموجّه يسجّلها).
//
// الأحداث: oracle:open · oracle:withdraw · cup:public · cup:seal · divided:choose
//          · day:kafala-decision. كلّها تحمل `seat` حين يرسلها الموجّه نيابةً.
// 🔴 لا شيء هنا يصل الشاشة: الحالاتُ للموجّه في حالته الكاملة، والشاشةُ تعرض الأحداث وحدها.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { ActionBar, BottomSheet, Btn, Chip, Chips, Hint, HoldButton, ListRow, Section, SeatGrid, Seg, Status, roleName, seatCells, teamOf, useCockpit } from '../kit';
import { nameAt, playerAt } from './day/shared';

const BOX_AR = (b: any) => (b === 'B' ? 'ب' : b === 'A' ? 'أ' : '—');
const aliveSeat = (gs: any, seat: any) => seat != null && !!playerAt(gs, Number(seat))?.isAlive;

/** طلباتُ الليلة كما وصلت الموجّه لحظتها — الحالة الكاملة لا تُبثّ بعد كلّ طلبٍ هادئ */
function useNightRequests() {
  const { gameState, on } = useCockpit();
  const round = gameState?.round;
  const [req, setReq] = useState<{ round: any; oracle?: any; cupPublic?: boolean; seal?: number; divided?: string }>({ round });
  useEffect(() => { setReq({ round }); }, [round]);
  useEffect(() => {
    const offs = [
      on('night:oracle-request', (p: any) => setReq(r => ({ ...r, oracle: p?.box ?? null }))),
      on('night:cup-public-request', (p: any) => setReq(r => ({ ...r, cupPublic: !!p?.on }))),
      on('night:cup-seal-request', (p: any) => setReq(r => ({ ...r, seal: Number(p?.target) }))),
      on('night:divided-choice', (p: any) => setReq(r => ({ ...r, divided: p?.side }))),
    ];
    return () => offs.forEach(f => f());
  }, [on]);
  return req;
}

// ══════════ الليل ══════════
export function ProphecyNightPanel() {
  const { gameState, emit, run } = useCockpit();
  const gs = gameState;
  const req = useNightRequests();
  const [sealOpen, setSealOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!gs || gs.phase !== 'NIGHT') return null;
  const roomId = gs.roomId;
  const round = gs.round || 1;
  const o = gs.oracleState, c = gs.cupState, d = gs.dividedState;

  const oracleOn = o && !o.used && aliveSeat(gs, o.oraclePhysicalId) && round >= 3;
  const oracleBox = req.oracle !== undefined ? req.oracle : o?.pendingBox ?? null;
  const cupPublicOn = c && !c.departed && !c.publicUsed && aliveSeat(gs, c.readerPhysicalId);
  const cupPublic = req.cupPublic !== undefined ? req.cupPublic : !!c?.pendingPublic;
  const sealOn = c && c.departed && c.sealAvailable && round > (c.departedRound || 0);
  const seal = req.seal ?? (c?.sealRound === round ? c?.sealPhysicalId : null);
  const dividedOn = d && !d.choice && round === 3 && aliveSeat(gs, d.dividedPhysicalId) && playerAt(gs, d.dividedPhysicalId)?.role === 'DIVIDED';
  const dividedChoice = req.divided || d?.choice || null;
  const dividedShow = d && round === 3 && (dividedOn || dividedChoice);
  if (!oracleOn && !cupPublicOn && !sealOn && !dividedShow) return null;

  const send = async (ev: string, data: any, ok: string) => {
    if (busy) return;
    setBusy(true);
    await run(() => emit(ev, { roomId, ...data }), ok);
    setBusy(false);
  };

  return (
    <Section title="🔮 كروت النبوءة الليلة" aside="🔒 للموجّه — يختارونها من الظرف، أو تسجّلها نيابةً بالإشارة">
      {oracleOn && (
        <>
          <ListRow n={o.oraclePhysicalId} title={<>📜 العرّاف — {nameAt(gs, o.oraclePhysicalId)}</>}
            sub={oracleBox ? `طلب الصندوق «${BOX_AR(oracleBox)}» — يُفتح عند حلّ الليلة` : 'لم يطلب صندوقاً الليلة'}
            right={oracleBox ? <Chip tone="ok">«{BOX_AR(oracleBox)}»</Chip> : null} />
          <Seg<string> value={oracleBox || 'NONE'} onChange={(v) => send('oracle:open', { seat: o.oraclePhysicalId, box: v === 'NONE' ? null : v }, v === 'NONE' ? 'أُلغي طلب العرّاف' : `📜 العرّاف: الصندوق «${BOX_AR(v)}»`)}
            options={[{ v: 'A', l: 'الصندوق «أ»' }, { v: 'B', l: 'الصندوق «ب»' }, { v: 'NONE', l: 'لا الليلة' }]} />
        </>
      )}
      {cupPublicOn && (
        <>
          <ListRow n={c.readerPhysicalId} title={<>☕ القارئة — {nameAt(gs, c.readerPhysicalId)}</>}
            sub={cupPublic ? 'الفنجان المكشوف: قراءة الليلة تظهر صباحاً على الشاشة (مرّةً في اللعبة)' : `قراءةٌ خفيّة · صدقت ${c.hits?.length || 0} من ${c.threshold}`} />
          <Seg<string> value={cupPublic ? 'ON' : 'OFF'} onChange={(v) => send('cup:public', { seat: c.readerPhysicalId, on: v === 'ON' }, v === 'ON' ? '☕ الفنجان المكشوف الليلة' : 'قراءةٌ خفيّة')}
            options={[{ v: 'OFF', l: 'خفيّة' }, { v: 'ON', l: '🫖 مكشوفة' }]} />
        </>
      )}
      {sealOn && (
        <>
          <ListRow n={c.readerPhysicalId} title={<>☕ قدر الغد — رحلت القارئة {nameAt(gs, c.readerPhysicalId)}</>}
            sub={seal ? `ختمت ${seal} ${nameAt(gs, seal)} — يُعدم أوّل النهار بلا تصويت` : 'تختم اسماً الليلة من هاتفها، أو تسجّله نيابةً'}
            right={<Btn tone="line" disabled={busy} onClick={() => setSealOpen(true)}>{seal ? 'غيّر' : 'سجّل الختم'}</Btn>} />
          <BottomSheet open={sealOpen} title="☕ ختمُ قدر الغد" onClose={() => setSealOpen(false)}>
            <Hint>اختر من ختمته القارئة. يُعدم صاحبه أوّل النهار — والطبيب لا يمنعه، وإن مات ليلاً احترق الختم.</Hint>
            <SeatGrid cells={seatCells(gs)}
              mark={(x) => (!x.player?.isAlive ? { disabled: true } : x.seat === seal ? { done: true } : null)}
              onSeat={(x) => { if (!x.player?.isAlive) return; setSealOpen(false); void send('cup:seal', { seat: c.readerPhysicalId, target: x.seat }, `☕ خُتم ${x.seat}`); }} />
          </BottomSheet>
        </>
      )}
      {dividedShow && (
        <>
          <ListRow n={d.dividedPhysicalId} title={<>⚖️ المنقسم — {nameAt(gs, d.dividedPhysicalId)}</>}
            sub={dividedChoice === 'MAFIA' ? 'عبر إلى المافيا — يعرفهم ويعرفونه، ويشارك اغتيال الليلة' : dividedChoice === 'CITY' ? 'بقي مع المدينة' : 'لم يختر بعد — إن لم يختر يبقى مع المدينة'}
            right={dividedChoice ? <Chip tone={dividedChoice === 'MAFIA' ? 'm' : 'c'}>{dividedChoice === 'MAFIA' ? 'المافيا' : 'المدينة'}</Chip> : null} />
          {dividedOn && !dividedChoice && (
            <div className="grid grid-cols-2 gap-2">
              <HoldButton disabled={busy} className="min-h-[56px]" onHold={() => send('divided:choose', { seat: d.dividedPhysicalId, side: 'MAFIA' }, '⚖️ عبر المنقسم إلى المافيا')}>مطوّلاً: يعبر إلى المافيا</HoldButton>
              <HoldButton tone="gold" disabled={busy} className="min-h-[56px]" onHold={() => send('divided:choose', { seat: d.dividedPhysicalId, side: 'CITY' }, '⚖️ بقي المنقسم مع المدينة')}>مطوّلاً: يبقى مع المدينة</HoldButton>
            </div>
          )}
          {dividedChoice === 'MAFIA' && <Hint>أيقظه مع المافيا الآن. الشاشة تعلن «انقسم المنقسم… إلى المافيا» صباحاً بلا رقمه، والعدّاد يتغيّر مع العرض.</Hint>}
        </>
      )}
    </Section>
  );
}

// ══════════ النهار ══════════
export function ProphecyDayPanel() {
  const { gameState, emit, run } = useCockpit();
  const gs = gameState;
  const [busy, setBusy] = useState(false);
  if (!gs) return null;
  const o = gs.oracleState;
  const deals: any[] = gs.votingState?.deals || [];
  const pd = deals.find((x: any) => x?.kind === 'PROPHECY' || String(x?.id || '').startsWith('prophecy-'));
  const testament = o?.testamentPhysicalId;
  if (!pd && !testament) return null;
  const withdraw = async () => {
    if (busy || !o) return;
    setBusy(true);
    await run(() => emit('oracle:withdraw', { roomId: gs.roomId, seat: o.oraclePhysicalId }), '📜 أُحرقت صفقة النبوءة');
    setBusy(false);
  };
  return (
    <Section title="📜 النبوءة" aside="🔒 صاحبها للموجّه وحده">
      {pd && (
        <>
          <ListRow n={pd.targetPhysicalId} title={<>صفقة النبوءة على {pd.targetPhysicalId} {nameAt(gs, pd.targetPhysicalId)}</>}
            sub={<>العرّاف {o?.oraclePhysicalId} {nameAt(gs, o?.oraclePhysicalId)} · 🔒 {roleName(playerAt(gs, pd.targetPhysicalId)?.role)} — تُعرض بلا اسم صاحبها</>} />
          {gs.phase === 'DAY_DISCUSSION' && (
            <HoldButton disabled={busy} className="w-full min-h-[52px]" onHold={withdraw}>مطوّلاً: حقّ الشكّ — العرّاف يحرق نبوءته</HoldButton>
          )}
        </>
      )}
      {testament && (
        <Hint>📜 كذبت النبوءة — الوصيّة: الاسم الآخر في الصندوقين هو <b className="text-[#efe8da]">{testament} {nameAt(gs, testament)}</b> (🔒 {roleName(playerAt(gs, testament)?.role)}).</Hint>
      )}
    </Section>
  );
}

// ══════════ نافذة الكفالة ══════════
export function KafalaWindow({ win, onClosed, onMayorWindow }: { win: any; onClosed: () => void; onMayorWindow: (w: any) => void }) {
  const { gameState, emit, run } = useCockpit();
  const gs = gameState;
  const [busy, setBusy] = useState(false);
  const w = win?.winner || {};
  const g = gs.guarantorState;
  const k = g?.guarantorPhysicalId;
  const target = playerAt(gs, w.targetPhysicalId);
  const isDeal = w.type === 'DEAL';
  const prophecy = w.kind === 'PROPHECY';
  const label = isDeal
    ? (prophecy ? `صفقة النبوءة على ${w.targetPhysicalId} ${nameAt(gs, w.targetPhysicalId)}` : `اتفاقيّة: ${w.initiatorPhysicalId} ← ${w.targetPhysicalId} ${nameAt(gs, w.targetPhysicalId)}`)
    : `${w.targetPhysicalId} ${nameAt(gs, w.targetPhysicalId)}`;
  const team = teamOf(target?.role) || 'C';

  const decide = async (decision: 'PASS' | 'GUARANTEE') => {
    if (busy) return;
    setBusy(true);
    const r: any = await run(() => emit('day:kafala-decision', { roomId: gs.roomId, decision }),
      decision === 'PASS' ? 'لم يكفل أحد — يمضي القرار' : `🤝 كفله ${k}`);
    setBusy(false);
    if (r) {
      onClosed();
      if (r.mayorWindow) onMayorWindow(r.window || null);
    }
  };

  return (
    <>
      <Status meta="🤝 نافذة الكفالة — قبل العمدة والإعدام" />
      <Section title="🤝 الكفيل" aside={k ? `الكفيل ${k} ${nameAt(gs, k)}` : ''}>
        <ListRow n="⚔️" title={<>نتيجة التصويت: إعدام {label}</>} sub={`${win?.topVotes ?? ''} أصوات · اسأل القاعة: هل يقف الكفيل ويقول «أكفله»؟`} />
        <Hint>
          الحكم بالحقيقة لا بالمظهر — 🔒 للموجّه: {target ? <b className={team === 'M' ? 'text-[#f2a6a9]' : team === 'N' ? 'text-[#f0c879]' : 'text-[#a9d4ee]'}>{roleName(target.role)}</b> : '—'}.
          {' '}{team === 'C'
            ? (isDeal ? 'إن كفله: ينجو، والصفقة كلّها تُلغى، ولا موت اليوم.' : 'إن كفله: ينجو، ولا موت اليوم.')
            : 'إن كفله: يُعدم كعادته، ويموت الكفيل معه.'}
        </Hint>
        <Chips><Chip tone="n">مرّةً في اللعبة</Chip><Chip>الشاشة تعلن «كفله رقم {k}» — والحكم مع قلب الكرت</Chip></Chips>
      </Section>
      <ActionBar
        primary={{ label: `اضغط مطوّلاً: ${k} يكفله`, hold: true, disabled: busy, sub: 'تُستهلك الكفالة — لا رجعة', onPress: () => decide('GUARANTEE') }}
        secondary={{ label: 'لم يكفل أحد', disabled: busy, onPress: () => decide('PASS') }} />
    </>
  );
}
