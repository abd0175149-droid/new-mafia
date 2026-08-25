// ══════════════════════════════════════════════════════
// 🎭 Phygital Mafia Engine - الأدوار وخوارزمية التوليد
// (منقول من mafia/backend مع تعديلات طفيفة)
// ══════════════════════════════════════════════════════

// ── الأدوار ────────────────────────────────────────

export enum Role {
  // فريق المافيا
  GODFATHER = 'GODFATHER',           // شيخ المافيا
  SILENCER = 'SILENCER',             // قص المافيا
  CHAMELEON = 'CHAMELEON',           // حرباية المافيا
  WITCH = 'WITCH',                   // الساحرة 🧙‍♀️
  OLDER_BROTHER = 'OLDER_BROTHER',   // 👥 الأخ الأكبر (توأم مافيا)
  MAFIA_REGULAR = 'MAFIA_REGULAR',   // مافيا عادي

  // فريق المواطنين
  SHERIFF = 'SHERIFF',               // الشريف
  DOCTOR = 'DOCTOR',                 // الطبيب
  SNIPER = 'SNIPER',                 // القناص
  POLICEWOMAN = 'POLICEWOMAN',       // الشرطية
  NURSE = 'NURSE',                   // الممرضة
  MAYOR = 'MAYOR',                   // 🎩 العمدة
  CITIZEN = 'CITIZEN',               // مواطن صالح
  YOUNGER_BROTHER = 'YOUNGER_BROTHER', // 👥 الأخ الأصغر (توأم مواطن)

  // فريق محايد
  JESTER = 'JESTER',                 // المهرج 🤡
  ASSASSIN = 'ASSASSIN',             // السفّاح 🔪
}

// ── تصنيف الفرق ────────────────────────────────────

export const MAFIA_ROLES: Role[] = [
  Role.GODFATHER,
  Role.SILENCER,
  Role.CHAMELEON,
  Role.WITCH,
  Role.OLDER_BROTHER,
  Role.MAFIA_REGULAR,
];

export const CITIZEN_ROLES: Role[] = [
  Role.SHERIFF,
  Role.DOCTOR,
  Role.SNIPER,
  Role.POLICEWOMAN,
  Role.NURSE,
  Role.MAYOR,
  Role.CITIZEN,
  Role.YOUNGER_BROTHER,
];

export const NEUTRAL_ROLES: Role[] = [
  Role.JESTER,
  Role.ASSASSIN,
];

// ── 🔫 سلسلة وراثة الاغتيال — المصدر الموحّد ──
// من ينفّذ اغتيال المافيا حين يموت من فوقه: الأوّل حيّاً في الترتيب هو المنفّذ،
// وتُنسَب له نقاط نجاح/إبطال الاغتيال.
//
// 🔴 واحدة هنا لا نسختان: كانت مكرّرة يدويّاً في night.socket وnight-resolver،
//    فغابت الساحرة عن كليهما وهي مافيا أصلاً (MAFIA_ROLES تضمّها). وأيّ إضافةٍ
//    لاحقة في ملفٍ دون الآخر كانت ستُنتج منفّذاً للقتل يختلف عمّن تُنسَب له النقاط.
export const MAFIA_KILL_PRIORITY: Role[] = [
  Role.GODFATHER,
  Role.CHAMELEON,
  Role.SILENCER,      // قص المافيا
  Role.WITCH,         // 🧙‍♀️ بعد القص — ترث الاغتيال وتحتفظ بتعطيلها (كما يفعل القص)
  Role.OLDER_BROTHER, // 👥 التوأم — قبل المافيا العادي
  Role.MAFIA_REGULAR,
];

// الأدوار التي لها قدرات ليلية
export const NIGHT_ACTIVE_ROLES: Role[] = [
  Role.GODFATHER,
  Role.SILENCER,
  Role.SHERIFF,
  Role.DOCTOR,
  Role.SNIPER,
  Role.WITCH,
];

export function isMafiaRole(role: Role): boolean {
  return MAFIA_ROLES.includes(role);
}

export function isCitizenRole(role: Role): boolean {
  return CITIZEN_ROLES.includes(role);
}

export function isNeutralRole(role: Role | string): boolean {
  return NEUTRAL_ROLES.includes(role as Role);
}

// ── فريق الدور (المصدر الموحّد لتصنيف الضحايا في سجل الإقصاء والنقاط) ──
// المحايد (مهرج/سفّاح) ليس مواطناً: موته لا يمنح مكافأة إقصاء لأي فريق
// ولا يُحتسب «إصابة مواطن» في قدرة القنبلة.
export type TeamName = 'MAFIA' | 'CITIZEN' | 'NEUTRAL';

export function teamOfRole(role: Role | string | null | undefined): TeamName {
  if (!role) return 'CITIZEN';
  if (isMafiaRole(role as Role)) return 'MAFIA';
  if (isNeutralRole(role)) return 'NEUTRAL';
  return 'CITIZEN';
}

// ── أسماء الأدوار بالعربي ────────────────────────

export const ROLE_NAMES_AR: Record<Role, string> = {
  [Role.GODFATHER]: 'شيخ المافيا',
  [Role.SILENCER]: 'قص المافيا',
  [Role.CHAMELEON]: 'حرباية المافيا',
  [Role.WITCH]: 'الساحرة',
  [Role.OLDER_BROTHER]: 'الأخ الأكبر',
  [Role.MAFIA_REGULAR]: 'مافيا عادي',
  [Role.SHERIFF]: 'الشريف',
  [Role.DOCTOR]: 'الطبيب',
  [Role.SNIPER]: 'القناص',
  [Role.POLICEWOMAN]: 'الشرطية',
  [Role.NURSE]: 'الممرضة',
  [Role.MAYOR]: 'العمدة',
  [Role.CITIZEN]: 'مواطن صالح',
  [Role.YOUNGER_BROTHER]: 'الأخ الأصغر',
  [Role.JESTER]: 'المهرج',
  [Role.ASSASSIN]: 'السفّاح',
};

// ── خوارزمية التوليد ────────────────────────────────

export interface GeneratedRoles {
  mafiaRoles: Role[];
  citizenRoles: Role[];
  totalMafia: number;
  totalCitizens: number;
}

export function generateRoles(playerCount: number): GeneratedRoles {
  if (playerCount < 6) {
    throw new Error('يجب أن يكون عدد اللاعبين 6 على الأقل');
  }

  const totalMafia = Math.ceil(playerCount / 4);
  const totalCitizens = playerCount - totalMafia;

  const mafiaOrder: Role[] = [
    Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.MAFIA_REGULAR,
  ];

  const mafiaRoles: Role[] = [];
  for (let i = 0; i < totalMafia; i++) {
    if (i < mafiaOrder.length - 1) {
      mafiaRoles.push(mafiaOrder[i]);
    } else {
      mafiaRoles.push(Role.MAFIA_REGULAR);
    }
  }

  const citizenOrder: Role[] = [
    Role.SHERIFF, Role.DOCTOR, Role.SNIPER, Role.POLICEWOMAN, Role.NURSE, Role.CITIZEN,
  ];

  const citizenRoles: Role[] = [];
  for (let i = 0; i < totalCitizens; i++) {
    if (i < citizenOrder.length - 1) {
      citizenRoles.push(citizenOrder[i]);
    } else {
      citizenRoles.push(Role.CITIZEN);
    }
  }

  return { mafiaRoles, citizenRoles, totalMafia, totalCitizens };
}

// ── التحقق من صحة التوزيع ────────────────────────

export function validateRoleDistribution(roles: Role[], playerCount: number): { valid: boolean; error?: string } {
  if (roles.length !== playerCount) {
    return { valid: false, error: `عدد الأدوار (${roles.length}) لا يتطابق مع عدد اللاعبين (${playerCount})` };
  }
  return { valid: true };
}

// ── عداد الفريقين (مافيا / مواطنين) ────────────────

export interface TeamCounts {
  mafiaAlive: number;
  citizenAlive: number;
  /** 🎭 المستقلّون (مهرّج/سفّاح) — حقلٌ جديد، إضافته لا تكسر عميلاً قديماً */
  neutralAlive: number;
  mafiaTotal: number;
  citizenTotal: number;
  neutralTotal: number;
}

/**
 * 🔴 العدّ عبر teamOfRole لا بنفي isMafiaRole. كان الشرط «ليس مافيا» فيسقط
 * المهرّج والسفّاح في خانة المواطنين — فيرى الجميع عدداً كاذباً وتُبنى عليه قرارات التصويت.
 *
 * ⚠️ هذا عدٌّ **للعرض** لا للحكم. معادلة النصر في checkWinCondition منفصلة
 *    وتستعمل isCitizenRole الصريح أصلاً — لا توحّدهما: أيّ لمسةٍ للثانية
 *    تغيّر متى تنتهي كلّ لعبة.
 */
export function getTeamCounts(players: { role: Role | string | null; isAlive: boolean }[]): TeamCounts {
  const withRoles = players.filter(p => p.role);
  const alive = withRoles.filter(p => p.isAlive);
  const by = (list: typeof withRoles, team: TeamName) =>
    list.filter(p => teamOfRole(p.role) === team).length;

  return {
    mafiaAlive: by(alive, 'MAFIA'),
    citizenAlive: by(alive, 'CITIZEN'),
    neutralAlive: by(alive, 'NEUTRAL'),
    mafiaTotal: by(withRoles, 'MAFIA'),
    citizenTotal: by(withRoles, 'CITIZEN'),
    neutralTotal: by(withRoles, 'NEUTRAL'),
  };
}
