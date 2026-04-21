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
  const [addForm, setAddForm] = useState({ name: '', physicalId: '', phone: '', dob: '', gender: 'MALE' });
  const [kickingId, setKickingId] = useState<number | null>(null);
  const [localError, setLocalError] = useState('');

  // ── حالة تعديل اسم اللاعب ──
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const handleForceAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Frontend] handleForceAdd: 🔘 Clicked submit button. Data:', addForm);
    
    if (!addForm.physicalId || !addForm.name) {
      console.log('[Frontend] handleForceAdd: ❌ Validation failed. Empty physicalId or name.');
      setLocalError("الرجاء إدخال المعرف واسم اللاعب بالكامل!");
      return;
    }
    
    setLocalError('');
    try {
      const result = await fetch('/api/leader/force-add-player', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('leader_token') || ''}`
        },
        body: JSON.stringify({
          roomId: gameState.roomId,
          physicalId: Number(addForm.physicalId),
          name: addForm.name,
          phone: addForm.phone || '0700000000',
          dob: addForm.dob,
          gender: addForm.gender,
        })
      });

      const response = await result.json();

      if (!result.ok || !response.success) {
        throw new Error(response.error || 'فشل تحديث أو إضافة اللاعب');
      }

      console.log('[Frontend] handleForceAdd: ✅ Backend returned success', response);
      setShowAddForm(false);
      setAddForm({ name: '', physicalId: '', phone: '', dob: '', gender: 'MALE' });
    } catch (err: any) {
      console.error('[Frontend] handleForceAdd: ❌ Backend returned error:', err);
      setLocalError(err.message);
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

  return (
    <div className="mb-12">
      {/* ── لوحة معلومات العنوان (Dashboard Header) ── */}
      <div className="bg-black/40 border border-[#2a2a2a] rounded-xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden backdrop-blur-md">
        {/* شريط زينة علوي */}
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent opacity-80" />
        
        {/* معلومات الغرفة */}
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

        {/* مؤشر المقاعد مع أزرار +/- */}
        <div className="bg-[#050505] border border-[#2a2a2a] px-6 py-3 rounded-lg text-center min-w-[180px]">
          <p className="text-[#555] text-[10px] font-mono tracking-widest uppercase mb-1">AGENT ROSTER</p>
          <div className="flex items-center justify-center gap-3 font-mono text-2xl">
            <button
              onClick={async () => {
                const newMax = gameState.config.maxPlayers - 1;
                if (newMax < 6) return;
                try {
                  await emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: newMax });
                } catch (err: any) { setError(err.message); }
              }}
              disabled={gameState.config.maxPlayers <= 6}
              className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors rounded disabled:opacity-30 disabled:cursor-not-allowed text-lg"
            >−</button>
            <div>
              <span className="text-[#C5A059] font-black">{gameState.players.length}</span>
              <span className="text-[#333] mx-1">/</span>
              <span className="text-[#666]">{gameState.config.maxPlayers}</span>
            </div>
            <button
              onClick={async () => {
                const newMax = gameState.config.maxPlayers + 1;
                if (newMax > 27) return;
                try {
                  await emit('room:update-max-players', { roomId: gameState.roomId, maxPlayers: newMax });
                } catch (err: any) { setError(err.message); }
              }}
              disabled={gameState.config.maxPlayers >= 27}
              className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#2a2a2a] text-[#808080] hover:text-white hover:border-[#555] transition-colors rounded disabled:opacity-30 disabled:cursor-not-allowed text-lg"
            >+</button>
          </div>
        </div>

        {/* زر الإضافة */}
        {gameState.players.length < gameState.config.maxPlayers && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-premium !py-3 !px-6 !text-xs tracking-widest uppercase !rounded-lg"
          >
            <span>{showAddForm ? 'CANCEL' : '+ ADD OFFLINE AGENT'}</span>
          </button>
        )}
      </div>

      {/* ── نموذج إضافة اللاعب ── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            onSubmit={handleForceAdd}
            className="bg-black/50 border border-[#C5A059]/20 rounded-xl p-6 mb-8 backdrop-blur-md overflow-hidden relative"
          >
            <div className="absolute left-0 top-0 w-[2px] h-full bg-[#C5A059]/40" />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-5">
              <div>
                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">Seat ID (*)</label>
                <input type="number" value={addForm.physicalId} onChange={(e) => setAddForm({...addForm, physicalId: e.target.value})} className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">Codename (*)</label>
                <input type="text" value={addForm.name} onChange={(e) => setAddForm({...addForm, name: e.target.value})} className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">Phone Number</label>
                <input type="text" value={addForm.phone} onChange={(e) => setAddForm({...addForm, phone: e.target.value})} placeholder="07XXXXX" className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">Date of Birth</label>
                <input type="date" value={addForm.dob} onChange={(e) => setAddForm({...addForm, dob: e.target.value})} className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none" style={{ colorScheme: 'dark' }} />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-[#808080] tracking-[0.2em] uppercase mb-1.5">Classification</label>
                <select value={addForm.gender} onChange={(e) => setAddForm({...addForm, gender: e.target.value})} className="w-full p-3 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg text-white font-mono focus:border-[#C5A059] focus:outline-none">
                  <option value="MALE">MALE ♂</option>
                  <option value="FEMALE">FEMALE ♀</option>
                </select>
              </div>
            </div>
            
            {localError && <p className="text-[#8A0303] text-[10px] font-mono tracking-widest text-center mb-4 uppercase bg-[#8A0303]/10 p-2 rounded">{localError}</p>}
            
            <button type="submit" className="w-full bg-[#111] border border-[#C5A059]/40 text-[#C5A059] py-3 rounded-lg hover:bg-[#C5A059]/10 transition-colors font-mono uppercase text-[10px] tracking-widest font-bold">
              SUBMIT OFFLINE DOSSIER
            </button>
          </motion.form>
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
          {gameState.players.map((player: any, i: number) => {
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
                  showVoting={false}
                  flippable={false}
                  size="sm"
                />

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
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── زر الإطلاق (يظهر عند اكتمال الغرفة) ── */}
      {gameState.players.length === gameState.config.maxPlayers && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mt-16">
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
