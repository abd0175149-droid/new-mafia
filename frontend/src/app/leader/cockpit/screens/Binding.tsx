'use client';
// ══════════════════════════════════════════════════════
// 🔗 ربط الأدوار — منقولٌ من LeaderRoleBinding
//
// المس دوراً ثمّ مقعد صاحبه (setup:unbind-role + setup:bind-role كما اليوم).
// كلُّ ربطٍ يدويّ «مثبّت» تلقائيّاً فلا يمسّه التوزيع العشوائيّ (lockedPhysicalIds).
// فعلٌ رئيسٌ واحد يتقدّم: وزّع الباقي ⟵ أرسل الأدوار (setup:confirm-roles) ⟵ ابدأ اللعبة (setup:binding-complete).
// بعد binding-complete ينتقل الخادم إلى DAY_DISCUSSION (الجولة 1) — اللعبة تبدأ بالنهار لا بالليل.
// ⚠️ الخادم لا يبثّ الحالة بعد bind/unbind/random — الحالةُ هنا محلّيّة كما في المكوّن القديم.
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { Role } from '@/lib/constants';
import {
  ActionBar, Status, Section, Chips, Hint, Btn, BottomSheet, SeatGrid, seatCells, ListRow,
  SetRow, Switch, Stepper, useCockpit, teamOf, roleName, roleIcon, type SeatCellData, type SeatMark,
} from '../kit';
import { TapChip, errMsg } from './setup/ui';

interface Slot { key: number; role: Role; seat: number | null }

type Assign = Record<number, Role>;

export default function BindingScreen() {
  const { gameState, emit, run, toast } = useCockpit();
  const roomId: string = gameState?.roomId;
  const cfg = gameState?.config || {};
  const pool: Role[] = useMemo(() => (Array.isArray(gameState?.rolesPool) ? gameState.rolesPool : []), [gameState?.rolesPool]);
  const poolKey = pool.join(',');
  const players: any[] = Array.isArray(gameState?.players) ? gameState.players : [];
  const eligible = useMemo(() => new Set(players.filter((p) => p.isAlive !== false && !p.seatHeld).map((p) => Number(p.physicalId))), [players]);

  const [assign, setAssign] = useState<Assign>({});
  const [locked, setLocked] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState<boolean>(gameState?.rolesConfirmed === true);
  const [pick, setPick] = useState<number | null>(null);
  const [seatSheet, setSeatSheet] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [randomDone, setRandomDone] = useState(false);

  // ── التهيئة من rolesPool وأدوار اللاعبين — حين يتغيّر محتوى الحوض فقط ──
  //    (المربوطُ مسبقاً يُعدّ يدويّاً فيُثبَّت، كما في المكوّن القديم)
  useEffect(() => {
    const left = [...pool];
    const a: Assign = {};
    for (const p of players) {
      if (!p?.role) continue;
      const i = left.indexOf(p.role);
      if (i === -1) continue;
      a[Number(p.physicalId)] = p.role;
      left.splice(i, 1);
    }
    setAssign(a);
    setLocked(new Set(Object.keys(a).map(Number)));
    setPick(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  useEffect(() => { if (gameState?.rolesConfirmed === true) setConfirmed(true); }, [gameState?.rolesConfirmed]);

  // ── الخانات: كلّ كرتٍ في الحوض خانة، والمقاعدُ المربوطة توزَّع على خانات دورها بالترتيب ──
  const slots: Slot[] = useMemo(() => {
    const seatsByRole = new Map<string, number[]>();
    Object.entries(assign).map(([s, r]) => [Number(s), r] as const).sort((x, y) => x[0] - y[0]).forEach(([s, r]) => {
      const arr = seatsByRole.get(r) || []; arr.push(s); seatsByRole.set(r, arr);
    });
    return pool.map((role, key) => {
      const arr = seatsByRole.get(role);
      const seat = arr && arr.length ? arr.shift()! : null;
      return { key, role, seat };
    });
  }, [pool, assign]);

  const special = slots.filter((s) => s.role !== Role.CITIZEN);
  const citizens = slots.filter((s) => s.role === Role.CITIZEN);
  const unboundSpecial = special.filter((s) => s.seat == null);
  const unboundAll = slots.filter((s) => s.seat == null);
  const pickSlot = pick != null ? slots[pick] : null;

  // ── الربط ──
  const bindSeat = async (slot: Slot, seat: number) => {
    if (busy) return;
    const prevAssign = assign, prevLocked = locked;
    const oldSeat = slot.seat;
    const nextA: Assign = { ...assign };
    if (oldSeat != null) delete nextA[oldSeat];
    nextA[seat] = slot.role;   // من كان في المقعد بدورٍ آخر يُحرَّر دوره تلقائيّاً
    const nextL = new Set(locked); if (oldSeat != null) nextL.delete(oldSeat); nextL.add(seat);
    setAssign(nextA); setLocked(nextL); setConfirmed(false); setPick(null);
    setBusy(true);
    try {
      if (oldSeat != null) await emit('setup:unbind-role', { roomId, physicalId: oldSeat });
      await emit('setup:bind-role', { roomId, physicalId: seat, role: slot.role });
    } catch (e: any) {
      setAssign(prevAssign); setLocked(prevLocked);
      toast(errMsg(e, 'تعذّر الربط'), { tone: 'red' });
    } finally { setBusy(false); }
  };

  const unbindSeat = async (seat: number) => {
    if (busy || assign[seat] == null) return;
    const role = assign[seat];
    const prevAssign = assign, prevLocked = locked;
    const nextA = { ...assign }; delete nextA[seat];
    const nextL = new Set(locked); nextL.delete(seat);
    setAssign(nextA); setLocked(nextL); setConfirmed(false);
    setBusy(true);
    try {
      await emit('setup:unbind-role', { roomId, physicalId: seat });
      toast(`فُكّ «${roleName(role)}» عن المقعد ${seat}`, {
        undo: () => {
          emit('setup:bind-role', { roomId, physicalId: seat, role })
            .then(() => { setAssign((a) => ({ ...a, [seat]: role })); setLocked((l) => new Set(l).add(seat)); setConfirmed(false); })
            .catch((e: any) => toast(errMsg(e, 'تعذّر التراجع'), { tone: 'red' }));
        },
      });
    } catch (e: any) {
      setAssign(prevAssign); setLocked(prevLocked);
      toast(errMsg(e, 'تعذّر فكّ الربط'), { tone: 'red' });
    } finally { setBusy(false); }
  };

  const clearAll = async () => {
    if (busy) return;
    const seats = Object.keys(assign).map(Number);
    if (!seats.length) return;
    setBusy(true);
    const done: number[] = [];
    try {
      for (const s of seats) { await emit('setup:unbind-role', { roomId, physicalId: s }); done.push(s); }
      toast('مُسح كلّ الربط');
    } catch (e: any) {
      toast(errMsg(e, 'تعذّر المسح'), { tone: 'red' });
    } finally {
      setAssign((a) => { const n = { ...a }; done.forEach((s) => delete n[s]); return n; });
      setLocked((l) => { const n = new Set(l); done.forEach((s) => n.delete(s)); return n; });
      setConfirmed(false); setRandomDone(false); setPick(null);
      setBusy(false);
    }
  };

  const randomAssign = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const lockedPhysicalIds = Array.from(locked).filter((s) => assign[s] != null);
      const res: any = await run(() => emit('setup:random-assign', { roomId, lockedPhysicalIds }));
      const st = res?.state;
      if (!st) return;
      const left: Role[] = [...(st.rolesPool || pool)];
      const a: Assign = {};
      for (const p of st.players || []) {
        if (!p?.role) continue;
        const i = left.indexOf(p.role);
        if (i === -1) continue;
        a[Number(p.physicalId)] = p.role;
        left.splice(i, 1);
      }
      setAssign(a);
      setLocked((l) => new Set(Array.from(l).filter((s) => a[s] != null)));
      setConfirmed(false); setRandomDone(true); setPick(null);
      toast(`وُزّع الباقي — ${lockedPhysicalIds.length} مثبّت يدويّاً. راجِع ثمّ أرسل`);
    } finally { setBusy(false); }
  };

  const sendRoles = async () => {
    if (busy) return;
    if (unboundSpecial.length) { toast('وزّع كلّ الأدوار الخاصّة قبل الإرسال', { tone: 'red' }); return; }
    setBusy(true);
    try {
      const r = await run(() => emit('setup:confirm-roles', { roomId }), 'وصلت الأدوار للهواتف — سلّم كروت الورق لمن يلعب بلا هاتف');
      if (r) setConfirmed(true);
    } finally { setBusy(false); }
  };

  const startGame = async () => {
    if (busy) return;
    if (!confirmed) { toast('أرسل الأدوار أوّلاً', { tone: 'red' }); return; }
    setBusy(true);
    try { await run(() => emit('setup:binding-complete', { roomId })); }
    finally { setBusy(false); }
  };

  const openCards = () => { window.open(`/leader/cards?roomId=${roomId}`, '_blank'); };

  // ── الإعدادات قبل الإرسال ──
  const [reveal, setReveal] = useState<boolean>(cfg.allowMafiaReveal !== false);
  const [maxConsec, setMaxConsec] = useState<number>(cfg.maxConsecutiveMafiaGames ?? 3);
  useEffect(() => { setReveal(cfg.allowMafiaReveal !== false); }, [cfg.allowMafiaReveal]);
  useEffect(() => { setMaxConsec(cfg.maxConsecutiveMafiaGames ?? 3); }, [cfg.maxConsecutiveMafiaGames]);

  const toggleReveal = async (v: boolean) => {
    setReveal(v);
    const r = await run(() => emit('room:update-mafia-reveal', { roomId, allowMafiaReveal: v }));
    if (!r) setReveal(!v);
  };
  const changeConsec = async (v: number) => {
    const prev = maxConsec;
    setMaxConsec(v);
    const r = await run(() => emit('room:update-max-consecutive-mafia', { roomId, maxConsecutiveMafiaGames: v }));
    if (!r) setMaxConsec(prev);
  };

  // ── الشبكة ──
  const cells = seatCells(gameState);
  const onSeat = (c: SeatCellData) => {
    const n = c.seat;
    if (!c.player || !eligible.has(n)) {
      toast(c.held ? `المقعد ${n} محجوز — لا يأخذ دوراً` : c.spectator ? `المقعد ${n} لمتفرّج` : `المقعد ${n} فارغ`);
      return;
    }
    if (pickSlot) {
      if (pickSlot.seat === n) { setPick(null); void unbindSeat(n); return; }
      void bindSeat(pickSlot, n);
      return;
    }
    if (assign[n] != null) { setSeatSheet(n); return; }
    toast(`${n} سيأخذ دوراً عشوائيّاً — المس دوراً أوّلاً لتربطه`);
  };
  const mark = (c: SeatCellData): SeatMark | null => {
    const r = assign[c.seat];
    if (!c.player) return null;
    const m: SeatMark = {};
    if (r) {
      m.label = `${roleIcon(r)} ${roleName(r)}`;
      m.tone = teamOf(r);
      if (locked.has(c.seat)) m.topLeft = '🔒';
    }
    if (pickSlot) {
      if (pickSlot.seat === c.seat) m.selected = true;
      else if (!r) m.need = true;
    }
    return m;
  };

  // ── الفعل الرئيس المتقدّم ──
  const allBound = unboundAll.length === 0 && slots.length > 0;
  const stage: 'random' | 'send' | 'start' = !allBound ? 'random' : !confirmed ? 'send' : 'start';
  const boundSpecial = special.length - unboundSpecial.length;
  const meta = confirmed
    ? `أُرسلت الأدوار · ${slots.length} لاعباً`
    : `${boundSpecial} من ${special.length} أدوار خاصّة مربوطة${locked.size ? ` · ${locked.size} مثبّت` : ''}`;

  const primary = stage === 'random'
    ? { label: busy ? '…' : 'وزّع الباقي عشوائيّاً', onPress: randomAssign, disabled: busy || pool.length === 0, sub: `${unboundAll.length} بلا دور · المثبّت يبقى` }
    : stage === 'send'
      ? { label: busy ? '…' : 'أرسل الأدوار للاعبين', onPress: sendRoles, disabled: busy || unboundSpecial.length > 0 }
      : { label: busy ? '…' : 'ابدأ اللعبة', onPress: startGame, disabled: busy, hold: true, sub: 'اضغط مطوّلاً · تبدأ بنقاش الجولة 1' };
  const secondary = stage === 'random'
    ? (Object.keys(assign).length ? { label: 'مسح', onPress: clearAll, disabled: busy } : undefined)
    : stage === 'send'
      ? { label: '🎲 أعد الخلط', onPress: randomAssign, disabled: busy }
      : { label: '🎴 كروت الورق', onPress: openCards };

  return (
    <>
      <Status meta={meta} />
      <ActionBar primary={primary} secondary={secondary} />

      <Hint>
        {pickSlot
          ? `المس مقعد «${roleName(pickSlot.role)}»${pickSlot.seat != null ? ` — أو مقعده الحاليّ ${pickSlot.seat} لفكّه` : ''}.`
          : 'المس دوراً ثمّ مقعد صاحبه. الربط اليدويّ يُثبَّت 🔒 فلا يمسّه التوزيع العشوائيّ، والباقي يُخلط.'}
      </Hint>

      <Section title="الأدوار الخاصّة" aside={`${boundSpecial}/${special.length}`}>
        {special.length === 0 ? <Hint>لا أدوار خاصّة في هذه التركيبة.</Hint> : (
          <Chips>
            {special.map((s) => {
              const t = teamOf(s.role);
              return (
                <TapChip key={s.key} on={pick === s.key} tone={s.seat != null ? 'ok' : t === 'M' ? 'm' : t === 'N' ? 'n' : 'c'}
                  onClick={() => setPick(pick === s.key ? null : s.key)}
                  ariaLabel={`${roleName(s.role)}${s.seat != null ? ` مربوط بالمقعد ${s.seat}` : ''}`}>
                  {roleIcon(s.role)} {roleName(s.role)}{s.seat != null ? ` ← ${s.seat}` : ''}{s.seat != null && locked.has(s.seat) ? ' 🔒' : ''}
                </TapChip>
              );
            })}
          </Chips>
        )}
        {citizens.length > 0 && (
          <Chips>
            <TapChip on={pickSlot?.role === Role.CITIZEN}
              onClick={() => {
                if (pickSlot?.role === Role.CITIZEN) { setPick(null); return; }
                const free = citizens.find((s) => s.seat == null);
                if (!free) { toast('كلّ المواطنين مربوطون'); return; }
                setPick(free.key);
              }}>
              {roleIcon(Role.CITIZEN)} مواطن · {citizens.length - citizens.filter((s) => s.seat == null).length} من {citizens.length}
            </TapChip>
          </Chips>
        )}
        {pickSlot && <Btn className="w-full" onClick={() => setPick(null)}>إلغاء الاختيار</Btn>}
      </Section>

      <Section title={pickSlot ? `مقعد ${roleName(pickSlot.role)}` : 'المقاعد'} aside={Object.keys(assign).length ? `${Object.keys(assign).length} مربوط` : undefined}>
        <SeatGrid cells={cells} onSeat={onSeat} mark={mark} />
        {randomDone && !confirmed && <Hint>✓ وُزّع عشوائيّاً — «أعد الخلط» يعيد غير المثبّت.</Hint>}
      </Section>

      <Section title="قبل الإرسال">
        <SetRow title="تعارف المافيا" sub="يرى المافيا بعضهم عند كشف الكروت">
          <Switch checked={reveal} onChange={(v) => void toggleReveal(v)} label="تعارف المافيا" />
        </SetRow>
        <SetRow title="أقصى تكرارٍ متتالٍ للمافيا" sub="من لعب مافيا هذا العدد متتالياً لا يأخذها عشوائيّاً · 0 = بلا حدّ">
          <Stepper value={maxConsec} min={0} max={10} onChange={(v) => void changeConsec(v)} />
        </SetRow>
      </Section>

      {confirmed && (
        <Section title="🎴 من يلعب بلا هاتف">
          <Hint>افتح كروت الورق في تبويبٍ جديد وسلّم كلّ لاعبٍ كرته بيدك.</Hint>
          <Btn tone="line" className="w-full" onClick={openCards}>🎴 اعرض الأدوار للاعبين اليدويّين</Btn>
        </Section>
      )}

      <SeatRoleSheet seat={seatSheet} role={seatSheet != null ? assign[seatSheet] : undefined} locked={seatSheet != null && locked.has(seatSheet)}
        name={seatSheet != null ? players.find((p) => Number(p.physicalId) === seatSheet)?.name : undefined}
        onClose={() => setSeatSheet(null)}
        onToggleLock={() => { if (seatSheet == null) return; setLocked((l) => { const n = new Set(l); if (n.has(seatSheet)) n.delete(seatSheet); else n.add(seatSheet); return n; }); }}
        onUnbind={() => { const s = seatSheet; setSeatSheet(null); if (s != null) void unbindSeat(s); }}
        onRebind={() => {
          const s = seatSheet; setSeatSheet(null);
          if (s == null) return;
          const slot = slots.find((x) => x.seat === s);
          if (slot) setPick(slot.key);
        }} />
    </>
  );
}

function SeatRoleSheet({ seat, role, locked, name, onClose, onToggleLock, onUnbind, onRebind }: {
  seat: number | null; role?: Role; locked: boolean; name?: string;
  onClose: () => void; onToggleLock: () => void; onUnbind: () => void; onRebind: () => void;
}) {
  if (seat == null || !role) return null;
  const t = teamOf(role);
  return (
    <BottomSheet open title={`المقعد ${seat} · ${name || ''}`} onClose={onClose}>
      <ListRow n={roleIcon(role)} title={roleName(role)} sub={t === 'M' ? 'المافيا' : t === 'N' ? 'محايد' : 'المدينة'} />
      <SetRow title="🔒 مثبّت" sub="المثبّت لا يمسّه التوزيع العشوائيّ">
        <Switch checked={locked} onChange={onToggleLock} label="مثبّت" />
      </SetRow>
      <Btn tone="line" className="w-full" onClick={onRebind}>انقل هذا الدور لمقعدٍ آخر</Btn>
      <Btn tone="red" className="w-full" onClick={onUnbind}>فكّ الربط</Btn>
    </BottomSheet>
  );
}
