'use client';

// ══════════════════════════════════════════════════════
// 🌐 صفحة المُضيف — إنشاء غرفة لعبٍ عن بُعد وإدارتها من داخل تطبيق اللاعب.
// تعيد استخدام مكوّنات الليدر ({gameState, emit, setError}) دون لمس صفحة الموظّفين.
// المُضيف مُوجِّهٌ لا لاعب. الوحدة 6a: إنشاء + لوبي + تهيئة الأدوار. النهار/الليل = 6b.
// ══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { usePlayer } from '@/context/PlayerContext';
import LeaderLobbyView from '@/app/leader/LeaderLobbyView';
import LeaderRoleConfigurator from '@/app/leader/LeaderRoleConfigurator';
import LeaderRoleBinding from '@/app/leader/LeaderRoleBinding';

export default function HostPage() {
  const { player } = usePlayer();
  const { isConnected, emit, on } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [gameName, setGameName] = useState('غرفة عن بُعد');
  const [maxPlayers, setMaxPlayers] = useState(12);
  // ── إعدادات الغرفة (تُضبط قبل الإنشاء بدل اللوبي) ──
  const [autoNightTime, setAutoNightTime] = useState(15);          // ثوانٍ لكل خطوة ليل
  const [gameTimerMinutes, setGameTimerMinutes] = useState(0);     // 0 = مطفأ
  const [maxPenalties, setMaxPenalties] = useState(3);
  const [penaltyScope, setPenaltyScope] = useState<'room' | 'game'>('room');
  const [bombEnabled, setBombEnabled] = useState(true);
  const [maxJustifications, setMaxJustifications] = useState(2);
  const roomIdRef = useRef<string | null>(null);

  const refreshState = useCallback(async (roomId: string) => {
    try {
      const res = await emit('game:get-state', { roomId });
      if (res?.state) setGameState(res.state);
    } catch { /* تجاهل — سيصل عبر البث */ }
  }, [emit]);

  const handleCreate = useCallback(async () => {
    setCreating(true); setError('');
    try {
      const res = await emit('room:create-remote', {
        gameName: gameName.trim() || 'غرفة عن بُعد',
        maxPlayers,
        maxJustifications,
        maxPenalties,
        penaltyScope,
        autoNightTime,
        gameTimerMinutes,
        bombEnabled,
      });
      roomIdRef.current = res.roomId;
      try { localStorage.setItem('mafia_host_room', res.roomId); } catch { /* ignore */ }
      await refreshState(res.roomId);
    } catch (e: any) {
      setError(e?.message || 'تعذّر إنشاء الغرفة');
    } finally {
      setCreating(false);
    }
  }, [emit, gameName, maxPlayers, refreshState]);

  // ── استئناف غرفة المُضيف بعد إعادة تحميل الصفحة ──
  useEffect(() => {
    try { const saved = localStorage.getItem('mafia_host_room'); if (saved) roomIdRef.current = saved; } catch { /* ignore */ }
  }, []);

  // ── الاستماع للحالة الحيّة ──
  useEffect(() => {
    const offs: Array<() => void> = [];
    offs.push(on('game:state-sync', (s: any) => { if (s?.roomId && s.roomId === roomIdRef.current) setGameState(s); }));
    offs.push(on('game:state-updated', (s: any) => { if (s?.roomId && s.roomId === roomIdRef.current) setGameState(s); }));
    offs.push(on('game:phase-changed', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('game:started', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    // 🔧 الخادم يبثّ هذه عند تغيّر الروستر (لا حالةً كاملة) — نجلب الحالة الكاملة عندها
    offs.push(on('room:player-joined', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('room:player-updated', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('room:player-kicked', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('player:seat-changed', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    return () => { offs.forEach((f) => f && f()); };
  }, [on, refreshState]);

  // ── إعادة منح صلاحيّة المُضيف عند (إعادة) الاتصال ──
  useEffect(() => {
    if (isConnected && roomIdRef.current) {
      emit('room:rejoin-host', { roomId: roomIdRef.current })
        .then(() => refreshState(roomIdRef.current!))
        .catch(() => { roomIdRef.current = null; try { localStorage.removeItem('mafia_host_room'); } catch { /* ignore */ } });
    }
  }, [isConnected, emit, refreshState]);

  const joinLink = gameState ? `${typeof window !== 'undefined' ? window.location.origin : ''}/player/join?code=${gameState.roomCode}` : '';

  // ── شاشة الإنشاء ──
  if (!gameState) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#050505] text-white p-5">
        <div className="max-w-md mx-auto">
          <div className="text-xs font-mono text-[#C5A059] tracking-[0.2em] uppercase mb-1">Remote Play · Host</div>
          <h1 className="text-2xl font-black mb-1">استضافة غرفة عن بُعد</h1>
          <p className="text-sm text-[#808080] mb-6">أنت المُوجِّه (لا لاعب) — تُدير اللعبة ويشترك أصدقاؤك من أجهزتهم.</p>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">اسم الغرفة</label>
              <input value={gameName} onChange={(e) => setGameName(e.target.value)}
                className="w-full bg-[#050505] border border-[#222] rounded-lg px-3 py-3 text-white outline-none focus:border-[#C5A059]" />
            </div>
            <div>
              <label className="block text-sm text-[#b3b3b3] mb-2">أقصى عدد لاعبين</label>
              <input type="number" min={6} max={50} value={maxPlayers}
                onChange={(e) => setMaxPlayers(Math.max(6, Math.min(50, parseInt(e.target.value, 10) || 12)))}
                className="w-full bg-[#050505] border border-[#222] rounded-lg px-3 py-3 text-white outline-none focus:border-[#C5A059]" />
            </div>

            {/* ── إعدادات الغرفة (كانت في اللوبي — الآن تُضبط قبل الإنشاء) ── */}
            <div className="pt-3 border-t border-[#1a1a1a] space-y-4">
              <div>
                <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-1">🌙 وضع الليل</div>
                <div className="text-sm text-[#b3b3b3] mb-2">أوتوماتيكي (إلزاميّ عن بُعد — اللاعبون يُرسلون من أجهزتهم)</div>
                <label className="block text-xs text-[#808080] mb-1">مهلة كل خطوة: <span className="text-[#C5A059] font-mono">{autoNightTime}ث</span></label>
                <input type="range" min={5} max={60} step={5} value={autoNightTime}
                  onChange={(e) => setAutoNightTime(parseInt(e.target.value, 10))} className="w-full accent-[#C5A059]" />
              </div>

              <div>
                <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">⏱️ مؤقّت اللعبة</div>
                <div className="flex gap-2">
                  {[0, 30, 60, 90].map((m) => (
                    <button key={m} type="button" onClick={() => setGameTimerMinutes(m)}
                      className={`flex-1 py-2 rounded-lg text-sm border ${gameTimerMinutes === m ? 'bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059]' : 'border-[#222] text-[#888]'}`}>
                      {m === 0 ? 'مطفأ' : `${m} د`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">⚖️ نظام العقوبات</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center bg-[#050505] border border-[#222] rounded-lg">
                    <button type="button" onClick={() => setMaxPenalties(Math.max(1, maxPenalties - 1))} className="px-3 py-2 text-[#888]">−</button>
                    <span className="px-3 text-white font-mono">{maxPenalties}</span>
                    <button type="button" onClick={() => setMaxPenalties(Math.min(10, maxPenalties + 1))} className="px-3 py-2 text-[#888]">+</button>
                  </div>
                  <span className="text-xs text-[#808080]">أقصى عدد</span>
                  <div className="flex gap-1 mr-auto">
                    <button type="button" onClick={() => setPenaltyScope('room')} className={`px-3 py-2 rounded-lg text-xs border ${penaltyScope === 'room' ? 'bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059]' : 'border-[#222] text-[#888]'}`}>كامل الغرفة</button>
                    <button type="button" onClick={() => setPenaltyScope('game')} className={`px-3 py-2 rounded-lg text-xs border ${penaltyScope === 'game' ? 'bg-[#C5A059]/20 border-[#C5A059] text-[#C5A059]' : 'border-[#222] text-[#888]'}`}>كل لعبة</button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">💣 قنبلة الأب الروحيّ</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBombEnabled(true)} className={`flex-1 py-2 rounded-lg text-sm border ${bombEnabled ? 'bg-red-500/15 border-red-600 text-red-300' : 'border-[#222] text-[#888]'}`}>مفعّلة</button>
                  <button type="button" onClick={() => setBombEnabled(false)} className={`flex-1 py-2 rounded-lg text-sm border ${!bombEnabled ? 'bg-[#1a1a1a] border-[#333] text-white' : 'border-[#222] text-[#888]'}`}>معطّلة</button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">🎙️ أقصى عدد تبريرات</label>
                <input type="number" min={1} max={5} value={maxJustifications}
                  onChange={(e) => setMaxJustifications(Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 2)))}
                  className="w-24 bg-[#050505] border border-[#222] rounded-lg px-3 py-2 text-white outline-none focus:border-[#C5A059]" />
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating || !isConnected}
              className="btn-premium w-full !py-3.5 !rounded-lg disabled:opacity-50">
              <span>{creating ? 'جارٍ الإنشاء…' : !isConnected ? 'جارٍ الاتصال…' : '🌐 إنشاء الغرفة'}</span>
            </button>
            {error && <div className="p-2.5 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">{error}</div>}
            {!player && <div className="text-xs text-yellow-400">يجب تسجيل الدخول كلاعب أولاً.</div>}
          </div>

          <p className="text-xs text-[#555] mt-4 leading-relaxed">
            إنشاء الغرف مقصورٌ على الحسابات المصرّح لها. إن ظهر «غير مصرّح لك» فتواصل مع الإدارة لتفعيل الاستضافة لحسابك.
          </p>
        </div>
      </div>
    );
  }

  // ── شاشة المُضيف داخل اللعبة (حسب الطور) ──
  const phase: string = gameState.phase;
  const header = (
    <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-2.5 flex items-center justify-between">
      <span className="text-xs font-mono text-[#C5A059] tracking-widest">🌐 HOST · {gameState.roomCode}</span>
      <span className={`text-xs font-mono ${isConnected ? 'text-green-400' : 'text-red-400'}`}>{isConnected ? '● متصل' : '○ منقطع'}</span>
    </div>
  );
  const errBar = error ? (
    <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">{error}</div>
  ) : null;

  let body: React.ReactNode;
  if (phase === 'LOBBY') {
    body = (
      <>
        <div className="mx-4 mt-3 p-3 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a]">
          <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-1">رابط الانضمام — شاركه</div>
          <div className="font-mono text-xs text-[#C5A059] break-all" dir="ltr">{joinLink}</div>
          <button onClick={() => { try { navigator.clipboard.writeText(joinLink); } catch {} }}
            className="mt-2 text-xs text-white/80 border border-[#222] rounded-md px-3 py-1.5">📋 نسخ</button>
        </div>
        <LeaderLobbyView gameState={gameState} emit={emit} setError={setError} hideOfflineAgent hideRoomSettings />
      </>
    );
  } else if (phase === 'ROLE_GENERATION') {
    body = <LeaderRoleConfigurator gameState={gameState} emit={emit} setError={setError} />;
  } else if (phase === 'ROLE_BINDING') {
    body = <LeaderRoleBinding gameState={gameState} emit={emit} setError={setError} />;
  } else {
    body = (
      <div className="p-8 text-center text-[#808080]">
        <div className="text-4xl mb-3">🛠️</div>
        <p className="text-lg text-white/90 mb-1">إدارة الطور «{phase}» قيد البناء</p>
        <p className="text-sm">الأدوار وُزّعت وأُرسلت للاعبين على أجهزتهم. مُشغّل النهار/الليل قادمٌ في التحديث التالي (6b).</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#050505] text-white pb-24">
      {header}
      {errBar}
      {body}
    </div>
  );
}
