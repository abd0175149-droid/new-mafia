// ══════════════════════════════════════════════════════
// 🌙 خطّةُ الليلة — مَن يتحرّك، وبأيّ قدرة، وعلى مَن
//
// مصدرٌ واحدٌ يحلّ محلّ طابور الخطوات: يُحسب مرّةً عند بدء الليل، ويُجيب سؤالين
// لكلّ مقعد: ماذا يملك الليلة؟ ومَن يستطيع أن يختار؟
//
// 🔴 الاغتيالُ لصاحبِ السلسلة وحده. `buildNightQueue` القديمة كانت تمنحه لكلّ
//    مَن يملكه في تعريف دوره — فالشيخُ والأخُ الأكبر كلاهما يحمل KILL، وكلاهما
//    كان يأخذ خطوةً في المسار اليدويّ. والمحرّك يفهرس الإجراءات بالقدرة، فالثاني
//    كان يمحو الأوّل بصمت. هنا: حاملٌ واحدٌ للاغتيال دائماً.
//
// 🔴 وترتيبُ العرض مقفل: **الاغتيالُ أوّلاً دائماً**، ثمّ قدرةُ اللاعب نفسِه.
//    ثباتُه يمنع أن يتعلّم اللاعبُ من موضع السؤال شيئاً — لو جاء الإسكاتُ أوّلاً
//    عند القصّ والتعطيلُ أوّلاً عند الساحرة لصار موضعُ السؤال نفسُه إشارة.
//    وهو يوافق ترتيبَ الحساب (الاغتيال أولويّة ١)، فما يراه اللاعبُ هو ما يجري.
// ══════════════════════════════════════════════════════

import type { GameState, Player } from './state.js';
import { Role, MAFIA_KILL_PRIORITY } from './roles.js';
import { getAbilitiesForRole, getAbilityDefs } from './definition-service.js';

/** فعلٌ واحدٌ في الليلة: مقعدٌ × قدرة. */
export interface NightSlot {
  seat: number;
  abilityId: string;
  /** اسمُ القدرة كما يُعرض للموجّه. */
  nameAr: string;
  /** أولويّةُ الحلّ — لا ترتيبُ العرض. */
  priority: number;
  /** معطَّلٌ بالساحرة الليلة؟ يُعرض للموجّه، والمحرّك يُسقط الفعل. */
  disabled: boolean;
  /** لا يُقبل اختيارٌ عشوائيّ عند انتهاء المهلة (القنص يقتل صاحبَه). */
  noRandom: boolean;
}

/** مفتاحُ الإجراء — مركّبٌ لا معرّفَ قدرةٍ وحده. لاعبان بالقدرة نفسها لا يمحو أحدُهما الآخر. */
export const slotKey = (seat: number, abilityId: string) => `${seat}:${abilityId}`;

/** حاملُ الاغتيال الليلة — أوّلُ حيٍّ في سلسلة الوراثة، أو null. */
export function killHolderSeat(state: GameState): number | null {
  for (const role of MAFIA_KILL_PRIORITY) {
    const p = state.players.find(x => x.role === role && x.isAlive);
    if (p) return p.physicalId;
  }
  return null;
}

const isDisabled = (p: Player, round: number) =>
  p.disabledUntilRound != null && p.disabledUntilRound >= round;

/**
 * خطّةُ الليلة كاملةً، مرتّبةً **بترتيب العرض**: الاغتيال أوّلاً، ثمّ بقيّةُ
 * القدرات بأولويّتها، وعند التعادل بالمقعد.
 */
export async function buildNightPlan(state: GameState): Promise<NightSlot[]> {
  const round = state.round || 1;
  const all = await getAbilityDefs();
  const byId = new Map(all.map(a => [a.id, a]));
  const holder = killHolderSeat(state);
  const slots: NightSlot[] = [];

  const push = (seat: number, abilityId: string) => {
    const a = byId.get(abilityId);
    if (!a) return;
    if (a.phase !== 'NIGHT' && a.phase !== 'BOTH') return;
    if (slots.some(s => s.seat === seat && s.abilityId === abilityId)) return;
    const p = state.players.find(x => x.physicalId === seat)!;
    slots.push({
      seat, abilityId,
      nameAr: a.nameAr || abilityId,
      priority: a.priority ?? 99,
      disabled: isDisabled(p, round),
      // 🔴 القنصُ لا يُختار عشوائيّاً: قنصُ مواطنٍ يقتل القنّاصَ معه، فرميةُ نردٍ
      //    من الخادم قد تُخرج لاعبَين لأنّ صاحبَها تأخّر عن المهلة.
      noRandom: abilityId === 'SNIPE',
    });
  };

  // ١) الاغتيال — لحامله وحده
  if (holder != null) push(holder, 'KILL');

  // ٢) بقيّةُ القدرات — لصاحب الدور
  for (const p of state.players.filter(x => x.isAlive && x.role)) {
    const roleId = p.role as string;
    for (const a of await getAbilitiesForRole(roleId)) {
      if (a.id === 'KILL') continue;                       // للحامل وحده أعلاه
      if (roleId === 'NURSE' && a.id === 'PROTECT' && !state.nurseActivated) continue;
      if (roleId === 'ASSASSIN' && a.id === 'ASSASSINATE') {
        if (!state.assassinState?.firstNightPassed) continue;
        if (state.assassinState?.won) continue;
      }
      push(p.physicalId, a.id);
    }
  }

  // ترتيبُ العرض: الاغتيالُ أوّلاً مطلقاً، ثمّ الأولويّة، ثمّ المقعد
  return slots.sort((x, y) => {
    if ((x.abilityId === 'KILL') !== (y.abilityId === 'KILL')) return x.abilityId === 'KILL' ? -1 : 1;
    return (x.priority - y.priority) || (x.seat - y.seat);
  });
}

/** قدراتُ مقعدٍ بعينه بترتيب العرض — الاغتيالُ أوّلاً إن حمله. */
export function slotsOfSeat(plan: NightSlot[], seat: number): NightSlot[] {
  return plan.filter(s => s.seat === seat);
}

/** المقاعدُ الحيّة التي لا فعلَ لها الليلة — تُسجَّل اختياراتُها ولا تُحسب. */
export function idleSeats(state: GameState, plan: NightSlot[]): number[] {
  const acting = new Set(plan.map(s => s.seat));
  return state.players.filter(p => p.isAlive && !acting.has(p.physicalId)).map(p => p.physicalId);
}
