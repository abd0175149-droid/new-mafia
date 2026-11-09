// ══════════════════════════════════════════════════════
// 🎛️ خطّةُ تجهيز اللعبة — صفحةُ «اللعبة» تضبطها، وصفحةُ «الكروت» تبني منها التركيبة
//
// • القيم الافتراضيّة لحساب الليدر (staff.game_defaults) لا للغرفة — قرار المالك 2026-11-09.
// • الخطّة الحاليّة تُحفظ في إعدادات الغرفة (config.setupPlan) فتنجو من التحديث وتعود في اللعبة التالية.
// • إعداداتُ الغرفة (الوقت، العقوبات، الليل، الممرّضة…) تُرسل بـ room:update-settings عند «التالي».
// ══════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Role } from '@/lib/constants';

export type NightKind = 'one' | 'queue';
export type AssassinMode = 'RIVALS' | 'PARTNERS';

export interface SetupPlan {
  /** null = تلقائيّ (ربع اللاعبين للأعلى، أقصاه 7) — واليدويّ بلا سقف */
  mafia: number | null;
  jester: boolean;
  /** يفوز المهرّج إن أُقصي ابتداءً من هذه الجولة (المحرّك: round >= N) */
  jesterRound: number;
  assassin: boolean;
  assassinN: number;
  contracts: number;
  assassinMode: AssassinMode;
  twins: boolean;
  sniperN: number;
  mayor: number;
  phoenix: number;
  nurseAuto: boolean;
  /** 0 = بلا مؤقّت */
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
}

/** قيمُ المالك حين لا يكون للحساب قيمٌ محفوظة */
export const BUILTIN_PLAN: SetupPlan = {
  mafia: null, jester: true, jesterRound: 3, assassin: false, assassinN: 1, contracts: 3, assassinMode: 'RIVALS', twins: false,
  sniperN: 1, mayor: 3, phoenix: 3, nurseAuto: true,
  minutes: 40, penalties: 3, nightKind: 'one', nightSecs: 60,
  bomb: true, chat: true, conf: true, reveal: true, consec: 3, just: 2,
};

const clampN = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** يقبل أيّ شيءٍ مخزَّن ويعيد خطّةً كاملة صالحة (المفقود من الافتراضيّ). */
export function normalizePlan(raw: any, base: SetupPlan = BUILTIN_PLAN): SetupPlan {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = (k: keyof SetupPlan) => (typeof r[k] === 'boolean' ? r[k] : base[k]) as boolean;
  return {
    mafia: r.mafia == null ? (r.mafia === null ? null : base.mafia) : clampN(r.mafia, 1, 40, 1),
    jester: b('jester'),
    jesterRound: clampN(r.jesterRound ?? base.jesterRound, 1, 5, 3),
    assassin: b('assassin'),
    assassinN: clampN(r.assassinN ?? base.assassinN, 1, 2, 1),
    contracts: clampN(r.contracts ?? base.contracts, 2, 6, 3),
    assassinMode: r.assassinMode === 'PARTNERS' || r.assassinMode === 'RIVALS' ? r.assassinMode : base.assassinMode,
    twins: b('twins'),
    sniperN: clampN(r.sniperN ?? base.sniperN, 1, 2, 1),
    mayor: clampN(r.mayor ?? base.mayor, 2, 4, 3),
    phoenix: clampN(r.phoenix ?? base.phoenix, 1, 3, 3),
    nurseAuto: b('nurseAuto'),
    minutes: clampN(r.minutes ?? base.minutes, 0, 180, 40),
    penalties: clampN(r.penalties ?? base.penalties, 1, 10, 3),
    nightKind: r.nightKind === 'queue' || r.nightKind === 'one' ? r.nightKind : base.nightKind,
    nightSecs: clampN(r.nightSecs ?? base.nightSecs, 30, 180, 60),
    bomb: b('bomb'), chat: b('chat'), conf: b('conf'), reveal: b('reveal'),
    consec: clampN(r.consec ?? base.consec, 0, 5, 3),
    just: clampN(r.just ?? base.just, 1, 5, 2),
  };
}

export const samePlan = (a: SetupPlan, b: SetupPlan) => (Object.keys(a) as (keyof SetupPlan)[]).every((k) => a[k] === b[k]);

/** المافيا التلقائيّ: ربع اللاعبين مقرّباً للأعلى، وأقصاه 7 */
export const autoMafia = (n: number) => Math.min(7, Math.ceil(n / 4));
/** السفّاح والتوأمان من 10 لاعبين — كما اليوم */
export const extrasAllowed = (n: number) => n >= 10;

/** التركيبة من الخطّة وعدد الحاضرين */
export function composeRoles(plan: SetupPlan, n: number): Role[] {
  if (n <= 0) return [];
  const twins = plan.twins && extrasAllowed(n);
  const assassins = plan.assassin && extrasAllowed(n) ? plan.assassinN : 0;
  const neutral = (plan.jester ? 1 : 0) + assassins;
  const mafiaTotal = Math.max(1, Math.min(Math.max(1, n - neutral - 1), plan.mafia ?? autoMafia(n)));
  const citizens = Math.max(0, n - mafiaTotal - neutral);
  const out: Role[] = [];
  const mOrder = [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.WITCH];
  const mSlots = mafiaTotal - (twins ? 1 : 0);
  for (let i = 0; i < mSlots; i++) out.push(mOrder[i] ?? Role.MAFIA_REGULAR);
  if (twins) out.push(Role.OLDER_BROTHER);
  const cOrder = [Role.SHERIFF, Role.DOCTOR, ...Array(plan.sniperN).fill(Role.SNIPER), Role.POLICEWOMAN, Role.NURSE, Role.MAYOR, Role.PHOENIX];
  const cSlots = Math.max(0, citizens - (twins ? 1 : 0));
  for (let i = 0; i < cSlots; i++) out.push(cOrder[i] ?? Role.CITIZEN);
  if (twins && citizens > 0) out.push(Role.YOUNGER_BROTHER);
  if (plan.jester) out.push(Role.JESTER);
  for (let i = 0; i < assassins; i++) out.push(Role.ASSASSIN);
  return out;
}

/** إعداداتُ الغرفة من الخطّة — المؤقّت لا يُرسل خارج اللوبي (الخادم يرفضه أثناء التجهيز) */
export function roomSettingsFrom(plan: SetupPlan, opts: { withTimer: boolean }) {
  return {
    ...(opts.withTimer ? { gameTimerMinutes: plan.minutes } : {}),
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
    // القمرة تختار طريقة الليل بنفسها — نمطُ الخادم يدويّ دائماً للغرف الحضوريّة
    nightMode: 'manual' as const,
    setupPlan: { ...plan },
  };
}

type Emit = (e: string, d: any) => Promise<any>;

/** يطبّق الخطّة على الغرفة (إعدادات + حدّ التكرار المتتالي) */
export async function applyPlan(emit: Emit, roomId: string, plan: SetupPlan, opts: { withTimer: boolean }) {
  await emit('room:update-settings', { roomId, ...roomSettingsFrom(plan, opts) });
  await emit('room:update-max-consecutive-mafia', { roomId, maxConsecutiveMafiaGames: plan.consec });
}

/** قيمُ الحساب المحفوظة — null حتّى تصل أو إن لم تُحفظ بعد */
export function useAccountDefaults(emit: Emit) {
  const [defaults, setDefaults] = useState<SetupPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    emit('leader:get-game-defaults', {})
      .then((r: any) => { if (alive) setDefaults(r?.defaults ? normalizePlan(r.defaults) : null); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async (plan: SetupPlan) => {
    // «تلقائيّ» للمافيا يُحفظ تلقائيّاً دائماً — العددُ اليدويّ يخصّ لعبةً بعينها
    const toSave = { ...plan, mafia: null };
    await emit('leader:save-game-defaults', { defaults: toSave });
    setDefaults(toSave);
  };
  return { defaults: defaults ?? BUILTIN_PLAN, saved: defaults, loaded, save };
}

/** خطّةُ هذه الغرفة: ما حُفظ فيها، وإلّا قيمُ الحساب */
export function initialPlan(cfg: any, account: SetupPlan): SetupPlan {
  return cfg?.setupPlan && typeof cfg.setupPlan === 'object' ? normalizePlan(cfg.setupPlan, account) : { ...account };
}
