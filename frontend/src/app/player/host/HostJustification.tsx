'use client';

// ══════════════════════════════════════════════════════
// ⚖️ HostJustification — واجهة التبرير الموحّدة للمضيف على الهاتف.
// طوران: (1) الدفاع — مؤقّت لكل متّهم + التالي؛ (2) القرار — السحوبات + إقصاء/إعادة/تعادل.
// يبثّ نفس أحداث LeaderDayView بالضبط. السياق (المتّهمون/الأدوار) على الحلقة فوق الدوك.
// ══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import PhaseLoading from '@/components/PhaseLoading';

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

export default function HostJustification({ gameState, emit, setError }: Props) {
  const jd = gameState.justificationData;
  const accused: any[] = jd?.accused || [];
  const canJustifyList: any[] = jd?.canJustifyList || accused;
  const isTie = jd?.resultType === 'TIE';
  const [idx, setIdx] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [dur, setDur] = useState(30);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // تصفير مرّة واحدة عند دخول الطور (لا مع كل استطلاع) + عند نقص قائمة المُبرِّرين (إقصاء إداريّ)
  const wasRef = useRef(false);
  useEffect(() => {
    const isJust = gameState.phase === 'DAY_JUSTIFICATION' && !!jd;
    if (isJust && !wasRef.current) { setIdx(0); setAllDone(false); }
    wasRef.current = isJust;
  }, [gameState.phase, jd]);
  const prevLenRef = useRef(0);
  useEffect(() => {
    const len = canJustifyList.length;
    if (gameState.phase === 'DAY_JUSTIFICATION' && len > 0 && len < prevLenRef.current) { setIdx(0); setAllDone(false); }
    prevLenRef.current = len;
  }, [canJustifyList.length, gameState.phase]);

  // عدّاد الدفاع من حالة الخادم
  const timer = jd?.timer;
  useEffect(() => {
    if (!timer?.startTime) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [timer?.startTime, timer?.physicalId]);
  const remaining = timer?.startTime && timer?.timeLimitSeconds ? Math.max(0, Math.round(timer.timeLimitSeconds - (Date.now() - timer.startTime) / 1000)) : null;

  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };
  const roomId = gameState.roomId;

  const handleNext = async () => {
    try { await emit('day:stop-justification-timer', { roomId }); } catch { /* noop */ }
    if (idx < canJustifyList.length - 1) setIdx(idx + 1);
    else setAllDone(true);
  };

  if (!jd) return <PhaseLoading text="جارٍ تحضير التبرير…" />;

  const showDecision = allDone || canJustifyList.length === 0;
  const cur = !showDecision ? canJustifyList[idx] : null;

  // ── طور الدفاع ──
  if (cur) {
    const p = gameState.players.find((x: any) => x.physicalId === cur.targetPhysicalId);
    const active = !!timer && timer.physicalId === cur.targetPhysicalId && timer.startTime;
    return (
      <div className="px-3 pb-4">
        <div className="text-center mb-3">
          <div className="text-[9px] font-mono text-[#666] tracking-widest uppercase">مُدافِع {idx + 1} / {canJustifyList.length}</div>
          <div className="text-lg font-bold text-white" style={{ fontFamily: 'Amiri, serif' }}>#{cur.targetPhysicalId} {p?.name || ''}</div>
          {remaining != null ? (
            <div className={`font-mono font-black text-4xl leading-tight ${remaining <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{remaining}s</div>
          ) : (
            <div className="text-[#808080] font-mono text-xs mt-1">جاهز للدفاع</div>
          )}
        </div>
        {!active ? (
          <>
            <div className="flex gap-1.5 mb-2.5">
              {[15, 30, 45, 60].map((t) => (
                <button key={t} onClick={() => setDur(t)} className={`flex-1 py-2 rounded-lg text-xs font-mono border ${dur === t ? 'bg-[#C5A059] text-black border-[#C5A059]' : 'border-[#222] text-[#888] bg-[#0c0c0c]'}`}>{t}s</button>
              ))}
            </div>
            <button disabled={busy} onClick={() => run(() => emit('day:start-justification-timer', { roomId, physicalId: cur.targetPhysicalId, timeLimitSeconds: dur }))}
              className="btn-premium w-full !py-3 !rounded-xl disabled:opacity-50"><span>▶ ابدأ مؤقّت الدفاع</span></button>
          </>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 mb-2.5">
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId, phase: 'JUSTIFICATION', delta: 30 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-[#C5A059]/40 text-[#C5A059] bg-[#C5A059]/5">+30</button>
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId, phase: 'JUSTIFICATION', delta: 10 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-[#C5A059]/40 text-[#C5A059] bg-[#C5A059]/5">+10</button>
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId, phase: 'JUSTIFICATION', delta: -10 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-red-800/40 text-red-300 bg-red-900/10">−10</button>
            <button onClick={() => run(() => emit('day:adjust-timer', { roomId, phase: 'JUSTIFICATION', delta: -30 }))} className="py-2 rounded-lg text-xs font-mono font-bold border border-red-800/40 text-red-300 bg-red-900/10">−30</button>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <button onClick={() => run(() => emit('day:reset-justification-timer', { roomId, physicalId: cur.targetPhysicalId, timeLimitSeconds: dur }))}
            className="px-3.5 py-3 rounded-xl border border-[#2a2a2a] text-[#aaa] bg-[#0e0e10] text-sm">🔄</button>
          <button onClick={handleNext}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-gradient-to-b from-[#c9a45a] to-[#9c7a33] text-black border border-[#d9be82]">
            {idx < canJustifyList.length - 1 ? `⏭ التالي (${idx + 2}/${canJustifyList.length})` : '✅ إنهاء التبريرات'}
          </button>
        </div>
      </div>
    );
  }

  // ── طور القرار ──
  const ws = gameState.withdrawalState;
  const votersTotal = jd?.votersForAccused?.length || 0;
  const wsCount = ws?.count || 0;
  const wsNeeded = ws?.needed || Math.ceil(votersTotal / 2);
  const canRevoteByWithdrawal = wsCount >= wsNeeded;
  const proxyVotes: Record<string, number> = jd?.leaderProxyVotes || {};
  const proxyEntries = Object.entries(proxyVotes);
  const accusedIds = accused.map((a: any) => a.targetPhysicalId);
  const tiedCands = jd?.accused || jd?.candidates || [];
  const tie = (action: string) => run(() => emit('day:tie-action', { roomId, action, tiedCandidates: tiedCands }));

  return (
    <div className="px-3 pb-5">
      <div className="text-center mb-3">
        <div className="text-2xl">⚖️</div>
        <div className="font-bold text-lg text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>القرار</div>
        <div className="text-[9px] font-mono text-[#666] uppercase tracking-widest">انتهت التبريرات</div>
      </div>

      {/* نصاب السحب */}
      {votersTotal > 0 && (
        <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-3 mb-3 text-center">
          <div className="flex items-center justify-center gap-3 font-mono">
            <div><div className={`text-2xl font-black ${canRevoteByWithdrawal ? 'text-green-400' : 'text-blue-400'}`}>{wsCount}</div><div className="text-[10px] text-[#9a9a9a]">مسحوب</div></div>
            <div className="text-[#9a9a9a]">/</div>
            <div><div className="text-2xl font-black text-[#808080]">{wsNeeded}</div><div className="text-[10px] text-[#9a9a9a]">للنصاب</div></div>
            <div className="text-[#9a9a9a]">من</div>
            <div><div className="text-2xl font-black text-[#808080]">{votersTotal}</div><div className="text-[10px] text-[#9a9a9a]">مصوّت</div></div>
          </div>
          <div className="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mt-2">
            <div className={`h-full rounded-full ${canRevoteByWithdrawal ? 'bg-green-500' : 'bg-blue-500/50'}`} style={{ width: `${wsNeeded > 0 ? Math.min(100, (wsCount / wsNeeded) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {/* سحب الأصوات بالوكالة على المتّهمين */}
      {proxyEntries.length > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-[#0a0a0a] p-3 mb-3">
          <div className="text-orange-400 font-bold text-xs mb-2">🟠 أصوات بالوكالة</div>
          <div className="space-y-1.5">
            {proxyEntries.map(([voterId, candIdx]) => {
              const voter = gameState.players.find((p: any) => p.physicalId === parseInt(voterId));
              const cand = jd?.candidates?.[candIdx as number];
              const onAccused = cand && accusedIds.includes(cand.targetPhysicalId);
              const withdrawn = ws?.withdrawn?.includes(parseInt(voterId));
              return (
                <div key={voterId} className="flex items-center justify-between bg-[#0c0c0c] rounded-lg px-2.5 py-1.5 border border-[#222]">
                  <span className="text-[11px] font-mono text-white/80">#{voterId} {voter?.name} → <span className={onAccused ? 'text-red-400' : 'text-[#666]'}>#{cand?.targetPhysicalId}{onAccused ? ' (متّهم)' : ''}</span></span>
                  {onAccused && !withdrawn && <button onClick={() => run(() => emit('player:withdraw-vote', { physicalId: parseInt(voterId) }))} className="text-[10px] font-mono text-blue-300 bg-blue-500/10 border border-blue-500/30 px-2 py-1 rounded">🗳️ سحب</button>}
                  {withdrawn && <span className="text-[10px] font-mono text-green-400">✓ سُحب</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* أزرار القرار */}
      {isTie ? (
        <div className="space-y-2">
          <button onClick={() => tie('REVOTE')} disabled={busy} className="w-full py-3.5 rounded-xl border border-green-500/50 bg-[#0a1a0a] text-green-400 font-mono font-bold uppercase tracking-widest text-sm">🔁 إعادة التصويت {canRevoteByWithdrawal && <span className="text-[10px]">(النصاب ✅)</span>}</button>
          <button onClick={() => tie('NARROW')} disabled={busy} className="w-full py-3.5 rounded-xl border border-[#2a2a2a] bg-[#0e0e10] text-white font-mono uppercase tracking-widest text-sm">🎯 حصر بين المتعادلين</button>
          <button onClick={() => tie('ELIMINATE_ALL')} disabled={busy} className="w-full py-3.5 rounded-xl border border-[#8A0303] bg-[#8A0303]/20 text-[#e08a8a] font-mono font-bold uppercase tracking-widest text-sm">💀 إقصاء جميع المتعادلين</button>
        </div>
      ) : (
        <div className="space-y-2">
          <button onClick={() => run(() => emit('day:execute-elimination', { roomId, skipWithdrawal: true }))} disabled={busy} className="w-full py-4 rounded-xl border-2 border-[#8A0303] bg-[#8A0303]/20 text-white font-mono font-black uppercase tracking-widest">💀 تنفيذ الإقصاء</button>
          <button onClick={() => tie('REVOTE')} disabled={busy} className="w-full py-3.5 rounded-xl border-2 border-green-500/50 bg-[#0a1a0a] text-green-400 font-mono font-bold uppercase tracking-widest text-sm">🔁 إعادة التصويت {canRevoteByWithdrawal && <span className="text-[10px]">(النصاب ✅)</span>}</button>
        </div>
      )}
    </div>
  );
}
