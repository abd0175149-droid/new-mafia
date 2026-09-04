'use client';

// ══════════════════════════════════════════════════════
// 🎛️ لوحة إدارة الليلة — الوصول · الخريطة · نبض الليلة
// ══════════════════════════════════════════════════════
// تجمع في مكانٍ واحد ما كان مبعثراً أو غائباً تماماً:
//   🚶 الوصول — الواصل المتأخّر كان يُرفض بصمت ولا يعلم به الليدر إطلاقاً.
//   🗺️ الخريطة — كلّ العروض شبكاتُ بطاقات مرتّبة بالرقم لا تُظهر التجاور
//      الحقيقيّ ولا التعارضات، فيعيد الليدر التوزيع بالتخمين.
//   🌙 الليلة — «أيّ لعبة جارية ومتى تبدأ القادمة» كان محسوباً في الخادم
//      ومحجوباً خلف حارس الحجز فلا يراه إلّا حاجزٌ في تطبيق اللاعب.
//
// القرارات المقفلة: ١ · ٥ (بلا سرّ في اللوبي) · ٦ · ٧ · ٨.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import SeatMapRing, { type RingSeat } from '@/components/SeatMapRing';
import { checkSeatConflicts } from '@/lib/seatConflicts';

interface Spectator {
  physicalId: number;
  name: string;
  phone: string | null;
  playerId: number | null;
  joinedAt: number;
}

interface Props {
  roomId: string;
  gameState: any;
  emit: (event: string, data: any) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => (() => void);
}

const sinceLabel = (ts: number) => {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} د`;
  return `منذ ${Math.floor(m / 60)} س`;
};

const mmss = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.max(0, sec % 60)).padStart(2, '0')}`;

type Tab = 'arrivals' | 'map' | 'night';

export default function ArrivalsPanel({ roomId, gameState, emit, on }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('arrivals');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Array<{ physicalId: number; name: string; violations: string[] }>>([]);
  const [pulse, setPulse] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [preview, setPreview] = useState<null | {
    changes: Array<{ from: number; to: number; name: string }>;
    violationsBefore: number; violationsAfter: number;
  }>(null);
  const [pairPick, setPairPick] = useState<number[]>([]);

  const spectators: Spectator[] = useMemo(
    () => (Array.isArray(gameState?.spectators) ? gameState.spectators : []),
    [gameState?.spectators],
  );
  const players: any[] = useMemo(() => gameState?.players || [], [gameState?.players]);
  const phase = gameState?.phase;
  const inRosterWindow = phase === 'LOBBY' || phase === 'ROLE_GENERATION' || phase === 'GAME_OVER';
  const canAdmitNow = (phase === 'ROLE_BINDING' || phase === 'ROLE_GENERATION') && !gameState?.rolesConfirmed;
  const maxPlayers = gameState?.config?.maxPlayers || 0;

  const flash = useCallback((m: string, ms = 5000) => {
    setToast(m);
    setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    if (!on) return;
    const offJoin = on('room:spectator-joined', (d: any) =>
      flash(`🚶 وصل ${d?.firstName || d?.name || 'لاعب'} — مقعد ${d?.physicalId || '—'}`, 6000));
    const offWarn = on('leader:seat-constraint-warning', (d: any) =>
      setWarnings(w => [{ physicalId: d.physicalId, name: d.name, violations: d.violations || [] }, ...w].slice(0, 5)));
    const offDoor = on('room:door-assigned', (d: any) =>
      flash(`🚪 الباب خصّص المقعد ${d?.seat} لـ${d?.name || ''}`, 6000));
    return () => { offJoin?.(); offWarn?.(); offDoor?.(); };
  }, [on, flash]);

  // ⏱️ تكّةٌ واحدة للعدّاد — تعمل فقط واللوحة مفتوحة على تبويب الليلة
  useEffect(() => {
    if (!open || tab !== 'night') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, tab]);

  const loadPulse = useCallback(async () => {
    if (!gameState?.activityId) return;
    try {
      const res = await emit('staff:activity-pulse', { activityId: gameState.activityId });
      setPulse(res?.pulse || null);
    } catch { /* غير حاجب */ }
  }, [emit, gameState?.activityId]);

  useEffect(() => { if (open && tab === 'night') void loadPulse(); }, [open, tab, loadPulse]);

  // ── 🗺️ الخريطة + التعارضات ──
  const ringSeats: RingSeat[] = useMemo(() => {
    const out: RingSeat[] = [];
    const byId = new Map(players.map(p => [p.physicalId, p]));
    const specs = new Map(spectators.map(sp => [sp.physicalId, sp.name]));
    const pins = new Map((gameState?.pinnedSeats || []).map((p: any) => [Number(p.seatNumber), p.playerName]));
    for (let i = 1; i <= maxPlayers; i++) {
      const p = byId.get(i);
      if (p) {
        out.push({
          seat: i, name: p.name,
          state: p.seatHeld ? 'held' : p.frozen ? 'frozen' : p.isAlive === false ? 'dead' : 'occupied',
          isSpeaking: gameState?.discussionState?.currentSpeakerId === i,
        });
      } else if (specs.has(i)) out.push({ seat: i, name: specs.get(i), state: 'spectator' });
      else if (pins.has(i)) out.push({ seat: i, name: (pins.get(i) as string) || '📌', state: 'pinned' });
      else out.push({ seat: i, state: 'empty' });
    }
    return out;
  }, [players, spectators, maxPlayers, gameState?.pinnedSeats, gameState?.discussionState]);

  // تعارضاتُ الجوار المباشر — تُحسب محلّيّاً بالدالّة النقيّة الموجودة
  const conflicts: Array<[number, number]> = useMemo(() => {
    const out: Array<[number, number]> = [];
    if (!maxPlayers) return out;
    for (const p of players) {
      const right = p.physicalId === maxPlayers ? 1 : p.physicalId + 1;
      const nb = players.find(x => x.physicalId === right);
      if (!nb) continue;
      try {
        // نسأل: لو ثُبّت الجارُ في مقعده والطرفُ الآخر شاغلٌ للمقعد المجاور — أثمّة تعارض؟
        const occupied = new Map<number, any>();
        occupied.set(p.physicalId, { playerId: p.playerId, phone: p.phone, playerName: p.name });
        const msgs = checkSeatConflicts({
          targetSeat: right,
          cand: { playerId: nb.playerId, phone: nb.phone, name: nb.name, gender: nb.gender, genderConstraint: nb.genderConstraint },
          occupiedBySeat: occupied,
          players: players as any,
          blockedPairs: [],
          total: maxPlayers,
        });
        if (msgs.length > 0) out.push([p.physicalId, right]);
      } catch { /* الدالّة اختياريّة — الخريطة تبقى تعمل */ }
    }
    return out;
  }, [players, maxPlayers]);

  // ── الإجراءات ──
  const act = async (fn: () => Promise<any>, okMsg?: string) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) flash(okMsg); return r; }
    catch (e: any) { flash(e?.message || 'تعذّر التنفيذ'); }
    finally { setBusy(false); }
  };

  const doPreview = () => act(async () => {
    const res = await emit('room:reshuffle-seats', { roomId, dryRun: true });
    setPreview({ changes: res.changes || [], violationsBefore: res.violationsBefore ?? 0, violationsAfter: res.violationsAfter ?? 0 });
  });

  const doApply = () => act(async () => {
    const res = await emit('room:reshuffle-seats', { roomId, dryRun: false });
    setPreview(null);
    flash(`✅ طُبّق الترتيب — تحرّك ${res.applied ?? 0} لاعباً`, 6000);
  });

  const onSeatClick = (seat: number) => {
    if (!players.some(p => p.physicalId === seat)) return;
    setPairPick(prev => {
      if (prev.includes(seat)) return prev.filter(x => x !== seat);
      const next = [...prev, seat].slice(-2);
      return next;
    });
  };

  const doSeparate = (scope: 'room' | 'activity' | 'global') => act(async () => {
    const [a, b] = pairPick;
    const res = await emit('room:separate-pair', { roomId, aPhysicalId: a, bPhysicalId: b, scope, autoMove: true });
    setPairPick([]);
    flash(res?.moved ? `✂️ نُقل إلى المقعد ${res.moved.to}` : '✂️ سُجّلت القاعدة', 6000);
  });

  const sendNotice = (text: string, kind: 'break' | 'info' = 'info') =>
    act(() => emit('leader:display-notice', { roomId, text, kind }), '📢 عُرض على الشاشة');

  const setBreak = (minutes: number) => act(async () => {
    await emit('room:set-next-game-at', { roomId, at: Date.now() + minutes * 60000 });
    await emit('leader:display-notice', { roomId, text: `استراحة ${minutes} دقيقة`, kind: 'break' });
    flash(`⏱️ الجولة القادمة بعد ${minutes} دقيقة`);
  });

  const count = spectators.length;
  const warnCount = conflicts.length + warnings.length;

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button onClick={() => setTab(id)}
      className="px-2.5 py-1 rounded-md text-[12px] font-bold"
      style={{
        background: tab === id ? 'rgba(197,160,89,.16)' : 'transparent',
        border: `1px solid ${tab === id ? 'rgba(197,160,89,.55)' : 'transparent'}`,
        color: tab === id ? '#f3cd6f' : '#8f98ab',
      }}>{label}</button>
  );

  return (
    <div data-arrivals className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors"
        style={{
          background: count > 0 ? 'rgba(167,139,250,0.15)' : warnCount > 0 ? 'rgba(229,72,77,.12)' : 'rgba(255,255,255,0.03)',
          borderColor: count > 0 ? 'rgba(167,139,250,0.6)' : warnCount > 0 ? 'rgba(229,72,77,.5)' : 'rgba(255,255,255,0.12)',
          color: count > 0 ? '#cbbcff' : warnCount > 0 ? '#ff8d90' : '#9aa3b5',
        }}
        title="الوصول · الخريطة · نبض الليلة"
      >
        🎛️ الليلة{count > 0 ? ` · ${count} ينتظر` : ''}{warnCount > 0 ? ` · ⚠${warnCount}` : ''}
      </button>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-lg text-sm font-bold"
          style={{ background: 'rgba(20,22,30,0.97)', border: '1px solid rgba(167,139,250,0.5)', color: '#e7ebf2' }}>
          {toast}
        </div>
      )}

      {open && (
        <div className="absolute z-[300] mt-2 w-[380px] max-h-[76vh] overflow-auto rounded-xl p-3 text-right"
          style={{ background: '#12151c', border: '1px solid #262c3a', boxShadow: '0 20px 60px rgba(0,0,0,.6)', insetInlineStart: 0 }}>

          <div className="flex gap-1 mb-3 pb-2" style={{ borderBottom: '1px solid #262c3a' }}>
            <TabBtn id="arrivals" label={`🚶 الوصول${count ? ` (${count})` : ''}`} />
            <TabBtn id="map" label={`🗺️ الخريطة${conflicts.length ? ` (${conflicts.length})` : ''}`} />
            <TabBtn id="night" label="🌙 الليلة" />
          </div>

          {/* ═══ الوصول ═══ */}
          {tab === 'arrivals' && (
            <>
              {count === 0 && (
                <p className="text-[12px] text-[#5f6779] mb-3">لا أحد ينتظر. من يصل أثناء اللعبة يظهر هنا بمقعده تلقائيّاً.</p>
              )}
              {spectators.slice().sort((a, b) => a.joinedAt - b.joinedAt).map(sp => (
                <div key={`${sp.physicalId}-${sp.joinedAt}`} className="flex items-center gap-2 mb-1.5 p-2 rounded-lg"
                  style={{ background: '#181d29', border: '1px solid #262c3a' }}>
                  <span className="font-black text-[#C5A059] text-sm min-w-[28px] text-center">
                    {sp.physicalId > 0 ? sp.physicalId : '—'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#e9ecf3] truncate">{sp.name}</div>
                    <div className="text-[10.5px] text-[#8f98ab]">{sinceLabel(sp.joinedAt)}</div>
                  </div>
                  {canAdmitNow && (
                    <button disabled={busy} onClick={() => act(() => emit('setup:admit-spectator', { roomId, physicalId: sp.physicalId }), 'أُدخل — أعد اعتماد الأدوار')}
                      className="px-2 py-1 rounded text-[11px] font-bold disabled:opacity-40"
                      style={{ background: 'rgba(63,185,80,.15)', border: '1px solid rgba(63,185,80,.5)', color: '#7fe08f' }}>
                      أدخله الآن
                    </button>
                  )}
                  <button disabled={busy} onClick={() => act(() => emit('room:remove-spectator', { roomId, physicalId: sp.physicalId }))}
                    className="px-2 py-1 rounded text-[11px] disabled:opacity-40"
                    style={{ background: 'rgba(229,72,77,.12)', border: '1px solid rgba(229,72,77,.45)', color: '#ff8d90' }}>
                    إزالة
                  </button>
                </div>
              ))}

              {warnings.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid #262c3a' }}>
                  <div className="text-[13px] font-bold text-[#ff8d90] mb-1.5">⚠️ مخالفات إجلاس</div>
                  {warnings.map((w, i) => (
                    <div key={i} className="text-[11.5px] text-[#c9d0dd] mb-1">
                      <b>#{w.physicalId} {w.name}</b>
                      {w.violations[0] && <span className="text-[#8f98ab]"> — {w.violations[0]}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═══ الخريطة ═══ */}
          {tab === 'map' && (
            <>
              {maxPlayers > 0 ? (
                <>
                  <SeatMapRing
                    maxPlayers={maxPlayers}
                    seats={ringSeats}
                    conflicts={conflicts}
                    doorSeats={gameState?.doorSeats || []}
                    size={340}
                    onSeatClick={onSeatClick}
                  />
                  <p className="text-[11px] text-[#8f98ab] mt-1 mb-2">
                    الخطُّ الأحمر تجاورٌ مخالف. انقر لاعبَين ثمّ اختر «افصل».
                  </p>

                  {pairPick.length === 2 && (
                    <div className="p-2 rounded-lg mb-2" style={{ background: '#181d29', border: '1px solid rgba(230,181,74,.4)' }}>
                      <div className="text-[12px] text-[#f3cd6f] mb-1.5">
                        ✂️ افصل {players.find(p => p.physicalId === pairPick[0])?.name} و{players.find(p => p.physicalId === pairPick[1])?.name}
                      </div>
                      <div className="flex gap-1.5">
                        <button disabled={busy} onClick={() => doSeparate('global')}
                          className="flex-1 py-1.5 rounded text-[11.5px] font-bold disabled:opacity-40"
                          style={{ background: '#e6b54a', color: '#1a1405' }}>دائماً</button>
                        <button disabled={busy} onClick={() => doSeparate('activity')}
                          className="flex-1 py-1.5 rounded text-[11.5px] disabled:opacity-40"
                          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid #323a4b', color: '#c9d0dd' }}>هذه الفعاليّة</button>
                        <button disabled={busy} onClick={() => doSeparate('room')}
                          className="flex-1 py-1.5 rounded text-[11.5px] disabled:opacity-40"
                          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid #323a4b', color: '#c9d0dd' }}>الليلة</button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2" style={{ borderTop: '1px solid #262c3a' }}>
                    <div className="text-[13px] font-bold text-[#e6b54a] mb-1.5">🪄 إعادة ترتيب ذكيّة</div>
                    {!inRosterWindow ? (
                      <p className="text-[11.5px] text-[#5f6779]">متاحة في اللوبي أو بعد انتهاء اللعبة فقط.</p>
                    ) : !preview ? (
                      <button disabled={busy} onClick={doPreview}
                        className="w-full py-2 rounded-lg text-[12.5px] font-bold disabled:opacity-40"
                        style={{ background: 'rgba(230,181,74,.15)', border: '1px solid rgba(230,181,74,.55)', color: '#f3cd6f' }}>
                        {busy ? '…' : 'اقترح ترتيباً'}
                      </button>
                    ) : (
                      <div>
                        <div className="text-[11.5px] text-[#8f98ab] mb-1.5">
                          تجاورات: <b className="text-[#ff8d90]">{preview.violationsBefore}</b> ← <b className="text-[#7fe08f]">{preview.violationsAfter}</b>
                          {' · '}يتحرّك {preview.changes.length}
                        </div>
                        <div className="max-h-[120px] overflow-auto mb-2">
                          {preview.changes.length === 0 && <p className="text-[11.5px] text-[#5f6779]">لا تغيير مقترح.</p>}
                          {preview.changes.map((c, i) => (
                            <div key={i} className="flex justify-between text-[11.5px] py-0.5" style={{ borderBottom: '1px dashed rgba(255,255,255,.05)' }}>
                              <span className="text-[#c9d0dd]">{c.name}</span>
                              <span className="text-[#8f98ab] font-mono">{c.from} ← {c.to}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button disabled={busy || preview.changes.length === 0} onClick={doApply}
                            className="flex-1 py-2 rounded-lg text-[12.5px] font-bold disabled:opacity-40"
                            style={{ background: '#e6b54a', color: '#1a1405' }}>طبّق</button>
                          <button disabled={busy} onClick={() => setPreview(null)}
                            className="px-3 py-2 rounded-lg text-[12.5px] disabled:opacity-40"
                            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid #323a4b', color: '#8f98ab' }}>إلغاء</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : <p className="text-[12px] text-[#5f6779]">لا سعة معروفة للغرفة بعد.</p>}
            </>
          )}

          {/* ═══ الليلة ═══ */}
          {tab === 'night' && (
            <>
              {!gameState?.activityId && <p className="text-[12px] text-[#5f6779] mb-3">الغرفة غير مرتبطة بفعاليّة.</p>}
              {(pulse?.rooms || []).map((r: any) => (
                <div key={r.sessionId} className="mb-2 p-2 rounded-lg" style={{ background: '#181d29', border: '1px solid #262c3a' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] text-[#e9ecf3]">{r.name || r.joinCode}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        background: r.status === 'live' ? 'rgba(229,72,77,.15)' : 'rgba(63,185,80,.12)',
                        color: r.status === 'live' ? '#ff8d90' : '#7fe08f',
                      }}>
                      {r.status === 'live' ? `اللعبة ${r.ordinal ?? '—'} جارية` : r.status === 'ended' ? 'انتهت' : 'بانتظار البدء'}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#8f98ab] flex gap-3 flex-wrap">
                    <span>جالسون {r.seated}/{r.capacity}</span>
                    {r.waiting > 0 && <span className="text-[#cbbcff]">ينتظر {r.waiting}</span>}
                    {r.nextStartAt && (
                      <span className="text-[#f3cd6f] tabular-nums">
                        القادمة بعد {mmss(Math.max(0, Math.floor((r.nextStartAt - now) / 1000)))}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <div className="mt-3 pt-3" style={{ borderTop: '1px solid #262c3a' }}>
                <div className="text-[13px] font-bold text-[#C5A059] mb-1.5">📢 أعلِن على الشاشة</div>
                <div className="flex gap-1.5 flex-wrap">
                  {[10, 15].map(m => (
                    <button key={m} disabled={busy} onClick={() => setBreak(m)}
                      className="px-2.5 py-1.5 rounded text-[11.5px] font-bold disabled:opacity-40"
                      style={{ background: 'rgba(230,181,74,.15)', border: '1px solid rgba(230,181,74,.5)', color: '#f3cd6f' }}>
                      استراحة {m} د
                    </button>
                  ))}
                  <button disabled={busy} onClick={() => sendNotice('الجولة القادمة تبدأ الآن — تفضّلوا إلى الطاولة')}
                    className="px-2.5 py-1.5 rounded text-[11.5px] disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,.05)', border: '1px solid #323a4b', color: '#c9d0dd' }}>
                    ابدأوا الآن
                  </button>
                  <button disabled={busy} onClick={() => act(() => emit('room:set-next-game-at', { roomId, at: null }), 'أُلغي العدّاد')}
                    className="px-2.5 py-1.5 rounded text-[11.5px] disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,.05)', border: '1px solid #323a4b', color: '#8f98ab' }}>
                    ألغِ العدّاد
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
