'use client';

// ══════════════════════════════════════════════════════
// 🌐 صفحة المُضيف — إنشاء غرفة لعبٍ عن بُعد وإدارتها من داخل تطبيق اللاعب.
// تعيد استخدام مكوّنات الليدر ({gameState, emit, setError}) دون لمس صفحة الموظّفين.
// المُضيف مُوجِّهٌ لا لاعب. الوحدة 6a: إنشاء + لوبي + تهيئة الأدوار. النهار/الليل = 6b.
// ══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { usePlayer } from '@/context/PlayerContext';
import HostLobby from './HostLobby';
import LeaderRoleConfigurator from '@/app/leader/LeaderRoleConfigurator';
import HostRoleBinding from './HostRoleBinding';
import HostDayControls from './HostDayControls';
import HostNightRunner from './HostNightRunner';
import RemoteVoice from '@/components/RemoteVoice';
import PhoneSpectatorView from '@/components/PhoneSpectatorView';
import { useActiveSpeaker } from '@/hooks/useActiveSpeaker';
import ConfrontationControls from '@/components/ConfrontationControls';
import InviteModal from '@/components/InviteModal';
import PhaseLoading from '@/components/PhaseLoading';
import RoomCodeCard from '@/components/RoomCodeCard';
import { MAFIA_ROLES } from '@/lib/constants';

const PHASE_SHORT: Record<string, string> = {
  LOBBY: 'لوبي', ROLE_GENERATION: 'أدوار', ROLE_BINDING: 'ربط',
  DAY_DISCUSSION: 'نقاش', DAY_VOTING: 'تصويت', DAY_JUSTIFICATION: 'دفاع',
  DAY_ELIMINATION: 'كشف', ELIMINATION_PENDING: 'كشف', DAY_REVEALED: 'كشف', DAY_TIEBREAKER: 'تعادل',
  NIGHT: 'ليل', MORNING_RECAP: 'صباح', GAME_OVER: 'نهاية',
};

export default function HostPage() {
  const { player } = usePlayer();
  const { isConnected, emit, on } = useSocket();
  const [gameState, setGameState] = useState<any>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [gameName, setGameName] = useState('غرفة عن بُعد');
  const [maxPlayers, setMaxPlayers] = useState(12);
  // 📷🔊 خرائط الكاميرا/الصوت للمضيف — تُغذّي حلقة العرض (نفس كارت اللاعب + الكاميرا)
  const [voiceMaps, setVoiceMaps] = useState<{ videoByPid: Record<number, MediaStreamTrack | null>; audioByPid: Record<number, boolean> }>({ videoByPid: {}, audioByPid: {} });
  // ── إعدادات الغرفة (تُضبط قبل الإنشاء بدل اللوبي) ──
  const [autoNightTime, setAutoNightTime] = useState(15);          // ثوانٍ لكل خطوة ليل
  const [gameTimerMinutes, setGameTimerMinutes] = useState(0);     // 0 = مطفأ
  const [maxPenalties, setMaxPenalties] = useState(3);
  const [penaltyScope, setPenaltyScope] = useState<'room' | 'game'>('room');
  const [bombEnabled, setBombEnabled] = useState(true);
  const [maxJustifications, setMaxJustifications] = useState(2);
  const [mafiaChatEnabled, setMafiaChatEnabled] = useState(false); // 🗣️ غرفة تشاور المافيا السرّية
  const [allowPlayerInvites, setAllowPlayerInvites] = useState(false); // 📨 السماح للاعبين بدعوة أصدقائهم
  const [showInvite, setShowInvite] = useState(false); // 📨 مودال إرسال الدعوات
  const roomIdRef = useRef<string | null>(null);
  // 🕵️ DAY_REVEALED طورٌ جبهيّ فقط (الخادم يبقى على DAY_ELIMINATION). نُبقيه محليّاً حتى لا يرجعنا الاستطلاع
  // للخلف فيختفي زر «بدء الليل» — تماماً كما تفعل صفحة /leader.
  const revealOverrideRef = useRef<any | null>(null);
  // 👮‍♀️ اختيار الشرطية حقلٌ جبهيّ فقط (يصل عبر حدث policewoman:choice-available، لا في حالة الخادم).
  // نُبقيه محليّاً خلال طور الصباح وإلّا مسحه الاستطلاع الدوريّ فتعلق اللعبة عند تفعيل الشرطية.
  const policewomanChoiceRef = useRef<any | null>(null);

  const applyState = useCallback((s: any) => {
    if (!s) return;
    if (s.phase !== 'MORNING_RECAP') policewomanChoiceRef.current = null;
    const pw = policewomanChoiceRef.current && s.phase === 'MORNING_RECAP' ? { policewomanChoice: policewomanChoiceRef.current } : {};
    const ov = revealOverrideRef.current;
    if (ov && s.phase === 'DAY_ELIMINATION') {
      // الخادم ما زال على DAY_ELIMINATION لكننا كشفنا محليّاً → أبقِ DAY_REVEALED مع بيانات الكشف
      setGameState({ ...s, ...pw, phase: 'DAY_REVEALED', revealedData: ov, pendingWinner: ov.pendingWinner ?? s.pendingWinner ?? null });
    } else {
      if (ov) revealOverrideRef.current = null; // تقدّمنا للأمام (ليل/نهاية) → أنهِ التجاوز
      setGameState({ ...s, ...pw });
    }
  }, []);

  const refreshState = useCallback(async (roomId: string) => {
    try {
      const res = await emit('game:get-state', { roomId });
      if (res?.state) applyState(res.state);
    } catch { /* تجاهل — سيصل عبر البث */ }
  }, [emit, applyState]);

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
        mafiaChatEnabled,
        allowPlayerInvites,
      });
      roomIdRef.current = res.roomId;
      try { localStorage.setItem('mafia_host_room', res.roomId); } catch { /* ignore */ }
      await refreshState(res.roomId);
    } catch (e: any) {
      setError(e?.message || 'تعذّر إنشاء الغرفة');
    } finally {
      setCreating(false);
    }
  }, [emit, gameName, maxPlayers, maxJustifications, maxPenalties, penaltyScope, autoNightTime, gameTimerMinutes, bombEnabled, mafiaChatEnabled, allowPlayerInvites, refreshState]);

  // ── استئناف غرفة المُضيف بعد إعادة تحميل الصفحة ──
  useEffect(() => {
    try { const saved = localStorage.getItem('mafia_host_room'); if (saved) roomIdRef.current = saved; } catch { /* ignore */ }
  }, []);

  // ── الاستماع للحالة الحيّة ──
  useEffect(() => {
    const offs: Array<() => void> = [];
    offs.push(on('game:state-sync', (s: any) => { if (s?.roomId && s.roomId === roomIdRef.current) applyState(s); }));
    offs.push(on('game:state-updated', (s: any) => { if (s?.roomId && s.roomId === roomIdRef.current) applyState(s); }));
    offs.push(on('game:phase-changed', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('game:started', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    // 🔧 الخادم يبثّ هذه عند تغيّر الروستر (لا حالةً كاملة) — نجلب الحالة الكاملة عندها
    offs.push(on('room:player-joined', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('room:player-updated', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('room:player-kicked', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('player:seat-changed', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    // أحداث تُغيّر الطور/الحالة (النهار→الليل→الصباح→النهاية)
    offs.push(on('night:morning-recap', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('game:over', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    offs.push(on('day:voting-started', () => { if (roomIdRef.current) refreshState(roomIdRef.current); }));
    // 👮‍♀️ تفعيل صلاحية الشرطية (حدث للّيدر فقط) — نضبطه محليّاً كما /leader ليظهر تدفّق الشرطية بدل التعليق
    offs.push(on('policewoman:choice-available', (data: any) => {
      policewomanChoiceRef.current = data;
      setGameState((prev: any) => (prev ? { ...prev, policewomanChoice: data } : prev));
    }));
    // كشف الهوية: انتقل محليّاً لـ DAY_REVEALED (كما /leader) ليظهر زر «بدء الليل» — الخادم يبقى DAY_ELIMINATION
    offs.push(on('day:elimination-revealed', (data: any) => {
      revealOverrideRef.current = data || {};
      setGameState((prev: any) => (prev ? { ...prev, phase: 'DAY_REVEALED', revealedData: data, pendingWinner: data?.pendingWinner ?? prev.pendingWinner ?? null } : prev));
    }));
    return () => { offs.forEach((f) => f && f()); };
  }, [on, refreshState, applyState]);

  // ── إعادة منح صلاحيّة المُضيف عند (إعادة) الاتصال ──
  useEffect(() => {
    if (isConnected && roomIdRef.current) {
      emit('room:rejoin-host', { roomId: roomIdRef.current })
        .then(() => refreshState(roomIdRef.current!))
        .catch(() => { roomIdRef.current = null; try { localStorage.removeItem('mafia_host_room'); } catch { /* ignore */ } });
    }
  }, [isConnected, emit, refreshState]);

  // ── استطلاع دوريّ للحالة الكاملة (يُبقي مكوّنات النهار/الليل المُعادة محدّثة، إذ تعتمد على prop) ──
  useEffect(() => {
    const iv = setInterval(() => { if (roomIdRef.current) refreshState(roomIdRef.current); }, 2500);
    return () => clearInterval(iv);
  }, [refreshState]);

  // ── إخفاء توست الخطأ تلقائيّاً بعد 4 ثوانٍ ──
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // 🎙️ من يُسمح له بالكلام (للمضيف: يكتم الباقي) + حالة المواجهة
  const { allowedPids: hostAllowedPids, confrontation: hostConfrontation } = useActiveSpeaker({ on, gamePhase: gameState?.phase ?? null, initialDiscussionState: gameState?.discussionState });


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
                <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">🗣️ غرفة تشاور المافيا السرّية</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMafiaChatEnabled(true)} className={`flex-1 py-2 rounded-lg text-sm border ${mafiaChatEnabled ? 'bg-emerald-500/15 border-emerald-600 text-emerald-300' : 'border-[#222] text-[#888]'}`}>مفعّلة</button>
                  <button type="button" onClick={() => setMafiaChatEnabled(false)} className={`flex-1 py-2 rounded-lg text-sm border ${!mafiaChatEnabled ? 'bg-[#1a1a1a] border-[#333] text-white' : 'border-[#222] text-[#888]'}`}>معطّلة</button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono text-[#808080] tracking-widest uppercase mb-2">📨 دعوة اللاعبين لأصدقائهم</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAllowPlayerInvites(true)} className={`flex-1 py-2 rounded-lg text-sm border ${allowPlayerInvites ? 'bg-sky-500/15 border-sky-600 text-sky-300' : 'border-[#222] text-[#888]'}`}>مسموح</button>
                  <button type="button" onClick={() => setAllowPlayerInvites(false)} className={`flex-1 py-2 rounded-lg text-sm border ${!allowPlayerInvites ? 'bg-[#1a1a1a] border-[#333] text-white' : 'border-[#222] text-[#888]'}`}>للمضيف فقط</button>
                </div>
                <div className="text-[10px] text-[#9a9a9a] mt-1">عند التفعيل يظهر زرّ «إرسال دعوة» لكل لاعب في الغرفة، لا للمضيف وحده.</div>
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

          <p className="text-xs text-[#9a9a9a] mt-4 leading-relaxed">
            إنشاء الغرف مقصورٌ على الحسابات المصرّح لها. إن ظهر «غير مصرّح لك» فتواصل مع الإدارة لتفعيل الاستضافة لحسابك.
          </p>
        </div>
      </div>
    );
  }

  // ── شاشة المُضيف داخل اللعبة (حسب الطور) ──
  const phase: string = gameState.phase;
  const cancelToLobby = async () => {
    if (typeof window !== 'undefined' && !window.confirm('إلغاء اللعبة الحالية والعودة للوبي؟ (يبقى اللاعبون في الغرفة)')) return;
    try {
      await emit('room:reset-to-lobby', { roomId: gameState.roomId });
      if (roomIdRef.current) refreshState(roomIdRef.current);
    } catch (e: any) { setError(e?.message || 'تعذّر إلغاء اللعبة'); }
  };
  const header = (
    <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-2.5 flex items-center justify-between">
      <span className="text-xs font-mono text-[#C5A059] tracking-widest">🌐 HOST · {gameState.roomCode}</span>
      <div className="flex items-center gap-2">
        {phase !== 'LOBBY' && phase !== 'GAME_OVER' && (
          <button onClick={cancelToLobby} className="text-[10px] font-bold text-amber-300 border border-amber-500/40 rounded-md px-2 py-1 hover:bg-amber-500/10">⤴️ إلغاء اللعبة</button>
        )}
        <span className={`text-xs font-mono ${isConnected ? 'text-green-400' : 'text-red-400'}`}>{isConnected ? '● متصل' : '○ منقطع'}</span>
      </div>
    </div>
  );
  // توست سفلي ثابت — يُرى حتى عند الضغط على أزرار أسفل الصفحة (يختفي تلقائيّاً بعد 4ث)
  const errBar = error ? (
    <div className="fixed bottom-4 inset-x-4 z-40 p-3 rounded-xl bg-red-900/90 border border-red-700 text-red-100 text-sm text-center shadow-lg">{error}</div>
  ) : null;

  // ── 👑 حلقة المضيف: نفس كارت اللاعب + الكاميرا + كشف الأدوار للّيدر ──
  const hostRoster = (gameState.players || []).map((p: any) => ({
    physicalId: p.physicalId, name: p.name, role: p.role ?? null,
    isAlive: p.isAlive !== false, gender: p.gender, avatarUrl: p.avatarUrl ?? null,
  }));
  const aliveCount = hostRoster.filter((p: any) => p.isAlive).length;
  const mafiaAlive = hostRoster.filter((p: any) => p.isAlive && p.role && (MAFIA_ROLES as string[]).includes(p.role)).length;
  // التصويت والليل واجهتان موحّدتان قائمتان بذاتهما (بلا حلقة منفصلة فوقهما) حسب طلب التصميم
  const showRing = ['MORNING_RECAP', 'DAY_DISCUSSION', 'DAY_JUSTIFICATION', 'DAY_ELIMINATION', 'ELIMINATION_PENDING', 'DAY_REVEALED', 'DAY_TIEBREAKER', 'GAME_OVER'].includes(phase);
  // 📊 شريط الإحصاءات منفصل عن الحلقة: يظهر في كل أطوار اللعب (بما فيها الليل والتصويت)
  // كي لا يفقد المضيف مرجع «كم حياً؟ أي طور؟» في أحسّ اللحظات.
  const inPlayPhase = phase && !['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING'].includes(phase);
  const statsBar = gameState?.config?.isRemote && inPlayPhase && hostRoster.length > 0 ? (
    <div className="flex gap-2 px-4 pt-1 mb-1">
      <div className="flex-1 rounded-xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0b0b0c] py-1.5 text-center">
        <div className="font-mono font-extrabold text-[17px] leading-none text-emerald-400">{aliveCount}</div>
        <div className="text-[10px] text-[#9a9a9a] mt-0.5">أحياء</div>
      </div>
      <div className="flex-1 rounded-xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0b0b0c] py-1.5 text-center">
        <div className="font-mono font-extrabold text-[17px] leading-none text-red-400">{mafiaAlive}</div>
        <div className="text-[10px] text-[#9a9a9a] mt-0.5">مافيا</div>
      </div>
      <div className="flex-1 rounded-xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0b0b0c] py-1.5 text-center">
        <div className="font-mono font-extrabold text-[15px] leading-none text-[#C5A059]">{PHASE_SHORT[phase] || '—'}</div>
        <div className="text-[10px] text-[#9a9a9a] mt-0.5">الطور</div>
      </div>
    </div>
  ) : null;
  const hostRing = gameState?.config?.isRemote && showRing && hostRoster.length > 0 ? (
    <div className="px-2 pt-1">
      <PhoneSpectatorView
        roster={hostRoster}
        physicalId="-1"
        gamePhase={phase}
        on={on}
        initialDiscussionState={gameState.discussionState}
        videoByPid={voiceMaps.videoByPid}
        speakingByPid={voiceMaps.audioByPid}
        revealRoles
        hostView
        winnerReveal={phase === 'GAME_OVER' ? { winner: gameState.winner, players: gameState.players } : null}
      />
    </div>
  ) : null;

  let body: React.ReactNode;
  if (phase === 'LOBBY') {
    body = (
      <>
        <div className="mx-4 mt-3">
          <RoomCodeCard code={gameState.roomCode} />
        </div>
        <div className="mx-4 mt-3">
          <button
            onClick={() => setShowInvite(true)}
            className="w-full py-3 rounded-xl border border-sky-600/40 text-sky-300 bg-transparent text-sm font-bold hover:bg-sky-500/10 transition flex items-center justify-center gap-2"
          >
            📨 إرسال دعوة للاعبين
          </button>
        </div>
        <HostLobby gameState={gameState} emit={emit} setError={setError} />
        <div className="px-4 mt-4 mb-6">
          <button
            onClick={async () => {
              if (typeof window !== 'undefined' && !window.confirm('إلغاء الغرفة وإخراج كل من انضمّ؟')) return;
              try {
                await emit('room:close-event', { roomId: gameState.roomId });
                localStorage.removeItem('mafia_host_room');
                roomIdRef.current = null;
                setGameState(null);
              } catch (e: any) { setError(e?.message || 'تعذّر إغلاق الغرفة'); }
            }}
            className="w-full py-3 rounded-lg border border-red-800/50 text-red-300 bg-red-950/20 text-sm font-bold"
          >
            🗑️ إلغاء الغرفة وإغلاقها
          </button>
        </div>
      </>
    );
  } else if (phase === 'ROLE_GENERATION') {
    body = <LeaderRoleConfigurator gameState={gameState} emit={emit} setError={setError} hideMafiaChat />;
  } else if (phase === 'ROLE_BINDING') {
    body = <HostRoleBinding gameState={gameState} emit={emit} setError={setError} />;
  } else if (phase.startsWith('DAY_')) {
    body = <HostDayControls gameState={gameState} emit={emit} setError={setError} />;
  } else if (phase === 'NIGHT' || phase === 'MORNING_RECAP') {
    body = <HostNightRunner gameState={gameState} emit={emit} on={on} setError={setError} readOnlyChoices />;
  } else if (phase === 'GAME_OVER') {
    const winner = gameState.winner;
    const winTitle = winner === 'MAFIA' ? 'انتصار المافيا' : winner === 'ASSASSIN' ? 'انتصار السفّاح' : winner === 'JESTER' ? 'فوز المهرج' : 'تطهير المدينة';
    const winIcon = winner === 'MAFIA' ? '🩸' : winner === 'ASSASSIN' ? '🔪' : winner === 'JESTER' ? '🤡' : '⚖️';
    const winSub = winner === 'MAFIA' ? 'ALL CITIZENS ELIMINATED' : winner === 'ASSASSIN' ? 'CONTRACTS FULFILLED' : winner === 'JESTER' ? 'THE JESTER WINS' : 'THREAT NEUTRALIZED';
    // الطاولة تكشف كل الأدوار على الحلقة أعلاه (winnerReveal) — هنا الإعلان والأزرار فقط
    body = (
      <div className="px-4 pt-2 pb-7 text-center">
        <div className="text-6xl mb-1 leading-none" style={{ filter: 'drop-shadow(0 0 26px rgba(197,160,89,0.45))' }}>{winIcon}</div>
        <h2 className="text-2xl font-black text-white mb-1" style={{ fontFamily: 'Amiri, serif' }}>{winTitle}</h2>
        <p className="text-[10px] font-mono text-[#808080] tracking-[0.25em] uppercase mb-6">{winSub}</p>
        <div className="flex gap-2 max-w-md mx-auto">
          <button onClick={async () => { try { await emit('room:new-game', { roomId: gameState.roomId }); } catch (e: any) { setError(e?.message || 'تعذّر'); } }}
            className="btn-premium flex-1 !py-3.5 !rounded-xl"><span>🔄 لعبة جديدة</span></button>
          <button onClick={async () => { try { await emit('room:close-event', { roomId: gameState.roomId }); localStorage.removeItem('mafia_host_room'); roomIdRef.current = null; setGameState(null); } catch (e: any) { setError(e?.message || 'تعذّر'); } }}
            className="flex-1 py-3.5 rounded-xl border border-[#333] text-[#aaa] font-bold">إنهاء الغرفة</button>
        </div>
      </div>
    );
  } else {
    body = <PhaseLoading text={`الطور «${phase}»`} />;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#050505] text-white pb-24">
      {header}
      {errBar}
      {gameState?.config?.isRemote && (
        <div className="px-4 pt-2">
          <RemoteVoice
            key="remote-voice"
            roomId={gameState?.roomId || roomIdRef.current}
            enabled={!!phase}
            isHost={true}
            selfPhysicalId={null}
            emit={emit}
            gamePhase={gameState?.phase ?? null}
            allowedPids={hostAllowedPids}
            nameByPid={Object.fromEntries((gameState?.players || []).map((p: any) => [p.physicalId, p.name]))}
            onVoiceMaps={setVoiceMaps}
          />
          <ConfrontationControls
            confrontation={hostConfrontation}
            myPid={null}
            isHost={true}
            players={gameState?.players || []}
            emit={emit}
            roomId={gameState?.roomId || roomIdRef.current}
            gamePhase={gameState?.phase ?? null}
          />
        </div>
      )}
      {statsBar}
      {hostRing}
      {body}
      {showInvite && gameState?.roomId && (
        <InviteModal roomId={gameState.roomId} emit={emit} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
