// ══════════════════════════════════════════════════════
// 🗳️ أعدادُ التصويت والسحب — مصدرٌ واحد لكلّ الشاشات
//
// وحدتان لا تُخلطان:
//   • الأصوات — موزونة: صوتُ العمدة المكشوف يُحسب بوزنه (×2 افتراضيّاً).
//   • الأشخاص — رؤوس: كلُّ مصوّتٍ واحد مهما كان وزنه.
//
// 🔴 كانت كلُّ شاشةٍ تحسب مجموعَ السحب ونصفَه المطلوب من عدد المصوّتين
//    (votersForAccused.length) قبل أوّل سحب، والخادمُ يحسبهما بالأوزان — فعرض
//    الموجّهُ «المطلوب ٢» والخادمُ يطلب ٣ حين يكون العمدةُ بين المصوّتين. وشاشةُ
//    القاعة طرحت عدداً موزوناً من عدد رؤوس. الآن: الخادمُ يحسب، والشاشاتُ تعرض.
// ══════════════════════════════════════════════════════

export interface WithdrawalNumbers {
  /** مجموعُ الأصوات (الموزونة) على المتّهمين */
  total: number;
  /** الأصواتُ المطلوب سحبُها لإعادة التصويت — نصفُ المجموع أو أكثر */
  needed: number;
  /** الأصواتُ المسحوبة حتّى الآن (موزونة) */
  count: number;
  /** عددُ مَن صوّتوا على المتّهمين (رؤوس) */
  voters: number;
  /** عددُ مَن سحبوا (رؤوس) */
  withdrawnPeople: number;
  /** بلغ السحبُ النصاب؟ */
  reached: boolean;
}

/** يجمع أعداد السحب من حالة الخادم، ولا يحسب بالرؤوس إلّا مع خادمٍ قديم لا يرسلها. */
export function withdrawalNumbers(ws: any, jd: any): WithdrawalNumbers {
  const voterIds: number[] = Array.isArray(jd?.votersForAccused) ? jd.votersForAccused : [];
  const weights: Record<string, number> = jd?.voterWeights || {};
  const weightedFromList = voterIds.reduce((s, id) => s + (Number(weights[id]) || 1), 0);
  const total = numOr(ws?.total, numOr(jd?.withdrawalTotal, weightedFromList));
  const needed = numOr(ws?.needed, numOr(jd?.withdrawalNeeded, Math.ceil(total / 2))) || Math.ceil(total / 2);
  const count = numOr(ws?.count, 0);
  const withdrawnPeople = Array.isArray(ws?.withdrawn) ? ws.withdrawn.length : 0;
  return { total, needed, count, voters: voterIds.length, withdrawnPeople, reached: needed > 0 && count >= needed };
}

/** وزنُ صوت مقعدٍ في التبرير (1 ما لم يكن العمدةَ المكشوف). */
export function voterWeight(jd: any, physicalId: number): number {
  return Number(jd?.voterWeights?.[physicalId]) || 1;
}

/** أصواتُ مرشّحٍ وعددُ مصوّتيه — `differs` حين يختلفان (صوتُ العمدة الموزون بينها). */
export function candidateCounts(candidate: any, playerVotes?: Record<string, number>, index?: number) {
  const votes = Number(candidate?.votes) || 0;
  let voters = Number.isFinite(candidate?.voters) ? Number(candidate.voters) : NaN;
  // خادمٌ قديم بلا `voters`: نعدّ من playerVotes إن توفّر الفهرس
  if (!Number.isFinite(voters) && playerVotes && index != null) {
    voters = Object.values(playerVotes).filter(v => Number(v) === index).length;
  }
  if (!Number.isFinite(voters)) voters = votes;
  return { votes, voters, differs: voters !== votes };
}

function numOr(v: any, fallback: number): number {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : fallback;
}
