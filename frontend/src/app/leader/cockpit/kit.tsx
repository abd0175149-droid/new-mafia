'use client';
// ══════════════════════════════════════════════════════
// 🧰 عُدّة القمرة — المكوّنات المشتركة لكلّ شاشات الليدر الجديدة
//
// المرجعُ البصريّ: نموذج «قمرة الليدر» المعتمد (2026-11-06). القواعد:
//   • فعلٌ رئيسٌ واحد في شريطٍ سفليٍّ ثابت (ActionBar) — الشاشة تعلن عنه، والهيكل يرسمه.
//   • ما لا رجعة فيه بضغطٍ مطوّل (HoldButton)، والقابل للتراجع بلمسة + «تراجع» في الشريط.
//   • لا نصّ تحت 12px، ولا هدف لمسٍ تحت 44px، وأرقامٌ غربيّة، وعربيّةٌ صريحة.
//   • المقعد هو الوحدة: SeatGrid واحد لكلّ المراحل.
// ══════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Role, ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, NEUTRAL_ROLES } from '@/lib/constants';
import { avatarThumb } from '@/lib/avatar';

// ── الألوان (مطابقة للنموذج) ──
export const C = {
  bg: '#050505', panel: '#0e0c0a', card: '#16130f', line: '#2a241c', text: '#efe8da', mute: '#9a8f7e',
  gold: '#C5A059', mafia: '#d0474c', ok: '#43b27f', warn: '#dba640', sky: '#63afd9', neutral: '#d9a23a',
};

export type Team = 'M' | 'C' | 'N';
export const teamOf = (role?: string | null): Team | null =>
  !role ? null : MAFIA_ROLES.includes(role as Role) ? 'M' : NEUTRAL_ROLES.includes(role as Role) ? 'N' : 'C';
export const roleName = (role?: string | null) => (role ? ROLE_NAMES[role as Role] || role : '—');
export const roleIcon = (role?: string | null) => (role ? ROLE_ICONS[role as Role] || '🎭' : '');
export const TEAM_AR: Record<Team, string> = { M: 'المافيا', C: 'المدينة', N: 'محايد' };
export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, '0')}`;

// ══════════ سياق القمرة ══════════
export interface BarAction {
  label: ReactNode;
  onPress: () => void | Promise<unknown>;
  hold?: boolean;           // ضغطٌ مطوّل ثانيةً — لما لا رجعة فيه
  sub?: ReactNode;          // سطرٌ ثانٍ صغير تحت النصّ
  disabled?: boolean;
}
export interface StatusInfo {
  meta?: ReactNode;
  clock?: { left: number; paused?: boolean } | null;
}
export interface ToastOpts { undo?: () => void; tone?: 'ok' | 'red'; ms?: number }

export interface CockpitApi {
  gameState: any;
  setGameState: (fn: (prev: any) => any) => void;
  emit: (event: string, data: any) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => () => void;
  toast: (msg: ReactNode, opts?: ToastOpts) => void;
  /** يُشغّل الفعل ويُظهر خطأه شريطاً بجانبه — لا أسفل الصفحة */
  run: <T>(fn: () => Promise<T>, okMsg?: ReactNode) => Promise<T | undefined>;
  peek: boolean;
  wide: boolean;
  setBar: (b: { primary?: BarAction; secondary?: BarAction } | null) => void;
  setStatus: (s: StatusInfo | null) => void;
  sheetRoot: HTMLElement | null;
}
export const CockpitCtx = createContext<CockpitApi | null>(null);
export function useCockpit(): CockpitApi {
  const c = useContext(CockpitCtx);
  if (!c) throw new Error('useCockpit خارج القمرة');
  return c;
}

/** الشاشة تعلن فعلها الرئيس والثانويّ — الهيكل يرسمهما في الشريط السفليّ. */
export function ActionBar({ primary, secondary }: { primary?: BarAction; secondary?: BarAction }) {
  const { setBar } = useCockpit();
  // مفتاحٌ نصّيّ يكفي لإعادة الإعلان حين يتغيّر النصّ أو الحالة؛ الدوالّ تُقرأ من المرجع
  const ref = useRef({ primary, secondary });
  ref.current = { primary, secondary };
  const key = [primary && [String(primary.label), primary.hold, primary.disabled, String(primary.sub ?? '')], secondary && [String(secondary.label), secondary.disabled]].join('|');
  useEffect(() => {
    const wrap = (a?: BarAction, k?: 'primary' | 'secondary'): BarAction | undefined => a && ({ ...a, onPress: () => (ref.current as any)[k!]?.onPress() });
    setBar({ primary: wrap(primary, 'primary'), secondary: wrap(secondary, 'secondary') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => setBar(null), [setBar]);
  return null;
}

/** الشاشة تعلن سطر الحالة والعدّاد — الهيكل يرسمهما في الرأس. */
export function Status({ meta, clock }: StatusInfo) {
  const { setStatus } = useCockpit();
  const key = `${typeof meta === 'string' ? meta : ''}|${clock ? Math.ceil(clock.left) + ':' + !!clock.paused : ''}`;
  useEffect(() => { setStatus({ meta, clock }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  useEffect(() => () => setStatus(null), [setStatus]);
  return null;
}

// ══════════ الأزرار ══════════
export function HoldButton({ onHold, children, className = '', ms = 1000, disabled, tone = 'red', ariaLabel }: {
  onHold: () => void; children: ReactNode; className?: string; ms?: number; disabled?: boolean; tone?: 'red' | 'gold'; ariaLabel?: string;
}) {
  const [p, setP] = useState(0);
  const raf = useRef(0); const t0 = useRef(0); const done = useRef(false);
  const { toast } = useCockpit();
  const stop = (released: boolean) => {
    cancelAnimationFrame(raf.current);
    if (released && !done.current && p > 0) toast('اضغط مطوّلاً حتى يمتلئ الزرّ');
    setP(0);
  };
  const start = () => {
    if (disabled) return;
    done.current = false; t0.current = performance.now();
    const step = (now: number) => {
      const v = Math.min(1, (now - t0.current) / ms);
      setP(v);
      if (v >= 1) { done.current = true; setP(0); onHold(); return; }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const bg = tone === 'red' ? 'bg-[#d0474c] border-[#d0474c] text-white' : 'bg-[#C5A059] border-[#C5A059] text-[#110d08]';
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={start}
      onPointerUp={() => stop(true)}
      onPointerLeave={() => stop(false)}
      onPointerCancel={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(); }}
      onKeyUp={() => stop(true)}
      className={`relative overflow-hidden select-none touch-none rounded-[15px] border font-bold disabled:opacity-40 ${bg} ${className}`}
    >
      <span className="absolute inset-0 bg-white/25 origin-right pointer-events-none" style={{ transform: `scaleX(${p})` }} />
      <span className="relative">{children}</span>
    </button>
  );
}

export function Btn({ children, onClick, tone = 'plain', disabled, className = '', ariaLabel }: {
  children: ReactNode; onClick?: () => void; tone?: 'plain' | 'gold' | 'line' | 'red'; disabled?: boolean; className?: string; ariaLabel?: string;
}) {
  const t = tone === 'gold' ? 'bg-[#C5A059] border-[#C5A059] text-[#110d08]'
    : tone === 'line' ? 'bg-transparent border-[#C5A059]/50 text-[#C5A059]'
    : tone === 'red' ? 'bg-[#16130f] border-[#d0474c]/55 text-[#f2a6a9]'
    : 'bg-[#16130f] border-[#2a241c] text-[#efe8da]';
  return (
    <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}
      className={`min-h-[46px] rounded-[13px] border px-[14px] text-[14px] font-bold disabled:opacity-40 ${t} ${className}`}>{children}</button>
  );
}

// ══════════ اللبنات ══════════
export function Section({ title, aside, children, tone }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; tone?: 'red' | 'sky' }) {
  const b = tone === 'red' ? 'border-[#d0474c]/60' : tone === 'sky' ? 'border-[#63afd9]/55' : 'border-[#2a241c]';
  return (
    <section className={`bg-[#0e0c0a] border ${b} rounded-2xl p-3 flex flex-col gap-2.5`}>
      {title && <h3 className="m-0 text-[15px] font-bold flex items-center gap-2 text-[#efe8da]">{title}{aside && <span className="ms-auto text-[13px] font-medium text-[#9a8f7e]">{aside}</span>}</h3>}
      {children}
    </section>
  );
}
export function Hint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-[13px] leading-relaxed text-[#9a8f7e] ${className}`}>{children}</p>;
}
export function Chip({ children, tone, on, onClick, className = '' }: { children: ReactNode; tone?: 'g' | 'm' | 'c' | 'n' | 'ok'; on?: boolean; onClick?: () => void; className?: string }) {
  const t = on ? 'bg-[#C5A059] text-[#110d08] border-[#C5A059] font-bold'
    : tone === 'g' ? 'border-[#C5A059]/60 text-[#C5A059]'
    : tone === 'm' ? 'border-[#d0474c]/60 text-[#f2a6a9]'
    : tone === 'c' ? 'border-[#63afd9]/50 text-[#a9d4ee]'
    : tone === 'n' ? 'border-[#d9a23a]/60 text-[#f0c879]'
    : tone === 'ok' ? 'border-[#43b27f]/55 text-[#99dcba]'
    : 'border-[#2a241c] text-[#ddd5c6]';
  const cls = `text-[13px] px-[11px] py-1.5 rounded-full bg-[#16130f] border leading-snug ${t} ${className}`;
  return onClick ? <button type="button" onClick={onClick} className={`${cls} min-h-[36px]`}>{children}</button> : <span className={cls}>{children}</span>;
}
export function Chips({ children }: { children: ReactNode }) { return <div className="flex flex-wrap gap-1.5">{children}</div>; }

/** ⏳ «لم يُرسل بعد / لم يصوّت بعد» — أرقام المقاعد كبيرةً في أعلى الشاشة، لا نقاطٌ صغيرة تُقرأ بالتدقيق. */
export function PendingSeats({ title, seats, nameOf, doneLabel }: { title: string; seats: number[]; nameOf?: (seat: number) => string; doneLabel: string }) {
  if (!seats.length) return <section className="rounded-2xl border border-[#43b27f]/55 bg-[#43b27f]/[.08] px-3 py-2.5 text-[15px] font-bold text-[#99dcba]">✓ {doneLabel}</section>;
  return (
    <section className="rounded-2xl border border-[#63afd9] bg-[#63afd9]/[.10] p-3 flex flex-col gap-2">
      <h3 className="m-0 text-[15px] font-bold text-[#cfe8f6]">⏳ {title} <span className="tabular-nums">({seats.length})</span></h3>
      <div className="flex flex-wrap gap-1.5">
        {seats.map(n => (
          <span key={n} className="min-w-[44px] rounded-xl border border-[#63afd9]/70 bg-[#0e0c0a] px-2 py-1 text-center">
            <b className="block text-[20px] font-extrabold leading-tight tabular-nums text-white">{n}</b>
            {nameOf && <span className="block max-w-[76px] truncate text-[11px] text-[#a9d4ee]">{nameOf(n)}</span>}
          </span>
        ))}
      </div>
    </section>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, vertical }: {
  value: T; options: Array<{ v: T; l: ReactNode; sub?: ReactNode }>; onChange: (v: T) => void; vertical?: boolean;
}) {
  return (
    <div className={`grid gap-1.5 ${vertical ? 'grid-flow-row' : 'grid-flow-col auto-cols-fr'}`} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)}
          className={`min-h-[46px] rounded-xl border px-1.5 py-1 text-[13.5px] font-bold leading-tight ${o.v === value ? 'border-[#C5A059] bg-[#C5A059]/15 text-[#C5A059]' : 'border-[#2a241c] bg-[#16130f] text-[#efe8da]'}`}>
          {o.l}{o.sub && <small className="block text-[12px] font-medium text-[#9a8f7e]">{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative w-[54px] h-8 rounded-2xl border shrink-0 transition-colors disabled:opacity-40 ${checked ? 'bg-[#43b27f]/35 border-[#43b27f]/70' : 'bg-[#2b251d] border-[#2a241c]'}`}>
      <span className={`absolute top-[3px] w-6 h-6 rounded-xl transition-all ${checked ? 'right-[25px] bg-[#dff5ea]' : 'right-[3px] bg-[#8b8174]'}`} />
    </button>
  );
}
export function Stepper({ value, min, max, step = 1, unit, onChange, disabled }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label="أنقص" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} className="w-11 h-11 rounded-xl border border-[#2a241c] bg-[#16130f] text-lg font-bold disabled:opacity-30">−</button>
      <span className="min-w-[46px] text-center font-extrabold tabular-nums">{value}{unit ? ` ${unit}` : ''}</span>
      <button type="button" aria-label="زد" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} className="w-11 h-11 rounded-xl border border-[#2a241c] bg-[#16130f] text-lg font-bold disabled:opacity-30">+</button>
    </div>
  );
}
export function SetRow({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-[#1d1914] last:border-b-0">
      <div className="flex-1 min-w-0 leading-normal">{title}{sub && <small className="block text-[12.5px] text-[#9a8f7e]">{sub}</small>}</div>
      {children}
    </div>
  );
}
export function ListRow({ n, title, sub, right, onClick, selected, dashed }: {
  n: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; selected?: boolean; dashed?: boolean;
}) {
  const cls = `flex items-center gap-2.5 bg-[#16130f] border rounded-[13px] px-2.5 py-2 min-h-[54px] w-full text-right ${selected ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-[#2a241c]'} ${dashed ? 'border-dashed' : ''}`;
  const inner = (
    <>
      <span className="w-[38px] h-[38px] rounded-[11px] bg-[#231e17] grid place-items-center font-extrabold text-base shrink-0 tabular-nums">{n}</span>
      <span className="flex-1 min-w-0 leading-snug">{title}{sub && <small className="block text-[12.5px] text-[#9a8f7e]">{sub}</small>}</span>
      {right}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}
export function BigTimer({ who, left, state, extra }: { who: ReactNode; left: number; state?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="text-center px-2.5 pt-3.5 pb-3 rounded-[18px] border border-[#2a241c] flex flex-col items-center gap-1"
      style={{ background: 'radial-gradient(circle at 50% 0, rgba(197,160,89,.2), transparent 70%), #0e0c0a' }}>
      {state && <span className="text-[13px] text-[#9a8f7e]">{state}</span>}
      <span className="text-[25px] leading-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{who}</span>
      <span className="text-[62px] font-extrabold leading-none tabular-nums" style={{ color: left <= 10 && left > 0 ? '#ffc2c4' : undefined }}>{mmss(left)}</span>
      {extra}
    </div>
  );
}

// ══════════ اللوح السفليّ ══════════
export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const { sheetRoot } = useCockpit();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open || !sheetRoot) return null;
  return createPortal(
    <div className="absolute inset-0 z-40 flex flex-col justify-end" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <section role="dialog" aria-modal="true" className="relative max-h-[86%] bg-[#100e0b] border-t border-[#2a241c] rounded-t-3xl flex flex-col sm:mx-auto sm:w-[520px] animate-[cockpitUp_.2s_ease]">
        <div className="relative px-4 pt-2.5 pb-2 flex items-center gap-2.5 border-b border-[#1d1914]">
          <span className="absolute top-[7px] left-1/2 -ml-[22px] w-11 h-[5px] rounded bg-[#3a332a]" />
          <h4 className="m-0 mt-2.5 flex-1 text-[21px] leading-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{title}</h4>
          <button type="button" aria-label="إغلاق" onClick={onClose} className="mt-2.5 w-[38px] h-[38px] rounded-[11px] bg-[#16130f] border border-[#2a241c]">✕</button>
        </div>
        <div className="overflow-y-auto px-3.5 pt-3 flex flex-col gap-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>{children}</div>
      </section>
    </div>,
    sheetRoot,
  );
}

// ══════════ شبكة المقاعد — المكوّن الواحد ══════════
export interface SeatMark {
  selected?: boolean; target?: boolean; need?: boolean; ghost?: boolean; dim?: boolean;
  label?: ReactNode;          // بدل الاسم (مثلاً الدور)
  tone?: Team | null;         // لون الدور حين يُعرض
  topLeft?: ReactNode; topRight?: ReactNode;
  dot?: 'ok' | 'off';
  /** انتهى (أرسل/صوّت): إطارٌ أخضر وعلامة ✓ — ونقيضه `need` (أزرق مضيء ⏳) */
  done?: boolean;
  count?: number;             // عدد أصوات
  disabled?: boolean;
}
export interface SeatCellData { seat: number; player: any | null; spectator: any | null; held: any | null }

/** كلُّ المقاعد من 1 إلى السعة (أو آخر مقعدٍ مشغول) مع شاغليها. */
export function seatCells(gameState: any): SeatCellData[] {
  const players: any[] = gameState?.players || [];
  const specs: any[] = gameState?.spectators || [];
  const max = Math.max(Number(gameState?.config?.maxPlayers) || 0, ...players.map(p => Number(p.physicalId) || 0), ...specs.map(s => Number(s.physicalId) || 0));
  const cells: SeatCellData[] = [];
  for (let n = 1; n <= max; n++) {
    const p = players.find(x => Number(x.physicalId) === n) || null;
    const sp = specs.find(x => Number(x.physicalId) === n) || null;
    cells.push({ seat: n, player: p && !p.seatHeld ? p : null, spectator: sp, held: p && p.seatHeld ? p : null });
  }
  return cells;
}

export function SeatGrid({ cells, onSeat, mark, showRoles, faces }: {
  cells: SeatCellData[];
  onSeat?: (c: SeatCellData) => void;
  mark?: (c: SeatCellData) => SeatMark | null | undefined;
  showRoles?: boolean;
  /** 🙂 صورةُ اللاعب على مقعده — لمطابقة الوجه بالرقم من نظرة (اللوبي) */
  faces?: boolean;
}) {
  const { peek, wide } = useCockpit();
  return (
    <div className={`grid gap-[7px] ${wide ? 'grid-cols-6' : 'grid-cols-4'}`}>
      {cells.map((c) => {
        const m = mark?.(c) || {};
        const p = c.player;
        const roleShown = (peek || showRoles) && p?.role;
        const tone = m.tone ?? (roleShown ? teamOf(p.role) : null);
        const base = 'relative rounded-[14px] border flex flex-col items-center justify-center px-0.5 py-[3px] min-h-[64px] aspect-[1/1.04]';
        let st = 'border-[#2a241c] bg-[#16130f]';
        if (!p && !c.held && !c.spectator) st = 'border-dashed border-[#2a241c] bg-transparent text-[#9a8f7e]';
        if (c.held) st = 'border-[#dba640]/60 bg-[#16130f]';
        if (c.spectator && !p) st = 'border-[#63afd9]/40 bg-[#16130f]';
        if (m.done) st = 'border-[#43b27f]/55 bg-[#43b27f]/[.07]';
        if (m.need) st = 'border-[#63afd9] bg-[#63afd9]/[.12] shadow-[0_0_0_2px_rgba(99,175,217,.3)]';
        if (m.target) st = 'border-[#d0474c]/75 bg-[#d0474c]/10';
        if (m.selected) st = 'border-[#C5A059] bg-[#C5A059]/20 shadow-[inset_0_0_0_1px_#C5A059]';
        const dim = m.dim || (p && p.isAlive === false);
        const name = m.label ?? (roleShown ? roleName(p.role) : p ? p.name : c.held ? c.held.name : c.spectator ? c.spectator.name : 'فارغ');
        const nameCls = roleShown || m.label ? 'text-[12px] font-bold' : 'text-[12.5px] text-[#cfc6b6]';
        const toneCls = tone === 'M' ? 'text-[#f2a6a9]' : tone === 'N' ? 'text-[#f0c879]' : tone === 'C' ? 'text-[#a9d4ee]' : '';
        // ⏳ محجوز · 👁 متفرّج · 🔇 مُسكَت · ○ غير متّصل (يلعب بلا هاتف أو انقطع)
        const tl = m.topLeft ?? (c.held ? '⏳' : c.spectator && !p ? '👁' : p?.isSilenced && p.isAlive !== false ? '🔇' : p && p.isConnected === false ? '○' : null);
        const label = `مقعد ${c.seat}${p ? ' — ' + p.name : c.held ? ' — محجوز' : c.spectator ? ' — متفرّج' : ' — فارغ'}`;
        return (
          <button key={c.seat} type="button" aria-label={label} disabled={m.disabled || !onSeat} onClick={() => onSeat?.(c)}
            className={`${base} ${st} ${dim ? 'opacity-30' : ''} ${m.ghost ? 'opacity-45' : ''} disabled:cursor-default`}>
            {faces && p && (() => {
              const src = avatarThumb(p.avatarUrl);
              return src
                ? <img src={src} alt="" loading="lazy" className={`mb-0.5 w-9 h-9 rounded-full object-cover border border-[#2a241c] ${p.isConnected === false || p.frozen ? 'grayscale opacity-60' : ''}`} />
                : <span aria-hidden className="mb-0.5 grid w-9 h-9 place-items-center rounded-full border border-[#2a241c] bg-[#1a1612] text-[13px] text-[#9a8f7e]">{String(p.name || '?').trim().charAt(0)}</span>;
            })()}
            <b className={`${faces && p ? 'text-[17px]' : 'text-[21px]'} font-extrabold leading-none tabular-nums`}>{c.seat}</b>
            <span className={`max-w-full truncate px-0.5 ${nameCls} ${toneCls}`}>{name}</span>
            {(m.topRight ?? (p?.noPhoto ? '📵' : null)) && <span className="absolute top-1 right-[5px] text-[11px] leading-none">{m.topRight ?? '📵'}</span>}
            {tl && <span className="absolute top-1 left-[5px] text-[11px] leading-none">{tl}</span>}
            {!!p?.penalties && <span className="absolute bottom-1 left-[5px] flex gap-0.5">{Array.from({ length: Math.min(5, p.penalties) }).map((_, i) => <i key={i} className="block w-1.5 h-1.5 rounded-full bg-[#dba640]" />)}</span>}
            {m.done ? <span className="mt-0.5 text-[12px] font-extrabold leading-none text-[#6fd3a2]">✓</span>
              : m.need ? <span className="mt-0.5 text-[11px] leading-none">⏳</span>
              : m.dot && <span className={`mt-0.5 w-[7px] h-[7px] rounded-full ${m.dot === 'ok' ? 'bg-[#43b27f]' : 'bg-[#4a4136]'}`} />}
            {!!m.count && <span className="absolute bottom-[3px] right-1 bg-[#d0474c] text-white rounded-lg text-[11.5px] font-extrabold px-[5px] leading-[17px] tabular-nums">{m.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ══════════ الوقت ══════════
/** ثوانٍ متبقّية حتى موعدٍ مطلق (ms) — تتحدّث كلّ ثانية. */
export function useDeadline(deadline: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : 0;
}
/** عدّادٌ محلّيّ يبدأ من `secs` حين يتغيّر `key` (للوقت الذي يحمله الخادم بلا موعدٍ مطلق). */
export function useLocalCountdown(secs: number | null, key: unknown, running = true): number {
  const [left, setLeft] = useState(secs ?? 0);
  const startRef = useRef(Date.now());
  useEffect(() => { setLeft(secs ?? 0); startRef.current = Date.now(); }, [key, secs]);
  useEffect(() => {
    if (!running || secs == null) return;
    const t = setInterval(() => setLeft(Math.max(0, (secs ?? 0) - Math.round((Date.now() - startRef.current) / 1000))), 500);
    return () => clearInterval(t);
  }, [running, secs, key]);
  return left;
}

export function useRun(toast: CockpitApi['toast']) {
  return useCallback(async <T,>(fn: () => Promise<T>, okMsg?: ReactNode): Promise<T | undefined> => {
    try {
      const r: any = await fn();
      if (r && r.success === false) { toast(r.error || 'تعذّر تنفيذ الطلب', { tone: 'red' }); return undefined; }
      if (okMsg) toast(okMsg);
      return r;
    } catch (e: any) {
      toast(e?.message || 'تعذّر تنفيذ الطلب', { tone: 'red' });
      return undefined;
    }
  }, [toast]);
}
