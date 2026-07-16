'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import MafiaCard from './MafiaCard';
import PlayerPhaseView from './PlayerPhaseView';
import PhoneSpectatorView from './PhoneSpectatorView';
import RemoteVoice from './RemoteVoice';
import { useActiveSpeaker } from '../hooks/useActiveSpeaker';
import ConfrontationControls from './ConfrontationControls';
import InviteModal from './InviteModal';
import RolesInfoModal from './RolesInfoModal';
import { useGameState } from '@/hooks/useGameState';
import { ROLE_NAMES, MAFIA_ROLES } from '@/lib/constants';
import { Users } from 'lucide-react';
import MafiaTeamGallery from './MafiaTeamGallery';
import PlayerNotepad from './PlayerNotepad';
type Step = 'code' | 'phone' | 'login' | 'register' | 'change_password' | 'ticket' | 'auto_joining' | 'done' | 'rejoined';

interface PlayerFlowProps {
  initialRoomCode?: string;
  inviteFlag?: boolean;    // 📨 وصل عبر دعوة (?invite=1) → يعرض تأكيداً قبل الانضمام الصامت
  inviterName?: string;    // اسم الداعي (من ?by=) لعرضه في التأكيد
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

export default function PlayerFlow({ initialRoomCode = '', inviteFlag = false, inviterName = '' }: PlayerFlowProps) {
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
  const [requireTicket, setRequireTicket] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userExited, setUserExited] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('mafia_user_exited') === 'true';
  }); // يمنع إعادة الدخول التلقائي بعد الخروج

  // ── توزيع الأدوار الرقمي ──
  const [assignedRole, setAssignedRole] = useState<string | null>(null);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [isPlayerDead, setIsPlayerDead] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [seatChangeAlert, setSeatChangeAlert] = useState<string | null>(null);
  const [isExpelled, setIsExpelled] = useState(false);
  const [expulsionReason, setExpulsionReason] = useState('');
  const [penalties, setPenalties] = useState<number>(0);
  const [maxPenalties, setMaxPenalties] = useState<number>(3);
  // 🗣️ علم تفعيل غرفة تشاور المافيا (إعداد عام من الليدر — لا يكشف هوية أحد)
  const [mafiaChatEnabled, setMafiaChatEnabled] = useState(false);
  const [penaltyAlert, setPenaltyAlert] = useState<{
    message: string;
    penalties: number;
    maxPenalties: number;
  } | null>(null);
  const [activeToast, setActiveToast] = useState<{
    message: string;
    type: 'warning' | 'penalty' | 'success' | 'info';
  } | null>(null);
  const [roleAlert, setRoleAlert] = useState(false);
  const [mafiaTeam, setMafiaTeamRaw] = useState<{physicalId: number; name: string; role: string; avatarUrl?: string | null}[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('mafia_mafiaTeam');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const setMafiaTeam = (team: {physicalId: number; name: string; role: string; avatarUrl?: string | null}[]) => {
    setMafiaTeamRaw(team);
    if (team && team.length > 0) {
      localStorage.setItem('mafia_mafiaTeam', JSON.stringify(team));
    } else {
      localStorage.removeItem('mafia_mafiaTeam');
    }
  };

  // 👥 الأخ (تعارف الأخوين — قناة خاصة منفصلة عن فريق المافيا)
  const [sibling, setSiblingRaw] = useState<{physicalId: number; name: string; role: string; avatarUrl?: string | null; isAlive: boolean; recipientIsMafia: boolean} | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem('mafia_sibling');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const setSibling = (s: {physicalId: number; name: string; role: string; avatarUrl?: string | null; isAlive: boolean; recipientIsMafia: boolean} | null) => {
    setSiblingRaw(s);
    if (s) {
      localStorage.setItem('mafia_sibling', JSON.stringify(s));
    } else {
      localStorage.removeItem('mafia_sibling');
    }
  };

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [assassinContracts, setAssassinContracts] = useState<any>(null);
  const [switchConfirm, setSwitchConfirm] = useState<{
    currentRoomId: string;
    currentGameName: string;
    targetRoomId: string;
    targetGameName: string;
  } | null>(null);
  const [joinConfirmation, setJoinConfirmation] = useState<{message: string} | null>(null);
  // 📨 تأكيد الدعوة قبل الانضمام: يُعرض عند فتح إشعار دعوة (?invite=1)
  const [inviteConfirmed, setInviteConfirmed] = useState(false);
  const [invitePrompt, setInvitePrompt] = useState<{ roomName: string; inviterName: string } | null>(null);
  const [inviteError, setInviteError] = useState<string>('');
  const [switchLoading, setSwitchLoading] = useState(false);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [roster, setRoster] = useState<any[]>([]);
  const [isRemote, setIsRemote] = useState(false); // 🌐 غرفة عن بُعد → أظهر طاولة الطور للاعب
  const [allowPlayerInvites, setAllowPlayerInvites] = useState(false); // 📨 القائد سمح للاعبين بدعوة أصدقائهم
  const [showInvite, setShowInvite] = useState(false); // 📨 مودال إرسال الدعوة
  const [voiceMaps, setVoiceMaps] = useState<{ videoByPid: Record<number, MediaStreamTrack | null>; audioByPid: Record<number, boolean> }>({ videoByPid: {}, audioByPid: {} });
  const [gameOverData, setGameOverData] = useState<{ winner: string | null; players: any[] } | null>(null); // 🏁 كشف الفائز على الطاولة
  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [notepadNotes, setNotepadNotes] = useState<Record<number, any>>({});
  const [nightActionRequired, setNightActionRequired] = useState<{
    actionType: string;
    availableTargets: { physicalId: number; name: string }[];
    timeoutSeconds: number;
    canSkip: boolean;
    stepRole?: string;
    isDecoy?: boolean;
  } | null>(null);
  const [nightActionCountdown, setNightActionCountdown] = useState<number>(0);
  const [nightActionSubmitted, setNightActionSubmitted] = useState(false);
  const [selectedTargetForConfirm, setSelectedTargetForConfirm] = useState<number | null>(null);
  const [nurseActivationPending, setNurseActivationPending] = useState(false);
  const nightCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ⏱️ override يحمي المرحلة المحليّة من poll قديم — لكن ينتهي بعد OVERRIDE_TTL كي لا يعلق جهازٌ فوّت حدث انتقال
  const phaseOverrideRef = useRef<{ phase: string; at: number } | null>(null);
  const OVERRIDE_TTL = 6000;
  const setPhaseOverride = (phase: string) => { phaseOverrideRef.current = { phase, at: Date.now() }; };


  const [votingCountdown, setVotingCountdown] = useState<number | null>(null);
  const votingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  // 🎩 العمدة: برومبت قراره (يصله وحده — عن بُعد)، إعلان الكشف للجميع، ومَن العمدة المكشوف
  const [mayorPrompt, setMayorPrompt] = useState<any>(null);
  const [mayorPromptLeft, setMayorPromptLeft] = useState(30);
  const [mayorBanner, setMayorBanner] = useState<{ physicalId: number; name: string; decision: string; voteWeight?: number } | null>(null);
  const [mayorRevealedId, setMayorRevealedId] = useState<number | null>(null);
  const [mayorWeight, setMayorWeight] = useState(2);
  const [mayorSending, setMayorSending] = useState(false);
  // 🎙️ من يُسمح له بالكلام (نقاش/تبرير/مواجهة) — لفتح مايكي + عرض المواجهة
  const { confrontation, allowedPids: voiceAllowedPids } = useActiveSpeaker({ on, gamePhase, initialDiscussionState: phasePollData?.discussionState });

  const [lastVoteTime, setLastVoteTimeRaw] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('mafia_lastVoteTime');
    return saved ? parseInt(saved) : null;
  });
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (gamePhase === 'DAY_VOTING') {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [gamePhase]);

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
  const setLastVoteTime = (time: number | null) => {
    setLastVoteTimeRaw(time);
    if (time !== null) localStorage.setItem('mafia_lastVoteTime', time.toString());
    else localStorage.removeItem('mafia_lastVoteTime');
  };

  // ── محاولة إعادة الاتصال (rejoin) عند فتح الصفحة ──
  useEffect(() => {
    if (!isConnected || !emit) {
      // لا نمسح rejoinLoading هنا — ننتظر الاتصال
      return;
    }

    // ننتظر فحص التوكن لأنه ممكن يُنشئ mafia_session من activeGame
    if (!tokenChecked) return;

    // إذا اللاعب خرج يدوياً → لا نعيد الدخول
    if (userExited || localStorage.getItem('mafia_user_exited') === 'true') {
      setRejoinLoading(false);
      return;
    }

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
          if (res.mafiaTeam !== undefined) {
            setMafiaTeam(res.mafiaTeam);
          }
          if (res.sibling !== undefined) {
            setSibling(res.sibling); // 👥 الأخ
          }
          if (res.assassinContracts) {
            setAssassinContracts(res.assassinContracts);
          }
          if (typeof res.mafiaChatEnabled === 'boolean') {
            setMafiaChatEnabled(res.mafiaChatEnabled);
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
          localStorage.removeItem('mafia_user_exited');
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
    // 📨 عند الوصول عبر دعوة: لا ننضمّ صامتاً — ننتظر تأكيد اللاعب أولاً (invite-resolve أدناه)
    if (inviteFlag && !inviteConfirmed) return;
    if (initialRoomCode && isConnected && !roomId && tokenChecked) {
      // اللاعب فتح رابط غرفة جديد → يعني يريد الدخول — مسح علامة الخروج
      if (userExited) {
        setUserExited(false);
        localStorage.removeItem('mafia_user_exited');
      }
      handleFindRoom(initialRoomCode);
    }
  }, [initialRoomCode, isConnected, tokenChecked, inviteFlag, inviteConfirmed]);

  // ── 📨 دعوة: نحلّ اسم الغرفة (بلا انضمام) ونعرض تأكيداً «هل تريد الانضمام…؟» قبل أيّ دخول ──
  useEffect(() => {
    if (!inviteFlag || inviteConfirmed || invitePrompt || inviteError) return;
    if (!initialRoomCode || !isConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await emit('room:find-by-code', { roomCode: initialRoomCode });
        if (cancelled) return;
        // room:find-by-code قد يُرجع {success:false} دون رفض الوعد → نعامله كغرفة غير متاحة
        if (!res || res.success === false || !res.roomId) {
          setInviteError('الغرفة لم تعد متاحة');
          return;
        }
        setInvitePrompt({ roomName: res.gameName || 'غرفة عن بُعد', inviterName: inviterName || 'لاعب' });
      } catch {
        if (!cancelled) setInviteError('الغرفة لم تعد متاحة');
      }
    })();
    return () => { cancelled = true; };
  }, [inviteFlag, inviteConfirmed, invitePrompt, inviteError, initialRoomCode, isConnected, emit, inviterName]);

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
          // ⚠️ لا ننشئ جلسة إذا اللاعب خرج يدوياً (userExited)
          if (data.activeGame && !localStorage.getItem('mafia_session') && !userExited) {
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

  // ── استقبال تغيير رقم المقعد والعقوبات والطرد من الليدر ──
  useEffect(() => {
    if (!on) return;

    const cleanupSeat = on('player:seat-changed', (data: { oldPhysicalId: number; newPhysicalId: number }) => {
      setPhysicalId(String(data.newPhysicalId));
      // تحديث localStorage
      const saved = JSON.parse(localStorage.getItem('mafia_session') || '{}');
      saved.physicalId = data.newPhysicalId;
      localStorage.setItem('mafia_session', JSON.stringify(saved));
      // تنبيه بصري
      const msg = `تم تغيير رقمك: ${data.oldPhysicalId} ← ${data.newPhysicalId}`;
      setActiveToast({
        message: msg,
        type: 'success'
      });
      setTimeout(() => {
        setActiveToast(prev => prev && prev.message === msg ? null : prev);
      }, 5000);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });

    const cleanupKick = on('player:kicked-self', (data?: { reason?: string }) => {
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_held_seat'); // لا يحتاج العودة بعد الطرد
      setAssignedRole(null);
      setPhysicalId('');
      setRoomId('');
      setUserExited(true);
      localStorage.setItem('mafia_user_exited', 'true');

      // مسح كافة مفاتيح الجلسة للتصفير الكامل
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      localStorage.removeItem('mafia_lastVoteTime');
      localStorage.removeItem('mafia_mafiaTeam');
      localStorage.removeItem('mafia_sibling');

      if (data?.reason) {
        setIsExpelled(true);
        setExpulsionReason(data.reason);
      } else {
        setStep(initialRoomCode ? 'phone' : 'code');
        setApiError('تم إزالتك من اللعبة من قبل الليدر');
      }
    });

    // 🗣️ تفعيل/تعطيل غرفة التشاور فورياً من الليدر (إعداد عام لا يكشف هوية)
    const cleanupChatToggle = on('room:config-updated', (data: any) => {
      if (typeof data?.mafiaChatEnabled === 'boolean') setMafiaChatEnabled(data.mafiaChatEnabled);
    });

    const cleanupPenalty = on('game:penalty-recorded', (data: { physicalId: number; penalties: number; maxPenalties: number; message: string; isKicked: boolean }) => {
      const myPhysId = parseInt(physicalId);
      if (data.physicalId === myPhysId) {
        setPenalties(data.penalties);
        setMaxPenalties(data.maxPenalties);
        setPenaltyAlert({
          message: data.message,
          penalties: data.penalties,
          maxPenalties: data.maxPenalties
        });
        setActiveToast({
          message: data.message,
          type: 'penalty'
        });
        if (navigator.vibrate) {
          navigator.vibrate([300, 100, 300, 100, 500]);
        }
      } else {
        setActiveToast({
          message: data.message,
          type: 'warning'
        });
        if (navigator.vibrate) {
          navigator.vibrate([100, 100]);
        }
      }
      
      // إخفاء التوست تلقائياً بعد 6 ثوانٍ
      setTimeout(() => {
        setActiveToast(prev => prev && prev.message === data.message ? null : prev);
      }, 6000);
    });

    // إقصاء بسبب العقوبات — اللاعب يبقى في الغرفة لكن ميت
    const cleanupPenaltyEjected = on('player:penalty-ejected', (data: { reason: string; penalties: number; maxPenalties: number }) => {
      setIsPlayerDead(true);
      setCardFlipped(true);
      setPenalties(data.penalties);
      setMaxPenalties(data.maxPenalties);
      setPenaltyAlert({
        message: data.reason,
        penalties: data.penalties,
        maxPenalties: data.maxPenalties
      });
      if (navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    });

    return () => {
      cleanupSeat();
      cleanupKick();
      cleanupPenalty();
      cleanupPenaltyEjected();
      cleanupChatToggle();
    };
  }, [on, initialRoomCode, physicalId]);

  // ═══ فحص المقعد المحجوز — إعادة الدخول التلقائي ═══
  // يعمل فقط عند فتح الصفحة من جديد (مثلاً من زر "العودة" في الصفحة الرئيسية)
  // لا يعمل مباشرة بعد الخروج (userExited = true)
  useEffect(() => {
    if (step !== 'code' || initialRoomCode) return;
    // إذا اللاعب لسى طالع → لا نعيد دخوله تلقائياً
    if (userExited || localStorage.getItem('mafia_user_exited')) return;
    try {
      const held = localStorage.getItem('mafia_held_seat');
      if (!held) return;
      const data = JSON.parse(held);
      const elapsed = Date.now() - (data.exitedAt || 0);
      const TEN_MIN = 10 * 60 * 1000;
      if (elapsed > TEN_MIN) {
        localStorage.removeItem('mafia_held_seat');
        return;
      }
      if (data.roomCode) {
        setRoomCode(data.roomCode);
        setTimeout(() => {
          handleFindRoom(data.roomCode);
        }, 300);
      }
    } catch { /* ignore parse errors */ }
  }, [step, initialRoomCode]);

  // ── تسجيل خروج اللاعب (مسح كل البيانات المحفوظة) ──
  const handleLogout = useCallback(() => {
    // ═══ حفظ بيانات الغرفة الأخيرة قبل المسح (للعودة للمقعد المحجوز) ═══
    const savedRoomCode = roomCode;
    const savedRoomId = roomId;
    if (savedRoomCode && savedRoomId) {
      localStorage.setItem('mafia_held_seat', JSON.stringify({
        roomCode: savedRoomCode,
        roomId: savedRoomId,
        phone,
        playerId: playerId || null,
        displayName,
        exitedAt: Date.now(),
      }));
    }

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
    if (initialRoomCode) {
      // إذا دخل عبر زر الحجز → العودة للصفحة الرئيسية ليختار غرفة من جديد
      setStep('code');
      setUserExited(true);
      localStorage.setItem('mafia_user_exited', 'true');
      window.location.href = '/player/home';
      return;
    }
    setStep('code');
    setUserExited(true);
    localStorage.setItem('mafia_user_exited', 'true');
  }, [initialRoomCode, emit, roomId, phone, playerId, roomCode, displayName]);

  // ── منع pull-to-refresh داخل اللعبة ──
  useEffect(() => {
    document.body.classList.add('in-game');
    return () => {
      document.body.classList.remove('in-game');
    };
  }, []);

  // ── مزامنة خفية — الاستماع لبدء اللعبة + توزيع الأدوار ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // استقبال الدور من الليدر (عند تأكيد الأدوار)
    const cleanupRole = on('player:role-assigned', (data: { role: string; mafiaTeam?: {physicalId: number; name: string; role: string; avatarUrl?: string | null}[]; sibling?: any }) => {
      setAssignedRole(data.role);
      setCardFlipped(false);
      setRoleAlert(true);
      setIsPlayerDead(false); // ← reset: لعبة جديدة = حي
      // 👥 نطبّق دائماً (لا شرط): إن لم يكن اللاعب مافيا في هذه اللعبة (مثل الأخ الأصغر/المواطن)
      // يجب مسح أي فريق مافيا قديم محفوظ من لعبة سابقة — وإلّا رآه الأخ الأصغر قبل تحوّله.
      setMafiaTeam(data.mafiaTeam || []);
      setSibling(data.sibling || null); // 👥 الأخ (null لغير الأخوين)
      if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 300]);
    });

    // 👥 تحديث قائمة فريق المافيا (عند تحوّل الأخ الأصغر — دون لمس بطاقة اللاعب)
    const cleanupMafiaTeam = on('mafia:team-updated', (data: { mafiaTeam?: {physicalId: number; name: string; role: string; avatarUrl?: string | null}[] }) => {
      if (data.mafiaTeam) setMafiaTeam(data.mafiaTeam);
    });

    // 🔪 استقبال عقود السفّاح
    const cleanupAssassin = on('assassin:contracts-update', (data: any) => {
      setAssassinContracts(data);
    });

    const cleanup = on('game:started', () => {
      console.log('🎮 New game started — resetting all game state');
      // ── إعادة تعيين حالات الجولة ──
      setIsPlayerDead(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setAssassinContracts(null); // 🔪 تصفير عقود السفّاح
      if (navigator.vibrate) navigator.vibrate(200);
    });

    // ── الحل الجذري: مزامنة بناءً على playerId ──
    // كل ما يتغير الـ state بالسيرفر (renumber, kick, etc.)
    // نبحث عن اللاعب بالـ playerId أو الهاتف ونحدّث physicalId + role + alive
    const normalizedPhone = phone.startsWith('0') ? phone : '0' + phone;
    const cleanupSync = on('game:state-sync', (state: any) => {
      if (!state || !state.players) return;
      setRoster(state.players);
      if (state.config?.isRemote != null) setIsRemote(!!state.config.isRemote);
      if (state.config?.allowPlayerInvites != null) setAllowPlayerInvites(!!state.config.allowPlayerInvites);

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

        // تحديث العقوبات والحد الأقصى
        const mePenalties = me.penalties || 0;
        if (mePenalties !== penalties) {
          setPenalties(mePenalties);
        }
        const stateMaxPenalties = state.config?.maxPenalties || 3;
        if (stateMaxPenalties !== maxPenalties) {
          setMaxPenalties(stateMaxPenalties);
        }
      } else {
        // اللاعب مش موجود بالـ state → ممكن اتطرد
        // بس ما نمسح الجلسة هون عشان ممكن يكون state-sync لغرفة ثانية
      }
    });

    return () => {
      cleanupRole();
      cleanupMafiaTeam();
      cleanup();
      cleanupSync();
    };
  }, [step, on, playerId, phone, physicalId, displayName, isPlayerDead, penalties, maxPenalties]);

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
            
            // استعادة تايمر التصويت
            if (res.votingState.durationSeconds && res.votingState.votingStartTime) {
              const elapsed = Math.floor((Date.now() - res.votingState.votingStartTime) / 1000);
              const remaining = Math.max(0, res.votingState.durationSeconds - elapsed);
              if (remaining > 0) {
                setVotingCountdown(remaining);
                if (votingTimerRef.current) clearInterval(votingTimerRef.current);
                votingTimerRef.current = setInterval(() => {
                  setVotingCountdown(prev => {
                    if (prev === null || prev <= 1) {
                      if (votingTimerRef.current) clearInterval(votingTimerRef.current);
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
              } else {
                setVotingCountdown(0);
              }
            }
          }

          // ── استعادة مهام السفّاح ──
          if (res.assassinContracts) {
            setAssassinContracts(res.assassinContracts);
          }

          // ── استعادة حالة الليل الأوتو عند refresh ──
          if (res.nightState && res.phase === 'NIGHT' && !res.nightState.playerSubmitted) {
            const ns = res.nightState;
            const myPhysId = parseInt(physicalId);
            const isPerformer = myPhysId === ns.autoNightPerformerId;
            const stepActionType = ns.autoNightStepRole === 'SHERIFF' ? 'INVESTIGATE' :
              ns.autoNightStepRole === 'DOCTOR' || ns.autoNightStepRole === 'NURSE' ? 'PROTECT' :
              ns.autoNightStepRole === 'SNIPER' ? 'SNIPE' :
              ns.autoNightStepRole === 'WITCH' ? 'DISABLE' :
              ns.autoNightStepRole === 'SILENCER' && !isPerformer ? 'DECOY' : 'KILL';

            setNightActionRequired({
              actionType: isPerformer ? stepActionType : 'DECOY',
              availableTargets: ns.nightStep.availableTargets || [],
              timeoutSeconds: ns.config.autoNightTime || 15,
              canSkip: ns.nightStep.canSkip || false,
              stepRole: ns.autoNightStepRole,
              isDecoy: !isPerformer,
            });
            setNightActionSubmitted(false);
            setSelectedTargetForConfirm(null);
            // تايمر — نبدأ من الوقت المتبقي (تقريبي)
            const remaining = Math.max(3, ns.config.autoNightTime || 15);
            setNightActionCountdown(remaining);
            if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
            nightCountdownRef.current = setInterval(() => {
              setNightActionCountdown(prev => {
                if (prev <= 1) { clearInterval(nightCountdownRef.current!); return 0; }
                return prev - 1;
              });
            }, 1000);
          }
        }
      } catch { /* ignore */ }
    }, 500);

    return () => clearTimeout(timer);
  }, [step, emit, roomId]); // deps بسيطة — يشتغل فقط عند rejoin

  // ── 🎩 أحداث العمدة: نافذة قراره (له وحده) + إعلان الكشف (للجميع) ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    const cleanupWindow = on('day:mayor-window', (data: any) => {
      if (!data?.forMayor) return; // البثّ الموثوق (ليدر/عرض) لا يعنينا هنا
      setMayorPrompt(data);
      setMayorPromptLeft(data.timeoutSeconds || 30);
      if (navigator.vibrate) navigator.vibrate([120, 80, 120, 80, 240]);
    });
    const cleanupClosed = on('day:mayor-window-closed', () => setMayorPrompt(null));
    const cleanupRevealed = on('day:mayor-revealed', (data: any) => {
      setMayorPrompt(null);
      setMayorRevealedId(data.physicalId);
      if (data.voteWeight) setMayorWeight(data.voteWeight);
      setMayorBanner(data);
      setTimeout(() => setMayorBanner(null), 8000);
    });

    return () => { cleanupWindow?.(); cleanupClosed?.(); cleanupRevealed?.(); };
  }, [step, on]);

  // عدّاد برومبت العمدة (إرشاديّ — انتهاؤه لا يقرّر شيئاً؛ الليدر خطّ الرجعة)
  useEffect(() => {
    if (!mayorPrompt) return;
    const iv = setInterval(() => setMayorPromptLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(iv);
  }, [mayorPrompt]);

  const sendMayorDecision = async (decision: 'PASS' | 'REVOTE' | 'POSTPONE') => {
    if (mayorSending) return;
    setMayorSending(true);
    try {
      await emit('day:mayor-decision', { roomId, decision });
      setMayorPrompt(null);
    } catch { /* الليدر يستطيع التنفيذ يدويّاً */ }
    setMayorSending(false);
  };

  // ── استقبال أحداث التصويت ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // بدء التصويت
    const cleanupVotingStarted = on('day:voting-started', (data: any) => {
      setGamePhase('DAY_VOTING');
      setPhaseOverride('DAY_VOTING');
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
      if (myVote === null) setLastVoteTime(null);
      if (navigator.vibrate) navigator.vibrate([100, 200]);

      if (data.durationSeconds) {
        setVotingCountdown(data.durationSeconds);
        if (votingTimerRef.current) clearInterval(votingTimerRef.current);
        votingTimerRef.current = setInterval(() => {
          setVotingCountdown(prev => {
            if (prev === null || prev <= 1) {
              if (votingTimerRef.current) clearInterval(votingTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setVotingCountdown(null);
        if (votingTimerRef.current) clearInterval(votingTimerRef.current);
      }
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
        } else {
          setMyVote(null);
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
      if (data.state?.config?.isRemote != null) setIsRemote(!!data.state.config.isRemote); // 🌐 كشف الغرفة البعيدة عند بدء اللعب
      if (data.state?.config?.allowPlayerInvites != null) setAllowPlayerInvites(!!data.state.config.allowPlayerInvites);
      // حماية من الـ polling القديم لمدّة OVERRIDE_TTL فقط (ثمّ يُسمح للـ poll بمزامنة أيّ مرحلة أحدث)
      setPhaseOverride(data.phase);
      
      // مسح أدوار المافيا + الملاحظات عند بدء جولة جديدة لتجنب تسريبها
      if (data.phase === 'LOBBY' || data.phase === 'ROLE_GENERATION' || data.phase === 'ROLE_BINDING') {
        setMafiaTeam([]); setSibling(null);
        setAssignedRole(null);
        setGameOverData(null);
        // مسح الملاحظات تلقائياً عند بدء لعبة جديدة أو العودة للغرفة
        if (roomId && physicalId) {
          localStorage.removeItem(`mafia_notes_${roomId}_${physicalId}`);
          setNotepadNotes({});
        }
      }

      // مسح بيانات التصويت فقط عند الخروج من مرحلة التصويت
      if (data.phase !== 'DAY_VOTING' && data.phase !== 'DAY_JUSTIFICATION') {
        setVotingCandidates([]);
        setMyVote(null);
        setVotingComplete(false);
        setPlayerVotes({});
        setLastVoteTime(null);
        setVotingCountdown(null);
        if (votingTimerRef.current) clearInterval(votingTimerRef.current);
      }
    });

    // التبرير
    const cleanupJustification = on('day:justification-started', (data: any) => {
      console.log('⚖️ Justification started');
      setGamePhase('DAY_JUSTIFICATION');
      if (data && data.playerVotes) {
        setPlayerVotes(data.playerVotes);
      }
      setPhaseOverride('DAY_JUSTIFICATION');
    });

    // الإقصاء
    const cleanupElimination = on('day:elimination-pending', () => {
      console.log('💀 Elimination pending');
      setGamePhase('ELIMINATION_PENDING');
      setPhaseOverride('ELIMINATION_PENDING');
      // مسح التصويت
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setLastVoteTime(null);
    });

    // انتهاء اللعبة — لا نمسح الدور أو حالة الموت (اللاعب لازم يشوفهم)
    // الـ full reset يحصل فقط عند game:started
    const cleanupGameOver = on('game:over', (data: any) => {
      console.log('🏁 Game over — clearing voting only');
      if (data && Array.isArray(data.players)) setGameOverData({ winner: data.winner ?? null, players: data.players });
      setGamePhase('GAME_OVER');
      setPhaseOverride('GAME_OVER');
      // مسح التصويت
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setMafiaTeam([]); setSibling(null);
      if (roomId && physicalId) {
        localStorage.removeItem(`mafia_notes_${roomId}_${physicalId}`);
        setNotepadNotes({});
      }
    });

    // إغلاق الغرفة من الليدر
    const cleanupClosed = on('game:closed', () => {
      console.log('🔒 Game closed — full reset + clear session');
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      if (roomId && physicalId) {
        localStorage.removeItem(`mafia_notes_${roomId}_${physicalId}`);
      }
      setNotepadNotes({});
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]); setSibling(null);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
    });

    // حذف الغرفة نهائياً من القائد
    const cleanupRoomDeleted = on('game:room-deleted', () => {
      console.log('🗑️ Room deleted — full cleanup + redirect');
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]); setSibling(null);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setRoomId('');
      setRoomCode('');
      setStep(initialRoomCode ? 'phone' : 'code');
      setApiError('تم إغلاق الغرفة');
    });

    // تنظيف كامل وإعادة لشاشة الدخول — مشترك بين game:kicked و event:closed
    const leaveAndReset = (reason?: string) => {
      console.log('🚪 Room ended/kicked — full cleanup + redirect');
      localStorage.removeItem('mafia_session');
      localStorage.removeItem('mafia_gamePhase');
      localStorage.removeItem('mafia_votingCandidates');
      localStorage.removeItem('mafia_votingPlayersInfo');
      localStorage.removeItem('mafia_myVote');
      localStorage.removeItem('mafia_playerVotes');
      localStorage.removeItem('mafia_mafiaTeam');
      localStorage.removeItem('mafia_sibling');
      setGamePhase(null);
      setAssignedRole(null);
      setIsPlayerDead(false);
      setMafiaTeam([]); setSibling(null);
      setCardFlipped(false);
      setRoleAlert(false);
      setVotingCandidates([]);
      setMyVote(null);
      setVotingComplete(false);
      setPlayerVotes({});
      setTotalVotesCast(0);
      setLastVoteTime(null);
      setRoomId('');
      setRoomCode('');
      setStep(initialRoomCode ? 'phone' : 'code');
      setApiError(reason || 'تم إنهاء الفعالية وإغلاق الغرفة');
    };

    // الطرد من السيرفر (إغلاق قسري من الإدارة)
    const cleanupKicked = on('game:kicked', (data: any) => leaveAndReset(data?.reason));
    // إنهاء الفعالية (يُبثّ للغرفة عند إغلاقها من اللوحة أو واجهة الليدر)
    const cleanupEventClosed = on('event:closed', (data: any) => leaveAndReset(data?.reason || data?.message));

    return () => {
      cleanupVotingStarted();
      cleanupVoteUpdate();
      cleanupVotingComplete();
      cleanupPhaseChanged();
      cleanupJustification();
      cleanupElimination();
      cleanupGameOver();
      cleanupClosed();
      cleanupRoomDeleted();
      cleanupKicked();
      cleanupEventClosed();
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
          // 🗣️ تحديث علم غرفة التشاور (إعداد عام)
          setMafiaChatEnabled(res.mafiaChatEnabled === true);
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
          // تحديث قائمة اللاعبين لزر الملاحظات
          if (res.rosterInfo) {
            setRoster(res.rosterInfo);
          }

          // تحديث مرحلة اللعبة (مع حماية من الـ phase-changed event)
          if (res.phase) {
            // تحويل DAY_ELIMINATION للتوافق مع واجهة اللاعب (نطابق الـ override على القيمة المُحوّلة)
            const mappedPhase = res.phase === 'DAY_ELIMINATION' ? 'ELIMINATION_PENDING' : res.phase;
            const override = phaseOverrideRef.current;
            const overrideExpired = override ? (Date.now() - override.at > OVERRIDE_TTL) : false;
            if (override && mappedPhase !== override.phase && !overrideExpired) {
              console.log(`🛡️ Poll blocked (fresh override): server=${mappedPhase}, override=${override.phase}`);
              // override حديث → لا نسمح للـ poll بالكتابة (نحمي انتقالاً محليّاً حديثاً)
            } else {
              // إمّا تطابق، أو لا يوجد override، أو انتهت صلاحيّته → نُزامن مع السيرفر (يشفي الأجهزة التي فوّتت الحدث)
              if (override && (mappedPhase === override.phase || overrideExpired)) phaseOverrideRef.current = null;
              setGamePhase(mappedPhase);
            }
          }

          // استعادة بيانات التصويت بعد reconnect (مع حماية override الحديث فقط)
          const ovr = phaseOverrideRef.current;
          const overrideActive = ovr !== null && (Date.now() - ovr.at <= OVERRIDE_TTL);
          if (!overrideActive && res.votingState && res.phase === 'DAY_VOTING') {
            setVotingCandidates(res.votingState.candidates || []);
            setTotalVotesCast(res.votingState.totalVotesCast || 0);
            setPlayerVotes(res.votingState.playerVotes || {});
            if (res.votingState.playersInfo) setVotingPlayersInfo(res.votingState.playersInfo);
            const myPhysId = parseInt(physicalId);
            if (res.votingState.playerVotes?.[myPhysId] !== undefined && myVote === null) {
              setMyVote(res.votingState.playerVotes[myPhysId]);
            }
            // استعادة التايمر إذا كان مفقوداً
            if (res.votingState.durationSeconds && res.votingState.votingStartTime && votingCountdown === null) {
              const elapsed = Math.floor((Date.now() - res.votingState.votingStartTime) / 1000);
              const remaining = Math.max(0, res.votingState.durationSeconds - elapsed);
              setVotingCountdown(remaining);
              if (votingTimerRef.current) clearInterval(votingTimerRef.current);
              votingTimerRef.current = setInterval(() => {
                setVotingCountdown(prev => {
                  if (prev === null || prev <= 1) {
                    if (votingTimerRef.current) clearInterval(votingTimerRef.current);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
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

          // 🌐 غرفة بعيدة + طاولة الطور (للاستعادة الفوريّة عند reconnect)
          if (res.isRemote != null) setIsRemote(!!res.isRemote);
          if (res.allowPlayerInvites != null) setAllowPlayerInvites(!!res.allowPlayerInvites);
          if (Array.isArray(res.rosterInfo) && res.rosterInfo.length) setRoster(res.rosterInfo);

          // تمرير بيانات المراحل لـ PlayerPhaseView (للاستعادة عند reconnect)
          setPhasePollData({
            justificationData: res.justificationData || null,
            withdrawalState: res.withdrawalState || null,
            discussionState: res.discussionState || null,
            winner: res.winner || null,
            allPlayers: res.allPlayers || null,
            pendingResolution: res.pendingResolution || null,
            round: res.round || 1,
          });

          // تحديث أسماء اللاعبين (مهم لعرض أسماء المتهمين والاتفاقيات)
          if (res.playersInfo) {
            const isDiff = votingPlayersInfo.length !== res.playersInfo.length ||
              res.playersInfo.some((p: any, idx: number) => 
                !votingPlayersInfo[idx] || 
                votingPlayersInfo[idx].physicalId !== p.physicalId || 
                votingPlayersInfo[idx].name !== p.name
              );
            if (isDiff) {
              setVotingPlayersInfo(res.playersInfo);
            }
          }
        }
      } catch (e) { /* ignore polling errors */ }
    };

    // تنفيذ فوري أول مرة + ثم كل 3 ثواني
    pollState();
    const interval = setInterval(pollState, 3000);

    // 📲 مزامنة فوريّة عند عودة التطبيق للمقدّمة/التركيز — مؤقّتات الخلفيّة تُخنَق على الهاتف
    // فلا يكفي الـ interval وحده؛ هذا يضمن التقاط أيّ انتقالٍ فات أثناء الخلفيّة خلال لحظة.
    const onWake = () => { if (document.visibilityState === 'visible') pollState(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [step, emit, roomId, playerId, phone, physicalId, displayName, assignedRole, isPlayerDead, votingPlayersInfo]);

  // ── Auto-Vote on Self ──
  useEffect(() => {
    if (votingCountdown === 0 && myVote === null && !isPlayerDead && emit && roomId && gamePhase === 'DAY_VOTING') {
      const myPhysId = parseInt(physicalId);
      let voteIndex = votingCandidates.findIndex(c => c.targetPhysicalId === myPhysId);
      
      // في حال لم يكن اللاعب من ضمن المرشحين (بسبب ديل أو حصر تصويت)
      // ولم يصوت حتى انتهى الوقت، يتم اختيار أول مرشح كإجراء افتراضي لتفادي تعليق الجولة
      if (voteIndex === -1 && votingCandidates.length > 0) {
        voteIndex = 0;
      }

      if (voteIndex !== -1) {
        console.log('⏰ Time expired, auto-voting for candidate index:', voteIndex);
        emit('player:cast-vote', {
          roomId,
          physicalId: myPhysId,
          candidateIndex: voteIndex,
          autoVote: true,
        }).then((res: any) => {
          if (res?.success) {
            setMyVote(voteIndex);
            setLastVoteTime(Date.now());
          }
        }).catch(() => {});
      }
    }
  }, [votingCountdown, myVote, isPlayerDead, emit, roomId, physicalId, votingCandidates, gamePhase]);

  // ── Auto Night Mode: استقبال طلب الإجراء الليلي ──
  useEffect(() => {
    if (!on) return;

    const handleNightActionRequired = (data: {
      actionType: string;
      availableTargets: { physicalId: number; name: string }[];
      timeoutSeconds: number;
      canSkip: boolean;
    }) => {
      setNightActionRequired(data);
      setNightActionSubmitted(false);
      setSelectedTargetForConfirm(null);
      setNightActionCountdown(data.timeoutSeconds);
      // بدء العداد التنازلي
      if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
      nightCountdownRef.current = setInterval(() => {
        setNightActionCountdown(prev => {
          if (prev <= 1) {
            clearInterval(nightCountdownRef.current!);
            // السيرفر يختار عشوائياً — نغلق الشاشة بعد ثانيتين
            setTimeout(() => {
              setNightActionSubmitted(true);
              setTimeout(() => setNightActionRequired(null), 1500);
            }, 2000);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleNurseActivation = (data: { message: string }) => {
      setNurseActivationPending(true);
    };

    on('night:action-required', handleNightActionRequired);
    on('nurse:activation-request', handleNurseActivation);

    return () => {
      if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
    };
  }, [on]);


  // ── الخطوة 1: إدخال كود اللعبة ──
  const handleFindRoom = async (code?: string) => {
    const targetCode = code || roomCode.trim();
    setApiError('');
    try {
      const res = await emit('room:find-by-code', { roomCode: targetCode });
      setRoomId(res.roomId);
      setGameName(res.gameName);
      setMaxPlayers(res.maxPlayers || 10);
      const needsTicket = res.requireTicket ?? false;
      setRequireTicket(needsTicket);

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
        await tryRejoinCurrentRoom(savedPlayerId, savedToken, playerPhone, needsTicket, res.roomId);
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
        await tryRejoinCurrentRoom(savedPid, savedToken, undefined, requireTicket);
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
          await tryRejoinCurrentRoom(data.player.id, data.token, undefined, requireTicket);
        }
      } else {
        setApiError(data.error || 'خطأ في تسجيل الدخول');
      }
    } catch (err) {
      setApiError('خطأ في الاتصال');
    }
  };

  // ── محاولة الانضمام التلقائي للغرفة (بعد login/register) ──
  const tryRejoinCurrentRoom = async (pid: number, token: string, phoneOverride?: string, ticketRequired?: boolean, roomIdOverride?: string) => {
    const playerPhone = phoneOverride || phone;
    const effectiveRoomId = roomIdOverride || roomId;
    // 1. جرّب rejoin عبر WebSocket إذا عنا roomId
    if (emit && effectiveRoomId && playerPhone) {
      try {
        const normalized = playerPhone.startsWith('0') ? playerPhone : '0' + playerPhone;
        const res: any = await emit('room:rejoin-player', {
          roomId: effectiveRoomId,
          physicalId: 0, // نبحث بالهاتف
          phone: normalized,
        });
        if (res?.success && res.player) {
          setPhysicalId(String(res.player.physicalId));
          setDisplayName(res.player.name);
          setGender(res.player.gender === 'FEMALE' ? 'female' : 'male');
          setPlayerId(pid);
          if (res.player.role) setAssignedRole(res.player.role);
          if (res.mafiaTeam !== undefined) setMafiaTeam(res.mafiaTeam);
          if (res.sibling !== undefined) setSibling(res.sibling); // 👥 الأخ
          if (res.assassinContracts) setAssassinContracts(res.assassinContracts);
          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true);
          }
          // حفظ الجلسة
          localStorage.setItem('mafia_session', JSON.stringify({
            roomId: effectiveRoomId, physicalId: res.player.physicalId, phone: normalized,
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
        if (!effectiveRoomId || ag.roomId === effectiveRoomId) {
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

        // ── الغرفة النشطة مختلفة عن الهدف → عرض تأكيد التبديل ──
        if (effectiveRoomId && ag.roomId !== effectiveRoomId) {
          setSwitchConfirm({
            currentRoomId: ag.roomId,
            currentGameName: ag.gameName || 'غرفة نشطة',
            targetRoomId: effectiveRoomId,
            targetGameName: gameName || 'غرفة جديدة',
          });
          return;
        }
      }
    } catch {}

    // 3. لا لعبة نشطة → انضمام تلقائي
    const needTicket = ticketRequired ?? requireTicket;
    // إذا اللاعب مسجل (عنده playerId) → نرسل auto-join مباشرة
    // الباكإند يفحص إذا عنده تذكرة مسبقة لنفس النشاط ويتخطى السؤال
    if (needTicket && pid) {
      setStep('auto_joining');
      setTimeout(() => handleAutoJoin(false, undefined, effectiveRoomId), 100);
    } else if (needTicket) {
      setStep('ticket');
    } else {
      setStep('auto_joining');
      setTimeout(() => handleAutoJoin(false, undefined, effectiveRoomId), 100);
    }
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
    setStep(requireTicket ? 'ticket' : 'auto_joining');
    // إذا لا تذكرة مطلوبة → بدء الانضمام التلقائي مباشرة
    if (!requireTicket) {
      setTimeout(() => handleAutoJoin(false), 100);
    }
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
        setStep(requireTicket ? 'ticket' : 'auto_joining');
        if (!requireTicket) {
          setTimeout(() => handleAutoJoin(false), 100);
        }
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

  // ── الخطوة 4: الانضمام التلقائي للعبة ──
  const handleAutoJoin = async (forceJoin: boolean = false, ticket?: string, roomIdOverride?: string) => {
    if (!displayName) return;
    const effectiveRoomId = roomIdOverride || roomId;
    if (!effectiveRoomId) {
      setApiError('لم يتم تحديد الغرفة');
      return;
    }
    setApiError('');
    setStep('auto_joining');
    try {
      const dateOfBirth = dobYear && dobMonth && dobDay
        ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
        : undefined;
      const genderUpper = gender === 'female' ? 'FEMALE' : gender === 'male' ? 'MALE' : undefined;
      
      // ⚠️ لا نرسل preferredSeat — الباكإند يوزع عشوائياً دائماً عند auto-join
      // العودة لنفس الرقم تُعالج عبر 'room:rejoin-player' وليس 'room:auto-join'
      const res = await joinRoom(effectiveRoomId, displayName, phone, playerId || undefined, genderUpper, dateOfBirth, forceJoin, ticket || ticketNumber || undefined, undefined);

      const assignedSeat = res?.assignedSeat;
      if (assignedSeat) {
        setPhysicalId(String(assignedSeat));
      }
      if (res?.isRemote != null) setIsRemote(!!res.isRemote); // 🌐 كشف مبكر للغرفة البعيدة

      // حفظ الجلسة في localStorage
      localStorage.setItem('mafia_session', JSON.stringify({
        roomId: effectiveRoomId,
        physicalId: assignedSeat || 0,
        phone,
        displayName,
        roomCode,
        playerId: playerId || null,
      }));

      // مسح علامة الخروج — اللاعب انضم بنجاح
      localStorage.removeItem('mafia_user_exited');
      localStorage.removeItem('mafia_held_seat'); // تنظيف بيانات المقعد المحجوز
      setJoinConfirmation(null);
      setStep('done');
    } catch (err: any) {
      const errMsg = err.message || err.response?.error || '';
      // استبيانات إلزامية معلّقة → توجيه لإكمالها قبل الانضمام
      if (err.response?.code === 'PENDING_SURVEYS') {
        setApiError(err.response.error || 'يجب إكمال استبيانات فعالياتك السابقة قبل الانضمام');
        setTimeout(() => { window.location.href = '/player/feedback'; }, 1500);
        return;
      }
      // إذا الخطأ متعلق بالتذكرة → نعرض شاشة إدخال التذكرة مباشرة
      const isTicketError = errMsg.includes('التذكرة') || errMsg.includes('ticket');
      if (err.response?.requiresConfirmation) {
        setJoinConfirmation({ message: err.response.error });
        setStep(isTicketError || requireTicket ? 'ticket' : 'auto_joining');
      } else {
        setApiError(errMsg || 'حدث خطأ في الانضمام');
        setStep(isTicketError || requireTicket ? 'ticket' : 'auto_joining');
      }
    }
  };

  // ── دالة الانضمام القديمة (للتوافق مع confirmation dialog) ──
  const handleJoinGame = async (forceJoin: boolean = false) => {
    await handleAutoJoin(forceJoin);
  };

  return (
    <div className={`min-h-screen flex flex-col items-center font-sans relative overflow-hidden selection:bg-[#8A0303] selection:text-white ${isRemote ? 'justify-start p-2 pt-3 bg-[#050505]' : 'justify-center p-4 sm:p-6 display-bg blood-vignette'}`}>
      {/* ── Dynamic Toast Notification Overlay ── */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="fixed top-6 left-4 right-4 sm:left-auto sm:right-6 z-50 w-auto sm:max-w-md"
          >
            <div
              className={`p-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-3 ${
                activeToast.type === 'penalty'
                  ? 'bg-red-950/90 border-red-500/40 text-red-200 shadow-red-950/20'
                  : activeToast.type === 'warning'
                  ? 'bg-amber-950/90 border-amber-500/40 text-amber-200 shadow-amber-950/20'
                  : activeToast.type === 'success'
                  ? 'bg-green-950/90 border-green-500/40 text-green-200 shadow-green-950/20'
                  : 'bg-neutral-900/90 border-[#C5A059]/40 text-gray-200'
              }`}
            >
              <div className="text-xl shrink-0">
                {activeToast.type === 'penalty' && '🔴'}
                {activeToast.type === 'warning' && '⚠️'}
                {activeToast.type === 'success' && '✅'}
                {activeToast.type === 'info' && 'ℹ️'}
              </div>
              <div className="flex-1 font-bold text-sm text-right" style={{ fontFamily: 'Amiri, serif' }}>
                {activeToast.message}
              </div>
              <button
                onClick={() => setActiveToast(null)}
                className="text-gray-400 hover:text-white shrink-0 text-xs font-mono ml-2 p-1"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Penalty Alert Modal Prompt ── */}
      <AnimatePresence>
        {penaltyAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#111] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden text-center"
            >
              {/* Top accent glow */}
              <div className="absolute top-0 left-0 w-full h-[3px] bg-red-600 animate-pulse" />
              
              <div className="mb-4 text-red-500 flex justify-center text-4xl animate-bounce">
                ⚠️
              </div>
              
              <h3 className="text-red-500 text-xl font-bold mb-3" style={{ fontFamily: 'Amiri, serif' }}>تنبيه مخالفة القوانين!</h3>
              
              <p className="text-white mb-5 text-sm leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
                {penaltyAlert.message}
              </p>
              
              {/* Warning dots in modal */}
              <div className="flex justify-center gap-2 mb-6">
                {Array.from({ length: penaltyAlert.maxPenalties }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded-full ${
                      i < penaltyAlert.penalties
                        ? 'bg-red-600 shadow-[0_0_8px_#dc2626]'
                        : 'bg-neutral-800 border border-neutral-700'
                    }`}
                  />
                ))}
              </div>
              
              <p className="text-[#888] text-xs mb-6 font-mono">
                PENALTIES: {penaltyAlert.penalties} / {penaltyAlert.maxPenalties}
              </p>
              
              <button
                onClick={() => setPenaltyAlert(null)}
                className="w-full py-3 rounded-xl bg-red-900 hover:bg-red-800 text-white font-mono text-sm shadow-[0_0_15px_rgba(138,3,3,0.4)] transition-all font-bold"
              >
                فهمت وتعهدت بالالتزام
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {joinConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#111] border border-[#C5A059]/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-[#C5A059] text-xl font-bold mb-4 text-center">تأكيد الانتقال</h3>
              <p className="text-white text-center mb-6 text-sm leading-relaxed">{joinConfirmation.message}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setJoinConfirmation(null)}
                  className="flex-1 py-3 rounded-xl border border-[#333] text-[#888] font-mono text-sm hover:bg-[#222] transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => handleJoinGame(true)}
                  className="flex-1 py-3 rounded-xl bg-[#8A0303] text-white font-mono text-sm shadow-[0_0_15px_rgba(138,3,3,0.4)] hover:bg-[#a00404] transition-colors"
                >
                  موافق، انتقل
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 📨 تأكيد الدعوة قبل الانضمام */}
      <AnimatePresence>
        {invitePrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0c0c0c] border border-sky-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-4xl mb-3">📨</div>
              <h3 className="text-sky-300 text-xl font-black mb-2" style={{ fontFamily: 'Amiri, serif' }}>دعوة للانضمام</h3>
              <p className="text-white text-base leading-relaxed mb-1">هل تريد الانضمام إلى غرفة «<b className="text-sky-300">{invitePrompt.roomName}</b>»؟</p>
              <p className="text-[#888] text-xs mb-6">دعاك <b className="text-[#C5A059]">{invitePrompt.inviterName}</b></p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setInvitePrompt(null); try { window.location.assign('/player/home'); } catch { /* ignore */ } }}
                  className="flex-1 py-3 rounded-xl border border-[#333] text-[#888] font-mono text-sm hover:bg-[#222] transition-colors"
                >
                  ليس الآن
                </button>
                <button
                  onClick={() => { setInvitePrompt(null); setInviteConfirmed(true); }}
                  className="flex-1 py-3 rounded-xl bg-sky-600 text-white font-bold text-sm shadow-[0_0_15px_rgba(2,132,199,0.4)] hover:bg-sky-500 transition-colors"
                >
                  انضمام
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {inviteError && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#0c0c0c] border border-[#333] rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <div className="text-4xl mb-3">🚪</div>
              <p className="text-white text-base leading-relaxed mb-6">{inviteError}</p>
              <button
                onClick={() => { setInviteError(''); try { window.location.assign('/player/home'); } catch { /* ignore */ } }}
                className="w-full py-3 rounded-xl bg-[#1a1a1a] border border-[#333] text-white font-mono text-sm hover:bg-[#222] transition-colors"
              >
                العودة للرئيسية
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 📨 مودال إرسال الدعوة (للاعب المصرّح له) */}
      {showInvite && isRemote && roomId && (
        <InviteModal roomId={roomId} emit={emit} onClose={() => setShowInvite(false)} />
      )}

      {/* 🎩 برومبت قرار العمدة — يصل لهاتف العمدة وحده (اللعب عن بُعد) */}
      <AnimatePresence>
        {mayorPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 24 }} animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm rounded-2xl p-5 border-2 border-[#C5A059] shadow-[0_0_40px_rgba(197,160,89,0.3)]"
              style={{ background: 'linear-gradient(170deg,#1d160c,#0f0b06)' }}
            >
              <div className="text-center text-4xl mb-1">🎩</div>
              <h3 className="text-center text-[#C5A059] font-black text-lg">أنت العمدة — لحظة القرار</h3>
              <p className="text-center text-[11px] text-[#9a8f7d] mb-1 leading-relaxed">
                نتيجة التصويت: إعدام{' '}
                <b className="text-[#ff6b64]">
                  {mayorPrompt.winner?.type === 'DEAL'
                    ? `صفقة #${mayorPrompt.winner?.initiatorPhysicalId} ← #${mayorPrompt.winner?.targetPhysicalId}`
                    : `#${mayorPrompt.winner?.targetPhysicalId} ${mayorPrompt.winner?.targetName || ''}`}
                </b>{' '}({mayorPrompt.topVotes} أصوات)
              </p>
              <p className="text-center text-[10px] text-[#655c4e] mb-3">⏳ {mayorPromptLeft} ثانية — وبعدها يحسم الموجّه</p>
              <div className="space-y-2">
                <button
                  onClick={() => sendMayorDecision('REVOTE')}
                  disabled={mayorSending}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#3b6fd4,#2b4f9e)', border: '1px solid #4f8ef7' }}
                >
                  🔄 أكشف نفسي — إلغاء الإعدام وتصويت جديد على الجميع
                </button>
                <button
                  onClick={() => sendMayorDecision('POSTPONE')}
                  disabled={mayorSending}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#7a4b8f,#5b3570)', border: '1px solid #9b6dd6' }}
                >
                  🌙 أكشف نفسي — تأجيل: لا موت اليوم
                </button>
                <button
                  onClick={() => sendMayorDecision('PASS')}
                  disabled={mayorSending}
                  className="w-full py-2.5 rounded-xl text-sm border border-[#4a3f31] text-[#9a8f7d] disabled:opacity-50"
                >
                  🤐 أبقى مخفيّاً — نفّذوا الإعدام
                </button>
              </div>
              <p className="text-center text-[9px] text-[#655c4e] mt-3">الكشف دائم للجميع + صوتك ×{mayorPrompt.voteWeight || 2} فوراً + القدرة تُستهلك (مرّة واحدة)</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🎩 إعلان كشف العمدة — لكلّ اللاعبين */}
      <AnimatePresence>
        {mayorBanner && (
          <motion.div
            initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
            className="fixed top-4 inset-x-4 z-[84] flex justify-center" dir="rtl"
          >
            <div className="max-w-sm w-full rounded-2xl px-4 py-3 border border-[#C5A059] text-center shadow-[0_0_30px_rgba(197,160,89,0.25)]"
              style={{ background: 'linear-gradient(170deg,#1d160c,#0f0b06)' }}>
              <p className="text-[#C5A059] font-black text-sm">🎩 العمدة يكشف نفسه: #{mayorBanner.physicalId} {mayorBanner.name}</p>
              <p className="text-[#9a8f7d] text-[11px] mt-0.5">
                {mayorBanner.decision === 'REVOTE' ? 'أُلغي الإعدام — تصويت جديد على الجميع' : 'أُلغي الإعدام — لا موت اليوم'}
                {' '}• صوته يُحسب ⚖️×{mayorBanner.voteWeight || 2}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🎩 شارة دائمة أثناء التصويت: عمدة مكشوف */}
      {gamePhase === 'DAY_VOTING' && mayorRevealedId !== null && !mayorBanner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[40]" dir="rtl">
          <span className="text-[10px] px-2.5 py-1 rounded-full border border-[#C5A059]/60 text-[#C5A059] bg-[#151007]/90">
            {mayorRevealedId === parseInt(physicalId) ? `⚖️ أنت العمدة — صوتك يُحسب ×${mayorWeight}` : `🎩 العمدة #${mayorRevealedId} — صوته ×${mayorWeight}`}
          </span>
        </div>
      )}

      {isExpelled ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 sm:p-10 rounded-2xl bg-[#1a0505]/85 backdrop-blur-md border border-red-800/40 shadow-[0_0_50px_rgba(138,3,3,0.3)] text-center relative z-10 overflow-hidden font-sans"
        >
          {/* Glowing pulse effect */}
          <div className="absolute -top-12 -left-12 w-24 h-24 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-red-600 to-transparent" />
          
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-600/30 rounded-full blur-md animate-ping" />
              <div className="w-20 h-20 bg-red-950/80 border border-red-500/50 rounded-full flex items-center justify-center text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>
          </div>
          
          <h2 className="text-3xl font-black text-red-500 mb-4" style={{ fontFamily: 'Amiri, serif' }}>
            تم استبعادك من اللعبة!
          </h2>
          
          <div className="bg-black/40 border border-red-950 rounded-xl p-4 mb-6">
            <p className="text-gray-400 text-xs font-mono uppercase tracking-widest mb-2">REASON FOR EXPULSION</p>
            <p className="text-white text-base leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
              {expulsionReason || 'لقد تم استبعادك بسبب انتهاك قواعد اللعب وتجاوز الحد الأقصى للعقوبات.'}
            </p>
          </div>
          
          <p className="text-red-400/80 text-xs leading-relaxed mb-8" style={{ fontFamily: 'Amiri, serif' }}>
            لقد تم مسح جلستك الحالية وخصم نقاط من رتبتك (RR) كعقوبة تنظيمية. الرجاء الالتزام بقواعد اللعب النظيف في المرات القادمة.
          </p>
          
          <button
            onClick={() => {
              setIsExpelled(false);
              setStep(initialRoomCode ? 'phone' : 'code');
            }}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-red-950 to-red-800 border border-red-700/50 text-white font-mono text-sm tracking-widest font-black shadow-[0_0_20px_rgba(138,3,3,0.4)] hover:from-red-900 hover:to-red-750 transition-all active:scale-98"
          >
            العودة للشاشة الرئيسية
          </button>
        </motion.div>
      ) : (
        <>
          {/* ── Title: MAFIA CLUB + Logo (مخفيّ عن بُعد — واجهة ملء الشاشة بلا لوجو) ── */}
          {!isRemote && (
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
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-full rounded-xl backdrop-blur-md relative z-10 ${isRemote ? 'max-w-lg p-2.5 shadow-none' : 'max-w-md p-8 sm:p-10 bg-black/50 border border-[#2a2a2a] shadow-[0_0_40px_rgba(0,0,0,0.8)]'}`}
          >
        {!isRemote && <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#8A0303]/60 to-transparent opacity-80 rounded-t-xl" />}
        
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

              {initialRoomCode && !roomId && !apiError && !userExited && (
                <div className="text-center mb-4">
                  <p className="text-[#C5A059] text-[10px] font-mono tracking-widest uppercase animate-pulse">LOCATING COMPONENT...</p>
                </div>
              )}

              {initialRoomCode && apiError && !roomId && (
                <div className="text-center mb-6">
                  <p className="text-[#8A0303] text-xs font-mono tracking-widest uppercase">{apiError}</p>
                </div>
              )}

              {(roomId || !initialRoomCode || userExited) && (
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
          {/* ── خطوة: إدخال رقم التذكرة ── */}
          {step === 'ticket' && (
            <motion.div key="ticket" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-center mb-8 border-b border-[#2a2a2a]/40 pb-6">
                <div className="mb-4 text-[#C5A059] flex justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                    <path d="M13 5v2"></path>
                    <path d="M13 17v2"></path>
                    <path d="M13 11v2"></path>
                  </svg>
                </div>
                <h2 className="text-2xl font-black mb-2 text-white truncate" style={{ fontFamily: 'Amiri, serif' }}>مرحباً {displayName}</h2>
                <p className="text-[#808080] text-sm" style={{ fontFamily: 'Amiri, serif' }}>أدخل رقم التذكرة للدخول</p>
              </div>

              <div className="mb-6">
                <input
                  type="text"
                  value={ticketNumber}
                  onChange={e => setTicketNumber(e.target.value)}
                  placeholder="رقم التذكرة"
                  dir="ltr"
                  className="w-full px-5 py-4 bg-black/40 border border-[#2a2a2a] rounded-xl text-center text-white text-2xl font-mono tracking-[0.3em] placeholder-[#333] focus:outline-none focus:border-[#C5A059]/50 focus:shadow-[0_0_15px_rgba(197,160,89,0.15)] transition-all"
                />
              </div>

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mb-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={() => handleAutoJoin(false, ticketNumber)}
                disabled={!ticketNumber.trim() || loading}
                className="w-full py-4 text-lg font-black rounded-lg border-2 transition-all disabled:opacity-50"
                style={{
                  fontFamily: 'Amiri, serif',
                  background: !ticketNumber.trim() || loading ? '#222' : 'linear-gradient(135deg, #166534, #15803d)',
                  borderColor: !ticketNumber.trim() || loading ? '#333' : '#22c55e',
                  color: !ticketNumber.trim() || loading ? '#666' : '#fff',
                  boxShadow: !ticketNumber.trim() || loading ? 'none' : '0 0 25px rgba(34,197,94,0.4), 0 0 50px rgba(34,197,94,0.15)',
                  textShadow: !ticketNumber.trim() || loading ? 'none' : '0 0 10px rgba(34,197,94,0.5)',
                }}
              >
                {loading ? 'جارٍ التحقق...' : '🎫 تحقق وادخل'}
              </button>
            </motion.div>
          )}

          {/* ── خطوة: جاري تخصيص المقعد ── */}
          {step === 'auto_joining' && (
            <motion.div key="auto_joining" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-10">
              <div className="mb-6">
                <div className="w-16 h-16 border-3 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-4" />
              </div>
              <h2 className="text-xl font-black text-white mb-2" style={{ fontFamily: 'Amiri, serif' }}>جاري تخصيص مقعدك...</h2>
              <p className="text-[#808080] text-sm" style={{ fontFamily: 'Amiri, serif' }}>يتم اختيار أفضل مقعد لك</p>
              {apiError && <p className="text-[#8A0303] text-xs font-mono text-center mt-4 bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}
            </motion.div>
          )}

          {/* ── خطوة 5: تم ── */}
          {step === 'done' && (
           <motion.div key="done" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* ── بانر المقعد المخصص (مخفيّ عن بُعد — الطاولة تُظهر مقعدك على كارد «أنت») ── */}
              {!isRemote && physicalId && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                  className="mb-4 rounded-2xl p-5 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(197,160,89,0.15), rgba(197,160,89,0.03))',
                    border: '2px solid rgba(197,160,89,0.4)',
                    boxShadow: '0 0 30px rgba(197,160,89,0.1), inset 0 0 30px rgba(197,160,89,0.05)',
                  }}
                >
                  <p className="text-[#808080] text-xs mb-1" style={{ fontFamily: 'Amiri, serif' }}>🪑 مقعدك رقم</p>
                  <p className="text-5xl font-black text-[#C5A059] mb-2" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 20px rgba(197,160,89,0.4)' }}>{physicalId}</p>
                  <p className="text-[#C5A059]/70 text-xs" style={{ fontFamily: 'Amiri, serif' }}>يرجى الجلوس في مقعدك</p>
                </motion.div>
              )}              {/* ── أزرار الملف الشخصي + تسجيل خروج ── */}
              <div className="flex items-center justify-between mb-2 px-0.5">
                <button
                  onClick={() => setRolesModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#2a2a2a] text-[#C5A059] hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">🃏</span> الأدوار
                </button>
                {isRemote && physicalId && (
                  <span className="text-[11px] font-mono text-[#808080]">مقعدك <span className="text-[#C5A059] font-black text-sm">#{physicalId}</span></span>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">🚪</span> خروج
                </button>
              </div>

              {/* 🔍 DEBUG BAR (مؤقت — للتشخيص) */}
              {!isRemote && (
              <div className="text-[8px] font-mono text-[#555] bg-[#0a0a0a] border border-[#1a1a1a] px-2 py-1 rounded mt-1 text-center">
                P:{gamePhase || 'null'} | C:{votingCandidates.length} | R:{assignedRole || 'null'} | S:{step} | v3.0
              </div>
              )}

              {/* 📱 الطاولة 3D أعلى الشاشة (بديل شاشة العرض — بلا كشف أدوار) */}
              {isRemote && gamePhase && gamePhase !== 'LOBBY' && gamePhase !== 'DAY_VOTING' && (
                <PhoneSpectatorView
                  roster={roster}
                  physicalId={physicalId}
                  gamePhase={gamePhase}
                  on={on}
                  initialDiscussionState={phasePollData?.discussionState}
                  videoByPid={voiceMaps.videoByPid}
                  speakingByPid={voiceMaps.audioByPid}
                  winnerReveal={gameOverData}
                />
              )}

              {/* ── رصيف الأكشن أسفل الطاولة ── */}
              {/* 🎙️ صوت اللعب عن بُعد (key ثابت يمنع إعادة التركيب/انقطاع الصوت عند تبدّل الأطوار) */}
              {isRemote && (
                <RemoteVoice
                  key="remote-voice"
                  roomId={roomId}
                  enabled={!!gamePhase}
                  isHost={false}
                  selfPhysicalId={parseInt(physicalId) || null}
                  emit={emit}
                  gamePhase={gamePhase}
                  onVoiceMaps={setVoiceMaps}
                  shouldOpenMic={voiceAllowedPids.includes(parseInt(physicalId)) && !isPlayerDead}
                />
              )}

              {/* 📨 دعوة الأصدقاء — يظهر للاعب فقط إذا سمح القائد بذلك */}
              {isRemote && allowPlayerInvites && roomId && (
                <div className="w-full max-w-lg mx-auto px-1 mt-2">
                  <button
                    onClick={() => setShowInvite(true)}
                    className="w-full py-2.5 rounded-xl bg-sky-600/90 text-white text-sm font-bold shadow-[0_0_12px_rgba(2,132,199,0.3)] hover:bg-sky-500 transition flex items-center justify-center gap-2"
                  >
                    📨 دعوة صديق للغرفة
                  </button>
                </div>
              )}

              {/* ⚔️ المواجهة الثنائية */}
              {isRemote && (
                <ConfrontationControls
                  confrontation={confrontation}
                  myPid={parseInt(physicalId) || null}
                  isHost={false}
                  players={roster}
                  emit={emit}
                  roomId={roomId}
                  gamePhase={gamePhase}
                />
              )}

              {/* ── عرض مرحلة اللعبة الحالية (نُخفي كشف الفائز عن بُعد — الطاولة تكشفه) ── */}
              {gamePhase && gamePhase !== 'DAY_VOTING' && gamePhase !== 'LOBBY' && !(isRemote && gamePhase === 'GAME_OVER') && (
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
                  roomId={roomId}
                  isRemote={isRemote}
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
                  {(() => {
                    const timeSinceVote = lastVoteTime ? now - lastVoteTime : 0;
                    const voteWindowOpen = lastVoteTime !== null && timeSinceVote < 10000;
                    const secondsLeft = Math.max(0, 10 - Math.floor(timeSinceVote / 1000));
                    const canVote = (myVote === null || voteWindowOpen) && (votingCountdown === null || votingCountdown > 0);

                    return (
                      <>
                        {/* عنوان */}
                        <div className="text-center mb-5">
                          <div className="text-3xl mb-2">🗳️</div>
                          <h2 className="text-2xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                            مرحلة التصويت
                          </h2>
                          <p className="text-[#808080] text-xs font-mono uppercase tracking-[0.1em] mt-2">
                            {isPlayerDead ? 'مشاهدة فقط — أنت مُقصى' : myVote !== null ? (
                              voteWindowOpen ? (
                                <span className="text-amber-500 font-bold">يمكنك تغيير تصويتك خلال {secondsLeft} ثانية</span>
                              ) : (
                                <span className="text-green-500 font-bold">✅ تم التصويت (مغلق)</span>
                              )
                            ) : (
                              votingCountdown === 0 ? <span className="text-[#8A0303] font-bold">❌ لم تقم بالتصويت</span> : 'صوّت ضد اللاعب المشتبه'
                            )}
                          </p>
                        </div>

                  {votingCountdown !== null && votingCountdown > 0 && (
                    <div 
                      key={votingCountdown <= 10 ? 'red' : 'gold'}
                      className={`text-3xl font-black font-mono text-center mb-5 ${
                        votingCountdown <= 10 ? 'text-red-500 animate-pulse' : 'text-[#C5A059]'
                      }`}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      ⏱ {votingCountdown}ث
                    </div>
                  )}

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
                  <div className="grid grid-cols-1 gap-4 px-1 max-h-[55vh] overflow-y-auto pb-4">
                    {votingCandidates.map((candidate: any, index: number) => {
                      const isSelf = candidate.targetPhysicalId === parseInt(physicalId);
                      const isMyChoice = myVote === index;
                      const playerInfo = votingPlayersInfo.find((p: any) => p.physicalId === candidate.targetPhysicalId);
                      const candidateName = playerInfo?.name || `لاعب ${candidate.targetPhysicalId}`;
                      const candidateAvatar = playerInfo?.avatarUrl;
                      const isDeal = candidate.type === 'DEAL';
                      const initiatorInfo = isDeal ? votingPlayersInfo.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;
                      const votersForThisCandidate = Object.entries(playerVotes).filter(([_, targetIdx]) => targetIdx === index).map(([vId]) => parseInt(vId));

                      return (
                        <motion.button
                          key={candidate.id || `c-${index}`}
                          whileTap={!isPlayerDead && !isMyChoice ? { scale: 0.95 } : {}}
                          onClick={() => {
                            if (isPlayerDead || isMyChoice || voteSubmitting || !canVote || isSelf) return;
                            setVoteSubmitting(true);
                            emit('player:cast-vote', {
                              roomId,
                              physicalId: parseInt(physicalId),
                              candidateIndex: index,
                            }).then((res: any) => {
                              if (res?.success) {
                                setMyVote(index);
                                setLastVoteTime(Date.now());
                                if (navigator.vibrate) navigator.vibrate(100);
                              }
                            }).catch(() => {}).finally(() => setVoteSubmitting(false));
                          }}
                          disabled={isPlayerDead}
                          className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all w-full overflow-hidden ${
                            isMyChoice
                              ? 'border-[#C5A059] bg-gradient-to-b from-[#C5A059]/15 to-[#C5A059]/5 shadow-[0_0_20px_rgba(197,160,89,0.2)]'
                              : 'border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]'
                          }`}
                        >
                          {/* صورة واسم */}
                          <div className="flex items-center gap-3 w-full">
                            <div className="relative w-[72px] h-[72px] shrink-0 rounded-full overflow-hidden border-2 border-[#333] bg-[#1a1a1a] flex items-center justify-center shadow-lg">
                              {candidateAvatar ? (
                                <Image src={candidateAvatar} alt="" width={72} height={72} className="object-cover w-full h-full" />
                              ) : (
                                <span className="text-3xl font-black text-[#C5A059] font-mono">#{candidate.targetPhysicalId}</span>
                              )}
                              {isMyChoice && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute inset-0 bg-[#C5A059]/40 flex items-center justify-center rounded-full backdrop-blur-sm"
                                >
                                  <span className="text-3xl drop-shadow-md">✅</span>
                                </motion.div>
                              )}
                            </div>

                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className="text-sm font-mono text-[#C5A059] mb-1 tracking-widest bg-black/40 px-2 py-0.5 rounded-full border border-[#C5A059]/20">
                                مقعد #{candidate.targetPhysicalId}
                              </span>
                              
                              <div className="flex items-center gap-2 w-full">
                                <p className="text-xl font-bold text-white leading-snug break-words">
                                  {candidateName}
                                </p>
                                {notepadNotes[candidate.targetPhysicalId] && notepadNotes[candidate.targetPhysicalId].suspicion !== 'none' && (
                                  <span className="text-sm bg-black/50 px-1.5 py-0.5 rounded-md border border-[#333] shadow-inner">
                                    {notepadNotes[candidate.targetPhysicalId].suspicion === 'safe' ? '🟢' : notepadNotes[candidate.targetPhysicalId].suspicion === 'suspect' ? '🟡' : '🔴'}
                                  </span>
                                )}
                              </div>
                              
                              {isDeal && (
                                <div className="mt-2 bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded-md flex items-center gap-2">
                                  <span className="text-red-500 text-xs font-bold whitespace-nowrap">🤝 ديل من:</span>
                                  <span className="text-white text-xs font-bold truncate">
                                    {initiatorInfo?.name || `لاعب ${candidate.initiatorPhysicalId}`} <span className="font-mono text-red-400">#{candidate.initiatorPhysicalId}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* عداد الأصوات */}
                          <div className="mt-1.5 flex items-center gap-1 bg-black/30 rounded-full px-2.5 py-0.5 w-fit mx-auto">
                            <span className="text-sm font-black text-[#C5A059]">{candidate.votes || 0}</span>
                            <span className="text-[10px] text-[#808080]">صوت</span>
                          </div>

                          {/* أسماء المصوتين */}
                          {votersForThisCandidate.length > 0 && (
                            <div className="mt-2 w-full flex flex-wrap justify-center gap-1.5 border-t border-[#333]/50 pt-2 px-1">
                              {votersForThisCandidate.map(vId => {
                                const vName = votingPlayersInfo.find((p: any) => p.physicalId === vId)?.name || `لاعب ${vId}`;
                                return (
                                  <span key={vId} className="text-[9px] font-mono bg-[#8A0303]/20 border border-[#8A0303]/40 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="font-black text-[#ff4444]">{vId}</span>
                                    <span className="truncate max-w-[50px] text-gray-300">{vName}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* شارة "أنت" */}
                          {isSelf && (
                            <span className="absolute top-1.5 right-1.5 text-[8px] bg-[#222] text-[#808080] px-1.5 py-0.5 rounded-full font-mono">أنت</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                  </>
                  );
                })()}
                </motion.div>
              ) : (!gamePhase || gamePhase === 'LOBBY' || gamePhase === 'ROLE_BINDING' || gamePhase === 'ROLE_GENERATION') ? (
                assignedRole === null ? (
                  /* ── حالة الانتظار (لم يُوزَّع الدور بعد) ── */
                  <>
                    {penalties > 0 && (
                      <div className="flex flex-col items-center gap-1.5 mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-3 shadow-[0_0_15px_rgba(220,38,38,0.05)] w-full">
                        <span className="text-red-400 text-[10px] font-mono tracking-widest uppercase">ACTIVE RULE VIOLATIONS</span>
                        <div className="flex gap-2.5">
                          {Array.from({ length: maxPenalties }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                i < penalties
                                  ? 'bg-red-600 shadow-[0_0_8px_#dc2626]'
                                  : 'bg-neutral-800 border border-neutral-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-red-300/70" style={{ fontFamily: 'Amiri, serif' }}>
                          تحذير: ({penalties}/{maxPenalties}) عقوبات. سيتم طردك عند تجاوز الحد.
                        </span>
                      </div>
                    )}
                    {isRemote && (!gamePhase || gamePhase === 'LOBBY') ? (
                      /* ── لوبي اللعب عن بُعد: حلقة كروت الطاولة (نفس تصميم باقي المراحل) ── */
                      <>
                        <PhoneSpectatorView
                          roster={roster}
                          physicalId={physicalId}
                          gamePhase={gamePhase || 'LOBBY'}
                          on={on}
                          lobby
                          maxPlayers={maxPlayers}
                          videoByPid={voiceMaps.videoByPid}
                          speakingByPid={voiceMaps.audioByPid}
                        />
                        <div className="mt-2 flex items-center justify-center gap-3 rounded-xl px-4 py-2 bg-[#C5A059]/10 border border-[#C5A059]/40">
                          <span className="text-[10px] text-[#808080]" style={{ fontFamily: 'Amiri, serif' }}>رمز الغرفة</span>
                          <b className="text-[#C5A059] text-xl font-mono tracking-[0.18em]">{roomCode}</b>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#C5A059] to-[#E8C97A] transition-[width] duration-500" style={{ width: `${Math.min(100, (roster.length / (maxPlayers || roster.length || 1)) * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-center text-[10px] font-mono text-[#808080]">انضمّ {roster.length} من {maxPlayers}</div>
                      </>
                    ) : (
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
                    )}
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
                        onFlip={() => { setCardFlipped(true); setRoleAlert(false); }}
                        flipDurationMs={1100}
                        gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                        showVoting={false}
                        flippable={true}
                        size="md"
                        avatarUrl={avatarUrl}
                      />
                    </div>

                    <AnimatePresence mode="wait">
                      {cardFlipped ? (
                        <motion.div
                          key="hide-msg"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center w-full"
                        >
                          <p className="text-[#8A0303] text-[11px] font-mono uppercase tracking-[0.2em] animate-pulse mb-4">
                            ⚠️ أخفِ هاتفك الآن!
                          </p>


                        </motion.div>
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

                  </motion.div>
                )
              ) : null}

            </motion.div>
          )}

          {/* ── خطوة Rejoin: اللاعب عاد ── */}
          {step === 'rejoined' && (
            <motion.div key="rejoined" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* ── أزرار الملف الشخصي + تسجيل خروج ── */}
              <div className="flex items-center justify-between mb-2 px-0.5">
                <button
                  onClick={() => setRolesModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-[#2a2a2a] text-[#C5A059] hover:border-[#C5A059]/50 hover:bg-[#C5A059]/5 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">🃏</span> الأدوار
                </button>
                {isRemote && physicalId && (
                  <span className="text-[11px] font-mono text-[#808080]">مقعدك <span className="text-[#C5A059] font-black text-sm">#{physicalId}</span></span>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-all text-[11px] font-bold"
                >
                  <span className="text-sm">🚪</span> خروج
                </button>
              </div>

              {/* 🔍 DEBUG BAR (مؤقت — للتشخيص) */}
              {!isRemote && (
              <div className="text-[8px] font-mono text-[#555] bg-[#0a0a0a] border border-[#1a1a1a] px-2 py-1 rounded mt-1 text-center mb-2">
                P:{gamePhase || 'null'} | C:{votingCandidates.length} | R:{assignedRole || 'null'} | S:{step} | v4.0
              </div>
              )}

              {/* 📱 الطاولة 3D أعلى الشاشة (بديل شاشة العرض — بلا كشف أدوار) */}
              {isRemote && gamePhase && gamePhase !== 'LOBBY' && gamePhase !== 'DAY_VOTING' && (
                <PhoneSpectatorView
                  roster={roster}
                  physicalId={physicalId}
                  gamePhase={gamePhase}
                  on={on}
                  initialDiscussionState={phasePollData?.discussionState}
                  videoByPid={voiceMaps.videoByPid}
                  speakingByPid={voiceMaps.audioByPid}
                  winnerReveal={gameOverData}
                />
              )}

              {/* ── رصيف الأكشن أسفل الطاولة ── */}
              {/* 🎙️ صوت اللعب عن بُعد (key ثابت يمنع إعادة التركيب/انقطاع الصوت عند تبدّل الأطوار) */}
              {isRemote && (
                <RemoteVoice
                  key="remote-voice"
                  roomId={roomId}
                  enabled={!!gamePhase}
                  isHost={false}
                  selfPhysicalId={parseInt(physicalId) || null}
                  emit={emit}
                  gamePhase={gamePhase}
                  onVoiceMaps={setVoiceMaps}
                  shouldOpenMic={voiceAllowedPids.includes(parseInt(physicalId)) && !isPlayerDead}
                />
              )}

              {/* 📨 دعوة الأصدقاء — يظهر للاعب فقط إذا سمح القائد بذلك */}
              {isRemote && allowPlayerInvites && roomId && (
                <div className="w-full max-w-lg mx-auto px-1 mt-2">
                  <button
                    onClick={() => setShowInvite(true)}
                    className="w-full py-2.5 rounded-xl bg-sky-600/90 text-white text-sm font-bold shadow-[0_0_12px_rgba(2,132,199,0.3)] hover:bg-sky-500 transition flex items-center justify-center gap-2"
                  >
                    📨 دعوة صديق للغرفة
                  </button>
                </div>
              )}

              {/* ⚔️ المواجهة الثنائية */}
              {isRemote && (
                <ConfrontationControls
                  confrontation={confrontation}
                  myPid={parseInt(physicalId) || null}
                  isHost={false}
                  players={roster}
                  emit={emit}
                  roomId={roomId}
                  gamePhase={gamePhase}
                />
              )}

              {/* ── عرض مرحلة اللعبة الحالية (نُخفي كشف الفائز عن بُعد — الطاولة تكشفه) ── */}
              {gamePhase && gamePhase !== 'DAY_VOTING' && gamePhase !== 'LOBBY' && !(isRemote && gamePhase === 'GAME_OVER') && (
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
                  roomId={roomId}
                  isRemote={isRemote}
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
                      {isPlayerDead ? 'مشاهدة فقط — أنت مُقصى' : myVote !== null ? '✅ تم التصويت — اضغط لاعب آخر للتغيير' : (votingCountdown === 0 ? <span className="text-[#8A0303] font-bold">❌ لم تقم بالتصويت</span> : 'صوّت ضد اللاعب المشتبه')}
                    </p>
                  </div>

                  {votingCountdown !== null && votingCountdown > 0 && (
                    <div 
                      key={votingCountdown <= 10 ? 'red' : 'gold'}
                      className={`text-3xl font-black font-mono text-center mb-5 ${
                        votingCountdown <= 10 ? 'text-red-500 animate-pulse' : 'text-[#C5A059]'
                      }`}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      ⏱ {votingCountdown}ث
                    </div>
                  )}

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
                  <div className="grid grid-cols-1 gap-4 px-1 max-h-[55vh] overflow-y-auto pb-4">
                    {votingCandidates.map((candidate: any, index: number) => {
                      const isSelf = candidate.targetPhysicalId === parseInt(physicalId);
                      const isMyChoice = myVote === index;
                      const playerInfo = votingPlayersInfo.find((p: any) => p.physicalId === candidate.targetPhysicalId);
                      const candidateName = playerInfo?.name || `لاعب ${candidate.targetPhysicalId}`;
                      const candidateAvatar = playerInfo?.avatarUrl;
                      const isDeal = candidate.type === 'DEAL';
                      const initiatorInfo = isDeal ? votingPlayersInfo.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;
                      const votersForThisCandidate = Object.entries(playerVotes).filter(([_, targetIdx]) => targetIdx === index).map(([vId]) => parseInt(vId));

                      return (
                        <motion.button
                          key={candidate.id || `c-${index}`}
                          whileTap={!isPlayerDead && !isMyChoice ? { scale: 0.95 } : {}}
                          onClick={() => {
                            if (isPlayerDead || isMyChoice || voteSubmitting || votingComplete || isSelf) return;
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
                          disabled={isPlayerDead}
                          className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all w-full overflow-hidden ${
                            isMyChoice
                              ? 'border-[#C5A059] bg-gradient-to-b from-[#C5A059]/15 to-[#C5A059]/5 shadow-[0_0_20px_rgba(197,160,89,0.2)]'
                              : 'border-[#222] bg-[#111] hover:border-[#C5A059]/30 active:bg-[#1a1a1a]'
                          }`}
                        >
                          {/* صورة واسم */}
                          <div className="flex items-center gap-3 w-full">
                            <div className="relative w-[72px] h-[72px] shrink-0 rounded-full overflow-hidden border-2 border-[#333] bg-[#1a1a1a] flex items-center justify-center shadow-lg">
                              {candidateAvatar ? (
                                <Image src={candidateAvatar} alt="" width={72} height={72} className="object-cover w-full h-full" />
                              ) : (
                                <span className="text-3xl font-black text-[#C5A059] font-mono">#{candidate.targetPhysicalId}</span>
                              )}
                              {isMyChoice && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute inset-0 bg-[#C5A059]/40 flex items-center justify-center rounded-full backdrop-blur-sm"
                                >
                                  <span className="text-3xl drop-shadow-md">✅</span>
                                </motion.div>
                              )}
                            </div>

                            <div className="flex flex-col items-start flex-1 min-w-0">
                              <span className="text-sm font-mono text-[#C5A059] mb-1 tracking-widest bg-black/40 px-2 py-0.5 rounded-full border border-[#C5A059]/20">
                                مقعد #{candidate.targetPhysicalId}
                              </span>
                              
                              <div className="flex items-center gap-2 w-full">
                                <p className="text-xl font-bold text-white leading-snug break-words">
                                  {candidateName}
                                </p>
                                {notepadNotes[candidate.targetPhysicalId] && notepadNotes[candidate.targetPhysicalId].suspicion !== 'none' && (
                                  <span className="text-sm bg-black/50 px-1.5 py-0.5 rounded-md border border-[#333] shadow-inner">
                                    {notepadNotes[candidate.targetPhysicalId].suspicion === 'safe' ? '🟢' : notepadNotes[candidate.targetPhysicalId].suspicion === 'suspect' ? '🟡' : '🔴'}
                                  </span>
                                )}
                              </div>
                              
                              {isDeal && (
                                <div className="mt-2 bg-red-500/20 border border-red-500/30 px-2.5 py-1 rounded-md flex items-center gap-2">
                                  <span className="text-red-500 text-xs font-bold whitespace-nowrap">🤝 ديل من:</span>
                                  <span className="text-white text-xs font-bold truncate">
                                    {initiatorInfo?.name || `لاعب ${candidate.initiatorPhysicalId}`} <span className="font-mono text-red-400">#{candidate.initiatorPhysicalId}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* عداد الأصوات */}
                          <div className="mt-1.5 flex items-center gap-1 bg-black/30 rounded-full px-2.5 py-0.5 w-fit mx-auto">
                            <span className="text-sm font-black text-[#C5A059]">{candidate.votes || 0}</span>
                            <span className="text-[10px] text-[#808080]">صوت</span>
                          </div>

                          {/* أسماء المصوتين */}
                          {votersForThisCandidate.length > 0 && (
                            <div className="mt-2 w-full flex flex-wrap justify-center gap-1.5 border-t border-[#333]/50 pt-2 px-1">
                              {votersForThisCandidate.map(vId => {
                                const vName = votingPlayersInfo.find((p: any) => p.physicalId === vId)?.name || `لاعب ${vId}`;
                                return (
                                  <span key={vId} className="text-[9px] font-mono bg-[#8A0303]/20 border border-[#8A0303]/40 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="font-black text-[#ff4444]">{vId}</span>
                                    <span className="truncate max-w-[50px] text-gray-300">{vName}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* شارة "أنت" */}
                          {isSelf && (
                            <span className="absolute top-1.5 right-1.5 text-[8px] bg-[#222] text-[#808080] px-1.5 py-0.5 rounded-full font-mono">أنت</span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (!gamePhase || gamePhase === 'LOBBY' || gamePhase === 'ROLE_BINDING' || gamePhase === 'ROLE_GENERATION') ? (
                isPlayerDead ? (
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
                        onFlip={() => { setCardFlipped(true); setRoleAlert(false); }}
                        flipDurationMs={1100}
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

                  </>
                ) : (
                  /* ── حالة حي بدون دور (في الانتظار) ── */
                  <>
                    {penalties > 0 && (
                      <div className="flex flex-col items-center gap-1.5 mb-6 bg-red-950/20 border border-red-900/30 rounded-xl p-3 shadow-[0_0_15px_rgba(220,38,38,0.05)] w-full">
                        <span className="text-red-400 text-[10px] font-mono tracking-widest uppercase">ACTIVE RULE VIOLATIONS</span>
                        <div className="flex gap-2.5">
                          {Array.from({ length: maxPenalties }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                i < penalties
                                  ? 'bg-red-600 shadow-[0_0_8px_#dc2626]'
                                  : 'bg-neutral-800 border border-neutral-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-red-300/70" style={{ fontFamily: 'Amiri, serif' }}>
                          تحذير: ({penalties}/{maxPenalties}) عقوبات. سيتم طردك عند تجاوز الحد.
                        </span>
                      </div>
                    )}
                    {isRemote && (!gamePhase || gamePhase === 'LOBBY') ? (
                      /* ── لوبي اللعب عن بُعد (بعد عودة اللاعب): حلقة كروت الطاولة ── */
                      <>
                        <PhoneSpectatorView
                          roster={roster}
                          physicalId={physicalId}
                          gamePhase={gamePhase || 'LOBBY'}
                          on={on}
                          lobby
                          maxPlayers={maxPlayers}
                          videoByPid={voiceMaps.videoByPid}
                          speakingByPid={voiceMaps.audioByPid}
                        />
                        <div className="mt-2 flex items-center justify-center gap-3 rounded-xl px-4 py-2 bg-[#C5A059]/10 border border-[#C5A059]/40">
                          <span className="text-[10px] text-[#808080]" style={{ fontFamily: 'Amiri, serif' }}>رمز الغرفة</span>
                          <b className="text-[#C5A059] text-xl font-mono tracking-[0.18em]">{roomCode}</b>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#C5A059] to-[#E8C97A] transition-[width] duration-500" style={{ width: `${Math.min(100, (roster.length / (maxPlayers || roster.length || 1)) * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-center text-[10px] font-mono text-[#808080]">انضمّ {roster.length} من {maxPlayers}</div>
                      </>
                    ) : (
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
                  </>
                )
              ) : null}
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
        </>
      )}

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
                  onClick={() => {
                    // ابقى في الغرفة الحالية → حاول rejoin
                    if (switchConfirm && emit) {
                      const normalized = phone.startsWith('0') ? phone : '0' + phone;
                      emit('room:rejoin-player', {
                        roomId: switchConfirm.currentRoomId,
                        physicalId: 0,
                        phone: normalized,
                      }).then((res: any) => {
                        if (res?.success && res.player) {
                          setRoomId(switchConfirm.currentRoomId);
                          setPhysicalId(String(res.player.physicalId));
                          setDisplayName(res.player.name);
                          if (res.player.role) setAssignedRole(res.player.role);
                          if (!res.player.isAlive) { setIsPlayerDead(true); setCardFlipped(true); }
                          setStep('rejoined');
                        }
                      }).catch(() => {});
                    }
                    setSwitchConfirm(null);
                  }}
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
      {/* Mafia Team Gallery Modal */}
      <MafiaTeamGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        /* 👥 دفاع: لا تُعرض قائمة المافيا إلا إذا كان دور اللاعب الحالي مافيا فعلاً —
           يمنع تسرّب فريق محفوظ من لعبة سابقة للأخ الأصغر/المواطن حتى لو بقي في الحالة لحظياً.
           بعد تحوّل الأخ الأصغر يصبح دوره مافياوياً فتظهر القائمة طبيعياً. */
        team={assignedRole && (MAFIA_ROLES as unknown as string[]).includes(assignedRole) ? mafiaTeam : []}
        /* بطاقة التعارف للأخ الأكبر (مافيا) فقط — نفس الحماية ضد بقايا لعبة سابقة */
        sibling={assignedRole && (MAFIA_ROLES as unknown as string[]).includes(assignedRole) ? sibling : null}
        isAssassin={assignedRole === 'ASSASSIN'}
        assassinContracts={assassinContracts}
      />

      {/* ── زر شركاء المافيا العائم (موجود كشكل للجميع لتجنب كشف الدور) ── */}
      {assignedRole !== null && gamePhase !== 'GAME_OVER' && (step === 'done' || step === 'rejoined') && (
        <button
          onClick={() => {
            // 🕵️ تنبيه لحظي لليدر بأن اللاعب فتح/حاول فتح قائمة التعرف (fire-and-forget)
            import('@/lib/socket').then(m => m.getSocket().emit('player:mafia-gallery-open', { roomId })).catch(() => {});
            // اللاعب المُقصى ممنوع من فتح المعرض (السيرفر يميّزه ويُنبّه الليدر بالمحاولة)
            if (isPlayerDead) return;
            setIsGalleryOpen(true);
          }}
          className="fixed bottom-[110px] left-4 z-[90] bg-[#8A0303]/90 hover:bg-[#8A0303] text-white border border-red-500/50 p-3 rounded-full shadow-[0_0_15px_rgba(138,3,3,0.5)] transition-transform hover:scale-110 flex items-center justify-center backdrop-blur-sm"
          title="التعرف على المافيا"
        >
          <Users className="w-6 h-6" />
        </button>
      )}

      {/* Player Notepad FAB — فوق البوتوم بار */}
      {(step === 'done' || step === 'rejoined') && (
        <button
          onClick={() => setIsNotepadOpen(true)}
          className="fixed bottom-[88px] right-4 w-12 h-12 bg-[#111] border-2 border-[#C5A059] text-xl flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(197,160,89,0.3)] z-[90] hover:scale-105 transition-transform"
          title="مفكرة التحري"
        >
          📝
        </button>
      )}


      {/* Player Notepad Modal */}
      <PlayerNotepad
        roomId={roomId}
        myPhysicalId={parseInt(physicalId) || 0}
        players={roster.length > 0 ? roster : votingPlayersInfo}
        isOpen={isNotepadOpen}
        onClose={() => setIsNotepadOpen(false)}
        onNotesChange={setNotepadNotes}
        chatVisible={
          // 🗣️ تبويب التشاور: مافيا حيّ + الغرفة مفعّلة من الليدر + مرحلة لعب فعلية.
          // يُحسب على جهاز اللاعب نفسه فقط (لا يُبثّ شيء)؛ والسيرفر يتحقق سيادياً على كل عملية.
          mafiaChatEnabled &&
          !isPlayerDead &&
          (['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'].includes(assignedRole || '') || mafiaTeam.length > 0) &&
          // ROLE_BINDING مسموحة: امتلاك assignedRole يعني أن الأدوار اعتُمدت ووُزّعت فعلاً
          !['LOBBY', 'ROLE_GENERATION', 'GAME_OVER'].includes(gamePhase || '')
        }
      />

      {/* ══ Auto Night: شاشة الإجراء الليلي — تصميم مطابق للتصويت ══ */}
      {nightActionRequired && !nightActionSubmitted && (
        <div className="fixed inset-0 z-[200] bg-gradient-to-b from-[#0a0812] via-[#070510] to-[#000]" style={{ fontFamily: 'Amiri, serif' }}>
          <div className="flex flex-col h-full safe-area-inset">
            {/* Header */}
            <div className="text-center pt-8 pb-3 px-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-4xl mb-2"
              >🌙</motion.div>
              <p className="text-[9px] font-mono text-[#666] tracking-[0.2em] uppercase mb-1">مرحلة الليل</p>
              <h2 className="text-xl font-black text-[#C5A059]">
                {nightActionRequired.stepRole === 'MAFIA' ? 'المافيا' :
                  nightActionRequired.stepRole === 'GODFATHER' ? 'العراب' :
                  nightActionRequired.stepRole === 'SILENCER' ? 'المُسكت' :
                  nightActionRequired.stepRole === 'SHERIFF' ? 'المحقق' :
                  nightActionRequired.stepRole === 'DOCTOR' ? 'الطبيب' :
                  nightActionRequired.stepRole === 'NURSE' ? 'الممرضة' :
                  nightActionRequired.stepRole === 'SNIPER' ? 'القناص' :
                  nightActionRequired.stepRole === 'CHAMELEON' ? 'الحرباء' :
                  nightActionRequired.stepRole || 'مجهول'}
              </h2>
              <p className="text-[#888] text-xs mt-1">
                {nightActionRequired.isDecoy
                  ? 'اختر أي شخص للتمويه...'
                  : (
                    (nightActionRequired.actionType === 'KILL' && 'اختر هدف الاغتيال') ||
                    (nightActionRequired.actionType === 'INVESTIGATE' && 'من تريد التحقيق معه؟') ||
                    (nightActionRequired.actionType === 'PROTECT' && 'من تريد حمايته الليلة؟') ||
                    (nightActionRequired.actionType === 'SNIPE' && 'اختر هدف القنص') ||
                    (nightActionRequired.actionType === 'SILENCE' && 'من تريد إسكاته؟') ||
                    (nightActionRequired.actionType === 'DISABLE' && 'اختر لاعباً لتعطيل قدرته') ||
                    (nightActionRequired.actionType === 'DECOY' && 'اختر أي شخص')
                  )
                }
              </p>
            </div>

            {/* التايمر الدائري */}
            <div className="flex justify-center py-2">
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1a1a2e" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none"
                    stroke={nightActionCountdown <= 5 ? '#ef4444' : nightActionCountdown <= 10 ? '#f59e0b' : '#C5A059'}
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${Math.max(0, (nightActionCountdown / (nightActionRequired.timeoutSeconds || 15)) * 97.4)} 97.4`}
                    style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' }}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-lg font-black font-mono ${
                  nightActionCountdown <= 5 ? 'text-red-400 animate-pulse' : nightActionCountdown <= 10 ? 'text-amber-400' : 'text-white'
                }`}>
                  {nightActionCountdown}
                </span>
              </div>
            </div>

            {/* قائمة الأهداف — تصميم مطابق للتصويت */}
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              <div className="space-y-2">
                {nightActionRequired.availableTargets.map(target => {
                  return (
                    <motion.button
                      key={target.physicalId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={async () => {
                        if (!emit || nightActionSubmitted) return;
                        setNightActionSubmitted(true);
                        if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
                        await emit('player:night-action', {
                          roomId,
                          actionType: nightActionRequired.actionType,
                          targetPhysicalId: target.physicalId,
                        }).catch(() => {});
                        setTimeout(() => setNightActionRequired(null), 1500);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 border rounded-2xl transition-all text-right ${
                        'bg-gradient-to-r from-white/[0.03] to-transparent border-[#2a2a2a] hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5 active:bg-[#8A0303]/20 active:border-[#8A0303]/60'
                      }`}
                    >
                      <div className={`relative w-11 h-11 rounded-full border-2 flex items-center justify-center shrink-0 overflow-hidden border-[#C5A059]/30`}>
                        {(target as any).avatarUrl ? (
                          <>
                            <img src={(target as any).avatarUrl} alt="" className="w-full h-full object-cover grayscale opacity-80" />
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-sm font-black drop-shadow-md text-white">#{target.physicalId}</span>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[#C5A059]/10">
                            <span className="text-sm font-black text-[#C5A059]">#{target.physicalId}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">
                          {target.name || `لاعب #${target.physicalId}`}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* زر تخطي */}
            {nightActionRequired.canSkip && !nightActionRequired.isDecoy && (
              <div className="px-4 pb-4 pt-2">
                <button
                  onClick={async () => {
                    if (!emit || nightActionSubmitted) return;
                    setNightActionSubmitted(true);
                    if (nightCountdownRef.current) clearInterval(nightCountdownRef.current);
                    await emit('player:night-action', {
                      roomId,
                      actionType: nightActionRequired.actionType,
                      targetPhysicalId: null,
                    }).catch(() => {});
                    setTimeout(() => setNightActionRequired(null), 1500);
                  }}
                  className="w-full py-2.5 text-[#666] hover:text-[#999] text-xs font-mono transition-colors border border-[#1a1a1a] rounded-xl hover:border-[#333]"
                >
                  تخطي هذه الخطوة ←
                </button>
              </div>
            )}
          </div>

          {/* رسالة تأكيد */}
          {nightActionSubmitted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-black/90"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-6xl mb-4"
                >✅</motion.div>
                <p className="text-white font-black text-xl">تم الإرسال</p>
                <p className="text-[#666] text-xs font-mono mt-2 tracking-widest">WAITING FOR RESULTS...</p>
              </motion.div>
            </motion.div>
          )}
        </div>
      )}

      {/* ══ Nurse Activation Prompt ══ */}
      {nurseActivationPending && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center px-4" style={{ fontFamily: 'Amiri, serif' }}>
          <div className="bg-[#111] border border-[#C5A059]/30 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="text-5xl mb-4">🏥</div>
            <h2 className="text-2xl font-black text-[#C5A059] mb-2">الممرضة</h2>
            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
              الطبيب غير متاح هذه الليلة.<br/>
              هل تريدين تفعيل صلاحية الحماية؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setNurseActivationPending(false);
                  if (!emit) return;
                  await emit('nurse:activation-response', { roomId, activate: false }).catch(() => {});
                }}
                className="flex-1 py-3 rounded-xl border border-[#333] bg-black/60 text-[#888] font-bold text-sm"
              >
                لا، تخطي
              </button>
              <button
                onClick={async () => {
                  setNurseActivationPending(false);
                  if (!emit) return;
                  await emit('nurse:activation-response', { roomId, activate: true }).catch(() => {});
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm"
              >
                نعم، أريد الحماية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Roles Modal ══ */}
      <RolesInfoModal isOpen={rolesModalOpen} onClose={() => setRolesModalOpen(false)} />
    </div>
  );
}

