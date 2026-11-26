// ══════════════════════════════════════════════════════
// 🔮 الكشف بعد اللعبة (قرار المالك ٣١) — ما فعلته كروت النبوءة في هذه المباراة
//
// يُضاف إلى حمولة game:over مرّةً واحدة في emitGameOver. بعد نهاية اللعبة كلُّ شيءٍ علنيّ،
// فالحمولةُ نفسها للموجّه والشاشة والهواتف.
//
//   masks:  على من وُضع كلّ قناع، ومن قرأه، وماذا رأى، وهل أعدمته المدينة بعدها بيومين
//           («أعدمتموه لأنّكم رأيتم قناعه» — وهو نفسه شرط مكافأة «تلفيقٌ نافذ» في مرحلة الرانك).
//   oracle: الصندوقان معاً، وأيّهما فُتح، والنتيجة، والوصيّة.
//   divided: من كان المنقسم، وأيّ جانبٍ اختار (أو بقي لأنّه لم يختر).
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { prophecyReveal } from './oracle-engine.js';
import { cupSummary } from './cup-engine.js';
import { dividedSummary } from './divided-engine.js';
import { guarantorSummary } from './guarantor-engine.js';

/** نافذة «التلفيق النافذ»: إعدامٌ بيد المدينة خلال يومين من احتراق القناع */
export const FRAME_WINDOW_DAYS = 2;

export function prophecyRevealFor(state: GameState | null | undefined) {
  if (!state) return null;
  const nameOf = (seat: number | null | undefined) => state.players.find(p => p.physicalId === seat)?.name || '';
  const log = state.performanceTracking?.eliminationLog || [];
  const executedAt = (seat: number) => log.find(e => e.physicalId === seat && (e.eliminatedBy === 'DAY_VOTE' || e.eliminatedBy === 'DEAL'))?.round ?? null;

  const d: any = (state as any).deceiverState;
  const masks = d?.masks?.length ? d.masks.map((m: any) => {
    const ex = executedAt(m.targetPhysicalId);
    return {
      targetPhysicalId: m.targetPhysicalId, targetName: nameOf(m.targetPhysicalId),
      placedRound: m.placedRound, burned: !!m.burned, burnedBy: m.burnedBy ?? null, burnedRound: m.burnedRound ?? null,
      shownAs: m.shownAs ?? null,
      // ⚖️ سقط حين عبر صاحبُه المنقسم (لم يُقرأ)
      lifted: !!m.lifted,
      // أُعدم بيد المدينة بعد أن قُرئ قناعُه، خلال النافذة
      executedBecauseOfMask: !!(m.burned && ex != null && m.burnedRound != null && ex >= m.burnedRound && ex - m.burnedRound <= FRAME_WINDOW_DAYS),
    };
  }) : [];

  const o = prophecyReveal(state);
  const oracle = o ? {
    oraclePhysicalId: (state as any).oracleState?.oraclePhysicalId ?? null,
    oracleName: nameOf((state as any).oracleState?.oraclePhysicalId),
    boxes: { A: { physicalId: o.boxes.aPhysicalId, name: nameOf(o.boxes.aPhysicalId) }, B: { physicalId: o.boxes.bPhysicalId, name: nameOf(o.boxes.bPhysicalId) } },
    mafiaBox: o.boxes.mafiaBox,
    chosenBox: o.chosenBox,
    outcome: o.outcome ?? 'NOT_PASSED',
    testamentPhysicalId: o.testamentPhysicalId,
  } : null;

  const cup = cupSummary(state);
  const dv = dividedSummary(state);
  const divided = dv ? { ...dv, name: nameOf(dv.dividedPhysicalId) } : null;
  const guarantor = guarantorSummary(state);
  if (!masks.length && !oracle && !cup && !divided && !guarantor) return null;
  return { deceiverPhysicalId: d?.deceiverPhysicalId ?? null, masks, oracle, cup, divided, guarantor };
}
