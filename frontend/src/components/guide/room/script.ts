// ══════════════════════════════════════════════════════
// 🕴️ غرفة التدريب — السيناريو (2026-11-15)
//
// طاولةٌ من عشرة: المتدرّب في المقعد ٥ وتسعة لاعبين آليّين بأسماءٍ مصطنعة. لا شيء هنا
// يمسّ محرّك اللعبة: دوالّ نقيّة تحسب ما يحتاجه عرضُ واجهة الغرفة الحقيقيّة — تركيبة
// الطاولة لكلّ دور، أهداف الليل المسموحة، محصّلة الليلة، وأصوات النهار.
//
// قاعدتان للتدريب:
//   • «همسة تدريب» تدلّ المتدرّب على هدفٍ يُريه قدرته تعمل من أوّل مرّة.
//   • القاعة تميل مع صوته: من صوّت عليه يصير صاحب أعلى الأصوات، فيصل دائماً إلى
//     التبرير وزرّ سحب الصوت (درسٌ من مراجعة المالك: لا حالةَ تعلّمها الجولة تتوقّف
//     على اختيارٍ محظوظ).
// ══════════════════════════════════════════════════════

export type Team = 'MAFIA' | 'CITIZEN' | 'NEUTRAL';

export const ME = 5;
export const SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const BOT_NAMES: Record<number, string> = { 1: 'أحمد', 2: 'سارة', 3: 'يزن', 4: 'ليلى', 6: 'رنا', 7: 'عمر', 8: 'هند', 9: 'دانة', 10: 'فارس' };
export const ROOM_CODE = '0101';
export const GAME_NAME = 'ليلة تجريبيّة';

const MAFIA = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR', 'DECEIVER'];
const NEUTRAL = ['JESTER', 'ASSASSIN', 'CUP_READER'];
export const isMafia = (r: string) => MAFIA.includes(r);
export const teamOf = (r: string): Team => (MAFIA.includes(r) ? 'MAFIA' : NEUTRAL.includes(r) ? 'NEUTRAL' : 'CITIZEN');

/** الأدوار التي يُعرض اختيارها في «جرّب دوراً آخر» — بترتيب العرض */
export const PLAYABLE_ROLES = [
  'SHERIFF', 'DOCTOR', 'SNIPER', 'CITIZEN', 'NURSE', 'MAYOR', 'POLICEWOMAN', 'PHOENIX', 'YOUNGER_BROTHER',
  'GODFATHER', 'MAFIA_REGULAR', 'SILENCER', 'WITCH', 'CHAMELEON', 'OLDER_BROTHER', 'ASSASSIN', 'JESTER',
];

/** تركيبة الطاولة: ثلاثة مافيا دائماً، ودور المتدرّب يحلّ محلّ نظيره الآليّ */
export function tableOf(role: string): Record<number, string> {
  const t: Record<number, string> = { 1: 'DOCTOR', 2: 'CITIZEN', 3: 'GODFATHER', 4: 'SHERIFF', 6: 'CITIZEN', 7: 'MAFIA_REGULAR', 8: 'CITIZEN', 9: 'MAFIA_REGULAR', 10: 'CITIZEN' };
  if (isMafia(role)) { t[7] = 'CITIZEN'; if (role === 'GODFATHER') t[3] = 'MAFIA_REGULAR'; }
  if (role === 'DOCTOR') t[1] = 'CITIZEN';
  if (role === 'SHERIFF') t[4] = 'CITIZEN';
  if (role === 'OLDER_BROTHER') t[8] = 'YOUNGER_BROTHER';
  if (role === 'YOUNGER_BROTHER') t[7] = 'OLDER_BROTHER';
  t[ME] = role;
  return t;
}

export function teamCounts(role: string, dead: number[]) {
  const t = tableOf(role);
  let mafiaAlive = 0, citizenAlive = 0, neutralAlive = 0;
  for (const s of SEATS) {
    if (dead.includes(s)) continue;
    const k = teamOf(t[s]);
    if (k === 'MAFIA') mafiaAlive++; else if (k === 'CITIZEN') citizenAlive++; else neutralAlive++;
  }
  return { mafiaAlive, citizenAlive, neutralAlive };
}

/** شركاء المتدرّب إن كان مافيا */
export const mates = (role: string) => { const t = tableOf(role); return SEATS.filter(s => s !== ME && isMafia(t[s])); };
/** الأدوار الحاضرة على الطاولة — لدليل الأدوار */
export const rolesInPlay = (role: string) => { const t = tableOf(role); return Array.from(new Set(SEATS.map(s => t[s]))); };

// ── الليل ──
const HINTS: Record<string, { seat: number; text: string }> = {
  SHERIFF: { seat: 3, text: 'حقّق مع يزن #3 وانظر ماذا يصلك في الصباح.' },
  DOCTOR: { seat: 6, text: 'المافيا تقصد رنا #6 الليلة. احمِها — ويحقّ لك أن تحمي نفسك أيضاً.' },
  NURSE: { seat: 6, text: 'الطبيب حيّ، فقدرتك نائمة. اختاري أيّ لاعبٍ وأكّدي؛ اختيارك للتمويه.' },
  SNIPER: { seat: 3, text: 'يزن #3 مافيا. اقنصه، أو اضغط «تخطٍّ» لتحفظ طلقتك — التخطّي يعمل لك وحدك.' },
  GODFATHER: { seat: 6, text: 'أنت من يضغط باسم المافيا. اختر هدف الليلة — ولمسُ شريكَيك لا يفعل شيئاً.' },
  SILENCER: { seat: 4, text: 'أسكِت ليلى #4، فلا تتكلّم في نقاش الغد. شريكاك لا يُلمسان.' },
  WITCH: { seat: 1, text: 'عطّلي أحمد #1 — هو الطبيب، فلا يحمي أحداً هذه الجولة.' },
  ASSASSIN: { seat: 4, text: 'عقدك الأوّل «اغتل الشريف». الشريف على هذه الطاولة ليلى #4.' },
};
export function nightHint(role: string) {
  if (HINTS[role]) return HINTS[role];
  if (isMafia(role)) return { seat: 8, text: 'الاغتيال بيد الشيخ. أنت تختار للتمويه — ولمسُ شريكَيك لا يفعل شيئاً.' };
  return { seat: 8, text: 'لا قدرةَ ليليّةً لدورك، ومع ذلك تختار وتؤكّد مثل الجميع؛ كي لا يُعرف من يملك قدرة.' };
}

/** ما يرسله الخادم لقدرتك: النفسُ مسموحةٌ للحماية والإسكات وحدهما، وشركاء المافيا لا يُلمسون */
export function allowedTargets(role: string): number[] {
  const t = tableOf(role);
  const selfOk = ['DOCTOR', 'NURSE', 'SILENCER'].includes(role);
  return SEATS.filter(s => (s !== ME || selfOk) && !(isMafia(role) && s !== ME && isMafia(t[s])));
}
/** دورٌ بلا قدرةٍ ليليّة يختار للتمويه (abilityId = null) */
export const hasNightAbility = (role: string) => ['SHERIFF', 'DOCTOR', 'SNIPER', 'GODFATHER', 'SILENCER', 'WITCH', 'ASSASSIN'].includes(role);

export interface NightResult {
  /** اختيار المتدرّب — null = تخطّى (القنّاص) */
  pick: number | null;
  /** هدف المافيا */
  target: number;
  saved: boolean;
  dead: number[];
  miss?: boolean;
  hit?: boolean;
  contract?: boolean;
  sheriffMafia?: boolean;
}

export function resolveNight(role: string, picked: number | null | undefined): NightResult {
  const t = tableOf(role);
  const pick = picked === undefined ? nightHint(role).seat : picked;
  const target = role === 'GODFATHER' && pick ? pick : 6;
  const dead: number[] = [];
  // الطبيب الآليّ يحمي ليلى #4 — ما لم تعطّله الساحرة
  const botDoctor = t[1] === 'DOCTOR' && !(role === 'WITCH' && pick === 1);
  const saved = (role === 'DOCTOR' && pick === target) || (botDoctor && target === 4);
  if (!saved) dead.push(target);
  const o: NightResult = { pick, target, saved, dead };
  if (role === 'SNIPER' && pick) {
    if (teamOf(t[pick]) === 'CITIZEN') o.miss = true; else o.hit = true;
    if (!dead.includes(pick)) dead.push(pick);
  }
  if (role === 'ASSASSIN') {
    o.contract = pick === 4;
    if (o.contract && !dead.includes(4)) dead.push(4);
  }
  if (role === 'SHERIFF' && pick) o.sheriffMafia = isMafia(t[pick]) && t[pick] !== 'CHAMELEON';
  return o;
}

/** ما لا يقوله الهاتف الحقيقيّ لصاحب الدور — يُهمس به في التدريب */
export function nightOutcomeText(role: string, n: NightResult, nameOf: (s: number) => string): string {
  const nm = n.pick ? `${nameOf(n.pick)} #${n.pick}` : '';
  switch (role) {
    case 'SHERIFF': return '';
    case 'DOCTOR': return n.saved
      ? `حميتَ ${nm} والمافيا قصدتها: لم يمت أحد. الهاتف لا يخبرك بذلك — تقرؤه من تقرير القاعة.`
      : `حمايتك ذهبت إلى ${nm} والمافيا قصدت رنا، فخرجت. الهاتف لا يقول لك أنجحتَ أم لا.`;
    case 'SNIPER': return n.pick == null ? 'حفظتَ طلقتك لليلةٍ أخرى.'
      : n.hit ? `أصبتَ ${nm} وهو ليس مواطناً، فخرج ونجوتَ.`
      : `قنصتَ ${nm} وهو مواطن. في لعبةٍ حقيقيّة تخرج معه؛ أعادك الدون إلى مقعدك لتُكمل الجولة.`;
    case 'GODFATHER': return n.saved ? `قصدتَ ${nm} والطبيب حماها: لم يمت أحد. لا يخبرك الهاتف بالسبب.` : `هدفك ${nm} خرج من اللعبة.`;
    case 'SILENCER': return `${nm} مُسكَتٌ في نقاش اليوم. يبلّغه الموجّه بصوته، وهاتفه لا يعرض شيئاً.`;
    case 'WITCH': return `عطّلتِ قدرة ${nm} هذه الجولة، وهو لا يعلم.`;
    case 'ASSASSIN': return n.contract
      ? 'اكتمل عقدك الأوّل. افتح «مهامّي» تجد العدّاد ١/٣ — تحدّث بصمتٍ بلا إشعار.'
      : 'لم يكتمل العقد: الشريف على هذه الطاولة ليلى #4.';
    default: return 'اختيارك كان للتمويه ولم يغيّر شيئاً — وهذا المطلوب.';
  }
}

// ── النهار ──
export interface Ballot {
  /** صاحب أعلى الأصوات */
  acc: number;
  cands: number[];
  /** أصوات اللاعبين الآليّين: مقعد ← مقعد المرشّح */
  bot: Record<number, number>;
}

export function ballot(night: NightResult, vote: number | null): Ballot {
  const alive = (s: number) => !night.dead.includes(s);
  const cands = [2, 3, ME, 9].filter(alive);
  const acc = vote && vote !== ME && cands.includes(vote) ? vote : (alive(3) ? 3 : 9);
  const scape = cands.find(c => c !== acc && c !== ME) ?? acc;
  const pickFor = (s: number, pref: number) => (pref !== s ? pref : (cands.find(c => c !== s && c !== ME && c !== pref) ?? acc));
  const bot: Record<number, number> = {};
  [1, 2, 4, 8, 10].forEach(s => { bot[s] = pickFor(s, acc); });
  [3, 7, 9].forEach(s => { bot[s] = pickFor(s, scape); });
  for (const k of Object.keys(bot)) if (!alive(Number(k))) delete bot[Number(k)];
  return { acc, cands, bot };
}

/** من يواجهه المتدرّب افتراضيّاً — المافيا لا يواجه شريكه */
export function defaultConfTarget(role: string, night: NightResult): number {
  const alive = (s: number) => !night.dead.includes(s);
  if (isMafia(role)) return [2, 8, 10, 1, 4, 6].find(alive) ?? 2;
  return alive(3) ? 3 : 9;
}

/** محصّلة المواجهة للطالب وحده، من تصويت الجولة نفسها (بإعدادات اليوم) */
export function confOutcomeText(role: string, confTarget: number, acc: number): string {
  const accMafia = isMafia(tableOf(role)[acc]);
  const team = teamOf(role);
  if (confTarget !== acc) return 'خصمك في المواجهة لم يخرج بتصويت هذه الجولة، فلا مكافأة ولا خصم.';
  if (team === 'CITIZEN') return accMafia
    ? 'مواجهتك أصابت: خصمك خرج بالتصويت وكان مافيا. في اللعب الحقيقيّ تُكافأ: +١٠ رتبة و+٢٥ خبرة بإعدادات اليوم.'
    : 'واجهتَ مواطناً فخرج بالتصويت. في اللعب الحقيقيّ يُخصم منك: −١٥ رتبة و−٥ خبرة بإعدادات اليوم.';
  if (team === 'MAFIA') return accMafia
    ? 'واجهتَ شريكك فخرج بالتصويت. في اللعب الحقيقيّ يُخصم منك: −١٥ رتبة بإعدادات اليوم.'
    : 'واجهتَ مواطناً وأنت مافيا: خرج بالتصويت، ولا مكافأة لك ولا خصم.';
  return 'دورك مستقلّ، فمواجهتك لا تكسبك نقاطاً ولا تخسرك.';
}
