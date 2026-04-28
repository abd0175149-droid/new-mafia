// ══════════════════════════════════════════════════════
// 🔔 مسارات إشعارات الموظفين — Staff Notification Routes
// تسجيل FCM Token + إرسال إشعار مخصص
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { registerStaffToken, sendPushToAllPlayers, sendPushToPlayers, sendPushToStaff, sendPushToAdmins, sendPushToStaffByPermission } from '../services/fcm.service.js';
import { playerNotifications } from '../schemas/notification.schema.js';
import { players } from '../schemas/player.schema.js';
import { bookings } from '../schemas/admin.schema.js';

const router = Router();

// ── POST /register-token — تسجيل FCM Token للموظف ──
router.post('/register-token', authenticate, async (req: Request, res: Response) => {
  const staffId = req.user!.id;
  const { token, deviceInfo } = req.body;
  if (!token) return res.status(400).json({ error: 'token مطلوب' });

  await registerStaffToken(staffId, token, deviceInfo || '');
  res.json({ success: true });
});

// ── POST /send-custom — إرسال إشعار مخصص (Admin only) ──
router.post('/send-custom', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const { title, body, target, targetIds, activityId, targetAudience, data } = req.body;
  // targetAudience: 'players' | 'staff' | 'both'

  if (!title || !body) return res.status(400).json({ error: 'العنوان والنص مطلوبان' });

  const audience = targetAudience || 'players';
  let sentCount = 0;

  try {
    // ── إرسال للاعبين ──
    if (audience === 'players' || audience === 'both') {
      if (target === 'all') {
        await sendPushToAllPlayers(title, body, 'custom', data || {});
        const [count] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(players);
        sentCount += count?.c || 0;
      } else if (target === 'booked' && activityId) {
        const bookers = await db.select({ playerId: bookings.playerId }).from(bookings)
          .where(eq(bookings.activityId, activityId));
        const ids = bookers.filter(b => b.playerId).map(b => b.playerId!);
        if (ids.length > 0) {
          await sendPushToPlayers(ids, title, body, 'custom', data || {});
          sentCount += ids.length;
        }
      } else if (target === 'specific' && Array.isArray(targetIds) && targetIds.length > 0) {
        await sendPushToPlayers(targetIds, title, body, 'custom', data || {});
        sentCount += targetIds.length;
      }
    }

    // ── إرسال للموظفين ──
    if (audience === 'staff' || audience === 'both') {
      const { staff } = await import('../schemas/admin.schema.js');
      const allStaff = await db.select({ id: staff.id }).from(staff);

      if (target === 'all') {
        for (const s of allStaff) {
          await sendPushToStaff(s.id, title, body, 'new_activity', data || {});
          sentCount++;
        }
      } else if (target === 'specific' && Array.isArray(targetIds)) {
        for (const id of targetIds) {
          await sendPushToStaff(id, title, body, 'new_activity', data || {});
          sentCount++;
        }
      }
    }

    console.log(`📢 Custom notification sent by staff #${req.user!.id}: "${title}" → ${sentCount} recipients`);
    res.json({ success: true, sentCount });
  } catch (err: any) {
    console.error('❌ send-custom error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
