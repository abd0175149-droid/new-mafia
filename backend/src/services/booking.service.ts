// ══════════════════════════════════════════════════════
// 🔗 خدمة الربط — Booking ↔ Player Integration Service
// ربط الحجوزات باللاعبين تلقائياً عبر رقم الهاتف
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { bookings } from '../schemas/admin.schema.js';

// م٨ (خطّة توحيد الحجز، 2026-11-21): أُزيلت matchBookingToPlayer و checkInPlayer — بلا مستدعٍ،
// والربط صار صريحاً (bookings.reservation_id ومشغّلات م٢-أ، و ownBookingCond).

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
