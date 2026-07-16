// ══════════════════════════════════════════════════════
// 🎩 محرّك العمدة — Mayor Engine
// مواطن يملك «نفوذاً» يُستخدم مرّة واحدة: بعد فرز التصويت وقبل تطبيق أيّ أثر،
// يكشف نفسه ويُلغي نتيجة الإعدام ثم يختار: إعادة تصويت بين الأعلى اثنين، أو
// تأجيلاً (لا موت اليوم). بعد الكشف صوته ×2 (فوريّاً — قرار المالك ②)،
// وتعطيل الساحرة يجمّده ×1 مؤقّتاً (قرار ⑥).
//
// القرارات المقفلة (2026-07-16):
// ① يجوز إلغاء إعدام نفسه ② ×2 يسري فوراً من إعادة التصويت نفسها
// ③ التأجيل = ليلة الآن ونهارٌ جديد طبيعيّ غداً ④ الفيتو يشمل الصفقات
// ⑤ الإسكات لا يمنع الفيتو ⑥ تعطيل الساحرة يجمّد ×2 ولا يمسّ الفيتو
// ⑦ النافذة لفائزٍ واحد فقط (التعادل بمساره) ⑧ يبقى ضمن عقود السفّاح
// ══════════════════════════════════════════════════════

import type { GameState, Candidate } from './state.js';
import { Role } from './roles.js';

export type MayorDecision = 'REVOTE' | 'POSTPONE';

export interface MayorWindow {
  winner: Candidate;          // المرشّح الذي كان سيُعدم (لقطة)
  top2: Candidate[];          // أعلى مرشَّحَين بالأصوات (لقطة — لإعادة التصويت)
  topVotes: number;
  openedAtRound: number;
}

export interface MayorState {
  mayorPhysicalId: number;
  revealed: boolean;                 // كُشف للجميع (يفعّل ×2)
  vetoUsed: boolean;                 // القدرة أُحرقت
  decision: MayorDecision | null;
  revealedAtRound: number | null;
  window?: MayorWindow | null;       // نافذة قرارٍ مفتوحة حاليّاً (سرّية — ليدر + العمدة فقط)
}

// ── تهيئة عند اعتماد الأدوار (نمط initTwinState — يُعاد حسابها كلّ لعبة) ──
export function initMayorState(state: GameState): MayorState | null {
  const mayor = state.players.find(p => p.role === Role.MAYOR);
  if (!mayor) return null;
  return {
    mayorPhysicalId: mayor.physicalId,
    revealed: false,
    vetoUsed: false,
    decision: null,
    revealedAtRound: null,
    window: null,
  };
}

// ── هل يحقّ فتح نافذة العمدة الآن؟ (حيّ + القدرة متاحة) ──
// الإسكات لا يمنع (قرار ⑤)، وتعطيل الساحرة لا يمسّ الفيتو (قرار ⑥).
export function isMayorEligible(state: GameState): boolean {
  const ms = state.mayorState;
  if (!ms || ms.vetoUsed) return false;
  const p = state.players.find(pl => pl.physicalId === ms.mayorPhysicalId);
  return !!p && p.isAlive && !p.penaltyKicked;
}

// ── وزن الصوت المعتمَد للعمدة بعد الكشف — يحدّده الليدر في شاشة الأدوار (نمط عقود السفّاح) ──
export function configuredMayorWeight(state: GameState): number {
  const w = state.config?.mayorVoteWeight ?? 2;
  return Math.min(4, Math.max(1, Math.round(w)));
}

// ── وزن صوت لاعبٍ (وزن الليدر للعمدة المكشوف غير المجمَّد، وإلا 1) ──
// قرار ⑥: تعطيل الساحرة النشط يجمّد المضاعفة (disabledUntilRound شامل للجولة الأخيرة).
export function mayorVoteWeight(state: GameState, voterPhysicalId: number): number {
  const ms = state.mayorState;
  if (!ms || !ms.revealed || ms.mayorPhysicalId !== voterPhysicalId) return 1;
  const p = state.players.find(pl => pl.physicalId === voterPhysicalId);
  if (!p || !p.isAlive) return 1;
  if (p.disabledUntilRound !== undefined && state.round <= p.disabledUntilRound) return 1;
  return configuredMayorWeight(state);
}

// ── فتح النافذة: لقطة الفائز وأعلى اثنين (تُستدعى قبل resolveVoting حصراً) ──
export function openMayorWindow(state: GameState, winner: Candidate, topVotes: number): MayorWindow {
  const sorted = [...state.votingState.candidates].sort((a, b) => b.votes - a.votes);
  const top2 = sorted.slice(0, 2);
  const window: MayorWindow = {
    winner,
    top2,
    topVotes,
    openedAtRound: state.round,
  };
  state.mayorState!.window = window;
  return window;
}

// ── تطبيق الفيتو: كشفٌ دائم + حرق القدرة (النافذة تُغلق) ──
export function applyMayorVeto(state: GameState, decision: MayorDecision): void {
  const ms = state.mayorState!;
  ms.revealed = true;           // ×2 يسري فوراً (قرار ②)
  ms.vetoUsed = true;
  ms.decision = decision;
  ms.revealedAtRound = state.round;
  ms.window = null;
}

// ── إغلاق النافذة بلا تدخّل (تمرير) ──
export function closeMayorWindow(state: GameState): void {
  if (state.mayorState) state.mayorState.window = null;
}

// ── إعادة بناء التصويت بأمر العمدة: تصويت جديد كامل على **كلّ الأحياء** ──
// (قرار المالك المعدَّل 2026-07-16: لا حصر بالأعلى اثنين). الصفقات القائمة تبقى مرشّحين
// وتُخفي أهدافها كالمعتاد. علم mayorRevote على votingState يعرّف الواجهات بهويّة الجولة
// ويزول تلقائيّاً مع أيّ تصويتٍ لاحق (initVoting يبني votingState جديدة).
export function rebuildVotingForMayorRevote(state: GameState): void {
  const alive = state.players.filter(p => p.isAlive && !p.penaltyKicked);
  const deals = state.votingState.deals || [];
  const dealTargets = deals.map(d => d.targetPhysicalId);

  const dealCandidates: Candidate[] = deals.map(d => ({
    type: 'DEAL' as any,
    id: d.id,
    initiatorPhysicalId: d.initiatorPhysicalId,
    targetPhysicalId: d.targetPhysicalId,
    votes: 0,
  })) as any;
  const playerCandidates: Candidate[] = alive
    .filter(p => !dealTargets.includes(p.physicalId))
    .map(p => ({ type: 'PLAYER' as any, targetPhysicalId: p.physicalId, votes: 0 })) as any;

  state.votingState.candidates = [...dealCandidates, ...playerCandidates];
  state.votingState.hiddenPlayersFromVoting = dealTargets;
  state.votingState.totalVotesCast = 0;
  state.votingState.tieBreakerLevel = 0;
  state.votingState.playerVotes = {};
  state.votingState.leaderProxyVotes = {};
  (state.votingState as any).mayorRevote = true;
  if (state.votingState.durationSeconds) {
    state.votingState.votingStartTime = Date.now();
  }
  state.withdrawalState = null;
  state.justificationData = null;
}

// ── الحمولة العلنيّة عند الكشف (تُبثّ للجميع) ──
export function mayorRevealPayload(state: GameState) {
  const ms = state.mayorState!;
  const p = state.players.find(pl => pl.physicalId === ms.mayorPhysicalId);
  return {
    physicalId: ms.mayorPhysicalId,
    name: p?.name || '',
    decision: ms.decision,
    round: state.round,
    voteWeight: configuredMayorWeight(state), // للواجهات: شارة ×N الصحيحة
  };
}

// ── الجزء العلنيّ الآمن من الحالة (للحمولات المُعقَّمة والواجهات) ──
// قبل الكشف: لا شيء يُسرَّب. بعده: الهويّة والقرار فقط (النافذة تبقى سرّية دائماً).
export function publicMayorInfo(state: GameState): { revealed: true; physicalId: number; vetoUsed: boolean } | null {
  const ms = state.mayorState;
  if (!ms || !ms.revealed) return null;
  return { revealed: true, physicalId: ms.mayorPhysicalId, vetoUsed: ms.vetoUsed };
}
