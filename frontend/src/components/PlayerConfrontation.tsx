'use client';
// ══════════════════════════════════════════════════════
// ⚔️ مواجهة النهار — جانب اللاعب (هاتفه)
//   زرّ «اطلب مواجهة» بجانب الاتفاقيّات (يُخفى إن كانت الميزة مطفأة)، طبقةُ اختيار
//   المستهدَف، بطاقةُ الردّ للمستهدَف (٢٠ث)، وبطاقة «كلمتك الآن» أثناء التنفيذ.
// الحالة من day:confrontation-updated + استعادة من room:get-my-state (confrontationState).
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import type { ConfPayload, ConfItem } from '@/app/leader/LeaderConfrontationPanel';

interface Props {
  roomId?: string;
  emit: any;
  on: any;
  myId: number;
  players: Array<{ physicalId: number; name: string; avatarUrl?: string | null }>;
  round?: number;
  isDead: boolean;
  initial?: ConfPayload | null;
}

export default function PlayerConfrontation({ roomId, emit, on, myId, players, round, isDead, initial }: Props) {
  const [conf, setConf] = useState<ConfPayload | null>(initial || null);
  const [sheet, setSheet] = useState(false);
  const [target, setTarget] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const roomRef = useRef(roomId); roomRef.current = roomId;

  useEffect(() => { if (initial) setConf(initial); }, [initial]);

  useEffect(() => {
    if (!on) return;
    const c1 = on('day:confrontation-updated', (p: ConfPayload) => { setConf(p); setErr(''); });
    const c2 = on('game:phase-changed', (d: any) => {
      if (d?.phase !== 'DAY_DISCUSSION') { setConf(null); setSheet(false); setTarget(''); }
      else if (roomRef.current && emit) emit('day:get-confrontations', { roomId: roomRef.current }).then((r: any) => { if (r?.success) setConf(r); }).catch(() => {});
    });
    const c3 = on('room:seats-remapped', () => {
      setConf(null); setSheet(false); setTarget('');
      if (roomRef.current && emit) emit('day:get-confrontations', { roomId: roomRef.current }).then((r: any) => { if (r?.success && r.phase === 'DAY_DISCUSSION') setConf(r); }).catch(() => {});
    });
    return () => { c1?.(); c2?.(); c3?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, emit]);

  const list = conf?.confrontations || [];
  const mine = list.filter(c => c.requesterPhysicalId === myId || c.targetPhysicalId === myId);
  const live = mine.some(c => c.status === 'PENDING' || c.status === 'LIVE');
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [live]);

  if (!conf?.enabled || isDead) return null;

  const nameOf = (pid: number) => players.find(p => p.physicalId === pid)?.name || `لاعب #${pid}`;
  const secsLeft = (dl: number) => Math.max(0, Math.ceil((dl - now) / 1000));
  const used = conf.used?.[myId] || 0;
  const budget = Math.max(0, (conf.perPlayer || 1) - used);
  const counted = list.filter(c => ['ACCEPTED', 'LIVE', 'DONE'].includes(c.status)).length;
  const roundOk = true; // قرار المالك: المواجهة من الجولة الأولى

  const incoming = list.find(c => c.status === 'PENDING' && c.targetPhysicalId === myId) || null;
  const outgoing = list.find(c => c.status === 'PENDING' && c.requesterPhysicalId === myId) || null;
  const acceptedMine = list.find(c => c.status === 'ACCEPTED' && (c.requesterPhysicalId === myId || c.targetPhysicalId === myId)) || null;
  const active = list.find(c => c.status === 'LIVE') || null;
  const declinedMine = list.find(c => c.status === 'DECLINED' && c.requesterPhysicalId === myId) || null;
  const hasLiveMine = !!(incoming || outgoing || acceptedMine || (active && (active.requesterPhysicalId === myId || active.targetPhysicalId === myId)));

  const request = async () => {
    if (!target || !roomId) return;
    setBusy(true); setErr('');
    try {
      const r = await emit('day:request-confrontation', { roomId, targetPhysicalId: target });
      if (!r?.success) setErr(r?.error || 'تعذّر إرسال الطلب');
      else { setSheet(false); setTarget(''); }
    } catch (e: any) { setErr(e?.message || 'تعذّر إرسال الطلب'); }
    finally { setBusy(false); }
  };
  const respond = async (c: ConfItem, accept: boolean) => {
    setBusy(true); setErr('');
    try {
      const r = await emit('day:respond-confrontation', { roomId, id: c.id, accept });
      if (!r?.success) setErr(r?.error || 'تعذّر إرسال الردّ');
    } catch (e: any) { setErr(e?.message || 'تعذّر إرسال الردّ'); }
    finally { setBusy(false); }
  };

  const canRequest = roundOk && budget > 0 && !hasLiveMine && counted < (conf.maxPerRound || 2) && !active;
  const targets = players.filter(p => p.physicalId !== myId);
  const targetedIds = new Set(list.filter(c => c.status !== 'DECLINED' && c.status !== 'CANCELLED').map(c => c.targetPhysicalId));

  return (
    <div className="mb-3 space-y-2" dir="rtl">
      {/* ── المستهدَف: بطاقة الردّ ── */}
      {incoming && (
        <div className="p-4 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 text-center animate-[pulse_2s_ease-in-out_infinite]">
          <p className="text-amber-300 text-sm font-black">⚔️ {nameOf(incoming.requesterPhysicalId)} يطلب مواجهتك</p>
          <p className="text-[#bbb] text-[11px] mt-1">تُنفَّذ بعد آخر متحدّث: تتحدّثان معاً بمؤقّتٍ واحد — هل تقبل؟</p>
          <p className="text-2xl font-mono text-white mt-2">{incoming.timedOut ? 'بانتظار الليدر' : `${secsLeft(incoming.respondBy)}ث`}</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button disabled={busy} onClick={() => respond(incoming, true)} className="py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-bold text-sm">✓ أقبل</button>
            <button disabled={busy} onClick={() => respond(incoming, false)} className="py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 font-bold text-sm">✕ أرفض</button>
          </div>
          <p className="text-[10px] text-[#888] mt-2">الرفض يُعلَن على الشاشة</p>
        </div>
      )}

      {/* ── الطالب: بانتظار الردّ ── */}
      {outgoing && (
        <div className="p-3.5 rounded-xl border border-[#C5A059]/40 bg-[#C5A059]/5 text-center">
          <p className="text-[#C5A059] text-sm font-bold">⚔️ طلبت مواجهة {nameOf(outgoing.targetPhysicalId)}</p>
          <p className="text-[#999] text-[11px] mt-1">{outgoing.timedOut ? 'انقضت مهلة الردّ — القرار لليدر' : `بانتظار ردّه — ${secsLeft(outgoing.respondBy)}ث`}</p>
        </div>
      )}

      {/* ── مقبولة بانتظار التنفيذ ── */}
      {acceptedMine && !active && (
        <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-center">
          <p className="text-emerald-300 text-sm font-bold">✓ المواجهة مقبولة</p>
          <p className="text-[#999] text-[11px] mt-1">
            {acceptedMine.requesterPhysicalId === myId ? `ستواجه ${nameOf(acceptedMine.targetPhysicalId)}` : `سيواجهك ${nameOf(acceptedMine.requesterPhysicalId)}`} بعد آخر متحدّث — الليدر يبدؤها
          </p>
        </div>
      )}

      {/* ── جارية: الطرفان يتحدّثان معاً بمؤقّتٍ واحد ── */}
      {active && (() => {
        const meReq = active.requesterPhysicalId === myId, meTgt = active.targetPhysicalId === myId;
        const left = active.stageStartedAt ? secsLeft(active.stageStartedAt + active.stageSeconds * 1000) : active.stageSeconds;
        if (!meReq && !meTgt) return (
          <div className="p-3 rounded-xl border border-[#2a2a2a] bg-white/5 text-center text-[11px] text-[#999]">
            ⚔️ مواجهة جارية: <b className="text-white">{nameOf(active.requesterPhysicalId)}</b> ضدّ <b className="text-white">{nameOf(active.targetPhysicalId)}</b> ({left}ث)
          </div>
        );
        const other = nameOf(meReq ? active.targetPhysicalId : active.requesterPhysicalId);
        return (
          <div className="p-4 rounded-xl border-2 text-center border-[#C5A059] bg-[#C5A059]/15 shadow-[0_0_24px_rgba(197,160,89,0.3)]">
            <p className="text-sm font-black text-[#C5A059]">🎙️ كلمتك الآن — مواجهةٌ مع {other}</p>
            <p className={`text-4xl font-mono font-black mt-1 ${left <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{left}</p>
            <p className="text-[10px] text-[#888]">الطرفان يتحدّثان معاً — {active.stageSeconds} ثانية</p>
          </div>
        );
      })()}

      {/* ── رُفض طلبي ── */}
      {declinedMine && !hasLiveMine && (
        <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-center text-[11px] text-red-300">
          🚫 {declinedMine.declinedBy === 'LEADER' ? 'رفض الليدر' : `رفض ${nameOf(declinedMine.targetPhysicalId)}`} مواجهتك — لم يُستهلك رصيدك
        </div>
      )}

      {/* ── زرّ الطلب ── */}
      {!hasLiveMine && (
        <button
          onClick={() => { setSheet(true); setErr(''); }}
          disabled={!canRequest}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${canRequest ? 'border-[#8A0303]/60 text-[#ffccd5] bg-[#8A0303]/10 hover:bg-[#8A0303]/20' : 'border-[#2a2a2a] text-[#555] bg-white/5'}`}
        >
          ⚔️ اطلب مواجهة
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/30 border border-white/10">{budget}/{conf.perPlayer}</span>
        </button>
      )}
      {!hasLiveMine && !canRequest && (
        <p className="text-[10px] text-[#666] text-center -mt-1">
          {!roundOk ? '' : budget <= 0 ? '🔒 استنفدت رصيد المواجهات لهذه اللعبة' : active ? 'مواجهة جارية الآن' : '🔒 اكتمل حدّ المواجهات لهذه الجولة'}
        </p>
      )}

      {/* ── طبقة اختيار المستهدَف ── */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end" onClick={() => setSheet(false)}>
          <div className="w-full bg-[#0c0b09] border-t border-[#1f1a12] rounded-t-2xl p-4 max-h-[82%] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#ffccd5] font-bold" style={{ fontFamily: 'Amiri, serif' }}>⚔️ طلب مواجهة <span className="text-[10px] font-mono text-[#808080]">(رصيدك {budget}/{conf.perPlayer})</span></span>
              <button onClick={() => setSheet(false)} className="text-[#808080] text-lg leading-none">✕</button>
            </div>
            <p className="text-[11px] text-[#9a9a9a] leading-relaxed mb-3">
              تُنفَّذ بعد آخر متحدّث وقبل التصويت: تتحدّثان معاً بمؤقّتٍ واحد. إن أُقصي هدفك بتصويت هذه الجولة وكان مافيا كُوفئت، وإن كان مواطناً خُصم منك. رفضه يُعلَن على الشاشة ولا يُستهلك رصيدك.
            </p>
            <select
              value={target}
              onChange={e => { setTarget(e.target.value ? Number(e.target.value) : ''); setErr(''); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-[#C5A059]"
              disabled={busy}
            >
              <option value="" className="bg-[#111] text-[#9a9a9a]">-- اختر مَن تواجه --</option>
              {targets.map(p => (
                <option key={p.physicalId} value={p.physicalId} disabled={targetedIds.has(p.physicalId)} className="bg-[#111] text-white disabled:text-[#444]">
                  لاعب #{p.physicalId} - {p.name}{targetedIds.has(p.physicalId) ? ' (مستهدَف 🔒)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={request}
              disabled={!target || busy}
              className="w-full mt-3 bg-gradient-to-r from-[#8A0303] to-[#5c0202] text-white font-bold px-4 py-3.5 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '⚔️ إرسال طلب المواجهة'}
            </button>
            {err && <p className="text-red-400 text-xs text-center font-bold bg-red-500/10 border border-red-500/20 py-2 rounded-xl mt-2">❌ {err}</p>}
          </div>
        </div>
      )}
      {err && !sheet && <p className="text-red-400 text-xs text-center font-bold bg-red-500/10 border border-red-500/20 py-2 rounded-xl">❌ {err}</p>}
    </div>
  );
}
