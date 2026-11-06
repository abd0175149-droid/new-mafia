'use client';
// ══════════════════════════════════════════════════════
// ⚔️ المواجهات في القمرة — نقلٌ كامل لـ LeaderConfrontationPanel بالأحداث نفسها:
//   day:get-confrontations · day:confrontation {approve|decline|cancel|start|end|adjust}
//   leader:confrontation-settings · day:request-confrontation · بثّ day:confrontation-updated
//   ConfRequests: أثناء النقاش (الطلبات + المقبولة) — صفوفٌ تحت أزرار الوقت لا فوقها
//   ConfFull:     بعد آخر متحدّث (البدء/± المدّة/الإغلاق/الإلغاء + الإعدادات + طلبٌ نيابةً)
// ══════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet, Chip, Chips, Hint, Section, SeatGrid, SetRow, Stepper, Switch, seatCells, useCockpit } from '../../kit';
import { STATUS_AR, type ConfItem, type ConfPayload } from '../../../LeaderConfrontationPanel';
import { AdjRow, MiniBtn, PairCard, nameAt } from './shared';

export interface ConfApi {
  conf: ConfPayload | null;
  list: ConfItem[];
  enabled: boolean;
  perPlayer: number;
  busy: string | null;
  now: number;
  act: (id: string, action: string, extra?: Record<string, any>) => Promise<void>;
  setSettings: (patch: { enabled?: boolean; perPlayer?: number; pulseEnabled?: boolean; pulseBreaksTies?: boolean }) => Promise<void>;
  proxyRequest: (req: number, tgt: number) => Promise<boolean>;
}

export function useConfrontations(): ConfApi {
  const { gameState, emit, on, run } = useCockpit();
  const [conf, setConf] = useState<ConfPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const roomId = gameState?.roomId;
  const roomRef = useRef(roomId);
  roomRef.current = roomId;

  const refresh = useCallback(async () => {
    try {
      const r = await emit('day:get-confrontations', { roomId: roomRef.current });
      if (r?.success) setConf(r);
    } catch { /* الحالة تصل بالبثّ */ }
  }, [emit]);

  useEffect(() => {
    if (!roomId) return;
    refresh();
    const offs = [
      on('day:confrontation-updated', (p: ConfPayload) => setConf(p)),
      on('game:phase-changed', (d: any) => { if (d?.phase === 'DAY_DISCUSSION') refresh(); }),
      on('room:seats-remapped', () => { refresh(); }),
    ];
    return () => offs.forEach(f => f());
  }, [roomId, on, refresh]);

  const list = conf?.confrontations || [];
  const ticking = list.some(c => c.status === 'PENDING' || c.status === 'LIVE');
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [ticking]);

  const act = async (id: string, action: string, extra: Record<string, any> = {}) => {
    setBusy(id + action);
    try { await run(() => emit('day:confrontation', { roomId, id, action, ...extra })); }
    finally { setBusy(null); }
  };
  const setSettings = async (patch: { enabled?: boolean; perPlayer?: number; pulseEnabled?: boolean; pulseBreaksTies?: boolean }) => {
    const r = await run(() => emit('leader:confrontation-settings', { roomId, ...patch }));
    if (r) refresh();
  };
  const proxyRequest = async (req: number, tgt: number) => {
    setBusy('proxy');
    try {
      const r = await run(() => emit('day:request-confrontation', { roomId, requesterPhysicalId: req, targetPhysicalId: tgt }), `⚔️ أُرسل طلب ${req} لمواجهة ${tgt}`);
      return !!r;
    } finally { setBusy(null); }
  };

  return {
    conf, list, busy, now, act, setSettings, proxyRequest,
    enabled: conf ? conf.enabled : gameState?.config?.confrontationEnabled === true,
    perPlayer: conf?.perPlayer ?? gameState?.config?.confrontationsPerPlayer ?? 1,
  };
}

const secsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));

/** المواجهة الجارية — الطرفان، العدّاد، النبض، ± المدّة، إغلاق/إلغاء */
function ConfLive({ c, api }: { c: ConfItem; api: ConfApi }) {
  const left = c.stageStartedAt ? secsLeft(c.stageStartedAt + c.stageSeconds * 1000, api.now) : c.stageSeconds;
  const ps = api.conf?.pulseEnabled !== false ? c.pulse : null;
  const tot = ps ? ps.req + ps.tgt : 0;
  const share = ps && tot ? ps.req / tot : 0.5;
  return (
    <PairCard live from={c.requesterPhysicalId} to={c.targetPhysicalId} fromLabel="⚔️ طلب المواجهة" toLabel="🎯 المواجهة معه">
      <div className="text-center">
        {c.timeUp
          ? <b className="text-[18px] text-[#ffc2c4]">⏱ انتهى الوقت — أغلقها لختم النبض</b>
          : <><b className="text-[44px] font-extrabold tabular-nums leading-none">{left}</b> <small className="text-[13px] text-[#9a8f7e]">ث من {c.stageSeconds} — {STATUS_AR[c.status]}</small></>}
      </div>
      {ps && (
        <div className="rounded-xl border border-[#2a241c] bg-black/30 p-2">
          <div className="flex justify-between text-[12.5px] tabular-nums">
            <span className="text-[#99dcba]">الطالب {ps.req}</span>
            <span className="text-[#9a8f7e]">صوّت {tot} من {ps.eligible}{ps.quorum ? ' ✓ نصاب' : ' — دون النصاب'}</span>
            <span className="text-[#f2a6a9]">{ps.tgt} المستهدَف</span>
          </div>
          <div className="relative mt-2 h-3 rounded-full bg-gradient-to-l from-[#43b27f] via-[#2a2418] to-[#d0474c]">
            <div className="absolute -top-1 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ right: `calc(${(share * 100).toFixed(1)}% - 10px)` }} />
          </div>
        </div>
      )}
      <AdjRow disabled={!!api.busy} onAdj={(d) => api.act(c.id, 'adjust', { delta: d })} />
      <div className="grid grid-cols-2 gap-1.5">
        <MiniBtn tone={c.timeUp ? 'ok' : 'gold'} disabled={!!api.busy} onClick={() => api.act(c.id, 'end')}>🔒 أغلق المواجهة{c.timeUp ? ' واختم النبض' : ''}</MiniBtn>
        <MiniBtn tone="red" disabled={!!api.busy} onClick={() => api.act(c.id, 'cancel')}>✕ ألغِها</MiniBtn>
      </div>
    </PairCard>
  );
}

function PendingRow({ c, api }: { c: ConfItem; api: ConfApi }) {
  return (
    <PairCard from={c.requesterPhysicalId} to={c.targetPhysicalId} fromLabel="⚔️ طلب المواجهة" toLabel="🎯 المواجهة معه"
      note={c.timedOut ? '⏰ انقضت مهلة الردّ — القرار لك' : `بانتظار ردّ المستهدَف — ${secsLeft(c.respondBy, api.now)} ث`}
      right={<span className="flex flex-col gap-1.5 shrink-0">
        <MiniBtn tone="ok" disabled={!!api.busy} onClick={() => api.act(c.id, 'approve')}>قبول</MiniBtn>
        <MiniBtn ariaLabel="رفض" disabled={!!api.busy} onClick={() => api.act(c.id, 'decline')}>✕</MiniBtn>
      </span>} />
  );
}

/** أثناء النقاش: الطلبات المعلّقة + المقبولة بانتظار نهاية النقاش */
export function ConfRequests({ api }: { api: ConfApi }) {
  const { list } = api;
  if (!api.enabled && list.length === 0) return null;
  const pending = list.filter(c => c.status === 'PENDING');
  const accepted = list.filter(c => c.status === 'ACCEPTED');
  const live = list.find(c => c.status === 'LIVE') || null;
  if (!pending.length && !accepted.length && !live) return null;
  return (
    <>
      {live && <ConfLive c={live} api={api} />}
      {pending.map(c => <PendingRow key={c.id} c={c} api={api} />)}
      {accepted.map(c => (
        <PairCard key={c.id} from={c.requesterPhysicalId} to={c.targetPhysicalId} fromLabel="⚔️ طلب المواجهة" toLabel="🎯 المواجهة معه"
          note={`${c.acceptedBy === 'LEADER' ? 'قُبلت نيابةً' : 'قبِلها المستهدَف'} — تُنفَّذ بعد آخر متحدّث`}
          right={<MiniBtn ariaLabel="إلغاء المواجهة" disabled={!!api.busy} onClick={() => api.act(c.id, 'cancel')}>✕</MiniBtn>} />
      ))}
    </>
  );
}

/** بعد آخر متحدّث: اللوحة الكاملة */
export function ConfFull({ api }: { api: ConfApi }) {
  const { list, conf } = api;
  const [stageSecs, setStageSecs] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const pending = list.filter(c => c.status === 'PENDING');
  const accepted = list.filter(c => c.status === 'ACCEPTED');
  const live = list.find(c => c.status === 'LIVE') || null;
  const finished = list.filter(c => c.status === 'DONE' || c.status === 'DECLINED' || c.status === 'CANCELLED');
  const counted = list.filter(c => ['ACCEPTED', 'LIVE', 'DONE'].includes(c.status)).length;
  const stage = stageSecs ?? conf?.stageSeconds ?? 60;

  return (
    <Section title="⚔️ المواجهات" aside={`${counted}/${conf?.maxPerRound ?? 2} هذه الجولة`}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[14px]">{api.enabled ? 'مفعّلة' : 'معطّلة'}</span>
        <MiniBtn onClick={() => setShowSettings(v => !v)}>⚙️ {showSettings ? 'إخفاء' : 'الإعدادات'}</MiniBtn>
        <Switch label="تفعيل المواجهات" checked={api.enabled} onChange={(v) => api.setSettings({ enabled: v })} />
      </div>
      {showSettings && (
        <div className="rounded-xl border border-[#1d1914] px-2.5">
          <SetRow title="مدّة المواجهة التالية" sub="للطرفين معاً">
            <Stepper value={stage} min={30} max={180} step={15} unit="ث" onChange={setStageSecs} />
          </SetRow>
          <SetRow title="حدّ كلّ لاعب" sub="في اللعبة كلّها">
            <Stepper value={api.perPlayer} min={1} max={5} onChange={(v) => api.setSettings({ perPlayer: v })} />
          </SetRow>
          <SetRow title="نبض الإقناع" sub="تصويت القاعة أثناء المواجهة">
            <Switch label="نبض الإقناع" checked={conf?.pulseEnabled !== false} onChange={(v) => api.setSettings({ pulseEnabled: v })} />
          </SetRow>
        </div>
      )}

      {live && <ConfLive c={live} api={api} />}
      {pending.map(c => <PendingRow key={c.id} c={c} api={api} />)}
      {accepted.map(c => (
        <PairCard key={c.id} from={c.requesterPhysicalId} to={c.targetPhysicalId} fromLabel="⚔️ طلب المواجهة" toLabel="🎯 المواجهة معه"
          note={`${c.acceptedBy === 'LEADER' ? 'قُبلت نيابةً' : 'قبِلها المستهدَف'} — ${stage} ث للطرفين`}
          right={<span className="flex flex-col gap-1.5 shrink-0">
            {!live && <MiniBtn tone="gold" disabled={!!api.busy} onClick={() => api.act(c.id, 'start', stageSecs ? { seconds: stageSecs } : {})}>ابدأها</MiniBtn>}
            <MiniBtn ariaLabel="إلغاء المواجهة" disabled={!!api.busy} onClick={() => api.act(c.id, 'cancel')}>✕</MiniBtn>
          </span>} />
      ))}

      {finished.length > 0 && (
        <Chips>
          {finished.map(c => (
            <Chip key={c.id} tone={c.status === 'DONE' ? 'ok' : 'm'}>
              {c.requesterPhysicalId} ← {c.targetPhysicalId}: {STATUS_AR[c.status]}
              {c.status === 'DECLINED' ? (c.declinedBy === 'LEADER' ? ' (الليدر)' : ' (المستهدَف)') : ''}
              {c.status === 'DONE' && c.pulse?.quorum && c.pulse.winner && c.pulse.winner !== 'TIE' ? ` · النبض مع ${c.pulse.winnerPhysicalId} (${c.pulse.pct}٪)` : c.status === 'DONE' && c.pulse ? (c.pulse.quorum ? ' · النبض تعادل' : ' · النبض دون النصاب') : ''}
            </Chip>
          ))}
        </Chips>
      )}

      {api.enabled && !live && <MiniBtn onClick={() => setProxyOpen(true)}>+ طلب مواجهة نيابةً عن لاعب</MiniBtn>}
      {api.enabled && list.length === 0 && <Hint>لا طلبات مواجهة في هذه الجولة.</Hint>}
      {!api.enabled && <Hint>الميزة معطّلة — فعّلها ليطلب اللاعبون مواجهةً أثناء النقاش.</Hint>}
      <ProxySheet open={proxyOpen} onClose={() => setProxyOpen(false)} api={api} />
    </Section>
  );
}

function ProxySheet({ open, onClose, api }: { open: boolean; onClose: () => void; api: ConfApi }) {
  const { gameState } = useCockpit();
  const [req, setReq] = useState<number | null>(null);
  const [tgt, setTgt] = useState<number | null>(null);
  const close = () => { setReq(null); setTgt(null); onClose(); };
  const cells = seatCells(gameState).filter(c => c.player);
  return (
    <BottomSheet open={open} title={req ? `${req} يطلب مواجهة…` : 'طلب مواجهة نيابةً'} onClose={close}>
      <Hint>{!req ? 'المس الطالب. يُستهلك رصيده عند القبول.' : !tgt ? `رصيد ${req}: ${api.conf?.used?.[req] || 0}/${api.perPlayer} — المس المستهدَف.` : `${req} ${nameAt(gameState, req)} ← ${tgt} ${nameAt(gameState, tgt)}`}</Hint>
      <SeatGrid cells={cells}
        mark={(c) => ({
          selected: c.seat === req, target: c.seat === tgt,
          disabled: c.player?.isAlive === false || (!!req && !tgt && c.seat === req),
        })}
        onSeat={(c) => { if (!req) setReq(c.seat); else if (c.seat === req) { setReq(null); setTgt(null); } else setTgt(c.seat); }} />
      <button type="button" disabled={!req || !tgt || !!api.busy}
        onClick={async () => { if (req && tgt && await api.proxyRequest(req, tgt)) close(); }}
        className="min-h-[50px] rounded-[13px] bg-[#C5A059] text-[#110d08] font-bold disabled:opacity-40">أرسل الطلب</button>
      {req && <button type="button" onClick={() => { setReq(null); setTgt(null); }} className="min-h-[46px] rounded-[13px] border border-[#2a241c] bg-[#16130f] font-bold">ابدأ من جديد</button>}
    </BottomSheet>
  );
}
