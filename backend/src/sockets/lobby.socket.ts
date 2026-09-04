// ══════════════════════════════════════════════════════
// 🟢 أحداث اللوبي (Lobby Socket Events)
// المرجع: docs/02_LOBBY_AND_SETUP.md
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { notifyPulseForRoom } from './activity-pulse.socket.js';
import { notifyScheduleDrift } from '../services/activity-pulse.notify.js';
import {
  verifyDisplayToken, displayAuthEnforced, pinAttemptKeyFromSocket, pinLockState, recordPinFailure, clearPinFailures, pinEquals, mintDisplayToken,
} from '../services/display-auth.service.js';
import { projectDisplayState } from '../services/display-state.projection.js';
import { createRoom, addPlayer, updatePlayer, updateRoom, getRoom, getRoomByCode, bindRole, unbindRole, setPhase, Phase, presentPlayers, getSpectators, findSpectator } from '../game/state.js';
import type { Spectator } from '../game/state.js';
import { allocateSeat } from '../game/seat-allocator.js';
import { reshuffleSeating } from '../game/seating/engine.js';
import type { SeatConstraints } from '../game/seat-allocator.js';
import { generateRoles, validateRoleDistribution, Role, getTeamCounts, isMafiaRole, MAFIA_ROLES, ROLE_NAMES_AR } from '../game/roles.js';
import { generateRolesDynamic } from '../game/dynamic-role-generator.js';
import { getGameState, setGameState, deleteGameState } from '../config/redis.js';
import { createMatch, finalizeIfDecided } from '../services/match.service.js';
import { createSession, addPlayerToSession, getSessionPlayers, removePlayerFromSession, closeSession, unlinkSessionFromActivity, deleteSession, remapSessionPlayerSeats, updateSessionMaxPlayers } from '../services/session.service.js';
import { remapPhysicalIds, validateRenumberChanges } from '../game/seat-remap.js';
import { samePhone } from '../utils/phone.util.js';
import { mergeActivityPins } from '../game/seat-merge.js';
import { dealLockedList } from '../game/deal-engine.js';
import { resolveRoomCapacity, clampCapacity } from '../services/capacity.service.js';
import { startGameTimer, clearGameTimer, getRemainingSeconds, restoreGameTimer } from '../game/game-timer.js';
import { initTwinState, getSiblingInfoFor } from '../game/twin-engine.js';
import { initMayorState } from '../game/mayor-engine.js';
import { initPhoenixState } from '../game/phoenix-engine.js';
import { oneNightResumeFor } from './night-one.socket.js';
import { applyRR } from '../services/progression.service.js';
import { getProgressionConfig } from '../routes/progression-settings.routes.js';
import { sendPushToPlayer } from '../services/fcm.service.js';
import { getDB } from '../config/db.js';
import { matchPlayers, cheatSignals } from '../schemas/game.schema.js';
import { eq, sql, and } from 'drizzle-orm';
import { emitStateSanitized, emitPhaseChangedSanitized, emitTrustedOnly, spectatorRoom, stripSecrets } from './broadcast.util.js';
import { buildAffinityPairs, loadPairRules, mergeRulesIntoAffinity, upsertPairRule } from '../services/seat-affinity.service.js';
import { personKey, pairKey } from '../game/seating/types.js';

export const activeRooms: Map<string, { roomId: string; roomCode: string; gameName: string; playerCount: number; maxPlayers: number; displayPin: string; activityId?: number; activityName?: string }> = new Map();

/**
 * ✅ حقيقة حضورٍ واحدة: دخول الغرفة يعلّم الحجز حاضراً فوراً.
 *
 * كان الحضور يُعلّم يدويّاً على الباب أو يُستنتَج بزرٍّ بعد الليلة، فلا موظّف الباب
 * يعرف من جلس فعلاً ولا الليدر يعرف من عُلّم حاضراً ولم يدخل. لا يرمي أبداً.
 * المطابقة بالحساب ثمّ بآخر تسعة أرقام — ولا مطابقة بالاسم («محمد» يُعلّم غيره).
 */
export async function markArrivalAttended(
  activityId: number | undefined,
  playerId: number | null,
  phone: string | null,
  _name?: string,
): Promise<void> {
  if (!activityId) return;
  const db = getDB();
  if (!db) return;
  try {
    const digits = String(phone || '').replace(/\D/g, '');
    const tail = digits.length >= 9 ? digits.slice(-9) : '';
    if (!playerId && !tail) return;
    await db.execute(sql`
      UPDATE reservations SET attended = TRUE
      WHERE activity_id = ${activityId}
        AND (attended IS NULL OR attended = FALSE)
        AND (
          (${playerId}::int IS NOT NULL AND player_id = ${playerId}::int)
          OR (${tail} <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 9) = ${tail})
        )
    `);
  } catch (e: any) {
    console.warn('⚠️ markArrivalAttended skipped:', e.message);
  }
}


// 🔊 قائمة بيضاء لدوالّ مرآة الأصوات (display → leader) — تطابق أسماء دوالّ soundManager العامّة
const SOUND_MIRROR_FNS = new Set([
  'playGameSound', 'playAmbientSound', 'stopAmbientSound', 'duckAmbient', 'unduckAmbient',
  'playEventSound', 'playEliminationSound', 'playNightStepAmbient', 'playDrumroll', 'playImpactBoom',
  'stopOneShotSounds',
  // 🎚️ تغيير مستوى فراش الخلفيّة وهو يعمل — لا ينفع مستوىً يسري على «المرّة القادمة»
  'setAmbientVolume',
  // 🎚️ مستوى فئةٍ كاملة: يسري على ما يعمل الآن، وعلى ما تعزفه الشاشةُ بنفسها
  //    (نغمةُ النصر المشتراة) — تلك لا رسالةَ صوتٍ لها فلا مستوى يركبها.
  'setCategoryLevel',
]);

// 🔒 فتح مؤقّت للأدوات الحسّاسة (تعديل الأرقام/الأسماء) — يتطلب رقماً سرّياً يُضبط في env (RENUMBER_SECRET).
// يُخزَّن وقت انتهاء الصلاحية على الاتصال نفسه (socket.data)، فلا يدوم بعد قطع الاتصال أو انتهاء المدة.
const TOOLS_UNLOCK_MS = 10 * 60 * 1000; // 10 دقائق
/**
 * 🔑 فتحُ الأدوات مفهرساً بهويّة الموظّف — يعيش عبر انقطاعات الاتصال.
 * كان مخزَّناً على socket.data وحده، فينقطع الـWi-Fi في القاعة فيُطالَب الليدر
 * بالسرّ من جديد عند أوّل نقلة، وفي ذروة الوصول يتكرّر ذلك مراراً.
 */
const toolsUnlockByStaff = new Map<string, number>();
function toolsUnlocked(socket: any): boolean {
  const now = Date.now();
  if ((socket?.data?.toolsUnlockedUntil || 0) > now) return true;
  // سقوطٌ على الفتح المفهرس بالموظّف: نفس الشخص على اتّصالٍ جديد بعد انقطاع
  const staffId = socket?.data?.authStaff?.id;
  if (!staffId) return false;
  const until = toolsUnlockByStaff.get(String(staffId)) || 0;
  if (until <= now) { toolsUnlockByStaff.delete(String(staffId)); return false; }
  socket.data.toolsUnlockedUntil = until;   // يُرطَّب على الاتصال الجديد
  return true;
}

// ══════════════════════════════════════════════════════
// 🕵️ رصد سلوك اللاعب (مكافحة الغش) — البنية العامّة
// ══════════════════════════════════════════════════════
// `app_left`     : اللاعب خرج **الآن** (بلا مدّة بعد) — يُسجَّل فور الانقطاع.
// `app_departure`: غيابٌ **مكتمل** بمدّته — يُسجَّل عند العودة. هو ما تُحسب عليه الإحصاءات.
// الفصل بينهما هو ما يجعل «غادر ولم يعد» مرئيّاً: كان يختفي تماماً لأن كلا العميلين
// (ويب/موبايل) لا يبثّان إلا على حافة العودة، والخادم لم يكن يرصد الانقطاع إطلاقاً.
export type CheatKind = 'app_departure' | 'app_left' | 'screenshot' | 'screen_recording';

/** مفتاح Redis لغياباتٍ مفتوحة في غرفة: physicalId → لحظة الخروج وسياقها */
const absenceKey = (roomId: string) => `absence:${roomId}`;

/**
 * المسار الوحيد لتسجيل إشارة اشتباه — بلا اعتمادٍ على سوكِت حيّ.
 * يبثّ للّيدر، ويخزّن الصفّ، ويسجّل عملية مراقبة.
 */
export async function recordCheatSignalFor(
  io: Server, roomId: string, physicalId: number,
  kind: CheatKind, weight: number, details: Record<string, any>, labelAr: string,
): Promise<void> {
  if (!roomId || !physicalId) return;
  const state = await getGameState(roomId);
  if (!state || state.phase === 'GAME_OVER') return;         // خارج اللعب لا معنى للإشارة
  const player = state.players.find((p: any) => p.physicalId === physicalId);
  if (!player?.role) return;
  const mafia = isMafiaRole(player.role as Role);
  const team = mafia ? 'MAFIA' : (player.role === 'JESTER' || player.role === 'ASSASSIN') ? 'NEUTRAL' : 'CITIZEN';
  const teamAr = mafia ? 'المافيا' : team === 'NEUTRAL' ? 'محايد' : 'المواطنون';
  const now = Date.now();

  // 🧭 سياقٌ يرفع قيمة التحليل كثيراً ولا يكلّف شيئاً: المرحلة والجولة وحالة الحياة
  //    وعدد الأحياء (مقام قاعدة «استراحة عامّة» التي تُميّز الضجيج عن التواطؤ).
  const enriched = {
    ...details,
    phase: state.phase, round: state.round ?? 0,
    alive: player.isAlive !== false,
    aliveCount: state.players.filter((p: any) => p.isAlive !== false).length,
  };

  // بثّ فوريّ للّيدر وحده (يحمل الدور — لا يُبثّ للغرفة)
  const allSockets = await io.in(roomId).fetchSockets();
  for (const s of allSockets) {
    if ((s as any).data?.role === 'leader') {
      s.emit('leader:cheat-signal', {
        roomId, physicalId, kind, weight, labelAr,
        name: player.name, role: player.role, team, teamAr,
        avatarUrl: (player as any).avatarUrl || null, details: enriched, at: now,
      });
    }
  }

  try {
    const db = getDB();
    if (db) {
      await db.insert(cheatSignals).values({
        matchId: (state as any).matchId ?? null,
        roomId, activityId: (state as any).activityId ?? null,
        playerId: (player as any).playerId ?? null,
        physicalId, playerName: player.name, role: player.role, team,
        kind, weight, details: enriched,
      } as any);
    }
  } catch { /* التخزين لا يحجب التنبيه */ }

  try {
    const { logStaffAction } = await import('../services/staff-action-log.service.js');
    const roleAr = ROLE_NAMES_AR[player.role as Role] || player.role;
    logStaffAction({
      source: 'socket',
      action: `cheat:${kind === 'app_departure' ? 'app-departure' : kind === 'app_left' ? 'app-left' : kind === 'screenshot' ? 'screenshot' : 'screen-recording'}`,
      category: 'MONITORING', labelAr, outcome: 'success',
      roomId, roomCode: (state as any).roomCode, matchId: (state as any).matchId,
      activityId: (state as any).activityId, targetPhysicalId: physicalId,
      targetName: `${player.name} — ${roleAr}`,
      details: { ...enriched, physicalId, role: player.role, team, weight },
    });
  } catch { /* غير حاجب */ }
}

/**
 * 🚪 فتح غياب: اللاعب انقطع أثناء لعبةٍ حيّة.
 * يُسجَّل فوراً (`app_left`) فيبقى أثرٌ دائمٌ حتى لو لم يعد أبداً — وهي الحالة
 * التي كانت غير مرئيّة إطلاقاً. اللحظة تُحفظ في Redis لتُغلَق عند العودة.
 */
export async function openAbsence(
  io: Server, roomId: string, physicalId: number, secretOpen: boolean,
): Promise<void> {
  try {
    const state = await getGameState(roomId);
    if (!state || state.phase === 'GAME_OVER') return;
    const player = state.players.find((p: any) => p.physicalId === physicalId);
    if (!player?.role) return;                                  // قبل ربط الأدوار لا أسرار

    // 🏁 حارس السباق: على iOS يُعلَّق التطبيق فيبقى السوكِت القديم «حيّاً» حتى تنتهي
    //    مهلته — وقد يعود اللاعب بسوكِتٍ جديد **قبل** أن يصل حدث انقطاع القديم.
    //    عندها كان يُفتح غيابٌ للاعبٍ حاضرٍ الآن فيظلّ العدّاد يجري بلا نهاية.
    //    إن وُجد سوكِتٌ متّصلٌ بهذا المقعد فاللاعب حاضر — لا غياب.
    const live = await io.in(roomId).fetchSockets();
    if (live.some((s: any) => s.data?.role === 'player' && s.data?.physicalId === physicalId)) {
      console.log(`↩️ openAbsence skipped for #${physicalId} in ${roomId} — player already reconnected (late disconnect)`);
      return;
    }

    const { getAux, setAux } = await import('../config/redis.js');
    const open = (await getAux(absenceKey(roomId))) || {};
    open[String(physicalId)] = { at: Date.now(), secretOpen, phase: state.phase, round: state.round ?? 0 };
    await setAux(absenceKey(roomId), open);

    await recordCheatSignalFor(io, roomId, physicalId,
      'app_left', secretOpen ? 4 : 1,
      { source: 'disconnect', secretOpen, ongoing: true },
      secretOpen ? 'خرج من التطبيق وشاشة السرّ مفتوحة' : 'خرج من التطبيق (لم يعد بعد)');
  } catch (e: any) {
    console.warn('⚠️ openAbsence failed:', e?.message || e);
  }
}

/**
 * 🚪 إغلاق غياب: اللاعب عاد. يحسب المدّة الحقيقيّة من لحظة الانقطاع المحفوظة
 * (لا من قياس الجهاز) ويسجّلها كغيابٍ مكتمل. يعيد true إن أُغلق غيابٌ فعلاً.
 */
export async function closeAbsence(
  io: Server, roomId: string, physicalId: number,
): Promise<boolean> {
  try {
    const { getAux, setAux } = await import('../config/redis.js');
    const open = (await getAux(absenceKey(roomId))) || {};
    const rec = open[String(physicalId)];
    if (!rec?.at) return false;
    delete open[String(physicalId)];
    await setAux(absenceKey(roomId), open);

    const durationMs = Math.max(0, Math.min(600000, Date.now() - Number(rec.at)));
    const secs = Math.round(durationMs / 1000);
    // نفس نموذج الوزن المستعمل في المسار الذي يبلّغه الجهاز — كي تتقارن الإشارتان
    let weight = 1;
    if (rec.secretOpen) weight += 3;
    if (durationMs > 30000) weight += 2; else if (durationMs > 10000) weight += 1;

    await recordCheatSignalFor(io, roomId, physicalId,
      'app_departure', weight,
      { durationMs, secretOpen: !!rec.secretOpen, source: 'disconnect', departedAt: Number(rec.at) },
      `عاد بعد غياب ${secs}ث${rec.secretOpen ? ' (خرج وشاشة السرّ مفتوحة)' : ''}`);
    return true;
  } catch (e: any) {
    console.warn('⚠️ closeAbsence failed:', e?.message || e);
    return false;
  }
}

// ══════════════════════════════════════════════════════
// 🪑 نقل المقاعد أثناء اللعب — البنية المساندة
// ══════════════════════════════════════════════════════

// قفل تسلسل لكل غرفة: عملية نقل واحدة في كل لحظة (إعادة الترقيم تلمس الحالة كلها)
const seatMoveInFlight = new Set<string>();

export interface SeatMoveHazard {
  kind: 'BOMB' | 'VOTING' | 'NIGHT_STEP' | 'DECISION_WINDOW' | 'TIEBREAKER';
  message: string;
  blocking?: boolean;   // true ⇒ يُمنع النقل حتى يُحسم (لا يكفي التأكيد)
}

/**
 * يرصد «القرار الجاري» الذي يتقاطع مع إعادة الترقيم.
 * القاعدة: النقل مسموح في كل المراحل — لكن ما يغيّر نتيجةَ قرارٍ منظورٍ أمام الليدر يُمنع،
 * وما يحتاج انتباهه فقط يُمرَّر بتأكيد صريح.
 */
/**
 * يعدّ التجاورات المخالفة الآن: كم زوجاً متقارباً يجلس على بُعد مقعد واحد.
 * يُستعمل لعرض «قبل/بعد» في معاينة إعادة الترتيب، ولإظهار زرّ «رتّب» عند اللزوم.
 */
export function countAdjacencyIssues(state: any, affinity?: Map<string, number>): number {
  if (!affinity || affinity.size === 0) return 0;
  const cap = state.config?.maxPlayers || 27;
  const bySeat = new Map<number, any>();
  for (const p of state.players) bySeat.set(p.physicalId, p);
  let n = 0;
  for (const p of state.players) {
    const right = p.physicalId === cap ? 1 : p.physicalId + 1;
    const other = bySeat.get(right);
    if (!other) continue;
    const w = affinity.get(pairKey(
      personKey({ playerId: p.playerId, phone: p.phone, name: p.name }),
      personKey({ playerId: other.playerId, phone: other.phone, name: other.name }),
    )) ?? 0;
    if (w >= 0.3) n++;
  }
  return n;
}

export function detectSeatMoveHazard(state: any): SeatMoveHazard | null {
  // 💣 القنبلة: هدفاها يُحدَّدان بالجيرة الرقمية، والنقل يغيّر الجيران — فيتبدّل الضحايا
  //    الذين يراهم الليدر على شاشته الآن. الحسم ثوانٍ، فالمنع أنظف من إعادة الحساب.
  if (state.pendingBomb) {
    return { kind: 'BOMB', blocking: true,
      message: 'احسم قدرة القنبلة أولاً — النقل الآن يغيّر جارَي شيخ المافيا فيبدّل ضحايا القنبلة' };
  }

  // 🗳️ تصويت مفتوح بأصوات مُدلاة: الأصوات تتبع أصحابها بإعادة الربط، لكن أجهزة اللاعبين
  //    تعرض أرقاماً قديمة لحظةَ التصويت → تأكيد صريح مع إظهار عدد الأصوات.
  const votesCast = Object.keys(state.votingState?.playerVotes || {}).length;
  if (state.phase === Phase.DAY_VOTING && votesCast > 0) {
    return { kind: 'VOTING',
      message: `التصويت مفتوح و${votesCast} صوتاً مُدلى — ستتبع الأصوات أصحابها، وسيُطلب من اللاعبين تحديث شاشاتهم` };
  }

  // ⚖️ كسر التعادل المعروض
  if (state.phase === Phase.DAY_TIEBREAKER && (state.tiedCandidates?.length || 0) > 0) {
    return { kind: 'TIEBREAKER', message: 'كسر التعادل معروض الآن — تأكّد قبل النقل' };
  }

  // 🌙 خطوة ليل مفتوحة تنتظر منفّذاً: تُعاد للسوكِت الصحيح بعد النقل، لكن نافذة
  //    الطُّعم عند بقية اللاعبين تُغلق وتُبنى من جديد → تأكيد.
  if (state.phase === Phase.NIGHT && (state.currentNightStep || state.nightStep || state.autoNightPerformerId)) {
    return { kind: 'NIGHT_STEP',
      message: 'خطوة الليل مفتوحة — ستُعاد للاعب المعنيّ بعد النقل وتُحدَّث شاشات الجميع' };
  }

  // 👮‍♀️🎩 نافذة قرار مفتوحة (الشرطية جاهزة أو نافذة العمدة)
  if ((state.policewomanState?.isReady && !state.policewomanState?.isUsed) || state.mayorState?.pendingDecision) {
    return { kind: 'DECISION_WINDOW', message: 'هناك نافذة قرار مفتوحة — ستُغلق وتُعاد لصاحبها بعد النقل' };
  }

  return null;
}

/**
 * إعادة ترقيم سجلّ دردشة المافيا السرّية — يعيش في مفتاح Redis منفصل
 * (aux:mafia-chat) فلا يمسّه جوّال حالة اللعبة، فتنكسر نسبة الرسائل بعد التبديل.
 */
export async function remapMafiaChatSeats(roomId: string, idMap: Map<number, number>): Promise<void> {
  if (!idMap.size) return;
  try {
    const { getAux, setAux } = await import('../config/redis.js');
    const key = `mafia-chat:${roomId}`;
    const msgs = await getAux(key);   // getAux يعيد القيمة مفكوكة أصلاً
    if (!Array.isArray(msgs) || msgs.length === 0) return;
    let changed = 0;
    for (const m of msgs) {
      if (typeof m?.physicalId === 'number' && idMap.has(m.physicalId)) {
        m.physicalId = idMap.get(m.physicalId);
        changed++;
      }
    }
    if (changed > 0) {
      await setAux(key, msgs);        // setAux يتولّى التحويل
      console.log(`🗣️ Mafia chat: remapped ${changed} message seat(s) after seat move in ${roomId}`);
    }
  } catch (e: any) {
    console.warn('⚠️ Mafia chat seat remap skipped:', e?.message || e);
  }
}

/**
 * إعادة الدفع الخاصّة بعد النقل: كل لاعب متأثّر يستعيد دوره وفريقه وتوأمه وعقوده،
 * وتُعاد خطوة الليل الجارية إلى السوكِت الصحيح.
 * بدونها تبقى شاشة الطُّعم مفتوحة عند من ليس منفّذاً، أو تضيع الخطوة عن صاحبها.
 */
export async function republishAfterSeatMove(
  io: Server, roomId: string, state: any, affectedSeats: number[],
): Promise<void> {
  try {
    const shouldShowRole = state.rolesConfirmed
      || (state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.ROLE_BINDING);
    if (!shouldShowRole) return;

    const sockets = await io.in(roomId).fetchSockets();
    for (const seat of affectedSeats) {
      const player = state.players.find((p: any) => p.physicalId === seat);
      if (!player) continue;
      const target = sockets.find((s: any) => s.data?.role === 'player' && s.data?.physicalId === seat);
      if (!target) continue;

      // الدور + فريق المافيا + التوأم
      const mafiaTeam = (player.role && isMafiaRole(player.role as Role) && state.config.allowMafiaReveal !== false)
        ? state.players
            .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false && p.physicalId !== seat)
            .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: p.role, avatarUrl: p.avatarUrl || null }))
        : undefined;

      target.emit('player:role-assigned', {
        role: player.role || null,
        physicalId: seat,
        mafiaTeam,
        sibling: getSiblingInfoFor(state, seat),
      });

      // 🔪 عقود السفّاح
      if (state.assassinState?.assassinPhysicalId === seat) {
        target.emit('assassin:contracts-update', {
          contracts: state.assassinState.contracts,
          completedCount: state.assassinState.completedCount,
          totalRequired: state.assassinState.totalRequired,
        });
      }
    }

    // 🌙 خطوة الليل الجارية: تُعاد لكل اللاعبين ليعيدوا اشتقاق منفّذ/طُعم بالأرقام الجديدة
    if (state.phase === Phase.NIGHT && (state.nightStep || state.currentNightStep)) {
      io.to(roomId).emit('night:refresh-required', { reason: 'seat-move' });
    }
  } catch (e: any) {
    console.warn('⚠️ republishAfterSeatMove failed (clients will self-heal via poll):', e?.message || e);
  }
}

// 📐 تحميل مقاعد قالب الفعالية إلى حالة الغرفة (المقاعد المثبّتة + المؤخّرة + الأبواب + سعة المقاعد).
// يُستدعى عند إنشاء الغرفة لتظهر «المقاعد المحجوزة» فوراً في الغرفة الفارغة (قبل جلوس أي لاعب) —
// بدلاً من تحميلها كسولاً عند أول توزيع مقعد. الاستدعاء idempotent. لا يحفظ الحالة (المُستدعي يحفظ).
async function loadSeatTemplateIntoState(state: any): Promise<boolean> {
  const db = getDB();
  const activityId = state?.activityId;
  if (!activityId || !db) return false;
  try {
    const [actRow] = await db.execute(sql`
      SELECT seat_template_id, seat_assignments FROM activities WHERE id = ${activityId} LIMIT 1
    `).then((r: any) => (r.rows || r || []));
    if (!actRow?.seat_template_id) return false;
    const [tplRow] = await db.execute(sql`
      SELECT pinned_seats, reserved_tail_count, total_seats, layout_config FROM seat_templates
      WHERE id = ${actRow.seat_template_id} AND deleted_at IS NULL LIMIT 1
    `).then((r: any) => (r.rows || r || []));
    if (!tplRow) return false;
    const templatePinned = Array.isArray(tplRow.pinned_seats) ? tplRow.pinned_seats : JSON.parse(tplRow.pinned_seats || '[]');
    // 🪑 تخصيص النشاط المؤقّت يُدمج فوق تثبيت القالب (النشاط يتفوّق)
    const activityPins = Array.isArray(actRow.seat_assignments) ? actRow.seat_assignments : JSON.parse(actRow.seat_assignments || '[]');
    const pinnedSeats = mergeActivityPins(templatePinned, activityPins);
    const reservedTailSeats = Number(tplRow.reserved_tail_count || 0);
    const templateTotalSeats = Number(tplRow.total_seats || 0);
    let doors: any[] = [];
    let doorSeats: number[] = [];
    const layout = typeof tplRow.layout_config === 'string'
      ? (tplRow.layout_config ? JSON.parse(tplRow.layout_config) : null)
      : tplRow.layout_config;
    if (layout) {
      doors = Array.isArray(layout.doors) ? layout.doors : [];
      doorSeats = Array.isArray(layout.doorSeats)
        ? layout.doorSeats.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];
    }
    // سعة المقاعد من القالب (القالب يفرض السعة الافتراضية) — إلا إذا عدّلها الليدر يدوياً
    if (templateTotalSeats >= 6 && !state.config.maxPlayersManual) {
      const targetMax = Math.min(templateTotalSeats, 50);
      if (targetMax !== state.config.maxPlayers) {
        state.config.maxPlayers = targetMax;
        const r = activeRooms.get(state.roomId);
        if (r) r.maxPlayers = targetMax;
        // 🗄️ write-through: اتساق DB مع سعة القالب
        if (state.sessionId) { updateSessionMaxPlayers(state.sessionId, targetMax).catch(() => {}); }
      }
    }
    state.pinnedSeats = pinnedSeats;
    state.reservedTailSeats = reservedTailSeats;
    state.doors = doors;
    state.doorSeats = doorSeats;
    console.log(`📐 [template] Preloaded seat template #${actRow.seat_template_id} into room ${state.roomId}: ${pinnedSeats.length} pinned (${activityPins.length} من تخصيص النشاط), ${reservedTailSeats} tail, ${doorSeats.length} doorSeats`);
    return true;
  } catch (e: any) {
    console.warn('⚠️ loadSeatTemplateIntoState failed:', e.message);
    return false;
  }
}

// 🔄 تحديث صريح لبيانات القالب في غرفة LOBBY (دمج آمن + تقرير تعارضات).
// يُستدعى من room:resync-template عندما يُعدّل الأدمن القالب بعد إنشاء الغرفة.
// لا يطرد لاعباً ولا يعيد جلوسه تلقائياً — يبلّغ عن التعارضات فقط ليقرّرها الليدر.
async function resyncSeatTemplate(state: any): Promise<{
  ok: boolean; reason?: string; conflicts: string[]; capacityWarning?: string; pinned: number; deleted?: boolean;
}> {
  const db = getDB();
  const activityId = state?.activityId;
  const conflicts: string[] = [];
  if (!activityId || !db) return { ok: false, reason: 'no-activity', conflicts, pinned: 0 };

  const [actRow] = await db.execute(sql`SELECT seat_template_id, seat_assignments FROM activities WHERE id = ${activityId} LIMIT 1`).then((r: any) => (r.rows || r || []));
  if (!actRow?.seat_template_id) return { ok: false, reason: 'no-template', conflicts, pinned: 0 };
  const [tplRow] = await db.execute(sql`
    SELECT pinned_seats, reserved_tail_count, total_seats, layout_config FROM seat_templates
    WHERE id = ${actRow.seat_template_id} AND deleted_at IS NULL LIMIT 1
  `).then((r: any) => (r.rows || r || []));
  if (!tplRow) return { ok: false, reason: 'template-deleted', deleted: true, conflicts, pinned: 0 }; // لا نطمس اللقطة

  const templatePinned: any[] = Array.isArray(tplRow.pinned_seats) ? tplRow.pinned_seats : JSON.parse(tplRow.pinned_seats || '[]');
  // 🪑 دمج تخصيص النشاط المؤقّت فوق تثبيت القالب (النشاط يتفوّق)
  const activityPins: any[] = Array.isArray(actRow.seat_assignments) ? actRow.seat_assignments : JSON.parse(actRow.seat_assignments || '[]');
  const newPinned: any[] = mergeActivityPins(templatePinned, activityPins);
  const newTail = Number(tplRow.reserved_tail_count || 0);
  const newTotal = Number(tplRow.total_seats || 0);
  const layout = typeof tplRow.layout_config === 'string' ? (tplRow.layout_config ? JSON.parse(tplRow.layout_config) : null) : tplRow.layout_config;
  const newDoors = layout && Array.isArray(layout.doors) ? layout.doors : [];
  const newDoorSeats = layout && Array.isArray(layout.doorSeats) ? layout.doorSeats.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];

  const normPhone = (p?: string) => { if (!p) return ''; let c = p.replace(/[\s\-()+]/g, ''); if (c.startsWith('00962')) c = c.slice(5); else if (c.startsWith('962')) c = c.slice(3); return c.startsWith('0') ? c : '0' + c; };
  const matchPin = (pin: any, pl: any) =>
    (pin.playerId && pl.playerId && Number(pin.playerId) === Number(pl.playerId)) ||
    (!!normPhone(pin.phone) && normPhone(pin.phone) === normPhone(pl.phone)) ||
    (pin.playerName && pl.name && String(pin.playerName).trim().toLowerCase() === String(pl.name).trim().toLowerCase());

  const seated = (state.players || []).filter((p: any) => !p.seatHeld);
  const occupancy = seated.length;
  const seatOf = new Map<number, any>(seated.map((p: any) => [p.physicalId, p]));

  // كشف التعارضات (بلا طرد/إعادة جلوس تلقائي)
  for (const pin of newPinned) {
    const seat = Number(pin.seatNumber);
    const occ = seatOf.get(seat);
    if (occ && !matchPin(pin, occ)) conflicts.push(`المقعد ${seat}: محجوز بالقالب لـ«${pin.playerName || '—'}» بينما يجلس فيه «${occ.name}»`);
    const assignee = seated.find((p: any) => matchPin(pin, p));
    if (assignee && assignee.physicalId !== seat) conflicts.push(`«${assignee.name}» مثبّت للمقعد ${seat} لكنه جالس في المقعد ${assignee.physicalId} — غيّر رقمه يدوياً إن أردت`);
  }

  // السعة: تُحدَّث فقط إن لم تُعدَّل يدوياً ولا تُصغَّر تحت عدد الجالسين
  let capacityWarning: string | undefined;
  if (newTotal >= 6 && !state.config.maxPlayersManual) {
    const target = Math.min(newTotal, 50);
    if (target < occupancy) capacityWarning = `سعة القالب (${target}) أقل من عدد اللاعبين الحاليين (${occupancy}) — لم تُغيَّر.`;
    else if (target !== state.config.maxPlayers) {
      state.config.maxPlayers = target;
      const r = activeRooms.get(state.roomId); if (r) r.maxPlayers = target;
    }
  }

  // تحديث بيانات العرض/التوزيع من القالب الجديد
  state.pinnedSeats = newPinned;
  state.reservedTailSeats = newTail;
  state.doors = newDoors;
  state.doorSeats = newDoorSeats;
  await setGameState(state.roomId, state);
  return { ok: true, conflicts, capacityWarning, pinned: newPinned.length };
}

export function getActiveRooms() {
  return Array.from(activeRooms.values());
}

// ── حذف الغرفة من activeRooms عند انتهاء اللعبة ──
export function markRoomAsFinished(roomId: string) {
  activeRooms.delete(roomId);
}

// ── 📨 كبح دعوات اللعب عن بُعد — على مستوى العمليّة (لا لكل اتصال) لمنع التحايل بفتح عدّة سوكِتات ──
const inviteRateWindow = new Map<number, number[]>();       // مُرسِل → طوابع الدقيقة الأخيرة (≤10/دقيقة)
const inviteDedupe = new Map<string, number>();             // "senderId:inviteeId" → آخر طابع (منع تكرار نفس الدعوة خلال دقيقة)

// ── إعادة بناء activeRooms من Redis عند بدء السيرفر ──
export async function rehydrateActiveRooms(): Promise<void> {
  try {
    const { getAllGameStates } = await import('../config/redis.js');
    const allStates = await getAllGameStates();

    for (const state of allStates) {
      // تخطي البيانات التالفة فقط — GAME_OVER تبقى لأن الليدر قد يريد بدء لعبة جديدة
      if (!state || !state.roomId) continue;

      activeRooms.set(state.roomId, {
        roomId: state.roomId,
        roomCode: state.roomCode || '',
        gameName: state.config?.gameName || 'Unknown',
        playerCount: state.players?.filter((p: any) => !p.seatHeld).length || 0,
        maxPlayers: state.config?.maxPlayers || 10,
        displayPin: state.config?.displayPin || '',
        activityId: state.activityId || undefined,
      });
    }

    // ⏱️ إعادة تسليح مؤقّتات اللعبة — الحرج: مؤقّت اللعبة هو setTimeout في ذاكرة السيرفر،
    // فيضيع عند أيّ إعادة تشغيل/نشر. بدون هذا لا يُعلَن فوز المافيا عند انتهاء الوقت.
    // restoreGameTimer إمّا يُعيد التسليح بالمدة المتبقية أو يُنهي اللعبة فوراً إن مضى الوقت.
    const rehydrateIo = (global as any).io as Server | undefined;
    if (rehydrateIo) {
      for (const state of allStates) {
        if (!state?.roomId || !state.gameTimer) continue;
        if (state.phase === Phase.GAME_OVER || state.phase === Phase.LOBBY) continue;
        try {
          restoreGameTimer(rehydrateIo, state.roomId, state.gameTimer);
        } catch (e: any) {
          console.warn(`⚠️ Failed to restore game timer for ${state.roomId}:`, e?.message);
        }
      }
    }

    if (activeRooms.size > 0) {
      console.log(`♻️  Rehydrated ${activeRooms.size} active room(s) from Redis`);

      // ── جلب أسماء الأنشطة من DB ──
      try {
        const { getDB } = await import('../config/db.js');
        const { inArray } = await import('drizzle-orm');
        const { activities } = await import('../schemas/admin.schema.js');
        const db = getDB();
        if (db) {
          const activityIds = Array.from(activeRooms.values())
            .filter(r => r.activityId)
            .map(r => r.activityId!);

          if (activityIds.length > 0) {
            const uniqueIds = [...new Set(activityIds)];
            const acts = await db.select({ id: activities.id, name: activities.name })
              .from(activities)
              .where(inArray(activities.id, uniqueIds));

            for (const act of acts) {
              for (const [, room] of activeRooms) {
                if (room.activityId === act.id) {
                  room.activityName = act.name;
                }
              }
            }
            console.log(`📛 Loaded activity names for ${acts.length} activity(s)`);
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Failed to load activity names:', err.message);
      }

      // ── إعادة فتح Sessions المغلقة في DB إذا الغرفة لا زالت في Redis ──
      try {
        const { getDB } = await import('../config/db.js');
        const { eq, and, isNull } = await import('drizzle-orm');
        const { sessions } = await import('../schemas/game.schema.js');
        const db = getDB();
        if (db) {
          for (const state of allStates) {
            if (!state || !state.sessionId) continue;
            const [session] = await db.select({ id: sessions.id, isActive: sessions.isActive })
              .from(sessions)
              .where(and(eq(sessions.id, state.sessionId), isNull(sessions.deletedAt)))
              .limit(1);
            if (session && !session.isActive) {
              const updateData: any = { isActive: true, status: 'active' };
              // إعادة ربط activity_id من Redis إذا كان مفقوداً في DB
              if (state.activityId) {
                updateData.activityId = state.activityId;
              }
              await db.update(sessions)
                .set(updateData)
                .where(eq(sessions.id, state.sessionId));
              console.log(`♻️ Reopened closed DB session #${state.sessionId} (room still in Redis, activityId=${state.activityId || 'none'})`);
            }
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Failed to reopen sessions:', err.message);
      }
    } else {
      console.log(`ℹ️  No active rooms found in Redis to rehydrate`);
    }
  } catch (err) {
    console.error('❌ Failed to rehydrate active rooms:', err);
  }
}

export async function seedDummyGame() {
  try {
    console.log('🌱 Seeding Dummy Game for quick testing from lobby.socket.ts...');
    const state = await createRoom('لعبة تجريبية (Auto Seeded)', 10, 2, '2026');
    console.log('🌱 Room created in Redis:', state.roomId);
    
    const names = ['أحمد', 'محمد', 'علي', 'خالد', 'عمر', 'سارة', 'فاطمة', 'تسنيم', 'ريم', 'نور'];
    const genders: ('MALE'|'FEMALE')[] = ['MALE', 'MALE', 'MALE', 'MALE', 'MALE', 'FEMALE', 'FEMALE', 'FEMALE', 'FEMALE', 'FEMALE'];
    
    for (let i = 0; i < 10; i++) {
      await addPlayer(state.roomId, i + 1, names[i], `070000000${i}`, null);
      await updatePlayer(state.roomId, i + 1, { gender: genders[i], dob: '1995-01-01' });
    }
    console.log('🌱 Players inserted successfully!');

    activeRooms.set(state.roomId, {
      roomId: state.roomId,
      roomCode: state.roomCode,
      gameName: state.config.gameName,
      playerCount: 10,
      maxPlayers: state.config.maxPlayers,
      displayPin: state.config.displayPin || '2026',
    });

    console.log(`✅ Dummy Game seeded successfully. RoomId: ${state.roomId}`);
    console.log(`🎮 Current Active Rooms size now: ${activeRooms.size}`);
  } catch (e) {
    console.error('❌ Failed to seed dummy game:', e);
  }
}

export function registerLobbyEvents(io: Server, socket: Socket) {

  // ── إنشاء غرفة جديدة ──────────────────────────
  socket.on('room:create', async (data: {
    gameName: string;
    maxPlayers?: number;
    maxJustifications?: number;
    displayPin?: string;
    activityId?: number;
    existingSessionId?: number;
    sessionCode?: string;
    nightMode?: 'manual' | 'auto'; // جديد: نمط الليل — افتراضي: manual
    maxPenalties?: number; // نظام عقوبات اللاعبين
    penaltyScope?: 'game' | 'room'; // مستوى العقوبات (يطابق GameConfig.penaltyScope)
  }, callback) => {
    try {
      const gameName = data.gameName || 'لعبة مافيا';
      // 🪑 مصدر السعة الموحّد: إدخال الليدر الصريح ← قالب المقاعد ← سعة الفعالية ← 27
      // (نفس منطق REST add-room — services/capacity.service.ts). مفصول كلياً عن عدد الحجوزات.
      const resolvedCapacity = data.maxPlayers || await resolveRoomCapacity(data.activityId);
      const maxPlayers = clampCapacity(resolvedCapacity);

      // إذا فيه sessionCode من DB → نستخدمه ككود للغرفة (توحيد الأكواد)
      const overrideCode = data.existingSessionId && data.sessionCode
        ? data.sessionCode
        : undefined;

      // ── حماية: منع تكرار إنشاء الغرفة في Redis لنفس الجلسة ──
      if (overrideCode) {
        const existingState = await getRoomByCode(overrideCode);
        
        // التحقق أن الغرفة تنتمي لنفس الـ SessionId (لمنع تداخل الغرف)
        if (existingState && existingState.sessionId === data.existingSessionId) {
          console.log(`♻️ Leader re-entered existing active room ${existingState.roomId} for session ${data.existingSessionId}`);
          
          socket.join(existingState.roomId);
          if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; } socket.data.role = 'leader';
          socket.data.roomId = existingState.roomId;

          // 📐 تأكد من تحميل مقاعد القالب (لرومات أُنشئت قبل هذا الإصلاح ولم يُحمَّل لها القالب بعد)
          if (existingState.activityId && (existingState as any).pinnedSeats === undefined) {
            if (await loadSeatTemplateIntoState(existingState)) await setGameState(existingState.roomId, existingState);
          }

          return callback({
            success: true,
            roomId: existingState.roomId,
            roomCode: existingState.roomCode,
            displayPin: existingState.config.displayPin,
            gameName: existingState.config.gameName,
            sessionId: existingState.sessionId || data.existingSessionId,
            activityId: existingState.activityId || data.activityId,
            maxPlayers: existingState.config.maxPlayers,
          });
        } else if (existingState && existingState.sessionId !== data.existingSessionId) {
          console.log(`⚠️ Room Code Collision: Code ${overrideCode} was used by Session ${existingState.sessionId}, but requested for Session ${data.existingSessionId}. Creating new room.`);
        }
      }

      const state = await createRoom(
        gameName,
        maxPlayers,
        data.maxJustifications || 2,
        data.displayPin,
        overrideCode,
        data.maxPenalties ?? 3,
        data.penaltyScope || 'room',
      );

      // 👤 مُنشئ الغرفة (staff) — يُخزَّن على الحالة + الجلسة + المباراة للتمييز عن بقية الأدمن لاحقاً
      const creatorStaffId: number | null = socket.data.authStaff?.id || null;
      (state as any).createdByStaffId = creatorStaffId;
      (state as any).createdByStaffUsername = socket.data.authStaff?.username || null;

      let sessionId: number | null = null;

      if (data.existingSessionId) {
        // ── الغرفة موجودة في DB (من واجهة الإدارة) — لا ننشئ session جديد ──
        sessionId = data.existingSessionId;
        state.sessionId = sessionId;
        state.sessionCode = state.roomCode;
        if (data.activityId) {
          state.activityId = data.activityId;
        }
        // تطبيق نمط الليل لو حدده الليدر
        if (data.nightMode && (data.nightMode === 'manual' || data.nightMode === 'auto')) {
          state.config.nightMode = data.nightMode;
        }
        await setGameState(state.roomId, state);
        console.log(`🔗 Room created using existing Session #${sessionId}`);
      } else {
        // ── إنشاء Session جديد في PostgreSQL ──
        sessionId = await createSession(gameName, state.roomCode, state.config.displayPin, maxPlayers, data.activityId || undefined, creatorStaffId);
        if (sessionId) {
          state.sessionId = sessionId;
          state.sessionCode = state.roomCode;
          if (data.activityId) {
            state.activityId = data.activityId;
          }
          // تطبيق نمط الليل
          if (data.nightMode && (data.nightMode === 'manual' || data.nightMode === 'auto')) {
            state.config.nightMode = data.nightMode;
          }
          await setGameState(state.roomId, state);
        }
      }

      // لا يتم إنشاء لاعبين افتراضيين — الليدر يضيفهم يدوياً

      socket.join(state.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; } socket.data.role = 'leader';
      socket.data.roomId = state.roomId;

      // 📋 سجل: إنشاء غرفة (تسجيل صريح — المُلتقِط لا يملك roomId قبل الإنشاء)
      try {
        const { logStaffAction } = await import('../services/staff-action-log.service.js');
        logStaffAction({
          staffId: creatorStaffId, staffUsername: socket.data.authStaff?.username, staffRole: socket.data.authStaff?.role,
          source: 'socket', action: 'room:create', category: 'ROOM_LIFECYCLE', labelAr: 'إنشاء غرفة', outcome: 'success',
          activityId: data.activityId || null, roomId: state.roomId, roomCode: state.roomCode,
          details: { gameName, maxPlayers, activityId: data.activityId || null },
        });
      } catch { /* غير حاجب */ }

      // تتبع الغرفة النشطة
      activeRooms.set(state.roomId, {
        roomId: state.roomId,
        roomCode: state.roomCode,
        gameName,
        playerCount: 0,
        maxPlayers,
        displayPin: state.config.displayPin,
        activityId: data.activityId || undefined,
      });

      // 📐 تحميل مقاعد القالب فوراً عند إنشاء الغرفة — تظهر «المقاعد المحجوزة» في الغرفة الفارغة مباشرةً
      // (قبل هذا الإصلاح كانت تُحمَّل كسولاً عند أول توزيع مقعد، فلا تظهر لحظة دخول الليدر للغرفة الفارغة).
      if (state.activityId) {
        if (await loadSeatTemplateIntoState(state)) await setGameState(state.roomId, state);
      }

      // جلب اسم النشاط وتحديث activeRooms
      if (data.activityId) {
        import('../config/db.js').then(async ({ getDB }) => {
          const { eq } = await import('drizzle-orm');
          const { activities } = await import('../schemas/admin.schema.js');
          const db = getDB();
          if (!db) return;
          const [act] = await db.select({ name: activities.name }).from(activities).where(eq(activities.id, data.activityId!)).limit(1);
          if (act) {
            const room = activeRooms.get(state.roomId);
            if (room) { room.activityName = act.name; }
          }
        }).catch(() => {});
      }

      callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        displayPin: state.config.displayPin,
        gameName,
        sessionId: sessionId || undefined,
        activityId: data.activityId || undefined,
        maxPlayers: state.config.maxPlayers,
      });
      console.log(`🏠 Room created: ${state.roomId} (code: ${state.roomCode}, session: #${sessionId}, activity: ${data.activityId || 'none'}) — empty, max ${state.config.maxPlayers}`);

      // ── إشعار اللاعبين الحاجزين عند وقت النشاط ──
      if (data.activityId) {
        const notifyBookedPlayers = async () => {
          try {
            const { getDB } = await import('../config/db.js');
            const { eq, and, isNotNull } = await import('drizzle-orm');
            const { bookings } = await import('../schemas/admin.schema.js');
            const db = getDB();
            if (!db) return;

            // جلب الحاجزين مع playerId
            const bookedPlayers = await db.select({
              playerId: bookings.playerId,
              name: bookings.name,
            }).from(bookings)
              .where(and(
                eq(bookings.activityId, data.activityId!),
                isNotNull(bookings.playerId),
              ));

            if (bookedPlayers.length === 0) return;

            // إرسال push لكل الحاجزين
            const ids = bookedPlayers.filter(b => b.playerId).map(b => b.playerId!);
            import('../services/fcm.service.js').then(({ sendPushToPlayers }) => {
              sendPushToPlayers(ids,
                '🎮 النشاط بدأ!',
                `${gameName} — ادخل واختر رقم مقعدك الآن!`,
                'activity_started',
                { roomCode: state.roomCode, url: `/player/join?code=${state.roomCode}` }
              );
            }).catch(() => {});

            console.log(`🔔 Notified ${ids.length} booked players for room ${state.roomId}`);
          } catch (err: any) {
            console.error('❌ Notify booked players error:', err.message);
          }
        };

        // ── إشعار فوري بمجرد فتح الليدر للغرفة ──
        // فتح الليدر للغرفة هو إشارة "ابدأوا الآن"، فنُخطر الحاجزين فوراً للدخول
        // ومعرفة أرقام مقاعدهم (يُستدعى مرّة واحدة عند الإنشاء الجديد للغرفة فقط).
        notifyBookedPlayers();
      }
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── قائمة الألعاب النشطة ──────────────────────
  socket.on('room:list-active', (data: any, callback) => {
    const rooms = getActiveRooms().map(r => ({
      roomId: r.roomId,
      roomCode: r.roomCode,
      gameName: r.gameName,
      playerCount: r.playerCount,
      maxPlayers: r.maxPlayers,
    }));
    callback({ success: true, rooms });
  });

  // ── التحقق من PIN شاشة العرض ──────────────────
  //
  // 🔒 هذا المعالج كان يتجاوز كل ما بُني في مصادقة الشاشة:
  //    يقارن رمزاً من أرقام قليلة **بلا أي قفل**، ثم يمنح
  //    `socket.data.role = 'display'` — وهو الحقل الذي يقرؤه `isTrusted`
  //    ليُرسل الحالة بلا تنقية — ثم يُعيد `getRoom()` **خاماً** بدور كل لاعب.
  //    مُسجَّل لكل اتصال، و`io.use` لا يرفض غير المصادَق. فكان الطريق
  //    الخلفي الذي يُفرغ حراسة مسار REST من معناها.
  //
  //    الآن: نفس العدّاد ونفس القفل ونفس الإسقاط المنقّى الذي يبنيه REST،
  //    ومقارنة ثابتة الزمن، ويُمنح توكن الشاشة كما في المسار الآخر.
  socket.on('room:verify-display-pin', async (data: { roomId: string; pin: string }, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    try {
      const roomId = String(data?.roomId || '');
      const attemptKey = pinAttemptKeyFromSocket(socket, roomId);
      const lock = pinLockState(attemptKey);
      if (lock.locked) {
        return reply({
          success: false,
          error: `محاولات كثيرة — أعد المحاولة بعد ${Math.ceil(lock.retryAfterSec / 60)} دقيقة`,
          retryAfter: lock.retryAfterSec,
        });
      }

      const room = activeRooms.get(roomId);
      if (!room) {
        // ⚠️ غرفة غير موجودة تُعدّ محاولة فاشلة أيضاً — وإلا صار مسحُ
        //    معرّفات الغرف مجّانياً بينما الرمز وحده محمي.
        recordPinFailure(attemptKey);
        return reply({ success: false, error: 'اللعبة غير موجودة' });
      }

      if (!pinEquals(String(room.displayPin ?? ''), String(data?.pin ?? ''))) {
        const after = recordPinFailure(attemptKey);
        return reply({
          success: false,
          error: after.locked ? 'محاولات كثيرة — الرمز مقفل مؤقتاً' : 'الرقم السري غير صحيح',
          ...(after.locked ? { retryAfter: after.retryAfterSec } : {}),
        });
      }
      clearPinFailures(attemptKey);

      socket.join(roomId);
      socket.data.role = 'display';
      socket.data.roomId = roomId;

      const state = await getRoom(roomId);
      reply({
        success: true,
        displayToken: mintDisplayToken(roomId),
        gameName: room.gameName,
        roomCode: room.roomCode,
        playerCount: room.playerCount,
        maxPlayers: room.maxPlayers,
        // 🧹 نفس حقول مسار REST بالضبط — لا حالة خام، ولا حقول لا تحتاجها الشاشة
        state: state ? projectDisplayState(state) : null,
      });
    } catch (err: any) {
      reply({ success: false, error: err.message });
    }
  });

  // ── البحث عن غرفة بالكود ──────────────────────
  socket.on('room:find-by-code', async (data: { roomCode: string }, callback) => {
    try {
      const state = await getRoomByCode(data.roomCode);
      if (!state) {
        return callback({ success: false, error: 'لم يتم العثور على لعبة بهذا الكود' });
      }

      // ── جلب requireTicket فقط (السعة لم تعد من maxCapacity — بل من القالب/الافتراضي 27) ──
      let requireTicket = false;
      if (state.activityId) {
        try {
          const { getDB } = await import('../config/db.js');
          const { activities } = await import('../schemas/admin.schema.js');
          const { eq } = await import('drizzle-orm');
          const db = getDB();
          if (db) {
            const [act] = await db.select({
              requireTicket: activities.requireTicket,
            }).from(activities).where(eq(activities.id, state.activityId)).limit(1);
            if (act) {
              requireTicket = act.requireTicket ?? false;
            }
          }
        } catch (e) { /* DB unavailable */ }
      }

      callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        gameName: state.config.gameName,
        playerCount: state.players.length,
        maxPlayers: state.config.maxPlayers,
        requireTicket,
      });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── انضمام لاعب — توزيع تلقائي للمقعد ──────────────────
  socket.on('room:auto-join', async (data: {
    roomId: string;
    name: string;
    phone?: string;
    playerId?: number;
    gender?: string;
    dob?: string;
    ticketNumber?: string;
    forceJoin?: boolean;
    preferredSeat?: number;
    fix?: any;                 // 📍 قراءة موقع طازجة — سياج الفعاليّة
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'الغرفة غير موجودة' });

      // ── 🌐 بوّابة الانضمام للغرف البعيدة فقط (غرف القاعة لا تتأثّر إطلاقاً) ──
      // تُطبَّق على الوافدين الجدد فقط؛ العائد (موجودٌ في state.players) يمرّ. مجّانيّ أثناء الإطلاق.
      if ((state.config as any)?.isRemote) {
        const joinerPlayerId = socket.data.authPlayer?.playerId;
        // 👑 المُضيف مُوجِّهٌ لا لاعب — لا يجوز أن ينضمّ كلاعب في غرفته (يرى الأدوار كموجّه فتُكسَر النزاهة)
        if (joinerPlayerId && joinerPlayerId === (state.config as any)?.hostPlayerId) {
          return callback({ success: false, error: 'أنت مُضيف هذه الغرفة (مُوجِّه) — لا يمكنك الانضمام كلاعب', code: 'HOST_CANNOT_PLAY' });
        }
        const alreadyIn = joinerPlayerId
          ? state.players.some((p: any) => p.playerId === joinerPlayerId)
          : false;
        if (!alreadyIn) {
          if (!joinerPlayerId) {
            return callback({ success: false, error: 'يجب تسجيل الدخول للانضمام لغرفة عن بُعد' });
          }
          const { getPlayerRemoteAccess, canJoinRemote } = await import('../services/remote-access.service.js');
          const access = await getPlayerRemoteAccess(joinerPlayerId);
          if (!canJoinRemote(access)) {
            return callback({ success: false, error: 'انضمامك للغرف البعيدة يتطلّب اشتراكاً', code: 'REMOTE_SUB_REQUIRED' });
          }
        }
      }

      // ── بوّابة الفيدباك: منع الانضمام لغرفة جديدة عند وجود استبيانات إلزامية معلّقة (مرّت مهلتها) ──
      // يُسمح للاعب العائد لنفس الغرفة بالدخول دون فحص.
      if (data.playerId && !state.players.some((p: any) => p.playerId === data.playerId)) {
        try {
          const { countBlockingPending } = await import('../services/feedback.service.js');
          const blocking = await countBlockingPending(data.playerId);
          if (blocking > 0) {
            return callback({
              success: false,
              error: 'يجب إكمال استبيانات فعالياتك السابقة قبل الانضمام',
              code: 'PENDING_SURVEYS',
              pendingCount: blocking,
              redirect: '/player/feedback',
            });
          }
        } catch (e: any) {
          console.warn('⚠️ feedback gate (join) error:', e.message);
        }
      }

      // ── 📍 بوّابة سياج الفعاليّة ──
      // تُطبّق على **الوافد الجديد وحده**. من هو في state.players أصلاً يمرّ —
      // ومسار العودة (room:rejoin-player) غير محروسٍ أصلاً ويجب ألّا يُحرَس:
      // لاعبٌ سقط اتّصاله وسط اللعبة لا يُطالَب بقراءة GPS ليعود إلى مقعده.
      {
        const joinerId = data.playerId || socket.data.authPlayer?.playerId;
        const alreadySeated = joinerId
          ? state.players.some((p: any) => p.playerId === joinerId)
          : false;
        if (joinerId && !alreadySeated) {
          const { gateCheck } = await import('../services/geofence.service.js');
          const g = await gateCheck({
            playerId: joinerId,
            activityId: (state as any).activityId,
            fix: data.fix,
            gate: 'join',
            isRemote: !!(state.config as any)?.isRemote,
          });
          if (!g.ok) {
            return callback({
              success: false, error: g.message, code: g.reason,
              distanceM: g.distanceM, radiusM: g.radiusM,
            });
          }
        }
      }

      // ══ بوّابة «اللعبة بدأت»: عودةٌ لمقعده، أو دخولٌ متفرّجاً (لا رفض) ══
      const isGameStarted = state.phase !== 'LOBBY' && state.phase !== 'ROLE_GENERATION';
      // 👁️ يُضبط للوافد الجديد أثناء لعبةٍ جارية: يكمل كلّ البوّابات (التذكرة،
      //    الحجز، الغرفة الأخرى، القالب) ثمّ يتفرّع عند التخصيص إلى مقعدٍ محجوز.
      let joinAsSpectator = false;

      if (isGameStarted) {
        // ── فحص: هل هذا لاعب كان في اللعبة ويحاول العودة؟ ──
        // 🔐 الهويّة من التوكن أوّلاً: كانت المطابقة على data.playerId/data.phone
        //    القادمَين من العميل، فأيّ جهازٍ يعرف هاتف غائبٍ يسترجع مقعده ودوره.
        //    والتطبيع كان بإضافة 0 فقط، فرقمٌ بصيغة 962… يُرفض كوافدٍ جديد.
        const authId = socket.data.authPlayer?.playerId;
        const claimedId = authId || data.playerId;
        const existingPlayer =
          (claimedId ? state.players.find((p: any) => p.playerId && p.playerId === claimedId) : undefined) ||
          (data.phone ? state.players.find((p: any) => p.phone === data.phone) : undefined) ||
          (data.phone ? state.players.find((p: any) => samePhone(p.phone, data.phone)) : undefined);

        if (existingPlayer) {
          // ── فك التجميد والحجز عند العودة ──
          let stateChanged = false;
          if (existingPlayer.frozen) {
            existingPlayer.frozen = false;
            existingPlayer.isConnected = true;
            stateChanged = true;
          }
          if (existingPlayer.seatHeld) {
            existingPlayer.seatHeld = false;
            existingPlayer.heldUntil = undefined;
            existingPlayer.isConnected = true;
            stateChanged = true;
          }
          if (stateChanged) {
            await setGameState(data.roomId, state);
            await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
          }

          socket.join(data.roomId);
          socket.data.role = 'player';
          socket.data.roomId = data.roomId;
          socket.data.physicalId = existingPlayer.physicalId;

          console.log(`🛡️ Redirected existing player ${data.name} to seat #${existingPlayer.physicalId} during active game (phase: ${state.phase}, role: ${existingPlayer.role})`);
          return callback({
            success: true,
            assignedSeat: existingPlayer.physicalId,
            gameName: state.config.gameName,
            constraintViolation: false,
            restoredSeat: true,
            isRemote: !!state.config?.isRemote,
          });
        }

        // ── وافدٌ جديد أثناء لعبةٍ جارية → متفرّج بمقعدٍ محجوز، لا رفض ──
        // كان يُردّ بنصٍّ ثابت بلا رمز: الليدر لا يُخطَر، والتذكرة لا تُستهلك،
        // وفي تطبيق فلاتر لا تظهر الرسالة أصلاً (سبينر أبديّ). يكمل الآن بقيّة
        // البوّابات ثمّ يجلس **داخل الحلقة** في الذيل والأبعد عن الأحياء.
        // 🔒 عودةٌ لمتفرّجٍ سبق تسجيله: يُعاد لمقعده نفسه بلا تكرار.
        const already = findSpectator(state, { playerId: claimedId, phone: data.phone });
        if (already) {
          socket.join(spectatorRoom(data.roomId));
          socket.data.role = 'spectator';
          socket.data.roomId = data.roomId;
          socket.data.physicalId = already.physicalId;
          console.log(`👁️ Spectator ${already.name} reconnected to seat #${already.physicalId} (${state.phase})`);
          return callback({
            success: true,
            spectator: true,
            code: 'GAME_IN_PROGRESS',
            assignedSeat: already.physicalId,
            gameName: state.config.gameName,
            phase: state.phase,
            round: state.round,
            restoredSeat: true,
            isRemote: !!state.config?.isRemote,
          });
        }
        joinAsSpectator = true;
        console.log(`👁️ Late arrival ${data.name} → spectator path (phase: ${state.phase})`);
      }

      // ── 1. جلب constraints + requireTicket من DB (السعة تُحسم لاحقاً من القالب/الافتراضي) ──
      let constraints: SeatConstraints | null = null;
      let requireTicket = false;
      if (state.activityId) {
        try {
          const { getDB } = await import('../config/db.js');
          const { activities, tickets: globalTickets } = await import('../schemas/admin.schema.js');
          const { eq, and } = await import('drizzle-orm');
          const db = getDB();
          if (db) {
            const [act] = await db.select({
              requireTicket: activities.requireTicket,
              seatConstraints: activities.seatConstraints,
              basePrice: activities.basePrice,
            }).from(activities).where(eq(activities.id, state.activityId)).limit(1);

            if (act) {
              requireTicket = act.requireTicket ?? false;
              constraints = act.seatConstraints as SeatConstraints | null;
              // ملاحظة: السعة لا تُحسم من maxCapacity — بل من قالب المقاعد (totalSeats) إن وُجد،
              // وإلا تبقى السعة الحالية (افتراضي 27 عند الإنشاء، أو ما عدّله الليدر). مفصولة عن الحجز.

              // ── دمج الأزواج الممنوعة العالمية من جدول blocked_pairs ──
              try {
                const { sql } = await import('drizzle-orm');
                const bpRows = await db.execute(sql`SELECT * FROM blocked_pairs`);
                const globalPairs: any[] = (bpRows as any).rows || bpRows || [];
                if (globalPairs.length > 0) {
                  if (!constraints) constraints = { genderSeparation: false, noAdjacentPairs: [] };
                  if (!constraints.noAdjacentPairs) constraints.noAdjacentPairs = [];
                  for (const gp of globalPairs) {
                    constraints.noAdjacentPairs.push({
                      player1Phone: gp.player1_phone,
                      player1Name: gp.player1_name,
                      player2Phone: gp.player2_phone,
                      player2Name: gp.player2_name,
                    });
                  }
                  // تأكيد تفعيل المحرك
                  if (!constraints.engineEnabled && constraints.noAdjacentPairs.length > 0) {
                    constraints.engineEnabled = true;
                    if (!constraints.constraints) constraints.constraints = [];
                    const hasNAP = constraints.constraints.some((c: any) => c.type === 'NO_ADJACENT_PAIRS');
                    if (!hasNAP) {
                      constraints.constraints.push({
                        type: 'NO_ADJACENT_PAIRS',
                        enabled: true,
                        priority: 1,
                        params: { pairs: constraints.noAdjacentPairs },
                      });
                    }
                  }
                }
              } catch (bpErr: any) {
                console.warn('⚠️ Failed to load global blocked pairs:', bpErr.message);
              }
            }

            // ── 2. فحص الحساب المجاني ──
            let isFreeAccount = false;
            if (data.playerId || data.phone) {
              try {
                const { players: playersTable } = await import('../schemas/player.schema.js');
                const normalizedLookup = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
                const playerConditions: any[] = [];
                if (data.playerId) playerConditions.push(eq(playersTable.id, data.playerId));
                if (normalizedLookup) playerConditions.push(eq(playersTable.phone, normalizedLookup));
                
                if (playerConditions.length > 0) {
                  const { or: orOp } = await import('drizzle-orm');
                  const [playerRow] = await db.select({ isFreeAccount: playersTable.isFreeAccount })
                    .from(playersTable)
                    .where(orOp(...playerConditions))
                    .limit(1);
                  if (playerRow?.isFreeAccount) {
                    isFreeAccount = true;
                    console.log(`🏷️ Free account detected: ${data.name} — skipping ticket requirement`);
                  }
                }
              } catch (e: any) {
                console.warn('⚠️ Free account check failed:', e.message);
              }
            }

            // ── 3. إذا حساب مجاني → تخطي التذكرة + تعليم الحجز كمجاني ──
            if (isFreeAccount) {
              try {
                const { bookings } = await import('../schemas/admin.schema.js');
                const { or: orOp } = await import('drizzle-orm');
                const normalizedPhone = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
                const bookingConditions: any[] = [];
                if (normalizedPhone) bookingConditions.push(eq(bookings.phone, normalizedPhone));
                if (data.playerId) bookingConditions.push(eq(bookings.playerId, data.playerId));

                if (bookingConditions.length > 0) {
                  const [existingBooking] = await db.select({ id: bookings.id })
                    .from(bookings)
                    .where(and(
                      eq(bookings.activityId, state.activityId!),
                      orOp(...bookingConditions),
                    ))
                    .limit(1);

                  if (existingBooking) {
                    await db.update(bookings)
                      .set({ isFree: true, isPaid: false, paidAmount: '0' } as any)
                      .where(eq(bookings.id, existingBooking.id));
                    console.log(`🏷️ Booking #${existingBooking.id} marked as FREE for ${data.name}`);
                  }
                }
              } catch (e: any) {
                console.warn('⚠️ Free booking update failed:', e.message);
              }
            }

            // ── 4. التحقق من التذكرة (فقط إذا ليس حساب مجاني) ──
            if (requireTicket && !isFreeAccount) {
              // ── 4أ. فحص: هل اللاعب استخدم تذكرة مسبقاً لنفس النشاط؟ ──
              let alreadyHasTicket = false;
              if (data.playerId || data.phone) {
                const { or } = await import('drizzle-orm');
                const conditions: any[] = [];
                if (data.playerId) conditions.push(eq(globalTickets.usedByPlayerId, data.playerId));
                if (data.phone) {
                  const normalizedPhone = data.phone.startsWith('0') ? data.phone : '0' + data.phone;
                  conditions.push(eq(globalTickets.usedByPhone, normalizedPhone));
                }
                const existingTickets = await db.select({ id: globalTickets.id })
                  .from(globalTickets)
                  .where(and(
                    eq(globalTickets.isUsed, true),
                    eq(globalTickets.usedInActivityId, state.activityId!),
                    or(...conditions),
                  ))
                  .limit(1);
                if (existingTickets.length > 0) {
                  alreadyHasTicket = true;
                  console.log(`🎫 Player ${data.name} already has a ticket for activity #${state.activityId} — skipping ticket check`);
                }
              }

              // ── 4ب. إذا ما عنده تذكرة مسبقة → يطلب رقم تذكرة جديد ──
              if (!alreadyHasTicket) {
                if (!data.ticketNumber || !data.ticketNumber.trim()) {
                  return callback({ success: false, error: 'يرجى إدخال رقم التذكرة' });
                }
                const [ticket] = await db.select()
                  .from(globalTickets)
                  .where(eq(globalTickets.ticketNumber, data.ticketNumber.trim()))
                  .limit(1);

                if (!ticket) {
                  return callback({ success: false, error: 'رقم التذكرة غير صالح' });
                }
                if (ticket.isUsed) {
                  return callback({ success: false, error: 'هذه التذكرة مستخدمة مسبقاً — يرجى إدخال رقم تذكرة فعّال' });
                }

                // ── 4ج. فحص تطابق سعر التذكرة مع العرض/السعر المتوقع ──
                const ticketPrice = parseFloat(ticket.price || '0');
                let expectedPrice = parseFloat(act.basePrice || '0');
                let selectedOfferName = '';

                // البحث عن حجز اللاعب لمعرفة العرض المختار
                try {
                  const { bookings } = await import('../schemas/admin.schema.js');
                  const { locations } = await import('../schemas/admin.schema.js');
                  const { or: orOp } = await import('drizzle-orm');
                  const normalizedPhone = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
                  const bConditions: any[] = [];
                  if (normalizedPhone) bConditions.push(eq(bookings.phone, normalizedPhone));
                  if (data.playerId) bConditions.push(eq(bookings.playerId, data.playerId));

                  if (bConditions.length > 0) {
                    const [playerBooking] = await db.select({
                      id: bookings.id,
                      offerItems: bookings.offerItems,
                    })
                      .from(bookings)
                      .where(and(
                        eq(bookings.activityId, state.activityId!),
                        orOp(...bConditions),
                      ))
                      .limit(1);

                    if (playerBooking?.offerItems && (playerBooking.offerItems as any[]).length > 0) {
                      // اللاعب اختار عرض → نجلب سعره
                      const [actFull] = await db.select({
                        locationId: activities.locationId,
                        enabledOfferIds: activities.enabledOfferIds,
                      }).from(activities).where(eq(activities.id, state.activityId!)).limit(1);

                      if (actFull?.locationId) {
                        const [loc] = await db.select({ offers: locations.offers })
                          .from(locations).where(eq(locations.id, actFull.locationId)).limit(1);

                        const allOffers: any[] = Array.isArray(loc?.offers) ? loc.offers : [];
                        const selectedOfferId = (playerBooking.offerItems as any[])[0];
                        const selectedOffer = allOffers[selectedOfferId];
                        if (selectedOffer) {
                          expectedPrice = parseFloat(selectedOffer.price || '0');
                          selectedOfferName = selectedOffer.name || '';
                        }
                      }
                    }
                  }
                } catch (e: any) {
                  console.warn('⚠️ Offer price lookup failed:', e.message);
                }

                // ── 4د. مقارنة الأسعار — إذا غير مطابق → منع الدخول ──
                if (expectedPrice > 0 && ticketPrice < expectedPrice) {
                  return callback({
                    success: false,
                    error: `سعر التذكرة (${ticketPrice}) غير مطابق للعرض المطلوب (${expectedPrice})${selectedOfferName ? ' — ' + selectedOfferName : ''}. استخدم تذكرة أخرى أو اختر عرضاً مناسباً.`,
                    priceMismatch: true,
                    ticketPrice,
                    expectedPrice,
                    selectedOfferName,
                  });
                }

                // تعليم التذكرة كمستخدمة مع ربطها بالنشاط
                await db.update(globalTickets)
                  .set({
                    isUsed: true,
                    usedByPhone: data.phone || null,
                    usedByName: data.name || null,
                    usedByPlayerId: data.playerId || null,
                    usedInActivityId: state.activityId,
                    usedAt: new Date(),
                  } as any)
                  .where(eq(globalTickets.id, ticket.id));

                console.log(`🎫 Global Ticket ${data.ticketNumber} validated & used by ${data.name} in activity #${state.activityId}`);

                // ── 4هـ. ربط التذكرة بالدفع التلقائي في الحجز ──
                try {
                  const { bookings } = await import('../schemas/admin.schema.js');
                  const { or: orOp } = await import('drizzle-orm');
                  const normalizedPhone = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
                  const bConditions: any[] = [];
                  if (normalizedPhone) bConditions.push(eq(bookings.phone, normalizedPhone));
                  if (data.playerId) bConditions.push(eq(bookings.playerId, data.playerId));

                  if (bConditions.length > 0) {
                    const [playerBooking] = await db.select({ id: bookings.id })
                      .from(bookings)
                      .where(and(
                        eq(bookings.activityId, state.activityId!),
                        orOp(...bConditions),
                      ))
                      .limit(1);

                    if (playerBooking) {
                      await db.update(bookings)
                        .set({
                          isPaid: true,
                          paidAmount: String(ticketPrice),
                          receivedBy: ticket.sellerName || 'بائع التذكرة',
                          ticketNumber: ticket.ticketNumber,
                          isFree: false,
                        } as any)
                        .where(eq(bookings.id, playerBooking.id));

                      console.log(`💰 Booking #${playerBooking.id} auto-paid: ${ticketPrice} via ticket ${ticket.ticketNumber} (seller: ${ticket.sellerName})`);
                    }
                  }
                } catch (e: any) {
                  console.warn('⚠️ Auto-payment update failed:', e.message);
                }
              }
            }
          }
        } catch (e: any) {
          console.error('⚠️ Failed to fetch activity data:', e.message);
        }
      }

      // ── 3. حماية: فحص هل اللاعب في غرفة أخرى *نشطة فعلاً* ──
      // نتجاهل الغرف المنتهية/المغلقة/القديمة (التي تبقى في Redis بمهلة 24 ساعة) حتى لا يعلق اللاعب.
      // أي حالة (حيّ أو مُقصى) قابلة للحلّ: تأكيد ثم إزالة تلقائية من الغرفة القديمة (forceJoin).
      if (data.playerId) {
        const { getAllGameStates } = await import('../config/redis.js');
        const allStates = await getAllGameStates();
        for (const otherState of allStates) {
          if (!otherState || otherState.roomId === data.roomId) continue;
          const existing = otherState.players?.find((p: any) => p.playerId === data.playerId);
          if (!existing) continue;

          // غرفة منتهية أو غير حيّة (ليست في activeRooms) → تجاهلها تماماً (لا تحجب الدخول)
          const isLive = otherState.phase !== 'GAME_OVER' && activeRooms.has(otherState.roomId);
          if (!isLive) continue;

          // غرفة نشطة فعلاً → تأكيد ثم إزالة (سواء كان حيّاً أو مُقصى)
          if (!data.forceJoin) {
            return callback({
              success: false,
              requiresConfirmation: true,
              error: existing.isAlive
                ? 'أنت متواجد بالفعل في غرفة أخرى نشطة، هل تريد مغادرتها والانضمام إلى هذه الغرفة؟'
                : 'أنت في غرفة أخرى نشطة (كلاعب مُقصى)، هل تريد مغادرتها والانضمام إلى هذه الغرفة؟',
            });
          }
          // forceJoin → إزالة اللاعب من الغرفة السابقة
          const oldState = await getGameState(otherState.roomId);
          if (oldState) {
            const pIndex = oldState.players.findIndex((p: any) => p.playerId === data.playerId);
            if (pIndex !== -1) {
              oldState.players.splice(pIndex, 1);
              await setGameState(otherState.roomId, oldState);
              await emitStateSanitized(io, otherState.roomId, 'game:state-sync', oldState);
              const oldRoom = activeRooms.get(otherState.roomId);
              if (oldRoom) oldRoom.playerCount = oldState.players.filter((p: any) => !p.seatHeld).length;
              console.log(`🚪 Auto-removed Player #${existing.physicalId} from room ${otherState.roomId}`);
            }
          }
        }
      }


      // ═══ 4. فحص المقعد المحجوز (Seat Hold) ═══
      const normalizedJoinPhone = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
      const heldPlayer = state.players.find((p: any) =>
        p.seatHeld === true && (
          (data.playerId && p.playerId === data.playerId) ||
          (normalizedJoinPhone && p.phone === normalizedJoinPhone)
        )
      );

      if (heldPlayer) {
        // ── اللاعب عنده مقعد محجوز → إعادته لنفس المقعد ──
        heldPlayer.seatHeld = false;
        heldPlayer.heldUntil = undefined;
        heldPlayer.isConnected = true;
        heldPlayer.name = data.name || heldPlayer.name;
        await setGameState(data.roomId, state);

        socket.join(data.roomId);
        socket.data.role = 'player';
        socket.data.roomId = data.roomId;
        socket.data.physicalId = heldPlayer.physicalId;

        // تحديث العداد
        const room = activeRooms.get(data.roomId);
        if (room) {
          room.playerCount = state.players.filter((p: any) => !p.seatHeld).length;
        }

        await emitStateSanitized(io, data.roomId, 'game:state-sync', state);

        console.log(`♻️ Player ${data.name} returned to held seat #${heldPlayer.physicalId} in room ${data.roomId}`);
        return callback({
          success: true,
          assignedSeat: heldPlayer.physicalId,
          gameName: state.config.gameName,
          constraintViolation: false,
          restoredSeat: true,
        });
      }

      // ── 5. تخصيص مقعد جديد (لا يوجد مقعد محجوز) ──
      // جلب بيانات اللاعبين الموسّعة للمحرك الذكي
      let penaltyNeighborHistory: Map<string, number> | undefined;
      let enrichedPlayers: any[] = [];
      const db = getDB();

      // استرجاع activityId من قاعدة البيانات كـ fallback إذا كان مفقوداً في Redis
      let activityId = state.activityId;
      if (!activityId && state.sessionId && db) {
        try {
          const [sessRow] = await db.execute(sql`
            SELECT activity_id FROM sessions WHERE id = ${state.sessionId} LIMIT 1
          `).then((r: any) => (r.rows || r || []));
          if (sessRow?.activity_id) {
            activityId = Number(sessRow.activity_id);
            state.activityId = activityId;
            await setGameState(state.roomId, state);
            console.log(`♻️ Recovered missing activityId #${activityId} for room ${state.roomId} from DB session #${state.sessionId}`);
          }
        } catch (e: any) {
          console.warn('⚠️ Failed to recover activityId from database session:', e.message);
        }
      }

      // ── بيانات القالب من لقطة الغرفة (snapshot) — لا نُعيد قراءتها من DB هنا ──
      // كي لا نطمس الحجوزات/تعديلات الليدر عند كل انضمام (كان هذا يسبب: مسح الحجوزات عند حذف
      // القالب، وتعارضات عند تعديله). التحديث من القالب المُعدّل يتم صراحةً عبر room:resync-template.
      if ((state as any).pinnedSeats === undefined && activityId && db) {
        // تحميل أوّلي لمرّة واحدة إن لم تُحمَّل اللقطة بعد (غرف قديمة/حالات حافّة)
        try { if (await loadSeatTemplateIntoState(state)) await setGameState(state.roomId, state); } catch {}
      }
      const pinnedSeatsFromTemplate: any[] = (state as any).pinnedSeats || [];
      const reservedTailFromTemplate: number = (state as any).reservedTailSeats || 0;
      const doorSeatsFromTemplate: number[] = (state as any).doorSeats || [];
      const hasTemplate = (state as any).pinnedSeats !== undefined;

      // ── إدراج قيد «تجنّب الأبواب» تلقائياً عند وجود أبواب (من اللقطة) ──
      if (doorSeatsFromTemplate.length > 0) {
        if (!constraints) constraints = { genderSeparation: false, noAdjacentPairs: [] } as any;
        (constraints as any).engineEnabled = true;
        if (!(constraints as any).constraints) (constraints as any).constraints = [];
        const hasDoor = (constraints as any).constraints.some((c: any) => c.type === 'DOOR_PROXIMITY_AVOIDANCE');
        if (!hasDoor) {
          (constraints as any).constraints.push({ type: 'DOOR_PROXIMITY_AVOIDANCE', enabled: true, priority: 5, params: {} });
        }
      }

      // التحقق من تفعيل المحرك الذكي (أو وجود قالب مقاعد نشط للفعالية)
      const engineEnabled = (constraints && (constraints as any).engineEnabled) || hasTemplate;

      if (engineEnabled) {
        // ── 🚀 إثراء دفعي لبيانات اللاعبين الحاليين ──
        // كان استعلامَين لكل لاعب جالس (N+1: انضمام واحد = 30-50+ استعلاماً وثوانٍ انتظار)
        // → الآن استعلامان إجمالاً مهما كان عدد الجالسين.
        const { players: playersTable } = await import('../schemas/player.schema.js');
        const seatedIds = state.players.map(p => p.playerId).filter((x): x is number => typeof x === 'number' && x > 0);
        const dbById = new Map<number, any>();
        const actCountById = new Map<number, number>();
        let actQueryOk = false;
        if (db && seatedIds.length > 0) {
          try {
            const { inArray } = await import('drizzle-orm');
            const rows = await db.select({
              id: playersTable.id,
              totalMatches: playersTable.lifetimeMatches,  // 🏆 مدى الحياة (لا يُصفَّر بالموسم) — لكشف اللاعب الجديد
              rankRR: playersTable.rankRR,
              rankTier: playersTable.rankTier,
              genderConstraint: playersTable.genderConstraint,
            }).from(playersTable).where(inArray(playersTable.id, seatedIds));
            for (const r of rows) dbById.set(r.id, r);
          } catch {}
          try {
            const idList = seatedIds.map(Number).join(',');   // أرقام فقط — آمنة
            const activityRows = await db.execute(sql.raw(`
              SELECT sp.player_id AS pid, COUNT(DISTINCT s.activity_id) AS activity_count
              FROM session_players sp
              JOIN sessions s ON sp.session_id = s.id
              WHERE sp.player_id IN (${idList}) AND s.activity_id IS NOT NULL
              GROUP BY sp.player_id
            `));
            for (const row of ((activityRows as any).rows || activityRows || [])) {
              actCountById.set(Number((row as any).pid), Number((row as any).activity_count || 0));
            }
            actQueryOk = true;
          } catch {}
        }
        enrichedPlayers = state.players.map(p => {
          const dbp = p.playerId ? dbById.get(p.playerId) : undefined;
          const totalMatches = dbp?.totalMatches || 0;
          return {
            physicalId: p.physicalId,
            phone: p.phone,
            gender: p.gender || null,
            seatHeld: p.seatHeld || false,
            playerId: p.playerId || null,
            name: p.name || `لاعب #${p.physicalId}`,
            totalMatches,
            activityCount: p.playerId
              ? (actQueryOk ? (actCountById.get(p.playerId) ?? 0) : Math.floor(totalMatches / 3))
              : 0,
            rankRR: dbp?.rankRR || 0,
            rankTier: dbp?.rankTier || 'INFORMANT',
            genderConstraint: dbp?.genderConstraint || 'NONE',
          };
        });

        // ── حقن اللاعبين المثبّتين (من القالب) كشاغلين افتراضيين للمقاعد ──
        // الهدف: تُفحَص الشروط (مثل «لا يجلس بجانب X») ضدّ مقعد X المثبّت حتى لو لم يدخل X بعد.
        if (pinnedSeatsFromTemplate.length > 0) {
          const normPin = (p: string) => {
            if (!p) return '';
            let c = p.replace(/[\s\-()+]/g, '');
            if (c.startsWith('00962')) c = c.slice(5); else if (c.startsWith('962')) c = c.slice(3);
            return c.startsWith('0') ? c : '0' + c;
          };
          const normJoin = normPin(data.phone || '');

          // 🚀 جلب دفعي لبيانات المثبّتين (كان استعلاماً لكل مقعد مثبّت)
          const pinById = new Map<number, any>();
          const pinByPhone = new Map<string, any>();
          if (db) {
            try {
              const { inArray, or: orOp } = await import('drizzle-orm');
              const { players: pTable } = await import('../schemas/player.schema.js');
              const pinIds = pinnedSeatsFromTemplate.map((p: any) => Number(p.playerId)).filter((n: number) => Number.isFinite(n) && n > 0);
              const pinPhones = pinnedSeatsFromTemplate.map((p: any) => p.phone).filter(Boolean);
              if (pinIds.length > 0 || pinPhones.length > 0) {
                const conds = [] as any[];
                if (pinIds.length > 0) conds.push(inArray(pTable.id, pinIds));
                if (pinPhones.length > 0) conds.push(inArray(pTable.phone, pinPhones));
                const rows = await db.select({
                  id: pTable.id,
                  phone: pTable.phone,
                  gender: pTable.gender,
                  rankRR: pTable.rankRR,
                  rankTier: pTable.rankTier,
                  genderConstraint: pTable.genderConstraint,
                  lifetimeMatches: pTable.lifetimeMatches,
                }).from(pTable).where(conds.length === 1 ? conds[0] : orOp(...conds));
                for (const r of rows) {
                  pinById.set(r.id, r);
                  if (r.phone) pinByPhone.set(String(r.phone), r);
                }
              }
            } catch {}
          }
          for (const pin of pinnedSeatsFromTemplate) {
            const seatNum = Number(pin.seatNumber);
            if (!seatNum || seatNum < 1 || seatNum > state.config.maxPlayers) continue;
            // المقعد مشغول فعلاً بلاعب حقيقي؟ تخطّاه
            if (enrichedPlayers.some((p: any) => p.physicalId === seatNum)) continue;
            // المثبّت هو اللاعب الداخل نفسه؟ سيأخذ مقعده عبر المسار المباشر — لا تحجزه افتراضياً
            const pinPhone = normPin(pin.phone || '');
            const isJoiner =
              (pin.playerId && data.playerId && Number(pin.playerId) === Number(data.playerId)) ||
              (pinPhone && normJoin && pinPhone === normJoin) ||
              (pin.playerName && data.name && String(pin.playerName).trim().toLowerCase() === data.name.trim().toLowerCase());
            if (isJoiner) continue;

            const v: any = {
              physicalId: seatNum,
              phone: pin.phone || '',
              gender: 'MALE',
              seatHeld: false,
              playerId: pin.playerId || null,
              name: pin.playerName || `محجوز #${seatNum}`,
              totalMatches: 0, activityCount: 0, rankRR: 0, rankTier: 'INFORMANT',
              genderConstraint: 'NONE',
              _virtualPinned: true,
            };
            {
              // من الجلب الدفعي أعلاه — بلا استعلام لكل مقعد
              const dbp = (pin.playerId && pinById.get(Number(pin.playerId))) || (pin.phone && pinByPhone.get(String(pin.phone))) || null;
              if (dbp) {
                v.playerId = dbp.id;
                v.gender = dbp.gender || 'MALE';
                v.rankRR = dbp.rankRR || 0;
                v.rankTier = dbp.rankTier || 'INFORMANT';
                v.genderConstraint = dbp.genderConstraint || 'NONE';
                v.totalMatches = dbp.lifetimeMatches || 0;
              }
            }
            enrichedPlayers.push(v);
            console.log(`📌 Virtual pinned occupant: ${v.name} @ seat #${seatNum} (constraints will respect it)`);
          }
        }

        // ── 👁️ المتفرّجون شاغلون فعليّون: يجلسون في الحلقة على مقاعد مرقَّمة ──
        // بدونهم يُمنح مقعد المتفرّج لعائدٍ آخر فيجلس اثنان على كرسيّ واحد.
        for (const sp of getSpectators(state)) {
          if (enrichedPlayers.some((e: any) => e.physicalId === sp.physicalId)) continue;
          enrichedPlayers.push({
            physicalId: sp.physicalId,
            phone: sp.phone,
            gender: sp.gender || 'MALE',
            seatHeld: false,
            playerId: sp.playerId,
            name: sp.name,
            totalMatches: 0,
            activityCount: 0,
            rankRR: 0,
            rankTier: sp.rankTier || 'INFORMANT',
            hasPenalty: false,
            genderConstraint: 'NONE',
          } as any);
        }

        // جلب تاريخ جيران المعاقبين — يقتصر على آخر 3 مباريات للّاعب الداخل (عبر كل الجلسات).
        // الفكرة: إن عوقب اللاعب وكان X بجانبه ضمن آخر 3 مباريات، يُمنع جلوسه بجانب X الآن.
        penaltyNeighborHistory = new Map();
        if (db && data.playerId) {
          try {
            const rows = await db.execute(sql`
              WITH last3 AS (
                SELECT m.id
                FROM matches m
                JOIN match_players mp ON mp.match_id = m.id
                WHERE mp.player_id = ${data.playerId}
                ORDER BY m.created_at DESC
                LIMIT 3
              )
              SELECT player_a_id, player_b_id, COUNT(*) as cnt
              FROM penalty_neighbor_history
              WHERE match_id IN (SELECT id FROM last3)
                AND (player_a_id = ${data.playerId} OR player_b_id = ${data.playerId})
              GROUP BY player_a_id, player_b_id
            `);
            for (const row of (rows as any).rows || rows || []) {
              const aId = Math.min(Number(row.player_a_id), Number(row.player_b_id));
              const bId = Math.max(Number(row.player_a_id), Number(row.player_b_id));
              penaltyNeighborHistory.set(`${aId}-${bId}`, Number(row.cnt));
            }
          } catch (e: any) {
            console.warn('⚠️ Failed to load penalty-neighbor history (last 3 matches):', e.message);
          }
        }

        // جلب بيانات اللاعب الجديد
        let newPlayerEnriched: any = {
          phone: data.phone || '',
          gender: data.gender || 'MALE',
          playerId: data.playerId || null,
          name: data.name || 'لاعب جديد',
          totalMatches: 0,
          activityCount: 0,
          rankRR: 0,
          rankTier: 'INFORMANT',
          genderConstraint: 'NONE',
        };

        if (data.playerId && db) {
          try {
            const { players: playersTable } = await import('../schemas/player.schema.js');
            const [dbPlayer] = await db.select({
              totalMatches: playersTable.lifetimeMatches,  // 🏆 مدى الحياة (متّسق مع اللاعبين الجالسين) — لكشف الجديد
              rankRR: playersTable.rankRR,
              rankTier: playersTable.rankTier,
              genderConstraint: playersTable.genderConstraint,
            }).from(playersTable).where(eq(playersTable.id, data.playerId)).limit(1);

            if (dbPlayer) {
              newPlayerEnriched.totalMatches = dbPlayer.totalMatches || 0;
              newPlayerEnriched.rankRR = dbPlayer.rankRR || 0;
              newPlayerEnriched.rankTier = dbPlayer.rankTier || 'INFORMANT';
              newPlayerEnriched.genderConstraint = dbPlayer.genderConstraint || 'NONE';
              // حساب activityCount الحقيقي من DB
              try {
                const activityRows = await db.execute(sql`
                  SELECT COUNT(DISTINCT s.activity_id) as activity_count
                  FROM session_players sp
                  JOIN sessions s ON sp.session_id = s.id
                  WHERE sp.player_id = ${data.playerId}
                  AND s.activity_id IS NOT NULL
                `);
                const actRow = ((activityRows as any).rows || activityRows || [])[0];
                newPlayerEnriched.activityCount = Number(actRow?.activity_count || 0);
              } catch {
                newPlayerEnriched.activityCount = Math.floor((dbPlayer.totalMatches || 0) / 3);
              }
            }
          } catch {}
        }

        // ── 🤝 أوزان التقارب الاجتماعيّ (الوصول المتزامن أثقلها — قرار مقفل ٣) ──
        let affinityPairs: Map<string, number> | undefined;
        try {
          affinityPairs = await buildAffinityPairs({
            sessionId: state.sessionId,
            activityId,
            people: [
              ...enrichedPlayers.map((e: any) => ({ playerId: e.playerId ?? null, phone: e.phone, name: e.name })),
              { playerId: data.playerId ?? null, phone: data.phone ?? null, name: data.name },
            ],
          });
          const rules = await loadPairRules({ activityId, roomId: state.roomId });
          affinityPairs = mergeRulesIntoAffinity(affinityPairs, rules);
          // القواعد الصارمة (block) تُحقن كأزواج ممنوعة بأولويّة ١
          const hardPairs = rules.filter(r => r.kind === 'block' && r.personA.startsWith('h') && r.personB.startsWith('h'));
          if (hardPairs.length > 0) {
            if (!constraints) constraints = { genderSeparation: false, noAdjacentPairs: [] } as any;
            (constraints as any).engineEnabled = true;
            if (!(constraints as any).constraints) (constraints as any).constraints = [];
            const extra = hardPairs.map(r => ({
              player1Phone: r.personA.slice(1), player1Name: r.nameA || '',
              player2Phone: r.personB.slice(1), player2Name: r.nameB || '',
            }));
            const nap = (constraints as any).constraints.find((c: any) => c.type === 'NO_ADJACENT_PAIRS');
            if (nap) nap.params = { ...(nap.params || {}), pairs: [...(((nap.params || {}).pairs) || []), ...extra] };
            else (constraints as any).constraints.push({ type: 'NO_ADJACENT_PAIRS', enabled: true, priority: 1, params: { pairs: extra } });
          }
        } catch (e: any) { console.warn('⚠️ affinity build skipped:', e.message); }

        // 🎲 مقاعد التباعد: للمتفرّج = الأحياء (يجلس بعيداً عن الهمس)،
        //    وللاعب العاديّ = آخر ثلاثة واصلين (يكسر تجاور من وصلوا معاً).
        const spreadFromSeats = joinAsSpectator
          ? state.players.filter((p: any) => p.isAlive !== false).map((p: any) => p.physicalId)
          : state.players.slice(-3).map((p: any) => p.physicalId);

        const { seat: assignedSeatResult, constraintViolation: cvResult, violations: vioResult } = allocateSeat({
          maxPlayers: state.config.maxPlayers,
          players: enrichedPlayers,
          constraints,
          newPlayer: newPlayerEnriched,
          // 🔒 preferredSeat من الليدر وحده: عميلٌ معدَّل كان يستطيع اختيار مقعد صديقه
          preferredSeat: socket.data.role === 'leader' ? data.preferredSeat : undefined,
          penaltyNeighborHistory,
          sessionId: state.sessionId,
          pinnedSeats: pinnedSeatsFromTemplate,
          reservedTailSeats: reservedTailFromTemplate,
          doorSeats: doorSeatsFromTemplate,
          affinityPairs,
          spreadFromSeats,
          preferTailSeats: joinAsSpectator,
        });
        var assignedSeat = assignedSeatResult;
        var constraintViolation = cvResult;
        var seatViolations: string[] = vioResult || [];
      } else {
        // الوضع القديم — بيانات أساسية فقط
        const seatPlayers = state.players.map(p => ({
          physicalId: p.physicalId,
          phone: p.phone,
          gender: p.gender || null,
          seatHeld: p.seatHeld || false,
        }));

        const { seat: assignedSeatResult, constraintViolation: cvResult } = allocateSeat({
          maxPlayers: state.config.maxPlayers,
          players: seatPlayers,
          constraints,
          newPlayer: {
            phone: data.phone || '',
            gender: data.gender || 'MALE',
          },
          preferredSeat: socket.data.role === 'leader' ? data.preferredSeat : undefined,
        });
        var assignedSeat = assignedSeatResult;
        var constraintViolation = cvResult;
        var seatViolations: string[] = [];
      }

      if (constraintViolation) {
        console.warn(`⚠️ Seat constraints violated for player ${data.name} — assigned seat #${assignedSeat} anyway`);
        // 🔔 الليدر يرى المخالفة لحظة وقوعها (كانت console.warn صامتة تماماً)
        try {
          await emitTrustedOnly(io, data.roomId, 'leader:seat-constraint-warning', {
            physicalId: assignedSeat,
            name: data.name,
            violations: (typeof seatViolations !== 'undefined' ? seatViolations : []).slice(0, 4),
            spectator: joinAsSpectator,
            at: Date.now(),
          });
        } catch {}
      }

      // ══ 👁️ مسار المتفرّج: يجلس في الحلقة ولا يدخل players ══
      // كلُّ محرّكات اللعبة تشتقّ طوابيرها من state.players، فأيّ إضافةٍ هناك تجعل الوافد
      // متحدّثاً ومرشّحاً وهدفاً ليليّاً وتدخله في معادلة الفوز.
      if (joinAsSpectator) {
        const fresh = await getRoom(data.roomId);
        if (!fresh) return callback({ success: false, error: 'الغرفة غير موجودة' });
        if (!Array.isArray((fresh as any).spectators)) (fresh as any).spectators = [];

        // سباقٌ ضيّق: قد يكون المقعد شُغل بين الحساب والكتابة
        const taken = new Set<number>([
          ...fresh.players.map((pp: any) => pp.physicalId),
          ...getSpectators(fresh).map(sp => sp.physicalId),
        ]);
        let seat = assignedSeat;
        if (taken.has(seat)) {
          let alt = 0;
          for (let i = fresh.config.maxPlayers; i >= 1; i--) if (!taken.has(i)) { alt = i; break; }
          seat = alt || 0;
        }
        if (!seat) {
          // القاعة ممتلئة — ينتظر بلا رقم مقعد ويُنبّه الليدر
          seat = 0;
        }

        const spec: Spectator = {
          physicalId: seat,
          name: data.name,
          phone: data.phone || null,
          playerId: data.playerId || null,
          gender: data.gender || null,
          dob: data.dob || null,
          avatarUrl: null,
          rankTier: null,
          cosmetics: null,
          joinedAt: Date.now(),
          addedBy: 'self',
        };
        (fresh as any).spectators.push(spec);
        await setGameState(data.roomId, fresh);

        // 📝 القرار المقفل ٢: يُسجّل في session_players والحضور فوراً،
        //    ولا يُحسب في السعة إلّا عند الترقية. حدّ F&B سليم لأنّ أساسه «لعب مباراة».
        if (fresh.sessionId && seat > 0) {
          try {
            await addPlayerToSession(fresh.sessionId, seat, data.name, data.phone || undefined,
              data.gender || undefined, data.dob || undefined, data.playerId || null);
          } catch (e: any) { console.warn('⚠️ spectator session row failed:', e.message); }
        }
        void markArrivalAttended(activityId, data.playerId || null, data.phone || null, data.name);

        socket.join(spectatorRoom(data.roomId));
        socket.data.role = 'spectator';
        socket.data.roomId = data.roomId;
        socket.data.physicalId = seat;

        // 📢 الليدر والشاشة فقط (القرار المقفل ٦: الاسم الأوّل + رقم المقعد)
        const firstName = String(data.name || '').trim().split(/\s+/)[0] || data.name;
        try {
          await emitTrustedOnly(io, data.roomId, 'room:spectator-joined', {
            physicalId: seat, name: data.name, firstName,
            phone: data.phone || null, playerId: data.playerId || null,
            gender: data.gender || null, joinedAt: spec.joinedAt,
            waitingCount: getSpectators(fresh).length,
            phase: fresh.phase, round: fresh.round,
          });
        } catch {}

        // بثّ الحالة كي تظهر قائمة الوصول عند الليدر والشاشة فوراً
        // (قائمة المتفرّجين بلا أسرار — لا دور ولا نيّة ليل)
        await emitStateSanitized(io, data.roomId, 'game:state-sync', fresh);

        console.log(`👁️ Spectator ${data.name} seated #${seat} (phase: ${fresh.phase})`);
        return callback({
          success: true,
          spectator: true,
          code: 'GAME_IN_PROGRESS',
          assignedSeat: seat,
          gameName: fresh.config.gameName,
          phase: fresh.phase,
          round: fresh.round,
          constraintViolation,
          isRemote: !!fresh.config?.isRemote,
        });
      }

      void markArrivalAttended(activityId, data.playerId || null, data.phone || null, data.name);

      // ── 5. إضافة اللاعب ──
      const addedState = await addPlayer(
        data.roomId,
        assignedSeat,
        data.name,
        data.phone || null,
        data.playerId || null,
      );

      // البحث عن اللاعب الفعلي (قد يكون تم ربطه بمقعد ليدر موجود)
      const actualPlayer = data.phone
        ? addedState.players.find(p => p.phone === data.phone) || addedState.players.find(p => p.physicalId === assignedSeat)
        : addedState.players.find(p => p.physicalId === assignedSeat);

      const actualPhysicalId = actualPlayer?.physicalId ?? assignedSeat;

      // ── 🔔 تنبيه الليدر عند تعارض مقعد مثبّت (كان console.warn صامتاً فقط) ──
      // اللاعب مُثبّت في القالب على مقعد معيّن لكنه جلس في مقعد آخر (مقعده مأخوذ غالباً)
      try {
        if (pinnedSeatsFromTemplate.length > 0) {
          const normPhone = (s: any) => String(s || '').replace(/\D/g, '').replace(/^(00962|962)/, '0');
          const joinPhone = normPhone(data.phone);
          const joinName = String(data.name || '').trim().toLowerCase();
          const pinnedEntry = pinnedSeatsFromTemplate.find((ps: any) =>
            (data.playerId && ps.playerId && Number(ps.playerId) === Number(data.playerId)) ||
            (joinPhone && ps.phone && normPhone(ps.phone) === joinPhone) ||
            (joinName && ps.playerName && String(ps.playerName).trim().toLowerCase() === joinName)
          );
          if (pinnedEntry && Number(pinnedEntry.seatNumber) !== actualPhysicalId) {
            const occupant = addedState.players.find(p => p.physicalId === Number(pinnedEntry.seatNumber));
            const sockets = await io.in(data.roomId).fetchSockets();
            for (const s of sockets) if ((s as any).data?.role === 'leader') {
              s.emit('leader:pinned-seat-conflict', {
                roomId: data.roomId,
                playerName: data.name,
                assignedSeat: actualPhysicalId,
                pinnedSeat: Number(pinnedEntry.seatNumber),
                occupantName: occupant?.name || null,
              });
            }
            console.warn(`📌 Pinned conflict: ${data.name} pinned to #${pinnedEntry.seatNumber} but seated at #${actualPhysicalId}`);
          }
        }
      } catch { /* التنبيه لا يعطّل الانضمام */ }

      // تحديث الجنس وتاريخ الميلاد
      if (data.gender || data.dob) {
        await updatePlayer(data.roomId, actualPhysicalId, {
          gender: data.gender || 'MALE',
          dob: data.dob || '2000-01-01',
        });
      }

      // ── جلب صورة اللاعب من قاعدة البيانات وحفظها في Redis ──
      if (data.playerId) {
        try {
          const { getDB } = await import('../config/db.js');
          const { players } = await import('../schemas/player.schema.js');
          const { eq } = await import('drizzle-orm');
          const db = getDB();
          if (db) {
            const [dbPlayer] = await db.select({ avatarUrl: players.avatarUrl, rankTier: players.rankTier })
              .from(players).where(eq(players.id, data.playerId)).limit(1);
            // 🪙 المظهر المشترى (الإيجارات النشطة فقط — الفحص كسول داخل الخدمة)
            let cosmetics: any = null;
            try {
              const { getPlayerCosmetics } = await import('../services/chips-store.service.js');
              cosmetics = await getPlayerCosmetics(data.playerId);
            } catch { /* المظهر تحسين بصري — لا يعطّل الانضمام */ }
            if (dbPlayer?.avatarUrl || dbPlayer?.rankTier || cosmetics) {
              await updatePlayer(data.roomId, actualPhysicalId, {
                ...(dbPlayer.avatarUrl ? { avatarUrl: dbPlayer.avatarUrl } : {}),
                ...(dbPlayer.rankTier ? { rankTier: dbPlayer.rankTier } : {}),
                ...(cosmetics ? { cosmetics } : {}),
              });
            }
          }
        } catch (e) { /* DB might be unavailable */ }
      }

      // ── حفظ اللاعب في قاعدة البيانات (Session Players) ──
      if (addedState.sessionId) {
        try {
          const finalName = data.name || actualPlayer?.name || 'غير معروف';
          await addPlayerToSession(
            addedState.sessionId,
            actualPhysicalId,
            finalName,
            data.phone || undefined,
            data.gender || undefined,
            data.dob || undefined,
            data.playerId || undefined
          );
        } catch (e: any) {
          console.error(`⚠️ Failed to save player to session_players in DB:`, e.message);
        }
      }

      socket.join(data.roomId);
      socket.data.role = 'player';
      socket.data.roomId = data.roomId;
      socket.data.physicalId = actualPhysicalId;

      // 🕵️ شبكة أمان: بعض العودات تمرّ بالانضمام لا بإعادة الاتصال — أغلق أيّ غيابٍ
      //    مفتوحٍ لهذا المقعد وإلّا ظلّ عدّاد «خارج الآن» يجري عند الليدر بلا نهاية.
      void closeAbsence(io, data.roomId, actualPhysicalId).then((closed) => {
        if (closed) socket.data.serverAbsenceClosedAt = Date.now();
      }).catch(() => {});

      // تحديث العداد
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = addedState.players.filter((p: any) => !p.seatHeld).length;
      }

      // جلب الحالة المحدثة بعد كل التعديلات
      const updatedState = await getRoom(data.roomId);
      const finalPlayer = updatedState?.players.find((p: any) => p.physicalId === actualPhysicalId);

      // بث للجميع في الغرفة
      io.to(data.roomId).emit('room:player-joined', {
        physicalId: actualPhysicalId,
        name: finalPlayer?.name || actualPlayer?.name || data.name,
        totalPlayers: addedState.players.length,
        maxPlayers: addedState.config.maxPlayers,
        gender: data.gender || 'MALE',
        avatarUrl: finalPlayer?.avatarUrl || null,
        // 🪙 المظهر المشترى — تحتاجه الشاشة لرسم البطاقة ولتشغيل تشريفة الدخول
        playerId: finalPlayer?.playerId || data.playerId || null,
        rankTier: finalPlayer?.rankTier || null,
        cosmetics: (finalPlayer as any)?.cosmetics || null,
      });

      callback({
        success: true,
        assignedSeat: actualPhysicalId,
        gameName: addedState.config.gameName,
        constraintViolation,
      });
      console.log(`🪑 Player auto-joined: #${actualPhysicalId} - ${data.name} (${data.gender || 'MALE'})${constraintViolation ? ' [CONSTRAINT VIOLATED]' : ''}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إعادة اتصال لاعب (Rejoin) ──────────────────
  socket.on('room:rejoin-player', async (data: {
    roomId: string;
    physicalId: number;
    phone?: string;
    playerId?: number;   // 🪪 هوية الحساب — الأقوى، تُرسلها الأجهزة المسجّلة
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) {
        return callback({ success: false, error: 'Room not found' });
      }

      // ══════════════════════════════════════════════════════
      // 🪪 تحديد الهوية — بالشخص لا بالمقعد
      // ══════════════════════════════════════════════════════
      // رقم المقعد **ليس هوية**: قد يُعاد ترقيمه أو يُنقل اللاعب، فيصير رقمُ جهازٍ
      // منقطعٍ خاصّاً بشخص آخر. السقوط عليه كان يسلّم للعائد دورَ غيره وفريقَ مافياه
      // وتوأمه وعقوده، ويربط سوكِته بذلك المقعد فيتصرّف بهويته.
      // الترتيب: حساب → هاتف (بالمطابقة التامة ثم بالتطبيع) → مقعد بشروط صارمة.
      const byPlayerId = data.playerId
        ? state.players.find((p: any) => p.playerId && p.playerId === data.playerId)
        : undefined;
      const byPhoneExact = !byPlayerId && data.phone
        ? state.players.find((p: any) => p.phone === data.phone)
        : undefined;
      // تطبيع الهاتف يغلق فئة كاملة من الإخفاقات (٠٧٩… مقابل ٩٦٢٧٩…) كانت تُسقط على المقعد
      const byPhoneNormalized = !byPlayerId && !byPhoneExact && data.phone
        ? state.players.find((p: any) => samePhone(p.phone, data.phone))
        : undefined;

      let player = byPlayerId || byPhoneExact || byPhoneNormalized;
      const identifiedByPerson = !!player;

      if (!player) {
        // لم تُحسم الهوية بالشخص. المقعد مسموح كملاذ أخير في حالتين فقط:
        //   • لا أسرار بعد (قبل اعتماد الأدوار) — لا شيء يمكن تسريبه.
        //   • ضيفٌ خالصٌ يجلس في المقعد (بلا حساب وبلا هاتف) — لا هوية أقوى له أصلاً،
        //     ولاعبٌ معرَّف لن تُحسم هويته إلى مقعده إطلاقاً.
        const seatOccupant = state.players.find((p: any) => p.physicalId === data.physicalId);
        const secretsLive = !!state.rolesConfirmed
          || (state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.ROLE_BINDING);
        const isPureGuest = !!seatOccupant && !seatOccupant.phone && !seatOccupant.playerId;

        if (seatOccupant && (!secretsLive || isPureGuest)) {
          player = seatOccupant;
          console.log(`♻️ Rejoin by seat #${data.physicalId} (${secretsLive ? 'pure guest' : 'pre-roles'}) — no person identity available`);
        } else {
          // ⛔ رفض صريح بدل التخمين — الجهاز يعيد التعريف بنفسه (هاتف/حساب)
          console.warn(`⛔ Rejoin refused for seat #${data.physicalId} in ${data.roomId} — identity not resolved (phone/account required)`);
          return callback({
            success: false,
            code: 'IDENTITY_REQUIRED',
            error: 'تعذّر التعرّف عليك — أعد الدخول برقم هاتفك أو من حسابك',
          });
        }
      }

      if (identifiedByPerson && player.physicalId !== data.physicalId) {
        console.log(`♻️ Rejoin seat corrected by identity: requested #${data.physicalId} → actual #${player.physicalId}`);
      }

      // ── فك التجميد عند العودة ──
      let stateChanged = false;
      if (player.frozen) {
        player.frozen = false;
        stateChanged = true;
      }

      // ── فك حجز المقعد عند العودة ──
      if (player.seatHeld) {
        player.seatHeld = false;
        player.heldUntil = undefined;
        player.isConnected = true;
        stateChanged = true;
        console.log(`♻️ Held seat #${player.physicalId} restored for returning player in room ${data.roomId}`);
      }

      if (stateChanged) {
        await setGameState(data.roomId, state);
        // تحديث العداد
        const room = activeRooms.get(data.roomId);
        if (room) {
          room.playerCount = state.players.filter((p: any) => !p.seatHeld).length;
        }
        await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      }

      // ربط الـ socket بالغرفة
      socket.join(data.roomId);
      socket.data.role = 'player';
      socket.data.roomId = data.roomId;
      socket.data.physicalId = player.physicalId;

      // 🕵️ إغلاق الغياب المفتوح (إن كان انقطع أثناء لعبةٍ حيّة): تُحسب المدّة من
      // لحظة الانقطاع المسجّلة خادميّاً لا من قياس الجهاز. والعلَم يمنع ازدواج
      // التسجيل إن أرسل الجهاز بلاغه الخاصّ عن نفس الغياب بعد لحظات.
      void closeAbsence(io, data.roomId, player.physicalId).then((closed) => {
        if (closed) socket.data.serverAbsenceClosedAt = Date.now();
      }).catch(() => {});

      // إخفاء الدور إذا لم يتم تأكيد الأدوار بعد
      const shouldShowRole = state.rolesConfirmed || 
        (state.phase !== Phase.ROLE_BINDING && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.LOBBY);

      // جمع زملاء المافيا إذا اللاعب مافيا
      let mafiaTeamData: any[] | undefined;
      if (shouldShowRole && player.role && isMafiaRole(player.role as Role) && state.config.allowMafiaReveal !== false) {
        mafiaTeamData = state.players
          .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false && p.physicalId !== player.physicalId)
          .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: p.role, avatarUrl: p.avatarUrl || null }));
      }

      // 👥 تعارف الأخوين (إعادة التسليم عند rejoin)
      const siblingData = shouldShowRole ? getSiblingInfoFor(state, player.physicalId) : null;

      // بيانات التصويت للاستعادة الفورية عند rejoin
      const votingData = state.phase === Phase.DAY_VOTING && state.votingState?.candidates?.length > 0 ? {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        playerVotes: state.votingState.playerVotes || {},
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        playersInfo: state.players.filter((p: any) => p.isAlive).map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          avatarUrl: p.avatarUrl || null,
        })),
      } : null;

      // جمع عقود السفّاح إذا اللاعب هو السفّاح
      let assassinContractsData: any = null;
      if (shouldShowRole && player.role === 'ASSASSIN' && state.assassinState) {
        assassinContractsData = {
          contracts: state.assassinState.contracts,
          currentIndex: state.assassinState.currentContractIndex,
          completedCount: state.assassinState.completedCount,
          totalRequired: state.assassinState.totalRequired,
        };
      }

      callback({
        success: true,
        player: {
          physicalId: player.physicalId,
          name: player.name,
          role: shouldShowRole ? (player.role || null) : null,
          isAlive: player.isAlive,
          gender: player.gender || 'MALE',
          playerId: player.playerId || null,
          penalties: player.penalties || 0,
        },
        mafiaTeam: mafiaTeamData || [],
        sibling: siblingData,
        assassinContracts: assassinContractsData,
        phase: state.phase,
        gameName: state.config?.gameName || '',
        roomCode: state.roomCode || '',
        votingState: votingData,
        maxPenalties: state.config?.maxPenalties || 3,
        mafiaChatEnabled: state.config?.mafiaChatEnabled === true,   // 🗣️ علم إعداد عام — لا يكشف هوية
      });

      console.log(`♻️  Player rejoin: #${player.physicalId} - ${player.name} (alive: ${player.isAlive})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تجميد لاعب في غرفة (للتنقل بين الغرف) ──────
  socket.on('room:freeze-player', async (data: {
    roomId: string;
    phone?: string;
    playerId?: number;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث عن اللاعب
      const player = state.players.find((p: any) =>
        (data.playerId && p.playerId === data.playerId) ||
        (data.phone && p.phone === data.phone)
      );

      if (!player) return callback({ success: false, error: 'Player not found' });

      // ── شرط: اللاعب لازم يكون ميت (مُقصى) عشان ينتقل ──
      if (player.isAlive) {
        return callback({ success: false, error: 'لا يمكنك الانتقال إلا بعد إقصائك من اللعبة الحالية' });
      }

      // تجميد اللاعب
      player.frozen = true;
      await setGameState(data.roomId, state);

      // خروج الـ socket من الغرفة القديمة
      socket.leave(data.roomId);

      console.log(`🧊 Player #${player.physicalId} (${player.name}) frozen in room ${data.roomId}`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: تغيير أرقام اللاعبين جماعياً ──
  // ── 🔄 تحديث مقاعد الغرفة من القالب المُعدّل (LOBBY فقط، دمج آمن + تقرير تعارضات) ──
  socket.on('room:resync-template', async (data: { roomId: string }, callback) => {
    const reply = (r: any) => { if (typeof callback === 'function') callback(r); };
    try {
      if (socket.data.role !== 'leader') return reply({ success: false, error: 'Only leader' });
      const state = await getRoom(data.roomId);
      if (!state) return reply({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.LOBBY) return reply({ success: false, error: 'لا يمكن تحديث القالب أثناء اللعب — الغرفة يجب أن تكون في اللوبي' });
      const res = await resyncSeatTemplate(state);
      if (!res.ok) {
        const msg = res.reason === 'template-deleted' ? 'القالب محذوف — أُبقيت الحجوزات الحالية كما هي'
          : res.reason === 'no-template' ? 'الفعالية غير مرتبطة بقالب مقاعد'
          : 'تعذّر التحديث';
        return reply({ success: false, error: msg, deleted: res.deleted });
      }
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      console.log(`🔄 Room ${data.roomId} re-synced from template — ${res.pinned} pinned, ${res.conflicts.length} conflicts`);
      reply({ success: true, conflicts: res.conflicts, capacityWarning: res.capacityWarning, pinned: res.pinned });
    } catch (e: any) { reply({ success: false, error: e.message }); }
  });

  // ── فتح مؤقّت للأدوات الحسّاسة (اسم محايد) — يتحقق من الرقم السرّي ويفتح لمدة محدودة ──
  // الواجهة ترسل الرقم المُدخَل عبر إيماءة مموّهة؛ السرّ يعيش في env فقط (لا في كود الواجهة).
  socket.on('leader:tools-ping', (data: { code?: string | number }, callback) => {
    // success مطلوب لغلاف emit() في الواجهة (يرفض أي رد بدونه) — ok يبقى للتوافق
    const reply = (ok: boolean, extra: any = {}) => {
      if (typeof callback === 'function') callback({ ok, success: ok, ...extra });
    };
    try {
      if (socket.data.role !== 'leader') return reply(false);
      const now = Date.now();
      // تحديد المحاولات: 5 كل 10 دقائق لكل اتصال (يمنع التخمين بالقوة)
      let rl = socket.data._toolsRL as { count: number; resetAt: number } | undefined;
      if (!rl || now > rl.resetAt) rl = { count: 0, resetAt: now + 10 * 60 * 1000 };
      if (rl.count >= 5) {
        socket.data._toolsRL = rl;
        // ⏳ ردٌّ مميَّز: كان يعود «رقم غير صحيح» فيظنّ الليدر أنّه أخطأ الكتابة
        //    ويكرّر بلا جدوى عشر دقائق كاملة.
        return reply(false, { code: 'RATE_LIMITED', retryInSec: Math.max(1, Math.ceil((rl.resetAt - now) / 1000)) });
      }
      rl.count++;
      socket.data._toolsRL = rl;

      const secret = process.env.RENUMBER_SECRET || '';
      if (secret.length === 0) {
        // 🚨 سرٌّ فارغ في البيئة ⇒ كلّ أدوات المقاعد ميّتة صامتة. يُشخَّص بدل أن يُخمَّن.
        console.error('❌ RENUMBER_SECRET is empty — every seat tool is permanently locked');
        return reply(false, { code: 'SECRET_NOT_CONFIGURED' });
      }
      const ok = String(data?.code ?? '') === secret;
      if (ok) {
        socket.data.toolsUnlockedUntil = now + TOOLS_UNLOCK_MS;
        socket.data._toolsRL = { count: 0, resetAt: now + 10 * 60 * 1000 };
        // 🔑 الفتح يتبع هويّة الموظّف لا الاتصال: كان يموت مع كلّ انقطاع Wi-Fi
        //    فيُعاد إدخال السرّ عند أوّل نقلة بعد كلّ إعادة اتصال.
        const staffId = socket.data.authStaff?.id;
        if (staffId) toolsUnlockByStaff.set(String(staffId), socket.data.toolsUnlockedUntil);
      }
      reply(ok, ok ? { until: socket.data.toolsUnlockedUntil } : { code: 'BAD_CODE' });
    } catch { reply(false); }
  });

  socket.on('room:renumber-players', async (data: {
    roomId: string;
    changes: Array<{ oldPhysicalId: number; newPhysicalId: number }>;
    confirmHazard?: boolean;
    reason?: string;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      // 🔒 الأداة مقفلة حتى يُدخَل الرقم السرّي.
      // كان الردّ خطأً عامّاً «مشكلة مؤقتة» بلا code، فيظلّ الليدر يعيد المحاولة
      // دون أن يعرف أنّ عليه الضغط المطوّل على كود الغرفة لفتح حقلٍ مخفيّ.
      if (!toolsUnlocked(socket)) {
        return callback({ success: false, code: 'TOOLS_LOCKED', error: 'الأدوات مقفلة — أدخل الرقم السرّي' });
      }

      let state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // أثناء اللعب يُسمح الآن بالدفعة خلف رصد المخاطر نفسه الذي يحرس النقل الفرديّ
      // — بتأكيدٍ **واحد للدفعة كلّها** بدل تأكيدٍ لكلّ نقلة على حدة.
      const inPlay = state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.GAME_OVER;
      if (inPlay) {
        const hz = detectSeatMoveHazard(state);
        if (hz?.blocking) {
          return callback({ success: false, code: 'HAZARD_BLOCKED', error: hz.message });
        }
        if (hz && !data.confirmHazard) {
          return callback({ success: false, code: 'HAZARD_CONFIRM', hazard: hz.kind, error: hz.message });
        }
      }

      // 🔒 قفل تسلسل لكلّ غرفة — كان الترقيم يتقاطع مع نقلٍ جارٍ فيتلف الترتيب
      if (seatMoveInFlight.has(data.roomId)) {
        return callback({ success: false, error: 'هناك عملية نقل جارية — أعد المحاولة' });
      }
      seatMoveInFlight.add(data.roomId);
      try {

      // فلترة التغييرات الفعلية فقط
      const actualChanges = data.changes.filter(c => c.oldPhysicalId !== c.newPhysicalId);
      if (actualChanges.length === 0) {
        return callback({ success: true });
      }

      // التحقق من عدم وجود أرقام جديدة مكررة
      const allNewIds = data.changes.map(c => c.newPhysicalId);
      const uniqueNewIds = new Set(allNewIds);
      if (uniqueNewIds.size !== allNewIds.length) {
        return callback({ success: false, error: 'يوجد أرقام مكررة في القائمة الجديدة' });
      }

      // النطاق = سعة الغرفة (كان 1..99 فيُرقّم لاعبٌ إلى مقعد خارج السعة فيختفي)
      const capMax = state.config.maxPlayers;
      if (allNewIds.some(id => id < 1 || id > capMax)) {
        return callback({ success: false, error: `الأرقام يجب أن تكون بين 1 و ${capMax}` });
      }
      // 👁️ مقاعد المتفرّجين مشغولة — لا يُرقّم أحد إليها
      const specSeats = new Set(getSpectators(state).map(sp => sp.physicalId));
      const hitSpec = allNewIds.find(id => specSeats.has(id));
      if (hitSpec) {
        return callback({ success: false, error: `المقعد ${hitSpec} محجوز لمتفرّج` });
      }

      // 🛡️ التحقق من التصادم مع لاعبين خارج قائمة التغييرات
      // (كان ترقيم 5→7 والمقعد 7 مشغولاً بلاعب غير مشمول يُنتج لاعبَين بنفس الرقم!)
      const collisionError = validateRenumberChanges(state.players, data.changes);
      if (collisionError) {
        return callback({ success: false, error: collisionError });
      }

      // تطبيق التغييرات بأمان (بدون تعارض عند مبادلة الأرقام)
      // بناء خريطة oldId → newId من كل التغييرات
      const idMap = new Map<number, number>();
      for (const change of actualChanges) {
        idMap.set(change.oldPhysicalId, change.newPhysicalId);
      }

      // 🔁 إعادة ربط شاملة: players + كل البنى المرتبطة برقم المقعد
      // (أصوات التصويت، التوائم، السفّاح، الشرطية، النقاش، القنبلة، أهداف الليل…)
      remapPhysicalIds(state, idMap);

      await setGameState(data.roomId, state);

      // 🗄️ مزامنة أرقام المقاعد في قاعدة البيانات (session_players)
      if (state.sessionId) {
        await remapSessionPlayerSeats(state.sessionId, actualChanges);
      }

      // ── إرسال تحديث الرقم لكل لاعب متأثر عبر WebSocket ──
      // نبني خريطة socket → change أولاً لتجنب مشاكل الـ swap
      const allSockets = await io.in(data.roomId).fetchSockets();
      const socketChanges: Array<{ socket: any; oldId: number; newId: number }> = [];
      
      for (const change of actualChanges) {
        for (const s of allSockets) {
          if (s.data.role === 'player' && s.data.physicalId === change.oldPhysicalId) {
            socketChanges.push({ socket: s, oldId: change.oldPhysicalId, newId: change.newPhysicalId });
          }
        }
      }

      // تطبيق التغييرات دفعة واحدة (بعد الانتهاء من البحث)
      for (const sc of socketChanges) {
        sc.socket.data.physicalId = sc.newId;
        sc.socket.emit('player:seat-changed', {
          oldPhysicalId: sc.oldId,
          newPhysicalId: sc.newId,
        });
        console.log(`📤 Seat change notification sent: #${sc.oldId} → #${sc.newId}`);
      }

      // 🗺️ إشارة الإبطال العامّة — كانت غائبة عن هذا المسار وحده.
      // بدونها لا تمسح الأجهزة ذاكرتها المفهرسة بالمقاعد (خطرٌ ظاهر في GAME_OVER
      // حيث للعرض طبقات كشفٍ مثبّتة على المقاعد).
      io.to(data.roomId).emit('room:seats-remapped', {
        map: Object.fromEntries(idMap),
        swapped: actualChanges.length > 1,
        bulk: true,
        at: Date.now(),
      });

      // 🗣️ سجلّ دردشة المافيا يعيش خارج حالة اللعبة فلا يراه الجوّال — يُرقّم يدويّاً
      try { await remapMafiaChatSeats(data.roomId, idMap); } catch {}

      // بث التحديث الكامل لكل الشاشات (الآلية الرئيسية للمزامنة)
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);

      // إعادة دفع الأسرار للمنقولين (الدور، فريق المافيا، التوأم، عقود السفّاح)
      try { await republishAfterSeatMove(io, data.roomId, state, actualChanges.map(c => c.newPhysicalId)); } catch {}

      try {
        const { logStaffAction } = await import('../services/staff-action-log.service.js');
        logStaffAction({
          staffId: socket.data.authStaff?.id, staffUsername: socket.data.authStaff?.username, staffRole: socket.data.authStaff?.role,
          source: 'socket', action: 'socket:renumber-players',
          details: { roomId: data.roomId, phase: state.phase, changes: actualChanges, reason: data.reason || null },
        });
      } catch { /* غير حاجب */ }

      callback({ success: true, applied: actualChanges.length });
      } finally {
        seatMoveInFlight.delete(data.roomId);
      }
    } catch (err: any) {
      seatMoveInFlight.delete(data.roomId);
      callback({ success: false, error: err.message });
    }
  });

  // ── 🪑 نقل/تبديل مقعد بلمستين — خاضع لنفس قفل السرّ الخاص بمودال تعديل الأرقام ──
  // الهدف فارغ → نقل؛ مشغول → تبديل ذرّي. يعيد ربط كل البنى + يزامن DB + يُخطر الأجهزة.
  socket.on('room:move-seat', async (data: {
    roomId: string;
    fromPhysicalId: number;
    toSeat: number;
    confirmHazard?: boolean;   // ⚠️ تأكيد صريح لتنفيذ النقل رغم وجود قرار جارٍ
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      // 🔒 نفس منطق السرّ (RENUMBER_SECRET عبر leader:tools-ping).
      // الرمز TOOLS_LOCKED يسمح لواجهة الليدر بطلب السرّ فوراً في مكانه بدل إرسال الليدر
      // للبحث عن مدخل الفتح في شاشة أخرى. النصّ يبقى عاماً لمن يقرأ الشاشة من بعيد.
      if (!toolsUnlocked(socket)) {
        return callback({ success: false, code: 'TOOLS_LOCKED', error: 'تعذّر تنفيذ النقل — مشكلة مؤقتة، حاول لاحقاً' });
      }

      // 🔒 قفل تسلسل لكل غرفة — يمنع نقلين متزامنين يتقاطعان على نفس الحالة
      if (seatMoveInFlight.has(data.roomId)) {
        return callback({ success: false, error: 'هناك عملية نقل جارية — انتظر لحظة' });
      }
      seatMoveInFlight.add(data.roomId);
      try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const toSeat = Math.floor(Number(data.toSeat));
      if (!Number.isFinite(toSeat) || toSeat < 1 || toSeat > (state.config.maxPlayers || 50)) {
        return callback({ success: false, error: `المقعد يجب أن يكون بين 1 و ${state.config.maxPlayers}` });
      }

      const mover = state.players.find(p => p.physicalId === data.fromPhysicalId);
      if (!mover) return callback({ success: false, error: 'اللاعب غير موجود' });
      if (toSeat === data.fromPhysicalId) return callback({ success: true, swapped: false });

      // ⚠️ رصد «القرار الجاري»: النقل مسموح في كل المراحل، لكن بعض النوافذ تحتاج قراراً واعياً
      // من الليدر (أو منعاً صريحاً) لأن إعادة الترقيم تقع في منتصف حسمٍ جارٍ.
      const hazard = detectSeatMoveHazard(state);
      if (hazard?.blocking) {
        return callback({ success: false, code: 'HAZARD_BLOCKED', error: hazard.message });
      }
      if (hazard && !data.confirmHazard) {
        return callback({ success: false, code: 'HAZARD_CONFIRM', hazard: hazard.kind, error: hazard.message });
      }

      const occupant = state.players.find(p => p.physicalId === toSeat);
      const changes = occupant
        ? [ { oldPhysicalId: data.fromPhysicalId, newPhysicalId: toSeat }, { oldPhysicalId: toSeat, newPhysicalId: data.fromPhysicalId } ]
        : [ { oldPhysicalId: data.fromPhysicalId, newPhysicalId: toSeat } ];

      const idMap = new Map<number, number>(changes.map(c => [c.oldPhysicalId, c.newPhysicalId]));
      // 🔁 إعادة ربط شاملة (players + الأصوات/التوائم/السفّاح/الشرطية…)
      remapPhysicalIds(state, idMap);
      await setGameState(data.roomId, state);

      // 🗄️ مزامنة قاعدة البيانات
      if (state.sessionId) { await remapSessionPlayerSeats(state.sessionId, changes); }

      // 🗣️ إعادة ترقيم سجلّ دردشة المافيا (خارج حالة اللعبة — لا يمسّه الجوّال)
      await remapMafiaChatSeats(data.roomId, idMap);

      // إخطار أجهزة اللاعبين المتأثرين + تحديث هوية سوكتاتهم
      // (اجمع المطابقات أولاً ثم طبّق — وإلا في التبديل يُطابق السوكت المعدَّل التغيير الثاني)
      const allSockets = await io.in(data.roomId).fetchSockets();
      const socketChanges: Array<{ s: any; oldId: number; newId: number }> = [];
      for (const change of changes) {
        for (const s of allSockets) {
          if ((s as any).data?.role === 'player' && (s as any).data?.physicalId === change.oldPhysicalId) {
            socketChanges.push({ s, oldId: change.oldPhysicalId, newId: change.newPhysicalId });
          }
        }
      }
      for (const sc of socketChanges) {
        sc.s.data.physicalId = sc.newId;
        sc.s.emit('player:seat-changed', { oldPhysicalId: sc.oldId, newPhysicalId: sc.newId });
      }

      // 🧹 إشارة الإبطال للغرفة كلها — الذاكرة المشتقّة الخاطئة عند **الجميع** لا عند المنقولَين
      // فقط (خرائط الأدوار المكشوفة/المقصيين/المُسكتين، أحداث الصباح، الملاحظات، نوافذ القرار).
      // العقد: امحُ ما هو مفهرس بالمقاعد ← رحّل ملاحظاتك ← اسأل الخادم ← أعد الاشتقاق.
      const seatMap: Record<string, number> = {};
      for (const c of changes) seatMap[String(c.oldPhysicalId)] = c.newPhysicalId;
      io.to(data.roomId).emit('room:seats-remapped', {
        map: seatMap,
        swapped: !!occupant,
        at: Date.now(),
      });

      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);

      // 🔄 إعادة الدفع الخاصّة: كل لاعب متأثّر يستعيد دوره/فريقه/توأمه/عقوده، وتُعاد
      // خطوة الليل الجارية إلى السوكِت الصحيح — وإلا بقيت شاشة الطُّعم أو ضاعت الخطوة.
      await republishAfterSeatMove(io, data.roomId, state, socketChanges.map(sc => sc.newId));

      console.log(`🪑 Seat ${occupant ? 'swap' : 'move'} [${state.phase}]: #${data.fromPhysicalId} → #${toSeat}${occupant ? ` (تبادل مع «${occupant.name}»)` : ''}`);

      // 📋 سجلّ عمليات — النقل أثناء اللعب إجراء إداري حسّاس
      try {
        const { logStaffAction } = await import('../services/staff-action-log.service.js');
        logStaffAction({
          staffId: socket.data.authStaff?.id, staffUsername: socket.data.authStaff?.username, staffRole: socket.data.authStaff?.role,
          source: 'socket', action: 'socket:move-seat',
          details: { roomId: data.roomId, phase: state.phase, from: data.fromPhysicalId, to: toSeat,
            swappedWith: occupant?.name || null, moverName: mover.name, hazard: hazard?.kind || null },
        });
      } catch { /* غير حاجب */ }

      callback({ success: true, swapped: !!occupant, occupantName: occupant?.name || null });
      } finally {
        seatMoveInFlight.delete(data.roomId);
      }
    } catch (err: any) {
      seatMoveInFlight.delete(data.roomId);
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: تعديل/إضافة لاعب يدوياً ──
  // ══════════════════════════════════════════════════════
  // 🪄 أدواتُ المقاعد الجماعيّة (القرارات المقفلة ٣ · ٤ · ٥ · ٨)
  // ══════════════════════════════════════════════════════

  /** يطبّق دفعةَ تغييرات بعقد النقل الكامل: ربط عميق ← DB ← دردشة ← أجهزة ← بثّ. */
  async function applySeatChanges(
    roomId: string,
    changes: Array<{ oldPhysicalId: number; newPhysicalId: number }>,
    meta: { action: string; reason?: string | null; confirmHazard?: boolean },
  ): Promise<{ ok: true } | { ok: false; code?: string; error: string }> {
    const state = await getRoom(roomId);
    if (!state) return { ok: false, error: 'Room not found' };

    const actual = changes.filter(c => c.oldPhysicalId !== c.newPhysicalId);
    if (actual.length === 0) return { ok: true };

    const inPlay = state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.GAME_OVER;
    if (inPlay) {
      const hz = detectSeatMoveHazard(state);
      if (hz?.blocking) return { ok: false, code: 'HAZARD_BLOCKED', error: hz.message };
      if (hz && !meta.confirmHazard) return { ok: false, code: 'HAZARD_CONFIRM', error: hz.message };
    }

    const collision = validateRenumberChanges(state.players, actual);
    if (collision) return { ok: false, error: collision };

    const specSeats = new Set(getSpectators(state).map(sp => sp.physicalId));
    const hitSpec = actual.find(c => specSeats.has(c.newPhysicalId));
    if (hitSpec) return { ok: false, error: `المقعد ${hitSpec.newPhysicalId} محجوز لمتفرّج` };

    const idMap = new Map<number, number>(actual.map(c => [c.oldPhysicalId, c.newPhysicalId]));
    remapPhysicalIds(state, idMap);
    await setGameState(roomId, state);
    if (state.sessionId) { try { await remapSessionPlayerSeats(state.sessionId, actual); } catch {} }

    const allSockets = await io.in(roomId).fetchSockets();
    const pending: Array<{ sk: any; oldId: number; newId: number }> = [];
    for (const c of actual) {
      for (const sk of allSockets) {
        if (sk.data.role === 'player' && sk.data.physicalId === c.oldPhysicalId) {
          pending.push({ sk, oldId: c.oldPhysicalId, newId: c.newPhysicalId });
        }
      }
    }
    for (const q of pending) {
      q.sk.data.physicalId = q.newId;
      q.sk.emit('player:seat-changed', { oldPhysicalId: q.oldId, newPhysicalId: q.newId });
    }

    io.to(roomId).emit('room:seats-remapped', {
      map: Object.fromEntries(idMap), swapped: actual.length > 1, bulk: true, at: Date.now(),
    });
    try { await remapMafiaChatSeats(roomId, idMap); } catch {}
    await emitStateSanitized(io, roomId, 'game:state-sync', state);
    try { await republishAfterSeatMove(io, roomId, state, actual.map(c => c.newPhysicalId)); } catch {}

    try {
      const { logStaffAction } = await import('../services/staff-action-log.service.js');
      logStaffAction({
        staffId: socket.data.authStaff?.id, staffUsername: socket.data.authStaff?.username, staffRole: socket.data.authStaff?.role,
        source: 'socket', action: meta.action,
        details: { roomId, phase: state.phase, changes: actual, reason: meta.reason || null },
      });
    } catch {}

    return { ok: true };
  }

  /** يبني بيانات الجلوس المُثراة + سياق التقييم لغرفةٍ كاملة (مشترك بين الاقتراح والتحذيرات). */
  async function buildSeatingContextFor(state: any) {
    const db = getDB();
    const dbById = new Map<number, any>();
    const ids = state.players.map((p: any) => p.playerId).filter((x: any) => typeof x === 'number' && x > 0);
    if (db && ids.length > 0) {
      try {
        const { inArray } = await import('drizzle-orm');
        const { players: pTable } = await import('../schemas/player.schema.js');
        const rows = await db.select({
          id: pTable.id, totalMatches: pTable.lifetimeMatches, rankRR: pTable.rankRR,
          rankTier: pTable.rankTier, genderConstraint: pTable.genderConstraint,
        }).from(pTable).where(inArray(pTable.id, ids));
        for (const r of rows) dbById.set(r.id, r);
      } catch {}
    }
    const toSeatData = (p: any) => {
      const d = p.playerId ? dbById.get(p.playerId) : undefined;
      return {
        playerId: p.playerId ?? null, phone: p.phone || '', name: p.name,
        gender: p.gender || 'MALE', totalMatches: d?.totalMatches || 0,
        activityCount: Math.floor((d?.totalMatches || 0) / 3),
        rankRR: d?.rankRR || 0, rankTier: d?.rankTier || 'INFORMANT',
        hasPenalty: (p.penalties || 0) > 0, physicalId: p.physicalId,
        seatHeld: !!p.seatHeld, genderConstraint: d?.genderConstraint || 'NONE',
      };
    };

    let affinityPairs = new Map<string, number>();
    try {
      affinityPairs = await buildAffinityPairs({
        sessionId: state.sessionId, activityId: state.activityId,
        people: state.players.map((p: any) => ({ playerId: p.playerId ?? null, phone: p.phone, name: p.name })),
      });
      const rules = await loadPairRules({ activityId: state.activityId, roomId: state.roomId });
      affinityPairs = mergeRulesIntoAffinity(affinityPairs, rules);
    } catch {}

    let seatingConfig: any = null;
    if (state.activityId && db) {
      try {
        const rows: any = await db.execute(sql`SELECT seat_constraints FROM activities WHERE id = ${state.activityId}`);
        seatingConfig = ((rows as any).rows || rows || [])[0]?.seat_constraints || null;
      } catch {}
    }
    if (!seatingConfig) seatingConfig = { engineEnabled: true, strictness: 'relaxed' };
    else seatingConfig.engineEnabled = true;

    return {
      toSeatData,
      seatingConfig,
      context: {
        maxPlayers: state.config.maxPlayers,
        sessionId: state.sessionId,
        penaltyNeighborHistory: new Map<string, number>(),
        constraintParams: {},
        pinnedSeats: (state as any).pinnedSeats || [],
        reservedTailSeats: (state as any).reservedTailSeats || 0,
        doorSeats: (state as any).doorSeats || [],
        affinityPairs,
      },
    };
  }

  // ── 🪄 «رتّب تلقائيّاً»: اقتراحٌ بمعاينة ثمّ تطبيقٌ ذرّيّ (S2) ──
  // القرار المقفل ٨: المقاعد ثابتة عبر الليلة، وهذا الزرّ يدويّ يظهر عند وجود تعارض.
  // القرار المقفل ٥: بلا رقمٍ سرّيّ في اللوبي (مع سجلّ موظّفين لكلّ عمليّة).
  socket.on('room:reshuffle-seats', async (data: {
    roomId: string; dryRun?: boolean; lockedSeats?: number[];
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ⚠️ إعادةُ ترتيبٍ شاملة أثناء اللعب تُغيّر جيرانَ القنبلة وأهدافَ الليل دفعةً
      //    واحدة — تبقى محصورةً في نوافذ إدارة الروستر.
      if (state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.GAME_OVER) {
        return callback({ success: false, error: 'إعادة الترتيب متاحة في اللوبي أو بعد انتهاء اللعبة فقط' });
      }
      if (seatMoveInFlight.has(data.roomId)) {
        return callback({ success: false, error: 'هناك عملية نقل جارية — أعد المحاولة' });
      }

      const { toSeatData, seatingConfig, context } = await buildSeatingContextFor(state);
      const lockedIds = new Set<number>(data.lockedSeats || []);
      const locked = new Map<number, any>();
      const movable: any[] = [];
      for (const p of state.players) {
        // المحجوز والمجمّد ومن قفله الليدر لا يتحرّكون
        if (p.seatHeld || p.frozen || lockedIds.has(p.physicalId)) locked.set(p.physicalId, toSeatData(p));
        else movable.push(toSeatData(p));
      }
      // 👁️ مقاعد المتفرّجين مشغولة ولا تدخل التوزيع
      for (const sp of getSpectators(state)) {
        if (sp.physicalId > 0 && !locked.has(sp.physicalId)) {
          locked.set(sp.physicalId, {
            playerId: sp.playerId ?? null, phone: sp.phone || '', name: sp.name,
            gender: sp.gender || 'MALE', totalMatches: 0, activityCount: 0,
            rankRR: 0, rankTier: 'INFORMANT', physicalId: sp.physicalId, genderConstraint: 'NONE',
          });
        }
      }

      if (movable.length === 0) return callback({ success: false, error: 'لا يوجد لاعبون قابلون للنقل' });

      const before = countAdjacencyIssues(state, context.affinityPairs);
      const result = reshuffleSeating({
        maxPlayers: state.config.maxPlayers,
        players: movable,
        seatingConfig,
        context: context as any,
        lockedSeats: locked,
      });

      const changes = result.arrangement
        .filter(a => a.fromSeat && a.fromSeat !== a.seatNumber && !locked.has(a.fromSeat))
        .map(a => ({ oldPhysicalId: a.fromSeat as number, newPhysicalId: a.seatNumber }));

      const preview = changes.map(c => {
        const pl = state.players.find((x: any) => x.physicalId === c.oldPhysicalId);
        return { from: c.oldPhysicalId, to: c.newPhysicalId, name: pl?.name || '' };
      });

      if (data.dryRun !== false) {
        return callback({
          success: true, dryRun: true, changes: preview,
          violationsBefore: before, violationsAfter: result.violations.length,
          score: Number(result.totalScore.toFixed(2)),
        });
      }

      if (changes.length === 0) return callback({ success: true, applied: 0, changes: [] });
      seatMoveInFlight.add(data.roomId);
      let res;
      try {
        res = await applySeatChanges(data.roomId, changes, { action: 'socket:reshuffle-seats', reason: 'auto-arrange' });
      } finally {
        seatMoveInFlight.delete(data.roomId);
      }
      if (!res.ok) return callback({ success: false, code: (res as any).code, error: (res as any).error });
      return callback({ success: true, applied: changes.length, changes: preview });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ✂️ «افصل هذين» (S5 · القرار المقفل ٤: الافتراضيّ «دائم») ──
  socket.on('room:separate-pair', async (data: {
    roomId: string;
    aPhysicalId: number;
    bPhysicalId: number;
    scope?: 'room' | 'activity' | 'global';
    autoMove?: boolean;
    confirmHazard?: boolean;
    reason?: string;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const a = state.players.find((p: any) => p.physicalId === data.aPhysicalId);
      const b = state.players.find((p: any) => p.physicalId === data.bPhysicalId);
      if (!a || !b) return callback({ success: false, error: 'أحد اللاعبَين غير موجود' });

      // 🔐 القرار المقفل ٥: بلا سرّ في نوافذ إدارة الروستر، وبالسرّ أثناء اللعب.
      const inPlay = state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.GAME_OVER;
      if (inPlay && !toolsUnlocked(socket)) {
        return callback({ success: false, code: 'TOOLS_LOCKED', error: 'الأدوات مقفلة — أدخل الرقم السرّي' });
      }

      // 📏 القاعدة تُخزَّن بالهويّة لا بالمقعد: المقاعد تتغيّر، والأشخاص لا.
      const scope = data.scope || 'global';   // ← الافتراضيّ «دائم» بقرار المالك
      const keyA = personKey({ playerId: a.playerId, phone: a.phone, name: a.name });
      const keyB = personKey({ playerId: b.playerId, phone: b.phone, name: b.name });
      const saved = await upsertPairRule({
        // ⚖️ «يثرثران» ليست عداوة: تُسجَّل تباعداً مرناً لا منعاً صارماً، وإلّا تراكمت
        //    أزواجٌ صارمة دائمة حتّى تعجز الغرفة الممتلئة عن الحلّ فتُجلسهم متجاورين بصمت.
        kind: 'separate',
        personA: keyA, personB: keyB, nameA: a.name, nameB: b.name,
        weight: 1.0, scope,
        activityId: scope === 'activity' ? (state.activityId ?? null) : null,
        roomId: scope === 'room' ? data.roomId : null,
        source: 'leader',
        reason: data.reason || null,
        createdBy: socket.data.authStaff?.id ?? null,
        expiresAt: null,
      });

      let moved: { from: number; to: number } | null = null;
      if (data.autoMove !== false) {
        // أفضل وجهة للطرف الثاني: أبعد مقعدٍ فارغ عن الأوّل (أو تبديل إن امتلأت)
        const taken = new Set<number>([
          ...state.players.map((p: any) => p.physicalId),
          ...getSpectators(state).map(sp => sp.physicalId),
        ]);
        const cap = state.config.maxPlayers;
        let best = 0, bestDist = -1;
        for (let seat = 1; seat <= cap; seat++) {
          if (taken.has(seat)) continue;
          const d = Math.min(Math.abs(seat - a.physicalId), cap - Math.abs(seat - a.physicalId));
          if (d > bestDist) { bestDist = d; best = seat; }
        }
        if (best > 0) {
          const res = await applySeatChanges(
            data.roomId,
            [{ oldPhysicalId: b.physicalId, newPhysicalId: best }],
            { action: 'socket:separate-pair', reason: `separate ${a.name}/${b.name}`, confirmHazard: data.confirmHazard },
          );
          if (!res.ok) return callback({ success: false, code: (res as any).code, error: (res as any).error, ruleSaved: saved });
          moved = { from: b.physicalId, to: best };
        }
      }

      return callback({ success: true, ruleSaved: saved, scope, moved });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 👁️ إدارة المتفرّجين عند الليدر ──
  socket.on('room:remove-spectator', async (data: { roomId: string; physicalId: number }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      const before = getSpectators(state).length;
      (state as any).spectators = getSpectators(state).filter(sp => sp.physicalId !== data.physicalId);
      if (getSpectators(state).length === before) return callback({ success: false, error: 'المتفرّج غير موجود' });
      await setGameState(data.roomId, state);
      await emitTrustedOnly(io, data.roomId, 'room:spectator-removed', { physicalId: data.physicalId, waitingCount: getSpectators(state).length });
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      const sockets = await io.in(spectatorRoom(data.roomId)).fetchSockets();
      for (const sk of sockets) if (sk.data.physicalId === data.physicalId) { sk.emit('spectator:removed', {}); sk.leave(spectatorRoom(data.roomId)); }
      callback({ success: true, waitingCount: getSpectators(state).length });
    } catch (err: any) { callback({ success: false, error: err.message }); }
  });

  // ── ✅ «أدخله الآن» أثناء ربط الأدوار قبل اعتمادها (القرار المقفل ٧) ──
  // لا إدخال تلقائيّ: الزرّ للّيدر وحده، وما دام rolesConfirmed=false فلا سرّ عند أحد.
  socket.on('setup:admit-spectator', async (data: { roomId: string; physicalId: number }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.rolesConfirmed) {
        return callback({ success: false, error: 'اعتُمدت الأدوار — ينتظر اللعبة القادمة' });
      }
      if (state.phase !== Phase.ROLE_BINDING && state.phase !== Phase.ROLE_GENERATION) {
        return callback({ success: false, error: 'الإدخال الفوريّ متاح قبل اعتماد الأدوار فقط' });
      }
      const spec = getSpectators(state).find(sp => sp.physicalId === data.physicalId);
      if (!spec) return callback({ success: false, error: 'المتفرّج غير موجود' });
      if (state.players.some((p: any) => p.physicalId === spec.physicalId)) {
        return callback({ success: false, error: 'المقعد صار مشغولاً' });
      }

      state.players.push({
        physicalId: spec.physicalId, name: spec.name, phone: spec.phone ?? null,
        dob: spec.dob ?? null, gender: spec.gender ?? null, playerId: spec.playerId ?? null,
        role: null, isAlive: true, isSilenced: false, justificationCount: 0,
        addedBy: spec.addedBy || 'self', avatarUrl: spec.avatarUrl ?? null,
        rankTier: spec.rankTier ?? null, cosmetics: spec.cosmetics ?? null,
        isConnected: true, penalties: 0,
      } as any);
      state.players.sort((a: any, b: any) => a.physicalId - b.physicalId);
      (state as any).spectators = getSpectators(state).filter(sp => sp.physicalId !== data.physicalId);
      // مجمّع الأدوار يكبر بمواطن، وتسقط المصادقة كي يعيد الليدر الاعتماد
      if (Array.isArray(state.rolesPool) && state.rolesPool.length > 0) {
        state.rolesPool.push('CITIZEN' as any);
      }
      state.rolesConfirmed = false;
      await setGameState(data.roomId, state);

      if (state.sessionId) {
        try { await addPlayerToSession(state.sessionId, spec.physicalId, spec.name, spec.phone || undefined, spec.gender || undefined, spec.dob || undefined, spec.playerId || null); } catch {}
      }
      const sockets = await io.in(spectatorRoom(data.roomId)).fetchSockets();
      for (const sk of sockets) {
        if (sk.data.physicalId === spec.physicalId) {
          sk.leave(spectatorRoom(data.roomId)); sk.join(data.roomId);
          sk.data.role = 'player';
          sk.emit('spectator:promoted', { physicalId: spec.physicalId, roomId: data.roomId });
        }
      }
      io.to(data.roomId).emit('room:player-joined', {
        physicalId: spec.physicalId, name: spec.name, playerId: spec.playerId,
        promotedFromSpectator: true, totalPlayers: state.players.length, maxPlayers: state.config.maxPlayers,
      });
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      callback({ success: true, physicalId: spec.physicalId, rolesPoolSize: state.rolesPool?.length || 0 });
    } catch (err: any) { callback({ success: false, error: err.message }); }
  });

  socket.on('room:override-player', async (data: {
    roomId: string;
    physicalId: number;
    name: string;
    newPhysicalId?: number;
    isNew?: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can override' });
      }
      // 🔒 تعديل اسم/رقم لاعب موجود مقفل حتى يُدخَل الرقم السرّي (الإضافة isNew تبقى مفتوحة)
      if (!data.isNew && !toolsUnlocked(socket)) {
        return callback({ success: false, error: 'تعذّر حفظ التعديل — مشكلة مؤقتة، حاول لاحقاً' });
      }

      let state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ✅ السماح بتعديل الاسم/الرقم في حالات إدارة الروستر (لوبي/توليد أدوار/بعد انتهاء اللعبة)
      if (!data.isNew && state.phase !== Phase.LOBBY && state.phase !== Phase.ROLE_GENERATION && state.phase !== Phase.GAME_OVER) {
        return callback({ success: false, error: 'لا يمكن تعديل البيانات أثناء اللعب' });
      }

      if (data.isNew) {
        state = await addPlayer(data.roomId, data.physicalId, data.name);
      } else {
        // بناء كائن التحديثات
        const updates: any = { name: data.name };

        // ═══ تغيير رقم اللاعب (إن وُجد) ═══
        if (data.newPhysicalId !== undefined && data.newPhysicalId !== data.physicalId) {
          // التحقق من أن الرقم الجديد غير مأخوذ
          const existing = state.players.find(p => p.physicalId === data.newPhysicalId);
          if (existing) {
            return callback({ success: false, error: `الرقم ${data.newPhysicalId} مستخدم من لاعب آخر (${existing.name})` });
          }
          if (data.newPhysicalId < 1 || data.newPhysicalId > 99) {
            return callback({ success: false, error: 'الرقم يجب أن يكون بين 1 و 99' });
          }
          updates.physicalId = data.newPhysicalId;
        }

        state = await updatePlayer(data.roomId, data.physicalId, updates);
      }

      io.to(data.roomId).emit('room:player-updated', {
        physicalId: data.newPhysicalId || data.physicalId,
        oldPhysicalId: data.newPhysicalId ? data.physicalId : undefined,
        name: data.name,
        totalPlayers: state.players.length,
      });

      // ── إرسال تحديث الرقم للاعب المتأثر عبر WebSocket ──
      if (data.newPhysicalId && data.newPhysicalId !== data.physicalId) {
        const allSockets = await io.in(data.roomId).fetchSockets();
        for (const s of allSockets) {
          if (s.data.role === 'player' && s.data.physicalId === data.physicalId) {
            s.data.physicalId = data.newPhysicalId;
            s.emit('player:seat-changed', {
              oldPhysicalId: data.physicalId,
              newPhysicalId: data.newPhysicalId,
            });
            console.log(`📤 Seat change notification sent: #${data.physicalId} → #${data.newPhysicalId}`);
          }
        }
      }

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: إضافة لاعب أوفلاين مع كامل البيانات ──
  socket.on('room:force-add-player', async (data: {
    roomId: string;
    physicalId: number;
    name: string;
    phone: string;
    dob: string;
    gender: string;
  }, callback) => {
    try {
      console.log(`[Backend-Socket] room:force-add-player 📥 Received request from leader for room ${data.roomId}`, data);
      
      if (socket.data.role !== 'leader') {
        console.warn(`[Backend-Socket] ❌ Failure: role is ${socket.data.role}, expected 'leader'`);
        return callback({ success: false, error: 'Only leader can override' });
      }

      // 🛡️ فحص مبكر واضح: المقعد مشغول؟ (بدل خطأ عام من addPlayer)
      const preState = await getRoom(data.roomId);
      const occupant = preState?.players.find(p => p.physicalId === data.physicalId);
      if (occupant) {
        return callback({
          success: false,
          error: `المقعد ${data.physicalId} مشغول بـ«${occupant.name}» — اختر مقعداً آخر أو استخدم «نقل مقعد» للتبديل`,
        });
      }
      const specHere = preState ? getSpectators(preState).find(sp => sp.physicalId === data.physicalId) : undefined;
      if (specHere) {
        return callback({
          success: false,
          error: `المقعد ${data.physicalId} محجوز للمتفرّج «${specHere.name}»`,
        });
      }

      // ══ 🔒 حارس المرحلة ══
      // addPlayer بلا حارسٍ أصلاً، والواجهة تُخفي الزرّ فقط — فإن نُفّذ أثناء لعبةٍ
      // جارية دخل «حيٌّ بلا دور» إلى players: يظهر على الشاشة، ويدخل قوائم الأهداف
      // والتصويت، ويُحسب في totalAlive للفائز المنفرد. الآن: يُسجّل متفرّجاً.
      if (preState && preState.phase !== 'LOBBY' && preState.phase !== 'ROLE_GENERATION') {
        if (!Array.isArray((preState as any).spectators)) (preState as any).spectators = [];
        (preState as any).spectators.push({
          physicalId: data.physicalId,
          name: data.name,
          phone: data.phone || null,
          playerId: null,
          gender: data.gender || null,
          dob: data.dob || null,
          avatarUrl: null, rankTier: null, cosmetics: null,
          joinedAt: Date.now(),
          addedBy: 'leader',
        });
        await setGameState(data.roomId, preState);
        await emitTrustedOnly(io, data.roomId, 'room:spectator-joined', {
          physicalId: data.physicalId, name: data.name,
          firstName: String(data.name || '').trim().split(/\s+/)[0] || data.name,
          phone: data.phone || null, playerId: null, gender: data.gender || null,
          joinedAt: Date.now(), waitingCount: getSpectators(preState).length,
          phase: preState.phase, round: preState.round,
        });
        console.log(`👁️ force-add during ${preState.phase} → registered as spectator #${data.physicalId}`);
        return callback({
          success: true,
          spectator: true,
          physicalId: data.physicalId,
          message: 'أُضيف متفرّجاً — يدخل اللعبة القادمة تلقائيّاً',
        });
      }

      console.log(`[Backend-Socket] ➡️ Calling addPlayer(${data.roomId}, ${data.physicalId}, ${data.name}, ${data.phone})`);
      const state = await addPlayer(data.roomId, data.physicalId, data.name, data.phone);
      
      console.log(`[Backend-Socket] ➡️ Calling updatePlayer for dob/gender: ${data.dob}, ${data.gender}`);
      await updatePlayer(data.roomId, data.physicalId, { dob: data.dob, gender: data.gender });

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      console.log(`[Backend-Socket] 📢 Emitting room:player-joined to room ${data.roomId}`);
      io.to(data.roomId).emit('room:player-joined', {
        physicalId: data.physicalId,
        name: data.name,
        totalPlayers: state.players.length,
        maxPlayers: state.config.maxPlayers,
        gender: data.gender || 'MALE',
      });

      console.log(`[Backend-Socket] ✅ Done adding player #${data.physicalId}`);
      callback({ success: true });
    } catch (err: any) {
      console.error(`[Backend-Socket] ❌ Exception in room:force-add-player:`, err.message);
      callback({ success: false, error: err.message });
    }
  });

  // ── صلاحية الليدر: إزالة لاعب ──
  socket.on('room:kick-player', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      // Auto-join as leader — يُسمح لليدر الموظّف أو لمُضيف الغرفة البعيدة (اللاعب-الليدر) لغرفته فقط
      socket.join(data.roomId);
      const isStaffLeader = !!socket.data.authStaff;
      const isPlayerHostOfRoom = socket.data.isPlayerHost === true && socket.data.hostRoomId === data.roomId;
      if (!isStaffLeader && !isPlayerHostOfRoom) {
        if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' });
        return;
      }
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // Remove player from Redis
      state.players = state.players.filter(p => p.physicalId !== data.physicalId);
      await updateRoom(data.roomId, { players: state.players });

      // Remove from PostgreSQL (session_players)
      if (state.sessionId) {
        await removePlayerFromSession(state.sessionId, data.physicalId);
      }

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      io.to(data.roomId).emit('room:player-kicked', {
        physicalId: data.physicalId,
        totalPlayers: state.players.length,
      });

      // ── إرسال إشعار للاعب المطرود بشكل مباشر ──
      const allSockets = await io.in(data.roomId).fetchSockets();
      for (const s of allSockets) {
        if (s.data.role === 'player' && s.data.physicalId === data.physicalId) {
          s.emit('player:kicked-self');
          s.leave(data.roomId);
        }
      }

      callback({ success: true });
      console.log(`👑 Leader kicked player: #${data.physicalId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 🕵️ مراقبة: لاعب فتح قائمة «التعرف على المافيا» → تنبيه لحظي لليدر فقط ──
  // الهوية تُشتق من socket.data حصراً (لا نثق بالعميل)؛ fire-and-forget بلا DB في المسار.
  socket.on('player:mafia-gallery-open', async (data: { roomId?: string }) => {
    try {
      if (socket.data.role !== 'player') return;
      const roomId: string | undefined = socket.data.roomId;
      const physicalId: number | undefined = socket.data.physicalId;
      if (!roomId || !physicalId) return;
      if (data?.roomId && data.roomId !== roomId) return;

      // 🕵️ ختمُ رؤية السرّ: يستعمله فحص «الغياب بعد رؤية السرّ» في cheat:app-departure
      socket.data.lastSecretViewAt = Date.now();
      // 🔓 شاشة سرٍّ مفتوحة الآن — لو انقطع الاتصال بعدها مباشرةً فالغياب أخطر بكثير،
      //    ومسارُ الانقطاع (openAbsence) يقرأ هذا العلَم لرفع الوزن. يُطفأ بعد دقيقتين
      //    تلقائياً لأن العميل لا يبلّغ إغلاق المعرض.
      socket.data.secretScreenOpen = true;
      if (socket.data.secretScreenTimer) clearTimeout(socket.data.secretScreenTimer);
      socket.data.secretScreenTimer = setTimeout(() => { socket.data.secretScreenOpen = false; }, 120000);

      // Throttle: تجاهل التكرار خلال 5 ثوانٍ لكل لاعب (حماية من الإغراق)
      const now = Date.now();
      if (socket.data.lastGalleryPingAt && now - socket.data.lastGalleryPingAt < 5000) return;
      socket.data.lastGalleryPingAt = now;

      const state = await getGameState(roomId);
      if (!state || state.phase === 'GAME_OVER') return;
      const player = state.players.find((p: any) => p.physicalId === physicalId);
      if (!player?.role) return;                 // لم يُوزّع الدور بعد → تجاهل
      const wasDead = player.isAlive === false;  // لاعب مُقصى يحاول الفتح (ممنوع) — نُنبّه الليدر بالمحاولة

      const mafia = isMafiaRole(player.role as Role);
      const team = mafia ? 'MAFIA' : (player.role === 'JESTER' || player.role === 'ASSASSIN') ? 'NEUTRAL' : 'CITIZEN';
      const teamAr = mafia ? 'المافيا' : team === 'NEUTRAL' ? 'محايد' : 'المواطنون';

      // بثّ موجّه لسوكتات الليدر حصراً — الحمولة تحمل الدور فلا تُبثّ للغرفة (المسار الساخن أولاً)
      const allSockets = await io.in(roomId).fetchSockets();
      for (const s of allSockets) {
        if ((s as any).data?.role === 'leader') {
          s.emit('leader:mafia-gallery-alert', {
            roomId,
            physicalId,
            name: player.name,
            role: player.role,
            team,
            teamAr,
            wasDead,
            avatarUrl: (player as any).avatarUrl || null,
            at: now,
          });
        }
      }

      // 📋 تسجيل الحدث في سجل عمليات الموظفين (نوع مستقل MONITORING) — fire-and-forget بعد البثّ (لا يؤخّر التنبيه)
      try {
        const roleAr = ROLE_NAMES_AR[player.role as Role] || player.role;
        const { logStaffAction } = await import('../services/staff-action-log.service.js');
        logStaffAction({
          source: 'socket',
          action: 'player:mafia-gallery-open',
          category: 'MONITORING',
          labelAr: wasDead ? 'محاولة فتح قائمة التعرف (لاعب مُقصى)' : 'فتح قائمة التعرف على المافيا',
          outcome: wasDead ? 'blocked' : 'success',
          roomId,
          roomCode: (state as any).roomCode,
          matchId: (state as any).matchId,
          activityId: (state as any).activityId,
          targetPhysicalId: physicalId,
          targetName: `${player.name} — ${roleAr}`,
          details: { physicalId, role: player.role, roleAr, team, teamAr, wasDead },
        });
      } catch { /* غير حاجب */ }
    } catch { /* صامت — لا يؤثر على مجرى اللعبة */ }
  });

  // ══════════════════════════════════════════════════════
  // 🎭 أدوارُ هذه الطاولة — للدليل داخل اللعبة
  //
  // 🔴 عبر السوكِت لا REST: الغرفةُ والمقعدُ والطورُ كلُّها في socket.data
  //    أصلاً، فلا بوّابةَ مصادقةٍ جديدة تُفتح لمعلومةٍ حسّاسة.
  //
  // 🔴 وقبل بدء اللعبة لا تُسلَّم تركيبة: يعود `started:false` فتعرض الواجهةُ
  //    الكتالوج العامّ. تركيبةُ الطاولة معلومةٌ ثمينة ولا تُسبق بها اللعبة.
  //
  // 🔴 والتركيبة **لا تتغيّر بالموت**: دورُ من مات يبقى في القائمة، وإلّا صارت
  //    القائمةُ ساعةً تفضح من بقي حيّاً — وهي مبنيّةٌ لتُقرأ لا لتُحسَب.
  // ══════════════════════════════════════════════════════
  socket.on('game:roles-in-play', async (_data: any, callback?: Function) => {
    const reply = (v: any) => { if (typeof callback === 'function') callback(v); };
    try {
      const roomId: string | undefined = socket.data.roomId;
      if (!roomId) return reply({ success: true, started: false, roleIds: [] });

      const state = await getGameState(roomId);
      const phase = (state as any)?.phase;
      const notStarted = !state || phase === 'LOBBY' || phase === 'ROLE_GENERATION';
      if (notStarted) return reply({ success: true, started: false, roleIds: [] });

      const ids = new Set<string>();
      for (const p of (state.players || [])) if (p?.role) ids.add(String(p.role));
      reply({ success: true, started: true, roleIds: [...ids] });
    } catch {
      // الفشلُ يعرض الكتالوج العامّ ولا يُقفل الشاشة
      reply({ success: true, started: false, roleIds: [] });
    }
  });

  // ══════════════════════════════════════════════════════
  // 📋 «مهامّي» — فتحُ شاشة مهامّ الدور
  //
  // 🔴 الحارسُ هنا لا في العميل: إخفاءُ زرٍّ ليس أماناً. المُقصى يُردّ من الخادم
  //    ولا يصل إليه محتوى.
  //
  // 🔴 وكلُّ فتحةٍ تُنبّه الموجّه بالنمط نفسِه الذي لقائمة المافيا — الخنقُ
  //    والعلَمُ wasDead وختمُ الشاشة السرّيّة وسجلُّ العمليّات. شاشةُ سرٍّ ثانيةٌ
  //    تعني باباً ثانياً للتسريب، فتُحرَس بالحرس نفسه.
  // ══════════════════════════════════════════════════════
  socket.on('player:my-tasks-open', async (data: { roomId?: string }, callback?: Function) => {
    const reply = (v: any) => { if (typeof callback === 'function') callback(v); };
    try {
      if (socket.data.role !== 'player') return reply({ success: false, error: 'غير مسموح' });
      const roomId: string | undefined = socket.data.roomId;
      const physicalId: number | undefined = socket.data.physicalId;
      if (!roomId || !physicalId) return reply({ success: false, error: 'لست في غرفة' });
      if (data?.roomId && data.roomId !== roomId) return reply({ success: false, error: 'غرفةٌ غير مطابقة' });

      const state = await getGameState(roomId);
      if (!state || state.phase === 'GAME_OVER') return reply({ success: false, error: 'لا لعبةَ جارية' });
      const player = state.players.find((p: any) => p.physicalId === physicalId);
      if (!player?.role) return reply({ success: false, error: 'لم تُوزَّع الأدوار بعد' });

      const wasDead = player.isAlive === false;
      const now = Date.now();

      // ختمُ رؤية السرّ — يقرأه فحصُ «الغياب بعد رؤية السرّ». لا يُختم لمن مُنع.
      if (!wasDead) {
        socket.data.lastSecretViewAt = now;
        socket.data.secretScreenOpen = true;
        if (socket.data.secretScreenTimer) clearTimeout(socket.data.secretScreenTimer);
        socket.data.secretScreenTimer = setTimeout(() => { socket.data.secretScreenOpen = false; }, 120000);
      }

      // خنقٌ ٥ ثوانٍ لكلّ لاعب — يمنع إغراق الموجّه بضغطٍ متكرّر.
      // 🔴 يخنق **التنبيه** لا الردّ: اللاعبُ يرى شاشتَه، والموجّهُ لا يرى نافذتين.
      const throttled = socket.data.lastMyTasksPingAt && now - socket.data.lastMyTasksPingAt < 5000;
      if (!throttled) {
        socket.data.lastMyTasksPingAt = now;

        const mafia = isMafiaRole(player.role as Role);
        const team = mafia ? 'MAFIA' : (player.role === 'JESTER' || player.role === 'ASSASSIN') ? 'NEUTRAL' : 'CITIZEN';
        const teamAr = mafia ? 'المافيا' : team === 'NEUTRAL' ? 'محايد' : 'المواطنون';

        const allSockets = await io.in(roomId).fetchSockets();
        for (const s of allSockets) {
          if ((s as any).data?.role === 'leader') {
            s.emit('leader:my-tasks-alert', {
              roomId, physicalId, name: player.name, role: player.role,
              team, teamAr, wasDead, avatarUrl: (player as any).avatarUrl || null, at: now,
            });
          }
        }

        try {
          const roleAr = ROLE_NAMES_AR[player.role as Role] || player.role;
          const { logStaffAction } = await import('../services/staff-action-log.service.js');
          logStaffAction({
            source: 'socket',
            action: 'player:my-tasks-open',
            category: 'MONITORING',
            labelAr: wasDead ? 'محاولة فتح مهامّ الدور (لاعب مُقصى)' : 'فتح مهامّ الدور',
            outcome: wasDead ? 'blocked' : 'success',
            roomId,
            roomCode: (state as any).roomCode,
            matchId: (state as any).matchId,
            activityId: (state as any).activityId,
            targetPhysicalId: physicalId,
            targetName: `${player.name} — ${roleAr}`,
            details: { physicalId, role: player.role, roleAr, team, teamAr, wasDead },
          });
        } catch { /* غير حاجب */ }
      }

      if (wasDead) {
        return reply({ success: false, blocked: true, error: 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء' });
      }
      return reply({ success: true, role: player.role });
    } catch {
      reply({ success: false, error: 'تعذّر الفتح' });
    }
  });

  // ══ 🕵️ إشارات مكافحة الغش من جهاز اللاعب ══════════════════════
  // الهويّة من socket.data حصراً. تُخزَّن في cheat_signals، وتُبثّ للّيدر
  // فوراً (leader:cheat-signal)، وتُسجَّل MONITORING. لا تُدين وحدها.
  async function recordCheatSignal(
    kind: CheatKind,
    weight: number, details: Record<string, any>, labelAr: string,
  ) {
    const roomId: string | undefined = socket.data.roomId;
    const physicalId: number | undefined = socket.data.physicalId;
    if (!roomId || !physicalId) return;
    await recordCheatSignalFor(io, roomId, physicalId, kind, weight, details, labelAr);
  }

  // ── مغادرة التطبيق أثناء المباراة (نمط تهريب محتمل) ──
  // يرسله العميل عند عودته من الخلفيّة بمدّة الغياب، أو عند الخروج فوراً.
  // الوزن يرتفع كلّما اقترب الغياب من رؤية سرٍّ، وطال، وكانت شاشةٌ سريّة مفتوحة.
  socket.on('cheat:app-departure', async (data: { durationMs?: number; secretOpen?: boolean; platform?: string }) => {
    try {
      if (socket.data.role !== 'player') return;
      const now = Date.now();
      // Throttle: غيابٌ واحد كلّ ٣ ثوانٍ لكلّ لاعب
      if (socket.data.lastDepartureAt && now - socket.data.lastDepartureAt < 3000) return;
      socket.data.lastDepartureAt = now;

      // 🚫 منع الازدواج: إن كان الخادم قد أغلق غياب هذا اللاعب للتوّ (انقطاعٌ ثمّ عودة)
      //    فبلاغ الجهاز يصف الغياب نفسه — والخادم قياسه أدقّ (لا يعتمد ساعة الجهاز).
      if (socket.data.serverAbsenceClosedAt && now - socket.data.serverAbsenceClosedAt < 8000) return;

      const durationMs = Math.max(0, Math.min(600000, Number(data?.durationMs) || 0));
      const secretOpen = data?.secretOpen === true;
      const sinceSecret = socket.data.lastSecretViewAt ? now - socket.data.lastSecretViewAt : null;
      // ⏱️ القياس يجب أن يكون **لحظة المغادرة** لا لحظة العودة: sinceSecret يشمل
      //    الغياب كلّه، فغيابٌ طويلٌ بعد رؤية سرٍّ كان يسقط من النافذة — وهو أسوأ
      //    نمطٍ تُفترض النافذة لالتقاطه (شاهِد ثمّ اخرج وسرّب).
      const sinceSecretAtDeparture = sinceSecret != null ? Math.max(0, sinceSecret - durationMs) : null;
      const withinWindow = sinceSecretAtDeparture != null && sinceSecretAtDeparture < 120000;   // دقيقتان

      // 🧮 نموذج الوزن: أساسٌ ١، +٣ إن كانت شاشةٌ سريّة مفتوحة، +٢ إن غادر
      //    خلال دقيقتين من رؤية سرّ (نمط احفظ-ثمّ-سرّب)، + المدّة.
      let weight = 1;
      if (secretOpen) weight += 3;
      else if (withinWindow) weight += 2;
      if (durationMs > 30000) weight += 2; else if (durationMs > 10000) weight += 1;

      const secs = Math.round(durationMs / 1000);
      const labelAr = secretOpen
        ? `غادر التطبيق وشاشة السرّ مفتوحة${secs ? ` (${secs}ث)` : ''}`
        : withinWindow
          ? `غادر خلال ${Math.round((sinceSecretAtDeparture as number) / 1000)}ث من رؤية سرّ${secs ? ` (غاب ${secs}ث)` : ''}`
          : `غادر التطبيق أثناء المباراة${secs ? ` (${secs}ث)` : ''}`;

      await recordCheatSignal('app_departure', weight, {
        durationMs, secretOpen, platform: data?.platform || 'unknown', source: 'client',
        msSinceSecret: sinceSecret,                       // من العودة (للتوافق مع الصفوف القديمة)
        msSinceSecretAtDeparture: sinceSecretAtDeparture,  // القياس الصحيح للنافذة
      }, labelAr);
    } catch { /* صامت */ }
  });

  // ── لقطة شاشة كُشفت (iOS يكشف ولا يمنع) ──
  socket.on('cheat:screenshot', async (data: { platform?: string }) => {
    try {
      if (socket.data.role !== 'player') return;
      const now = Date.now();
      if (socket.data.lastScreenshotAt && now - socket.data.lastScreenshotAt < 2000) return;
      socket.data.lastScreenshotAt = now;
      await recordCheatSignal('screenshot', 5, { platform: data?.platform || 'ios' }, '📸 التقط لقطة شاشة أثناء المباراة');
    } catch { /* صامت */ }
  });

  // ── تسجيل شاشةٍ نشط ──
  socket.on('cheat:screen-recording', async (data: { active?: boolean; platform?: string }) => {
    try {
      if (socket.data.role !== 'player' || data?.active !== true) return;
      const now = Date.now();
      if (socket.data.lastRecordingAt && now - socket.data.lastRecordingAt < 10000) return;
      socket.data.lastRecordingAt = now;
      await recordCheatSignal('screen_recording', 5, { platform: data?.platform || 'unknown' }, '🎥 تسجيل شاشة نشط أثناء المباراة');
    } catch { /* صامت */ }
  });

  // ── 🔊 مرآة الأصوات: شاشة الليدر هي «القائد» الحصري — تبثّ كل صوت إلى شاشات العرض ──
  // مصدر كل الأصوات هو جهاز الليدر؛ شاشة العرض «تابع» تُشغّل ما يصلها بنفس الخريطة المخصّصة.
  socket.on('leader:sound-play', async (data: { fn: string; args?: any[]; vol?: number; to?: string }) => {
    try {
      if (socket.data.role !== 'leader') return;               // يُقبل من الليدر حصراً
      const roomId = socket.data.roomId;
      if (!roomId || !data?.fn || !SOUND_MIRROR_FNS.has(data.fn)) return;  // قائمة بيضاء للدوالّ
      const args = Array.isArray(data.args)
        ? data.args.filter((a) => a === null || typeof a === 'string' || typeof a === 'number').slice(0, 3)
        : [];
      const sockets = await io.in(roomId).fetchSockets();
      // 🏚️ مستوى الموجّه يمرّ مع الصوت: مقابضه تضبط القاعة وجهازه معاً.
      //    مقيّد بـ[0,1] هنا لا في العميل وحده — قيمةٌ شاذّة تصمّ القاعة أو تُسكتها.
      const vol = typeof data.vol === 'number' && Number.isFinite(data.vol)
        ? Math.max(0, Math.min(1, data.vol)) : undefined;
      // 🎯 بثٌّ موجَّه لشاشةٍ بعينها: تُستعمل لإلحاق شاشةٍ انضمّت وسطَ الطور بالفراش
      //    الجاري، بلا أن يُقطع فراشُ الشاشات الأخرى ويُستأنف من أوّله أمام الطاولة.
      const only = typeof data.to === 'string' && data.to ? data.to : null;
      for (const s of sockets) {
        if ((s as any).data?.role !== 'display') continue;
        if (only && s.id !== only) continue;
        s.emit('display:sound-play', { fn: data.fn, args, vol });
      }
    } catch { /* صامت — لا يؤثّر على مجرى اللعبة */ }
  });

  // ── صلاحية الليدر: تسجيل عقوبة على لاعب ──
  socket.on('leader:record-penalty', async (data: {
    roomId: string;
    targetPhysicalId: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can record penalties' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث عن اللاعب المعني في مصفوفة اللاعبين داخل الغرفة
      const player = state.players.find(p => p.physicalId === data.targetPhysicalId);
      if (!player) return callback({ success: false, error: 'Player not found' });

      const maxPenalties = state.config.maxPenalties ?? 3;

      // 🛑 حارس خادميّ ضد تجاوز الحد: لاعب بلغ الحد (أو أُقصي به) لا يُعاقَب مجدداً.
      // بدونه كانت العقوبة الرابعة تُعيد خصم الطرد (−٤٠ أخرى) — والواجهات وحدها كانت تمنعها.
      if (player.penaltyKicked || (player.penalties || 0) >= maxPenalties) {
        return callback({
          success: false,
          error: `«${player.name}» بلغ حدّ العقوبات (${maxPenalties}) وأُقصي بالفعل — لا مزيد من الخصم`,
        });
      }

      // زيادة عدد العقوبات بمقدار 1
      player.penalties = (player.penalties || 0) + 1;

      // جلب إعدادات التقدم من قاعدة البيانات لمعرفة قيمة الخصومات الفعالة
      const config = await getProgressionConfig();
      const penaltyDeduction = config?.rr?.penaltyDeduction ?? -10;
      const penaltyKickDeduction = config?.rr?.penaltyKickDeduction ?? -30;

      let totalDeduction = penaltyDeduction;
      const isKicked = player.penalties >= maxPenalties;

      if (isKicked) {
        totalDeduction += penaltyKickDeduction;
      }

      // هل طُبّق خصم رانك فعلاً؟ (يضبط نصوص الرسائل — لا خصم في مواقع الاختبار أو بلا موسم نشط)
      let rankApplied = false;
      // فشل حفظ السجلّ الدائم (مسار اللوبي) — يمنع الوعد بخصمٍ لم يُكتب
      let persistFailed = false;

      // إذا كان للاعب معرّف حقيقي في قاعدة البيانات
      if (player.playerId) {
        try {
          // 🛡️ عزل: لا أثر رانك لمواقع الاختبار، ولا مساس بالرانك العادي في البطولات/الأونلاين
          let isTestPenalty = false;
          if (state.activityId) {
            try {
              const db0 = getDB();
              if (db0) {
                const { activities, locations } = await import('../schemas/admin.schema.js');
                const [info] = await db0.select({ isTest: locations.isTestLocation })
                  .from(activities)
                  .leftJoin(locations, eq(activities.locationId, locations.id))
                  .where(eq(activities.id, state.activityId))
                  .limit(1);
                isTestPenalty = !!info?.isTest;
              }
            } catch { /* عند الشك نعاملها كغير اختبارية */ }
          }
          const { resolveSeasonForGame } = await import('../services/season.service.js');
          const { seasonId, isRegular } = await resolveSeasonForGame(state.activityId, (state.config as any)?.isRemote);

          if (!isTestPenalty && seasonId != null) {
            // ── الدفتر أولاً (match_players = مصدر الحقيقة) ──
            // الصفوف تُدرَج فقط عند احتساب المباراة؛ لذا:
            //   • بين المباريات (صف موجود): تحديث مباشر + مصالحة مستهدفة فورية من الدفتر.
            //   • أثناء المباراة (لا صف بعد): تخزين الحدث في الحالة ليُدمج في finalizeMatch —
            //     فينجو الخصم من المصالحات بدل أن تمحوه (الكتابة المباشرة كانت تصيب 0 صفوف وتضيع).
            let ledgerUpdated = false;
            if (state.matchId) {
              try {
                const db = getDB();
                if (db) {
                  const updatedRows = await db.update(matchPlayers)
                    .set({
                      penaltyCount: sql`COALESCE(${matchPlayers.penaltyCount}, 0) + 1`,
                      penaltyRRDeduction: sql`COALESCE(${matchPlayers.penaltyRRDeduction}, 0) + ${totalDeduction}`,
                      rrChange: sql`COALESCE(${matchPlayers.rrChange}, 0) + ${totalDeduction}`,
                    } as any) // نمط المستودع المعتمد مع Drizzle .set (خلل استنتاج أنواع معروف)
                    .where(
                      and(
                        eq(matchPlayers.matchId, state.matchId),
                        eq(matchPlayers.playerId, player.playerId)
                      )
                    )
                    .returning({ id: matchPlayers.id });
                  ledgerUpdated = updatedRows.length > 0;
                }
              } catch (dbErr: any) {
                console.warn(`⚠️ Failed to record penalty in match_players:`, dbErr.message);
              }
            }

            // هل توجد لعبة جارية فعلاً؟ (buffer الحالة يُدمج في finalizeMatch — لا معنى له خارج لعبة)
            const gameRunning = !!state.matchId && !state.winner
              && state.phase !== Phase.LOBBY && state.phase !== Phase.GAME_OVER;

            if (ledgerUpdated) {
              // مباراة محتسبة بالفعل → مصالحة مستهدفة فورية تلتقط الخصم من الدفتر
              // وتحدّث التجميعة الصحيحة حسب نوع الموسم (players.* أو player_season_stats)
              try {
                const { reconcileSeasonProgression } = await import('../services/reconcile.service.js');
                await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [player.playerId] });
              } catch (recErr: any) {
                console.warn(`⚠️ Targeted reconcile after penalty failed (will self-heal on next reconcile):`, recErr.message);
              }
              console.log(`📝 Penalty (${totalDeduction} RR) ledgered+reconciled for player ${player.playerId}, match ${state.matchId}`);
            } else if (gameRunning) {
              // أثناء المباراة → تخزين للدمج عند الاحتساب + أثر حيّ فوري للموسم العادي فقط
              if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
              if (!state.performanceTracking.penaltyEvents) state.performanceTracking.penaltyEvents = [];
              state.performanceTracking.penaltyEvents.push({
                physicalId: player.physicalId,
                playerId: player.playerId,
                rr: totalDeduction,
                round: state.round || 1,
                kicked: isKicked,
              });
              if (isRegular) {
                await applyRR(player.playerId, totalDeduction);
              }
              console.log(`📝 Penalty (${totalDeduction} RR) buffered for player ${player.playerId} (season ${seasonId}, regular: ${isRegular}) — folded into ledger at finalize`);
            } else {
              // لوبي بلا مباراة (أو صف غير موجود لمباراة منتهية) → سجل دائم في rank_bonuses
              // يدخل في كل إعادة احتساب فلا يُمحى، ثم مصالحة مستهدفة لتحديث التجميعة فوراً
              let bonusSaved = false;
              try {
                const db2 = getDB();
                if (db2) {
                  await db2.execute(sql`
                    INSERT INTO rank_bonuses (player_id, rr, reason, season_id)
                    VALUES (${player.playerId}, ${totalDeduction}, ${'عقوبة ليدر (خارج مباراة) — غرفة ' + data.roomId}, ${seasonId})
                  `);
                  bonusSaved = true;
                  const { reconcileSeasonProgression } = await import('../services/reconcile.service.js');
                  await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [player.playerId] });
                }
              } catch (bonusErr: any) {
                console.warn(`⚠️ Failed to record lobby penalty in rank_bonuses:`, bonusErr.message);
              }
              // ⚠️ لا نَعِد اللاعب بخصمٍ لم يُحفظ — الرسالة تتبع الحقيقة لا النيّة
              persistFailed = !bonusSaved;
              console.log(`📝 Penalty (${totalDeduction} RR) ${bonusSaved ? 'recorded as durable rank_bonus' : '⚠️ NOT recorded (insert failed)'} for player ${player.playerId} (no active match)`);
            }
            rankApplied = !persistFailed;
          } else {
            console.log(`📝 Penalty recorded WITHOUT rank effect for player ${player.playerId} (${isTestPenalty ? 'test location' : 'no active season'})`);
          }

          // إرسال إشعار فوري
          const rrSuffix = rankApplied ? `، مع خصم ${Math.abs(totalDeduction)} نقطة RR` : '';
          const bodyMsg = isKicked
            ? `حصلت على عقوبة (${player.penalties}/${maxPenalties}) وتم استبعادك من اللعبة${rrSuffix}!`
            : `حصلت على عقوبة (${player.penalties}/${maxPenalties})${rankApplied ? ` وتم خصم ${Math.abs(totalDeduction)} نقطة RR من رتبتك` : ''}.`;

          await sendPushToPlayer(
            player.playerId,
            '⚖️ عقوبة لاعب',
            bodyMsg,
            'penalty',
            { roomId: data.roomId }
          );
        } catch (e: any) {
          console.error(`❌ Failed to apply RR penalty for player ${player.playerId}:`, e.message);
        }

        // ── تسجيل جيران اللاعب المعاقب (للجلوس الذكي) ──
        try {
          const db = getDB();
          if (db && player.playerId) {
            const playerSeat = player.physicalId;
            const maxP = state.config.maxPlayers;
            const leftSeat = playerSeat === 1 ? maxP : playerSeat - 1;
            const rightSeat = playerSeat === maxP ? 1 : playerSeat + 1;
            const neighbors = state.players.filter(
              (p: any) => p.physicalId === leftSeat || p.physicalId === rightSeat
            );
            for (const neighbor of neighbors) {
              if (!neighbor.playerId) continue;
              const aId = Math.min(player.playerId, neighbor.playerId);
              const bId = Math.max(player.playerId, neighbor.playerId);
              const seatA = aId === player.playerId ? playerSeat : neighbor.physicalId;
              const seatB = bId === player.playerId ? playerSeat : neighbor.physicalId;
              await db.execute(sql`
                INSERT INTO penalty_neighbor_history (player_a_id, player_b_id, session_id, match_id, seat_a, seat_b, penalty_player_id)
                VALUES (${aId}, ${bId}, ${state.sessionId || null}, ${state.matchId || null}, ${seatA}, ${seatB}, ${player.playerId})
              `);
            }
            if (neighbors.length > 0) {
              console.log(`🪑 Recorded ${neighbors.length} penalty neighbors for player #${player.physicalId} (${player.name})`);
            }
          }
        } catch (neighborErr: any) {
          console.warn(`⚠️ Failed to record penalty neighbors:`, neighborErr.message);
        }
      }

      // إعلان العقوبة
      const arabicName = player.name;
      const rrNote = rankApplied ? `، وتم خصم ${Math.abs(totalDeduction)} نقطة RR` : '';
      const msg = isKicked
        ? `🛑 تم استبعاد اللاعب ${arabicName} لتجاوزه حد العقوبات المسموح به (${player.penalties}/${maxPenalties})${rrNote}.`
        : `⚠️ اللاعب ${arabicName} حصل على عقوبة (${player.penalties}/${maxPenalties})${rrNote}.`;

      io.to(data.roomId).emit('game:penalty-recorded', {
        physicalId: data.targetPhysicalId,
        penalties: player.penalties,
        maxPenalties,
        message: msg,
        isKicked,
      });

      // طرد اللاعب المطرود
      if (isKicked) {
        if (state.phase === Phase.LOBBY) {
          // 1. في اللوبي: حذف نهائي
          state.players = state.players.filter(p => p.physicalId !== data.targetPhysicalId);
          if (state.sessionId) {
            await removePlayerFromSession(state.sessionId, data.targetPhysicalId);
          }
          const room = activeRooms.get(data.roomId);
          if (room) {
            room.playerCount = state.players.length;
          }
          io.to(data.roomId).emit('room:player-kicked', {
            physicalId: data.targetPhysicalId,
            totalPlayers: state.players.length,
          });
        } else {
          // 2. أثناء اللعب: ميت ومستبعد (لكن يبقى في الغرفة)
          player.isAlive = false;
          player.penaltyKicked = true; // علامة إقصاء بالعقوبات — للتفريق عن الموت العادي
          
          // إزالة من طابور التحدث الفعال
          if (state.discussionState?.speakingQueue) {
            state.discussionState.speakingQueue = state.discussionState.speakingQueue.filter(id => id !== data.targetPhysicalId);
          }
        }

        // إبلاغ اللاعب المُقصى (يبقى في الغرفة — لا نطرده من السوكت)
        const allSockets = await io.in(data.roomId).fetchSockets();
        for (const s of allSockets) {
          if (s.data.role === 'player' && s.data.physicalId === data.targetPhysicalId) {
            if (state.phase === Phase.LOBBY) {
              // في اللوبي فقط: طرد فعلي من السوكت
              s.emit('player:kicked-self', {
                reason: `تم استبعادك لتجاوز حد العقوبات (${maxPenalties})${rrNote}.`,
              });
              s.leave(data.roomId);
            } else {
              // أثناء اللعب: إقصاء من اللعبة فقط (يبقى في الغرفة)
              s.emit('player:penalty-ejected', {
                reason: `تم إقصاؤك من هذه اللعبة لتجاوز حد العقوبات (${maxPenalties})${rrNote}.`,
                penalties: player.penalties,
                maxPenalties,
              });
            }
          }
        }
      }

      // حفظ في Redis
      await setGameState(data.roomId, state);

      // بث الحالة المحدثة للجميع
      await emitStateSanitized(io, data.roomId, 'game:state-updated', state);

      callback({ success: true, penalties: player.penalties, isKicked });
      console.log(`⚖️ Leader recorded penalty for player #${data.targetPhysicalId} in room ${data.roomId} (${player.penalties}/${maxPenalties})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تحديث عدد اللاعبين الأقصى ──────────────────
  socket.on('room:update-max-players', async (data: {
    roomId: string;
    maxPlayers: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (state.phase !== Phase.LOBBY && state.phase !== Phase.GAME_OVER) {
        return callback({ success: false, error: 'يمكن التعديل في اللوبي أو بعد انتهاء اللعبة فقط' });
      }

      const newMax = Math.min(Math.max(data.maxPlayers, 6), 50);
      const oldMax = state.config.maxPlayers;

      // 👑 الليدر عدّل السعة يدوياً → لا يَفرض قالب المقاعد سعته بعد الآن (يسمح بتجاوز عدد التمبلت)
      state.config.maxPlayersManual = true;

      if (newMax === oldMax) {
        await updateRoom(data.roomId, { config: state.config });
        return callback({ success: true });
      }

      state.config.maxPlayers = newMax;

      if (newMax > oldMax) {
        // فقط تحديث الإعدادات — لا يتم إنشاء لاعبين افتراضيين
        await updateRoom(data.roomId, { config: state.config });
      } else {
        // حذف اللاعبين الزائدين من النهاية
        for (let i = oldMax; i > newMax; i--) {
          const player = state.players.find((p: any) => p.physicalId === i);
          if (player) {
            state.players = state.players.filter((p: any) => p.physicalId !== i);
            io.to(data.roomId).emit('room:player-kicked', {
              physicalId: i,
              totalPlayers: state.players.length,
            });
          }
        }
      }

      await updateRoom(data.roomId, { players: state.players, config: state.config });

      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
        room.maxPlayers = newMax;
      }

      // بث تحديث الـ config
      io.to(data.roomId).emit('room:config-updated', {
        maxPlayers: newMax,
      });

      // 🗄️ write-through: اتساق سعة الغرفة في DB مع Redis
      if (state.sessionId) { await updateSessionMaxPlayers(state.sessionId, newMax); }

      callback({ success: true, maxPlayers: newMax });
      console.log(`👑 Leader updated maxPlayers: ${oldMax} → ${newMax}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 🔓 العودة لسعة القالب: مسح التجاوز اليدوي وإعادة المزامنة من القالب ──
  // (كان maxPlayersManual يقفل مزامنة القالب للأبد بلا أي طريقة للفك)
  socket.on('room:clear-max-manual', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.LOBBY && state.phase !== Phase.GAME_OVER) {
        return callback({ success: false, error: 'يمكن التعديل في اللوبي أو بعد انتهاء اللعبة فقط' });
      }

      state.config.maxPlayersManual = false;
      // إعادة المزامنة من القالب فوراً (تُحدّث maxPlayers إن وُجد قالب)
      try { await loadSeatTemplateIntoState(state); } catch {}
      await setGameState(data.roomId, state);

      const room = activeRooms.get(data.roomId);
      if (room) room.maxPlayers = state.config.maxPlayers;
      if (state.sessionId) { await updateSessionMaxPlayers(state.sessionId, state.config.maxPlayers); }

      io.to(data.roomId).emit('room:config-updated', { maxPlayers: state.config.maxPlayers });
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      callback({ success: true, maxPlayers: state.config.maxPlayers });
      console.log(`🔓 maxPlayersManual cleared — capacity re-synced to ${state.config.maxPlayers}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تحديث إعدادات العقوبات ──────────────────
  socket.on('room:update-penalty-settings', async (data: {
    roomId: string;
    maxPenalties?: number;
    penaltyScope?: 'game' | 'room';
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (state.phase !== Phase.LOBBY && state.phase !== Phase.GAME_OVER) {
        return callback({ success: false, error: 'يمكن التعديل في اللوبي أو بعد انتهاء اللعبة فقط' });
      }

      if (data.maxPenalties !== undefined) {
        state.config.maxPenalties = Math.min(Math.max(data.maxPenalties, 1), 10);
      }
      if (data.penaltyScope !== undefined) {
        state.config.penaltyScope = data.penaltyScope;
      }

      await updateRoom(data.roomId, { config: state.config });

      io.to(data.roomId).emit('room:config-updated', {
        maxPenalties: state.config.maxPenalties,
        penaltyScope: state.config.penaltyScope,
      });

      await emitStateSanitized(io, data.roomId, 'game:state-updated', state);

      callback({ success: true, maxPenalties: state.config.maxPenalties, penaltyScope: state.config.penaltyScope });
      console.log(`⚖️ Leader updated penalty settings: maxPenalties=${state.config.maxPenalties}, scope=${state.config.penaltyScope}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 💣 تحديث إعداد القنبلة ──────────────────────────
  socket.on('room:update-bomb-setting', async (data: {
    roomId: string;
    bombEnabled: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      state.config.bombEnabled = data.bombEnabled;
      await updateRoom(data.roomId, { config: state.config });

      await emitStateSanitized(io, data.roomId, 'game:state-updated', state);
      callback({ success: true, bombEnabled: state.config.bombEnabled });
      console.log(`💣 Leader ${data.bombEnabled ? 'enabled' : 'disabled'} bomb ability`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تحديث خيار تعارف المافيا ────────────────────────
  socket.on('room:update-mafia-reveal', async (data: {
    roomId: string;
    allowMafiaReveal: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      state.config.allowMafiaReveal = data.allowMafiaReveal;
      await updateRoom(data.roomId, { config: state.config });

      callback({ success: true });
      console.log(`👑 Leader toggled mafia reveal: ${data.allowMafiaReveal}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تحديث الحد الأقصى لتكرار المافيا ─────────────────
  socket.on('room:update-max-consecutive-mafia', async (data: {
    roomId: string;
    maxConsecutiveMafiaGames: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      state.config.maxConsecutiveMafiaGames = Math.max(0, data.maxConsecutiveMafiaGames);
      await updateRoom(data.roomId, { config: state.config });

      callback({ success: true });
      console.log(`👑 Leader updated max consecutive mafia games limit: ${data.maxConsecutiveMafiaGames}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ⚙️ تحديث موحّد لكل إعدادات اللعبة من لوبي المضيف (يقبل الحقول المُرسَلة فقط) ──
  socket.on('room:update-settings', async (data: {
    roomId: string;
    gameName?: string;
    autoNightTime?: number;
    gameTimerMinutes?: number;
    maxPenalties?: number;
    penaltyScope?: 'game' | 'room';
    bombEnabled?: boolean;
    maxJustifications?: number;
    mafiaChatEnabled?: boolean;
    allowPlayerInvites?: boolean;
  }, callback) => {
    const done = (r: any) => { if (typeof callback === 'function') callback(r); };
    try {
      if (socket.data.role !== 'leader') return done({ success: false, error: 'Only leader' });

      const state = await getRoom(data.roomId);
      if (!state) return done({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.LOBBY && state.phase !== Phase.GAME_OVER) {
        return done({ success: false, error: 'يمكن التعديل في اللوبي فقط' });
      }

      const c = state.config;
      if (typeof data.gameName === 'string' && data.gameName.trim()) c.gameName = data.gameName.trim().slice(0, 60);
      if (typeof data.autoNightTime === 'number') c.autoNightTime = Math.min(Math.max(Math.floor(data.autoNightTime), 5), 60);
      if (typeof data.gameTimerMinutes === 'number') {
        const m = Math.max(0, Math.floor(data.gameTimerMinutes));
        c.gameTimerEnabled = m > 0;
        c.gameTimerMinutes = m > 0 ? m : 30;
      }
      if (typeof data.maxPenalties === 'number') c.maxPenalties = Math.min(Math.max(Math.floor(data.maxPenalties), 1), 10);
      if (data.penaltyScope === 'game' || data.penaltyScope === 'room') c.penaltyScope = data.penaltyScope;
      if (typeof data.bombEnabled === 'boolean') c.bombEnabled = data.bombEnabled;
      if (typeof data.maxJustifications === 'number') c.maxJustifications = Math.min(Math.max(Math.floor(data.maxJustifications), 1), 5);
      if (typeof data.mafiaChatEnabled === 'boolean') c.mafiaChatEnabled = data.mafiaChatEnabled;
      if (typeof data.allowPlayerInvites === 'boolean') c.allowPlayerInvites = data.allowPlayerInvites;

      await updateRoom(data.roomId, { config: c });
      // بثّ الحالة الكاملة المُعقّمة → واجهة المضيف تحدّث فوراً عبر مستمع game:state-updated
      await emitStateSanitized(io, data.roomId, 'game:state-updated', state);
      io.to(data.roomId).emit('room:config-updated', { updated: true });

      console.log(`⚙️ Leader updated room settings for ${data.roomId}`);
      done({ success: true, config: c });
    } catch (err: any) {
      done({ success: false, error: err.message });
    }
  });

  // ── تفعيل/تعطيل المحرك الديناميكي ──────────────────
  socket.on('room:toggle-dynamic-engine', async (data: {
    roomId: string;
    useDynamicEngine: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      state.config.useDynamicEngine = data.useDynamicEngine;
      await updateRoom(data.roomId, { config: state.config });

      callback({ success: true });
      console.log(`🧩 Leader toggled dynamic engine: ${data.useDynamicEngine}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── بدء توليد الأدوار ──────────────────────────
  socket.on('room:start-generation', async (data: { roomId: string; releaseAbsent?: boolean }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can start generation' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ══ 👥 قياس الأدوار على الحاضرين فعلاً ══
      // كان يُقاس بـ players.length الخام، فيأخذ من غادر القاعة (مقعده محجوز ١٠ دقائق
      // أو مجمّد) دوراً ويبدأ اللعبة «حيّاً»: يدخل طابور النقاش وقوائم الأهداف
      // ومعادلة الفوز ويُسجّل له رانك — بينما شاشة العرض تُخفيه فيحتار الليدر.
      const absent = state.players.filter((p: any) => p.seatHeld || p.frozen);
      if (absent.length > 0 && !data.releaseAbsent) {
        return callback({
          success: false,
          code: 'ABSENT_PLAYERS',
          error: `${absent.length} مقعدً لمغادرين — حرّرها أو انتظر عودتهم`,
          absent: absent.map((p: any) => ({
            physicalId: p.physicalId,
            name: p.name,
            reason: p.frozen ? 'frozen' : 'seatHeld',
          })),
        });
      }
      if (absent.length > 0 && data.releaseAbsent) {
        const freed = absent.map((p: any) => p.physicalId);
        state.players = state.players.filter((p: any) => !p.seatHeld && !p.frozen);
        await setGameState(data.roomId, state);
        const rm = activeRooms.get(data.roomId);
        if (rm) rm.playerCount = state.players.length;
        io.to(data.roomId).emit('room:absent-released', { seats: freed });
        console.log(`🧹 Released ${freed.length} absent seat(s) before role generation: ${freed.join(', ')}`);
      }

      const playerCount = presentPlayers(state).length;
      if (playerCount < 6) {
        return callback({ success: false, error: 'يجب أن يكون هناك 6 لاعبين على الأقل' });
      }

      // 🌙 بدايةُ اللعبة عند اللاعب هي هذه اللحظة — دخولُ شاشة اختيار الأدوار —
      //    لا لحظةَ اعتماد التوزيع. تُختم مرّةً واحدة فلا تُزحزحها إعادةُ توليد.
      //    (مؤقّتُ اللعبة يبقى يبدأ بعد الاعتماد — سلوكٌ مقصود لا يُمسّ.)
      if (!state.setupStartedAt) {
        state.setupStartedAt = Date.now();
        await updateRoom(data.roomId, { setupStartedAt: state.setupStartedAt });
        if (state.activityId) void notifyScheduleDrift(Number(state.activityId), Number(state.sessionId));
      }

      // 🧩 Feature Flag: المحرك الديناميكي أو القديم
      if (state.config.useDynamicEngine) {
        try {
          const dynamicResult = await generateRolesDynamic(playerCount);
          await setPhase(data.roomId, Phase.ROLE_GENERATION);
          io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_GENERATION });

          socket.emit('setup:roles-generated', {
            mafiaRoles: dynamicResult.mafiaRoles,
            citizenRoles: dynamicResult.citizenRoles,
            neutralRoles: dynamicResult.neutralRoles,
            totalMafia: dynamicResult.totalMafia,
            totalCitizens: dynamicResult.totalCitizens,
            totalNeutral: dynamicResult.totalNeutral,
            isDynamic: true,
          });

          callback({ success: true });
          console.log(`🧩 Dynamic roles generated for ${playerCount} players`);
        } catch (dynErr: any) {
          console.warn(`⚠️ Dynamic engine failed, falling back:`, dynErr.message);
          // Fallback إلى المحرك القديم
          const generated = generateRoles(playerCount);
          await setPhase(data.roomId, Phase.ROLE_GENERATION);
          io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_GENERATION });
          socket.emit('setup:roles-generated', {
            mafiaRoles: generated.mafiaRoles,
            citizenRoles: generated.citizenRoles,
            totalMafia: generated.totalMafia,
            totalCitizens: generated.totalCitizens,
          });
          callback({ success: true });
        }
      } else {
        const generated = generateRoles(playerCount);
        await setPhase(data.roomId, Phase.ROLE_GENERATION);
        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_GENERATION });

        socket.emit('setup:roles-generated', {
          mafiaRoles: generated.mafiaRoles,
          citizenRoles: generated.citizenRoles,
          totalMafia: generated.totalMafia,
          totalCitizens: generated.totalCitizens,
        });

        callback({ success: true });
        console.log(`🎲 Roles generated for ${playerCount} players`);
      }
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── اعتماد الأدوار النهائية ──────────────────────
  socket.on('setup:roles-confirmed', async (data: {
    roomId: string;
    roles: Role[];
    assassinContractCount?: number;    // 🔪 عدد عقود السفّاح
    jesterSurviveRounds?: number;      // 🤡 جولات نجاة المهرج
    witchDisableRounds?: number;       // 🧙‍♀️ راوندات تعطيل الساحرة
    mayorVoteWeight?: number;          // 🎩 وزن صوت العمدة بعد الكشف
    phoenixRebirths?: number;          // 🔥 رصيد نهوض العنقاء
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can confirm roles' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const aliveCount = state.players.filter((p: any) => p.isAlive !== false).length;
      const validation = validateRoleDistribution(data.roles, aliveCount);
      if (!validation.valid) {
        return callback({ success: false, error: validation.error });
      }

      // 🔪 حفظ إعدادات الأدوار المحايدة في config
      if (data.assassinContractCount !== undefined) {
        state.config.assassinContractCount = Math.min(6, Math.max(2, data.assassinContractCount));
      }
      if (data.jesterSurviveRounds !== undefined) {
        state.config.jesterSurviveRounds = data.jesterSurviveRounds;
      }
      // 🧙‍♀️ حفظ إعدادات الساحرة
      if (data.witchDisableRounds !== undefined) {
        state.config.witchDisableRounds = Math.min(6, Math.max(1, data.witchDisableRounds));
      }
      // 🎩 وزن صوت العمدة بعد كشفه (نمط عقود السفّاح)
      if (data.mayorVoteWeight !== undefined) {
        state.config.mayorVoteWeight = Math.min(4, Math.max(1, data.mayorVoteWeight));
      }
      // 🔥 رصيد نهوض العنقاء — يُقرأ عند ربط الأدوار ثمّ يثبت طوال اللعبة
      if (data.phoenixRebirths !== undefined) {
        state.config.phoenixRebirths = Math.min(3, Math.max(1, data.phoenixRebirths));
      }

      await updateRoom(data.roomId, { phase: Phase.ROLE_BINDING, rolesPool: data.roles, config: state.config });
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.ROLE_BINDING });

      socket.emit('setup:binding-start', {
        players: state.players.map(p => ({ physicalId: p.physicalId, name: p.name })),
        roles: data.roles,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ربط دور بلاعب (Drag & Drop) ──────────────────
  socket.on('setup:bind-role', async (data: {
    roomId: string;
    physicalId: number;
    role: Role;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can bind roles' });
      }

      await bindRole(data.roomId, data.physicalId, data.role);
      callback({ success: true });
      console.log(`🔗 Role bound: #${data.physicalId} → ${data.role}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إلغاء ربط دور من لاعب (Unbind) ──────────────
  socket.on('setup:unbind-role', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can unbind roles' });
      }

      await unbindRole(data.roomId, data.physicalId);
      callback({ success: true });
      console.log(`🔓 Role unbound: #${data.physicalId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── توزيع عشوائي كامل للأدوار (Digital Distribution) ──
  // ── توزيع عشوائي انتقائي للأدوار (Mixed Manual/Random Distribution) ──
  socket.on('setup:random-assign', async (data: { roomId: string; lockedPhysicalIds?: number[] }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.ROLE_BINDING) {
        return callback({ success: false, error: 'ليس في مرحلة توزيع الأدوار' });
      }

      const pool = [...(state.rolesPool || [])];
      const alivePlayers = state.players.filter((p: any) => p.isAlive !== false);

      if (pool.length !== alivePlayers.length) {
        return callback({ success: false, error: `عدد الأدوار (${pool.length}) لا يطابق عدد اللاعبين (${alivePlayers.length})` });
      }

      const lockedIds = data.lockedPhysicalIds || [];

      // 1. تحديد اللاعبين المثبتين وأدوارهم
      const lockedPlayers = alivePlayers.filter(p => lockedIds.includes(p.physicalId) && p.role !== null);
      const lockedRoles = lockedPlayers.map(p => p.role!);

      // 2. تحديد اللاعبين غير المثبتين
      const remainingPlayers = alivePlayers.filter(p => !lockedPlayers.some(lp => lp.physicalId === p.physicalId));

      // 3. بناء قائمة الأدوار المتبقية بعد استبعاد الأدوار المثبتة
      const remainingRoles = [...pool];
      for (const role of lockedRoles) {
        const index = remainingRoles.indexOf(role);
        if (index !== -1) {
          remainingRoles.splice(index, 1);
        }
      }

      // 4. استرجاع تاريخ الأدوار للاعبين غير المثبتين وتحديد الممنوعين من المافيا
      const maxConsecutive = state.config.maxConsecutiveMafiaGames ?? 3;
      const restrictedPhysicalIds: number[] = [];

      if (maxConsecutive > 0) {
        const { getPlayerLastRoles } = await import('../services/player.service.js');
        for (const p of remainingPlayers) {
          if (p.playerId) {
            const lastRoles = await getPlayerLastRoles(p.playerId, maxConsecutive);
            if (lastRoles.length >= maxConsecutive && lastRoles.every(r => isMafiaRole(r as Role))) {
              restrictedPhysicalIds.push(p.physicalId);
            }
          }
        }
      }

      // 5. موازنة الاستبعاد لتجنب التعارض (Deadlocks)
      const remainingMafiaRoles = remainingRoles.filter(r => isMafiaRole(r));
      const maxRestrictedAllowed = remainingPlayers.length - remainingMafiaRoles.length;
      
      let finalRestrictedIds = [...restrictedPhysicalIds];
      if (finalRestrictedIds.length > maxRestrictedAllowed) {
        finalRestrictedIds = finalRestrictedIds.slice(0, maxRestrictedAllowed);
      }

      // 6. توزيع الأدوار غير المافيا للاعبين المستبعدين أولاً
      const restrictedPlayers = remainingPlayers.filter(p => finalRestrictedIds.includes(p.physicalId));
      const nonRestrictedPlayers = remainingPlayers.filter(p => !finalRestrictedIds.includes(p.physicalId));

      const assignableRemainingRoles = [...remainingRoles];

      // إلغاء ربط جميع اللاعبين غير المثبتين
      for (const p of remainingPlayers) {
        if (p.role) {
          await unbindRole(data.roomId, p.physicalId);
        }
      }

      // توزيع أدوار غير المافيا للاعبين المستبعدين
      for (const player of restrictedPlayers) {
        const nonMafiaRoleIndex = assignableRemainingRoles.findIndex(r => !isMafiaRole(r));
        if (nonMafiaRoleIndex !== -1) {
          const role = assignableRemainingRoles[nonMafiaRoleIndex];
          await bindRole(data.roomId, player.physicalId, role);
          assignableRemainingRoles.splice(nonMafiaRoleIndex, 1);
        }
      }

      // 7. خلط الأدوار المتبقية عشوائياً (Fisher-Yates)
      for (let i = assignableRemainingRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [assignableRemainingRoles[i], assignableRemainingRoles[j]] = [assignableRemainingRoles[j], assignableRemainingRoles[i]];
      }

      // 8. ربط الأدوار المخلوطة باللاعبين غير المستبعدين
      for (let i = 0; i < nonRestrictedPlayers.length; i++) {
        await bindRole(data.roomId, nonRestrictedPlayers[i].physicalId, assignableRemainingRoles[i]);
      }

      // 9. قراءة الحالة المحدثة
      const updatedState = await getRoom(data.roomId);

      // 10. إعادة تعيين حالة التأكيد لقيم جديدة
      if (updatedState) {
        updatedState.rolesConfirmed = false;
        await setGameState(data.roomId, updatedState);
      }

      callback({
        success: true,
        state: updatedState,
      });
      console.log(`🎲 Mixed role assignment complete in room ${data.roomId} — ${lockedPlayers.length} locked, ${restrictedPlayers.length} restricted, ${nonRestrictedPlayers.length} randomized`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تأكيد الأدوار وبثها للاعبين ──────────────────
  socket.on('setup:confirm-roles', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can confirm roles' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.ROLE_BINDING) {
        return callback({ success: false, error: 'ليس في مرحلة توزيع الأدوار' });
      }

      // التأكد أن كل الأدوار الخاصة موزعة
      const unassignedSpecial = state.players.filter(
        (p: any) => p.isAlive !== false && !p.role && 
        (state.rolesPool || []).some((r: string) => r !== 'CITIZEN')
      );
      // جمع قائمة لاعبي المافيا (أرقام المقاعد) لإرسالها لأعضاء الفريق
      const mafiaPlayers = state.players
        .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false)
        .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: p.role, avatarUrl: p.avatarUrl || null }));

      // بث الدور لكل لاعب متصل على جهازه فقط
      const allSockets = await io.in(data.roomId).fetchSockets();
      for (const s of allSockets) {
        if (s.data.role === 'player' && s.data.physicalId) {
          const player = state.players.find(
            (p: any) => p.physicalId === s.data.physicalId
          );
          if (player?.role) {
            const roleData: any = {
              physicalId: player.physicalId,
              role: player.role,
            };
            // إذا اللاعب من فريق المافيا → أرسل أرقام زملائه
            if (isMafiaRole(player.role as Role) && state.config.allowMafiaReveal !== false) {
              roleData.mafiaTeam = mafiaPlayers
                .filter((m: any) => m.physicalId !== player.physicalId)
                .map((m: any) => ({ physicalId: m.physicalId, name: m.name, role: m.role, avatarUrl: m.avatarUrl || null }));
            }
            // 👥 تعارف الأخوين — قناة خاصة منفصلة عن فريق المافيا
            // (الأخ الأصغر مواطن يبقى مخفياً عن باقي المافيا؛ كلٌّ يرى أخاه فقط)
            const sibling = getSiblingInfoFor(state, player.physicalId);
            if (sibling) roleData.sibling = sibling;
            s.emit('player:role-assigned', roleData);
          }
        }
      }

      // تحديث حالة التأكيد
      state.rolesConfirmed = true;
      await setGameState(data.roomId, state);

      // 🗣️ بداية لعبة جديدة → مسح محادثة المافيا للعبة السابقة
      try { const { deleteAux } = await import('../config/redis.js'); await deleteAux(`mafia-chat:${data.roomId}`); } catch {}

      callback({ success: true });
      console.log(`✅ Roles confirmed and sent to players in room ${data.roomId}`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── جلب دور اللاعب (Polling fallback) ──────────────
  socket.on('room:get-my-role', async (data: { roomId: string; physicalId: number }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ role: null, confirmed: false });

      const player = state.players.find((p: any) => p.physicalId === data.physicalId);
      const response: any = {
        role: player?.role || null,
        confirmed: state.rolesConfirmed || false,
      };
      // إذا اللاعب مافيا → أرسل أرقام زملائه
      if (player?.role && isMafiaRole(player.role as Role) && state.config.allowMafiaReveal !== false) {
        response.mafiaTeam = state.players
          .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false && p.physicalId !== player.physicalId)
          .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: p.role, avatarUrl: p.avatarUrl || null }));
      }
      // 👥 تعارف الأخوين (إعادة التسليم عند الاستعلام) — null لغير الأخوين (نفس بقية المسارات)
      if (player?.role && (state.rolesConfirmed || false)) {
        response.sibling = getSiblingInfoFor(state, data.physicalId);
      }
      callback(response);
    } catch {
      callback({ role: null, confirmed: false });
    }
  });

  // ── جلب حالة اللاعب الكاملة بناءً على playerId أو phone (مش physicalId!) ──
  // هذا هو الـ endpoint الموثوق — يبحث بمعرف ثابت ويرجع الرقم الحالي
  socket.on('room:get-my-state', async (data: {
    roomId: string;
    playerId?: number;
    phone?: string;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث بـ playerId أولاً (الأوثق) ثم بالهاتف
      let player = data.playerId
        ? state.players.find((p: any) => p.playerId === data.playerId)
        : null;
      
      if (!player && data.phone) {
        player = state.players.find((p: any) => p.phone === data.phone);
      }

      if (!player) {
        // 👁️ متفرّجٌ وصل متأخّراً: ليس في players ولكنّه ليس غريباً.
        // كان يُردّ بـ«Player not found» فيبتلعه العميلان صامتين ويبقى على شاشةٍ ميّتة.
        // الحمولة معقّمة: روستر بلا أدوار حيّة، ولا نيّات ليل، ولا تصويت.
        const spec = findSpectator(state, { playerId: data.playerId, phone: data.phone });
        if (spec) {
          return callback({
            success: true,
            spectator: true,
            reservedSeat: spec.physicalId,
            phase: state.phase,
            round: state.round,
            gameName: state.config.gameName,
            teamCounts: state.rolesConfirmed ? getTeamCounts(state.players as any) : null,
            maxPlayers: state.config.maxPlayers,
            discussionState: state.discussionState || null,
            rosterInfo: state.players.map((p: any) => ({
              physicalId: p.physicalId,
              name: p.name,
              isAlive: p.isAlive,
              avatarUrl: p.avatarUrl || null,
              gender: p.gender || 'MALE',
              rankTier: p.rankTier || null,
              // ⚰️ دور المُقصى أُعلن للجميع لحظة إقصائه — وحده يُمرّر
              role: p.isAlive === false ? (p.role || null) : null,
            })),
            waitingCount: getSpectators(state).length,
            waitingPosition: getSpectators(state)
              .slice().sort((a, b) => a.joinedAt - b.joinedAt)
              .findIndex(x => x.physicalId === spec.physicalId) + 1,
          });
        }
        return callback({ success: false, error: 'Player not found' });
      }

      const shouldShowRole = state.rolesConfirmed ||
        (state.phase !== 'LOBBY' && state.phase !== 'ROLE_BINDING' && state.phase !== 'ROLE_GENERATION');

      // بيانات التصويت إذا كنا في مرحلة التصويت
      const votingData = state.phase === 'DAY_VOTING' && state.votingState?.candidates?.length > 0 ? {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        playerVotes: state.votingState.playerVotes || {},
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        durationSeconds: state.votingState.durationSeconds,
        votingStartTime: state.votingState.votingStartTime,
        playersInfo: state.players.filter((p: any) => p.isAlive).map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          avatarUrl: p.avatarUrl || null,
        })),
      } : null;

      callback({
        success: true,
        player: {
          physicalId: player.physicalId,
          name: player.name,
          role: shouldShowRole ? (player.role || null) : null,
          isAlive: player.isAlive,
          gender: player.gender || 'MALE',
          playerId: player.playerId || null,
          penalties: player.penalties || 0,
        },
        phase: state.phase,
        // 🎭 أعداد الفرق — معلومةٌ عامّة (على شاشة القاعة أمام الجميع).
        //    تُرسَل هنا لا في حدث المرحلة وحده: من أعاد التحميل أو دخل متأخّراً
        //    كان يبقى بلا أرقام حتّى تتغيّر المرحلة — نفس درس شاشة الليل.
        teamCounts: state.rolesConfirmed ? getTeamCounts(state.players as any) : null,
        isRemote: !!state.config?.isRemote, // 🌐 ليعرف اللاعب أنه في غرفة بعيدة → يعرض طاولة الطور
        allowPlayerInvites: !!state.config?.allowPlayerInvites, // 📨 يسمح للاعب برؤية زرّ إرسال الدعوة
        rolesConfirmed: state.rolesConfirmed || false,
        votingState: votingData,
        maxPenalties: state.config?.maxPenalties || 3,
        // سعة الغرفة — بدونها يعرض العميل الافتراضي (١٠) لغرفةٍ تتسع ٣٢
        maxPlayers: state.config?.maxPlayers || 10,
        mafiaChatEnabled: state.config?.mafiaChatEnabled === true,   // 🗣️ علم إعداد عام — لا يكشف هوية
        // بيانات التبرير (لاستعادة الـ UI عند reconnect)
        justificationData: state.phase === 'DAY_JUSTIFICATION' ? state.justificationData || null : null,
        // حالة سحب الأصوات
        withdrawalState: state.phase === 'DAY_JUSTIFICATION' ? (state.withdrawalState || null) : null,
        // حالة النقاش
        discussionState: state.phase === 'DAY_DISCUSSION' ? { ...(state.discussionState || {}), deals: state.votingState?.deals || [], dealLockedPlayers: dealLockedList(state) } : null,
        // ── بيانات مرحلة الليل (لاستعادة شاشة الإجراء عند refresh) ──
        // 🔴 الميّت لا يرى الليل أبداً. كان هذا الحقل بلا فحص حياة، والعميلان
        //    (الويب والتطبيق) يشتقّان شاشة الليل منه بالاستطلاع المتكرّر — فكان
        //    جهاز المُقصى يواصل عرض قائمة الاختيار كلّ خطوة.
        //    والأخطر من القائمة ما كان يرافقها: `autoNightStepRole` يكشف أيّ
        //    دورٍ يتحرّك الآن، و`autoNightPerformerId` يكشف **رقم مقعد الفاعل الحقيقيّ**
        //    (التمويه بـsafeStep مشروط بالغرف البعيدة وحدها). ففي قاعةٍ يجلس فيها
        //    المُقصَون بين الأحياء، كان الميّت يقرأ الشريف والطبيب وشيخ المافيا ليلةً بليلة.
        nightState: player.isAlive && state.phase === 'NIGHT' && state.nightStep && state.autoNightStepDispatched ? (() => {
          const isReqPerformer = state.autoNightPerformerId === player.physicalId;
          // 🔴 التمويهُ في الخادم لكلّ الغرف، لا للبعيدة وحدها.
          //    كان غيرُ الفاعل يتلقّى محلّيّاً: أيَّ دورٍ يتحرّك الآن، و**رقمَ مقعد
          //    صاحبه**، وقائمةَ أهدافه الحقيقيّة — والتمويهُ يجري في العميل
          //    (`isPerformer ? type : 'DECOY'`). ومَن يفتح أدوات المتصفّح كان يقرأ
          //    الليلَ كلَّه خطوةً خطوة. الحجّةُ القديمة أنّ القاعة تسمع الموجّه —
          //    لكنّ الموجّه ينادي الدورَ ولا يذكر المقعد.
          const safeStep = isReqPerformer
            ? state.nightStep
            : { ...state.nightStep,
                performerPhysicalId: null,
                performerName: '',
                availableTargets: state.players.filter((p: any) => p.isAlive).map((p: any) => ({ physicalId: p.physicalId, name: p.name, avatarUrl: p.avatarUrl || null })) };
          return {
            nightStep: safeStep,
            autoNightStepRole: isReqPerformer ? state.autoNightStepRole : null,
            autoNightPerformerId: isReqPerformer ? player.physicalId : null,
            config: { autoNightTime: state.config?.autoNightTime || 15 },
            playerSubmitted: state.playerNightActions?.submitted?.[player.physicalId] || false,
            // 🔴 حقلان يسمحان للعميل باشتقاق الشاشة من الحالة بدل انتظار
            //    حدث `night:action-required` الذي يُبثّ مرّة واحدة: من لم
            //    يكن سوكِته في الغرفة لحظة البثّ (إعادة اتصال، شاشة مطفأة،
            //    تبويب في الخلفية) كان يبقى عالقاً على الشاشة السلبية حتى
            //    يحدّث الصفحة يدوياً. بهما يعرف العميل أنّ الخطوة ما زالت
            //    حيّة وكم بقي لها بالضبط.
            autoNightStepApproval: !!state.autoNightStepApproval,
            autoNightStepDeadline: (state as any).autoNightStepDeadline || null,
          };
        })() : null,
        // ── 🌙 الليلةُ الواحدة (استعادةُ شاشة الاختيار عند فقد البثّ) ──
        // الحارسُ في البانية: الميّت لا يُستعاد له شيء، والمراجعةُ المفتوحة
        // تُعيد قائمةً فارغةً بعلامة «أُرسل» فلا تُفتح شاشةٌ ميتة.
        oneNightState: state.phase === 'NIGHT'
          ? await oneNightResumeFor(state as any, player.physicalId)
          : null,
        // بيانات الإقصاء المعلّقة (لاستعادة شاشة الإقصاء عند reconnect)
        pendingResolution: state.phase === 'DAY_ELIMINATION' ? state.pendingResolution || null : null,
        // عقود السفّاح
        assassinContracts: (shouldShowRole && player.role === 'ASSASSIN' && state.assassinState) ? {
          contracts: state.assassinState.contracts,
          currentIndex: state.assassinState.currentContractIndex || 0,
          completedCount: state.assassinState.completedCount,
          totalRequired: state.assassinState.totalRequired,
        } : null,
        // 👥 تعارف الأخوين (إعادة التسليم عند جلب الحالة الكاملة)
        sibling: shouldShowRole ? getSiblingInfoFor(state, player.physicalId) : null,
        // نتيجة اللعبة
        winner: state.phase === 'GAME_OVER' ? state.winner || null : null,
        // معلومات قائمة اللاعبين للمفكرة وغيرها
        rosterInfo: state.players.map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          avatarUrl: p.avatarUrl || null,
          isAlive: p.isAlive,
          gender: p.gender || 'MALE',
          rankTier: p.rankTier || null,
        })),
        // كشف أدوار الجميع عند انتهاء اللعبة
        allPlayers: state.phase === 'GAME_OVER' ? state.players.map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          role: p.role,
          isAlive: p.isAlive,
        })) : null,
        // معلومات اللاعبين الأحياء (لأسماء المتهمين)
        playersInfo: state.players.filter((p: any) => p.isAlive).map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
        })),
        round: state.round || 1,
      });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إنهاء الربط وبدء اللعبة ──────────────────────
  socket.on('setup:binding-complete', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can complete binding' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ── شرط: يجب تأكيد الأدوار أولاً ──
      if (!state.rolesConfirmed) {
        return callback({ success: false, error: 'يجب تأكيد الأدوار أولاً قبل بدء اللعبة' });
      }


      const unboundPlayers = state.players.filter(p => !p.role && p.isAlive !== false);
      if (unboundPlayers.length > 0) {
        // Calculate remaining roles in the pool
        const pool = [...(state.rolesPool || [])];
        for (const p of state.players) {
           if (p.role) {
             const idx = pool.indexOf(p.role);
             if (idx !== -1) pool.splice(idx, 1);
           }
        }
        
        // Are ALL remaining roles 'CITIZEN'? (Only Citizens can be auto-assigned)
        const nonCitizenRoles = pool.filter(r => r !== Role.CITIZEN);
        if (nonCitizenRoles.length > 0) {
           return callback({
               success: false,
               error: `يجب توزيع الأدوار المميزة والمافيا كلياً. المتبقي: ${nonCitizenRoles.join(', ')}`,
           });
        }
        
        if (pool.length !== unboundPlayers.length) {
            return callback({ success: false, error: 'عدد الأدوار المتبقية لا يطابق عدد اللاعبين غير المربوطين.' });
        }
        
        // Auto-assign remaining CITIZEN roles
        for (let i = 0; i < unboundPlayers.length; i++) {
           await bindRole(data.roomId, unboundPlayers[i].physicalId, Role.CITIZEN);
        }
        
        // Refresh state object with the updated roles from memory
        Object.assign(state, await getRoom(data.roomId));
        console.log(`🤖 Auto-bound ${unboundPlayers.length} citizens in room ${data.roomId}`);
      }

      // ── 👥 تهيئة رابطة التوأمين فور اعتماد الأدوار (قبل أول نهار) ──
      // مهم: التهيئة هنا (لا عند بدء الليل) لتعمل الرابطة حتى لو أُقصي توأم في تصويت اليوم الأول.
      // 🔧 نُعيد الحساب دائماً (لا نعتمد على !state.twinState): إعادة استخدام نفس الغرفة للعبة جديدة
      // قد تترك twinState من لعبة سابقة (مقاعد/أعلام قديمة، suicideTriggered=true) فلا يتحوّل التوأم
      // ولا تظهر بطاقة التعارف. اعتماد الأدوار هنا يحدّد أخوي هذه اللعبة → نحسبها من جديد دائماً
      // (initTwinState يُرجع null إن لا يوجد أخوان، فتُصفَّر الحالة القديمة تلقائياً).
      state.twinState = initTwinState(state);
      if (state.twinState) {
        console.log(`👥 Twin Bond initialized at binding for room ${data.roomId}: Older #${state.twinState.olderBrotherPhysicalId} ↔ Younger #${state.twinState.youngerBrotherPhysicalId}`);
      }

      // ── 🎩 تهيئة حالة العمدة (نفس منطق التوأمين: تُعاد دائماً — null إن لا عمدة) ──
      state.mayorState = initMayorState(state);
      if (state.mayorState) {
        console.log(`🎩 Mayor initialized at binding for room ${data.roomId}: #${state.mayorState.mayorPhysicalId}`);
      }

      // ── 🔥 تهيئة العنقاء (كالتوأمين والعمدة: تُعاد دائماً — null إن لا عنقاء) ──
      // رصيدُ البعث يُقرأ هنا من إعدادات الطاولة، فيثبت طوال اللعبة ولا يتأثّر
      // بتغييرٍ لاحقٍ في الإعدادات.
      state.phoenixState = initPhoenixState(state);

      // ── حفظ وقت البداية + إنشاء سجل المباراة في PostgreSQL ──
      state.startedAt = new Date().toISOString();
      state.round = 1;
      const matchId = await createMatch(state);
      if (matchId) state.matchId = matchId;
      else console.warn(`⚠️ createMatch returned null — penalty-neighbor tracking unavailable for room ${state.roomId} (match_id will be NULL)`);

      // ── تشغيل مؤقت اللعبة (إن كان مفعّلاً) ──
      if (state.config.gameTimerEnabled && state.config.gameTimerMinutes > 0) {
        const totalSeconds = state.config.gameTimerMinutes * 60;
        state.gameTimer = {
          totalSeconds,
          startedAt: Date.now(),
          expired: false,
        };
        startGameTimer(io, data.roomId, totalSeconds);
      }

      // ── تغيير المرحلة قبل الحفظ والبث ──
      state.phase = Phase.DAY_DISCUSSION;
      await setGameState(data.roomId, state);
      await setPhase(data.roomId, Phase.DAY_DISCUSSION);

      await emitPhaseChangedSanitized(io, data.roomId, {
        phase: Phase.DAY_DISCUSSION,
        state,
        teamCounts: getTeamCounts(state.players),
      });

      // 🌙 بدءُ مباراةٍ وانتهاؤها لحظتان يُنتظران — تُرسلان فوراً بلا كبح.
      void notifyPulseForRoom(io, data.roomId, state, true);
      // 🔔 ومَن حجز ولم يدخل غرفةً لا يصله النبض — يُنبَّه بإشعارٍ إن انزاحت ليلتُه.
      if (state.activityId && state.sessionId) {
        void notifyScheduleDrift(Number(state.activityId), Number(state.sessionId));
      }
      io.to(data.roomId).emit('game:started', {
        round: 1,
        phase: Phase.DAY_DISCUSSION,
        playerCount: state.players.length,
        teamCounts: getTeamCounts(state.players),
        gameTimer: state.gameTimer,
      });

      callback({ success: true });
      console.log(`🎮 Game started in room ${data.roomId}!`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── شاشة العرض تنضم للغرفة (بعد التحقق من PIN عبر REST) ──
  socket.on('display:join-room', async (data: { roomId: string; displayToken?: string }, callback?: any) => {
    if (data.roomId) {
      // 🔒 الحارس الذي كان غائباً تماماً.
      //
      //    كان أي ساكت ينضم للغرفة، **ويمنح نفسه دور `display`**، فيُعيد له
      //    المعالج حالة اللعبة كاملةً بأدوار كل اللاعبين — وذلك الدور نفسه
      //    هو ما يقرؤه `isTrusted` ليرسل الحالة بلا تنقية في الغرف البعيدة.
      //    والقائمة العامة للأنشطة تسلّم معرّفات الغرف بلا رمز، فرمز الشاشة
      //    كان حارساً بلا أثر: أي لاعب بأدوات المطوّر يقرأ التوزيع كاملاً.
      //
      //    المقبول: توكن شاشة موقَّع لهذه الغرفة (يُمنح بعد التحقق من الرمز)
      //    أو توكن موظف موثّق. والفرض قابل للإطفاء بمتغيّر بيئة كي يكون
      //    التراجع إعادةَ تشغيل لا نشرةَ كود تحت الضغط.
      const okToken = verifyDisplayToken(data.displayToken, data.roomId);
      const okStaff = !!socket.data.authStaff;
      if (!okToken && !okStaff && displayAuthEnforced()) {
        console.warn(`🚫 display:join-room مرفوض (بلا توكن) — غرفة ${data.roomId}`);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'UNAUTHORIZED_DISPLAY', message: 'انتهت صلاحية الشاشة — أعد إدخال الرقم السري' });
        }
        return;
      }

      socket.join(data.roomId);
      socket.data.role = 'display';
      socket.data.roomId = data.roomId;
      console.log(`📺 Display joined room: ${data.roomId}`);

      // 🔊 أَلحِقِ الشاشةَ الجديدةَ بفراش الطور الجاري.
      //
      // 🔴 الفراشُ يُبَثّ **لحظةَ الانتقال** فقط — فشاشةٌ تُفتح أو تُحدَّث أو يعود
      //    اتصالُها وسطَ طورٍ تبقى صامتةً حتى الانتقال التالي. وهو بالضبط
      //    «مرّاتٍ يشتغل الصوتُ على شاشة العرض ومرّاتٍ لا»: يعتمد على أن تكون
      //    الشاشةُ متّصلةً في اللحظة التي انتقل فيها الطور، لا على شيءٍ آخر.
      //    الموجّهُ هو مالكُ الحقيقة، فنسأله أن يُعيد البثَّ لهذه الشاشة وحدَها.
      try {
        const peers = await io.in(data.roomId).fetchSockets();
        for (const s of peers) {
          if ((s as any).data?.role === 'leader') s.emit('leader:display-joined', { roomId: data.roomId, socketId: socket.id });
        }
      } catch { /* الإلحاقُ تحسينٌ — لا يُفشل الانضمام */ }

      // إرجاع الحالة الحالية للعرض الفوري
      if (typeof callback === 'function') {
        try {
          const state = await getRoom(data.roomId);
          callback({ success: true, state });
        } catch {
          callback({ success: true });
        }
      }
    }
  });

  // ── الليدر يستعيد الغرفة بعد إعادة الاتصال ──
  socket.on('room:rejoin-leader', (data: { roomId: string }) => {
    // 🔒 صلاحية الليدر مطلوبة (الدور يُضبط من io.use عبر توكن الموظف الموثّق)
    if (!socket.data.authStaff) return;
    if (data.roomId) {
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;
      console.log(`👑 Leader rejoined room: ${data.roomId}`);
    }
  });

  // ── 🌐 إنشاء غرفة لعبٍ عن بُعد بواسطة لاعب-مُضيف ──────────────────
  // منفصلٌ تماماً عن room:create الخاص بالموظّفين (لا يمسّه). المُضيف مُوجِّهٌ لا لاعب،
  // ويُمنح صلاحيات ليدر مسوّرة بغرفته فقط (isPlayerHost + hostRoomId؛ الحصر مضمونٌ بحارس socket.use).
  socket.on('room:create-remote', async (data: {
    gameName?: string;
    maxPlayers?: number;
    maxJustifications?: number;
    maxPenalties?: number;
    penaltyScope?: 'game' | 'room';
    displayPin?: string;
    autoNightTime?: number;      // ⏱️ مهلة إجراء اللاعب في الليل الأوتوماتيكي (ثوانٍ)
    gameTimerMinutes?: number;   // ⏳ مؤقّت اللعبة بالدقائق (0 = مطفأ)
    bombEnabled?: boolean;       // 💣 قنبلة الأب الروحيّ
    mafiaChatEnabled?: boolean;  // 🗣️ غرفة تشاور المافيا السرّية
    allowPlayerInvites?: boolean; // 📨 السماح للاعبين بدعوة أصدقائهم
  }, callback) => {
    try {
      // 1) هويّة المُضيف من التوكن الموثّق فقط (لا نثق بأي معرّف من العميل)
      const hostPlayerId = socket.data.authPlayer?.playerId;
      if (!hostPlayerId) {
        if (typeof callback === 'function') callback({ success: false, error: 'يجب تسجيل الدخول كلاعب' });
        return;
      }
      // 2) بوّابة الاستضافة — قائمة سماحٍ يديرها الأدمن (players.can_host_remote)
      const { getPlayerRemoteAccess, canHostRemote } = await import('../services/remote-access.service.js');
      const access = await getPlayerRemoteAccess(hostPlayerId);
      if (!canHostRemote(access)) {
        if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح لك بإنشاء غرف عن بُعد' });
        return;
      }
      // 3) إنشاء الغرفة: isRemote=true يفرض nightMode='auto'، والمُضيف = هذا اللاعب
      const gameName = data.gameName || 'غرفة عن بُعد';
      const maxPlayers = clampCapacity(data.maxPlayers || 10);
      const state = await createRoom(
        gameName,
        maxPlayers,
        data.maxJustifications || 2,
        data.displayPin,
        undefined,
        data.maxPenalties ?? 3,
        data.penaltyScope || 'room',
        true,          // 🌐 isRemote
        hostPlayerId,  // 🔗 hostPlayerId
      );

      // 3.1) تطبيق إعدادات الغرفة المختارة عند الإنشاء (تحلّ محلّ ضبطها في اللوبي)
      if (typeof data.autoNightTime === 'number') {
        state.config.autoNightTime = Math.max(5, Math.min(60, Math.floor(data.autoNightTime)));
      }
      if (typeof data.bombEnabled === 'boolean') {
        state.config.bombEnabled = data.bombEnabled;
      }
      const gtMin = typeof data.gameTimerMinutes === 'number' ? data.gameTimerMinutes : 0;
      state.config.gameTimerEnabled = gtMin > 0;
      state.config.gameTimerMinutes = gtMin > 0 ? gtMin : 30;
      if (typeof data.mafiaChatEnabled === 'boolean') {
        state.config.mafiaChatEnabled = data.mafiaChatEnabled;
      }
      if (typeof data.allowPlayerInvites === 'boolean') {
        state.config.allowPlayerInvites = data.allowPlayerInvites;
      }

      // 4) جلسة DB (بلا نشاط، بلا موظّف — المُضيف لاعب)
      const sessionId = await createSession(gameName, state.roomCode, state.config.displayPin, maxPlayers, undefined, null, true, hostPlayerId);
      if (sessionId) {
        state.sessionId = sessionId;
        state.sessionCode = state.roomCode;
      }
      await setGameState(state.roomId, state);

      // 5) منح المُضيف صلاحيات الليدر — مسوّرة بهذه الغرفة فقط (يفرضها حارس socket.use)
      socket.join(state.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = state.roomId;
      socket.data.isPlayerHost = true;
      socket.data.hostRoomId = state.roomId;

      // 6) تتبّع الغرفة النشطة
      activeRooms.set(state.roomId, {
        roomId: state.roomId, roomCode: state.roomCode, gameName,
        playerCount: 0, maxPlayers, displayPin: state.config.displayPin,
      });

      console.log(`🌐 Remote room ${state.roomId} created by player-host #${hostPlayerId}`);
      if (typeof callback === 'function') callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        displayPin: state.config.displayPin,
        gameName,
        sessionId: sessionId || undefined,
        maxPlayers,
        isRemote: true,
      });
    } catch (err: any) {
      console.error('❌ room:create-remote failed:', err?.message);
      if (typeof callback === 'function') callback({ success: false, error: 'تعذّر إنشاء الغرفة' });
    }
  });

  // ── 📨 دعوة لاعبٍ لغرفةٍ بعيدة عبر إشعار بوش (المضيف دائماً؛ الأعضاء الجالسون عند تفعيل allowPlayerInvites) ──
  socket.on('room:invite-player', async (data: { roomId: string; inviteePlayerId: number }, callback) => {
    const done = (r: any) => { if (typeof callback === 'function') callback(r); };
    try {
      // 1) هويّة المُرسِل من التوكن الموثّق فقط
      const senderId = socket.data.authPlayer?.playerId;
      if (!senderId) return done({ success: false, error: 'يجب تسجيل الدخول كلاعب' });
      const inviteeId = Number(data?.inviteePlayerId);
      if (!inviteeId || !Number.isFinite(inviteeId)) return done({ success: false, error: 'لاعب غير صالح' });

      // 2) الغرفة يجب أن تكون بعيدة وقائمة
      const state = await getGameState(data.roomId);
      if (!state || !state.config?.isRemote) return done({ success: false, error: 'الغرفة غير متاحة' });

      // 3) التفويض: المُضيف دائماً، أو عضوٌ جالس عند تفعيل allowPlayerInvites
      const isHost = state.config.hostPlayerId === senderId;
      const isSeated = Array.isArray(state.players) && state.players.some((p: any) => p.playerId === senderId);
      if (!isHost && !(state.config.allowPlayerInvites && isSeated)) {
        return done({ success: false, error: 'غير مصرّح لك بإرسال دعوات في هذه الغرفة' });
      }

      // 4) لا دعوةَ للنفس، ولا للمُضيف (لا يلعب)، ولا لمن هو جالسٌ أصلاً
      if (inviteeId === senderId) return done({ success: false, error: 'لا يمكنك دعوة نفسك' });
      if (state.config.hostPlayerId && inviteeId === state.config.hostPlayerId) return done({ success: false, error: 'لا يمكن دعوة المُضيف' });
      if (Array.isArray(state.players) && state.players.some((p: any) => p.playerId === inviteeId)) {
        return done({ success: false, error: 'اللاعب في الغرفة بالفعل' });
      }

      // 5) المدعوّ يجب أن يكون لاعباً حقيقيّاً (يمنع إغراق player_notifications بمعرّفات وهميّة)
      const db = getDB();
      if (!db) return done({ success: false, error: 'الخدمة غير متاحة' });
      const { players: playersTable } = await import('../schemas/player.schema.js');
      const [invitee] = await db.select({ id: playersTable.id }).from(playersTable).where(eq(playersTable.id, inviteeId)).limit(1);
      if (!invitee) return done({ success: false, error: 'اللاعب غير موجود' });

      // 6) كبح المعدّل (على مستوى العمليّة): ≤10 دعوات/دقيقة لكل مُرسِل + منع تكرار نفس الدعوة خلال دقيقة
      const now = Date.now();
      const win = (inviteRateWindow.get(senderId) || []).filter((t) => now - t < 60_000);
      if (win.length >= 10) return done({ success: false, error: 'أرسلت الكثير من الدعوات، انتظر قليلاً' });
      const dedupeKey = `${senderId}:${inviteeId}`;
      const lastSent = inviteDedupe.get(dedupeKey);
      if (lastSent && now - lastSent < 60_000) return done({ success: false, error: 'أرسلت دعوة لهذا اللاعب للتوّ' });
      win.push(now); inviteRateWindow.set(senderId, win);
      inviteDedupe.set(dedupeKey, now);
      if (inviteDedupe.size > 5000) { for (const [k, t] of inviteDedupe) if (now - t > 60_000) inviteDedupe.delete(k); } // تنظيف دوريّ

      // 7) الإرسال عبر خطّ البوش الموجود (يحفظ الإشعار في player_notifications أيضاً كنسخة داخل التطبيق)
      const inviterName = socket.data.authPlayer?.name || 'لاعب';
      const roomName = state.config.gameName || 'غرفة عن بُعد';
      const roomCode = state.roomCode;
      await sendPushToPlayer(
        inviteeId,
        '📨 دعوة للانضمام',
        `${inviterName} يدعوك للانضمام إلى ${roomName}`,
        'room_invite',
        {
          roomCode: String(roomCode),
          roomName: String(roomName),
          inviterName: String(inviterName),
          url: `/player/join?code=${roomCode}&invite=1&by=${encodeURIComponent(inviterName)}`,
        },
      );

      console.log(`📨 Invite: #${senderId} (${inviterName}) → #${inviteeId} · room ${roomCode}`);
      done({ success: true });
    } catch (err: any) {
      console.error('❌ room:invite-player failed:', err?.message);
      done({ success: false, error: 'تعذّر إرسال الدعوة' });
    }
  });

  // ── 🌐 إعادة انضمام المُضيف لغرفته البعيدة بعد انقطاع — يُعيد منح صلاحية الليدر المسوّرة ──
  socket.on('room:rejoin-host', async (data: { roomId: string }, callback) => {
    try {
      const hostPlayerId = socket.data.authPlayer?.playerId;
      if (!hostPlayerId || !data.roomId) { if (typeof callback === 'function') callback({ success: false }); return; }
      const state = await getGameState(data.roomId);
      // يجب أن تكون غرفةً بعيدة وأن يكون هذا اللاعب مُضيفها فعلاً (تحقّق من الحالة الموثّقة)
      if (!state || !state.config?.isRemote || state.config?.hostPlayerId !== hostPlayerId) {
        if (typeof callback === 'function') callback({ success: false, error: 'لست مُضيف هذه الغرفة' });
        return;
      }
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;
      socket.data.isPlayerHost = true;
      socket.data.hostRoomId = data.roomId;
      console.log(`🌐 Player-host #${hostPlayerId} rejoined remote room ${data.roomId}`);
      if (typeof callback === 'function') callback({ success: true });
    } catch { if (typeof callback === 'function') callback({ success: false }); }
  });

  // ── 🔎 غرفتي المستضافة النشطة — يستعيد المُضيف غرفته من أيّ جهاز (لا اعتماد على تخزين المتصفّح) ──
  socket.on('room:my-hosted-room', async (_data: any, callback) => {
    try {
      const pid = socket.data.authPlayer?.playerId;
      if (!pid) { if (typeof callback === 'function') callback({ success: false }); return; }
      for (const [roomId] of activeRooms) {
        const st = await getGameState(roomId);
        if (st?.config?.isRemote && (st.config as any)?.hostPlayerId === pid && st.phase !== 'GAME_OVER') {
          if (typeof callback === 'function') callback({ success: true, roomId, roomCode: st.roomCode });
          return;
        }
      }
      if (typeof callback === 'function') callback({ success: false });
    } catch { if (typeof callback === 'function') callback({ success: false }); }
  });
  // ── خروج اللاعب من الغرفة (EXIT button) ─────────────
  socket.on('room:player-exit', async (data: {
    roomId: string;
    phone?: string;
    playerId?: number;
  }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // البحث عن اللاعب
      const normalizedPhone = data.phone?.startsWith('0') ? data.phone : (data.phone ? '0' + data.phone : '');
      const playerIndex = state.players.findIndex((p: any) =>
        (data.playerId && p.playerId === data.playerId) ||
        (normalizedPhone && p.phone === normalizedPhone)
      );

      if (playerIndex === -1) return callback({ success: false, error: 'Player not found' });

      const player = state.players[playerIndex];
      const playerName = player.name;
      const playerPhysId = player.physicalId;

      // ═══ Seat Hold: حجز المقعد لمدة 10 دقائق بدل الحذف الفوري ═══
      const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 دقائق

      // إذا اللعبة في مرحلة LOBBY فقط → نحجز المقعد
      // في مراحل أخرى (أثناء اللعبة) → نحذف فوراً
      if (state.phase === 'LOBBY') {
        player.seatHeld = true;
        player.heldUntil = Date.now() + HOLD_DURATION_MS;
        player.isConnected = false;
        await setGameState(data.roomId, state);

        // تايمر لتحرير المقعد بعد 10 دقائق
        setTimeout(async () => {
          try {
            const freshState = await getRoom(data.roomId);
            if (!freshState) return;
            const heldPlayer = freshState.players.find((p: any) =>
              p.physicalId === playerPhysId && p.seatHeld === true
            );
            if (heldPlayer) {
              // فحص: هل اللعبة لا زالت في اللوبي؟
              const gameActive = freshState.phase !== 'LOBBY' && freshState.phase !== 'ROLE_GENERATION';
              const idx = freshState.players.findIndex((p: any) => p.physicalId === playerPhysId);
              if (idx !== -1) {
                if (gameActive) {
                  // اللعبة بدأت → تجميد بدل حذف (حفظ الدور)
                  freshState.players[idx].seatHeld = false;
                  freshState.players[idx].frozen = true;
                  freshState.players[idx].isConnected = false;
                  console.log(`⏰ Seat hold expired during game: #${playerPhysId} (${playerName}) frozen (role preserved: ${freshState.players[idx].role})`);
                } else {
                  // لا زال في اللوبي → حذف فعلي
                  freshState.players.splice(idx, 1);
                  console.log(`⏰ Seat hold expired: #${playerPhysId} (${playerName}) removed from room ${data.roomId}`);
                }
                await setGameState(data.roomId, freshState);
                await emitStateSanitized(io, data.roomId, 'game:state-sync', freshState);
                const room = activeRooms.get(data.roomId);
                if (room) room.playerCount = freshState.players.filter((p: any) => !p.seatHeld).length;
              }
            }
          } catch (e: any) {
            console.warn(`⚠️ Seat hold cleanup error:`, e.message);
          }
        }, HOLD_DURATION_MS);

        console.log(`🔒 Seat #${playerPhysId} held for ${playerName} (10 min) in room ${data.roomId}`);
      } else {
        // أثناء اللعبة → تجميد اللاعب (بدلاً من الحذف الفوري)
        // اللاعب يبقى في المصفوفة حتى يتمكن من العودة بنفس الدور
        const exitingPlayer = state.players[playerIndex];
        exitingPlayer.frozen = true;
        exitingPlayer.isConnected = false;
        await setGameState(data.roomId, state);
        console.log(`🚪 Player #${playerPhysId} (${playerName}) froze & exited room ${data.roomId} (in-game, role preserved: ${exitingPlayer.role})`);
      }

      // إبلاغ الليدر والشاشات
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      socket.leave(data.roomId);

      // تحديث العداد (اللاعبين الفعليين بدون المحجوزين)
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.filter((p: any) => !p.seatHeld).length;
      }

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });
  // ── فك حجز مقعد (بواسطة الليدر) ─────────────────────
  socket.on('room:release-held-seat', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader can release held seats' });
      }

      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const playerIndex = state.players.findIndex((p: any) =>
        p.physicalId === data.physicalId && p.seatHeld === true
      );

      if (playerIndex === -1) {
        return callback({ success: false, error: 'لا يوجد حجز على هذا المقعد' });
      }

      const player = state.players[playerIndex];
      const playerName = player.name;

      // حذف اللاعب فعلياً وتحرير المقعد
      state.players.splice(playerIndex, 1);
      await setGameState(data.roomId, state);

      // تحديث العداد
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.filter((p: any) => !p.seatHeld).length;
      }

      // إبلاغ الجميع
      await emitStateSanitized(io, data.roomId, 'game:state-sync', state);

      console.log(`🔓 Leader released held seat #${data.physicalId} (${playerName}) in room ${data.roomId}`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إغلاق الغرفة (Soft Close — للوبي فقط) ────────────────
  socket.on('room:close', async (data: { roomId: string }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; } socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);

      // 🧮 احتساب نتيجة اللعبة المنتهية (إن لم تُحتسب) قبل إغلاق الغرفة
      if (state) await finalizeIfDecided(state);

      await setPhase(data.roomId, Phase.GAME_OVER);
      activeRooms.delete(data.roomId);

      // حفظ حالة الإغلاق في PostgreSQL
      if (state?.sessionId) {
        await closeSession(state.sessionId);
      }
      
      io.to(data.roomId).emit('game:closed');

      callback({ success: true });
      console.log(`🔒 Room closed manually: ${data.roomId} (session #${state?.sessionId || 'none'})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── حذف الغرفة نهائياً ─────────────────────────
  socket.on('room:delete-room', async (data: { roomId: string }, callback) => {
    try {
      // Auto-join as leader for this operation
      socket.join(data.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; } socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const sessionId = state.sessionId;
      const activityId = state.activityId;

      // 🧮 احتساب نتيجة اللعبة المنتهية (إن لم تُحتسب) قبل حذف الغرفة نهائياً
      await finalizeIfDecided(state);

      // 1. حذف من Redis
      await deleteGameState(data.roomId);
      // حذف code mapping
      if (state.roomCode) {
        await deleteGameState(`code:${state.roomCode}`);
      }

      // 2. حذف من activeRooms
      activeRooms.delete(data.roomId);

      // 3. معالجة PostgreSQL
      if (sessionId) {
        if (activityId) {
          // غرفة مرتبطة بنشاط → soft delete + فك ربط
          await closeSession(sessionId);
          await unlinkSessionFromActivity(sessionId);
          console.log(`🔒 Room ${data.roomId} soft-deleted (linked to activity #${activityId})`);
        } else {
          // غرفة مستقلة → حذف حقيقي
          await deleteSession(sessionId);
          console.log(`🗑️ Room ${data.roomId} permanently deleted (session #${sessionId})`);
        }
      }

      // 4. إعلام الجميع
      io.to(data.roomId).emit('game:room-deleted');

      callback({ success: true });
      console.log(`🗑️ Room ${data.roomId} deleted by leader`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── دالة مشتركة: إعادة تعيين حالة الغرفة للوبي ──
  /**
   * 👁️ ما بعد ترقية المتفرّجين: صفّ الجلسة، إعلام الليدر والشاشة،
   * نقل سوكِت المتفرّج من الغرفة المعقّمة إلى الغرفة الأصليّة، ودفعة «مقعدك N».
   */
  async function finishPromotions(state: any): Promise<void> {
    const promoted: Array<{ physicalId: number; name: string; playerId: number | null; phone: string | null }> =
      (state as any).__promotedSpectators || [];
    delete (state as any).__promotedSpectators;
    if (promoted.length === 0) return;

    for (const pr of promoted) {
      if (state.sessionId) {
        try {
          await addPlayerToSession(state.sessionId, pr.physicalId, pr.name, pr.phone || undefined,
            undefined, undefined, pr.playerId || null);
        } catch (e: any) { console.warn('⚠️ promote session row failed:', e.message); }
      }
      io.to(state.roomId).emit('room:player-joined', {
        physicalId: pr.physicalId,
        name: pr.name,
        playerId: pr.playerId,
        promotedFromSpectator: true,
        totalPlayers: state.players.length,
        maxPlayers: state.config.maxPlayers,
      });
      if (pr.playerId) {
        try {
          await sendPushToPlayer(pr.playerId, '🎮 بدأت اللعبة',
            `مقعدك رقم ${pr.physicalId} — تفضّل إلى الطاولة`, 'promoted', { roomId: state.roomId, seat: pr.physicalId });
        } catch {}
      }
    }

    // نقل سوكِتات المتفرّجين المُرقّين إلى الغرفة الأصليّة
    try {
      const specSockets = await io.in(spectatorRoom(state.roomId)).fetchSockets();
      for (const sk of specSockets) {
        const match = promoted.find(pr =>
          (pr.playerId && sk.data.authPlayer?.playerId === pr.playerId) ||
          sk.data.physicalId === pr.physicalId);
        if (!match) continue;
        sk.leave(spectatorRoom(state.roomId));
        sk.join(state.roomId);
        sk.data.role = 'player';
        sk.data.physicalId = match.physicalId;
        sk.emit('spectator:promoted', { physicalId: match.physicalId, roomId: state.roomId });
      }
    } catch (e: any) { console.warn('⚠️ spectator socket promotion failed:', e.message); }

    console.log(`👁️ Promoted ${promoted.length} spectator(s) to players in ${state.roomId}`);
  }

  function resetRoomState(state: any, excludeIds: number[] = [], resetPenalties?: boolean): any {
    // تحديد سلوك العقوبات: إذا لم يُحدد صراحة → يعتمد على penaltyScope
    const shouldResetPenalties = resetPenalties !== undefined 
      ? resetPenalties 
      : (state.config?.penaltyScope === 'game'); // game = تصفير تلقائي / room = إبقاء

    // فلترة المستبعدين يدوياً
    let activePlayers = excludeIds.length > 0
      ? state.players.filter((p: any) => !excludeIds.includes(p.physicalId))
      : [...state.players];

    // إذا لم نصفّر العقوبات → المقصيين بالعقوبات يُستبعدون أيضاً
    if (!shouldResetPenalties) {
      activePlayers = activePlayers.filter((p: any) => !p.penaltyKicked);
    }

    state.players = activePlayers.map((p: any) => ({
      ...p,
      isAlive: true,
      isSilenced: false,
      role: null,
      justificationCount: 0,
      disabledUntilRound: undefined,  // 🧙‍♀️ منع تسرّب تعطيل الساحرة بين المباريات
      disabledRoleName: undefined,
      penalties: shouldResetPenalties ? 0 : (p.penalties || 0),
      penaltyKicked: shouldResetPenalties ? false : (p.penaltyKicked || false),
      // ❄️ أعلام الغياب لا تُورَّث: من جُمّد في لعبةٍ سابقة كان يبقى مجمّداً
      //    في اللوبي الجديد: الشاشة تُخفيه وقياسُ الأدوار يعدّه — شبحٌ بلا سبب ظاهر.
      frozen: false,
      seatHeld: false,
      heldUntil: undefined,
    }));

    // ══ 👁️ ترقية المتفرّجين إلى لاعبين — نقطة الاختناق الوحيدة ══
    // هذه الدالّة يستدعيها room:new-game وroom:reset-to-lobby معاً، وهي تسبق أيّ
    // توليدٍ للأدوار — فالمترقّي يدخل اللوبي لاعباً كاملاً قبل قياس المجمّع.
    const promoted: Array<{ physicalId: number; name: string; playerId: number | null; phone: string | null }> = [];
    const specs: any[] = Array.isArray(state.spectators) ? state.spectators : [];
    if (specs.length > 0) {
      const taken = new Set<number>(state.players.map((pp: any) => pp.physicalId));
      const cap = state.config?.maxPlayers || 27;
      const leftover: any[] = [];
      for (const sp of specs.slice().sort((a: any, b: any) => (a.joinedAt || 0) - (b.joinedAt || 0))) {
        // مقعده المحجوز إن بقي حرّاً، وإلّا أوّل مقعدٍ فارغ
        let seat = sp.physicalId;
        if (!seat || seat > cap || taken.has(seat)) {
          seat = 0;
          for (let i = 1; i <= cap; i++) if (!taken.has(i)) { seat = i; break; }
        }
        if (!seat) { leftover.push(sp); continue; }   // الغرفة ممتلئة — يبقى منتظراً
        taken.add(seat);
        state.players.push({
          physicalId: seat,
          name: sp.name,
          phone: sp.phone ?? null,
          dob: sp.dob ?? null,
          gender: sp.gender ?? null,
          playerId: sp.playerId ?? null,
          role: null,
          isAlive: true,
          isSilenced: false,
          justificationCount: 0,
          addedBy: sp.addedBy || 'self',
          avatarUrl: sp.avatarUrl ?? null,
          rankTier: sp.rankTier ?? null,
          cosmetics: sp.cosmetics ?? null,
          isConnected: true,
          penalties: 0,
        });
        promoted.push({ physicalId: seat, name: sp.name, playerId: sp.playerId ?? null, phone: sp.phone ?? null });
      }
      state.spectators = leftover;
      state.players.sort((a: any, b: any) => a.physicalId - b.physicalId);
    }
    (state as any).__promotedSpectators = promoted;   // يقرأه المُستدعي ثمّ يُزيله

    state.phase = Phase.LOBBY;
    state.round = 0;
    state.winner = null;
    state.pendingWinner = null;
    state.rolesPool = [];
    state.morningEvents = [];
    state.discussionState = null;
    state.rolesConfirmed = false;
    state.matchId = undefined;
    state.startedAt = undefined;
    state.setupStartedAt = undefined;   // 🌙 وإلّا ورثت اللعبةُ التالية بدايةَ سابقتها
    state.votingState = {
      totalVotesCast: 0,
      deals: [],
      candidates: [],
      hiddenPlayersFromVoting: [],
      tieBreakerLevel: 0,
      playerVotes: {},
    };
    state.nightActions = {
      godfatherTarget: null,
      silencerTarget: null,
      sheriffTarget: null,
      sheriffResult: null,
      doctorTarget: null,
      sniperTarget: null,
      nurseTarget: null,
      witchTarget: null,        // 🧙‍♀️ هدف الساحرة
      assassinTarget: null,     // 🔪 هدف السفّاح
      lastProtectedTarget: null,
    };
    // 🧙‍♀️ تصفير أهداف الساحرة السابقة (منع التسرّب بين المباريات)
    state.witchPreviousTargets = [];

    // ── تصفير حالة الليل الأوتو (إصلاح مشكلة القنص عند بدء لعبة ثانية) ──
    state.nightStep = null;
    state.autoNightStepRole = null;
    state.autoNightPerformerId = null;
    state.autoNightStepDispatched = false;
    state.playerNightActions = { submitted: {} };
    state.nurseActivated = false;
    state.policewomanState = null;
    state.pendingResolution = null;
    state.justificationData = null;
    state.withdrawalState = null;
    state.performanceTracking = null;
    delete state.assassinState;
    delete state.dynamicNightState;
    // 👥 تصفير رابطة التوأمين — مهم عند إعادة استخدام نفس الغرفة للعبة جديدة، وإلا بقيت حالة
    // اللعبة السابقة (مقاعد/أعلام قديمة) فلا يُعاد التهيئة ولا يتحوّل التوأم ولا تظهر بطاقة التعارف.
    state.twinState = null;
    state.luckyDraw = null;   // 🎁 تصفير سحب الهدايا عند لعبة جديدة
    state.dealRegisteredRound = {};  // 🤝 تصفير قفل الاتفاقيات عند لعبة جديدة

    // ── تصفير مؤقت اللعبة ──
    clearGameTimer(state.roomId);
    state.gameTimer = null;

    return state;
  }

  // ── إعادة الغرفة لحالة اللوبي (بعد GAME_OVER) ────────────
  socket.on('room:reset-to-lobby', async (data: { roomId: string; resetPenalties?: boolean }, callback) => {
    try {
      // Auto-join as leader (staff أو مُضيف-لاعب مُخوّل — الحارس يقصره على غرفته)
      socket.join(data.roomId);
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader' && socket.data.isPlayerHost !== true) {
        if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' });
        return;
      }
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // 🧮 احتساب نتيجة اللعبة المنتهية (إن لم تُحتسب) قبل إعادة الغرفة للوبي
      // (زر "العودة للغرفة" — كي تنعكس النقاط في الرانك حتى لو لم يضغط الليدر "عرض النتيجة")
      await finalizeIfDecided(state);

      // ⚖️ تمرير الاختيار كما ورد (قد يكون undefined) — عندئذٍ يحكم إعداد الغرفة penaltyScope.
      // كان `?? true` يصفّر العقوبات دائماً لأي عميل لا يرسل العلم، فيُبطل إعداد «room».
      resetRoomState(state, [], data.resetPenalties);
      await finishPromotions(state);
      await setGameState(data.roomId, state);

      await emitPhaseChangedSanitized(io, data.roomId, { phase: 'LOBBY', state });

      callback({ success: true, players: state.players });
      console.log(`🔄 Room ${data.roomId} reset to LOBBY with ${state.players.length} players`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // 🔒 الإعادة تُلقي طبقة ملء الشاشة على بروجكتور القاعة وتكشف أدوار مباراة
  //    سابقة — وكانت بلا أي حارس، فأي ساكت يستطيع مقاطعة السهرة أو قراءة
  //    نتائج أي مباراة بمعرّفها. نقصرها على ليدر موثّق أو شاشة مُصادَقة.
  const replayAllowed = () => socket.data.role === 'leader' || socket.data.role === 'display';

  // ── عرض إعادة نتيجة لعبة سابقة على شاشة Display ────────────
  socket.on('display:show-replay', async (data: { roomId: string; matchId: number }, callback?) => {
    try {
      if (!replayAllowed()) return callback?.({ success: false, error: 'غير مصرّح' });
      const { getMatchDetails } = await import('../services/match.service.js');
      const match = await getMatchDetails(data.matchId);
      if (!match) {
        return callback?.({ success: false, error: 'Match not found' });
      }
      // بث النتيجة لشاشة العرض
      io.to(data.roomId).emit('display:replay-result', {
        matchId: match.id,
        winner: match.winner,
        players: match.players,
        durationFormatted: match.durationFormatted,
        gameName: match.gameName,
      });
      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ── إخفاء إعادة النتيجة من شاشة Display ────────────
  socket.on('display:hide-replay', (data: { roomId: string }, callback?) => {
    if (!replayAllowed()) return callback?.({ success: false, error: 'غير مصرّح' });
    io.to(data.roomId).emit('display:replay-hidden');
    callback?.({ success: true });
  });

  // ══════════════════════════════════════════════════════
  // 🎁 سحب «اختيار رابح» (هدايا الفعالية) — منفصل تماماً عن منطق اللعبة/الرانك
  // الخادم مصدر العشوائية (عدالة + مصدر حقيقة واحد). النتيجة تُحدَّد مسبقاً ثم تُكشف بأنيميشن
  // تجميلي على شاشة العرض. مسموح فقط في اللوبي (حيث شاشة العرض تعرض شبكة كل اللاعبين).
  // ══════════════════════════════════════════════════════
  socket.on('room:lucky-draw:draw', async (data: { roomId: string; count: number; poolMode?: 'all' | 'alive'; excludeWinners?: boolean }, callback) => {
    try {
      socket.join(data.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; }
      socket.data.role = 'leader';

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      // 🎁 متاح في كل المراحل (اللوبي وأثناء اللعبة). الكشف يظهر كـoverlay فوق شاشة العرض.

      // نطاق المرشّحين: كل الحاضرين، أو الأحياء فقط أثناء اللعبة (لا يُطبَّق في اللوبي حيث الجميع أحياء)
      const aliveOnly = data.poolMode === 'alive' && state.phase !== Phase.LOBBY;
      const excludeWinners = !!data.excludeWinners;
      const won = new Set<number>(Array.isArray(state.luckyDrawHistory) ? state.luckyDrawHistory : []);
      const pool = state.players
        .filter((p: any) => !p.seatHeld && !p.frozen
          && (!aliveOnly || p.isAlive)
          && (!excludeWinners || !won.has(p.physicalId)))
        .map((p: any) => p.physicalId);

      const count = Math.floor(Number(data.count) || 0);
      if (pool.length === 0) return callback({ success: false, error: 'لا يوجد لاعبون مؤهّلون للسحب (تحقّق من الاستبعاد/النطاق)' });
      if (count < 1 || count > pool.length) {
        return callback({ success: false, error: `العدد يجب أن يكون بين 1 و ${pool.length}` });
      }

      // خلط Fisher–Yates ثم أخذ أول count (فائزون بلا تكرار)
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const winners = shuffled.slice(0, count);

      state.luckyDraw = { status: 'drawn', count, winners, pool, poolMode: aliveOnly ? 'alive' : 'all', excludeWinners };
      await setGameState(data.roomId, state);

      // لا نبثّ الفائزين الآن — فقط للّيدر — حفاظاً على المفاجأة حتى الكشف
      callback({ success: true, winners, pool, history: Array.from(won) });
      console.log(`🎁 Lucky draw drawn in room ${data.roomId}: ${count} from ${pool.length} (mode=${aliveOnly ? 'alive' : 'all'}, exclude=${excludeWinners}) → [${winners.join(', ')}]`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('room:lucky-draw:reveal', async (data: { roomId: string }, callback) => {
    try {
      socket.join(data.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; }
      socket.data.role = 'leader';

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (!state.luckyDraw) return callback({ success: false, error: 'لا يوجد سحب لكشفه — اسحب أولاً' });

      // أبقِ الفائزين الحاضرين فقط (قد يكون أحدهم غادر بعد السحب)
      const present = new Set(state.players.filter((p: any) => !p.seatHeld && !p.frozen).map((p: any) => p.physicalId));
      const winners = state.luckyDraw.winners.filter((id) => present.has(id));
      if (winners.length === 0) return callback({ success: false, error: 'لم يعد الفائزون موجودين — أعد السحب' });

      state.luckyDraw.winners = winners;
      state.luckyDraw.status = 'revealed';
      state.luckyDraw.revealedAt = Date.now();
      // 🎁 سجّل الفائزين المكشوفين لاستبعادهم اختيارياً لاحقاً (يستمرّ عبر ألعاب الغرفة)
      const history = Array.from(new Set([...(Array.isArray(state.luckyDrawHistory) ? state.luckyDrawHistory : []), ...winners]));
      state.luckyDrawHistory = history;
      await setGameState(data.roomId, state);

      io.to(data.roomId).emit('display:lucky-draw', { winners, pool: state.luckyDraw.pool, spinMs: 4500 });

      callback({ success: true, winners, history });
      console.log(`🎁 Lucky draw revealed in room ${data.roomId} → [${winners.join(', ')}]`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on('room:lucky-draw:clear', async (data: { roomId: string }, callback) => {
    try {
      socket.join(data.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; }
      socket.data.role = 'leader';

      const state = await getGameState(data.roomId);
      if (state) { state.luckyDraw = null; await setGameState(data.roomId, state); }
      io.to(data.roomId).emit('display:lucky-draw:clear');
      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ── لعبة جديدة في نفس الغرفة — reset بدل create ────────────
  socket.on('room:new-game', async (data: { 
    roomId: string; 
    excludePlayerIds?: number[];
    resetPenalties?: boolean;
  }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      if (!socket.data.authStaff) { if (typeof callback === 'function') callback({ success: false, error: 'غير مصرّح — صلاحية الليدر مطلوبة' }); return; } socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const excludeIds = data.excludePlayerIds || [];

      // حذف المستبعدين من PostgreSQL
      if (state.sessionId && excludeIds.length > 0) {
        for (const pid of excludeIds) {
          await removePlayerFromSession(state.sessionId, pid);
        }
      }

      // 🧮 احتساب نتيجة اللعبة المنتهية (إن لم تُحتسب) قبل بدء لعبة جديدة
      // (state.players لا يزال كاملاً هنا — الاحتساب يشمل كل اللاعبين قبل أي استبعاد)
      await finalizeIfDecided(state);

      // إعادة تعيين الحالة باستخدام الدالة المشتركة
      // ⚖️ بلا `?? true`: العميل الذي لا يرسل العلم يترك القرار لإعداد الغرفة penaltyScope
      resetRoomState(state, excludeIds, data.resetPenalties);
      await finishPromotions(state);
      await setGameState(data.roomId, state);

      // ── إبلاغ المستبعدين قبل بث الحالة الجديدة ──
      if (excludeIds.length > 0) {
        const allSockets = await io.in(data.roomId).fetchSockets();
        for (const s of allSockets) {
          if (s.data.role === 'player' && excludeIds.includes(s.data.physicalId)) {
            s.emit('player:kicked-self');
            s.leave(data.roomId);
          }
        }
      }

      // تحديث عدد اللاعبين في activeRooms
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.playerCount = state.players.length;
      }

      // إعلام الجميع بالتحول للوبي
      await emitPhaseChangedSanitized(io, data.roomId, { phase: 'LOBBY', state });

      callback({
        success: true,
        roomId: state.roomId,
        roomCode: state.roomCode,
        displayPin: state.config.displayPin,
        players: state.players,
      });

      console.log(`🔄 Room ${data.roomId} reset for new game (session #${state.sessionId}) with ${state.players.length} players (excluded: ${excludeIds.length})`);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تغيير نمط الليل (Manual / Auto) ──────────
  socket.on('game:set-night-mode', async (data: {
    roomId: string;
    mode: 'manual' | 'auto';
    autoTimeSeconds?: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        if (callback) callback({ success: false, error: 'Only leader' });
        return;
      }
      const state = await getGameState(data.roomId);
      if (!state) {
        if (callback) callback({ success: false, error: 'Room not found' });
        return;
      }

      // يُسمح بالتغيير في اللوبي أو بعد نهاية اللعبة
      if (state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER') {
        if (callback) callback({ success: false, error: 'يمكن تغيير النمط فقط بين الألعاب' });
        return;
      }

      state.config.nightMode = data.mode;
      if (data.mode === 'auto' && data.autoTimeSeconds) {
        state.config.autoNightTime = data.autoTimeSeconds;
      }
      await setGameState(data.roomId, state);

      // إعلام الجميع (أو الليدر) بالحالة الجديدة لتحديث الواجهة
      await emitStateSanitized(io, data.roomId, 'game:state-updated', state);
      
      console.log(`🌙 Night mode set to '${data.mode}' for room ${data.roomId}`);
      if (callback) callback({ success: true, mode: data.mode });
    } catch (err: any) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════
  // ⏱️ إعداد مؤقت اللعبة (قبل بدء اللعبة)
  // ══════════════════════════════════════════════════════
  socket.on('game:set-timer', async (data: {
    roomId: string;
    enabled: boolean;
    minutes?: number; // 30 | 60 | 90
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        if (callback) callback({ success: false, error: 'Only leader' });
        return;
      }
      const state = await getGameState(data.roomId);
      if (!state) {
        if (callback) callback({ success: false, error: 'Room not found' });
        return;
      }

      // يُسمح بالتغيير في اللوبي أو بعد نهاية اللعبة فقط
      if (state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER') {
        if (callback) callback({ success: false, error: 'يمكن تغيير المؤقت فقط بين الألعاب' });
        return;
      }

      state.config.gameTimerEnabled = data.enabled;
      if (data.minutes && [30, 60, 90].includes(data.minutes)) {
        state.config.gameTimerMinutes = data.minutes;
      }
      await setGameState(data.roomId, state);

      console.log(`⏱️ Game timer set: ${data.enabled ? `ON (${state.config.gameTimerMinutes} min)` : 'OFF'} for room ${data.roomId}`);
      if (callback) callback({ success: true, enabled: state.config.gameTimerEnabled, minutes: state.config.gameTimerMinutes });
    } catch (err: any) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ── تنظيف عند قطع الاتصال ─────────────────────

  socket.on('disconnect', () => {
    if (socket.data.role === 'leader' && socket.data.roomId) {
      console.log(`⚠️ Leader disconnected from room ${socket.data.roomId}`);
    }
    if (socket.data.role === 'display' && socket.data.roomId) {
      console.log(`⚠️ Display disconnected from room ${socket.data.roomId}`);
    }
    // 🕵️ انقطاع لاعبٍ أثناء لعبةٍ حيّة = مغادرةٌ تُسجَّل فوراً.
    // بدونه كان «غادر ولم يعد» (قتل التطبيق، نفاد البطارية، خروجٌ من القاعة)
    // لا يُنتج أثراً إطلاقاً — وهي أخطر حالةٍ وأكثرها دلالة.
    if (socket.data.role === 'player' && socket.data.roomId && socket.data.physicalId) {
      const secretOpen = !!socket.data.secretScreenOpen;
      void openAbsence(io, socket.data.roomId, socket.data.physicalId, secretOpen);
    }
  });
}
