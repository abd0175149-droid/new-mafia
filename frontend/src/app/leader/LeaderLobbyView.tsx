'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MafiaCard from '@/components/MafiaCard';

interface LeaderLobbyViewProps {

  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (err: string) => void;
}

export default function LeaderLobbyView({ gameState, emit, setError }: LeaderLobbyViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [kickingId, setKickingId] = useState<number | null>(null);
  const [penalizingId, setPenalizingId] = useState<number | null>(null);
  const [penalizingLoading, setPenalizingLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  // ── حالات نموذج الإضافة (Multi-step) ──
  // step: phone → register → seat → submitting
  const [addStep, setAddStep] = useState<'phone' | 'register' | 'seat'>('phone');
  const [addPhone, setAddPhone] = useState('');
  const [addName, setAddName] = useState('');
  const [addDob, setAddDob] = useState('');
  const [addGender, setAddGender] = useState('MALE');
  const [addSeat, setAddSeat] = useState('');
  const [addPlayerId, setAddPlayerId] = useState<number | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [playerFound, setPlayerFound] = useState(false);

  // ── حالة تعديل اسم اللاعب ──
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Reset form
  const resetAddForm = () => {
    setAddStep('phone');
    setAddPhone('');
    setAddName('');
    setAddDob('');
    setAddGender('MALE');
    setAddSeat('');
    setAddPlayerId(null);
    setAddLoading(false);
    setPlayerFound(false);
    setLocalError('');
  };

  // ── الخطوة 1: البحث بالهاتف (مطابق لواجهة اللاعب) ──
  const handlePhoneLookup = async () => {
    if (!addPhone || addPhone.length < 9) {
      setLocalError('أدخل رقم هاتف صحيح (9 أرقام على الأقل)');
      return;
    }
    setLocalError('');
    setAddLoading(true);
    const normalized = addPhone.startsWith('0') ? addPhone : '0' + addPhone;
    console.log('[Leader] 🔍 Looking up phone:', normalized);
    try {
      const res = await fetch('/api/player/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      });

      if (!res.ok) {
        console.error('[Leader] ❌ Lookup HTTP error:', res.status);
        setLocalError(`خطأ HTTP: ${res.status}`);
        setAddLoading(false);
        return;
      }

      const data = await res.json();
      console.log('[Leader] 📦 Lookup response:', data);

      if (data.found && data.player) {
        // لاعب موجود → نسترجع بياناته
        console.log('[Leader] ✅ Player found:', data.player.displayName);
        setAddName(data.player.displayName || '');
        setAddPlayerId(data.player.playerId || data.player.id || null);
        setAddGender(data.player.gender || 'MALE');
        if (data.player.dateOfBirth) setAddDob(data.player.dateOfBirth);
        setPlayerFound(true);
        setAddStep('seat'); // يتخطى التسجيل
      } else {
        // لاعب جديد → يحتاج تسجيل
        console.log('[Leader] ℹ️ Player not found, going to register');
        if (data.dbError) {
          console.warn('[Leader] ⚠️ DB Error:', data.dbError);
          setLocalError(`⚠️ ${data.dbError} — اللاعب سيُسجل كجديد`);
        }
        setPlayerFound(false);
        setAddStep('register');
      }
    } catch (err: any) {
      console.error('[Leader] ❌ Lookup error:', err);
      setLocalError('خطأ في الاتصال: ' + (err.message || 'تحقق من الشبكة'));
    } finally {
      setAddLoading(false);
    }
  };

  // ── الخطوة 2: تسجيل لاعب جديد (مطابق لواجهة اللاعب) ──
  const handleRegister = async () => {
    if (!addName.trim()) {
      setLocalError('أدخل اسم اللاعب');
      return;
    }
    setLocalError('');
    setAddLoading(true);
    const normalized = addPhone.startsWith('0') ? addPhone : '0' + addPhone;
    try {
      const res = await fetch('/api/player/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalized,
          displayName: addName.trim(),
          dateOfBirth: addDob || null,
          gender: addGender || 'MALE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAddPlayerId(data.player.playerId || data.player.id);
        setAddStep('seat');
      } else {
        setLocalError(data.error || 'فشل التسجيل');
      }
    } catch {
      setLocalError('خطأ في الاتصال');
    } finally {
      setAddLoading(false);
    }
  };

  // ── الخطوة 3: إضافة للغرفة بمقعد محدد ──
  const handleSubmitSeat = async () => {
    if (!addSeat) {
      setLocalError('اختر رقم المقعد');
      return;
    }
    setLocalError('');
    setAddLoading(true);
    const normalized = addPhone.startsWith('0') ? addPhone : '0' + addPhone;
    try {
      const result = await fetch('/api/leader/force-add-player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('leader_token') || ''}`
        },
        body: JSON.stringify({
          roomId: gameState.roomId,
          physicalId: Number(addSeat),
          name: addName.trim(),
          phone: normalized,
          dob: addDob,
          gender: addGender,
          playerId: addPlayerId,
        }),
      });
      const response = await result.json();
      if (!result.ok || !response.success) {
        throw new Error(response.error || 'فشل إضافة اللاعب');
      }
      setShowAddForm(false);
      resetAddForm();
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleKick = async (physicalId: number) => {
    try {
      await emit('room:kick-player', { roomId: gameState.roomId, physicalId });
      setKickingId(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRecordPenalty = async (physicalId: number) => {
    setPenalizingLoading(true);
    try {
      await emit('leader:record-penalty', { roomId: gameState.roomId, targetPhysicalId: physicalId });
      setPenalizingId(null);
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل العقوبة');
    } finally {
      setPenalizingLoading(false);
    }
  };

  // ── تعديل اسم اللاعب ──
  const handleRename = async (physicalId: number) => {
    if (!editName.trim()) return;
    setEditLoading(true);
    try {
      await emit('room:override-player', {
        roomId: gameState.roomId,
        physicalId,
        name: editName.trim(),
        isNew: false,
      });
      setEditingId(null);
      setEditName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // المقاعد المتاحة
  const occupiedSeats = gameState.players.map((p: any) => p.physicalId);
  const availableSeats = Array.from({ length: gameState.config.maxPlayers }, (_, i) => i + 1)
    .filter(num => !occupiedSeats.includes(num));

  return (
    <div className="mb-12">
      {/* ── لوحة معلومات العنوان ── */}
      <div className="bg-black/40 border border-[#2a2a2a] rounded-xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent opacity-80" />
        
        <div className="flex-1">
          <h2 className="text-3xl font-black text-white mb-2" style={{ fontFamily: 'Amiri, serif' }}>
            {gameState.config.gameName || 'غرفة اللوبي'}
          </h2>
          <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono tracking-[0.2em] uppercase">
            <span className="bg-[#111] border border-[#2a2a2a] px-3 py-1.5 rounded text-[#808080]">
              OP_CODE: <span className="text-[#C5A059] font-bold text-xs ml-1">{gameState.roomCode}</span>
            </span>
            {gameState.config.displayPin && (
              <span className="bg-[#8A0303]/10 border border-[#8A0303]/30 px-3 py-1.5 rounded text-[#8A0303]">
                PIN: <span className="font-bold text-xs ml-1">{gameState.config.displayPin}</span>
              </span>
            )}
          </div>
        </div>

        {/* مؤشر المقاعد */}
        <div className="bg-[#050505] border border-[#2a2a2a] px-6 py-3 rounded-lg text-center min-w-[180px]">
          <p className="text-[#555] text-[10px] font-mono tracking-widest uppercase mb-1">AGENT ROSTER</p>
          <div className="flex items-center justify-center gap-3 font-mono text-2xl">
            <button
              onClick={async () => {
                const newMax = gameState.config.maxPlayers - 1;
                if (newMax < 6) return;
                try { await emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: newMax }); } catch (err: any) { setError(err.message); }
              }}
              disabled={gameState.config.maxPlayers <= 6}
              className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors rounded disabled:opacity-30 disabled:cursor-not-allowed text-lg"
            >−</button>
            <div>
              <span className="text-[#C5A059] font-black">{gameState.players.filter((p: any) => !p.seatHeld).length}</span>
              <span className="text-[#333] mx-1">/</span>
              <span className="text-[#666]">{gameState.config.maxPlayers}</span>
            </div>
            <button
              onClick={async () => {
                const newMax = gameState.config.maxPlayers + 1;
                if (newMax > 27) return;
                try { await emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: newMax }); } catch (err: any) { setError(err.message); }
              }}
              disabled={gameState.config.maxPlayers >= 27}
              className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors rounded disabled:opacity-30 disabled:cursor-not-allowed text-lg"
            >+</button>
          </div>
        </div>

        {/* زر الإضافة */}
        {gameState.players.length < gameState.config.maxPlayers && (
          <button
            onClick={() => { setShowAddForm(!showAddForm); if (showAddForm) resetAddForm(); }}
            className="btn-premium !py-3 !px-6 !text-xs tracking-widest uppercase !rounded-lg"
          >
            <span>{showAddForm ? 'CANCEL' : '+ ADD OFFLINE AGENT'}</span>
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* نموذج إضافة اللاعب — Multi-Step         */}
      {/* ══════════════════════════════════════════ */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            className="bg-black/50 border border-[#C5A059]/20 rounded-xl p-6 mb-8 backdrop-blur-md overflow-hidden relative"
          >
            <div className="absolute left-0 top-0 w-[2px] h-full bg-[#C5A059]/40" />

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {['phone', 'register', 'seat'].map((s, i) => {
                const stepLabels = ['الهاتف', 'التسجيل', 'المقعد'];
                const isActive = addStep === s;
                const isPassed = (['phone', 'register', 'seat'].indexOf(addStep) > i) || (s === 'register' && playerFound && addStep === 'seat');
                return (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className={`w-8 h-[1px] ${isPassed ? 'bg-[#C5A059]' : 'bg-zinc-800'}`} />}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest border transition-colors ${
                      isActive ? 'border-[#C5A059]/60 text-[#C5A059] bg-[#C5A059]/10' 
                      : isPassed ? 'border-emerald-600/40 text-emerald-500 bg-emerald-900/10' 
                      : 'border-zinc-800 text-zinc-600'
                    }`}>
                      {isPassed && !isActive ? '✓' : (i + 1)}
                      <span className="hidden sm:inline">{stepLabels[i]}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Step 1: الهاتف ── */}
            {addStep === 'phone' && (
              <div className="max-w-md mx-auto space-y-4">
                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">
                  PHONE NUMBER *
                </label>
                <input
                  type="tel"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePhoneLookup(); }}
                  placeholder="07XXXXXXXX"
                  autoFocus
                  dir="ltr"
                  className="w-full p-4 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono text-center text-lg tracking-widest focus:border-[#C5A059] focus:outline-none"
                />
                <button
                  onClick={handlePhoneLookup}
                  disabled={addLoading || addPhone.length < 9}
                  className="w-full bg-[#111] border border-[#C5A059]/40 text-[#C5A059] py-3 rounded-lg hover:bg-[#C5A059]/10 transition-colors font-mono uppercase text-[10px] tracking-widest font-bold disabled:opacity-40"
                >
                  {addLoading ? '...' : '🔍 SEARCH'}
                </button>
              </div>
            )}

            {/* ── Step 2: التسجيل (لاعب جديد) ── */}
            {addStep === 'register' && (
              <div className="max-w-lg mx-auto space-y-4">
                <div className="text-center mb-4">
                  <p className="text-zinc-500 text-[10px] font-mono tracking-widest uppercase">
                    لاعب جديد — أدخل البيانات
                  </p>
                  <p className="text-[#C5A059] text-xs font-mono mt-1" dir="ltr">{addPhone}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">CODENAME *</label>
                    <input
                      type="text"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRegister(); }}
                      autoFocus
                      dir="rtl"
                      className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">DATE OF BIRTH</label>
                    <input
                      type="date"
                      value={addDob}
                      onChange={(e) => setAddDob(e.target.value)}
                      className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">CLASSIFICATION</label>
                    <select
                      value={addGender}
                      onChange={(e) => setAddGender(e.target.value)}
                      className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none"
                    >
                      <option value="MALE">MALE ♂</option>
                      <option value="FEMALE">FEMALE ♀</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAddStep('phone')}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-400 py-3 rounded-lg hover:bg-zinc-800 transition-colors font-mono uppercase text-[10px] tracking-widest"
                  >
                    ← BACK
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={addLoading || !addName.trim()}
                    className="flex-[2] bg-[#111] border border-[#C5A059]/40 text-[#C5A059] py-3 rounded-lg hover:bg-[#C5A059]/10 transition-colors font-mono uppercase text-[10px] tracking-widest font-bold disabled:opacity-40"
                  >
                    {addLoading ? '...' : '✓ REGISTER & CONTINUE'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: اختيار المقعد ── */}
            {addStep === 'seat' && (
              <div className="max-w-lg mx-auto space-y-4">
                <div className="text-center mb-4">
                  <p className="text-white text-lg font-bold" style={{ fontFamily: 'Amiri, serif' }}>{addName}</p>
                  <p className="text-[#C5A059] text-xs font-mono mt-1" dir="ltr">{addPhone}</p>
                  {playerFound && (
                    <p className="text-emerald-500 text-[9px] font-mono mt-1 uppercase tracking-widest">✓ KNOWN AGENT</p>
                  )}
                </div>

                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-2">
                  SELECT SEAT *
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                  {availableSeats.map(num => (
                    <button
                      key={num}
                      onClick={() => setAddSeat(String(num))}
                      className={`h-12 rounded-lg font-mono font-bold text-lg transition-all border ${
                        addSeat === String(num)
                          ? 'bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059] shadow-[0_0_10px_rgba(197,160,89,0.2)]'
                          : 'bg-[#0c0c0c] border-[#2a2a2a] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                {availableSeats.length === 0 && (
                  <p className="text-red-400 text-center text-xs font-mono">لا توجد مقاعد متاحة</p>
                )}

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setAddStep(playerFound ? 'phone' : 'register')}
                    className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-400 py-3 rounded-lg hover:bg-zinc-800 transition-colors font-mono uppercase text-[10px] tracking-widest"
                  >
                    ← BACK
                  </button>
                  <button
                    onClick={handleSubmitSeat}
                    disabled={addLoading || !addSeat}
                    className="flex-[2] bg-[#111] border border-[#C5A059]/40 text-[#C5A059] py-3 rounded-lg hover:bg-[#C5A059]/10 transition-colors font-mono uppercase text-[10px] tracking-widest font-bold disabled:opacity-40"
                  >
                    {addLoading ? '...' : `➕ ADD TO SEAT #${addSeat || '?'}`}
                  </button>
                </div>
              </div>
            )}

            {localError && <p className="text-[#8A0303] text-[10px] font-mono tracking-widest text-center mt-4 uppercase bg-[#8A0303]/10 p-2 rounded">{localError}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── شبكة اللاعبين ── */}
      {gameState.players.length === 0 ? (
        <div className="bg-black/30 border border-[#2a2a2a] rounded-xl p-16 text-center backdrop-blur-sm">
          <p className="text-[#808080] text-sm font-mono tracking-[0.2em] uppercase">AWAITING AGENT CONNECTIONS...</p>
          <div className="mt-6 inline-block bg-[#050505] border border-[#C5A059]/30 px-6 py-3 rounded-lg">
            <p className="text-[#555] text-xs font-mono tracking-widest uppercase mb-1">DISTRIBUTE OP_CODE</p>
            <p className="text-[#C5A059] font-mono text-3xl font-black tracking-[0.4em]">{gameState.roomCode}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(176px,1fr))] gap-6 justify-items-center">
          {gameState.players.filter((p: any) => !p.seatHeld).map((player: any, i: number) => {
            const isKicking = kickingId === player.physicalId;
            const isEditing = editingId === player.physicalId;

            return (
              <motion.div
                key={player.physicalId}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative group cursor-pointer"
              >
                <MafiaCard
                  playerNumber={player.physicalId}
                  playerName={player.name}
                  role={null}
                  gender={player.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                  avatarUrl={player.avatarUrl || null}
                  showVoting={false}
                  flippable={false}
                  size="sm"
                />

                {/* مؤشر العقوبات (نقاط حمراء ورمادية) */}
                {player.penalties > 0 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 border border-amber-500/40 px-2 py-0.5 rounded-full flex gap-1 z-10">
                    {Array.from({ length: gameState.config.maxPenalties || 3 }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full ${
                          idx < (player.penalties || 0) ? 'bg-red-500 animate-pulse shadow-[0_0_4px_#ef4444]' : 'bg-zinc-600'
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* زر الحذف يظهر فقط عند التمرير Hover */}
                {!isKicking && !isEditing && (
                  <button
                    onClick={() => setKickingId(player.physicalId)}
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-900 border border-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-800 hover:scale-110 z-20 shadow-lg"
                    title="طرد اللاعب"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                )}

                {/* ✏️ زر تعديل الاسم — يظهر عند Hover */}
                {!isKicking && !isEditing && (
                  <button
                    onClick={() => { setEditingId(player.physicalId); setEditName(player.name); }}
                    className="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#C5A059]/50 text-[#C5A059] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#C5A059]/20 hover:scale-110 z-20 shadow-lg"
                    title="تعديل الاسم"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                )}

                {/* ⚠️ زر تسجيل عقوبة — يظهر عند Hover */}
                {!isKicking && !isEditing && (
                  <button
                    onClick={() => setPenalizingId(player.physicalId)}
                    className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full bg-[#201505] border border-amber-500/60 text-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-950 hover:scale-110 z-20 shadow-lg"
                    title="تسجيل عقوبة"
                  >
                    ⚠️
                  </button>
                )}

                {/* تأكيد الحذف (Overlay زجاجي فوق الكارد) */}
                <AnimatePresence>
                  {isKicking && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-2xl border-2 border-red-500/50 flex flex-col items-center justify-center p-4 z-30"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span className="text-red-400 text-[10px] font-mono uppercase tracking-widest mb-3 font-bold text-center leading-tight">
                        CONFIRM KICK
                        <br/>AGENT_{player.physicalId}
                      </span>
                      <div className="flex gap-2 w-full">
                        <button onClick={() => handleKick(player.physicalId)} className="flex-1 bg-red-900/50 border border-red-500 text-red-200 py-1.5 rounded text-[10px] font-mono hover:bg-red-800">YES</button>
                        <button onClick={() => setKickingId(null)} className="flex-1 bg-zinc-800 border border-zinc-600 text-zinc-300 py-1.5 rounded text-[10px] font-mono hover:bg-zinc-700">NO</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ✏️ Overlay تعديل الاسم (فوق الكارد) */}
                <AnimatePresence>
                  {isEditing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-2xl border-2 border-[#C5A059]/50 flex flex-col items-center justify-center p-4 z-30"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-70"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      <span className="text-[#C5A059] text-[9px] font-mono uppercase tracking-widest mb-2 font-bold">
                        EDIT NAME
                      </span>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(player.physicalId); if (e.key === 'Escape') { setEditingId(null); setEditName(''); } }}
                        autoFocus
                        className="w-full p-2 bg-[#0c0c0c] border border-[#C5A059]/30 rounded text-white text-center text-sm font-mono focus:border-[#C5A059] focus:outline-none mb-3"
                        dir="rtl"
                      />
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={() => handleRename(player.physicalId)}
                          disabled={editLoading || !editName.trim()}
                          className="flex-1 bg-[#C5A059]/20 border border-[#C5A059] text-[#C5A059] py-1.5 rounded text-[10px] font-mono hover:bg-[#C5A059]/30 disabled:opacity-40"
                        >
                          {editLoading ? '...' : '✓ SAVE'}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditName(''); }}
                          className="flex-1 bg-zinc-800 border border-zinc-600 text-zinc-300 py-1.5 rounded text-[10px] font-mono hover:bg-zinc-700"
                        >
                          ✕
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ⚠️ Overlay تأكيد تسجيل عقوبة (فوق الكارد) */}
                <AnimatePresence>
                  {penalizingId === player.physicalId && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/90 backdrop-blur-sm rounded-2xl border-2 border-amber-500/50 flex flex-col items-center justify-center p-4 z-30"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 animate-bounce"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span className="text-amber-400 text-[10px] font-mono uppercase tracking-widest mb-1 font-bold text-center leading-tight">
                        RECORD PENALTY
                        <br/>AGENT_{player.physicalId}
                      </span>
                      <p className="text-[9px] text-[#808080] text-center mb-3">
                        سيتم خصم رتبة وتوجيه إنذار
                        <br/>
                        ({player.penalties || 0} / {gameState.config.maxPenalties || 3})
                      </p>
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={() => handleRecordPenalty(player.physicalId)}
                          disabled={penalizingLoading}
                          className="flex-1 bg-amber-900/50 border border-amber-500 text-amber-200 py-1.5 rounded text-[10px] font-mono hover:bg-amber-800 disabled:opacity-50"
                        >
                          {penalizingLoading ? '...' : 'YES'}
                        </button>
                        <button
                          onClick={() => setPenalizingId(null)}
                          className="flex-1 bg-zinc-800 border border-zinc-600 text-zinc-300 py-1.5 rounded text-[10px] font-mono hover:bg-zinc-700"
                        >
                          NO
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ═══ المقاعد المحجوزة (Held Seats) ═══ */}
      {(() => {
        const heldPlayers = gameState.players.filter((p: any) => p.seatHeld === true);
        if (heldPlayers.length === 0) return null;

        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 bg-black/40 border border-amber-500/20 rounded-xl p-5 backdrop-blur-md relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-lg">🔒</span>
                <h3 className="text-white text-sm font-bold" style={{ fontFamily: 'Amiri, serif' }}>
                  مقاعد محجوزة ({heldPlayers.length})
                </h3>
              </div>
              <span className="text-[#808080] text-[9px] font-mono tracking-widest uppercase">
                HELD FOR 10 MIN
              </span>
            </div>

            <div className="space-y-3">
              {heldPlayers.map((player: any) => {
                const remainingMs = (player.heldUntil || 0) - Date.now();
                const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));

                return (
                  <div
                    key={player.physicalId}
                    className="flex items-center justify-between bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono font-bold text-amber-400 text-lg">
                        {player.physicalId}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{player.name}</p>
                        <p className="text-[#808080] text-[10px] font-mono">
                          {player.phone || 'بدون رقم'} • متبقي ~{remainingMin} دقيقة
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await emit('room:release-held-seat', {
                            roomId: gameState.roomId,
                            physicalId: player.physicalId,
                          });
                        } catch (err: any) {
                          setError(err.message);
                        }
                      }}
                      className="px-4 py-2 bg-red-900/30 border border-red-500/40 text-red-400 rounded-lg text-[10px] font-mono uppercase tracking-widest hover:bg-red-900/50 transition-colors"
                    >
                      🔓 فك الحجز
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })()}

      {/* ── إعدادات اللعبة (تظهر دائمًا) ── */}
      <div className="flex flex-col items-center justify-center gap-6 mt-12 mb-8">
        {/* Night Mode Toggle */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">NIGHT PHASE MODE</span>
          <div className="flex flex-col gap-3">
            <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 w-64 mx-auto">
              <button
                onClick={async () => {
                  await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'manual' });
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
                  await emit('game:set-night-mode', { roomId: gameState.roomId, mode: 'auto', autoTimeSeconds: 15 });
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
        <div className="flex flex-col items-center gap-2">
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
                    await emit('game:set-timer', { 
                      roomId: gameState.roomId, 
                      enabled: opt.value > 0,
                      minutes: opt.value || 30,
                    });
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

        {/* ⚖️ Penalty Settings */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">⚖️ PENALTY SYSTEM</span>
          
          {/* Max Penalties */}
          <div className="flex items-center gap-3 bg-[#050505] rounded-xl border border-[#2a2a2a] p-2 px-4">
            <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">MAX</span>
            <button
              onClick={async () => {
                const newVal = Math.max(1, (gameState.config.maxPenalties || 3) - 1);
                await emit('room:update-penalty-settings', { roomId: gameState.roomId, maxPenalties: newVal });
              }}
              className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors rounded font-mono text-lg"
            >−</button>
            <span className="text-xl font-mono text-[#C5A059] w-8 text-center font-bold">{gameState.config.maxPenalties || 3}</span>
            <button
              onClick={async () => {
                const newVal = Math.min(10, (gameState.config.maxPenalties || 3) + 1);
                await emit('room:update-penalty-settings', { roomId: gameState.roomId, maxPenalties: newVal });
              }}
              className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors rounded font-mono text-lg"
            >+</button>
          </div>

          {/* Penalty Scope Toggle */}
          <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 w-64 mx-auto">
            <button
              onClick={async () => {
                await emit('room:update-penalty-settings', { roomId: gameState.roomId, penaltyScope: 'room' });
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                (gameState.config as any).penaltyScope !== 'game'
                  ? 'bg-[#1a1a1a] text-[#C5A059] shadow-md border border-[#C5A059]/40'
                  : 'text-[#666] hover:text-[#aaa]'
              }`}
            >
              كامل الغرفة
            </button>
            <button
              onClick={async () => {
                await emit('room:update-penalty-settings', { roomId: gameState.roomId, penaltyScope: 'game' });
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                (gameState.config as any).penaltyScope === 'game'
                  ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                  : 'text-[#666] hover:text-[#aaa]'
              }`}
            >
              كل لعبة
            </button>
          </div>
          <p className="text-[#555] text-[9px] font-mono text-center max-w-xs">
            {(gameState.config as any).penaltyScope === 'game' 
              ? 'العقوبات تُصفّر تلقائياً عند بدء لعبة جديدة'
              : 'العقوبات تستمر طوال جلسة الغرفة (مع خيار التصفير)'}
          </p>
        </div>

        {/* 🪑 Seating Constraints */}
        <SeatingConstraintsSection gameState={gameState} emit={emit} setError={setError} />

        {/* 💣 Bomb Ability Toggle */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">💣 GODFATHER BOMB</span>
          <div className="flex bg-[#050505] rounded-xl border border-[#2a2a2a] p-1.5 w-56 mx-auto">
            <button
              onClick={async () => {
                await emit('room:update-bomb-setting', { roomId: gameState.roomId, bombEnabled: true });
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                (gameState.config as any).bombEnabled !== false
                  ? 'bg-[#1a1a1a] text-[#ff4444] shadow-md border border-[#8A0303]/40'
                  : 'text-[#666] hover:text-[#aaa]'
              }`}
            >
              مفعلة
            </button>
            <button
              onClick={async () => {
                await emit('room:update-bomb-setting', { roomId: gameState.roomId, bombEnabled: false });
              }}
              className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-mono uppercase tracking-[0.15em] transition-all ${
                (gameState.config as any).bombEnabled === false
                  ? 'bg-[#1a1a1a] text-white shadow-md border border-[#333]'
                  : 'text-[#666] hover:text-[#aaa]'
              }`}
            >
              معطلة
            </button>
          </div>
          <p className="text-[#555] text-[9px] font-mono text-center max-w-xs">
            عند إقصاء شيخ المافيا بالتصويت يأخذ معه لاعبين مجاورين
          </p>
        </div>
      </div>

      {/* ── زر الإطلاق (يظهر عند اكتمال الغرفة) ── */}
      {gameState.players.length === gameState.config.maxPlayers && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-4 mb-8">
          <button
            onClick={async () => {
              try {
                await emit('room:start-generation', { roomId: gameState.roomId });
              } catch (err: any) {
                setError(err.message);
              }
            }}
            className="btn-premium px-16 py-6 !text-lg !border-[#C5A059]/50 animate-pulse relative group"
          >
            <div className="absolute inset-0 bg-[#C5A059]/10 rounded-xl blur-xl group-hover:bg-[#C5A059]/20 transition-all opacity-50" />
            <span className="relative z-10">START ROLE GENERATION</span>
          </button>
        </motion.div>
      )}
    </div>
  );
}
