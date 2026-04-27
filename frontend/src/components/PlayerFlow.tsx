'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import MafiaCard from './MafiaCard';
import PlayerPhaseView from './PlayerPhaseView';
import { useGameState } from '@/hooks/useGameState';

type Step = 'code' | 'phone' | 'login' | 'register' | 'change_password' | 'number' | 'done' | 'rejoined';

interface PlayerFlowProps {
  initialRoomCode?: string;
}

// ── SVG Icons ──
const OperationIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const PhoneIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
  </svg>
);

const SeatIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
    <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"></path>
    <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 12.5V11a2 2 0 0 0-4 0z"></path>
    <path d="M15 18v2"></path>
    <path d="M9 18v2"></path>
  </svg>
);

const ShieldCheckIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <polyline points="9 12 11 14 15 10"></polyline>
  </svg>
);

// ── قراءة بيانات اللاعب من جميع مصادر localStorage ──
function getSavedToken(): string | null {
  // المصدر 1: PlayerFlow's own key
  const t1 = localStorage.getItem('mafia_player_token');
  if (t1) return t1;
  // المصدر 2: PlayerContext's key (mafia_player_auth)
  try {
    const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
    if (auth.token) return auth.token;
  } catch {}
  return null;
}

function getSavedPlayerId(): number {
  const id1 = localStorage.getItem('mafia_playerId');
  if (id1 && parseInt(id1)) return parseInt(id1);
  try {
    const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
    if (auth.playerId) return auth.playerId;
  } catch {}
  try {
    const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
    if (info.playerId) return info.playerId;
  } catch {}
  return 0;
}

function getSavedPhone(): string {
  try {
    const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
    if (info.phone) return info.phone;
  } catch {}
  try {
    const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
    if (auth.phone) return auth.phone;
  } catch {}
  return '';
}

export default function PlayerFlow({ initialRoomCode = '' }: PlayerFlowProps) {
  const { joinRoom, isConnected, error, loading, emit, on } = useGameState();
  const [step, setStep] = useState<Step>(() => {
    // إذا فيه كود QR + توكن محفوظ → نبدأ بـ code مؤقتاً (الـ auto-find يتكفل)
    if (initialRoomCode && typeof window !== 'undefined' && getSavedToken()) {
      return 'code';
    }
    return initialRoomCode ? 'phone' : 'code';
  });
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [roomId, setRoomId] = useState('');
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [physicalId, setPhysicalId] = useState('');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [apiError, setApiError] = useState('');
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // ── توزيع الأدوار الرقمي ──
  const [assignedRole, setAssignedRole] = useState<string | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [isPlayerDead, setIsPlayerDead] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [seatChangeAlert, setSeatChangeAlert] = useState<string | null>(null);
  const [roleAlert, setRoleAlert] = useState(false);
  const [mafiaTeam, setMafiaTeam] = useState<{physicalId: number; name: string}[]>([]);
  const [switchConfirm, setSwitchConfirm] = useState<{
    currentRoomId: string;
    currentGameName: string;
    targetRoomId: string;
    targetGameName: string;
  } | null>(null);
  const [switchLoading, setSwitchLoading] = useState(false);
  const [tokenChecked, setTokenChecked] = useState(false);
  const phaseOverrideRef = useRef<{ phase: string } | null>(null);

  // ── حالة التصويت (مع حفظ في localStorage للاستعادة الفورية عند refresh) ──
  const [gamePhase, setGamePhaseRaw] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('mafia_gamePhase') || null;
  });
  const [votingCandidates, setVotingCandidatesRaw] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('mafia_votingCandidates');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [votingPlayersInfo, setVotingPlayersInfoRaw] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('mafia_votingPlayersInfo');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [myVote, setMyVoteRaw] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('mafia_myVote');
    if (saved !== null && !isNaN(parseInt(saved))) return parseInt(saved);
    return null;
  });
  const [totalVotesCast, setTotalVotesCast] = useState(0);
  const [playerVotes, setPlayerVotesRaw] = useState<Record<number, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('mafia_playerVotes');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [votingComplete, setVotingComplete] = useState(false);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [phasePollData, setPhasePollData] = useState<any>(null);

  // ── Wrappers: تحفظ في localStorage عند كل تغيير ──
  const setGamePhase = (phase: string | null) => {
    setGamePhaseRaw(phase);
    if (phase) localStorage.setItem('mafia_gamePhase', phase);
    else localStorage.removeItem('mafia_gamePhase');
  };
  const setVotingCandidates = (candidates: any[]) => {
    setVotingCandidatesRaw(candidates);
    if (candidates.length > 0) localStorage.setItem('mafia_votingCandidates', JSON.stringify(candidates));
    else localStorage.removeItem('mafia_votingCandidates');
  };
  const setVotingPlayersInfo = (info: any[]) => {
    setVotingPlayersInfoRaw(info);
    if (info.length > 0) localStorage.setItem('mafia_votingPlayersInfo', JSON.stringify(info));
    else localStorage.removeItem('mafia_votingPlayersInfo');
  };
  const setMyVote = (vote: number | null) => {
    setMyVoteRaw(vote);
    if (vote !== null) localStorage.setItem('mafia_myVote', String(vote));
    else localStorage.removeItem('mafia_myVote');
  };
  const setPlayerVotes = (votes: Record<number, number>) => {
    setPlayerVotesRaw(votes);
    if (Object.keys(votes).length > 0) localStorage.setItem('mafia_playerVotes', JSON.stringify(votes));
    else localStorage.removeItem('mafia_playerVotes');
  };

  // ── محاولة إعادة الاتصال (rejoin) عند فتح الصفحة ──
  useEffect(() => {
    if (!isConnected || !emit) {
      // لا نمسح rejoinLoading هنا — ننتظر الاتصال
      return;
    }

    // ننتظر فحص التوكن لأنه ممكن يُنشئ mafia_session من activeGame
    if (!tokenChecked) return;

    const saved = localStorage.getItem('mafia_session');
    if (!saved) {
      setRejoinLoading(false);
      return;
    }

    try {
      const session = JSON.parse(saved);
      if (!session.roomId || !session.physicalId) {
        setRejoinLoading(false);
        return;
      }

      // ── تحقق من توافق الحساب: إذا فيه توكن محفوظ لحساب مختلف → مسح الجلسة القديمة ──
      const savedToken = getSavedToken();
      const savedPlayerId = String(getSavedPlayerId());
      if (session.playerId && savedPlayerId && String(session.playerId) !== savedPlayerId) {
        console.log(`⚠️ Session belongs to player #${session.playerId} but logged in as #${savedPlayerId} — clearing stale session`);
        localStorage.removeItem('mafia_session');
        setRejoinLoading(false);
        return;
      }

      // ── إذا فيه كود غرفة جديد (من QR) مختلف عن الجلسة القديمة → تجاهل الجلسة القديمة ──
      if (initialRoomCode && session.roomCode && initialRoomCode !== session.roomCode) {
        console.log(`🔄 New room code ${initialRoomCode} differs from saved session ${session.roomCode} — skipping rejoin`);
        localStorage.removeItem('mafia_session');
        setRejoinLoading(false);
        return;
      }

      emit('room:rejoin-player', {
        roomId: session.roomId,
        physicalId: session.physicalId,
        phone: session.phone || undefined,
      }).then((res: any) => {
        if (res.success) {
          setRoomId(session.roomId);
          setRoomCode(session.roomCode || '');
          setGameName(res.gameName || '');
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          setGender(res.player.gender === 'FEMALE' ? 'female' : 'male');
          setPlayerId(session.playerId || res.player.playerId || null);

          // حفظ playerId للبروفايل
          const pid = res.player.playerId || session.playerId;
          if (pid) localStorage.setItem('mafia_playerId', String(pid));

          if (res.player.role) {
            setAssignedRole(res.player.role);
          }
          if (res.mafiaTeam && res.mafiaTeam.length > 0) {
            setMafiaTeam(res.mafiaTeam);
          }

          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true); // ميت = كارد مفتوح
          }

          // ── استعادة حالة التصويت فورياً عند rejoin ──
          if (res.phase) setGamePhase(res.phase);
          console.log(`🔍 Rejoin phase: ${res.phase}, hasVotingState: ${!!res.votingState}, candidates: ${res.votingState?.candidates?.length || 0}`);
          if (res.votingState && res.phase === 'DAY_VOTING') {
            console.log(`🗳️ Restoring voting: ${res.votingState.candidates.length} candidates, myVotes: ${JSON.stringify(res.votingState.playerVotes)}`);
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            setVotingComplete(false);
            // استعادة صوت اللاعب
            const myPhysId = res.player.physicalId;
            if (res.votingState.playerVotes?.[myPhysId] !== undefined) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            } else {
              setMyVote(null);
            }
          }

          setStep('rejoined');
          console.log(`♻️ Rejoin success: #${res.player.physicalId} - ${res.player.name} | role: ${res.player.role} | phase: ${res.phase}`);
        } else {
          // الغرفة مش موجودة → مسح الجلسة
          localStorage.removeItem('mafia_session');
        }
        setRejoinLoading(false);
      }).catch(() => {
        setRejoinLoading(false);
      });
    } catch {
      localStorage.removeItem('mafia_session');
      setRejoinLoading(false);
    }
  }, [isConnected, emit, tokenChecked]);

  // ── البحث التلقائي عن الغرفة عند وجود كود مسبق ──
  // ⚠️ ينتظر tokenChecked لأن handleFindRoom يتحقق من playerToken/playerId
  useEffect(() => {
    if (initialRoomCode && isConnected && !roomId && tokenChecked) {
      handleFindRoom(initialRoomCode);
    }
  }, [initialRoomCode, isConnected, tokenChecked]);

  // ── التحقق من التوكن المحفوظ عند فتح الصفحة ──
  useEffect(() => {
    const savedToken = getSavedToken();
    if (savedToken) {
      setPlayerToken(savedToken);
      // مزامنة: حفظ التوكن في المفتاح الرئيسي إذا مش موجود
      if (!localStorage.getItem('mafia_player_token')) {
        localStorage.setItem('mafia_player_token', savedToken);
      }
      // تحقق من صلاحية التوكن
      fetch('/api/player-auth/me', {
        headers: { 'Authorization': `Bearer ${savedToken}` },
      }).then(r => r.json()).then(data => {
        if (data.success && data.player) {
          setPlayerId(data.player.id);
          setDisplayName(data.player.name);
          setPhone(data.player.phone || '');
          setGender(data.player.gender === 'FEMALE' ? 'female' : 'male');
          setMustChangePassword(data.player.mustChangePassword || false);
          if (data.player.avatarUrl) setAvatarUrl(data.player.avatarUrl);
          localStorage.setItem('mafia_playerId', String(data.player.id));
          // مزامنة التوكن لكل المصادر
          localStorage.setItem('mafia_player_token', savedToken);

          // إذا في جيم نشط وما فيه جلسة محفوظة → ننشئ جلسة ليلتقطها rejoin
          if (data.activeGame && !localStorage.getItem('mafia_session')) {
            localStorage.setItem('mafia_session', JSON.stringify({
              roomId: data.activeGame.roomId,
              roomCode: data.activeGame.roomCode || '',
              physicalId: data.activeGame.physicalId,
              phone: data.player.phone || '',
              playerId: data.player.id,
            }));
            // لا نضبط state مباشرة — نترك rejoin useEffect يتكفل بكل شيء
            // هذا يمنع race condition مع rejoin callback
          }
        } else {
          // توكن منتهي → مسح
          localStorage.removeItem('mafia_player_token');
          setPlayerToken(null);
        }
      }).catch(() => {
        localStorage.removeItem('mafia_player_token');
        setPlayerToken(null);
      }).finally(() => {
        setTokenChecked(true);
      });
    } else {
      setTokenChecked(true);
    }
  }, []);

  // ── إعادة الانضمام للغرفة عند reconnect ──
  // عند قطع الاتصال وإعادته → socket يحصل على ID جديد ويخرج من الغرفة
  // لازم يعود ينضم عشان يستقبل game:state-sync
  useEffect(() => {
    if (!on || !emit) return;
    if (step !== 'done' && step !== 'rejoined') return;
    if (!roomId) return;

    const cleanupReconnect = on('connect', () => {
      console.log('🔄 Socket reconnected — re-joining room...');
      const normalized = phone.startsWith('0') ? phone : '0' + phone;
      emit('room:rejoin-player', {
        roomId,
        physicalId: parseInt(physicalId) || 0,
        phone: normalized || undefined,
      }).then((res: any) => {
        if (res?.success && res.player) {
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          if (res.player.role) setAssignedRole(res.player.role);
          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // تحديث الكاش
          const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
          saved.physicalId = res.player.physicalId;
          localStorage.setItem('mafia_session', JSON.stringify(saved));
          console.log(`✅ Re-joined room: #${res.player.physicalId} - ${res.player.name}`);
        }
      }).catch(() => {
        console.warn('⚠️ Re-join failed after reconnect');
      });
    });

    return () => cleanupReconnect();
  }, [on, emit, step, roomId, phone, physicalId]);

  // ── استقبال تغيير رقم المقعد من الليدر (حل المشكلة الأساسية) ──
  useEffect(() => {
    if (!on) return;

    const cleanupSeat = on('player:seat-changed', (data: { oldPhysicalId: number; newPhysicalId: number }) => {
      setPhysicalId(String(data.newPhysicalId));
      // تحديث localStorage
      const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
      saved.physicalId = data.newPhysicalId;
      localStorage.setItem('mafia_session', JSON.stringify(saved));
      // تنبيه بصري
      setSeatChangeAlert(`تم تغيير رقمك: ${data.oldPhysicalId} ← ${data.newPhysicalId}`);
      setTimeout(() => setSeatChangeAlert(null), 5000);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });

    const cleanupKick = on('player:kicked-self', () => {
      localStorage.removeItem('mafia_session');
      setAssignedRole(null);
      setPhysicalId('');
      setRoomId('');
      setStep(initialRoomCode ? 'phone' : 'code');
      setApiError('تم إزالتك من اللعبة من قبل الليدر');
    });

    return () => { cleanupSeat(); cleanupKick(); };
  }, [on, initialRoomCode]);

  // ── تسجيل خروج اللاعب (مسح كل البيانات المحفوظة) ──
  const handleLogout = useCallback(() => {
    // إرسال حدث الخروج للسيرفر أولاً (لإزالة اللاعب من واجهة الليدر)
    if (emit && roomId) {
      const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
      emit('room:player-exit', {
        roomId,
        phone: normalizedPhone,
        playerId: playerId || undefined,
      }).catch(() => {}); // لا نمنع الخروج حتى لو فشل
    }

    localStorage.removeItem('mafia_session');
    localStorage.removeItem('mafia_player_token');
    localStorage.removeItem('mafia_playerId');
    // تنظيف بيانات التصويت المحفوظة
    localStorage.removeItem('mafia_gamePhase');
    localStorage.removeItem('mafia_votingCandidates');
    localStorage.removeItem('mafia_votingPlayersInfo');
    localStorage.removeItem('mafia_myVote');
    localStorage.removeItem('mafia_playerVotes');
    setPlayerToken(null);
    setPlayerId(null);
    setDisplayName('');
    setPhone('');
    setPhysicalId('');
    setRoomId('');
    setRoomCode('');
    setAssignedRole(null);
    setIsPlayerDead(false);
    setCardFlipped(false);
    setPassword('');
    setNewPassword('');
    setMustChangePassword(false);
    setApiError('');
    setStep(initialRoomCode ? 'phone' : 'code');
  }, [initialRoomCode, emit, roomId, phone, playerId]);

  // ── مزامنة خفية — الاستماع لبدء اللعبة + توزيع الأدوار ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // استقبال الدور من الليدر (عند تأكيد الأدوار)
    const cleanupRole = on('player:role-assigned', (data: { role: string; mafiaTeam?: {physicalId: number; name: string}[] }) => {
      setAssignedRole(data.role);
      setCardFlipped(false);
      setRoleAlert(true);
      setIsPlayerDead(false); // ← reset: لعبة جديدة = حي
      if (data.mafiaTeam) setMafiaTeam(data.mafiaTeam);
      if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
    });

    const cleanup = on('game:started', () => {
      console.log('🎮 New game started — resetting all game state');
      // ── FULL RESET لكل حالة اللعبة القديمة ──
      setIsPlayerDead(false);
      setAssignedRole(null);
      setMafiaTeam([]);
      setCardFlipped(false);
      setRoleAlert(false);
      setGamePhase(null);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      if (navigator.vibrate) navigator.vibrate(200);
    });

    // ── الحل الجذري: مزامنة بناءً على playerId ──
    // كل ما يتغير الـ state بالسيرفر (renumber, kick, etc.)
    // نبحث عن اللاعب بالـ playerId أو الهاتف ونحدّث physicalId + role + alive
    const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
    const cleanupSync = on('game:state-sync', (state: any) => {
      if (!state || !state.players) return;

      // البحث بـ playerId أولاً (الطريقة الموثوقة)
      let me = playerId
        ? state.players.find((p: any) => p.playerId === playerId)
        : null;

      // fallback: البحث بالهاتف
      if (!me && normalizedPhone) {
        me = state.players.find((p: any) => p.phone === normalizedPhone);
      }

      if (me) {
        // تحديث الرقم إذا تغيّر
        if (String(me.physicalId) !== physicalId) {
          const oldId = physicalId;
          setPhysicalId(String(me.physicalId));
          // تحديث الكاش
          const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
          saved.physicalId = me.physicalId;
          localStorage.setItem('mafia_session', JSON.stringify(saved));
          // تنبيه بصري
          if (oldId && oldId !== '0') {
            setSeatChangeAlert(`تم تغيير رقمك: ${oldId} ← ${me.physicalId}`);
            setTimeout(() => setSeatChangeAlert(null), 5000);
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          }
        }

        // تحديث الاسم إذا تغيّر
        if (me.name && me.name !== displayName) {
          setDisplayName(me.name);
        }

        // تحديث حالة الحياة
        if (!me.isAlive && !isPlayerDead) {
          setIsPlayerDead(true);
          setCardFlipped(true);
        }
        // ← إحياء: إذا اللاعب حي في لعبة جديدة بس الـ state يقول ميت
        if (me.isAlive && isPlayerDead) {
          setIsPlayerDead(false);
          setCardFlipped(false);
        }
      } else {
        // اللاعب مش موجود بالـ state → ممكن اتطرد
        // بس ما نمسح الجلسة هون عشان ممكن يكون state-sync لغرفة ثانية
      }
    });

    return () => {
      cleanupRole();
      cleanup();
      cleanupSync();
    };
  }, [step, on, playerId, phone, physicalId, displayName, isPlayerDead]);

  // ── استعادة حالة التصويت فور اكتمال الـ rejoin (safety net شامل) ──
  // هذا يشتغل مرة واحدة بعد step = 'rejoined' ويجلب بيانات التصويت مباشرة
  useEffect(() => {
    if (step !== 'rejoined' || !emit || !roomId) return;

    // تأخير بسيط لانتظار React batching يطبّق كل الـ states من rejoin callback
    const timer = setTimeout(async () => {
      try {
        const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
        const res = await emit('room:get-my-state', {
          roomId,
          playerId: playerId || undefined,
          phone: normalizedPhone || undefined,
        });
        console.log(`🛡️ Post-rejoin fetch: phase=${res.phase}, hasVotingState=${!!res.votingState}, candidates=${res.votingState?.candidates?.length || 0}`);
        
        if (res.success && res.phase) {
          setGamePhase(res.phase);
          
          if (res.votingState && res.phase === 'DAY_VOTING') {
            console.log(`🛡️ Restoring voting state: ${res.votingState.candidates?.length} candidates`);
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            const myPhysId = parseInt(physicalId);
            if (res.votingState.playerVotes?.[myPhysId] !== undefined) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            }
          }
        }
      } catch { /* ignore */ }
    }, 500);

    return () => clearTimeout(timer);
  }, [step, emit, roomId]); // deps بسيطة — يشتغل فقط عند rejoin

  // ── استقبال أحداث التصويت ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // بدء التصويت
    const cleanupVotingStarted = on('day:voting-started', (data: any) => {
      setGamePhase('DAY_VOTING');
      setVotingCandidates(data.candidates || []);
      if (data.playersInfo) setVotingPlayersInfo(data.playersInfo);
      setPlayerVotes(data.playerVotes || {});
      // استعادة صوتي إذا صوّتت مسبقاً (reconnect)
      const myPhysId = parseInt(physicalId);
      if (data.playerVotes && data.playerVotes[myPhysId] !== undefined) {
        setMyVote(data.playerVotes[myPhysId]);
      } else {
        setMyVote(null);
      }
      setTotalVotesCast(0);
      setVotingComplete(false);
      if (navigator.vibrate) navigator.vibrate([100, 200]);
    });

    // تحديث الأصوات اللحظي
    const cleanupVoteUpdate = on('day:vote-update', (data: any) => {
      setVotingCandidates(data.candidates || []);
      setTotalVotesCast(data.totalVotesCast || 0);
      if (data.playerVotes) {
        setPlayerVotes(data.playerVotes);
        // مزامنة صوتي من السيرفر (مهم لتغيير الصوت)
        const myPhysId = parseInt(physicalId);
        if (data.playerVotes[myPhysId] !== undefined) {
          setMyVote(data.playerVotes[myPhysId]);
        }
      }
    });

    // اكتمال التصويت
    const cleanupVotingComplete = on('day:voting-complete', () => {
      setVotingComplete(true);
    });

    // تغيير المرحلة
    const cleanupPhaseChanged = on('game:phase-changed', (data: any) => {
      console.log(`🔄 Phase changed event: ${data.phase}`);
      setGamePhase(data.phase);
      // حماية من الـ polling: لا نسمح للـ polling بإعادة كتابة المرحلة لـ 10 ثواني
      phaseOverrideRef.current = { phase: data.phase };
      // مسح بيانات التصويت فقط عند الخروج من مرحلة التصويت
      if (data.phase !== 'DAY_VOTING' && data.phase !== 'DAY_JUSTIFICATION') {
        setVotingCandidates([]);
        setMyVote(null);
        setVotingComplete(false);
        setPlayerVotes({});
      }
    });

    // التبرير
    const cleanupJustification = on('day:justification-started', () => {
      console.log('⚖️ Justification started');
      setGamePhase('DAY_JUSTIFICATION');
      phaseOverrideRef.current = { phase: 'DAY_JUSTIFICATION' };
    });

    // الإقصاء
    const cleanupElimination = on('day:elimination-pending', () => {
      console.log('💀 Elimination pending');
      setGamePhase('ELIMINATION_PENDING');
      phaseOverrideRef.current = { phase: 'ELIMINATION_PENDING' };
      // مسح التصويت
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
    });

    // انتهاء اللعبة — لا نمسح الدور أو حالة الموت (اللاعب لازم يشوفهم)
    // الـ full reset يحصل فقط عند game:started
    const cleanupGameOver = on('game:over', () => {
      console.log('🏁 Game over — clearing voting only');
      setGamePhase('GAME_OVER');
      phaseOverrideRef.current = { phase: 'GAME_OVER' };
      // مسح التصويت فقط
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
    });

    // إغلاق الغرفة من الليدر
    const cleanupClosed = on('game:closed', () => {
      console.log('🔒 Game closed — full reset');
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
    });

    return () => {
      cleanupVotingStarted();
      cleanupVoteUpdate();
      cleanupVotingComplete();
      cleanupPhaseChanged();
      cleanupJustification();
      cleanupElimination();
      cleanupGameOver();
      cleanupClosed();
    };
  }, [step, on, physicalId]);

  // ── Polling: مزامنة حالة اللاعب كل 3 ثواني (بالـ phone/playerId مش physicalId) ──
  // هذا هو الحل النهائي: حتى لو الـ WebSocket events ما وصلت،
  // الـ polling بيجلب الرقم الصحيح من السيرفر كل 3 ثواني
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !emit) return;
    if (!roomId) return;

    const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;

    const pollState = async () => {
      try {
        const res = await emit('room:get-my-state', {
          roomId,
          playerId: playerId || undefined,
          phone: normalizedPhone || undefined,
        });
        console.log(`📊 Poll: phase=${res.phase}, hasVotingState=${!!res.votingState}, candidates=${res.votingState?.candidates?.length || 0}`);
        if (res.success && res.player) {
          // تحديث الرقم إذا تغيّر
          if (String(res.player.physicalId) !== physicalId) {
            console.log(`🔄 Polling: seat changed ${physicalId} → ${res.player.physicalId}`);
            setPhysicalId(String(res.player.physicalId));
            // تحديث الكاش
            const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
            saved.physicalId = res.player.physicalId;
            localStorage.setItem('mafia_session', JSON.stringify(saved));
            // تنبيه
            if (physicalId && physicalId !== '0') {
              setSeatChangeAlert(`تم تغيير رقمك: ${physicalId} ← ${res.player.physicalId}`);
              setTimeout(() => setSeatChangeAlert(null), 5000);
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
          }
          // تحديث الاسم إذا تغيّر
          if (res.player.name && res.player.name !== displayName) {
            setDisplayName(res.player.name);
          }
          // تحديث الدور
          if (res.player.role && !assignedRole) {
            setAssignedRole(res.player.role);
            setCardFlipped(false);
            setRoleAlert(true); // ← تنبيه جلونج
            if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
          }
          // تحديث حالة الحياة
          if (!res.player.isAlive && !isPlayerDead) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // إحياء: لعبة جديدة → اللاعب حي بس الـ state يقول ميت
          if (res.player.isAlive && isPlayerDead) {
            setIsPlayerDead(false);
            setCardFlipped(false);
          }

          // تحديث مرحلة اللعبة (مع حماية من الـ phase-changed event)
          if (res.phase) {
            const override = phaseOverrideRef.current;
            if (override && res.phase !== override.phase) {
              console.log(`🛡️ Poll blocked: server=${res.phase}, override=${override.phase}`);
              // لا نسمح للـ polling بإرجاع المرحلة القديمة
            } else {
              // السيرفر تطابق مع الـ override أو لا يوجد override
              if (override && res.phase === override.phase) phaseOverrideRef.current = null;
              // تحويل DAY_ELIMINATION للتوافق مع واجهة اللاعب
              const mappedPhase = res.phase === 'DAY_ELIMINATION' ? 'ELIMINATION_PENDING' : res.phase;
              setGamePhase(mappedPhase);
            }
          }

          // استعادة بيانات التصويت بعد reconnect (مع حماية override)
          const overrideActive = phaseOverrideRef.current !== null;
          if (!overrideActive && res.votingState && res.phase === 'DAY_VOTING') {
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            const myPhysId = parseInt(physicalId);
            if (res.votingState.playerVotes?.[myPhysId] !== undefined && myVote === null) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            }
          } else if (!overrideActive && res.phase && res.phase !== 'DAY_VOTING') {
            // خارج التصويت → مسح بيانات التصويت إذا موجودة
            if (votingCandidates.length > 0) {
              setVotingCandidates([]);
              setMyVote(null);
              setVotingComplete(false);
              setPlayerVotes({});
            }
          }

          // تمرير بيانات المراحل لـ PlayerPhaseView (للاستعادة عند reconnect)
          setPhasePollData({
            justificationData: res.justificationData || null,
            withdrawalState: res.withdrawalState || null,
            discussionState: res.discussionState || null,
            winner: res.winner || null,
            allPlayers: res.allPlayers || null,
            pendingResolution: res.pendingResolution || null,
          });

          // تحديث أسماء اللاعبين (مهم لعرض أسماء المتهمين في مرحلة التبرير)
          if (res.playersInfo && votingPlayersInfo.length === 0) {
            setVotingPlayersInfo(res.playersInfo);
          }
        }
      } catch (e) { /* ignore polling errors */ }
    };

    // تنفيذ فوري أول مرة + ثم كل 3 ثواني
    pollState();
    const interval = setInterval(pollState, 3000);

    return () => clearInterval(interval);
  }, [step, emit, roomId, playerId, phone, physicalId, displayName, assignedRole, isPlayerDead]);


  // ── الخطوة 1: إدخال كود اللعبة ──
  const handleFindRoom = async (code?: string) => {
    const targetCode = code || roomCode.trim();
    setApiError('');
    try {
      const res = await emit('room:find-by-code', { roomCode: targetCode });
      setRoomId(res.roomId);
      setGameName(res.gameName);
      setMaxPlayers(res.maxPlayers || 10);
      if (res.occupiedSeats && Array.isArray(res.occupiedSeats)) {
        setOccupiedSeats(res.occupiedSeats);
      }

      // ✅ إذا اللاعب مسجل دخول → تخطي phone + login → دخول مباشر
      // نقرأ من localStorage كـ fallback لأن الـ state ممكن ما اتحدث بعد
      const savedToken = playerToken || getSavedToken();
      const savedPlayerId = playerId || getSavedPlayerId();

      if (savedToken && savedPlayerId) {
        console.log('⚡ Player already authenticated — skipping phone/login steps');
        let playerPhone = phone || getSavedPhone();
        // جلب بيانات اللاعب من /me إذا مش متوفر
        if (!playerPhone) {
          // محاولة 2: من /me endpoint
          try {
            const meRes = await fetch('/api/player-auth/me', {
              headers: { 'Authorization': `Bearer ${savedToken}` },
            });
            const meData = await meRes.json();
            if (meData.success && meData.player) {
              playerPhone = meData.player.phone || '';
              setDisplayName(meData.player.name || '');
              setPlayerId(meData.player.id);
              if (meData.player.gender) setGender(meData.player.gender === 'FEMALE' ? 'female' : 'male');
              if (meData.player.avatarUrl) setAvatarUrl(meData.player.avatarUrl);
            }
          } catch {}
        }
        if (playerPhone) setPhone(playerPhone);
        setPlayerToken(savedToken);
        await tryRejoinCurrentRoom(savedPlayerId, savedToken, playerPhone);
        return;
      }

      if (!code) setStep('phone');
    } catch (err: any) {
      setApiError(err.message || 'لم يتم العثور على اللعبة');
    }
  };

  // ── الخطوة 2: البحث بالهاتف → login أو register ──
  const handlePhoneLookup = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;

    // إذا عنده توكن صالح → يتخطى تسجيل الدخول
    const savedToken = playerToken || getSavedToken();
    const savedPid = playerId || getSavedPlayerId();
    if (savedToken && savedPid) {
      setPlayerToken(savedToken);
      setPlayerId(savedPid);
      if (mustChangePassword) {
        setStep('change_password');
      } else {
        // تحقق إذا اللاعب أصلاً جوا اللعبة
        await tryRejoinCurrentRoom(savedPid, savedToken);
      }
      return;
    }

    try {
      const res = await fetch('/api/player/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });
      const data = await res.json();

      if (data.found && data.player) {
        setDisplayName(data.player.displayName);
        setPlayerId(data.player.id);
        if (data.player.playerId || data.player.id) localStorage.setItem('mafia_playerId', String(data.player.playerId || data.player.id));
        setStep('login'); // الحساب موجود → تسجيل دخول
      } else {
        setStep('register'); // حساب جديد → تسجيل
      }
    } catch (err) {
      setApiError('خطأ في الاتصال');
    }
  };

  // ── الخطوة 3أ: تسجيل دخول بكلمة سر ──
  const handleLogin = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;
    try {
      const res = await fetch('/api/player-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, password }),
      });
      const data = await res.json();

      if (data.success) {
        setPlayerToken(data.token);
        localStorage.setItem('mafia_player_token', data.token);
        setPlayerId(data.player.id);
        setDisplayName(data.player.name);
        localStorage.setItem('mafia_playerId', String(data.player.id));
        if (data.player.avatarUrl) setAvatarUrl(data.player.avatarUrl);

        // ── مسح جلسة لاعب آخر إذا موجودة ──
        const oldSession = localStorage.getItem('mafia_session');
        if (oldSession) {
          try {
            const s = JSON.parse(oldSession);
            if (s.playerId && s.playerId !== data.player.id) {
              localStorage.removeItem('mafia_session');
              console.log(`🧹 Cleared stale session from player #${s.playerId}`);
            }
          } catch {}
        }

        if (data.player.mustChangePassword) {
          setMustChangePassword(true);
          setStep('change_password');
        } else {
          // ── تحقق إذا اللاعب أصلاً جوا اللعبة الحالية ──
          await tryRejoinCurrentRoom(data.player.id, data.token);
        }
      } else {
        setApiError(data.error || 'خطأ في تسجيل الدخول');
      }
    } catch (err) {
      setApiError('خطأ في الاتصال');
    }
  };

  // ── محاولة الانضمام التلقائي للغرفة (بعد login/register) ──
  const tryRejoinCurrentRoom = async (pid: number, token: string, phoneOverride?: string) => {
    const playerPhone = phoneOverride || phone;
    // 1. جرّب rejoin عبر WebSocket إذا عنا roomId
    if (emit && roomId && playerPhone) {
      try {
        const normalized = playerPhone.startsWith('0') ? playerPhone : '0' + playerPhone;
        const res: any = await emit('room:rejoin-player', {
          roomId,
          physicalId: 0, // نبحث بالهاتف
          phone: normalized,
        });
        if (res?.success && res.player) {
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          setGender(res.player.gender === 'FEMALE' ? 'female' : 'male');
          setPlayerId(pid);
          if (res.player.role) setAssignedRole(res.player.role);
          if (res.mafiaTeam && res.mafiaTeam.length > 0) setMafiaTeam(res.mafiaTeam);
          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // حفظ الجلسة
          localStorage.setItem('mafia_session', JSON.stringify({
            roomId, physicalId: res.player.physicalId, phone: normalized,
            displayName: res.player.name, roomCode, playerId: pid,
          }));
          setStep('rejoined');
          return;
        }
      } catch {}
    }

    // 2. جرّب /me endpoint للبحث عن لعبة نشطة
    try {
      const meRes = await fetch('/api/player-auth/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const meData = await meRes.json();
      if (meData.success && meData.activeGame && meData.activeGame.roomId) {
        const ag = meData.activeGame;
        // إذا الغرفة النشطة هي نفس الغرفة الحالية → دخول مباشر
        if (!roomId || ag.roomId === roomId) {
          setRoomId(ag.roomId);
          setRoomCode(ag.roomCode || roomCode);
          setPhysicalId(String(ag.physicalId));
          setGameName(ag.gameName || gameName);
          if (ag.role) setAssignedRole(ag.role);
          if (ag.isAlive === false) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          localStorage.setItem('mafia_session', JSON.stringify({
            roomId: ag.roomId, physicalId: ag.physicalId,
            phone: playerPhone.startsWith('0') ? playerPhone : '0' + playerPhone,
            displayName, roomCode: ag.roomCode || roomCode, playerId: pid,
          }));
          setStep('rejoined');
          return;
        }

        // ── الغرفة النشطة مختلفة عن الهدف ──
        if (roomId && ag.roomId !== roomId) {
          // اللاعب حي → يرجع لغرفته الحالية تلقائياً (لا خيار تبديل)
          if (ag.isAlive !== false) {
            setRoomId(ag.roomId);
            setRoomCode(ag.roomCode || roomCode);
            setPhysicalId(String(ag.physicalId));
            setGameName(ag.gameName || gameName);
            if (ag.role) setAssignedRole(ag.role);
            localStorage.setItem('mafia_session', JSON.stringify({
              roomId: ag.roomId, physicalId: ag.physicalId,
              phone: playerPhone.startsWith('0') ? playerPhone : '0' + playerPhone,
              displayName, roomCode: ag.roomCode || roomCode, playerId: pid,
            }));
            setStep('rejoined');
            setApiError('أنت لا تزال على قيد الحياة في لعبة أخرى — لا يمكنك الانتقال');
            return;
          }

          // اللاعب ميت → عرض نافذة تأكيد التبديل
          setSwitchConfirm({
            currentRoomId: ag.roomId,
            currentGameName: ag.gameName || 'غرفة نشطة',
            targetRoomId: roomId,
            targetGameName: gameName || 'غرفة جديدة',
          });
          return;
        }
      }
    } catch {}

    // 3. لا لعبة نشطة → اختيار مقعد عادي
    setStep('number');
  };

  // ── تنفيذ التبديل بين الغرف ──
  const handleSwitchRoom = async () => {
    if (!switchConfirm || !emit) return;
    setSwitchLoading(true);
    try {
      const normalized = phone.startsWith('0') ? phone : '0' + phone;
      // 1. تجميد اللاعب في الغرفة الحالية
      await emit('room:freeze-player', {
        roomId: switchConfirm.currentRoomId,
        phone: normalized,
        playerId: playerId || undefined,
      });

      // 2. مسح الجلسة القديمة
      localStorage.removeItem('mafia_session');

      // 3. الانتقال لاختيار مقعد في الغرفة الجديدة
      setRoomId(switchConfirm.targetRoomId);
      setAssignedRole(null);
      setCardFlipped(false);
      setIsPlayerDead(false);
      setPhysicalId('');
      setSwitchConfirm(null);
      setStep('number');
    } catch (err: any) {
      setApiError(err.message || 'فشل في التبديل');
    } finally {
      setSwitchLoading(false);
    }
  };

  // ── الخطوة 3ب: تسجيل حساب جديد ──
  const handleRegister = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;
    const dateOfBirth = dobYear && dobMonth && dobDay
      ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
      : null;

    if (!password || password.length < 4) {
      setApiError('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }

    try {
      const res = await fetch('/api/player-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalized,
          password,
          name: displayName,
          gender: gender || 'MALE',
          dob: dateOfBirth,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlayerToken(data.token);
        localStorage.setItem('mafia_player_token', data.token);
        setPlayerId(data.player.id);
        localStorage.setItem('mafia_playerId', String(data.player.id));
        // لاعب جديد — مستحيل يكون جوا لعبة، يروح على اختيار مقعد
        setStep('number');
      } else {
        setApiError(data.error);
      }
    } catch (err) {
      setApiError('خطأ في الاتصال');
    }
  };

  // ── تغيير كلمة السر (للاعبين المهاجرين) ──
  const handleChangePassword = async () => {
    setApiError('');
    if (!newPassword || newPassword.length < 4) {
      setApiError('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل');
      return;
    }
    try {
      const res = await fetch('/api/player-auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${playerToken}`,
        },
        body: JSON.stringify({ oldPassword: password, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) {
          setPlayerToken(data.token);
          localStorage.setItem('mafia_player_token', data.token);
        }
        setMustChangePassword(false);
        await tryRejoinCurrentRoom(playerId!, data.token || playerToken!);
      } else {
        setApiError(data.error);
      }
    } catch (err) {
      setApiError('خطأ في الاتصال');
    }
  };

  // ── الخطوة 4: الانضمام للعبة ──
  const handleJoinGame = async () => {
    if (!physicalId || !displayName) return;
    setApiError('');
    try {
      const dateOfBirth = dobYear && dobMonth && dobDay
        ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
        : undefined;
      const genderUpper = gender === 'female' ? 'FEMALE' : gender === 'male' ? 'MALE' : undefined;
      const res = await joinRoom(roomId, parseInt(physicalId), displayName, phone, playerId || undefined, genderUpper, dateOfBirth);

      // إذا تم ربط اللاعب بمقعد ليدر → تحديث الرقم الفيزيائي
      const actualPhysicalId = res?.linkedSeat || parseInt(physicalId);
      if (res?.linkedSeat) {
        setPhysicalId(String(res.linkedSeat));
        console.log(`🔗 Linked to leader seat #${res.linkedSeat}`);
      }

      // حفظ الجلسة في localStorage
      localStorage.setItem('mafia_session', JSON.stringify({
        roomId,
        physicalId: actualPhysicalId,
        phone,
        displayName,
        roomCode,
        playerId: playerId || null,
      }));

      setStep('done');
    } catch (err: any) {
      setApiError(err.message);
    }
  };

  // ── المقاعد المتاحة فقط ──
  const availableSeats = Array.from({ length: maxPlayers }, (_, i) => i + 1).filter(
    num => !occupiedSeats.includes(num)
  );

  return (
    <div className="display-bg min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden blood-vignette selection:bg-[#8A0303] selection:text-white">

      {/* ── Title: MAFIA CLUB + Logo ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-center gap-4 md:gap-6 mb-8 relative z-10 w-full max-w-md"
      >
        {/* النصوص */}
        <h1 className="text-center md:text-right">
          <span
            className="block text-4xl md:text-5xl font-black tracking-tight text-[#C5A059]"
            style={{
              fontFamily: 'Amiri, serif',
              textShadow: '0 0 30px rgba(138,3,3,0.4)',
            }}
          >
            MAFIA
          </span>
          <span
            dir="ltr"
            className="flex justify-between text-xl md:text-2xl font-light text-[#8A0303] mt-1 w-full"
            style={{
              fontFamily: 'Amiri, serif',
              textShadow: '0 0 20px rgba(138,3,3,0.3)',
            }}
          >
            {'CLUB'.split('').map((letter, i) => (
              <span key={i}>{letter}</span>
            ))}
          </span>
        </h1>

        {/* اللوجو */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="shrink-0"
        >
          <Image
            src="/mafia_logo.png"
            alt="Mafia Club Logo"
            width={80}
            height={80}
            className="select-none w-[60px] h-[60px] md:w-[80px] md:h-[80px] drop-shadow-[0_0_20px_rgba(138,3,3,0.3)]"
            priority
          />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 sm:p-10 rounded-xl bg-black/60 backdrop-blur-md border border-[#2a2a2a] shadow-[0_0_40px_rgba(0,0,0,0.8)] relative z-10"
      >
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#8A0303]/60 to-transparent opacity-80 rounded-t-xl" />
        
        <AnimatePresence mode="wait">

          {/* ── خطوة 1: كود اللعبة ── */}
          {step === 'code' && (
            <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><OperationIcon /></div>
                <h1 className="text-3xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>الانضمام للعملية</h1>
                <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em]">INPUT SECURE OPERATION CODE</p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="----"
                className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-4xl tracking-[0.4em] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] focus:outline-none transition-colors mb-6 placeholder-[#222]"
                maxLength={4}
                autoFocus
              />

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mb-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={() => handleFindRoom()}
                disabled={roomCode.length !== 4 || !isConnected}
                className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
              >
                <span>{isConnected ? 'ESTABLISH LINK' : 'CONNECTING...'}</span>
              </button>
            </motion.div>
          )}

          {/* ── خطوة 2: رقم الهاتف ── */}
          {step === 'phone' && (
           <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><PhoneIcon /></div>
                <h1 className="text-2xl font-black mb-2 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{gameName || 'عملية جارية'}</h1>
                <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em]">AGENT IDENTIFICATION</p>
              </div>

              {initialRoomCode && !roomId && !apiError && (
                <div className="text-center mb-4">
                  <p className="text-[#C5A059] text-[10px] font-mono tracking-widest uppercase animate-pulse">LOCATING COMPONENT...</p>
                </div>
              )}

              {initialRoomCode && apiError && !roomId && (
                <div className="text-center mb-6">
                  <p className="text-[#8A0303] text-xs font-mono tracking-widest uppercase">{apiError}</p>
                </div>
              )}

              {(roomId || !initialRoomCode) && (
                <>
                  <div className="flex items-center gap-2 mb-6 font-mono">
                    <span className="bg-black/40 border border-[#2a2a2a] rounded-lg px-4 py-4 text-[#808080] text-sm shrink-0">
                      +962
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="7XXXXXXXX"
                      className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-lg tracking-widest focus:border-[#C5A059] focus:outline-none transition-colors"
                      maxLength={10}
                      autoFocus
                    />
                  </div>

                  {apiError && roomId && <p className="text-[#8A0303] text-[10px] font-mono text-center mb-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

                  <button
                    onClick={handlePhoneLookup}
                    disabled={phone.length < 9}
                    className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                  >
                    <span>VERIFY IDENTITY</span>
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* ── خطوة 3: التسجيل (للجدد) ── */}
          {step === 'register' && (
            <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <h2 className="text-2xl font-black mb-1 text-white" style={{ fontFamily: 'Amiri, serif' }}>هوية جديدة</h2>
                <p className="text-[#808080] text-[10px] font-mono tracking-[0.2em] uppercase">NEW DOSSIER REGISTRATION</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Codename</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="الاسم المستعار"
                    className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none transition-colors"
                    maxLength={20}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Date of Birth</label>
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none text-xs"
                    >
                      <option value="">DD</option>
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </select>
                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none text-xs"
                    >
                      <option value="">MM</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                      ))}
                    </select>
                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none text-xs"
                    >
                      <option value="">YYYY</option>
                      {Array.from({ length: 50 }, (_, i) => {
                        const year = new Date().getFullYear() - 8 - i;
                        return <option key={year} value={String(year)}>{year}</option>;
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Classification</label>
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <button
                      onClick={() => setGender('male')}
                      className={`p-3 rounded-lg border text-center text-sm font-bold tracking-widest transition-all ${
                        gender === 'male'
                          ? 'bg-blue-900/20 border-blue-500/50 text-blue-400'
                          : 'bg-black/40 border-[#2a2a2a] text-[#555] hover:border-[#555]'
                      }`}
                    >
                      ♂ ذكر
                    </button>
                    <button
                      onClick={() => setGender('female')}
                      className={`p-3 rounded-lg border text-center text-sm font-bold tracking-widest transition-all ${
                        gender === 'female'
                          ? 'bg-purple-900/20 border-purple-500/50 text-purple-400'
                          : 'bg-black/40 border-[#2a2a2a] text-[#555] hover:border-[#555]'
                      }`}
                    >
                      ♀ أنثى
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="كلمة المرور (4 أحرف+)"
                    className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center focus:border-[#C5A059] focus:outline-none transition-colors font-mono tracking-widest"
                    minLength={4}
                  />
                </div>
              </div>

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mt-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleRegister}
                  disabled={!displayName || !password || password.length < 4}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>SUBMIT DOSSIER</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── خطوة 3أ: تسجيل الدخول (حساب موجود) ── */}
          {step === 'login' && (
            <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><OperationIcon /></div>
                <h2 className="text-2xl font-black mb-1 text-white" style={{ fontFamily: 'Amiri, serif' }}>مرحباً {displayName}</h2>
                <p className="text-[#808080] text-[10px] font-mono tracking-[0.2em] uppercase">ENTER ACCESS CODE</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-mono text-[#555] mb-2 tracking-[0.2em] uppercase">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="كلمة المرور"
                    className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-2xl tracking-[0.3em] focus:border-[#C5A059] focus:outline-none transition-colors"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
              </div>

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mt-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleLogin}
                  disabled={!password}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>ACCESS GRANTED</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── خطوة تغيير كلمة السر (للمهاجرين) ── */}
          {step === 'change_password' && (
            <motion.div key="change_pw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-6 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><OperationIcon /></div>
                <h2 className="text-2xl font-black mb-1 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>تغيير كلمة المرور</h2>
                <p className="text-[#808080] text-[10px] font-mono tracking-[0.2em] uppercase">UPDATE YOUR ACCESS CODE</p>
              </div>

              <div className="space-y-4">
                <p className="text-[#C5A059]/80 text-xs text-center" style={{ fontFamily: 'Amiri, serif' }}>كلمة المرور الحالية مؤقتة — اختر كلمة مرور جديدة</p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="كلمة المرور الجديدة (4 أحرف+)"
                  className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-xl tracking-[0.3em] focus:border-[#C5A059] focus:outline-none transition-colors"
                  autoFocus
                  minLength={4}
                  onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                />
              </div>

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mt-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleChangePassword}
                  disabled={!newPassword || newPassword.length < 4}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>UPDATE CODE</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── خطوة 4: المقاعد المتاحة ── */}
          {step === 'number' && (
            <motion.div key="number" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center"><SeatIcon /></div>
                <h2 className="text-2xl font-black mb-2 text-white truncate" style={{ fontFamily: 'Amiri, serif' }}>مرحباً {displayName}</h2>
                <p className="text-[#808080] text-sm" style={{ fontFamily: 'Amiri, serif' }}>اختر المقعد المخصص لك</p>
              </div>

              {availableSeats.length === 0 ? (
                <div className="text-center p-6 bg-[#8A0303]/10 border border-[#8A0303]/30 rounded-lg mb-6">
                  <p className="text-[#ff4444] text-sm" style={{ fontFamily: 'Amiri, serif' }}>جميع المقاعد مشغولة</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mb-6">
                  {availableSeats.map(num => {
                    const isSelected = physicalId === String(num);
                    return (
                      <button
                        key={num}
                        onClick={() => setPhysicalId(String(num))}
                        className={`p-3 font-mono font-black text-xl rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-[#C5A059] text-black border-[#C5A059] shadow-[0_0_20px_rgba(197,160,89,0.3)] scale-105'
                            : 'bg-black/40 text-white border-[#2a2a2a] hover:border-[#C5A059]/50 hover:bg-[#0a0a0a]'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              )}

              {physicalId && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bg-black/40 border border-[#C5A059]/30 rounded-lg p-3 text-center mb-6">
                  <p className="text-[#C5A059] text-sm" style={{ fontFamily: 'Amiri, serif' }}>
                    ✓ تم اختيار المقعد رقم {physicalId}
                  </p>
                </motion.div>
              )}

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mb-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={handleJoinGame}
                disabled={!physicalId || loading}
                className="w-full py-4 text-lg font-black rounded-lg border-2 transition-all disabled:opacity-50"
                style={{
                  fontFamily: 'Amiri, serif',
                  background: !physicalId || loading ? '#222' : 'linear-gradient(135deg, #166534, #15803d)',
                  borderColor: !physicalId || loading ? '#333' : '#22c55e',
                  color: !physicalId || loading ? '#666' : '#fff',
                  boxShadow: !physicalId || loading ? 'none' : '0 0 25px rgba(34,197,94,0.4), 0 0 50px rgba(34,197,94,0.15)',
                  textShadow: !physicalId || loading ? 'none' : '0 0 10px rgba(34,197,94,0.5)',
                }}
              >
                {loading ? 'جارٍ التحميل...' : 'اختر مقعدك'}
              </button>
            </motion.div>
          )}

          {/* ── خطوة 5: تم ── */}
          {step === 'done' && (
           <motion.div key="done" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* ── أزرار الملف الشخصي + تسجيل خروج ── */}
              <div className="flex justify-between mb-2">
                <Link
                  href="/player/profile"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#C5A059]/20 text-[#C5A059] hover:bg-[#C5A059]/10 transition-all text-[10px] font-mono tracking-widest uppercase"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  PROFILE
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-[10px] font-mono tracking-widest uppercase"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  EXIT
                </button>
              </div>

              {/* 🔍 DEBUG BAR (مؤقت — للتشخيص) */}
              <div className="text-[8px] font-mono text-[#555] bg-[#0a0a0a] border border-[#1a1a1a] px-2 py-1 rounded mt-1 text-center">
                P:{gamePhase || 'null'} | C:{votingCandidates.length} | R:{assignedRole || 'null'} | S:{step} | v3.0
              </div>

              {/* ── عرض مرحلة اللعبة الحالية ── */}
              {gamePhase && gamePhase !== 'DAY_VOTING' && gamePhase !== 'LOBBY' && (
                <PlayerPhaseView
                  gamePhase={gamePhase}
                  physicalId={physicalId}
                  assignedRole={assignedRole}
                  isPlayerDead={isPlayerDead}
                  on={on}
                  emit={emit}
                  myVote={myVote}
                  votingCandidates={votingCandidates}
                  votingPlayersInfo={votingPlayersInfo}
                  pollData={phasePollData}
                />
              )}

              {/* ── مرحلة التصويت: تحميل أو عرض ── */}
              {gamePhase === 'DAY_VOTING' && votingCandidates.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-10"
                >
                  <div className="text-3xl mb-3">🗳️</div>
                  <div className="w-8 h-8 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[#C5A059] text-sm font-mono">جاري تحميل التصويت...</p>
                </motion.div>
              ) : gamePhase === 'DAY_VOTING' && votingCandidates.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* عنوان */}
                  <div className="text-center mb-5">
                    <div className="text-3xl mb-2">🗳️</div>
                    <h2 className="text-xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                      مرحلة التصويت
                    </h2>
                    <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.15em] mt-1">
                      {isPlayerDead ? 'مشاهدة فقط — أنت مُقصى' : myVote !== null ? '✅ تم التصويت — اضغط لاعب آخر للتغيير' : 'صوّت ضد اللاعب المشتبه'}
                    </p>
                  </div>

                  {/* شريط التقدم */}
                  <div className="mb-5 px-2">
                    <div className="flex justify-between text-[10px] text-[#808080] font-mono mb-1">
                      <span>{totalVotesCast} صوت</span>
                      <span>{votingCandidates.reduce((max: number, c: any) => Math.max(max, c.votes || 0), 0)} أعلى</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #C5A059, #E8C97A)' }}
                        animate={{ width: `${Math.min(100, (totalVotesCast / Math.max(1, votingCandidates.length)) * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    {votingComplete && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[#C5A059] text-[10px] font-mono text-center mt-2 tracking-wider"
                      >
                        ✓ اكتمل التصويت — بانتظار الليدر
                      </motion.p>
                    )}
                  </div>

                  {/* كروت المرشحين */}
                  <div className="grid grid-cols-3 gap-2.5 px-1 max-h-[55vh] overflow-y-auto pb-4">
                    {votingCandidates.map((candidate: any, index: number) => {
                      const isSelf = candidate.targetPhysicalId === parseInt(physicalId);
                      const isMyChoice = myVote === index;
                      const playerInfo = votingPlayersInfo.find((p: any) => p.physicalId === candidate.targetPhysicalId);
                      const candidateName = playerInfo?.name || `#${candidate.targetPhysicalId}`;
                      const candidateAvatar = playerInfo?.avatarUrl;
                      const isDeal = candidate.type === 'DEAL';
                      const initiatorInfo = isDeal ? votingPlayersInfo.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;

                      return (
                        <motion.button
                          key={candidate.id || `c-${index}`}
                          whileTap={!isSelf && !isPlayerDead && !isMyChoice ? { scale: 0.92 } : {}}
                          onClick={() => {
                            if (isSelf || isPlayerDead || isMyChoice || voteSubmitting || votingComplete) return;
                            setVoteSubmitting(true);
                            emit('player:cast-vote', {
                              roomId,
                              physicalId: parseInt(physicalId),
                              candidateIndex: index,
                            }).then((res: any) => {
                              if (res?.success) {
                                setMyVote(index);
                                if (navigator.vibrate) navigator.vibrate(100);
                              }
                            }).catch(() => {}).finally(() => setVoteSubmitting(false));
                          }}
                          disabled={isSelf || isPlayerDead}
                          className={`relative flex flex-col items-center p-2.5 rounded-xl border transition-all ${
                            isMyChoice
                              ? 'border-[#C5A059] bg-[#C5A059]/10 shadow-[0_0_12px_rgba(197,160,89,0.15)]'
                              : isSelf
                                ? 'border-[#1a1a1a] bg-[#0a0a0a]/50 opacity-40'
                                : 'border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]'
                          }`}
                        >
                          {/* صورة أو رقم */}
                          <div className="relative w-11 h-11 rounded-full overflow-hidden mb-1.5 border border-[#333] bg-[#1a1a1a] flex items-center justify-center">
                            {candidateAvatar ? (
                              <Image src={candidateAvatar} alt="" width={44} height={44} className="object-cover w-full h-full" />
                            ) : (
                              <span className="text-sm font-bold text-[#C5A059] font-mono">#{candidate.targetPhysicalId}</span>
                            )}
                            {isMyChoice && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute inset-0 bg-[#C5A059]/20 flex items-center justify-center"
                              >
                                <span className="text-lg">✅</span>
                              </motion.div>
                            )}
                          </div>

                          {/* الاسم */}
                          <p className="text-[10px] font-bold text-white truncate w-full text-center leading-tight">
                            {isDeal ? `${initiatorInfo?.name || '?'} ⇄` : ''} {candidateName}
                          </p>

                          {/* رقم المقعد */}
                          {candidateAvatar && (
                            <p className="text-[8px] text-[#808080] font-mono">#{candidate.targetPhysicalId}</p>
                          )}

                          {/* عداد الأصوات */}
                          <div className="mt-1 flex items-center gap-0.5">
                            <span className="text-[11px] font-bold text-[#C5A059]">{candidate.votes || 0}</span>
                            <span className="text-[9px] text-[#808080]">♥</span>
                          </div>

                          {/* شارة "أنت" */}
                          {isSelf && (
                            <span className="absolute top-1 right-1 text-[7px] bg-[#222] text-[#808080] px-1 py-0.5 rounded font-mono">أنت</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : assignedRole === null ? (
                /* ── حالة الانتظار (لم يُوزَّع الدور بعد) ── */
                <>
                  <motion.div
                    className="text-[#C5A059] flex justify-center mb-6"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <ShieldCheckIcon />
                  </motion.div>
                  <h2 className="text-3xl font-black mb-4 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>اكتمل التشفير</h2>

                  <div className="flex justify-center mb-8">
                    <MafiaCard
                      key={`card-${physicalId}`}
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={null}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={false}
                      size="md"
                      avatarUrl={avatarUrl}
                    />
                  </div>

                  <div className="w-16 h-[1px] bg-[#2a2a2a] mx-auto mb-6" />

                  <p className="text-[#C5A059] text-[11px] font-mono uppercase tracking-[0.2em] leading-relaxed mb-4">
                    SECURE YOUR DEVICE. DIRECT ATTENTION TO PRIMARY MONITOR.
                  </p>
                  <p className="text-[#555] text-[9px] font-mono uppercase tracking-widest">
                    STATUS ACTIVE. INTERFACE LOCKED.
                  </p>
                </>
              ) : (
                /* ── حالة الدور المُعيَّن (كارد سري قابل للقلب) ── */
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h2 className="text-2xl font-black mb-2 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                    تم تعيين مهمتك
                  </h2>
                  <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
                    TAP CARD TO REVEAL YOUR IDENTITY
                  </p>

                  <div className="flex justify-center mb-6">
                    <MafiaCard
                      key={`card-role-${physicalId}`}
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={assignedRole}
                      isFlipped={cardFlipped}
                      onFlip={() => { setCardFlipped(prev => !prev); setRoleAlert(false); }}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={true}
                      size="md"
                      avatarUrl={avatarUrl}
                    />
                  </div>

                  <AnimatePresence mode="wait">
                    {cardFlipped ? (
                      <motion.p
                        key="hide-msg"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em] animate-pulse"
                      >
                        ⚠️ أخفِ هاتفك الآن!
                      </motion.p>
                    ) : (
                      <motion.p
                        key="tap-msg"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-[#555] text-[9px] font-mono uppercase tracking-widest"
                      >
                        اضغط البطاقة لكشف دورك
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* ── عرض زملاء المافيا عند قلب الكارد ── */}
                  {cardFlipped && mafiaTeam.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="mt-4 p-3 rounded-xl border border-[#8A0303]/30 bg-gradient-to-b from-[#1a0505] to-[#0d0202]"
                    >
                      <p className="text-[#8A0303] text-[9px] font-mono uppercase tracking-[0.15em] text-center mb-2">
                        🕴️ زملاؤك في الفريق
                      </p>
                      <div className="flex justify-center gap-3 flex-wrap">
                        {mafiaTeam.map(m => (
                          <div key={m.physicalId} className="flex flex-col items-center">
                            <span className="text-[#C5A059] text-lg font-black">#{m.physicalId}</span>
                            <span className="text-[#666] text-[8px] font-mono">{m.name}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[#4a2020] text-[8px] font-mono uppercase tracking-widest text-center mt-2">
                        ⭕ لا تكشف هويتك
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}

            </motion.div>
          )}

          {/* ── خطوة Rejoin: اللاعب عاد ── */}
          {step === 'rejoined' && (
            <motion.div key="rejoined" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* ── أزرار الملف الشخصي + تسجيل خروج ── */}
              <div className="flex justify-between mb-2">
                <Link
                  href="/player/profile"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#C5A059]/20 text-[#C5A059] hover:bg-[#C5A059]/10 transition-all text-[10px] font-mono tracking-widest uppercase"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  PROFILE
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all text-[10px] font-mono tracking-widest uppercase"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  EXIT
                </button>
              </div>

              {/* 🔍 DEBUG BAR (مؤقت — للتشخيص) */}
              <div className="text-[8px] font-mono text-[#555] bg-[#0a0a0a] border border-[#1a1a1a] px-2 py-1 rounded mt-1 text-center mb-2">
                P:{gamePhase || 'null'} | C:{votingCandidates.length} | R:{assignedRole || 'null'} | S:{step} | v4.0
              </div>

              {/* ── عرض مرحلة اللعبة الحالية ── */}
              {gamePhase && gamePhase !== 'DAY_VOTING' && gamePhase !== 'LOBBY' && (
                <PlayerPhaseView
                  gamePhase={gamePhase}
                  physicalId={physicalId}
                  assignedRole={assignedRole}
                  isPlayerDead={isPlayerDead}
                  on={on}
                  emit={emit}
                  myVote={myVote}
                  votingCandidates={votingCandidates}
                  votingPlayersInfo={votingPlayersInfo}
                  pollData={phasePollData}
                />
              )}

              {/* ── التصويت أولاً (إن كان فعّال) ── */}
              {gamePhase === 'DAY_VOTING' && votingCandidates.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
                  <div className="text-3xl mb-3">🗳️</div>
                  <div className="w-8 h-8 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-[#C5A059] text-sm font-mono">جاري تحميل التصويت...</p>
                </motion.div>
              ) : gamePhase === 'DAY_VOTING' && votingCandidates.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* عنوان التصويت */}
                  <div className="text-center mb-5">
                    <div className="text-3xl mb-2">🗳️</div>
                    <h2 className="text-xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                      مرحلة التصويت
                    </h2>
                    <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.15em] mt-1">
                      {isPlayerDead ? 'مشاهدة فقط — أنت مُقصى' : myVote !== null ? '✅ تم التصويت — اضغط لاعب آخر للتغيير' : 'صوّت ضد اللاعب المشتبه'}
                    </p>
                  </div>

                  {/* شريط التقدم */}
                  <div className="mb-5">
                    <div className="flex justify-between text-[9px] font-mono text-[#666] mb-1">
                      <span>VOTES: {totalVotesCast}</span>
                      <span>{votingComplete ? '✅ COMPLETE' : '⏳ IN PROGRESS'}</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #C5A059, #D4AF37)' }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${votingPlayersInfo.length > 0 ? (totalVotesCast / votingPlayersInfo.length) * 100 : 0}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>

                  {/* كروت المرشحين */}
                  <div className="grid grid-cols-3 gap-2.5 px-1 max-h-[55vh] overflow-y-auto pb-4">
                    {votingCandidates.map((candidate: any, index: number) => {
                      const isSelf = candidate.targetPhysicalId === parseInt(physicalId);
                      const isMyChoice = myVote === index;
                      const playerInfo = votingPlayersInfo.find((p: any) => p.physicalId === candidate.targetPhysicalId);
                      const candidateName = playerInfo?.name || `#${candidate.targetPhysicalId}`;
                      const candidateAvatar = playerInfo?.avatarUrl;
                      const isDeal = candidate.type === 'DEAL';
                      const initiatorInfo = isDeal ? votingPlayersInfo.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;

                      return (
                        <motion.button
                          key={candidate.id || `c-${index}`}
                          whileTap={!isSelf && !isPlayerDead && !isMyChoice ? { scale: 0.92 } : {}}
                          onClick={() => {
                            if (isSelf || isPlayerDead || isMyChoice || voteSubmitting || votingComplete) return;
                            setVoteSubmitting(true);
                            emit('player:cast-vote', {
                              roomId,
                              physicalId: parseInt(physicalId),
                              candidateIndex: index,
                            }).then((res: any) => {
                              if (res?.success) {
                                setMyVote(index);
                                if (navigator.vibrate) navigator.vibrate(100);
                              }
                            }).catch(() => {}).finally(() => setVoteSubmitting(false));
                          }}
                          disabled={isSelf || isPlayerDead}
                          className={`relative flex flex-col items-center p-2.5 rounded-xl border transition-all ${
                            isMyChoice
                              ? 'border-[#C5A059] bg-[#C5A059]/10 shadow-[0_0_12px_rgba(197,160,89,0.15)]'
                              : isSelf
                                ? 'border-[#1a1a1a] bg-[#0a0a0a]/50 opacity-40'
                                : 'border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]'
                          }`}
                        >
                          {/* صورة أو رقم */}
                          <div className="relative w-11 h-11 rounded-full overflow-hidden mb-1.5 border border-[#333] bg-[#1a1a1a] flex items-center justify-center">
                            {candidateAvatar ? (
                              <Image src={candidateAvatar} alt="" width={44} height={44} className="object-cover w-full h-full" />
                            ) : (
                              <span className="text-sm font-bold text-[#C5A059] font-mono">#{candidate.targetPhysicalId}</span>
                            )}
                            {isMyChoice && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute inset-0 bg-[#C5A059]/20 flex items-center justify-center"
                              >
                                <span className="text-lg">✅</span>
                              </motion.div>
                            )}
                          </div>

                          {/* الاسم */}
                          <p className="text-[10px] font-bold text-white truncate w-full text-center leading-tight">
                            {isDeal ? `${initiatorInfo?.name || '?'} ⇄` : ''} {candidateName}
                          </p>

                          {isSelf && (
                            <span className="text-[7px] text-[#555] font-mono mt-0.5">أنت</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : isPlayerDead ? (
                /* ── حالة الميت: كارد مفتوح + grayscale ── */
                <>
                  <h2 className="text-2xl font-black mb-2 text-[#555]" style={{ fontFamily: 'Amiri, serif' }}>
                    تم إقصاؤك
                  </h2>
                  <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
                    AGENT ELIMINATED — IDENTITY EXPOSED
                  </p>
                  <div className="flex justify-center mb-6 grayscale opacity-70">
                    <MafiaCard
                      key={`rj-dead-${physicalId}`}
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={assignedRole}
                      isFlipped={true}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={false}
                      size="md"
                      avatarUrl={avatarUrl}
                    />
                  </div>
                  <p className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em]">
                    ☠️ STATUS: ELIMINATED
                  </p>
                </>
              ) : assignedRole ? (
                /* ── حالة حي مع دور: كارد قابل للقلب ── */
                <>
                  <h2 className="text-2xl font-black mb-2 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                    مرحباً بعودتك
                  </h2>
                  <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
                    TAP CARD TO REVEAL YOUR IDENTITY
                  </p>
                  <div className="flex justify-center mb-6">
                    <MafiaCard
                      key={`rj-role-${physicalId}`}
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={assignedRole}
                      isFlipped={cardFlipped}
                      onFlip={() => { setCardFlipped(prev => !prev); setRoleAlert(false); }}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={true}
                      size="md"
                      avatarUrl={avatarUrl}
                    />
                  </div>
                  <AnimatePresence mode="wait">
                    {cardFlipped ? (
                      <motion.p key="hide2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em] animate-pulse">
                        ⚠️ أخفِ هاتفك الآن!
                      </motion.p>
                    ) : (
                      <motion.p key="tap2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[#555] text-[9px] font-mono uppercase tracking-widest">
                        اضغط البطاقة لكشف دورك
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* ── عرض زملاء المافيا عند قلب الكارد (rejoined) ── */}
                  {cardFlipped && mafiaTeam.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="mt-4 p-3 rounded-xl border border-[#8A0303]/30 bg-gradient-to-b from-[#1a0505] to-[#0d0202]"
                    >
                      <p className="text-[#8A0303] text-[9px] font-mono uppercase tracking-[0.15em] text-center mb-2">
                        🕴️ زملاؤك في الفريق
                      </p>
                      <div className="flex justify-center gap-3 flex-wrap">
                        {mafiaTeam.map(m => (
                          <div key={m.physicalId} className="flex flex-col items-center">
                            <span className="text-[#C5A059] text-lg font-black">#{m.physicalId}</span>
                            <span className="text-[#666] text-[8px] font-mono">{m.name}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[#4a2020] text-[8px] font-mono uppercase tracking-widest text-center mt-2">
                        ⭕ لا تكشف هويتك
                      </p>
                    </motion.div>
                  )}
                </>
              ) : (
                /* ── حالة حي بدون دور (في الانتظار) ── */
                <>
                  <motion.div className="text-[#C5A059] flex justify-center mb-6"
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }}>
                    <ShieldCheckIcon />
                  </motion.div>
                  <h2 className="text-3xl font-black mb-4 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                    مرحباً بعودتك
                  </h2>
                  <div className="flex justify-center mb-8">
                    <MafiaCard
                      key={`rj-wait-${physicalId}`}
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={null}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={false}
                      size="md"
                      avatarUrl={avatarUrl}
                    />
                  </div>
                  <p className="text-[#C5A059] text-[11px] font-mono uppercase tracking-[0.2em]">
                    SECURE YOUR DEVICE. AWAIT ROLE ASSIGNMENT.
                  </p>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>

      {/* ── شاشة التحميل أثناء محاولة الـ Rejoin ── */}
      {rejoinLoading && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              className="text-[#C5A059] flex justify-center mb-4"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <ShieldCheckIcon />
            </motion.div>
            <p className="text-[#808080] text-[10px] font-mono uppercase tracking-widest">
              RESTORING SESSION...
            </p>
          </motion.div>
        </div>
      )}

      {/* ── تنبيه تغيير رقم المقعد ── */}
      {seatChangeAlert && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-4 right-4 z-50 bg-[#C5A059] text-black p-4 rounded-lg text-center font-bold shadow-lg"
          style={{ fontFamily: 'Amiri, serif' }}
        >
          {seatChangeAlert}
        </motion.div>
      )}

      {/* ── تنبيه جلونج — اقلب الكارد لمعرفة دورك ── */}
      <AnimatePresence>
        {roleAlert && !cardFlipped && assignedRole && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="fixed bottom-6 left-4 right-4 z-[200] flex flex-col items-center"
          >
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 15px rgba(197,160,89,0.4), 0 0 30px rgba(197,160,89,0.2)',
                  '0 0 25px rgba(197,160,89,0.7), 0 0 50px rgba(197,160,89,0.35)',
                  '0 0 15px rgba(197,160,89,0.4), 0 0 30px rgba(197,160,89,0.2)',
                ],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              onClick={() => setRoleAlert(false)}
              className="w-full max-w-md rounded-2xl border-2 border-[#C5A059] bg-gradient-to-b from-[#1a1508] to-[#0d0a02] p-5 cursor-pointer"
              style={{ backdropFilter: 'blur(20px)' }}
            >
              {/* الأيقونة المتحركة */}
              <motion.div
                className="text-4xl text-center mb-2"
                animate={{ rotateY: [0, 180, 360] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                🎴
              </motion.div>

              {/* النص الرئيسي */}
              <h3
                className="text-[#C5A059] text-xl font-black text-center mb-1"
                style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 20px rgba(197,160,89,0.5)' }}
              >
                تم تعيين دورك!
              </h3>
              <p className="text-[#C5A059]/80 text-sm text-center font-bold" style={{ fontFamily: 'Amiri, serif' }}>
                اقلب البطاقة لمعرفة هويتك السرية
              </p>

              {/* شريط متحرك */}
              <motion.div
                className="mt-3 h-[2px] bg-gradient-to-r from-transparent via-[#C5A059] to-transparent rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />

              <p className="text-[#555] text-[8px] font-mono uppercase tracking-[0.2em] text-center mt-2">
                TAP CARD TO REVEAL · TAP HERE TO DISMISS
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── نافذة تأكيد التبديل بين الغرف ── */}
      <AnimatePresence>
        {switchConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl border-2 border-[#C5A059]/50 bg-gradient-to-b from-[#1a1508] to-[#0a0804] p-6"
              style={{ boxShadow: '0 0 40px rgba(197,160,89,0.2)' }}
            >
              {/* أيقونة */}
              <div className="text-5xl text-center mb-4">🔄</div>

              {/* العنوان */}
              <h3
                className="text-[#C5A059] text-xl font-black text-center mb-4"
                style={{ fontFamily: 'Amiri, serif' }}
              >
                تبديل الغرفة
              </h3>

              {/* التفاصيل */}
              <div className="space-y-3 mb-6">
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                  <p className="text-[9px] font-mono text-red-400/70 uppercase tracking-widest mb-1">الغرفة الحالية</p>
                  <p className="text-red-300 font-bold text-sm" style={{ fontFamily: 'Amiri, serif' }}>
                    {switchConfirm.currentGameName}
                  </p>
                </div>
                <div className="text-center text-[#C5A059] text-lg">↓</div>
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                  <p className="text-[9px] font-mono text-green-400/70 uppercase tracking-widest mb-1">الغرفة الجديدة</p>
                  <p className="text-green-300 font-bold text-sm" style={{ fontFamily: 'Amiri, serif' }}>
                    {switchConfirm.targetGameName}
                  </p>
                </div>
              </div>

              {/* رسالة توضيحية */}
              <p className="text-[#808080] text-xs text-center mb-5 leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                سيتم تجميد مشاركتك في الغرفة الحالية ويمكنك العودة إليها لاحقاً
              </p>

              {/* الأزرار */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSwitchConfirm(null)}
                  disabled={switchLoading}
                  className="flex-1 py-3 rounded-xl border border-[#333] bg-black/60 text-[#888] font-bold text-sm transition-all hover:border-[#555] hover:text-white disabled:opacity-50"
                  style={{ fontFamily: 'Amiri, serif' }}
                >
                  ابقَ هنا
                </button>
                <button
                  onClick={handleSwitchRoom}
                  disabled={switchLoading}
                  className="flex-1 py-3 rounded-xl border-2 border-[#C5A059] text-[#C5A059] font-black text-sm transition-all hover:bg-[#C5A059]/10 disabled:opacity-50"
                  style={{ fontFamily: 'Amiri, serif', boxShadow: '0 0 15px rgba(197,160,89,0.2)' }}
                >
                  {switchLoading ? '⏳ جارٍ...' : 'انتقل للغرفة'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
