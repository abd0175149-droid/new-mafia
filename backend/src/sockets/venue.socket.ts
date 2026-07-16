// ══════════════════════════════════════════════════════
// 🏪 سوكيت كونسول المكان — venue:join
// ينضمّ حساب المكان لغرفة location:{id} ليستقبل الطلبات الجديدة لحظيّاً.
// ⚠️ بلا دور leader إطلاقاً — حساب المكان ليس موجّه لعب. التحقّق من قاعدة البيانات
// في كلّ انضمام (الصلاحيّة قد تتغيّر بعد إصدار التوكن).
// ══════════════════════════════════════════════════════

import type { Server, Socket } from 'socket.io';
import { eq, and, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { staff } from '../schemas/admin.schema.js';

export function registerVenueEvents(_io: Server, socket: Socket) {
  socket.on('venue:join', async (data: { locationId?: number } | undefined, cb?: (res: any) => void) => {
    const respond = (res: any) => { if (typeof cb === 'function') cb(res); };
    try {
      const staffId: number | undefined = socket.data.authStaff?.id ?? socket.data.authVenue?.id;
      if (!staffId) return respond({ success: false, error: 'غير مصادق' });

      const db = getDB();
      if (!db) return respond({ success: false, error: 'DB unavailable' });

      const [row] = await db.select({
        role: staff.role, isActive: staff.isActive,
        locationId: staff.locationId, permissions: staff.permissions,
      }).from(staff).where(and(eq(staff.id, staffId), isNull(staff.deletedAt))).limit(1);

      if (!row || row.isActive === false) return respond({ success: false, error: 'الحساب غير نشط' });

      let locId: number | null = null;
      if (row.role === 'admin' || row.role === 'manager') {
        // HQ: ينضمّ للمكان الذي يختاره من الكونسول
        locId = Number.isFinite(Number(data?.locationId)) ? Number(data!.locationId) : null;
        if (!locId) return respond({ success: false, error: 'حدّد المكان' });
      } else if (row.role === 'location_owner') {
        const perms: string[] = Array.isArray(row.permissions) ? (row.permissions as string[]) : [];
        if (!row.locationId) return respond({ success: false, error: 'الحساب غير مرتبط بمكان' });
        if (!perms.includes('orders.receive')) return respond({ success: false, error: 'ليس لدى حسابك صلاحيّة استقبال الطلبات' });
        locId = row.locationId;
      } else {
        return respond({ success: false, error: 'غير مصرّح' });
      }

      // مغادرة أيّ غرفة مكان سابقة (تبديل الأدمن بين الأماكن)
      for (const room of socket.rooms) {
        if (typeof room === 'string' && room.startsWith('location:')) socket.leave(room);
      }
      socket.join(`location:${locId}`);
      socket.data.venueLocationId = locId;
      respond({ success: true, locationId: locId });
    } catch (err: any) {
      respond({ success: false, error: err.message });
    }
  });
}
