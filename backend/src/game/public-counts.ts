// ══════════════════════════════════════════════════════
// 👁️ ما تعرفه القاعة — عدّادُ الفرق العلنيّ وأدوارُ الموتى المكشوفة
//
// 🔴 الحالةُ تُعلّم الميّت لحظةَ الفعل (حسمُ الليل، فرزُ التصويت)، والقاعةُ لا تعرف
//    شيئاً حتّى يُكشف الكرت. كان العدّادُ (مواطنون/مافيا/مستقلّون) يُحسب من الحالة
//    مباشرةً فينقص على شاشة العرض وفي كلّ هاتف قبل الكشف — فيعرف الجميعُ فريقَ
//    الضحيّة قبل أن تُقلب بطاقتها. هنا الحسابُ كما تراه القاعة: كلُّ ميّتٍ لم يُكشف
//    يُعدّ حيّاً بدوره السابق، ويتغيّر العدّادُ مع الكشف نفسه.
//
// مصدرٌ واحد يخدم إسقاطَ الحالة للهواتف (أدوار الموتى) وعدّادَ الفرق في كلّ بثّ.
// ══════════════════════════════════════════════════════

import { getTeamCounts, type TeamCounts } from './roles.js';

export interface RevealOptions {
  /** احسبْ كأنّ نتيجة الإقصاء النهاريّ كُشفت (لحظة «كشف الأدوار» قبل حفظ العلم). */
  revealElimination?: boolean;
  /** احسبْ كأنّ ضحايا القنبلة المحبوسة كُشفوا. */
  revealHeldBomb?: boolean;
}

/** المقاعدُ الميّتة التي لم يُكشف دورُها بعد — موتُها في الحالة يسبق إعلانَه. */
export function unrevealedDeadSeats(state: any, opts: RevealOptions = {}): Set<number> {
  const out = new Set<number>();
  if (!state) return out;
  // إقصاءُ النهار: يُعلَّم الميّتُ قبل «كشف الأدوار»
  if (!opts.revealElimination && state.phase === 'DAY_ELIMINATION' && !state.eliminationRevealed) {
    for (const id of state.pendingResolution?.eliminated || []) out.add(Number(id));
  }
  // ضحايا القنبلة المحبوسة — في طور الإقصاء وحده: نتيجةٌ عالقة بعده لا تُخفي موتى الليل التالي
  if (!opts.revealHeldBomb && state.phase === 'DAY_ELIMINATION') {
    for (const id of state.heldBombResult?.bombEliminated || []) out.add(Number(id));
  }
  // الليل: كلُّ حدثٍ لم يعرضه الموجّه بعد
  for (const ev of state.morningEvents || []) {
    if (ev?.revealed) continue;
    if (ev?.targetPhysicalId != null) out.add(Number(ev.targetPhysicalId));
    const sniper = ev?.extra?.sniperPhysicalId;
    if (sniper != null) out.add(Number(sniper));
  }
  return out;
}

/**
 * عدّادُ الفرق كما تعرفه القاعة: الميّتُ غيرُ المكشوف حيٌّ، والأخُ الأصغر الذي تحوّل
 * ليلاً ولم يُعرض تحوّلُه بعد يُعدّ بدوره السابق.
 */
export function publicTeamCounts(state: any, opts: RevealOptions = {}): TeamCounts {
  const hidden = unrevealedDeadSeats(state, opts);
  const pendingTransform = new Map<number, string>();
  for (const ev of state?.morningEvents || []) {
    if (!ev?.revealed && ev?.type === 'TWIN_TRANSFORM' && ev?.targetPhysicalId != null && ev?.extra?.previousRole) {
      pendingTransform.set(Number(ev.targetPhysicalId), String(ev.extra.previousRole));
    }
  }
  const players = (state?.players || []).map((p: any) => {
    const seat = Number(p.physicalId);
    let q = p;
    if (hidden.has(seat) && p.isAlive === false) q = { ...q, isAlive: true };
    if (pendingTransform.has(seat)) q = { ...q, role: pendingTransform.get(seat) };
    return q;
  });
  return getTeamCounts(players);
}

/** المقاعدُ التي يكشفها حدثُ صباحٍ واحد — تنتظر شاشةُ العرض قلبَ بطاقاتها قبل تحديث العدّاد. */
export function seatsRevealedBy(state: any, ev: any): number[] {
  const seats: number[] = [];
  const dead = (id: any) => id != null && state?.players?.some((p: any) => Number(p.physicalId) === Number(id) && p.isAlive === false);
  if (dead(ev?.targetPhysicalId)) seats.push(Number(ev.targetPhysicalId));
  if (dead(ev?.extra?.sniperPhysicalId)) seats.push(Number(ev.extra.sniperPhysicalId));
  return seats;
}
