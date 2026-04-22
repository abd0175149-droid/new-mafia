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
  MAFIA_REGULAR = 'MAFIA_REGULAR',   // مافيا عادي

  // فريق المواطنين
  SHERIFF = 'SHERIFF',               // الشريف
  DOCTOR = 'DOCTOR',                 // الطبيب
  SNIPER = 'SNIPER',                 // القناص
  POLICEWOMAN = 'POLICEWOMAN',       // الشرطية
  NURSE = 'NURSE',                   // الممرضة
  CITIZEN = 'CITIZEN',               // مواطن صالح
}

// ── تصنيف الفرق ────────────────────────────────────

export const MAFIA_ROLES: Role[] = [
  Role.GODFATHER,
  Role.SILENCER,
  Role.CHAMELEON,
  Role.MAFIA_REGULAR,
];

export const CITIZEN_ROLES: Role[] = [
  Role.SHERIFF,
  Role.DOCTOR,
  Role.SNIPER,
  Role.POLICEWOMAN,
  Role.NURSE,
  Role.CITIZEN,
];

// الأدوار التي لها قدرات ليلية
export const NIGHT_ACTIVE_ROLES: Role[] = [
  Role.GODFATHER,
  Role.SILENCER,
  Role.SHERIFF,
  Role.DOCTOR,
  Role.SNIPER,
];

export function isMafiaRole(role: Role): boolean {
  return MAFIA_ROLES.includes(role);
}

export function isCitizenRole(role: Role): boolean {
  return CITIZEN_ROLES.includes(role);
}

// ── أسماء الأدوار بالعربي ────────────────────────

export const ROLE_NAMES_AR: Record<Role, string> = {
  [Role.GODFATHER]: 'شيخ المافيا',
  [Role.SILENCER]: 'قص المافيا',
  [Role.CHAMELEON]: 'حرباية المافيا',
  [Role.MAFIA_REGULAR]: 'مافيا عادي',
  [Role.SHERIFF]: 'الشريف',
  [Role.DOCTOR]: 'الطبيب',
  [Role.SNIPER]: 'القناص',
  [Role.POLICEWOMAN]: 'الشرطية',
  [Role.NURSE]: 'الممرضة',
  [Role.CITIZEN]: 'مواطن صالح',
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
  mafiaTotal: number;
  citizenTotal: number;
}

export function getTeamCounts(players: { role: Role | string | null; isAlive: boolean }[]): TeamCounts {
  const withRoles = players.filter(p => p.role);
  const alive = withRoles.filter(p => p.isAlive);

  return {
    mafiaAlive: alive.filter(p => isMafiaRole(p.role as Role)).length,
    citizenAlive: alive.filter(p => !isMafiaRole(p.role as Role)).length,
    mafiaTotal: withRoles.filter(p => isMafiaRole(p.role as Role)).length,
    citizenTotal: withRoles.filter(p => !isMafiaRole(p.role as Role)).length,
  };
}
