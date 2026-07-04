'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSocket } from '@/hooks/useSocket';
import MafiaCard from '@/components/MafiaCard';
import LeaderDayView from './LeaderDayView';
import LeaderLobbyView from './LeaderLobbyView';
import LeaderRoleConfigurator from './LeaderRoleConfigurator';
import LeaderRoleBinding from './LeaderRoleBinding';
import LeaderNightView from './LeaderNightView';
import { playGameSound, playAmbientSound, stopAmbientSound, stopOneShotSounds, playEliminationSound, playLocalSound, loadSoundMap, reloadSoundMap, setSoundMirror, primeAudio } from '@/lib/soundManager';
import { getSocket } from '@/lib/socket';
import { ROLE_NAMES } from '@/lib/constants';
import { swalConfirm, swalHtmlConfirm, swalToast, swalAlert } from '@/lib/swal';

interface ActiveGame {
  roomId: string;
  roomCode: string;
  gameName: string;
  playerCount: number;
  maxPlayers: number;
  displayPin: string;
}

interface VotingState {
  totalVotesCast: number;
  deals: any[];
  candidates: any[];
  hiddenPlayersFromVoting: number[];
  tieBreakerLevel: number;
  playerVotes?: Record<number, number>;
  leaderProxyVotes?: Record<number, number>;
}

interface GameState {
  roomId: string;
  roomCode: string;
  phase: string;
  config: {
    gameName: string;
    maxPlayers: number;
    displayPin: string;
    useDynamicEngine?: boolean;
  };
  players: any[];
  rolesPool?: string[];
  votingState?: VotingState;
  // Night phase
  nightStep?: any;
  nightComplete?: boolean;
  morningEvents?: any[];
  sheriffResult?: any;
  winner?: string;
  pendingWinner?: string | null;
  round?: number;
  // Day phase
  justificationData?: any;
  pendingResolution?: any;
  discussionState?: any;
  withdrawalState?: { count: number; needed: number; total: number; withdrawn?: number[] } | null;
  // Session
  sessionId?: number;
  activityId?: number;
  // 🔪 Assassin
  assassinState?: any;
  // 💣 Bomb
  pendingBomb?: any;
  // 📐 مقاعد القالب (Seat Template) — تُعرض كـ«المقاعد المثبّتة من القالب» في عرض الجلسة
  pinnedSeats?: any[];
  reservedTailSeats?: number;
  doors?: any[];
  doorSeats?: number[];
}

export default function LeaderPage() {
  const router = useRouter();
  const { emit, on, isConnected } = useSocket();

  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [leaderName, setLeaderName] = useState('');

  // Active games
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  // Create game form
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [maxJustifications, setMaxJustifications] = useState(2);
  const [maxPenalties, setMaxPenalties] = useState(3);
  const [penaltyScope, setPenaltyScope] = useState<'game' | 'room'>('room');
  const [displayPin, setDisplayPin] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [availableActivities, setAvailableActivities] = useState<any[]>([]);
  const [nightMode, setNightMode] = useState<'manual' | 'auto'>('manual'); // نمط الليل
  // تتبع Auto Night Progress
  const [autoNightProgress, setAutoNightProgress] = useState<{ total: number; submitted: number; missingPlayers?: {physicalId: number, name: string}[]; choices?: any[] } | null>(null);
  // الخطوة الجاهزة للليدر (Auto Night)
  const [autoNightStep, setAutoNightStep] = useState<{
    roleName: string; role: string; performerName: string; performerPhysicalId: number;
    canSkip: boolean; timeoutSeconds: number; dispatched: boolean;
  } | null>(null);
  const [autoNightApproval, setAutoNightApproval] = useState<{choices: any[], nextIndex: number} | null>(null);
  const [customNightTimer, setCustomNightTimer] = useState<number | null>(null);

  // Active game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAdminEliminate, setShowAdminEliminate] = useState(false);
  const [showAdminRename, setShowAdminRename] = useState(false);
  const [adminRenameTarget, setAdminRenameTarget] = useState<{physicalId: number; name: string} | null>(null);
  const [adminRevealData, setAdminRevealData] = useState<{physicalId: number; name: string; role: string} | null>(null);
  const [adminRenameLoading, setAdminRenameLoading] = useState(false);

  // Match history — داخل Session View (ألعاب الغرفة الحالية)
  const [sessionMatches, setSessionMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);

  // Dashboard — قائمة الغرف المنتهية (ليس ألعاب فردية)
  const [closedSessions, setClosedSessions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // New game exclude UI
  const [excludedPlayers, setExcludedPlayers] = useState<number[]>([]);
  const [showExcludeUI, setShowExcludeUI] = useState(false);

  // ── مودال تصفير/إبقاء العقوبات عند بدء لعبة جديدة ──
  const [pendingNewGameAction, setPendingNewGameAction] = useState<{
    type: 'new-game-start' | 'new-game-return' | 'reset-to-lobby';
    excludePlayerIds?: number[];
  } | null>(null);

  // ── مؤقت اللعبة ──
  const [gameTimerData, setGameTimerData] = useState<{ totalSeconds: number; startedAt: number; expired: boolean } | null>(null);
  const [gameTimerRemaining, setGameTimerRemaining] = useState<number>(0);
  const lastTimerSoundRef = useRef<number>(0);
  const [showTimerAdjust, setShowTimerAdjust] = useState(false);
  const [pinnedSeatsExpanded, setPinnedSeatsExpanded] = useState(false); // قسم المقاعد المثبّتة — مطويّ افتراضياً

  // ── 🔊 أصوات شاشة الليدر (افتراضي مُفعّل) ──
  const [leaderSoundOn, setLeaderSoundOn] = useState(true);
  const leaderSoundOnRef = useRef(true);
  useEffect(() => { leaderSoundOnRef.current = leaderSoundOn; }, [leaderSoundOn]);
  const lastVoteCountRef = useRef(0);
  // يُشغّل صوت حدث على الليدر (المصدر الحصري) إن لم يكن مكتوماً — ويُبثّ تلقائياً لشاشة العرض
  const localSound = (fn: () => void) => {
    if (!leaderSoundOnRef.current) return;
    try { fn(); } catch {}
  };
  // خريطة صوت «افتتاحية» لكل مرحلة (بخلاف الصوت الخلفي) — يطابق شاشة العرض
  const PHASE_STING: Record<string, string> = {
    NIGHT: 'phase_night_start', DAY_DISCUSSION: 'phase_day_start',
    DAY_VOTING: 'phase_voting_start', DAY_ELIMINATION: 'phase_elimination',
  };
  // 🌅 خريطة صوت كل حدث في ملخّص الليلة (الأوتو) — لحظة كشفه على شاشة العرض
  const MORNING_SOUND_BY_TYPE: Record<string, string> = {
    ASSASSINATION: 'morning_assassination_success',
    ASSASSINATION_BLOCKED: 'morning_protection_success',
    SILENCED: 'morning_silenced',
    SNIPE_MAFIA: 'morning_snipe_mafia',
    SNIPE_CITIZEN: 'morning_snipe_citizen',
    ABILITY_DISABLED: 'morning_ability_disabled',
    ASSASSIN_KILL: 'morning_assassin_kill',
    POLICEWOMAN_EXECUTION: 'morning_policewoman',
  };

  // تحميل خريطة الأصوات المخصّصة + استعادة تفضيل الكتم + فكّ قفل الصوت عند أول تفاعل ──
  useEffect(() => {
    loadSoundMap();
    try {
      const saved = localStorage.getItem('leader-sound-on');
      if (saved === '0') setLeaderSoundOn(false);
    } catch {}
    // فكّ قفل التشغيل التلقائي (Autoplay) عند أول نقرة/لمسة — يُهيّئ السياق الصوتي المشترَك
    const unlock = () => {
      primeAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true } as any);
    window.addEventListener('keydown', unlock, { once: true } as any);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  // ── 🔊 الصوت الخلفي (Ambient) يتبع مرحلة اللعبة محلياً على الليدر ──
  // يُدار محلياً (لا عبر المرآة) لأن الحلقة (loop) حالة مستمرّة تعتمد على مرحلة الليدر الموثوقة،
  // فلا تعلق أبداً حتى لو ضاعت أو تأخّرت إشارة إيقاف من العرض. المؤثّرات اللحظية تبقى عبر المرآة.
  const AMBIENT_BY_PHASE: Record<string, string> = {
    LOBBY: 'ambient_lobby', NIGHT: 'ambient_night', DAY_DISCUSSION: 'ambient_day',
    DAY_VOTING: 'ambient_voting', DAY_JUSTIFICATION: 'ambient_justification',
    DAY_ELIMINATION: 'ambient_elimination', MORNING_RECAP: 'ambient_morning',
  };
  const leaderAmbientKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const phase = gameState?.phase as string | undefined;
    const key = phase ? AMBIENT_BY_PHASE[phase] : undefined;
    if (!leaderSoundOn || !key) {
      if (leaderAmbientKeyRef.current) { stopAmbientSound(); leaderAmbientKeyRef.current = null; }
      return;
    }
    if (leaderAmbientKeyRef.current !== key) {
      playAmbientSound(key);            // يوقف السابق داخلياً ثم يبدأ الجديد
      leaderAmbientKeyRef.current = key;
    }
  }, [gameState?.phase, leaderSoundOn]);
  // إيقاف الصوت الخلفي عند مغادرة صفحة الليدر
  useEffect(() => () => { stopAmbientSound(); }, []);

  // ── ⏱️ صوت مؤقّت جولة النقاش: تكّة بآخر 10 ثوانٍ + جرس عند الانتهاء (نُقل من شاشة العرض) ──
  const discussionPrevTimeRef = useRef<number>(-1);
  useEffect(() => {
    const ds: any = (gameState as any)?.discussionState;
    if (!ds || ds.status !== 'SPEAKING' || ds.startTime == null) { discussionPrevTimeRef.current = -1; return; }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - ds.startTime) / 1000);
      const remaining = Math.max(0, ds.timeRemaining - elapsed);
      if (remaining !== discussionPrevTimeRef.current) {
        if (leaderSoundOnRef.current) {
          if (remaining <= 10 && remaining > 0) playGameSound('timer_tick');
          else if (remaining === 0 && discussionPrevTimeRef.current > 0) playGameSound('timer_buzzer');
        }
        discussionPrevTimeRef.current = remaining;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [(gameState as any)?.discussionState]);

  // ── ⏱️ صوت مؤقّت التبرير: نفس النمط (نُقل من شاشة العرض) ──
  const justifPrevTimeRef = useRef<number>(-1);
  useEffect(() => {
    const jt: any = (gameState as any)?.justificationTimer;
    if (!jt || jt.startTime == null || gameState?.phase !== 'DAY_JUSTIFICATION') { justifPrevTimeRef.current = -1; return; }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - jt.startTime) / 1000);
      const remaining = Math.max(0, jt.timeLimitSeconds - elapsed);
      if (remaining !== justifPrevTimeRef.current) {
        if (leaderSoundOnRef.current) {
          if (remaining <= 10 && remaining > 0) playGameSound('timer_tick');
          else if (remaining === 0 && justifPrevTimeRef.current > 0) playGameSound('timer_buzzer');
        }
        justifPrevTimeRef.current = remaining;
      }
      if (remaining === 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [(gameState as any)?.justificationTimer, gameState?.phase]);

  // ── 🔊 الليدر «القائد» الحصري: يبثّ كل صوت يُشغّله محلياً إلى شاشات العرض ──
  useEffect(() => {
    const roomId = gameState?.roomId;
    if (!roomId) return;
    setSoundMirror((p) => {
      try { getSocket().emit('leader:sound-play', { roomId, fn: p.fn, args: p.args }); } catch {}
    });
    return () => setSoundMirror(null);
  }, [gameState?.roomId]);

  // ── 🕵️ طابور تنبيهات «فتح قائمة التعرف على المافيا» (عرض تسلسلي بترقيم حيّ) ──
  const galleryAlertQueueRef = useRef<any[]>([]);
  const galleryAlertShowingRef = useRef(false);
  const galleryAlertPosRef = useRef(0); // موضع التنبيه المعروض حالياً (1-based؛ 0 = خامل)

  // ── 🎁 سحب «اختيار رابح» (هدايا الفعالية) ──
  const [showLuckyDraw, setShowLuckyDraw] = useState(false);
  const [luckyCount, setLuckyCount] = useState(1);
  const [luckyWinners, setLuckyWinners] = useState<number[] | null>(null); // null = لم يُسحب بعد
  const [luckyRevealed, setLuckyRevealed] = useState(false);
  const [luckyBusy, setLuckyBusy] = useState(false);

  // ── 📊 ملخص نقاط اللعبة (نهاية اللعبة) + التعديل اليدوي لكل لاعب ──
  const [pointsModal, setPointsModal] = useState<any[] | null>(null); // null = مغلق
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsExpanded, setPointsExpanded] = useState<number | null>(null); // matchPlayerId المفتوح
  const [pointsEdit, setPointsEdit] = useState<any | null>(null); // اللاعب الجاري تعديله
  const [editXp, setEditXp] = useState(0);
  const [editRr, setEditRr] = useState(0);
  const [editReason, setEditReason] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Session mode — عرض صفحة الغرفة (Session) بدل اللعبة
  const [inSession, setInSession] = useState(false);
  const [showSessionAddForm, setShowSessionAddForm] = useState(false);
  const [sessionAddForm, setSessionAddForm] = useState<{name: string; physicalId: string; phone: string; gender: string}>({
    name: '', physicalId: '', phone: '', gender: 'MALE',
  });

  // ── حالة تعديل اسم اللاعب (Session View) ──
  const [sessionEditingId, setSessionEditingId] = useState<number | null>(null);
  const [sessionEditName, setSessionEditName] = useState('');
  const [sessionEditLoading, setSessionEditLoading] = useState(false);

  // ── 🪑 وضع نقل المقعد بلمستين في عرض الجلسة (خاضع لقفل السرّ نفسه) ──
  const [sessionMovingId, setSessionMovingId] = useState<number | null>(null);
  const [sessionMoveLoading, setSessionMoveLoading] = useState(false);
  const handleSessionMoveSeat = async (toSeat: number) => {
    if (!gameState?.roomId || sessionMovingId === null || sessionMoveLoading) return;
    setSessionMoveLoading(true);
    try {
      await emit('room:move-seat', { roomId: gameState.roomId, fromPhysicalId: sessionMovingId, toSeat });
      setSessionMovingId(null);
    } catch (err: any) {
      setError(err.message || 'فشل نقل المقعد');
    } finally {
      setSessionMoveLoading(false);
    }
  };

  // ── مودال تعديل الأرقام (Renumber Modal) ──
  const [showRenumberModal, setShowRenumberModal] = useState(false);
  const [renumberMap, setRenumberMap] = useState<Record<number, number>>({});
  const [renumberLoading, setRenumberLoading] = useState(false);
  const [renumberError, setRenumberError] = useState('');

  // 🔒 فتح مموّه للأدوات الحسّاسة (تعديل الأرقام/الأسماء) — ضغطة مطوّلة على رمز الغرفة تكشف حقلاً صغيراً
  const [knockOpen, setKnockOpen] = useState(false);
  const [knockCode, setKnockCode] = useState('');
  const [toolsUnlocked, setToolsUnlocked] = useState(false);
  const knockTimerRef = useRef<any>(null);
  // 🔄 تحديث مقاعد الغرفة من القالب المُعدّل
  const [resyncBusy, setResyncBusy] = useState(false);
  const [resyncReport, setResyncReport] = useState<{ conflicts: string[]; capacityWarning?: string; pinned: number } | null>(null);
  const [templateChanged, setTemplateChanged] = useState(false);
  const startKnock = () => { if (knockTimerRef.current) clearTimeout(knockTimerRef.current); knockTimerRef.current = setTimeout(() => setKnockOpen(true), 2500); };
  const cancelKnock = () => { if (knockTimerRef.current) { clearTimeout(knockTimerRef.current); knockTimerRef.current = null; } };
  const submitKnock = async () => {
    try {
      const r: any = await emit('leader:tools-ping', { code: knockCode });
      if (r?.ok) { setToolsUnlocked(true); setKnockOpen(false); setKnockCode(''); }
      else { setKnockCode(''); } // فشل صامت — لا تلميح
    } catch { setKnockCode(''); }
  };

  // 🔄 تحديث مقاعد الغرفة من القالب المُعدّل (دمج آمن على الخادم + تقرير تعارضات)
  async function doResyncTemplate() {
    if (!gameState?.roomId) return;
    setResyncBusy(true);
    try {
      const r: any = await emit('room:resync-template', { roomId: gameState.roomId });
      if (r?.success) {
        setResyncReport({ conflicts: r.conflicts || [], capacityWarning: r.capacityWarning, pinned: r.pinned || 0 });
        setTemplateChanged(false);
      } else {
        setError(r?.error || 'تعذّر تحديث القالب');
      }
    } catch (e: any) { setError(e.message); }
    finally { setResyncBusy(false); }
  }
  const adminEntryProcessed = useRef(false);

  // ── Auth Check ──
  useEffect(() => {
    const token = localStorage.getItem('leader_token');
    if (!token) {
      router.push('/leader/login');
      return;
    }
    fetch('/api/leader/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setIsAuthenticated(true);
          setLeaderName(data.displayName);
        } else {
          localStorage.removeItem('leader_token');
          router.push('/leader/login');
        }
      })
      .catch(() => router.push('/leader/login'))
      .finally(() => setCheckingAuth(false));
  }, [router]);

  // ── حفظ الغرفة النشطة في sessionStorage ──
  useEffect(() => {
    if (gameState?.roomId) {
      sessionStorage.setItem('leader_active_room', gameState.roomId);
    }
  }, [gameState?.roomId]);

  // ── إعادة الاتصال التلقائي بالغرفة بعد تحديث الصفحة ──
  useEffect(() => {
    if (!isAuthenticated || !isConnected) return;
    // إذا عندنا gameState أصلاً → ما نحتاج نعيد
    if (gameState) return;

    // إذا كان هناك دخول مقصود لغرفة جديدة من الداش بورد، نتجاهل الغرفة السابقة
    if (sessionStorage.getItem('leader_room_entry')) {
      sessionStorage.removeItem('leader_active_room');
      return;
    }

    const savedRoomId = sessionStorage.getItem('leader_active_room');
    if (!savedRoomId) return;

    (async () => {
      try {
        const res = await fetch(`/api/leader/state/${savedRoomId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` }
        });
        const data = await res.json();

        if (data.success) {
          const phase = data.state.phase;
          setGameState({
            roomId: savedRoomId,
            roomCode: data.state.roomCode || '',
            phase,
            config: data.state.config || { gameName: '', maxPlayers: 10, displayPin: '' },
            players: data.state.players || [],
            rolesPool: data.state.rolesPool || [],
            votingState: data.state.votingState,
            discussionState: data.state.discussionState,
            justificationData: data.state.justificationData,
            pendingResolution: data.state.pendingResolution,
            round: data.state.round,
            winner: data.state.winner,
            sessionId: data.state.sessionId,
            // استعادة خطوة الليل المحفوظة في Redis (حل مشكلة AWAITING NIGHT DATA عند reload)
            nightStep: data.state.currentNightStep || null,
            nightComplete: data.state.nightComplete || false,
            morningEvents: data.state.morningEvents || [],
            pendingWinner: data.state.pendingWinner || null,
            assassinState: data.state.assassinState || null,
            pendingBomb: data.state.pendingBomb || null,
            // 📐 مقاعد القالب — لإظهار «المقاعد المثبّتة من القالب» في الغرفة الفارغة عند الدخول/التحديث
            pinnedSeats: data.state.pinnedSeats || [],
            reservedTailSeats: data.state.reservedTailSeats || 0,
            doors: data.state.doors || [],
            doorSeats: data.state.doorSeats || [],
          });

          if (phase === 'LOBBY') {
            setInSession(true);
          } else {
            setInSession(false);
          }

          // إعادة الانضمام للغرفة عبر Socket
          const socket = (await import('@/lib/socket')).getSocket();
          socket.emit('room:rejoin-leader', { roomId: savedRoomId });
          // 🌙 استئناف طابور الليل دون تصفير (يعيد الخطوة الحالية من الخادم)
          if (phase === 'NIGHT') socket.emit('night:resume', { roomId: savedRoomId });
          console.log(`♻️ Leader auto-rejoined room: ${savedRoomId}`);
        } else {
          // الغرفة مش موجودة → مسح
          sessionStorage.removeItem('leader_active_room');
        }
      } catch {
        sessionStorage.removeItem('leader_active_room');
      }
    })();
  }, [isAuthenticated, isConnected]);

  // ── Fetch active games via REST ──
  const fetchActiveGames = async () => {
    setLoadingGames(true);
    try {
      const res = await fetch('/api/game/leader-rooms');
      const data = await res.json();
      if (data.success) {
        setActiveGames(data.rooms || []);
      }
    } catch (err) {
      console.error('Failed to fetch games:', err);
    } finally {
      setLoadingGames(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchActiveGames();
      fetchHistory();
      // جلب الأنشطة المتاحة للربط
      fetch('/api/activities/available')
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setAvailableActivities(data); })
        .catch(() => {});

      // ── دخول تلقائي من واجهة الإدارة ──
      // الغرفة المنشأة من الأدمن هي سجل DB فقط — نحتاج إنشاء WebSocket room
      // مهم: لا نحذف البيانات من sessionStorage حتى ننجح في إنشاء الغرفة
      try {
        const entry = sessionStorage.getItem('leader_room_entry');
        if (entry) {
          const roomData = JSON.parse(entry);
          if (roomData.sessionName && isConnected && !adminEntryProcessed.current) {
            // Socket جاهز + لم نعالج بعد → ننشئ الغرفة
            adminEntryProcessed.current = true;
            console.log('🎮 Auto-creating WebSocket room from admin:', roomData.sessionName);
            sessionStorage.removeItem('leader_room_entry'); // نحذف فقط لأن السوكت متصل
            
            const doCreate = async () => {
              try {
                const response = await emit('room:create', {
                  gameName: roomData.sessionName,
                  maxPlayers: roomData.maxPlayers || 10,
                  maxJustifications: 2,
                  maxPenalties: roomData.maxPenalties || 3,
                  penaltyScope: roomData.penaltyScope || 'room',
                  displayPin: roomData.displayPin || undefined,
                  activityId: roomData.activityId || undefined,
                  existingSessionId: roomData.sessionId || undefined,
                  sessionCode: roomData.sessionCode || undefined, // توحيد الكود مع DB
                });

                // ── بدلاً من تثبيت قيم مبدئية، نجلب الحالة الكاملة (لأن الغرفة قد تكون موجودة وبها لاعبين) ──
                const resState = await fetch(`/api/leader/state/${response.roomId}`, {
                  headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` }
                });
                const stateData = await resState.json();

                if (stateData.success) {
                  const st = stateData.state;
                  setGameState({
                    roomId: response.roomId,
                    roomCode: st.roomCode || '',
                    phase: st.phase,
                    config: st.config || { gameName: '', maxPlayers: 10, displayPin: '' },
                    players: st.players || [],
                    rolesPool: st.rolesPool || [],
                    votingState: st.votingState,
                    discussionState: st.discussionState,
                    justificationData: st.justificationData,
                    pendingResolution: st.pendingResolution,
                    round: st.round,
                    winner: st.winner,
                    sessionId: st.sessionId,
                    activityId: st.activityId || roomData.activityId || undefined,
                    // استعادة خطوة الليل المحفوظة
                    nightStep: st.currentNightStep || null,
                    nightComplete: st.nightComplete || false,
                    pendingBomb: st.pendingBomb || null,
                    // 📐 مقاعد القالب — لإظهار «المقاعد المثبّتة من القالب» فور إنشاء الغرفة
                    pinnedSeats: st.pinnedSeats || [],
                    reservedTailSeats: st.reservedTailSeats || 0,
                    doors: st.doors || [],
                    doorSeats: st.doorSeats || [],
                  });
                  if (st.phase === 'LOBBY' || st.phase === 'GAME_OVER') {
                    setInSession(true);
                  } else {
                    setInSession(false);
                  }
                } else {
                  // Fallback (لا يفترض أن يحدث)
                  setGameState({
                    roomId: response.roomId,
                    roomCode: response.roomCode,
                    phase: 'LOBBY',
                    config: {
                      gameName: response.gameName || roomData.sessionName,
                      maxPlayers: response.maxPlayers || roomData.maxPlayers || 10,
                      displayPin: response.displayPin || '',
                    },
                    players: [],
                    rolesPool: [],
                    sessionId: response.sessionId,
                    activityId: roomData.activityId || undefined,
                  });
                  setInSession(true);
                }
                fetchActiveGames();
                console.log('✅ Room created from admin entry:', response.roomCode);
              } catch (err: any) {
                setError('فشل إنشاء الغرفة: ' + (err.message || 'خطأ غير متوقع'));
              }
            };
            doCreate();
          }
          // إذا isConnected = false → ما نحذف البيانات ← الـ effect يعيد التشغيل لما isConnected يتغير
        }
      } catch { }
    }
  }, [isAuthenticated, isConnected]);

  // ── Fetch closed sessions (rooms) via REST ──
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/game/closed-sessions');
      const data = await res.json();
      if (data.success) {
        setClosedSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch closed sessions:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ── Fetch match details ──
  const handleViewMatch = async (matchId: number) => {
    try {
      const res = await fetch(`/api/game/history/${matchId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedMatch(data.match);
      }
    } catch (err) {
      console.error('Failed to fetch match details:', err);
    }
  };

  // ── Listen for player joins and Day events ──
  useEffect(() => {
    if (!gameState) return;
    
    // Player joined
    const offPlayerJoined = on('room:player-joined', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        const existingIdx = prev.players.findIndex((p: any) => p.physicalId === data.physicalId);
        if (existingIdx >= 0) {
          // تحديث بيانات اللاعب الموجود (الاسم، الجنس، الصورة، إلخ)
          const updatedPlayers = [...prev.players];
          updatedPlayers[existingIdx] = {
            ...updatedPlayers[existingIdx],
            name: data.name || updatedPlayers[existingIdx].name,
            gender: data.gender || updatedPlayers[existingIdx].gender,
            avatarUrl: data.avatarUrl || updatedPlayers[existingIdx].avatarUrl,
          };
          return { ...prev, players: updatedPlayers };
        }
        return {
          ...prev,
          players: [...prev.players, {
            physicalId: data.physicalId,
            name: data.name,
            gender: data.gender || 'MALE',
            isAlive: true,
            avatarUrl: data.avatarUrl || null,
          }].sort((a: any, b: any) => a.physicalId - b.physicalId),
        };
      });
    });

    if (!gameState?.roomId) return;

    // إعادة المصادقة كـ ليدر في حال انقطع الاتصال وعاد (Cloudflare / Network Drops)
    const offConnect = on('connect', async () => {
      console.log('🔄 Socket Reconnected! Automatically re-joining as leader for room:', gameState.roomId);
      emit('room:rejoin-leader', { roomId: gameState.roomId });
      // جلب الحالة الكاملة بعد إعادة الاتصال
      try {
        const res = await fetch(`/api/leader/state/${gameState.roomId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` }
        });
        const resData = await res.json();
        if (resData.success) {
          const st = resData.state;
          setGameState(prev => prev ? {
            ...prev,
            ...st,
            // استعادة خطوة الليل المحفوظة في Redis (حل مشكلة AWAITING NIGHT DATA)
            nightStep: st.currentNightStep || prev.nightStep || null,
            nightComplete: st.nightComplete || false,
          } : st);
          // 🌙 استئناف طابور الليل دون تصفير (يعيد إرسال الخطوة الحالية من الخادم)
          if (st.phase === 'NIGHT') emit('night:resume', { roomId: gameState.roomId });
        }
      } catch {}
    });

    // ── STATE-SYNC: تحديث فوري للحالة (renumber, etc.) ──
    const offStateSync = on('game:state-sync', (state: any) => {
      if (!state?.players) return;
      console.log('📡 Leader: game:state-sync received');
      setGameState(prev => prev ? {
        ...prev,
        players: state.players,
        phase: state.phase || prev.phase,
        assassinState: state.assassinState || prev.assassinState,
        // 📐 مقاعد القالب + السعة — لتحديث «المقاعد المثبّتة» فوراً عند إعادة المزامنة من القالب
        config: state.config ? { ...prev.config, ...state.config } : prev.config,
        pinnedSeats: state.pinnedSeats ?? prev.pinnedSeats,
        reservedTailSeats: state.reservedTailSeats ?? prev.reservedTailSeats,
        doors: state.doors ?? prev.doors,
        doorSeats: state.doorSeats ?? prev.doorSeats,
      } : prev);
    });

    // 🔔 القالب المرتبط بالفعالية تغيّر — نُظهر تنبيهاً على زر «تحديث المقاعد من القالب»
    const offTemplateChanged = on('room:template-changed', () => setTemplateChanged(true));

    // Phase changed
    const offPhaseChanged = on('game:phase-changed', async (data: any) => {
      // 🔊 العودة للوبي: أوقف أي صوت مقطعي جارٍ (كأغنية الفوز) — محلياً وعلى شاشة العرض
      if (data.phase === 'LOBBY') stopOneShotSounds();
      // 🔊 صوت افتتاحية المرحلة (الليدر هو المصدر) — الخلفية تُدار بأثر gameState.phase
      const sting = PHASE_STING[data.phase as string];
      if (sting) localSound(() => playGameSound(sting));
      // للمراحل الليلية: لا نجلب من API — Socket يتكفل بالبيانات
      if (data.phase === 'NIGHT' || data.phase === 'MORNING_RECAP') {
        // تنظيف حالة الليل عند الانتقال لملخص الصباح
        if (data.phase === 'MORNING_RECAP') {
          setAutoNightStep(null);
          setAutoNightProgress(null);
        }
        setGameState(prev => prev ? {
          ...prev,
          phase: data.phase,
          justificationData: undefined,
          pendingResolution: undefined,
          revealedData: undefined,
          nightComplete: false,
          policewomanChoice: undefined, // تصفير عند كل ليل جديد — تمنع ظهور الشرطية أثناء الليل
        } : prev);
        return;
      }

      // ✅ أولاً: استخدام الحالة المرفقة مع الحدث (أسرع)
      if (data.state) {
        // الأولوية لـ data.phase على data.state.phase (حماية من phase قديم)
        setGameState(prev => prev ? { ...prev, ...data.state, phase: data.phase } : { ...data.state, phase: data.phase });
        // تهيئة مؤقت اللعبة إن وجد
        if (data.state.gameTimer && !data.state.gameTimer.expired) {
          setGameTimerData(data.state.gameTimer);
        }
        return;
      }

      // Fallback: جلب من REST
      try {
        const res = await fetch(`/api/leader/state/${gameState.roomId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` }
        });
        const resData = await res.json();
        if (resData.success) {
          setGameState(prev => prev ? { ...prev, ...resData.state } : resData.state);
        } else {
          setGameState(prev => prev ? { ...prev, phase: data.phase } : prev);
        }
      } catch (err) {
        setGameState(prev => prev ? { ...prev, phase: data.phase } : prev);
      }
    });

    // Player kicked
    const offPlayerKicked = on('room:player-kicked', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.filter(p => p.physicalId !== data.physicalId),
        };
      });
    });

    // Deals created
    const offDealCreated = on('day:deal-created', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          votingState: {
            ...prev.votingState,
            deals: data.deals,
          } as VotingState,
        };
      });
    });

    // Deals removed
    const offDealRemoved = on('day:deal-removed', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          votingState: {
            ...prev.votingState,
            deals: data.deals,
          } as VotingState,
        };
      });
    });

    // Voting started
    const offVotingStarted = on('day:voting-started', (data: any) => {
      lastVoteCountRef.current = 0;   // تصفير عدّاد صوت التصويت لجولة جديدة
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'DAY_VOTING',
          votingState: {
            ...prev.votingState,
            candidates: data.candidates,
            hiddenPlayersFromVoting: data.hiddenPlayers || [],
            totalVotesCast: 0,
            tieBreakerLevel: data.tieBreakerLevel || 0,
            playerVotes: data.playerVotes || {},
            leaderProxyVotes: {}, // تصفير أصوات الوكالة عند إعادة التصويت
          } as VotingState,
          // تنظيف بيانات التبرير عند إعادة التصويت (Revote)
          justificationData: undefined,
          pendingResolution: undefined,
        };
      });
    });

    // Vote Update
    const offVoteUpdate = on('day:vote-update', (data: any) => {
      // 🔊 كل day:vote-update من السيرفر هو فعل تصويت حقيقي (لا يُبثّ إلا عند تغيّر فعلي):
      // زيادة المجموع = صوت جديد → vote_cast · ثبات المجموع = تغيير صوت → vote_shift
      // نقصان = أول صوت بجولة إعادة (تعادل) → vote_cast
      if (typeof data.totalVotesCast === 'number') {
        const prev = lastVoteCountRef.current;
        localSound(() => playGameSound(data.totalVotesCast === prev ? 'vote_shift' : 'vote_cast'));
        lastVoteCountRef.current = data.totalVotesCast;
      }
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          votingState: {
            ...prev.votingState,
            candidates: data.candidates,
            totalVotesCast: data.totalVotesCast,
            playerVotes: data.playerVotes || prev.votingState?.playerVotes || {},
            leaderProxyVotes: data.leaderProxyVotes !== undefined ? data.leaderProxyVotes : (prev.votingState?.leaderProxyVotes || {}),
          } as VotingState,
        };
      });
    });

    // Justification Started
    const offJustificationStarted = on('day:justification-started', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'DAY_JUSTIFICATION',
          justificationData: data,
        } as any;
      });
    });

    // Justification Timer Started
    const offJustTimerStarted = on('day:justification-timer-started', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          justificationTimer: data,
        } as any;
      });
    });

    // Elimination Pending
    const offEliminationPending = on('day:elimination-pending', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'DAY_ELIMINATION',
          pendingResolution: data,
          pendingBomb: data.pendingBomb || null,
        } as any;
      });
    });

    // 💣 نتيجة القنبلة — بعد قرار الليدر
    const offBombResult = on('day:bomb-result', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        const updatedPlayers = prev.players.map((p: any) => {
          if (data.bombEliminated?.includes(p.physicalId)) {
            return { ...p, isAlive: false };
          }
          return p;
        });
        return {
          ...prev,
          players: updatedPlayers,
          pendingBomb: null,
          pendingWinner: data.winResult !== 'GAME_CONTINUES'
            ? (data.winResult === 'MAFIA_WIN' ? 'MAFIA' : 'CITIZEN')
            : (prev as any).pendingWinner || null,
        } as any;
      });
    });

    // Elimination Revealed — بعد كشف الهوية
    const offEliminationRevealed = on('day:elimination-revealed', (data: any) => {
      // 🔊 صوت الإقصاء حسب الدور المكشوف (محلياً إن لم تكن شاشة عرض تبثّ)
      const rr = data.revealedRoles;
      let role: string | null = null;
      if (Array.isArray(rr)) role = (rr[0]?.role ?? rr[0]) || null;
      else if (rr && typeof rr === 'object') { const v = Object.values(rr)[0] as any; role = (v?.role ?? v) || null; }
      localSound(() => playEliminationSound(role));
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'DAY_REVEALED',
          revealedData: data,
          pendingWinner: data.pendingWinner || (prev as any).pendingWinner || null,
        } as any;
      });
    });

    // Discussion Update
    const offDiscussionUpdate = on('day:discussion-updated', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          discussionState: data.discussionState,
        } as any;
      });
    });

    const offGameClosed = on('game:closed', () => {
      setGameState(null);
    });

    const offGameKicked = on('game:kicked', (data: any) => {
      console.warn('🚪 Game kicked/closed:', data.reason);
      sessionStorage.removeItem('leader_active_room');
      sessionStorage.removeItem('leader_room_entry');
      setGameState(null);
      setInSession(false);
      fetchActiveGames();
      fetchHistory();
      alert(data.reason || 'تم إغلاق الغرفة');
    });

    const offRoomDeleted = on('game:room-deleted', () => {
      setGameState(null);
      setInSession(false);
    });

    // ── Night Listeners ──
    const offNightStep = on('night:queue-step', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'NIGHT',
          nightStep: data,
          nightComplete: false,
        } as any;
      });
    });

    const offNightComplete = on('night:queue-complete', () => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          nightStep: null,
          nightComplete: true,
        } as any;
      });
    });

    const offMorningRecap = on('night:morning-recap', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'MORNING_RECAP',
          morningEvents: data.events,
          pendingWinner: data.pendingWinner || null,
          // تحديث اللاعبين بحالة isAlive الجديدة بعد الإقصاء الليلي
          players: data.players && data.players.length > 0
            ? data.players
            : prev.players,
        } as any;
      });
    });

    const offSheriffResult = on('night:sheriff-result', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          sheriffResult: data,
        } as any;
      });
    });

    // ── Auto Night Mode: تقدم الإجراءات ──
    const offAutoProgress = on('night:auto-progress', (data: { total: number; submitted: number; missingPlayers?: any[]; choices?: any[] }) => {
      setAutoNightProgress(data);
    });
    const offAutoStarted = on('night:auto-started', (data: { totalAlive: number }) => {
      console.log('🌙 [Leader] night:auto-started received', data);
      setAutoNightProgress({ total: data.totalAlive, submitted: 0 });
      setAutoNightStep(null);
      setAutoNightApproval(null);
    });
    // الخطوة جاهزة — تنتظر الليدر
    const offAutoStepReady = on('night:auto-step-ready', (data: any) => {
      console.log('🌙 [Leader] night:auto-step-ready received', data);
      setAutoNightStep({ ...data, dispatched: false });
      setAutoNightProgress(prev => prev ? { ...prev, submitted: 0, choices: [] } : null);
      setAutoNightApproval(null);
    });
    // الخطوة أُرسلت للاعبين
    const offAutoStepStarted = on('night:auto-step-started', (data: any) => {
      console.log('🌙 [Leader] night:auto-step-started received', data);
      setAutoNightStep(prev => prev ? { ...prev, dispatched: true } : null);
    });
    // مرحلة الموافقة من الليدر
    const offAutoStepApproval = on('night:auto-step-approval', (data: any) => {
      console.log('⏸️ [Leader] night:auto-step-approval received', data);
      setAutoNightApproval(data);
    });

    // 👮‍♀️ صلاحية الشرطية جاهزة — عرض واجهة الاختيار
    const offPolicewomanAvailable = on('policewoman:choice-available', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          policewomanChoice: data,
        } as any;
      });
    });

    const offGameOver = on('game:over', (data: any) => {
      // 🔊 صوت الفوز حسب الفريق الفائز (محلياً إن لم تكن شاشة عرض تبثّ)
      const w = String(data.winner || '').toUpperCase();
      const winKey = w.includes('JESTER') ? 'win_jester' : w.includes('ASSASSIN') ? 'win_assassin'
        : w.includes('MAFIA') ? 'win_mafia' : 'win_citizen';
      localSound(() => playGameSound(winKey));
      setGameTimerData(null);
      setGameTimerRemaining(0);
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'GAME_OVER',
          winner: data.winner,
          matchId: data.matchId ?? (prev as any).matchId,
          players: data.players || prev.players,
        } as any;
      });
    });

    // ── إغلاق الفعالية بالكامل (من زر انتهت الفعالية) ──
    const offEventClosed = on('event:closed', () => {
      setGameState(null);
      setInSession(false);
    });

    const offGameRestarted = on('game:restarted', (data: any) => {
      stopOneShotSounds();   // ⏹️ إيقاف أي صوت مقطعي جارٍ (كأغنية الفوز) — محلياً وعلى شاشة العرض
      setAutoNightStep(null);
      setAutoNightProgress(null);
      setGameTimerData(null);
      setGameTimerRemaining(0);
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'LOBBY',
          winner: null,
          pendingWinner: null,
          pendingBomb: null,
          players: data.players || prev.players,
          config: data.config || prev.config,
          rolesPool: [],
          votingState: undefined,
          discussionState: undefined,
          justificationData: undefined,
          pendingResolution: undefined,
          policewomanChoice: undefined,
          revealedData: undefined,
          withdrawalState: null,
          assassinState: undefined,
          round: 1,
        } as any;
      });
    });

    const offConfigUpdated = on('room:config-updated', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          config: { ...prev.config, maxPlayers: data.maxPlayers },
        } as any;
      });
    });

    // ── تحديث اسم/رقم اللاعب (عند تعديله من الليدر) ──
    const offPlayerUpdated = on('room:player-updated', (data: any) => {
      if (data.physicalId && data.name) {
        setGameState(prev => {
          if (!prev) return prev;
          // إذا تغيّر الرقم (oldPhysicalId موجود) → نبحث بالرقم القديم ونحدّث الجديد
          const lookupId = data.oldPhysicalId || data.physicalId;
          return {
            ...prev,
            players: prev.players.map((p: any) =>
              p.physicalId === lookupId
                ? { ...p, name: data.name, physicalId: data.physicalId }
                : p
            ),
          };
        });
      }
    });

    // ── إقصاء إداري: تحديث isAlive في قائمة اللاعبين ──
    const offAdminEliminated = on('admin:player-eliminated', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p: any) =>
            p.physicalId === data.physicalId ? { ...p, isAlive: false } : p
          ),
        };
      });
    });

    // ── تحديث سحب الأصوات (من اللاعبين) ──
    const offWithdrawalUpdate = on('day:withdrawal-update', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          withdrawalState: {
            ...(prev as any).withdrawalState,
            count: data.count,
            needed: data.needed,
            total: data.total,
          },
        } as any;
      });
    });

    const offWithdrawalResult = on('day:withdrawal-result', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          withdrawalState: null,
        } as any;
      });
    });

    // ── مؤقت اللعبة: انتهى الوقت ──
    const offTimerExpired = on('game:timer-expired', (data: any) => {
      setGameTimerData(prev => prev ? { ...prev, expired: true } : null);
      setGameTimerRemaining(0);
    });

    // ── مؤقت اللعبة: تم تعديل المدة ──
    const offTimerAdjusted = on('game:timer-adjusted', (data: { gameTimer: any }) => {
      setGameTimerData(data.gameTimer);
    });

    // ── تحديث العقوبات فوراً عند تسجيلها ──
    const offPenaltyRecorded = on('game:penalty-recorded', (data: any) => {
      if (!data?.physicalId) return;
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p: any) =>
            p.physicalId === data.physicalId
              ? { ...p, penalties: data.penalties, isAlive: data.isKicked ? false : p.isAlive, penaltyKicked: data.isKicked || false }
              : p
          ),
        } as any;
      });
    });

    // ── 🕵️ تنبيه لحظي: لاعب فتح قائمة «التعرف على المافيا» (ترقيم حيّ) ──
    // إجمالي التنبيهات = موضع الحالي + المتبقّي في الطابور (يكبر حيّاً مع كل وصول)
    const updateGalleryCounter = () => {
      const el = typeof document !== 'undefined' ? document.getElementById('gal-alert-counter') : null;
      if (!el) return;
      const total = galleryAlertPosRef.current + galleryAlertQueueRef.current.length;
      el.textContent = total > 1 ? `تنبيه ${galleryAlertPosRef.current} من ${total}` : '';
    };

    const processGalleryAlerts = async () => {
      if (galleryAlertShowingRef.current) return;
      galleryAlertShowingRef.current = true;
      galleryAlertPosRef.current = 0;
      try {
        const escHtml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        while (galleryAlertQueueRef.current.length > 0) {
          galleryAlertPosRef.current += 1;
          const d = galleryAlertQueueRef.current.shift()!;
          const total = galleryAlertPosRef.current + galleryAlertQueueRef.current.length;
          const counterText = total > 1 ? `تنبيه ${galleryAlertPosRef.current} من ${total}` : '';
          const isDead = !!d.wasDead;
          const teamColor = d.team === 'MAFIA' ? '#dc2626' : d.team === 'NEUTRAL' ? '#7c3aed' : '#059669';
          const deadBanner = isDead
            ? `<div style="margin-top:8px;font-size:13px;font-weight:800;color:#f59e0b;background:#f59e0b18;padding:4px 10px;border-radius:10px;display:inline-block">🚫 لاعب مُقصى حاول فتح القائمة</div>`
            : '';
          const html = `
            <div style="text-align:center;direction:rtl">
              <div id="gal-alert-counter" style="font-size:13px;font-weight:800;color:#C5A059;min-height:18px;margin-bottom:6px">${counterText}</div>
              <div style="font-size:52px;font-weight:900;color:${isDead ? '#f59e0b' : '#C5A059'};line-height:1.1">#${Number(d.physicalId) || '؟'}</div>
              <div style="font-size:18px;font-weight:700;margin-top:6px">${escHtml(d.name)}</div>
              <div style="margin-top:10px;font-size:14px">
                الدور: <b>${escHtml((ROLE_NAMES as Record<string, string>)[d.role] || d.role)}</b>
                &nbsp;—&nbsp;
                <span style="background:${teamColor}22;color:${teamColor};padding:2px 12px;border-radius:10px;font-weight:700">${escHtml(d.teamAr || '')}</span>
              </div>
              ${deadBanner}
            </div>`;
          const title = isDead ? '⚠️ محاولة من لاعب مُقصى' : '🕵️ فتح قائمة التعرف على المافيا';
          const confirmed = await swalHtmlConfirm(title, html, isDead
            ? { infoOnly: true, confirmText: 'إغلاق' }               // ميت أصلاً → زر إغلاق فقط، بلا إقصاء
            : { confirmText: '⚡ إقصاء إداري', cancelText: 'إغلاق', danger: true });
          if (confirmed && !isDead) {
            try {
              const res: any = await emit('admin:eliminate', { roomId: d.roomId, physicalId: d.physicalId });
              const revealedRole = res?.role || d.role || 'UNKNOWN';
              // تحديث محلي فوري (البثّ سيؤكّده أيضاً)
              setGameState(prev => prev ? {
                ...prev,
                players: prev.players.map((pl: any) => pl.physicalId === d.physicalId ? { ...pl, isAlive: false } : pl),
              } as any : prev);
              // كشف كارد اللاعب ودوره على شاشة الليدر + شاشة العرض
              setAdminRevealData({ physicalId: d.physicalId, name: d.name, role: revealedRole });
              emit('admin:reveal-eliminated', { roomId: d.roomId, physicalId: d.physicalId, playerName: d.name, role: revealedRole }).catch(() => {});
              swalToast(`تم إقصاء ${d.name} (#${d.physicalId}) إدارياً`, 'success');
            } catch (e: any) {
              swalAlert(e?.message || 'فشل الإقصاء الإداري');
            }
          }
        }
      } finally {
        galleryAlertShowingRef.current = false;
        galleryAlertPosRef.current = 0;
      }
    };

    // ── 🔊 عند تحديث الأصوات من لوحة التحكم: إعادة تحميل الخريطة المخصّصة ──
    const offSoundsUpdated = on('admin:sounds-updated', () => { reloadSoundMap(); });

    // ── 🌅 ملخّص الليلة (أوتو): صوت كل حدث (اغتيال/حماية/قنص/إسكات/شرطية…) لحظة كشفه ──
    const offMorningEventSound = on('display:morning-event', (d: any) => {
      const key = MORNING_SOUND_BY_TYPE[String(d?.type || '')];
      if (key) localSound(() => playGameSound(key));
    });

    // ── 🤐 كشف المُسكت في النقاش (زر skip على دور اللاعب المسكت) ──
    const offShowSilencedSound = on('day:show-silenced', () => {
      localSound(() => playGameSound('day_show_silenced'));
    });

    // ── 📌 تعارض مقعد مثبّت: لاعب محجوز جلس خارج مقعده (مقعده مأخوذ غالباً) ──
    const offPinnedConflict = on('leader:pinned-seat-conflict', (d: any) => {
      if (!d || d.roomId !== gameState.roomId) return;
      setPinnedSeatsExpanded(true);   // افتح القسم ليرى الليدر التعارض
      swalAlert(
        `📌 تعارض مقعد مثبّت\n«${d.playerName}» محجوز على المقعد ${d.pinnedSeat}${d.occupantName ? ` (يشغله «${d.occupantName}»)` : ''} — جلس في المقعد ${d.assignedSeat}`,
        'warning',
      );
    });

    const offGalleryAlert = on('leader:mafia-gallery-alert', (d: any) => {
      if (!d || d.roomId !== gameState.roomId) return;
      // 🔔 صوت تنبيه فوري — على جهاز الليدر فقط (لا يُبثّ لشاشة العرض حتى لا ينكشف التنبيه في القاعة)
      if (leaderSoundOnRef.current) playLocalSound('leader_gallery_alert');
      // إسقاط التكرار: نفس اللاعب لا يتكدس في الطابور
      if (!galleryAlertQueueRef.current.some((q: any) => q.physicalId === d.physicalId)) {
        galleryAlertQueueRef.current.push(d);
      }
      updateGalleryCounter();   // تحديث الترقيم حيّاً إن كان تنبيه مفتوحاً الآن
      processGalleryAlerts();   // ابدأ العرض إن كان خاملاً
    });

    // ── Auto Night: استقبال تحديث الحالة الكامل من السيرفر ──
    const offStateUpdated = on('game:state-updated', (state: any) => {
      if (!state) return;
      setGameState(prev => prev ? {
        ...prev,
        players: state.players || prev.players,
        nightActions: state.nightActions || (prev as any).nightActions,
        nightStep: state.nightStep || prev.nightStep,
        playerNightActions: state.playerNightActions || (prev as any).playerNightActions,
      } as any : prev);
    });

    return () => {
      offConnect();
      offStateSync();
      offTemplateChanged();
      offPlayerJoined();
      offPhaseChanged();
      offPlayerKicked();
      offDealCreated();
      offDealRemoved();
      offVotingStarted();
      offVoteUpdate();
      offJustificationStarted();
      offJustTimerStarted();
      offEliminationPending();
      offBombResult();
      offEliminationRevealed();
      offDiscussionUpdate();
      offGameClosed();
      offGameKicked();
      offRoomDeleted();
      offNightStep();
      offNightComplete();
      offMorningRecap();
      offSheriffResult();
      offAutoProgress();
      offAutoStarted();
      offAutoStepReady();
      offAutoStepStarted();
      offAutoStepApproval();
      offPolicewomanAvailable();
      offGameOver();
      offGameRestarted();
      offConfigUpdated();
      offPlayerUpdated();
      offAdminEliminated();
      offWithdrawalUpdate();
      offWithdrawalResult();
      offTimerExpired();
      offTimerAdjusted();
      offPenaltyRecorded();
      offGalleryAlert();
      offSoundsUpdated();
      offMorningEventSound();
      offShowSilencedSound();
      offPinnedConflict();
      offStateUpdated();
    };
  }, [on, emit, gameState?.roomId]);

  // ── ⏱️ عداد تنازلي لمؤقت اللعبة ──
  useEffect(() => {
    if (!gameTimerData || gameTimerData.expired) return;
    const iv = setInterval(() => {
      const elapsed = (Date.now() - gameTimerData.startedAt) / 1000;
      const remaining = Math.max(0, gameTimerData.totalSeconds - elapsed);
      setGameTimerRemaining(remaining);

      const rounded = Math.floor(remaining);
      if (rounded > 0 && rounded <= 60 && rounded !== lastTimerSoundRef.current) {
        lastTimerSoundRef.current = rounded;
        if (leaderSoundOnRef.current) {
          if (rounded <= 10) {
            playGameSound('timer_heartbeat_fast');
          } else if (rounded % 5 === 0) {
            playGameSound('timer_heartbeat_slow');
          }
        }
      }

      if (remaining <= 0) {
        clearInterval(iv);
        if (lastTimerSoundRef.current !== 0) {
          if (leaderSoundOnRef.current) playGameSound('timer_buzzer');
          lastTimerSoundRef.current = 0;
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [gameTimerData]);

  // ── Create Room ──
  const handleCreateRoom = async () => {
    if (!gameName.trim() || !isConnected) return;
    setCreating(true);
    setError('');

    try {
      const response = await emit('room:create', {
        gameName: gameName.trim(),
        maxPlayers,
        maxJustifications,
        maxPenalties,
        penaltyScope,
        displayPin: displayPin || undefined,
        activityId: selectedActivityId || undefined,
        nightMode,
      });

      setGameState({
        roomId: response.roomId,
        roomCode: response.roomCode,
        phase: 'LOBBY',
        config: {
          gameName: response.gameName || gameName,
          maxPlayers,
          displayPin: response.displayPin || '',
        },
        players: [],
        rolesPool: [],
        sessionId: response.sessionId,
      });
      setInSession(true); // الانتقال لصفحة الغرفة

      // تحديث القائمة
      fetchActiveGames();
    } catch (err: any) {
      setError(err.message || 'فشل إنشاء اللعبة');
    } finally {
      setCreating(false);
    }
  };

  // ── Rejoin existing game ──
  const handleRejoinGame = async (game: ActiveGame) => {
    try {
      const res = await fetch(`/api/leader/state/${game.roomId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` }
      });
      const data = await res.json();

      if (data.success) {
        const phase = data.state.phase;
        setGameState({
          roomId: game.roomId,
          roomCode: game.roomCode,
          phase,
          config: data.state.config || {
            gameName: game.gameName,
            maxPlayers: game.maxPlayers,
            displayPin: game.displayPin,
          },
          players: data.state.players || [],
          rolesPool: data.state.rolesPool || [],
          votingState: data.state.votingState,
          discussionState: data.state.discussionState,
          justificationData: data.state.justificationData,
          pendingResolution: data.state.pendingResolution,
          round: data.state.round,
          winner: data.state.winner,
          sessionId: data.state.sessionId,
          // استعادة خطوة الليل المحفوظة (حل مشكلة AWAITING NIGHT DATA)
          nightStep: data.state.currentNightStep || null,
          nightComplete: data.state.nightComplete || false,
          morningEvents: data.state.morningEvents || [],
          pendingWinner: data.state.pendingWinner || null,
        });

        // تحديد الوضع: LOBBY → Session View | GAME_OVER → Game View (لعرض شاشة النهاية)
        if (phase === 'LOBBY') {
          setInSession(true);
        } else {
          setInSession(false);
        }

        // Join socket room
        const socket = (await import('@/lib/socket')).getSocket();
        socket.emit('room:rejoin-leader', { roomId: game.roomId });
      }
    } catch (err) {
      setError('فشل الاتصال باللعبة');
    }
  };

  // ── جلب تاريخ ألعاب الـ Session (تلقائي عند العودة للغرفة) ──
  useEffect(() => {
    if (!inSession || !gameState?.sessionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/leader/session-matches/${gameState.sessionId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` },
        });
        const data = await res.json();
        if (data.success) {
          setSessionMatches(data.matches || []);
        }
      } catch (err) {
        console.error('Failed to fetch session history:', err);
      }
    })();
  }, [inSession, gameState?.sessionId]);

  // ── 🔊 زرّ كتم/تشغيل أصوات الليدر (عائم، صمّام أمان لتجنّب صدى سمّاعات القاعة) ──
  const soundToggleBtn = (
    <button
      onClick={() => setLeaderSoundOn((v) => { const nv = !v; if (!nv) stopOneShotSounds(); try { localStorage.setItem('leader-sound-on', nv ? '1' : '0'); } catch {}; return nv; })}
      title={leaderSoundOn ? 'كتم أصوات الليدر' : 'تشغيل أصوات الليدر'}
      aria-label={leaderSoundOn ? 'كتم الصوت' : 'تشغيل الصوت'}
      className={`fixed bottom-4 left-4 z-[60] w-11 h-11 rounded-full flex items-center justify-center text-lg border backdrop-blur-sm shadow-lg transition-colors ${leaderSoundOn ? 'bg-[#0f2a1a]/80 border-emerald-600/40 text-emerald-300' : 'bg-[#2a0f0f]/80 border-red-700/40 text-red-300'}`}
    >
      {leaderSoundOn ? '🔊' : '🔇'}
    </button>
  );

  if (checkingAuth || !isAuthenticated) {
    return (
      <div className="display-bg min-h-screen flex items-center justify-center font-sans">
        <div className="text-[#555] text-sm font-mono tracking-widest uppercase">VERIFYING CREDENTIALS...</div>
      </div>
    );
  }

  const handleCloseRoom = async () => {
    if (!gameState) return;
    if (!(await swalConfirm('هل أنت متأكد من إنهاء اللعبة الحالية؟ سيتم إعادة جميع اللاعبين للغرفة.'))) return;
    try {
      const res = await emit('room:reset-to-lobby', { roomId: gameState.roomId });
      if (res.success) {
        setGameState((prev: any) => prev ? {
          ...prev,
          phase: 'LOBBY',
          winner: undefined,
          rolesPool: [],
          votingState: undefined,
          discussionState: undefined,
          players: (res.players || prev.players).map((p: any) => ({
            ...p, isAlive: true, isSilenced: false, role: null,
          })),
        } : prev);
      }
      setInSession(true);
      setExcludedPlayers([]);
      setShowExcludeUI(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── حذف الغرفة نهائياً ──
  const handleDeleteRoom = async () => {
    if (!gameState) return;
    const msg = gameState.activityId
      ? 'هذه الغرفة مرتبطة بنشاط. سيتم إغلاقها وفك ربطها (بدون حذف نهائي). هل تريد المتابعة؟'
      : '⚠️ هل أنت متأكد من حذف هذه الغرفة نهائياً؟ سيتم حذف جميع بيانات اللاعبين والألعاب المرتبطة!';
    if (!(await swalConfirm(msg))) return;
    try {
      const res = await emit('room:delete-room', { roomId: gameState.roomId });
      if (res.success) {
        setGameState(null);
        setInSession(false);
        fetchActiveGames();
        fetchHistory();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── 🎁 معالجات سحب «اختيار رابح» ──
  const luckyPresentCount = gameState ? gameState.players.filter((p: any) => !p.seatHeld).length : 0;
  const doLuckyDraw = async () => {
    if (!gameState) return;
    setLuckyBusy(true);
    try {
      const res: any = await emit('room:lucky-draw:draw', { roomId: gameState.roomId, count: luckyCount });
      setLuckyWinners(res?.winners || []);
      setLuckyRevealed(false);
    } catch (e: any) { setError(e.message); } finally { setLuckyBusy(false); }
  };
  const doLuckyReveal = async () => {
    if (!gameState) return;
    setLuckyBusy(true);
    try {
      await emit('room:lucky-draw:reveal', { roomId: gameState.roomId });
      setLuckyRevealed(true);
    } catch (e: any) { setError(e.message); } finally { setLuckyBusy(false); }
  };
  const doLuckyClear = async () => {
    if (gameState) { try { await emit('room:lucky-draw:clear', { roomId: gameState.roomId }); } catch { /* ignore */ } }
    setLuckyWinners(null); setLuckyRevealed(false); setShowLuckyDraw(false);
  };

  // ── 📊 معالجات ملخص النقاط + التعديل اليدوي ──
  const openPointsModal = async () => {
    const mid = (gameState as any)?.matchId;
    if (!mid) { setError('لا يوجد معرّف للعبة الحالية'); return; }
    setPointsModal([]); setPointsExpanded(null); setPointsLoading(true);
    try {
      const res = await fetch(`/api/leader/match/${mid}/points`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` },
      });
      const data = await res.json();
      if (data.success) setPointsModal(data.players || []);
      else { setError(data.error || 'فشل جلب النقاط'); setPointsModal(null); }
    } catch (e: any) { setError(e.message); setPointsModal(null); } finally { setPointsLoading(false); }
  };
  const submitPointsEdit = async () => {
    if (!pointsEdit) return;
    const xp = Math.trunc(Number(editXp) || 0), rr = Math.trunc(Number(editRr) || 0);
    if (!xp && !rr) { setError('أدخل تعديل XP أو RR'); return; }
    setEditBusy(true);
    try {
      const res = await fetch(`/api/leader/match-player/${pointsEdit.matchPlayerId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}` },
        body: JSON.stringify({ xpDelta: xp, rrDelta: rr, reason: editReason }),
      });
      const data = await res.json();
      if (data.success) { setPointsEdit(null); setEditXp(0); setEditRr(0); setEditReason(''); await openPointsModal(); }
      else setError(data.error || 'فشل التعديل');
    } catch (e: any) { setError(e.message); } finally { setEditBusy(false); }
  };

  // ══════════════════════════════════════════════════
  // صفحة الغرفة (Session View)
  // ══════════════════════════════════════════════════
  if (gameState && inSession) {
    return (
      <div className="display-bg min-h-screen font-sans relative overflow-hidden blood-vignette selection:bg-[#8A0303] selection:text-white flex flex-col">
        <div className="relative z-10 w-full h-full flex flex-col flex-1">
          {soundToggleBtn}
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]/60 bg-[#050505]/70 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-3">
              <Image src="/mafia_logo.png" alt="Mafia" width={36} height={36} className="w-[32px] h-[32px] drop-shadow-[0_0_10px_rgba(138,3,3,0.3)]" priority />
              <div className="flex flex-col items-start leading-none">
                <span className="text-base font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>MAFIA</span>
                <span className="flex justify-between w-full text-[8px] font-light text-[#8A0303]" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l: string, i: number) => <span key={i}>{l}</span>)}</span>
              </div>
              <span className="mx-2 text-[#2a2a2a]">|</span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#555]">
                <span className="text-[#C5A059] font-bold">SESSION</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              {/* 🎁 زر اختيار رابح — Session View (سحب هدايا الفعالية) */}
              {gameState.players.filter((p: any) => !p.seatHeld).length > 0 && (
                <button
                  onClick={() => { setLuckyWinners(null); setLuckyRevealed(false); setLuckyCount(1); setShowLuckyDraw(true); }}
                  className="text-[#C5A059] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/50 px-3 py-1.5 hover:border-[#C5A059] bg-[#C5A059]/5"
                >
                  🎁 اختيار رابح
                </button>
              )}
              {/* زر تعديل الأسماء — Session View */}
              {gameState.players.length > 0 && (
                <button
                  onClick={() => setShowAdminRename(true)}
                  className="text-[#C5A059] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/30 px-3 py-1.5 hover:border-[#C5A059]"
                >
                  ✏️ تعديل أسماء
                </button>
              )}
              <button
                onClick={() => { setGameState(null); setInSession(false); }}
                className="text-[#555] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-white transition-colors border border-[#2a2a2a] px-3 py-1.5 hover:border-[#555]"
              >
                ← Return
              </button>
            </div>
          </div>

          {/* 🎁 مودال اختيار رابح */}
          {showLuckyDraw && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!luckyBusy) setShowLuckyDraw(false); }}>
              <div className="bg-[#0d0d0d] border border-[#C5A059]/40 rounded-2xl p-6 w-full max-w-md shadow-[0_0_40px_rgba(197,160,89,0.2)]" onClick={(e) => e.stopPropagation()} dir="rtl">
                <h3 className="text-xl font-black text-[#C5A059] mb-1 text-center" style={{ fontFamily: 'Amiri, serif' }}>🎁 اختيار رابح</h3>
                <p className="text-[#808080] text-xs text-center mb-5">سحب عشوائي لتوزيع الهدايا — يظهر على شاشة العرض</p>

                {luckyWinners === null ? (
                  <>
                    <label className="block text-[#aaa] text-sm mb-3 text-center">عدد الفائزين (من {luckyPresentCount} لاعب)</label>
                    <div className="flex items-center justify-center gap-5 mb-6">
                      <button onClick={() => setLuckyCount((c) => Math.max(1, c - 1))} className="w-11 h-11 rounded-full border border-[#C5A059]/40 text-[#C5A059] text-2xl hover:bg-[#C5A059]/10">−</button>
                      <span className="text-4xl font-black text-white w-16 text-center">{luckyCount}</span>
                      <button onClick={() => setLuckyCount((c) => Math.min(luckyPresentCount, c + 1))} className="w-11 h-11 rounded-full border border-[#C5A059]/40 text-[#C5A059] text-2xl hover:bg-[#C5A059]/10">+</button>
                    </div>
                    <button disabled={luckyBusy || luckyPresentCount < 1} onClick={doLuckyDraw} className="btn-premium w-full py-3 !text-base disabled:opacity-50">
                      {luckyBusy ? '... جارٍ السحب' : '🎲 اسحب الفائزين'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-center text-[#C5A059] text-sm mb-3">الفائزون {luckyRevealed ? '(ظاهرون على الشاشة)' : '(سرّاً — قبل الكشف)'}:</p>
                    <div className="flex flex-wrap justify-center gap-2 mb-5">
                      {luckyWinners.map((id) => {
                        const pl = gameState.players.find((p: any) => p.physicalId === id);
                        return (
                          <div key={id} className="px-3 py-2 rounded-lg bg-[#C5A059]/10 border border-[#C5A059]/40 text-white text-sm flex items-center gap-2">
                            <span className="text-[#C5A059] font-mono font-bold">#{id}</span>
                            <span>{pl?.name || ''}</span>
                          </div>
                        );
                      })}
                    </div>
                    {!luckyRevealed ? (
                      <div className="flex gap-2">
                        <button disabled={luckyBusy} onClick={doLuckyReveal} className="btn-premium flex-1 py-3 !text-base disabled:opacity-50">{luckyBusy ? '...' : '👁️ كشف على الشاشة'}</button>
                        <button disabled={luckyBusy} onClick={doLuckyDraw} className="px-4 py-3 border border-[#555] rounded-lg text-[#aaa] hover:text-white hover:border-[#888] text-sm">🔄 إعادة</button>
                      </div>
                    ) : (
                      <p className="text-center text-green-400 text-sm mb-2">✅ تم الكشف على شاشة العرض</p>
                    )}
                    <button onClick={doLuckyClear} className="w-full mt-3 py-2 text-[#777] text-xs hover:text-white transition-colors">إنهاء السحب</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Session Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* معلومات الغرفة */}
            <div className="bg-black/40 border border-[#2a2a2a] rounded-xl p-6 mb-8 relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent opacity-80" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white mb-1" style={{ fontFamily: 'Amiri, serif' }}>
                    {gameState.config.gameName}
                  </h2>
                  <p className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">
                    CODE: <span
                      className="text-[#C5A059] select-none cursor-default"
                      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as any}
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => { try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {} startKnock(); }}
                      onPointerUp={(e) => { try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {} cancelKnock(); }}
                      onPointerCancel={cancelKnock}
                    >{gameState.roomCode}</span>
                    {toolsUnlocked && <span className="text-[#C5A059]/30">·</span>}
                    {' | '}PIN: <span className="text-[#8A0303]">{gameState.config.displayPin}</span>
                    {' | '}AGENTS: <span className="text-white">{gameState.players.filter((p: any) => !p.seatHeld).length}</span>/{gameState.config.maxPlayers}
                  </p>
                  {knockOpen && (
                    <div className="mt-1 flex items-center gap-1" style={{ touchAction: 'manipulation' }}>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoFocus
                        value={knockCode}
                        onChange={(e) => setKnockCode(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitKnock();
                          if (e.key === 'Escape') { setKnockOpen(false); setKnockCode(''); }
                        }}
                        placeholder="··"
                        aria-label="code"
                        className="w-16 bg-transparent border-b border-[#222] text-center text-[#444] text-[10px] font-mono focus:outline-none focus:border-[#333]"
                      />
                      {/* زرّان صغيران: يعملان باللمس (لا Enter في لوحة الأرقام) وبالماوس؛ preventDefault يمنع فقد تركيز الحقل */}
                      <button type="button" aria-hidden tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); submitKnock(); }} className="px-2 py-1 text-[#333] text-[10px] leading-none hover:text-[#666]">✓</button>
                      <button type="button" aria-hidden tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); setKnockOpen(false); setKnockCode(''); }} className="px-2 py-1 text-[#333] text-[10px] leading-none hover:text-[#666]">✕</button>
                    </div>
                  )}
                </div>
                <div className={`flex items-center gap-2`}>
                  <div className={`w-2 h-2 ${isConnected ? 'bg-[#2E5C31] shadow-[0_0_10px_#2E5C31]' : 'bg-[#8A0303]'} animate-pulse`} />
                  <span className="text-[#555] text-[10px] font-mono uppercase">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
                </div>
              </div>
            </div>

            {/* تحكم بعدد اللاعبين + إضافة يدوية */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              {/* عدد اللاعبين الأقصى */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-[#808080] tracking-widest uppercase">MAX AGENTS</span>
                <button
                  onClick={async () => {
                    const newMax = Math.max(6, gameState.config.maxPlayers - 1);
                    try {
                      await emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: newMax });
                      setGameState((prev: any) => prev ? { ...prev, config: { ...prev.config, maxPlayers: newMax } } : prev);
                    } catch {}
                  }}
                  className="w-8 h-8 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono text-sm"
                >−</button>
                <span className="text-lg font-mono text-white w-8 text-center">{gameState.config.maxPlayers}</span>
                <button
                  onClick={async () => {
                    const newMax = Math.min(50, gameState.config.maxPlayers + 1);
                    try {
                      await emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: newMax });
                      setGameState((prev: any) => prev ? { ...prev, config: { ...prev.config, maxPlayers: newMax } } : prev);
                    } catch {}
                  }}
                  className="w-8 h-8 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono text-sm"
                >+</button>
              </div>

              {/* زر إظهار فورم الإضافة — يختفي عند الامتلاء */}
              {gameState.players.length < gameState.config.maxPlayers && (
                <button
                  onClick={() => setShowSessionAddForm(!showSessionAddForm)}
                  className="text-[#C5A059] text-xs font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/30 px-4 py-2 hover:border-[#C5A059]"
                >
                  {showSessionAddForm ? '✕ إلغاء' : '＋ إضافة لاعب'}
                </button>
              )}
            </div>

            {/* فورم إضافة لاعب يدوياً */}
            <AnimatePresence>
              {showSessionAddForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 overflow-hidden"
                >
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!sessionAddForm.name || !sessionAddForm.physicalId) {
                        setError('الرجاء إدخال الاسم والرقم');
                        return;
                      }
                      if (!gameState.roomId) {
                        setError('لم يتم إنشاء غرفة بعد');
                        return;
                      }
                      // تطبيع رقم الهاتف
                      const rawPhone = sessionAddForm.phone?.trim() || '';
                      const normalizedPhone = rawPhone
                        ? (rawPhone.startsWith('0') ? rawPhone : '0' + rawPhone)
                        : '0700000000';
                      try {
                        const res = await fetch('/api/leader/force-add-player', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${localStorage.getItem('leader_token') || ''}`,
                          },
                          body: JSON.stringify({
                            roomId: gameState.roomId,
                            physicalId: Number(sessionAddForm.physicalId),
                            name: sessionAddForm.name,
                            phone: normalizedPhone,
                            gender: sessionAddForm.gender,
                          }),
                        });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.error);
                        // تحديث الحالة المحلية
                        setGameState((prev: any) => {
                          if (!prev) return prev;
                          const exists = prev.players.find((p: any) => p.physicalId === Number(sessionAddForm.physicalId));
                          if (exists) {
                            return {
                              ...prev,
                              players: prev.players.map((p: any) =>
                                p.physicalId === Number(sessionAddForm.physicalId)
                                  ? { ...p, name: sessionAddForm.name, gender: sessionAddForm.gender }
                                  : p
                              ),
                            };
                          }
                          return {
                            ...prev,
                            players: [...prev.players, {
                              physicalId: Number(sessionAddForm.physicalId),
                              name: sessionAddForm.name,
                              gender: sessionAddForm.gender,
                              isAlive: true,
                            }].sort((a: any, b: any) => a.physicalId - b.physicalId),
                          };
                        });
                        setSessionAddForm({ name: '', physicalId: '', phone: '', gender: 'MALE' });
                        setError('');
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="noir-card p-5 border-[#2a2a2a] space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-mono text-[#808080] mb-1 tracking-widest uppercase">AGENT #</label>
                        <input
                          type="number"
                          value={sessionAddForm.physicalId}
                          onChange={(e) => setSessionAddForm(prev => ({ ...prev, physicalId: e.target.value }))}
                          placeholder="1"
                          min={1}
                          max={gameState.config.maxPlayers}
                          className="w-full p-2.5 bg-[#050505] border border-[#2a2a2a] text-white text-center font-mono focus:border-[#C5A059] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-[#808080] mb-1 tracking-widest uppercase">NAME</label>
                        <input
                          type="text"
                          value={sessionAddForm.name}
                          onChange={(e) => setSessionAddForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="اسم اللاعب"
                          className="w-full p-2.5 bg-[#050505] border border-[#2a2a2a] text-white text-center focus:border-[#C5A059] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-mono text-[#808080] mb-1 tracking-widest uppercase">PHONE</label>
                        <input
                          type="tel"
                          value={sessionAddForm.phone}
                          onChange={(e) => setSessionAddForm(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="07XXXXXXXX"
                          dir="ltr"
                          className="w-full p-2.5 bg-[#050505] border border-[#2a2a2a] text-white text-center font-mono focus:border-[#C5A059] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-[#808080] mb-1 tracking-widest uppercase">GENDER</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSessionAddForm(prev => ({ ...prev, gender: 'MALE' }))}
                            className={`flex-1 py-2.5 text-xs font-mono uppercase border transition-all ${
                              sessionAddForm.gender === 'MALE'
                                ? 'border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10'
                                : 'border-[#2a2a2a] text-[#555] hover:border-[#555]'
                            }`}
                          >♂ ذكر</button>
                          <button
                            type="button"
                            onClick={() => setSessionAddForm(prev => ({ ...prev, gender: 'FEMALE' }))}
                            className={`flex-1 py-2.5 text-xs font-mono uppercase border transition-all ${
                              sessionAddForm.gender === 'FEMALE'
                                ? 'border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10'
                                : 'border-[#2a2a2a] text-[#555] hover:border-[#555]'
                            }`}
                          >♀ أنثى</button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3 bg-[#C5A059]/10 border border-[#C5A059]/40 text-[#C5A059] text-xs font-mono uppercase tracking-widest hover:bg-[#C5A059]/20 transition-all"
                    >
                      ✓ إضافة اللاعب
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* قائمة اللاعبين */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono tracking-[0.3em] text-[#555] uppercase">
                  AGENTS ROSTER ({gameState.players.length})
                </h3>
                {/* زر تعديل الأرقام */}
                <button
                  onClick={() => {
                    const map: Record<number, number> = {};
                    gameState.players.forEach((p: any) => { map[p.physicalId] = p.physicalId; });
                    setRenumberMap(map);
                    setRenumberError('');
                    setShowRenumberModal(true);
                  }}
                  className="text-[#C5A059] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/30 px-3 py-1.5 hover:border-[#C5A059]"
                >
                  #️⃣ تعديل الأرقام
                </button>
              </div>

              {/* 🪑 شريط وضع النقل + المقاعد الفارغة كأهداف */}
              <AnimatePresence>
                {sessionMovingId !== null && (() => {
                  const mover = gameState.players.find((p: any) => p.physicalId === sessionMovingId);
                  const occupied = new Set(gameState.players.map((p: any) => p.physicalId));
                  const emptySeats = Array.from({ length: gameState.config.maxPlayers }, (_, i) => i + 1).filter((s) => !occupied.has(s));
                  return (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                      <div className="bg-sky-950/40 border border-sky-500/40 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sky-300 text-[11px] font-bold">
                            🪑 نقل «{mover?.name}» (#{sessionMovingId}) — المس مقعداً فارغاً للنقل، أو بطاقة لاعب للتبديل معه
                          </p>
                          <button onClick={() => setSessionMovingId(null)} className="text-[10px] px-3 py-1 rounded bg-zinc-800 border border-zinc-600 text-zinc-300 hover:bg-zinc-700">✕ إلغاء</button>
                        </div>
                        {emptySeats.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {emptySeats.map((s) => (
                              <button key={s} disabled={sessionMoveLoading} onClick={() => handleSessionMoveSeat(s)}
                                className="w-10 h-10 rounded-lg border-2 border-dashed border-sky-500/50 text-sky-300 font-mono font-bold text-sm hover:bg-sky-500/20 hover:border-sky-400 transition-colors disabled:opacity-40">
                                {s}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-zinc-500">لا مقاعد فارغة — المس بطاقة لاعب للتبديل معه</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>

              {gameState.players.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[#2a2a2a] rounded-lg">
                  <p className="text-[#555] text-sm font-mono">لا يوجد لاعبين — أضف لاعبين باستخدام الزر أعلاه</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {gameState.players.filter((p: any) => !p.seatHeld).map((p: any) => {
                    const isSessionEditing = sessionEditingId === p.physicalId;
                    const isSessionMover = sessionMovingId === p.physicalId;
                    const isSessionSwapTarget = sessionMovingId !== null && !isSessionMover;
                    return (
                    <div
                      key={p.physicalId}
                      onClick={() => {
                        if (isSessionMover) setSessionMovingId(null);                    // لمس بطاقة الناقل = إلغاء
                        else if (isSessionSwapTarget) handleSessionMoveSeat(p.physicalId); // لمس لاعب آخر = تبديل
                      }}
                      className={`relative group rounded-2xl transition-shadow ${
                        isSessionMover ? 'ring-2 ring-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.4)] cursor-pointer'
                        : isSessionSwapTarget ? 'ring-1 ring-sky-500/30 hover:ring-2 hover:ring-sky-400 cursor-pointer'
                        : ''
                      }`}>
                      <MafiaCard
                        playerNumber={p.physicalId}
                        playerName={p.name}
                        role={p.role || ''}
                        isFlipped={false}
                        flippable={false}
                        isAlive={true}
                        size="sm"
                        avatarUrl={p.avatarUrl}
                      />
                      {/* 🪑 زر نقل/تبديل المقعد — يظهر عند hover (لمستان؛ خاضع لقفل السرّ في السيرفر) */}
                      {!showExcludeUI && !isSessionEditing && sessionMovingId === null && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSessionMovingId(p.physicalId); }}
                          className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-[#051520] border border-sky-500/60 text-sky-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sky-950 hover:scale-110 z-20 shadow-lg"
                          title="نقل/تبديل المقعد"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
                        </button>
                      )}
                      {/* زر حذف لاعب — يظهر عند hover */}
                      {!showExcludeUI && !isSessionEditing && sessionMovingId === null && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!(await swalConfirm(`حذف ${p.name} من الغرفة؟`))) return;
                            try {
                              await emit('room:kick-player', { roomId: gameState.roomId, physicalId: p.physicalId });
                            } catch (err: any) {
                              setError(err.message);
                            }
                          }}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#8A0303] border border-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 z-20 text-[10px]"
                          title="حذف اللاعب"
                        >✕</button>
                      )}
                      {/* ✏️ زر تعديل اسم اللاعب — يظهر عند hover في Session View */}
                      {!showExcludeUI && !isSessionEditing && sessionMovingId === null && (
                        <button
                          onClick={() => { setSessionEditingId(p.physicalId); setSessionEditName(p.name); }}
                          className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#C5A059]/50 text-[#C5A059] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#C5A059]/20 hover:scale-110 z-20 text-[10px]"
                          title="تعديل الاسم"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                      )}
                      {/* ✏️ Overlay تعديل الاسم في Session View */}
                      <AnimatePresence>
                        {isSessionEditing && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-2xl border-2 border-[#C5A059]/50 flex flex-col items-center justify-center p-3 z-30"
                          >
                            <span className="text-[#C5A059] text-[8px] font-mono uppercase tracking-widest mb-1.5 font-bold">EDIT NAME</span>
                            <input
                              type="text"
                              value={sessionEditName}
                              onChange={(e) => setSessionEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && sessionEditName.trim()) {
                                  setSessionEditLoading(true);
                                  emit('room:override-player', { roomId: gameState.roomId, physicalId: p.physicalId, name: sessionEditName.trim(), isNew: false })
                                    .then(() => { setSessionEditingId(null); setSessionEditName(''); })
                                    .catch((err: any) => setError(err.message))
                                    .finally(() => setSessionEditLoading(false));
                                }
                                if (e.key === 'Escape') { setSessionEditingId(null); setSessionEditName(''); }
                              }}
                              autoFocus
                              className="w-full p-1.5 bg-[#0c0c0c] border border-[#C5A059]/30 rounded text-white text-center text-xs font-mono focus:border-[#C5A059] focus:outline-none mb-2"
                              dir="rtl"
                            />
                            <div className="flex gap-1.5 w-full">
                              <button
                                onClick={() => {
                                  if (!sessionEditName.trim()) return;
                                  setSessionEditLoading(true);
                                  emit('room:override-player', { roomId: gameState.roomId, physicalId: p.physicalId, name: sessionEditName.trim(), isNew: false })
                                    .then(() => { setSessionEditingId(null); setSessionEditName(''); })
                                    .catch((err: any) => setError(err.message))
                                    .finally(() => setSessionEditLoading(false));
                                }}
                                disabled={sessionEditLoading || !sessionEditName.trim()}
                                className="flex-1 bg-[#C5A059]/20 border border-[#C5A059] text-[#C5A059] py-1 rounded text-[9px] font-mono hover:bg-[#C5A059]/30 disabled:opacity-40"
                              >{sessionEditLoading ? '...' : '✓'}</button>
                              <button
                                onClick={() => { setSessionEditingId(null); setSessionEditName(''); }}
                                className="flex-1 bg-zinc-800 border border-zinc-600 text-zinc-300 py-1 rounded text-[9px] font-mono hover:bg-zinc-700"
                              >✕</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* زر استبعاد من اللعبة القادمة */}
                      {showExcludeUI && (
                        <button
                          onClick={() => setExcludedPlayers(prev => 
                            prev.includes(p.physicalId) 
                              ? prev.filter((id: number) => id !== p.physicalId) 
                              : [...prev, p.physicalId]
                          )}
                          className={`absolute -top-2 -right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all z-10 ${
                            excludedPlayers.includes(p.physicalId)
                              ? 'bg-[#8A0303] border-[#8A0303] text-white'
                              : 'bg-[#111] border-[#555] text-[#555] hover:border-[#8A0303]'
                          }`}
                        >
                          {excludedPlayers.includes(p.physicalId) ? '✕' : '−'}
                        </button>
                      )}
                      {excludedPlayers.includes(p.physicalId) && showExcludeUI && (
                        <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                          <span className="text-[#8A0303] text-xs font-mono uppercase">مستبعد</span>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}

              {/* ═══ المقاعد المحجوزة (Session View) ═══ */}
              {(() => {
                const heldPlayers = gameState.players.filter((p: any) => p.seatHeld === true);
                if (heldPlayers.length === 0) return null;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 bg-black/40 border border-amber-500/20 rounded-xl p-4 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400">🔒</span>
                        <span className="text-white text-xs font-bold" style={{ fontFamily: 'Amiri, serif' }}>مقاعد محجوزة ({heldPlayers.length})</span>
                      </div>
                      <span className="text-[#808080] text-[8px] font-mono tracking-widest uppercase">HELD 10 MIN</span>
                    </div>
                    <div className="space-y-2">
                      {heldPlayers.map((hp: any) => {
                        const remainMs = (hp.heldUntil || 0) - Date.now();
                        const remainMin = Math.max(0, Math.ceil(remainMs / 60000));
                        return (
                          <div key={hp.physicalId} className="flex items-center justify-between bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono font-bold text-amber-400 text-sm">{hp.physicalId}</div>
                              <div>
                                <p className="text-white text-xs font-medium">{hp.name}</p>
                                <p className="text-[#808080] text-[9px] font-mono">متبقي ~{remainMin} د</p>
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  await emit('room:release-held-seat', { roomId: gameState.roomId, physicalId: hp.physicalId });
                                } catch (err: any) { setError(err.message); }
                              }}
                              className="px-3 py-1.5 bg-red-900/30 border border-red-500/40 text-red-400 rounded-lg text-[9px] font-mono uppercase tracking-widest hover:bg-red-900/50 transition-colors"
                            >🔓 فك</button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })()}

              {/* ═══ المقاعد المثبّتة من القالب (Pinned Seats) ═══ */}
              {(() => {
                const pinned = (((gameState as any).pinnedSeats) || []) as any[];
                const tail = ((gameState as any).reservedTailSeats) || 0;
                const doors = (((gameState as any).doors) || []) as any[];
                const doorSeats = (((gameState as any).doorSeats) || []) as number[];
                if (pinned.length === 0 && !tail && doors.length === 0 && !templateChanged && !resyncReport) return null;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 bg-black/40 border border-purple-500/20 rounded-xl p-4 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
                    <div className={`flex items-center justify-between ${pinnedSeatsExpanded ? 'mb-3' : ''}`}>
                      <button
                        onClick={() => setPinnedSeatsExpanded((v) => !v)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-right"
                        title={pinnedSeatsExpanded ? 'طيّ القسم' : 'فتح القسم'}
                      >
                        <span className={`text-purple-400 text-[10px] transition-transform ${pinnedSeatsExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <span className="text-purple-400">📌</span>
                        <span className="text-white text-xs font-bold" style={{ fontFamily: 'Amiri, serif' }}>المقاعد المثبّتة من القالب ({pinned.length})</span>
                        {templateChanged && !pinnedSeatsExpanded && <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />}
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        {tail > 0 && <span className="text-[#808080] text-[8px] font-mono tracking-widest uppercase">TAIL {tail}</span>}
                        <button
                          onClick={doResyncTemplate}
                          disabled={resyncBusy}
                          title="يسحب آخر نسخة من القالب إلى هذه الغرفة (اللوبي فقط، بلا طرد لاعبين — يبلّغ عن التعارضات)"
                          className={`relative text-[10px] px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${templateChanged ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse' : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'}`}
                        >
                          {resyncBusy ? '...' : '🔄 تحديث من القالب'}
                          {templateChanged && <span className="absolute -top-1 -left-1 w-2 h-2 bg-amber-400 rounded-full" />}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence initial={false}>
                    {pinnedSeatsExpanded && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    {templateChanged && (
                      <p className="text-[10px] text-amber-400 mb-2">🔔 تغيّر القالب المرتبط بالفعالية — اضغط «تحديث من القالب» لتطبيقه على هذه الغرفة.</p>
                    )}
                    {resyncReport && (
                      <div className="mb-3 text-[10px] rounded-lg border border-[#2a2a2a] bg-black/40 p-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400">✅ تم التحديث — {resyncReport.pinned} مقعد مثبّت.</span>
                          <button onClick={() => setResyncReport(null)} className="text-gray-500 hover:text-white text-[9px]">إخفاء</button>
                        </div>
                        {resyncReport.capacityWarning && <p className="text-amber-400">⚠️ {resyncReport.capacityWarning}</p>}
                        {resyncReport.conflicts.length > 0 ? (
                          <div className="text-rose-300">
                            <p className="font-bold mb-0.5">تعارضات ({resyncReport.conflicts.length}) — لم تُغيَّر مقاعد اللاعبين تلقائياً:</p>
                            {resyncReport.conflicts.map((c, i) => <p key={i}>• {c}</p>)}
                          </div>
                        ) : <p className="text-gray-500">لا تعارضات.</p>}
                      </div>
                    )}

                    {/* الأبواب */}
                    {doors.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mb-3 pb-3 border-b border-[#1a1a1a]">
                        <span className="text-[10px] text-gray-500 ml-1">الأبواب:</span>
                        {doors.map((d: any, i: number) => (
                          <span key={i} className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${d.type === 'entry' ? 'bg-green-500/15 text-green-400' : 'bg-rose-500/15 text-rose-400'}`}>
                            🚪 {d.type === 'entry' ? 'دخول' : 'خروج'}
                          </span>
                        ))}
                        {doorSeats.length > 0 && <span className="text-[9px] text-gray-500">· مقاعد مجاورة: {doorSeats.join('، ')}</span>}
                      </div>
                    )}

                    {pinned.length === 0 ? (
                      <p className="text-[#808080] text-[10px] font-mono">{doors.length > 0 ? 'لا مقاعد مثبّتة' : `لا مقاعد مثبّتة — ${tail} مقاعد مؤخّرة محجوزة في التوزيع`}</p>
                    ) : (
                      <div className="space-y-2">
                        {pinned.slice().sort((a: any, b: any) => Number(a.seatNumber) - Number(b.seatNumber)).map((ps: any) => {
                          const occupant = gameState.players.find((p: any) => p.physicalId === Number(ps.seatNumber));
                          const filled = !!occupant;
                          return (
                            <div key={ps.seatNumber} className="flex items-center justify-between bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-sm ${filled ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-purple-500/10 border border-purple-500/30 text-purple-400'}`}>{ps.seatNumber}</div>
                                <div>
                                  <p className="text-white text-xs font-medium">{ps.playerName || 'محجوز'}</p>
                                  <p className="text-[9px] font-mono" style={{ color: filled ? '#4ade80' : '#a78bfa' }}>{filled ? 'حاضر ✓' : 'محجوز — بانتظار اللاعب'}</p>
                                </div>
                              </div>
                              <span className="text-[#555] text-[8px] font-mono uppercase tracking-widest">{ps.phone || (ps.playerId ? `#${ps.playerId}` : '')}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </motion.div>
                    )}
                    </AnimatePresence>
                  </motion.div>
                );
              })()}
            </div>

            {/* ══════ مودال تعديل الأرقام ══════ */}
            <AnimatePresence>
              {showRenumberModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                  onClick={() => setShowRenumberModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
                      <h3 className="text-lg font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>تعديل أرقام اللاعبين</h3>
                      <button onClick={() => setShowRenumberModal(false)} className="text-[#555] hover:text-white text-xl">✕</button>
                    </div>

                    {/* Error */}
                    {renumberError && (
                      <div className="mx-5 mt-3 p-2 bg-[#8A0303]/20 border border-[#8A0303] text-[#ff6666] text-xs font-mono text-center">
                        {renumberError}
                      </div>
                    )}

                    {/* Table Header */}
                    <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-[#1a1a1a] text-[9px] font-mono text-[#808080] uppercase tracking-widest">
                      <span className="text-center">الرقم الجديد</span>
                      <span className="text-center">الرقم القديم</span>
                      <span className="text-right">الاسم</span>
                    </div>

                    {/* Scrollable rows */}
                    <div className="flex-1 overflow-y-auto px-5 py-2">
                      {gameState.players
                        .slice()
                        .sort((a: any, b: any) => a.physicalId - b.physicalId)
                        .map((p: any) => {
                          const newVal = renumberMap[p.physicalId] ?? p.physicalId;
                          const isChanged = newVal !== p.physicalId;
                          // التحقق من التكرار
                          const allNewValues = Object.values(renumberMap);
                          const isDuplicate = allNewValues.filter(v => v === newVal).length > 1;

                          return (
                            <div key={p.physicalId} className={`grid grid-cols-3 gap-2 items-center py-2 border-b border-[#111] ${isDuplicate ? 'bg-[#8A0303]/10' : ''}`}>
                              {/* الرقم الجديد — input */}
                              <div className="flex justify-center">
                                <input
                                  type="number"
                                  value={newVal}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : p.physicalId;
                                    setRenumberMap(prev => ({ ...prev, [p.physicalId]: val }));
                                    setRenumberError('');
                                  }}
                                  min={1}
                                  max={99}
                                  className={`w-16 h-10 text-center font-mono font-black text-lg rounded border ${
                                    isDuplicate
                                      ? 'border-[#8A0303] text-[#ff4444] bg-[#8A0303]/20'
                                      : isChanged
                                        ? 'border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10'
                                        : 'border-[#2a2a2a] text-white bg-[#050505]'
                                  } focus:border-[#C5A059] focus:outline-none`}
                                />
                              </div>
                              {/* الرقم القديم */}
                              <div className="flex justify-center">
                                <span className={`w-10 h-10 flex items-center justify-center font-mono font-bold text-base rounded border ${
                                  isChanged ? 'border-[#555] text-[#555] line-through' : 'border-[#2a2a2a] text-[#808080]'
                                } bg-[#050505]`}>
                                  {p.physicalId}
                                </span>
                              </div>
                              {/* الاسم */}
                              <div className="text-right">
                                <span className="text-white text-sm font-bold" style={{ fontFamily: 'Amiri, serif' }}>{p.name}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-5 py-4 border-t border-[#2a2a2a] flex gap-3">
                      <button
                        onClick={async () => {
                          // بناء قائمة التغييرات
                          const changes = Object.entries(renumberMap).map(([oldId, newId]) => ({
                            oldPhysicalId: Number(oldId),
                            newPhysicalId: Number(newId),
                          }));

                          // التحقق محلياً من التكرار
                          const newIds = changes.map(c => c.newPhysicalId);
                          if (new Set(newIds).size !== newIds.length) {
                            setRenumberError('يوجد أرقام مكررة — كل لاعب يحتاج رقم مختلف');
                            return;
                          }

                          setRenumberLoading(true);
                          setRenumberError('');
                          try {
                            const res = await emit('room:renumber-players', {
                              roomId: gameState.roomId,
                              changes,
                            });
                            if (!res.success) throw new Error(res.error);

                            // تحديث الحالة المحلية فوراً
                            setGameState((prev: any) => {
                              if (!prev) return prev;
                              const updated = prev.players.map((p: any) => {
                                const change = changes.find((c: any) => c.oldPhysicalId === p.physicalId);
                                return change ? { ...p, physicalId: change.newPhysicalId } : p;
                              });
                              updated.sort((a: any, b: any) => a.physicalId - b.physicalId);
                              return { ...prev, players: updated };
                            });

                            setShowRenumberModal(false);
                          } catch (err: any) {
                            setRenumberError(err.message);
                          } finally {
                            setRenumberLoading(false);
                          }
                        }}
                        disabled={renumberLoading}
                        className="flex-1 bg-[#C5A059]/20 border border-[#C5A059] text-[#C5A059] py-3 font-mono uppercase tracking-widest text-xs hover:bg-[#C5A059]/30 disabled:opacity-40 transition-colors"
                      >
                        {renumberLoading ? '...' : '✓ حفظ الأرقام'}
                      </button>
                      <button
                        onClick={() => setShowRenumberModal(false)}
                        className="px-6 py-3 bg-zinc-800 border border-zinc-600 text-zinc-300 font-mono uppercase tracking-widest text-xs hover:bg-zinc-700 transition-colors"
                      >
                        إلغاء
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* أزرار التحكم */}
            <div className="flex flex-col items-center gap-4 mb-8">
              {gameState.players.length > 0 && (
                <button
                  onClick={() => {
                    setShowExcludeUI(!showExcludeUI);
                    if (showExcludeUI) setExcludedPlayers([]);
                  }}
                  className="text-[#555] text-xs font-mono uppercase tracking-[0.15em] hover:text-[#C5A059] transition-colors border border-[#2a2a2a] px-4 py-2 hover:border-[#C5A059]"
                >
                  {showExcludeUI ? '✕ إلغاء الاستبعاد' : '👥 استبعاد لاعبين'}
                </button>
              )}

              {showExcludeUI && excludedPlayers.length > 0 && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[#8A0303] text-xs font-mono">
                    سيتم استبعاد {excludedPlayers.length} لاعب
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        // حذف كل لاعب محدد واحد واحد
                        for (const pid of excludedPlayers) {
                          await emit('room:kick-player', { roomId: gameState.roomId, physicalId: pid });
                        }
                        // تحديث الحالة المحلية
                        setGameState((prev: any) => prev ? {
                          ...prev,
                          players: prev.players.filter((p: any) => !excludedPlayers.includes(p.physicalId)),
                        } : prev);
                        setExcludedPlayers([]);
                        setShowExcludeUI(false);
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="text-[#8A0303] text-xs font-mono uppercase tracking-[0.15em] hover:text-red-500 transition-colors border border-[#8A0303]/40 px-6 py-2 hover:border-[#8A0303] hover:bg-[#8A0303]/10"
                  >
                    ✓ تأكيد استبعاد {excludedPlayers.length} لاعب
                  </button>
                </div>
              )}

              {/* Night Mode Toggle for Session View */}
              <div className="flex flex-col items-center gap-2 mb-6">
                <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">NIGHT PHASE MODE</span>
                <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 w-64 mx-auto">
                  <button
                    onClick={async () => {
                      const res = await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'manual' });
                      if (res?.success) setGameState((prev: any) => ({ ...prev, config: { ...prev.config, nightMode: 'manual' } }));
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                      (gameState.config as any).nightMode !== 'auto'
                        ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                        : 'text-[#666] hover:text-[#aaa]'
                    }`}
                  >
                    MANUAL
                  </button>
                  <button
                    onClick={async () => {
                      const res = await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'auto' });
                      if (res?.success) setGameState((prev: any) => ({ ...prev, config: { ...prev.config, nightMode: 'auto' } }));
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                      (gameState.config as any).nightMode === 'auto'
                        ? 'bg-[#1a1a1a] text-[#C5A059] shadow-md border border-[#C5A059]/40'
                        : 'text-[#666] hover:text-[#aaa]'
                    }`}
                  >
                    AUTO
                  </button>
                </div>
              </div>

              {/* ⏱️ Game Timer Toggle */}
              <div className="flex flex-col items-center gap-2 mb-4">
                <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">⏱️ GAME TIMER</span>
                <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 mx-auto">
                  {[
                    { label: 'OFF', value: 0 },
                    { label: '30 دقيقة', value: 30 },
                    { label: 'ساعة', value: 60 },
                    { label: 'ساعة ونصف', value: 90 },
                  ].map(opt => {
                    const isActive = opt.value === 0 
                      ? !(gameState.config as any).gameTimerEnabled
                      : (gameState.config as any).gameTimerEnabled && (gameState.config as any).gameTimerMinutes === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={async () => {
                          const res = await emit('game:set-timer', { 
                            roomId: gameState.roomId, 
                            enabled: opt.value > 0,
                            minutes: opt.value || 30,
                          });
                          if (res?.success) setGameState((prev: any) => ({ ...prev, config: { ...prev.config, gameTimerEnabled: opt.value > 0, gameTimerMinutes: opt.value || 30 } }));
                        }}
                        className={`py-2.5 px-3 rounded-lg text-[11px] font-mono transition-all ${
                          isActive
                            ? opt.value === 0 
                              ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                              : 'bg-[#1a1a1a] text-[#C5A059] shadow-md border border-[#C5A059]/40'
                            : 'text-[#666] hover:text-[#aaa]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* زر بدء اللعبة — يقفز مباشرة لـ ROLE_GENERATION */}
              <button
                onClick={async () => {
                  const effectivePlayers = gameState.players.length - excludedPlayers.length;
                  if (effectivePlayers < 6) {
                    setError('يجب إضافة 6 لاعبين على الأقل');
                    return;
                  }
                  try {
                    const currentScope = (gameState.config as any)?.penaltyScope || 'room';
                    const hasActivePenalties = gameState.players.some((p: any) => (p.penalties || 0) > 0 && !excludedPlayers.includes(p.physicalId));
                    
                    let resetPenalties = true;
                    if (hasActivePenalties && currentScope === 'room') {
                      resetPenalties = (await swalConfirm(
                        '⚖️ يوجد لاعبون عليهم عقوبات من الجيم السابق.\n\n' +
                        '✅ موافق = تصفير العقوبات (بداية جديدة)\n' +
                        '❌ إلغاء = إبقاء العقوبات (مستوى الروم)'
                      ));
                    }

                    if (excludedPlayers.length > 0) {
                      const res = await emit('room:new-game', {
                        roomId: gameState.roomId,
                        excludePlayerIds: excludedPlayers,
                        resetPenalties,
                      });
                      if (res.success) {
                        setGameState((prev: any) => prev ? {
                          ...prev,
                          players: (res.players || []).map((p: any) => ({
                            ...p, isAlive: true, isSilenced: false, role: null,
                          })),
                          winner: undefined,
                          phase: 'LOBBY',
                        } : prev);
                      }
                    }
                    await emit('room:start-generation', { roomId: gameState.roomId });
                    setExcludedPlayers([]);
                    setShowExcludeUI(false);
                    setInSession(false);
                  } catch (err: any) {
                    console.error('❌ Start game error:', err);
                    alert('خطأ: ' + (err.message || 'فشل بدء اللعبة'));
                  }
                }}
                disabled={gameState.players.length - excludedPlayers.length < 6}
                className="btn-premium !px-12 !py-4 !text-lg tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>🎮 بدء لعبة جديدة ({gameState.players.length - excludedPlayers.length} لاعب)</span>
              </button>
            </div>

            {/* قسم تاريخ الألعاب السابقة — جدول */}
            {sessionMatches.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-mono tracking-[0.3em] text-[#555] uppercase mb-4">
                  MATCH HISTORY ({sessionMatches.length})
                </h3>

                {/* الجدول */}
                <div className="border border-[#2a2a2a] rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[50px_1fr_80px_90px] bg-[#0a0a0a] border-b border-[#2a2a2a] px-4 py-2.5">
                    <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest">#</span>
                    <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest">الفائز</span>
                    <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest text-center">المدة</span>
                    <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest text-center">إجراءات</span>
                  </div>

                  {/* Rows */}
                  {sessionMatches.map((match: any, index: number) => {
                    const gameNumber = sessionMatches.length - index; // ترقيم من 1 (الأحدث رقمه الأعلى)
                    const isMafiaWin = match.winner === 'MAFIA';
                    const mins = match.durationSeconds ? Math.floor(match.durationSeconds / 60) : 0;
                    const secs = match.durationSeconds ? match.durationSeconds % 60 : 0;
                    const isActive = selectedMatch?.id === match.id;

                    return (
                      <div
                        key={match.id}
                        className={`grid grid-cols-[50px_1fr_80px_90px] items-center px-4 py-3 border-b border-[#1a1a1a] transition-colors ${
                          isActive ? 'bg-[#C5A059]/5' : 'bg-[#050505] hover:bg-[#0c0c0c]'
                        }`}
                      >
                        {/* رقم اللعبة */}
                        <span className="text-[#C5A059] font-mono text-sm font-bold">{gameNumber}</span>

                        {/* الفائز */}
                        <span className={`text-sm font-bold ${
                          isMafiaWin ? 'text-[#8A0303]' : 'text-[#2E5C31]'
                        }`}>
                          {isMafiaWin ? '🩸 المافيا' : '⚖️ المدينة'}
                        </span>

                        {/* المدة */}
                        <span className="text-[#808080] font-mono text-xs text-center">
                          {match.durationSeconds ? `${mins}:${secs.toString().padStart(2, '0')}` : '--:--'}
                        </span>

                        {/* زر عرض النتيجة على شاشة العرض */}
                        <div className="flex justify-center">
                          <button
                            onClick={async () => {
                              if (isActive) {
                                setSelectedMatch(null);
                                emit('display:hide-replay', { roomId: gameState.roomId });
                              } else {
                                handleViewMatch(match.id);
                                emit('display:show-replay', {
                                  roomId: gameState.roomId,
                                  matchId: match.id,
                                });
                              }
                            }}
                            className={`text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded border transition-all ${
                              isActive
                                ? 'bg-[#C5A059]/20 border-[#C5A059]/50 text-[#C5A059]'
                                : 'bg-[#111] border-[#2a2a2a] text-[#808080] hover:text-[#C5A059] hover:border-[#C5A059]/30'
                            }`}
                          >
                            {isActive ? '✕ إخفاء' : '📺 عرض'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <p className="text-[#8A0303] mt-2 text-xs font-mono text-center tracking-widest uppercase">{error}</p>}
          </div>

          {/* ═══ مودال تعديل الأسماء (Session View) ═══ */}
          <AnimatePresence>
            {showAdminRename && (
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setShowAdminRename(false); setAdminRenameTarget(null); }}
              >
                <motion.div
                  className="noir-card p-6 mx-4 w-full max-w-md border-[#C5A059]/30 relative"
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent" />
                  
                  <h3 className="text-xl font-black text-[#C5A059] mb-1 text-center" style={{ fontFamily: 'Amiri, serif' }}>
                    تعديل الأسماء
                  </h3>
                  <p className="text-[#555] text-[10px] font-mono tracking-widest uppercase text-center mb-6">
                    RENAME AGENTS
                  </p>

                  {/* شبكة أرقام اللاعبين */}
                  <div className="grid grid-cols-5 gap-3 mb-6">
                    {gameState.players.map((p: any) => {
                      const isTarget = adminRenameTarget?.physicalId === p.physicalId;
                      return (
                        <button
                          key={p.physicalId}
                          onClick={() => setAdminRenameTarget({ physicalId: p.physicalId, name: p.name })}
                          className={`flex flex-col items-center gap-1 p-3 bg-[#111] border rounded-lg transition-all group ${
                            isTarget
                              ? 'border-[#C5A059] bg-[#C5A059]/10'
                              : 'border-[#2a2a2a] hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5'
                          }`}
                        >
                          <span className={`text-2xl font-black font-mono transition-colors ${
                            isTarget ? 'text-[#C5A059]' : 'text-white group-hover:text-[#C5A059]'
                          }`}>
                            {p.physicalId}
                          </span>
                          <span className={`text-[8px] font-mono truncate max-w-full transition-colors ${
                            isTarget ? 'text-[#C5A059]/70' : 'text-[#555] group-hover:text-[#C5A059]/50'
                          }`}>
                            {p.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* حقل تعديل الاسم — يظهر عند اختيار لاعب */}
                  <AnimatePresence>
                    {adminRenameTarget && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mb-4"
                      >
                        <div className="bg-[#0a0a0a] border border-[#C5A059]/30 rounded-lg p-4">
                          <p className="text-[#C5A059] text-[9px] font-mono tracking-widest uppercase mb-2 text-center">
                            AGENT #{adminRenameTarget.physicalId}
                          </p>
                          <input
                            type="text"
                            value={adminRenameTarget.name}
                            onChange={(e) => setAdminRenameTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && adminRenameTarget.name.trim()) {
                                setAdminRenameLoading(true);
                                emit('room:override-player', {
                                  roomId: gameState.roomId,
                                  physicalId: adminRenameTarget.physicalId,
                                  name: adminRenameTarget.name.trim(),
                                  isNew: false,
                                })
                                  .then(() => setAdminRenameTarget(null))
                                  .catch((err: any) => setError(err.message))
                                  .finally(() => setAdminRenameLoading(false));
                              }
                              if (e.key === 'Escape') setAdminRenameTarget(null);
                            }}
                            autoFocus
                            className="w-full p-3 bg-[#050505] border border-[#2a2a2a] rounded text-white text-center font-mono focus:border-[#C5A059] focus:outline-none mb-3"
                            dir="rtl"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (!adminRenameTarget.name.trim()) return;
                                setAdminRenameLoading(true);
                                emit('room:override-player', {
                                  roomId: gameState.roomId,
                                  physicalId: adminRenameTarget.physicalId,
                                  name: adminRenameTarget.name.trim(),
                                  isNew: false,
                                })
                                  .then(() => setAdminRenameTarget(null))
                                  .catch((err: any) => setError(err.message))
                                  .finally(() => setAdminRenameLoading(false));
                              }}
                              disabled={adminRenameLoading || !adminRenameTarget.name.trim()}
                              className="flex-1 py-2.5 bg-[#C5A059]/20 border border-[#C5A059] text-[#C5A059] text-xs font-mono uppercase tracking-widest hover:bg-[#C5A059]/30 transition-all disabled:opacity-40 rounded"
                            >
                              {adminRenameLoading ? '...' : '✓ حفظ'}
                            </button>
                            <button
                              onClick={() => setAdminRenameTarget(null)}
                              className="flex-1 py-2.5 bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono uppercase tracking-widest hover:bg-zinc-700 transition-all rounded"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={() => { setShowAdminRename(false); setAdminRenameTarget(null); }}
                    className="w-full py-2 text-[#555] text-xs font-mono uppercase tracking-widest hover:text-white transition-colors border border-[#2a2a2a] hover:border-[#555]"
                  >
                    إغلاق
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── مودال تصفير/إبقاء العقوبات — داخل Session View ── */}
          {(() => {
            if (!pendingNewGameAction || !gameState) return null;
            const gs: any = gameState;
            const penalizedPlayers = gs.players.filter((p: any) => (p.penalties || 0) > 0 && !(pendingNewGameAction.excludePlayerIds || []).includes(p.physicalId));
            const maxPen = gs.config?.maxPenalties || 3;
            return (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
              <div className="bg-[#0a0a0a] border border-[#C5A059]/30 rounded-2xl p-6 sm:p-8 w-full max-w-sm shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#C5A059] to-transparent" />
                <div className="text-center mb-6">
                  <div className="text-3xl mb-3">⚖️</div>
                  <h3 className="text-[#C5A059] text-lg font-bold mb-2" style={{ fontFamily: 'Amiri, serif' }}>العقوبات الفعّالة</h3>
                  <p className="text-[#888] text-xs leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                    يوجد لاعبون عليهم عقوبات من الجيم السابق. ماذا تريد أن تفعل؟
                  </p>
                </div>
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3 mb-6">
                  {penalizedPlayers.map((p: any) => (
                    <div key={p.physicalId} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a] last:border-0">
                      <span className="text-white text-xs font-mono">#{p.physicalId} {p.name}</span>
                      <div className="flex gap-1">
                        {Array.from({ length: maxPen }).map((_: any, i: number) => (
                          <span key={i} className={`w-2 h-2 rounded-full ${i < (p.penalties || 0) ? 'bg-red-600 shadow-[0_0_4px_#dc2626]' : 'bg-neutral-800'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={async () => {
                      const action = pendingNewGameAction;
                      setPendingNewGameAction(null);
                      try {
                        if (action.type === 'new-game-start') {
                          if (action.excludePlayerIds && action.excludePlayerIds.length > 0) {
                            const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds, resetPenalties: false });
                            if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                          }
                          await emit('room:start-generation', { roomId: gs.roomId });
                          setExcludedPlayers([]); setShowExcludeUI(false); setInSession(false);
                        } else if (action.type === 'new-game-return') {
                          const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds || [], resetPenalties: false });
                          if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                          setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                        } else {
                          const res = await emit('room:reset-to-lobby', { roomId: gs.roomId, resetPenalties: false });
                          if (res.success) setGameState((prev: any) => prev ? { ...prev, phase: 'LOBBY', winner: undefined, rolesPool: [], votingState: undefined, discussionState: undefined, players: (res.players || prev.players).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })) } : prev);
                          setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                        }
                      } catch (err: any) { setError(err.message); }
                    }}
                    className="w-full py-3.5 rounded-xl bg-[#1a1a1a] border border-[#C5A059]/40 text-[#C5A059] font-bold text-sm tracking-wide hover:bg-[#222] transition-all shadow-[0_0_15px_rgba(197,160,89,0.1)]"
                    style={{ fontFamily: 'Amiri, serif' }}
                  >
                    ⚠️ إبقاء العقوبات (مستوى الروم)
                  </button>
                  <button
                    onClick={async () => {
                      const action = pendingNewGameAction;
                      setPendingNewGameAction(null);
                      try {
                        if (action.type === 'new-game-start') {
                          if (action.excludePlayerIds && action.excludePlayerIds.length > 0) {
                            const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds, resetPenalties: true });
                            if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                          }
                          await emit('room:start-generation', { roomId: gs.roomId });
                          setExcludedPlayers([]); setShowExcludeUI(false); setInSession(false);
                        } else if (action.type === 'new-game-return') {
                          const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds || [], resetPenalties: true });
                          if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                          setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                        } else {
                          const res = await emit('room:reset-to-lobby', { roomId: gs.roomId, resetPenalties: true });
                          if (res.success) setGameState((prev: any) => prev ? { ...prev, phase: 'LOBBY', winner: undefined, rolesPool: [], votingState: undefined, discussionState: undefined, players: (res.players || prev.players).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })) } : prev);
                          setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                        }
                      } catch (err: any) { setError(err.message); }
                    }}
                    className="w-full py-3.5 rounded-xl bg-[#111] border border-green-800/30 text-green-400 font-bold text-sm tracking-wide hover:bg-[#1a1a1a] transition-all"
                    style={{ fontFamily: 'Amiri, serif' }}
                  >
                    ✅ تصفير العقوبات (بداية جديدة)
                  </button>
                  <button
                    onClick={() => setPendingNewGameAction(null)}
                    className="w-full py-2.5 text-[#555] text-xs font-mono tracking-widest uppercase hover:text-white transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // بعد إنشاء / استعادة اللعبة
  // ══════════════════════════════════════════════════
  if (gameState) {
    return (
      <div className="display-bg min-h-screen font-sans relative overflow-hidden blood-vignette selection:bg-[#8A0303] selection:text-white flex flex-col">
        <div className="relative z-10 w-full h-full flex flex-col flex-1">
          {soundToggleBtn}
          {/* ═══ Unified Global Header ═══ */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]/60 bg-[#050505]/70 backdrop-blur-sm shrink-0">
            {/* Left: Logo + MAFIA CLUB */}
            <div className="flex items-center gap-3">
              <Image src="/mafia_logo.png" alt="Mafia" width={36} height={36} className="w-[32px] h-[32px] drop-shadow-[0_0_10px_rgba(138,3,3,0.3)]" priority />
              <div className="flex flex-col items-start leading-none">
                <span className="text-base font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>MAFIA</span>
                <span className="flex justify-between w-full text-[8px] font-light text-[#8A0303]" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l: string, i: number) => <span key={i}>{l}</span>)}</span>
              </div>
              <span className="mx-2 text-[#2a2a2a]">|</span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#555]">
                <span className="text-[#C5A059] font-bold">{gameState.phase}</span>
              </span>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-4">
              {/* زر تعديل الأسماء — يظهر فقط قبل توزيع الأدوار */}
              {(gameState.phase === 'LOBBY' || gameState.phase === 'ROLE_GENERATION') && gameState.players.length > 0 && (
                <button
                  onClick={() => setShowAdminRename(true)}
                  className="text-[#C5A059] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/30 px-3 py-1.5 hover:border-[#C5A059]"
                >
                  ✏️ تعديل أسماء
                </button>
              )}
              {/* زر الإقصاء الإداري — يظهر فقط أثناء اللعبة */}
              {gameState.phase !== 'LOBBY' && gameState.phase !== 'GAME_OVER' && (
                <button
                  onClick={() => {
                    setShowAdminEliminate(true);
                    // 📋 توثيق «فتح قائمة الإقصاء الإداري» لحظة الفتح (حدث مستقل، إرسال مباشر بلا انتظار رد)
                    import('@/lib/socket').then((m) => { try { m.getSocket().emit('ui:admin-eliminate-open', { roomId: gameState.roomId }); } catch { /* تجاهل */ } }).catch(() => {});
                  }}
                  className="text-[#C5A059] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/30 px-3 py-1.5 hover:border-[#C5A059]"
                >
                  ⚡ إقصاء
                </button>
              )}
              <button
                onClick={() => { setGameState(null); setInSession(false); setSelectedMatch(null); fetchActiveGames(); fetchHistory(); }}
                className="text-[#555] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-white transition-colors border border-[#2a2a2a] px-3 py-1.5 hover:border-[#555]"
              >
                ← Return
              </button>
              <button
                onClick={handleCloseRoom}
                className="text-[#8A0303] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-red-500 transition-colors border border-[#8A0303]/30 px-3 py-1.5 hover:border-[#8A0303]"
              >
                ✕ Terminate
              </button>
              <button
                onClick={handleDeleteRoom}
                className="text-[#ff0000] text-[10px] font-mono uppercase tracking-[0.15em] hover:text-red-300 transition-colors border border-[#ff0000]/30 px-3 py-1.5 hover:border-[#ff0000] bg-[#ff0000]/5"
              >
                🗑️ Delete Room
              </button>
            </div>
          </div>

          {/* ═══ مودال الإقصاء الإداري ═══ */}
          <AnimatePresence>
            {showAdminEliminate && (
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAdminEliminate(false)}
              >
                <motion.div
                  className="noir-card p-6 mx-4 w-full max-w-md border-[#C5A059]/30 relative"
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent" />
                  
                  <h3 className="text-xl font-black text-[#C5A059] mb-1 text-center" style={{ fontFamily: 'Amiri, serif' }}>
                    إقصاء إداري
                  </h3>
                  <p className="text-[#555] text-[10px] font-mono tracking-widest uppercase text-center mb-6">
                    ADMIN ELIMINATION
                  </p>

                  {/* شبكة أرقام اللاعبين */}
                  <div className="grid grid-cols-5 gap-3 mb-6">
                    {gameState.players
                      .filter((p: any) => p.isAlive)
                      .map((p: any) => (
                        <button
                          key={p.physicalId}
                          onClick={async () => {
                            if (!(await swalConfirm(`هل أنت متأكد من إقصاء ${p.name} (#${p.physicalId})؟`))) return;
                            try {
                              const res = await emit('admin:eliminate', {
                                roomId: gameState.roomId,
                                physicalId: p.physicalId,
                              });
                              if (!res.success) throw new Error(res.error || 'فشل الإقصاء');
                              // تحديث اللاعب محلياً
                              setGameState(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  players: prev.players.map((pl: any) =>
                                    pl.physicalId === p.physicalId ? { ...pl, isAlive: false } : pl
                                  ),
                                } as any;
                              });
                              setShowAdminEliminate(false);
                              // عرض كارد الإقصاء مع الدور المكشوف
                              setAdminRevealData({
                                physicalId: p.physicalId,
                                name: p.name,
                                role: res.role || p.role || 'UNKNOWN',
                              });
                              // إرسال الكشف لشاشة العرض
                              emit('admin:reveal-eliminated', {
                                roomId: gameState.roomId,
                                physicalId: p.physicalId,
                                playerName: p.name,
                                role: res.role || p.role || 'UNKNOWN',
                              }).catch(() => {});
                            } catch (err: any) {
                              setError(err.message);
                            }
                          }}
                          className="flex flex-col items-center gap-1 p-3 bg-[#111] border border-[#2a2a2a] rounded-lg hover:border-[#8A0303] hover:bg-[#8A0303]/10 transition-all group"
                        >
                          <span className="text-2xl font-black text-white group-hover:text-[#8A0303] transition-colors font-mono">
                            {p.physicalId}
                          </span>
                          <span className="text-[8px] text-[#555] font-mono truncate max-w-full group-hover:text-[#8A0303]/60">
                            {p.name}
                          </span>
                        </button>
                      ))}
                  </div>

                  <button
                    onClick={() => setShowAdminEliminate(false)}
                    className="w-full py-2 text-[#555] text-xs font-mono uppercase tracking-widest hover:text-white transition-colors border border-[#2a2a2a] hover:border-[#555]"
                  >
                    إلغاء
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ Overlay كشف دور اللاعب المُقصى ═══ */}
          <AnimatePresence>
            {adminRevealData && (
              <motion.div
                className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  initial={{ scale: 0.5, rotateY: 180 }}
                  animate={{ scale: 1, rotateY: 0 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="mb-8"
                >
                  <MafiaCard
                    playerNumber={adminRevealData.physicalId}
                    playerName={adminRevealData.name}
                    role={adminRevealData.role}
                    isFlipped={true}
                    flippable={false}
                    isAlive={false}
                    size="lg"
                    avatarUrl={gameState.players.find((p: any) => p.physicalId === adminRevealData.physicalId)?.avatarUrl}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-center"
                >
                  <h3 className="text-2xl font-black text-[#8A0303] mb-2" style={{ fontFamily: 'Amiri, serif' }}>
                    تم الإقصاء الإداري
                  </h3>
                  <p className="text-[#808080] text-xs font-mono uppercase tracking-widest mb-6">
                    ADMIN ELIMINATION — IDENTITY REVEALED
                  </p>
                  <button
                    onClick={() => {
                      // إرسال أمر إخفاء الكشف عن الـ Display
                      emit('admin:dismiss-reveal', { roomId: gameState.roomId }).catch(() => {});
                      setAdminRevealData(null);
                    }}
                    className="btn-premium !px-10 !py-3"
                  >
                    <span>▶ إكمال</span>
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ مودال تعديل الأسماء ═══ */}
          <AnimatePresence>
            {showAdminRename && (
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setShowAdminRename(false); setAdminRenameTarget(null); }}
              >
                <motion.div
                  className="noir-card p-6 mx-4 w-full max-w-md border-[#C5A059]/30 relative"
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent" />
                  
                  <h3 className="text-xl font-black text-[#C5A059] mb-1 text-center" style={{ fontFamily: 'Amiri, serif' }}>
                    تعديل الأسماء
                  </h3>
                  <p className="text-[#555] text-[10px] font-mono tracking-widest uppercase text-center mb-6">
                    RENAME AGENTS
                  </p>

                  {/* شبكة أرقام اللاعبين */}
                  <div className="grid grid-cols-5 gap-3 mb-6">
                    {gameState.players.map((p: any) => {
                      const isTarget = adminRenameTarget?.physicalId === p.physicalId;
                      return (
                        <button
                          key={p.physicalId}
                          onClick={() => setAdminRenameTarget({ physicalId: p.physicalId, name: p.name })}
                          className={`flex flex-col items-center gap-1 p-3 bg-[#111] border rounded-lg transition-all group ${
                            isTarget
                              ? 'border-[#C5A059] bg-[#C5A059]/10'
                              : 'border-[#2a2a2a] hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5'
                          }`}
                        >
                          <span className={`text-2xl font-black font-mono transition-colors ${
                            isTarget ? 'text-[#C5A059]' : 'text-white group-hover:text-[#C5A059]'
                          }`}>
                            {p.physicalId}
                          </span>
                          <span className={`text-[8px] font-mono truncate max-w-full transition-colors ${
                            isTarget ? 'text-[#C5A059]/70' : 'text-[#555] group-hover:text-[#C5A059]/50'
                          }`}>
                            {p.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* حقل تعديل الاسم — يظهر عند اختيار لاعب */}
                  <AnimatePresence>
                    {adminRenameTarget && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mb-4"
                      >
                        <div className="bg-[#0a0a0a] border border-[#C5A059]/30 rounded-lg p-4">
                          <p className="text-[#C5A059] text-[9px] font-mono tracking-widest uppercase mb-2 text-center">
                            AGENT #{adminRenameTarget.physicalId}
                          </p>
                          <input
                            type="text"
                            value={adminRenameTarget.name}
                            onChange={(e) => setAdminRenameTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && adminRenameTarget.name.trim()) {
                                setAdminRenameLoading(true);
                                emit('room:override-player', {
                                  roomId: gameState.roomId,
                                  physicalId: adminRenameTarget.physicalId,
                                  name: adminRenameTarget.name.trim(),
                                  isNew: false,
                                })
                                  .then(() => setAdminRenameTarget(null))
                                  .catch((err: any) => setError(err.message))
                                  .finally(() => setAdminRenameLoading(false));
                              }
                              if (e.key === 'Escape') setAdminRenameTarget(null);
                            }}
                            autoFocus
                            className="w-full p-3 bg-[#050505] border border-[#2a2a2a] rounded text-white text-center font-mono focus:border-[#C5A059] focus:outline-none mb-3"
                            dir="rtl"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (!adminRenameTarget.name.trim()) return;
                                setAdminRenameLoading(true);
                                emit('room:override-player', {
                                  roomId: gameState.roomId,
                                  physicalId: adminRenameTarget.physicalId,
                                  name: adminRenameTarget.name.trim(),
                                  isNew: false,
                                })
                                  .then(() => setAdminRenameTarget(null))
                                  .catch((err: any) => setError(err.message))
                                  .finally(() => setAdminRenameLoading(false));
                              }}
                              disabled={adminRenameLoading || !adminRenameTarget.name.trim()}
                              className="flex-1 py-2.5 bg-[#C5A059]/20 border border-[#C5A059] text-[#C5A059] text-xs font-mono uppercase tracking-widest hover:bg-[#C5A059]/30 transition-all disabled:opacity-40 rounded"
                            >
                              {adminRenameLoading ? '...' : '✓ حفظ'}
                            </button>
                            <button
                              onClick={() => setAdminRenameTarget(null)}
                              className="flex-1 py-2.5 bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-mono uppercase tracking-widest hover:bg-zinc-700 transition-all rounded"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    onClick={() => { setShowAdminRename(false); setAdminRenameTarget(null); }}
                    className="w-full py-2 text-[#555] text-xs font-mono uppercase tracking-widest hover:text-white transition-colors border border-[#2a2a2a] hover:border-[#555]"
                  >
                    إغلاق
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Main Content based on Phase ── */}
          {/* ⏱️ شريط مؤقت اللعبة */}
          {gameTimerData && !gameTimerData.expired && gameState.phase !== 'LOBBY' && gameState.phase !== 'GAME_OVER' && (
            <div className="mx-4 mt-2 mb-1 relative">
              <div className={`px-4 py-2 rounded-xl border flex items-center justify-between font-mono text-sm backdrop-blur-md transition-all ${
                gameTimerRemaining <= 60 
                  ? 'bg-red-900/40 border-red-500/60 animate-pulse' 
                  : gameTimerRemaining <= gameTimerData.totalSeconds * 0.25 
                    ? 'bg-red-900/20 border-red-500/30' 
                    : gameTimerRemaining <= gameTimerData.totalSeconds * 0.5 
                      ? 'bg-yellow-900/20 border-yellow-500/30' 
                      : 'bg-black/40 border-[#2a2a2a]'
              }`}>
                <span className="text-[10px] tracking-widest uppercase text-[#808080]">⏱️ مؤقت اللعبة</span>
                <span className={`font-bold text-lg tabular-nums ${
                  gameTimerRemaining <= 60 ? 'text-red-400' 
                  : gameTimerRemaining <= gameTimerData.totalSeconds * 0.25 ? 'text-red-300' 
                  : gameTimerRemaining <= gameTimerData.totalSeconds * 0.5 ? 'text-yellow-400' 
                  : 'text-[#C5A059]'
                }`}>
                  {Math.floor(gameTimerRemaining / 60).toString().padStart(2, '0')}:{Math.floor(gameTimerRemaining % 60).toString().padStart(2, '0')}
                </span>
                <div className="flex items-center gap-3">
                  {/* شريط التقدم */}
                  <div className="w-24 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        gameTimerRemaining <= 60 ? 'bg-red-500' 
                        : gameTimerRemaining <= gameTimerData.totalSeconds * 0.25 ? 'bg-red-400' 
                        : gameTimerRemaining <= gameTimerData.totalSeconds * 0.5 ? 'bg-yellow-500' 
                        : 'bg-[#C5A059]'
                      }`}
                      style={{ width: `${Math.min(100, (gameTimerRemaining / gameTimerData.totalSeconds) * 100)}%` }}
                    />
                  </div>
                  {/* زر الإعدادات */}
                  <button
                    onClick={() => setShowTimerAdjust(!showTimerAdjust)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all text-xs ${
                      showTimerAdjust 
                        ? 'bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059]' 
                        : 'bg-[#111] border-[#333] text-[#808080] hover:border-[#C5A059] hover:text-[#C5A059]'
                    }`}
                  >
                    ⚙️
                  </button>
                </div>
              </div>

              {/* قائمة تعديل المدة */}
              <AnimatePresence>
                {showTimerAdjust && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scaleY: 0.8 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    exit={{ opacity: 0, y: -8, scaleY: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 right-0 mt-1 z-40 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3 backdrop-blur-xl shadow-2xl"
                    style={{ transformOrigin: 'top center' }}
                  >
                    <p className="text-[9px] font-mono text-[#808080] tracking-widest uppercase text-center mb-2">تعديل مدة اللعبة</p>
                    <div className="flex items-center justify-center gap-2">
                      {[
                        { label: '-10', delta: -10, color: 'text-red-400 border-red-500/40 hover:bg-red-500/10' },
                        { label: '-5', delta: -5, color: 'text-red-300 border-red-400/30 hover:bg-red-400/10' },
                        { label: '+5', delta: 5, color: 'text-green-400 border-green-500/30 hover:bg-green-500/10' },
                        { label: '+10', delta: 10, color: 'text-green-300 border-green-400/30 hover:bg-green-400/10' },
                      ].map(opt => (
                        <button
                          key={opt.delta}
                          onClick={async () => {
                            try {
                              const res = await emit('game:adjust-game-timer', {
                                roomId: gameState.roomId,
                                deltaMinutes: opt.delta,
                              });
                              if (!res?.success) setError(res?.error || 'فشل تعديل المدة');
                              setShowTimerAdjust(false);
                            } catch (err: any) {
                              setError(err.message);
                            }
                          }}
                          className={`px-4 py-2 rounded-lg border font-mono text-sm font-bold transition-all ${opt.color}`}
                        >
                          {opt.label} د
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
          {gameState.phase === 'LOBBY' && (
            <LeaderLobbyView gameState={gameState} emit={emit} setError={setError} />
          )}

          {gameState.phase === 'ROLE_GENERATION' && (
            <LeaderRoleConfigurator gameState={gameState} emit={emit} setError={setError} />
          )}

          {gameState.phase === 'ROLE_BINDING' && (
            <LeaderRoleBinding gameState={gameState} emit={emit} setError={setError} />
          )}

          {(gameState.phase.startsWith('DAY_')) && (
            <LeaderDayView gameState={gameState} emit={emit} setError={setError} />
          )}

          {(gameState.phase === 'NIGHT' || gameState.phase === 'MORNING_RECAP') && (
            <>
              {/* ═══ Auto Night Control Panel — لوحة تحكم الليدر ═══ */}
              {gameState.phase === 'NIGHT' && (gameState.config as any).nightMode === 'auto' && (
                <div className="mb-4 px-1" dir="rtl">
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4">
                    {/* عنوان */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono text-[#808080] tracking-widest">🌙 AUTO NIGHT</span>
                      {autoNightProgress && (
                        <span className="text-xs font-mono text-[#C5A059]">
                          {autoNightProgress.submitted} / {autoNightProgress.total} أرسلوا
                        </span>
                      )}
                    </div>

                    {/* الخطوة الحالية */}
                    {autoNightStep ? (
                      <div className="space-y-3">
                        {/* معلومات الخطوة */}
                        <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-3 text-center">
                          <p className="text-[9px] font-mono text-[#666] tracking-widest uppercase mb-1">CURRENT STEP</p>
                          <p className="text-[#C5A059] font-black text-lg" style={{ fontFamily: 'Amiri, serif' }}>
                            {autoNightStep.roleName}
                          </p>
                          <p className="text-[#555] text-xs font-mono mt-1">
                            #{autoNightStep.performerPhysicalId} — {autoNightStep.performerName}
                          </p>
                          <p className="text-[10px] text-[#444] font-mono mt-1">
                            المدة: {customNightTimer || autoNightStep.timeoutSeconds} ثانية
                          </p>
                          {!autoNightStep.dispatched && (
                            <div className="mt-2 flex items-center justify-center gap-2">
                              {[15, 20, 30].map(t => (
                                <button
                                  key={t}
                                  onClick={() => setCustomNightTimer(t)}
                                  className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                                    (customNightTimer === t) || (!customNightTimer && autoNightStep.timeoutSeconds === t)
                                      ? 'bg-[#C5A059] text-black font-bold'
                                      : 'bg-[#111] text-[#808080] border border-[#2a2a2a] hover:border-[#C5A059]'
                                  }`}
                                >
                                  {t}s
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* زر بدء الخطوة أو حالة التقدم */}
                        {!autoNightStep.dispatched ? (
                          <button
                            onClick={async () => {
                              // تعيين فوري لمنع الضغط المزدوج
                              setAutoNightStep(prev => prev ? { ...prev, dispatched: true } : null);
                              try {
                                const res = await emit('night:auto-advance-step', { 
                                  roomId: gameState.roomId,
                                  durationSeconds: customNightTimer || autoNightStep.timeoutSeconds
                                });
                                if (!res?.success) {
                                  setError(res?.error || 'فشل بدء الخطوة');
                                  // استعادة الحالة إذا فشل
                                  setAutoNightStep(prev => prev ? { ...prev, dispatched: false } : null);
                                }
                              } catch (err: any) {
                                setError(err.message);
                                setAutoNightStep(prev => prev ? { ...prev, dispatched: false } : null);
                              }
                            }}
                            className="w-full py-3.5 bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm rounded-xl hover:from-[#d4af63] hover:to-[#c49b52] transition-all"
                            style={{ boxShadow: '0 0 20px rgba(197,160,89,0.3)' }}
                          >
                            ▶ بدء {autoNightStep.roleName}
                          </button>
                        ) : autoNightApproval ? (
                          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
                            <p className="text-center text-[#C5A059] font-bold mb-3">✅ اكتمل الاختيار — مرحلة مراجعة الليدر</p>
                            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                              {[...autoNightApproval.choices]
                                .sort((a, b) => {
                                  if (a.isReal && !b.isReal) return -1;
                                  if (!a.isReal && b.isReal) return 1;
                                  return a.physicalId - b.physicalId;
                                })
                                .map((c: any) => {
                                  const isReal = c.isReal;
                                  const isRandom = c.isRandom;
                                  const chooser = gameState.players.find((p: any) => p.physicalId === c.physicalId);
                                  const target = gameState.players.find((p: any) => p.physicalId === c.targetPhysicalId);
                                  
                                  return (
                                    <div key={c.physicalId} className={`p-3 rounded-lg border ${isReal ? 'bg-[#C5A059]/10 border-[#C5A059] shadow-[0_0_10px_rgba(197,160,89,0.2)]' : 'bg-[#222] border-[#333]'}`}>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className={`text-xs font-mono ${isReal ? 'font-black text-white' : 'text-[#ccc]'}`}>
                                          #{chooser?.physicalId} {chooser?.name}
                                          {isReal && <span className="mr-2 px-2 py-0.5 bg-[#C5A059] text-black rounded text-[10px] font-bold">صاحب الدور</span>}
                                          {isRandom ? (
                                            <span className="mr-1 px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px]">عشوائي</span>
                                          ) : (
                                            <span className="mr-1 px-1.5 py-0.5 bg-[#4CAF50] text-white rounded text-[9px]">يدوي</span>
                                          )}
                                        </span>
                                      </div>
                                      <div className="mt-2 text-left">
                                        <select
                                          className={`text-[11px] bg-black border ${isReal ? 'border-[#C5A059]/50 focus:border-[#C5A059]' : 'border-[#444] opacity-70'} focus:outline-none text-white p-1.5 rounded w-full`}
                                          value={c.targetPhysicalId || ''}
                                          disabled={!isReal}
                                          onChange={(e) => {
                                            if (!isReal) return;
                                            const newChoices = [...autoNightApproval.choices];
                                            const originalIdx = newChoices.findIndex((nc: any) => nc.physicalId === c.physicalId);
                                            if (originalIdx >= 0) {
                                              newChoices[originalIdx].targetPhysicalId = e.target.value ? Number(e.target.value) : null;
                                              setAutoNightApproval({...autoNightApproval, choices: newChoices});
                                            }
                                          }}
                                        >
                                          <option value="">تخطي / لا أحد</option>
                                          {gameState.players.filter((p: any) => p.isAlive).map((p: any) => (
                                            <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  );
                              })}
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await emit('night:auto-approve-step', {
                                    roomId: gameState.roomId,
                                    modifiedChoices: autoNightApproval.choices,
                                    nextIndex: autoNightApproval.nextIndex
                                  });
                                  if (!res?.success) setError(res?.error || 'فشل اعتماد الخطوة');
                                  else {
                                    setAutoNightApproval(null);
                                    // لا نمسح autoNightStep هنا لأن night:auto-step-ready
                                    // يصل قبل الـ callback ويُعيّن الخطوة الجديدة
                                    // مسحه هنا يسبب race condition ويمسح الخطوة الجديدة
                                  }
                                } catch (err: any) { setError(err.message); }
                              }}
                              className="w-full py-2 bg-[#C5A059] text-black font-bold text-sm rounded hover:bg-[#d4af63] transition-colors"
                            >
                              اعتماد الإجراء
                            </button>
                          </div>
                        ) : (
                          <div>
                            {/* شريط التقدم */}
                            {autoNightProgress && (
                              <div>
                                <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mb-2">
                                  <div
                                    className="h-full bg-gradient-to-r from-[#C5A059] to-[#b38b47] rounded-full transition-all duration-500"
                                    style={{ width: `${autoNightProgress.total > 0 ? (autoNightProgress.submitted / autoNightProgress.total) * 100 : 0}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-[#555] font-mono text-center tracking-widest mb-3">
                                  اللاعبون يختارون من أجهزتهم...
                                </p>

                                {/* عرض الخيارات الحية أثناء اختيار اللاعبين */}
                                {autoNightProgress.choices && autoNightProgress.choices.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {[...autoNightProgress.choices]
                                      .sort((a, b) => {
                                        if (a.isReal && !b.isReal) return -1;
                                        if (!a.isReal && b.isReal) return 1;
                                        return a.physicalId - b.physicalId;
                                      })
                                      .map((c: any) => {
                                        const isReal = c.isReal;
                                        const chooser = gameState.players.find((p: any) => p.physicalId === c.physicalId);
                                        const target = gameState.players.find((p: any) => p.physicalId === c.targetPhysicalId);
                                        
                                        return (
                                          <div key={c.physicalId} className={`p-2 rounded-lg border ${isReal ? 'bg-[#C5A059]/10 border-[#C5A059]/50 shadow-[0_0_8px_rgba(197,160,89,0.1)]' : 'bg-[#222] border-[#333]'}`}>
                                            <div className="flex items-center justify-between mb-1">
                                              <span className={`text-[11px] font-mono ${isReal ? 'font-bold text-white' : 'text-[#aaa]'}`}>
                                                #{chooser?.physicalId} {chooser?.name}
                                                {isReal && <span className="mr-1 px-1.5 py-0.5 bg-[#C5A059] text-black rounded text-[9px] font-bold">صاحب الدور</span>}
                                              </span>
                                              <span className={`text-[11px] ${isReal ? 'text-[#C5A059] font-bold' : 'text-[#888]'}`}>
                                                ← {target ? `#${target.physicalId} ${target.name}` : 'تخطي'}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}

                                {autoNightProgress.missingPlayers && autoNightProgress.missingPlayers.length > 0 && (
                                  <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-2 max-h-32 overflow-y-auto">
                                    <p className="text-[9px] text-[#888] font-mono mb-1">في انتظار الإرسال:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {autoNightProgress.missingPlayers.map(p => (
                                        <span key={p.physicalId} className="text-[10px] px-2 py-0.5 bg-[#222] border border-[#333] text-[#ccc] rounded-md">
                                          #{p.physicalId} {p.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* زر تخطي (للقناص والقص والسفّاح) */}
                        {/* 🔪 عقود السفّاح — Auto Mode */}
                        {autoNightStep.role === 'ASSASSIN' && gameState.assassinState && (
                          <div className="mb-3 border border-[#6b21a8]/30 rounded-xl p-3 bg-[#0d0015]/60">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">🗡️</span>
                              <span className="text-xs font-bold text-purple-300">عقود السفّاح</span>
                              <span className="text-[10px] text-purple-400/60 font-mono mr-auto">
                                {gameState.assassinState.completedCount}/{gameState.assassinState.totalRequired}
                              </span>
                            </div>
                            <div className="h-1 bg-[#1a0030] rounded-full overflow-hidden mb-2">
                              <div
                                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all"
                                style={{
                                  width: `${(gameState.assassinState.completedCount / gameState.assassinState.totalRequired) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              {gameState.assassinState.contracts.map((contract: any, i: number) => {
                                const isCurrent = i === gameState.assassinState.currentContractIndex && !contract.completed;
                                return (
                                  <div key={i} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded-lg ${
                                    contract.completed ? 'bg-green-900/20 text-green-400' :
                                    isCurrent ? 'bg-purple-900/30 text-purple-300 border border-purple-500/30' :
                                    'bg-[#111] text-[#555]'
                                  }`}>
                                    <span>{contract.completed ? '✅' : isCurrent ? '🎯' : '⏳'}</span>
                                    <span>{contract.descriptionAr || `اغتيال ${contract.targetRole}`}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {autoNightStep.canSkip && !autoNightStep.dispatched && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await emit('night:skip-action', {
                                  roomId: gameState.roomId,
                                  role: autoNightStep.role,
                                });
                                if (res?.success) setAutoNightStep(null);
                              } catch {}
                            }}
                            className="w-full py-2 text-[#666] hover:text-[#999] text-xs font-mono transition-colors"
                          >
                            تخطي ←
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <div className="w-8 h-8 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-[10px] text-[#555] font-mono tracking-widest">
                          جارٍ تحضير الخطوة التالية...
                        </p>
                        <button
                          onClick={async () => {
                            try {
                              await emit('night:retry-auto', { roomId: gameState.roomId });
                            } catch {}
                          }}
                          className="mt-3 px-4 py-1 text-[10px] text-[#C5A059] border border-[#C5A059]/30 rounded hover:bg-[#C5A059]/10 font-mono transition-colors"
                        >
                          🔄 إعادة تشغيل الخطوة
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* المانوال فقط — أو MORNING_RECAP (لعرض أحداث الصباح + زر معالجة التقاطعات) */}
              {((gameState.config as any).nightMode !== 'auto' || gameState.phase === 'MORNING_RECAP') && (
                <LeaderNightView gameState={gameState} emit={emit} setError={setError} />
              )}
            </>
          )}

          {gameState.phase === 'GAME_OVER' && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="text-8xl mb-6 grayscale">
                {gameState.winner === 'MAFIA' ? '🩸' : gameState.winner === 'ASSASSIN' ? '🔪' : gameState.winner === 'JESTER' ? '🤡' : '⚖️'}
              </div>
              <h2 className="text-4xl font-black text-white mb-4" style={{ fontFamily: 'Amiri, serif' }}>
                {gameState.winner === 'MAFIA' ? 'انتصار المافيا' : gameState.winner === 'ASSASSIN' ? 'انتصار السفاح!' : gameState.winner === 'JESTER' ? 'فوز المهرج!' : 'تطهير المدينة'}
              </h2>
              <p className="text-[#808080] font-mono tracking-widest uppercase text-sm mb-8">
                {gameState.winner === 'MAFIA' ? 'ALL CITIZENS ELIMINATED' : gameState.winner === 'ASSASSIN' ? 'CONTRACTS FULFILLED' : gameState.winner === 'JESTER' ? 'THE JESTER WINS' : 'THREAT NEUTRALIZED'}
              </p>

              {/* شبكة كروت مصغرة — المراجعة النهائية لليدر */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {gameState.players.map((p: any) => (
                  <div key={p.physicalId} className="relative">
                    <MafiaCard
                      playerNumber={p.physicalId}
                      playerName={p.name}
                      role={p.role}
                      isFlipped={true}
                      flippable={false}
                      isAlive={p.isAlive}
                      size="sm"
                      avatarUrl={p.avatarUrl}
                    />
                    {/* زر الاستبعاد */}
                    {showExcludeUI && (
                      <button
                        onClick={() => setExcludedPlayers(prev => 
                          prev.includes(p.physicalId) 
                            ? prev.filter(id => id !== p.physicalId) 
                            : [...prev, p.physicalId]
                        )}
                        className={`absolute -top-2 -right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all z-10 ${
                          excludedPlayers.includes(p.physicalId)
                            ? 'bg-[#8A0303] border-[#8A0303] text-white'
                            : 'bg-[#111] border-[#555] text-[#555] hover:border-[#8A0303]'
                        }`}
                      >
                        {excludedPlayers.includes(p.physicalId) ? '✕' : '−'}
                      </button>
                    )}
                    {excludedPlayers.includes(p.physicalId) && showExcludeUI && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-[#8A0303] text-xs font-mono uppercase">مستبعد</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* أزرار التحكم */}
              <div className="flex flex-col items-center gap-4">
                {/* 📊 زر ملخص نقاط اللعبة */}
                <button
                  onClick={openPointsModal}
                  className="text-[#C5A059] text-sm font-mono uppercase tracking-[0.15em] hover:text-yellow-400 transition-colors border border-[#C5A059]/50 px-6 py-2.5 hover:border-[#C5A059] hover:bg-[#C5A059]/5 rounded"
                >
                  📊 ملخص نقاط اللعبة
                </button>
                {/* زر انتهت الفعالية — يُغلق الغرفة نهائياً */}
                <button
                  onClick={async () => {
                    if (!(await swalConfirm('🏁 انتهت الفعالية بالكامل؟ ستُغلق الغرفة ولن يتمكن أحد من الدخول إليها.'))) return;
                    try {
                      const res = await emit('room:close-event', { roomId: gameState.roomId });
                      if (res?.success) {
                        setGameState(null);
                        setInSession(false);
                      }
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                  className="text-rose-400 text-xs font-mono uppercase tracking-[0.15em] hover:text-rose-300 transition-colors border border-rose-500/30 px-6 py-2.5 hover:border-rose-400/60 hover:bg-rose-500/5 rounded"
                >
                  🏁 انتهت الفعالية — إغلاق الغرفة
                </button>
                {/* زر تفعيل/إلغاء الاستبعاد */}
                {gameState.players.length > 0 && (
                  <button
                    onClick={() => {
                      setShowExcludeUI(!showExcludeUI);
                      if (showExcludeUI) setExcludedPlayers([]);
                    }}
                    className="text-[#555] text-xs font-mono uppercase tracking-[0.15em] hover:text-[#C5A059] transition-colors border border-[#2a2a2a] px-4 py-2 hover:border-[#C5A059]"
                  >
                    {showExcludeUI ? '✕ إلغاء الاستبعاد' : '👥 استبعاد لاعبين'}
                  </button>
                )}

                {showExcludeUI && excludedPlayers.length > 0 && (
                  <p className="text-[#8A0303] text-xs font-mono">
                    سيتم استبعاد {excludedPlayers.length} لاعب من اللعبة الجديدة
                  </p>
                )}

                {/* Night Mode Toggle */}
                <div className="flex flex-col items-center gap-2 mt-4 mb-2">
                  <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">NIGHT PHASE MODE</span>
                  <div className="flex flex-col gap-3">
                    <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 w-64 mx-auto">
                      <button
                        onClick={async () => {
                          const res = await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'manual' });
                          if (res?.success) setGameState((prev: any) => ({ ...prev, config: { ...prev.config, nightMode: 'manual' } }));
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                          (gameState.config as any).nightMode !== 'auto'
                            ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                            : 'text-[#666] hover:text-[#aaa]'
                        }`}
                      >
                        MANUAL
                      </button>
                      <button
                        onClick={async () => {
                          const res = await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'auto', autoTimeSeconds: 15 });
                          if (res?.success) setGameState((prev: any) => ({ ...prev, config: { ...prev.config, nightMode: 'auto', autoNightTime: 15 } }));
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                          (gameState.config as any).nightMode === 'auto'
                            ? 'bg-[#1a1a1a] text-[#C5A059] shadow-md border border-[#C5A059]/40'
                            : 'text-[#666] hover:text-[#aaa]'
                        }`}
                      >
                        AUTO
                      </button>
                    </div>

                    {/* Auto Night Time Input */}
                    <AnimatePresence>
                      {(gameState.config as any).nightMode === 'auto' && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-2"
                        >
                          <span className="text-[#808080] text-[10px] font-mono uppercase tracking-widest flex-1 text-right">
                            وقت كل مرحلة (ثواني)
                          </span>
                          <input 
                            type="number"
                            min="5"
                            max="60"
                            value={(gameState.config as any).autoNightTime || 15}
                            onChange={async (e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val) && val >= 5) {
                                await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'auto', autoTimeSeconds: val });
                                setGameState((prev: any) => ({ ...prev, config: { ...prev.config, autoNightTime: val } }));
                              }
                            }}
                            className="w-16 bg-[#111] border border-[#333] rounded px-2 py-1 text-white text-center font-mono text-sm focus:border-[#C5A059] focus:outline-none"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ⏱️ Game Timer Toggle */}
                <div className="flex flex-col items-center gap-2 mb-4">
                  <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">⏱️ GAME TIMER</span>
                  <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 mx-auto">
                    {[
                      { label: 'OFF', value: 0 },
                      { label: '30 دقيقة', value: 30 },
                      { label: 'ساعة', value: 60 },
                      { label: 'ساعة ونصف', value: 90 },
                    ].map(opt => {
                      const isActive = opt.value === 0 
                        ? !(gameState.config as any).gameTimerEnabled
                        : (gameState.config as any).gameTimerEnabled && (gameState.config as any).gameTimerMinutes === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={async () => {
                            const res = await emit('game:set-timer', { 
                              roomId: gameState.roomId, 
                              enabled: opt.value > 0,
                              minutes: opt.value || 30,
                            });
                            if (res?.success) setGameState((prev: any) => ({ ...prev, config: { ...prev.config, gameTimerEnabled: opt.value > 0, gameTimerMinutes: opt.value || 30 } }));
                          }}
                          className={`py-2.5 px-3 rounded-lg text-[11px] font-mono transition-all ${
                            isActive
                              ? opt.value === 0 
                                ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                                : 'bg-[#1a1a1a] text-[#C5A059] shadow-md border border-[#C5A059]/40'
                              : 'text-[#666] hover:text-[#aaa]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* زر بدء لعبة جديدة (مع استبعاد) */}
                <button
                  onClick={async () => {
                    try {
                      const currentScope2 = (gameState.config as any)?.penaltyScope || 'room';
                      const hasActivePenalties = gameState.players.some((p: any) => (p.penalties || 0) > 0 && !excludedPlayers.includes(p.physicalId));
                      
                      // تحديد هل نصفّر العقوبات
                      let resetPenalties = true;
                      if (hasActivePenalties && currentScope2 === 'room') {
                        // سؤال الليدر: تصفير أو إبقاء؟
                        resetPenalties = (await swalConfirm(
                          '⚖️ يوجد لاعبون عليهم عقوبات من الجيم السابق.\n\n' +
                          '✅ موافق = تصفير العقوبات (بداية جديدة)\n' +
                          '❌ إلغاء = إبقاء العقوبات (مستوى الروم)'
                        ));
                      }

                      if (excludedPlayers.length > 0) {
                        const res = await emit('room:new-game', {
                          roomId: gameState.roomId,
                          excludePlayerIds: excludedPlayers,
                          resetPenalties,
                        });
                        if (res.success) {
                          setGameState((prev: any) => prev ? {
                            ...prev,
                            players: (res.players || []).map((p: any) => ({
                              ...p, isAlive: true, isSilenced: false, role: null,
                            })),
                            winner: undefined,
                            phase: 'LOBBY',
                          } : prev);
                        }
                      } else {
                        const res = await emit('room:reset-to-lobby', { roomId: gameState.roomId, resetPenalties });
                        if (res.success) {
                          setGameState((prev: any) => prev ? {
                            ...prev,
                            phase: 'LOBBY',
                            winner: undefined,
                            rolesPool: [],
                            votingState: undefined,
                            discussionState: undefined,
                            players: (res.players || prev.players).map((p: any) => ({
                              ...p, isAlive: true, isSilenced: false, role: null,
                            })),
                          } : prev);
                        }
                      }
                      setExcludedPlayers([]);
                      setShowExcludeUI(false);
                      setInSession(true);
                    } catch (err: any) {
                      console.error('❌ Return to room error:', err);
                      alert('خطأ: ' + (err.message || 'فشل العودة للغرفة'));
                    }
                  }}
                  className="btn-premium !px-10 !py-4 !text-base tracking-widest uppercase"
                >
                  <span>🏠 العودة للغرفة {excludedPlayers.length > 0 ? `(بدون ${excludedPlayers.length} لاعب)` : ''}</span>
                </button>
              </div>
            </div>
          )}

          {/* 📊 مودال ملخص نقاط اللعبة */}
          {pointsModal !== null && (
            <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPointsModal(null)}>
              <div className="bg-[#0d0d0d] border border-[#C5A059]/40 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-[0_0_40px_rgba(197,160,89,0.15)]" onClick={(e) => e.stopPropagation()} dir="rtl">
                <div className="sticky top-0 bg-[#0d0d0d] border-b border-[#2a2a2a] p-4 flex items-center justify-between z-10">
                  <h3 className="text-[#C5A059] font-black text-lg" style={{ fontFamily: 'Amiri, serif' }}>📊 ملخص نقاط الرانك لهذه اللعبة</h3>
                  <button onClick={() => setPointsModal(null)} className="text-[#888] hover:text-white text-xl leading-none">✕</button>
                </div>
                <div className="p-4">
                  {pointsLoading ? (
                    <p className="text-center text-[#888] py-10 font-mono text-sm">جارٍ التحميل...</p>
                  ) : pointsModal.length === 0 ? (
                    <p className="text-center text-[#888] py-10 font-mono text-sm">لا توجد بيانات</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[#666] text-[11px] border-b border-[#2a2a2a]">
                          <th className="text-right py-2 px-2">اللاعب</th>
                          <th className="text-center py-2 px-2 text-green-400">كسب</th>
                          <th className="text-center py-2 px-2 text-rose-400">خسر</th>
                          <th className="text-center py-2 px-2 text-white">المجموع</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      {pointsModal.map((pl: any) => (
                        <tbody key={pl.matchPlayerId}>
                          <tr className="border-b border-[#1a1a1a] hover:bg-[#151515]">
                            <td className="py-2.5 px-2">
                              <button onClick={() => setPointsExpanded(pointsExpanded === pl.matchPlayerId ? null : pl.matchPlayerId)} className="flex items-center gap-2 text-white hover:text-[#C5A059] text-right">
                                <span className="text-[9px] text-[#666] w-3">{pointsExpanded === pl.matchPlayerId ? '▼' : '◀'}</span>
                                <span className="font-mono text-[#C5A059] text-xs">#{pl.physicalId}</span>
                                <span className="truncate max-w-[140px]">{pl.playerName}</span>
                              </button>
                            </td>
                            <td className="text-center text-green-400 font-mono">{pl.rrGained > 0 ? `+${pl.rrGained}` : 0}</td>
                            <td className="text-center text-rose-400 font-mono">{pl.rrLost < 0 ? pl.rrLost : 0}</td>
                            <td className={`text-center font-mono font-bold ${pl.rrTotal >= 0 ? 'text-green-400' : 'text-rose-400'}`}>{pl.rrTotal >= 0 ? '+' : ''}{pl.rrTotal}</td>
                            <td className="text-center">
                              <button onClick={() => { setPointsEdit(pl); setEditXp(0); setEditRr(0); setEditReason(''); }} className="text-[#C5A059] hover:text-yellow-400 text-[11px] border border-[#C5A059]/30 px-2 py-1 rounded hover:border-[#C5A059]">✏️ تعديل</button>
                            </td>
                          </tr>
                          {pointsExpanded === pl.matchPlayerId && (
                            <tr className="bg-[#0a0a0a]">
                              <td colSpan={5} className="p-3">
                                <div className="grid grid-cols-2 gap-4 text-[11px]">
                                  <div>
                                    <p className="text-[#888] mb-1.5 font-bold border-b border-[#222] pb-1">نقاط الرانك (RR)</p>
                                    {(!pl.rrBreakdown || pl.rrBreakdown.length === 0) ? <p className="text-[#555]">—</p> : pl.rrBreakdown.map((l: any, i: number) => (
                                      <div key={i} className="flex justify-between py-0.5"><span className="text-[#aaa]">{l.icon} {l.label}</span><span className={l.value >= 0 ? 'text-green-400' : 'text-rose-400'}>{l.value >= 0 ? '+' : ''}{l.value}</span></div>
                                    ))}
                                  </div>
                                  <div>
                                    <p className="text-[#888] mb-1.5 font-bold border-b border-[#222] pb-1">الخبرة (XP) — {pl.xpTotal}</p>
                                    {(!pl.xpBreakdown || pl.xpBreakdown.length === 0) ? <p className="text-[#555]">—</p> : pl.xpBreakdown.map((l: any, i: number) => (
                                      <div key={i} className="flex justify-between py-0.5"><span className="text-[#aaa]">{l.icon} {l.label}</span><span className={l.value >= 0 ? 'text-green-400' : 'text-rose-400'}>{l.value >= 0 ? '+' : ''}{l.value}</span></div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      ))}
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 🔧 مودال التعديل اليدوي لنقاط لاعب في هذه اللعبة */}
          {pointsEdit && (
            <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!editBusy) setPointsEdit(null); }}>
              <div className="bg-[#0d0d0d] border border-rose-500/40 rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
                <h3 className="text-rose-400 font-bold mb-1">🔧 تعديل يدوي — <span className="text-white">{pointsEdit.playerName}</span></h3>
                <p className="text-[#888] text-[11px] mb-4 leading-relaxed">يُسجَّل كتعديل يدوي لهذه اللعبة (نفس آلية «التعديل اليدوي» في نظام التقدّم) — قيمة موجبة تضيف، وسالبة تخصم.</p>
                <label className="block text-[#aaa] text-xs mb-1">تعديل نقاط الرانك RR (+/−)</label>
                <input type="number" value={editRr} onChange={(e) => setEditRr(Number(e.target.value))} className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white mb-3 font-mono" dir="ltr" />
                <label className="block text-[#aaa] text-xs mb-1">تعديل الخبرة XP (+/−)</label>
                <input type="number" value={editXp} onChange={(e) => setEditXp(Number(e.target.value))} className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white mb-3 font-mono" dir="ltr" />
                <label className="block text-[#aaa] text-xs mb-1">السبب (اختياري)</label>
                <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="سبب التعديل" className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white mb-4 text-sm" />
                <div className="flex gap-2">
                  <button disabled={editBusy || (!editXp && !editRr)} onClick={submitPointsEdit} className="btn-premium flex-1 py-2.5 !text-sm disabled:opacity-50">{editBusy ? '...' : 'حفظ التعديل'}</button>
                  <button disabled={editBusy} onClick={() => setPointsEdit(null)} className="px-4 py-2.5 border border-[#555] rounded-lg text-[#aaa] hover:text-white text-sm">إلغاء</button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-[#8A0303] mt-6 text-sm font-mono tracking-widest text-center uppercase">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // شاشة إنشاء لعبة + الألعاب النشطة
  // ══════════════════════════════════════════════════
  return (
    <div className="display-bg min-h-screen flex flex-col items-center py-12 px-6 font-sans relative overflow-hidden blood-vignette selection:bg-[#8A0303] selection:text-white">
      <div className="w-full max-w-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12 border-b border-[#2a2a2a] pb-8 flex flex-col items-center">
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="mb-4">
             <Image src="/mafia_logo.png" alt="Mafia Club Logo" width={80} height={80} className="select-none w-[60px] h-[60px] drop-shadow-[0_0_15px_rgba(138,3,3,0.3)]" priority />
           </motion.div>
           <h1 className="text-center mb-8">
             <span className="block text-4xl font-black tracking-tight text-[#C5A059] mb-1" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 20px rgba(138,3,3,0.4)' }}>MAFIA</span>
             <span className="flex justify-between text-xl font-light text-[#8A0303] w-full" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l: string, i: number) => <span key={i}>{l}</span>)}</span>
           </h1>

          <h2 className="text-3xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>المقر الرئيسي</h2>
          <p className="text-[#808080] text-xs font-mono tracking-[0.2em] uppercase">
            DIRECTOR: <span className="text-[#C5A059]">{leaderName}</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 font-mono">
            <div className={`w-2 h-2 ${isConnected ? 'bg-[#2E5C31] shadow-[0_0_10px_#2E5C31]' : 'bg-[#8A0303]'} animate-pulse`} />
            <span className="text-[#555] text-[10px] tracking-widest uppercase">{isConnected ? 'SERVER CONN_ESTABLISHED' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* ── الألعاب النشطة ── */}
        {activeGames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h2 className="text-xs font-mono tracking-[0.3em] text-[#555] mb-4 uppercase">ACTIVE ROOMS ({activeGames.length})</h2>
            <div className="space-y-4">
              {activeGames.map(game => (
                <motion.div
                  key={game.roomId}
                  whileHover={{ scale: 1.01 }}
                  className="noir-card p-6 w-full flex items-center justify-between text-right hover:border-[#C5A059]/40 transition-all border-[#2a2a2a] relative"
                >
                  <div className="flex items-center gap-2">
                    {/* زر إغلاق الغرفة (Soft Close — لا تُحذف) */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!(await swalConfirm(`هل تريد إغلاق الغرفة "${game.gameName}"؟\nلن يتم حذف البيانات، فقط إغلاقها.`))) return;
                        emit('room:close', { roomId: game.roomId }).then((res: any) => {
                          if (res?.success) { sessionStorage.removeItem('leader_active_room'); fetchActiveGames(); fetchHistory(); }
                        }).catch(() => {});
                      }}
                      className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-[#C5A059] hover:bg-[#C5A059]/10 border border-[#2a2a2a] hover:border-[#C5A059]/40 transition-all text-xs"
                      title="إغلاق الغرفة (بدون حذف)"
                    >
                      🔒
                    </button>
                    {/* زر حذف الغرفة نهائياً */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!(await swalConfirm(`⚠️ هل تريد حذف الغرفة "${game.gameName}" نهائياً؟`))) return;
                        emit('room:delete-room', { roomId: game.roomId }).then((res: any) => {
                          if (res?.success) { sessionStorage.removeItem('leader_active_room'); fetchActiveGames(); }
                        }).catch(() => {});
                      }}
                      className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-[#ff0000] hover:bg-[#ff0000]/10 border border-[#2a2a2a] hover:border-[#ff0000]/40 transition-all text-xs"
                      title="حذف الغرفة نهائياً"
                    >
                      🗑️
                    </button>
                    <button
                      onClick={() => handleRejoinGame(game)}
                      className="text-[#555] text-xs font-mono uppercase tracking-[0.2em] hover:text-[#C5A059] transition-colors"
                    >
                      RESUME [→]
                    </button>
                  </div>
                  <button
                    onClick={() => handleRejoinGame(game)}
                    className="flex-1 text-right cursor-pointer bg-transparent border-none"
                  >
                    <h3 className="font-black text-white text-xl" style={{ fontFamily: 'Amiri, serif' }}>{game.gameName}</h3>
                    <p className="text-[#808080] text-xs mt-2 font-mono tracking-widest uppercase">
                      CODE: <span className="text-[#C5A059]">{game.roomCode}</span>
                      {' | '}PIN: <span className="text-[#8A0303]">{game.displayPin}</span>
                      {' | '}AGENTS: <span className="text-white">{game.playerCount}</span>/{game.maxPlayers}
                    </p>
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── إنشاء لعبة جديدة ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="noir-card p-10 border-[#111]"
        >
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#808080] to-transparent opacity-20" />
          
          <h2 className="text-2xl font-black mb-8 text-center text-white" style={{ fontFamily: 'Amiri, serif' }}>إنشاء غرفة جديدة</h2>

          {/* اسم اللعبة */}
          <div className="mb-6">
            <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase">Room Name</label>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="اسم الغرفة..."
              className="w-full p-4 bg-[#050505] border border-[#2a2a2a] text-white text-center text-lg focus:border-[#C5A059] focus:outline-none transition-colors placeholder-[#222]"
              maxLength={50}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {/* عدد اللاعبين */}
            <div>
              <label className="block text-[10px] font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Max Agents</label>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setMaxPlayers(Math.max(6, maxPlayers - 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">−</button>
                <input
                  type="number"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Math.min(27, Math.max(6, parseInt(e.target.value) || 6)))}
                  dir="ltr"
                  className="w-16 p-2 bg-[#050505] border-b border-[#2a2a2a] text-white text-center text-xl font-mono focus:border-[#C5A059] focus:outline-none"
                  min={6} max={27}
                />
                <button onClick={() => setMaxPlayers(Math.min(27, maxPlayers + 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">+</button>
              </div>
            </div>

            {/* عدد التبريرات */}
            <div>
              <label className="block text-[10px] font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Justifications</label>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setMaxJustifications(Math.max(1, maxJustifications - 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">−</button>
                <span className="text-xl font-mono text-white w-16 text-center border-b border-[#2a2a2a] pb-1">{maxJustifications}</span>
                <button onClick={() => setMaxJustifications(Math.min(5, maxJustifications + 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">+</button>
              </div>
            </div>

            {/* الحد الأقصى للعقوبات */}
            <div>
              <label className="block text-[10px] font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Max Penalties</label>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setMaxPenalties(Math.max(1, maxPenalties - 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">−</button>
                <span className="text-xl font-mono text-white w-16 text-center border-b border-[#2a2a2a] pb-1">{maxPenalties}</span>
                <button onClick={() => setMaxPenalties(Math.min(5, maxPenalties + 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">+</button>
              </div>
            </div>

            {/* مستوى العقوبات */}
            <div>
              <label className="block text-[10px] font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Penalty Scope</label>
              <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1 mx-auto max-w-xs">
                <button
                  onClick={() => setPenaltyScope('room')}
                  className={`flex-1 py-2 px-3 rounded-lg text-[11px] font-mono transition-all ${
                    penaltyScope === 'room'
                      ? 'bg-[#1a1a1a] text-[#C5A059] shadow-md border border-[#C5A059]/40'
                      : 'text-[#666] hover:text-[#aaa]'
                  }`}
                >
                  كامل الغرفة
                </button>
                <button
                  onClick={() => setPenaltyScope('game')}
                  className={`flex-1 py-2 px-3 rounded-lg text-[11px] font-mono transition-all ${
                    penaltyScope === 'game'
                      ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                      : 'text-[#666] hover:text-[#aaa]'
                  }`}
                >
                  كل لعبة
                </button>
              </div>
            </div>
          </div>

          {/* PIN */}
          <div className="mb-8">
            <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Display PIN (Optional)</label>
            <input
              type="text"
              value={displayPin}
              onChange={(e) => setDisplayPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="AUTO-GENERATED"
              dir="ltr"
              className="w-full p-4 bg-[#050505] border border-[#2a2a2a] text-[#C5A059] text-center font-mono text-xl tracking-[0.4em] focus:border-[#C5A059] focus:outline-none placeholder-[#222]"
              maxLength={6}
            />
          </div>

          {/* ربط بنشاط (اختياري) */}
          <div className="mb-10">
            <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Link to Activity (اختياري)</label>
            <select
              value={selectedActivityId || ''}
              onChange={(e) => setSelectedActivityId(e.target.value ? Number(e.target.value) : null)}
              className="w-full p-4 bg-[#050505] border border-[#2a2a2a] text-white text-center font-mono focus:border-[#C5A059] focus:outline-none appearance-none cursor-pointer"
              dir="rtl"
            >
              <option value="">— بدون نشاط —</option>
              {availableActivities.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {new Date(a.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                </option>
              ))}
            </select>
            {selectedActivityId && (
              <p className="text-[#C5A059] text-[10px] font-mono text-center mt-2 tracking-widest">
                🔗 سيتم ربط الغرفة بالنشاط المختار
              </p>
            )}
          </div>

          {/* 🌙 Night Mode Toggle */}
          <div className="mb-10">
            <label className="block text-xs font-mono text-[#808080] mb-3 tracking-widest uppercase text-center">Night Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setNightMode('manual')}
                className={`flex-1 py-3 px-3 border transition-all text-xs font-mono tracking-wider flex flex-col items-center gap-1 ${
                  nightMode === 'manual'
                    ? 'border-[#C5A059] bg-[#C5A059]/10 text-[#C5A059]'
                    : 'border-[#2a2a2a] bg-[#050505] text-[#555] hover:border-[#444]'
                }`}
              >
                <span className="text-lg">🎮</span>
                <span>MANUAL</span>
                <span className="text-[9px] text-[#666] tracking-normal">الليدر يتحكم</span>
              </button>
              <button
                onClick={() => setNightMode('auto')}
                className={`flex-1 py-3 px-3 border transition-all text-xs font-mono tracking-wider flex flex-col items-center gap-1 ${
                  nightMode === 'auto'
                    ? 'border-[#C5A059] bg-[#C5A059]/10 text-[#C5A059]'
                    : 'border-[#2a2a2a] bg-[#050505] text-[#555] hover:border-[#444]'
                }`}
              >
                <span className="text-lg">📱</span>
                <span>AUTO</span>
                <span className="text-[9px] text-[#666] tracking-normal">كل لاعب يرسل</span>
              </button>
            </div>
            {nightMode === 'auto' && (
              <p className="text-[#C5A059] text-[10px] font-mono text-center mt-2 tracking-widest">
                ✓ مبدأ التمويه — الكل يرسل، يُعتمد صاحب الدور فقط
              </p>
            )}
            {nightMode === 'manual' && (
              <p className="text-[#555] text-[10px] font-mono text-center mt-2 tracking-widest">
                🎮 الليدر يتحكم بكل خطوات الليل يدوياً
              </p>
            )}
          </div>

          <button
            onClick={handleCreateRoom}
            disabled={!isConnected || creating || !gameName.trim()}
            className="btn-premium w-full text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{creating ? 'INITIALIZING...' : 'CREATE ROOM'}</span>
          </button>


          {error && <p className="text-[#8A0303] mt-6 text-xs font-mono text-center tracking-widest uppercase">{error}</p>}
        </motion.div>

        {/* ── الغرف المنتهية (Sessions) ── */}
        {closedSessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-12 mb-8"
          >
            <h2 className="text-xs font-mono tracking-[0.3em] text-[#555] mb-4 uppercase">CLOSED ROOMS ({closedSessions.length})</h2>
            <div className="space-y-3">
              {closedSessions.map((s: any) => {
                const totalMins = s.totalDuration ? Math.floor(s.totalDuration / 60) : 0;
                const dt = s.lastMatchAt ? new Date(s.lastMatchAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '';
                const isExpanded = selectedMatch?.sessionId === s.id;

                return (
                  <div key={s.id}>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={async () => {
                        if (isExpanded) {
                          setSelectedMatch(null);
                        } else {
                          // جلب ألعاب الغرفة
                          try {
                            const res = await fetch(`/api/game/session-history/${s.id}`);
                            const data = await res.json();
                            if (data.success) {
                              setSelectedMatch({ sessionId: s.id, sessionName: s.sessionName, matches: data.matches || [] });
                            }
                          } catch (err) {
                            console.error('Failed to fetch session matches:', err);
                          }
                        }
                      }}
                      className={`noir-card p-5 w-full flex items-center justify-between text-right transition-all ${
                        isExpanded ? 'border-[#C5A059]/40' : 'border-[#1a1a1a] opacity-70 hover:opacity-100 hover:border-[#555]/40'
                      }`}
                    >
                      <div>
                        <h3 className="font-black text-white text-lg" style={{ fontFamily: 'Amiri, serif' }}>{s.sessionName}</h3>
                        <p className="text-[#555] text-[10px] mt-1.5 font-mono tracking-widest uppercase">
                          {dt && <>{dt} | </>}
                          CODE: <span className="text-[#C5A059]">{s.sessionCode}</span>
                          {' | '}MATCHES: <span className="text-white">{s.matchCount}</span>
                          {' | '}⏱ <span className="text-white">{totalMins > 0 ? `${totalMins}m` : '—'}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {s.lastWinner && (
                          <span className={`text-xs font-mono uppercase tracking-[0.2em] px-3 py-1 border ${
                            s.lastWinner === 'MAFIA' 
                              ? 'text-[#8A0303] border-[#8A0303]/30' 
                              : 'text-[#C5A059] border-[#C5A059]/30'
                          }`}>
                            {s.lastWinner === 'MAFIA' ? '🔴' : '🟡'}
                          </span>
                        )}
                        <span className="text-[#555] text-xs font-mono">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                    </motion.button>

                    {/* ألعاب الغرفة (expandable) */}
                    <AnimatePresence>
                      {isExpanded && selectedMatch?.matches && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border border-t-0 border-[#2a2a2a] rounded-b-lg bg-[#050505]">
                            {/* Header */}
                            <div className="grid grid-cols-[50px_1fr_70px_70px] bg-[#0a0a0a] border-b border-[#2a2a2a] px-3 py-2">
                              <span className="text-[8px] font-mono text-[#555] uppercase tracking-widest">#</span>
                              <span className="text-[8px] font-mono text-[#555] uppercase tracking-widest">WINNER</span>
                              <span className="text-[8px] font-mono text-[#555] uppercase tracking-widest text-center">TIME</span>
                              <span className="text-[8px] font-mono text-[#555] uppercase tracking-widest text-center">DETAIL</span>
                            </div>

                            {selectedMatch.matches.length === 0 ? (
                              <p className="text-[#555] text-xs font-mono text-center py-4">لا توجد ألعاب مسجلة</p>
                            ) : (
                              selectedMatch.matches.map((m: any) => {
                                const mins = m.durationSeconds ? Math.floor(m.durationSeconds / 60) : 0;
                                const secs = m.durationSeconds ? m.durationSeconds % 60 : 0;
                                const isMafiaWin = m.winner === 'MAFIA';

                                return (
                                  <div key={m.id} className="grid grid-cols-[50px_1fr_70px_70px] items-center px-3 py-2 border-b border-[#1a1a1a] hover:bg-[#0a0a0a] transition-colors">
                                    <span className="text-[#C5A059] font-mono text-xs">#{m.id}</span>
                                    <span className={`text-xs font-mono font-bold uppercase ${isMafiaWin ? 'text-[#8A0303]' : 'text-[#2E5C31]'}`}>
                                      {isMafiaWin ? '🩸 MAFIA' : '⚖️ CITIZENS'}
                                    </span>
                                    <span className="text-[#808080] font-mono text-xs text-center">
                                      {m.durationSeconds ? `${mins}:${secs.toString().padStart(2, '0')}` : '--:--'}
                                    </span>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        handleViewMatch(m.id);
                                      }}
                                      className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border bg-[#111] border-[#2a2a2a] text-[#808080] hover:text-[#C5A059] hover:border-[#C5A059]/30 transition-all"
                                    >
                                      👁 عرض
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── مودال ملخص المباراة (يظهر من داخل session أو عند الضغط على عرض) ── */}
        <AnimatePresence>
          {selectedMatch?.id && selectedMatch?.players && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              style={{ zIndex: 9999 }}
              onClick={() => setSelectedMatch(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="noir-card p-8 max-w-lg w-full max-h-[80vh] overflow-y-auto border-[#2a2a2a]"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#2a2a2a]">
                  <div>
                    <h3 className="text-2xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>{selectedMatch.gameName}</h3>
                    <p className="text-[#555] text-[10px] font-mono tracking-widest uppercase mt-1">
                      CODE: {selectedMatch.roomCode} | ⏱ {selectedMatch.durationFormatted}
                    </p>
                  </div>
                  <span className={`text-sm font-mono font-black px-4 py-2 border ${
                    selectedMatch.winner === 'MAFIA'
                      ? 'text-[#8A0303] border-[#8A0303]/40 bg-[#8A0303]/10'
                      : 'text-[#C5A059] border-[#C5A059]/40 bg-[#C5A059]/10'
                  }`}>
                    {selectedMatch.winner === 'MAFIA' ? '🔴 فوز المافيا' : '🟡 فوز المدينة'}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-3 bg-[#0a0a0a] border border-[#1a1a1a]">
                    <div className="text-2xl font-black text-white font-mono">{selectedMatch.playerCount}</div>
                    <div className="text-[8px] font-mono text-[#555] tracking-widest uppercase mt-1">AGENTS</div>
                  </div>
                  <div className="text-center p-3 bg-[#0a0a0a] border border-[#1a1a1a]">
                    <div className="text-2xl font-black text-white font-mono">{selectedMatch.totalRounds || '—'}</div>
                    <div className="text-[8px] font-mono text-[#555] tracking-widest uppercase mt-1">ROUNDS</div>
                  </div>
                  <div className="text-center p-3 bg-[#0a0a0a] border border-[#1a1a1a]">
                    <div className="text-2xl font-black text-white font-mono">{selectedMatch.durationFormatted}</div>
                    <div className="text-[8px] font-mono text-[#555] tracking-widest uppercase mt-1">DURATION</div>
                  </div>
                </div>

                {/* Players */}
                {selectedMatch.players && (
                  <div>
                    <h4 className="text-[10px] font-mono tracking-[0.3em] text-[#555] mb-3 uppercase">AGENT ROSTER</h4>
                    <div className="space-y-2">
                      {selectedMatch.players.map((p: any) => (
                        <div
                          key={p.physicalId}
                          className={`flex items-center justify-between px-4 py-2.5 border ${
                            p.team === 'MAFIA' ? 'border-[#8A0303]/20 bg-[#8A0303]/5' : 'border-[#2a2a2a] bg-[#050505]'
                          } ${!p.survivedToEnd ? 'opacity-40' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono text-[#555] w-6">#{p.physicalId}</span>
                            <span className={`font-bold text-sm ${
                              p.survivedToEnd ? 'text-white' : 'text-[#555] line-through'
                            }`}>{p.playerName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 border ${
                              p.team === 'MAFIA' ? 'text-[#8A0303] border-[#8A0303]/30' : 'text-[#C5A059] border-[#C5A059]/30'
                            }`}>{(ROLE_NAMES as Record<string, string>)[p.role] || p.role}</span>
                            {!p.survivedToEnd && <span className="text-[#8A0303] text-xs">💀</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Close */}
                <button
                  onClick={() => setSelectedMatch(null)}
                  className="w-full mt-6 py-3 text-[#555] text-xs font-mono uppercase tracking-[0.2em] hover:text-white transition-colors border border-[#2a2a2a] hover:border-[#555]"
                >
                  [ CLOSE REPORT ]
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── مودال تصفير/إبقاء العقوبات عند بدء لعبة جديدة ── */}
        {(() => {
          if (!pendingNewGameAction || !gameState) return null;
          const gs: any = gameState;
          const penalizedPlayers = gs.players.filter((p: any) => (p.penalties || 0) > 0 && !(pendingNewGameAction.excludePlayerIds || []).includes(p.physicalId));
          const maxPen = gs.config?.maxPenalties || 3;
          return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
            <div className="bg-[#0a0a0a] border border-[#C5A059]/30 rounded-2xl p-6 sm:p-8 w-full max-w-sm shadow-2xl relative overflow-hidden">
              {/* Top accent */}
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#C5A059] to-transparent" />
              
              <div className="text-center mb-6">
                <div className="text-3xl mb-3">⚖️</div>
                <h3 className="text-[#C5A059] text-lg font-bold mb-2" style={{ fontFamily: 'Amiri, serif' }}>العقوبات الفعّالة</h3>
                <p className="text-[#888] text-xs leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                  يوجد لاعبون عليهم عقوبات من الجيم السابق. ماذا تريد أن تفعل؟
                </p>
              </div>
              
              {/* العقوبات الحالية — عرض سريع */}
              <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-3 mb-6">
                {penalizedPlayers.map((p: any) => (
                    <div key={p.physicalId} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a] last:border-0">
                      <span className="text-white text-xs font-mono">#{p.physicalId} {p.name}</span>
                      <div className="flex gap-1">
                        {Array.from({ length: maxPen }).map((_: any, i: number) => (
                          <span key={i} className={`w-2 h-2 rounded-full ${i < (p.penalties || 0) ? 'bg-red-600 shadow-[0_0_4px_#dc2626]' : 'bg-neutral-800'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              
              <div className="flex flex-col gap-3">
                {/* خيار الإبقاء — الافتراضي لأن العقوبات على مستوى الروم */}
                <button
                  onClick={async () => {
                    const action = pendingNewGameAction;
                    setPendingNewGameAction(null);
                    try {
                      if (action.type === 'new-game-start') {
                        if (action.excludePlayerIds && action.excludePlayerIds.length > 0) {
                          const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds, resetPenalties: false });
                          if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                        }
                        await emit('room:start-generation', { roomId: gs.roomId });
                        setExcludedPlayers([]); setShowExcludeUI(false); setInSession(false);
                      } else if (action.type === 'new-game-return') {
                        const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds || [], resetPenalties: false });
                        if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                        setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                      } else {
                        const res = await emit('room:reset-to-lobby', { roomId: gs.roomId, resetPenalties: false });
                        if (res.success) setGameState((prev: any) => prev ? { ...prev, phase: 'LOBBY', winner: undefined, rolesPool: [], votingState: undefined, discussionState: undefined, players: (res.players || prev.players).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })) } : prev);
                        setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                      }
                    } catch (err: any) { setError(err.message); }
                  }}
                  className="w-full py-3.5 rounded-xl bg-[#1a1a1a] border border-[#C5A059]/40 text-[#C5A059] font-bold text-sm tracking-wide hover:bg-[#222] transition-all shadow-[0_0_15px_rgba(197,160,89,0.1)]"
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  ⚠️ إبقاء العقوبات (مستوى الروم)
                </button>
                
                {/* خيار التصفير */}
                <button
                  onClick={async () => {
                    const action = pendingNewGameAction;
                    setPendingNewGameAction(null);
                    try {
                      if (action.type === 'new-game-start') {
                        if (action.excludePlayerIds && action.excludePlayerIds.length > 0) {
                          const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds, resetPenalties: true });
                          if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                        }
                        await emit('room:start-generation', { roomId: gs.roomId });
                        setExcludedPlayers([]); setShowExcludeUI(false); setInSession(false);
                      } else if (action.type === 'new-game-return') {
                        const res = await emit('room:new-game', { roomId: gs.roomId, excludePlayerIds: action.excludePlayerIds || [], resetPenalties: true });
                        if (res.success) setGameState((prev: any) => prev ? { ...prev, players: (res.players || []).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })), winner: undefined, phase: 'LOBBY' } : prev);
                        setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                      } else {
                        const res = await emit('room:reset-to-lobby', { roomId: gs.roomId, resetPenalties: true });
                        if (res.success) setGameState((prev: any) => prev ? { ...prev, phase: 'LOBBY', winner: undefined, rolesPool: [], votingState: undefined, discussionState: undefined, players: (res.players || prev.players).map((p: any) => ({ ...p, isAlive: true, isSilenced: false, role: null })) } : prev);
                        setExcludedPlayers([]); setShowExcludeUI(false); setInSession(true);
                      }
                    } catch (err: any) { setError(err.message); }
                  }}
                  className="w-full py-3.5 rounded-xl bg-[#111] border border-green-800/30 text-green-400 font-bold text-sm tracking-wide hover:bg-[#1a1a1a] transition-all"
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  ✅ تصفير العقوبات (بداية جديدة)
                </button>
                
                {/* إلغاء */}
                <button
                  onClick={() => setPendingNewGameAction(null)}
                  className="w-full py-2.5 text-[#555] text-xs font-mono tracking-widest uppercase hover:text-white transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        );
        })()}

        {/* أزرار التنقل */}
        <div className="flex items-center justify-center gap-6 mt-12 mb-8">
          <button onClick={() => router.push('/')} className="text-[#555] text-xs font-mono tracking-[0.2em] uppercase hover:text-white transition-colors border border-[#2a2a2a] px-5 py-2.5 hover:border-[#555]">
            🏠 الصفحة الرئيسية
          </button>
          <button onClick={() => router.push('/admin')} className="text-[#555] text-xs font-mono tracking-[0.2em] uppercase hover:text-[#8A0303] transition-colors border border-[#2a2a2a] px-5 py-2.5 hover:border-[#8A0303]/50">
            📊 لوحة الإدارة
          </button>
        </div>
      </div>
    </div>
  );
}
