// ══════════════════════════════════════════════════════
// 💬 WhatsApp Inbox Routes — الاستقبال والإرسال والمحادثات
// ══════════════════════════════════════════════════════
// يُركَّب على /api/whatsapp بجانب whatsapp.routes.ts (الصادر القديم):
//   • GET/POST /webhook            — عام (تحقق Meta + استقبال الأحداث)
//   • POST     /send               — أدمن (JWT) أو البوت (x-api-key)
//   • GET      /conversations      — أدمن فقط (قرار المالك)
//   • GET      /conversations/:id/messages · POST /read · /bot-toggle — أدمن

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { eq, desc, and, lt, sql, or, ilike, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { waConversations, waMessages, waCustomerNotes, waOptouts, waMessageTemplates, waBroadcasts, bookings, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  processWebhookPayload,
  sendMessage,
  isBotActive,
  isFreeWindowOpen,
} from '../services/whatsapp-inbox.service.js';

const router = Router();

// ══════════════════════════════════════════════════════
// حُرّاس المصادقة
// ══════════════════════════════════════════════════════

// مقارنة آمنة زمنياً لمفاتيح API
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// n8n (البوت) عبر x-api-key، أو موظف أدمن عبر JWT
function botOrAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    if (env.N8N_API_KEY && safeEqual(apiKey, env.N8N_API_KEY)) {
      (req as any).waCaller = 'bot';
      return next();
    }
    return res.status(401).json({ error: 'مفتاح API غير صالح' });
  }
  // لا مفتاح ⇒ مسار الموظفين: JWT + أدمن فقط
  authenticate(req, res, () => adminOnly(req, res, () => {
    (req as any).waCaller = 'staff';
    next();
  }));
}

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/webhook — تحقق Meta (hub.challenge)
// ══════════════════════════════════════════════════════

router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && env.WA_WEBHOOK_VERIFY_TOKEN && token === env.WA_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WA webhook verified by Meta');
    return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/webhook — استقبال الأحداث
// ══════════════════════════════════════════════════════
// نرد 200 فوراً (وإلا تعيد Meta الإرسال وقد تعطّل الـ webhook)،
// والمعالجة تتم بعد الرد. dedupe بالـ wamid يحمي من التكرار.

router.post('/webhook', (req: Request, res: Response) => {
  // ── التحقق من التوقيع (إن كان App Secret مضبوطاً) ──
  if (env.WA_APP_SECRET) {
    const signature = req.headers['x-hub-signature-256'];
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (typeof signature !== 'string' || !rawBody) {
      return res.sendStatus(403);
    }
    const expected = 'sha256=' + crypto.createHmac('sha256', env.WA_APP_SECRET).update(rawBody).digest('hex');
    if (!safeEqual(signature, expected)) {
      console.warn('🚫 WA webhook: توقيع غير صالح — تم الرفض');
      return res.sendStatus(403);
    }
  }

  res.sendStatus(200);

  // معالجة غير متزامنة بعد الرد
  processWebhookPayload(req.body).catch((err) =>
    console.error('❌ WA processWebhookPayload:', err.message),
  );
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/send — أنبوب الإرسال الموحد
// ══════════════════════════════════════════════════════
// Body: { conversationId? | phone?, text? | interactive? }

router.post('/send', botOrAdmin, async (req: Request, res: Response) => {
  try {
    const caller = (req as any).waCaller as 'bot' | 'staff';
    const { conversationId, phone, text, interactive } = req.body || {};

    const result = await sendMessage({
      conversationId: conversationId ? parseInt(conversationId) : undefined,
      phone,
      text,
      interactive,
      source: caller === 'bot' ? 'bot' : 'staff',
      staffId: caller === 'staff' ? (req as any).user?.id : undefined,
      staffName: caller === 'staff' ? (req as any).user?.displayName : undefined,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    const status = err.code === 'WINDOW_EXPIRED' ? 409 : 500;
    console.error('❌ whatsapp/send:', err.message);
    res.status(status).json({ error: err.message, code: err.code || 'SEND_FAILED' });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/conversations — قائمة المحادثات (أدمن)
// ══════════════════════════════════════════════════════
// ?q=بحث (اسم/رقم) &filter=all|unread|bot|human &limit &offset

router.get('/conversations', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const q = String(req.query.q || '').trim();
    const filter = String(req.query.filter || 'all');
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
    const offset = parseInt(String(req.query.offset)) || 0;

    const conds: any[] = [];
    if (q) {
      conds.push(or(
        ilike(waConversations.displayName, `%${q}%`),
        ilike(waConversations.phone, `%${q}%`),
      ));
    }
    if (filter === 'unread') conds.push(sql`${waConversations.unreadCount} > 0`);

    let query: any = db.select().from(waConversations);
    if (conds.length > 0) query = query.where(and(...conds));

    const rows = await query
      .orderBy(desc(waConversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    // حقول محسوبة للواجهة + فلترة bot/human (محسوبة زمنياً فلا تصلح شرط SQL ثابت)
    let list = rows.map((c: any) => ({
      ...c,
      botActive: isBotActive(c),
      windowOpen: isFreeWindowOpen(c),
    }));
    if (filter === 'bot') list = list.filter((c: any) => c.botActive);
    if (filter === 'human') list = list.filter((c: any) => !c.botActive);
    if (filter === 'attn') list = list.filter((c: any) => c.needsAttention);

    res.json({ success: true, conversations: list });
  } catch (err: any) {
    console.error('❌ whatsapp/conversations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/conversations/:id/messages — رسائل محادثة
// ══════════════════════════════════════════════════════
// ?limit=50 &before=<messageId>  (الأحدث أولاً — الواجهة تعكس الترتيب)

router.get('/conversations/:id/messages', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    const convId = parseInt(req.params.id);
    if (isNaN(convId)) return res.status(400).json({ error: 'معرّف غير صالح' });

    const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, convId)).limit(1);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
    const before = parseInt(String(req.query.before)) || 0;

    const conds: any[] = [eq(waMessages.conversationId, convId)];
    if (before > 0) conds.push(lt(waMessages.id, before));

    const messages = await db
      .select()
      .from(waMessages)
      .where(and(...conds))
      .orderBy(desc(waMessages.id))
      .limit(limit);

    res.json({
      success: true,
      conversation: { ...conv, botActive: isBotActive(conv), windowOpen: isFreeWindowOpen(conv) },
      messages, // الأحدث أولاً
      hasMore: messages.length === limit,
    });
  } catch (err: any) {
    console.error('❌ whatsapp/messages:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/conversations/:id/read — تصفير غير المقروء
// ══════════════════════════════════════════════════════

router.post('/conversations/:id/read', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const convId = parseInt(req.params.id);

    const [updated] = await db
      .update(waConversations)
      .set({ unreadCount: 0, updatedAt: new Date() } as any)
      .where(eq(waConversations.id, convId))
      .returning();
    if (!updated) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/conversations/:id/bot-toggle — تشغيل/إيقاف البوت
// ══════════════════════════════════════════════════════
// Body: { enabled: boolean }

router.post('/conversations/:id/bot-toggle', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const convId = parseInt(req.params.id);
    const enabled = !!req.body?.enabled;

    const patch: any = {
      botEnabled: enabled,
      botPausedUntil: null, // التفعيل/الإيقاف الصريح يلغي أي إيقاف مؤقت
      updatedAt: new Date(),
    };
    if (enabled) patch.needsAttention = false; // إعادة تفعيل البوت تزيل شارة «بحاجة تدخل»
    const [updated] = await db
      .update(waConversations)
      .set(patch)
      .where(eq(waConversations.id, convId))
      .returning();
    if (!updated) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    res.json({ success: true, conversation: { ...updated, botActive: isBotActive(updated), windowOpen: isFreeWindowOpen(updated) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🤖 إعدادات البوت الذكي — تُدار من تبويب «البوت» (أدمن فقط)
// ══════════════════════════════════════════════════════

router.get('/bot/settings', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const { getBotSettings, maskApiKey } = await import('../services/whatsapp-bot.service.js');
    const s: any = await getBotSettings();
    res.json({ success: true, settings: { ...s, geminiApiKey: maskApiKey(s.geminiApiKey || ''), hasKey: !!s.geminiApiKey } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/bot/settings', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { updateBotSettings, maskApiKey } = await import('../services/whatsapp-bot.service.js');
    const updatedBy = (req as any).user?.displayName || (req as any).user?.username || '';
    const s: any = await updateBotSettings(req.body || {}, updatedBy);
    res.json({ success: true, settings: { ...s, geminiApiKey: maskApiKey(s.geminiApiKey || ''), hasKey: !!s.geminiApiKey } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// اختبار المفتاح + جلب قائمة النماذج المتاحة حياً من Google
router.post('/bot/test-key', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { testGeminiKey } = await import('../services/whatsapp-bot.service.js');
    const result = await testGeminiKey(req.body?.apiKey);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ساحة الاختبار — نفس المحرك بلا إرسال واتساب ولا كتابة بيانات
router.post('/bot/playground', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { runPlayground } = await import('../services/whatsapp-bot.service.js');
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const result = await runPlayground(history);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 📍 أماكن النادي — تفعيل/تعطيل لإجابات البوت
router.get('/bot/locations', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const rows = await db
      .select({ id: locations.id, name: locations.name, mapUrl: locations.mapUrl, isActive: locations.isActive, isTestLocation: locations.isTestLocation })
      .from(locations)
      .where(isNull(locations.deletedAt))
      .orderBy(locations.id);
    res.json({ success: true, locations: rows.filter((l: any) => !l.isTestLocation) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bot/locations/:id/toggle', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    const isActive = !!req.body?.isActive;
    const [updated] = await db.update(locations).set({ isActive } as any).where(eq(locations.id, id)).returning({ id: locations.id, isActive: locations.isActive });
    if (!updated) return res.status(404).json({ error: 'المكان غير موجود' });
    res.json({ success: true, location: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// نبض البوت — إحصاءات سريعة
router.get('/bot/stats', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const { getBotStats } = await import('../services/whatsapp-bot.service.js');
    res.json({ success: true, stats: await getBotStats() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/unread-count — مجموع غير المقروء (لشارة القائمة الجانبية)
// ══════════════════════════════════════════════════════

router.get('/unread-count', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(${waConversations.unreadCount}), 0)` })
      .from(waConversations);
    res.json({ success: true, total: Number(row?.total || 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/conversations/:id/context — لوحة العميل
// اللاعب المربوط + آخر الحجوزات + الملاحظات + حالة إيقاف التسويق
// ══════════════════════════════════════════════════════

router.get('/conversations/:id/context', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const convId = parseInt(req.params.id);

    const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, convId)).limit(1);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    // ── اللاعب المربوط — من المصدر القانوني getPlayerProfile ──
    // (يبني الإحصاءات من سجل المباريات الفعلي مع fallback بالاسم، لا من الأعمدة الخام
    //  التي تتصفّر مع المواسم — نفس مصدر صفحة ملف اللاعب بالضبط)
    let player: any = null;
    if (conv.playerId) {
      try {
        const { getPlayerProfile } = await import('../services/player.service.js');
        const profile: any = await getPlayerProfile(conv.playerId);
        if (profile?.player) {
          const p = profile.player;
          const s = profile.stats || {};
          const prog = profile.progression || {};
          // ⚠️ أرقام الموسم = أعمدة players الخام حصراً — نفس مصدر صفحة التصنيف
          // بواجهة اللاعب بالضبط (تُصفَّر مع كل موسم ويحدّثها محرك التقدم).
          // نسبة الفوز تُحسب من نفس العمودين لتبقى متسقة ذاتياً.
          // لا نستخدم نسب profile.stats المحسوبة من سجل المباريات لأنها عابرة للمواسم.
          const seasonMatches = p.totalMatches || 0;
          const seasonWins = p.totalWins || 0;
          player = {
            id: p.id,
            name: p.name,
            phone: p.phone,
            avatarUrl: p.avatarUrl || '',
            gender: p.gender || null,
            createdAt: p.createdAt,
            lastActiveAt: p.lastActiveAt || null,
            isFree: !!p.isFreeAccount,
            // التقدم (أعمدة الموسم الحالي)
            rankTier: p.rankTier || 'INFORMANT',
            rankRR: p.rankRR || 0,
            level: p.level || 1,
            xp: p.xp || 0,
            nextLevelXP: prog.nextLevelXP || null,
            xpProgress: prog.xpProgress ?? null,
            rrRequired: prog.rrRequired || null,
            // أداء الموسم الحالي (مطابق لصفحة التصنيف)
            totalMatches: seasonMatches,
            totalWins: seasonWins,
            winRate: seasonMatches > 0 ? Math.round((seasonWins / seasonMatches) * 100) : 0,
            // معلومات تاريخية (كل المواسم) — موسومة كذلك بالواجهة
            favoriteRole: s.favoriteRole || null,
            // مدى الحياة الحقيقي: الأكبر من (العمود، الموسم، عدد سجلات المباريات)
            // — العمود أُضيف لاحقاً فقد يكون أقل من عدد الموسم نفسه
            lifetimeMatches: await (await import('../services/whatsapp-bot.service.js'))
              .computeLifetimeMatches(db, conv.playerId, seasonMatches, p.lifetimeMatches || 0),
          };
        }
      } catch (e: any) {
        console.warn('⚠️ WA context getPlayerProfile:', e.message);
        // fallback خفيف على الأعمدة الخام إن فشل البروفايل
        const [p] = await db.select().from(players).where(eq(players.id, conv.playerId)).limit(1);
        if (p) player = { id: p.id, name: p.name, phone: p.phone, avatarUrl: p.avatarUrl || '', rankTier: p.rankTier, rankRR: p.rankRR, level: p.level, xp: p.xp, totalMatches: p.totalMatches, totalWins: p.totalWins, winRate: p.totalMatches ? Math.round((p.totalWins / p.totalMatches) * 100) : 0, lifetimeMatches: (p as any).lifetimeMatches || 0 };
      }
    }

    // ── آخر الحجوزات (بمعرّف اللاعب أو بالهاتف) ──
    const bkConds = conv.playerId
      ? or(eq(bookings.playerId, conv.playerId), eq(bookings.phone, conv.phone))
      : eq(bookings.phone, conv.phone);
    const lastBookings = await db
      .select({
        id: bookings.id, name: bookings.name, count: bookings.count,
        isPaid: bookings.isPaid, isFree: bookings.isFree,
        activityId: bookings.activityId, createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(and(bkConds, isNull(bookings.deletedAt)))
      .orderBy(desc(bookings.createdAt))
      .limit(3);

    // ── الملاحظات الدائمة ──
    const notes = await db
      .select().from(waCustomerNotes)
      .where(eq(waCustomerNotes.phone, conv.phone))
      .orderBy(desc(waCustomerNotes.createdAt))
      .limit(10);

    // ── إيقاف التسويق؟ ──
    const [opt] = await db.select({ id: waOptouts.id }).from(waOptouts).where(eq(waOptouts.phone, conv.phone)).limit(1);

    res.json({ success: true, player, bookings: lastBookings, notes, optedOut: !!opt });
  } catch (err: any) {
    console.error('❌ whatsapp/context:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/conversations/:id/note — ملاحظة يدوية من الإدارة
// ══════════════════════════════════════════════════════

router.post('/conversations/:id/note', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const convId = parseInt(req.params.id);
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ error: 'الملاحظة فارغة' });

    const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, convId)).limit(1);
    if (!conv) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    const [saved] = await db
      .insert(waCustomerNotes)
      .values({ phone: conv.phone, playerId: conv.playerId, note, source: 'staff' } as any)
      .returning();
    res.json({ success: true, note: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/whatsapp/conversations/:id/link-player — ربط/فك ربط يدوي
// Body: { playerId: number | null }
// ══════════════════════════════════════════════════════

router.post('/conversations/:id/link-player', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const convId = parseInt(req.params.id);
    const playerId = req.body?.playerId === null ? null : parseInt(req.body?.playerId);
    if (playerId !== null && isNaN(playerId)) return res.status(400).json({ error: 'playerId غير صالح' });

    const patch: any = { playerId, updatedAt: new Date() };
    if (playerId !== null) {
      const [p] = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
      if (!p) return res.status(404).json({ error: 'اللاعب غير موجود' });
      patch.displayName = p.name;
    }

    const [updated] = await db
      .update(waConversations).set(patch)
      .where(eq(waConversations.id, convId)).returning();
    if (!updated) return res.status(404).json({ error: 'المحادثة غير موجودة' });

    res.json({ success: true, conversation: { ...updated, botActive: isBotActive(updated), windowOpen: isFreeWindowOpen(updated) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/whatsapp/player-search?q= — بحث لاعبين للربط اليدوي
// ══════════════════════════════════════════════════════

router.get('/player-search', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, players: [] });

    const conds: any[] = [ilike(players.name, `%${q}%`)];
    const localPhone = normalizeLocalPhone(q);
    if (localPhone) conds.push(eq(players.phone, localPhone));
    else if (/^\d{3,}$/.test(q.replace(/\D/g, ''))) conds.push(ilike(players.phone, `%${q.replace(/\D/g, '')}%`));

    const results = await db
      .select({ id: players.id, name: players.name, phone: players.phone, rankTier: players.rankTier, rankRR: players.rankRR })
      .from(players)
      .where(or(...conds))
      .limit(10);
    res.json({ success: true, players: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🗑️ حذف رسالة (ناعم — من سجلنا فقط؛ واتساب لا يدعم السحب عبر API)
// ══════════════════════════════════════════════════════

router.delete('/messages/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(waMessages)
      .set({ deletedAt: new Date(), deletedBy: (req as any).user?.displayName || 'أدمن' } as any)
      .where(eq(waMessages.id, id))
      .returning({ id: waMessages.id, conversationId: waMessages.conversationId, deletedAt: waMessages.deletedAt, deletedBy: waMessages.deletedBy });
    if (!updated) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    try {
      const io = (global as any).io;
      if (io) io.to('wa:inbox').emit('wa:message:deleted', updated);
    } catch { /* السوكيت تكميلي */ }
    res.json({ success: true, message: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📋 قوالب الرسائل المحلية (للبث — ليست قوالب ميتا)
// ══════════════════════════════════════════════════════

router.get('/templates', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const rows = await db.select().from(waMessageTemplates).orderBy(desc(waMessageTemplates.updatedAt));
    res.json({ success: true, templates: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const { name, body } = req.body || {};
    if (!name?.trim() || !body?.trim()) return res.status(400).json({ error: 'الاسم والنص مطلوبان' });
    const [row] = await db.insert(waMessageTemplates).values({
      name: name.trim().slice(0, 100), body: body.trim(),
      createdBy: (req as any).user?.displayName || '',
    } as any).returning();
    res.json({ success: true, template: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/templates/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const { name, body } = req.body || {};
    const [row] = await db.update(waMessageTemplates)
      .set({ ...(name?.trim() ? { name: name.trim().slice(0, 100) } : {}), ...(body?.trim() ? { body: body.trim() } : {}), updatedAt: new Date() } as any)
      .where(eq(waMessageTemplates.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'القالب غير موجود' });
    res.json({ success: true, template: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/templates/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    await db.delete(waMessageTemplates).where(eq(waMessageTemplates.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📋 استوديو قوالب ميتا (الحملات — دفعة 1)
// ══════════════════════════════════════════════════════

router.get('/meta-templates', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const svc = await import('../services/whatsapp-templates.service.js');
    const templates = req.query.sync === '0'
      ? await svc.listTemplatesLocal()
      : await svc.syncTemplates();
    res.json({ success: true, templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meta-templates', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { createTemplate } = await import('../services/whatsapp-templates.service.js');
    const template = await createTemplate({
      name: String(req.body?.name || ''),
      category: req.body?.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
      bodyText: String(req.body?.bodyText || ''),
      examples: Array.isArray(req.body?.examples) ? req.body.examples.map(String) : [],
      footer: String(req.body?.footer || ''),
      quickReplies: Array.isArray(req.body?.quickReplies) ? req.body.quickReplies.map(String) : [],
      urlButton: req.body?.urlButton?.text ? { text: String(req.body.urlButton.text), url: String(req.body.urlButton.url || '') } : null,
      createdBy: (req as any).user?.displayName || '',
    });
    res.json({ success: true, template });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/meta-templates/:name', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { deleteTemplate } = await import('../services/whatsapp-templates.service.js');
    await deleteTemplate(String(req.params.name));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📣 الحملات (دفعة 2): شرائح + إنشاء + مراقبة + تحكم
// ══════════════════════════════════════════════════════

router.get('/campaigns/segment-preview', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { previewSegment } = await import('../services/whatsapp-campaigns.service.js');
    const preview = await previewSegment({
      type: String(req.query.type || 'all') as any,
      rankMin: req.query.rankMin ? String(req.query.rankMin) : undefined,
      days: req.query.days ? parseInt(String(req.query.days)) : undefined,
    });
    res.json({ success: true, ...preview });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/campaigns', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { createCampaign } = await import('../services/whatsapp-campaigns.service.js');
    const campaign = await createCampaign({
      name: String(req.body?.name || ''),
      templateName: String(req.body?.templateName || ''),
      varMapping: Array.isArray(req.body?.varMapping) ? req.body.varMapping : [],
      segment: req.body?.segment || { type: 'all' },
      createdBy: (req as any).user?.displayName || '',
    });
    res.json({ success: true, campaign });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/campaigns', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const { listCampaigns } = await import('../services/whatsapp-campaigns.service.js');
    res.json({ success: true, campaigns: await listCampaigns() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaigns/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { campaignDetails } = await import('../services/whatsapp-campaigns.service.js');
    res.json({ success: true, ...(await campaignDetails(parseInt(req.params.id))) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/campaigns/:id/:action(pause|resume|stop)', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { setCampaignStatus } = await import('../services/whatsapp-campaigns.service.js');
    const map: any = { pause: 'paused', resume: 'running', stop: 'stopped' };
    await setCampaignStatus(parseInt(req.params.id), map[req.params.action]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📢 البث الجماعي — النوافذ المفتوحة (القرارات المعتمدة 2026-07-26)
// ══════════════════════════════════════════════════════

router.get('/broadcast/recipients', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { getOpenWindowRecipients, nearestUpcomingActivityName } = await import('../services/whatsapp-broadcast.service.js');
    const recipients = await getOpenWindowRecipients({
      linked: String(req.query.linked || 'all'),
      excludeAttention: req.query.excludeAttention === '1',
    });
    const activityName = await nearestUpcomingActivityName();
    res.json({ success: true, recipients, activityName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/broadcast', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { launchBroadcast } = await import('../services/whatsapp-broadcast.service.js');
    const { body, templateId, conversationIds } = req.body || {};
    const result = await launchBroadcast({
      body: String(body || ''),
      templateId: templateId ? parseInt(templateId) : null,
      conversationIds: Array.isArray(conversationIds) ? conversationIds.map((n: any) => parseInt(n)).filter(Boolean) : [],
      createdBy: (req as any).user?.displayName || '',
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/broadcast/:id/stop', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { stopBroadcast } = await import('../services/whatsapp-broadcast.service.js');
    stopBroadcast(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/broadcast/history', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const { getBroadcastHistory } = await import('../services/whatsapp-broadcast.service.js');
    const broadcasts = await getBroadcastHistory(20);
    res.json({ success: true, broadcasts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
