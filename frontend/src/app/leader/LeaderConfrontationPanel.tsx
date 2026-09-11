'use client';
// ══════════════════════════════════════════════════════
// ⚔️ لوحة مواجهات النهار الوجاهيّة — لليدر
//   compact: أثناء النقاش الجاري (الطلبات المعلّقة + المقبولة بانتظار نهاية النقاش)
//   full:    بعد آخر متحدّث (ابدأ المواجهة / التالي / إنهاء / إلغاء) + طلبٌ نيابةً عن لاعب
// المصدر الوحيد للحالة: day:get-confrontations عند التركيب ثم بثّ day:confrontation-updated.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';

export interface ConfItem {
  id: string; round: number; requesterPhysicalId: number; targetPhysicalId: number;
  status: 'PENDING' | 'ACCEPTED' | 'OPENING' | 'RESPONSE' | 'DONE' | 'DECLINED' | 'CANCELLED';
  createdAt: number; respondBy: number; timedOut?: boolean;
  acceptedBy?: 'TARGET' | 'LEADER'; declinedBy?: 'TARGET' | 'LEADER';
  stageSeconds: number; stageStartedAt?: number | null; finishedAt?: number;
}
export interface ConfPayload {
  round: number; enabled: boolean; perPlayer: number; maxPerRound: number;
  respondSeconds: number; stageSeconds: number; used: Record<string, number>;
  confrontations: ConfItem[]; serverTime: number; event?: string; id?: string | null;
}

interface Props {
  gameState: any;
  emit: (event: string, data: any) => Promise<any>;
  setError: (msg: string) => void;
  mode: 'compact' | 'full';
}

export const STATUS_AR: Record<ConfItem['status'], string> = {
  PENDING: 'بانتظار الردّ', ACCEPTED: 'مقبولة — بانتظار البدء', OPENING: 'كلمة الطالب',
  RESPONSE: 'ردّ المستهدَف', DONE: 'نُفِّذت', DECLINED: 'مرفوضة', CANCELLED: 'أُلغيت',
};

export default function LeaderConfrontationPanel({ gameState, emit, setError, mode }: Props) {
  const [conf, setConf] = useState<ConfPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [proxyReq, setProxyReq] = useState<number | ''>('');
  const [proxyTgt, setProxyTgt] = useState<number | ''>('');
  const roomId = gameState?.roomId;
  const roomRef = useRef(roomId);
  roomRef.current = roomId;

  const refresh = async () => {
    try {
      const r = await emit('day:get-confrontations', { roomId: roomRef.current });
      if (r?.success) setConf(r);
    } catch { /* الحالة تصل بالبثّ */ }
  };

  useEffect(() => {
    if (!roomId) return;
    refresh();
    const s = getSocket();
    const onUpd = (p: ConfPayload) => setConf(p);
    const onPhase = (d: any) => { if (d?.phase === 'DAY_DISCUSSION') refresh(); };
    s.on('day:confrontation-updated', onUpd);
    s.on('game:phase-changed', onPhase);
    s.on('room:seats-remapped', refresh);
    return () => {
      s.off('day:confrontation-updated', onUpd);
      s.off('game:phase-changed', onPhase);
      s.off('room:seats-remapped', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const list = conf?.confrontations || [];
  const live = list.some(c => c.status === 'PENDING' || c.status === 'OPENING' || c.status === 'RESPONSE');
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [live]);

  const nameOf = (pid: number) => gameState?.players?.find((p: any) => p.physicalId === pid)?.name || `#${pid}`;
  const act = async (id: string, action: string) => {
    setBusy(id + action);
    try {
      const r = await emit('day:confrontation', { roomId, id, action });
      if (!r?.success) setError(r?.error || 'تعذّر تنفيذ الإجراء');
    } catch (e: any) { setError(e?.message || 'تعذّر تنفيذ الإجراء'); }
    finally { setBusy(null); }
  };
  const setSettings = async (patch: { enabled?: boolean; perPlayer?: number }) => {
    try {
      const r = await emit('leader:confrontation-settings', { roomId, ...patch });
      if (!r?.success) setError(r?.error || 'تعذّر تغيير الإعداد');
      else refresh();
    } catch (e: any) { setError(e?.message || 'تعذّر تغيير الإعداد'); }
  };
  const proxyRequest = async () => {
    if (!proxyReq || !proxyTgt) return;
    setBusy('proxy');
    try {
      const r = await emit('day:request-confrontation', { roomId, requesterPhysicalId: proxyReq, targetPhysicalId: proxyTgt });
      if (!r?.success) setError(r?.error || 'تعذّر إرسال الطلب');
      else { setProxyReq(''); setProxyTgt(''); }
    } catch (e: any) { setError(e?.message || 'تعذّر إرسال الطلب'); }
    finally { setBusy(null); }
  };

  const enabled = conf ? conf.enabled : gameState?.config?.confrontationEnabled === true;
  const perPlayer = conf?.perPlayer ?? gameState?.config?.confrontationsPerPlayer ?? 1;
  const pending = list.filter(c => c.status === 'PENDING');
  const accepted = list.filter(c => c.status === 'ACCEPTED');
  const active = list.find(c => c.status === 'OPENING' || c.status === 'RESPONSE') || null;
  const finished = list.filter(c => c.status === 'DONE' || c.status === 'DECLINED' || c.status === 'CANCELLED');
  const counted = list.filter(c => ['ACCEPTED', 'OPENING', 'RESPONSE', 'DONE'].includes(c.status)).length;

  // في الوضع المضغوط لا نشغل الشاشة إن كانت الميزة مطفأة ولا شيء قائم
  if (mode === 'compact' && !enabled && list.length === 0) return null;

  const secsLeft = (deadline: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
  const alive = (gameState?.players || []).filter((p: any) => p.isAlive);

  return (
    <div className={`w-full noir-card border-[#2a2a2a] ${mode === 'compact' ? 'p-3 mb-4' : 'p-5 mb-6'}`} dir="rtl">
      {/* ── الرأس + الإعدادات ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[#C5A059] font-black" style={{ fontFamily: 'Amiri, serif' }}>⚔️ المواجهات</span>
          <span className="text-[10px] font-mono text-[#666]">{counted}/{conf?.maxPerRound ?? 2} هذه الجولة</span>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'full' && (
            <select
              value={perPlayer}
              onChange={(e) => setSettings({ perPlayer: Number(e.target.value) })}
              className="bg-[#050505] border border-[#2a2a2a] text-white text-[11px] px-2 py-1 rounded"
              title="حدّ المواجهات لكلّ لاعب في اللعبة"
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} لكلّ لاعب</option>)}
            </select>
          )}
          <button
            onClick={() => setSettings({ enabled: !enabled })}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors ${enabled ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300' : 'bg-[#1a1a1a] border-[#333] text-gray-500 hover:border-[#555]'}`}
          >
            {enabled ? '✓ مفعّلة' : 'معطّلة'}
          </button>
        </div>
      </div>

      {/* ── المواجهة الجارية ── */}
      {active && (
        <div className="mt-3 p-4 rounded-xl border border-[#C5A059] bg-[#C5A059]/5">
          <div className="grid grid-cols-2 gap-3">
            {[{ pid: active.requesterPhysicalId, label: 'الطالب', on: active.status === 'OPENING' },
              { pid: active.targetPhysicalId, label: 'المستهدَف', on: active.status === 'RESPONSE' }].map(side => (
              <div key={side.pid} className={`p-3 rounded-lg border text-center ${side.on ? 'border-[#C5A059] bg-[#C5A059]/10' : 'border-[#2a2a2a] opacity-60'}`}>
                <p className="text-[10px] font-mono text-[#808080]">{side.label}</p>
                <p className="text-2xl font-mono text-white">#{side.pid}</p>
                <p className="text-sm text-white truncate">{nameOf(side.pid)}</p>
                {side.on && <p className="text-[10px] text-[#C5A059] mt-1 animate-pulse">🎙️ يتحدّث الآن</p>}
              </div>
            ))}
          </div>
          <div className="text-center mt-3">
            <span className="text-5xl font-black font-mono text-white">
              {active.stageStartedAt ? secsLeft(active.stageStartedAt + active.stageSeconds * 1000) : active.stageSeconds}
            </span>
            <span className="text-xs text-[#808080] font-mono mr-2">ث — {STATUS_AR[active.status]}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {active.status === 'OPENING' ? (
              <button disabled={!!busy} onClick={() => act(active.id, 'next')} className="bg-green-900 border border-green-500 text-white py-3 font-bold text-sm">⏭ ردّ المستهدَف</button>
            ) : <div />}
            <button disabled={!!busy} onClick={() => act(active.id, 'end')} className="bg-[#111] border border-[#555] text-white py-3 font-bold text-sm hover:border-[#C5A059]">✅ إنهاء المواجهة</button>
            <button disabled={!!busy} onClick={() => act(active.id, 'cancel')} className="bg-[#8A0303]/10 border border-[#8A0303]/50 text-[#ffccd5] py-3 font-bold text-sm">✕ إلغاء</button>
          </div>
        </div>
      )}

      {/* ── طلبات معلّقة ── */}
      {pending.map(c => (
        <div key={c.id} className="mt-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-white">
            <span className="font-bold">#{c.requesterPhysicalId} {nameOf(c.requesterPhysicalId)}</span>
            <span className="text-[#808080] mx-2">يطلب مواجهة</span>
            <span className="font-bold">#{c.targetPhysicalId} {nameOf(c.targetPhysicalId)}</span>
            <p className="text-[10px] font-mono text-amber-300/80 mt-1">
              {c.timedOut ? '⏰ انقضت مهلة الردّ — القرار لك' : `بانتظار ردّ المستهدَف — ${secsLeft(c.respondBy)}ث`}
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={!!busy} onClick={() => act(c.id, 'approve')} className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 text-xs font-bold">✓ قبول نيابةً</button>
            <button disabled={!!busy} onClick={() => act(c.id, 'decline')} className="px-3 py-2 rounded-lg bg-[#8A0303]/10 border border-[#8A0303]/50 text-[#ffccd5] text-xs font-bold">✕ رفض</button>
          </div>
        </div>
      ))}

      {/* ── مقبولة بانتظار البدء ── */}
      {accepted.map(c => (
        <div key={c.id} className="mt-3 p-3 rounded-xl border border-[#C5A059]/40 bg-[#C5A059]/5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-white">
            <span className="font-bold">#{c.requesterPhysicalId} {nameOf(c.requesterPhysicalId)}</span>
            <span className="text-[#808080] mx-2">⚔️</span>
            <span className="font-bold">#{c.targetPhysicalId} {nameOf(c.targetPhysicalId)}</span>
            <p className="text-[10px] font-mono text-[#C5A059]/80 mt-1">
              {c.acceptedBy === 'LEADER' ? 'قُبلت نيابةً' : 'قبِلها المستهدَف'} — {mode === 'compact' ? 'تُنفَّذ بعد آخر متحدّث' : 'جاهزة للبدء'}
            </p>
          </div>
          <div className="flex gap-2">
            {mode === 'full' && !active && (
              <button disabled={!!busy} onClick={() => act(c.id, 'start')} className="btn-premium px-5 py-2"><span className="text-white text-xs font-bold">⚔️ ابدأ المواجهة</span></button>
            )}
            <button disabled={!!busy} onClick={() => act(c.id, 'cancel')} className="px-3 py-2 rounded-lg bg-[#8A0303]/10 border border-[#8A0303]/50 text-[#ffccd5] text-xs font-bold">✕ إلغاء</button>
          </div>
        </div>
      ))}

      {/* ── المنتهية (مختصر) ── */}
      {mode === 'full' && finished.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {finished.map(c => (
            <span key={c.id} className={`text-[10px] font-mono px-2 py-1 rounded border ${c.status === 'DONE' ? 'border-emerald-500/30 text-emerald-300' : 'border-[#8A0303]/40 text-[#ffccd5]/80'}`}>
              #{c.requesterPhysicalId} ← #{c.targetPhysicalId}: {STATUS_AR[c.status]}{c.status === 'DECLINED' ? (c.declinedBy === 'LEADER' ? ' (الليدر)' : ' (المستهدَف)') : ''}
            </span>
          ))}
        </div>
      )}

      {/* ── طلبٌ نيابةً عن لاعب (لمن لا هاتف معه) ── */}
      {mode === 'full' && enabled && !active && (
        <div className="mt-4 pt-3 border-t border-[#2a2a2a]">
          <p className="text-[10px] font-mono text-[#808080] mb-2">طلب مواجهة نيابةً عن لاعب (يُستهلك رصيده عند القبول)</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <select value={proxyReq} onChange={e => setProxyReq(e.target.value ? Number(e.target.value) : '')} className="bg-[#050505] border border-[#2a2a2a] text-white text-xs p-2">
              <option value="">الطالب</option>
              {alive.map((p: any) => <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name} ({(conf?.used?.[p.physicalId] || 0)}/{perPlayer})</option>)}
            </select>
            <select value={proxyTgt} onChange={e => setProxyTgt(e.target.value ? Number(e.target.value) : '')} className="bg-[#050505] border border-[#2a2a2a] text-white text-xs p-2">
              <option value="">المستهدَف</option>
              {alive.filter((p: any) => p.physicalId !== proxyReq).map((p: any) => <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>)}
            </select>
            <button disabled={!proxyReq || !proxyTgt || !!busy} onClick={proxyRequest} className="px-4 bg-[#111] border border-[#555] text-white text-xs font-bold hover:border-[#C5A059] disabled:opacity-40">إرسال</button>
          </div>
        </div>
      )}

      {mode === 'full' && enabled && list.length === 0 && (
        <p className="text-[11px] text-[#666] mt-3 text-center">لا طلبات مواجهة في هذه الجولة</p>
      )}
      {mode === 'full' && !enabled && (
        <p className="text-[11px] text-[#666] mt-3 text-center">الميزة معطّلة — فعّلها ليتمكّن اللاعبون من طلب مواجهة أثناء النقاش</p>
      )}
    </div>
  );
}
