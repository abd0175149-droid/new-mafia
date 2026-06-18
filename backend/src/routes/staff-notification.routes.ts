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

// ── GET /players/search — بحث عن لاعبين (للإرسال المخصص) ──
router.get('/players/search', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const q = (req.query.q as string || '').trim();
  try {
    let rows;
    if (q) {
      const { or, ilike } = await import('drizzle-orm');
      rows = await db.select({
        id: players.id,
        name: players.name,
        phone: players.phone,
        avatarUrl: players.avatarUrl,
        totalMatches: players.totalMatches,
      }).from(players)
        .where(or(
          ilike(players.name, `%${q}%`),
          ilike(players.phone, `%${q}%`),
        ))
        .orderBy(desc(players.id))
        .limit(50);
    } else {
      rows = await db.select({
        id: players.id,
        name: players.name,
        phone: players.phone,
        avatarUrl: players.avatarUrl,
        totalMatches: players.totalMatches,
      }).from(players)
        .orderBy(desc(players.id))
        .limit(50);
    }
    res.json({ success: true, players: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── أدوات تحليل User-Agent ──
function detectOS(ua: string): string {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'غير معروف';
}
function detectBrowser(ua: string): string {
  if (/CriOS/.test(ua)) return 'Chrome';
  if (/FxiOS|Firefox/.test(ua)) return 'Firefox';
  if (/EdgA?|Edg\//.test(ua)) return 'Edge';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'غير معروف';
}

// ── GET /devices — اللاعبون المفعّلون للإشعارات وأجهزتهم ──
router.get('/devices', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const { playerFcmTokens } = await import('../schemas/notification.schema.js');
    const rows = await db.select({
      playerId: playerFcmTokens.playerId,
      name: players.name,
      phone: players.phone,
      avatarUrl: players.avatarUrl,
      token: playerFcmTokens.fcmToken,
      deviceInfo: playerFcmTokens.deviceInfo,
      createdAt: playerFcmTokens.createdAt,
    }).from(playerFcmTokens)
      .innerJoin(players, eq(playerFcmTokens.playerId, players.id))
      .where(eq(playerFcmTokens.isActive, true))
      .orderBy(desc(playerFcmTokens.createdAt));

    const map = new Map<number, any>();
    for (const r of rows) {
      if (!r.playerId) continue;
      if (!map.has(r.playerId)) {
        map.set(r.playerId, {
          playerId: r.playerId, name: r.name, phone: r.phone,
          avatarUrl: r.avatarUrl, deviceCount: 0, devices: [],
        });
      }
      const isWebpush = (r.token || '').startsWith('WEBPUSH::');
      const di = r.deviceInfo || '';
      const sep = di.indexOf('|');
      const deviceId = sep > 0 ? di.slice(0, sep) : null;
      const ua = sep > 0 ? di.slice(sep + 1) : di;
      const entry = map.get(r.playerId);
      entry.deviceCount++;
      entry.devices.push({
        channel: isWebpush ? 'WebPush (iOS/Safari)' : 'FCM (Android/Chrome)',
        os: detectOS(ua),
        browser: detectBrowser(ua),
        hasDeviceId: !!deviceId,
        registeredAt: r.createdAt,
      });
    }

    const list = Array.from(map.values()).sort((a, b) => b.deviceCount - a.deviceCount || a.name.localeCompare(b.name));
    res.json({
      success: true,
      totalPlayers: list.length,
      totalDevices: rows.length,
      players: list,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
