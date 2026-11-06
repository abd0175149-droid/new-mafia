'use client';
// ══════════════════════════════════════════════════════
// 🌙 مراجعة الليلة الواحدة — صفٌّ لكلّ قدرة، والمس لتصحيح الهدف
//
// منقولة من OneNightReview: قيمةُ الموجّه تعلو اختيار اللاعب، ولا يُعدَّل ما لا أثر له
// (صفوف «بلا دور» تُعرض ولا تُلمس). الاعتماد بالحمولة نفسها: كلّ صفٍّ فاعلٍ بقيمته.
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { ActionBar, BottomSheet, Chip, Hint, ListRow, Section, SeatGrid, Status, seatCells, roleName, useCockpit } from '../../kit';
import { useHost } from '../../host';
import { useSeatMove } from '../../../SeatMove';

export interface ReviewRow {
  seat: number;
  seatName: string;
  role: string | null;
  abilityId: string | null;
  abilityAr: string;
  disabled: boolean;
  targetPhysicalId: number | null;
  targetName: string | null;
  editable: boolean;
}

const keyOf = (r: ReviewRow) => `${r.seat}:${r.abilityId}`;

export default function ReviewView({ acting, idle }: { acting: ReviewRow[]; idle: ReviewRow[] }) {
  const { gameState, run, toast } = useCockpit();
  const host = useHost();
  const seatMove = useSeatMove();
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const isRemote = gameState?.config?.isRemote === true;

  const sig = acting.map(keyOf).join('|');
  useEffect(() => { setEdits({}); setOpenKey(null); }, [sig]);
  // 🪑 بعد نقل مقعد صار كلّ رقمٍ يشير إلى شخصٍ آخر — تُمحى التصحيحات المحلّيّة
  useEffect(() => { if (seatMove.remapVersion) { setEdits({}); setOpenKey(null); } }, [seatMove.remapVersion]);

  const valueOf = (r: ReviewRow) => { const k = keyOf(r); return k in edits ? edits[k] : r.targetPhysicalId; };
  const changed = useMemo(() => acting.filter(r => { const k = keyOf(r); return k in edits && edits[k] !== r.targetPhysicalId; }).length, [acting, edits]);
  // حاملُ قدرتين يظهر في صفّين — يُعلَّم كي لا يُقرأ صفّاه لاعبَين
  const twice = useMemo(() => {
    const c: Record<number, number> = {};
    for (const r of acting) c[r.seat] = (c[r.seat] || 0) + 1;
    return new Set(Object.entries(c).filter(([, n]) => n > 1).map(([s]) => Number(s)));
  }, [acting]);

  const players: any[] = gameState?.players || [];
  const nameOf = (id: number | null) => (id == null ? null : players.find(p => p.physicalId === id)?.name ?? null);
  const targetLine = (r: ReviewRow) => {
    const v = valueOf(r);
    return v == null ? '— لم يختر أحداً' : `← ${v} ${nameOf(v) ?? (v === r.targetPhysicalId ? r.targetName ?? '' : '')}`.trim();
  };

  const openRow = openKey ? acting.find(r => keyOf(r) === openKey) || null : null;
  const setTarget = (r: ReviewRow, v: number | null) => {
    const k = keyOf(r);
    const had = k in edits; const old = edits[k];
    setEdits(p => ({ ...p, [k]: v }));
    setOpenKey(null);
    toast(`${r.abilityAr} ${r.seat}: ${v == null ? 'لم يختر أحداً' : `الهدف ${v}`}`, {
      undo: () => setEdits(p => { const n = { ...p }; if (had) n[k] = old; else delete n[k]; return n; }),
    });
  };

  const apply = () => run(() => host.oneNight.apply(
    acting.filter(r => r.abilityId).map(r => ({ seat: r.seat, abilityId: r.abilityId as string, targetPhysicalId: valueOf(r) })),
  ));

  return (
    <>
      <Status meta={`المراجعة · ${acting.length} قدرة${changed ? ` · عدّلتَ ${changed}` : ''}`} />
      <ActionBar primary={{
        label: host.oneNight.busy ? 'يُحسب…' : 'اضغط مطوّلاً: احسب الليلة',
        sub: 'لا رجعة بعد الحساب', hold: true, disabled: host.oneNight.busy, onPress: apply,
      }} />

      <Hint>{isRemote
        ? 'غرفةٌ بعيدة: اختيارات اللاعبين نهائيّة ولا تُصحَّح من هنا.'
        : 'كلّ قدرةٍ بهدفها، بترتيب الحساب. المس السطر لتصحيح هدف من لعب بالإشارة أو أخطأ.'}</Hint>

      <Section title="أصحاب الأدوار" aside={`${acting.length} قدرة`}>
        {acting.length === 0 && <Hint>لا قدرات تتحرّك هذه الليلة.</Hint>}
        {acting.map((r, i) => {
          const k = keyOf(r);
          const edited = k in edits && edits[k] !== r.targetPhysicalId;
          return (
            <ListRow key={`${k}:${i}`} n={r.seat}
              selected={openKey === k}
              onClick={isRemote ? undefined : () => setOpenKey(k)}
              title={<>{r.abilityAr} · {roleName(r.role)}{twice.has(r.seat) && <span className="text-[#C5A059]"> ✦</span>}</>}
              sub={`${r.seatName} ${targetLine(r)}`}
              right={<span className="flex flex-col items-end gap-1 shrink-0">
                {r.disabled && <Chip tone="m">معطَّل</Chip>}
                {edited ? <Chip tone="ok">عُدِّل</Chip> : !isRemote && <Chip tone="g">تصحيح</Chip>}
              </span>} />
          );
        })}
        {twice.size > 0 && <Hint>✦ مقعدٌ يحمل قدرتين — يظهر في صفّين، صفٌّ لكلّ قدرة.</Hint>}
      </Section>

      {idle.length > 0 && (
        <Section title="بلا دورٍ هذه الليلة" aside="تُعرض ولا تُحسب">
          {idle.map((r, i) => (
            <ListRow key={`idle:${r.seat}:${i}`} n={r.seat} title={<span className="text-[#cfc6b6]">{r.seatName}</span>}
              sub={`${roleName(r.role)} ${r.targetPhysicalId == null ? '— لم يختر' : `← ${r.targetPhysicalId} ${r.targetName ?? ''}`}`} />
          ))}
        </Section>
      )}

      <BottomSheet open={!!openRow} title={openRow ? `${openRow.abilityAr} — ${openRow.seat}` : ''} onClose={() => setOpenKey(null)}>
        {openRow && (
          <>
            <Hint>المس الهدف الصحيح. المقعد {openRow.seat} صاحب القدرة.</Hint>
            <SeatGrid cells={seatCells(gameState)}
              mark={(c) => ({
                selected: valueOf(openRow) === c.seat,
                ghost: c.seat === openRow.seat,
                disabled: !c.player || c.player.isAlive === false,
              })}
              onSeat={(c) => setTarget(openRow, c.seat)} />
            <button type="button" onClick={() => setTarget(openRow, null)}
              className={`min-h-[48px] rounded-[13px] border font-bold ${valueOf(openRow) == null ? 'border-[#C5A059] bg-[#C5A059]/15 text-[#C5A059]' : 'border-[#2a241c] bg-[#16130f]'}`}>
              لم يختر أحداً
            </button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
