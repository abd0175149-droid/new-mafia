// ══════════════════════════════════════════════════════
// 🔮 العرّاف — صندوقان مختومان وصفقة النبوءة (موسم النبوءة)
//
// قرارات المالك (2026-11-26):
//   ٢  صفقة النبوءة تمرّ بالتصويت كأيّ صفقة.
//   ٣  أوّل ليلةٍ يُفتح فيها الصندوقان: الليلة الثانية (الجولة ٣ في العدّ — الجولة تزيد عند بدء كلّ ليل،
//      فالليلة الأولى هي الجولة ٢). ليلةٌ قبلها تعطي المُضلّل فرصة قناعه.
//   ٥  صفقة النبوءة **بلا اسم صاحبها**: تُخزَّن علناً بصاحبٍ صفريّ (initiatorPhysicalId = 0 — لا مقعد
//      بهذا الرقم)، والمقعدُ الحقيقيّ هنا في oracleState وحدها. هكذا لا يصل اسمُ العرّاف أيّ هاتفٍ
//      ولا الشاشة ولا سجلّ التصويت، مهما كان المسار الذي يقرأ الصفقات.
//   ٦  «الوصيّة» مفتاحٌ في إعدادات كرت الغرفة (config.oracleTestament، افتراضيّاً مفعّلة).
//   ٢٦ حقّ الشكّ من البداية: يحرق نبوءته حتّى يُفتح التصويت.
//   ٣٠ نقض العمدة يحرقها فلا تعود.
//   ب٢ (قرار البناء) العرّاف يختار «أ» أو «ب» داخل الظرف — فليس للعرّاف خطوةٌ في خطّة الليل:
//      شاشتُه في الليل كشاشة الجميع، واختيارُ الصندوق طلبٌ مستقلّ (oracle:open).
//
// القواعد من الخطّة والمراجعة:
//   • الصندوقان من الأحياء عند بدء الليل: مافيا حيّ ومواطنٌ حيّ — بلا مستقلّين ولا العرّاف.
//   • المقنَّع (قناع المُضلّل القائم) يدخل الصندوق المعاكس: مواطنٌ مقنَّع قد يقع في صندوق المافيا.
//     سحبُه فعلاً في أحد الصندوقين يحرق قناعه؛ دخولُه القرعة وحده لا يحرقه.
//   • تحترق النبوءة إن قُتل العرّاف في ليلة الفتح، أو مات صاحب الاسم قبل الصباح.
//   • تعطيلُ الساحرة يؤجّلها ولا يحرقها.
//   • تُسجَّل صباحاً قبل غيرها، وتشغل خانةً من الثلاث، ولا يمنعها قفل الجولتين.
// ══════════════════════════════════════════════════════

import type { GameState, MorningEvent } from './state.js';
import { Role, isMafiaRole, isNeutralRole } from './roles.js';
import { activeMaskOn, readThroughMask } from './deceiver-engine.js';
import { undecidedDividedSeat } from './divided-engine.js';

export const PROPHECY_FIRST_ROUND = 3;
export const PROPHECY_DEAL_PREFIX = 'prophecy-';

export type ProphecyOutcome =
  | 'TRUE'            // مرّت والهدف مافيا
  | 'FALSE'           // مرّت والهدف مواطن — ارتدّت على العرّاف
  | 'NOT_PASSED'      // لم تفز في التصويت
  | 'WITHDRAWN'       // حقّ الشكّ: أحرقها العرّاف قبل التصويت
  | 'VETOED'          // نقضها العمدة
  | 'GUARANTEED'      // كفل الكفيلُ هدفها البريء فأُلغيت (المرحلة ٥)
  | 'BURNED_NIGHT'    // مات العرّاف أو صاحب الاسم قبل الصباح
  | 'REMOVED';        // أزالها الموجّه

export interface OracleBoxes {
  /** 🔁 أسماءٌ بنمط *PhysicalId كي تنقلها أداة نقل المقاعد */
  aPhysicalId: number;
  bPhysicalId: number;
  /** أيّ الصندوقين سُحب له من حوض المافيا (قد يكون مواطناً مقنَّعاً) */
  mafiaBox: 'A' | 'B';
}

export interface OracleState {
  oraclePhysicalId: number;
  used: boolean;
  /** طلبُ الفتح الليلة (يُستهلك عند الحلّ) */
  pendingBox: 'A' | 'B' | null;
  openedRound: number | null;
  boxes: OracleBoxes | null;
  chosenBox: 'A' | 'B' | null;
  /** صاحبُ الاسم الذي رآه */
  seenPhysicalId: number | null;
  /** الجولة التي سُجّلت فيها صفقتُه صباحاً */
  dealRound: number | null;
  outcome: ProphecyOutcome | null;
  /** «الوصيّة»: رقمُ الصندوق الآخر إن سقط بنبوءةٍ كاذبة والمفتاح مفعّل */
  testamentPhysicalId: number | null;
}

export const boxSeat = (b: OracleBoxes, box: 'A' | 'B') => (box === 'A' ? b.aPhysicalId : b.bPhysicalId);

export const isProphecyDeal = (x: { id?: string; kind?: string } | null | undefined): boolean =>
  !!x && (x.kind === 'PROPHECY' || (typeof x.id === 'string' && x.id.startsWith(PROPHECY_DEAL_PREFIX)));

const os = (state: GameState): OracleState | null => ((state as any).oracleState as OracleState | null) || null;

/** يُستدعى عند اعتماد الأدوار — null إن لا عرّاف. */
export function initOracleState(state: GameState): OracleState | null {
  const p = state.players.find(x => x.role === Role.ORACLE);
  if (!p) return null;
  return {
    oraclePhysicalId: p.physicalId, used: false, pendingBox: null, openedRound: null,
    boxes: null, chosenBox: null, seenPhysicalId: null, dealRound: null, outcome: null, testamentPhysicalId: null,
  };
}

/** هل يحقّ لهذا المقعد طلبُ فتح الصندوقين الليلة؟ */
export function canOpenProphecy(state: GameState, seat: number): { ok: true } | { ok: false; error: string } {
  const o = os(state);
  if (!o || o.oraclePhysicalId !== seat) return { ok: false, error: 'ليس عرّافاً' };
  const me = state.players.find(p => p.physicalId === seat);
  if (!me?.isAlive || me.role !== Role.ORACLE) return { ok: false, error: 'العرّاف خارج اللعبة' };
  if (o.used) return { ok: false, error: 'النبوءة استُعملت' };
  if ((state.phase as string) !== 'NIGHT') return { ok: false, error: 'الصندوقان يُفتحان ليلاً' };
  if ((state.round || 1) < PROPHECY_FIRST_ROUND) return { ok: false, error: 'الصندوقان يُفتحان من الليلة الثانية' };
  return { ok: true };
}

/** طلبُ الفتح (من ظرف العرّاف، أو من الموجّه في الطابور). يُستبدل حتّى يُحلّ الليل؛ null يلغيه. */
export function requestOpen(state: GameState, seat: number, box: 'A' | 'B' | null): { ok: true } | { ok: false; error: string } {
  if (box !== null && box !== 'A' && box !== 'B') return { ok: false, error: 'صندوقٌ غير معروف' };
  const c = canOpenProphecy(state, seat);
  if (c.ok === false) return c;
  os(state)!.pendingBox = box;
  return { ok: true };
}

/** عشوائيٌّ قابلٌ للحقن في الاختبار */
let rand: () => number = Math.random;
export function __setOracleRandom(fn: () => number) { rand = fn; }
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

/**
 * ١) أوّل الليل — قبل أيّ قتل: إن طلب العرّاف الفتح يُملأ الصندوقان من أحياء البداية ويُفتح المختار.
 * يُستدعى من resolveNightDynamic قبل الآثار.
 */
export function openProphecyAtNightStart(state: GameState, events: MorningEvent[]): void {
  const o = os(state);
  if (!o || !o.pendingBox || o.used) return;
  const box = o.pendingBox;
  o.pendingBox = null;
  const oracle = state.players.find(p => p.physicalId === o.oraclePhysicalId);
  if (!oracle?.isAlive) return;
  // 🧙‍♀️ معطَّلٌ بالساحرة ⇒ يُلغى الطلب ولا تُستهلك النبوءة
  if (oracle.disabledUntilRound != null && oracle.disabledUntilRound >= (state.round || 1)) {
    events.push({
      type: 'ABILITY_VOIDED' as any, targetPhysicalId: oracle.physicalId, targetName: oracle.name,
      performerPhysicalId: oracle.physicalId, performerName: oracle.name, revealed: false,
      extra: { abilityId: 'PROPHECY', performerRole: oracle.role, disabledUntilRound: oracle.disabledUntilRound },
    } as any);
    return;
  }
  // ⚖️ منقسمٌ لم يحسم فريقه ليلةَ اختياره لا يُسحب: لا مافيا هو بعد ولا مواطن
  const undecided = undecidedDividedSeat(state);
  const alive = state.players.filter(p => p.isAlive && p.role && p.physicalId !== o.oraclePhysicalId && p.physicalId !== undecided && !isNeutralRole(p.role as string));
  const maskedCitizen = (p: any) => !isMafiaRole(p.role as Role) && !!activeMaskOn(state, p.physicalId);
  const mafiaPool = alive.filter(p => isMafiaRole(p.role as Role) || maskedCitizen(p));
  const citizenPool = alive.filter(p => !isMafiaRole(p.role as Role) && !maskedCitizen(p));
  if (!mafiaPool.length || !citizenPool.length) {
    // لا مافيا حيّ أو لا مواطن غيره — لا تُفتح، ويبقى له حقّه
    events.push({ type: 'PROPHECY_UNAVAILABLE' as any, targetPhysicalId: oracle.physicalId, targetName: oracle.name, revealed: false, extra: {} } as any);
    return;
  }
  const m = pick(mafiaPool).physicalId;
  const c = pick(citizenPool).physicalId;
  const mafiaBox: 'A' | 'B' = rand() < 0.5 ? 'A' : 'B';
  const boxes: OracleBoxes = mafiaBox === 'A' ? { aPhysicalId: m, bPhysicalId: c, mafiaBox } : { aPhysicalId: c, bPhysicalId: m, mafiaBox };
  // 🎭 سحبُ المقنَّع فعلاً يحرق قناعه (القراءةُ هنا قرعة الصندوق)
  for (const seat of [boxes.aPhysicalId, boxes.bPhysicalId]) {
    const t = state.players.find(p => p.physicalId === seat)!;
    if (activeMaskOn(state, seat)) {
      const r = readThroughMask(state, seat, isMafiaRole(t.role as Role) ? 'MAFIA' : 'CITIZEN', 'ORACLE');
      if (r.mask) {
        const decSeat = (state as any).deceiverState?.deceiverPhysicalId as number | undefined;
        events.push({
          type: 'MASK_BURNED', targetPhysicalId: seat, targetName: t.name,
          performerPhysicalId: decSeat, performerName: state.players.find(p => p.physicalId === decSeat)?.name,
          revealed: false, extra: { shownAs: r.shown, burnedBy: 'ORACLE', placedRound: r.mask.placedRound },
        } as any);
      }
    }
  }
  o.used = true;
  o.openedRound = state.round || 1;
  o.boxes = boxes;
  o.chosenBox = box;
  o.seenPhysicalId = boxSeat(boxes, box);
  const seen = state.players.find(p => p.physicalId === o.seenPhysicalId)!;
  events.push({
    type: 'PROPHECY_OPENED' as any,
    targetPhysicalId: seen.physicalId, targetName: seen.name,
    performerPhysicalId: oracle.physicalId, performerName: oracle.name,
    revealed: false,
    extra: { box, fromMafiaBox: box === mafiaBox, targetRole: seen.role, otherPhysicalId: boxSeat(boxes, box === 'A' ? 'B' : 'A') },
  } as any);
}

/**
 * ٢) آخر الليل — بعد استقرار الوفيات: تحترق إن مات العرّاف أو صاحب الاسم.
 * يُستدعى من resolveNightDynamic قبل الإرجاع.
 */
export function settleProphecyAtNightEnd(state: GameState, events: MorningEvent[]): void {
  const o = os(state);
  if (!o || o.openedRound !== (state.round || 1) || o.outcome) return;
  const oracle = state.players.find(p => p.physicalId === o.oraclePhysicalId);
  const seen = state.players.find(p => p.physicalId === o.seenPhysicalId);
  if (oracle?.isAlive && seen?.isAlive) return;
  o.outcome = 'BURNED_NIGHT';
  events.push({
    type: 'PROPHECY_BURNED' as any,
    targetPhysicalId: o.seenPhysicalId ?? o.oraclePhysicalId, targetName: seen?.name || '',
    performerPhysicalId: o.oraclePhysicalId, performerName: oracle?.name,
    revealed: false, extra: { reason: oracle?.isAlive ? 'TARGET_DIED' : 'ORACLE_DIED' },
  } as any);
}

/** ٣) صباحاً — بعد تصفير صفقات النهار: تُسجَّل صفقة النبوءة أوّلاً. */
export function placeProphecyDeal(state: GameState): boolean {
  const o = os(state);
  if (!o || !o.used || o.outcome || o.dealRound != null || o.seenPhysicalId == null) return false;
  const target = state.players.find(p => p.physicalId === o.seenPhysicalId);
  const oracle = state.players.find(p => p.physicalId === o.oraclePhysicalId);
  if (!target?.isAlive || !oracle?.isAlive) { o.outcome = 'BURNED_NIGHT'; return false; }
  const deals = state.votingState.deals || [];
  // صفقةٌ أخرى على الهدف نفسه لا تُسبقها (الصفقات تُصفَّر قبلها، فهذا احتياط)
  state.votingState.deals = [
    { id: `${PROPHECY_DEAL_PREFIX}${state.round || 1}`, kind: 'PROPHECY', initiatorPhysicalId: 0, targetPhysicalId: target.physicalId } as any,
    ...deals.filter(d => d.targetPhysicalId !== target.physicalId),
  ];
  o.dealRound = state.round || 1;
  return true;
}

/** مقعدُ صاحب صفقة النبوءة الحقيقيّ (للحلّ وحده — لا يُعرض) */
export function prophecyOwnerSeat(state: GameState): number | null {
  return os(state)?.oraclePhysicalId ?? null;
}

/** صاحبُ صفقةٍ — الحقيقيّ لصفقة النبوءة، وكما هو لغيرها */
export function dealOwnerSeat(state: GameState, deal: { id?: string; kind?: string; initiatorPhysicalId?: number | null }): number | null {
  if (isProphecyDeal(deal)) return prophecyOwnerSeat(state);
  return deal.initiatorPhysicalId ?? null;
}

/** ٤) بعد الإعدام: مرّت صفقة النبوءة — صادقةٌ أو كاذبة، ومعها الوصيّة. */
export function recordProphecyPassed(state: GameState, targetWasMafia: boolean): void {
  const o = os(state);
  if (!o || o.outcome) return;
  o.outcome = targetWasMafia ? 'TRUE' : 'FALSE';
  if (!targetWasMafia && (state.config as any).oracleTestament !== false && o.boxes && o.chosenBox) {
    o.testamentPhysicalId = boxSeat(o.boxes, o.chosenBox === 'A' ? 'B' : 'A');
  }
}

/** يُغلق النبوءة بسببٍ غير المرور، ويُزيل صفقتها من النهار ومن مرشّحيه إن وُجدت. */
export function closeProphecy(state: GameState, outcome: Exclude<ProphecyOutcome, 'TRUE' | 'FALSE'>): boolean {
  const o = os(state);
  if (!o || o.outcome) return false;
  o.outcome = outcome;
  const vs: any = state.votingState;
  if (vs?.deals) vs.deals = vs.deals.filter((d: any) => !isProphecyDeal(d));
  if (vs?.candidates) vs.candidates = vs.candidates.filter((c: any) => !(c.type === 'DEAL' && isProphecyDeal(c)));
  return true;
}

/** حقّ الشكّ: العرّاف يحرق نبوءته — قبل أن يُفتح التصويت وحده. */
export function withdrawProphecy(state: GameState, seat: number): { ok: true } | { ok: false; error: string } {
  const o = os(state);
  if (!o || o.oraclePhysicalId !== seat) return { ok: false, error: 'ليس عرّافاً' };
  if (o.outcome) return { ok: false, error: 'النبوءة حُسمت' };
  const has = (state.votingState?.deals || []).some(d => isProphecyDeal(d as any));
  if (!has) return { ok: false, error: 'لا صفقة نبوءةٍ اليوم' };
  if ((state.phase as string) !== 'DAY_DISCUSSION') return { ok: false, error: 'يُحرق قبل أن يُفتح التصويت' };
  closeProphecy(state, 'WITHDRAWN');
  return { ok: true };
}

/** لم تفز في التصويت (فاز غيرها أو لم يُعدم أحد) — تنطفئ. يُستدعى حين ينتهي نهارٌ فيه صفقتها. */
export function expireProphecyIfUnresolved(state: GameState): void {
  const o = os(state);
  if (!o || o.outcome || o.dealRound == null) return;
  // نهارُ الصفقة انقضى (بدأ ليلٌ بعده) ولم تُحسم ⇒ لم تفز
  if ((state.round || 1) > o.dealRound) o.outcome = 'NOT_PASSED';
}

/** للكشف بعد اللعبة (قرار ٣١) — الصندوقان معاً */
export function prophecyReveal(state: GameState) {
  const o = os(state);
  if (!o || !o.boxes) return null;
  return { boxes: o.boxes, chosenBox: o.chosenBox, seenPhysicalId: o.seenPhysicalId, outcome: o.outcome, testamentPhysicalId: o.testamentPhysicalId };
}
