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
}

interface GameState {
  roomId: string;
  roomCode: string;
  phase: string;
  config: {
    gameName: string;
    maxPlayers: number;
    displayPin: string;
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
  round?: number;
  // Day phase
  justificationData?: any;
  pendingResolution?: any;
  discussionState?: any;
  withdrawalState?: { count: number; needed: number; total: number; withdrawn?: number[] } | null;
  // Session
  sessionId?: number;
  activityId?: number;
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
  const [displayPin, setDisplayPin] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [availableActivities, setAvailableActivities] = useState<any[]>([]);

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

  // ── مودال تعديل الأرقام (Renumber Modal) ──
  const [showRenumberModal, setShowRenumberModal] = useState(false);
  const [renumberMap, setRenumberMap] = useState<Record<number, number>>({});
  const [renumberLoading, setRenumberLoading] = useState(false);
  const [renumberError, setRenumberError] = useState('');
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
          });

          if (phase === 'LOBBY' || phase === 'GAME_OVER') {
            setInSession(true);
          } else {
            setInSession(false);
          }

          // إعادة الانضمام للغرفة عبر Socket
          const socket = (await import('@/lib/socket')).getSocket();
          socket.emit('room:rejoin-leader', { roomId: savedRoomId });
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
                  maxPlayers: 10,
                  maxJustifications: 2,
                  displayPin: roomData.displayPin || undefined,
                  activityId: roomData.activityId || undefined,
                  existingSessionId: roomData.sessionId || undefined, // منع إنشاء session مكرر في DB
                });

                setGameState({
                  roomId: response.roomId,
                  roomCode: response.roomCode,
                  phase: 'LOBBY',
                  config: {
                    gameName: response.gameName || roomData.sessionName,
                    maxPlayers: 10,
                    displayPin: response.displayPin || '',
                  },
                  players: [],
                  rolesPool: [],
                  sessionId: response.sessionId,
                  activityId: roomData.activityId || undefined,
                });
                setInSession(true);
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
          setGameState(prev => prev ? { ...prev, ...resData.state } : resData.state);
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
      } : prev);
    });

    // Phase changed
    const offPhaseChanged = on('game:phase-changed', async (data: any) => {
      // للمراحل الليلية: لا نجلب من API — Socket يتكفل بالبيانات
      if (data.phase === 'NIGHT' || data.phase === 'MORNING_RECAP') {
        setGameState(prev => prev ? {
          ...prev,
          phase: data.phase,
          justificationData: undefined,
          pendingResolution: undefined,
          revealedData: undefined,
        } : prev);
        return;
      }

      // ✅ أولاً: استخدام الحالة المرفقة مع الحدث (أسرع)
      if (data.state) {
        // الأولوية لـ data.phase على data.state.phase (حماية من phase قديم)
        setGameState(prev => prev ? { ...prev, ...data.state, phase: data.phase } : { ...data.state, phase: data.phase });
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
          phase: 'DAY_RESOLUTION_PENDING',
          pendingResolution: data,
        } as any;
      });
    });

    // Elimination Revealed — بعد كشف الهوية
    const offEliminationRevealed = on('day:elimination-revealed', (data: any) => {
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

    const offGameOver = on('game:over', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'GAME_OVER',
          winner: data.winner,
          players: data.players || prev.players,
        } as any;
      });
    });

    const offGameRestarted = on('game:restarted', (data: any) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'LOBBY',
          winner: null,
          players: data.players || prev.players,
          config: data.config || prev.config,
          rolesPool: [],
          votingState: undefined,
          discussionState: undefined,
          justificationData: undefined,
          pendingResolution: undefined,
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

    return () => {
      offConnect();
      offStateSync();
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
      offEliminationRevealed();
      offDiscussionUpdate();
      offGameClosed();
      offRoomDeleted();
      offNightStep();
      offNightComplete();
      offMorningRecap();
      offSheriffResult();
      offGameOver();
      offGameRestarted();
      offConfigUpdated();
      offPlayerUpdated();
      offAdminEliminated();
      offWithdrawalUpdate();
      offWithdrawalResult();
    };
  }, [on, emit, gameState?.roomId]);

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
        displayPin: displayPin || undefined,
        activityId: selectedActivityId || undefined,
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
        });

        // تحديد الوضع: LOBBY أو GAME_OVER → Session View
        if (phase === 'LOBBY' || phase === 'GAME_OVER') {
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

  if (checkingAuth || !isAuthenticated) {
    return (
      <div className="display-bg min-h-screen flex items-center justify-center font-sans">
        <div className="text-[#555] text-sm font-mono tracking-widest uppercase">VERIFYING CREDENTIALS...</div>
      </div>
    );
  }

  const handleCloseRoom = async () => {
    if (!gameState) return;
    if (!confirm('هل أنت متأكد من إنهاء اللعبة الحالية؟ سيتم إعادة جميع اللاعبين للغرفة.')) return;
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
    if (!confirm(msg)) return;
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

  // ══════════════════════════════════════════════════
  // صفحة الغرفة (Session View)
  // ══════════════════════════════════════════════════
  if (gameState && inSession) {
    return (
      <div className="display-bg min-h-screen font-sans relative overflow-hidden blood-vignette selection:bg-[#8A0303] selection:text-white flex flex-col">
        <div className="relative z-10 w-full h-full flex flex-col flex-1">
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
                    CODE: <span className="text-[#C5A059]">{gameState.roomCode}</span>
                    {' | '}PIN: <span className="text-[#8A0303]">{gameState.config.displayPin}</span>
                    {' | '}AGENTS: <span className="text-white">{gameState.players.length}</span>/{gameState.config.maxPlayers}
                  </p>
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

              {gameState.players.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[#2a2a2a] rounded-lg">
                  <p className="text-[#555] text-sm font-mono">لا يوجد لاعبين — أضف لاعبين باستخدام الزر أعلاه</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {gameState.players.map((p: any) => {
                    const isSessionEditing = sessionEditingId === p.physicalId;
                    return (
                    <div key={p.physicalId} className="relative group">
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
                      {/* زر حذف لاعب — يظهر عند hover */}
                      {!showExcludeUI && !isSessionEditing && (
                        <button
                          onClick={async () => {
                            if (!confirm(`حذف ${p.name} من الغرفة؟`)) return;
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
                      {!showExcludeUI && !isSessionEditing && (
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

              {/* زر بدء اللعبة — يقفز مباشرة لـ ROLE_GENERATION */}
              <button
                onClick={async () => {
                  const effectivePlayers = gameState.players.length - excludedPlayers.length;
                  if (effectivePlayers < 6) {
                    setError('يجب إضافة 6 لاعبين على الأقل');
                    return;
                  }
                  try {
                    // إذا عندنا مستبعدين → نعمل new-game لحذفهم أولاً
                    if (excludedPlayers.length > 0) {
                      const res = await emit('room:new-game', {
                        roomId: gameState.roomId,
                        excludePlayerIds: excludedPlayers,
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
                    // بدء توزيع الأدوار مباشرة
                    await emit('room:start-generation', { roomId: gameState.roomId });
                    setExcludedPlayers([]);
                    setShowExcludeUI(false);
                    setInSession(false);
                  } catch (err: any) {
                    setError(err.message);
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
                  onClick={() => setShowAdminEliminate(true)}
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
                            if (!confirm(`هل أنت متأكد من إقصاء ${p.name} (#${p.physicalId})؟`)) return;
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
            <LeaderNightView gameState={gameState} emit={emit} setError={setError} />
          )}

          {gameState.phase === 'GAME_OVER' && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="text-8xl mb-6 grayscale">{gameState.winner === 'MAFIA' ? '🩸' : '⚖️'}</div>
              <h2 className="text-4xl font-black text-white mb-4" style={{ fontFamily: 'Amiri, serif' }}>
                {gameState.winner === 'MAFIA' ? 'انتصار المافيا' : 'تطهير المدينة'}
              </h2>
              <p className="text-[#808080] font-mono tracking-widest uppercase text-sm mb-8">
                {gameState.winner === 'MAFIA' ? 'ALL CITIZENS ELIMINATED' : 'THREAT NEUTRALIZED'}
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

                {/* زر بدء لعبة جديدة (مع استبعاد) */}
                <button
                  onClick={async () => {
                    try {
                      // إذا عندنا مستبعدين → نعمل new-game لحذفهم
                      if (excludedPlayers.length > 0) {
                        const res = await emit('room:new-game', {
                          roomId: gameState.roomId,
                          excludePlayerIds: excludedPlayers,
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
                        // بدون استبعاد → العودة للوبي فقط
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
                      }
                      setExcludedPlayers([]);
                      setShowExcludeUI(false);
                      setInSession(true); // ← العودة لـ Session View (اللوبي الأصلي)
                    } catch (err: any) {
                      setError(err.message);
                    }
                  }}
                  className="btn-premium !px-10 !py-4 !text-base tracking-widest uppercase"
                >
                  <span>🏠 العودة للغرفة {excludedPlayers.length > 0 ? `(بدون ${excludedPlayers.length} لاعب)` : ''}</span>
                </button>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`هل تريد إغلاق الغرفة "${game.gameName}"؟\nلن يتم حذف البيانات، فقط إغلاقها.`)) return;
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
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`⚠️ هل تريد حذف الغرفة "${game.gameName}" نهائياً؟`)) return;
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

          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* عدد اللاعبين */}
            <div>
              <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Max Agents</label>
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
              <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase text-center">Justifications</label>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setMaxJustifications(Math.max(1, maxJustifications - 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">−</button>
                <span className="text-xl font-mono text-white w-16 text-center border-b border-[#2a2a2a] pb-1">{maxJustifications}</span>
                <button onClick={() => setMaxJustifications(Math.min(5, maxJustifications + 1))} className="w-10 h-10 bg-[#050505] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors font-mono">+</button>
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
              className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
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
                            }`}>{p.role}</span>
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
