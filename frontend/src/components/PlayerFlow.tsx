'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import MafiaCard from './MafiaCard';
import { useGameState } from '@/hooks/useGameState';

type Step = 'code' | 'phone' | 'register' | 'number' | 'done' | 'rejoined';

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

export default function PlayerFlow({ initialRoomCode = '' }: PlayerFlowProps) {
  const { joinRoom, isConnected, error, loading, emit, on } = useGameState();
  const [step, setStep] = useState<Step>(initialRoomCode ? 'phone' : 'code');
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

  // ── توزيع الأدوار الرقمي ──
  const [assignedRole, setAssignedRole] = useState<string | null>(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [isPlayerDead, setIsPlayerDead] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(true);

  // ── محاولة إعادة الاتصال (rejoin) عند فتح الصفحة ──
  useEffect(() => {
    if (!isConnected || !emit) {
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

          if (!res.player.isAlive) {
            setIsPlayerDead(true);
            setCardFlipped(true); // ميت = كارد مفتوح
          }

          setStep('rejoined');
          console.log(`♻️ Rejoin success: #${res.player.physicalId} - ${res.player.name}`);
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
  }, [isConnected, emit]);

  // ── البحث التلقائي عن الغرفة عند وجود كود مسبق ──
  useEffect(() => {
    if (initialRoomCode && isConnected && !roomId) {
      handleFindRoom(initialRoomCode);
    }
  }, [initialRoomCode, isConnected]);

  // ── مزامنة خفية — الاستماع لبدء اللعبة + توزيع الأدوار ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !on) return;

    // استقبال الدور من الليدر (عند تأكيد الأدوار)
    const cleanupRole = on('player:role-assigned', (data: { role: string }) => {
      setAssignedRole(data.role);
      setCardFlipped(false); // يبدأ الكارد مقلوب (سري)
      // اهتزاز للتنبيه
      if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
    });

    const cleanup = on('game:started', () => {
      if (navigator.vibrate) navigator.vibrate(200);
    });

    return () => {
      cleanupRole();
      cleanup();
    };
  }, [step, on]);

  // ── Polling fallback — كل 5 ثواني إذا لم يصل الدور عبر WebSocket ──
  useEffect(() => {
    if ((step !== 'done' && step !== 'rejoined') || !emit) return;
    if (assignedRole) return; // لا حاجة للـ polling إذا وصل الدور
    if (!roomId || !physicalId) return;

    const interval = setInterval(async () => {
      try {
        const res = await emit('room:get-my-role', {
          roomId,
          physicalId: parseInt(physicalId),
        });
        if (res.role && res.confirmed) {
          setAssignedRole(res.role);
          setCardFlipped(false);
          if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
        }
      } catch { /* ignore polling errors */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [step, assignedRole, emit, roomId, physicalId]);


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
      if (!code) setStep('phone');
    } catch (err: any) {
      setApiError(err.message || 'لم يتم العثور على اللعبة');
    }
  };

  // ── الخطوة 2: البحث بالهاتف ──
  const handlePhoneLookup = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;
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
        // حفظ playerId للبروفايل
        if (data.player.playerId || data.player.id) localStorage.setItem('mafia_playerId', String(data.player.playerId || data.player.id));
        setStep('number');
      } else {
        setStep('register');
      }
    } catch (err) {
      setApiError('خطأ في الاتصال');
    }
  };

  // ── الخطوة 3: تسجيل لاعب جديد ──
  const handleRegister = async () => {
    setApiError('');
    const normalized = phone.startsWith('0') ? phone : '0' + phone;
    const dateOfBirth = dobYear && dobMonth && dobDay
      ? `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`
      : null;

    try {
      const res = await fetch('/api/player/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalized,
          displayName,
          dateOfBirth,
          gender: gender || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPlayerId(data.player.id);
        // حفظ playerId للبروفايل
        if (data.player.playerId || data.player.id) localStorage.setItem('mafia_playerId', String(data.player.playerId || data.player.id));
        setStep('number');
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
      await joinRoom(roomId, parseInt(physicalId), displayName, phone, playerId || undefined, genderUpper, dateOfBirth);

      // حفظ الجلسة في localStorage
      localStorage.setItem('mafia_session', JSON.stringify({
        roomId,
        physicalId: parseInt(physicalId),
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
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="------"
                className="w-full p-4 bg-black/40 border border-[#2a2a2a] rounded-lg text-white text-center font-mono text-4xl tracking-[0.4em] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] focus:outline-none transition-colors mb-6 placeholder-[#222]"
                maxLength={6}
                autoFocus
              />

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mb-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={() => handleFindRoom()}
                disabled={roomCode.length !== 6 || !isConnected}
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
              </div>

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mt-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <div className="mt-6">
                <button
                  onClick={handleRegister}
                  disabled={!displayName}
                  className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
                >
                  <span>SUBMIT DOSSIER</span>
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
                <p className="text-[#808080] text-[10px] font-mono uppercase tracking-[0.2em]">SELECT ASSIGNED SEAT</p>
              </div>

              {availableSeats.length === 0 ? (
                <div className="text-center p-6 bg-[#8A0303]/10 border border-[#8A0303]/30 rounded-lg mb-6">
                  <p className="text-[#ff4444] text-xs font-mono tracking-widest uppercase">ALL SEATS OCCUPIED</p>
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
                  <p className="text-[#C5A059] font-mono text-[10px] tracking-widest uppercase">
                    SEAT_{physicalId.padStart(2, '0')} CONFIRMED
                  </p>
                </motion.div>
              )}

              {apiError && <p className="text-[#8A0303] text-[10px] font-mono text-center mb-4 tracking-[0.1em] uppercase bg-[#8A0303]/10 p-2 rounded">{apiError}</p>}

              <button
                onClick={handleJoinGame}
                disabled={!physicalId || loading}
                className="btn-premium w-full !text-sm tracking-widest disabled:opacity-50 !rounded-lg"
              >
                <span>{loading ? 'INITIALIZING...' : 'LOCK POSITION'}</span>
              </button>
            </motion.div>
          )}

          {/* ── خطوة 5: تم ── */}
          {step === 'done' && (
           <motion.div key="done" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* ── زر الملف الشخصي ── */}
              <div className="flex justify-end mb-2">
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
              </div>

              {assignedRole === null ? (
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
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={null}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={false}
                      size="md"
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
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={assignedRole}
                      isFlipped={cardFlipped}
                      onFlip={() => setCardFlipped(prev => !prev)}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={true}
                      size="md"
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
                </motion.div>
              )}

            </motion.div>
          )}

          {/* ── خطوة Rejoin: اللاعب عاد ── */}
          {step === 'rejoined' && (
            <motion.div key="rejoined" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">

              {/* ── زر الملف الشخصي ── */}
              <div className="flex justify-end mb-2">
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
              </div>

              {isPlayerDead ? (
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
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={assignedRole}
                      isFlipped={true}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={false}
                      size="md"
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
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={assignedRole}
                      isFlipped={cardFlipped}
                      onFlip={() => setCardFlipped(prev => !prev)}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={true}
                      size="md"
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
                  <motion.div className="text-[#C5A059] flex justify-center mb-6"
                    animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }}>
                    <ShieldCheckIcon />
                  </motion.div>
                  <h2 className="text-3xl font-black mb-4 text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                    مرحباً بعودتك
                  </h2>
                  <div className="flex justify-center mb-8">
                    <MafiaCard
                      playerNumber={parseInt(physicalId)}
                      playerName={displayName}
                      role={null}
                      gender={gender === 'female' ? 'FEMALE' : 'MALE'}
                      showVoting={false}
                      flippable={false}
                      size="md"
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
    </div>
  );
}
