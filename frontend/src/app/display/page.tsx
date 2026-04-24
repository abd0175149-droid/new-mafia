'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Phase, isMafiaRole, Role } from '@/lib/constants';
import { getSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';
import DisplayDayView from './DisplayDayView';
import MafiaCard from '@/components/MafiaCard';
import NightAnimCinematic from '@/components/NightAnimCinematic';

// مؤثرات صوتية باستخدام Web Audio API
function playCardFlipSound(role: string | null, isMafia: boolean) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (role === 'GODFATHER') {
      // صوت دراماتيكي للشيخ
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } else if (role === 'SHERIFF') {
      // صوت بطولي للشريف
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else if (isMafia) {
      // صوت مشؤوم للمافيا
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // صوت محايد للمواطن
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (_) {}
}

// ══════════════════════════════════════════════════════
// 📺 شاشة العرض - Display Page
// تستخدم REST API لجلب البيانات + Socket للتحديثات الحية
// ══════════════════════════════════════════════════════

type DisplayStep = 'pin' | 'select-game' | 'lobby';

interface ActiveGame {
  roomId: string;
  roomCode: string;
  gameName: string;
  playerCount: number;
  maxPlayers: number;
}

interface PlayerInfo {
  physicalId: number;
  name: string;
  isAlive: boolean;
  role?: string;
  gender?: string;
}

// ── مؤثرات صوتية للفوز ──
function playWinSound(isMafia: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (isMafia) {
      // فوز المافيا — نغمات مظلمة ومرعبة  
      const playDarkNote = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + start + dur);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + start + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playDarkNote(110, 0, 2);
      playDarkNote(92, 0.3, 2);
      playDarkNote(82, 0.6, 2.5);
      playDarkNote(65, 1, 3);
      playDarkNote(55, 1.5, 3);
      const drum = ctx.createOscillator();
      const drumGain = ctx.createGain();
      drum.type = 'sine';
      drum.frequency.setValueAtTime(60, ctx.currentTime);
      drum.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1);
      drumGain.gain.setValueAtTime(0.3, ctx.currentTime);
      drumGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      drum.connect(drumGain).connect(ctx.destination);
      drum.start(ctx.currentTime);
      drum.stop(ctx.currentTime + 2);
    } else {
      // فوز المواطنين — نغمات مبهجة وهادئة
      const playBrightNote = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.05);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + start + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      const melody = [523, 659, 784, 1047, 784, 1047, 1319];
      melody.forEach((f, i) => playBrightNote(f, i * 0.25, 0.6));
      playBrightNote(262, 0, 2.5);
      playBrightNote(330, 0.5, 2);
      playBrightNote(392, 1, 2);
    }
  } catch (_) {}
}

export default function DisplayPage() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // UI State
  const [step, setStep] = useState<DisplayStep>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);

  // Game State
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState('');
  const [roomCode, setRoomCode] = useState('------');
  const [gameName, setGameName] = useState('');
  const [playerCount, setPlayerCount] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [phase, setPhase] = useState<Phase>(Phase.LOBBY);
  const [winner, setWinner] = useState<string | null>(null);
  const [animation, setAnimation] = useState<any>(null);
  const animTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [discussionState, setDiscussionState] = useState<any>(null);
  const [teamCounts, setTeamCounts] = useState<{citizenAlive: number; mafiaAlive: number}>({citizenAlive: 0, mafiaAlive: 0});
  const [replayData, setReplayData] = useState<any>(null);
  const [adminReveal, setAdminReveal] = useState<{physicalId: number; playerName: string; role: string} | null>(null);
  const adminRevealTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Socket Init ──
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // ── Socket Events (بعد الدخول للوبي) ──
  useEffect(() => {
    if (step !== 'lobby' || !currentRoomId) return;
    const socket = socketRef.current;
    if (!socket) return;

    // ── الانضمام لغرفة السوكت ──
    socket.emit('display:join-room', { roomId: currentRoomId });

    // ── دالة مساعدة: مزامنة الحالة من الكائن ──
    const syncStateFromData = (state: any) => {
      if (!state) return;
      if (state.players) {
        setPlayers(state.players.map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          isAlive: p.isAlive,
          gender: p.gender,
          role: state.phase === 'LOBBY' ? null : (p.role || null),
        })));
        setPlayerCount(state.players.filter((p: any) => p.isAlive !== false).length);
      }
      if (state.phase) setPhase(state.phase);
      if (state.teamCounts) setTeamCounts(state.teamCounts);
      if (state.winner) setWinner(state.winner);
    };

    // ══════════════════════════════════════════════════
    // 🔄 RECONNECT HANDLER — إعادة الانضمام عند قطع الاتصال
    // هذا الإصلاح الأهم: عند reconnect الـ socket يخرج من الغرفة
    // بدون هذا → شاشة العرض تتجمد نهائياً بعد أي قطع مؤقت
    // ══════════════════════════════════════════════════
    const onReconnect = () => {
      console.log('🔄 Display: Socket reconnected — re-joining room...');
      socket.emit('display:join-room', { roomId: currentRoomId }, (res: any) => {
        if (res?.state) {
          console.log('✅ Display: Re-synced state after reconnect');
          syncStateFromData(res.state);
        }
      });
    };
    socket.on('connect', onReconnect);

    // ══════════════════════════════════════════════════
    // 📡 STATE-SYNC — يستقبل الحالة الكاملة عند أي تغيير (renumber, etc.)
    // ══════════════════════════════════════════════════
    const onStateSync = (state: any) => {
      if (!state || !state.players) return;
      console.log('📡 Display: game:state-sync received');
      syncStateFromData(state);
    };
    socket.on('game:state-sync', onStateSync);

    // ══════════════════════════════════════════════════
    // الأحداث الأساسية
    // ══════════════════════════════════════════════════
    const onPlayerJoined = (data: any) => {
      setPlayerCount(data.totalPlayers);
      setPlayers(prev => {
        const existingIdx = prev.findIndex(p => p.physicalId === data.physicalId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            name: data.name || updated[existingIdx].name,
            gender: data.gender || updated[existingIdx].gender,
          };
          return updated;
        }
        return [...prev, {
          physicalId: data.physicalId,
          name: data.name,
          isAlive: true,
          gender: data.gender || 'MALE',
        }];
      });
    };

    const onPlayerKicked = (data: any) => {
      setPlayerCount(data.totalPlayers);
      setPlayers(prev => prev.filter(p => p.physicalId !== data.physicalId));
    };

    // ── تغيير المرحلة: يستخدم الحالة من الحدث أولاً + fallback لـ REST ──
    const onPhaseChanged = async (data: any) => {
      setPhase(data.phase);
      // تنظيف animations
      if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
      setAnimation(null);
      if (data.phase === Phase.LOBBY) {
        setWinner(null);
        setTeamCounts({ citizenAlive: 0, mafiaAlive: 0 });
      }

      // ✅ تحديث أعداد الفرق (يأتي مع الحدث مباشرة)
      if (data.teamCounts) setTeamCounts(data.teamCounts);

      // ✅ أولاً: استخدام الحالة المرفقة مع الحدث (أسرع + أوثق)
      if (data.state?.players) {
        syncStateFromData(data.state);
        return;
      }

      // ❌ Fallback: جلب من REST (فقط لو ما جاء state مع الحدث)
      try {
        const res = await fetch(`/api/game/state/${currentRoomId}`);
        const d = await res.json();
        if (d.success && d.state) {
          syncStateFromData(d.state);
        }
      } catch (err) {
        console.warn('⚠️ Display: Failed to fetch state after phase change:', err);
      }
    };

    const onNightAnimation = (data: any) => {
      if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
      setAnimation(data);
      animTimerRef.current = setTimeout(() => setAnimation(null), 5000);
    };

    const onGameOver = (data: any) => {
      setWinner(data.winner);
      setPhase(Phase.GAME_OVER);
      if (data.players) setPlayers(data.players);
      playWinSound(data.winner === 'MAFIA');
    };

    const onPlayerUpdated = (data: any) => {
      setPlayerCount(data.totalPlayers);
      if (data.physicalId && data.name) {
        const lookupId = data.oldPhysicalId || data.physicalId;
        setPlayers(prev => prev.map(p =>
          p.physicalId === lookupId
            ? { ...p, name: data.name, physicalId: data.physicalId }
            : p
        ));
      }
    };

    const onMorningEvent = (data: any) => {
      if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }
      setAnimation(data);
      animTimerRef.current = setTimeout(() => setAnimation(null), 10000);
    };

    const onNightStarted = () => {
      setAnimation(null);
    };

    const onConfigUpdated = (data: any) => {
      if (data.maxPlayers) setMaxPlayers(data.maxPlayers);
    };

    const onAdminEliminated = (data: any) => {
      setPlayers(prev => prev.map((p: any) =>
        p.physicalId === data.physicalId ? { ...p, isAlive: false } : p
      ));
      setPlayerCount(prev => Math.max(0, prev - 1));
      if (data.teamCounts) setTeamCounts(data.teamCounts);
    };

    // ── تسجيل كل الأحداث ──
    socket.on('room:player-joined', onPlayerJoined);
    socket.on('room:player-kicked', onPlayerKicked);
    socket.on('room:player-updated', onPlayerUpdated);
    socket.on('game:phase-changed', onPhaseChanged);
    socket.on('night:animation', onNightAnimation);
    socket.on('display:morning-event', onMorningEvent);
    socket.on('display:night-started', onNightStarted);
    socket.on('game:over', onGameOver);
    socket.on('room:config-updated', onConfigUpdated);
    socket.on('admin:player-eliminated', onAdminEliminated);
    socket.on('game:started', (data: any) => {
      setPhase(data.phase);
      if (data.teamCounts) setTeamCounts(data.teamCounts);
    });

    // إعادة عرض نتيجة لعبة سابقة
    const onReplayResult = (data: any) => { setReplayData(data); };
    const onReplayHidden = () => { setReplayData(null); };
    socket.on('display:replay-result', onReplayResult);
    socket.on('display:replay-hidden', onReplayHidden);

    // ── كشف دور اللاعب المُقصى إدارياً ──
    const onShowReveal = (data: any) => {
      if (adminRevealTimerRef.current) clearTimeout(adminRevealTimerRef.current);
      setAdminReveal(data);
      adminRevealTimerRef.current = setTimeout(() => setAdminReveal(null), 30000);
    };
    const onHideReveal = () => {
      if (adminRevealTimerRef.current) { clearTimeout(adminRevealTimerRef.current); adminRevealTimerRef.current = null; }
      setAdminReveal(null);
    };
    socket.on('admin:show-reveal', onShowReveal);
    socket.on('admin:hide-reveal', onHideReveal);

    // ── تنظيف ──
    return () => {
      socket.off('connect', onReconnect);
      socket.off('game:state-sync', onStateSync);
      socket.off('room:player-joined', onPlayerJoined);
      socket.off('room:player-kicked', onPlayerKicked);
      socket.off('room:player-updated', onPlayerUpdated);
      socket.off('game:phase-changed', onPhaseChanged);
      socket.off('night:animation', onNightAnimation);
      socket.off('display:morning-event', onMorningEvent);
      socket.off('display:night-started', onNightStarted);
      socket.off('game:over', onGameOver);
      socket.off('room:config-updated', onConfigUpdated);
      socket.off('admin:player-eliminated', onAdminEliminated);
      socket.off('game:started');
      socket.off('display:replay-result', onReplayResult);
      socket.off('display:replay-hidden', onReplayHidden);
      socket.off('admin:show-reveal', onShowReveal);
      socket.off('admin:hide-reveal', onHideReveal);
      if (adminRevealTimerRef.current) clearTimeout(adminRevealTimerRef.current);
    };
  }, [step, currentRoomId]);

  // ══════════════════════════════════════════════════
  // 🔐 الخطوة 1: إدخال PIN → جلب الألعاب عبر REST
  // ══════════════════════════════════════════════════
  const handlePinSubmit = async () => {
    if (pin.length < 4 || loading) return;
    setPinError('');
    setLoading(true);

    try {
      // جلب الألعاب عبر REST (موثوق عبر أي proxy)
      const res = await fetch('/api/game/active');
      if (!res.ok) {
        setPinError('خطأ في الاتصال بالسيرفر — الكود ' + res.status);
        return;
      }
      const data = await res.json();

      if (!data.success || !data.rooms || data.rooms.length === 0) {
        setPinError('رمز الدخول غير صحيح أو لا توجد ألعاب نشطة');
        return;
      }

      const rooms: ActiveGame[] = data.rooms;
      setActiveGames(rooms);

      if (rooms.length === 1) {
        // لعبة واحدة → تحقق من PIN مباشرة
        await verifyPinAndJoin(rooms[0].roomId);
      } else {
        // أكثر من لعبة → اعرض القائمة
        setStep('select-game');
      }
    } catch (err: any) {
      setPinError('خطأ في الاتصال بالسيرفر');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════
  // 🔓 التحقق من PIN والدخول عبر REST
  // ══════════════════════════════════════════════════
  const verifyPinAndJoin = async (roomId: string) => {
    setLoading(true);
    setPinError('');

    try {
      const res = await fetch('/api/game/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, pin }),
      });

      const data = await res.json();

      if (!data.success) {
        setPinError(data.error || 'الرقم السري غير صحيح');
        return;
      }

      // نجاح! → انتقل للوبي
      setCurrentRoomId(roomId);
      setGameName(data.gameName);
      setRoomCode(data.roomCode);
      setPlayerCount(data.playerCount || 0);
      setMaxPlayers(data.maxPlayers || 10);

      // استخراج حالة الغرفة
      if (data.state) {
        setPhase(data.state.phase || 'LOBBY');
        setDiscussionState(data.state.discussionState || null);
        // استعادة حالة الفوز عند الاتصال بلعبة منتهية
        if (data.state.winner) {
          setWinner(data.state.winner);
        }
        if (data.state.players) {
          setPlayers(data.state.players.map((p: any) => ({
            physicalId: p.physicalId,
            name: p.name,
            isAlive: p.isAlive,
            gender: p.gender,
            role: p.role,
          })));
        }
      }

      setStep('lobby');
    } catch (err: any) {
      setPinError('خطأ في الاتصال');
      console.error('Verify error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── QR URL ──
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${roomCode}`
    : '';

  // ══════════════════════════════════════════════════
  // 🖥️ واجهة العرض
  // ══════════════════════════════════════════════════
  return (
    <div className="display-bg min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-8 font-sans blood-vignette selection:bg-[#8A0303] selection:text-white w-full">
      
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">

        {/* ══════════════════════════════════════════════════ */}
        {/* 📊 ناف بار ثابت — أعداد الفرق (يظهر بعد بدء اللعبة) */}
        {/* ══════════════════════════════════════════════════ */}
        {step === 'lobby' && phase !== Phase.LOBBY && phase !== Phase.ROLE_GENERATION && phase !== Phase.ROLE_BINDING && (teamCounts.mafiaAlive > 0 || teamCounts.citizenAlive > 0) && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 py-3 border-b border-[#2a2a2a]/60"
            style={{ background: 'linear-gradient(180deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.85) 100%)', backdropFilter: 'blur(12px)' }}
          >
            {/* اللوجو — يسار */}
            <div className="flex items-center gap-3">
              <Image src="/mafia_logo.png" alt="Mafia" width={36} height={36} className="w-[32px] h-[32px] drop-shadow-[0_0_10px_rgba(138,3,3,0.3)]" priority />
              <div className="leading-none">
                <span className="block text-lg font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>MAFIA</span>
                <span className="flex justify-between w-full text-[7px] font-light text-[#8A0303] tracking-[0.15em]" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l, i) => <span key={i}>{l}</span>)}</span>
              </div>
            </div>

            {/* أعداد الفرق — وسط */}
            <div className="flex items-center gap-8">
              {/* المواطنون */}
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" />
                <div className="text-center">
                  <div className="text-2xl font-black text-blue-400 tabular-nums" style={{ fontFamily: 'Amiri, serif' }}>{teamCounts.citizenAlive}</div>
                  <div className="text-[8px] font-mono text-[#555] tracking-[0.2em] uppercase">CITIZENS</div>
                </div>
              </div>

              {/* الفاصل */}
              <div className="text-[#2a2a2a] text-2xl font-thin">⚔️</div>

              {/* المافيا */}
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-2xl font-black text-red-400 tabular-nums" style={{ fontFamily: 'Amiri, serif' }}>{teamCounts.mafiaAlive}</div>
                  <div className="text-[8px] font-mono text-[#555] tracking-[0.2em] uppercase">MAFIA</div>
                </div>
                <div className="w-3 h-3 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.6)] animate-pulse" />
              </div>
            </div>

            {/* المرحلة — يمين */}
            <div className="text-right">
              <div className="text-[9px] font-mono text-[#C5A059] tracking-[0.15em] uppercase">
                {phase === Phase.NIGHT ? '🌙 NIGHT' : phase === 'MORNING_RECAP' ? '☀️ MORNING' : phase.startsWith('DAY_') ? '☀️ DAY' : phase === Phase.GAME_OVER ? '🏁 GAME OVER' : ''}
              </div>
              <div className="text-[8px] font-mono text-[#333] tracking-widest">{gameName}</div>
            </div>
          </motion.div>
        )}

        {/* Spacer — يدفع المحتوى تحت الناف بار الثابت */}
        {step === 'lobby' && phase !== Phase.LOBBY && phase !== Phase.ROLE_GENERATION && phase !== Phase.ROLE_BINDING && (teamCounts.mafiaAlive > 0 || teamCounts.citizenAlive > 0) && (
          <div className="w-full h-16 shrink-0" />
        )}

        <AnimatePresence mode="wait">

          {/* ══════════════════════════════════════════ */}
          {/* شاشة إدخال PIN                           */}
          {/* ══════════════════════════════════════════ */}
          {step === 'pin' && (
            <motion.div
              key="pin-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-center relative z-10 noir-card p-16 w-full max-w-xl"
            >
              <div className="flex flex-col items-center justify-center gap-4 mb-10 w-full">
                {/* اللوجو */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 1, delay: 0.2 }}
                >
                  <Image
                    src="/mafia_logo.png"
                    alt="Mafia Club Logo"
                    width={100}
                    height={100}
                    className="select-none w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] drop-shadow-[0_0_20px_rgba(138,3,3,0.3)]"
                    priority
                  />
                </motion.div>
                
                {/* النصوص */}
                <h1 className="text-center">
                  <span
                    className="block text-5xl sm:text-6xl font-black tracking-tight text-[#C5A059] mb-1"
                    style={{
                      fontFamily: 'Amiri, serif',
                      textShadow: '0 0 30px rgba(138,3,3,0.4)',
                    }}
                  >
                    MAFIA
                  </span>
                  <span
                    dir="ltr"
                    className="flex justify-between text-2xl sm:text-3xl font-light text-[#8A0303] w-full"
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
              </div>

              <div className="mb-8 border-t border-[#2a2a2a]/40 pt-6">
                <h2 className="text-2xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>تصريح الدخول للعملية</h2>
                <p className="text-[#808080] text-xs font-mono tracking-widest uppercase">ENTER DISPLAY ACCESS CODE</p>
              </div>

            <form onSubmit={(e) => { e.preventDefault(); handlePinSubmit(); }} className="mb-8">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="****"
                className="w-full max-w-[300px] p-6 bg-[#050505] border border-[#2a2a2a] text-white text-center font-mono text-5xl tracking-[0.5em] focus:border-[#C5A059] focus:outline-none focus:ring-0 transition-all mx-auto block"
                maxLength={6}
                autoFocus
              />
              <p className="text-[#555] font-mono mt-4 uppercase text-xs tracking-[0.4em]">{pin.length} / 4+ DIGITS</p>
            </form>

            {pinError && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#8A0303]/10 border border-[#8A0303]/40 p-4 mb-6 max-w-sm mx-auto"
              >
                <p className="text-[#8A0303] font-bold font-mono text-sm uppercase tracking-widest">{pinError}</p>
              </motion.div>
            )}

            <button
              onClick={handlePinSubmit}
              disabled={pin.length < 4 || loading}
              className="btn-premium w-full max-w-[300px] mx-auto block"
            >
              <span>{loading ? 'VERIFYING...' : 'ACCESS'}</span>
            </button>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* اختيار اللعبة (أكثر من لعبة نشطة)       */}
        {/* ══════════════════════════════════════════ */}
        {step === 'select-game' && (
          <motion.div
            key="select-screen"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center w-full max-w-lg relative z-10"
          >
            <div className="text-6xl mb-4 grayscale">🎭</div>
            <h2 className="text-4xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>اختر اللعبة</h2>
            <p className="text-[#808080] mb-8 font-mono">{activeGames.length} ACTIVE GAMES</p>

            <div className="space-y-4">
              {activeGames.map((game) => (
                <motion.button
                  key={game.roomId}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => verifyPinAndJoin(game.roomId)}
                  disabled={loading}
                  className="noir-card p-6 w-full flex items-center justify-between hover:border-[#C5A059]/40 transition-all text-right disabled:opacity-50"
                >
                  <div>
                    <h3 className="text-2xl font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{game.gameName}</h3>
                    <p className="text-[#808080] text-sm mt-2 font-mono">
                      CODE: <span className="text-white">{game.roomCode}</span>
                      {' | '}
                      AGENTS: <span className="text-[#C5A059]">{game.playerCount}</span>/{game.maxPlayers}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>

            {pinError && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[#8A0303] font-mono mt-4">
                {pinError}
              </motion.p>
            )}

            <button
              onClick={() => { setStep('pin'); setPinError(''); }}
              className="text-[#555] mt-8 text-sm hover:text-white transition-colors font-mono tracking-widest uppercase"
            >
              [ Return ]
            </button>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* شاشة اللوبي                             */}
        {/* ══════════════════════════════════════════ */}
        {step === 'lobby' && phase === Phase.LOBBY && (
          <motion.div
            key="lobby-screen"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="w-full max-w-[1600px] relative z-10 flex flex-col items-center"
          >
            {/* القسم الأيمن (Top-Right): QR Code والإحصائيات */}
            <div className="flex flex-col flex-auto lg:flex-row w-full gap-8 items-start justify-between">
              <div className="flex flex-col items-center w-full lg:w-[350px] shrink-0">
                {/* اللوجو + MAFIA CLUB فوق كود اللعبة */}
                <div className="flex items-center gap-4 mb-8 w-full justify-center" style={{ transform: 'scale(1.5)', transformOrigin: 'center center' }}>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1 }}>
                    <Image src="/mafia_logo.png" alt="Mafia Club Logo" width={60} height={60} className="select-none w-[55px] h-[55px] drop-shadow-[0_0_20px_rgba(138,3,3,0.3)]" priority />
                  </motion.div>
                  <h1 className="flex flex-col items-start leading-none">
                    <span className="block text-3xl font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 20px rgba(138,3,3,0.4)' }}>MAFIA</span>
                    <span className="flex justify-between w-full text-sm font-light text-[#8A0303]" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l, i) => <span key={i}>{l}</span>)}</span>
                  </h1>
                </div>

                <div className="w-full text-center flex flex-col items-center">
                  <p className="text-[#808080] text-sm uppercase tracking-widest font-mono mb-2">OPERATION CODE</p>
                  <p className="text-5xl font-mono text-[#C5A059] tracking-[0.2em] mb-6">{roomCode}</p>
                </div>

                <div className="noir-card p-6 mb-8 border-[#8A0303]/30 relative w-full flex flex-col items-center justify-center">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#8A0303] animate-pulse" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#8A0303] animate-pulse" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#8A0303] animate-pulse" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#8A0303] animate-pulse" />
                  
                  <div className="bg-white p-3 grayscale contrast-125 mb-4 inline-block">
                    <QRDisplay url={joinUrl} />
                  </div>
                  <p className="text-[#808080] text-xs font-mono text-center tracking-widest uppercase">
                    SCAN TO ENTER
                  </p>
                </div>

                <div className="w-full text-center font-mono noir-card p-4 border-[#2a2a2a]">
                  <p className="text-[#555] text-xs mb-2 tracking-[0.3em] uppercase">AGENTS REGISTERED</p>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-5xl font-black text-[#C5A059]">{playerCount}</span>
                    <span className="text-2xl text-[#333]">/</span>
                    <span className="text-2xl text-[#555]">{maxPlayers}</span>
                  </div>
                </div>
              </div>

              {/* القسم الأيسر: شبكة اللاعبين المرنة باستخدام MafiaCard */}
              <div className="w-full flex-1">
                <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-2 mb-6">
                  <p className="text-[#555] text-sm tracking-[0.3em] uppercase">ACTIVE ROSTER</p>
                  <p className="text-[#808080] text-xs font-mono tracking-widest uppercase">{gameName}</p>
                </div>

                {players.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-6 w-full pb-12 overflow-visible">
                    <AnimatePresence mode="popLayout">
                      {players.filter((p: any) => p.isAlive !== false).slice().reverse().map((p: any, i: number) => (
                        <motion.div
                          key={p.physicalId}
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <MafiaCard
                            playerNumber={p.physicalId}
                            playerName={p.name}
                            role={null}
                            gender={p.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                            isFlipped={false}
                            flippable={false}
                            showVoting={false}
                            isAlive={p.isAlive !== false}
                            size={players.length <= 8 ? 'lg' : players.length <= 14 ? 'md' : 'sm'}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-16 noir-card border-dashed">
                    <p className="text-[#333] font-mono italic tracking-[0.2em] uppercase">AWAITING AGENT CONNECTIONS...</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════ */}
        {/* مرحلة توزيع الأدوار (ROLE_GENERATION)    */}
        {/* ══════════════════════════════════════════ */}
        {step === 'lobby' && (phase === Phase.ROLE_GENERATION || phase === Phase.ROLE_BINDING) && (
          <motion.div
            key="role-gen-screen"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-[1600px] relative z-10 flex flex-col items-center justify-center p-8 min-h-[80vh]"
          >



            {/* رسالة الانتظار — أعلى الكروت */}
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-center border-b border-[#2a2a2a]/40 pb-4 mb-4 w-full max-w-3xl"
            >
              <h2 className="text-3xl font-black text-[#C5A059] tracking-widest uppercase mb-2" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 15px rgba(197,160,89,0.3)' }}>في انتظار بدء اللعبة</h2>
              <p className="text-[#808080] font-mono tracking-[0.4em] text-sm uppercase">AWAITING OPERATION COMMENCEMENT...</p>
            </motion.div>

            {/* شبكة الكروت (لاعبين) - زيادة الحجم وعدم التمرير */}
            <div className="w-full pt-2">
               <div className="flex flex-wrap justify-center gap-8 w-full max-w-[1700px] mx-auto px-4 overflow-visible">
                 <AnimatePresence mode="popLayout">
                   {players.filter((p: any) => p.isAlive !== false).slice().reverse().map((p: any, i: number) => (
                      <motion.div
                        key={p.physicalId}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <MafiaCard
                          playerNumber={p.physicalId}
                          playerName={p.name}
                          role={null}
                          gender={p.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                          isFlipped={false}
                          flippable={false}
                          showVoting={false}
                          isAlive={p.isAlive !== false}
                          size={players.length <= 8 ? 'lg' : players.length <= 14 ? 'md' : 'sm'}
                        />
                      </motion.div>
                   ))}
                 </AnimatePresence>
               </div>
            </div>
          </motion.div>
        )}

        {/* ═══ النهار ═══ */}
        {step === 'lobby' && phase.startsWith('DAY_') && (
          <DisplayDayView key="day-view" roomId={currentRoomId} players={players} initialDiscussionState={discussionState} teamCounts={teamCounts} />
        )}

        {/* ═══ الليل ═══ */}
        {step === 'lobby' && phase === Phase.NIGHT && (
          <motion.div key="night" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center relative z-10 w-full">
            <motion.div className="text-9xl mb-8 grayscale opacity-50" animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity }}>🌑</motion.div>
            <h2 className="text-6xl font-black text-white mb-4 tracking-widest uppercase" style={{ fontFamily: 'Amiri, serif' }}>الظلام دامس</h2>
            <p className="text-[#808080] text-xl font-mono tracking-[0.3em]">OPERATION NIGHTFALL</p>
            <AnimatePresence>
              {animation && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="noir-card p-10 mt-12 max-w-lg mx-auto border-[#8A0303]/40">
                  <NightAnimCinematic data={animation} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══ ملخص الصباح ═══ */}
        {step === 'lobby' && phase === Phase.MORNING_RECAP && (
          <motion.div key="morning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center relative z-10 w-full">
            <motion.div 
              className="text-9xl mb-8 opacity-60" 
              animate={{ opacity: [0.4, 0.8, 0.4], rotate: [0, 5, -5, 0] }} 
              transition={{ duration: 5, repeat: Infinity }}
            >
              ☀️
            </motion.div>
            <h2 className="text-5xl font-black text-white mb-4 tracking-widest uppercase" style={{ fontFamily: 'Amiri, serif' }}>صباح جديد</h2>
            <p className="text-[#808080] text-lg font-mono tracking-[0.3em]">MORNING INTELLIGENCE REPORT</p>
            <AnimatePresence>
              {animation && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8, y: 30 }} 
                  animate={{ opacity: 1, scale: 1, y: 0 }} 
                  exit={{ opacity: 0, scale: 0.8, y: -30 }} 
                  transition={{ duration: 0.6 }}
                  className="noir-card p-10 mt-12 max-w-xl mx-auto border-[#C5A059]/30"
                >
                  <NightAnimCinematic data={animation} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══ نهاية اللعبة ═══ */}
        {phase === Phase.GAME_OVER && winner && (() => {
          // تصفية الفريق الفائز فقط
          const winningTeamPlayers = players.filter((p: any) => {
            const roleStr = p.role || null;
            if (!roleStr) return false;
            const playerIsMafia = isMafiaRole(roleStr as Role);
            return winner === 'MAFIA' ? playerIsMafia : !playerIsMafia;
          });
          // ترتيب: الأحياء أولاً ثم الأموات
          const sorted = [...winningTeamPlayers].sort((a, b) => (b.isAlive ? 1 : 0) - (a.isAlive ? 1 : 0));
          const isMafiaWin = winner === 'MAFIA';

          return (
            <motion.div key="gameover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} className="text-center relative z-10 w-full max-w-6xl">
              
              {/* ═══ أنيميشن Lottie خلفي — ملء الشاشة ═══ */}
              <div className="fixed inset-0 z-0 pointer-events-none flex items-center justify-center" style={{ mixBlendMode: 'screen' }}>
                {isMafiaWin ? (
                  <dotlottie-player
                    src="/animations/fireworks.lottie"
                    autoplay
                    loop
                    speed="0.8"
                    background="transparent"
                    style={{ width: '100%', height: '100%', opacity: 0.4 }}
                  />
                ) : (
                  <dotlottie-player
                    src="/animations/fireworks.lottie"
                    autoplay
                    loop
                    speed="1"
                    background="transparent"
                    style={{ width: '100%', height: '100%', opacity: 0.5 }}
                  />
                )}
              </div>

              <div className="relative overflow-hidden p-6 md:p-12">
                {/* توهج خلفي سينمائي */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: isMafiaWin
                      ? 'radial-gradient(ellipse at center, rgba(138,3,3,0.2) 0%, transparent 70%)'
                      : 'radial-gradient(ellipse at center, rgba(197,160,89,0.15) 0%, transparent 70%)',
                  }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />

                {/* أنيميشن منصة التتويج — Prize Podium */}
                <div className="flex justify-center mb-2 relative z-10" style={{ mixBlendMode: 'screen' }}>
                  <dotlottie-player
                    src="/animations/prize-podium.lottie"
                    autoplay
                    loop
                    background="transparent"
                    style={{ width: '220px', height: '220px' }}
                  />
                </div>

                {/* عنوان الفائز */}
                <motion.h1
                  className="text-4xl md:text-7xl font-black uppercase tracking-tighter mb-2 relative z-10"
                  style={{
                    fontFamily: 'Amiri, serif',
                    color: isMafiaWin ? '#8A0303' : '#C5A059',
                    textShadow: isMafiaWin
                      ? '0 0 60px rgba(138,3,3,0.6), 0 0 120px rgba(138,3,3,0.3)'
                      : '0 0 60px rgba(197,160,89,0.4), 0 0 120px rgba(197,160,89,0.2)',
                  }}
                  initial={{ opacity: 0, y: 30, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.5, duration: 1, type: 'spring', damping: 10 }}
                >
                  {isMafiaWin ? 'انتصار المافيا' : 'تطهير المدينة'}
                </motion.h1>
                <motion.p
                  className="text-[#808080] font-mono mb-8 tracking-[0.4em] uppercase text-sm relative z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  {isMafiaWin ? 'THE FAMILY PREVAILS' : 'JUSTICE HAS BEEN SERVED'}
                </motion.p>

                {/* شبكة كروت الفريق الفائز — الحي ملوّن والميت رمادي */}
                <div className="flex flex-wrap justify-center gap-4 md:gap-6 relative z-10">
                  {sorted.map((p: any, i: number) => (
                    <motion.div
                      key={p.physicalId}
                      initial={{ opacity: 0, y: 40, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 1.2 + (i * 0.15), duration: 0.5, type: 'spring', damping: 12 }}
                      style={p.isAlive ? {} : { filter: 'grayscale(100%) brightness(0.5)', opacity: 0.6 }}
                    >
                      <MafiaCard
                        playerNumber={p.physicalId}
                        playerName={p.name}
                        role={p.role}
                        isFlipped={true}
                        flippable={false}
                        isAlive={p.isAlive}
                        size="fluid"
                        className="w-40 h-[14rem] md:w-52 md:h-[18rem] lg:w-60 lg:h-[20rem]"
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* ═══ إعادة عرض نتيجة لعبة سابقة (Replay Overlay) ═══ */}
        {replayData && (() => {
          const isMafiaWin = replayData.winner === 'MAFIA';
          const replayPlayers = (replayData.players || []);
          // تصفية الفريق الفائز فقط — نفس منطق GAME_OVER
          const winningTeamPlayers = replayPlayers.filter((p: any) => {
            const roleStr = p.role || null;
            if (!roleStr) return false;
            const playerIsMafia = isMafiaRole(roleStr as Role);
            return isMafiaWin ? playerIsMafia : !playerIsMafia;
          });
          // فرز: الأحياء أولاً
          const sorted = [...winningTeamPlayers].sort((a: any, b: any) => (b.survivedToEnd ? 1 : 0) - (a.survivedToEnd ? 1 : 0));

          return (
            <motion.div
              key="replay-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-8"
            >
              {/* شريط علوي */}
              <div className="absolute top-4 left-0 right-0 flex items-center justify-center gap-3">
                <span className="text-[#555] font-mono text-xs uppercase tracking-[0.3em] bg-[#111] border border-[#2a2a2a] px-4 py-1.5 rounded">
                  📁 MATCH #{replayData.matchId} REPLAY
                </span>
              </div>

              {/* عنوان الفائز */}
              <motion.h1
                className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-2"
                style={{
                  fontFamily: 'Amiri, serif',
                  color: isMafiaWin ? '#8A0303' : '#C5A059',
                  textShadow: isMafiaWin
                    ? '0 0 40px rgba(138,3,3,0.5)'
                    : '0 0 40px rgba(197,160,89,0.4)',
                }}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {isMafiaWin ? 'انتصار المافيا' : 'تطهير المدينة'}
              </motion.h1>
              <motion.p
                className="text-[#808080] font-mono mb-8 tracking-[0.3em] uppercase text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {replayData.gameName || 'MATCH'} • {replayData.durationFormatted || '--:--'}
              </motion.p>

              {/* شبكة كروت اللاعبين */}
              <div className="flex flex-wrap justify-center gap-4 md:gap-6 max-w-6xl">
                {sorted.map((p: any, i: number) => (
                  <motion.div
                    key={p.physicalId}
                    initial={{ opacity: 0, y: 30, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.8 + (i * 0.1), duration: 0.4, type: 'spring', damping: 12 }}
                    style={p.survivedToEnd ? {} : { filter: 'grayscale(100%) brightness(0.5)', opacity: 0.6 }}
                  >
                    <MafiaCard
                      playerNumber={p.physicalId}
                      playerName={p.playerName}
                      role={p.role}
                      isFlipped={true}
                      flippable={false}
                      isAlive={p.survivedToEnd}
                      size="fluid"
                      className="w-32 h-[11rem] md:w-44 md:h-[15rem] lg:w-52 lg:h-[18rem]"
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })()}

      </AnimatePresence>

      {/* ═══ Overlay كشف دور اللاعب المُقصى إدارياً ═══ */}
      <AnimatePresence>
        {adminReveal && (
          <motion.div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* خلفية حمراء متوهجة */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(138,3,3,0.3)_0%,transparent_70%)]" />

            <motion.div
              initial={{ scale: 0, rotateY: 180 }}
              animate={{ scale: 1, rotateY: 0 }}
              transition={{ type: 'spring', duration: 1, bounce: 0.3 }}
              className="relative z-10 mb-8"
            >
              <MafiaCard
                playerNumber={adminReveal.physicalId}
                playerName={adminReveal.playerName}
                role={adminReveal.role}
                isFlipped={true}
                flippable={false}
                isAlive={false}
                size="fluid"
                className="w-52 h-[18rem] md:w-72 md:h-[24rem] lg:w-80 lg:h-[28rem]"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="relative z-10 text-center"
            >
              <h2 className="text-4xl md:text-6xl font-black text-[#8A0303] mb-3" style={{ fontFamily: 'Amiri, serif' }}>
                إقصاء إداري
              </h2>
              <p className="text-[#808080] text-sm md:text-base font-mono uppercase tracking-[0.3em]">
                ADMIN ELIMINATION — IDENTITY REVEALED
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎴 GameOverCard — كارد نهاية اللعبة مع أنيميشن تلقائي + صوت
// ══════════════════════════════════════════════════════
function GameOverCard({ player, role, isMafia, flipDelay, isAlive }: {
  player: any;
  role: string | null;
  isMafia: boolean;
  flipDelay: number;
  isAlive: boolean;
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFlipped(true);
      playCardFlipSound(role, isMafia);
    }, flipDelay * 1000);
    return () => clearTimeout(timer);
  }, [flipDelay, role, isMafia]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: flipDelay * 0.3, duration: 0.4 }}
    >
      <MafiaCard
        playerNumber={player.physicalId}
        playerName={player.name}
        role={role}
        isFlipped={flipped}
        flippable={false}
        isAlive={isAlive}
        size="fluid"
        className="w-40 h-[14rem] md:w-52 md:h-[18rem] lg:w-60 lg:h-[20rem]"
      />
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════
// 📱 QR Code (تحميل ديناميكي)
// ══════════════════════════════════════════════════════
function QRDisplay({ url }: { url: string }) {
  const [QRComponent, setQRComponent] = useState<any>(null);

  useEffect(() => {
    import('qrcode.react')
      .then(mod => setQRComponent(() => mod.QRCodeSVG || mod.default))
      .catch(() => console.warn('QR library not available'));
  }, []);

  if (!QRComponent || !url) {
    return <div className="w-[250px] h-[250px] bg-gray-100 rounded flex items-center justify-center text-gray-400">QR</div>;
  }

  return <QRComponent value={url} size={250} bgColor="#ffffff" fgColor="#000000" level="M" />;
}

