// ══════════════════════════════════════════════════════
// 🤝 الكفيل — يراهن بحياته على براءة من حكمت عليه المدينة (موسم النبوءة، كرتٌ اختياريّ)
//
// قرارات المالك (2026-11-26):
//   ٣٩ كرتٌ يضيفه الموجّه يدويّاً، خارج القصّة، و**لا يمسّ المنطق إن لم يُضَف**: كلّ سطرٍ هنا
//      يبدأ بـ «هل في الطاولة كفيل؟» (guarantorState) — بلا كفيلٍ لا نافذة ولا أثر.
//   ٤٠ الكفالة على التصويت **والصفقات**، وكفالة هدف صفقةٍ بريء تُلغي الصفقة كلّها.
//   ب٥ (قرار البناء) يسجّلها الموجّه من لوحته: الكفيل يقف في القاعة ويقول «أكفله».
//
// القاعدة: مرّةً في اللعبة، بعد فرز التصويت (فائزٌ واحد) وقبل الإعدام، وقبل نافذة العمدة.
//   الحكم بالحقيقة لا بالمظهر (القناع والحرباية لا يخدعانه):
//   • مواطنٌ ⇒ ينجو، ولا يُعدم أحدٌ ذلك اليوم. هدفُ صفقةٍ ⇒ الصفقة كلّها تُلغى (لا هدف ولا صاحب).
//     صفقة النبوءة ⇒ تُغلق «مكفولة» (لا صادقة ولا كاذبة).
//   • مافيا أو مستقلّ ⇒ يُعدم كما لو لا كفالة (القنبلة والمهرّج وارتداد الصفقة كعادتها)،
//     ويموت الكفيل معه.
//   بعد الكفالة لا نافذة للعمدة: لا حاجة لنقضٍ بعد أن حُكم.
//   لا كفالة على نفسه، ولا في التعادل، ولا على «قدر الغد» (ليس تصويتاً).
//
// 🔴 النتيجة لا تُعلن قبل قلب الكرت: «كفله رقم ١٢» يُعلن لحظتها، أمّا «مات الكفيل معه» فيصل
//    مع حمولة الإقصاء (pendingResolution) كأيّ موتٍ في التصويت — ويُقلب كرتُه مع المُعدَم.
// 🔴 الحقول بأسماء *PhysicalId فتنقلها أداة نقل المقاعد. والحالة سرّ عن الهواتف والمتفرّجين.
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { Role, teamOfRole } from './roles.js';

export interface KafalaWinner { type: 'PLAYER' | 'DEAL'; targetPhysicalId: number; id?: string; kind?: string; initiatorPhysicalId?: number | null }

export interface GuarantorState {
  guarantorPhysicalId: number;
  used: boolean;
  /** النافذة المفتوحة الآن (للموجّه) */
  window: { key: string; winner: KafalaWinner; topVotes: number } | null;
  /** جولةُ تصويتٍ مرّرها الموجّه — لا تُفتح لها النافذة ثانيةً */
  passedKey: string | null;
  /** كفالةٌ على مافيا/مستقلّ تنتظر الإعدام: الكفيل يموت معه في resolveVoting */
  pendingDeath: { targetPhysicalId: number; round: number } | null;
  result: {
    round: number; targetPhysicalId: number; targetTeam: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
    outcome: 'SAVED' | 'FAILED'; viaDeal: boolean; dealCancelled: boolean;
  } | null;
}

const gs = (state: GameState): GuarantorState | null => ((state as any).guarantorState as GuarantorState | null) || null;

/** يُستدعى عند اعتماد الأدوار — null إن لا كفيل (وهذا كلّ ما يلزم ليبقى المنطق كما هو). */
export function initGuarantorState(state: GameState): GuarantorState | null {
  const p = state.players.find(x => x.role === Role.GUARANTOR);
  if (!p) return null;
  return { guarantorPhysicalId: p.physicalId, used: false, window: null, passedKey: null, pendingDeath: null, result: null };
}

/** مفتاحُ جولة التصويت الحاليّة: الكفالة تُعرض مرّةً لكلّ جولة (إعادة التصويت جولةٌ جديدة) */
export function voteRoundKey(state: GameState, winner: KafalaWinner): string {
  const h: any[] = (state as any).voteHistory || [];
  const last = h.length ? h[h.length - 1] : null;
  return `${state.round || 1}:${last?.id ?? last?.seq ?? 0}:${winner.type}:${winner.targetPhysicalId}`;
}

/** هل تُفتح نافذة الكفالة لهذا الفائز؟ */
export function kafalaEligible(state: GameState, winner: KafalaWinner | null | undefined): boolean {
  const g = gs(state);
  if (!g || g.used || !winner) return false;
  const k = state.players.find(p => p.physicalId === g.guarantorPhysicalId);
  if (!k?.isAlive || k.role !== Role.GUARANTOR) return false;
  if (winner.targetPhysicalId === g.guarantorPhysicalId) return false;   // لا يكفل نفسه
  const t = state.players.find(p => p.physicalId === winner.targetPhysicalId);
  if (!t?.isAlive) return false;
  return g.passedKey !== voteRoundKey(state, winner);
}

export function openKafalaWindow(state: GameState, winner: KafalaWinner, topVotes: number) {
  const g = gs(state)!;
  g.window = { key: voteRoundKey(state, winner), winner: { ...winner }, topVotes };
  return g.window;
}

export function closeKafalaWindow(state: GameState, passed: boolean): void {
  const g = gs(state);
  if (!g) return;
  if (passed && g.window) g.passedKey = g.window.key;
  g.window = null;
}

/**
 * «أكفله»: يحكم بالحقيقة. يُستهلك الكرت.
 *   SAVED  ⇒ المستدعي يُنهي النهار بلا موت (ويُلغي الصفقة/يُغلق النبوءة).
 *   FAILED ⇒ المستدعي يمضي بالإعدام، وresolveVoting يُميت الكفيل معه (pendingDeath).
 */
export function applyKafala(state: GameState): { ok: true; outcome: 'SAVED' | 'FAILED'; winner: KafalaWinner } | { ok: false; error: string } {
  const g = gs(state);
  if (!g?.window) return { ok: false, error: 'لا نافذة كفالةٍ مفتوحة' };
  if (g.used) return { ok: false, error: 'استُعملت الكفالة' };
  const winner = g.window.winner;
  const t = state.players.find(p => p.physicalId === winner.targetPhysicalId);
  if (!t?.isAlive) return { ok: false, error: 'المحكوم ليس في اللعبة' };
  const team = teamOfRole(t.role);
  const outcome: 'SAVED' | 'FAILED' = team === 'CITIZEN' ? 'SAVED' : 'FAILED';
  g.used = true;
  g.window = null;
  g.result = {
    round: state.round || 1, targetPhysicalId: t.physicalId, targetTeam: team, outcome,
    viaDeal: winner.type === 'DEAL', dealCancelled: outcome === 'SAVED' && winner.type === 'DEAL',
  };
  if (outcome === 'FAILED') g.pendingDeath = { targetPhysicalId: t.physicalId, round: state.round || 1 };
  return { ok: true, outcome, winner };
}

/**
 * يُستدعى في resolveVoting قبل أيّ إعدام (فلا تختار قنبلةُ الشيخ كفيلاً يموت أصلاً):
 * إن كانت كفالةٌ فاشلة على هذا الهدف يُميت الكفيل ويُرجع مقعده ليُضاف للمُقصَين.
 */
export function takeKafalaDeath(state: GameState, targetSeat: number): number | null {
  const g = gs(state);
  const pd = g?.pendingDeath;
  if (!g || !pd || pd.targetPhysicalId !== targetSeat || pd.round !== (state.round || 1)) return null;
  g.pendingDeath = null;
  const k = state.players.find(p => p.physicalId === g.guarantorPhysicalId);
  if (!k?.isAlive) return null;
  k.isAlive = false;
  if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  state.performanceTracking.eliminationLog.push({
    physicalId: k.physicalId, eliminatedBy: 'KAFALA' as any, round: state.round || 1, team: 'CITIZEN' as any,
  });
  return k.physicalId;
}

/** للكشف بعد اللعبة والسجلّ */
export function guarantorSummary(state: GameState) {
  const g = gs(state);
  if (!g) return null;
  return { guarantorPhysicalId: g.guarantorPhysicalId, used: g.used, result: g.result };
}
