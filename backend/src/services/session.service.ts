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
    }).returning({ id: sessions.id });

    const sessionId = result[0]?.id;

    // ربط ثنائي الاتجاه: تحديث activities.sessionId
    if (activityId && sessionId) {
      await db.update(activities)
        .set({ sessionId })
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
      .set({ activityId })
      .where(eq(sessions.id, sessionId));

    // تحديث activities.sessionId (ربط ثنائي)
    await db.update(activities)
      .set({ sessionId })
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
      .set({ activityId: null })
      .where(eq(sessions.id, sessionId));

    // مسح activities.sessionId (إذا كان مرتبطاً)
    if (activityId) {
      await db.update(activities)
        .set({ sessionId: null })
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
        })
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
      });
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

// ── إغلاق الغرفة ───────────────────────────────────
export async function closeSession(sessionId: number): Promise<void> {
  const db = getDB();
  if (!db) return;

  try {
    await db.update(sessions)
      .set({ isActive: false })
      .where(eq(sessions.id, sessionId));
  } catch (err: any) {
    console.error('❌ Failed to close session:', err.message);
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
      WHERE s.is_active = false
      GROUP BY s.id
      ORDER BY MAX(m.ended_at) DESC NULLS LAST, s.created_at DESC
    `);

    return (rows.rows || rows).map((r: any) => ({
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
