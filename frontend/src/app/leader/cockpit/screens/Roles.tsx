'use client';
// ══════════════════════════════════════════════════════
// 🎭 تركيبة الأدوار — منقولةٌ من LeaderRoleConfigurator
//
// • التركيبة الآليّة من عدد الحاضرين (العددُ وحده يُطلق إعادة البناء — لا مرجعُ المصفوفة).
// • الحبّة = كرت؛ لمسها يفتح منتقي أدوار فريقها مع وسمَي «تكرار» / «نسخة واحدة».
// • setup:roles-confirmed بالحمولة نفسها حرفيّاً (supportsDuplicatePrompt + confirmDuplicates + assassinMode).
// • العمدة/الساحرة/المهرّج من الإعدادات (مصدرٌ واحد)؛ عقود السفّاح ونهوض العنقاء هنا
//   لأنّ لوح الإعدادات لا يضبطهما («تُضبط في صفحة اختيار الأدوار قبل الربط»).
// • دردشة المافيا والمواجهة صارتا في الإعدادات — لا تكرار هنا.
// ══════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { Role, ROLE_NAMES, ROLE_ICONS, MAFIA_ROLES, NEUTRAL_ROLES } from '@/lib/constants';
import { analyzeDuplicates, DUPLICABLE_ROLES, FILLER_ROLES, SINGLE_ROLE_REASON, DUPLICATE_BEHAVIOR, type AssassinMode } from '@/lib/role-duplicates';
import {
  ActionBar, Status, Section, Chips, Chip, Hint, Btn, BottomSheet, ListRow, Seg, SetRow, Stepper,
  useCockpit, teamOf, TEAM_AR, type Team,
} from '../kit';
import { useHost } from '../host';
import { TapChip, errMsg } from './setup/ui';

const nameOf = (r: string) => ROLE_NAMES[r as Role] || r;
const iconOf = (r: string) => ROLE_ICONS[r as Role] || '🎭';

/** نفسُ خوارزميّة LeaderRoleConfigurator حرفيّاً */
function autoComposition(playerCount: number): Role[] {
  const totalMafia = Math.ceil(playerCount / 4);
  // المهرّج يُضاف تلقائيّاً عند 8+ لاعبين (يأخذ مقعد مواطن)
  const hasJester = playerCount >= 8;
  const totalNeutral = hasJester ? 1 : 0;
  const totalCitizens = playerCount - totalMafia - totalNeutral;
  const mafiaOrder = [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.WITCH, Role.MAFIA_REGULAR];
  // 🎩 العمدة سادساً · 🔥 العنقاء سابعاً — كالمحرّك الديناميكيّ
  const citizenOrder = [Role.SHERIFF, Role.DOCTOR, Role.SNIPER, Role.POLICEWOMAN, Role.NURSE, Role.MAYOR, Role.PHOENIX, Role.CITIZEN];
  const out: Role[] = [];
  for (let i = 0; i < totalMafia; i++) out.push(i < mafiaOrder.length - 1 ? mafiaOrder[i] : Role.MAFIA_REGULAR);
  for (let i = 0; i < totalCitizens; i++) out.push(i < citizenOrder.length - 1 ? citizenOrder[i] : Role.CITIZEN);
  if (hasJester) out.push(Role.JESTER);
  return out;
}

const TEAM_TONE: Record<Team, 'm' | 'c' | 'n'> = { M: 'm', C: 'c', N: 'n' };

export default function RolesScreen() {
  const { gameState, emit, run, toast } = useCockpit();
  const host = useHost();
  const cfg = gameState?.config || {};
  const players: any[] = Array.isArray(gameState?.players) ? gameState.players : [];
  const spectators: any[] = Array.isArray(gameState?.spectators) ? gameState.spectators : [];

  // 🔒 العددُ وحده يُطلق إعادة التوليد — تعديلُ اسمٍ أو انضمامُ مظهرٍ لا يمحو تعديلات الليدر
  const presentCount = players.filter((p) => p.isAlive !== false && !p.seatHeld && !p.frozen).length;
  // بوّابة السفّاح والتوأمين — كما في القديم (الأحياء)
  const playerCount = players.filter((p) => p.isAlive !== false).length;

  const [roles, setRoles] = useState<Role[]>(() => autoComposition(presentCount));
  useEffect(() => { setRoles(autoComposition(presentCount)); }, [presentCount]);

  const [pick, setPick] = useState<number | null>(null);
  const [allTeams, setAllTeams] = useState(false);
  const [dupAsk, setDupAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assassinMode, setAssassinMode] = useState<AssassinMode>(cfg.assassinMode === 'PARTNERS' ? 'PARTNERS' : 'RIVALS');
  const [assassinContractCount, setAssassinContractCount] = useState<number>(cfg.assassinContractCount ?? 4);
  const [phoenixRebirths, setPhoenixRebirths] = useState<number>(cfg.phoenixRebirths ?? 1);
  // من الإعدادات — تُقرأ عند الاعتماد لا تُنسخ
  const mayorVoteWeight: number = cfg.mayorVoteWeight ?? 2;
  const witchDisableRounds: number = cfg.witchDisableRounds ?? 3;
  const jesterSurviveRounds: number = cfg.jesterSurviveRounds ?? 2;

  const dup = useMemo(() => analyzeDuplicates(roles), [roles]);
  const assassinCount = roles.filter((r) => r === Role.ASSASSIN).length;
  const has = (r: Role) => roles.includes(r);
  const mafiaN = roles.filter((r) => MAFIA_ROLES.includes(r)).length;

  // ── التعديل ──
  const setRoleAt = (i: number, r: Role) => {
    const old = roles[i];
    if (old === r) { setPick(null); return; }
    setRoles((prev) => { const n = [...prev]; n[i] = r; return n; });
    setPick(null);
    toast(`«${nameOf(old)}» ⟵ «${nameOf(r)}»`, { undo: () => setRoles((prev) => { const n = [...prev]; if (n[i] === r) n[i] = old; return n; }) });
  };

  /** تبديل دورٍ ↔ مواطن (المهرّج / السفّاح) — يأخذ آخر مواطن */
  const toggleSingle = (r: Role) => {
    const idx = roles.indexOf(r);
    if (idx >= 0) {
      setRoles((prev) => { const n = [...prev]; n[idx] = Role.CITIZEN; return n; });
      return;
    }
    const k = roles.lastIndexOf(Role.CITIZEN);
    if (k < 0) { toast('لا مواطن عاديّ ليُستبدل', { tone: 'red' }); return; }
    setRoles((prev) => { const n = [...prev]; n[k] = r; return n; });
  };

  /** 👥 التوأمان يأتيان معاً ويذهبان معاً */
  const toggleTwins = () => {
    const n = [...roles];
    const hasOlder = n.includes(Role.OLDER_BROTHER), hasYounger = n.includes(Role.YOUNGER_BROTHER);
    if (hasOlder || hasYounger) {
      const o = n.indexOf(Role.OLDER_BROTHER); if (o >= 0) n[o] = Role.MAFIA_REGULAR;
      const y = n.indexOf(Role.YOUNGER_BROTHER); if (y >= 0) n[y] = Role.CITIZEN;
    } else {
      const m = n.lastIndexOf(Role.MAFIA_REGULAR), c = n.lastIndexOf(Role.CITIZEN);
      if (m < 0 || c < 0) { toast(m < 0 ? 'لا مافيا عاديّ ليصير الأخ الأكبر' : 'لا مواطن عاديّ ليصير الأخ الأصغر', { tone: 'red' }); return; }
      n[m] = Role.OLDER_BROTHER; n[c] = Role.YOUNGER_BROTHER;
    }
    setRoles(n);
  };

  const resetAuto = () => {
    const prev = roles;
    setRoles(autoComposition(presentCount));
    toast('عادت التركيبة الآليّة', { undo: () => setRoles(prev) });
  };

  // ── الاعتماد ──
  const confirm = async (duplicatesConfirmed = false) => {
    if (busy) return;
    // 🃏 الممنوعُ يُوقف هنا، والمسموحُ يُسأل عنه أوّلاً — والخادمُ يحكم بالقاعدة نفسها
    const d = analyzeDuplicates(roles);
    if (d.blocked.length) { toast(`كرتٌ لا يتكرّر: ${d.blocked.map((b) => nameOf(b.role)).join('، ')}`, { tone: 'red' }); return; }
    if (d.allowed.length && !duplicatesConfirmed) { setDupAsk(true); return; }
    setDupAsk(false);
    setBusy(true);
    try {
      await emit('setup:roles-confirmed', {
        roomId: gameState.roomId,
        roles,
        assassinContractCount: roles.includes(Role.ASSASSIN) ? assassinContractCount : undefined,
        mayorVoteWeight: roles.includes(Role.MAYOR) ? mayorVoteWeight : undefined,
        jesterSurviveRounds: roles.includes(Role.JESTER) ? jesterSurviveRounds : undefined,
        witchDisableRounds: roles.includes(Role.WITCH) ? witchDisableRounds : undefined,
        phoenixRebirths: roles.includes(Role.PHOENIX) ? phoenixRebirths : undefined,
        supportsDuplicatePrompt: true,
        confirmDuplicates: duplicatesConfirmed,
        assassinMode: roles.filter((r) => r === Role.ASSASSIN).length >= 2 ? assassinMode : undefined,
      });
      // المرحلةُ تتحوّل للربط ببثّ الخادم — لا حاجة لرسالة
    } catch (err: any) {
      // الخادمُ رأى تكراراً لم يُؤكَّد (توزيعٌ تغيّر بين الحساب والإرسال) — اسأل بدل الخطأ
      if (err?.response?.code === 'DUPLICATE_ROLES') { setDupAsk(true); return; }
      toast(errMsg(err, 'تعذّر اعتماد التوزيع'), { tone: 'red' });
    } finally { setBusy(false); }
  };

  // ── الأقسام ──
  const section = (t: Team, title: string) => {
    const idx = roles.map((r, i) => [r, i] as const).filter(([r]) => teamOf(r) === t);
    if (t === 'N' && idx.length === 0) {
      return (
        <Section title={title} aside="0">
          <Hint>{playerCount < 8 ? 'يتطلّب 8 لاعبين على الأقلّ لتفعيل المحايدين تلقائيّاً — أضِف المهرّج يدويّاً إن شئت.' : 'لا أدوار محايدة — المس «+ المهرّج» لتفعيله.'}</Hint>
        </Section>
      );
    }
    return (
      <Section title={title} aside={String(idx.length)}>
        <Chips>
          {idx.map(([r, i]) => (
            <TapChip key={i} tone={TEAM_TONE[t]} onClick={() => { setAllTeams(false); setPick(i); }} ariaLabel={`بدّل ${nameOf(r)}`}>
              {iconOf(r)} {nameOf(r)}
            </TapChip>
          ))}
        </Chips>
      </Section>
    );
  };

  const canAdmit = !gameState?.rolesConfirmed;
  const waiting = spectators.filter((s) => s && Number(s.physicalId) > 0);

  return (
    <>
      <Status meta={`${roles.length} كرتاً · ${mafiaN} مافيا · ${presentCount} حاضراً`} />
      <ActionBar
        primary={{
          label: busy ? '…' : 'اعتمد التوزيع',
          onPress: () => confirm(false),
          disabled: busy || dup.blocked.length > 0 || roles.length === 0,
          sub: dup.blocked.length ? 'غيّر الكرت الذي لا يتكرّر أوّلاً' : dup.allowed.length ? 'فيه كروتٌ مكرّرة — سيُطلب تأكيدك' : undefined,
        }}
        secondary={{ label: '↺ آليّ', onPress: resetAuto, disabled: busy }}
      />

      {section('M', 'المافيا')}
      {section('C', 'المدينة')}
      {section('N', 'المحايدون')}

      <Chips>
        <TapChip tone={has(Role.JESTER) ? 'n' : undefined} onClick={() => toggleSingle(Role.JESTER)}>{has(Role.JESTER) ? '− المهرّج' : '+ المهرّج'}</TapChip>
        {playerCount >= 10 && <TapChip tone={has(Role.ASSASSIN) ? 'n' : undefined} onClick={() => toggleSingle(Role.ASSASSIN)}>{has(Role.ASSASSIN) ? '− السفّاح' : '+ السفّاح'}</TapChip>}
        {playerCount >= 10 && (
          <TapChip tone={has(Role.OLDER_BROTHER) && has(Role.YOUNGER_BROTHER) ? 'm' : undefined} onClick={toggleTwins}>
            {has(Role.OLDER_BROTHER) || has(Role.YOUNGER_BROTHER) ? '− التوأمان' : '+ التوأمان'}
          </TapChip>
        )}
      </Chips>
      {playerCount < 10 && <Hint>السفّاح والتوأمان يُتاحان من 10 لاعبين.</Hint>}

      {/* 🃏 الكروت المكرّرة — تنبيهٌ حيّ قبل الاعتماد */}
      {dup.blocked.length > 0 && (
        <Section tone="red" title="⛔ كرتٌ لا يتكرّر — غيّر النسخة الزائدة لتعتمد">
          {dup.blocked.map((b) => <Hint key={b.role}><b className="text-[#efe8da]">{iconOf(b.role)} {nameOf(b.role)} ×{b.count}</b> — {b.reason || SINGLE_ROLE_REASON[b.role] || ''}</Hint>)}
        </Section>
      )}
      {dup.allowed.length > 0 && (
        <Section tone="sky" title="🃏 كروتٌ مكرّرة — سيُطلب تأكيدك">
          {dup.allowed.map((a) => <Hint key={a.role}><b className="text-[#efe8da]">{iconOf(a.role)} {nameOf(a.role)} ×{a.count}</b> — {a.role === 'ASSASSIN' ? 'اختر العلاقة أدناه' : DUPLICATE_BEHAVIOR[a.role]}</Hint>)}
          <Hint>🌙 الليل بـ«الليلة الواحدة» أو الطابور — كلاهما يدعم التكرار.</Hint>
        </Section>
      )}
      {assassinCount >= 2 && (
        <Section title={`🔪🔪 ${assassinCount} سفّاحين — ما العلاقة بينهم؟`}>
          <Seg<AssassinMode> value={assassinMode} onChange={setAssassinMode} options={[
            { v: 'RIVALS', l: '⚔️ متنافسون', sub: 'لكلٍّ عقودُه، وأوّلُ من يُكملها يفوز وحده' },
            { v: 'PARTNERS', l: '🤝 شركاء', sub: 'عقودٌ مشتركة ويفوزون معاً' },
          ]} />
        </Section>
      )}

      {/* ── إعدادات الأدوار ── */}
      <Section title="إعدادات الأدوار" aside="من الإعدادات">
        <Chips>
          {has(Role.MAYOR) && <Chip>🎩 صوت العمدة ×{mayorVoteWeight}</Chip>}
          {has(Role.WITCH) && <Chip>🧙‍♀️ تعطيل الساحرة {witchDisableRounds} جولات</Chip>}
          {has(Role.JESTER) && <Chip>🤡 نجاة المهرّج {jesterSurviveRounds} جولات</Chip>}
          {has(Role.GODFATHER) && <Chip>{cfg.bombEnabled === false ? '💣 القنبلة مطفأة' : '💣 القنبلة مفعّلة'}</Chip>}
          <TapChip tone="g" onClick={host.open.settings}>تعديل</TapChip>
        </Chips>
        {has(Role.ASSASSIN) && (
          <SetRow title="🔪 عقود السفّاح" sub="يقتل كلّ ليلة عدا الأولى، ويظهر مواطناً عند التحقيق">
            <Stepper value={assassinContractCount} min={2} max={6} onChange={setAssassinContractCount} />
          </SetRow>
        )}
        {has(Role.PHOENIX) && (
          <SetRow title="🔥 مرّات نهوض العنقاء" sub="من حاول إخراجه ليلاً احترق معه ونهض هو">
            <Stepper value={phoenixRebirths} min={1} max={3} onChange={setPhoenixRebirths} />
          </SetRow>
        )}
      </Section>

      {/* ── من وصل متأخّراً ولم يُعتمد التوزيع بعد ── */}
      {canAdmit && waiting.length > 0 && (
        <Section title={`🚶 وصلوا الآن (${waiting.length})`}>
          {waiting.map((s) => (
            <ListRow key={`${s.physicalId}-${s.joinedAt || ''}`} n={s.physicalId} title={s.name || 'متفرّج'} sub="إدخاله يعيد بناء التركيبة بالعدد الجديد"
              right={<Btn tone="line" onClick={() => void run(() => emit('setup:admit-spectator', { roomId: gameState.roomId, physicalId: Number(s.physicalId) }), `أُدخل ${s.name || ''} — راجِع التركيبة`)}>أدخِله</Btn>} />
          ))}
        </Section>
      )}

      <RolePickSheet roles={roles} index={pick} allTeams={allTeams} setAllTeams={setAllTeams} onPick={setRoleAt} onClose={() => setPick(null)} />
      <DupConfirmSheet open={dupAsk} dup={dup} assassinMode={assassinMode} busy={busy} onYes={() => confirm(true)} onClose={() => setDupAsk(false)} />
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

// ══════════ تأكيد الكروت المكرّرة ══════════
function DupConfirmSheet({ open, dup, assassinMode, busy, onYes, onClose }: {
  open: boolean; dup: ReturnType<typeof analyzeDuplicates>; assassinMode: AssassinMode; busy: boolean; onYes: () => void; onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title="تأكيد الكروت المكرّرة" onClose={onClose}>
      <Hint>في هذه اللعبة أكثرُ من نسخةٍ من:</Hint>
      {dup.allowed.map((a) => (
        <ListRow key={a.role} n={iconOf(a.role)} title={`${nameOf(a.role)} ×${a.count}`}
          sub={a.role === 'ASSASSIN'
            ? (assassinMode === 'PARTNERS' ? '🤝 شركاء — عقودٌ مشتركة ويفوزون معاً' : '⚔️ متنافسون — لكلٍّ عقودُه وأوّلُ من يُكملها يفوز وحده')
            : DUPLICATE_BEHAVIOR[a.role]} />
      ))}
      <Hint>🌙 الوضع الآليّ لليل يُقفل لهذه اللعبة.</Hint>
      <Btn tone="gold" className="w-full min-h-[50px]" disabled={busy} onClick={onYes}>{busy ? '…' : 'نعم، اعتمد التوزيع'}</Btn>
      <Btn className="w-full" onClick={onClose}>رجوع للتعديل</Btn>
    </BottomSheet>
  );
}
