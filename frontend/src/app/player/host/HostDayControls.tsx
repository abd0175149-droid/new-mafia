'use client';

// ══════════════════════════════════════════════════════
// ☀️ HostDayControls — دوك أوامر النهار للمضيف على الهاتف.
// يقدّم دوكاً مضغوطاً لأكثر حالتَي النقاش استخداماً (البدء + التحكّم الحيّ)،
// ويفوّض بقيّة الحالات (نهاية النقاش/الصفقات/التصويت/التبرير/الكشف) إلى LeaderDayView
// كما هي — فلا تُفقَد أيّ وظيفة، ولا تتأثّر صفحة /leader بنفس-المكان.
// السياق البصريّ (المتحدّث/العدّاد/الأدوار) يظهر على حلقة PhoneSpectatorView فوق الدوك.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import LeaderDayView from '@/app/leader/LeaderDayView';

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

export default function HostDayControls({ gameState, emit, setError }: Props) {
  const ds = gameState.discussionState;
  if (gameState.phase === 'DAY_DISCUSSION') {
    if (ds?.isFinished) return <DiscussionFinished gameState={gameState} emit={emit} setError={setError} />;
    return <DiscussionDock gameState={gameState} emit={emit} setError={setError} />;
  }
  // بقيّة أطوار النهار (تصويت/تبرير/كشف) تُفوَّض حالياً إلى LeaderDayView — قيد إعادة التصميم
  return <LeaderDayView gameState={gameState} emit={emit} setError={setError} />;
}

// ── نهاية النقاش → التصويت (بلا تسجيل ديلات من الليدر؛ الديلات تُؤخذ ممّا سجّله اللاعبون) ──
function DiscussionFinished({ gameState, emit, setError }: Props) {
  const [votingDur, setVotingDur] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };
  return (
    <div className="px-3 pt-1 pb-3">
      <div className="rounded-2xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0a0a0b] p-3.5">
        <div className="text-center text-[#C5A059] font-bold text-lg" style={{ fontFamily: 'Amiri, serif' }}>انتهت جولة النقاش</div>
        <div className="text-[10px] text-center text-[#808080] font-mono mb-3.5">الصفقات تُؤخذ تلقائياً ممّا سجّله اللاعبون</div>
        <div className="text-[10px] font-mono text-[#808080] uppercase tracking-wider mb-1.5 text-center">مدّة التصويت</div>
        <div className="flex gap-1.5 mb-3.5">
          {[null, 10, 20, 30].map((d) => (
            <button key={String(d)} onClick={() => setVotingDur(d)}
              className={`flex-1 py-2 rounded-lg text-xs font-mono border ${votingDur === d ? 'bg-[#C5A059] text-black border-[#C5A059]' : 'border-[#222] text-[#888] bg-[#0c0c0c]'}`}>{d === null ? 'بدون' : `${d}s`}</button>
          ))}
        </div>
        <button disabled={busy} onClick={() => run(() => emit('day:start-voting', { roomId: gameState.roomId, durationSeconds: votingDur || undefined }))}
          className="btn-premium w-full !py-3 !rounded-xl disabled:opacity-50"><span>🗳️ بدء التصويت</span></button>
      </div>
    </div>
  );
}

function DiscussionDock({ gameState, emit, setError }: Props) {
  const ds = gameState.discussionState;
  const alive = (gameState.players || []).filter((p: any) => p.isAlive).sort((a: any, b: any) => a.physicalId - b.physicalId);
  const [startId, setStartId] = useState<number | null>(alive[0]?.physicalId ?? null);
  const [time, setTime] = useState(30);
  const [busy, setBusy] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };

  // ── بناء الجولة ──
  if (!ds) {
    return (
      <div className="px-3 pt-1 pb-3">
        <div className="rounded-2xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0a0a0b] p-3.5">
          <div className="text-center text-[#C5A059] font-bold text-lg mb-3" style={{ fontFamily: 'Amiri, serif' }}>بدء جولة النقاش</div>
          <div className="text-[10px] font-mono text-[#808080] uppercase tracking-wider mb-1.5">من يبدأ؟</div>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {alive.map((p: any) => (
              <button key={p.physicalId} onClick={() => setStartId(p.physicalId)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${startId === p.physicalId ? 'bg-[#C5A059] text-black border-[#C5A059]' : 'border-[#222] text-[#aaa] bg-[#0c0c0c]'}`}>
                #{p.physicalId} {p.name}
              </button>
            ))}
          </div>
          <div className="text-[10px] font-mono text-[#808080] uppercase tracking-wider mb-1.5">الوقت لكل لاعب</div>
          <div className="flex gap-1.5 mb-3.5">
            {[15, 30, 45, 60, 90].map((t) => (
              <button key={t} onClick={() => setTime(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-mono border ${time === t ? 'bg-[#C5A059] text-black border-[#C5A059]' : 'border-[#222] text-[#888] bg-[#0c0c0c]'}`}>{t}s</button>
            ))}
          </div>
          <button disabled={busy || startId == null}
            onClick={() => { if (startId == null) { setError('اختر لاعب البداية'); return; } run(() => emit('day:start-discussion', { roomId: gameState.roomId, startPhysicalId: startId, timeLimitSeconds: time })); }}
            className="btn-premium w-full !py-3 !rounded-xl disabled:opacity-50"><span>▶ ابدأ الدوران</span></button>
        </div>
      </div>
    );
  }

  // ── تحكّم حيّ ──
  const cur = alive.find((p: any) => p.physicalId === ds.currentSpeakerId);
  const speaking = ds.status === 'SPEAKING';
  const silenced = cur?.isSilenced === true;
  return (
    <div className="px-3 pt-1 pb-3">
      {showAdjust && (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-2 mb-2">
          <div className="grid grid-cols-4 gap-1.5 mb-1.5">
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId: gameState.roomId, phase: 'DISCUSSION', delta: 30 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-[#C5A059]/40 text-[#C5A059] bg-[#C5A059]/5">+30</button>
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId: gameState.roomId, phase: 'DISCUSSION', delta: 10 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-[#C5A059]/40 text-[#C5A059] bg-[#C5A059]/5">+10</button>
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId: gameState.roomId, phase: 'DISCUSSION', delta: -10 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-red-800/40 text-red-300 bg-red-900/10">−10</button>
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId: gameState.roomId, phase: 'DISCUSSION', delta: -30 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-red-800/40 text-red-300 bg-red-900/10">−30</button>
          </div>
          <button onClick={() => run(() => emit('day:timer-action', { roomId: gameState.roomId, action: 'RESET' }))} className="w-full py-1.5 rounded-lg text-[11px] font-mono text-[#888] border border-[#222]">🔄 إعادة الوقت من البداية</button>
        </div>
      )}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-[#c9c3b5]">{silenced ? '🔇 مُسكَت' : 'الدور'}: <span className="font-mono text-[#C5A059]">#{ds.currentSpeakerId}</span> {cur?.name || ''}</span>
        <span className="text-[10px] font-mono text-[#666]">طابور {ds.speakingQueue?.length ?? 0} · تكلّم {ds.hasSpoken?.length ?? 0}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => run(() => emit('day:prev-speaker', { roomId: gameState.roomId }))} disabled={busy || (ds.hasSpoken?.length ?? 0) === 0}
          className="px-3.5 py-3 rounded-xl border border-[#2a2a2a] text-[#aaa] bg-[#0e0e10] disabled:opacity-40 text-sm">⏮</button>
        {speaking ? (
          <button onClick={() => run(() => emit('day:timer-action', { roomId: gameState.roomId, action: 'PAUSE' }))}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-b from-[#c9a45a] to-[#9c7a33] text-black border border-[#d9be82]">⏸ إيقاف</button>
        ) : (
          <button onClick={() => run(() => emit('day:timer-action', { roomId: gameState.roomId, action: ds.status === 'WAITING' ? 'START' : 'RESUME' }))}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-b from-[#c9a45a] to-[#9c7a33] text-black border border-[#d9be82]">▶ {ds.status === 'WAITING' ? 'ابدأ' : 'استئناف'}</button>
        )}
        <button onClick={() => run(() => emit('day:next-speaker', { roomId: gameState.roomId }))}
          className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-b from-[#3a1513] to-[#230d0c] text-[#eba9a4] border border-[#5e2622]">⏭ التالي</button>
        <button onClick={() => setShowAdjust((s) => !s)}
          className={`px-3.5 py-3 rounded-xl border text-sm ${showAdjust ? 'border-[#C5A059]/50 text-[#C5A059] bg-[#C5A059]/10' : 'border-[#2a2a2a] text-[#888] bg-[#0e0e10]'}`}>⏱</button>
      </div>
    </div>
  );
}
