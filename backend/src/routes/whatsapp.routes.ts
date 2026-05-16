// ══════════════════════════════════════════════════════
// 📲 WhatsApp API Routes — نقاط اتصال تطبيق واتساب
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, locations, whatsappSendLogs, whatsappTemplates } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { sessions } from '../schemas/game.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/activity-players/:activityId
// جلب كل اللاعبين المرتبطين بفعالية مع بياناتهم الكاملة
// ══════════════════════════════════════════════════════

router.get('/activity-players/:activityId', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const activityId = parseInt(req.params.activityId);
    if (isNaN(activityId)) return res.status(400).json({ error: 'Invalid activity ID' });

    // 1. جلب بيانات الفعالية
    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    // 2. جلب الموقع
    let location = null;
    if (activity.locationId) {
      const [loc] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, activity.locationId))
        .limit(1);
      location = loc || null;
    }

    // 3. جلب الغرف المرتبطة
    let rooms: any[] = [];
    if (activity.sessionId) {
      rooms = await db
        .select({
          sessionCode: sessions.sessionCode,
          displayPin: sessions.displayPin,
          sessionName: sessions.sessionName,
        })
        .from(sessions)
        .where(eq(sessions.id, activity.sessionId));
    }

    // 4. جلب الحجوزات مع بيانات اللاعبين
    const bookingsList = await db
      .select()
      .from(bookings)
      .where(eq(bookings.activityId, activityId))
      .orderBy(desc(bookings.createdAt));

    // 5. جلب كل اللاعبين للمطابقة
    const allPlayers = await db.select().from(players);
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    const playerByPhone = new Map(
      allPlayers.filter(p => p.phone).map(p => [p.phone, p])
    );

    // 6. دمج البيانات
    const playersData = bookingsList.map(b => {
      let player = null;
      if (b.playerId) player = playerById.get(b.playerId) || null;
      if (!player && b.phone) player = playerByPhone.get(b.phone) || null;

      return {
        bookingId: b.id,
        bookingName: b.name,
        phone: player?.phone || b.phone || '',
        guestCount: b.count,
        isPaid: b.isPaid,
        paidAmount: b.paidAmount,
        isFree: b.isFree,
        checkedIn: b.checkedIn,
        notes: b.notes,
        player: player ? {
          id: player.id,
          name: player.name,
          rankTier: player.rankTier,
          rankRR: player.rankRR,
          level: player.level,
          xp: player.xp,
          totalMatches: player.totalMatches,
          totalWins: player.totalWins,
          totalSurvived: player.totalSurvived,
          winRate: player.totalMatches > 0
            ? Math.round((player.totalWins / player.totalMatches) * 100)
            : 0,
        } : null,
      };
    });

    // 7. إحصائيات
    const summary = {
      totalPlayers: playersData.length,
      paidCount: playersData.filter(p => p.isPaid).length,
      unpaidCount: playersData.filter(p => !p.isPaid && !p.isFree).length,
      freeCount: playersData.filter(p => p.isFree).length,
      withPhone: playersData.filter(p => p.phone && p.phone.length >= 9).length,
      withoutPhone: playersData.filter(p => !p.phone || p.phone.length < 9).length,
    };

    res.json({
      success: true,
      activity: {
        id: activity.id,
        name: activity.name,
        date: activity.date,
        basePrice: activity.basePrice,
        status: activity.status,
        location: location ? {
          id: location.id,
          name: location.name,
          mapUrl: location.mapUrl,
        } : null,
      },
      rooms,
      players: playersData,
      summary,
    });
  } catch (err: any) {
    console.error('❌ whatsapp/activity-players error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/send-log
// حفظ سجل الرسائل المُرسلة
// ══════════════════════════════════════════════════════

router.post('/send-log', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const { activityId, messageTemplate, recipients, sentBy, totalSent, totalFailed } = req.body;

    const [log] = await db
      .insert(whatsappSendLogs)
      .values({
        activityId: activityId || null,
        messageTemplate: messageTemplate || '',
        totalSent: totalSent || 0,
        totalFailed: totalFailed || 0,
        recipients: recipients || [],
        sentBy: sentBy || '',
      })
      .returning();

    res.json({ success: true, logId: log.id });
  } catch (err: any) {
    console.error('❌ whatsapp/send-log error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/send-logs
// جلب سجل الرسائل السابقة
// ══════════════════════════════════════════════════════

router.get('/send-logs', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const activityId = req.query.activityId ? parseInt(req.query.activityId as string) : null;
    const limit = parseInt(req.query.limit as string) || 20;

    let query = db
      .select({
        id: whatsappSendLogs.id,
        activityId: whatsappSendLogs.activityId,
        messageTemplate: whatsappSendLogs.messageTemplate,
        totalSent: whatsappSendLogs.totalSent,
        totalFailed: whatsappSendLogs.totalFailed,
        recipients: whatsappSendLogs.recipients,
        sentBy: whatsappSendLogs.sentBy,
        createdAt: whatsappSendLogs.createdAt,
      })
      .from(whatsappSendLogs)
      .orderBy(desc(whatsappSendLogs.createdAt))
      .limit(limit);

    if (activityId) {
      query = query.where(eq(whatsappSendLogs.activityId, activityId)) as any;
    }

    const logs = await query;

    res.json({ success: true, logs });
  } catch (err: any) {
    console.error('❌ whatsapp/send-logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/templates
// جلب قوالب الرسائل المحفوظة
// ══════════════════════════════════════════════════════

router.get('/templates', authenticate, async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const templates = await db
      .select()
      .from(whatsappTemplates)
      .orderBy(desc(whatsappTemplates.createdAt));

    res.json({ success: true, templates });
  } catch (err: any) {
    console.error('❌ whatsapp/templates error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/templates
// إنشاء قالب رسالة جديد
// ══════════════════════════════════════════════════════

router.post('/templates', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const { name, category, template, variables, createdBy } = req.body;

    if (!name || !template) {
      return res.status(400).json({ error: 'name و template مطلوبان' });
    }

    const [created] = await db
      .insert(whatsappTemplates)
      .values({
        name,
        category: category || 'custom',
        template,
        variables: variables || [],
        createdBy: createdBy || '',
      })
      .returning();

    res.json({ success: true, template: created });
  } catch (err: any) {
    console.error('❌ whatsapp/templates POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// PUT /api/whatsapp/templates/:id
// تعديل قالب رسالة
// ══════════════════════════════════════════════════════

router.put('/templates/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const id = parseInt(req.params.id);
    const { name, category, template, variables } = req.body;

    const [updated] = await db
      .update(whatsappTemplates)
      .set({
        ...(name && { name }),
        ...(category && { category }),
        ...(template && { template }),
        ...(variables && { variables }),
        updatedAt: new Date(),
      })
      .where(eq(whatsappTemplates.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Template not found' });

    res.json({ success: true, template: updated });
  } catch (err: any) {
    console.error('❌ whatsapp/templates PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// DELETE /api/whatsapp/templates/:id
// حذف قالب رسالة
// ══════════════════════════════════════════════════════

router.delete('/templates/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const id = parseInt(req.params.id);

    const [deleted] = await db
      .delete(whatsappTemplates)
      .where(eq(whatsappTemplates.id, id))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Template not found' });

    res.json({ success: true, message: 'تم حذف القالب' });
  } catch (err: any) {
    console.error('❌ whatsapp/templates DELETE error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
