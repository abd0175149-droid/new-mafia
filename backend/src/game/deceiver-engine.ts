// ══════════════════════════════════════════════════════
// 🎭 المُضلّل «مغيّر الأقدار» — قناعٌ يجعل بريئاً يبدو مافيا (موسم النبوءة)
//
// قرارات المالك (2026-11-26):
//   ٧  القناع يبقى حتّى أوّل قراءةٍ تلمسه، ثمّ يحترق.
//   ٨  قناعٌ واحد، واثنان اختياريّاً من ٢٤ لاعباً (config.deceiverMasks).
//   ٩  تلفيقٌ وحده: على غير المافيا (والحرباية تبقى للسِّتر)، ولا على نفسه.
//   ١٧ يعرف المُضلّل صباحاً أنّ قناعه احترق، دون أن يعرف من قرأه.
//   ٣٢ القناع يبقى إن خرج المُضلّل — الكذبة لا تموت بموت كاتبها.
//
// 🔴 القناعُ يقلب **القراءة وحدها** (تحقيق الشريف، وصندوقَي العرّاف في المرحلة ٢) —
//    لا القنص ولا الإعدام ولا أيّ موت: كلّ ذلك يقرأ الدور الحقيقيّ.
// 🔴 ثأرُ الشريف يبقى بالحقيقة (sheriff-revenge يقرأ الأدوار نفسها).
// 🔴 الحالةُ سرٌّ مطلق: لا تصل الهواتف (قائمة السماح) ولا المتفرّجين (stripSecrets)،
//    والحقولُ بأسماء *PhysicalId كي تنقلها أداة نقل المقاعد.
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { Role, isMafiaRole } from './roles.js';

export interface DeceiverMask {
  targetPhysicalId: number;
  placedRound: number;
  burned: boolean;
  burnedRound?: number;
  /** ما الذي قرأه فأحرقه — للموجّه والكشف بعد اللعبة. */
  burnedBy?: 'SHERIFF' | 'ORACLE';
  /** ماذا رأى القارئ (بعد القلب). */
  shownAs?: 'MAFIA' | 'CITIZEN';
}

export interface DeceiverState {
  deceiverPhysicalId: number;
  /** ما بقي من الأقنعة. */
  masksLeft: number;
  masks: DeceiverMask[];
  /** آخر جولةٍ احترق فيها قناعٌ — يقرؤها ظرفُ المُضلّل صباحاً (قرار ١٧). */
  burnNoticeRound?: number | null;
}

/** يُستدعى عند اعتماد الأدوار (binding-complete) — null إن لا مُضلّل في الطاولة. */
export function initDeceiverState(state: GameState): DeceiverState | null {
  const p = state.players.find(x => x.role === Role.DECEIVER);
  if (!p) return null;
  const n = state.players.length;
  const masks = Number((state.config as any).deceiverMasks) === 2 && n >= 24 ? 2 : 1;
  return { deceiverPhysicalId: p.physicalId, masksLeft: masks, masks: [], burnNoticeRound: null };
}

/** هل لهذا المقعد قناعٌ يضعه الليلة؟ (يُستدعى من خطّة الليل والطابور) */
export function canSeatMask(state: GameState, seat: number): boolean {
  const d = (state as any).deceiverState as DeceiverState | null | undefined;
  if (!d || d.deceiverPhysicalId !== seat || d.masksLeft <= 0) return false;
  const me = state.players.find(p => p.physicalId === seat);
  return !!me?.isAlive && me.role === Role.DECEIVER;
}

/** القناعُ القائم على مقعد (غير المحترق)، إن وُجد. */
export function activeMaskOn(state: GameState, seat: number): DeceiverMask | undefined {
  const d = (state as any).deceiverState as DeceiverState | null | undefined;
  return d?.masks.find(m => m.targetPhysicalId === seat && !m.burned);
}

/**
 * يضع القناع — يُتحقَّق من الهدف هنا أيضاً لا في قائمة الأهداف وحدها:
 * حيّ، ليس مافيا، ليس المُضلّل، ولا قناعَ قائماً عليه.
 */
export function placeMask(state: GameState, performerSeat: number, targetSeat: number): DeceiverMask | null {
  const d = (state as any).deceiverState as DeceiverState | null | undefined;
  if (!d || !canSeatMask(state, performerSeat)) return null;
  const t = state.players.find(p => p.physicalId === targetSeat);
  if (!t || !t.isAlive || targetSeat === performerSeat) return null;
  if (t.role && isMafiaRole(t.role as Role)) return null;
  if (activeMaskOn(state, targetSeat)) return null;
  const mask: DeceiverMask = { targetPhysicalId: targetSeat, placedRound: state.round || 1, burned: false };
  d.masks.push(mask);
  d.masksLeft -= 1;
  return mask;
}

/**
 * قراءةٌ لمست مقعداً: إن كان عليه قناعٌ قائم تنقلب النتيجة ويحترق القناع.
 * `apparent` هو ما كانت القراءة ستُظهره بلا قناع (بعد خداع الحرباية والسفّاح).
 */
export function readThroughMask(
  state: GameState, seat: number, apparent: 'MAFIA' | 'CITIZEN' | string, by: 'SHERIFF' | 'ORACLE',
): { shown: 'MAFIA' | 'CITIZEN'; mask: DeceiverMask | null } {
  const base: 'MAFIA' | 'CITIZEN' = apparent === 'MAFIA' ? 'MAFIA' : 'CITIZEN';
  const mask = activeMaskOn(state, seat);
  if (!mask) return { shown: base, mask: null };
  const shown: 'MAFIA' | 'CITIZEN' = base === 'MAFIA' ? 'CITIZEN' : 'MAFIA';
  mask.burned = true;
  mask.burnedRound = state.round || 1;
  mask.burnedBy = by;
  mask.shownAs = shown;
  const d = (state as any).deceiverState as DeceiverState;
  d.burnNoticeRound = state.round || 1;
  return { shown, mask };
}

/** لعبةٌ جديدة في الغرفة نفسها تبدأ بلا قناع (يُستدعى مع تهيئة الأدوار الأخرى). */
export function clearDeceiverState(state: GameState): void {
  (state as any).deceiverState = null;
}
