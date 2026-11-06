'use client';
// ══════════════════════════════════════════════════════
// 🪑 اللوبي — المقعد هو الوحدة: لمسةٌ على المقعد تفتح أفعاله
//
// منقولٌ من LeaderLobbyView + عرض الجلسة في page.tsx، بالأحداث نفسها:
//   room:move-seat (عبر useSeatMove) · room:override-player · room:set-no-photo ·
//   leader:record-penalty · room:kick-player · room:release-held-seat ·
//   room:remove-spectator · room:update-max-players · room:clear-max-manual ·
//   room:photo-zone-fix · room:resync-template · host.startGeneration(excluded)
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import {
  ActionBar, Status, Section, Chips, Chip, Hint, Btn, HoldButton, BottomSheet, SeatGrid, seatCells,
  ListRow, Stepper, SetRow, useCockpit, type SeatCellData, type SeatMark,
} from '../kit';
import { useHost } from '../host';
import { useSeatMove } from '../../SeatMove';
import { usePhotoZone } from '../../PhotoZonePanel';
import AddPlayerSheet from './setup/AddPlayerSheet';
import { SheetError, TapChip, inputCls, errMsg } from './setup/ui';

const MIN_PLAYERS = 6;

type SheetState =
  | { kind: 'player'; seat: number; mode?: 'rename' | 'penalty' }
  | { kind: 'held'; seat: number }
  | { kind: 'spectator'; seat: number }
  | null;

export default function LobbyScreen() {
  const { gameState, emit, run, toast, setGameState } = useCockpit();
  const host = useHost();
  const sm = useSeatMove();
  const pz = usePhotoZone(gameState);

  const roomId: string = gameState?.roomId;
  const cfg = gameState?.config || {};
  const isRemote = cfg.isRemote === true;
  const players: any[] = Array.isArray(gameState?.players) ? gameState.players : [];
  const spectators: any[] = Array.isArray(gameState?.spectators) ? gameState.spectators : [];
  const cells = seatCells(gameState);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSeat, setAddSeat] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  // 🧹 بعد أيّ إعادة ترقيم: لا يبقى اختيارٌ يشير إلى مقعدٍ قديم
  useEffect(() => {
    if (!sm.remapVersion) return;
    setSheet(null);
    setExcluded([]);
  }, [sm.remapVersion]);

  // المستبعَد الذي غادر أو طُرد لا يبقى في القائمة
  const present = players.filter((p) => !p.seatHeld && !p.frozen);
  const presentIds = new Set(present.map((p) => Number(p.physicalId)));
  const excludedLive = excluded.filter((n) => presentIds.has(n));
  const heldList = players.filter((p) => p.seatHeld === true);
  const waiting = spectators.filter((s) => s && s.status !== 'admitted');
  const startCount = present.length - excludedLive.length;
  const maxPlayers = Number(cfg.maxPlayers) || 0;

  // ── الأفعال ──
  const toggleExclude = (seat: number) => {
    setExcluded((prev) => (prev.includes(seat) ? prev.filter((x) => x !== seat) : [...prev, seat]));
  };

  const setCapacity = async (n: number) => {
    const r = await run(() => emit('room:update-max-players', { roomId, maxPlayers: n }));
    if (r) setGameState((prev: any) => (prev ? { ...prev, config: { ...prev.config, maxPlayers: n } } : prev));
  };

  const start = async () => {
    if (busy) return;
    if (startCount < MIN_PLAYERS) { toast(`يلزم ${MIN_PLAYERS} لاعبين على الأقلّ — لديك ${startCount}`, { tone: 'red' }); return; }
    setBusy(true);
    try {
      await host.startGeneration(excludedLive.length ? excludedLive : undefined);
      setExcluded([]);
    } catch (e: any) {
      toast(errMsg(e, 'تعذّر بدء التوزيع'), { tone: 'red' });
    } finally { setBusy(false); }
  };

  const fixZone = async () => {
    const r: any = await run(() => emit('room:photo-zone-fix', { roomId }));
    if (!r) return;
    const f = r.fix;
    toast(r.applied ? (f?.swapWith ? `بُدّل ${f.from} و${f.to} (مع «${f.swapWith}»)` : `نُقل ${f?.from} إلى ${f?.to}`) : 'الزاوية سليمة');
  };

  const resyncTemplate = async () => {
    const r: any = await run(() => emit('room:resync-template', { roomId }));
    if (!r) return;
    const conflicts: string[] = r.conflicts || [];
    if (conflicts.length) toast(`حُدّث من القالب — ${conflicts.length} تعارض: ${conflicts.join(' · ')}`, { tone: 'red', ms: 9000 });
    else toast(`حُدّث من القالب — ${r.pinned || 0} مقعد مثبّت${r.capacityWarning ? ` · ${r.capacityWarning}` : ''}`);
  };

  const onSeat = (c: SeatCellData) => {
    if (sm.movingId != null) { sm.moveTo(c.seat); return; }
    if (c.player) { setSheet({ kind: 'player', seat: c.seat }); return; }
    if (c.held) { setSheet({ kind: 'held', seat: c.seat }); return; }
    if (c.spectator) { setSheet({ kind: 'spectator', seat: c.seat }); return; }
    if (isRemote) { toast(`المقعد ${c.seat} فارغ`); return; }
    setAddSeat(c.seat); setAddOpen(true);
  };

  const mark = (c: SeatCellData): SeatMark => {
    const moving = sm.movingId != null;
    const m: SeatMark = {};
    if (moving) {
      m.selected = sm.movingId === c.seat;
      m.disabled = sm.busy || (!!c.spectator && !c.player) || !!c.held;
      return m;
    }
    if (c.player && excludedLive.includes(c.seat)) { m.ghost = true; m.label = 'مستبعد'; m.topLeft = '🚫'; }
    else if (c.player?.frozen) m.topLeft = '❄️';
    return m;
  };

  // ── ملخّص الإعدادات (للقراءة — اللمس يفتح الإعدادات) ──
  const timerChip = cfg.gameTimerEnabled ? `⏱️ ${cfg.gameTimerMinutes ?? 30} د` : '⏱️ بلا مؤقّت';
  const penChip = `⚖️ ${cfg.maxPenalties ?? 3} عقوبات · ${cfg.penaltyScope === 'game' ? 'لكلّ لعبة' : 'للغرفة'}`;
  const bombChip = cfg.bombEnabled === false ? '💣 القنبلة مطفأة' : '💣 القنبلة مفعّلة';

  const meta = `${gameState?.roomCode || ''} · ${present.length} جالس${heldList.length ? ` · ${heldList.length} محجوز` : ''}${waiting.length ? ` · ${waiting.length} ينتظر` : ''}`;
  const zoneOk = pz?.report.contiguous !== false;

  return (
    <>
      <Status meta={meta} />
      <ActionBar
        primary={{
          label: `ابدأ توزيع الأدوار (${startCount})`,
          onPress: start,
          disabled: busy || startCount < MIN_PLAYERS,
          sub: startCount < MIN_PLAYERS ? `يلزم ${MIN_PLAYERS} لاعبين على الأقلّ` : excludedLive.length ? `يغادر ${excludedLive.length} مستبعَد عند البدء` : undefined,
        }}
        secondary={!isRemote ? { label: '+ لاعب', onPress: () => { setAddSeat(null); setAddOpen(true); } } : undefined}
      />

      {/* ── الإعدادات بلمحة ── */}
      {!isRemote && (
        <Chips>
          <TapChip onClick={host.open.settings}>{timerChip}</TapChip>
          <TapChip onClick={host.open.settings}>{penChip}</TapChip>
          <TapChip onClick={host.open.settings}>{bombChip}</TapChip>
          {cfg.mafiaChatEnabled === true && <TapChip onClick={host.open.settings}>💬 دردشة المافيا</TapChip>}
          {cfg.confrontationEnabled === true && <TapChip onClick={host.open.settings}>⚔️ المواجهة</TapChip>}
          <TapChip tone="g" onClick={host.open.settings}>⚙️ الإعدادات</TapChip>
        </Chips>
      )}

      {/* ── الغرفة: الرمز والرقم السرّيّ والمكان ── */}
      <Chips>
        <Chip tone="g">الرمز <b className="tabular-nums" dir="ltr">{gameState?.roomCode}</b></Chip>
        {cfg.displayPin && <Chip>رقم الشاشة <b className="tabular-nums" dir="ltr">{cfg.displayPin}</b></Chip>}
        {(gameState?.locationName || gameState?.cityName) && <Chip>📍 {[gameState.locationName, gameState.cityName].filter(Boolean).join(' · ')}</Chip>}
        {gameState?.counted === false && <Chip tone="m">⚠️ غير محتسبة — بلا مكان</Chip>}
        {pz && (zoneOk
          ? <Chip tone="ok">📵 الزاوية {pz.report.label} سليمة</Chip>
          : <TapChip tone="red" onClick={() => void fixZone()}>📵 {pz.report.outside.length} خارج الزاوية — أصلِح</TapChip>)}
      </Chips>

      {/* ── من ينتظر ── */}
      {waiting.map((s) => (
        <ListRow key={`${s.physicalId}-${s.joinedAt || ''}`} n="🚶" title={`${s.name || 'متفرّج'} ينتظر`}
          sub={s.physicalId > 0 ? `على المقعد ${s.physicalId} · يدخل من «الوصول» في الأدوات` : 'بلا مقعد بعد'}
          right={s.physicalId > 0 ? <Btn tone="line" onClick={() => setSheet({ kind: 'spectator', seat: Number(s.physicalId) })}>أفعال</Btn> : undefined} />
      ))}

      {/* ── المستبعَدون من هذه اللعبة ── */}
      {excludedLive.length > 0 && (
        <Section tone="red" title={`🚫 مستبعَدون من هذه اللعبة (${excludedLive.length})`}>
          <Hint>يخرجون من الغرفة حين تبدأ التوزيع. المس مقعداً ثمّ «أعِده» لإلغاء استبعاده.</Hint>
          <Chips>
            {excludedLive.slice().sort((a, b) => a - b).map((n) => {
              const p = players.find((x) => Number(x.physicalId) === n);
              return <TapChip key={n} tone="m" onClick={() => toggleExclude(n)} ariaLabel={`أعِد ${n} للعبة`}>{n} {p?.name || ''} ✕</TapChip>;
            })}
            <TapChip onClick={() => setExcluded([])}>ألغِ الكلّ</TapChip>
          </Chips>
        </Section>
      )}

      {/* ── المقاعد ── */}
      <Section title="المقاعد" aside={sm.movingId != null ? undefined : 'المس مقعداً لأفعاله'}>
        <div data-seat-move="1" className="flex flex-col gap-2.5">
          {sm.movingId != null && (
            <div className="flex items-center gap-2 rounded-[13px] border border-[#C5A059]/60 bg-[#C5A059]/10 px-3 py-2">
              <span className="flex-1 text-[14px]">نقل <b>{sm.movingId}</b> {players.find((p) => Number(p.physicalId) === sm.movingId)?.name || ''} — المس الوجهة: فارغ = نقل، مشغول = تبديل</span>
              <Btn onClick={() => sm.cancelMove()}>إلغاء</Btn>
            </div>
          )}
          {cells.length === 0 ? (
            <Hint>لا مقاعد بعد — زِد العدد أدناه.</Hint>
          ) : (
            <SeatGrid cells={cells} onSeat={onSeat} mark={mark} />
          )}
        </div>
        {players.length === 0 && <Hint>لا لاعبين بعد. شارك رمز الغرفة <b dir="ltr">{gameState?.roomCode}</b> أو أضِف لاعباً.</Hint>}
        <Hint>⏳ محجوز · 👁 متفرّج · ○ غير متّصل · ❄️ غادر · 📵 لا يُصوَّر · النقاط الصفراء عقوبات</Hint>
        <SetRow title="عدد المقاعد" sub={cfg.maxPlayersManual ? 'سعةٌ يدويّة — القالب لا يغيّرها' : 'من القالب أو الفعاليّة'}>
          <Stepper value={maxPlayers} min={6} max={50} onChange={(n) => void setCapacity(n)} />
        </SetRow>
        {cfg.maxPlayersManual && (
          <Btn tone="line" className="w-full" onClick={() => void run(() => emit('room:clear-max-manual', { roomId }), 'عادت السعة إلى القالب')}>
            🔓 العودة لسعة القالب
          </Btn>
        )}
      </Section>

      {/* ── المحجوزة ── */}
      {heldList.length > 0 && (
        <Section title={`⏳ مقاعد محجوزة (${heldList.length})`}>
          {heldList.map((h) => (
            <ListRow key={h.physicalId} n={h.physicalId} title={h.name} sub={heldSub(h)} onClick={() => setSheet({ kind: 'held', seat: Number(h.physicalId) })}
              right={<span className="text-[13px] text-[#C5A059]">فكّ ›</span>} />
          ))}
        </Section>
      )}

      {/* ── المثبّتة من القالب ── */}
      <PinnedSeats gameState={gameState} players={players} onResync={() => void resyncTemplate()} />

      {/* ── أدوات اللوبي ── */}
      <div className="flex flex-wrap gap-2">
        {!isRemote && <Btn tone="line" className="flex-1" onClick={() => { setAddSeat(null); setAddOpen(true); }}>+ إضافة لاعب</Btn>}
        {players.length > 0 && <Btn className="flex-1" onClick={host.open.rename}>✏️ الأسماء</Btn>}
        {players.length > 0 && host.open.renumber && <Btn className="flex-1" onClick={host.open.renumber}>#️⃣ الأرقام</Btn>}
      </div>

      {/* ── الألواح ── */}
      <PlayerSheet
        sheet={sheet?.kind === 'player' ? sheet : null}
        onClose={() => setSheet(null)}
        setMode={(mode) => setSheet((s) => (s && s.kind === 'player' ? { ...s, mode } : s))}
        excluded={excludedLive}
        onToggleExclude={toggleExclude}
        photoOn={!!pz}
        onMove={(seat) => { setSheet(null); sm.beginMove(seat); }}
        moveEnabled={sm.enabled}
      />
      <HeldSheet seat={sheet?.kind === 'held' ? sheet.seat : null} onClose={() => setSheet(null)} />
      <SpectatorSheet seat={sheet?.kind === 'spectator' ? sheet.seat : null} onClose={() => setSheet(null)} />
      <AddPlayerSheet open={addOpen} initialSeat={addSeat} onClose={() => { setAddOpen(false); setAddSeat(null); }} />
    </>
  );
}

function heldSub(h: any): string {
  // 🖐️ بلا مهلة = نقله الليدر في فعاليّةٍ باختيارٍ يدويّ — محفوظٌ حتى يعود أو يُفكّ
  const left = h?.heldUntil ? Math.max(0, Math.ceil((Number(h.heldUntil) - Date.now()) / 60000)) : null;
  return `${h?.phone || 'بلا رقم'} · ${left != null ? `متبقٍّ نحو ${left} د` : 'محفوظ بقرار الليدر'}`;
}

// ══════════ لوح اللاعب ══════════
function PlayerSheet({ sheet, onClose, setMode, excluded, onToggleExclude, photoOn, onMove, moveEnabled }: {
  sheet: { kind: 'player'; seat: number; mode?: 'rename' | 'penalty' } | null;
  onClose: () => void;
  setMode: (m?: 'rename' | 'penalty') => void;
  excluded: number[];
  onToggleExclude: (seat: number) => void;
  photoOn: boolean;
  onMove: (seat: number) => void;
  moveEnabled: boolean;
}) {
  const { gameState, emit, run, toast } = useCockpit();
  const roomId = gameState?.roomId;
  const p = sheet ? (gameState?.players || []).find((x: any) => Number(x.physicalId) === sheet.seat && !x.seatHeld) : null;
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(''); setName(p?.name || ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sheet?.seat, sheet?.mode]);
  // اللاعب غادر المقعد أثناء فتح اللوح ⇒ يُغلق
  useEffect(() => { if (sheet && !p) onClose(); }, [sheet, p, onClose]);
  if (!sheet || !p) return null;

  const seat = Number(p.physicalId);
  const maxPen = gameState?.config?.maxPenalties ?? 3;
  const isEx = excluded.includes(seat);

  const rename = async () => {
    const nm = name.trim();
    if (!nm || busy) return;
    const old = p.name;
    if (nm === old) { setMode(undefined); return; }
    setBusy(true); setErr('');
    try {
      await emit('room:override-player', { roomId, physicalId: seat, name: nm, isNew: false });
      onClose();
      toast(`صار اسم ${seat} «${nm}»`, {
        undo: () => { emit('room:override-player', { roomId, physicalId: seat, name: old, isNew: false }).catch((e: any) => toast(errMsg(e), { tone: 'red' })); },
      });
    } catch (e: any) { setErr(errMsg(e, 'تعذّر حفظ الاسم')); } finally { setBusy(false); }
  };

  const togglePhoto = async () => {
    const to = !(p.noPhoto === true);
    const r = await run(() => emit('room:set-no-photo', { roomId, physicalId: seat, noPhoto: to }));
    if (!r) return;
    onClose();
    toast(`${p.name}: ${to ? 'لا يُصوَّر 📵' : 'يقبل التصوير'}`, {
      undo: () => { emit('room:set-no-photo', { roomId, physicalId: seat, noPhoto: !to }).catch((e: any) => toast(errMsg(e), { tone: 'red' })); },
    });
  };

  const penalty = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await emit('leader:record-penalty', { roomId, targetPhysicalId: seat });
      onClose();
      toast(`⚠️ سُجّلت عقوبة على ${seat} ${p.name}`);
    } catch (e: any) { setErr(errMsg(e, 'فشل تسجيل العقوبة')); } finally { setBusy(false); }
  };

  const kick = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await emit('room:kick-player', { roomId, physicalId: seat });
      onClose();
      toast(`خرج ${p.name} من الغرفة`);
    } catch (e: any) { setErr(errMsg(e, 'تعذّر الطرد')); } finally { setBusy(false); }
  };

  const title = sheet.mode === 'rename' ? `اسم المقعد ${seat}` : sheet.mode === 'penalty' ? `عقوبة على ${seat} ${p.name}` : `المقعد ${seat} · ${p.name}`;

  return (
    <BottomSheet open title={title} onClose={onClose}>
      <SheetError>{err}</SheetError>
      {sheet.mode === 'rename' ? (
        <>
          <label className="text-[13px] text-[#9a8f7e]" htmlFor="ck-rename">الاسم كما يظهر على الشاشة</label>
          <input id="ck-rename" type="text" dir="rtl" autoFocus maxLength={40} value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void rename(); }} className={inputCls} />
          <div className="flex gap-2">
            <Btn className="flex-1" onClick={() => setMode(undefined)}>رجوع</Btn>
            <Btn tone="gold" className="flex-[2]" disabled={busy || !name.trim()} onClick={() => void rename()}>{busy ? '…' : 'حفظ'}</Btn>
          </div>
        </>
      ) : sheet.mode === 'penalty' ? (
        <>
          <Chips><Chip>الحاليّة {p.penalties || 0}/{maxPen}</Chip></Chips>
          <Hint>تُخصم رتبةٌ ويُوجَّه إنذار. {maxPen} عقوبات = طرد من اللعبة. لا تراجع عنها.</Hint>
          <HoldButton tone="gold" disabled={busy} className="w-full min-h-[52px]" onHold={() => void penalty()}>اضغط مطوّلاً: سجّل العقوبة</HoldButton>
          <Btn onClick={() => setMode(undefined)}>رجوع</Btn>
        </>
      ) : (
        <>
          <Chips>
            {p.isConnected === false ? <Chip>○ غير متّصل</Chip> : <Chip tone="ok">📱 متّصل</Chip>}
            {p.frozen && <Chip tone="c">❄️ غادر</Chip>}
            {p.noPhoto === true && <Chip tone="m">📵 لا يُصوَّر</Chip>}
            {!!p.penalties && <Chip tone="n">⚠️ {p.penalties} عقوبة</Chip>}
            {p.phone && <Chip><span dir="ltr">{p.phone}</span></Chip>}
            {isEx && <Chip tone="m">🚫 مستبعَد من هذه اللعبة</Chip>}
          </Chips>
          {moveEnabled && <Btn tone="gold" className="w-full min-h-[50px]" onClick={() => onMove(seat)}>⇄ نقل أو تبديل</Btn>}
          <div className="flex gap-2">
            <Btn className="flex-1" onClick={() => setMode('rename')}>✏️ الاسم</Btn>
            {photoOn && <Btn className="flex-1" onClick={() => void togglePhoto()}>{p.noPhoto === true ? '📸 يقبل التصوير' : '📵 لا يُصوَّر'}</Btn>}
          </div>
          <div className="flex gap-2">
            <Btn className="flex-1" onClick={() => setMode('penalty')}>⚠️ عقوبة</Btn>
            <Btn tone={isEx ? 'line' : 'plain'} className="flex-1" onClick={() => { onToggleExclude(seat); onClose(); }}>
              {isEx ? '↩ أعِده لهذه اللعبة' : '🚫 استبعده من هذه اللعبة'}
            </Btn>
          </div>
          <HoldButton disabled={busy} className="w-full min-h-[52px]" onHold={() => void kick()}>اضغط مطوّلاً: اطرده من الغرفة</HoldButton>
        </>
      )}
    </BottomSheet>
  );
}

// ══════════ لوح المقعد المحجوز ══════════
function HeldSheet({ seat, onClose }: { seat: number | null; onClose: () => void }) {
  const { gameState, emit, toast } = useCockpit();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const h = seat != null ? (gameState?.players || []).find((x: any) => Number(x.physicalId) === seat && x.seatHeld) : null;
  useEffect(() => { setErr(''); }, [seat]);
  useEffect(() => { if (seat != null && !h) onClose(); }, [seat, h, onClose]);
  if (seat == null || !h) return null;
  const release = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await emit('room:release-held-seat', { roomId: gameState.roomId, physicalId: seat });
      onClose();
      toast(`فُكّ حجز المقعد ${seat}`);
    } catch (e: any) { setErr(errMsg(e, 'تعذّر فكّ الحجز')); } finally { setBusy(false); }
  };
  return (
    <BottomSheet open title={`المقعد ${seat} محجوز`} onClose={onClose}>
      <SheetError>{err}</SheetError>
      <ListRow n="⏳" title={h.name} sub={heldSub(h)} />
      <Hint>المقعد محفوظٌ لصاحبه حتى يعود. فكُّه يحرّره لغيره، ولا تراجع عنه.</Hint>
      <HoldButton disabled={busy} className="w-full min-h-[52px]" onHold={() => void release()}>اضغط مطوّلاً: فكّ الحجز</HoldButton>
    </BottomSheet>
  );
}

// ══════════ لوح المتفرّج ══════════
function SpectatorSheet({ seat, onClose }: { seat: number | null; onClose: () => void }) {
  const { gameState, emit, toast } = useCockpit();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sp = seat != null ? (gameState?.spectators || []).find((x: any) => Number(x?.physicalId) === seat) : null;
  useEffect(() => { setErr(''); }, [seat]);
  useEffect(() => { if (seat != null && !sp) onClose(); }, [seat, sp, onClose]);
  if (seat == null || !sp) return null;
  const remove = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await emit('room:remove-spectator', { roomId: gameState.roomId, physicalId: seat });
      onClose();
      toast(`أُزيل ${sp.name || 'المتفرّج'} من المقعد ${seat}`);
    } catch (e: any) { setErr(errMsg(e, 'تعذّرت الإزالة')); } finally { setBusy(false); }
  };
  return (
    <BottomSheet open title={`المقعد ${seat} · متفرّج`} onClose={onClose}>
      <SheetError>{err}</SheetError>
      <ListRow n="👁" title={sp.name || 'متفرّج'} sub="يجلس في الحلقة وينتظر — يُدخَل من «الوصول» في الأدوات" />
      <HoldButton disabled={busy} className="w-full min-h-[52px]" onHold={() => void remove()}>اضغط مطوّلاً: أزِله من المقعد</HoldButton>
    </BottomSheet>
  );
}

// ══════════ المقاعد المثبّتة من القالب ══════════
function PinnedSeats({ gameState, players, onResync }: { gameState: any; players: any[]; onResync: () => void }) {
  const [open, setOpen] = useState(false);
  const pinned: any[] = useMemo(() => (Array.isArray(gameState?.pinnedSeats) ? gameState.pinnedSeats : []), [gameState?.pinnedSeats]);
  const tail = Number(gameState?.reservedTailSeats) || 0;
  const doors: any[] = Array.isArray(gameState?.doors) ? gameState.doors : [];
  const doorSeats: number[] = Array.isArray(gameState?.doorSeats) ? gameState.doorSeats : [];
  if (pinned.length === 0 && !tail && doors.length === 0) return null;
  return (
    <Section title={`📌 المثبّتة من القالب (${pinned.length})`}
      aside={<button type="button" onClick={() => setOpen((v) => !v)} className="min-h-[44px] px-2 text-[13px] text-[#C5A059]">{open ? 'إخفاء' : 'عرض'}</button>}>
      {open && (
        <>
          {doors.length > 0 && (
            <Chips>
              {doors.map((d: any, i: number) => <Chip key={i} tone={d?.type === 'entry' ? 'ok' : 'm'}>🚪 {d?.type === 'entry' ? 'دخول' : 'خروج'}</Chip>)}
              {doorSeats.length > 0 && <Chip>مقاعد مجاورة: {doorSeats.join('، ')}</Chip>}
            </Chips>
          )}
          {pinned.length === 0 ? (
            <Hint>لا مقاعد مثبّتة{tail ? ` — ${tail} مقاعد مؤخّرة محجوزة في التوزيع` : ''}.</Hint>
          ) : pinned.slice().sort((a, b) => Number(a?.seatNumber) - Number(b?.seatNumber)).map((ps: any) => {
            const filled = players.some((p) => Number(p.physicalId) === Number(ps?.seatNumber));
            return (
              <ListRow key={ps?.seatNumber} n={ps?.seatNumber} title={ps?.playerName || 'محجوز'}
                sub={filled ? 'حاضر' : 'بانتظار اللاعب'} right={filled ? <Chip tone="ok">✓</Chip> : <Chip>⏳</Chip>} />
            );
          })}
          {tail > 0 && pinned.length > 0 && <Hint>{tail} مقاعد مؤخّرة محجوزة في التوزيع.</Hint>}
          <Btn tone="line" className="w-full" onClick={onResync}>🔄 تحديث من القالب</Btn>
          <Hint>يسحب آخر نسخةٍ من القالب إلى هذه الغرفة بلا طرد أحد، ويبلّغ عن التعارضات.</Hint>
        </>
      )}
    </Section>
  );
}
