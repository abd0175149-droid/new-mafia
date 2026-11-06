// 🃏 الكروتُ المكرَّرة — نسخةُ الواجهة من backend/src/game/role-duplicates.ts
// الخادمُ هو الحكم (يرفض الممنوع ولا يعتمد المسموح إلّا بالتأكيد)؛ هذه للعرض الحيّ وحده.

export const FILLER_ROLES = new Set<string>(['CITIZEN', 'MAFIA_REGULAR']);

export const DUPLICABLE_ROLES = new Set<string>([
  'SNIPER', 'ASSASSIN', 'JESTER', 'SHERIFF', 'DOCTOR', 'SILENCER', 'CHAMELEON',
]);

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

/** كيف تعمل النسخُ معاً — سطرٌ لكلّ كرتٍ مسموحٍ تكرارُه. */
export const DUPLICATE_BEHAVIOR: Record<string, string> = {
  SNIPER: 'كلُّ قنّاصٍ يطلق وحده؛ من أصاب مواطناً مات معه وحده، والحمايةُ تُبطل كلَّ طلقةٍ على المحميّ',
  ASSASSIN: 'العلاقة بينهم تختارها أدناه',
  JESTER: 'يفوز المهرّجُ الذي طردته المدينة وحده — والآخر يخسر',
  SHERIFF: 'كلُّ شريفٍ يحقّق وحده ويرى نتيجته',
  DOCTOR: 'كلُّ طبيبٍ يحمي وحده؛ والممرّضةُ تصحو حين يموت كلُّ طبيب',
  SILENCER: 'كلُّ قصٍّ يُسكت لاعباً',
  CHAMELEON: 'كلُّ حرباءٍ تظهر مواطناً عند التحقيق',
};

export interface DuplicateEntry { role: string; count: number; reason?: string }

export function analyzeDuplicates(roles: string[]): { allowed: DuplicateEntry[]; blocked: DuplicateEntry[] } {
  const counts = new Map<string, number>();
  for (const r of roles) if (r) counts.set(r, (counts.get(r) || 0) + 1);
  const allowed: DuplicateEntry[] = [];
  const blocked: DuplicateEntry[] = [];
  counts.forEach((count, role) => {
    if (count < 2 || FILLER_ROLES.has(role)) return;
    if (DUPLICABLE_ROLES.has(role)) allowed.push({ role, count });
    else blocked.push({ role, count, reason: SINGLE_ROLE_REASON[role] || 'هذا الكرت نسخةٌ واحدة' });
  });
  return { allowed, blocked };
}

export type AssassinMode = 'RIVALS' | 'PARTNERS';
