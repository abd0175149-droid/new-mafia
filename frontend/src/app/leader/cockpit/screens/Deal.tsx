'use client';
// ══════════════════════════════════════════════════════
// 🎴 الخطوة ٣ «التوزيع والاعتماد» (الخطّة الموحّدة 2026-11-20، المرحلة 2)
//
// • التوزيعُ جاهزٌ عند الدخول (setup:prepare-deal وزّع ما ليس مثبّتاً). لا توزيع تلقائيّ عند الفتح —
//   فجهازا موجّهَين لا يوزّعان معاً (حادثة 941).
// • 📌 ثبّت: المس كرتاً من الصفّ ثمّ مقعد صاحبه (يبادل مع حامله). ⇄ تبديل: رقمان فيتبادلان.
//   لوح المقعد: ثبّت/فكّ، بدّل، غيّر كرته. «🎲 أعد الخلط» يعيد غير المثبّت.
// • الاعتماد الختاميّ يحسبه الخادم (setup:review): الفرق، والمكرّر بشروطه، والممنوع، والمثبّت،
//   ومن بلا هاتف، والإعدادات. ثمّ «اعتمد وأرسل» (ضغطٌ مطوّل) ⟵ «ابدأ اللعبة» (ضغطٌ مطوّل).
// • أيُّ تغييرٍ بعد الإرسال يُسقط «أُرسلت»، فيعود الاعتماد، وكلّ الهواتف تعرض «راجع بطاقتك».
// ══════════════════════════════════════════════════════
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Role, ROLE_ICONS } from '@/lib/constants';
import { analyzeDuplicates, DUPLICABLE_ROLES, FILLER_ROLES, SINGLE_ROLE_REASON, DUPLICATE_BEHAVIOR } from '@/lib/role-duplicates';
import {
  ActionBar, Status, Section, Chips, Chip, Hint, Btn, HoldButton, BottomSheet, SeatGrid, seatCells, ListRow,
  useCockpit, teamOf, roleName, TEAM_AR, type SeatCellData, type SeatMark, type Team,
} from '../kit';
import { TapChip, errMsg } from './setup/ui';
import { StepRail, TeamBar } from './Setup';

const iconOf = (r: string) => ROLE_ICONS[r as Role] || '🎭';

interface Snap { rev: number; sent: boolean; pool: Role[]; assign: Record<number, Role>; pins: number[] }

const fromSnap = (s: any): Snap => ({
  rev: Number(s?.bindingRev) || 0,
  sent: s?.rolesConfirmed === true,
  pool: Array.isArray(s?.rolesPool) ? s.rolesPool : [],
  assign: Object.fromEntries((s?.assignments || []).filter((a: any) => a?.role).map((a: any) => [Number(a.physicalId), a.role])),
  pins: Array.isArray(s?.dealPins) ? s.dealPins.map(Number) : [],
});

export default function DealScreen() {
  const { gameState, emit, on, toast } = useCockpit();
  const roomId: string = gameState?.roomId;
  const players: any[] = useMemo(() => (Array.isArray(gameState?.players) ? gameState.players : []), [gameState?.players]);

  const [snap, setSnap] = useState<Snap>(() => fromSnap({
    bindingRev: gameState?.bindingRev, rolesConfirmed: gameState?.rolesConfirmed, rolesPool: gameState?.rolesPool, dealPins: gameState?.dealPins,
    assignments: players.map((p) => ({ physicalId: p.physicalId, role: p.role })),
  }));
  const revRef = useRef(snap.rev);
  const take = useCallback((s: any) => {
    if (!s) return;
    const n = fromSnap(s);
    if (n.rev < revRef.current) return;
    revRef.current = n.rev;
    setSnap(n);
  }, []);

  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'none' | 'swap' | 'pin'>('none');
  const [first, setFirst] = useState<number | null>(null);
  const [pinRole, setPinRole] = useState<Role | null>(null);
  const [seatSheet, setSeatSheet] = useState<number | null>(null);
  const [changeFor, setChangeFor] = useState<number | null>(null);
  const [review, setReview] = useState<any | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [flash, setFlash] = useState<number[]>([]);

  // 🔄 أحدثُ ما في الخادم عند الفتح (تحديث صفحة، جهاز ثانٍ)
  useEffect(() => {
    if (!roomId) return;
    emit('setup:review', { roomId }).then((r: any) => { if (r?.snapshot) take(r.snapshot); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  useEffect(() => {
    if (!on) return;
    return on('setup:binding-updated', (s: any) => {
      const before = revRef.current;
      take(s);
      if (typeof s?.bindingRev === 'number' && s.bindingRev > before + 1) toast('تغيّر التوزيع من جهاز موجّهٍ آخر — الشاشة محدَّثة');
    });
  }, [on, take, toast]);
  useEffect(() => { if (gameState?.rolesConfirmed === true) setSnap((s) => ({ ...s, sent: true })); }, [gameState?.rolesConfirmed]);

  const call = async (ev: string, data: any, ok?: string) => {
    if (busy) return null;
    setBusy(true);
    try {
      const r: any = await emit(ev, { roomId, ...data });
      if (r?.snapshot) take(r.snapshot);
      if (ok) toast(ok);
      return r;
    } catch (e: any) {
      toast(errMsg(e, 'تعذّر'), { tone: 'red' });
      const s = e?.response?.snapshot; if (s) take(s);
      return null;
    } finally { setBusy(false); }
  };

  const flashSeats = (s: number[]) => { setFlash(s); setTimeout(() => setFlash([]), 1400); };

  // ── الأفعال ──
  const swap = async (a: number, b: number) => {
    const r = await call('setup:swap-roles', { a, b, expectedRev: revRef.current }, `بُدّل ${a} و${b}`);
    if (r) flashSeats([a, b]);
  };
  const pin = async (seat: number, role: Role) => {
    const r = await call('setup:pin-role', { seat, role });
    if (r) { flashSeats([seat, ...(r.swappedWith ? [r.swappedWith] : [])]); toast(r.swappedWith ? `📌 «${roleName(role)}» ← ${seat} (بادل ${r.swappedWith})` : `📌 ثُبّت ${seat}`); }
  };
  const unpin = (seat: number) => call('setup:unpin', { seat }, `فُكّ تثبيت ${seat}`);
  const redeal = () => call('setup:redeal', {}, snap.pins.length ? `خُلط من جديد — ${snap.pins.length} مثبّت بقي مكانه` : 'خُلط من جديد');
  const changeCard = async (seat: number, role: Role) => {
    const r = await call('setup:change-card', { seat, role });
    if (r) { flashSeats([seat]); toast(`المقعد ${seat}: «${roleName(r.from)}» ⟵ «${roleName(role)}»`); }
    setChangeFor(null);
  };
  const back = () => call('setup:reopen-deck', { to: 'cards' });

  const openReview = async () => {
    const r: any = await call('setup:review', {});
    if (r?.review) { setReview(r.review); setReviewOpen(true); }
  };
  const send = async () => {
    const r: any = await call('setup:confirm-roles', { expectedRev: revRef.current });
    if (r) {
      setSnap((s) => ({ ...s, sent: true, rev: typeof r.bindingRev === 'number' ? r.bindingRev : s.rev }));
      setReviewOpen(false);
      toast('✓ وصلت الكروت للهواتف');
    } else {
      // تغيّر من جهازٍ آخر أو لا يطابق ⇒ اعتمادٌ جديد بما هو قائم
      const rv: any = await emit('setup:review', { roomId }).catch(() => null);
      if (rv?.snapshot) take(rv.snapshot);
      if (rv?.review) setReview(rv.review);
    }
  };
  const start = async () => {
    const r = await call('setup:binding-complete', {});
    if (r) toast('بدأت اللعبة');
  };

  // ── الشبكة ──
  const cells = seatCells(gameState);
  const eligible = new Set(players.filter((p) => p.isAlive !== false && !p.seatHeld).map((p) => Number(p.physicalId)));
  const onSeat = (c: SeatCellData) => {
    const n = c.seat;
    if (!c.player || !eligible.has(n)) { toast(c.held ? `المقعد ${n} محجوز` : c.spectator ? `المقعد ${n} لمتفرّج` : `المقعد ${n} فارغ`); return; }
    if (mode === 'pin' && pinRole) { setMode('none'); setPinRole(null); void pin(n, pinRole); return; }
    if (mode === 'swap') {
      if (first == null) { setFirst(n); return; }
      if (first === n) { setFirst(null); return; }
      const a = first; setFirst(null); void swap(a, n); return;
    }
    setSeatSheet(n);
  };
  const mark = (c: SeatCellData): SeatMark | null => {
    if (!c.player) return null;
    const r = snap.assign[c.seat];
    const m: SeatMark = {};
    if (r) { m.label = `${iconOf(r)} ${roleName(r)}`; m.tone = teamOf(r); }
    if (snap.pins.includes(c.seat)) m.topLeft = '📌';
    if (c.player.isConnected === false) m.topRight = '○';
    if (mode === 'swap' && first === c.seat) m.selected = true;
    if (mode === 'pin' && pinRole && r === pinRole) m.need = true;
    if (flash.includes(c.seat)) m.done = true;
    return m;
  };

  // ── صفّ الكروت (للتثبيت) ──
  const tray = useMemo(() => {
    const m = new Map<Role, number>();
    snap.pool.forEach((r) => m.set(r, (m.get(r) || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => ('MCN'.indexOf(teamOf(a[0]) || 'C') - 'MCN'.indexOf(teamOf(b[0]) || 'C')));
  }, [snap.pool]);

  const unbound = players.filter((p) => eligible.has(Number(p.physicalId)) && !snap.assign[Number(p.physicalId)]).length;
  const offline = players.filter((p) => eligible.has(Number(p.physicalId)) && p.isConnected === false);
  const meta = snap.sent ? `✓ أُرسلت · ${snap.pool.length} لاعباً` : `${snap.pool.length} كرتاً${snap.pins.length ? ` · ${snap.pins.length} مثبّت` : ''}${unbound ? ` · ${unbound} بلا كرت` : ''}`;

  const primary = snap.sent
    ? { label: busy ? '…' : 'ابدأ اللعبة', onPress: start, disabled: busy, hold: true, sub: `اضغط مطوّلاً · تبدأ بنقاش الجولة 1${offline.length ? ` · ${offline.length} بلا هاتف` : ''}` }
    : { label: busy ? '…' : 'راجع واعتمد', onPress: openReview, disabled: busy || snap.pool.length === 0, sub: 'ملخّصٌ أخير قبل أن تصل الكروت الهواتف' };

  return (
    <>
      <Status meta={meta} />
      <StepRail step={3} onStep={() => void back()} />
      <ActionBar primary={primary} secondary={{ label: '🎲 أعد الخلط', onPress: () => void redeal(), disabled: busy }} />

      <TeamBar roles={snap.pool} incoming={gameState?.config?.lateEntry?.enabled ? { count: (gameState.config.lateEntry.waves || []).reduce((s: number, w: any) => s + (w.count || 0), 0), mafia: (gameState.config.lateEntry.waves || []).reduce((s: number, w: any) => s + (w.mafia || 0), 0) } : null} />

      <Chips>
        <TapChip on={mode === 'swap'} onClick={() => { setMode(mode === 'swap' ? 'none' : 'swap'); setFirst(null); setPinRole(null); }}>⇄ تبديل</TapChip>
        <TapChip onClick={() => void back()}>↩ اللعبة والكروت</TapChip>
        {snap.sent && <Chip tone="ok">✓ أُرسلت للهواتف</Chip>}
      </Chips>

      <Hint>
        {mode === 'swap' ? (first == null ? 'المس الرقم الأوّل…' : `المس الرقم الثاني ليتبادل كرته مع ${first}.`)
          : mode === 'pin' && pinRole ? `المس مقعد «${roleName(pinRole)}». إن كان الكرت عند غيره يتبادلان.`
          : 'ثبّت: المس كرتاً من الصفّ ثمّ مقعد صاحبه. أو المس مقعداً لأفعاله. المثبّت 📌 لا يمسّه «أعد الخلط».'}
      </Hint>

      <Section title="الكروت" aside={`${snap.pool.length}`}>
        <Chips>
          {tray.map(([r, k]) => {
            const t = teamOf(r);
            return (
              <TapChip key={r} on={mode === 'pin' && pinRole === r} tone={t === 'M' ? 'm' : t === 'N' ? 'n' : 'c'}
                onClick={() => { if (mode === 'pin' && pinRole === r) { setMode('none'); setPinRole(null); return; } setMode('pin'); setPinRole(r); setFirst(null); }}>
                {iconOf(r)} {roleName(r)}{k > 1 ? ` ×${k}` : ''}
              </TapChip>
            );
          })}
        </Chips>
      </Section>

      <Section title="المقاعد">
        <SeatGrid cells={cells} onSeat={onSeat} mark={mark} />
      </Section>

      {offline.length > 0 && (
        <Section tone="red" title={`○ بلا اتّصال (${offline.length})`}>
          <Chips>{offline.map((p) => <Chip key={p.physicalId} tone="m"><b className="tabular-nums">{p.physicalId}</b> {p.name}</Chip>)}</Chips>
          <Hint>لن يرى كرته حتّى يتّصل. انتظره، أو ارجع للطاولة واستبعده. «ابدأ» يحذّر ولا يمنع.</Hint>
        </Section>
      )}

      <SeatSheet seat={seatSheet} snap={snap} players={players} onClose={() => setSeatSheet(null)}
        onPin={(s) => { setSeatSheet(null); const r = snap.assign[s]; if (r) void pin(s, r); }}
        onUnpin={(s) => { setSeatSheet(null); void unpin(s); }}
        onSwap={(s) => { setSeatSheet(null); setMode('swap'); setFirst(s); }}
        onChange={(s) => { setSeatSheet(null); setChangeFor(s); }} />

      <ChangeSheet seat={changeFor} snap={snap} onPick={changeCard} onClose={() => setChangeFor(null)} />

      <ReviewSheet open={reviewOpen} review={review} busy={busy} onClose={() => setReviewOpen(false)} onSend={send} />
    </>
  );
}

function SeatSheet({ seat, snap, players, onClose, onPin, onUnpin, onSwap, onChange }: {
  seat: number | null; snap: Snap; players: any[]; onClose: () => void;
  onPin: (s: number) => void; onUnpin: (s: number) => void; onSwap: (s: number) => void; onChange: (s: number) => void;
}) {
  if (seat == null) return null;
  const role = snap.assign[seat];
  const p = players.find((x) => Number(x.physicalId) === seat);
  const t = role ? teamOf(role) : null;
  const pinned = snap.pins.includes(seat);
  return (
    <BottomSheet open title={`المقعد ${seat} · ${p?.name || ''}`} onClose={onClose}>
      {role ? <ListRow n={iconOf(role)} title={roleName(role)} sub={t ? TEAM_AR[t] : undefined} right={pinned ? <Chip tone="g">📌 مثبّت</Chip> : undefined} /> : <Hint>بلا كرت — «أعد الخلط».</Hint>}
      {role && (pinned
        ? <Btn className="w-full" onClick={() => onUnpin(seat)}>فكّ التثبيت</Btn>
        : <Btn tone="line" className="w-full" onClick={() => onPin(seat)}>📌 ثبّت هذا الكرت له</Btn>)}
      {role && <Btn tone="line" className="w-full" onClick={() => onSwap(seat)}>⇄ بدّل كرته مع مقعدٍ آخر</Btn>}
      {role && <Btn className="w-full" onClick={() => onChange(seat)}>✏️ غيّر كرته إلى كرتٍ آخر</Btn>}
      {p?.isConnected === false && <Hint>○ غير متّصل — لن يرى كرته حتّى يتّصل.</Hint>}
    </BottomSheet>
  );
}

function ChangeSheet({ seat, snap, onPick, onClose }: { seat: number | null; snap: Snap; onPick: (s: number, r: Role) => void; onClose: () => void }) {
  if (seat == null) return null;
  const cur = snap.assign[seat];
  const all = Object.values(Role) as Role[];
  const groups: Array<[Team, string]> = [['M', 'المافيا'], ['C', 'المدينة'], ['N', 'المستقلّون']];
  return (
    <BottomSheet open title={`غيّر كرت ${seat}${cur ? ` («${roleName(cur)}»)` : ''}`} onClose={onClose}>
      <Hint>يتغيّر الحوض نفسه: يخرج «{roleName(cur)}» ويدخل ما تختار. المكرّر يُسمح بشروطه، و«نسخة واحدة» لا يتكرّر.</Hint>
      {groups.map(([t, title]) => (
        <div key={t} className="flex flex-col gap-1.5">
          <b className="text-[13px] text-[#9a8f7e]">{title}</b>
          {all.filter((r) => teamOf(r) === t && r !== Role.OLDER_BROTHER && r !== Role.YOUNGER_BROTHER).map((r) => {
            const inUse = snap.pool.some((x, i) => x === r) && r !== cur;
            const blocked = inUse && !FILLER_ROLES.has(r) && !DUPLICABLE_ROLES.has(r);
            return (
              <ListRow key={r} n={iconOf(r)} selected={r === cur} title={roleName(r)}
                sub={blocked ? SINGLE_ROLE_REASON[r] : inUse && !FILLER_ROLES.has(r) ? 'نسخة إضافيّة' : undefined}
                right={blocked ? <Chip tone="m">نسخة واحدة</Chip> : inUse && !FILLER_ROLES.has(r) ? <Chip tone="c">تكرار</Chip> : undefined}
                onClick={blocked || r === cur ? undefined : () => onPick(seat, r)} />
            );
          })}
        </div>
      ))}
    </BottomSheet>
  );
}

function ReviewSheet({ open, review, busy, onClose, onSend }: { open: boolean; review: any; busy: boolean; onClose: () => void; onSend: () => void }) {
  if (!open || !review) return null;
  const s = review.settings || {};
  const c = review.counts || {};
  const blocked: any[] = review.blocked || [];
  const issue: string | null = review.sendIssue || null;
  const kv: Array<[string, string]> = [
    ['⏱️ المدّة', s.minutes ? `${s.minutes} دقيقة` : 'بلا مؤقّت'],
    ['🌙 الليل', s.nightKind === 'queue' ? 'يدويّ — الطابور' : `آليّ · ${s.nightSeconds} ث`],
    ['⚖️ العقوبات', String(s.penalties)],
    ['💣 القنبلة', s.bomb ? 'مفعّلة' : 'مطفأة'],
    ['👁️ تعارف المافيا', s.reveal ? 'نعم' : 'لا'],
    ['💬 تشاور المافيا', s.chat ? 'نعم' : 'لا'],
    ['⚔️ المواجهة', s.conf ? 'نعم' : 'لا'],
    ['♟️ مافيا متتالية', s.consec ? `أقصاه ${s.consec}` : 'بلا حدّ'],
    ...(s.contracts != null ? [['🔪 العقود', String(s.contracts)] as [string, string]] : []),
    ...(s.jesterRound != null ? [['🤡 المهرّج', `من الجولة ${s.jesterRound}`] as [string, string]] : []),
    ...(s.mayor != null ? [['🎩 العمدة', `×${s.mayor}`] as [string, string]] : []),
    ...(s.phoenix != null ? [['🔥 العنقاء', `${s.phoenix} بعث`] as [string, string]] : []),
    ...(s.lateEntry ? [['🚪 الدخول المتأخّر', (s.lateEntry.waves || []).map((w: any) => `الليل ${w.at}: ${w.count} (${w.mafia} مافيا)`).join(' · ')] as [string, string]] : []),
  ];
  return (
    <BottomSheet open title="📋 الاعتماد الختاميّ" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-[#d0474c]/50 bg-[#d0474c]/10 py-2"><b className="block text-[26px] tabular-nums text-[#f2a6a9]">{c.mafia}</b><small>مافيا</small></div>
        <div className="rounded-xl border border-[#63afd9]/45 bg-[#63afd9]/10 py-2"><b className="block text-[26px] tabular-nums text-[#a9d4ee]">{c.citizen}</b><small>مدينة</small></div>
        <div className="rounded-xl border border-[#d9a23a]/50 bg-[#d9a23a]/10 py-2"><b className="block text-[26px] tabular-nums text-[#f0c879]">{c.neutral}</b><small>مستقلّ</small></div>
      </div>
      <Hint>{review.total} كرتاً لـ{review.players} لاعباً{review.total === review.players ? ' ✓' : ' — لا يتطابق!'}</Hint>
      {(review.duplicates || []).length > 0 && (
        <Section tone="sky" title="🃏 كروتٌ مكرّرة وشروطها">
          {(review.duplicates || []).map((d: any) => (
            <Hint key={d.role}><b className="text-[#efe8da]">{iconOf(d.role)} {roleName(d.role)} ×{d.count}</b> — {d.role === 'ASSASSIN'
              ? (review.assassinMode === 'PARTNERS' ? 'شركاء: عقودٌ مشتركة، يرى كلٌّ شريكه، ويفوزون معاً' : 'متنافسون: لكلٍّ عقوده، ولا يعرف أحدهم الآخر، وأوّل من يُكمل يفوز وحده')
              : DUPLICATE_BEHAVIOR[d.role]}</Hint>
          ))}
        </Section>
      )}
      {blocked.length > 0 && <Section tone="red" title="⛔ ممنوع">{blocked.map((b) => <Hint key={b.role}>{roleName(b.role)} ×{b.count} — {b.reason}</Hint>)}</Section>}
      {(review.pins || []).length > 0 && (
        <Section title="📌 المثبّت بيدك">
          <Chips>{review.pins.map((p: any) => <Chip key={p.seat}><b className="tabular-nums">{p.seat}</b> {roleName(p.role)}</Chip>)}</Chips>
        </Section>
      )}
      {(review.offline || []).length > 0 && (
        <Section tone="red" title="○ بلا اتّصال">
          <Hint>{review.offline.map((o: any) => `${o.seat} ${o.name}`).join('، ')} — لن يرى كرته حتّى يتّصل.</Hint>
        </Section>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-[#2a241c] bg-[#0e0c0a] px-3 py-2 text-[13.5px]">
        {kv.map(([k, v]) => <Fragment key={k}><span className="text-[#9a8f7e]">{k}</span><b>{v}</b></Fragment>)}
      </div>
      {issue && <Hint><b className="text-[#ffc2c4]">⛔ {issue}</b></Hint>}
      <HoldButton tone="gold" disabled={busy || !!issue || blocked.length > 0} className="w-full min-h-[54px]" onHold={onSend}>اضغط مطوّلاً: اعتمد وأرسل للهواتف</HoldButton>
      <Btn className="w-full" onClick={onClose}>رجوع للتوزيع</Btn>
    </BottomSheet>
  );
}

export { analyzeDuplicates };
