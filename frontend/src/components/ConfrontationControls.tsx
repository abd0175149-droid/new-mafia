'use client';

// ══════════════════════════════════════════════════════
// ⚔️ ConfrontationControls — واجهة المواجهة الثنائية (عن بُعد)
// ══════════════════════════════════════════════════════
// يتكيّف حسب الدور: زر الطلب + اختيار الخصم (لاعب) / موافقة الطرف / لوحة الليدر /
// شريط المواجهة النشطة + عدّاد 30ث (للجميع).

import { useEffect, useState } from 'react';
import type { ConfrontationState } from '../hooks/useActiveSpeaker';

interface Props {
  confrontation: ConfrontationState | null;
  myPid: number | null;
  isHost: boolean;
  players: any[];        // للاختيار وأسماء العرض
  emit: (event: string, payload: any) => Promise<any>;
  roomId: string | null;
  gamePhase: string | null;
}

export default function ConfrontationControls({ confrontation, myPid, isHost, players, emit, roomId, gamePhase }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const active = confrontation?.status === 'ACTIVE';
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(iv);
  }, [active]);

  const nameOf = (pid: number) => players.find((p) => p.physicalId === pid)?.name || `#${pid}`;

  const send = async (event: string, payload: any) => {
    setBusy(true); setErr(null);
    try {
      const res = await emit(event, { roomId, ...payload });
      if (!res?.success) setErr(mapErr(res?.error));
      setPickerOpen(false);
    } catch (e: any) { setErr(e?.message || 'خطأ'); }
    finally { setBusy(false); }
  };

  // ── مواجهة نشطة: شريط + عدّاد (للجميع) ──
  if (active && confrontation) {
    void tick;
    const remaining = confrontation.startedAt
      ? Math.max(0, Math.round((confrontation.durationSeconds || 30) - (Date.now() - confrontation.startedAt) / 1000))
      : (confrontation.durationSeconds || 30);
    const mine = myPid === confrontation.requesterId || myPid === confrontation.targetId;
    return (
      <div className="mb-3 rounded-xl border border-red-500/40 bg-gradient-to-r from-red-950/40 to-black px-3 py-2.5 text-center">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 text-red-300 font-black text-sm" style={{ fontFamily: 'Amiri, serif' }}>
          <span className="truncate text-left" dir="auto"><span className="font-mono">#{confrontation.requesterId}</span> {nameOf(confrontation.requesterId)}</span>
          <span className="shrink-0">⚔️ ×</span>
          <span className="truncate text-right" dir="auto"><span className="font-mono">#{confrontation.targetId}</span> {nameOf(confrontation.targetId)}</span>
        </div>
        <div className={`mt-1 font-mono font-black text-2xl ${remaining <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{remaining}s</div>
        {mine && <div className="text-[11px] text-red-300/80 mt-0.5">مايكك مفتوح — تكلّم الآن</div>}
      </div>
    );
  }

  // ── الطرف المستهدَف: موافقة/رفض ──
  if (confrontation?.status === 'PENDING_TARGET' && confrontation.targetId === myPid && !isHost) {
    return (
      <div className="mb-3 rounded-xl border border-[#C5A059]/50 bg-[#C5A059]/10 px-3 py-2.5 text-center">
        <div className="text-[#C5A059] font-bold text-sm mb-2">
          ⚔️ {nameOf(confrontation.requesterId)} يطلب مواجهتك
        </div>
        <div className="flex gap-2 justify-center">
          <button disabled={busy} onClick={() => send('player:respond-confrontation', { accept: true })}
            className="px-5 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 disabled:opacity-40">قبول</button>
          <button disabled={busy} onClick={() => send('player:respond-confrontation', { accept: false })}
            className="px-5 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-red-500/15 border border-red-500/50 text-red-300 disabled:opacity-40">رفض</button>
        </div>
        {err && <div className="text-[10px] text-red-400/80 mt-1">{err}</div>}
      </div>
    );
  }

  // ── لوحة الليدر: اعتماد/رفض ──
  if (confrontation?.status === 'PENDING_LEADER' && isHost) {
    return (
      <div className="mb-3 rounded-xl border border-[#C5A059]/50 bg-[#C5A059]/10 px-3 py-2.5 text-center">
        <div className="text-[#C5A059] font-bold text-sm mb-2">
          ⚔️ طلب مواجهة: {nameOf(confrontation.requesterId)} × {nameOf(confrontation.targetId)} (وافقا)
        </div>
        <div className="flex gap-2 justify-center">
          <button disabled={busy} onClick={() => send('leader:approve-confrontation', { approve: true })}
            className="px-5 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 disabled:opacity-40">اعتمِد (30ث)</button>
          <button disabled={busy} onClick={() => send('leader:approve-confrontation', { approve: false })}
            className="px-5 py-3 min-h-[44px] rounded-xl text-sm font-bold bg-red-500/15 border border-red-500/50 text-red-300 disabled:opacity-40">ارفض</button>
        </div>
        {err && <div className="text-[10px] text-red-400/80 mt-1">{err}</div>}
      </div>
    );
  }

  // ── حالات انتظار ──
  if (confrontation?.status === 'PENDING_TARGET' && confrontation.requesterId === myPid) {
    return <div className="mb-3 rounded-xl border border-[#2a2a2a] bg-black/40 px-3 py-2 text-center text-xs text-[#808080] font-mono">⚔️ بانتظار موافقة {nameOf(confrontation.targetId)}…</div>;
  }
  if (confrontation?.status === 'PENDING_LEADER' && !isHost) {
    return <div className="mb-3 rounded-xl border border-[#2a2a2a] bg-black/40 px-3 py-2 text-center text-xs text-[#808080] font-mono">⚔️ بانتظار موافقة المُوجِّه…</div>;
  }

  // ── لا مواجهة + لاعب + نقاش: زر الطلب + المُنتقي ──
  if (!confrontation && !isHost && gamePhase === 'DAY_DISCUSSION' && myPid != null) {
    const targets = players.filter((p) => p.isAlive && p.physicalId !== myPid);
    return (
      <div className="mb-3">
        {!pickerOpen ? (
          <button onClick={() => { setPickerOpen(true); setErr(null); }}
            className="w-full px-3 py-3 min-h-[44px] rounded-xl text-sm font-bold border border-red-500/40 text-red-300 bg-red-500/10">
            ⚔️ اطلب مواجهة لاعب
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/40 bg-black/50 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-red-300">اختر خصمك للمواجهة</span>
              <button onClick={() => setPickerOpen(false)} className="w-9 h-9 -me-1.5 flex items-center justify-center rounded-lg text-[#808080] text-base">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto overscroll-contain">
              {targets.map((p) => (
                <button key={p.physicalId} disabled={busy}
                  onClick={() => send('player:request-confrontation', { targetPhysicalId: p.physicalId })}
                  className="px-2.5 py-3 min-h-[44px] rounded-lg text-xs font-bold border border-[#2a2a2a] bg-[#0a0a0a] text-white disabled:opacity-40 truncate">
                  <span className="font-mono text-[#C5A059]">#{p.physicalId}</span> {p.name}
                </button>
              ))}
            </div>
            {err && <div className="text-[10px] text-red-400/80 mt-1 text-center">{err}</div>}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function mapErr(code?: string): string {
  switch (code) {
    case 'max_reached': return 'استُنفد حدّ المواجهات لهذه الجولة (3)';
    case 'confrontation_in_progress': return 'هناك مواجهة جارية';
    case 'discussion_only': return 'المواجهة أثناء النقاش فقط';
    case 'must_be_alive': return 'كلا الطرفين يجب أن يكونا أحياء';
    case 'not_target': return 'لست الطرف المستهدَف';
    case 'only_leader': return 'المُوجِّه فقط';
    default: return code || 'تعذّر';
  }
}
