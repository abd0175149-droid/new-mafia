// ══════════════════════════════════════════════════════
// 🎲 المحرك الديناميكي للتوليد — Dynamic Role Generator
// يقرأ الأدوار من DB ويوزعها حسب الأولويات والنسب
// ══════════════════════════════════════════════════════

import { getRoleDefs, type RoleDef } from './definition-service.js';

export interface DynamicGeneratedRoles {
  mafiaRoles: string[];      // role IDs
  citizenRoles: string[];
  neutralRoles: string[];
  totalMafia: number;
  totalCitizens: number;
  totalNeutral: number;
}

/**
 * يولّد قائمة الأدوار ديناميكياً بناءً على عدد اللاعبين
 * يقرأ من قاعدة البيانات بدلاً من Enum ثابت
 */
export async function generateRolesDynamic(
  playerCount: number,
  mafiaRatio: number = 4,     // ceil(players / 4) = عدد المافيا
  neutralRatio: number = 0,   // 0 = لا محايدين افتراضياً
): Promise<DynamicGeneratedRoles> {
  if (playerCount < 6) {
    throw new Error('يجب أن يكون عدد اللاعبين 6 على الأقل');
  }

  const allRoles = await getRoleDefs();

  // تصنيف الأدوار حسب الفريق
  const mafiaPool = allRoles
    .filter(r => r.team === 'MAFIA')
    .sort((a, b) => a.genPriority - b.genPriority);

  const citizenPool = allRoles
    .filter(r => r.team === 'CITIZEN')
    .sort((a, b) => a.genPriority - b.genPriority);

  const neutralPool = allRoles
    .filter(r => r.team === 'NEUTRAL')
    .sort((a, b) => a.genPriority - b.genPriority);

  // حساب الأعداد
  const totalMafia = Math.ceil(playerCount / mafiaRatio);
  const totalNeutral = neutralRatio > 0 ? Math.floor(playerCount / neutralRatio) : 0;
  const totalCitizens = playerCount - totalMafia - totalNeutral;

  // توليد أدوار المافيا
  const mafiaRoles = fillRoles(mafiaPool, totalMafia, playerCount);

  // توليد أدوار المواطنين
  const citizenRoles = fillRoles(citizenPool, totalCitizens, playerCount);

  // توليد أدوار المحايدين
  const neutralRoles = fillRoles(neutralPool, totalNeutral, playerCount);

  return {
    mafiaRoles,
    citizenRoles,
    neutralRoles,
    totalMafia,
    totalCitizens,
    totalNeutral,
  };
}

/**
 * يملأ قائمة أدوار فريق حسب الأولوية والقيود
 */
function fillRoles(pool: RoleDef[], count: number, playerCount: number): string[] {
  const result: string[] = [];
  const usedCounts: Record<string, number> = {};

  // المرحلة 1: الأدوار الإجبارية أولاً
  for (const role of pool) {
    if (result.length >= count) break;
    if (role.genIsRequired && playerCount >= role.genMinPlayers) {
      result.push(role.id);
      usedCounts[role.id] = (usedCounts[role.id] || 0) + 1;
    }
  }

  // المرحلة 2: الأدوار الاختيارية حسب الأولوية
  for (const role of pool) {
    if (result.length >= count) break;
    if (usedCounts[role.id]) continue; // أُضيف بالفعل
    if (playerCount < role.genMinPlayers) continue; // لاعبين غير كافيين
    if (role.genPriority >= 99) continue; // أدوار عادية (تُملأ لاحقاً)

    result.push(role.id);
    usedCounts[role.id] = 1;
  }

  // المرحلة 3: ملء الباقي بالدور "العادي" (أعلى أولوية = 99)
  const fillerRole = pool.find(r => r.genPriority >= 99);
  while (result.length < count && fillerRole) {
    result.push(fillerRole.id);
  }

  return result;
}
