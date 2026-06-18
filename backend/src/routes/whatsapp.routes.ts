// ══════════════════════════════════════════════════════
// 📲 WhatsApp API Routes — نقاط اتصال تطبيق واتساب
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, sql, and, or, isNull, ne } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, locations, whatsappSendLogs, whatsappTemplates, whatsappRankNotifications } from '../schemas/admin.schema.js';
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

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/promoted-players
// جلب اللاعبين الذين تغيرت رتبتهم ولم يُرسل لهم بعد
// ══════════════════════════════════════════════════════

router.get('/promoted-players', authenticate, async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const RANK_ORDER: Record<string, number> = {
      INFORMANT: 0, SOLDIER: 1, CAPO: 2, UNDERBOSS: 3, GODFATHER: 4,
    };
    const RANK_NAMES_AR: Record<string, string> = {
      INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو',
      UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي',
    };

    // 1. جلب كل اللاعبين مع آخر رتبة تم إرسالها
    //    نستخدم subquery لجلب آخر سجل لكل لاعب
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.name,
        p.phone,
        p.rank_tier AS "rankTier",
        p.rank_rr AS "rankRR",
        p.level,
        p.xp,
        p.total_matches AS "totalMatches",
        p.total_wins AS "totalWins",
        p.total_survived AS "totalSurvived",
        p.last_active_at AS "lastActiveAt",
        latest_notif.rank_tier AS "lastNotifiedRank",
        latest_notif.sent_at AS "lastNotifiedAt"
      FROM players p
      LEFT JOIN LATERAL (
        SELECT rank_tier, sent_at
        FROM whatsapp_rank_notifications wrn
        WHERE wrn.player_id = p.id
        ORDER BY wrn.sent_at DESC
        LIMIT 1
      ) latest_notif ON true
      WHERE
        -- لم يُرسل له أبداً ورتبته ليست INFORMANT (المبتدئ)
        (latest_notif.rank_tier IS NULL AND p.rank_tier != 'INFORMANT')
        OR
        -- أو رتبته الحالية مختلفة عن آخر رتبة أُرسلت
        (p.rank_tier IS DISTINCT FROM latest_notif.rank_tier)
      ORDER BY
        CASE p.rank_tier
          WHEN 'GODFATHER' THEN 1 WHEN 'UNDERBOSS' THEN 2
          WHEN 'CAPO' THEN 3 WHEN 'SOLDIER' THEN 4
          ELSE 5
        END
    `);

    // 2. تحديد نوع التغيير لكل لاعب
    const rows = (result as any).rows || result;
    const promotedPlayers = rows.map((p: any) => {
      const currentOrder = RANK_ORDER[p.rankTier || 'INFORMANT'] || 0;
      const lastOrder = p.lastNotifiedRank ? (RANK_ORDER[p.lastNotifiedRank] || 0) : -1;
      const changeType = lastOrder === -1 ? 'new' :
                         currentOrder > lastOrder ? 'promoted' : 'demoted';

      return {
        id: p.id,
        name: p.name,
        phone: p.phone || '',
        rankTier: p.rankTier || 'INFORMANT',
        rankAr: RANK_NAMES_AR[p.rankTier || 'INFORMANT'],
        rankRR: p.rankRR || 0,
        level: p.level || 1,
        totalMatches: p.totalMatches || 0,
        totalWins: p.totalWins || 0,
        winRate: (p.totalMatches || 0) > 0
          ? Math.round(((p.totalWins || 0) / (p.totalMatches || 0)) * 100)
          : 0,
        changeType,
        previousRank: p.lastNotifiedRank || null,
        previousRankAr: p.lastNotifiedRank ? RANK_NAMES_AR[p.lastNotifiedRank] : null,
        lastNotifiedAt: p.lastNotifiedAt || null,
      };
    });

    // 🏆 حارس بداية الموسم: لا نُشعِر بالتنزيل إلى INFORMANT (توقيع تصفير الموسم)
    // يمنع انفجار "تم تنزيل رتبتك" لكل اللاعبين عند بدء موسم جديد.
    const filteredPlayers = promotedPlayers.filter(
      (p: any) => !(p.changeType === 'demoted' && p.rankTier === 'INFORMANT'),
    );

    res.json({
      success: true,
      players: filteredPlayers,
      summary: {
        total: filteredPlayers.length,
        promoted: filteredPlayers.filter((p: any) => p.changeType === 'promoted').length,
        demoted: filteredPlayers.filter((p: any) => p.changeType === 'demoted').length,
        new: filteredPlayers.filter((p: any) => p.changeType === 'new').length,
      },
    });
  } catch (err: any) {
    console.error('❌ whatsapp/promoted-players error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/mark-rank-notified
// تسجيل أن رسالة الرتبة أُرسلت للاعب
// ══════════════════════════════════════════════════════

router.post('/mark-rank-notified', authenticate, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const { playerIds } = req.body; // [{ playerId: 5, rankTier: 'CAPO', changeType: 'promoted' }, ...]

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ error: 'playerIds مطلوب' });
    }

    for (const entry of playerIds) {
      await db
        .insert(whatsappRankNotifications)
        .values({
          playerId: entry.playerId,
          rankTier: entry.rankTier,
          notificationType: entry.changeType || 'promotion',
        })
        .onConflictDoUpdate({
          target: [whatsappRankNotifications.playerId, whatsappRankNotifications.rankTier],
          set: {
            sentAt: new Date(),
            notificationType: entry.changeType || 'promotion',
          },
        });
    }

    res.json({ success: true, marked: playerIds.length });
  } catch (err: any) {
    console.error('❌ whatsapp/mark-rank-notified error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
