// ══════════════════════════════════════════════════════
// 📊 مسارات تحليلات اللاعبين — Player Analytics Routes (admin)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { authenticate, adminOnly, managerOrAbove } from '../middleware/auth.js';
import { getCache, refreshCache, getConfig, saveConfig, DEFAULT_CONFIG, METRIC_DEFS } from '../services/analytics.service.js';
import { getDB } from '../config/db.js';
import { playerFcmTokens } from '../schemas/notification.schema.js';
import { sendPushToPlayer } from '../services/fcm.service.js';
import { explore, listViews, addView, deleteView } from '../services/player-explorer.service.js';
import { loadOptions } from '../reports/options.js';

const router = Router();

// ── GET /players — المقاييس المُخزّنة (كاش) لكل اللاعبين ──
router.get('/players', authenticate, async (_req: Request, res: Response) => {
  try {
    const { payload, refreshedAt } = await getCache();
    res.json({ success: true, refreshedAt, generatedAt: payload.generatedAt, today: payload.today, players: payload.players || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /refresh — إعادة حساب الكاش يدويّاً (Admin) ──
router.post('/refresh', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const r = await refreshCache();
    res.json({ success: true, ...r });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /config — قواعد الشرائح + المقاييس المتاحة + الافتراضيّ ──
router.get('/config', authenticate, async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    res.json({ success: true, config, defaults: DEFAULT_CONFIG, metrics: METRIC_DEFS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /config — حفظ قواعد الشرائح (Admin) ──
router.put('/config', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const config = req.body?.config;
    if (!config || !Array.isArray(config.segments)) return res.status(400).json({ error: 'قواعد غير صالحة' });
    await saveConfig(config);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /notify — دفع رسالة تواصل كإشعار للاعب واحد (Admin) ──
// يتحقّق من وجود جهازٍ مسجّل نشط قبل الإرسال (نفس شرط ظهور الزرّ في الواجهة).
router.post('/notify', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.body?.playerId);
    const body = String(req.body?.body || '').trim();
    const title = String(req.body?.title || 'نادي المافيا').trim().slice(0, 120) || 'نادي المافيا';
    if (!Number.isFinite(playerId) || !body) return res.status(400).json({ error: 'playerId و body مطلوبان' });

    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    // تأكيد وجود جهازٍ مسجّل نشط (وإلّا لا فائدة من الإرسال)
    const [tok] = await db.select({ id: playerFcmTokens.id }).from(playerFcmTokens)
      .where(and(eq(playerFcmTokens.playerId, playerId), eq(playerFcmTokens.isActive, true))).limit(1);
    if (!tok) return res.status(400).json({ error: 'لا جهاز مسجّل في الإشعارات لهذا اللاعب' });

    // النقر على الإشعار يفتح صفحة الفعاليّات (تشجيعٌ على الحجز)
    await sendPushToPlayer(playerId, title, body.slice(0, 500), 'custom', { url: '/player/games' });
    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ analytics notify:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — استعلامٌ حيٌّ لا كاش
// الصفحة القديمة (/players أعلاه) تبقى على كاشها الليليّ بشرائحها وقواعدها؛
// هذه المسارات تخدم صفحةً مستقلّة تقرأ من قاعدة البيانات مباشرةً في كلّ طلب.
// ══════════════════════════════════════════════════════

// ── GET /explore — العدسة كـquery params → نتيجة حيّة ──
router.get('/explore', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const result = await explore(db, req.query);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('❌ analytics/explore:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /explore/options — مواقع + مواسم للمنتقيات ──
router.get('/explore/options', authenticate, managerOrAbove, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const [locations, seasons] = await Promise.all([
      loadOptions(db, 'locations'),
      loadOptions(db, 'seasons'),
    ]);
    res.json({ success: true, locations, seasons });
  } catch (err: any) {
    console.error('❌ analytics/explore/options:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── العدسات المحفوظة ──
router.get('/views', authenticate, managerOrAbove, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    res.json({ success: true, views: await listViews(db) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/views', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const views = await addView(db, req.body?.name, req.body?.lens ?? {}, req.user?.displayName);
    res.json({ success: true, views });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/views/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    res.json({ success: true, views: await deleteView(db, String(req.params.id)) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
