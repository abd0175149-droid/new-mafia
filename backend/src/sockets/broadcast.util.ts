// ══════════════════════════════════════════════════════
// 🔒 بثّ الحالة مع إخفاء الأسرار عن اللاعبين — في كلّ الغرف
// ══════════════════════════════════════════════════════
// الموجّه وشاشةُ العرض ومضيفُ الغرفة البعيدة (موثوقون) يستقبلون الحالة كاملة.
// كلُّ هاتف لاعبٍ يستقبل إسقاطاً (`projectStateFor`): بياناتُ اللعبة العلنيّة، ومقعدُه
// هو بدوره وهاتفه، وأدوارُ الموتى بعد كشفها فقط.
//
// 🔴 تغيّر 2026-10-04: كانت الغرف المحلّيّة (القاعة) تبثّ الحالة **خاماً** لكلّ هاتف
//    «بايت ببايت» — بأدوار الجميع ونيّات الليل والتوأمين وعقود السفّاح ونافذة العمدة
//    ورمز شاشة العرض. مقبسُ اللاعب في الغرفة نفسها، ومَن يفتح أدوات المطوّر يقرؤها.
//    ولا يقرأ أيٌّ من عميلَي اللاعب (الويب وفلاتر) دورَ غيره من الحالة — دورُه وفريقُه
//    وتوأمُه وعقودُه تصله بأحداثٍ خاصّةٍ بمقبسه — فالإسقاطُ لا يكسر شيئاً.

import type { Server } from 'socket.io';
import { notifyPulseForRoom } from './activity-pulse.socket.js';
import { unrevealedDeadSeats } from '../game/public-counts.js';

// إزالة كل ما يكشف الأدوار أو نيّات الليل من نسخة اللاعب
// ⚰️ دور الميت يُكشف: أُعلن للجميع لحظة الإقصاء/الصباح أصلاً — إبقاؤه في الروستر
// يجعل الكارد المقلوب على الحلقة يصمد لتحديث الصفحة والمنضمّين الجدد.
/**
 * 👁️ غرفة المتفرّجين المعقّمة.
 *
 * المتفرّج لا ينضمّ إلى `roomId` إطلاقاً: البثّ المحلّيّ هناك خامٌّ بالأدوار
 * (`io.to(roomId).emit(event, state)` بلا تعقيم)، فمن يفتح أدوات المتصفّح
 * يقرأ أدوار الجميع. بدلاً منها غرفةٌ فرعيّة لا يصلها إلّا ما مرّ بـstripSecrets.
 */
export function spectatorRoom(roomId: string): string {
  return `${roomId}:spectators`;
}

export function stripSecrets(state: any): any {
  if (!state || !Array.isArray(state.players)) return state;
  return {
    ...state,
    players: state.players.map((p: any) => ({ ...p, role: p.isAlive === false ? (p.role ?? null) : null })),
    nightActions: undefined,
    autoNightChoices: undefined,
    // 🎩 هويّة العمدة سرّ حتى يكشف نفسه؛ وبعد الكشف تُمرَّر الهويّة بلا النافذة السرّية
    mayorState: state.mayorState?.revealed
      ? { mayorPhysicalId: state.mayorState.mayorPhysicalId, revealed: true, vetoUsed: state.mayorState.vetoUsed, decision: state.mayorState.decision, revealedAtRound: state.mayorState.revealedAtRound }
      : undefined,
    // 🔥 مقعدُ العنقاء ورصيدُه سرٌّ مطلق: لا يُكشف حتى بعد بعثٍ ظاهرٍ للجميع —
    //    فالمدينةُ ترى مَن احترق ولا تعرف لماذا. والرصيدُ للموجّه وحده.
    phoenixState: undefined,
    // 🜂 وقائمةُ مؤهَّلي اللعنة تفضح مَن صوّت على مَن — سرٌّ حتى عن شاشة العرض.
    pendingAshCurse: undefined,
  };
}

// ── 🔒 إسقاطُ الحالة للاعب ──────────────────────────────

/** حقولُ اللاعب العلنيّة — قائمةُ سماح: أيُّ حقلٍ جديد سرّيٌّ حتّى يُضاف هنا عمداً. */
const PLAYER_PUBLIC_KEYS = [
  'physicalId', 'name', 'gender', 'playerId', 'isAlive', 'isSilenced', 'justificationCount',
  'addedBy', 'frozen', 'avatarUrl', 'rankTier', 'cosmetics', 'seatHeld', 'heldUntil',
  'isConnected', 'penalties', 'penaltyKicked', 'cardRevealed',
] as const;

/** حقولُ الحالة العلنيّة على المستوى الأعلى — قائمةُ سماح كذلك. */
const STATE_PUBLIC_KEYS = [
  'roomId', 'roomCode', 'phase', 'round', 'rolesConfirmed', 'startedAt', 'setupStartedAt',
  'matchId', 'sessionId', 'sessionCode', 'activityId', 'locationId', 'locationName', 'cityId',
  'cityName', 'seasonName', 'discussionState', 'votingState', 'withdrawalState', 'confrontation',
  'confrontationCount', 'confrontationRound', 'gameTimer', 'eliminationRevealed',
  'dealRegisteredRound', 'confrontationsUsed', 'mayorShield', 'luckyDrawHistory', 'createdAt',
  'nextGameAt', 'seatLayout',
] as const;

const PRE_GAME_PHASES = new Set(['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING']);

// المقاعدُ الميّتة غيرُ المكشوفة — مصدرٌ واحد مع عدّاد الفرق العلنيّ (game/public-counts)

const stripRole = (o: any) => {
  if (!o || typeof o !== 'object') return o;
  const { role, ...rest } = o;
  void role;
  return rest;
};

/** تبريرٌ بلا أدوار المتّهمين — لكلّ ما يصل غيرَ الموثوقين. */
export function publicJustification(jd: any): any {
  if (!jd || typeof jd !== 'object') return jd;
  return {
    ...jd,
    accused: Array.isArray(jd.accused) ? jd.accused.map(stripRole) : jd.accused,
    canJustifyList: Array.isArray(jd.canJustifyList) ? jd.canJustifyList.map(stripRole) : jd.canJustifyList,
    candidates: Array.isArray(jd.candidates) ? jd.candidates.map(stripRole) : jd.candidates,
  };
}

/** نتيجةُ الإقصاء قبل الكشف: مَن خرج (الأرقام) لا أدوارُهم ولا الأسباب ولا الصفقة. */
export function publicPendingResolution(state: any): any {
  const pr = state?.pendingResolution;
  if (!pr) return pr;
  return state.eliminationRevealed ? { ...pr } : { eliminated: pr.eliminated || [], type: pr.type };
}

/**
 * يُسقط الحالةَ لهاتف لاعب. `viewerSeat` = مقعدُ المستلِم (أو null لمن لا مقعد له).
 *
 * يُبقي ما تحتاجه واجهتا اللاعب: الروستر (بلا أدوار الأحياء ولا هواتف غيره)، والطور،
 * والنقاش والتصويت والسحب، والتبرير بلا أدوار المتّهمين، وإعداداتٍ علنيّة بلا رمز
 * شاشة العرض. ويُسقط كلَّ ما عداها — قائمةُ سماحٍ لا قائمةُ منع.
 */
export function projectStateFor(state: any, viewerSeat: number | null): any {
  if (!state || typeof state !== 'object' || !Array.isArray(state.players)) return state;
  const hidden = unrevealedDeadSeats(state);
  const started = !!state.rolesConfirmed || !PRE_GAME_PHASES.has(state.phase);

  const out: any = {};
  for (const k of STATE_PUBLIC_KEYS) if (state[k] !== undefined) out[k] = state[k];

  out.players = state.players.map((p: any) => {
    const q: any = {};
    for (const k of PLAYER_PUBLIC_KEYS) if (p[k] !== undefined) q[k] = p[k];
    // 👁️ ميّتٌ لم يُكشف كرتُه حيٌّ في كلّ هاتف — صاحبُه أيضاً: هاتفُ ضحيّة القنبلة كان
    //    يُعلن موتَها (فيفضح أنّ المُقصى شيخُ المافيا) قبل «كشف الأدوار»
    if (hidden.has(Number(p.physicalId)) && p.isAlive === false) q.isAlive = true;
    if (viewerSeat != null && p.physicalId === viewerSeat) {
      q.phone = p.phone ?? null;
      q.role = started ? (p.role ?? null) : null;
    } else {
      q.role = p.isAlive === false && !hidden.has(Number(p.physicalId)) ? (p.role ?? null) : null;
    }
    return q;
  });

  if (Array.isArray(state.spectators)) {
    out.spectators = state.spectators.map((s: any) => ({
      physicalId: s.physicalId, name: s.name, playerId: s.playerId ?? null, gender: s.gender ?? null,
      avatarUrl: s.avatarUrl ?? null, rankTier: s.rankTier ?? null, cosmetics: s.cosmetics ?? null,
      joinedAt: s.joinedAt, addedBy: s.addedBy,
    }));
  }

  if (state.config) {
    // رمزُ شاشة العرض كان يصل كلَّ هاتف — وبه يصير الهاتفُ «شاشة عرض» موثوقةً تستقبل كلَّ شيء
    const { displayPin, voiceMeetingId, overrideCode, ...cfg } = state.config;
    void displayPin; void voiceMeetingId; void overrideCode;
    out.config = cfg;
  }

  if (state.justificationData) out.justificationData = publicJustification(state.justificationData);
  if (Array.isArray(state.tiedCandidates)) out.tiedCandidates = state.tiedCandidates.map(stripRole);
  if (state.pendingResolution) out.pendingResolution = publicPendingResolution(state);

  if (state.mayorState?.revealed) {
    const ms = state.mayorState;
    out.mayorState = { mayorPhysicalId: ms.mayorPhysicalId, revealed: true, vetoUsed: ms.vetoUsed, decision: ms.decision, revealedAtRound: ms.revealedAtRound };
  }

  if (Array.isArray(state.confrontations)) {
    out.confrontations = state.confrontations.map((c: any) => ({ ...c, pulseVotes: undefined }));
  }

  if (state.luckyDraw) {
    const ld = state.luckyDraw;
    // الرابحون محسومون لحظةَ السحب — يبقون سرّاً حتّى الكشف على الشاشة
    out.luckyDraw = ld.status === 'revealed' ? ld : { status: ld.status, count: ld.count, poolMode: ld.poolMode, excludeWinners: ld.excludeWinners };
  }

  if (state.phase === 'GAME_OVER') out.winner = state.winner ?? null;
  return out;
}

/** يرسل لكلّ مقبسٍ في الغرفة نسختَه: الموثوق كاملة، واللاعب إسقاطَه، وغيرُهما الإسقاطَ العامّ. */
async function emitProjected(
  io: Server,
  roomId: string,
  event: string,
  state: any,
  wrap: (s: any) => any,
): Promise<void> {
  const base = projectStateFor(state, null);
  io.to(spectatorRoom(roomId)).emit(event, wrap(base));
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (isTrusted(s)) { s.emit(event, wrap(state)); continue; }
    // المقعدُ يُعتمد في غرفته وحدها — مقبسٌ من غرفةٍ أخرى لا يأخذ بيانات مقعدٍ يحمل رقمَه هنا
    const seat = s.data?.role === 'player' && s.data?.roomId === roomId && s.data?.physicalId != null
      ? Number(s.data.physicalId) : null;
    s.emit(event, wrap(seat != null ? projectStateFor(state, seat) : base));
  }
}

/**
 * الإسقاطُ للهواتف والمتفرّجين وحدهم — الموثوقون (الموجّه/الشاشة) لا يستلمونه: يحملون
 * الحالةَ كاملةً أصلاً، والشاشةُ في منتصف مشهدٍ لا يُقاطَع بمزامنةٍ كاملة.
 */
export async function emitStateToPhones(io: Server, roomId: string, event: string, state: any): Promise<void> {
  io.to(spectatorRoom(roomId)).emit(event, projectStateFor(state, null));
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (isTrusted(s)) continue;
    const seat = s.data?.role === 'player' && s.data?.roomId === roomId && s.data?.physicalId != null
      ? Number(s.data.physicalId) : null;
    s.emit(event, projectStateFor(state, seat));
  }
}

/** حمولةٌ للموثوقين وأخرى لغيرهم — لأحداثٍ تحمل سرّاً بعينه (كأدوار المتّهمين). */
export async function emitTrustedVariant(
  io: Server,
  roomId: string,
  event: string,
  trustedPayload: any,
  publicPayload: any,
): Promise<void> {
  io.to(spectatorRoom(roomId)).emit(event, publicPayload);
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) s.emit(event, isTrusted(s) ? trustedPayload : publicPayload);
}

/**
 * 🎬 أسرارُ ما قبل الكشف (2026-09-13): بين «بانتظار القرار» و«كشف الأدوار» تحمل الحالةُ
 *    أدوارَ المُقصَين (pendingResolution.revealedRoles) وأدوارَ جيران القنبلة — بل وجودُ
 *    pendingBomb نفسُه يفضح أنّ المُقصى شيخُ المافيا. تُحذف من كلّ ما يصل غيرَ الموثوقين.
 */
export function stripEliminationSecrets(state: any): any {
  if (!state) return state;
  const out: any = { ...state };
  if (out.pendingResolution) out.pendingResolution = { ...out.pendingResolution, revealedRoles: [], causes: undefined, deal: undefined };
  if (out.pendingBomb) out.pendingBomb = null;
  if (out.heldBombResult) out.heldBombResult = null;
  return out;
}

/**
 * 🎬 «بانتظار القرار» بلا أسرار: الغرفةُ تعرف مَن خرج (الأرقام) لا أدوارَهم ولا القنبلة؛
 *    الموجّه وشاشةُ القاعة يستلمان الحمولةَ كاملةً (الموجّه يحتاج pendingBomb لشاشة القرار).
 *    كان بثّاً عامّاً يحمل revealedRoles وأدوار الجيران قبل الكشف — يُقرأ من أدوات المطوّر على أيّ هاتف.
 */
export async function emitEliminationPending(io: Server, roomId: string, payload: any): Promise<void> {
  const publicPayload = { ...payload, revealedRoles: [], pendingBomb: null, causes: undefined, deal: undefined };
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) s.emit('day:elimination-pending', isTrusted(s) ? payload : publicPayload);
  io.to(spectatorRoom(roomId)).emit('day:elimination-pending', publicPayload);
}

function isTrusted(sock: any): boolean {
  const role = sock?.data?.role;
  return role === 'leader' || role === 'display';
}

/**
 * بثٌّ للموجّه وشاشة العرض **حصراً** — في كلّ الغرف، محلّيّةً كانت أو بعيدة.
 *
 * 🔴 يختلف عن emitLeaderOnly التي تُقيّد في الغرف البعيدة وحدها وتبثّ للجميع
 *    محلّيّاً. ما يُبَثّ للغرفة يصل **كلَّ جهاز لاعب** ولو لم تعرضه الواجهة —
 *    والترشيحُ في العميل ليس أماناً: مَن يفتح أدوات المتصفّح يقرأ الحمولة كاملةً.
 *    كلُّ ما يحمل دوراً أو هدفاً ليليّاً يمرّ من هنا.
 */
export async function emitTrustedOnly(
  io: Server,
  roomId: string,
  event: string,
  payload: any,
): Promise<void> {
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) if (isTrusted(s)) s.emit(event, payload);
}

/**
 * للموجّه حمولةٌ وللشاشة أخرى — أو لا شيء (`null`). ما يكشف **إيقاعَ** اللاعبين (مَن أرسل
 * ومتى) يخصّ الموجّه وحده: الشاشةُ أمام القاعة، وأيُّ أثرٍ فيها لحظةَ الإرسال يفضح صاحبه.
 */
export async function emitLeaderAndDisplay(
  io: Server,
  roomId: string,
  event: string,
  leaderPayload: any,
  displayPayload: any | null,
): Promise<void> {
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    const role = s.data?.role;
    if (role === 'leader') s.emit(event, leaderPayload);
    else if (role === 'display' && displayPayload != null) s.emit(event, displayPayload);
  }
}

// بثّ حدثٍ حمولتُه هي كائن الحالة كاملاً (game:state-sync / game:state-updated …)
// 🔒 في كلّ الغرف: الموثوق كاملة، وكلُّ لاعبٍ إسقاطَه (انظر رأس الملفّ).
export async function emitStateSanitized(
  io: Server,
  roomId: string,
  event: string,
  state: any,
): Promise<void> {
  await emitProjected(io, roomId, event, state, (st) => st);
}

// بثّ game:phase-changed حيث قد تحتوي الحمولة على حقل state يجب تعقيمه.
// الحمولات التي لا تحمل state (مثل { phase, teamCounts }) تمرّ كما هي دون تغيير.
export async function emitPhaseChangedSanitized(
  io: Server,
  roomId: string,
  payload: any,
): Promise<void> {
  const state = payload?.state;
  // 🌙 مِشبكُ نبض الليلة — مكانٌ واحد بدل عشرين نداءً متفرّقاً.
  //    إشارةٌ مكبوحة لا حمولة؛ الحاجزون خارج الغرفة يسحبون لقطتهم.
  void notifyPulseForRoom(io, roomId, state);
  if (!state) {
    io.to(spectatorRoom(roomId)).emit('game:phase-changed', payload);
    io.to(roomId).emit('game:phase-changed', payload); // بلا حالة: لا سرّ فيها
    return;
  }
  // 🔒 في كلّ الغرف — كان المحلّيّ خاماً بأدوار الجميع لحظةَ بدء اللعبة (setup:binding-complete)
  await emitProjected(io, roomId, 'game:phase-changed', state, (st) => ({ ...payload, state: st }));
}

// أحداث لوحة الليدر في الليل الآلي (auto-step-ready/approval/started/progress) تكشف
// هويّة الفاعل ودوره واختياره الحقيقي.
// 🔒 للموثوقين في كلّ الغرف — كان المحلّيّ بثّاً للغرفة كلّها. لا يستمع إليها أيُّ عميل
//    لاعب (الموجّه ومضيف الغرفة البعيدة وحدهما). `isRemote` باقٍ في التوقيع للتوافق.
export async function emitLeaderOnly(
  io: Server,
  roomId: string,
  event: string,
  payload: any,
  isRemote: boolean | undefined,
): Promise<void> {
  void isRemote;
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (isTrusted(s)) s.emit(event, payload);
  }
}

// ملخّص الصباح يحمل مصفوفة اللاعبين كاملةً بأدوارهم، وفاعلي الليل (performerPhysicalId)،
// وحالةَ السفّاح.
// 🔒 للموثوقين في كلّ الغرف — حتّى نسخةُ الغرف البعيدة «المعقّمة» كانت تكشف الفاعلين.
//    ولا يستمع إليها عميلُ لاعب: الموجّه ومضيف الغرفة البعيدة وحدهما.
export async function emitMorningRecapSanitized(
  io: Server,
  roomId: string,
  payload: any,
  isRemote: boolean | undefined,
): Promise<void> {
  void isRemote;
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (isTrusted(s)) s.emit('night:morning-recap', payload);
  }
}
