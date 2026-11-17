'use client';
// ══════════════════════════════════════════════════════
// 🧭 الطابور — خطوةٌ خطوة: المؤدّي، شبكة الأهداف الصالحة، تأكيد/تخطٍّ
//
// الأحداث والحمولات كما في LeaderNightView: night:submit-action {role,targetPhysicalId}،
// night:skip-action {role}، night:resolve. والاختيار غير المؤكَّد يُحفظ محلّيّاً بالمفتاح
// نفسه (mafia_leader_night_sel) فينجو من تحديث الصفحة.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { ActionBar, BottomSheet, Btn, Chip, Hint, ListRow, Section, SeatGrid, Status, seatCells, useCockpit } from '../../kit';
import { useHost } from '../../host';
import { useSeatMove } from '../../../SeatMove';
import { ACTION_ICON, useBusy } from './meta';

const SEL_KEY = 'mafia_leader_night_sel';
const clearSaved = () => { try { localStorage.removeItem(SEL_KEY); } catch { /* */ } };

/**
 * 🔁 الليل بدأ طابوراً والمقصود «الليلة الواحدة» (بُدئ من الواجهة القديمة مثلاً).
 * يُسقط الطابور وما سُجّل فيه هذه الليلة (night:restart) ثمّ يسأل الهواتف كلّها معاً.
 * لا يمسّ ما قبل الليل. للغرف الحضوريّة وحدها — الخادم يرفض غيرها.
 */
function RestartAsOne() {
  const { gameState, emit, run } = useCockpit();
  const host = useHost();
  const { busy, wrap } = useBusy();
  const [ask, setAsk] = useState(false);
  const cfg = gameState?.config || {};
  if (cfg.isRemote || cfg.nightMode === 'auto') return null;
  const secs = Math.min(180, Math.max(30, Number(cfg.nightSeconds) || 60));
  const go = () => wrap(async () => {
    const r: any = await run(() => emit('night:restart', { roomId: gameState.roomId }));
    if (!r) return;
    clearSaved();
    setAsk(false);
    await run(() => host.oneNight.start(secs), 'وصل السؤال لكلّ الهواتف');
  });
  return (
    <>
      <Section title="🔁 بدأ الليل بالطابور خطأً؟">
        <Hint>إن كان المقصود أن يختار اللاعبون من هواتفهم، حوّل الليل إلى «الليلة الواحدة». يُلغى الطابور وما سُجّل فيه هذه الليلة فقط.</Hint>
        <Btn tone="line" className="w-full" disabled={busy} onClick={() => setAsk(true)}>🌙 حوّل إلى الليلة الواحدة</Btn>
      </Section>
      <BottomSheet open={ask} title="تحويل الليل إلى الليلة الواحدة" onClose={() => setAsk(false)}>
        <Hint>يُلغى الطابور وكلّ ما سُجّل فيه هذه الليلة، ثمّ يصل السؤال لكلّ الهواتف معاً بمهلة {secs} ث.</Hint>
        <Hint>لا يتغيّر شيء ممّا قبل الليل: الإقصاء والجولة وعقود السفّاح كما هي.</Hint>
        <div className="flex gap-2">
          <Btn tone="gold" className="flex-[2]" disabled={busy} onClick={go}>{busy ? '…' : 'نعم — ابدأ الليلة الواحدة'}</Btn>
          <Btn className="flex-1" disabled={busy} onClick={() => setAsk(false)}>إلغاء</Btn>
        </div>
      </BottomSheet>
    </>
  );
}

export function QueueStepView() {
  const { gameState, emit, run } = useCockpit();
  const seatMove = useSeatMove();
  const { busy, wrap } = useBusy();
  const step = gameState.nightStep;
  const [sel, setSel] = useState<number | null>(null);

  // تصفير الاختيار عند تغيّر الخطوة — مع استرجاع اختيارٍ محفوظ لنفس الخطوة
  useEffect(() => {
    let restored: number | null = null;
    try {
      const saved = localStorage.getItem(SEL_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        if (s.roomId === gameState.roomId && s.role === step?.role && s.performerPhysicalId === step?.performerPhysicalId && typeof s.target === 'number') restored = s.target;
      }
    } catch { /* */ }
    setSel(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.role, step?.performerPhysicalId, gameState.roomId]);
  useEffect(() => {
    try {
      if (sel !== null && step) localStorage.setItem(SEL_KEY, JSON.stringify({ roomId: gameState.roomId, role: step.role, performerPhysicalId: step.performerPhysicalId, target: sel }));
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, step?.role, gameState.roomId]);
  // 🪑 نقل مقعد ⇒ الرقم المختار صار شخصاً آخر — الخطوة نفسها تُعاد من الخادم
  useEffect(() => { if (seatMove.remapVersion) { setSel(null); clearSaved(); } }, [seatMove.remapVersion]);

  // 🔪🔪 عقود سفّاح هذه الخطوة بعينه (الأوّل في assassinState والمتنافسون في assassinRivals)
  const stepAssassin = (() => {
    const all = [gameState.assassinState, ...(gameState.assassinRivals || [])].filter(Boolean);
    const seat = step?.performerPhysicalId;
    return all.find((a: any) => (a.memberSeats?.length ? a.memberSeats : [a.assassinPhysicalId]).includes(seat)) || gameState.assassinState || null;
  })();
  const isAssassinStep = step?.role === 'ASSASSINATE' || step?.role === 'ASSASSIN';

  const targets = new Set<number>((step?.availableTargets || []).map((t: any) => Number(t.physicalId)));
  const selName = sel != null ? (step?.availableTargets || []).find((t: any) => t.physicalId === sel)?.name : null;

  const submit = () => wrap(async () => {
    if (!step || sel === null) return;
    const target = sel;
    const r = await run(() => emit('night:submit-action', { roomId: gameState.roomId, role: step.role, targetPhysicalId: target }), `سُجّل: ${step.roleName} ← ${target}`);
    if (r) { clearSaved(); setSel(null); }
  });
  const skip = () => wrap(async () => {
    if (!step) return;
    const r = await run(() => emit('night:skip-action', { roomId: gameState.roomId, role: step.role }), `تُخطّي: ${step.roleName}`);
    if (r) { clearSaved(); setSel(null); }
  });

  const icon = ACTION_ICON[step?.role] || '🌙';
  const disabledStep = !!step?.isDisabled;

  return (
    <>
      <Status meta={`الطابور · ${step?.roleName || ''}`} />
      <ActionBar
        primary={disabledStep
          ? { label: 'تخطَّ — القدرة معطّلة', onPress: skip, disabled: busy }
          : { label: sel != null ? `تأكيد ← ${sel}` : 'اختر هدفاً', sub: sel != null && selName ? selName : undefined, onPress: submit, disabled: sel == null || busy }}
        secondary={!disabledStep && step?.canSkip ? { label: 'تخطّي', onPress: skip, disabled: busy } : undefined}
      />

      <ListRow n={step?.performerPhysicalId ?? '—'} selected
        title={<>{icon} {step?.roleName}</>}
        sub={`${step?.performerName || ''} — ${disabledStep ? 'معطَّل الليلة' : 'المس الهدف ثمّ أكّد'}`} />

      {isAssassinStep && stepAssassin && Array.isArray(stepAssassin.contracts) && (
        <Section title="🗡️ عقود الاغتيال" aside={`${stepAssassin.completedCount ?? 0}/${stepAssassin.totalRequired ?? stepAssassin.contracts.length}`}>
          {stepAssassin.contracts.map((c: any, i: number) => {
            const current = i === stepAssassin.currentContractIndex && !c.completed;
            return (
              <div key={c.id ?? i} className={`flex items-center gap-2 rounded-[11px] border px-2.5 py-2 text-[13px] ${c.completed ? 'border-[#43b27f]/40 text-[#99dcba]' : current ? 'border-[#C5A059]/60 bg-[#C5A059]/10' : 'border-[#2a241c] text-[#9a8f7e]'}`}>
                <span className="shrink-0 w-6 text-center">{c.completed ? '✅' : current ? '🔪' : (c.id ?? i + 1)}</span>
                <span className={`flex-1 min-w-0 ${c.completed ? 'line-through' : ''}`}>{c.description || c.descriptionAr || `اغتيال ${c.targetRole ?? ''}`}</span>
                {current && <Chip tone="g">الحاليّ</Chip>}
              </div>
            );
          })}
        </Section>
      )}

      {disabledStep ? (
        <Section tone="red" title="🚫 القدرة معطّلة">
          <Hint>عطّلت الساحرة هذه القدرة الليلة{step?.disabledRoleName ? ` (${step.disabledRoleName})` : ''}. تخطَّ للخطوة التالية.</Hint>
        </Section>
      ) : (
        <Section title="الهدف" aside={`${targets.size} متاح`}>
          <SeatGrid cells={seatCells(gameState)}
            mark={(c) => ({
              selected: sel === c.seat,
              ghost: c.seat === step?.performerPhysicalId,
              disabled: busy || !targets.has(c.seat),
            })}
            onSeat={(c) => setSel(c.seat)} />
          {targets.size === 0 && <Hint>لا هدف متاحاً لهذه القدرة — تخطَّها.</Hint>}
        </Section>
      )}

      <RestartAsOne />
    </>
  );
}

export function QueueCompleteView() {
  const { gameState, emit, run } = useCockpit();
  const { busy, wrap } = useBusy();
  const resolve = () => wrap(() => run(() => emit('night:resolve', { roomId: gameState.roomId })));
  return (
    <>
      <Status meta="الطابور · اكتمل" />
      <ActionBar primary={{ label: busy ? 'يُحسب…' : 'اضغط مطوّلاً: احسب الليلة', sub: 'لا رجعة بعد الحساب', hold: true, disabled: busy, onPress: resolve }} />
      <Section title="⚙️ اكتمل طابور الليل">
        <Hint>سُجّلت كلّ الخطوات. الحساب يقرّر أحداث الليل ويفتح ملخّص الصباح.</Hint>
      </Section>
      <RestartAsOne />
    </>
  );
}

/** نتيجة الشريف — للّيدر وحده. تُفتح حين تصل نتيجةٌ جديدة أثناء الليل. */
export function SheriffSheet() {
  const { gameState } = useCockpit();
  const sr = gameState?.sheriffResult;
  const seen = useRef(sr);   // نتيجة ليلةٍ سابقة باقية في الحالة — لا تُفتح عند الدخول
  const [shown, setShown] = useState<any>(null);
  useEffect(() => {
    if (sr && sr !== seen.current) { seen.current = sr; setShown(sr); }
  }, [sr]);
  const p = shown ? (gameState.players || []).find((x: any) => x.physicalId === shown.targetPhysicalId) : null;
  const mafia = shown?.result === 'MAFIA';
  return (
    <BottomSheet open={!!shown} title="نتيجة التحقيق" onClose={() => setShown(null)}>
      {shown && (
        <>
          <div className="text-center rounded-[18px] border border-[#2a241c] bg-[#0e0c0a] px-3 py-4 flex flex-col items-center gap-1">
            <span className="text-[13px] text-[#9a8f7e]">🔒 للّيدر وحده</span>
            <span className="text-[20px] text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>{shown.targetPhysicalId} · {p?.name || shown.targetName || ''}</span>
            <span className="text-[40px] font-extrabold leading-tight" style={{ color: mafia ? '#d0474c' : '#63afd9' }}>{mafia ? 'مافيا' : 'مواطن'}</span>
          </div>
          <button type="button" onClick={() => setShown(null)} className="min-h-[50px] rounded-[13px] bg-[#C5A059] text-[#110d08] font-bold">فهمت</button>
        </>
      )}
    </BottomSheet>
  );
}
