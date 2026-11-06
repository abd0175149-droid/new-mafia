'use client';
// ══════════════════════════════════════════════════════
// 🎛️ قمرة الليدر — الهيكل: شريط الحالة · التنبيه · مسرح المرحلة · شريط الفعل · لوح الأدوات
//
// المرجع: نموذج «قمرة الليدر — النموذج» المعتمد من المالك (2026-11-06).
// 🔴 التنبيه داخل التدفّق تحت الرأس: يدفع المحتوى للأسفل ولا يغطّيه (ملاحظة المالك على النموذج).
// 🔴 الأدوات كلّها هنا — لا أزرار في الرأس ولا أزرار عائمة. ما لا رجعة فيه في «منطقة الخطر» بضغطٍ مطوّل.
// ══════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CockpitCtx, type CockpitApi, type BarAction, type StatusInfo, type ToastOpts, useRun, useCockpit,
  BottomSheet, HoldButton, SeatGrid, seatCells, ListRow, Hint, Chip, Chips, mmss, roleName, teamOf, TEAM_AR,
} from './kit';
import { HostCtx, useHost, type CockpitHost } from './host';
import { useSeatMove } from '../SeatMove';
import ArrivalsPanel from '../ArrivalsPanel';
import PhotoZoneToggle from '../PhotoZonePanel';
import { AntiCheatToggle } from '../AntiCheatWatch';
import { AttendanceMapToggle } from '../AttendanceMap';
import LobbyScreen from './screens/Lobby';
import RolesScreen from './screens/Roles';
import BindingScreen from './screens/Binding';
import NightScreen from './screens/Night';
import RecapScreen from './screens/Recap';
import DayScreen from './screens/Day';
import GameOverScreen from './screens/GameOver';

const PHASE_AR: Record<string, string> = {
  LOBBY: 'اللوبي', ROLE_GENERATION: 'تركيبة الأدوار', ROLE_BINDING: 'ربط الأدوار',
  NIGHT: 'الليل', MORNING_RECAP: 'ملخّص الصباح',
  DAY_DISCUSSION: 'النقاش', DAY_VOTING: 'التصويت', DAY_JUSTIFICATION: 'التبرير',
  DAY_ELIMINATION: 'قرار الإقصاء', DAY_REVEALED: 'الكشف', DAY_TIEBREAKER: 'التعادل', GAME_OVER: 'انتهت اللعبة',
};

interface Props {
  gameState: any;
  setGameState: (fn: (prev: any) => any) => void;
  emit: (event: string, data: any) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => () => void;
  host: CockpitHost;
}

export default function Cockpit({ gameState, setGameState, emit, on, host }: Props) {
  const [bar, setBar] = useState<{ primary?: BarAction; secondary?: BarAction } | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [peek, setPeek] = useState(false);
  const [toastState, setToastState] = useState<{ msg: ReactNode; opts?: ToastOpts; id: number } | null>(null);
  const [sheetRoot, setSheetRoot] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const f = () => setWide(mq.matches);
    f(); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  const toast = useCallback((msg: ReactNode, opts?: ToastOpts) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState({ msg, opts, id: Date.now() });
    toastTimer.current = setTimeout(() => setToastState(null), opts?.ms ?? (opts?.undo ? 6000 : opts?.tone === 'red' ? 5000 : 2600));
  }, []);
  const run = useRun(toast);

  const api: CockpitApi = useMemo(() => ({
    gameState, setGameState, emit, on, toast, run, peek, wide, setBar, setStatus, sheetRoot,
  }), [gameState, setGameState, emit, on, toast, run, peek, wide, sheetRoot]);

  // 🔔 تنبيهٌ جديد في الجرس ⇒ شريطٌ قصير تحت الرأس (لا نافذةً تغطّي الشاشة)
  const lastAlerts = useRef(host.alerts.length);
  const [bellOpen, setBellOpen] = useState(false);
  useEffect(() => {
    if (host.alerts.length > lastAlerts.current) {
      const a = host.alerts[0];
      if (a) toast(
        <span className="flex items-center gap-2.5"><b className="text-[26px] font-extrabold tabular-nums">{a.physicalId}</b>
          <span>{a.name} فتح {a.kind === 'gallery' ? '«التعرّف على المافيا»' : '«مهامّي»'}
            <small className="block text-[#f2a6a9]">{a.role ? `${roleName(a.role)} · ${a.teamAr || ''}` : ''}{a.wasDead ? ' · مُقصى' : ''} · دخل الجرس</small></span></span>,
        { tone: 'red', ms: 4200 },
      );
    }
    lastAlerts.current = host.alerts.length;
  }, [host.alerts, toast]);

  const phase: string = gameState?.phase || 'LOBBY';
  const inGame = !['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING'].includes(phase);
  const round = gameState?.round || 0;
  const phaseName = (phase === 'NIGHT' || phase.startsWith('DAY_')) && round ? `${PHASE_AR[phase] || phase} · الجولة ${round}` : (PHASE_AR[phase] || phase);
  const clock = status?.clock ?? null;
  const unread = host.alerts.length;

  const screen = (() => {
    switch (phase) {
      case 'LOBBY': return <LobbyScreen />;
      case 'ROLE_GENERATION': return <RolesScreen />;
      case 'ROLE_BINDING': return <BindingScreen />;
      case 'NIGHT': return <NightScreen />;
      case 'MORNING_RECAP': return <RecapScreen />;
      case 'GAME_OVER': return <GameOverScreen />;
      default: return phase.startsWith('DAY_') ? <DayScreen /> : <Hint>مرحلة غير معروفة: {phase}</Hint>;
    }
  })();

  const [toolsOpen, setToolsOpen] = useState(false);
  // ✏️ لوح الأسماء على مستوى القمرة — تفتحه الأدوات أو أيّ شاشة (host.open.rename)
  const [namesOpen, setNamesOpen] = useState(false);
  useEffect(() => {
    const f = () => setNamesOpen(true);
    window.addEventListener('cockpit:open-names', f);
    return () => window.removeEventListener('cockpit:open-names', f);
  }, []);

  return (
    <CockpitCtx.Provider value={api}>
      <HostCtx.Provider value={host}>
        <style>{`
          [data-ctl-hidden="1"] { display: none !important; }
          @keyframes cockpitUp { from { transform: translateY(40px); opacity: .4 } to { transform: none; opacity: 1 } }
          .cockpit-body { overscroll-behavior: contain; }
        `}</style>
        <div dir="rtl" className="fixed inset-0 z-[30] bg-[#050505] text-[#efe8da] flex" style={{ fontFamily: 'Tajawal, system-ui, sans-serif' }}>
          <div ref={setSheetRoot} className="relative flex-1 flex flex-col min-w-0">
            {/* ── شريط الحالة ── */}
            <header className="flex items-center gap-2 px-3 pb-2.5 bg-[#0b0a08] border-b border-[#2a241c]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}>
              <div className="flex-1 min-w-0">
                <b className="block truncate text-[20px] leading-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{phaseName}</b>
                <small className="block truncate text-[12.5px] text-[#9a8f7e]">
                  {status?.meta ?? `${gameState?.config?.gameName || 'الغرفة'} · ${gameState?.roomCode || ''}`}
                </small>
              </div>
              {clock ? (
                <span className={`min-w-[70px] text-center rounded-xl border px-2.5 py-0.5 text-[21px] font-extrabold tabular-nums ${clock.left <= 10 && !clock.paused ? 'text-[#ffc2c4] bg-[#d0474c]/20 border-[#d0474c]/60' : clock.paused ? 'text-[#9a8f7e] bg-[#1a1612] border-[#2a241c]' : 'bg-[#1a1612] border-[#2a241c]'}`}>{mmss(clock.left)}</span>
              ) : host.gameTimer && inGame ? (
                <span title="مؤقّت اللعبة" className={`rounded-xl border px-2 py-0.5 text-[13px] font-bold tabular-nums ${host.gameTimer.expired ? 'text-[#ffc2c4] border-[#d0474c]/60' : 'text-[#9a8f7e] border-[#2a241c]'}`}>⏱ {mmss(host.gameTimer.remaining)}</span>
              ) : null}
              {inGame && phase !== 'GAME_OVER' && (
                <button type="button" aria-label="اضغط مطوّلاً لإظهار الأدوار"
                  onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)} onPointerCancel={() => setPeek(false)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`w-[42px] h-[42px] shrink-0 rounded-xl border grid place-items-center text-lg select-none touch-none ${peek ? 'border-[#C5A059] bg-[#C5A059]/20' : 'border-[#2a241c] bg-[#1a1612]'}`}>👁</button>
              )}
              <button type="button" aria-label="التنبيهات" onClick={() => setBellOpen(true)} className="relative w-[42px] h-[42px] shrink-0 rounded-xl border border-[#2a241c] bg-[#1a1612] grid place-items-center text-lg">
                🔔{unread > 0 && <i className="absolute -top-[5px] -left-[5px] not-italic min-w-[19px] h-[19px] px-[5px] rounded-full bg-[#d0474c] text-white text-[11.5px] font-bold grid place-items-center">{unread}</i>}
              </button>
            </header>

            {/* ── التنبيه: داخل التدفّق، يدفع المحتوى ولا يغطّيه ── */}
            {toastState && (
              <div role="status" key={toastState.id}
                className={`mx-2.5 mt-2 shrink-0 rounded-[14px] border px-3 py-2 flex items-center gap-2.5 text-[14px] ${toastState.opts?.tone === 'red' ? 'bg-[#2a0c0e] border-[#d0474c]/70' : 'bg-[#14201a] border-[#43b27f]/55'}`}>
                <span className="flex-1 min-w-0">{toastState.msg}</span>
                {toastState.opts?.undo && (
                  <button type="button" onClick={() => { toastState.opts?.undo?.(); setToastState(null); }} className="shrink-0 rounded-[10px] border border-white/30 px-3 py-1.5 text-[13px]">↩ تراجع</button>
                )}
                {host.alerts.length > 0 && toastState.opts?.tone === 'red' && !toastState.opts?.undo && (
                  <button type="button" onClick={() => { setToastState(null); setBellOpen(true); }} className="shrink-0 rounded-[10px] border border-white/30 px-3 py-1.5 text-[13px]">الجرس</button>
                )}
              </div>
            )}

            {/* ── مسرح المرحلة ── */}
            <main className="cockpit-body flex-1 overflow-y-auto px-3 pt-2.5 pb-4 flex flex-col gap-2.5">{screen}</main>

            {/* ── شريط الفعل ── */}
            <footer className="flex gap-2 px-3 pt-2.5 bg-[#0b0a08] border-t border-[#2a241c]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
              {!wide && (
                <button type="button" aria-label="الأدوات" onClick={() => setToolsOpen(true)} className="w-14 min-h-[54px] rounded-[15px] border border-[#2a241c] bg-[#1a1612] text-[21px]">☰</button>
              )}
              {bar?.secondary && (
                <button type="button" disabled={bar.secondary.disabled} onClick={() => bar.secondary?.onPress()}
                  className="min-h-[54px] rounded-[15px] border border-[#2a241c] bg-[#1a1612] px-3 text-[14.5px] font-bold disabled:opacity-40">{bar.secondary.label}</button>
              )}
              {bar?.primary && (bar.primary.hold ? (
                <HoldButton onHold={() => bar.primary?.onPress()} disabled={bar.primary.disabled} className="flex-1 min-h-[54px] text-[16px] px-3">
                  {bar.primary.label}{bar.primary.sub && <small className="block text-[11.5px] font-medium opacity-85">{bar.primary.sub}</small>}
                </HoldButton>
              ) : (
                <button type="button" disabled={bar.primary.disabled} onClick={() => bar.primary?.onPress()}
                  className="flex-1 min-h-[54px] rounded-[15px] border border-[#C5A059] bg-[#C5A059] text-[#110d08] text-[16px] font-bold px-3 disabled:opacity-40">
                  {bar.primary.label}{bar.primary.sub && <small className="block text-[11.5px] font-medium">{bar.primary.sub}</small>}
                </button>
              ))}
            </footer>

            <ToolsSheet open={toolsOpen && !wide} onClose={() => setToolsOpen(false)} />
            <AdminRevealSheet />
            <NamesSheet open={namesOpen} onClose={() => setNamesOpen(false)} />
            <BellSheet open={bellOpen} onClose={() => setBellOpen(false)} />
          </div>
          {wide && (
            <aside className="w-[300px] shrink-0 border-s border-[#2a241c] bg-[#0e0c0a] overflow-y-auto p-3 flex flex-col gap-2.5">
              <h3 className="m-0 text-[19px] text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>الأدوات</h3>
              <ToolsGrid onPick={() => {}} />
            </aside>
          )}
        </div>
      </HostCtx.Provider>
    </CockpitCtx.Provider>
  );
}

// ══════════ ⏱ وقت اللعبة ══════════
// كان في الواجهة القديمة وحدها (حادثة 2026-11-06). بلا مؤقّت: الإضافة تشغّله من الآن.
// الإنقاص لا يتجاوز الباقي — إنقاصٌ يُنهي اللعبة فوراً لا يُعرض زرّاً.
function GameTimerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run } = useCockpit();
  const host = useHost();
  const t = host.gameTimer;
  const left = t && !t.expired ? Math.floor(t.remaining) : null;
  const clock = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  const adj = (m: number) => run(() => host.adjustGameTimer(m), m > 0 ? `⏱ +${m} د` : `⏱ ${m} د`);
  const steps = left == null ? [15, 30, 45, 60] : [5, 10];
  return (
    <BottomSheet open={open} title="⏱ وقت اللعبة" onClose={onClose}>
      <div className="rounded-2xl border border-[#2a241c] bg-[#0e0c0a] p-4 text-center">
        {left == null
          ? <p className="m-0 text-[15px] text-[#ddd5c6]">هذه اللعبة بلا مؤقّت. اختر مدّةً تبدأ من الآن — وعند انتهائها تنتهي اللعبة على الوقت.</p>
          : <><span className="block text-[12.5px] text-[#9a8f7e]">الباقي</span><b className="block text-[40px] leading-tight font-extrabold tabular-nums text-white" dir="ltr">{clock(left)}</b></>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {steps.map(m => (
          <button key={`p${m}`} type="button" onClick={() => adj(m)}
            className="min-h-[52px] rounded-[14px] border border-[#43b27f]/55 bg-[#16130f] text-[16px] font-extrabold text-[#99dcba]">{left == null ? `${m} دقيقة` : `+${m} د`}</button>
        ))}
        {left != null && [5, 10].map(m => (
          <button key={`m${m}`} type="button" disabled={left <= m * 60 + 30} onClick={() => adj(-m)}
            className="min-h-[52px] rounded-[14px] border border-[#d0474c]/50 bg-[#16130f] text-[16px] font-extrabold text-[#f2a6a9] disabled:opacity-30">−{m} د</button>
        ))}
      </div>
      {left != null && <p className="m-0 text-[12.5px] text-[#9a8f7e]">الإنقاص معطّل حين يقلّ الباقي عنه — كي لا تنتهي اللعبة بلمسة.</p>}
    </BottomSheet>
  );
}

// ══════════ لوح الأدوات ══════════
type ToolKey = 'names' | 'seats' | 'arrivals' | 'photo' | 'monitor' | 'attendance' | 'penalty' | 'admin' | 'end' | 'close' | 'delete' | 'timer' | null;

function ToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} title="الأدوات" onClose={onClose}>
      <ToolsGrid onPick={onClose} />
    </BottomSheet>
  );
}

function ToolsGrid({ onPick }: { onPick: () => void }) {
  const { gameState, emit, on } = useCockpit();
  const host = useHost();
  const [tool, setTool] = useState<ToolKey>(null);
  const phase = gameState?.phase || 'LOBBY';
  const inGame = !['LOBBY', 'GAME_OVER'].includes(phase);
  const pick = (k: ToolKey) => { setTool(k); };

  const call = (f: () => void) => () => { onPick(); f(); };
  const Tile = ({ icon, label, onClick, badge, danger }: { icon: string; label: string; onClick: () => void; badge?: number; danger?: boolean }) => (
    <button type="button" onClick={onClick}
      className={`relative min-h-[76px] rounded-[15px] border flex flex-col items-center justify-center gap-0.5 text-[13.5px] font-bold ${danger ? 'border-[#d0474c]/50 text-[#f2a6a9] bg-[#16130f]' : 'border-[#2a241c] bg-[#16130f]'}`}>
      <span className="text-[22px]">{icon}</span>{label}
      {!!badge && <i className="absolute top-1.5 left-2 not-italic min-w-[18px] h-[18px] px-1 rounded-full bg-[#d0474c] text-white text-[11px] grid place-items-center">{badge}</i>}
    </button>
  );
  const specCount = (gameState?.spectators || []).filter((s: any) => s.status !== 'admitted').length;
  return (
    <>
      <p className="m-0 text-[12.5px] font-bold text-[#9a8f7e]">اللعب</p>
      <div className="grid grid-cols-3 gap-2">
        <Tile icon="🪑" label="المقاعد" onClick={() => pick('seats')} />
        <Tile icon="🚶" label="الوصول" badge={specCount} onClick={() => pick('arrivals')} />
        <Tile icon="⚖️" label="عقوبة" onClick={() => pick('penalty')} />
        {inGame && <Tile icon="⏱" label="وقت اللعبة" onClick={() => pick('timer')} />}
      </div>
      <p className="m-0 text-[12.5px] font-bold text-[#9a8f7e]">القاعة</p>
      <div className="grid grid-cols-3 gap-2">
        <Tile icon="🕵️" label="المراقبة" badge={host.alerts.length} onClick={() => pick('monitor')} />
        <Tile icon="📵" label="التصوير" onClick={() => pick('photo')} />
        <Tile icon="🗺️" label="الحضور" onClick={() => pick('attendance')} />
        <Tile icon="🎁" label="اختيار رابح" onClick={call(host.open.luckyDraw)} />
        <Tile icon="🎂" label="عيد ميلاد" onClick={call(host.open.birthday)} />
        <Tile icon={host.soundOn ? '🔊' : '🔇'} label={host.soundOn ? 'الصوت يعمل' : 'الصوت مكتوم'} onClick={host.toggleSound} />
        <Tile icon="🎚️" label="المستويات" onClick={call(host.open.mixer)} />
        <Tile icon="⚙️" label="الإعدادات" onClick={call(host.open.settings)} />
        <Tile icon="✏️" label="الأسماء" onClick={call(() => window.dispatchEvent(new CustomEvent('cockpit:open-names')))} />
        {gameState?.config?.mafiaChatEnabled && <Tile icon="💬" label="دردشة المافيا" badge={host.mafiaChatUnread} onClick={call(host.open.mafiaChat)} />}
        {host.reflow && <Tile icon="🗓️" label="الجدولة" onClick={call(host.reflow)} />}
        <Tile icon="↩" label="الواجهة القديمة" onClick={call(host.showClassic)} />
      </div>
      <p className="m-0 text-[12.5px] font-bold text-[#f2a6a9]">منطقة الخطر — كلّها بضغطٍ مطوّل</p>
      <div className="grid grid-cols-3 gap-2">
        {inGame && <Tile icon="⚡" label="إقصاء إداريّ" danger onClick={() => pick('admin')} />}
        {inGame && <Tile icon="⏹" label="إنهاء اللعبة" danger onClick={() => pick('end')} />}
        <Tile icon="🏁" label="إغلاق الفعاليّة" danger onClick={() => pick('close')} />
        <Tile icon="🗑️" label="حذف الغرفة" danger onClick={() => pick('delete')} />
        <Tile icon="🚪" label="لوحة الغرف" onClick={call(host.leave)} />
      </div>

      <SeatsSheet open={tool === 'seats'} onClose={() => setTool(null)} />
      <GameTimerSheet open={tool === 'timer'} onClose={() => setTool(null)} />
      <PenaltySheet open={tool === 'penalty'} onClose={() => setTool(null)} />
      <AdminSheet open={tool === 'admin'} onClose={() => setTool(null)} />
      <ConfirmHoldSheet open={tool === 'end'} onClose={() => setTool(null)} title="إنهاء اللعبة"
        text="تنتهي اللعبة بلا فائز ويعود الجميع للّوبي في مقاعدهم." action="أنهِ اللعبة" onConfirm={host.terminate} />
      <ConfirmHoldSheet open={tool === 'close'} onClose={() => setTool(null)} title="إغلاق الفعاليّة"
        text="تُغلق الغرفة وتُختم الفعاليّة، وتُرسل الفواتير والاستبيانات بعدها." action="أغلق الفعاليّة" onConfirm={host.closeEvent} />
      <ConfirmHoldSheet open={tool === 'delete'} onClose={() => setTool(null)} title="حذف الغرفة"
        text="تُحذف الغرفة نهائيّاً بكلّ ما فيها." action="احذف الغرفة" onConfirm={host.deleteRoom} />
      {/* اللوحات الموجودة — تُفتح من هنا وتُخفى أزرارها */}
      {tool === 'arrivals' && <ArrivalsPanel roomId={gameState.roomId} gameState={gameState} emit={emit} on={on} ctlOpen onCtlClose={() => setTool(null)} />}
      {tool === 'photo' && <PhotoZoneToggle gameState={gameState} emit={emit} on={on} ctlOpen onCtlClose={() => setTool(null)} />}
      {tool === 'monitor' && <AntiCheatToggle ctlOpen onCtlClose={() => setTool(null)} />}
      {tool === 'attendance' && <AttendanceMapToggle roomId={gameState.roomId} ctlOpen onCtlClose={() => setTool(null)} />}
    </>
  );
}

function ConfirmHoldSheet({ open, onClose, title, text, action, onConfirm }: { open: boolean; onClose: () => void; title: string; text: string; action: string; onConfirm: () => Promise<void> }) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <Hint>{text}</Hint>
      <HoldButton onHold={async () => { onClose(); await onConfirm(); }} className="w-full min-h-[52px]">اضغط مطوّلاً: {action}</HoldButton>
    </BottomSheet>
  );
}

function SeatsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, toast } = useCockpit();
  const sm = useSeatMove();
  const cells = seatCells(gameState);
  return (
    <BottomSheet open={open} title="المقاعد" onClose={() => { sm.cancelMove(); onClose(); }}>
      <Hint>{sm.movingId ? `نقل ${sm.movingId} — المس الوجهة: فارغ = نقل، مشغول = تبديل` : 'المس لاعباً ثمّ مقعده الجديد.'}</Hint>
      <div data-seat-move="1">
        <SeatGrid cells={cells}
          mark={(c) => ({ selected: sm.movingId === c.seat, disabled: sm.busy || (!!c.spectator && !c.player) || (!!c.held && !sm.movingId) })}
          onSeat={(c) => {
            if (sm.movingId) { sm.moveTo(c.seat); return; }
            if (!c.player) { toast(c.held ? 'مقعدٌ محجوز — فكّ حجزه من اللوبي' : 'مقعدٌ فارغ — المس لاعباً أوّلاً'); return; }
            sm.beginMove(c.seat);
          }} />
      </div>
      {sm.movingId && <button type="button" onClick={() => sm.cancelMove()} className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold">إلغاء النقل</button>}
    </BottomSheet>
  );
}

function PenaltySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const [sel, setSel] = useState<number | null>(null);
  const cells = seatCells(gameState).filter(c => c.player);
  const p = sel != null ? (gameState.players || []).find((x: any) => x.physicalId === sel) : null;
  const max = gameState?.config?.maxPenalties ?? 3;
  // 🎭 كشف الأدوار من قائمة العقوبات (كما في الواجهة القديمة): يبدأ مخفيّاً مع كلّ فتح،
  //    وكلّ كشفٍ يُوثَّق في سجلّ العمليّات (ui:penalty-role-reveal) مرّةً لكلّ لاعب لكلّ فتح.
  const [reveal, setReveal] = useState(false);
  const loggedRef = useRef<Set<number>>(new Set());
  // 📋 توثيق فتح قائمة العقوبات (كما في الواجهة القديمة — يقرؤه سجلّ العمليّات)
  useEffect(() => {
    if (open) import('@/lib/socket').then((m) => { try { m.getSocket().emit('ui:penalty-menu-open', { roomId: gameState?.roomId }); } catch { /* */ } }).catch(() => {});
    else { setReveal(false); loggedRef.current = new Set(); }
  }, [open, gameState?.roomId]);
  const logReveal = (list: any[]) => {
    const fresh = list.filter((x: any) => x?.role && !loggedRef.current.has(x.physicalId));
    if (!fresh.length) return;
    fresh.forEach((x: any) => loggedRef.current.add(x.physicalId));
    import('@/lib/socket').then((m) => {
      const sk = m.getSocket();
      fresh.forEach((x: any) => { try { sk.emit('ui:penalty-role-reveal', { roomId: gameState?.roomId, physicalId: x.physicalId, role: x.role }); } catch { /* */ } });
    }).catch(() => {});
  };
  const toggleReveal = () => {
    const next = !reveal;
    setReveal(next);
    if (next) logReveal(cells.map(c => c.player));
  };
  const hasRoles = cells.some(c => c.player?.role);
  return (
    <BottomSheet open={open} title={p ? `عقوبة على ${p.physicalId} ${p.name}` : 'عقوبة'} onClose={() => { setSel(null); onClose(); }}>
      {!p ? (
        <>
          <div className="flex items-center gap-2">
            <Hint className="flex-1">المس المقعد. {max} عقوبات = طرد من اللعبة.</Hint>
            {hasRoles && <Chip on={reveal} onClick={toggleReveal}>{reveal ? '🙈 أخفِ الأدوار' : '👁 اكشف الأدوار'}</Chip>}
          </div>
          <SeatGrid cells={cells} showRoles={reveal} onSeat={(c) => { if (c.player?.role) logReveal([c.player]); setSel(c.seat); }} />
        </>
      ) : (
        <>
          <Chips><Chip>الحاليّة {p.penalties || 0}/{max}</Chip>{p.role && <Chip tone="n">🔒 {roleName(p.role)}</Chip>}</Chips>
          {/* لا تراجع عن العقوبة (إلّا «أرجعه» بعد الطرد) — ضغطٌ مطوّل كما في اللوبي */}
          <HoldButton tone="gold" className="w-full min-h-[52px]"
            onHold={async () => { const r = await run(() => emit('leader:record-penalty', { roomId: gameState.roomId, targetPhysicalId: p.physicalId }), `⚠️ سُجّلت عقوبة على ${p.physicalId} ${p.name}`); if (r) { setSel(null); onClose(); } }}>
            اضغط مطوّلاً: سجّل العقوبة
          </HoldButton>
          <button type="button" className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold" onClick={() => setSel(null)}>مقعدٌ آخر</button>
        </>
      )}
    </BottomSheet>
  );
}

function AdminSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState } = useCockpit();
  const host = useHost();
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    if (open) import('@/lib/socket').then((m) => { try { m.getSocket().emit('ui:admin-eliminate-open', { roomId: gameState.roomId }); } catch { /* */ } }).catch(() => {});
  }, [open, gameState?.roomId]);
  const cells = seatCells(gameState).filter(c => c.player && c.player.isAlive !== false);
  const p = sel != null ? (gameState.players || []).find((x: any) => x.physicalId === sel) : null;
  return (
    <BottomSheet open={open} title={p ? `إقصاء ${p.physicalId} ${p.name}؟` : 'إقصاء إداريّ'} onClose={() => { setSel(null); onClose(); }}>
      {!p ? (
        <>
          <Hint>المس مقعد اللاعب. يُقلب كرته على الشاشة ويُسجَّل في سجلّ العمليّات.</Hint>
          <SeatGrid cells={cells} onSeat={(c) => setSel(c.seat)} />
        </>
      ) : (
        <>
          <ListRow n={p.physicalId} title={p.name} sub={p.role ? `🔒 ${roleName(p.role)} · ${TEAM_AR[teamOf(p.role)!]}` : 'لم يُوزَّع دوره'} />
          <HoldButton className="w-full min-h-[52px]" onHold={async () => { setSel(null); onClose(); await host.adminEliminate(p.physicalId); }}>اضغط مطوّلاً: أقصِه الآن</HoldButton>
          <button type="button" className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold" onClick={() => setSel(null)}>مقعدٌ آخر</button>
        </>
      )}
    </BottomSheet>
  );
}

function BellSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const host = useHost();
  const { gameState } = useCockpit();
  const ago = (t: number) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'الآن' : `قبل ${Math.round(s / 60)} د`; };
  return (
    <BottomSheet open={open} title="التنبيهات" onClose={onClose}>
      {host.alerts.length === 0 ? (
        <p className="text-center text-[14px] text-[#9a8f7e] py-4">لا تنبيهات. تصل هنا فتحاتُ «التعرّف على المافيا» و«مهامّي».</p>
      ) : host.alerts.map((a, i) => {
        const p = (gameState?.players || []).find((x: any) => x.physicalId === a.physicalId);
        const canEliminate = !!p?.role && p.isAlive !== false && !['LOBBY', 'GAME_OVER'].includes(gameState?.phase);
        return (
          <ListRow key={a.at + ':' + a.physicalId} n={a.physicalId}
            title={<>{a.name} فتح {a.kind === 'gallery' ? '«التعرّف على المافيا»' : '«مهامّي»'}</>}
            sub={`${a.role ? roleName(a.role) + ' · ' + (a.teamAr || '') : 'قبل التوزيع'}${a.wasDead ? ' · مُقصى' : ''} · ${ago(a.at)}`}
            right={<span className="flex gap-1.5">
              {canEliminate && <HoldButton ariaLabel="اضغط مطوّلاً للإقصاء الإداريّ" className="min-h-[44px] px-3 text-[13px]" onHold={async () => { onClose(); await host.adminEliminate(a.physicalId); }}>⚡ إقصاء</HoldButton>}
              <button type="button" aria-label="تجاهل" onClick={() => host.dismissAlert(i)} className="min-h-[44px] w-11 rounded-[12px] border border-[#2a241c] bg-[#16130f]">✓</button>
            </span>} />
        );
      })}
      {host.alerts.length > 0 && <button type="button" onClick={host.clearAlerts} className="min-h-[44px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold">مسح الكلّ</button>}
      <Hint>تُطفأ هذه التنبيهات من الإعدادات ← المراقبة. السجلّ يبقى في سجلّ العمليّات.</Hint>
    </BottomSheet>
  );
}

function NamesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { gameState, emit, run } = useCockpit();
  const [edit, setEdit] = useState<{ seat: number; name: string } | null>(null);
  const players = (gameState?.players || []).filter((p: any) => !p.seatHeld);
  return (
    <BottomSheet open={open} title={edit ? `اسم المقعد ${edit.seat}` : 'الأسماء'} onClose={() => { setEdit(null); onClose(); }}>
      {edit ? (
        <>
          <label htmlFor="cockpit-rename" className="text-[13px] text-[#9a8f7e]">الاسم كما يظهر على الشاشة</label>
          <input id="cockpit-rename" autoFocus value={edit.name} maxLength={24} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            className="w-full min-h-[48px] rounded-[13px] border border-[#2a241c] bg-[#0b0a08] px-3.5 text-[16px] focus:outline-none focus:border-[#C5A059]" />
          <button type="button" disabled={!edit.name.trim()} className="min-h-[50px] rounded-[13px] bg-[#C5A059] text-[#110d08] font-bold disabled:opacity-40"
            onClick={async () => { const r = await run(() => emit('room:override-player', { roomId: gameState.roomId, physicalId: edit.seat, name: edit.name.trim(), isNew: false }), `صار الاسم «${edit.name.trim()}»`); if (r) setEdit(null); }}>حفظ</button>
          <button type="button" className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold" onClick={() => setEdit(null)}>رجوع</button>
        </>
      ) : players.map((p: any) => (
        <ListRow key={p.physicalId} n={p.physicalId} title={p.name} right={<button type="button" onClick={() => setEdit({ seat: p.physicalId, name: p.name })} className="min-h-[44px] rounded-[12px] border border-[#C5A059]/50 text-[#C5A059] px-3 font-bold">تعديل</button>} />
      ))}
    </BottomSheet>
  );
}

function AdminRevealSheet() {
  const host = useHost();
  const r = host.adminReveal;
  const t = r ? teamOf(r.role) : null;
  const col = t === 'M' ? '#d0474c' : t === 'N' ? '#d9a23a' : '#63afd9';
  return (
    <BottomSheet open={!!r} title="إقصاءٌ إداريّ" onClose={host.dismissAdminReveal}>
      {r && (
        <div className="flex flex-col items-center gap-2 py-2">
          <span className="text-[54px] font-extrabold tabular-nums leading-none">{r.physicalId}</span>
          <span className="text-[22px]" style={{ fontFamily: 'Amiri, serif' }}>{r.name}</span>
          <span className="text-[24px] font-bold" style={{ color: col, fontFamily: 'Amiri, serif' }}>{roleName(r.role)}</span>
          {t && <span className="rounded-full border px-3 py-0.5 text-[13px]" style={{ borderColor: col, color: col }}>{TEAM_AR[t]}</span>}
          <Hint className="text-center">الكرت مكشوفٌ على شاشة القاعة الآن.</Hint>
        </div>
      )}
      <button type="button" onClick={host.dismissAdminReveal} className="min-h-[52px] rounded-[15px] bg-[#C5A059] text-[#110d08] text-[16px] font-bold">أكمِل اللعبة</button>
    </BottomSheet>
  );
}
