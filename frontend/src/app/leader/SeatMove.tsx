'use client';

// ══════════════════════════════════════════════════════════════════════════
// 🪑 نقل/تبادل المقاعد — طبقة موحّدة لكل مراحل اللعب (لوحة الليدر)
//
// العقد مع الخادم (room:move-seat):
//   • { success:true, swapped, occupantName }          → نجاح فوري (بلا مودال)
//   • { success:false, code:'HAZARD_CONFIRM', error }  → تأكيد مضغوط ثم إعادة الإرسال بـ confirmHazard
//   • { success:false, code:'HAZARD_BLOCKED', error }  → رفضٌ غير قابل للتجاوز (قنبلة معلّقة)
// وبعد كل نجاح يصل room:seats-remapped للغرفة كلها ← نرفع remapVersion فتمسح
// كل شاشات الليدر اختياراتها المفهرسة بالمقاعد، ثم تعيد الاشتقاق من game:state-sync.
//
// التفاعل: لمستان بلا كتابة — لمسة ⇄ على المقعد المصدر ثم لمسة على الهدف
// (فارغ = نقل، مشغول = تبديل). الإلغاء: ESC أو لمسة خارج أي عنصر يحمل data-seat-move.
// ══════════════════════════════════════════════════════════════════════════

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * طبقة ثابتة معلّقة على body — ضرورية لأن رؤوس لوحة الليدر تستعمل backdrop-blur،
 * وأيّ مرشِّح يُنشئ «كتلة احتواء» تجعل position:fixed يُقاس من الرأس لا من الشاشة.
 */
function FixedLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<>{children}</>, document.body);
}

export type SeatMoveEmit = (event: string, payload: any) => Promise<any>;
export type SeatMoveOn = (event: string, handler: (...args: any[]) => void) => () => void;

export interface SeatMoveApi {
  /** false خارج المزوّد (مثلاً في كونسول المضيف البعيد) — كل الواجهات تختفي */
  enabled: boolean;
  /** المقعد المصدر أثناء «اختر الوجهة»، أو null في الوضع الخامل */
  movingId: number | null;
  busy: boolean;
  /** يزيد مع كل إعادة ترقيم (محليّة أو واردة) — إشارة تطهير للشاشات */
  remapVersion: number;
  seats: number[];
  emptySeats: number[];
  occupantOf: (seat: number) => any | null;
  beginMove: (physicalId: number) => void;
  cancelMove: () => void;
  moveTo: (toSeat: number) => void;
}

const INERT: SeatMoveApi = {
  enabled: false, movingId: null, busy: false, remapVersion: 0, seats: [], emptySeats: [],
  occupantOf: () => null, beginMove: () => { /* لا مزوّد */ }, cancelMove: () => { /* لا مزوّد */ },
  moveTo: () => { /* لا مزوّد */ },
};

const SeatMoveCtx = createContext<SeatMoveApi>(INERT);

/** يُستعمل في أي شاشة ليدر — يعود بقيمة خاملة آمنة إن لم يوجد مزوّد. */
export function useSeatMove(): SeatMoveApi {
  return useContext(SeatMoveCtx);
}

/**
 * جسر للمكوّن الذي يُركّب المزوّد بنفسه (صفحة الليدر) فلا يستطيع استهلاك سياقه
 * الخاص — يلفّ الشبكة ويمرّر الواجهة كـ render-prop.
 */
export function SeatMoveConsumer({ children }: { children: (sm: SeatMoveApi) => ReactNode }) {
  const sm = useSeatMove();
  return <>{children(sm)}</>;
}

type ToastTone = 'ok' | 'blocked' | 'error';
interface ToastState { id: number; text: string; tone: ToastTone; undo?: { from: number; to: number } }
interface HazardPrompt { from: number; to: number; message: string; moverName: string }

/** مقعد «محجوز مؤقتاً» — يشغل الرقم لكنه ليس لاعباً حاضراً (لا يصلح مصدراً ولا وجهة). */
const isHeld = (p: any) => !!p?.seatHeld;

export function SeatMoveProvider({
  roomId, players, maxPlayers, emit, on, children,
}: {
  roomId?: string;
  players: any[];
  maxPlayers?: number;
  emit: SeatMoveEmit;
  on: SeatMoveOn;
  children: ReactNode;
}) {
  const [movingId, setMovingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [remapVersion, setRemapVersion] = useState(0);
  const [hazard, setHazard] = useState<HazardPrompt | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const busyRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bySeat = useMemo(() => {
    const m = new Map<number, any>();
    for (const p of players || []) m.set(Number(p.physicalId), p);
    return m;
  }, [players]);

  const seats = useMemo(() => {
    let count = Number(maxPlayers) || 0;
    for (const p of players || []) count = Math.max(count, Number(p.physicalId) || 0);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [maxPlayers, players]);

  const emptySeats = useMemo(() => seats.filter((s) => !bySeat.has(s)), [seats, bySeat]);
  const occupantOf = useCallback((seat: number) => bySeat.get(seat) || null, [bySeat]);

  const showToast = useCallback((text: string, tone: ToastTone, undo?: { from: number; to: number }) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const next: ToastState = { id: Date.now(), text, tone, undo };
    setToast(next);
    toastTimerRef.current = setTimeout(
      () => setToast((cur) => (cur && cur.id === next.id ? null : cur)),
      undo ? 7000 : 5000,
    );
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // ── التنفيذ الفعلي: لا مودال في الحالة الشائعة، ومسار تأكيد واحد للمخاطر ──
  const runMove = useCallback(async (from: number, to: number, confirmHazard?: boolean) => {
    if (!roomId || busyRef.current) return;
    const moverName = bySeat.get(from)?.name || `#${from}`;
    busyRef.current = true;
    setBusy(true);
    try {
      const res: any = await emit('room:move-seat', {
        roomId, fromPhysicalId: from, toSeat: to,
        ...(confirmHazard ? { confirmHazard: true } : {}),
      });
      setHazard(null);
      setMovingId(null);
      setRemapVersion((v) => v + 1);   // تطهير فوريّ — لا ننتظر البثّ العائد
      showToast(
        res?.swapped
          ? `تبادل «${moverName}» و«${res?.occupantName || `#${to}`}»`
          : `نُقل «${moverName}» من ${from} إلى ${to}`,
        'ok',
        { from: to, to: from },        // التراجع = النقل المعاكس
      );
    } catch (err: any) {
      const r = err?.response;
      if (r?.code === 'HAZARD_CONFIRM') {
        setHazard({ from, to, moverName, message: r.error || 'هناك قرارٌ جارٍ — أكّد التنفيذ' });
      } else if (r?.code === 'HAZARD_BLOCKED') {
        setHazard(null);
        setMovingId(null);
        showToast(r.error || 'تعذّر النقل الآن', 'blocked');
      } else {
        setHazard(null);                // يبقى وضع اختيار الوجهة ليعيد المحاولة بلمسة واحدة
        showToast(err?.message || 'فشل نقل المقعد', 'error');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [roomId, emit, bySeat, showToast]);

  const beginMove = useCallback((physicalId: number) => {
    setHazard(null);
    setMovingId(physicalId);
  }, []);

  const cancelMove = useCallback(() => {
    setMovingId(null);
    setHazard(null);
  }, []);

  const moveTo = useCallback((toSeat: number) => {
    if (movingId === null) return;
    if (movingId === toSeat) { setMovingId(null); return; }   // لمس المصدر نفسه = إلغاء
    void runMove(movingId, toSeat);                            // يُصفَّر داخل runMove عند النجاح
  }, [movingId, runMove]);

  // ── ESC / لمسة خارج واجهة النقل = إلغاء ──
  useEffect(() => {
    if (movingId === null && !hazard) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelMove(); };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('[data-seat-move]')) return;   // داخل واجهة النقل — لا إلغاء
      cancelMove();
      // 🛡️ ابتلاع النقرة التي ألغت: أثناء اللعب تحمل بطاقاتُ اللاعبين أفعالاً حقيقية
      // (كشف دور، اختيار هدف ليل، تسجيل عقوبة). لمسةٌ قصدها «إلغاء وضع النقل» يجب
      // ألّا تُشعل فعلاً جانبياً على البطاقة التي صادف أنها تحتها.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 350);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [movingId, hazard, cancelMove]);

  // ── إشارة الإبطال من الخادم (تصل حتى لو نُقل من جهاز ليدر آخر) ──
  useEffect(() => {
    if (!roomId) return;
    return on('room:seats-remapped', () => {
      setMovingId(null);
      setHazard(null);
      setRemapVersion((v) => v + 1);
    });
  }, [on, roomId]);

  const api = useMemo<SeatMoveApi>(() => ({
    enabled: !!roomId, movingId, busy, remapVersion, seats, emptySeats,
    occupantOf, beginMove, cancelMove, moveTo,
  }), [roomId, movingId, busy, remapVersion, seats, emptySeats, occupantOf, beginMove, cancelMove, moveTo]);

  return (
    <SeatMoveCtx.Provider value={api}>
      {children}

      {/* ── طبقة الرجع: تأكيد المخاطر (مضغوط، لا مودال) ثم شريط النتيجة مع «تراجع» ── */}
      <FixedLayer>
      <AnimatePresence>
        {hazard ? (
          <motion.div
            key="seat-move-hazard"
            data-seat-move="1"
            dir="rtl"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[130] w-[min(94vw,30rem)] rounded-2xl border border-amber-500/50 bg-[#1a1206]/95 backdrop-blur-md shadow-2xl p-4"
          >
            <p className="text-amber-300 text-[13px] font-bold leading-relaxed mb-1">{hazard.message}</p>
            <p className="text-[#9a8f7d] text-[11px] mb-3">
              «{hazard.moverName}» — من <b className="font-mono">{hazard.from}</b> إلى <b className="font-mono">{hazard.to}</b>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { void runMove(hazard.from, hazard.to, true); }}
                className="flex-[2] py-2.5 rounded-xl bg-amber-500/20 border border-amber-500 text-amber-200 text-xs font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-40"
              >
                {busy ? '...' : '⚡ نفّذ الآن'}
              </button>
              <button
                type="button"
                onClick={cancelMove}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        ) : toast ? (
          <motion.div
            key="seat-move-toast"
            data-seat-move="1"
            dir="rtl"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-3 rounded-2xl border backdrop-blur-md shadow-2xl px-4 py-2.5 max-w-[94vw] ${
              toast.tone === 'ok' ? 'bg-[#051520]/95 border-sky-500/50 text-sky-100'
              : toast.tone === 'blocked' ? 'bg-[#1a1206]/95 border-amber-500/50 text-amber-200'
              : 'bg-[#1a0505]/95 border-red-600/50 text-red-200'
            }`}
          >
            <span className="text-[13px] font-bold leading-snug">{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const u = toast.undo!;
                  setToast(null);
                  void runMove(u.from, u.to);
                }}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/70 text-sky-200 text-[11px] font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40"
              >
                ↩ تراجع
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 text-[11px] opacity-50 hover:opacity-100"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </FixedLayer>
    </SeatMoveCtx.Provider>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 🪑 شريط «اختر الوجهة» — المقاعد الفارغة كأهداف (يرافق شبكات الكروت)
// ══════════════════════════════════════════════════════════════════════════
export function SeatMoveTargets({ compact }: { compact?: boolean }) {
  const sm = useSeatMove();
  const mover = sm.movingId === null ? null : sm.occupantOf(sm.movingId);

  return (
    <AnimatePresence>
      {sm.movingId !== null && (
        <motion.div
          data-seat-move="1"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden mb-4"
        >
          <div className={`bg-sky-950/40 border border-sky-500/40 rounded-xl ${compact ? 'p-3' : 'p-4'}`}>
            <div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
              <p className={`text-sky-300 font-bold ${compact ? 'text-[11px]' : 'text-xs'}`}>
                🪑 نقل «{mover?.name}» (#{sm.movingId}) — المس مقعداً فارغاً للنقل، أو بطاقة لاعب للتبديل معه
              </p>
              <button
                onClick={sm.cancelMove}
                className="text-[10px] px-3 py-1 rounded bg-zinc-800 border border-zinc-600 text-zinc-300 hover:bg-zinc-700"
              >
                ✕ إلغاء
              </button>
            </div>
            {sm.emptySeats.length > 0 ? (
              <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
                {sm.emptySeats.map((s) => (
                  <button
                    key={s}
                    disabled={sm.busy}
                    onClick={() => sm.moveTo(s)}
                    className={`rounded-lg border-2 border-dashed border-sky-500/50 text-sky-300 font-mono font-bold hover:bg-sky-500/20 hover:border-sky-400 transition-colors disabled:opacity-40 ${
                      compact ? 'w-10 h-10 text-sm' : 'w-11 h-11'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-500">لا مقاعد فارغة — المس بطاقة لاعب للتبديل معه</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 🪑 شارة النقل على بطاقة لاعب — تجعل **أي** بطاقة مصدراً ووجهةً في آنٍ واحد
// فيصير النقل لمستين في كل المراحل (بلا فتح لوحة أولاً).
//   • خامل        → ⇄ يبدأ النقل من هذا المقعد
//   • أنا المصدر  → ✕ يُلغي
//   • غيري مصدر   → ⇄ يُنفّذ التبديل معي فوراً
// ══════════════════════════════════════════════════════════════════════════
export function SeatMoveChip({ physicalId, className = '' }: { physicalId: number; className?: string }) {
  const sm = useSeatMove();
  if (!sm.enabled) return null;

  const isSource = sm.movingId === physicalId;
  const isTargeting = sm.movingId !== null && !isSource;

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();   // لا نُشغّل فعل البطاقة نفسها (كشف دور/اختيار هدف)
    if (isSource) sm.cancelMove();
    else if (isTargeting) sm.moveTo(physicalId);
    else sm.beginMove(physicalId);
  };

  return (
    <button
      data-seat-move="1"
      onClick={onClick}
      disabled={sm.busy}
      title={isSource ? 'إلغاء النقل' : isTargeting ? `تبديل مع #${physicalId}` : `نقل #${physicalId} لمقعد آخر`}
      className={`shrink-0 rounded-md border text-[11px] leading-none px-1.5 py-1 transition-colors disabled:opacity-40 ${
        isSource
          ? 'bg-sky-500/25 border-sky-400 text-sky-200'
          : isTargeting
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
            : 'bg-zinc-800/70 border-zinc-600/60 text-zinc-400 hover:text-sky-300 hover:border-sky-500/60'
      } ${className}`}
    >
      {isSource ? '✕' : '⇄'}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 🪑 لوحة المقاعد العائمة — متاحة في **كل** المراحل (الطُرق الليلية/النهارية
// لا تعرض شبكة مقاعد كاملة، فهذه اللوحة هي مدخل النقل الموحّد أثناء اللعب).
// لمستان: مقعد مشغول = المصدر، ثم أي مقعد آخر = الوجهة.
// ══════════════════════════════════════════════════════════════════════════
export function SeatMoveBoardToggle({ label = '🪑 المقاعد' }: { label?: string }) {
  const sm = useSeatMove();
  const [open, setOpen] = useState(false);

  // ESC يُغلق اللوحة متى لم تكن هناك عملية نقل جارية (النقل يلتقط ESC أولاً)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && sm.movingId === null) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sm.movingId]);

  if (!sm.enabled) return null;

  return (
    <>
      <button
        type="button"
        data-seat-move="1"
        onClick={() => setOpen((v) => !v)}
        title="نقل/تبادل المقاعد — متاح في كل المراحل"
        className={`text-[10px] font-mono uppercase tracking-[0.15em] transition-colors border px-3 py-1.5 ${
          open || sm.movingId !== null
            ? 'text-sky-300 border-sky-400/70 bg-sky-500/10'
            : 'text-[#C5A059] border-[#C5A059]/30 hover:text-yellow-400 hover:border-[#C5A059]'
        }`}
      >
        {label}
      </button>

      <FixedLayer>
      <AnimatePresence>
        {open && (
          <motion.div
            data-seat-move="1"
            dir="rtl"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="fixed bottom-4 right-4 z-[110] w-[min(92vw,25rem)] rounded-2xl border border-[#C5A059]/30 bg-[#080808]/95 backdrop-blur-md shadow-2xl p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col">
                <span className="text-white text-xs font-bold" style={{ fontFamily: 'Amiri, serif' }}>
                  🪑 نقل / تبادل المقاعد
                </span>
                <span className="text-[9px] text-[#808080] font-mono leading-tight">
                  {sm.movingId === null
                    ? 'المس مقعد اللاعب لبدء النقل'
                    : `اختر الوجهة لـ«${sm.occupantOf(sm.movingId)?.name || `#${sm.movingId}`}» — فارغ = نقل، مشغول = تبديل`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {sm.movingId !== null && (
                  <button
                    type="button"
                    onClick={sm.cancelMove}
                    className="text-[9px] px-2 py-1 rounded bg-zinc-800 border border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                  >
                    ✕ إلغاء
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { sm.cancelMove(); setOpen(false); }}
                  className="w-6 h-6 rounded text-[#808080] hover:text-white text-sm leading-none"
                  aria-label="إغلاق"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 max-h-[46vh] overflow-y-auto pl-1">
              {sm.seats.map((seat) => {
                const occ = sm.occupantOf(seat);
                const held = isHeld(occ);
                const isSource = sm.movingId === seat;
                const picking = sm.movingId !== null;
                // في الوضع الخامل: المصادر هي المقاعد المشغولة الحاضرة فقط.
                // في وضع الوجهة: كل مقعد صالح عدا المحجوز مؤقتاً (لا لاعب خلفه).
                const clickable = picking ? (!held || isSource) : (!!occ && !held);
                return (
                  <button
                    key={seat}
                    type="button"
                    disabled={!clickable || sm.busy}
                    onClick={() => (picking ? sm.moveTo(seat) : sm.beginMove(seat))}
                    title={held ? 'مقعد محجوز مؤقتاً' : occ ? occ.name : 'مقعد فارغ'}
                    className={`h-[52px] rounded-lg border px-1 flex flex-col items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isSource
                        ? 'border-sky-400 bg-sky-500/25 text-sky-100 ring-2 ring-sky-400/60'
                        : picking
                          ? (occ
                              ? 'border-sky-500/60 bg-sky-500/10 text-sky-200 hover:bg-sky-500/25'
                              : 'border-dashed border-sky-500/50 text-sky-300 hover:bg-sky-500/20 hover:border-sky-400')
                          : (occ
                              ? 'border-[#2a2a2a] bg-[#0e0e0e] text-white hover:border-sky-500/60 hover:bg-sky-950/40'
                              : 'border-dashed border-[#2a2a2a] text-[#555]')
                    }`}
                  >
                    <span className="font-mono font-black text-sm leading-none">{seat}</span>
                    <span className="mt-1 w-full truncate text-center text-[9px] leading-tight opacity-90">
                      {held ? '🔒 محجوز' : occ ? occ.name : picking ? 'فارغ' : '—'}
                    </span>
                    {picking && !isSource && occ && !held && (
                      <span className="text-[8px] font-mono text-sky-400/80 leading-none">تبديل</span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </FixedLayer>
    </>
  );
}
