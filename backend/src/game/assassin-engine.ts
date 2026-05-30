// ══════════════════════════════════════════════════════
// 🔪 محرك السفّاح — Assassin Contract Engine
// يدير: توليد العقود الذكية، التحقق من الإنجاز، شرط الفوز
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
      description: `🔪 اغتل ${roleName}`,
      completed: false,
    });
  }

  return contracts;
}

// ══════════════════════════════════════════════════════
// ✅ التحقق من إنجاز العقد الحالي
// ══════════════════════════════════════════════════════

/**
 * يفحص هل الهدف المقتول يطابق الدور المطلوب في العقد الحالي.
 * ⚠️ إذا المافيا قتلت نفس الهدف → لا يُحسب كإنجاز!
 */
export function checkContractCompletion(
  state: GameState,
  killedPhysicalId: number,
  killedByMafiaToo: boolean,
): { completed: boolean; contractId: number } {
  if (!state.assassinState) return { completed: false, contractId: -1 };
  if (killedByMafiaToo) return { completed: false, contractId: -1 };

  const currentIdx = state.assassinState.currentContractIndex;
  const contract = state.assassinState.contracts[currentIdx];
  if (!contract || contract.completed) return { completed: false, contractId: -1 };

  const target = state.players.find(p => p.physicalId === killedPhysicalId);
  if (!target) return { completed: false, contractId: -1 };

  // فحص: هل دور الهدف يطابق الدور المطلوب في العقد؟
  const matches = (target.role as string) === contract.targetRole;

  return { completed: matches, contractId: contract.id };
}

// ══════════════════════════════════════════════════════
// ⏭️ تقدم العقد بعد الإنجاز
// ══════════════════════════════════════════════════════

export function advanceContract(state: GameState, round: number): void {
  if (!state.assassinState) return;
  const idx = state.assassinState.currentContractIndex;
  const contract = state.assassinState.contracts[idx];
  if (!contract) return;

  contract.completed = true;
  contract.completedAtRound = round;
  state.assassinState.completedCount++;
  state.assassinState.lastKillRound = round;

  // التقدم للعقد التالي
  if (state.assassinState.currentContractIndex < state.assassinState.contracts.length - 1) {
    state.assassinState.currentContractIndex++;

    // ⚡ إعادة توليد العقد القادم بناءً على الأحياء الحاليين
    regenerateNextContract(state);
  }
}

// ══════════════════════════════════════════════════════
// 🔄 إعادة توليد العقد التالي بناءً على الوضع الحالي
// ══════════════════════════════════════════════════════

function regenerateNextContract(state: GameState): void {
  if (!state.assassinState) return;
  const idx = state.assassinState.currentContractIndex;

  // جمع الأدوار المميزة الحية (ليست مكتملة بالفعل)
  const alive = state.players.filter(p => p.isAlive && p.role !== 'ASSASSIN');
  const completedRoles = state.assassinState.contracts
    .filter(c => c.completed)
    .map(c => c.targetRole);

  // أدوار مميزة حية ولم تُنجز بعد
  const availableRoles = alive
    .map(p => p.role as string)
    .filter(role => SPECIAL_ROLES.includes(role) && !completedRoles.includes(role));

  if (availableRoles.length > 0) {
    // اختيار عشوائي من المتاح
    const picked = availableRoles[Math.floor(Math.random() * availableRoles.length)];
    const roleName = ROLE_NAMES_AR[picked] || picked;

    state.assassinState.contracts[idx] = {
      id: idx + 1,
      type: 'KILL_ROLE',
      targetRole: picked,
      description: `🔪 اغتل ${roleName}`,
      completed: false,
    };
  } else {
    // كل الأدوار المميزة ماتت → اختر أي دور حي عشوائي
    const anyAlive = alive.filter(p => p.role && SPECIAL_ROLES.includes(p.role as string));
    if (anyAlive.length > 0) {
      const picked = anyAlive[Math.floor(Math.random() * anyAlive.length)].role as string;
      const roleName = ROLE_NAMES_AR[picked] || picked;
      state.assassinState.contracts[idx] = {
        id: idx + 1,
        type: 'KILL_ROLE',
        targetRole: picked,
        description: `🔪 اغتل ${roleName}`,
        completed: false,
      };
    }
  }
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
    currentContractIndex: 0,
    completedCount: 0,
    totalRequired,
    firstNightPassed: false,
    lastKillRound: null,
    won: false,
  };
}
