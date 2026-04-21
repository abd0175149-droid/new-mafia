// ══════════════════════════════════════════════════════
// 🔗 خدمة الربط — Booking ↔ Player Integration Service
// ربط الحجوزات باللاعبين تلقائياً عبر رقم الهاتف
// ══════════════════════════════════════════════════════

import { eq, and } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { bookings, activities } from '../schemas/admin.schema.js';
import { sessionPlayers, sessions } from '../schemas/game.schema.js';

// ── مطابقة حجز مع لاعب عبر رقم الهاتف ────────────

export async function matchBookingToPlayer(
  sessionId: number,
  phone: string,
): Promise<{ bookingId: number; activityId: number } | null> {
  const db = getDB();
  if (!db || !phone) return null;

  try {
    // 1. ابحث عن النشاط المرتبط بالغرفة
    const session = await db.select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session[0]?.activityId) return null;

    const activityId = session[0].activityId;

    // 2. ابحث عن حجز بنفس رقم الهاتف في هذا النشاط
    const booking = await db.select()
      .from(bookings)
      .where(
        and(
          eq(bookings.activityId, activityId),
          eq(bookings.phone, phone),
          eq(bookings.checkedIn, false),
        ),
      )
      .limit(1);

    if (booking.length === 0) return null;

    return {
      bookingId: booking[0].id,
      activityId,
    };
  } catch (err: any) {
    console.error('❌ matchBookingToPlayer failed:', err.message);
    return null;
  }
}

// ── تسجيل حضور (Check-in): ربط الحجز واللاعب ────────

export async function checkInPlayer(
  bookingId: number,
  sessionPlayerId: number,
): Promise<boolean> {
  const db = getDB();
  if (!db) return false;

  try {
    // تحديث الحجز
    await db.update(bookings)
      .set({
        checkedIn: true,
        playerId: sessionPlayerId,
      })
      .where(eq(bookings.id, bookingId));

    // تحديث session_player
    await db.update(sessionPlayers)
      .set({ bookingId })
      .where(eq(sessionPlayers.id, sessionPlayerId));

    console.log(`✅ Check-in: Booking #${bookingId} ↔ Player #${sessionPlayerId}`);
    return true;
  } catch (err: any) {
    console.error('❌ checkInPlayer failed:', err.message);
    return false;
  }
}

// ── إحصائيات الحضور لنشاط معين ────────────────────

export async function getActivityAttendanceStats(activityId: number) {
  const db = getDB();
  if (!db) return null;

  try {
    // إجمالي الحجوزات
    const allBookings = await db.select()
      .from(bookings)
      .where(eq(bookings.activityId, activityId));

    const totalBooked = allBookings.reduce((sum, b) => sum + (b.count || 0), 0);
    const checkedInCount = allBookings.filter(b => b.checkedIn).length;
    const checkedInPeople = allBookings
      .filter(b => b.checkedIn)
      .reduce((sum, b) => sum + (b.count || 0), 0);

    return {
      totalBookings: allBookings.length,
      totalPeopleBooked: totalBooked,
      checkedInBookings: checkedInCount,
      checkedInPeople,
      noShowBookings: allBookings.length - checkedInCount,
      noShowPeople: totalBooked - checkedInPeople,
      attendanceRate: totalBooked > 0 ? Math.round((checkedInPeople / totalBooked) * 100) : 0,
    };
  } catch (err: any) {
    console.error('❌ getActivityAttendanceStats failed:', err.message);
    return null;
  }
}
