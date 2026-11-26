// ══════════════════════════════════════════════════════
// ⚖️ المنقسم — يبدأ مواطناً، وفي الليلة الثانية يختار فريقه (موسم النبوءة)
//
// قرارات المالك (2026-11-26):
//   ٣٥ من بداية الموسم، يدخل تلقائيّاً من ١٨ لاعباً (setupPlan.ts).
//   ٣٧ صباحاً تعلن الشاشة الجانب بلا رقمه: «انقسم المنقسم… إلى المافيا» أو «…وبقي مع المدينة».
//   ٣٨ مكافأةٌ متساوية: يُكافأ بمكافأة الفريق الذي انتهى فيه، لا أكثر.
//   ب٤ (قرار البناء) يشارك في اغتيال الليلة نفسها التي عبر فيها.
//
// الاختيار من ظرفه في الليلة الثانية (الجولة ٣: الجولة تزيد عند بدء كلّ ليل، فالليلة الأولى ٢)،
// أو من الموجّه نيابةً عنه. نهائيّ: المافيا عرفته لحظةَ عبوره، فلا رجوع.
// إن لم يختر حتّى حلّ تلك الليلة بقي مع المدينة.
//
// العبور = مسار الأخ الأصغر نفسه: يتحوّل **الدورُ نفسُه** إلى «مافيا عادي»، فكلّ ما يقرأ الفريق
// من الدور (الفوز، العدّ، الشريف، قائمة المافيا، المحادثة السرّيّة، الصفقة) يراه مافيا بلا استثناء.
// والبقاء يُبقي دوره «المنقسم» وفريقُه المدينة. هويّتُه الأولى تبقى هنا (dividedState) للسجلّ.
//
// 🔴 ما يُخفى حتّى الإعلان: عدّاد الفرق العلنيّ يعدّه مواطناً حتّى يُعرض إعلان الصباح
//    (public-counts). أمّا المافيا فتعرفه فوراً (ب٤) — زملاؤه يحتاجونه الليلة نفسها.
// 🔴 آخر سلسلة الاغتيال: لا يحمل الاغتيال إلّا إن لم يبقَ من المافيا غيره (killHolderSeat).
// 🔴 القناع: إن كان عليه قناعُ المُضلّل حين عبر سقط القناع (قرار ٩: التلفيق على غير المافيا
//    وحده — وقناعٌ على مافيا كان سيُريه الشريفَ مواطناً، أي حمايةً لم يخترها أحد).
// 🔴 صندوقا العرّاف ليلةَ الاختيار لا يسحبانه وهو لم يختر بعد: فريقُه لم يُحسم.
// 🔴 الحالةُ سرٌّ مطلق: لا للهواتف (قائمة السماح) ولا للمتفرّجين (stripSecrets)، والحقلُ
//    باسم *PhysicalId فتنقله أداة نقل المقاعد.
// ══════════════════════════════════════════════════════

import type { GameState, MorningEvent } from './state.js';
import { Role } from './roles.js';

/** الليلة الثانية */
export const DIVIDED_CHOICE_ROUND = 3;

export type DividedSide = 'MAFIA' | 'CITY';

export interface DividedState {
  dividedPhysicalId: number;
  choice: DividedSide | null;
  choiceRound: number | null;
  /** لم يختر حتّى حلّ الليلة فبقي مع المدينة */
  defaulted: boolean;
  /** الدور الذي صار إليه حين عبر */
  newRole: string | null;
  /** عُرض إعلان الصباح (أو انتهى الملخّص) — العدّاد العلنيّ يتحرّك معه لا قبله */
  announced: boolean;
  /** سقط عنه قناعٌ حين عبر */
  maskLifted: boolean;
}

const ds = (state: GameState): DividedState | null => ((state as any).dividedState as DividedState | null) || null;

/** يُستدعى عند اعتماد الأدوار — null إن لا منقسم. */
export function initDividedState(state: GameState): DividedState | null {
  const p = state.players.find(x => x.role === Role.DIVIDED);
  if (!p) return null;
  return { dividedPhysicalId: p.physicalId, choice: null, choiceRound: null, defaulted: false, newRole: null, announced: false, maskLifted: false };
}

/** هل يختار هذا المقعد الآن؟ */
export function canChooseSide(state: GameState, seat: number): boolean {
  const d = ds(state);
  if (!d || d.dividedPhysicalId !== seat || d.choice) return false;
  const p = state.players.find(x => x.physicalId === seat);
  return !!p?.isAlive && p.role === Role.DIVIDED
    && (state.phase as string) === 'NIGHT' && (state.round || 1) === DIVIDED_CHOICE_ROUND;
}

/**
 * الاختيار. العبور يحوّل الدور فوراً (ب٤: يعرف المافيا ويعرفونه ويشارك في اغتيال الليلة).
 * المستدعي يُخطر الهواتف (notifyDividedCross) ويحفظ الحالة.
 */
export function chooseSide(state: GameState, seat: number, side: DividedSide): { ok: true; crossed: boolean } | { ok: false; error: string } {
  const d = ds(state);
  if (!d || d.dividedPhysicalId !== seat) return { ok: false, error: 'ليس المنقسم' };
  if (d.choice) return { ok: false, error: 'اخترتَ جانبك' };
  const p = state.players.find(x => x.physicalId === seat);
  if (!p?.isAlive) return { ok: false, error: 'خرجتَ من اللعبة' };
  if ((state.phase as string) !== 'NIGHT' || (state.round || 1) !== DIVIDED_CHOICE_ROUND) return { ok: false, error: 'الاختيارُ في الليلة الثانية' };
  if (side !== 'MAFIA' && side !== 'CITY') return { ok: false, error: 'اختر جانباً' };
  d.choice = side;
  d.choiceRound = state.round || 1;
  if (side === 'CITY') return { ok: true, crossed: false };
  p.role = Role.MAFIA_REGULAR as any;
  d.newRole = Role.MAFIA_REGULAR;
  // 🎭 قناعٌ قائم عليه يسقط — لا يحترق: لم يقرأه أحد، فلا «تلفيق نافذ» منه
  const dec: any = (state as any).deceiverState;
  for (const m of dec?.masks || []) {
    if (m.targetPhysicalId === seat && !m.burned && !m.lifted) { m.lifted = true; m.liftedRound = state.round || 1; d.maskLifted = true; }
  }
  return { ok: true, crossed: true };
}

/** مقعدُ المنقسم الذي عبر (حيّاً أو ميّتاً) — null إن لم يعبر */
export function crossedDividedSeat(state: GameState): number | null {
  const d = ds(state);
  return d?.choice === 'MAFIA' ? d.dividedPhysicalId : null;
}

/** مقعدُ منقسمٍ حيٍّ لم يحسم فريقه بعد، في ليلة اختياره أو قبلها (صندوقا العرّاف يتجاوزانه) */
export function undecidedDividedSeat(state: GameState): number | null {
  const d = ds(state);
  if (!d || d.choice) return null;
  if ((state.round || 1) !== DIVIDED_CHOICE_ROUND) return null;
  const p = state.players.find(x => x.physicalId === d.dividedPhysicalId);
  return p?.isAlive && p.role === Role.DIVIDED ? d.dividedPhysicalId : null;
}

/** عبر ولم يُعلن بعد: العدّاد العلنيّ يعدّه بدوره الأوّل */
export function dividedPendingCross(state: GameState): number | null {
  const d = ds(state);
  return d?.choice === 'MAFIA' && !d.announced ? d.dividedPhysicalId : null;
}

/** عُرض إعلان الصباح (أو انتهى الملخّص كلّه) */
export function markDividedAnnounced(state: GameState): void {
  const d = ds(state);
  if (d?.choice && !d.announced) d.announced = true;
}

/**
 * آخر حلّ ليلة الاختيار: إن لم يختر وهو حيّ بقي مع المدينة، ويُضاف إعلان الصباح.
 * الإعلان بلا رقمٍ ولا اسم: `targetPhysicalId` فارغ عمداً (لا يُعدّ في «الموتى غير المكشوفين»
 * ولا يصل الشاشة رقمُه). إن مات قبل أن يختار فلا اختيار ولا إعلان.
 */
export function settleDividedAtNightEnd(state: GameState, events: MorningEvent[]): void {
  const d = ds(state);
  if (!d || (state.round || 1) !== DIVIDED_CHOICE_ROUND || d.announced) return;
  if (events.some(e => (e.type as string) === 'DIVIDED_SIDE')) return;
  const p = state.players.find(x => x.physicalId === d.dividedPhysicalId);
  if (!d.choice) {
    if (!p?.isAlive) return;
    d.choice = 'CITY';
    d.choiceRound = state.round || 1;
    d.defaulted = true;
  }
  events.push({
    type: 'DIVIDED_SIDE' as any, targetPhysicalId: null as any, targetName: '', revealed: false,
    extra: { side: d.choice },
  } as any);
}

/** ظرفُ المنقسم — يُطابق بالمقعد لا بالدور (دورُه يتغيّر حين يعبر) */
export function dividedNoticeFor(state: GameState, seat: number) {
  const d = ds(state);
  if (!d || d.dividedPhysicalId !== seat) return null;
  return {
    choice: d.choice, choiceRound: d.choiceRound, defaulted: d.defaulted,
    canChooseNow: canChooseSide(state, seat),
    choiceNight: DIVIDED_CHOICE_ROUND,
  };
}

/** للكشف بعد اللعبة والسجلّ */
export function dividedSummary(state: GameState) {
  const d = ds(state);
  if (!d) return null;
  return { dividedPhysicalId: d.dividedPhysicalId, choice: d.choice, choiceRound: d.choiceRound, defaulted: d.defaulted, maskLifted: d.maskLifted };
}
