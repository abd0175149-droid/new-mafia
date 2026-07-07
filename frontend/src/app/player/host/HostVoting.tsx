'use client';

// ══════════════════════════════════════════════════════
// 🗳️ HostVoting — واجهة التصويت الموحّدة للمضيف على الهاتف (بلا حلقة منفصلة).
// المرشّحون ككروت مع عدّاد الأصوات، اختيار المصوِّت (وكالة)، ثم الحسم/المهلة/الرجوع للمباشر.
// يبثّ نفس أحداث LeaderDayView تماماً (day:cast-vote / day:resolve / day:voting-timeout / day:un-narrow).
// ══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { MAFIA_ROLES } from '@/lib/constants';

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

export default function HostVoting({ gameState, emit, setError }: Props) {
  const vs = gameState.votingState;
  const alive = (gameState.players || []).filter((p: any) => p.isAlive);
  const [selectedVoter, setSelectedVoter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSelectedVoter(null); }, [gameState.phase]);

  if (!vs) return <div className="text-center text-[#555] py-10 font-mono text-sm">جارٍ تحضير التصويت…</div>;

  const candidates: any[] = vs.candidates || [];
  const playerVotes: Record<number, number> = vs.playerVotes || {};
  const proxyVotes: Record<number, number> = vs.leaderProxyVotes || {};
  // كل الأحياء يصوّتون (بما فيهم أهداف الصفقات) — المقام والاكتمال يطابقان الباكند وLeaderDayView
  const votingAlive = alive;
  const totalVotes = candidates.reduce((s: number, c: any) => s + (c.votes || 0), 0);
  const isComplete = totalVotes >= votingAlive.length;
  const tbl = vs.tieBreakerLevel || 0;
  const label = tbl >= 2 ? 'مُضيّق' : tbl === 1 ? 'إعادة' : 'مباشر';
  const mafia = alive.filter((p: any) => (MAFIA_ROLES as string[]).includes(p.role)).length;
  const citizen = alive.length - mafia;

  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };
  // تصويت: يتطلّب مصوِّتاً مختاراً؛ يبثّ +1 على المرشّح ثم يُصفّر الاختيار
  const addVote = (candidateIndex: number) => {
    if (selectedVoter == null) { setError('اختر مصوِّتاً أولاً'); return; }
    const v = selectedVoter;
    setSelectedVoter(null);
    run(() => emit('day:cast-vote', { roomId: gameState.roomId, candidateIndex, delta: 1, voterPhysicalId: v }));
  };
  // تراجع: يُنقص المرشّح الذي صوّت له هذا المصوِّت فعلاً (لا مرشّحاً عشوائياً)
  const removeVote = (pid: number) => {
    const idx = proxyVotes[pid] ?? playerVotes[pid];
    if (idx === undefined) return;
    run(() => emit('day:cast-vote', { roomId: gameState.roomId, candidateIndex: idx, delta: -1, voterPhysicalId: pid }));
  };
  const voterStatus = (pid: number) => (proxyVotes[pid] !== undefined ? 'proxy' : playerVotes[pid] !== undefined ? 'self' : 'pending');

  return (
    <div className="px-3 pb-5">
      {/* رأس: فرق + حالة + عدّاد */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#6be06b]">🏛 {citizen}</span><span className="text-[#2a2a2a]">|</span><span className="text-[#ff6b6b]">🎭 {mafia}</span>
        </div>
        <span className="text-[9px] font-mono text-[#C5A059] border border-[#C5A059]/30 rounded px-2 py-0.5 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-mono font-bold text-white">{totalVotes}<span className="text-[#555]">/{votingAlive.length}</span></span>
      </div>

      {/* المرشّحون */}
      <div className="grid grid-cols-3 gap-2 mb-3.5">
        {candidates.map((c: any, i: number) => {
          const target = alive.find((p: any) => p.physicalId === c.targetPhysicalId);
          const isDeal = c.type === 'DEAL';
          const g = target?.gender === 'FEMALE' ? '👩' : '👨';
          return (
            <button key={i} onClick={() => addVote(i)} disabled={selectedVoter == null || busy}
              className={`relative rounded-2xl border bg-gradient-to-b from-[#121013] to-[#0a090a] p-2 pt-4 text-center transition-all ${selectedVoter != null ? 'border-sky-600/50 active:scale-95' : 'border-[#2a2a2a] opacity-80'} disabled:active:scale-100`}>
              {c.votes > 0 && (
                <span className="absolute -top-2.5 -left-2 min-w-[24px] h-6 px-1 rounded-full bg-[#b0362f] text-white font-mono font-extrabold text-xs flex items-center justify-center shadow-[0_4px_10px_-3px_#b0362f]">{c.votes}</span>
              )}
              <div className="w-10 h-10 rounded-full mx-auto mb-1 bg-gradient-to-b from-[#241f19] to-[#131110] border border-[#2a2a2a] flex items-center justify-center text-lg overflow-hidden">
                {target?.avatarUrl ? <img src={target.avatarUrl} alt="" className="w-full h-full object-cover" /> : g}
              </div>
              <div className="text-[10px] text-white/90 truncate leading-tight">#{c.targetPhysicalId} {target?.name || ''}</div>
              {isDeal && <div className="text-[8px] font-mono text-[#C5A059] mt-0.5">🤝 صفقة</div>}
              {selectedVoter != null && <div className="text-[8px] font-mono text-sky-300/80 mt-1">اضغط للتصويت</div>}
            </button>
          );
        })}
      </div>

      {/* اختيار المصوِّت (وكالة) — معلّق: اضغطه ثم اضغط مرشّحاً · صوّت/وكالة: اضغطه للتراجع عن صوته */}
      <div className="text-[10px] font-mono text-[#808080] uppercase tracking-wider mb-1.5">صوِّت بالوكالة — اختر مصوِّتاً معلّقاً ثم اضغط مرشّحاً · اضغط مَن صوّت للتراجع</div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {votingAlive.map((p: any) => {
          const st = voterStatus(p.physicalId);
          const sel = selectedVoter === p.physicalId;
          return (
            <button key={p.physicalId} onClick={() => (st === 'pending' ? setSelectedVoter(p.physicalId) : removeVote(p.physicalId))}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-mono border transition-all ${sel ? 'border-sky-500 text-sky-100 bg-sky-500/15 scale-105' : st === 'self' ? 'border-emerald-600/50 text-emerald-300 bg-emerald-900/10' : st === 'proxy' ? 'border-amber-600/50 text-amber-300 bg-amber-900/10' : 'border-[#222] text-[#999] bg-[#0c0c0c]'}`}>
              #{p.physicalId} {st === 'self' ? '✅' : st === 'proxy' ? '🟠' : ''}
            </button>
          );
        })}
      </div>

      {/* أزرار */}
      <div className="flex gap-2">
        {label !== 'مباشر' && (
          <button onClick={() => run(() => emit('day:un-narrow', { roomId: gameState.roomId }))} disabled={busy}
            className="px-3 py-3 rounded-xl border border-[#2a2a2a] text-[#aaa] bg-[#0e0e10] text-xs">🔓 مباشر</button>
        )}
        {!isComplete && (
          <button onClick={() => run(() => emit('day:voting-timeout', { roomId: gameState.roomId }))} disabled={busy}
            className="px-3.5 py-3 rounded-xl border border-[#2a2a2a] text-[#888] bg-[#0e0e10] text-sm" title="تصويت الغائبين على أنفسهم">⏰</button>
        )}
        <button onClick={() => run(() => emit('day:resolve', { roomId: gameState.roomId }))} disabled={!isComplete || busy}
          className="btn-premium flex-1 !py-3 !rounded-xl disabled:opacity-40"><span>⚖️ حسم التصويت</span></button>
      </div>
    </div>
  );
}
