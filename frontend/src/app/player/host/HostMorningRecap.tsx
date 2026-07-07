'use client';

// ══════════════════════════════════════════════════════
// 🌅 HostMorningRecap — عرض أحداث الصباح للمضيف على الهاتف (عمود واحد نظيف).
// يحلّ محلّ تخطيط LeaderNightView ثنائيّ الأعمدة (سطح مكتب) في طور MORNING_RECAP.
// كروت اللاعبين الناجين تظهر على حلقة PhoneSpectatorView فوق هذا العرض — فلا نُكرّرها.
// يفوّض تدفّق الشرطية (حالة خاصّة نادرة) إلى LeaderNightView كما هو.
// ══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import LeaderNightView from '@/app/leader/LeaderNightView';

const EVENT_META: Record<string, { icon: string; title: string; color: string; displayable: boolean }> = {
  ASSASSINATION:         { icon: '🩸', title: 'اغتيال ناجح', color: 'text-[#e08a8a]', displayable: true },
  ASSASSINATION_BLOCKED: { icon: '🛡️', title: 'فشل الاغتيال — نجت الحماية', color: 'text-[#8fc3ea]', displayable: true },
  PROTECTION_FAILED:     { icon: '💔', title: 'حماية فاشلة', color: 'text-[#c79a6a]', displayable: false },
  SILENCED:              { icon: '🤐', title: 'تمّ إسكات لاعب', color: 'text-[#999]', displayable: false },
  SNIPE_MAFIA:           { icon: '🎯', title: 'القنّاص أصاب مافيا', color: 'text-[#C5A059]', displayable: true },
  SNIPE_CITIZEN:         { icon: '💀', title: 'القنّاص أصاب مواطناً', color: 'text-[#e08a8a]', displayable: true },
  SHERIFF_RESULT:        { icon: '🔍', title: 'نتيجة تحقيق الشريف', color: 'text-[#C5A059]', displayable: false },
  ASSASSIN_KILL:         { icon: '🔪', title: 'السفّاح اغتال', color: 'text-[#e0728a]', displayable: true },
  ASSASSIN_BLOCKED:      { icon: '🛡️', title: 'حماية ضدّ السفّاح', color: 'text-[#8fc3ea]', displayable: true },
  ABILITY_DISABLED:      { icon: '🧙‍♀️', title: 'تعطيل قدرة', color: 'text-[#b98be0]', displayable: true },
  POLICEWOMAN_EXECUTION: { icon: '👮‍♀️', title: 'إعدام الشرطية', color: 'text-[#b98be0]', displayable: true },
  TWIN_SUICIDE:          { icon: '🩸', title: 'انتحار التوأم', color: 'text-[#e08a8a]', displayable: true },
  TWIN_TRANSFORM:        { icon: '🌑', title: 'الصحوة المظلمة', color: 'text-[#b98be0]', displayable: true },
};

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

export default function HostMorningRecap({ gameState, emit, setError }: Props) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRevealed(new Set()); }, [gameState.round]);

  // تدفّق الشرطية (نادر) — نفوّضه لـ LeaderNightView كما هو
  if (gameState.policewomanChoice) {
    return <LeaderNightView gameState={gameState} emit={emit} setError={setError} />;
  }

  const events: any[] = gameState.morningEvents || [];
  const displayableCount = events.filter((e) => EVENT_META[e.type]?.displayable !== false).length;
  const allRevealed = events.every((e, i) => EVENT_META[e.type]?.displayable === false || revealed.has(i));

  const reveal = async (i: number) => {
    try { await emit('night:display-event', { roomId: gameState.roomId, eventIndex: i }); setRevealed((p) => new Set(p).add(i)); }
    catch (e: any) { setError(e?.message || 'تعذّر عرض الحدث'); }
  };
  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };

  return (
    <div className="px-3 pb-5">
      <div className="text-center mb-3">
        <div className="text-3xl leading-none">☀️</div>
        <div className="font-bold text-lg text-white" style={{ fontFamily: 'Amiri, serif' }}>ملخّص الليلة</div>
        <div className="text-[9px] font-mono text-[#666] tracking-widest uppercase mt-0.5">{events.length} تقرير</div>
      </div>

      {events.length === 0 ? (
        <div className="text-center text-[#555] py-8 font-mono text-sm">لا أحداث هذه الليلة · لا خسائر</div>
      ) : (
        <div className="space-y-2">
          {events.map((ev, i) => {
            const m = EVENT_META[ev.type] || { icon: '❓', title: ev.type, color: 'text-[#888]', displayable: true };
            const isRev = revealed.has(i);
            const secret = m.displayable === false;
            const isSheriff = ev.type === 'SHERIFF_RESULT';
            return (
              <div key={i} className={`rounded-xl border p-3 bg-gradient-to-b from-[#0c0c0d] to-[#090909] ${isRev ? 'border-[#2E5C31]/40' : secret ? 'border-[#C5A059]/25' : 'border-[#1a1a1a]'}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl shrink-0">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold text-sm ${m.color} flex items-center gap-1.5`} style={{ fontFamily: 'Amiri, serif' }}>
                      {m.title}
                      {ev.wasRandom && <span className="text-[8px] font-mono text-[#C5A059]/70">🎲 تلقائي</span>}
                    </div>
                    {ev.targetName != null && (
                      <div className="text-[11px] font-mono text-white/85 mt-0.5">
                        #{ev.targetPhysicalId} {ev.targetName}
                        {ev.extra?.targetRole && <span className="text-[#666]"> · {ev.extra.targetRole}</span>}
                      </div>
                    )}
                    {ev.performerName != null && (
                      <div className="text-[9px] font-mono text-[#555] mt-0.5">← #{ev.performerPhysicalId} {ev.performerName}</div>
                    )}
                    {isSheriff && ev.extra && (
                      <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-sm font-black ${ev.extra.result === 'MAFIA' ? 'border-[#ff4444]/40 bg-[#ff4444]/10 text-[#ff6b6b]' : 'border-[#44ff44]/30 bg-[#44ff44]/10 text-[#6be06b]'}`} style={{ fontFamily: 'Amiri, serif' }}>
                        {ev.extra.result === 'MAFIA' ? '🎭 مافيا' : '🏛 مواطن'}
                        <span className="text-[8px] font-mono text-[#888]">🔒 سرّي لك</span>
                      </div>
                    )}
                  </div>
                  {m.displayable !== false ? (
                    <button onClick={() => reveal(i)}
                      className={`shrink-0 px-2.5 py-2 rounded-lg text-[10px] font-mono font-bold border transition-colors ${isRev ? 'border-[#555]/40 text-[#888]' : 'border-[#C5A059]/50 text-[#C5A059] bg-[#C5A059]/5 animate-pulse'}`}>
                      {isRev ? '🔄 إعادة' : '👁 عرض'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[8px] font-mono text-[#C5A059]/60 border border-[#C5A059]/20 rounded px-1.5 py-1.5">سرّي</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        {gameState.pendingWinner ? (
          <button onClick={() => run(() => emit('game:confirm-end', { roomId: gameState.roomId }))} disabled={busy || (!allRevealed && displayableCount > 0)}
            className="btn-premium w-full !py-3.5 !rounded-xl disabled:opacity-40"><span>🏁 عرض النتيجة</span></button>
        ) : (
          <button onClick={() => run(() => emit('night:end-recap', { roomId: gameState.roomId }))} disabled={busy || (!allRevealed && displayableCount > 0)}
            className="btn-premium w-full !py-3.5 !rounded-xl disabled:opacity-40"><span>☀️ بدء نقاش اليوم</span></button>
        )}
        {!allRevealed && displayableCount > 0 && (
          <p className="text-center text-[#555] font-mono text-[9px] mt-2 tracking-widest">اعرض جميع الأحداث أولاً</p>
        )}
      </div>
    </div>
  );
}
