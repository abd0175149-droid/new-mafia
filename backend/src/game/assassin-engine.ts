// ══════════════════════════════════════════════════════
// 🔪 محرك السفّاح — Assassin Contract Engine v2
// يدير: توليد العقود الذكية، التحقق من الإنجاز (بدون ترتيب)، شرط الفوز
// التحديثات الذكية عند خروج الأهداف
// ══════════════════════════════════════════════════════

import type { GameState, AssassinContract, AssassinState } from './state.js';
import { ROLE_NAMES_AR, SPECIAL_ROLES } from './state.js';

// ══════════════════════════════════════════════════════
// 🔪🔪 أكثرُ من سفّاح — الحالةُ بالمقعد لا بالدور
//
// لعبةٌ بسفّاحٍ واحد لا يتغيّر فيها شيء: حالتُه في `state.assassinState`.
// حين يتعدّدون يختار الليدر النمط قبل التوزيع (قرار المالك 2026-11-06):
//   • متنافسون (RIVALS): لكلٍّ عقودُه — الأوّلُ في `assassinState` والباقون في
//     `assassinRivals`. قتلُ أحدهم يُحتسب لعقوده هو، وأوّلُ مَن يُكملها يفوز وحده.
//   • شركاء (PARTNERS): حالةٌ واحدة بكلّ مقاعدهم في `memberSeats` — عقودٌ مشتركة
//     يُكملها قتلُ أيٍّ منهم، ويفوزون معاً.
// 🔴 كلُّ قراءةٍ تخصّ سفّاحاً بعينه تمرّ من `assassinStateFor(state, seat)`. القراءةُ
//    من `state.assassinState` مباشرةً كانت تُعطي عقودَ الأوّل لكلّ سفّاح.
// ══════════════════════════════════════════════════════

/** مقاعدُ مَن يملك هذه العقود. */
export function assassinSeatsOf(a: AssassinState): number[] {
  return a.memberSeats && a.memberSeats.length ? a.memberSeats : [a.assassinPhysicalId];
}

/** كلُّ حالات السفّاحين في اللعبة — الأوّلُ ثمّ المتنافسون. */
export function allAssassinStates(state: GameState): AssassinState[] {
  return [state.assassinState, ...(state.assassinRivals || [])].filter(Boolean) as AssassinState[];
}

/** حالةُ السفّاح الجالس في هذا المقعد — أو null. */
export function assassinStateFor(state: GameState, seat: number | null | undefined): AssassinState | null {
  if (seat == null) return null;
  return allAssassinStates(state).find(a => assassinSeatsOf(a).includes(seat)) ?? null;
}

/** حمولةُ العقود كما يقرؤها هاتفُ السفّاح. */
export function assassinContractsPayload(a: AssassinState, extra?: Record<string, unknown>) {
  return {
    contracts: a.contracts,
    currentIndex: a.currentContractIndex || 0,
    completedCount: a.completedCount,
    totalRequired: a.totalRequired,
    ...(a.memberSeats && a.memberSeats.length > 1 ? { partnerSeats: a.memberSeats } : {}),
    ...(extra || {}),
  };
}

/** كلُّ مقعدِ سفّاحٍ مع حالته — لإرسال العقود لكلٍّ منهم. */
export function assassinRecipients(state: GameState): Array<{ seat: number; state: AssassinState }> {
  const out: Array<{ seat: number; state: AssassinState }> = [];
  for (const a of allAssassinStates(state)) for (const seat of assassinSeatsOf(a)) out.push({ seat, state: a });
  return out;
}

/** مضى أوّلُ ليل — يسري على كلّ السفّاحين. */
export function markAssassinFirstNightPassed(state: GameState): void {
  for (const a of allAssassinStates(state)) a.firstNightPassed = true;
}

/** هل أكمل أيُّ سفّاحٍ عقودَه؟ */
export function anyAssassinWon(state: GameState): boolean {
  return allAssassinStates(state).some(a => a.won);
}

/** مقاعدُ السفّاحين الفائزين — الشركاءُ كلُّهم، والمتنافسُ صاحبُ العقود وحده. */
export function assassinWinnerSeats(state: GameState): number[] {
  return allAssassinStates(state).filter(a => a.won).flatMap(assassinSeatsOf);
}

/** هل يقتل سفّاحُ هذا المقعد الليلة؟ (ممنوعٌ أوّلَ ليلة، ومَن أكمل عقودَه لا يقتل) */
export function canSeatAssassinate(state: GameState, seat: number): boolean {
  const a = assassinStateFor(state, seat);
  if (!a) return false;
  return !!a.firstNightPassed && !a.won;
}

/** الحالةُ المقصودة: سفّاحُ المقعد إن عُرف، وإلّا الأوّل (مسارٌ قديم بسفّاحٍ واحد). */
const pick = (state: GameState, seat?: number | null): AssassinState | null =>
  seat != null ? assassinStateFor(state, seat) : (state.assassinState ?? null);

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
  performerSeat?: number | null,
): { completed: boolean; contractId: number; contractIndex: number } {
  const a = pick(state, performerSeat);
  if (!a) return { completed: false, contractId: -1, contractIndex: -1 };

  const target = state.players.find(p => p.physicalId === killedPhysicalId);
  if (!target) return { completed: false, contractId: -1, contractIndex: -1 };

  // 🆕 البحث في كل العقود غير المكتملة (بدون ترتيب)
  for (let i = 0; i < a.contracts.length; i++) {
    const contract = a.contracts[i];
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
export function completeContract(state: GameState, contractIndex: number, round: number, performerSeat?: number | null): void {
  const a = pick(state, performerSeat);
  if (!a) return;
  const contract = a.contracts[contractIndex];
  if (!contract || contract.completed) return;

  contract.completed = true;
  contract.completedAtRound = round;
  a.completedCount++;
  a.lastKillRound = round;

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
  /** 🔪🔪 حالاتُ السفّاحين التي تغيّرت عقودُها — يُرسَل لكلٍّ منها هاتفُه. */
  changedStates: AssassinState[];
} {
  const states = allAssassinStates(state);
  if (states.length === 0) return { changed: false, updatedContracts: [], changeLog: [], changedStates: [] };

  const changedStates: AssassinState[] = [];
  const changeLog: string[] = [];
  for (const a of states) {
    const r = regenerateOne(state, a);
    if (r.changed) { changedStates.push(a); changeLog.push(...r.changeLog); }
  }
  return {
    changed: changedStates.length > 0,
    updatedContracts: state.assassinState?.contracts || [],
    changeLog,
    changedStates,
  };
}

function regenerateOne(state: GameState, a: AssassinState): { changed: boolean; changeLog: string[] } {
  const alive = state.players.filter(p => p.isAlive && p.role !== 'ASSASSIN');
  const changeLog: string[] = [];
  let changed = false;

  for (let i = 0; i < a.contracts.length; i++) {
    const contract = a.contracts[i];
    if (contract.completed) continue;

    // هل الدور المطلوب لا يزال حياً؟
    const targetAlive = alive.some(p => (p.role as string) === contract.targetRole);
    if (targetAlive) continue;

    // الدور خرج من اللعبة → نختار بديل
    const completedRoles = a.contracts
      .filter(c => c.completed)
      .map(c => c.targetRole);

    // الأدوار المتاحة: مميزة + حية + لم تُنجز + ليست نفس العقد الحالي
    const pendingRoles = a.contracts
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

  return { changed, changeLog };
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
  performerSeat?: number | null,
): { contractCompleted: boolean; contractId: number; won: boolean } {
  const a = pick(state, performerSeat);
  if (!a) return { contractCompleted: false, contractId: -1, won: false };

  // هل المافيا قتلت نفس الهدف؟
  const killedByMafia = state.nightActions?.godfatherTarget === targetPhysicalId;

  const result = checkContractCompletion(state, targetPhysicalId, killedByMafia, performerSeat);

  if (result.completed) {
    completeContract(state, result.contractIndex, state.round || 1, performerSeat);

    if (checkAssassinWin(state, performerSeat)) {
      a.won = true;
      return { contractCompleted: true, contractId: result.contractId, won: true };
    }

    return { contractCompleted: true, contractId: result.contractId, won: false };
  }

  return { contractCompleted: false, contractId: -1, won: false };
}

// ══════════════════════════════════════════════════════
// 🏆 فحص شرط الفوز
// ══════════════════════════════════════════════════════

export function checkAssassinWin(state: GameState, performerSeat?: number | null): boolean {
  const a = pick(state, performerSeat);
  if (!a) return false;
  return a.completedCount >= a.totalRequired;
}

// ══════════════════════════════════════════════════════
// 🌙 هل يقدر يقتل هذه الليلة
// ══════════════════════════════════════════════════════

export function canAssassinateTonight(state: GameState, seat?: number | null): boolean {
  if (seat != null) return canSeatAssassinate(state, seat);
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
  return freshAssassinState(state, assassin.physicalId);
}

/**
 * 🔪🔪 تهيئةُ كلّ السفّاحين بنمط الليدر — تكتب `assassinState` و`assassinRivals` معاً.
 * سفّاحٌ واحد ⇒ كما كان تماماً. يُرجع كلَّ الحالات (فارغةً إن لا سفّاح).
 */
export function initAssassinStates(state: GameState): AssassinState[] {
  const seats = state.players
    .filter(p => p.role === 'ASSASSIN' && p.isAlive)
    .map(p => p.physicalId)
    .sort((x, y) => x - y);
  state.assassinRivals = null;
  if (seats.length === 0) { state.assassinState = null; return []; }
  if (seats.length === 1) { state.assassinState = freshAssassinState(state, seats[0]); return [state.assassinState]; }

  if ((state.config.assassinMode || 'RIVALS') === 'PARTNERS') {
    state.assassinState = { ...freshAssassinState(state, seats[0]), memberSeats: seats };
    return [state.assassinState];
  }
  const all = seats.map(seat => freshAssassinState(state, seat));
  state.assassinState = all[0];
  state.assassinRivals = all.slice(1);
  return all;
}

function freshAssassinState(state: GameState, seat: number): AssassinState {
  const totalRequired = state.config.assassinContractCount || 4;
  const contracts = generateContracts(state, totalRequired);

  return {
    assassinPhysicalId: seat,
    contracts,
    currentContractIndex: 0, // legacy — v2 لا يستخدمه
    completedCount: 0,
    totalRequired,
    firstNightPassed: false,
    lastKillRound: null,
    won: false,
  };
}
