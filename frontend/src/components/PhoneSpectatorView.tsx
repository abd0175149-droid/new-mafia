'use client';

// ══════════════════════════════════════════════════════
// 📱 حلقة كروت اللاعب البعيد (بديل شاشة العرض) — وضعان
// ══════════════════════════════════════════════════════
// FOCUS (مكبّر): كارد أمامي كبير يدور لصاحب الدور، الباقي خارج العرض.
// OVERVIEW (مصغّر): كل الكروت موزّعة على حلقة، والضغط يكبّر محليّاً.
// - صاحب الدور من السيرفر: نقاش=currentSpeakerId، تبرير=مؤقّت المتّهم.
// - بين الأدوار (لا متحدّث) → يرجع مصغّر تلقائياً.
// - الإقصاء: يدور للمُقصى → فليب يكشف الدور → يرجع مقلوب رماديّ (بلا إعادة كشف).
// لا يُكشف أي دور حيّ: الـ roster معقّم (role=null)؛ الكشف الوحيد لحظة الإقصاء عبر revealedRoles.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, type Role } from '@/lib/constants';
import { useGameConfig } from '@/hooks/useGameConfig';
import { avatarThumb } from '@/lib/avatar';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

interface PhoneSpectatorViewProps {
  roster: any[];
  physicalId: string;
  gamePhase: string;
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
  initialDiscussionState?: any;
  videoByPid?: Record<number, MediaStreamTrack | null>; // 📷 كاميرات (self + المتحدّث فقط)
  speakingByPid?: Record<number, boolean>;              // 🔊 من يتكلّم صوتياً الآن
  winnerReveal?: { winner: string | null; players: any[] } | null; // 🏁 كشف الفائز + الأدوار على الطاولة
  revealRoles?: boolean;   // 👑 وضع المضيف: تُظهر دور كل لاعب على كارته (الليدر يرى كل شيء)
  hostView?: boolean;      // 👑 وضع المضيف: يخفي شارة «أنت» وتلميحات اللاعب
  lobby?: boolean;         // 🕰️ وضع اللوبي: حلقة انتظار قبل توزيع الأدوار (بلا متحدّث/عدّادات/تفاعل)
  maxPlayers?: number;     // السعة القصوى — لمؤشّر المقاعد في اللوبي
  collapsed?: boolean;     // 🗳️ وضع مطويّ (أثناء التصويت): يبقى المكوّن مركّباً — الرأس ظاهر والمسرح ينطوي بسلاسة
}

const PHASE_LABELS: Record<string, string> = {
  DAY_DISCUSSION: 'نقاش النهار',
  DAY_JUSTIFICATION: 'مرحلة الدفاع',
  DAY_ELIMINATION: 'كشف الإقصاء',
  ELIMINATION_PENDING: 'كشف الإقصاء',
  DAY_TIEBREAKER: 'كسر التعادل',
  NIGHT: 'الليل',
  MORNING_RECAP: 'أحداث الصباح',
  LOBBY: 'غرفة الانتظار',
  ROLE_GENERATION: 'تجهيز الأدوار',
  ROLE_BINDING: 'توزيع الأدوار',
  DAY_VOTING: 'التصويت',
};

function roleMeta(role: string | null | undefined): { text: string; icon: string; mafia: boolean } | null {
  if (!role) return null;
  return {
    text: (ROLE_NAMES as Record<string, string>)[role] || role,
    icon: (ROLE_ICONS as Record<string, string>)[role] || '🎭',
    mafia: (MAFIA_ROLES as string[]).includes(role as Role),
  };
}

function readCounts(tc: any): { cit: number | null; maf: number | null } {
  if (!tc) return { cit: null, maf: null };
  return {
    cit: tc.citizenAlive ?? tc.citizens ?? tc.citizen ?? tc.town ?? null,
    maf: tc.mafiaAlive ?? tc.mafia ?? tc.mafiaCount ?? null,
  };
}

// أقصر مسافة دائريّة بين موقعين على الحلقة
function shortest(i: number, f: number, n: number): number {
  let d = i - f;
  while (d > n / 2) d -= n;
  while (d < -n / 2) d += n;
  return d;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// كارد فيديو (يربط MediaStreamTrack عبر ref)
function VideoTile({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && track) { try { el.srcObject = new MediaStream([track]); } catch { /* noop */ } }
    return () => { if (el) el.srcObject = null; };
  }, [track]);
  return <video ref={ref} autoPlay muted playsInline className="rt-avimg" />;
}

export default function PhoneSpectatorView({ roster, physicalId, gamePhase, on, initialDiscussionState, videoByPid, speakingByPid, winnerReveal, revealRoles, hostView, lobby, maxPlayers, collapsed }: PhoneSpectatorViewProps) {
  const [mode, setMode] = useState<'focus' | 'overview'>('focus');
  const [discussion, setDiscussion] = useState<any>(initialDiscussionState || null);
  const [justTimer, setJustTimer] = useState<{ physicalId: number; timeLimitSeconds: number; startTime: number } | null>(null);
  const [teamCounts, setTeamCounts] = useState<any>(null);
  const [gameTimer, setGameTimer] = useState<{ totalSeconds: number; startedAt: number; expired?: boolean } | null>(null);
  const [revealing, setRevealing] = useState<{ id: number; role: string } | null>(null);
  const [localDead, setLocalDead] = useState<Set<number>>(new Set());
  const [revealedRoles, setRevealedRoles] = useState<Record<number, string>>({}); // 🎭 أدوار مكشوفة تبقى ثابتة على الوجه السريّ (إقصاء/موت خلال اللعبة)
  const [silencedPids, setSilencedPids] = useState<Set<number>>(new Set()); // 🔇 لاعبون مُسكَتون هذا النهار
  const [morningBanner, setMorningBanner] = useState<{ icon: string; text: string; sub?: string } | null>(null); // 🛡️ حدث صباحيّ غير مميت (حماية…)
  const [focusId, setFocusId] = useState<number | null>(initialDiscussionState?.currentSpeakerId ?? null);
  const [tick, setTick] = useState(0);
  // 🎡 العجلة: مؤشّر دوران متّصل (float — يتبع الإصبع أثناء السحب ثم يثبت على أقرب كارد)
  const [rot, setRot] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(360);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startRot: 0, lastX: 0, lastT: 0, vel: 0 });
  const rotRef = useRef(0);
  useEffect(() => { rotRef.current = rot; }, [rot]);

  const revealSeq = useRef(false);

  const players = useMemo(
    () => (Array.isArray(roster) ? [...roster].sort((a, b) => (a.physicalId || 0) - (b.physicalId || 0)) : []),
    [roster],
  );
  const N = players.length;
  const myId = parseInt(physicalId, 10);

  // 🏁 كشف الفائز: خريطة الأدوار من حمولة game:over + وضع الطاولة كاملة
  const gameOver = gamePhase === 'GAME_OVER' && !!winnerReveal;
  const roleByPid = useMemo(() => {
    const m: Record<number, string> = {};
    (winnerReveal?.players || []).forEach((p: any) => { if (p?.physicalId != null && p.role) m[p.physicalId] = p.role; });
    return m;
  }, [winnerReveal]);
  const { getCardForRole } = useGameConfig();
  // 🏁 نهاية اللعبة: تُركَّب الكروت غير مقلوبة ثم تُقلَب بعد لحظة (دوران عام→سرّيّ، لا ولادة مقلوبة)
  const [gameOverRevealed, setGameOverRevealed] = useState(false);
  useEffect(() => {
    if (gameOver) {
      setMode('overview');
      setGameOverRevealed(false);
      const t = setTimeout(() => setGameOverRevealed(true), 550);
      return () => clearTimeout(t);
    }
    setGameOverRevealed(false);
  }, [gameOver]);

  // إعادة ضبط الحالة المحليّة عند بدء لعبة جديدة (مراحل ما قبل اللعب) — كي لا يبقى كشف/موت لعبة سابقة
  useEffect(() => {
    if (gamePhase === 'LOBBY' || gamePhase === 'ROLE_GENERATION' || gamePhase === 'ROLE_BINDING') {
      setLocalDead(new Set());
      setRevealedRoles({});
      setSilencedPids(new Set());
    }
  }, [gamePhase]);

  // صاحب الدور من السيرفر: تبرير (مؤقّت المتّهم) أو نقاش (المتحدّث الحالي)
  const serverActiveId = useMemo(() => {
    if (gamePhase === 'DAY_JUSTIFICATION' && justTimer) return justTimer.physicalId;
    if (gamePhase === 'DAY_DISCUSSION' && discussion?.currentSpeakerId != null) return discussion.currentSpeakerId;
    return null;
  }, [gamePhase, justTimer, discussion]);
  const serverActiveRef = useRef(serverActiveId);
  useEffect(() => { serverActiveRef.current = serverActiveId; }, [serverActiveId]);

  // تسلسل كشف الإقصاء: يدور للكارد → فليب للوجه السريّ → يبقى ثابتاً على الدور (رماديّ، ظاهر للجميع)
  const runReveal = useCallback(async (roles: { physicalId: number; role: string }[]) => {
    if (!roles?.length) return;
    revealSeq.current = true;
    for (const r of roles) {
      setMode('focus');
      setFocusId(r.physicalId);
      await sleep(650);
      setRevealing({ id: r.physicalId, role: r.role });
      setRevealedRoles((prev) => ({ ...prev, [r.physicalId]: r.role })); // 🎭 يثبت الدور على الوجه السريّ بعد انتهاء الأنيميشن
      await sleep(2600);
      setRevealing(null); // الكارت يبقى مقلوباً على الدور عبر revealedRoles، لا يرجع للوجه العام
      setLocalDead((prev) => new Set(prev).add(r.physicalId));
      await sleep(350);
    }
    revealSeq.current = false;
    // بعد الكشف نبقى في المكبَّر (الافتراضي الجديد) — وإن كان ثمة متحدّث نعود إليه
    if (serverActiveRef.current != null) setFocusId(serverActiveRef.current);
  }, []);

  // اشتراكات السيرفر
  useEffect(() => {
    const subs = [
      on('day:discussion-updated', (d: any) => setDiscussion(d?.discussionState ?? null)),
      on('game:phase-changed', (d: any) => {
        if (d?.teamCounts) setTeamCounts(d.teamCounts);
        if (d?.phase && d.phase !== 'DAY_DISCUSSION') setDiscussion(null);
        if (d?.phase !== 'DAY_JUSTIFICATION') setJustTimer(null);
        // الإسكات يدوم نهاراً واحداً → يُصفَّر مع دخول الليل؛ وبانر الصباح مؤقّت
        if (d?.phase === 'NIGHT') setSilencedPids(new Set());
        setMorningBanner(null);
      }),
      on('day:elimination-revealed', (d: any) => {
        if (d?.teamCounts) setTeamCounts(d.teamCounts);
        if (Array.isArray(d?.revealedRoles) && d.revealedRoles.length) runReveal(d.revealedRoles);
      }),
      // 🔇 إشارة إسكات: لاعب مُسكَت جاء دوره — تظهر عليه علامة (بلا كشف دوره)
      on('day:show-silenced', (d: any) => {
        if (d?.physicalId != null) setSilencedPids((prev) => new Set(prev).add(d.physicalId));
      }),
      on('game:timer-adjusted', (d: any) => { if (d?.gameTimer) setGameTimer(d.gameTimer); }),
      on('game:started', (d: any) => { if (d?.gameTimer) setGameTimer(d.gameTimer); }),
      on('day:justification-timer-started', (d: any) =>
        setJustTimer({ physicalId: d.physicalId, timeLimitSeconds: d.timeLimitSeconds || 30, startTime: d.startTime || Date.now() }),
      ),
      on('day:justification-timer-stopped', () => setJustTimer(null)),
      // حدث صباحيّ (قائمة سلبيّة آمنة): الحجب/الحماية بانر؛ السرّية/التحوّل تُتجاهَل (منعاً لتسريب الدور)؛
      // ما عداها = موت → إن عُرف الدور نقلب ونكشف وإلّا نتركه للروستر ليُجمّده. هكذا يشمل كلّ القتل (ثابت/ديناميكي/شرطية/توأم).
      on('display:morning-event', (d: any) => {
        const type: string = d?.type || '';
        const pid = d?.targetPhysicalId;
        if (pid == null) return;
        if (type === 'ASSASSINATION_BLOCKED' || type === 'ASSASSIN_BLOCKED' || type === 'PROTECTION') {
          setMorningBanner({ icon: '🛡️', text: 'فشل الاغتيال', sub: `نجت الحماية · ${d?.targetName || ''}`.trim() });
          setTimeout(() => setMorningBanner(null), 4500);
          return;
        }
        if (type === 'PROTECTION_FAILED') {
          setMorningBanner({ icon: '⚠️', text: 'لم تنفع الحماية', sub: d?.targetName || '' });
          setTimeout(() => setMorningBanner(null), 4500);
          return;
        }
        // أحداث ليست موتاً (سرّية/تحقيق/إسكات/تعطيل/تحوّل/نتائج) — لا تُعرض على الحلقة
        const NON_DEATH = ['SILENCED', 'SILENCE', 'SHERIFF_RESULT', 'INVESTIGATION', 'ABILITY_DISABLED', 'DISABLE_ABILITY',
          'TRANSFORM', 'TWIN_TRANSFORM', 'ASSASSINATION_ATTEMPT', 'ELIMINATE_ALL', 'SINGLE_WINNER', 'TIE', 'ELIMINATION'];
        if (NON_DEATH.includes(type)) return;
        // موت: اكشف الدور إن وُجد، وإلّا جمّد الكارد (الروستر سيؤكّده خلال ثوانٍ)
        const role = d?.extra?.targetRole || d?.targetRole || d?.role;
        if (role) runReveal([{ physicalId: pid, role }]);
        else setLocalDead((prev) => new Set(prev).add(pid));
      }),
    ];
    return () => subs.forEach((u) => u && u());
  }, [on, runReveal]);

  // الوضع التلقائيّ: صاحب دور → العجلة تدور إليه (المكبَّر هو الافتراضي دائماً؛
  // بين الأدوار لا ننزلق للمصغَّر — المصغَّر خيارٌ يدويّ بالزرّ فقط)
  useEffect(() => {
    if (revealSeq.current) return; // لا نقاطع حركة الكشف
    if (serverActiveId != null) {
      setMode('focus');
      setFocusId(serverActiveId);
    }
  }, [serverActiveId]);

  // 🎯 الافتراضي عند الدخول: كاردي أنا في الصدارة (وللمضيف: أول كارد)
  const didInitFocus = useRef(false);
  useEffect(() => {
    if (didInitFocus.current || !players.length) return;
    didInitFocus.current = true;
    if (focusId == null) {
      const mine = players.find((p) => p.physicalId === myId);
      setFocusId(mine ? myId : players[0].physicalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length]);

  // 🎡 مزامنة العجلة مع الهدف: دوران بأقصر مسار (transition الكارد يتولّى النعومة)
  useEffect(() => {
    if (focusId == null || !players.length) return;
    const idx = players.findIndex((p) => p.physicalId === focusId);
    if (idx < 0) return;
    setRot((r) => r + shortest(idx, ((r % players.length) + players.length) % players.length, players.length));
  }, [focusId, players]);

  // 📏 قياس عرض المسرح (نصفا قطرَي حلقة المصغَّر يُحسبان منه — لا قصّ على أي شاشة)
  useLayoutEffect(() => {
    const measure = () => { if (stageRef.current) setStageW(stageRef.current.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // مؤقّت العدّاد (تبرير أو نقاش). base = الوقت المتبقّي عند startTime؛ ونطرح المنقضي فقط أثناء التحدّث.
  // نستعمل timeRemaining (يحدّثه السيرفر مع كل تعديل +/-) وليس timeLimitSeconds الثابت — كي تنعكس تعديلات الليدر.
  const activeTimer: { physicalId: number; base: number; startTime: number | null } | null =
    justTimer && gamePhase === 'DAY_JUSTIFICATION'
      ? { physicalId: justTimer.physicalId, base: justTimer.timeLimitSeconds, startTime: justTimer.startTime }
      : gamePhase === 'DAY_DISCUSSION' && discussion?.currentSpeakerId != null
      ? {
          physicalId: discussion.currentSpeakerId,
          base: typeof discussion.timeRemaining === 'number' ? discussion.timeRemaining : discussion.timeLimitSeconds ?? 0,
          startTime: discussion.startTime ?? null,
        }
      : null;
  useEffect(() => {
    if (!activeTimer?.startTime) return; // نعدّ فقط أثناء التحدّث الفعليّ (paused → startTime=null)
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [activeTimer?.physicalId, activeTimer?.startTime]);

  // مؤقّت اللعبة العامّ (يظهر في الشريط العلويّ)
  useEffect(() => {
    if (!gameTimer || gameTimer.expired || !gameTimer.startedAt) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [gameTimer]);
  const gameClock = (() => {
    void tick;
    if (!gameTimer || gameTimer.totalSeconds == null) return null;
    const rem = gameTimer.startedAt
      ? Math.max(0, Math.round(gameTimer.totalSeconds - (Date.now() - gameTimer.startedAt) / 1000))
      : gameTimer.totalSeconds;
    return `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
  })();

  const remainingFor = (id: number): number | null => {
    void tick;
    if (!activeTimer || activeTimer.physicalId !== id) return null;
    if (activeTimer.startTime) {
      return Math.max(0, Math.round(activeTimer.base - (Date.now() - activeTimer.startTime) / 1000));
    }
    return Math.max(0, Math.round(activeTimer.base));
  };

  // تفاعل محلّي
  const onTapCard = (id: number) => {
    if (dragRef.current.moved) return;               // سحبٌ لا نقرة
    if (mode === 'overview') {
      setFocusId(id);                                 // نقرة قطعة مقعد → تكبير فوري
      setMode('focus');
    } else if (focusId !== id) {
      setFocusId(id);                                 // نقرة كارد جانبي → العجلة تدور إليه
    }
  };
  const toggleMode = () => {
    setMode((m) => {
      const next = m === 'focus' ? 'overview' : 'focus';
      if (next === 'focus') setRot((r) => Math.round(r));
      return next;
    });
  };
  const backToSpeaker = () => {
    if (serverActiveId != null) { setFocusId(serverActiveId); setMode('focus'); }
  };

  // 🎡 سحب = تدوير العجلة (وضع المكبَّر فقط): تتبع الإصبع، وعند الإفلات زخمٌ خفيف وتثبيت على أقرب كارد
  const clientX = (e: any) => (e.touches ? e.touches[0]?.clientX : e.clientX) ?? 0;
  const dragStart = (e: any) => {
    if (mode !== 'focus' || collapsed || revealSeq.current || N < 2) return;
    const d = dragRef.current;
    d.active = true; d.moved = false;
    d.startX = d.lastX = clientX(e);
    d.startRot = rotRef.current;
    d.lastT = performance.now(); d.vel = 0;
  };
  const dragMove = (e: any) => {
    const d = dragRef.current;
    if (!d.active) return;
    const x = clientX(e);
    const dx = x - d.startX;
    if (Math.abs(dx) > 6 && !d.moved) { d.moved = true; setIsDragging(true); }
    const t = performance.now();
    d.vel = (x - d.lastX) / Math.max(1, t - d.lastT);
    d.lastX = x; d.lastT = t;
    if (d.moved) setRot(d.startRot - dx / 150);       // كل ~150px = كارد واحد
  };
  const dragEnd = () => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    if (d.moved) {
      setIsDragging(false);
      const cur = rotRef.current;
      let target = Math.round(cur - d.vel * 5);       // زخم خفيف
      target = Math.max(Math.round(cur) - 2, Math.min(Math.round(cur) + 2, target));
      setRot(target);
      const idx = ((target % N) + N) % N;
      if (players[idx]) setFocusId(players[idx].physicalId);
      setTimeout(() => { d.moved = false; }, 60);     // يمنع «نقرة» تعقب السحب مباشرة
    }
  };
  // إنهاء السحب حتى لو أفلت الإصبع خارج المسرح
  useEffect(() => {
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('touchend', dragEnd);
    return () => { window.removeEventListener('pointerup', dragEnd); window.removeEventListener('touchend', dragEnd); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, players]);

  const aliveCount = players.filter((p) => p.isAlive && !localDead.has(p.physicalId)).length;
  const { cit, maf } = readCounts(teamCounts);
  const speaker = serverActiveId != null ? players.find((p) => p.physicalId === serverActiveId) : null;
  const focusIdx = focusId != null ? players.findIndex((p) => p.physicalId === focusId) : 0;
  const speakerRemaining = serverActiveId != null ? remainingFor(serverActiveId) : null;

  if (!players.length) {
    return (
      <div className="text-center py-8 text-[#808080] text-xs font-mono">
        <div className="w-6 h-6 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-2" />
        جاري تحميل الطاولة…
      </div>
    );
  }

  return (
    <div className={`rt-root rounded-xl border border-[#1a1a1a] bg-[#070707] overflow-hidden mb-3${collapsed ? ' rt-collapsed' : ''}`}>
      <style>{RT_CSS}</style>

      {/* الرأس */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a] bg-[#0a0a0a]/95">
        <div className="text-[#C5A059] font-black text-sm" style={{ fontFamily: 'Amiri, serif' }}>
          {PHASE_LABELS[gamePhase] || gamePhase}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          {!lobby && (
            <>
              {cit != null && <span className="text-blue-400">🛡️ {cit}</span>}
              {maf != null && <span className="text-red-400">🔪 {maf}</span>}
              <span className="text-[#808080]">أحياء {aliveCount}</span>
              {gameClock && <span className="text-white font-black tabular-nums border-r border-[#2a2a2a] pr-3" style={{ fontVariantNumeric: 'tabular-nums' }}>⏱ {gameClock}</span>}
            </>
          )}
          {lobby && (
            <>
              <span className="text-[#808080]" style={{ fontFamily: 'Amiri, serif' }}>مقاعد</span>
              <span className="rt-fill">{N}<span className="rt-fill-max">/{maxPlayers ?? N}</span></span>
            </>
          )}
        </div>
      </div>

      {/* شريط المتحدّث */}
      <div className={`rt-speaker ${speaker ? 'on' : ''}`}>
        {speaker && (
          silencedPids.has(speaker.physicalId) ? (
            <span className="rt-pill silenced">
              🔇 <span className="rt-mono">#{speaker.physicalId}</span> {speaker.name} — مُسكَت، لا يمكنه الكلام
            </span>
          ) : (
            <span className="rt-pill">
              🎙️ {gamePhase === 'DAY_JUSTIFICATION' ? 'يُدافع الآن' : 'يتحدّث الآن'}:{' '}
              <span className="rt-mono">#{speaker.physicalId}</span> {speaker.name}
              {speakerRemaining != null && (
                <span className={`rt-mono ${speakerRemaining <= 10 ? 'warn' : ''}`}>· {speakerRemaining}s</span>
              )}
            </span>
          )
        )}
        {/* placeholder بين الأدوار — يثبّت ارتفاع الشريط فلا تقفز الطاولة */}
        {!speaker && !lobby && !gameOver && (
          <span style={{ fontSize: 11, color: '#7a7466', fontFamily: "'JetBrains Mono',monospace" }}>— بانتظار المتحدّث التالي —</span>
        )}
        {/* 🕰️ حالة اللوبي في المكبَّر: في شريط الرأس (لا تطفو فوق الكارد) */}
        {!speaker && lobby && !gameOver && mode === 'focus' && (
          <span className="rt-pill">
            {gamePhase === 'ROLE_GENERATION' || gamePhase === 'ROLE_BINDING'
              ? 'جارٍ توزيع الأدوار… بطاقتك ستصلك خلال لحظات'
              : 'الطاولة تكتمل — بانتظار المضيف لبدء الجولة'}
          </span>
        )}
      </div>

      {/* الحلقة */}
      <div
        ref={stageRef}
        className={`rt-stage ${mode}${isDragging ? ' dragging' : ''}`}
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onTouchStart={dragStart}
        onTouchMove={dragMove}
      >
        <div className="rt-felt" />
        {morningBanner && !gameOver && (
          <div className="rt-morning">
            <span className="rt-morning-ic">{morningBanner.icon}</span>
            <span className="rt-morning-t">{morningBanner.text}</span>
            {morningBanner.sub && <span className="rt-morning-sub">{morningBanner.sub}</span>}
          </div>
        )}
        {/* لافتة اللوبي: في المصغَّر فقط — وسط الحلقة الفارغ (بلا أيقونة، لا تطفو فوق أي كارد) */}
        {lobby && !gameOver && mode === 'overview' && (
          gamePhase === 'ROLE_GENERATION' || gamePhase === 'ROLE_BINDING' ? (
            <div className="rt-lobby">
              <span className="rt-lobby-t">جارٍ توزيع الأدوار…</span>
              <span className="rt-lobby-sub">بطاقتك ستصلك خلال لحظات</span>
            </div>
          ) : (
            <div className="rt-lobby">
              <span className="rt-lobby-t">الطاولة تكتمل</span>
              <span className="rt-lobby-sub">بانتظار المضيف لبدء الجولة</span>
            </div>
          )
        )}
        {/* لافتة الفائز: في المصغَّر وسط الحلقة — وفي المكبَّر لا تطفو فوق الكارد (الرأس والشبكة يعلنانه) */}
        {gameOver && mode === 'overview' && (
          <div className="rt-winner">
            <span className="rt-winner-ic">{winnerReveal?.winner === 'MAFIA' ? '🩸' : winnerReveal?.winner === 'ASSASSIN' ? '🔪' : winnerReveal?.winner === 'JESTER' ? '🤡' : '⚖️'}</span>
            <span className="rt-winner-t">{winnerReveal?.winner === 'MAFIA' ? 'انتصار المافيا' : winnerReveal?.winner === 'ASSASSIN' ? 'انتصار السفّاح' : winnerReveal?.winner === 'JESTER' ? 'فوز المهرج' : 'تطهير المدينة'}</span>
          </div>
        )}
        <div className="rt-glow" />
        <div className="rt-ring">
          {players.map((p, i) => {
            const isDead = !p.isAlive || localDead.has(p.physicalId);
            const silenced = silencedPids.has(p.physicalId) && !isDead;
            const isSpeaker = serverActiveId != null && p.physicalId === serverActiveId;
            const persistedRole = revealedRoles[p.physicalId] ?? ((!p.isAlive && p.role) ? p.role : null); // 🎭 دور ثبت بعد الكشف — من الحدث أو من روستر الأموات (يصمد للتحديث)
            const revealedRole = gameOver
              ? (roleByPid[p.physicalId] ?? null)
              : (revealing?.id === p.physicalId ? revealing?.role : persistedRole);
            const isFlipped = (gameOver && gameOverRevealed) || revealing?.id === p.physicalId || (!gameOver && persistedRole != null);
            const rm = roleMeta(revealedRole);
            const tpl = revealedRole ? getCardForRole(revealedRole) : null; // 🎴 تصميم الدور الفعليّ (الوجه السرّيّ)
            const tplImg = tpl?.secretFace?.customImageUrl
              ? (tpl.secretFace.customImageUrl.startsWith('http') ? tpl.secretFace.customImageUrl : `${SOCKET_URL}${tpl.secretFace.customImageUrl}`)
              : null;
            const hostRole = revealRoles && !isFlipped ? roleMeta(p.role) : null; // 👑 دور ظاهر للمضيف على وجه الكارت
            const rtimer = remainingFor(p.physicalId);
            const talking = !!speakingByPid?.[p.physicalId];
            // الكاميرا تُعرض على كارد كل لاعب فتح كاميرته (يبثّها للجميع) — قلائل يفتحونها فالأداء آمن
            const vTrack = videoByPid?.[p.physicalId] ?? null;
            let style: CSSProperties;
            const frontIdx = ((Math.round(rot) % N) + N) % N;
            if (mode === 'focus') {
              // 🎡 العجلة المتصلة: o قد يكون كسرياً أثناء السحب — الكروت تتبع الإصبع
              const off = shortest(i, ((rot % N) + N) % N, N);
              const a = Math.abs(off);
              style = {
                transform: `translateX(${off * 150}px) translateZ(${-a * 205}px) rotateY(${-off * 45}deg) rotateZ(${off * 3}deg) scale(${a < 0.5 ? 1 - a * 0.3 : 0.72})`,
                opacity: a > 2.6 ? 0 : a < 0.5 ? 1 : 0.5,
                zIndex: 100 - Math.round(a * 10),
                pointerEvents: a > 2.6 ? 'none' : undefined, // المخفي كلياً لا يسرق الضغط
              };
            } else {
              // 🪙 حلقة «قطع المقاعد»: مقاس ثابت 72×88 ونصفا قطرين من الشاشة — لا تراكب رياضياً
              const denom = lobby ? Math.max(maxPlayers || N, N) : N;
              const Rx = Math.min(stageW / 2 - 36 - 8, 168);
              const Ry = 147;
              const ang = (i / denom) * 2 * Math.PI - Math.PI / 2;
              style = {
                transform: `translate(${Math.cos(ang) * Rx}px, ${Math.sin(ang) * Ry + 4}px)`,
                opacity: 1,
                zIndex: 50 + Math.round(Math.sin(ang) * 10),
              };
            }
            const fallback = p.gender === 'FEMALE' ? '/avatars/female.png' : '/avatars/male.png';
            const tokAv = avatarThumb(p.avatarUrl) || p.avatarUrl || fallback;
            const gRole = gameOver ? roleMeta(roleByPid[p.physicalId] ?? null) : null; // 🏁 دور معلن على القطعة عند النهاية
            return (
              <div
                key={p.physicalId}
                className={`rt-card ${isDead ? 'dead' : ''} ${isFlipped && isDead ? 'revealed' : ''} ${isSpeaker ? 'spot' : ''} ${talking ? 'talking' : ''} ${mode === 'focus' && i === frontIdx && !isDragging ? 'front' : ''}`}
                style={style}
                onClick={() => onTapCard(p.physicalId)}
              >
                {/* 🪙 قطعة المقعد — وجه وضع التصغير (مقاس مدمج بلا تراكب) */}
                <div className="rt-tok">
                  <div className={`rt-tav ${p.gender === 'FEMALE' ? 'gf' : ''} ${gRole ? (gRole.mafia ? 'tm' : 'tc') : ''}`}>
                    <span className="rt-tin">
                      <img src={tokAv} alt="" loading="lazy" decoding="async"
                        onError={(e) => { const el = e.target as HTMLImageElement; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = p.avatarUrl || fallback; } else if (!el.src.endsWith(fallback)) el.src = fallback; }} />
                    </span>
                    <span className={`rt-tnum ${p.gender === 'FEMALE' ? 'gf' : ''}`}>{p.physicalId}</span>
                    {!hostView && p.physicalId === myId && <span className="rt-tyou">أنت</span>}
                    {isDead && <span className="rt-tbadge">💀</span>}
                    {!isDead && silenced && <span className="rt-tbadge sil">🔇</span>}
                    {!isDead && !silenced && talking && <span className="rt-ttalk" />}
                    {gRole && <span className="rt-trole">{gRole.icon}</span>}
                  </div>
                  <span className={`rt-tnm ${isDead ? 'dead' : ''}`}>{gRole ? gRole.text : p.name}</span>
                </div>
                <div className={`rt-inner ${isFlipped ? 'flip' : ''}`}>
                  {/* الوجه الأمامي — مقلوب (بلا دور) */}
                  <div className="rt-face rt-front">
                    <div className={`rt-av ${p.gender === 'FEMALE' ? 'f' : 'm'}`}>
                      {vTrack ? (
                        <VideoTile track={vTrack} />
                      ) : (
                        <img
                          src={p.avatarUrl || fallback}
                          alt={p.name}
                          className="rt-avimg"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { const el = e.target as HTMLImageElement; if (!el.src.endsWith(fallback)) el.src = fallback; else el.style.display = 'none'; }}
                        />
                      )}
                    </div>
                    {talking && <span className="rt-talk" />}
                    <div className={`rt-num ${p.gender === 'FEMALE' ? 'gf' : ''}`}>{p.physicalId}</div>
                    <div className="rt-name">{p.name}</div>
                    {hostRole && <span className="rt-hrole" style={{ color: hostRole.mafia ? '#e07070' : '#7fb4e6' }}>{hostRole.icon} {hostRole.text}</span>}
                    {!hostView && p.physicalId === myId && <span className="rt-you">أنت</span>}
                    {isSpeaker && !isDead && !silenced && gamePhase !== 'DAY_JUSTIFICATION' && <span className="rt-mic">🎙️</span>}
                    {silenced && <span className="rt-silenced" title="مُسكَت — لا يمكنه الكلام">🔇</span>}
                    {rtimer != null && rtimer >= 0 && !silenced && (
                      <span className={`rt-timer ${rtimer <= 10 ? 'warn' : ''}`}>{rtimer}s</span>
                    )}
                    {isDead && <div className="rt-skull">💀</div>}
                  </div>
                  {/* الوجه الخلفي — تصميم الدور الفعليّ (صورة مخصّصة أو تصميم بألوان الدور) */}
                  <div className="rt-face rt-back">
                    {tplImg ? (
                      <img src={tplImg} alt={rm?.text || ''} className="rt-roleimg" />
                    ) : rm ? (
                      <div className="rt-roledesign" style={{ background: tpl?.gradient || undefined, borderColor: tpl?.borderColor || 'transparent' }}>
                        <div className="rt-role-ic">{rm.icon}</div>
                        <div className="rt-role" style={{ color: tpl?.textColor || (rm.mafia ? '#d13636' : '#3f83c4') }}>{rm.text}</div>
                        <div className="rt-role-sub">#{p.physicalId} · {p.name}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {/* 🕰️ مقاعد شاغرة في اللوبي — قطع متقطّعة على حلقة المصغَّر فقط */}
          {mode === 'overview' && lobby && !gameOver && (maxPlayers || 0) > N && Array.from({ length: (maxPlayers || 0) - N }).map((_, k) => {
            const denom = Math.max(maxPlayers || N, N);
            const Rx = Math.min(stageW / 2 - 36 - 8, 168);
            const ang = ((N + k) / denom) * 2 * Math.PI - Math.PI / 2;
            return (
              <div key={`seat-${k}`} className="rt-card rt-seat" style={{
                transform: `translate(${Math.cos(ang) * Rx}px, ${Math.sin(ang) * 147 + 4}px)`,
                zIndex: 45,
              }}>
                <div className="rt-tok on">
                  <div className="rt-tav empty"><span className="rt-tin empty">؟</span></div>
                  <span className="rt-tnm empty">شاغر</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rt-hint">{mode === 'focus' ? 'اسحب لتدوير الحلقة · اضغط كارداً جانبياً للانتقال' : 'اضغط أي مقعد لتكبيره فوراً'}</div>
      </div>

      {/* شريط التحكم — صفّ ثابت أسفل المسرح (لا يتراكب مع البطاقات الأمامية) */}
      <div className="rt-controls">
        <button className="rt-modebtn" onClick={toggleMode}>
          {mode === 'focus' ? '◱ تصغير — عرض الحلقة كاملة' : '⊡ تكبير كاردي'}
        </button>
        {mode === 'focus' && serverActiveId != null && focusId !== serverActiveId && (
          <button className="rt-backbtn" onClick={backToSpeaker}>↺ للمتحدّث</button>
        )}
      </div>
    </div>
  );
}

const RT_CSS = `
.rt-speaker{min-height:38px;display:flex;align-items:center;justify-content:center;padding:8px 10px 2px}
.rt-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(197,160,89,.15);border:1px solid rgba(197,160,89,.4);
  color:#C5A059;border-radius:999px;padding:5px 13px;font-size:12px;font-weight:700}
.rt-pill .rt-mono{font-family:'JetBrains Mono',monospace;font-weight:800}
.rt-pill .rt-mono.warn{color:#d13636}
.rt-stage{position:relative;height:410px;perspective:1000px;perspective-origin:50% 42%;overflow:hidden;transition:perspective-origin .5s}
/* 🗳️ الوضع المطويّ (أثناء التصويت): المسرح والشريط ينطويان بسلاسة، الرأس والإحصاءات تبقى ظاهرة */
.rt-root .rt-stage,.rt-root .rt-controls,.rt-root .rt-speaker{transition:max-height .45s ease,opacity .3s ease,padding .3s ease}
.rt-root .rt-stage{max-height:410px}
.rt-collapsed .rt-stage{max-height:0;opacity:0;pointer-events:none}
.rt-collapsed .rt-controls{max-height:0;opacity:0;padding:0;overflow:hidden;pointer-events:none;border-top:none}
.rt-collapsed .rt-speaker{max-height:0;min-height:0;opacity:0;padding:0;overflow:hidden}
.rt-stage.overview{perspective-origin:50% 30%}
.rt-felt{position:absolute;left:50%;top:57%;width:150%;height:82%;transform:translate(-50%,-50%) rotateX(72deg);
  background:radial-gradient(closest-side,rgba(46,92,49,.30),rgba(14,26,18,.55) 70%,transparent);border-radius:50%;filter:blur(2px);pointer-events:none}
.rt-glow{position:absolute;top:50%;left:50%;width:270px;height:350px;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(197,160,89,.16),transparent);filter:blur(10px);opacity:0;transition:.5s;pointer-events:none}
.rt-stage.focus .rt-glow{opacity:1}
.rt-ring{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.15,.5,.3,.95)}
.rt-stage.overview .rt-ring{transform:rotateX(8deg)}
.rt-card{position:absolute;top:50%;left:50%;width:140px;height:196px;margin:-98px 0 0 -70px;
  transform-style:preserve-3d;transition:transform .55s cubic-bezier(.15,.5,.3,.95),opacity .45s;cursor:pointer}
/* 🎡 أثناء السحب: الكروت تتبع الإصبع بلا تباطؤ */
.rt-stage.dragging .rt-card{transition:opacity .45s}
.rt-stage{touch-action:pan-y;user-select:none;-webkit-user-select:none}
/* الكارد الأمامي في العجلة — تمييز خفيف */
.rt-card.front .rt-front{box-shadow:0 0 0 1px rgba(197,160,89,.55),0 0 26px rgba(197,160,89,.28)}

/* 🪙 قطعة المقعد (وضع التصغير): 72×88 ثابتة — دائرة صورة + شارة رقم + شريحة اسم */
.rt-tok{position:absolute;top:50%;left:50%;width:72px;height:88px;margin:-44px 0 0 -36px;display:flex;flex-direction:column;align-items:center;gap:3px;
  opacity:0;pointer-events:none;transition:opacity .35s}
.rt-stage.overview .rt-tok{opacity:1;pointer-events:auto}
/* !important: كي لا تغلبها قاعدة opacity الخاصة بالأموات على .rt-inner */
.rt-stage.overview .rt-inner{opacity:0 !important;pointer-events:none}
.rt-inner{transition:transform .7s cubic-bezier(.5,.05,.2,1),opacity .35s}
/* اللافتات (لوبي/فائز) تنتقل إلى مركز الحلقة الفارغ في المصغَّر — كوسط طاولة حقيقية */
.rt-lobby,.rt-winner{transition:top .5s cubic-bezier(.4,0,.2,1),transform .5s cubic-bezier(.4,0,.2,1)}
.rt-stage.overview .rt-lobby,.rt-stage.overview .rt-winner{top:50%;transform:translate(-50%,-50%) scale(.92)}
.rt-tav{position:relative;width:56px;height:56px;border-radius:50%;padding:2px;
  background:conic-gradient(from 40deg,#e8cf8f,#8a6d31,#e8cf8f,#8a6d31,#e8cf8f);box-shadow:0 5px 14px rgba(0,0,0,.6)}
.rt-tav.gf{background:conic-gradient(from 40deg,#d8b4fe,#6b21a8,#d8b4fe,#6b21a8,#d8b4fe)}
.rt-tav.tm{background:conic-gradient(from 40deg,#f0a5a0,#8A0303,#f0a5a0,#8A0303,#f0a5a0)}
.rt-tav.tc{background:conic-gradient(from 40deg,#a8cdf0,#1d4f82,#a8cdf0,#1d4f82,#a8cdf0)}
.rt-tav.empty{background:none;padding:0}
.rt-tin{display:flex;width:100%;height:100%;border-radius:50%;overflow:hidden;border:2px solid #0e0a05;background:#241c10}
.rt-tin img{width:100%;height:100%;object-fit:cover}
.rt-tin.empty{align-items:center;justify-content:center;border:1.5px dashed #2f2b24;background:rgba(10,10,10,.4);
  color:#3a352c;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px}
.rt-tnum{position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;border-radius:999px;display:flex;align-items:center;justify-content:center;
  font-family:'JetBrains Mono',monospace;font-weight:800;font-size:10.5px;color:#000;background:#C5A059;border:2px solid #0a0a0a;padding:0 3px;z-index:3}
.rt-tnum.gf{background:#d8b4fe}
.rt-tyou{position:absolute;bottom:-2px;left:-4px;background:#C5A059;color:#000;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:8.5px;border-radius:5px;padding:0.5px 4px;z-index:3}
.rt-tbadge{position:absolute;bottom:-3px;right:-3px;width:19px;height:19px;border-radius:999px;display:flex;align-items:center;justify-content:center;
  font-size:10px;background:rgba(20,10,10,.95);border:1.5px solid #6b2020;z-index:3}
.rt-tbadge.sil{border-color:#7c2d2d;background:#3a1515}
.rt-ttalk{position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:999px;background:#34d399;border:2px solid #0a0a0a;box-shadow:0 0 8px #34d399;animation:rttalk 1s ease-in-out infinite;z-index:3}
.rt-trole{position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);font-size:13px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.9));z-index:3}
.rt-tnm{max-width:72px;font-family:'Amiri',serif;font-weight:700;font-size:11.5px;color:#fff;background:rgba(0,0,0,.72);
  border:1px solid rgba(197,160,89,.22);border-radius:999px;padding:1px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.45}
.rt-tnm.dead{color:#8a8a8a;text-decoration:line-through}
.rt-tnm.empty{color:#4a443a;border-color:#2a2a2a}
/* على القطعة: المتحدّث بهالة نابضة */
.rt-stage.overview .rt-card.spot .rt-tav{box-shadow:0 0 0 2px #C5A059,0 0 18px rgba(197,160,89,.55)}
/* موت القطعة: فلتر على الدائرة لا على القطعة كلها (الاسم يبقى مقروءاً بشطبه) */
.rt-stage.overview .rt-card.dead .rt-tav{filter:grayscale(1) brightness(.6)}
.rt-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .7s cubic-bezier(.5,.05,.2,1)}
.rt-inner.flip{transform:rotateY(180deg)}
.rt-face{position:absolute;inset:0;-webkit-backface-visibility:hidden;backface-visibility:hidden;border-radius:14px;overflow:hidden;
  border:1px solid #2c2620;background:#0a0a0a;box-shadow:0 20px 40px rgba(0,0,0,.6)}
.rt-av{position:absolute;inset:0 0 34% 0;overflow:hidden}
.rt-av::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 10%,rgba(255,240,210,.16),transparent 55%),linear-gradient(180deg,transparent 58%,rgba(0,0,0,.5))}
.rt-av.m{background:radial-gradient(120% 120% at 50% 18%,#6a5a34,#1c1811)}
.rt-av.f{background:radial-gradient(120% 120% at 50% 18%,#5b4a67,#1e1725)}
.rt-avimg{width:100%;height:100%;object-fit:cover}
.rt-num{position:absolute;top:5px;right:7px;z-index:5;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:16px;color:#f0d9a0;
  background:rgba(0,0,0,.68);border:1px solid rgba(197,160,89,.4);border-radius:8px;padding:1px 8px;pointer-events:none;text-shadow:none}
.rt-num.gf{color:#e9d5ff;border-color:rgba(216,180,254,.45)}
.rt-name{position:absolute;bottom:0;left:0;right:0;height:34%;display:flex;align-items:center;justify-content:center;
  background:#000;font-family:'Amiri',serif;font-weight:700;font-size:16px;color:#fff;padding:0 4px;text-align:center;
  overflow:hidden;line-height:1.25}
.rt-hrole{position:absolute;bottom:34%;left:0;right:0;z-index:8;display:flex;align-items:center;justify-content:center;gap:2px;
  background:rgba(0,0,0,.82);font-family:'JetBrains Mono',monospace;font-weight:700;font-size:8.5px;letter-spacing:.02em;padding:2px 3px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid rgba(197,160,89,.25)}
.rt-back{transform:rotateY(180deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;
  background:radial-gradient(120% 120% at 50% 25%,#1a1410,#070605)}
.rt-roleimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rt-roledesign{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:14px;border:1.5px solid transparent}
.rt-role-ic{font-size:34px}
.rt-role{font-family:'Amiri',serif;font-size:18px;font-weight:700;text-align:center;padding:0 6px}
.rt-role-sub{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8578}
.rt-you{position:absolute;top:5px;left:5px;z-index:5;background:#C5A059;color:#000;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:9px;border-radius:5px;padding:1px 4px}
.rt-mic{position:absolute;bottom:36%;left:50%;transform:translateX(-50%);z-index:6;width:24px;height:24px;border-radius:999px;
  background:#C5A059;color:#000;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 5px 14px rgba(197,160,89,.5)}
.rt-timer{position:absolute;top:6px;right:6px;z-index:6;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:12px;
  background:rgba(0,0,0,.72);border:1px solid rgba(197,160,89,.4);color:#C5A059;border-radius:7px;padding:1px 6px}
.rt-timer.warn{color:#d13636;border-color:rgba(209,54,54,.5)}
.rt-skull{position:absolute;inset:0 0 34% 0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);font-size:26px;z-index:4}
.rt-silenced{position:absolute;bottom:36%;left:50%;transform:translateX(-50%);z-index:6;width:24px;height:24px;border-radius:999px;
  background:#7c2d2d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 5px 14px rgba(124,45,45,.6)}
.rt-pill.silenced{background:rgba(124,45,45,.2);border-color:rgba(209,54,54,.5);color:#f0a3a3}
.rt-morning{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;animation:rtwin .5s ease-out;text-align:center}
.rt-morning-ic{font-size:34px;filter:drop-shadow(0 0 16px rgba(63,131,196,.5))}
.rt-morning-t{font-family:'Amiri',serif;font-weight:700;font-size:19px;color:#7fb4e6;text-shadow:0 2px 14px rgba(0,0,0,.85)}
.rt-morning-sub{font-family:'JetBrains Mono',monospace;font-size:10px;color:#cbd5e1;text-shadow:0 1px 8px rgba(0,0,0,.9)}
.rt-lobby{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;animation:rtwin .5s ease-out;text-align:center}
.rt-lobby-t{font-family:'Amiri',serif;font-weight:700;font-size:19px;color:#C5A059;text-shadow:0 2px 14px rgba(0,0,0,.85)}
.rt-lobby-sub{font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a8578;text-shadow:0 1px 8px rgba(0,0,0,.9)}
.rt-fill{direction:ltr;display:inline-flex;align-items:baseline;font-family:'JetBrains Mono',monospace;font-weight:800;color:#C5A059;letter-spacing:.02em;font-variant-numeric:tabular-nums}
.rt-fill-max{color:#6b6255;font-weight:700}
@keyframes rtbreath{50%{opacity:.55;transform:scale(.97)}}
/* 💀 تمييز الأموات متعدد الوسوم: فلتر + حدود قانية + شطب الاسم + شفافية (لا يعتمد اللون وحده) */
.rt-card.dead .rt-face{filter:grayscale(1) brightness(.55);opacity:.62}
.rt-card.dead .rt-face{border-color:#3a1010}
.rt-card.dead .rt-name{text-decoration:line-through;color:#8a8a8a}
/* مُقصىً لكن دوره مكشوف: يبقى الدور واضحاً للجميع (تعتيم خفيف + شارة جمجمة بزاوية الكارت) */
.rt-card.dead.revealed .rt-face{filter:grayscale(.12) brightness(.94);opacity:1}
.rt-card.dead.revealed .rt-back::after{content:"💀";position:absolute;top:5px;left:5px;z-index:8;width:20px;height:20px;
  display:flex;align-items:center;justify-content:center;font-size:11px;border-radius:999px;background:rgba(58,16,16,.9);border:1px solid #6b2020}
.rt-card.spot .rt-front{border-color:#C5A059;box-shadow:0 0 0 1px #C5A059,0 0 30px rgba(197,160,89,.5)}
.rt-talk{position:absolute;bottom:37%;right:8px;z-index:7;width:11px;height:11px;border-radius:999px;background:#34d399;box-shadow:0 0 9px #34d399;animation:rttalk 1s ease-in-out infinite}
@keyframes rttalk{50%{opacity:.35}}
.rt-winner{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;animation:rtwin .6s ease-out}
.rt-winner-ic{font-size:38px;filter:drop-shadow(0 0 20px rgba(197,160,89,.55))}
.rt-winner-t{font-family:'Amiri',serif;font-weight:700;font-size:22px;color:#C5A059;text-shadow:0 2px 14px rgba(0,0,0,.85)}
@keyframes rtwin{from{opacity:0;transform:translateX(-50%) scale(.7)}}
/* شريط التحكم صفٌّ ثابت أسفل المسرح — أهداف لمس ≥44px بلا تراكب مع البطاقات */
.rt-controls{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 10px;border-top:1px solid #1a1a1a;background:#0a0a0a}
.rt-modebtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;flex:1;max-width:240px;
  background:#0f0e0c;border:1px solid #262119;color:#C5A059;border-radius:12px;padding:10px 15px;
  font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:700;cursor:pointer}
.rt-backbtn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;background:#0f0e0c;border:1px solid rgba(63,131,196,.35);
  color:#3f83c4;border-radius:12px;padding:10px 14px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;cursor:pointer}
.rt-hint{position:absolute;bottom:8px;left:0;right:0;z-index:44;text-align:center;font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8578;pointer-events:none}
/* 🕰️ مقعد شاغر في اللوبي */
.rt-seat{pointer-events:none}
.rt-seat-in{width:100%;height:100%;border-radius:14px;border:1.5px dashed #2a2a2a;background:rgba(10,10,10,.4);
  display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:800;color:#2f2b24}
@media (prefers-reduced-motion: reduce){.rt-card,.rt-inner{transition:none}}
`;
