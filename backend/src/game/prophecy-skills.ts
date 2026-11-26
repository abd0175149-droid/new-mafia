// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة · الرانك — ما يُحسب لكلّ لاعبٍ من مباراةٍ فيها كروت النبوءة
//
// المصدر: حالة المباراة وحدها (oracleState · deceiverState · cupState · voteHistory). دالّةٌ نقيّة،
// تُستدعى في finalizeMatch، ولا شيء منها بلا الموسم: مباراةٌ بلا هذه الحالات تُرجع أصفاراً.
//
// مكافآت المهارة (خطّة البناء، المرحلة ٨) — مفاتيحها في إعدادات التقدّم:
//   prophecyTrue       العرّاف: مرّت نبوءته صادقة (أُعدم مافيا بصفقتها)
//   prophecyVoteRight  مصوّتٌ صوّت مع الصادقة، أو لغيرها حين مرّت كاذبة — مرّةً في المباراة
//   frameLanded        المُضلّل: «تلفيقٌ نافذ» — أعدمت المدينة من احترق قناعه خلال يومين
//   (رحيل القارئة = فوزها: cupReaderWin، والمنقسم بمكافأة فريقه — قرار ٣٨)
//
// «مخطوطتك» (قرار ٣٤): لكلّ مصوّت كم مرّةً صدّق الحقيقة وكم مرّةً صدّق القناع، من التصويت
//   نفسه على صفقة النبوءة وعلى إعدام المقنَّع.
// سطرُ السجلّ (قرار ٣٣/٢٠): كلّ مباراةٍ تكتب سطراً في «مخطوطة الصدق» أو «مخطوطة القناع».
//   🔶 القاعدة (اقتراحي — المالك يغيّرها): نقطةُ صدقٍ لنبوءةٍ صادقة ولكفالةٍ أنقذت بريئاً؛ ونقطةُ
//   قناعٍ لنبوءةٍ كاذبة مرّت ولتلفيقٍ نافذ ولكفالةٍ صدّقت المظهر. الأكثر يكتب السطر، وعند
//   التعادل يكتبه الفائز: المدينة ⇒ الصدق، وغيرها ⇒ القناع. والنبوءة المسحوبة عمودٌ ثالث «ما سُحب».
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { prophecyRevealFor } from './prophecy-reveal.js';

export interface ProphecySkills { prophecyTrue: number; prophecyVoteRight: number; frameLanded: number }
export interface ScrollMarks { truth: number; mask: number }
export type LedgerLine = 'TRUTH' | 'MASK';

const isProphecyCand = (c: any) => c?.type === 'DEAL' && (c?.kind === 'PROPHECY');

/** جولةُ التصويت الحاسمة التي مرّت فيها صفقة النبوءة (أو آخر جولةٍ وُضعت فيها) */
function prophecyVoteRound(state: GameState): any | null {
  const o: any = (state as any).oracleState;
  if (!o?.dealRound) return null;
  const h: any[] = (state as any).voteHistory || [];
  const rounds = h.filter(r => r.round === o.dealRound && (r.candidates || []).some(isProphecyCand));
  return rounds.length ? rounds[rounds.length - 1] : null;
}

const votersOf = (cand: any): number[] => (cand?.voters || []).map((v: any) => Number(v.voterPhysicalId));

/** المكافآت لكلّ مقعد */
export function prophecySkillsFor(state: GameState, seat: number): ProphecySkills {
  const out: ProphecySkills = { prophecyTrue: 0, prophecyVoteRight: 0, frameLanded: 0 };
  const o: any = (state as any).oracleState;
  if (o && o.oraclePhysicalId === seat && o.outcome === 'TRUE') out.prophecyTrue = 1;

  if (o && (o.outcome === 'TRUE' || o.outcome === 'FALSE')) {
    const r = prophecyVoteRound(state);
    if (r) {
      const pc = (r.candidates || []).find(isProphecyCand);
      const forIt = votersOf(pc);
      const forOthers = (r.candidates || []).filter((c: any) => c !== pc).flatMap(votersOf);
      if (o.outcome === 'TRUE' && forIt.includes(seat)) out.prophecyVoteRight = 1;
      if (o.outcome === 'FALSE' && forOthers.includes(seat)) out.prophecyVoteRight = 1;
    }
  }

  const d: any = (state as any).deceiverState;
  if (d && d.deceiverPhysicalId === seat) {
    const rv: any = prophecyRevealFor(state);
    out.frameLanded = (rv?.masks || []).filter((m: any) => m.executedBecauseOfMask).length;
  }
  return out;
}

/** «مخطوطتك»: علاماتُ كلّ مصوّتٍ في هذه المباراة */
export function scrollMarksFor(state: GameState): Map<number, ScrollMarks> {
  const marks = new Map<number, ScrollMarks>();
  const add = (seat: number, k: keyof ScrollMarks) => {
    const m = marks.get(seat) || { truth: 0, mask: 0 };
    m[k] += 1; marks.set(seat, m);
  };
  const o: any = (state as any).oracleState;
  if (o && (o.outcome === 'TRUE' || o.outcome === 'FALSE')) {
    const r = prophecyVoteRound(state);
    const pc = r ? (r.candidates || []).find(isProphecyCand) : null;
    if (r && pc) {
      for (const s of votersOf(pc)) add(s, o.outcome === 'TRUE' ? 'truth' : 'mask');
      if (o.outcome === 'FALSE') for (const c of r.candidates || []) if (c !== pc) for (const s of votersOf(c)) add(s, 'truth');
    }
  }
  // إعدامُ المقنَّع بعد احتراق قناعه: من رفع يده صدّق القناع
  const rv: any = prophecyRevealFor(state);
  const framed = (rv?.masks || []).filter((m: any) => m.executedBecauseOfMask).map((m: any) => m.targetPhysicalId);
  if (framed.length) {
    const h: any[] = (state as any).voteHistory || [];
    for (const seat of framed) {
      const r = [...h].reverse().find(x => (x.outcome?.eliminated || []).includes(seat));
      const cand = r ? (r.candidates || []).find((c: any) => c.targetPhysicalId === seat) : null;
      for (const s of votersOf(cand)) add(s, 'mask');
    }
  }
  return marks;
}

/** سطرُ هذه المباراة في سجلّ المخطوطتين — null إن لم تكن مباراة نبوءة */
export function prophecyLedgerLine(state: GameState): { line: LedgerLine; truth: number; mask: number; withdrawn: number } | null {
  const o: any = (state as any).oracleState, d: any = (state as any).deceiverState;
  const c: any = (state as any).cupState, dv: any = (state as any).dividedState, g: any = (state as any).guarantorState;
  if (!o && !d && !c && !dv && !g) return null;
  let truth = 0, mask = 0;
  if (o?.outcome === 'TRUE') truth++;
  if (o?.outcome === 'FALSE') mask++;
  const rv: any = prophecyRevealFor(state);
  mask += (rv?.masks || []).filter((m: any) => m.executedBecauseOfMask).length;
  if (g?.result?.outcome === 'SAVED') truth++;
  if (g?.result?.outcome === 'FAILED') mask++;
  const withdrawn = o?.outcome === 'WITHDRAWN' ? 1 : 0;
  const line: LedgerLine = truth > mask ? 'TRUTH' : mask > truth ? 'MASK' : (state.winner === 'CITIZEN' ? 'TRUTH' : 'MASK');
  return { line, truth, mask, withdrawn };
}
