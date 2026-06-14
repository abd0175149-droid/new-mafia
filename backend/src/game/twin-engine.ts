// ══════════════════════════════════════════════════════
// 👥 محرك التوأمين — Twin Bond Engine
// يعالج ارتباط الدم بين الأخ الأكبر (مافيا) والأخ الأصغر (مواطن)
// ══════════════════════════════════════════════════════

import { type GameState, type TwinState, type MorningEvent, ROLE_NAMES_AR } from './state.js';
import { Role, isMafiaRole } from './roles.js';

// ── أنواع النتائج ──────────────────────────────────────

export interface TwinBondResult {
  triggered: boolean;
  type: 'SUICIDE' | 'TRANSFORM' | null;
  affectedPhysicalId: number | null;     // من تأثر (الأخ الآخر)
  // SUICIDE:
  suicidePhysicalId?: number;
  suicideName?: string;
  // TRANSFORM:
  transformPhysicalId?: number;
  transformName?: string;
  newRole?: string;                       // الدور الموروث
  previousRole?: string;                  // الدور القديم
}

// ── ترتيب وراثة التحول ────────────────────────────────
// عند موت الأخ الأكبر، الأخ الأصغر يبحث في أموات المافيا ويأخذ أول دور ميت
const TRANSFORM_INHERITANCE_ORDER: Role[] = [
  Role.GODFATHER,
  Role.SILENCER,
  Role.CHAMELEON,
  Role.MAFIA_REGULAR,
];

// ══════════════════════════════════════════════════════
// 🎯 تهيئة حالة التوأمين — يُستدعى عند توزيع الأدوار
// ══════════════════════════════════════════════════════

export function initTwinState(state: GameState): TwinState | null {
  const olderBrother = state.players.find(p => p.role === Role.OLDER_BROTHER);
  const youngerBrother = state.players.find(p => p.role === Role.YOUNGER_BROTHER);

  if (!olderBrother || !youngerBrother) return null;

  console.log(`👥 Twin Bond initialized: Older #${olderBrother.physicalId} (${olderBrother.name}) ↔ Younger #${youngerBrother.physicalId} (${youngerBrother.name})`);

  return {
    olderBrotherPhysicalId: olderBrother.physicalId,
    youngerBrotherPhysicalId: youngerBrother.physicalId,
    olderAlive: true,
    youngerAlive: true,
    transformed: false,
    suicideTriggered: false,
  };
}

// ══════════════════════════════════════════════════════
// 🩸 معالجة ارتباط الدم — يُستدعى عند كل موت
// ══════════════════════════════════════════════════════

export function processTwinBond(
  state: GameState,
  deadPhysicalId: number,
  _deathSource: string,
): TwinBondResult {
  const noResult: TwinBondResult = { triggered: false, type: null, affectedPhysicalId: null };

  if (!state.twinState) return noResult;
  const twin = state.twinState;

  // إذا كلاهما ميت بالفعل أو التأثير حدث مسبقاً → لا شيء
  if (twin.suicideTriggered || twin.transformed) return noResult;

  // ── السيناريو 1: موت الأخ الأصغر → الأكبر ينتحر ──
  if (deadPhysicalId === twin.youngerBrotherPhysicalId && twin.youngerAlive) {
    twin.youngerAlive = false;

    // تحقق: هل الأخ الأكبر لا يزال حياً؟ (حالة الموت المزدوج)
    const olderPlayer = state.players.find(p => p.physicalId === twin.olderBrotherPhysicalId);
    if (!olderPlayer || !olderPlayer.isAlive) {
      console.log(`👥 Younger Brother #${deadPhysicalId} died but Older Brother is already dead — no suicide`);
      return noResult;
    }

    return {
      triggered: true,
      type: 'SUICIDE',
      affectedPhysicalId: twin.olderBrotherPhysicalId,
      suicidePhysicalId: olderPlayer.physicalId,
      suicideName: olderPlayer.name,
    };
  }

  // ── السيناريو 2: موت الأخ الأكبر → الأصغر يتحول ──
  if (deadPhysicalId === twin.olderBrotherPhysicalId && twin.olderAlive) {
    twin.olderAlive = false;

    // تحقق: هل الأخ الأصغر لا يزال حياً؟ (حالة الموت المزدوج)
    const youngerPlayer = state.players.find(p => p.physicalId === twin.youngerBrotherPhysicalId);
    if (!youngerPlayer || !youngerPlayer.isAlive) {
      console.log(`👥 Older Brother #${deadPhysicalId} died but Younger Brother is already dead — no transform`);
      return noResult;
    }

    // حساب الدور الموروث
    const newRole = resolveTransformRole(state);

    return {
      triggered: true,
      type: 'TRANSFORM',
      affectedPhysicalId: twin.youngerBrotherPhysicalId,
      transformPhysicalId: youngerPlayer.physicalId,
      transformName: youngerPlayer.name,
      newRole,
      previousRole: Role.YOUNGER_BROTHER,
    };
  }

  return noResult;
}

// ══════════════════════════════════════════════════════
// 🔄 خوارزمية وراثة الدور عند التحول
// يبحث في أموات المافيا ويمنح أول دور ميت حسب الأولوية
// ══════════════════════════════════════════════════════

export function resolveTransformRole(state: GameState): string {
  // جمع أدوار المافيا الميتة (ما عدا OLDER_BROTHER نفسه)
  const deadMafiaRoles = state.players
    .filter(p => !p.isAlive && p.role && isMafiaRole(p.role as Role) && p.role !== Role.OLDER_BROTHER)
    .map(p => p.role as string);

  // بحث حسب الأولوية
  for (const role of TRANSFORM_INHERITANCE_ORDER) {
    if (deadMafiaRoles.includes(role)) {
      console.log(`👥 Transform role resolved: ${role} (from dead mafia)`);
      return role;
    }
  }

  // إذا لم يُوجد مافيا ميت آخر (الأخ الأكبر أول من مات) → مافيا عادي
  console.log(`👥 Transform role resolved: MAFIA_REGULAR (no other dead mafia found)`);
  return Role.MAFIA_REGULAR;
}

// ══════════════════════════════════════════════════════
// 💀 تطبيق الانتحار — الأخ الأكبر يموت
// ══════════════════════════════════════════════════════

export function applySuicide(state: GameState, result: TwinBondResult): MorningEvent | null {
  if (!state.twinState || !result.suicidePhysicalId) return null;

  const olderPlayer = state.players.find(p => p.physicalId === result.suicidePhysicalId);
  if (!olderPlayer || !olderPlayer.isAlive) return null;

  // إقصاء الأخ الأكبر
  olderPlayer.isAlive = false;
  state.twinState.suicideTriggered = true;
  state.twinState.olderAlive = false;

  // تسجيل في performanceTracking
  if (!state.performanceTracking) {
    state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  }
  state.performanceTracking.eliminationLog.push({
    physicalId: olderPlayer.physicalId,
    eliminatedBy: 'TWIN_SUICIDE',
    round: state.round || 1,
    team: 'MAFIA',
  });

  console.log(`💀 Twin Suicide: Older Brother #${olderPlayer.physicalId} (${olderPlayer.name}) committed suicide after younger brother's death`);

  return {
    type: 'TWIN_SUICIDE',
    targetPhysicalId: olderPlayer.physicalId,
    targetName: olderPlayer.name,
    extra: {
      role: olderPlayer.role,
      roleName: ROLE_NAMES_AR[olderPlayer.role as keyof typeof ROLE_NAMES_AR] || olderPlayer.role,
      reason: 'ارتباط الدم — انتحر بعد موت أخيه الأصغر',
    },
    revealed: false,
  };
}

// ══════════════════════════════════════════════════════
// 🌑 تطبيق التحول — الأخ الأصغر يتحول إلى مافيا
// ══════════════════════════════════════════════════════

export function applyTransform(state: GameState, result: TwinBondResult): MorningEvent | null {
  if (!state.twinState || !result.transformPhysicalId || !result.newRole) return null;

  const youngerPlayer = state.players.find(p => p.physicalId === result.transformPhysicalId);
  if (!youngerPlayer || !youngerPlayer.isAlive) return null;

  const oldRole = youngerPlayer.role;

  // تحويل الدور والفريق
  youngerPlayer.role = result.newRole as any;
  state.twinState.transformed = true;
  state.twinState.transformedToRole = result.newRole;

  const newRoleName = ROLE_NAMES_AR[result.newRole as keyof typeof ROLE_NAMES_AR] || result.newRole;

  console.log(`🌑 Twin Transform: Younger Brother #${youngerPlayer.physicalId} (${youngerPlayer.name}) transformed from ${oldRole} → ${result.newRole} (${newRoleName})`);

  return {
    type: 'TWIN_TRANSFORM',
    targetPhysicalId: youngerPlayer.physicalId,
    targetName: youngerPlayer.name,
    extra: {
      previousRole: oldRole,
      newRole: result.newRole,
      newRoleName,
      reason: 'الصحوة المظلمة — تحوّل إلى فريق المافيا بعد موت أخيه الأكبر',
    },
    revealed: false,
  };
}

// ══════════════════════════════════════════════════════
// 🔔 إشعار فريق المافيا بالعضو الجديد
// ══════════════════════════════════════════════════════

export function getTwinTransformNotification(state: GameState): {
  transformedPhysicalId: number;
  transformedName: string;
  newRole: string;
  newRoleName: string;
} | null {
  if (!state.twinState || !state.twinState.transformed) return null;

  const youngerPlayer = state.players.find(p => p.physicalId === state.twinState!.youngerBrotherPhysicalId);
  if (!youngerPlayer || !youngerPlayer.isAlive) return null;

  const newRole = state.twinState.transformedToRole || Role.MAFIA_REGULAR;
  return {
    transformedPhysicalId: youngerPlayer.physicalId,
    transformedName: youngerPlayer.name,
    newRole,
    newRoleName: ROLE_NAMES_AR[newRole as keyof typeof ROLE_NAMES_AR] || newRole,
  };
}
