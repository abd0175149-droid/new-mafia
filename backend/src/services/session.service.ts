// ══════════════════════════════════════════════════════
// 📦 خدمة الغرف (Session Service)
// إنشاء وإدارة غرف الألعاب (Session) في PostgreSQL
// ══════════════════════════════════════════════════════

import { eq, desc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { sessions, sessionPlayers } from '../schemas/game.schema.js';
import { activities } from '../schemas/admin.schema.js';

// ── إنشاء غرفة جديدة ────────────────────────────────
export async function createSession(
  sessionName: string,
  sessionCode: string,
  displayPin: string,
  maxPlayers: number,
  activityId?: number,
  createdBy?: number | null,
): Promise<number | null> {
  const db = getDB();
  if (!db) {
    console.warn('⚠️ PostgreSQL unavailable — session not saved');
    return null;
  }

  try {
    const result = await db.insert(sessions).values({
      sessionCode,
      displayPin,
      sessionName,
      maxPlayers,
      isActive: true,
      activityId: activityId || null,
      createdBy: createdBy ?? null, // 👤 مُنشئ الغرفة (staff)
    } as any).returning({ id: sessions.id });

    const sessionId = result[0]?.id;

    // ربط ثنائي الاتجاه: تحديث activities.sessionId
    if (activityId && sessionId) {
      await db.update(activities)
        .set({ sessionId } as any)
        .where(eq(activities.id, activityId));
      console.log(`🔗 Session #${sessionId} linked to Activity #${activityId}`);
    }

    console.log(`📦 Session #${sessionId} created: ${sessionName}`);
    return sessionId;
  } catch (err: any) {
    console.error('❌ Failed to create session:', err.message);
    return null;
  }
}

// ── ربط غرفة موجودة بنشاط ──────────────────────────
export async function linkSessionToActivity(
  sessionId: number,
  activityId: number,
): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    // تحديث sessions.activityId
    await db.update(sessions)
      .set({ activityId } as any)
      .where(eq(sessions.id, sessionId));

    // تحديث activities.sessionId (ربط ثنائي)
    await db.update(activities)
      .set({ sessionId } as any)
      .where(eq(activities.id, activityId));

    console.log(`🔗 Linked: Session #${sessionId} ↔ Activity #${activityId}`);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to link session to activity:', err.message);
    return false;
  }
}

// ── فك ربط غرفة من نشاط ─────────────────────────────
export async function unlinkSessionFromActivity(
  sessionId: number,
): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    // جلب activityId الحالي
    const session = await db.select({ activityId: sessions.activityId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const activityId = session[0]?.activityId;

    // مسح sessions.activityId
    await db.update(sessions)
      .set({ activityId: null } as any)
      .where(eq(sessions.id, sessionId));

    // مسح activities.sessionId (إذا كان مرتبطاً)
    if (activityId) {
      await db.update(activities)
        .set({ sessionId: null } as any)
        .where(eq(activities.id, activityId));
    }

    console.log(`🔓 Unlinked: Session #${sessionId} from Activity #${activityId}`);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to unlink session from activity:', err.message);
    return false;
  }
}

// ── إضافة لاعب للغرفة ──────────────────────────────
export async function addPlayerToSession(
  sessionId: number,
  physicalId: number,
  playerName: string,
  phone?: string,
  gender?: string,
  dateOfBirth?: string,
  playerId?: number | null,
): Promise<void> {
  const db = getDB();
  if (!db) return;

  try {
    // تحقق إذا اللاعب موجود بنفس الـ physicalId
    const existing = await db.select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId))
      .then(rows => rows.find(r => r.physicalId === physicalId));

    if (existing) {
      // تحديث البيانات
      await db.update(sessionPlayers)
        .set({
          playerName,
          phone: phone || existing.phone,
          gender: gender || existing.gender,
          dateOfBirth: dateOfBirth || existing.dateOfBirth,
          playerId: playerId || existing.playerId || null,
        } as any)
        .where(eq(sessionPlayers.id, existing.id));
    } else {
      // إضافة جديد
      await db.insert(sessionPlayers).values({
        sessionId,
        physicalId,
        playerName,
        phone: phone || null,
        gender: gender || 'MALE',
        dateOfBirth: dateOfBirth || null,
        playerId: playerId || null,
      } as any);
    }
  } catch (err: any) {
    console.error('❌ Failed to add player to session:', err.message);
  }
}

// ── جلب لاعبي الغرفة ──────────────────────────────
export async function getSessionPlayers(sessionId: number) {
  const db = getDB();
  if (!db) return [];

  try {
    return await db.select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));
  } catch (err: any) {
    console.error('❌ Failed to fetch session players:', err.message);
    return [];
  }
}

// ── حذف لاعب من الغرفة ─────────────────────────────
export async function removePlayerFromSession(sessionId: number, physicalId: number): Promise<void> {
  const db = getDB();
  if (!db) return;

  try {
    const rows = await db.select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));
    
    const target = rows.find(r => r.physicalId === physicalId);
    if (target) {
      await db.delete(sessionPlayers).where(eq(sessionPlayers.id, target.id));
    }
  } catch (err: any) {
    console.error('❌ Failed to remove player from session:', err.message);
  }
}


// ── إغلاق الغرفة (تبقى في السجل كـ مغلقة) ─────
export async function closeSession(sessionId: number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    await db.update(sessions)
      .set({ isActive: false, status: 'closed' } as any)
      .where(eq(sessions.id, sessionId));

    console.log(`🔒 Session #${sessionId} closed (status=closed)`);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to close session:', err.message);
    return false;
  }
}

// ── إكمال النشاط المرتبط (عند إنهاء الفعالية) ─────
// يحوّل حالة النشاط إلى 'completed' كي لا يظهر في قائمة الأنشطة القادمة للاعب.
export async function completeActivity(activityId: number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    await db.update(activities)
      .set({ status: 'completed' } as any)
      .where(eq(activities.id, activityId));

    console.log(`🏁 Activity #${activityId} marked as completed (event ended)`);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to complete activity:', err.message);
    return false;
  }
}

// ── إنهاء غرفة فعالية بالكامل (مسار موحّد للوحة التحكم وواجهة الليدر) ─────
// يضمن منطقاً متكاملاً عند إنهاء الفعالية: احتساب أي لعبة محسومة + إغلاق الجلسة +
// إكمال النشاط + إنشاء استبيانات التقييم وإشعارها + طرد كل اللاعبين من الغرفة +
// تنظيف Redis/activeRooms — بصرف النظر عن وجود حالة Redis (roomId يُشتق من Redis أو
// من جدول المباريات كبديل، فلا يبقى لاعبون عالقون حتى لو حُذفت الحالة مسبقاً).
export async function endActivityRoom(
  sessionId: number,
  io?: any,
): Promise<{ closed: boolean; roomId: string | null; feedbackCount: number }> {
  const db = getDB();
  if (!db) return { closed: false, roomId: null, feedbackCount: 0 };

  const [ses] = await db.select({ sessionCode: sessions.sessionCode, activityId: sessions.activityId })
    .from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!ses) return { closed: false, roomId: null, feedbackCount: 0 };
  const sessionCode = ses.sessionCode;
  const activityId = ses.activityId;

  // 1) إيجاد roomId + الحالة الحيّة (Redis أولاً، ثم آخر مباراة للجلسة كبديل)
  let roomId: string | null = null;
  let liveState: any = null;
  try {
    const { getRoomByCode } = await import('../game/state.js');
    if (sessionCode) liveState = await getRoomByCode(sessionCode);
    roomId = liveState?.roomId || null;
  } catch { /* ignore */ }
  if (!roomId) {
    try {
      const { matches } = await import('../schemas/game.schema.js');
      const [m] = await db.select({ roomId: matches.roomId }).from(matches)
        .where(eq(matches.sessionId, sessionId)).orderBy(desc(matches.id)).limit(1);
      roomId = m?.roomId || null;
    } catch { /* ignore */ }
  }

  // 2) احتساب أي لعبة محسومة لم تُحتسب قبل التفكيك
  if (liveState) {
    try { const { finalizeIfDecided } = await import('./match.service.js'); await finalizeIfDecided(liveState); } catch { /* ignore */ }
  }

  // 3) إغلاق الجلسة + إكمال النشاط
  const closed = await closeSession(sessionId);
  if (activityId) await completeActivity(activityId).catch(() => false);

  // 4) استبيانات التقييم لكل المشاركين + إشعار (من DB — يعمل دائماً)
  let feedbackCount = 0;
  try {
    const { createPendingForSession } = await import('./feedback.service.js');
    const newPlayerIds = await createPendingForSession(sessionId);
    feedbackCount = newPlayerIds.length;
    if (newPlayerIds.length > 0) {
      const { sendPushToPlayers } = await import('./fcm.service.js');
      await sendPushToPlayers(
        newPlayerIds, '📋 رأيك يهمّنا',
        'قيّم تجربتك في الفعالية (أقل من دقيقة) — مطلوب قبل حجزك القادم',
        'feedback_survey', { sessionId, url: `/player/feedback?sessionId=${sessionId}` },
      );
    }
  } catch (e: any) { console.warn('⚠️ endActivityRoom feedback failed:', e?.message || e); }

  // 5) طرد كل اللاعبين من الغرفة (حدثان للتوافق) + إخراج قسري من غرفة السوكِت
  if (roomId && io) {
    try {
      const payload = { message: 'انتهت الفعالية — شكراً لمشاركتكم!', reason: 'تم إنهاء الفعالية وإغلاق الغرفة.' };
      io.to(roomId).emit('event:closed', payload);
      io.to(roomId).emit('game:kicked', payload);
      io.in(roomId).socketsLeave(roomId);
    } catch (e: any) { console.warn('⚠️ endActivityRoom kick failed:', e?.message || e); }
  }

  // 6) تنظيف Redis + activeRooms
  try {
    const { deleteGameState } = await import('../config/redis.js');
    if (roomId) await deleteGameState(roomId);
    if (sessionCode) await deleteGameState(`code:${sessionCode}`);
    const { activeRooms } = await import('../sockets/lobby.socket.js');
    if (roomId) activeRooms.delete(roomId);
  } catch (e: any) { console.warn('⚠️ endActivityRoom redis cleanup failed:', e?.message || e); }

  // 7) 🔄 مصالحة الرانك من مصدر الحقيقة (match_players) — شبكة أمان ضد فقدان الاحتساب الحيّ.
  // الاحتساب الحيّ (finalizeMatch) ليس ذرّياً؛ أي مقاطعة بين تسجيل المباراة وتطبيق التجميعة
  // تترك الرانك ناقصاً ولا يُصلَح. هنا نعيد اشتقاق تجميعة موسم النشاط من match_players فيُضمَن
  // احتساب كل مباريات الفعالية المنتهية بدقة. (انظر unified-mafia-deploy-and-rank-facts)
  try {
    const { resolveSeasonForActivity } = await import('./season.service.js');
    const { reconcileSeasonProgression } = await import('./reconcile.service.js');
    const { seasonId } = await resolveSeasonForActivity(activityId);
    if (seasonId) {
      const res = await reconcileSeasonProgression(seasonId, true);
      console.log(`🔄 endActivityRoom: reconciled season #${seasonId} — players=${res.players}, mismatches=${res.mismatches}, applied=${res.applied}, reason=${res.reason}`);
    }
  } catch (e: any) { console.warn('⚠️ endActivityRoom rank reconcile failed:', e?.message || e); }

  console.log(`🔒 endActivityRoom: session #${sessionId} (room ${roomId || 'n/a'}) ended — closed=${closed}, feedback=${feedbackCount}`);
  return { closed, roomId, feedbackCount };
}

// ── حذف الغرفة (Soft Delete — تبقى في DB للسجل) ─────
export async function deleteSession(sessionId: number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    await db.update(sessions)
      .set({ isActive: false, status: 'deleted', deletedAt: new Date() } as any)
      .where(eq(sessions.id, sessionId));

    console.log(`🗑️ Session #${sessionId} soft-deleted (status=deleted)`);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to delete session:', err.message);
    return false;
  }
}

// ── جلب الغرف المنتهية مع عدد ألعابها ─────────────
export async function getClosedSessions() {
  const db = getDB();
  if (!db) return [];

  try {
    const rows = await db.execute(sql`
      SELECT 
        s.id,
        s.session_code,
        s.session_name,
        s.max_players,
        s.created_at,
        COUNT(m.id)::int AS match_count,
        MAX(m.ended_at) AS last_match_at,
        (SELECT m2.winner FROM matches m2 WHERE m2.session_id = s.id ORDER BY m2.ended_at DESC LIMIT 1) AS last_winner,
        (SELECT SUM(m3.duration_seconds) FROM matches m3 WHERE m3.session_id = s.id AND m3.is_active = false)::int AS total_duration
      FROM sessions s
      LEFT JOIN matches m ON m.session_id = s.id AND m.is_active = false
      WHERE s.is_active = false AND s.deleted_at IS NULL
      GROUP BY s.id
      ORDER BY MAX(m.ended_at) DESC NULLS LAST, s.created_at DESC
    `);

    return ((rows as any).rows || (rows as unknown as any[])).map((r: any) => ({
      id: r.id,
      sessionCode: r.session_code,
      sessionName: r.session_name,
      maxPlayers: r.max_players,
      createdAt: r.created_at,
      matchCount: r.match_count || 0,
      lastMatchAt: r.last_match_at,
      lastWinner: r.last_winner,
      totalDuration: r.total_duration || 0,
    }));
  } catch (err: any) {
    console.error('❌ Failed to fetch closed sessions:', err.message);
    return [];
  }
}

// ── جلب كل الغرف (نشطة + مغلقة) مع إحصائياتها ──────
export async function getAllSessions() {
  const db = getDB();
  if (!db) return [];

  try {
    const rows = await db.execute(sql`
      SELECT 
        s.id,
        s.session_code,
        s.display_pin,
        s.session_name,
        s.max_players,
        s.is_active,
        s.status,
        s.activity_id,
        s.created_at,
        COUNT(m.id)::int AS match_count,
        COUNT(CASE WHEN m.is_active = false THEN 1 END)::int AS finished_match_count,
        MAX(m.ended_at) AS last_match_at,
        (SELECT m2.winner FROM matches m2 
         WHERE m2.session_id = s.id 
         ORDER BY m2.ended_at DESC NULLS LAST LIMIT 1) AS last_winner,
        COALESCE((SELECT SUM(m3.duration_seconds) 
         FROM matches m3 
         WHERE m3.session_id = s.id AND m3.is_active = false), 0)::int AS total_duration,
        (SELECT COUNT(*) FROM session_players sp 
         WHERE sp.session_id = s.id)::int AS player_count
      FROM sessions s
      LEFT JOIN matches m ON m.session_id = s.id
      WHERE s.deleted_at IS NULL
      GROUP BY s.id
      ORDER BY s.is_active DESC, s.created_at DESC
    `);

    return ((rows as any).rows || (rows as unknown as any[])).map((r: any) => ({
      id: r.id,
      sessionCode: r.session_code,
      displayPin: r.display_pin,
      sessionName: r.session_name,
      maxPlayers: r.max_players,
      isActive: r.is_active,
      status: r.status || (r.is_active ? 'active' : 'closed'),
      activityId: r.activity_id,
      createdAt: r.created_at,
      matchCount: r.match_count || 0,
      finishedMatchCount: r.finished_match_count || 0,
      playerCount: r.player_count || 0,
      lastMatchAt: r.last_match_at,
      lastWinner: r.last_winner,
      totalDuration: r.total_duration || 0,
    }));
  } catch (err: any) {
    console.error('❌ Failed to fetch all sessions:', err.message);
    return [];
  }
}
