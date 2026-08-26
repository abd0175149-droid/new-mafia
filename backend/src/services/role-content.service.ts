// ══════════════════════════════════════════════════════
// 📖 محتوى الأدوار للاعب — قيودٌ مولَّدة وشرحٌ مكتوب
//
// 🔴 القيدُ الذي تعرفه البيانات لا يُكتب بيد. وصفُ الطبيب كان يقول
//    «لا يكرّر نفس الهدف» بينما excludeLastTarget=true جالسةٌ في القاعدة
//    لا يقرأها أحد — حقيقتان لشيءٍ واحد، ويومَ يتغيّر المحرّك يبقى النصُّ
//    يكذب على اللاعب. فما تعرفه القدرةُ يُولَّد منها، وما لا تعرفه يُكتب
//    في extra_limits ويُوسَم أنّه مكتوب.
//
// 🔴 ولا نصَّ بديلاً لحقلٍ فارغ: القسمُ الفارغ لا يظهر أصلاً. «لا يوجد وصف»
//    تشغل مكاناً ولا تقول شيئاً.
// ══════════════════════════════════════════════════════

export interface RoleLimit {
  text: string;
  /** مولَّدٌ من حقول القدرة — لا يُحرَّر ولا يكذب. */
  auto: boolean;
}

export interface PhaseNotes {
  night?: string;
  discussion?: string;
  voting?: string;
  justification?: string;
  dead?: string;
}

/** مفاتيح المراحل بترتيب العرض — مصدرٌ واحد للواجهات كلِّها. */
export const PHASE_KEYS = ['night', 'discussion', 'voting', 'justification', 'dead'] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PHASE_LABELS_AR: Record<PhaseKey, string> = {
  night: 'الليل',
  discussion: 'النقاش',
  voting: 'التصويت',
  justification: 'التبرير',
  dead: 'إن مِتّ',
};

const asArray = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];

/** الأدوار العربيّة للمعرّفات — لرسم سلسلة الوراثة بأسماءٍ لا برموز. */
const ROLE_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا',
  WITCH: 'الساحرة', OLDER_BROTHER: 'الأخ الأكبر', MAFIA_REGULAR: 'مافيا عاديّ',
  SHERIFF: 'الشريف', DOCTOR: 'الطبيب', NURSE: 'الممرّضة', SNIPER: 'القنّاص',
  POLICEWOMAN: 'الشرطيّة', MAYOR: 'العمدة', CITIZEN: 'مواطنٌ صالح',
  YOUNGER_BROTHER: 'الأخ الأصغر', JESTER: 'المهرّج', ASSASSIN: 'السفّاح',
};

const TARGET_AR: Record<string, string> = {
  ENEMY: 'تستهدف الأعداء وحدهم',
  ALLY: 'تستهدف فريقك وحده',
  ANY: 'تستهدف أيّ لاعبٍ على الطاولة',
  SELF: 'تستهدف نفسك وحدك',
};

const EFFECT_AR: Record<string, string> = {
  ELIMINATE: 'أثرُها الإقصاء',
  BLOCK_ELIMINATE: 'أثرُها منعُ الإقصاء',
  REVEAL_TEAM: 'أثرُها كشفُ الفريق',
  SILENCE: 'أثرُها الإسكات',
  CONDITIONAL_ELIMINATE: 'أثرُها إقصاءٌ مشروط',
  DISABLE: 'أثرُها تعطيلُ قدرة',
  PASSIVE: 'قدرةٌ سلبيّةٌ تعمل بلا اختيار',
};

/** شكلُ صفّ القدرة كما يصل من ability_definitions (الحقول التي نقرأها فقط). */
export interface AbilityRow {
  id: string;
  nameAr?: string | null;
  phase?: string | null;
  targetType?: string | null;
  excludeSelf?: boolean | null;
  excludeLastTarget?: boolean | null;
  maxTargets?: number | null;
  effectType?: string | null;
  canSkip?: boolean | null;
  isInheritable?: boolean | null;
  inheritanceOrder?: any;
  deceptionRule?: string | null;
}

/**
 * القيودُ المولَّدة لدورٍ واحد.
 *
 * 🔴 لا تُبَثّ قاعدةٌ صامتة: `canSkip=false` هي حالةُ الأغلبيّة فلا تُذكر،
 *    و`true` استثناءٌ يُذكر. ذكرُ الافتراضيّ في كلّ دورٍ يُغرق المهمَّ بالمعتاد.
 */
export function buildAutoLimits(abilities: AbilityRow[]): RoleLimit[] {
  const out: RoleLimit[] = [];
  const seen = new Set<string>();
  const push = (text: string) => {
    const t = text.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ text: t, auto: true });
  };

  for (const a of abilities) {
    if (a.targetType && TARGET_AR[a.targetType]) push(TARGET_AR[a.targetType]);
    if (a.excludeSelf) push('لا يمكنك اختيار نفسك');
    if (a.excludeLastTarget) push('لا تكرّر هدفَ الليلة الماضية');

    const max = Number(a.maxTargets ?? 1);
    if (Number.isFinite(max) && max > 1) push(`حتّى ${max} أهدافٍ في الليلة الواحدة`);
    else if (a.targetType && a.targetType !== 'NONE') push('هدفٌ واحدٌ في الليلة الواحدة');

    if (a.canSkip) push('يمكنك ألّا تفعل شيئاً هذه الليلة');
    if (a.effectType && EFFECT_AR[a.effectType]) push(EFFECT_AR[a.effectType]);
    if (a.deceptionRule) push(a.deceptionRule);

    if (a.isInheritable) {
      const chain = asArray(a.inheritanceOrder).map((r) => ROLE_AR[r] || r);
      push(chain.length
        ? `تنتقل بعد موتك بالترتيب: ${chain.join(' ← ')}`
        : 'تنتقل قدرتُك إلى غيرك بعد موتك');
    }
  }
  return out;
}

/** القيودُ كاملةً: المولَّدةُ أوّلاً ثمّ المكتوبةُ يداً — والوسمُ يفرّق بينهما في الواجهة. */
export function buildLimits(abilities: AbilityRow[], extra: any): RoleLimit[] {
  return [
    ...buildAutoLimits(abilities),
    ...asArray(extra).map((text) => ({ text, auto: false })),
  ];
}

/** يُطبّع ملاحظات المراحل: المفاتيحُ الخمسةُ وحدها، والفارغُ يسقط. */
export function normalizePhaseNotes(v: any): PhaseNotes {
  const out: PhaseNotes = {};
  if (!v || typeof v !== 'object') return out;
  for (const k of PHASE_KEYS) {
    const s = v[k];
    if (typeof s === 'string' && s.trim()) out[k] = s.trim();
  }
  return out;
}

/**
 * وسمُ «لك دور» الافتراضيّ حين لا يُكتب صراحةً.
 *
 * 🔴 لا يُستنتج من وجود نصّ: للطبيب نصٌّ في النقاش («اصمتْ عن حمايتك») وليس
 *    له فيه فعل. الوسمُ الكاذب أسوأ من غيابه — لاعبٌ ينتظر دوراً لا يجيء.
 */
export function deriveActsIn(abilities: AbilityRow[]): PhaseKey[] {
  const out = new Set<PhaseKey>();
  for (const a of abilities) {
    if (a.effectType === 'PASSIVE') continue;              // سلبيّةٌ لا فعلَ فيها
    if (a.phase === 'NIGHT' || a.phase === 'BOTH') out.add('night');
    if (a.phase === 'DAY' || a.phase === 'BOTH') out.add('discussion');
  }
  return PHASE_KEYS.filter((k) => out.has(k));
}

/**
 * يُثري صفَّ دورٍ بمحتوى العرض. لا يرمي أبداً: دورٌ بلا محتوى يصل بحقولٍ
 * فارغة والواجهةُ تُسقط أقسامَه — وهو أفضل من شاشةٍ لا تُفتح.
 */
export function decorateRole(role: any, abilityById: Map<string, AbilityRow>): any {
  const abilities: AbilityRow[] = asArray(role?.abilities)
    .map((id) => abilityById.get(id))
    .filter(Boolean) as AbilityRow[];

  const authored = Array.isArray(role?.actsInPhases) ? role.actsInPhases : null;
  const actsIn = authored
    ? PHASE_KEYS.filter((k) => authored.includes(k))
    : deriveActsIn(abilities);

  return {
    ...role,
    limits: buildLimits(abilities, role?.extraLimits),
    tips: asArray(role?.tips),
    interactsWith: asArray(role?.interactsWith),
    phaseNotes: normalizePhaseNotes(role?.phaseNotes),
    actsIn,
  };
}
