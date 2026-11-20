// ══════════════════════════════════════════════════════
// 🎛️ خطّةُ تجهيز اللعبة — «الوصفة» (الخطّة الموحّدة 2026-11-20، المرحلة 2)
//
// • الوصفة: المافيا «تلقائيّ» أو عددٌ ثابت، ولكلّ كرتٍ مميّز عددُ نسخٍ ثابت أو «تلقائيّ» (غير مذكور
//   في cards) فيدخل بالترتيب ما دام له مكان. التركيبةُ تُبنى من الوصفة وعدد اللاعبين، فتعديلُ
//   الكروت لا يمحوه تغيّرُ العدد (كان setRoles(base) يمسح كلّ تعديلٍ يدويّ).
// • القوالب (game_templates) بدل «قيمي»: ⭐ يُحمَّل في كلّ غرفةٍ جديدة. «قيمي» القديمة تُنقل آليّاً.
// • خطّةُ هذه الغرفة تُحفظ في config.setupPlan فتنجو من التحديث وتعود في اللعبة التالية.
// ══════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { Role } from '@/lib/constants';
import { MAX_COPIES } from '@/lib/role-duplicates';

export type NightKind = 'one' | 'queue';
export type AssassinMode = 'RIVALS' | 'PARTNERS';

/** دفعةُ دخولٍ متأخّر: مع بداية الليل الأوّل أو الثاني (المرحلة 4) */
export interface LateWave { at: 1 | 2; count: number; mafia: number }
export interface LatePlan { enabled: boolean; waves: LateWave[]; recompute: boolean }

export interface SetupPlan {
  /** null = تلقائيّ (ربع اللاعبين للأعلى، أقصاه 7) — واليدويّ بلا سقف */
  mafia: number | null;
  /** عدد نسخ كلّ كرتٍ مميّز. غير المذكور = تلقائيّ (بالترتيب ما دام له مكان)، 0 = مطفأ */
  cards: Partial<Record<Role, number>>;
  twins: boolean;
  /** يفوز المهرّج إن أُقصي ابتداءً من هذه الجولة */
  jesterRound: number;
  contracts: number;
  assassinMode: AssassinMode;
  mayor: number;
  phoenix: number;
  nurseAuto: boolean;
  /** 45 · 60 · 75 · 90 */
  minutes: number;
  penalties: number;
  nightKind: NightKind;
  nightSecs: number;
  bomb: boolean;
  chat: boolean;
  conf: boolean;
  reveal: boolean;
  consec: number;
  just: number;
  late: LatePlan;
}

export const MINUTES = [45, 60, 75, 90] as const;

export const BUILTIN_PLAN: SetupPlan = {
  mafia: null, cards: { [Role.JESTER]: 1 }, twins: false, jesterRound: 3, contracts: 3, assassinMode: 'RIVALS',
  mayor: 3, phoenix: 3, nurseAuto: true,
  minutes: 60, penalties: 3, nightKind: 'one', nightSecs: 60,
  bomb: true, chat: true, conf: true, reveal: true, consec: 3, just: 2,
  late: { enabled: false, waves: [], recompute: true },
};

/** ترتيبُ الدخول التلقائيّ */
export const M_ORDER: Role[] = [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.WITCH];
export const C_ORDER: Role[] = [Role.SHERIFF, Role.DOCTOR, Role.SNIPER, Role.POLICEWOMAN, Role.NURSE, Role.MAYOR, Role.PHOENIX];
export const N_CARDS: Role[] = [Role.JESTER, Role.ASSASSIN];
const FILL = new Set<Role>([Role.CITIZEN, Role.MAFIA_REGULAR]);

const clampN = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
/** القيم القديمة (30/40/50/بلا) تصير 45، وما عداها أقرب خيار */
export const snapMinutes = (m: unknown): number => {
  const n = Math.floor(Number(m));
  if (!Number.isFinite(n) || n < 45) return 45;
  return MINUTES.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), 60);
};

/** يقبل أيّ شيءٍ مخزَّن (ومنه شكل «قيمي» القديم) ويعيد وصفةً كاملة صالحة. */
export function normalizePlan(raw: any, base: SetupPlan = BUILTIN_PLAN): SetupPlan {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = (k: keyof SetupPlan) => (typeof r[k] === 'boolean' ? r[k] : base[k]) as boolean;
  let cards: Partial<Record<Role, number>>;
  if (r.cards && typeof r.cards === 'object') {
    cards = {};
    for (const [k, v] of Object.entries(r.cards)) {
      if ((Object.values(Role) as string[]).includes(k) && !FILL.has(k as Role)) cards[k as Role] = clampN(v, 0, MAX_COPIES, 1);
    }
  } else if ('jester' in r || 'assassin' in r || 'sniperN' in r) {
    // 🔁 نقلُ الشكل القديم: كلّ قيمةٍ قديمة تصير عدد نسخٍ للكرت نفسه
    cards = { ...base.cards };
    if (typeof r.jester === 'boolean') cards[Role.JESTER] = r.jester ? 1 : 0;
    if (typeof r.assassin === 'boolean') cards[Role.ASSASSIN] = r.assassin ? clampN(r.assassinN ?? 1, 1, MAX_COPIES, 1) : 0;
    if (Number(r.sniperN) > 1) cards[Role.SNIPER] = clampN(r.sniperN, 1, MAX_COPIES, 1);
  } else {
    cards = { ...base.cards };
  }
  const lr = r.late && typeof r.late === 'object' ? r.late : base.late;
  const waves: LateWave[] = (Array.isArray(lr?.waves) ? lr.waves : []).slice(0, 2).map((w: any) => ({
    at: Number(w?.at) === 2 ? 2 : 1, count: clampN(w?.count, 0, 20, 0), mafia: clampN(w?.mafia, 0, 10, 0),
  })).filter((w: LateWave) => w.count > 0);
  return {
    mafia: r.mafia === null ? null : r.mafia == null ? base.mafia : clampN(r.mafia, 1, 40, 1),
    cards,
    twins: b('twins'),
    jesterRound: clampN(r.jesterRound ?? base.jesterRound, 1, 5, 3),
    contracts: clampN(r.contracts ?? base.contracts, 2, 6, 3),
    assassinMode: r.assassinMode === 'PARTNERS' || r.assassinMode === 'RIVALS' ? r.assassinMode : base.assassinMode,
    mayor: clampN(r.mayor ?? base.mayor, 2, 4, 3),
    phoenix: clampN(r.phoenix ?? base.phoenix, 1, 3, 3),
    nurseAuto: b('nurseAuto'),
    minutes: snapMinutes(r.minutes ?? base.minutes),
    penalties: clampN(r.penalties ?? base.penalties, 1, 10, 3),
    nightKind: r.nightKind === 'queue' || r.nightKind === 'one' ? r.nightKind : base.nightKind,
    nightSecs: clampN(r.nightSecs ?? base.nightSecs, 30, 180, 60),
    bomb: b('bomb'), chat: b('chat'), conf: b('conf'), reveal: b('reveal'),
    consec: clampN(r.consec ?? base.consec, 0, 5, 3),
    just: clampN(r.just ?? base.just, 1, 5, 2),
    late: { enabled: lr?.enabled === true && waves.length > 0, waves, recompute: lr?.recompute !== false },
  };
}

export const samePlan = (a: SetupPlan, b: SetupPlan) => JSON.stringify(normalizePlan(a)) === JSON.stringify(normalizePlan(b));

/** المافيا التلقائيّ: ربع اللاعبين مقرّباً للأعلى، وأقصاه 7 */
export const autoMafia = (n: number) => Math.min(7, Math.ceil(n / 4));
/** السفّاح والتوأمان من 10 لاعبين */
export const extrasAllowed = (n: number) => n >= 10;

export interface Deck { roles: Role[]; warn: string[] }

/** التركيبة من الوصفة وعدد اللاعبين (منقولةٌ من النموذج المعتمد composeW) */
export function composeDeck(plan: SetupPlan, n: number, roleName: (r: Role) => string = (r) => r): Deck {
  const warn: string[] = [];
  if (n <= 0) return { roles: [], warn };
  const c = plan.cards || {};
  const ex = extrasAllowed(n);
  const twins = plan.twins && ex;
  const J = c[Role.JESTER] || 0;
  const A = ex ? (c[Role.ASSASSIN] || 0) : 0;
  if (!ex && (c[Role.ASSASSIN] || 0) > 0) warn.push('السفّاح يحتاج 10 لاعبين على الأقلّ، فلم يدخل.');
  if (!ex && plan.twins) warn.push('الأخوان يحتاجان 10 لاعبين على الأقلّ.');
  const neutral = J + A;
  const mt = Math.max(1, Math.min(Math.max(1, n - neutral - 1), plan.mafia ?? autoMafia(n)));
  const fill = (order: Role[], slots: number, filler: Role): Role[] => {
    const fixed: Role[] = [];
    order.forEach((r) => { if (typeof c[r] === 'number') for (let k = 0; k < (c[r] as number); k++) fixed.push(r); });
    if (fixed.length > Math.max(0, slots)) warn.push(`لا مكان لكلّ النسخ الثابتة: ${fixed.slice(Math.max(0, slots)).map(roleName).join('، ')}.`);
    const res = fixed.slice(0, Math.max(0, slots));
    order.forEach((r) => { if (c[r] === undefined && res.length < slots) res.push(r); });
    while (res.length < slots) res.push(filler);
    return res;
  };
  const out: Role[] = [...fill(M_ORDER, mt - (twins ? 1 : 0), Role.MAFIA_REGULAR)];
  if (twins) out.push(Role.OLDER_BROTHER);
  const cit = Math.max(0, n - mt - neutral);
  out.push(...fill(C_ORDER, cit - (twins ? 1 : 0), Role.CITIZEN));
  if (twins && cit > 0) out.push(Role.YOUNGER_BROTHER);
  for (let i = 0; i < J; i++) out.push(Role.JESTER);
  for (let i = 0; i < A; i++) out.push(Role.ASSASSIN);
  if (A > 0) {
    const targets = out.filter((r) => !FILL.has(r) && r !== Role.ASSASSIN).length;
    if (plan.contracts > targets) warn.push(`عقود السفّاح ${plan.contracts} وأهدافها المتاحة ${targets} فقط (الأدوار المميّزة عدا السفّاح).`);
  }
  return { roles: out.slice(0, n), warn };
}

/** للتوافق مع الشاشات القديمة */
export const composeRoles = (plan: SetupPlan, n: number): Role[] => composeDeck(plan, n).roles;

/** إعداداتُ الغرفة من الخطّة — الوقت يُقبل حتّى «ابدأ اللعبة» */
export function roomSettingsFrom(plan: SetupPlan) {
  return {
    gameTimerMinutes: plan.minutes,
    maxPenalties: plan.penalties,
    maxJustifications: plan.just,
    bombEnabled: plan.bomb,
    mafiaChatEnabled: plan.chat,
    confrontationEnabled: plan.conf,
    allowMafiaReveal: plan.reveal,
    mayorVoteWeight: plan.mayor,
    jesterSurviveRounds: plan.jesterRound,
    nightKind: plan.nightKind,
    nightSeconds: plan.nightSecs,
    nurseAuto: plan.nurseAuto,
    nightMode: 'manual' as const,
    setupPlan: { ...plan },
    lateEntry: plan.late,
  };
}

type Emit = (e: string, d: any) => Promise<any>;

/** يطبّق الخطّة على الغرفة (إعدادات + حدّ التكرار المتتالي) */
export async function applyPlan(emit: Emit, roomId: string, plan: SetupPlan, _opts?: { withTimer?: boolean }) {
  await emit('room:update-settings', { roomId, ...roomSettingsFrom(plan) });
  await emit('room:update-max-consecutive-mafia', { roomId, maxConsecutiveMafiaGames: plan.consec });
}

/** حمولةُ setup:prepare-deal من الوصفة والتركيبة */
export function dealPayload(roomId: string, plan: SetupPlan, roles: Role[], cfg: any) {
  const assassins = roles.filter((r) => r === Role.ASSASSIN).length;
  return {
    roomId, roles,
    assassinContractCount: assassins ? plan.contracts : undefined,
    mayorVoteWeight: roles.includes(Role.MAYOR) ? plan.mayor : undefined,
    jesterSurviveRounds: roles.includes(Role.JESTER) ? plan.jesterRound : undefined,
    witchDisableRounds: roles.includes(Role.WITCH) ? (cfg?.witchDisableRounds ?? 3) : undefined,
    phoenixRebirths: roles.includes(Role.PHOENIX) ? plan.phoenix : undefined,
    supportsDuplicatePrompt: true,
    // الكروت المكرّرة تُرى بصورها وعددها في الصفحة نفسها، والاعتماد الختاميّ يعرضها مع شروطها
    confirmDuplicates: true,
    assassinMode: assassins >= 2 ? plan.assassinMode : undefined,
  };
}

// ══════════ 🗂️ القوالب ══════════
export interface Template { id: number; scope: 'mine' | 'club'; name: string; plan: SetupPlan; isDefault: boolean; mine: boolean }

export function useTemplates(emit: Emit) {
  const [list, setList] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canClub, setCanClub] = useState(false);
  const take = (r: any) => {
    if (Array.isArray(r?.templates)) setList(r.templates.map((t: any) => ({ ...t, plan: normalizePlan(t.plan) })));
    if (typeof r?.canClub === 'boolean') setCanClub(r.canClub);
  };
  useEffect(() => {
    let alive = true;
    emit('templates:list', {}).then((r: any) => { if (alive) take(r); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = useCallback(async (t: { id?: number; name?: string; plan: SetupPlan; scope?: 'mine' | 'club'; isDefault?: boolean }) => {
    const r = await emit('templates:save', { ...t, plan: { ...t.plan } });
    take(r);
    return r?.id as number;
  }, [emit]);
  const remove = useCallback(async (id: number) => { take(await emit('templates:delete', { id })); }, [emit]);
  const setDefault = useCallback(async (id: number | null) => { take(await emit('templates:set-default', { id })); }, [emit]);
  const def = list.find((t) => t.mine && t.isDefault) || null;
  return { list, loaded, canClub, def, save, remove, setDefault, defaults: def?.plan ?? BUILTIN_PLAN };
}

/** خطّةُ هذه الغرفة: ما حُفظ فيها، وإلّا القالب ⭐ */
export function initialPlan(cfg: any, account: SetupPlan): SetupPlan {
  return cfg?.setupPlan && typeof cfg.setupPlan === 'object' ? normalizePlan(cfg.setupPlan, account) : normalizePlan(account);
}
