// ══════════════════════════════════════════════════════
// 🃏 الكروتُ المكرَّرة — ما يجوز تكراره، وما يبقى نسخةً واحدة
//
// قرارُ المالك (2026-11-06): الليدر يستطيع أن يضع نسختين من كرتٍ في اللعبة، لكنّ
// الخادم يُنبّهه قبل الاعتماد ولا يعتمد إلّا بتأكيده الصريح.
//
// 🔴 ما يجوز تكراره هو ما يعمل **بالمقعد**: قدرتُه تُفهرس `مقعد:قدرة` في الليلة
//    الواحدة والطابور اليدويّ، ولا حالةَ وحيدةً له في اللعبة. السفّاحُ حالتُه صارت
//    بالمقعد (assassin-engine)، والمهرّجُ يُقيَّم فوزُه بالمقعد (dynamic-win-checker).
// 🔴 وما يبقى نسخةً واحدة له **حالةٌ وحيدة** في اللعبة: سلسلةُ الاغتيال تبدأ بالشيخ،
//    والتوأمان زوجٌ واحد، والعمدةُ والعنقاءُ والشرطيّةُ لكلٍّ منها حالةٌ تحمل مقعداً
//    واحداً، والممرّضةُ تصحو بموت الطبيب، والساحرةُ قائمةُ أهدافها السابقة مشتركة.
// ══════════════════════════════════════════════════════

/** كروتٌ تتكرّر أصلاً بلا تنبيه — حشوُ الفريقين. */
export const FILLER_ROLES = new Set<string>(['CITIZEN', 'MAFIA_REGULAR']);

/** كروتٌ مميّزة يجوز تكرارُها بتأكيد الليدر. */
export const DUPLICABLE_ROLES = new Set<string>([
  'SNIPER', 'ASSASSIN', 'JESTER',
  'SHERIFF', 'DOCTOR', 'SILENCER', 'CHAMELEON',
]);

/** سببُ بقاء الكرت نسخةً واحدة — يُعرض للّيدر كما هو. */
export const SINGLE_ROLE_REASON: Record<string, string> = {
  GODFATHER: 'الشيخ رأسُ سلسلة الاغتيال — شيخٌ واحد',
  OLDER_BROTHER: 'التوأمان زوجٌ واحد',
  YOUNGER_BROTHER: 'التوأمان زوجٌ واحد',
  MAYOR: 'الفيتو والصوت المضاعف لعمدةٍ واحد',
  PHOENIX: 'النهوض والاحتراق لعنقاءٍ واحد',
  NURSE: 'الممرّضة تصحو بموت الطبيب — ممرّضةٌ واحدة',
  POLICEWOMAN: 'صلاحيةُ الشرطيّة واحدة في اللعبة',
  WITCH: 'قائمةُ أهداف الساحرة واحدة',
};

export interface DuplicateEntry { role: string; count: number; reason?: string }

export interface DuplicateReport {
  /** مكرَّرٌ مسموحٌ به — يحتاج تأكيد الليدر. */
  allowed: DuplicateEntry[];
  /** مكرَّرٌ ممنوع — يُرفض التوزيع. */
  blocked: DuplicateEntry[];
}

/** يعدّ الكروت ويُرجع ما تكرّر منها مقسوماً بين المسموح والممنوع. */
export function analyzeDuplicates(roles: (string | null | undefined)[]): DuplicateReport {
  const counts = new Map<string, number>();
  for (const r of roles) if (r) counts.set(r, (counts.get(r) || 0) + 1);
  const allowed: DuplicateEntry[] = [];
  const blocked: DuplicateEntry[] = [];
  for (const [role, count] of counts) {
    if (count < 2 || FILLER_ROLES.has(role)) continue;
    if (DUPLICABLE_ROLES.has(role)) allowed.push({ role, count });
    else blocked.push({ role, count, reason: SINGLE_ROLE_REASON[role] || 'هذا الكرت نسخةٌ واحدة' });
  }
  return { allowed, blocked };
}

/** هل في اللعبة كرتٌ مميّزٌ مكرَّر؟ (يُقفل الوضع الآليّ لليل) */
export function hasDuplicateRoles(roles: (string | null | undefined)[]): boolean {
  const r = analyzeDuplicates(roles);
  return r.allowed.length > 0 || r.blocked.length > 0;
}

/** نمطُ السفّاحين حين يتعدّدون — يختاره الليدر قبل التوزيع. */
export type AssassinMode = 'RIVALS' | 'PARTNERS';

export const isAssassinMode = (v: unknown): v is AssassinMode => v === 'RIVALS' || v === 'PARTNERS';
