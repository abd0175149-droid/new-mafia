// ══════════════════════════════════════════════════════
// 🎭 الثوابت والأنواع المشتركة (Shared Constants & Types)
// ══════════════════════════════════════════════════════

// ── الأدوار ────────────────────────────────────

export enum Role {
  GODFATHER = 'GODFATHER',
  SILENCER = 'SILENCER',
  CHAMELEON = 'CHAMELEON',
  WITCH = 'WITCH',
  OLDER_BROTHER = 'OLDER_BROTHER',
  MAFIA_REGULAR = 'MAFIA_REGULAR',
  SHERIFF = 'SHERIFF',
  DOCTOR = 'DOCTOR',
  SNIPER = 'SNIPER',
  POLICEWOMAN = 'POLICEWOMAN',
  NURSE = 'NURSE',
  MAYOR = 'MAYOR',
  CITIZEN = 'CITIZEN',
  YOUNGER_BROTHER = 'YOUNGER_BROTHER',
  JESTER = 'JESTER',
  ASSASSIN = 'ASSASSIN',
}

export const MAFIA_ROLES = [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.WITCH, Role.OLDER_BROTHER, Role.MAFIA_REGULAR];
export const NEUTRAL_ROLES = [Role.JESTER, Role.ASSASSIN];

export function isMafiaRole(role: Role): boolean {
  return MAFIA_ROLES.includes(role);
}

export function isNeutralRole(role: Role | string): boolean {
  return NEUTRAL_ROLES.includes(role as Role);
}

export const ROLE_NAMES: Record<Role, string> = {
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

export const ROLE_ICONS: Record<Role, string> = {
  [Role.GODFATHER]: '🔪',
  [Role.SILENCER]: '🤐',
  [Role.CHAMELEON]: '🦎',
  [Role.WITCH]: '🔮', // مفردة آمنة — 🧙‍♀️ (ZWJ) تتفكك على أندرويد القديم وWindows
  [Role.OLDER_BROTHER]: '👥',
  [Role.MAFIA_REGULAR]: '🎭',
  [Role.SHERIFF]: '🔍',
  [Role.DOCTOR]: '💉',
  [Role.SNIPER]: '🎯',
  [Role.POLICEWOMAN]: '👮', // مفردة آمنة بلا ZWJ
  [Role.NURSE]: '🏥',
  [Role.MAYOR]: '🎩',
  [Role.CITIZEN]: '👤',
  [Role.YOUNGER_BROTHER]: '👥',
  [Role.JESTER]: '🤡',
  [Role.ASSASSIN]: '🔪',
};

// ── المراحل ────────────────────────────────────

export enum Phase {
  LOBBY = 'LOBBY',
  ROLE_GENERATION = 'ROLE_GENERATION',
  ROLE_BINDING = 'ROLE_BINDING',
  DAY_DISCUSSION = 'DAY_DISCUSSION',
  DAY_VOTING = 'DAY_VOTING',
  DAY_JUSTIFICATION = 'DAY_JUSTIFICATION',
  DAY_TIEBREAKER = 'DAY_TIEBREAKER',
  NIGHT = 'NIGHT',
  MORNING_RECAP = 'MORNING_RECAP',
  GAME_OVER = 'GAME_OVER',
}

export const PHASE_NAMES: Record<Phase, string> = {
  [Phase.LOBBY]: 'اللوبي',
  [Phase.ROLE_GENERATION]: 'توليد الأدوار',
  [Phase.ROLE_BINDING]: 'ربط الكروت',
  [Phase.DAY_DISCUSSION]: 'نقاش نهاري',
  [Phase.DAY_VOTING]: 'التصويت',
  [Phase.DAY_JUSTIFICATION]: 'التبرير',
  [Phase.DAY_TIEBREAKER]: 'كسر التعادل',
  [Phase.NIGHT]: 'الليل',
  [Phase.MORNING_RECAP]: 'ملخص الصباح',
  [Phase.GAME_OVER]: 'نهاية اللعبة',
};

// ── أنواع المرشحين ──────────────────────────────

export enum CandidateType {
  PLAYER = 'PLAYER',
  DEAL = 'DEAL',
}

// ── الأنواع المشتركة ────────────────────────────

export interface Player {
  physicalId: number;
  name: string;
  phone: string | null;
  playerId: number | null;
  role: Role | null;
  isAlive: boolean;
  isSilenced: boolean;
}

export interface PlayerCandidate {
  type: CandidateType.PLAYER;
  targetPhysicalId: number;
  votes: number;
}

export interface DealCandidate {
  type: CandidateType.DEAL;
  initiatorPhysicalId: number;
  targetPhysicalId: number;
  votes: number;
}

export type Candidate = PlayerCandidate | DealCandidate;

export interface MorningEvent {
  type: 'ASSASSINATION' | 'ASSASSINATION_BLOCKED' | 'SNIPE_MAFIA' | 'SNIPE_CITIZEN' | 'SILENCED' | 'SHERIFF_RESULT' | 'ABILITY_DISABLED' | 'TWIN_SUICIDE' | 'TWIN_TRANSFORM';
  targetPhysicalId: number;
  targetName: string;
  extra?: Record<string, unknown>;
  revealed: boolean;
}

// ── تنسيق اللاعب حسب القاعدة البصرية الموحدة ──

export function formatPlayer(physicalId: number, name: string): string {
  return `#${physicalId} - ${name}`;
}
