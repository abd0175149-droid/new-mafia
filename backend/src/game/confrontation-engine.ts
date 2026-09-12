// ══════════════════════════════════════════════════════
// ⚔️ محرّك مواجهة النهار الوجاهيّة (Day Confrontation)
//
// تُطلب من هاتف اللاعب في أيّ لحظة من مرحلة النقاش (من الجولة الثانية كالاتفاقيّات)،
// وتُنفَّذ بعد آخر متحدّث وقبل التصويت: الطرفان يتحدّثان معاً بمؤقّتٍ واحد (٦٠ث افتراضاً) ← DONE.
// لا نبض قاعة. أثرها على الرانك يُحسم من تصويت الجولة نفسها وحده (انظر stampConfrontationOutcome).
//
// دوالٌ نقيّة على كائن الحالة — لا تلمس Redis ولا المؤقّتات؛ الحفظ والبثّ والمؤقّتات
// في sockets/day-confrontation.socket.ts.
// ══════════════════════════════════════════════════════
import { GameState, Phase, Confrontation, ConfrontationStatus, PulseSummary } from './state.js';
import { teamOfRole } from './roles.js';

export const CONFRONTATION_RESPOND_SECONDS = 20;   // مهلة ردّ المستهدَف
export const CONFRONTATION_STAGE_SECONDS = 60;     // مدّة المواجهة للطرفين معاً (كانت ٣٠ث لكلّ طرف)
export const CONFRONTATION_MAX_PER_ROUND = 2;      // مواجهتان مقبولتان في الجولة كحدّ
export const CONFRONTATION_MIN_ROUND = 1;          // قرار المالك 2026-09-11: من الجولة الأولى (الاتفاقيّات وحدها من الثانية)
export const CONFRONTATION_DEFAULT_PER_PLAYER = 1;
export const CONFRONTATION_STAGE_MIN = 20;
export const CONFRONTATION_STAGE_MAX = 300;

/** مدّة المواجهة: قيمةٌ صريحة من الليدر، وإلّا إعداد الغرفة، وإلّا ٦٠ث — مقيّدة 20-300. */
export function stageSecondsFor(state: GameState, explicit?: number): number {
  const n = Number(explicit ?? state.config?.confrontationStageSeconds ?? CONFRONTATION_STAGE_SECONDS);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : CONFRONTATION_STAGE_SECONDS;
  return Math.min(CONFRONTATION_STAGE_MAX, Math.max(CONFRONTATION_STAGE_MIN, v));
}

const LIVE: ConfrontationStatus[] = ['PENDING', 'ACCEPTED', 'LIVE'];
const COUNTED: ConfrontationStatus[] = ['ACCEPTED', 'LIVE', 'DONE'];

export function perPlayerCap(state: GameState): number {
  const n = Number(state.config?.confrontationsPerPlayer);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 5) : CONFRONTATION_DEFAULT_PER_PLAYER;
}

/** مواجهات الجولة الحاليّة فقط (القائمة تحفظ كلّ الجولات وتُرشَّح هنا). */
export function roundConfrontations(state: GameState): Confrontation[] {
  return (state.confrontations || []).filter(c => c.round === (state.round || 1));
}

/** المواجهة الجارية (الطرفان معاً) — لا يُسمح بأكثر من واحدة. */
export function activeConfrontation(state: GameState): Confrontation | null {
  return roundConfrontations(state).find(c => c.status === 'LIVE') || null;
}

/** ما يمنع بدء التصويت: طلبٌ لم يُحسم، أو مقبولةٌ لم تُنفَّذ، أو جارية. */
export function blockingConfrontation(state: GameState): Confrontation | null {
  return roundConfrontations(state).find(c => LIVE.includes(c.status)) || null;
}

export function usedBy(state: GameState, physicalId: number): number {
  return (state.confrontationsUsed || {})[physicalId] || 0;
}

/** سبب المنع (نصّ عربيّ) أو null إن جاز الطلب. */
export function requestBlockReason(state: GameState, requesterId: number, targetId: number): string | null {
  if (state.config?.confrontationEnabled !== true) return 'ميزة المواجهة معطّلة في هذه الغرفة';
  if (state.config?.isRemote) return 'المواجهة الوجاهيّة للغرف الحضوريّة فقط';
  if (state.phase !== Phase.DAY_DISCUSSION) return 'تُطلب المواجهة أثناء مرحلة النقاش فقط';
  if ((state.round || 1) < CONFRONTATION_MIN_ROUND) return 'المواجهة متاحة من الجولة الثانية';
  if (requesterId === targetId) return 'لا يمكنك مواجهة نفسك';
  const requester = state.players.find(p => p.physicalId === requesterId);
  const target = state.players.find(p => p.physicalId === targetId);
  if (!requester || !requester.isAlive) return 'الطالب ليس لاعباً حيّاً';
  if (requester.isSilenced) return 'لا يمكن للمُسكَت طلب مواجهة';
  if (!target || !target.isAlive) return 'المستهدَف ليس لاعباً حيّاً';
  if (target.isSilenced) return 'لا يمكن مواجهة لاعبٍ مُسكَت';
  if (usedBy(state, requesterId) >= perPlayerCap(state)) return 'استنفدت رصيد المواجهات لهذه اللعبة';
  const rc = roundConfrontations(state);
  if (rc.some(c => LIVE.includes(c.status) && (c.requesterPhysicalId === requesterId || c.targetPhysicalId === requesterId)))
    return 'لديك مواجهةٌ قائمة في هذه الجولة';
  if (rc.filter(c => COUNTED.includes(c.status)).length >= CONFRONTATION_MAX_PER_ROUND)
    return 'اكتمل حدّ المواجهات لهذه الجولة (مواجهتان)';
  if (rc.some(c => c.status !== 'DECLINED' && c.status !== 'CANCELLED' && c.targetPhysicalId === targetId))
    return 'هذا اللاعب مستهدَفٌ في مواجهةٍ أخرى هذه الجولة';
  return null;
}

/** طلبٌ جديد — يبقى PENDING حتى يردّ المستهدَف أو يقرّر الليدر. لا يُستهلك الرصيد هنا. */
export function requestConfrontation(state: GameState, requesterId: number, targetId: number, now = Date.now()): Confrontation {
  const reason = requestBlockReason(state, requesterId, targetId);
  if (reason) throw new Error(reason);
  const round = state.round || 1;
  const c: Confrontation = {
    // لاحقة عشوائيّة: طلبان في الملّي ثانية نفسها (رفضٌ ثمّ إعادة) كانا يتشاركان المعرّف
    id: `cf_${round}_${requesterId}_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    round,
    requesterPhysicalId: requesterId,
    targetPhysicalId: targetId,
    status: 'PENDING',
    createdAt: now,
    respondBy: now + CONFRONTATION_RESPOND_SECONDS * 1000,
    stageSeconds: stageSecondsFor(state),
    stageStartedAt: null,
  };
  // نحتفظ بالجولة الحاليّة والسابقة فقط كي لا تتضخّم الحالة
  state.confrontations = [...(state.confrontations || []).filter(x => x.round >= round - 1), c];
  return c;
}

export function findConfrontation(state: GameState, id: string): Confrontation | null {
  return (state.confrontations || []).find(c => c.id === id) || null;
}

function consume(state: GameState, c: Confrontation) {
  if (!state.confrontationsUsed) state.confrontationsUsed = {};
  state.confrontationsUsed[c.requesterPhysicalId] = usedBy(state, c.requesterPhysicalId) + 1;
}

function refund(state: GameState, c: Confrontation) {
  if (!state.confrontationsUsed) return;
  state.confrontationsUsed[c.requesterPhysicalId] = Math.max(0, usedBy(state, c.requesterPhysicalId) - 1);
}

/** القبول (من المستهدَف أو الليدر نيابةً) — يُستهلك رصيد الطالب هنا. */
export function acceptConfrontation(state: GameState, id: string, by: 'TARGET' | 'LEADER'): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (c.status !== 'PENDING') throw new Error('هذا الطلب حُسم مسبقاً');
  if (state.phase !== Phase.DAY_DISCUSSION) throw new Error('انتهت مرحلة النقاش');
  // أعد فحص ما قد يتغيّر بين الطلب والقبول (موت/حدّ الجولة/الرصيد)
  const rc = roundConfrontations(state).filter(x => x.id !== id);
  if (rc.filter(x => COUNTED.includes(x.status)).length >= CONFRONTATION_MAX_PER_ROUND)
    throw new Error('اكتمل حدّ المواجهات لهذه الجولة');
  const req = state.players.find(p => p.physicalId === c.requesterPhysicalId);
  const tgt = state.players.find(p => p.physicalId === c.targetPhysicalId);
  if (!req?.isAlive || !tgt?.isAlive) throw new Error('أحد الطرفين لم يعد حيّاً');
  if (usedBy(state, c.requesterPhysicalId) >= perPlayerCap(state)) throw new Error('استنفد الطالب رصيده');
  c.status = 'ACCEPTED';
  c.acceptedBy = by;
  c.timedOut = false;
  consume(state, c);
  return c;
}

/** الرفض (من المستهدَف أو الليدر) — يُعلَن على الشاشة ولا يُستهلك الرصيد. */
export function declineConfrontation(state: GameState, id: string, by: 'TARGET' | 'LEADER'): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (c.status !== 'PENDING') throw new Error('هذا الطلب حُسم مسبقاً');
  c.status = 'DECLINED';
  c.declinedBy = by;
  c.finishedAt = Date.now();
  return c;
}

/** انقضاء مهلة الردّ — يبقى الطلب معلّقاً والقرار لليدر. */
export function markTimedOut(state: GameState, id: string): Confrontation | null {
  const c = findConfrontation(state, id);
  if (!c || c.status !== 'PENDING' || c.timedOut) return null;
  c.timedOut = true;
  return c;
}

/** إلغاء الليدر لمواجهةٍ مقبولة/جارية — يُردّ رصيد الطالب. (طلبٌ معلّق ⇒ رفض.) */
export function cancelConfrontation(state: GameState, id: string): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (c.status === 'PENDING') return declineConfrontation(state, id, 'LEADER');
  if (!['ACCEPTED', 'LIVE'].includes(c.status)) throw new Error('لا يمكن إلغاء مواجهةٍ منتهية');
  c.status = 'CANCELLED';
  c.stageStartedAt = null;
  c.finishedAt = Date.now();
  refund(state, c);
  return c;
}

/** «ابدأ المواجهة»: ACCEPTED → LIVE (الطرفان معاً). لا تبدأ ومتحدّثٌ على الميكروفون ولا مع مواجهةٍ جارية. */
export function startConfrontation(state: GameState, id: string, now = Date.now(), seconds?: number): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (c.status !== 'ACCEPTED') throw new Error('المواجهة ليست بانتظار البدء');
  if (state.phase !== Phase.DAY_DISCUSSION) throw new Error('تُنفَّذ المواجهة في مرحلة النقاش فقط');
  // مواجهةٌ جارية (ولو انقضى وقتها)؟ بدءُ التالية يغلقها ويختم نبضها — قرار المالك 2026-09-12
  const live = activeConfrontation(state);
  if (live) endConfrontation(state, live.id, now);
  if (state.discussionState && state.discussionState.status === 'SPEAKING' && !state.discussionState.isFinished)
    throw new Error('أوقف المتحدّث الحاليّ أولاً');
  const req = state.players.find(p => p.physicalId === c.requesterPhysicalId);
  const tgt = state.players.find(p => p.physicalId === c.targetPhysicalId);
  if (!req?.isAlive || !tgt?.isAlive) throw new Error('أحد الطرفين لم يعد حيّاً');
  c.status = 'LIVE';
  c.stageSeconds = stageSecondsFor(state, seconds ?? c.stageSeconds);
  c.stageStartedAt = now;
  return c;
}

/** تعديلٌ حيّ لمدّة المرحلة الجارية (±ثوانٍ): يمدّد أو يقصّر الموعد دون إعادة العدّ. */
export function adjustConfrontationStage(state: GameState, id: string, deltaSeconds: number, now = Date.now()): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (c.status !== 'LIVE' || !c.stageStartedAt) throw new Error('المواجهة ليست جارية');
  const d = Math.floor(Number(deltaSeconds) || 0);
  if (!d) return c;
  const elapsed = Math.max(0, Math.floor((now - c.stageStartedAt) / 1000));
  // لا تقلّ المدّة الجديدة عمّا مضى + ٣ث كي لا ينتهي الدور في اللحظة نفسها بلا إنذار
  c.stageSeconds = Math.min(CONFRONTATION_STAGE_MAX, Math.max(elapsed + 3, c.stageSeconds + d));
  if (c.timeUp && c.stageStartedAt + c.stageSeconds * 1000 > now) c.timeUp = false;   // تمديدٌ بعد انقضاء الوقت يعيد العدّ
  return c;
}

/** «إنهاء»: LIVE → DONE، وتُسجَّل في تتبّع الأداء بلا نتيجةٍ بعد. */
export function endConfrontation(state: GameState, id: string, now = Date.now()): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (c.status !== 'LIVE') throw new Error('المواجهة ليست جارية');
  c.status = 'DONE';
  c.stageStartedAt = null;
  c.timeUp = false;
  c.finishedAt = now;
  c.pulse = pulseSummary(state, c);   // 🗳️ يُختم النبض لحظة الإغلاق
  const req = state.players.find(p => p.physicalId === c.requesterPhysicalId);
  const tgt = state.players.find(p => p.physicalId === c.targetPhysicalId);
  if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  if (!state.performanceTracking.confrontations) state.performanceTracking.confrontations = [];
  state.performanceTracking.confrontations.push({
    id: c.id,
    round: c.round,
    requesterPhysicalId: c.requesterPhysicalId,
    targetPhysicalId: c.targetPhysicalId,
    requesterTeam: teamOfRole(req?.role),
    targetTeam: teamOfRole(tgt?.role),
    outcome: null,
    pulse: c.pulse,
    pulseVotes: { ...(c.pulseVotes || {}) },
  });
  return c;
}

// ══════════════════════════════════════════════════════
// 🗳️ نبض الإقناع — تصويت القاعة أثناء المواجهة (قرار المالك 2026-09-12)
//   المستوى ١: يُعرض ويُختم ويُسجَّل. المستوى ٢: شارةٌ في التصويت وسطرٌ في الكشف.
//   المستوى ٣ (بمفتاح pulseBreaksTies): خاسر النبض يُقصى عند تعادل الإقصاء.
// ══════════════════════════════════════════════════════
export function pulseEnabled(state: GameState): boolean {
  return state.config?.pulseEnabled !== false;
}

/** صوتٌ من حيٍّ غير طرف — يُستبدل ما دامت المواجهة LIVE (ولو انقضى الوقت). */
export function castPulse(state: GameState, id: string, voterPhysicalId: number, side: 'REQ' | 'TGT'): Confrontation {
  const c = findConfrontation(state, id);
  if (!c) throw new Error('المواجهة غير موجودة');
  if (!pulseEnabled(state)) throw new Error('نبض الإقناع معطّل في هذه الغرفة');
  if (c.status !== 'LIVE') throw new Error('التصويت متاح أثناء المواجهة فقط');
  if (side !== 'REQ' && side !== 'TGT') throw new Error('اختيارٌ غير صالح');
  const voter = state.players.find(p => p.physicalId === voterPhysicalId);
  if (!voter?.isAlive) throw new Error('المُقصى لا يصوّت');
  if (voterPhysicalId === c.requesterPhysicalId || voterPhysicalId === c.targetPhysicalId) throw new Error('طرفا المواجهة لا يصوّتان');
  if (!c.pulseVotes) c.pulseVotes = {};
  c.pulseVotes[voterPhysicalId] = side;
  return c;
}

/** انقضاء الوقت: تبقى LIVE على الشاشة (النبض مفتوح) حتى يغلق الليدر. */
export function markTimeUp(state: GameState, id: string): Confrontation | null {
  const c = findConfrontation(state, id);
  if (!c || c.status !== 'LIVE' || c.timeUp) return null;
  c.timeUp = true;
  return c;
}

export function pulseSummary(state: GameState, c: Confrontation): PulseSummary {
  const eligible = state.players.filter(p => p.isAlive && p.physicalId !== c.requesterPhysicalId && p.physicalId !== c.targetPhysicalId).length;
  const votes = Object.values(c.pulseVotes || {});
  const req = votes.filter(v => v === 'REQ').length;
  const tgt = votes.filter(v => v === 'TGT').length;
  const total = req + tgt;
  const quorum = total > 0 && total >= Math.ceil(eligible / 2);
  const winner: PulseSummary['winner'] = !quorum ? null : req === tgt ? 'TIE' : req > tgt ? 'REQ' : 'TGT';
  const winnerPhysicalId = winner === 'REQ' ? c.requesterPhysicalId : winner === 'TGT' ? c.targetPhysicalId : null;
  const loserPhysicalId = winner === 'REQ' ? c.targetPhysicalId : winner === 'TGT' ? c.requesterPhysicalId : null;
  const pct = total ? Math.round(100 * Math.max(req, tgt) / total) : 0;
  return { req, tgt, eligible, quorum, winner, winnerPhysicalId, loserPhysicalId, pct };
}

/** المستوى ٣: مرشّحٌ متعادل هو خاسر نبض مواجهةٍ مختومة في هذه الجولة — واحدٌ بالضبط وإلّا لا اقتراح. */
export function pulseTieSuggestion(state: GameState, tiedCandidates: Array<{ targetPhysicalId?: number }>): { physicalId: number; pct: number; confrontationId: string; winnerPhysicalId: number } | null {
  if (!state.config?.pulseBreaksTies || !pulseEnabled(state)) return null;
  const losers = roundConfrontations(state).filter(c => c.status === 'DONE' && c.pulse?.loserPhysicalId != null);
  const hits: Array<{ physicalId: number; pct: number; confrontationId: string; winnerPhysicalId: number }> = [];
  for (const cand of tiedCandidates || []) {
    const pid = Number(cand?.targetPhysicalId);
    const c = losers.find(x => x.pulse!.loserPhysicalId === pid);
    if (c) hits.push({ physicalId: pid, pct: c.pulse!.pct, confrontationId: c.id, winnerPhysicalId: c.pulse!.winnerPhysicalId! });
  }
  return hits.length === 1 ? hits[0] : null;
}

/** المستوى ٢: شارات التصويت — لكلّ طرفٍ في مواجهةٍ مختومة بنصاب هذه الجولة. */
export function pulseBadges(state: GameState): Record<number, { won: boolean; pct: number; vsPhysicalId: number }> {
  const out: Record<number, { won: boolean; pct: number; vsPhysicalId: number }> = {};
  for (const c of roundConfrontations(state)) {
    const ps = c.status === 'DONE' ? c.pulse : null;
    if (!ps?.quorum || ps.winner === 'TIE' || !ps.winner) continue;
    out[ps.winnerPhysicalId!] = { won: true, pct: ps.pct, vsPhysicalId: ps.loserPhysicalId! };
    out[ps.loserPhysicalId!] = { won: false, pct: 100 - ps.pct, vsPhysicalId: ps.winnerPhysicalId! };
  }
  return out;
}

/** سطرٌ لكشف الإقصاء: «وُوجه وخسر النبض ٦٤٪» / «واجهه فلان وربح النبض» */
export function confrontationNotes(state: GameState, eliminatedIds: number[]): Record<number, string> {
  const out: Record<number, string> = {};
  const nameOf = (pid: number) => state.players.find(p => p.physicalId === pid)?.name || `#${pid}`;
  for (const pid of eliminatedIds) {
    const c = roundConfrontations(state).find(x => x.status === 'DONE' && (x.requesterPhysicalId === pid || x.targetPhysicalId === pid));
    if (!c) continue;
    const other = c.requesterPhysicalId === pid ? c.targetPhysicalId : c.requesterPhysicalId;
    const role = c.requesterPhysicalId === pid ? `واجه ${nameOf(other)}` : `واجهه ${nameOf(other)}`;
    const ps = c.pulse;
    if (!ps?.quorum || !ps.winner || ps.winner === 'TIE') { out[pid] = `⚔️ ${role}`; continue; }
    out[pid] = ps.loserPhysicalId === pid ? `⚔️ ${role} وخسر النبض (${100 - ps.pct}٪)` : `⚔️ ${role} وربح النبض (${ps.pct}٪)`;
  }
  return out;
}

/** موعد انقضاء المرحلة الجارية (ms) — لمؤقّت الخادم. */
export function stageDeadline(c: Confrontation | null | undefined): number | null {
  if (!c || c.status !== 'LIVE' || !c.stageStartedAt) return null;
  return c.stageStartedAt + c.stageSeconds * 1000;
}

/**
 * ختم نتيجة المواجهة عند إقصاءٍ بتصويت النهار (يُستدعى من resolveVoting).
 * الأثر لطالب المواجهة وحده، ومن تصويت الجولة نفسها فقط:
 *   مواطن ← مافيا: MAFIA_EXPOSED (+) · مواطن ← مواطن: CITIZEN_HIT (−)
 *   مافيا ← مافيا: MAFIA_BETRAYAL (−) · مافيا ← مواطن / طالبٌ محايد: NONE
 * إقصاءٌ بالاتفاقيّة أو بالليل أو بلا إقصاء = لا ختم (يبقى null ⇒ صفر).
 */
export function stampConfrontationOutcome(state: GameState, eliminatedPhysicalId: number): number {
  const list = state.performanceTracking?.confrontations;
  if (!list?.length) return 0;
  const round = state.round || 1;
  let n = 0;
  for (const e of list) {
    if (e.round !== round) continue;
    // 🗳️ النبض مع الحقيقة: أُقصي أحد الطرفين بالتصويت وكُشف مافيا، والطرف الآخر مواطنٌ ربح النبض
    const isReq = e.requesterPhysicalId === eliminatedPhysicalId, isTgt = e.targetPhysicalId === eliminatedPhysicalId;
    if ((isReq || isTgt) && e.pulse?.winner && e.pulse.winner !== 'TIE' && e.pulseVindicated == null) {
      const elimTeam = isReq ? e.requesterTeam : e.targetTeam;
      const otherTeam = isReq ? e.targetTeam : e.requesterTeam;
      const otherSide: 'REQ' | 'TGT' = isReq ? 'TGT' : 'REQ';
      if (elimTeam === 'MAFIA' && otherTeam === 'CITIZEN' && e.pulse.winner === otherSide) {
        e.pulseVindicated = true;
        e.correctVoters = Object.entries(e.pulseVotes || {}).filter(([, v]) => v === otherSide).map(([k]) => Number(k));
      } else e.pulseVindicated = false;
    }
    if (!isTgt || e.outcome) continue;
    if (e.requesterTeam === 'CITIZEN') e.outcome = e.targetTeam === 'MAFIA' ? 'MAFIA_EXPOSED' : e.targetTeam === 'CITIZEN' ? 'CITIZEN_HIT' : 'NONE';
    else if (e.requesterTeam === 'MAFIA') e.outcome = e.targetTeam === 'MAFIA' ? 'MAFIA_BETRAYAL' : 'NONE';
    else e.outcome = 'NONE';
    n++;
  }
  return n;
}

/** الحمولة العامّة للبثّ (لا أسرار فيها — المقاعد وحالة الطلب فقط). */
export function publicConfrontations(state: GameState) {
  return {
    round: state.round || 1,
    enabled: state.config?.confrontationEnabled === true,
    perPlayer: perPlayerCap(state),
    maxPerRound: CONFRONTATION_MAX_PER_ROUND,
    respondSeconds: CONFRONTATION_RESPOND_SECONDS,
    stageSeconds: stageSecondsFor(state),
    used: state.confrontationsUsed || {},
    pulseEnabled: pulseEnabled(state),
    pulseBreaksTies: state.config?.pulseBreaksTies === true,
    // 🔴 الأصوات الفرديّة سرّ — تُقصّ؛ ويُرفق الملخّص الحيّ لكلّ مواجهةٍ جارية
    confrontations: roundConfrontations(state).map(c => {
      const { pulseVotes, ...pub } = c;
      return { ...pub, pulse: c.status === 'LIVE' ? pulseSummary(state, c) : c.pulse ?? null };
    }),
    serverTime: Date.now(),
  };
}

/** صوت هذا اللاعب في كلّ مواجهات الجولة (لردّ get-confrontations على الهاتف) */
export function myPulseVotes(state: GameState, physicalId: number): Record<string, 'REQ' | 'TGT'> {
  const out: Record<string, 'REQ' | 'TGT'> = {};
  for (const c of roundConfrontations(state)) { const v = c.pulseVotes?.[physicalId]; if (v) out[c.id] = v; }
  return out;
}
