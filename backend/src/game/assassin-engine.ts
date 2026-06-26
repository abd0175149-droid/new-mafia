// ══════════════════════════════════════════════════════
// 🔪 محرك السفّاح — Assassin Contract Engine v2
// يدير: توليد العقود الذكية، التحقق من الإنجاز (بدون ترتيب)، شرط الفوز
// التحديثات الذكية عند خروج الأهداف
// ══════════════════════════════════════════════════════

import type { GameState, AssassinContract, AssassinState } from './state.js';
import { ROLE_NAMES_AR, SPECIAL_ROLES } from './state.js';

// ══════════════════════════════════════════════════════
// 🧠 توليد عقود الاغتيال — كل كارد له دور مميز
// ══════════════════════════════════════════════════════

/**
 * تولد عقود اغتيال عشوائية من الأدوار المميزة الموجودة في اللعبة.
 * - تجمع كل الأدوار المميزة الحية (ليس CITIZEN أو MAFIA_REGULAR أو ASSASSIN)
 * - تخلطها عشوائياً
 * - تختار العدد المطلوب
 * - إذا الأدوار أقل من المطلوب → تكرر عشوائياً
 */
export function generateContracts(state: GameState, totalRequired: number): AssassinContract[] {
  const alive = state.players.filter(p => p.isAlive && p.role !== 'ASSASSIN');

  // جمع الأدوار المميزة الموجودة فعلاً في اللعبة
  const availableRoles: string[] = [];
  for (const player of alive) {
    const role = player.role as string;
    if (role && SPECIAL_ROLES.includes(role) && !availableRoles.includes(role)) {
      availableRoles.push(role);
    }
  }

  // خلط عشوائي (Fisher-Yates)
  for (let i = availableRoles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableRoles[i], availableRoles[j]] = [availableRoles[j], availableRoles[i]];
  }

  const contracts: AssassinContract[] = [];

  for (let i = 0; i < totalRequired; i++) {
    // إذا استنفدنا الأدوار → نكرر من البداية (بخلط جديد)
    const roleIndex = i % availableRoles.length;
    if (i > 0 && roleIndex === 0 && availableRoles.length > 1) {
      // إعادة خلط عند التكرار
      for (let k = availableRoles.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [availableRoles[k], availableRoles[j]] = [availableRoles[j], availableRoles[k]];
      }
    }

    const targetRole = availableRoles[roleIndex];
    const roleName = ROLE_NAMES_AR[targetRole] || targetRole;

    contracts.push({
      id: i + 1,
      type: 'KILL_ROLE',
      targetRole,
      descriptionAr: `🔪 اغتل ${roleName}`,
      description: `🔪 اغتل ${roleName}`,
      completed: false,
    });
  }

  return contracts;
}

// ══════════════════════════════════════════════════════
// ✅ التحقق من إنجاز أي عقد (بدون ترتيب!)
// ══════════════════════════════════════════════════════

/**
 * يفحص هل الهدف المقتول يطابق أي عقد غير مكتمل.
 * ✅ أولوية السفّاح: يُحتسب إنجاز العقد حتى لو استهدف القناص و/أو اغتيال المافيا نفس اللاعب.
 *    (المعامل `_killedByMafiaToo` بقي للتوافق مع النداءات القديمة لكنه لم يعد يُلغي الإنجاز.)
 * 🆕 v2: يبحث في كل العقود — مش بس الحالي (بدون ترتيب)
 */
export function checkContractCompletion(
  state: GameState,
  killedPhysicalId: number,
  _killedByMafiaToo: boolean = false,
): { completed: boolean; contractId: number; contractIndex: number } {
  if (!state.assassinState) return { completed: false, contractId: -1, contractIndex: -1 };

  const target = state.players.find(p => p.physicalId === killedPhysicalId);
  if (!target) return { completed: false, contractId: -1, contractIndex: -1 };

  // 🆕 البحث في كل العقود غير المكتملة (بدون ترتيب)
  for (let i = 0; i < state.assassinState.contracts.length; i++) {
    const contract = state.assassinState.contracts[i];
    if (contract.completed) continue;

    // فحص: هل دور الهدف يطابق الدور المطلوب في العقد؟
    if ((target.role as string) === contract.targetRole) {
      return { completed: true, contractId: contract.id, contractIndex: i };
    }
  }

  return { completed: false, contractId: -1, contractIndex: -1 };
}

// ══════════════════════════════════════════════════════
// ⏭️ إكمال عقد محدد بعد الإنجاز
// ══════════════════════════════════════════════════════

/**
 * 🆕 v2: يكمل عقد بأي index (مش بس الحالي)
 */
export function completeContract(state: GameState, contractIndex: number, round: number): void {
  if (!state.assassinState) return;
  const contract = state.assassinState.contracts[contractIndex];
  if (!contract || contract.completed) return;

  contract.completed = true;
  contract.completedAtRound = round;
  state.assassinState.completedCount++;
  state.assassinState.lastKillRound = round;

  console.log(`🔪 Contract #${contract.id} completed: ${contract.targetRole} (round ${round})`);
}

// ══════════════════════════════════════════════════════
// ⏭️ تقدم العقد (legacy — للتوافق مع الكود القديم)
// ══════════════════════════════════════════════════════

export function advanceContract(state: GameState, round: number): void {
  if (!state.assassinState) return;
  // 🆕 v2: نبحث عن أول عقد غير مكتمل ونكمله
  const idx = state.assassinState.contracts.findIndex(c => !c.completed);
  if (idx === -1) return;
  completeContract(state, idx, round);
}

// ══════════════════════════════════════════════════════
// 🔄 تحديث العقود الذكي — عند خروج لاعب
// ══════════════════════════════════════════════════════

/**
 * 🆕 عند خروج لاعب (بأي طريقة — تصويت/قنص/مافيا):
 * يفحص هل فيه عقد معلّق يستهدف دوره.
 * إذا نعم → يُستبدل العقد بدور حي آخر.
 * يرجع true إذا تم تعديل العقود (يحتاج إشعار).
 */
export function regenerateDeadContracts(state: GameState): {
  changed: boolean;
  updatedContracts: AssassinContract[];
  changeLog: string[];
} {
  if (!state.assassinState) return { changed: false, updatedContracts: [], changeLog: [] };

  const alive = state.players.filter(p => p.isAlive && p.role !== 'ASSASSIN');
  const changeLog: string[] = [];
  let changed = false;

  for (let i = 0; i < state.assassinState.contracts.length; i++) {
    const contract = state.assassinState.contracts[i];
    if (contract.completed) continue;

    // هل الدور المطلوب لا يزال حياً؟
    const targetAlive = alive.some(p => (p.role as string) === contract.targetRole);
    if (targetAlive) continue;

    // الدور خرج من اللعبة → نختار بديل
    const completedRoles = state.assassinState.contracts
      .filter(c => c.completed)
      .map(c => c.targetRole);

    // الأدوار المتاحة: مميزة + حية + لم تُنجز + ليست نفس العقد الحالي
    const pendingRoles = state.assassinState.contracts
      .filter(c => !c.completed && c.id !== contract.id)
      .map(c => c.targetRole);

    const availableRoles = alive
      .map(p => p.role as string)
      .filter(role =>
        SPECIAL_ROLES.includes(role) &&
        !completedRoles.includes(role) &&
        !pendingRoles.includes(role)
      );

    if (availableRoles.length > 0) {
      const picked = availableRoles[Math.floor(Math.random() * availableRoles.length)];
      const roleName = ROLE_NAMES_AR[picked] || picked;
      const oldDesc = contract.descriptionAr || contract.description;

      contract.targetRole = picked;
      contract.descriptionAr = `🔪 اغتل ${roleName}`;
      contract.description = `🔪 اغتل ${roleName}`;

      changeLog.push(`العقد #${contract.id}: ${oldDesc} → ${contract.descriptionAr}`);
      changed = true;
    } else {
      // كل الأدوار المميزة مستخدمة → نختار أي دور حي
      const anyAlive = alive.filter(p => p.role && SPECIAL_ROLES.includes(p.role as string));
      if (anyAlive.length > 0) {
        const picked = anyAlive[Math.floor(Math.random() * anyAlive.length)].role as string;
        const roleName = ROLE_NAMES_AR[picked] || picked;
        const oldDesc = contract.descriptionAr || contract.description;

        contract.targetRole = picked;
        contract.descriptionAr = `🔪 اغتل ${roleName}`;
        contract.description = `🔪 اغتل ${roleName}`;

        changeLog.push(`العقد #${contract.id}: ${oldDesc} → ${contract.descriptionAr} (تكرار)`);
        changed = true;
      }
      // إذا ما فيه أحد أصلاً → العقد يبقى (حالة نادرة)
    }
  }

  return {
    changed,
    updatedContracts: state.assassinState.contracts,
    changeLog,
  };
}

// ══════════════════════════════════════════════════════
// 🎯 تقييم قتل السفّاح الكامل (Auto Mode)
// ══════════════════════════════════════════════════════

/**
 * 🆕 يُستدعى بعد resolveNight لتقييم قتل السفّاح:
 * - يقتل الهدف
 * - يفحص هل يطابق أي عقد
 * - يكمل العقد إذا تطابق
 * - يفحص شرط الفوز
 */
export function evaluateAssassinKill(
  state: GameState,
  targetPhysicalId: number,
): { contractCompleted: boolean; contractId: number; won: boolean } {
  if (!state.assassinState) return { contractCompleted: false, contractId: -1, won: false };

  // هل المافيا قتلت نفس الهدف؟
  const killedByMafia = state.nightActions?.godfatherTarget === targetPhysicalId;

  const result = checkContractCompletion(state, targetPhysicalId, killedByMafia);

  if (result.completed) {
    completeContract(state, result.contractIndex, state.round || 1);

    if (checkAssassinWin(state)) {
      state.assassinState!.won = true;
      return { contractCompleted: true, contractId: result.contractId, won: true };
    }

    return { contractCompleted: true, contractId: result.contractId, won: false };
  }

  return { contractCompleted: false, contractId: -1, won: false };
}

// ══════════════════════════════════════════════════════
// 🏆 فحص شرط الفوز
// ══════════════════════════════════════════════════════

export function checkAssassinWin(state: GameState): boolean {
  if (!state.assassinState) return false;
  return state.assassinState.completedCount >= state.assassinState.totalRequired;
}

// ══════════════════════════════════════════════════════
// 🌙 هل يقدر يقتل هذه الليلة
// ══════════════════════════════════════════════════════

export function canAssassinateTonight(state: GameState): boolean {
  if (!state.assassinState) return false;
  if (!state.assassinState.firstNightPassed) return false; // أول ليلة ممنوع
  if (state.assassinState.won) return false; // أكمل العقود
  return true;
}

// ══════════════════════════════════════════════════════
// 🎬 تهيئة حالة السفّاح عند بداية اللعبة
// ══════════════════════════════════════════════════════

export function initAssassinState(state: GameState): AssassinState | null {
  const assassin = state.players.find(p => p.role === 'ASSASSIN' && p.isAlive);
  if (!assassin) return null;

  const totalRequired = state.config.assassinContractCount || 4;
  const contracts = generateContracts(state, totalRequired);

  return {
    assassinPhysicalId: assassin.physicalId,
    contracts,
    currentContractIndex: 0, // legacy — v2 لا يستخدمه
    completedCount: 0,
    totalRequired,
    firstNightPassed: false,
    lastKillRound: null,
    won: false,
  };
}
