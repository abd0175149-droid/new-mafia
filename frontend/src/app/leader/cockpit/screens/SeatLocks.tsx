'use client';
// ══════════════════════════════════════════════════════
// 🔒 إغلاق المقاعد — تحكّم الليدر الكامل (2026-11-15)
//
// لكلّ كرسيّ ثلاث حالات: مفتوح · في دفعة (مغلقٌ الآن ويُفتح بقاعدة) · مغلق دائماً.
// المنطق كلّه في الخادم (backend/src/game/seating/seat-locks.ts) وحدثٌ واحد:
//   room:seat-locks { op: save | patch | rule | open-next | undo | later }
// والحالة تصل في gameState.seatLocks = { map, rule, pending, undo, waiters }.
// هنا العرض والمحرّر فقط؛ الأعداد المعروضة تقريبٌ للعرض، والحكم للخادم.
//
// المحرّر يعدّل مسودّةً محلّيّة ويرسلها مرّةً واحدة عند «تمّ» — اللمسات لا تُبثّ واحدةً واحدة.
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import {
  ActionBar, Section, Hint, Btn, BottomSheet, SeatGrid, seatCells, Seg, Stepper, SetRow, ListRow, Chips,
  useCockpit, type SeatCellData, type SeatMark,
} from '../kit';
import { TapChip, inputCls } from './setup/ui';

export type LockMap = Record<number, number>;   // كرسيّ ⟵ 0 دائم · n≥1 دفعة
type Mode = 'auto' | 'ask' | 'off';
interface Rule { mode: Mode; threshold: number }
interface Pattern { name: string; cap: number; map: Record<string, number>; rule: Rule }

const WAITER_TTL_MS = 50_000;
/** فرق ساعة الهاتف عن ساعة الخادم — يُضبط من أوّل حدثٍ يصل، كي لا يبقى «منتظرٌ» شبحاً */
let clockSkew = 0;

const seatsWord = (n: number) => (n === 1 ? 'مقعد واحد' : n === 2 ? 'مقعدان' : n <= 10 ? `${n} مقاعد` : `${n} مقعداً`);
/** المتتالية تُختصر «13 إلى 24»، وغيرها تُسرد */
const chairsText = (a: number[]) => (a.length > 2 && a.every((v, i) => i === 0 || v === a[i - 1] + 1) ? `${a[0]} إلى ${a[a.length - 1]}` : a.join('، '));
const ruleText = (r: Rule) => (r.mode === 'off' ? 'تُفتح بيدك فقط'
  : `${r.mode === 'auto' ? 'تُفتح وحدها' : 'تُسأل عنها'} ${r.threshold === 0 ? 'حين يمتلئ المفتوح' : r.threshold === 1 ? 'حين يبقى مقعدٌ واحد مفتوح' : r.threshold === 2 ? 'حين يبقى مقعدان مفتوحان' : `حين تبقى ${r.threshold} مقاعد مفتوحة`}`);

const samePerson = (a: any, b: any) => {
  const ai = Number(a?.playerId), bi = Number(b?.playerId);
  if (ai > 0 && bi > 0) return ai === bi;
  const ap = String(a?.phone || '').replace(/\D/g, '').replace(/^(00962|962)/, '0'), bp = String(b?.phone || '').replace(/\D/g, '').replace(/^(00962|962)/, '0');
  if (ap && bp) return ap === bp;
  const an = String(a?.name ?? a?.playerName ?? '').trim().toLowerCase(), bn = String(b?.name ?? b?.playerName ?? '').trim().toLowerCase();
  return !!an && an === bn;
};

function readMap(gameState: any): LockMap {
  const raw = gameState?.seatLocks?.map;
  const cap = Number(gameState?.config?.maxPlayers) || 0;
  const out: LockMap = {};
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const c = Number(k), v = Number(raw[k]);
      if (c >= 1 && c <= cap && Number.isFinite(v) && v >= 0) out[c] = v;
    }
  }
  return out;
}
const readRule = (gameState: any): Rule => {
  const r = gameState?.seatLocks?.rule;
  const mode: Mode = r?.mode === 'ask' || r?.mode === 'off' ? r.mode : 'auto';
  const t = Math.floor(Number(r?.threshold));
  return { mode, threshold: Number.isFinite(t) ? Math.min(6, Math.max(0, t)) : 1 };
};

/** ما يُعرض: المغلق، المفتوح الفارغ، الدفعة التالية، المنتظرون — لخريطةٍ ما (الحيّة أو المسودّة) */
export function lockView(gameState: any, map: LockMap = readMap(gameState)) {
  const cap = Number(gameState?.config?.maxPlayers) || 0;
  const players: any[] = gameState?.players || [];
  const specs: any[] = gameState?.spectators || [];
  const occ = new Set<number>([...players, ...specs].map((p) => Number(p?.physicalId)).filter((n) => n > 0));
  const present = [...players, ...specs];
  const pinnedAbsent = new Set<number>();
  for (const pin of (Array.isArray(gameState?.pinnedSeats) ? gameState.pinnedSeats : [])) {
    const s = Number(pin?.seatNumber);
    if (!(s > 0) || occ.has(s)) continue;
    if (!present.some((p) => samePerson(p, pin))) pinnedAbsent.add(s);
  }
  const closed = Object.keys(map).map(Number).filter((c) => c >= 1 && c <= cap).sort((a, b) => a - b);
  const closedEmpty = closed.filter((c) => !occ.has(c));
  let openFree = 0;
  for (let i = 1; i <= cap; i++) if (!occ.has(i) && map[i] === undefined && !pinnedAbsent.has(i)) openFree++;
  const batches = Array.from(new Set(closed.map((c) => map[c]).filter((v) => v >= 1))).sort((a, b) => a - b);
  const next = batches.length ? closed.filter((c) => map[c] === batches[0]) : [];
  return { cap, occ, closed, closedEmpty, openFree, batches, next };
}

export function useLockState() {
  const { gameState } = useCockpit();
  // ⏱ المنتظر الذي كفّ عن المحاولة يسقط وحده — نبضةٌ كلّ 10 ثوانٍ تكفي
  const [, tick] = useState(0);
  const rawWaiters: any[] = Array.isArray(gameState?.seatLocks?.waiters) ? gameState.seatLocks.waiters : [];
  useEffect(() => {
    if (!rawWaiters.length) return;
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [rawWaiters.length]);
  const map = useMemo(() => readMap(gameState), [gameState?.seatLocks?.map, gameState?.config?.maxPlayers]);   // eslint-disable-line react-hooks/exhaustive-deps
  const view = lockView(gameState, map);
  const now = Date.now() + clockSkew;
  const waiters = rawWaiters.filter((w) => w && now - Number(w.at) < WAITER_TTL_MS);
  return {
    ...view, map, rule: readRule(gameState), waiters,
    pending: gameState?.seatLocks?.pending === true && view.batches.length > 0,
    canUndo: Array.isArray(gameState?.seatLocks?.undo?.chairs) && gameState.seatLocks.undo.chairs.length > 0,
  };
}

/** علامة المقعد المغلق على الشبكة — تُدمج مع علامات الشاشة */
export function lockMark(c: SeatCellData, map: LockMap): SeatMark {
  const v = map[c.seat];
  if (v === undefined) return {};
  const empty = !c.player && !c.held && !c.spectator;
  return { shut: true, perm: v === 0, badge: v === 0 ? '🔒' : v, ...(empty ? { label: v === 0 ? 'مغلق' : `دفعة ${v}` } : {}) };
}

/** 🔔 فتحٌ آليّ ⟵ شريطٌ فيه «تراجع». يُركَّب مرّةً في اللوبي. */
export function useSeatLockEvents() {
  const { on, emit, toast, gameState } = useCockpit();
  const roomId = gameState?.roomId;
  useEffect(() => on('room:seat-locks', (d: any) => {
    if (Number.isFinite(Number(d?.at))) clockSkew = Number(d.at) - Date.now();
    const ev = d?.event;
    if (ev?.type === 'opened' && ev.by === 'auto' && Array.isArray(ev.chairs) && ev.chairs.length) {
      toast(`🔓 فُتحت دفعة فيها ${seatsWord(ev.chairs.length)}: ${chairsText(ev.chairs)}`, {
        ms: 9000,
        undo: () => { emit('room:seat-locks', { roomId, op: 'undo' }).then((r: any) => toast(r?.reclosed?.length ? `أُعيد إغلاق ${chairsText(r.reclosed)} — لن تُفتح وحدها حتى تفتحها` : 'جلس الجميع عليها — لا شيء يُعاد إغلاقه')).catch(() => {}); },
      });
    }
  }), [on, emit, toast, roomId]);
}

const GOLD = 'bg-[#0e0c0a] border border-[#C5A059]/60 rounded-2xl p-3 flex flex-col gap-2.5';

/** شريط الحالة فوق شبكة اللوبي: كم مغلق، وما الدفعة التالية، وزرّا «افتح» و«تحكّم» */
export function SeatLockStrip({ onEdit }: { onEdit: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const s = useLockState();
  if (!s.closed.length) return null;
  return (
    <section className={GOLD}>
      <h3 className="m-0 text-[15px] font-bold flex items-center gap-2 text-[#efe8da]">🔒 {s.closed.length} مغلق<span className="ms-auto text-[13px] font-medium text-[#9a8f7e]">{s.openFree} مفتوح فارغ</span></h3>
      <Hint>{s.batches.length ? `الدفعة التالية فيها ${seatsWord(s.next.length)} (${chairsText(s.next)}) — ${ruleText(s.rule)}.` : 'كلّها مغلقةٌ دائماً — تُفتح بيدك.'}</Hint>
      <div className="flex gap-2">
        {s.batches.length > 0 && !s.pending && <Btn tone="line" className="flex-1" onClick={() => void run(() => emit('room:seat-locks', { roomId: gameState?.roomId, op: 'open-next' }), 'فُتحت الدفعة')}>🔓 افتح الدفعة</Btn>}
        <Btn className="flex-1" onClick={onEdit}>تحكّم</Btn>
      </div>
    </section>
  );
}

/** شريط القرار: «افتح الدفعة التالية؟» (القاعدة «بإذني») أو «N ينتظر بلا مقعد» */
export function SeatLockBanner({ onEdit }: { onEdit: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const s = useLockState();
  const roomId = gameState?.roomId;
  if (s.pending) {
    return (
      <Section tone="sky" title={`🔓 ${s.openFree === 0 ? 'امتلأ المفتوح' : 'كاد المفتوح يمتلئ'}${s.waiters.length ? ` · ${s.waiters.length} ينتظر` : ''}`}>
        <Hint>الدفعة التالية فيها {seatsWord(s.next.length)}: {chairsText(s.next)}</Hint>
        <div className="flex gap-2">
          <Btn tone="gold" className="flex-[2]" onClick={() => void run(() => emit('room:seat-locks', { roomId, op: 'open-next' }), 'فُتحت الدفعة')}>افتحها</Btn>
          <Btn className="flex-1" onClick={() => void run(() => emit('room:seat-locks', { roomId, op: 'later' }), 'بقيت مغلقة — افتحها من شريط الإغلاق متى شئت')}>لاحقاً</Btn>
        </div>
      </Section>
    );
  }
  if (!s.waiters.length) return null;
  return (
    <Section tone="red" title={`🚶 ${s.waiters.length} ينتظر بلا مقعد`}>
      <Hint>{s.waiters.map((w: any) => w.name).filter(Boolean).join('، ')} — لا مقعد مفتوح{s.batches.length ? '. افتح دفعة.' : s.closedEmpty.length ? '، والباقي مغلق دائماً. افتح مقعداً أو زِد العدد.' : '.'}</Hint>
      <div className="flex gap-2">
        {s.batches.length > 0 && <Btn tone="gold" className="flex-[2]" onClick={() => void run(() => emit('room:seat-locks', { roomId, op: 'open-next' }), 'فُتحت الدفعة')}>🔓 افتح الدفعة</Btn>}
        <Btn className="flex-1" onClick={onEdit}>تحكّم</Btn>
      </div>
    </Section>
  );
}

/** لوح مقعدٍ فارغٍ مغلق: افتحه، أو أجلِس عليه (قرار الليدر يغلب)، أو بدّل نوع إغلاقه */
export function ClosedSeatSheet({ seat, onClose, onAdd }: { seat: number | null; onClose: () => void; onAdd?: (seat: number) => void }) {
  const { gameState, emit, run } = useCockpit();
  const map = readMap(gameState);
  const v = seat != null ? map[seat] : undefined;
  useEffect(() => { if (seat != null && v === undefined) onClose(); }, [seat, v, onClose]);
  if (seat == null || v === undefined) return null;
  const patch = (val: number | null, msg: string) => void run(() => emit('room:seat-locks', { roomId: gameState?.roomId, op: 'patch', patch: { [seat]: val } }), msg).then((r) => { if (r) onClose(); });
  return (
    <BottomSheet open title={`المقعد ${seat} ${v === 0 ? 'مغلق دائماً' : `في الدفعة ${v}`}`} onClose={onClose}>
      <Btn tone="gold" className="w-full" onClick={() => patch(null, `فُتح المقعد ${seat}`)}>🔓 افتحه الآن</Btn>
      {onAdd && <Btn className="w-full" onClick={() => { onClose(); onAdd(seat); }}>أجلِس لاعباً عليه — قرارك يغلب</Btn>}
      {v === 0
        ? <Btn className="w-full" onClick={() => patch(1, `المقعد ${seat} في الدفعة التالية`)}>ضعه في الدفعة التالية</Btn>
        : <Btn className="w-full" onClick={() => patch(0, `المقعد ${seat} مغلق دائماً`)}>🔒 أغلقه دائماً</Btn>}
      <Hint>{v === 0 ? 'لا تفتحه أيّ قاعدة حتى تفتحه بيدك.' : 'يُفتح مع دفعته، أو الآن بيدك.'} اللاعب لا يراه في قائمته.</Hint>
    </BottomSheet>
  );
}

// ══════════ المحرّر ══════════
type Brush = 'o' | '1' | '2' | '3' | 'p';
const BRUSHES: Array<{ v: Brush; l: string }> = [{ v: 'o', l: 'مفتوحاً' }, { v: '1', l: 'دفعة 1' }, { v: '2', l: 'دفعة 2' }, { v: '3', l: 'دفعة 3' }, { v: 'p', l: '🔒 دائم' }];
const brushVal = (b: Brush): number | null => (b === 'o' ? null : b === 'p' ? 0 : Number(b));

/**
 * محرّر الإغلاق — مسودّةٌ محلّيّة تُرسل مرّةً عند «تمّ».
 * `bar` = يعلن «تمّ/إلغاء» في شريط القمرة السفليّ (اللوبي)؛ بدونه يرسم زرّيه بنفسه (لوح الأدوات).
 */
export function SeatLockEditor({ onDone, bar }: { onDone: () => void; bar?: boolean }) {
  const { gameState, emit, toast } = useCockpit();
  const roomId = gameState?.roomId;
  const cap = Number(gameState?.config?.maxPlayers) || 0;
  const [map, setMap] = useState<LockMap>(() => readMap(gameState));
  const [rule, setRule] = useState<Rule>(() => readRule(gameState));
  const [brush, setBrush] = useState<Brush>('1');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Pattern[] | null>(null);
  const [naming, setNaming] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    emit('leader:seat-patterns', {}).then((r: any) => { if (alive) setMine(Array.isArray(r?.patterns) ? r.patterns : []); }).catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = lockView(gameState, map);
  const cells = seatCells(gameState);
  const all = Array.from({ length: cap }, (_, i) => i + 1);

  const paint = (chairs: number[], b: Brush) => setMap((prev) => {
    const next = { ...prev };
    const val = brushVal(b);
    for (const c of chairs) { if (val === null) delete next[c]; else next[c] = val; }
    return next;
  });
  const onSeat = (c: SeatCellData) => {
    const val = brushVal(brush);
    // اللمسة الثانية بالفرشاة نفسها تعيده مفتوحاً
    if (val !== null && map[c.seat] === val) paint([c.seat], 'o'); else paint([c.seat], brush);
  };
  const PATTERNS: Array<[string, () => number[]]> = [
    ['الفرديّة', () => all.filter((n) => n % 2 === 1)],
    ['الزوجيّة', () => all.filter((n) => n % 2 === 0)],
    ['كلّ ثالث', () => all.filter((n) => n % 3 === 0)],
    ['النصف الثاني', () => all.filter((n) => n > cap / 2)],
    ['آخر خمسة', () => all.filter((n) => n > cap - 5)],
    ['الفارغة كلّها', () => all.filter((n) => !view.occ.has(n))],
  ];
  const invert = () => setMap((prev) => {
    const next: LockMap = {};
    const val = brushVal(brush) ?? 1;
    for (const n of all) if (prev[n] === undefined) next[n] = val;
    return next;
  });
  /** يوزّع مقاعد الدفعات على k دفعات متباعدة حول الحلقة (الدائم لا يُمسّ) */
  const split = (k: number) => setMap((prev) => {
    const next = { ...prev };
    all.filter((n) => prev[n] !== undefined && prev[n] >= 1).forEach((n, i) => { next[n] = (i % k) + 1; });
    return next;
  });

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r: any = await emit('room:seat-locks', { roomId, op: 'save', map, rule });
      if (r && r.success === false) { toast(r.error || 'تعذّر الحفظ', { tone: 'red' }); return; }
      const n = Object.keys(map).length;
      toast(r?.autoOpened?.length ? `حُفظ — وفُتحت دفعة فوراً (${chairsText(r.autoOpened)}): المفتوح عند العتبة` : n ? `حُفظ: ${n} مغلق` : 'كلّ المقاعد مفتوحة');
      onDone();
    } catch (e: any) { toast(e?.message || 'تعذّر الحفظ', { tone: 'red' }); } finally { setBusy(false); }
  };

  const savePatterns = async (list: Pattern[], msg: string) => {
    try {
      const r: any = await emit('leader:seat-patterns', { save: list });
      if (r && r.success === false) { toast(r.error || 'تعذّر الحفظ', { tone: 'red' }); return; }
      setMine(Array.isArray(r?.patterns) ? r.patterns : list);
      toast(msg);
    } catch (e: any) { toast(e?.message || 'تعذّر الحفظ', { tone: 'red' }); }
  };
  const keepPattern = () => {
    const name = (naming || '').trim();
    if (!name || !mine) return;
    const m: Record<string, number> = {};
    Object.keys(map).forEach((k) => { m[k] = map[Number(k)]; });
    void savePatterns([...mine.filter((p) => p.name !== name), { name, cap, map: m, rule }].slice(-8), `💾 حُفظ النمط «${name}» على حسابك`);
    setNaming(null);
  };
  const usePattern = (p: Pattern) => {
    const next: LockMap = {};
    for (const k of Object.keys(p.map || {})) { const c = Number(k); if (c >= 1 && c <= cap) next[c] = Number(p.map[k]); }
    setMap(next);
    if (p.rule) setRule({ mode: p.rule.mode, threshold: p.rule.threshold });
    toast(`حُمّل «${p.name}»${p.cap !== cap ? ` — حُفظ لـ${p.cap} مقعداً وهذه ${cap}` : ''}. راجِعه ثمّ «تمّ».`);
  };

  const mark = (c: SeatCellData): SeatMark => lockMark(c, map);
  const sub = `${view.closed.length} مغلق · ${view.openFree} مفتوح فارغ`;

  return (
    <>
      {bar && <ActionBar primary={{ label: busy ? '…' : 'تمّ — احفظ الإغلاق', onPress: save, disabled: busy, sub }} secondary={{ label: 'إلغاء', onPress: onDone }} />}

      <section className={GOLD}>
        <h3 className="m-0 text-[15px] font-bold text-[#efe8da]">🔒 إغلاق المقاعد</h3>
        <Hint>اللمسة تجعل المقعد:</Hint>
        <div className="grid grid-flow-col auto-cols-fr gap-1" role="radiogroup" aria-label="اللمسة تجعل المقعد">
          {BRUSHES.map((b) => (
            <button key={b.v} type="button" role="radio" aria-checked={brush === b.v} onClick={() => setBrush(b.v)}
              className={`min-h-[46px] rounded-xl border px-0.5 text-[12.5px] font-bold whitespace-nowrap ${brush === b.v ? 'border-[#C5A059] bg-[#C5A059]/15 text-[#C5A059]' : 'border-[#2a241c] bg-[#16130f] text-[#efe8da]'}`}>{b.l}</button>
          ))}
        </div>
        <Hint>أو طبّقها دفعةً واحدة على:</Hint>
        <Chips>
          {PATTERNS.map(([l, f]) => <TapChip key={l} onClick={() => paint(f(), brush)}>{l}</TapChip>)}
          <TapChip tone="g" onClick={invert}>⇄ اعكس</TapChip>
          <TapChip tone="g" onClick={() => setMap({})}>افتح الكلّ</TapChip>
        </Chips>
      </section>

      <Section title="المس المقاعد" aside={sub}>
        <SeatGrid cells={cells} onSeat={onSeat} mark={mark} faces />
        <Hint>🔒 مغلق دائماً · الرقم الذهبيّ = دفعة تنتظر · المهشَّر لا يُعرض على اللاعب. إغلاق مقعدٍ عليه لاعب يسري حين يفرغ.</Hint>
      </Section>

      <section className={GOLD}>
        <h3 className="m-0 text-[15px] font-bold text-[#efe8da]">متى تُفتح الدفعات؟</h3>
        <Seg<Mode> value={rule.mode} onChange={(mode) => setRule((r) => ({ ...r, mode }))} options={[
          { v: 'auto', l: 'تُفتح وحدها', sub: 'مع تنبيه وتراجع' },
          { v: 'ask', l: 'بإذني', sub: 'أُسأل كلّ مرّة' },
          { v: 'off', l: 'بيدي فقط', sub: 'لا قاعدة' },
        ]} />
        {rule.mode !== 'off' && (
          <SetRow title="افتح حين يبقى" sub="من المقاعد المفتوحة الفارغة">
            <Stepper value={rule.threshold} min={0} max={6} onChange={(threshold) => setRule((r) => ({ ...r, threshold }))} />
          </SetRow>
        )}
        {view.batches.length > 0 ? (
          <SetRow title="وزّع المغلق على دفعات" sub="متباعدة حول الحلقة">
            <div className="flex gap-1.5">{[1, 2, 3].map((k) => <TapChip key={k} on={view.batches.length === k} onClick={() => split(k)} ariaLabel={`${k} دفعات`}>{k}</TapChip>)}</div>
          </SetRow>
        ) : <Hint>لا دفعات بعد. اجعل مقاعد «دفعة 1» لتظهر هنا.</Hint>}
      </section>

      <Section title="💾 أنماطي" aside="على حسابك — في كلّ الغرف">
        {mine === null ? <Hint>تُحمَّل…</Hint> : mine.length === 0 ? <Hint>لا أنماط محفوظة. رتّب الإغلاق كما تريد ثمّ احفظه لتستدعيه بلمسة.</Hint>
          : mine.map((p) => (
            <ListRow key={p.name} n="🔒" title={p.name} sub={`${Object.keys(p.map || {}).length} مغلق · لـ${p.cap} مقعداً`} right={
              <span className="flex gap-1.5">
                <Btn tone="line" onClick={() => usePattern(p)}>استعمل</Btn>
                <Btn onClick={() => void savePatterns(mine.filter((x) => x.name !== p.name), `حُذف «${p.name}»`)} ariaLabel={`احذف ${p.name}`}>✕</Btn>
              </span>} />
          ))}
        {naming === null
          ? <Btn className="w-full" disabled={mine === null || Object.keys(map).length === 0} onClick={() => setNaming('')}>💾 احفظ الإغلاق الحاليّ نمطاً</Btn>
          : (
            <div className="flex gap-2">
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value.slice(0, 30))} placeholder="اسم النمط — مثلاً: فرديّ أوّلاً" className={`${inputCls} flex-1`}
                onKeyDown={(e) => { if (e.key === 'Enter') keepPattern(); }} />
              <Btn tone="gold" disabled={!naming.trim()} onClick={keepPattern}>احفظ</Btn>
              <Btn onClick={() => setNaming(null)}>✕</Btn>
            </div>
          )}
      </Section>

      {!bar && (
        <div className="flex gap-2">
          <Btn tone="gold" className="flex-[2]" disabled={busy} onClick={() => void save()}>{busy ? '…' : 'تمّ — احفظ الإغلاق'}</Btn>
          <Btn className="flex-1" onClick={onDone}>إلغاء</Btn>
        </div>
      )}
    </>
  );
}
