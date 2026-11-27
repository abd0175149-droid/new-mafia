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

import { MAFIA_KILL_PRIORITY, NO_RANDOM_ABILITIES } from '../game/roles.js';

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
  PHOENIX: 'العنقاء', DECEIVER: 'المُضلّل', ORACLE: 'العرّاف', CUP_READER: 'قارئة الفنجان', DIVIDED: 'المنقسم', GUARANTOR: 'الكفيل',
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
 * 🔴 التخطّي والاختيارُ العشوائيّ من المحرّك (`NO_RANDOM_ABILITIES`) لا من `canSkip`:
 *    القنّاصُ يتخطّى، وغيرُه يُختار عنه عشوائيّاً إن انتهى الوقت — وهذا يُقال صراحةً.
 */
/**
 * سياقُ التوليد: الدورُ صاحبُ القيود، والأدوارُ الظاهرةُ في الدليل.
 * بلا دورٍ (معاينةُ الإدارة لقدرةٍ مجرّدة) يبقى التوليدُ عامّاً.
 */
export interface LimitContext {
  roleId?: string | null;
  /** أدوارُ الدليل المعروضة — سلسلةُ الوراثة لا تُسمّي دوراً مخفيّاً (كروتُ موسمٍ لم يُطلق). */
  visible?: ReadonlySet<string> | null;
}

export function buildAutoLimits(abilities: AbilityRow[], ctx: LimitContext = {}): RoleLimit[] {
  const out: RoleLimit[] = [];
  const seen = new Set<string>();
  const push = (text: string) => {
    const t = text.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ text: t, auto: true });
  };

  for (const a of abilities) {
    // 🔪 الاغتيالُ لحامل السلسلة وحده (`killHolderSeat`): الأخُ الأكبر يحمله في تعريف دوره
    //    ولا يغتال إلّا حين تصله السلسلة — قيودُه على كارته كانت تَعِده باغتيالٍ كلَّ ليلة.
    if (a.id === 'KILL' && ctx.roleId && ctx.roleId !== MAFIA_KILL_PRIORITY[0]) continue;

    if (a.targetType && TARGET_AR[a.targetType]) push(TARGET_AR[a.targetType]);
    if (a.excludeSelf) push('لا يمكنك اختيار نفسك');
    if (a.excludeLastTarget) push('لا تكرّر هدفَ الليلة الماضية');

    const max = Number(a.maxTargets ?? 1);
    if (Number.isFinite(max) && max > 1) push(`حتّى ${max} أهدافٍ في الليلة الواحدة`);
    else if (a.targetType && a.targetType !== 'NONE') push('هدفٌ واحدٌ في الليلة الواحدة');

    // ⏱️ التخطّي كما تعطيه الليلةُ الواحدة لا كما يقوله `canSkip` في القاعدة: مَن ليس في
    //    NO_RANDOM يُختار عنه عشوائيّاً عند انتهاء المهلة (`fillMissing` في night-one.socket.ts).
    const atNight = a.phase === 'NIGHT' || a.phase === 'BOTH';
    if (atNight && NO_RANDOM_ABILITIES.has(a.id)) push('يمكنك ألّا تفعل شيئاً هذه الليلة');
    else if (atNight && a.targetType && a.targetType !== 'NONE') push('إن انتهى الوقت ولم تختر اختير عنك لاعبٌ عشوائيّاً');
    if (a.effectType && EFFECT_AR[a.effectType]) push(EFFECT_AR[a.effectType]);
    if (a.deceptionRule) push(a.deceptionRule);

    if (a.isInheritable) {
      // 🔴 سلسلةُ الاغتيال من المحرّك (`MAFIA_KILL_PRIORITY`) لا من `inheritanceOrder` في القاعدة:
      //    ذلك الحقل لا يقرؤه المحرّك، وكان ترتيبُه مقلوباً فكذب الكارتُ على حامله.
      const order: string[] = a.id === 'KILL' ? [...MAFIA_KILL_PRIORITY] : asArray(a.inheritanceOrder);
      const chain = order.filter((r) => !ctx.visible || ctx.visible.has(r)).map((r) => ROLE_AR[r] || r);
      push(chain.length
        ? `تنتقل بعد موتك بالترتيب: ${chain.join(' ← ')}`
        : 'تنتقل قدرتُك إلى غيرك بعد موتك');
    }
  }
  return out;
}

/** القيودُ كاملةً: المولَّدةُ أوّلاً ثمّ المكتوبةُ يداً — والوسمُ يفرّق بينهما في الواجهة. */
export function buildLimits(abilities: AbilityRow[], extra: any, ctx: LimitContext = {}): RoleLimit[] {
  return [
    ...buildAutoLimits(abilities, ctx),
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
export function decorateRole(role: any, abilityById: Map<string, AbilityRow>, visible?: ReadonlySet<string> | null): any {
  const abilities: AbilityRow[] = asArray(role?.abilities)
    .map((id) => abilityById.get(id))
    .filter(Boolean) as AbilityRow[];

  const authored = Array.isArray(role?.actsInPhases) ? role.actsInPhases : null;
  const actsIn = authored
    ? PHASE_KEYS.filter((k) => authored.includes(k))
    : deriveActsIn(abilities);

  return {
    ...role,
    limits: buildLimits(abilities, role?.extraLimits, { roleId: role?.id, visible }),
    tips: asArray(role?.tips),
    interactsWith: asArray(role?.interactsWith),
    phaseNotes: normalizePhaseNotes(role?.phaseNotes),
    actsIn,
  };
}
