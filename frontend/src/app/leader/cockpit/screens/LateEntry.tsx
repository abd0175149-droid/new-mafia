'use client';
// ══════════════════════════════════════════════════════
// 🚪 الدخول المتأخّر + 🃏 أداة الكروت أثناء اللعب (الخطّة الموحّدة، المرحلتان 3 و4)
//
// • LateGateSheet: البوّابة مع بداية الليل — من وصل (بترتيب الوصول)، والمافيا المحسوب لهذا العدد،
//   ثمّ «أدخِلهم وابدأ الليل» (ضغطٌ مطوّل). بدائل: «نفّذ الخطّة كما هي» و«تخطَّ الدفعة».
// • LateEntrySheet (الأدوات ← الدخول): صلاحيّات مطلقة — عدّل الدفعات الباقية، أضف دفعة، أغلق الباب.
// • CardsSheet (الأدوات ← الكروت): غيّر كرت لاعب · بدّل لاعبين · سلّم كرتاً لمنتظر. كلّه ينتظر
//   أقرب نقطة آمنة (بداية الليل أو «ابدأ النهار»)، وما يعبر الفريقين يحتاج رقم الأدوات.
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Role, ROLE_ICONS } from '@/lib/constants';
import { FILLER_ROLES, DUPLICABLE_ROLES, SINGLE_ROLE_REASON } from '@/lib/role-duplicates';
import { BottomSheet, Hint, HoldButton, Btn, Chips, Chip, ListRow, Section, SeatGrid, seatCells, Stepper, SetRow, Switch, Seg, useCockpit, teamOf, roleName, TEAM_AR, type SeatCellData } from '../kit';
import { TapChip, errMsg } from './setup/ui';

const iconOf = (r: string) => ROLE_ICONS[r as Role] || '🎭';

// ══════════ البوّابة ══════════
export function LateGateSheet({ gate, onClose, onDone }: { gate: any; onClose: () => void; onDone: () => void }) {
  const { gameState, emit, toast } = useCockpit();
  const [picked, setPicked] = useState<number[]>(() => (gate?.waiting || []).slice(0, Math.max(gate?.plan?.count || 0, (gate?.waiting || []).length)).map((w: any) => w.seat));
  const [busy, setBusy] = useState(false);
  const [literal, setLiteral] = useState(false);
  const waiting: any[] = gate?.waiting || [];
  const k = picked.length;
  const mafia = literal ? Math.max(k > 0 ? 1 : 0, gate?.literalMafia || 0) : (gate?.suggest?.[k] ?? 0);
  const go = async (skip = false) => {
    setBusy(true);
    try {
      const r: any = await emit('late:open-gate', { roomId: gameState.roomId, seats: skip ? [] : picked, literal, skip });
      toast(skip ? 'تُخطّيت الدفعة' : `دخل ${r?.joined?.length || 0} — كلّ الهواتف: «راجع بطاقتك»`);
      onDone();
    } catch (e: any) { toast(errMsg(e, 'تعذّر فتح البوّابة'), { tone: 'red' }); }
    finally { setBusy(false); }
  };
  return (
    <BottomSheet open title={`🚪 بوّابة الليل ${gate?.night === 2 ? 'الثاني' : 'الأوّل'}`} onClose={onClose}>
      <Chips>
        <Chip tone="g">المخطّط: {gate?.plan?.count} · منهم {gate?.plan?.mafia} مافيا</Chip>
        <Chip tone={k ? 'ok' : 'm'}>يدخل الآن: {k}</Chip>
        <Chip tone="m">مافيا الدفعة: {mafia}</Chip>
      </Chips>
      {waiting.length === 0 ? <Hint>لا منتظرين على مقاعد. {gate?.recompute && !literal ? `إعادة الحساب: ${gate?.suggest?.[0] ?? 0} تجنيد من الطاولة.` : ''}</Hint> : (
        <>
          <Hint>بترتيب الوصول. المس لتستبعد من لا يدخل الآن.</Hint>
          {waiting.map((w) => {
            const on = picked.includes(w.seat);
            return <ListRow key={w.seat} n={w.seat} title={w.name} selected={on} sub={on ? 'يدخل' : 'ينتظر'} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== w.seat) : [...p, w.seat]))} />;
          })}
        </>
      )}
      <SetRow title={<b className="text-[14px]">نفّذ الخطّة كما هي</b>} sub={literal ? `${gate?.literalMafia} مافيا مهما وصل` : 'إعادة الحساب على من وصل فعلاً (مستحسن)'}>
        <Switch label="الخطّة حرفيّاً" checked={literal} onChange={setLiteral} />
      </SetRow>
      {k > 0 && mafia === 0 && <Hint>⚠️ دفعةٌ بلا مافيا تكشف الداخلين مواطنين.</Hint>}
      <Hint>بطاقة المافيا تذهب لداخلٍ بنصيبه (الربع لكلّ داخل، والمجموع ≤ 60%)، وإلّا تُجنِّد مواطناً عاديّاً لم يفحصه الشريف. الداخل محصّنٌ ليلته الأولى.</Hint>
      <HoldButton tone="gold" disabled={busy} className="w-full min-h-[54px]" onHold={() => void go(false)}>اضغط مطوّلاً: {k ? `أدخِل ${k} وابدأ الليل` : 'نفّذ وابدأ الليل'}</HoldButton>
      <HoldButton disabled={busy} className="w-full min-h-[46px] text-[13.5px]" onHold={() => void go(true)}>اضغط مطوّلاً: تخطَّ هذه الدفعة</HoldButton>
    </BottomSheet>
  );
}

// ══════════ الأدوات ← الدخول ══════════
export function LateEntrySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, emit, toast } = useCockpit();
  const L = gameState?.config?.lateEntry || { enabled: false, waves: [], recompute: true };
  const [waves, setWaves] = useState<any[]>(L.waves || []);
  useEffect(() => { if (open) setWaves((gameState?.config?.lateEntry?.waves || []).map((w: any) => ({ ...w }))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const round = Number(gameState?.round) || 1;
  const save = async (patch: any) => {
    try { await emit('late:edit', { roomId: gameState.roomId, ...patch }); toast('حُفظت خطّة الدخول'); }
    catch (e: any) { toast(errMsg(e, 'تعذّر'), { tone: 'red' }); }
  };
  const wave = (at: 1 | 2) => waves.find((w) => w.at === at) || { at, count: 0, mafia: 0 };
  const setW = (at: 1 | 2, p: any) => setWaves((ws) => { const cur = { ...wave(at), ...p }; cur.mafia = Math.min(cur.mafia, cur.count); return [...ws.filter((w) => w.at !== at), cur].filter((w) => w.count > 0 || w.done); });
  return (
    <BottomSheet open={open} title="🚪 الدخول المتأخّر" onClose={onClose}>
      <Hint>صلاحيّاتك كاملة: ما لم يُفتح بعد يُعدَّل، والباب يُغلق متى شئت. ما فُتح يبقى في السجلّ.</Hint>
      {([1, 2] as const).map((at) => {
        const w = wave(at);
        const past = w.done || at < round - (gameState?.phase === 'NIGHT' || gameState?.phase === 'MORNING_RECAP' ? 1 : 0);
        return (
          <Section key={at} title={`الليل ${at === 1 ? 'الأوّل' : 'الثاني'}`} aside={w.done ? (w.skipped ? 'تُخطّي' : `دخل ${w.arrived} · مافيا ${w.mafiaDealt}`) : past ? 'فات' : 'لم يُفتح'}>
            {!w.done && !past ? (
              <>
                <SetRow title="العدد"><Stepper value={w.count} min={0} max={12} onChange={(v) => setW(at, { count: v, mafia: v ? Math.max(1, Math.min(w.mafia || 1, v)) : 0 })} /></SetRow>
                {w.count > 0 && <SetRow title="منهم مافيا"><Stepper value={w.mafia} min={0} max={w.count} onChange={(v) => setW(at, { mafia: v })} /></SetRow>}
              </>
            ) : <Hint>{w.done ? 'نُفّذت.' : 'فاتت ليلتها.'}</Hint>}
          </Section>
        );
      })}
      <Btn tone="gold" className="w-full" onClick={() => void save({ waves: waves.filter((w) => !w.done) })}>احفظ الدفعات</Btn>
      <SetRow title="إعادة الحساب عند البوّابة"><Switch label="إعادة الحساب" checked={L.recompute !== false} onChange={(v) => void save({ recompute: v })} /></SetRow>
      {L.enabled && !L.closed
        ? <HoldButton className="w-full min-h-[48px]" onHold={() => void save({ closed: true })}>اضغط مطوّلاً: أغلق الباب الآن</HoldButton>
        : L.closed ? <Btn className="w-full" onClick={() => void save({ closed: false })}>أعد فتح الباب</Btn> : null}
      <Hint>«مافيا قادم» يظهر على الشاشة، والمدينة لا تفوز ما دام فيه شيء. إغلاق الباب يُسقطه.</Hint>
    </BottomSheet>
  );
}

// ══════════ الأدوات ← الكروت ══════════
type Mode = { kind: 'change' | 'swap' | 'handover'; seat?: number; b?: number } | null;
export function CardsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, emit, toast } = useCockpit();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const queue: any[] = gameState?.cardQueue || [];
  const players: any[] = gameState?.players || [];
  const spectators: any[] = (gameState?.spectators || []).filter((s: any) => Number(s.physicalId) > 0);
  const checked = new Set<number>((gameState?.sheriffChecked || []).map(Number));
  useEffect(() => { if (!open) setMode(null); }, [open]);
  const when = gameState?.phase === 'NIGHT' || gameState?.phase === 'MORNING_RECAP' ? '«ابدأ النهار»' : 'بداية الليل';

  const send = async (op: any) => {
    setBusy(true);
    try {
      const r: any = await emit('cards:queue', { roomId: gameState.roomId, op });
      toast(`⏳ ينتظر ${when}${r?.warn ? ` · ⚠️ ${r.warn}` : ''}`, r?.warn ? { tone: 'red', ms: 7000 } : undefined);
      setMode(null);
    } catch (e: any) {
      const code = e?.response?.code;
      toast(code === 'TOOLS_LOCKED' ? '🔒 يعبر بين الفريقين — أدخل رقم الأدوات من «الإعدادات» ثمّ أعد' : errMsg(e, 'تعذّر'), { tone: 'red', ms: 6000 });
    } finally { setBusy(false); }
  };
  const cancel = (id: string) => emit('cards:cancel', { roomId: gameState.roomId, id }).catch(() => {});

  const cells = seatCells(gameState).filter((c) => c.player && c.player.isAlive !== false && c.player.role);
  const onSeat = (c: SeatCellData) => {
    if (!mode) return;
    if (mode.kind === 'swap' && mode.seat != null) { if (mode.seat !== c.seat) void send({ kind: 'swap', seat: mode.seat, b: c.seat }); return; }
    setMode({ ...mode, seat: c.seat });
  };
  const seatP = mode?.seat != null ? players.find((p) => p.physicalId === mode.seat) : null;

  return (
    <BottomSheet open={open} title="🃏 الكروت أثناء اللعب" onClose={onClose}>
      {!mode ? (
        <>
          <Hint>كلّ تغييرٍ ينتظر {when}، ثمّ تعرض كلّ الهواتف «راجع بطاقتك» بالسطر نفسه — فلا يُعرف من تغيّر.</Hint>
          <Btn tone="line" className="w-full" onClick={() => setMode({ kind: 'change' })}>✏️ غيّر كرت لاعب</Btn>
          <Btn tone="line" className="w-full" onClick={() => setMode({ kind: 'swap' })}>⇄ بدّل كرتَي لاعبين</Btn>
          <Btn tone="line" className="w-full" disabled={!spectators.length} onClick={() => setMode({ kind: 'handover' })}>🤝 سلّم كرت لاعب لمنتظر{spectators.length ? '' : ' (لا منتظرين)'}</Btn>
          <Hint>«أخرِج» من «الأدوات ← المقاعد» أو الإقصاء الإداريّ. ما يعبر بين الفريقين يحتاج رقم الأدوات.</Hint>
          {queue.length > 0 && (
            <Section title={`⏳ ينتظر ${when} (${queue.length})`}>
              {queue.map((q) => (
                <ListRow key={q.id} n={q.kind === 'swap' ? '⇄' : q.kind === 'handover' ? '🤝' : '✏️'}
                  title={q.kind === 'change' ? `${q.seat} ⟵ ${roleName(q.role)}` : q.kind === 'swap' ? `${q.seat} ⇄ ${q.b}` : `كرت ${q.seat} ⟵ المنتظر ${q.spectatorSeat}`}
                  sub={q.cross ? 'يعبر بين الفريقين' : undefined}
                  right={<button type="button" className="min-h-[44px] rounded-[12px] border border-[#d0474c]/50 px-3 text-[13px] text-[#f2a6a9]" onClick={() => void cancel(q.id)}>ألغِ</button>} />
              ))}
            </Section>
          )}
          {(gameState?.cardLog || []).length > 0 && <Hint>السجلّ: {(gameState.cardLog || []).slice(-4).map((l: any) => l.text).join(' · ')}</Hint>}
        </>
      ) : mode.seat == null || (mode.kind === 'swap') ? (
        <>
          <Hint>{mode.kind === 'swap' ? (mode.seat == null ? 'المس اللاعب الأوّل' : `المس من يتبادل كرته مع ${mode.seat}`) : 'المس اللاعب'}</Hint>
          <SeatGrid cells={cells} showRoles onSeat={onSeat} mark={(c) => ({ selected: mode.seat === c.seat, topLeft: checked.has(c.seat) ? '🔍' : undefined, disabled: busy })} />
          <Btn className="w-full" onClick={() => setMode(null)}>رجوع</Btn>
        </>
      ) : mode.kind === 'change' ? (
        <>
          <ListRow n={mode.seat} title={seatP?.name} sub={`الآن: ${roleName(seatP?.role)}${checked.has(mode.seat) ? ' · 🔍 فحصه الشريف' : ''}`} />
          {(['M', 'C', 'N'] as const).map((t) => (
            <div key={t} className="flex flex-col gap-1.5">
              <b className="text-[13px] text-[#9a8f7e]">{TEAM_AR[t]}{teamOf(seatP?.role) !== t ? ' · يعبر الفريق 🔒' : ''}</b>
              <Chips>
                {(Object.values(Role) as Role[]).filter((r) => teamOf(r) === t && r !== Role.OLDER_BROTHER && r !== Role.YOUNGER_BROTHER && r !== seatP?.role).map((r) => {
                  const inUse = players.some((p) => p.isAlive !== false && p.role === r);
                  const blocked = inUse && !FILLER_ROLES.has(r) && !DUPLICABLE_ROLES.has(r);
                  return <TapChip key={r} disabled={busy || blocked} tone={t === 'M' ? 'm' : t === 'N' ? 'n' : 'c'} onClick={() => void send({ kind: 'change', seat: mode.seat, role: r })}>{iconOf(r)} {roleName(r)}{blocked ? ' · واحد' : ''}</TapChip>;
                })}
              </Chips>
            </div>
          ))}
          <Hint>حالة الكرت الجديد تبدأ من جديد (سجلّ الشريف فارغ، العقود جديدة). الإسكات والتعطيل يبقيان على اللاعب.</Hint>
          <Btn className="w-full" onClick={() => setMode({ kind: 'change' })}>لاعبٌ آخر</Btn>
        </>
      ) : (
        <>
          <ListRow n={mode.seat} title={seatP?.name} sub={`كرته: ${roleName(seatP?.role)} — يأخذه المنتظر، ويصير هو منتظراً في كرسيّه`} />
          {spectators.map((s) => (
            <ListRow key={s.physicalId} n={s.physicalId} title={s.name} onClick={busy ? undefined : () => void send({ kind: 'handover', seat: mode.seat, spectatorSeat: Number(s.physicalId) })} />
          ))}
          <Btn className="w-full" onClick={() => setMode({ kind: 'handover' })}>لاعبٌ آخر</Btn>
        </>
      )}
    </BottomSheet>
  );
}

export { Seg, SINGLE_ROLE_REASON };
