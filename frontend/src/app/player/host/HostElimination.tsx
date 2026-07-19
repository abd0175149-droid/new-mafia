'use client';

// ══════════════════════════════════════════════════════
// 💀 HostElimination — دوك الكشف/التعادل للمضيف على الهاتف (بلغة الدوكات الموحّدة).
// يغطّي المسار الشائع: DAY_ELIMINATION (جاهز للحسم) → DAY_REVEALED (كُشفت الهوية) → التعادل.
// يبثّ نفس أحداث LeaderDayView حرفياً (day:trigger-reveal / night:start / night:begin-queue /
// game:confirm-end / day:tie-action). الحالات الخاصّة (قنبلة شيخ المافيا، تأجيل العمدة)
// تُفوَّض إلى LeaderDayView كما هي — لا تغيير في أي منطق لعب.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import { ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES } from '@/lib/constants';
import PhaseHeader from '@/components/PhaseHeader';
import { avatarThumb } from '@/lib/avatar';

interface Props {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (s: string) => void;
}

// صفّ مُقصىً مضغوط: مقعد + اسم + دور (بعين الليدر فقط قبل الكشف)
function EliminatedRow({ pid, name, role, avatarUrl }: { pid: number; name: string; role: string; avatarUrl?: string | null }) {
  const isMafia = (MAFIA_ROLES as string[]).includes(role);
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${isMafia ? 'border-[#8A0303]/40 bg-[#8A0303]/10' : 'border-[#1a1a1a] bg-[#0e0e10]'}`}>
      <span className="w-10 h-10 rounded-full overflow-hidden border border-[#2a2a2a] bg-[#131110] flex items-center justify-center shrink-0">
        {avatarUrl
          ? <img src={avatarThumb(avatarUrl) || avatarUrl} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-full h-full object-cover"
              onError={(e) => { const el = e.target as HTMLImageElement; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = avatarUrl; } }} />
          : <span className="font-mono text-[#C5A059] text-sm">#{pid}</span>}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-white/90 truncate">{name}</span>
        <span className="block text-[11px] font-mono text-[#9a9a9a]">#{pid}</span>
      </span>
      <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${isMafia ? 'text-[#ff6b6b] border-[#8A0303]/50 bg-[#8A0303]/15' : 'text-[#7fb4e6] border-[#3f83c4]/40 bg-[#3f83c4]/10'}`}>
        {(ROLE_ICONS as Record<string, string>)[role] || '🎭'} {(ROLE_NAMES as Record<string, string>)[role] || role}
      </span>
    </div>
  );
}

export default function HostElimination({ gameState, emit, setError }: Props) {
  const [busy, setBusy] = useState(false);
  const [nursePrompt, setNursePrompt] = useState(false);
  const run = async (fn: () => Promise<any>) => { setBusy(true); try { return await fn(); } catch (e: any) { setError(e?.message || 'تعذّر'); } finally { setBusy(false); } };
  const players: any[] = gameState.players || [];
  const nameOf = (pid: number) => players.find((p: any) => p.physicalId === pid)?.name || `#${pid}`;
  const avatarOf = (pid: number) => players.find((p: any) => p.physicalId === pid)?.avatarUrl || null;

  // ── DAY_ELIMINATION: جاهز للحسم — بطاقة نتيجة + زر كشف واحد بارز ──
  if (gameState.phase === 'DAY_ELIMINATION') {
    const pending = gameState.pendingResolution;
    const eliminatedIds: number[] = pending?.eliminated || [];
    const rolesMap: Record<number, string> = {};
    (pending?.revealedRoles || []).forEach((r: any) => { rolesMap[r.physicalId] = r.role; });

    return (
      <div className="px-3 pt-1 pb-5">
        <PhaseHeader icon="💀" title="اكتمل التصويت — جاهز للحسم" sub="AWAITING REVEAL" />
        <div className="rounded-2xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0a0a0b] p-3.5">
          <p className="text-center text-[10px] font-mono text-[#9a9a9a] mb-2.5">🔒 بعين المُوجِّه فقط — لم يُكشف بعد</p>
          <div className="space-y-2 mb-4">
            {eliminatedIds.map((pid) => (
              <EliminatedRow key={pid} pid={pid} name={nameOf(pid)}
                role={rolesMap[pid] || players.find((p: any) => p.physicalId === pid)?.role || 'UNKNOWN'}
                avatarUrl={avatarOf(pid)} />
            ))}
            {eliminatedIds.length === 0 && (
              <p className="text-center text-[#9a9a9a] text-xs py-3">لا مُقصَين هذه الجولة</p>
            )}
          </div>
          <button
            disabled={busy || !pending}
            onClick={() => run(() => emit('day:trigger-reveal', { roomId: gameState.roomId, result: gameState.pendingResolution }))}
            className="w-full py-3.5 bg-gradient-to-r from-[#8A0303] to-[#5e0202] text-white font-black text-sm rounded-xl disabled:opacity-40"
            style={{ boxShadow: '0 0 20px rgba(138,3,3,0.35)' }}
          >
            💀 كشف الهويّة لجميع اللاعبين
          </button>
          <p className="text-center text-[10px] text-[#9a9a9a] mt-2">الكشف يظهر على حلقة الطاولة عند الجميع</p>
        </div>
      </div>
    );
  }

  // ── DAY_REVEALED: كُشفت الهوية — بدء الليل أو إعلان الفائز ──
  if (gameState.phase === 'DAY_REVEALED') {
    const revealed = gameState.revealedData;
    const eliminated: number[] = revealed?.eliminated || [];
    const rolesMap: Record<number, string> = {};
    (revealed?.revealedRoles || []).forEach((r: any) => { rolesMap[r.physicalId] = r.role; });

    // ⚕️ سؤال تفعيل الممرضة (يأتي من night:start عند غياب الطبيب)
    if (nursePrompt) {
      return (
        <div className="px-3 pt-1 pb-5">
          <PhaseHeader icon="⚕️" title="الطبيب خارج اللعبة" />
          <div className="rounded-2xl border border-[#2E5C31]/50 bg-[#0a120b] p-4 text-center">
            <p className="text-sm text-[#c9c3b5] mb-4">هل تريد تفعيل الممرضة كبديلٍ للحماية هذه الليلة؟</p>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => run(async () => { await emit('night:begin-queue', { roomId: gameState.roomId, activateNurse: true }); setNursePrompt(false); })}
                className="flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 disabled:opacity-40">✅ تفعيل الممرضة</button>
              <button disabled={busy} onClick={() => run(async () => { await emit('night:begin-queue', { roomId: gameState.roomId, activateNurse: false }); setNursePrompt(false); })}
                className="flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-[#0e0e10] border border-[#2a2a2a] text-[#b3b3b3] disabled:opacity-40">بدون ممرضة</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="px-3 pt-1 pb-5">
        <PhaseHeader icon="💀" title="تمّ كشف الهويّة" sub="ELIMINATION COMPLETE" />
        <div className="rounded-2xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0a0a0b] p-3.5">
          <div className="space-y-2 mb-4">
            {eliminated.map((pid) => (
              <EliminatedRow key={pid} pid={pid} name={nameOf(pid)} role={rolesMap[pid] || 'UNKNOWN'} avatarUrl={avatarOf(pid)} />
            ))}
            {eliminated.length === 0 && <p className="text-center text-[#9a9a9a] text-xs py-3">لا مُقصَين — يوم بلا إعدام</p>}
          </div>
          {gameState.pendingWinner ? (
            <button disabled={busy}
              onClick={() => run(() => emit('game:confirm-end', { roomId: gameState.roomId }))}
              className="w-full py-3.5 bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm rounded-xl disabled:opacity-40 animate-pulse"
              style={{ boxShadow: '0 0 20px rgba(197,160,89,0.35)' }}>
              🏁 إعلان النتيجة للجميع
            </button>
          ) : (
            <button disabled={busy}
              onClick={() => run(async () => { const r = await emit('night:start', { roomId: gameState.roomId }); if (r?.nurseAvailable) setNursePrompt(true); })}
              className="w-full py-3.5 bg-gradient-to-r from-[#C5A059] to-[#b38b47] text-black font-black text-sm rounded-xl disabled:opacity-40"
              style={{ boxShadow: '0 0 20px rgba(197,160,89,0.3)' }}>
              🌙 بدء مرحلة الليل
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── DAY_TIEBREAKER: تعادل — أربعة خيارات بأهداف لمس كاملة ──
  if (gameState.phase === 'DAY_TIEBREAKER') {
    const tiedCands = gameState.justificationData?.accused || gameState.justificationData?.candidates || [];
    const tie = (action: string) => run(() => emit('day:tie-action', { roomId: gameState.roomId, action, tiedCandidates: tiedCands }));
    return (
      <div className="px-3 pt-1 pb-5">
        <PhaseHeader icon="⚖️" title="حالة تعادل!" sub="TIE BREAKER" />
        <div className="rounded-2xl border border-[#1a1a1a] bg-gradient-to-b from-[#0e0e10] to-[#0a0a0b] p-3.5 space-y-2">
          <button disabled={busy} onClick={() => tie('REVOTE')}
            className="w-full py-3.5 min-h-[48px] rounded-xl text-sm font-bold bg-[#C5A059]/10 border border-[#C5A059]/50 text-[#C5A059] disabled:opacity-40">🔁 إعادة التصويت</button>
          <button disabled={busy} onClick={() => tie('NARROW')}
            className="w-full py-3.5 min-h-[48px] rounded-xl text-sm font-bold bg-[#0e0e10] border border-[#2a2a2a] text-white/90 disabled:opacity-40">🎯 حصر التصويت بالمتعادلين</button>
          <button disabled={busy} onClick={() => tie('CANCEL')}
            className="w-full py-3.5 min-h-[48px] rounded-xl text-sm font-bold bg-[#0e0e10] border border-[#2a2a2a] text-[#b3b3b3] disabled:opacity-40">🌙 إلغاء التصويت والانتقال لليل</button>
          <button disabled={busy} onClick={() => tie('ELIMINATE_ALL')}
            className="w-full py-3.5 min-h-[48px] rounded-xl text-sm font-bold bg-[#8A0303]/15 border border-[#8A0303]/50 text-[#ff6b6b] disabled:opacity-40">💀 إقصاء جميع المتعادلين</button>
        </div>
      </div>
    );
  }

  return null;
}
