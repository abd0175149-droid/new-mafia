'use client';

// ══════════════════════════════════════════════════════
// 📱 عرض الطاولة للاعب البعيد (بديل شاشة العرض الرئيسية)
// ══════════════════════════════════════════════════════
// يعرض الطاولة (كروت مقلوبة — بلا كشف أدوار) + من يتحدّث الآن + العدّاد التنازلي
// + العدّادات + أحداث الصباح. يظهر فقط في الغرف البعيدة (isRemote). لا يكشف أي دور:
// الـ roster قادمٌ من game:state-sync/rosterInfo المعقّم (role=null للاعبين).

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PhoneSpectatorViewProps {
  roster: any[];
  physicalId: string;
  gamePhase: string;
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
  initialDiscussionState?: any;
}

const PHASE_LABELS: Record<string, string> = {
  DAY_DISCUSSION: 'نقاش النهار',
  DAY_JUSTIFICATION: 'مرحلة الدفاع',
  DAY_ELIMINATION: 'كشف الإقصاء',
  ELIMINATION_PENDING: 'كشف الإقصاء',
  DAY_TIEBREAKER: 'كسر التعادل',
  NIGHT: 'الليل',
  MORNING_RECAP: 'أحداث الصباح',
};

// استخراج عدّاد الفريق من أشكال حمولة مختلفة (دفاعيّاً)
function readCounts(tc: any): { cit: number | null; maf: number | null } {
  if (!tc) return { cit: null, maf: null };
  const cit = tc.citizenAlive ?? tc.citizens ?? tc.citizen ?? tc.town ?? null;
  const maf = tc.mafiaAlive ?? tc.mafia ?? tc.mafiaCount ?? null;
  return { cit, maf };
}

function MiniCard({ p, isSpeaker, dimmed, isSelf }: { p: any; isSpeaker: boolean; dimmed: boolean; isSelf: boolean }) {
  const fallback = p.gender === 'FEMALE' ? '/avatars/female.png' : '/avatars/male.png';
  const numColor = p.gender === 'FEMALE' ? 'rgba(216,180,254,0.95)' : 'rgba(197,160,89,0.95)';
  return (
    <motion.div
      layout
      animate={{ opacity: dimmed ? 0.32 : 1, scale: isSpeaker ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`relative rounded-xl overflow-hidden bg-black border ${
        isSpeaker ? 'border-[#C5A059] shadow-[0_0_18px_rgba(197,160,89,0.6)]' : 'border-[#2a2a2a]'
      } ${!p.isAlive ? 'grayscale' : ''}`}
      style={{ aspectRatio: '3 / 4' }}
    >
      {/* الأفتار — الثلثان العلويّان */}
      <div className="relative w-full" style={{ height: '66%' }}>
        <img
          src={p.avatarUrl || fallback}
          alt={p.name}
          className={`w-full h-full object-cover ${!p.isAlive ? 'opacity-40' : ''}`}
          onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
        />
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-black text-3xl pointer-events-none"
          style={{ color: numColor, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
        >
          {p.physicalId}
        </span>
        {!p.isAlive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl">💀</div>
        )}
      </div>
      {/* الاسم — الثلث السفليّ */}
      <div className="flex items-center justify-center bg-black px-1" style={{ height: '34%' }}>
        <span className="text-[10px] font-bold text-white text-center leading-tight truncate w-full">{p.name}</span>
      </div>
      {isSelf && (
        <span className="absolute top-1 right-1 text-[7px] bg-[#C5A059] text-black font-black px-1 rounded">أنت</span>
      )}
      {isSpeaker && (
        <span className="absolute bottom-[36%] left-1/2 -translate-x-1/2 text-[10px] bg-[#C5A059] text-black font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
          🎙️
        </span>
      )}
    </motion.div>
  );
}

export default function PhoneSpectatorView({ roster, physicalId, gamePhase, on, initialDiscussionState }: PhoneSpectatorViewProps) {
  const [discussion, setDiscussion] = useState<any>(initialDiscussionState || null);
  const [teamCounts, setTeamCounts] = useState<any>(null);
  const [recapEvents, setRecapEvents] = useState<any[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const c1 = on('day:discussion-updated', (data: any) => {
      setDiscussion(data?.discussionState ?? null);
    });
    const c2 = on('game:phase-changed', (data: any) => {
      if (data?.teamCounts) setTeamCounts(data.teamCounts);
      if (data?.phase && data.phase !== 'DAY_DISCUSSION') setDiscussion(null);
    });
    const c3 = on('day:elimination-revealed', (data: any) => {
      if (data?.teamCounts) setTeamCounts(data.teamCounts);
    });
    const c4 = on('display:morning-event', (data: any) => {
      setRecapEvents((prev) => [...prev, data].slice(-6));
    });
    return () => { c1?.(); c2?.(); c3?.(); c4?.(); };
  }, [on]);

  // تصفير المتحدّث/الأحداث عند تبدّل المرحلة
  useEffect(() => {
    if (gamePhase !== 'DAY_DISCUSSION') setDiscussion(null);
    if (gamePhase !== 'MORNING_RECAP') setRecapEvents([]);
  }, [gamePhase]);

  // نبضة كل ثانية لعدّاد المتحدّث
  const speaking = discussion?.currentSpeakerId != null;
  useEffect(() => {
    if (!speaking) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [speaking]);

  const players = Array.isArray(roster) ? roster : [];
  const sorted = [...players].sort((a, b) => (a.physicalId || 0) - (b.physicalId || 0));
  const aliveCount = players.filter((p) => p.isAlive).length;
  const currentSpeakerId = discussion?.currentSpeakerId ?? null;
  const speaker = speaking ? players.find((p) => p.physicalId === currentSpeakerId) : null;
  const { cit, maf } = readCounts(teamCounts);
  const myId = parseInt(physicalId, 10);

  // العدّاد التنازليّ للمتحدّث الحالي
  const speakerRemaining: number | null = (() => {
    void tick; // إعادة الحساب كل نبضة
    if (!speaking) return null;
    if (discussion?.startTime && discussion?.timeLimitSeconds) {
      return Math.max(0, Math.round(discussion.timeLimitSeconds - (Date.now() - discussion.startTime) / 1000));
    }
    return typeof discussion?.timeRemaining === 'number' ? discussion.timeRemaining : null;
  })();

  if (!players.length) {
    return (
      <div className="text-center py-8 text-[#808080] text-xs font-mono">
        <div className="w-6 h-6 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-2" />
        جاري تحميل الطاولة…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#070707] overflow-hidden mb-3">
      {/* الرأس: المرحلة + العدّادات */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-3 py-2 flex items-center justify-between">
        <div className="text-[#C5A059] font-black text-sm" style={{ fontFamily: 'Amiri, serif' }}>
          {PHASE_LABELS[gamePhase] || gamePhase}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          {cit != null && <span className="text-blue-400" title="مواطنون">🛡️ {cit}</span>}
          {maf != null && <span className="text-red-400" title="مافيا">🔪 {maf}</span>}
          <span className="text-[#808080]">أحياء {aliveCount}</span>
        </div>
      </div>

      {/* شريط المتحدّث الحالي + العدّاد */}
      <AnimatePresence>
        {speaker && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-3 mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#C5A059]/15 border border-[#C5A059]/40 py-1.5"
          >
            <span className="text-sm">🎙️</span>
            <span className="text-[#C5A059] text-xs font-bold">
              يتحدّث الآن: <span className="font-mono">#{speaker.physicalId}</span> {speaker.name}
            </span>
            {speakerRemaining != null && (
              <span className={`font-mono text-xs font-black ${speakerRemaining <= 10 ? 'text-red-400' : 'text-[#C5A059]'}`}>
                ⏱ {speakerRemaining}s
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* الطاولة: كروت مقلوبة */}
      <div className="grid grid-cols-4 gap-2 p-3">
        {sorted.map((p) => (
          <MiniCard
            key={p.physicalId}
            p={p}
            isSpeaker={speaking && p.physicalId === currentSpeakerId}
            dimmed={speaking && p.physicalId !== currentSpeakerId}
            isSelf={p.physicalId === myId}
          />
        ))}
      </div>

      {/* أحداث الصباح */}
      {gamePhase === 'MORNING_RECAP' && recapEvents.length > 0 && (
        <div className="px-3 pb-3 space-y-1">
          {recapEvents.map((ev, i) => (
            <div key={i} className="text-xs text-center rounded-lg bg-black/50 border border-[#2a2a2a] py-1.5 text-[#e0e0e0]">
              {ev?.targetName ? (
                <span>💀 <span className="font-bold text-red-300">#{ev.targetPhysicalId} {ev.targetName}</span> — خرج من اللعبة</span>
              ) : (
                <span>🌙 حدث ليليّ</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
