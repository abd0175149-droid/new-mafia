'use client';
// ══════════════════════════════════════════════════════
// 🃏 «الكروت» — الخطوة ٣ من ٤: التركيبة تُبنى من خطّة صفحة «اللعبة» وتُراجَع بصور الكروت
//
// • التركيبة = composeRoles(الخطّة، عدد الحاضرين)؛ لمسُ كرتٍ يبدّله بدورٍ من فريقه (تعديلٌ يدويّ).
// • «اعتمد الكروت» هو تأكيدُ التكرار أيضاً (confirmDuplicates) — لا نافذةَ تسأل بعده؛ والممنوعُ يوقفه هنا.
// • «رجوع» يفتح صفحة «اللعبة» في مكانها (المؤقّت وحده يُضبط في اللوبي) ثمّ يعيد بناء التركيبة.
// • الحمولة كما كانت حرفيّاً: setup:roles-confirmed {roles, معاملات الأدوار, supportsDuplicatePrompt, assassinMode}.
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { Role, ROLE_NAMES, ROLE_ICONS, NEUTRAL_ROLES } from '@/lib/constants';
import { analyzeDuplicates, DUPLICABLE_ROLES, FILLER_ROLES, SINGLE_ROLE_REASON } from '@/lib/role-duplicates';
import {
  ActionBar, Status, Section, Chips, Chip, Hint, Btn, BottomSheet, ListRow,
  useCockpit, teamOf, TEAM_AR, type Team,
} from '../kit';
import { TapChip, errMsg } from './setup/ui';
import { SetupForm, StepRail, TeamBar, useRoleFaces } from './Setup';
import { applyPlan, composeRoles, normalizePlan, useAccountDefaults, type SetupPlan } from '../setupPlan';

const nameOf = (r: string) => ROLE_NAMES[r as Role] || r;
const iconOf = (r: string) => ROLE_ICONS[r as Role] || '🎭';
const TEAM_DOT: Record<Team, string> = { M: '#d0474c', C: '#63afd9', N: '#d9a23a' };

export default function RolesScreen() {
  const { gameState, emit, run, toast } = useCockpit();
  const cfg = gameState?.config || {};
  const players: any[] = Array.isArray(gameState?.players) ? gameState.players : [];
  const spectators: any[] = Array.isArray(gameState?.spectators) ? gameState.spectators : [];
  const faces = useRoleFaces();
  const account = useAccountDefaults(emit);

  // 🔒 العددُ وحده يُطلق إعادة التوليد — تعديلُ اسمٍ أو انضمامُ مظهرٍ لا يمحو تعديلات الليدر
  const presentCount = players.filter((p) => p.isAlive !== false && !p.seatHeld && !p.frozen).length;

  // الخطّة: ما حُفظ في الغرفة عند «التالي»، وإلّا قيمُ الحساب
  const [plan, setPlan] = useState<SetupPlan | null>(() => (cfg.setupPlan ? normalizePlan(cfg.setupPlan) : null));
  useEffect(() => { if (!plan && account.loaded) setPlan({ ...account.defaults }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [account.loaded]);
  const [editing, setEditing] = useState(false);

  const planKey = plan ? JSON.stringify(plan) : '';
  const base = useMemo(() => (plan ? composeRoles(plan, presentCount) : []), [planKey, presentCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const [roles, setRoles] = useState<Role[]>(base);
  useEffect(() => { setRoles(base); }, [base]);

  const [pick, setPick] = useState<number | null>(null);
  const [allTeams, setAllTeams] = useState(false);
  const [busy, setBusy] = useState(false);

  const dup = useMemo(() => analyzeDuplicates(roles), [roles]);
  const assassinCount = roles.filter((r) => r === Role.ASSASSIN).length;
  const edited = roles.some((r, i) => r !== base[i]);

  const setRoleAt = (i: number, r: Role) => {
    const old = roles[i];
    if (old === r) { setPick(null); return; }
    setRoles((prev) => { const n = [...prev]; n[i] = r; return n; });
    setPick(null);
    toast(`«${nameOf(old)}» ⟵ «${nameOf(r)}»`, { undo: () => setRoles((prev) => { const n = [...prev]; if (n[i] === r) n[i] = old; return n; }) });
  };

  // ── الاعتماد ──
  const confirm = async () => {
    if (busy || !plan) return;
    const d = analyzeDuplicates(roles);
    if (d.blocked.length) { toast(`كرتٌ لا يتكرّر: ${d.blocked.map((b) => nameOf(b.role)).join('، ')}`, { tone: 'red' }); return; }
    setBusy(true);
    try {
      await emit('setup:roles-confirmed', {
        roomId: gameState.roomId,
        roles,
        assassinContractCount: roles.includes(Role.ASSASSIN) ? plan.contracts : undefined,
        mayorVoteWeight: roles.includes(Role.MAYOR) ? plan.mayor : undefined,
        jesterSurviveRounds: roles.includes(Role.JESTER) ? plan.jesterRound : undefined,
        witchDisableRounds: roles.includes(Role.WITCH) ? (cfg.witchDisableRounds ?? 3) : undefined,
        phoenixRebirths: roles.includes(Role.PHOENIX) ? plan.phoenix : undefined,
        supportsDuplicatePrompt: true,
        // اعتمادُ الكروت هنا هو تأكيدُ التكرار — رآها الليدر بصورها قبل أن يضغط
        confirmDuplicates: d.allowed.length > 0,
        assassinMode: assassinCount >= 2 ? plan.assassinMode : undefined,
      });
      // المرحلةُ تتحوّل للتوزيع ببثّ الخادم
    } catch (err: any) {
      toast(errMsg(err, 'تعذّر اعتماد الكروت'), { tone: 'red' });
    } finally { setBusy(false); }
  };

  // ── تعديل الخطّة من هنا (رجوع) ──
  const doneEditing = async () => {
    if (!plan) return;
    setBusy(true);
    try { await applyPlan(emit, gameState.roomId, plan, { withTimer: false }); setEditing(false); }
    catch (e: any) { toast(errMsg(e, 'تعذّر حفظ الإعدادات'), { tone: 'red' }); }
    finally { setBusy(false); }
  };

  const canAdmit = !gameState?.rolesConfirmed;
  const waiting = spectators.filter((s) => s && Number(s.physicalId) > 0);
  const arrivals = canAdmit && waiting.length > 0 && (
    <Section title={`🚶 وصلوا الآن (${waiting.length})`}>
      {waiting.map((s) => (
        <ListRow key={`${s.physicalId}-${s.joinedAt || ''}`} n={s.physicalId} title={s.name || 'متفرّج'} sub="إدخاله يعيد بناء التركيبة بالعدد الجديد"
          right={<Btn tone="line" onClick={() => void run(() => emit('setup:admit-spectator', { roomId: gameState.roomId, physicalId: Number(s.physicalId) }), `أُدخل ${s.name || ''} — راجِع الكروت`)}>أدخِله</Btn>} />
      ))}
    </Section>
  );

  if (!plan) return <><Status meta={`${presentCount} حاضراً`} /><StepRail step={3} /><Hint>تُحمَّل الخطّة…</Hint></>;

  if (editing) {
    return (
      <>
        <Status meta={`${presentCount} حاضراً · تعديل الإعدادات`} />
        <StepRail step={2} />
        <ActionBar primary={{ label: busy ? '…' : 'تمّ: راجع الكروت', onPress: doneEditing, disabled: busy }} />
        <SetupForm plan={plan} onChange={setPlan} n={presentCount} timerLocked saved={account.saved} accountDefaults={account.defaults}
          onSaveDefaults={() => { account.save(plan).then(() => toast('💾 صارت قيمك الافتراضيّة في كلّ الغرف')).catch((e: any) => toast(errMsg(e, 'تعذّر حفظ القيم'), { tone: 'red' })); }} />
      </>
    );
  }

  // ── ملخّص الإعدادات (اللمس يعيد للتعديل) ──
  const summary = [
    `${roles.filter((r) => teamOf(r) === 'M').length} مافيا${plan.mafia == null ? '' : ' (يدويّ)'}`,
    roles.includes(Role.JESTER) ? `🤡 من الجولة ${plan.jesterRound}` : null,
    roles.includes(Role.ASSASSIN) ? `🔪 ${plan.contracts} عقود${assassinCount > 1 ? (plan.assassinMode === 'RIVALS' ? ' · متنافسون' : ' · شركاء') : ''}` : null,
    roles.includes(Role.MAYOR) ? `🎩 ×${plan.mayor}` : null,
    roles.includes(Role.PHOENIX) ? `🔥 ${plan.phoenix}` : null,
    cfg.gameTimerEnabled === false ? '⏱️ بلا وقت' : `⏱️ ${cfg.gameTimerMinutes ?? plan.minutes} د`,
    `⚖️ ${plan.penalties}`,
    plan.nightKind === 'one' ? `🌙 آليّ · ${plan.nightSecs} ث` : '🧭 يدويّ',
  ].filter(Boolean) as string[];

  const blockedSet = new Set(dup.blocked.map((b) => b.role));
  const group = (t: Team, title: string) => {
    const idx = roles.map((r, i) => [r, i] as const).filter(([r]) => teamOf(r) === t);
    if (!idx.length) return null;
    // الكرتُ المتكرّر بطاقةٌ واحدة بعدّاد ×ن؛ لمسُها يبدّل آخرَ نسخةٍ منه
    const byRole = new Map<Role, number[]>();
    idx.forEach(([r, i]) => { const a = byRole.get(r) || []; a.push(i); byRole.set(r, a); });
    return (
      <Section title={<><i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TEAM_DOT[t] }} />{title}</>} aside={String(idx.length)}>
        <div className="grid grid-cols-4 gap-[7px]">
          {Array.from(byRole.entries()).map(([r, is]) => {
            const ed = is.some((i: number) => roles[i] !== base[i]);
            return (
              <button key={r} type="button" aria-label={`بدّل ${nameOf(r)}`} onClick={() => { setAllTeams(false); setPick(is[is.length - 1]); }}
                className={`relative aspect-[5/7] overflow-hidden rounded-[10px] border bg-black ${blockedSet.has(r) ? 'border-[#d0474c] shadow-[inset_0_0_0_2px_#d0474c]' : ed ? 'border-[#C5A059] shadow-[inset_0_0_0_2px_#C5A059]' : 'border-[#2a241c]'}`}>
                {faces[r] ? <img src={faces[r]} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center text-[28px]">{iconOf(r)}</span>}
                {is.length > 1 && <span className="absolute top-1 right-1 rounded-md bg-black/75 px-1.5 text-[11.5px] font-extrabold tabular-nums">×{is.length}</span>}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-0.5 pb-1 pt-4 text-center text-[11.5px] font-extrabold leading-tight">{nameOf(r)}</span>
              </button>
            );
          })}
        </div>
      </Section>
    );
  };

  return (
    <>
      <Status meta={`${roles.length} كرتاً · ${presentCount} حاضراً`} />
      <StepRail step={3} onStep={() => setEditing(true)} />
      <ActionBar
        primary={{
          label: busy ? '…' : 'اعتمد الكروت',
          onPress: () => void confirm(),
          disabled: busy || dup.blocked.length > 0 || roles.length === 0,
          sub: dup.blocked.length ? 'بدّل الكرت الممنوع أوّلاً' : `${roles.length} كرتاً لـ${presentCount} لاعباً`,
        }}
        secondary={{ label: 'رجوع', onPress: () => setEditing(true), disabled: busy }}
      />

      <Chips>{summary.map((x) => <TapChip key={x} onClick={() => setEditing(true)}>{x}</TapChip>)}</Chips>
      <TeamBar roles={roles} />

      {dup.blocked.length > 0 && (
        <Section tone="red" title="⛔ كرتٌ لا يتكرّر — بدّل النسخة الزائدة لتعتمد">
          {dup.blocked.map((b) => <Hint key={b.role}><b className="text-[#efe8da]">{iconOf(b.role)} {nameOf(b.role)} ×{b.count}</b> — {b.reason || SINGLE_ROLE_REASON[b.role] || ''}</Hint>)}
        </Section>
      )}
      {dup.blocked.length === 0 && dup.allowed.length > 0 && (
        <Section tone="sky" title="🃏 كروتٌ مكرّرة">
          <Chips>{dup.allowed.map((a) => <Chip key={a.role}>{iconOf(a.role)} {nameOf(a.role)} ×{a.count}</Chip>)}</Chips>
          <Hint>اعتمادها هنا تأكيد. وكلّ نسخةٍ تُرسل اختيارها من هاتفها كالعادة.</Hint>
        </Section>
      )}

      {group('M', 'المافيا')}
      {group('C', 'المدينة')}
      {group('N', 'المحايدون')}
      <Hint>المس كرتاً لتبدّله بدورٍ من فريقه. المعدَّل يدويّاً بإطارٍ ذهبيّ{edited ? '' : '.'}</Hint>
      {edited && <Btn className="w-full" onClick={() => setRoles(base)}>↺ ألغِ تعديلات الكروت</Btn>}

      {arrivals}

      <RolePickSheet roles={roles} index={pick} allTeams={allTeams} setAllTeams={setAllTeams} onPick={setRoleAt} onClose={() => setPick(null)} />
    </>
  );
}

// ══════════ منتقي الدور ══════════
function RolePickSheet({ roles, index, allTeams, setAllTeams, onPick, onClose }: {
  roles: Role[]; index: number | null; allTeams: boolean; setAllTeams: (v: boolean) => void;
  onPick: (i: number, r: Role) => void; onClose: () => void;
}) {
  if (index == null || roles[index] == null) return null;
  const cur = roles[index];
  const t = teamOf(cur) as Team;
  const all = Object.values(Role) as Role[];
  // أدوارُ الفريق نفسه، والمحايدُ يعود مواطناً
  const opts = allTeams ? all : all.filter((r) => teamOf(r) === t || (t === 'N' && r === Role.CITIZEN));
  return (
    <BottomSheet open title={`بدّل «${nameOf(cur)}»`} onClose={onClose}>
      <Hint>{allTeams ? 'كلّ الأدوار' : `أدوار ${TEAM_AR[t]}`} — «تكرار» يطلب تأكيدك عند الاعتماد، و«نسخة واحدة» لا يُعتمد.</Hint>
      {opts.map((r) => {
        const inUse = roles.some((x, k) => x === r && k !== index);
        const tag = !inUse || FILLER_ROLES.has(r) ? null
          : DUPLICABLE_ROLES.has(r) ? <Chip tone="c">تكرار</Chip>
          : <Chip tone="m">نسخة واحدة</Chip>;
        const team = teamOf(r);
        return (
          <ListRow key={r} n={iconOf(r)} selected={r === cur} onClick={() => onPick(index, r)}
            title={nameOf(r)}
            sub={allTeams && team ? TEAM_AR[team] : NEUTRAL_ROLES.includes(r) ? 'محايد' : inUse && !FILLER_ROLES.has(r) && !DUPLICABLE_ROLES.has(r) ? SINGLE_ROLE_REASON[r] : undefined}
            right={tag} />
        );
      })}
      <Btn className="w-full" onClick={() => setAllTeams(!allTeams)}>{allTeams ? `أدوار ${TEAM_AR[t]} فقط` : 'دورٌ من فريقٍ آخر'}</Btn>
    </BottomSheet>
  );
}

