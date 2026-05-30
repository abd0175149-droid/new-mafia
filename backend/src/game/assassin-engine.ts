// ══════════════════════════════════════════════════════
// 🔪 محرك السفّاح — Assassin Contract Engine
// يدير: توليد العقود الذكية، التحقق من الإنجاز، شرط الفوز
// ══════════════════════════════════════════════════════

import type { GameState, Player, AssassinContract, AssassinContractType, AssassinState } from './state.js';
import { isMafiaRole, isCitizenRole } from './roles.js';

// ── الأدوار التي تملك قدرات ليلية (لعقد KILL_ABILITY) ──
const ABILITY_ROLES = ['SHERIFF', 'DOCTOR', 'SNIPER', 'NURSE', 'GODFATHER', 'SILENCER'];

// ── الأدوار حسب الفريق (لعقود KILL_TEAM) ──
const MAFIA_ROLE_IDS = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];
const CITIZEN_ROLE_IDS = ['SHERIFF', 'DOCTOR', 'SNIPER', 'POLICEWOMAN', 'NURSE', 'CITIZEN'];

// ══════════════════════════════════════════════════════
// 🧠 الخوارزمية الذكية لتوليد العقود
// ══════════════════════════════════════════════════════

/**
 * تولد عقود اغتيال بناءً على اللاعبين الأحياء الحاليين.
 * الصعوبة تتصاعد: العقود الأولى أسهل → الأخيرة أصعب.
 * 
 * نظام الأوزان:
 *   KILL_ANY           → وزن 1 (سهل)
 *   KILL_TEAM_CITIZEN  → وزن 1 (سهل — المواطنون كثر)
 *   KILL_TEAM_MAFIA    → وزن 2 (متوسط — المافيا عددهم أقل)
 *   KILL_ABILITY       → وزن 3 (صعب — لاعب بقدرة محددة)
 *   KILL_ADJACENT      → وزن 3 (صعب — لاعب بجانبك)
 *   KILL_SPECIFIC_SEAT → وزن 4 (صعب جداً — رقم مقعد محدد)
 */
export function generateContracts(state: GameState, totalRequired: number): AssassinContract[] {
  const alive = state.players.filter(p => p.isAlive && p.role !== 'ASSASSIN');
  const contracts: AssassinContract[] = [];

  // تجميع العقود المتاحة بناءً على اللاعبين الأحياء
  const pool: { type: AssassinContractType; desc: string; constraint: any; weight: number }[] = [];

  // ── دائماً متاح: اقتل أي لاعب ──
  pool.push({ type: 'KILL_ANY', desc: 'اغتل أي لاعب', constraint: null, weight: 1 });

  // ── مواطنون أحياء ──
  const aliveCitizens = alive.filter(p => CITIZEN_ROLE_IDS.includes(p.role as string));
  if (aliveCitizens.length > 0) {
    pool.push({ type: 'KILL_TEAM_CITIZEN', desc: 'اغتل مواطن', constraint: { team: 'CITIZEN' }, weight: 1 });
  }

  // ── مافيا أحياء ──
  const aliveMafia = alive.filter(p => MAFIA_ROLE_IDS.includes(p.role as string));
  if (aliveMafia.length > 0) {
    pool.push({ type: 'KILL_TEAM_MAFIA', desc: 'اغتل عضو مافيا', constraint: { team: 'MAFIA' }, weight: 2 });
  }

  // ── لاعبون بقدرات ليلية ──
  const aliveWithAbility = alive.filter(p => ABILITY_ROLES.includes(p.role as string));
  if (aliveWithAbility.length > 0) {
    pool.push({ type: 'KILL_ABILITY', desc: 'اغتل لاعب يملك قدرة ليلية', constraint: { hasAbility: true }, weight: 3 });
  }

  // ── لاعبون بجانب السفّاح ──
  const assassin = state.players.find(p => p.role === 'ASSASSIN');
  if (assassin) {
    const sorted = state.players.filter(p => p.isAlive).sort((a, b) => a.physicalId - b.physicalId);
    if (sorted.length > 2) {
      pool.push({ type: 'KILL_ADJACENT', desc: 'اغتل لاعب بجانبك (فوق أو تحت)', constraint: { adjacent: true }, weight: 3 });
    }
  }

  // ── مقعد محدد (عشوائي من الأحياء) ──
  if (alive.length >= 4) {
    const randomTarget = alive[Math.floor(Math.random() * alive.length)];
    pool.push({
      type: 'KILL_SPECIFIC_SEAT',
      desc: `اغتل اللاعب رقم #${randomTarget.physicalId}`,
      constraint: { seatId: randomTarget.physicalId },
      weight: 4,
    });
  }

  // ── ترتيب المسبح حسب الوزن (سهل → صعب) ──
  pool.sort((a, b) => a.weight - b.weight);

  // ── توليد العقود بالتصاعد ──
  for (let i = 0; i < totalRequired; i++) {
    // العقود الأولى سهلة، والأخيرة صعبة
    const progress = totalRequired <= 1 ? 0 : i / (totalRequired - 1); // 0 → 1
    const poolIndex = Math.min(
      Math.floor(progress * pool.length),
      pool.length - 1,
    );
    const selected = pool[poolIndex];

    contracts.push({
      id: i + 1,
      type: selected.type,
      description: selected.desc,
      targetConstraint: selected.constraint,
      completed: false,
    });
  }

  return contracts;
}

// ══════════════════════════════════════════════════════
// ✅ التحقق من إنجاز العقد الحالي
// ══════════════════════════════════════════════════════

/**
 * يفحص هل الهدف المقتول يطابق شروط العقد الحالي.
 * يُستدعى بعد أن ينجح السفّاح في قتل هدف فعلياً.
 * 
 * ⚠️ قاعدة مهمة: إذا المافيا قتلت نفس الهدف → لا يُحسب كإنجاز!
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

  let matches = false;

  switch (contract.type) {
    case 'KILL_ANY':
      matches = true;
      break;

    case 'KILL_TEAM_MAFIA':
      matches = MAFIA_ROLE_IDS.includes(target.role as string);
      break;

    case 'KILL_TEAM_CITIZEN':
      matches = CITIZEN_ROLE_IDS.includes(target.role as string);
      break;

    case 'KILL_ABILITY':
      matches = ABILITY_ROLES.includes(target.role as string);
      break;

    case 'KILL_ADJACENT': {
      const assassin = state.players.find(p => p.role === 'ASSASSIN');
      if (assassin) {
        // قائمة الأحياء مرتبة (بما فيهم الهدف قبل قتله)
        const sorted = state.players
          .filter(p => p.isAlive || p.physicalId === killedPhysicalId)
          .sort((a, b) => a.physicalId - b.physicalId);
        const aIdx = sorted.findIndex(p => p.physicalId === assassin.physicalId);
        const tIdx = sorted.findIndex(p => p.physicalId === killedPhysicalId);
        // بجانبه = مباشرة فوق أو تحت (بما في ذلك circular — أول وآخر)
        matches = Math.abs(aIdx - tIdx) === 1
          || (aIdx === 0 && tIdx === sorted.length - 1)
          || (tIdx === 0 && aIdx === sorted.length - 1);
      }
      break;
    }

    case 'KILL_SPECIFIC_SEAT':
      matches = target.physicalId === contract.targetConstraint?.seatId;
      break;
  }

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
  const remaining = state.assassinState.totalRequired - state.assassinState.completedCount;

  // توليد عقد واحد جديد بناءً على الأحياء
  const tempContracts = generateContracts(state, remaining);
  if (tempContracts.length > 0) {
    // اختيار عقد بصعوبة مناسبة (آخر العقود المولدة = الأصعب)
    const progressRatio = state.assassinState.completedCount / state.assassinState.totalRequired;
    const pickIdx = Math.min(
      Math.floor(progressRatio * tempContracts.length),
      tempContracts.length - 1,
    );
    const newContract = tempContracts[pickIdx];
    newContract.id = idx + 1;
    state.assassinState.contracts[idx] = newContract;
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
  // لا يوجد cooldown — يقتل كل ليلة
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
