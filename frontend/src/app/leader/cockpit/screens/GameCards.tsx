'use client';
// ══════════════════════════════════════════════════════
// 🃏 الخطوة ٢ «اللعبة والكروت» — الإعدادات والتركيبة في صفحةٍ واحدة (الخطّة الموحّدة، المرحلة 2)
//
// • الوصفة: المافيا تلقائيّ أو عدد، ولكلّ كرتٍ مميّز عددُ نسخ (حتّى 3) أو تلقائيّ أو مطفأ.
//   التركيبة تُبنى منها، فلا يمحو تغيّرُ عدد اللاعبين تعديلاتك.
// • القوالب: ⭐ يُحمَّل في كلّ غرفة. تطبيقُ قالبٍ يُتراجع عنه.
// • «التالي: التوزيع» يرسل الإعدادات ثمّ setup:prepare-deal — الحوضُ والتوزيعُ بطلبٍ واحد تحت القفل.
// ══════════════════════════════════════════════════════
import { Fragment, useMemo, useState } from 'react';
import { Role, ROLE_ICONS } from '@/lib/constants';
import { analyzeDuplicates, DUPLICABLE_ROLES, SINGLE_ROLE_REASON, DUPLICATE_BEHAVIOR, MAX_COPIES } from '@/lib/role-duplicates';
import { ActionBar, Status, Section, Chips, Chip, Hint, Btn, BottomSheet, Seg, Stepper, SetRow, Switch, ListRow, useCockpit, teamOf } from '../kit';
import { TapChip, inputCls, errMsg } from './setup/ui';
import { StepRail, TeamBar, useRoleFaces, roleAr } from './Setup';
import {
  MINUTES, M_ORDER, C_ORDER, autoMafia, composeDeck, extrasAllowed, samePlan, normalizePlan,
  type SetupPlan, type Template, type LateWave, useTemplates,
} from '../setupPlan';

const iconOf = (r: string) => ROLE_ICONS[r as Role] || '🎭';
const FILL = new Set<string>([Role.CITIZEN, Role.MAFIA_REGULAR]);
const ADDABLE: Role[] = [...M_ORDER, ...C_ORDER, Role.JESTER, Role.ASSASSIN];

export function lateIncoming(plan: SetupPlan) {
  if (!plan.late?.enabled) return null;
  const count = plan.late.waves.reduce((s, w) => s + w.count, 0);
  const mafia = plan.late.waves.reduce((s, w) => s + w.mafia, 0);
  return count > 0 ? { count, mafia } : null;
}

export default function GameCards({ plan, setPlan, n, meta, onBack, onNext, busy, nextLabel = 'التالي: التوزيع' }: {
  plan: SetupPlan;
  setPlan: (p: SetupPlan) => void;
  /** الذين سيلعبون الآن */
  n: number;
  meta: string;
  onBack: () => void;
  onNext: (plan: SetupPlan, roles: Role[]) => void | Promise<void>;
  busy: boolean;
  nextLabel?: string;
}) {
  const { emit, toast, gameState } = useCockpit();
  const faces = useRoleFaces();
  const tpl = useTemplates(emit);
  const [sheet, setSheet] = useState<null | { kind: 'card'; r: Role } | { kind: 'add' } | { kind: 'save' } | { kind: 'tpls' }>(null);
  const [tplOn, setTplOn] = useState<number | null>(null);
  const isRemote = gameState?.config?.isRemote === true;

  const deck = useMemo(() => composeDeck(plan, n, (r) => roleAr(r)), [plan, n]);
  const roles = deck.roles;
  const dup = useMemo(() => analyzeDuplicates(roles), [roles]);
  const remoteDup = isRemote && dup.allowed.length > 0;
  const set = <K extends keyof SetupPlan>(k: K, v: SetupPlan[K]) => setPlan({ ...plan, [k]: v });
  const setCard = (r: Role, v: number | undefined) => {
    const cards = { ...plan.cards };
    if (v === undefined) delete cards[r]; else cards[r] = Math.max(0, Math.min(MAX_COPIES, v));
    setPlan({ ...plan, cards });
  };
  const cnt = (r: Role) => roles.filter((x) => x === r).length;
  const active = tpl.list.find((t) => t.id === tplOn) || null;
  const modified = active ? !samePlan(active.plan, plan) : true;

  const applyTpl = (t: Template) => {
    const prev = plan, prevOn = tplOn;
    setPlan(normalizePlan(t.plan)); setTplOn(t.id);
    toast(`طُبّق «${t.name}»`, { undo: () => { setPlan(prev); setTplOn(prevOn); } });
  };

  const mAuto = autoMafia(n);
  const mafiaMax = Math.max(1, n - 3);
  const mafiaV = Math.min(plan.mafia ?? mAuto, mafiaMax);
  const ex = extrasAllowed(n);
  const inc = lateIncoming(plan);

  // البطاقات الفريدة بترتيب التركيبة، والحشوُ بطاقةٌ واحدة بعدد
  const unique = useMemo(() => {
    const seen = new Set<string>(); const out: Role[] = [];
    roles.forEach((r) => { if (!seen.has(r)) { seen.add(r); out.push(r); } });
    return out;
  }, [roles]);

  const blocked = dup.blocked.length > 0;
  const tooFew = n < 6;

  return (
    <>
      <Status meta={meta} />
      <StepRail step={2} onStep={onBack} />
      <ActionBar
        primary={{
          label: busy ? '…' : nextLabel,
          onPress: () => onNext(plan, roles),
          disabled: busy || blocked || tooFew || roles.length !== n || remoteDup,
          sub: tooFew ? 'يلزم 6 لاعبين على الأقلّ' : blocked ? 'بدّل الكرت الممنوع أوّلاً' : remoteDup ? 'الغرف عن بُعد بلا تكرار' : `${roles.length} كرتاً لـ${n} لاعباً`,
        }}
        secondary={{ label: 'رجوع', onPress: onBack, disabled: busy }}
      />

      {/* ── القالب ── */}
      <Section title="القالب" aside={active ? `«${active.name}»${modified ? ' · معدّل' : ''}` : 'بلا قالب'}>
        {tpl.list.length > 0 && (
          <Chips>
            {tpl.list.map((t) => (
              <TapChip key={t.id} on={t.id === tplOn && !modified} onClick={() => applyTpl(t)}>
                {t.isDefault ? '⭐ ' : t.scope === 'club' ? '🏛 ' : ''}{t.name}
              </TapChip>
            ))}
          </Chips>
        )}
        <Chips>
          <TapChip tone="ok" onClick={() => setSheet({ kind: 'save' })}>💾 احفظ كقالب</TapChip>
          {tpl.list.length > 0 && <TapChip onClick={() => setSheet({ kind: 'tpls' })}>⋯ إدارة القوالب</TapChip>}
        </Chips>
      </Section>

      {/* ── الوقت ── */}
      <Section title="⏱️ مدّة اللعبة">
        <Seg value={plan.minutes} onChange={(v) => set('minutes', v)} options={MINUTES.map((m) => ({ v: m, l: `${m} د` }))} />
      </Section>

      {/* ── الفرق ── */}
      <Section title="الفرق" aside={`${n} لاعباً`}>
        <TeamBar roles={roles} incoming={inc} />
        <SetRow title={<b className="text-[14.5px]">{plan.late.enabled ? 'مافيا البداية' : 'المافيا'} {plan.mafia == null && <span className="ms-1 rounded-md border border-[#43b27f]/50 px-1.5 text-[11.5px] text-[#99dcba]">تلقائيّ</span>}</b>}
          sub={plan.mafia == null ? `ربع اللاعبين = ${mAuto}، وأقصى التلقائيّ 7` : <>يدويّ (التلقائيّ {mAuto}) · <button type="button" className="font-bold text-[#C5A059] underline" onClick={() => set('mafia', null)}>عُد للتلقائيّ</button></>}>
          <Stepper value={mafiaV} min={1} max={mafiaMax} onChange={(v) => set('mafia', v)} />
        </SetRow>
        <div className="grid grid-cols-3 gap-[7px]">
          {([[Role.JESTER, 'المهرّج', 'مستقلّ'], [Role.ASSASSIN, 'السفّاح', 'من 10 لاعبين'], ['twins', 'الأخوان', 'أكبر مافيا · أصغر مدينة']] as const).map(([k, t, sub]) => {
            const isTw = k === 'twins';
            const c = isTw ? 0 : (plan.cards[k as Role] || 0);
            const on = isTw ? plan.twins : c > 0;
            const dis = (k === Role.ASSASSIN || isTw) && !ex;
            return (
              <button key={k} type="button" aria-pressed={on} disabled={dis}
                onClick={() => { if (isTw) set('twins', !plan.twins); else if (c > 1) setSheet({ kind: 'card', r: k as Role }); else setCard(k as Role, on ? 0 : 1); }}
                className={`flex min-h-[86px] flex-col items-center justify-center gap-1 rounded-[13px] border px-1 py-2 disabled:opacity-35 ${on && !dis ? 'border-[#d9a23a] bg-[#d9a23a]/10' : 'border-[#2a241c] bg-[#16130f]'}`}>
                {faces[isTw ? 'OLDER_BROTHER' : k] ? <img src={faces[isTw ? 'OLDER_BROTHER' : k]} alt="" className={`h-[44px] w-[32px] rounded-[5px] object-cover ${on && !dis ? '' : 'opacity-40 grayscale'}`} /> : <span className="text-[24px]">{isTw ? '👥' : iconOf(k)}</span>}
                <b className="text-[13.5px]">{t}</b>
                <small className="text-[12px] leading-tight text-[#9a8f7e]">{dis ? 'من 10 لاعبين' : on ? (c > 1 ? `×${c} · المس للشروط` : 'مفعّل') : sub}</small>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── الكروت ── */}
      <Section title="الكروت" aside={(() => { const m = roles.filter((r) => teamOf(r) === 'M').length, nn = roles.filter((r) => teamOf(r) === 'N').length; return `${m} مافيا · ${roles.length - m - nn} مدينة${nn ? ` · ${nn} مستقلّ` : ''}`; })()}>
        <div className="grid grid-cols-4 gap-[7px]">
          {unique.map((r) => {
            const c = cnt(r);
            const fixed = typeof plan.cards[r] === 'number' && !(r === Role.JESTER && plan.cards[r] === 1);
            const bad = dup.blocked.some((b) => b.role === r);
            const t = teamOf(r);
            return (
              <button key={r} type="button" aria-label={`${roleAr(r)}${c > 1 ? ` ×${c}` : ''}`}
                onClick={() => (FILL.has(r) ? toast(r === Role.CITIZEN ? 'المواطن العاديّ يملأ ما يبقى من المدينة' : 'المافيا العاديّ يملأ ما يبقى من المافيا') : setSheet({ kind: 'card', r }))}
                className={`relative aspect-[5/7] overflow-hidden rounded-[10px] border bg-black ${bad ? 'border-[#d0474c] shadow-[inset_0_0_0_2px_#d0474c]' : fixed && !FILL.has(r) ? 'border-[#C5A059] shadow-[inset_0_0_0_2px_#C5A059]' : t === 'M' ? 'border-[#d0474c]/40' : t === 'N' ? 'border-[#d9a23a]/40' : 'border-[#2a241c]'}`}>
                {faces[r] ? <img src={faces[r]} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center text-[28px]">{iconOf(r)}</span>}
                {c > 1 && <span className="absolute top-1 right-1 rounded-md bg-black/75 px-1.5 text-[11.5px] font-extrabold tabular-nums">×{c}</span>}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-0.5 pb-1 pt-4 text-center text-[11.5px] font-extrabold leading-tight">{roleAr(r)}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setSheet({ kind: 'add' })}
            className="grid aspect-[5/7] place-items-center rounded-[10px] border border-dashed border-[#C5A059]/60 text-[13px] font-bold text-[#C5A059]">＋ أضف كرتاً</button>
        </div>
        <Hint>كلّ كرت مميّز يظهر مرّة مع ×عدد نسخه. المسه لتغيّر العدد أو شروطه. المؤطَّر بالذهبيّ عدده ثابت بيدك، ويبقى إن تغيّر عدد اللاعبين.</Hint>
        {deck.warn.map((w) => <Hint key={w}>⚠️ {w}</Hint>)}
        {blocked && dup.blocked.map((b) => <Hint key={b.role}><b className="text-[#ffc2c4]">⛔ {roleAr(b.role)} ×{b.count}</b> — {b.reason}</Hint>)}
        {remoteDup && <Hint><b className="text-[#ffc2c4]">⛔ الغرف عن بُعد لا تدعم الكروت المكرّرة</b> — أرجع كلّ كرتٍ إلى نسخةٍ واحدة.</Hint>}
        {dup.allowed.length > 0 && !remoteDup && (
          <div className="rounded-xl border border-[#63afd9]/40 bg-[#63afd9]/[.06] px-3 py-2 text-[13px] leading-relaxed">
            {dup.allowed.map((a) => <div key={a.role}>🃏 <b>{roleAr(a.role)} ×{a.count}</b> — {a.role === Role.ASSASSIN ? (plan.assassinMode === 'PARTNERS' ? 'شركاء: عقودٌ مشتركة ويفوزون معاً' : 'متنافسون: لكلٍّ عقوده، وأوّل من يُكمل يفوز وحده') : DUPLICATE_BEHAVIOR[a.role]}</div>)}
          </div>
        )}
      </Section>

      {/* ── 🚪 الدخول المتأخّر ── */}
      {!isRemote && <LateEntryEditor plan={plan} setPlan={setPlan} n={n} />}

      {/* ── إعدادات أخرى ── */}
      <details className="group rounded-2xl border border-[#2a241c] bg-[#0e0c0a]">
        <summary className="flex min-h-[50px] cursor-pointer list-none items-center gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
          إعدادات أخرى
          <span className="ms-auto text-[12.5px] font-medium text-[#9a8f7e]">{plan.nightKind === 'one' ? '🌙 آليّ' : '🧭 يدويّ'} · ⚖️ {plan.penalties} ▾</span>
        </summary>
        <div className="border-t border-[#2a241c] px-3 pb-2">
          <SetRow title={<b className="text-[14px]">⚖️ العقوبات المسموحة</b>} sub="عند بلوغها يخرج اللاعب">
            <Stepper value={plan.penalties} min={1} max={10} onChange={(v) => set('penalties', v)} />
          </SetRow>
          <Hint><b className="text-[#efe8da]">🌙 نظام الليل</b> — يُحسم مرّةً للّعبة كلّها</Hint>
          <Seg value={plan.nightKind} onChange={(v) => set('nightKind', v)} options={[
            { v: 'one', l: 'آليّ — الليلة الواحدة', sub: 'من الهواتف' },
            { v: 'queue', l: 'يدويّ — الطابور', sub: 'تمرّ بنفسك' },
          ]} />
          {plan.nightKind === 'one' && (
            <SetRow title={<b className="text-[14px]">مهلة الليلة</b>} sub="بعدها تُفتح المراجعة">
              <Stepper value={plan.nightSecs} min={30} max={180} step={15} unit="ث" onChange={(v) => set('nightSecs', v)} />
            </SetRow>
          )}
          <SetRow title="💣 قنبلة شيخ المافيا"><Switch label="قنبلة شيخ المافيا" checked={plan.bomb} onChange={(v) => set('bomb', v)} /></SetRow>
          <SetRow title="💬 غرفة تشاور المافيا" sub="داخل مفكّرة التحرّي"><Switch label="غرفة تشاور المافيا" checked={plan.chat} onChange={(v) => set('chat', v)} /></SetRow>
          <SetRow title="⚔️ مواجهة النهار"><Switch label="مواجهة النهار" checked={plan.conf} onChange={(v) => set('conf', v)} /></SetRow>
          <SetRow title="👁️ تعارف المافيا" sub="يرى المافيا بعضهم عند كشف الكروت"><Switch label="تعارف المافيا" checked={plan.reveal} onChange={(v) => set('reveal', v)} /></SetRow>
          <SetRow title="♟️ أقصى مافيا متتالية للّاعب" sub="0 = بلا حدّ"><Stepper value={plan.consec} min={0} max={5} onChange={(v) => set('consec', v)} /></SetRow>
          <SetRow title="عدد التبريرات"><Stepper value={plan.just} min={1} max={5} onChange={(v) => set('just', v)} /></SetRow>
        </div>
      </details>

      {sheet?.kind === 'card' && <CardSheet r={sheet.r} plan={plan} setPlan={setPlan} count={cnt(sheet.r)} warn={deck.warn} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'add' && (
        <BottomSheet open title="أضف كرتاً" onClose={() => setSheet(null)}>
          {ADDABLE.filter((r) => !(roles.includes(r) && !DUPLICABLE_ROLES.has(r))).map((r) => {
            const has = roles.includes(r);
            return (
              <ListRow key={r} n={iconOf(r)} title={roleAr(r)} sub={has ? `نسخة إضافيّة (${cnt(r) + 1})` : SINGLE_ROLE_REASON[r] ? 'نسخة واحدة' : 'جديد'}
                onClick={() => { setCard(r, Math.min(MAX_COPIES, cnt(r) + 1)); setSheet({ kind: 'card', r }); }} />
            );
          })}
          <Hint>كلّ كرتٍ مضاف يأخذ مكان مواطنٍ عاديّ (أو مافيا عاديّ إن كان من المافيا). المستقلّ يُنقص المدينة.</Hint>
        </BottomSheet>
      )}
      {sheet?.kind === 'save' && <SaveTplSheet tpl={tpl} plan={plan} active={active} onClose={() => setSheet(null)} onSaved={(id) => setTplOn(id)} />}
      {sheet?.kind === 'tpls' && <ManageTplSheet tpl={tpl} onClose={() => setSheet(null)} onErr={(e) => toast(errMsg(e, 'تعذّر'), { tone: 'red' })} />}
    </>
  );
}

// ══════════ لوح الكرت: عدد النسخ وشروطه ══════════
function CardSheet({ r, plan, setPlan, count, warn, onClose }: { r: Role; plan: SetupPlan; setPlan: (p: SetupPlan) => void; count: number; warn: string[]; onClose: () => void }) {
  const c = plan.cards;
  const isAuto = c[r] === undefined;
  const ordered = M_ORDER.includes(r) || C_ORDER.includes(r);
  const setV = (v: number | undefined) => { const cards = { ...c }; if (v === undefined) delete cards[r]; else cards[r] = v; setPlan({ ...plan, cards }); };
  const single = !!SINGLE_ROLE_REASON[r];
  const nn = isAuto ? count : (c[r] as number);
  const P = plan.assassinMode === 'PARTNERS';
  return (
    <BottomSheet open title={`${iconOf(r)} ${roleAr(r)}`} onClose={onClose}>
      {single ? (
        <>
          <Hint>نسخة واحدة فقط: {SINGLE_ROLE_REASON[r]}.</Hint>
          <Seg value={isAuto ? 'auto' : (c[r] as number) > 0 ? 'on' : 'off'} onChange={(v) => setV(v === 'auto' ? undefined : v === 'on' ? 1 : 0)}
            options={[{ v: 'auto', l: 'تلقائيّ' }, { v: 'on', l: 'دائماً' }, { v: 'off', l: 'مطفأ' }]} />
        </>
      ) : (
        <>
          <SetRow title={<b className="text-[14px]">عدد النسخ</b>} sub={isAuto ? `تلقائيّ الآن: ${count} (يدخل إن كان له مكان)` : 'ثابت بيدك'}>
            <Stepper value={nn} min={0} max={MAX_COPIES} onChange={(v) => setV(v)} />
          </SetRow>
          {!isAuto && ordered && <Btn className="w-full" onClick={() => setV(undefined)}>↺ أعده تلقائيّاً</Btn>}
          {nn >= 2 && r !== Role.ASSASSIN && <Hint>🃏 {nn} نسخ: {DUPLICATE_BEHAVIOR[r]}</Hint>}
        </>
      )}
      {r === Role.ASSASSIN && nn >= 1 && (
        <>
          <SetRow title={<b className="text-[14px]">🔪 العقود</b>} sub={nn >= 2 && P ? 'قائمةٌ مشتركة للشركاء' : nn >= 2 ? 'لكلّ سفّاح عقوده' : 'يقتل كلّ ليلة عدا الأولى'}>
            <Stepper value={plan.contracts} min={2} max={6} onChange={(v) => setPlan({ ...plan, contracts: v })} />
          </SetRow>
          {nn >= 2 && (
            <>
              <Seg value={plan.assassinMode} onChange={(v) => setPlan({ ...plan, assassinMode: v })} options={[
                { v: 'RIVALS', l: '⚔️ متنافسون' }, { v: 'PARTNERS', l: '🤝 شركاء' },
              ]} />
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-[#2a241c] bg-[#0e0c0a] px-3 py-2 text-[13px]">
                {[['العقود', P ? 'قائمة واحدة مشتركة' : 'لكلّ واحد قائمته'], ['يعرف بعضهم', P ? 'نعم، كلٌّ يرى شريكه' : 'لا'], ['قتل أحدهم', P ? 'يُحسب للجميع' : 'لعقوده هو'], ['الفوز', P ? 'يفوزون معاً' : 'أوّل من يُكمل يفوز وحده'], ['إن مات أحدهم', P ? 'الباقي يكمل العقود' : 'الآخر يكمل عقوده']].map(([k, v]) => (
                  <Fragment key={k}><span className="text-[#9a8f7e]">{k}</span><b>{v}</b></Fragment>
                ))}
              </div>
            </>
          )}
          <Hint>أهداف العقود من الأدوار المميّزة الحيّة، ولا يكون سفّاحٌ هدفاً لسفّاح.</Hint>
        </>
      )}
      {r === Role.JESTER && nn >= 1 && (
        <SetRow title={<b className="text-[14px]">🤡 يفوز إن أُقصي ابتداءً من الجولة</b>}>
          <Stepper value={plan.jesterRound} min={1} max={5} onChange={(v) => setPlan({ ...plan, jesterRound: v })} />
        </SetRow>
      )}
      {r === Role.MAYOR && (
        <SetRow title={<b className="text-[14px]">🎩 أصوات العمدة</b>} sub="بعد أن يكشف نفسه"><Stepper value={plan.mayor} min={2} max={4} onChange={(v) => setPlan({ ...plan, mayor: v })} /></SetRow>
      )}
      {r === Role.PHOENIX && (
        <SetRow title={<b className="text-[14px]">🔥 مرّات بعث العنقاء</b>}><Stepper value={plan.phoenix} min={1} max={3} onChange={(v) => setPlan({ ...plan, phoenix: v })} /></SetRow>
      )}
      {r === Role.NURSE && (
        <Seg value={plan.nurseAuto ? 'auto' : 'off'} onChange={(v) => setPlan({ ...plan, nurseAuto: v === 'auto' })} options={[
          { v: 'auto', l: 'تحمي بدل الطبيب' }, { v: 'off', l: 'بلا حماية' },
        ]} />
      )}
      {warn.map((w) => <Hint key={w}>⚠️ {w}</Hint>)}
      <Btn tone="line" className="w-full" onClick={onClose}>تمّ</Btn>
    </BottomSheet>
  );
}

// ══════════ 🚪 خطّة الدخول المتأخّر ══════════
function LateEntryEditor({ plan, setPlan, n }: { plan: SetupPlan; setPlan: (p: SetupPlan) => void; n: number }) {
  const L = plan.late;
  const setL = (l: Partial<typeof L>) => setPlan({ ...plan, late: { ...L, ...l } });
  const wave = (at: 1 | 2): LateWave => L.waves.find((w) => w.at === at) || { at, count: 0, mafia: 0 };
  const setWave = (at: 1 | 2, w: Partial<LateWave>) => {
    const cur = { ...wave(at), ...w };
    // القرار 17: الدفعةُ بالفرق، وواحدٌ على الأقلّ ما دام فيها أحد
    if (w.count !== undefined && w.mafia === undefined) cur.mafia = cur.count > 0 ? Math.max(1, Math.round(cur.count / 4)) : 0;
    cur.mafia = Math.min(cur.mafia, cur.count);
    const others = L.waves.filter((x) => x.at !== at);
    setL({ waves: [...others, cur].filter((x) => x.count > 0).sort((a, b) => a.at - b.at) });
  };
  const total = L.waves.reduce((s, w) => s + w.count, 0);
  return (
    <details className="group rounded-2xl border border-[#2a241c] bg-[#0e0c0a]" open={L.enabled}>
      <summary className="flex min-h-[50px] cursor-pointer list-none items-center gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
        🚪 الدخول المتأخّر
        <span className="ms-auto text-[12.5px] font-medium text-[#9a8f7e]">{L.enabled && total ? `${total} قادم` : 'مطفأ'} ▾</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-[#2a241c] px-3 pb-3 pt-1">
        <SetRow title={<b className="text-[14px]">ابدأ الآن، ومن يصل يدخل مع بداية الليل</b>} sub="الليل الأوّل والليل الثاني">
          <Switch label="الدخول المتأخّر" checked={L.enabled} onChange={(v) => setL({ enabled: v, waves: v && !L.waves.length ? [{ at: 1, count: 2, mafia: 1 }] : L.waves })} />
        </SetRow>
        {L.enabled && ([1, 2] as const).map((at) => {
          const w = wave(at);
          return (
            <div key={at} className="rounded-xl border border-[#2a241c] bg-[#16130f] px-3 py-1">
              <b className="block pt-1 text-[13.5px] text-[#C5A059]">مع بداية الليل {at === 1 ? 'الأوّل' : 'الثاني'}</b>
              <SetRow title="كم لاعباً يدخل"><Stepper value={w.count} min={0} max={12} onChange={(v) => setWave(at, { count: v })} /></SetRow>
              {w.count > 0 && <SetRow title="منهم مافيا" sub={w.mafia === 0 ? '⚠️ دفعةٌ بلا مافيا تكشف الداخلين' : undefined}><Stepper value={w.mafia} min={0} max={w.count} onChange={(v) => setWave(at, { mafia: v })} /></SetRow>}
            </div>
          );
        })}
        {L.enabled && (
          <>
            <SetRow title={<b className="text-[14px]">أعد الحساب عند البوّابة</b>} sub="إن لم يصل العدد المخطّط يُعاد توزيع نصيب المافيا على من وصل (مستحسن)">
              <Switch label="إعادة الحساب" checked={L.recompute} onChange={(v) => setL({ recompute: v })} />
            </SetRow>
            {n < 12 && <Hint>⚠️ الحاضرون {n} — أقلّ من 12 عند البداية تجعل اللعبة قصيرة قبل وصول الدفعة.</Hint>}
            <Hint>الداخلُ يرى كرته عند البوّابة، والمافيا القادم يرى فريقه ودردشته من لحظة دخوله فقط. صلاحيّاتك كاملة أثناء اللعب من «الأدوات ← الدخول».</Hint>
          </>
        )}
      </div>
    </details>
  );
}

// ══════════ 🗂️ القوالب ══════════
function SaveTplSheet({ tpl, plan, active, onClose, onSaved }: { tpl: ReturnType<typeof useTemplates>; plan: SetupPlan; active: Template | null; onClose: () => void; onSaved: (id: number) => void }) {
  const { toast } = useCockpit();
  const [name, setName] = useState('');
  const [club, setClub] = useState(false);
  const [def, setDef] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (id?: number) => {
    setBusy(true);
    try {
      const nid = await tpl.save({ id, name: id ? undefined : name.trim(), plan, scope: club ? 'club' : 'mine', isDefault: def });
      if (nid) onSaved(nid);
      toast(id ? 'حُدّث القالب' : `حُفظ «${name.trim()}»`);
      onClose();
    } catch (e: any) { toast(errMsg(e, 'تعذّر الحفظ'), { tone: 'red' }); }
    finally { setBusy(false); }
  };
  return (
    <BottomSheet open title="💾 احفظ كقالب" onClose={onClose}>
      {active && (active.mine || tpl.canClub) && <Btn tone="line" className="w-full" disabled={busy} onClick={() => save(active.id)}>حدّث «{active.name}» بهذه القيم</Btn>}
      <label htmlFor="tpl-name" className="text-[13px] text-[#9a8f7e]">اسمٌ لقالبٍ جديد</label>
      <input id="tpl-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: سفّاحان شركاء" className={inputCls} />
      <SetRow title="⭐ قالبي الافتراضيّ" sub="يُحمَّل في كلّ غرفة جديدة"><Switch label="افتراضيّ" checked={def && !club} disabled={club} onChange={setDef} /></SetRow>
      {tpl.canClub && <SetRow title="🏛 قالب النادي" sub="يراه كلّ الموجّهين للقراءة"><Switch label="قالب النادي" checked={club} onChange={setClub} /></SetRow>}
      <Btn tone="gold" className="w-full" disabled={busy || !name.trim()} onClick={() => save()}>احفظ</Btn>
      <Hint>يُحفظ: الوقت، والمافيا (تلقائيّ أو العدد)، وكلّ الكروت وأعداد نسخها، وشروط السفّاحين والعقود، والليل، والعقوبات، والدخول المتأخّر، و«إعدادات أخرى». لا تُحفظ المقاعد ولا اللاعبون.</Hint>
    </BottomSheet>
  );
}

function ManageTplSheet({ tpl, onClose, onErr }: { tpl: ReturnType<typeof useTemplates>; onClose: () => void; onErr: (e: any) => void }) {
  return (
    <BottomSheet open title="⋯ إدارة القوالب" onClose={onClose}>
      {tpl.list.map((t) => (
        <ListRow key={t.id} n={t.isDefault ? '⭐' : t.scope === 'club' ? '🏛' : '🗂️'} title={t.name} sub={t.scope === 'club' ? 'قالب النادي' : t.isDefault ? 'يُحمَّل في كلّ غرفة' : undefined}
          right={<span className="flex gap-1.5">
            {t.mine && !t.isDefault && <button type="button" className="min-h-[44px] rounded-[12px] border border-[#C5A059]/50 px-2.5 text-[13px] font-bold text-[#C5A059]" onClick={() => tpl.setDefault(t.id).catch(onErr)}>⭐</button>}
            {(t.mine || (t.scope === 'club' && tpl.canClub)) && <button type="button" aria-label={`احذف ${t.name}`} className="min-h-[44px] rounded-[12px] border border-[#d0474c]/50 px-2.5 text-[13px] font-bold text-[#f2a6a9]" onClick={() => tpl.remove(t.id).catch(onErr)}>حذف</button>}
          </span>} />
      ))}
      <Chips><Chip>⭐ = يُحمَّل في كلّ غرفة جديدة</Chip></Chips>
    </BottomSheet>
  );
}
