// ══════════════════════════════════════════════════════
// 🍽️ مسارات المنيو والطلبات — F&B Routes
// راوتران: venueRouter (/api/venue — حساب المكان) و playerFnbRouter (/api/fnb — تطبيق اللاعب)
// قرارات مقفلة: الطلب يتطلّب حجزاً · تسعير خادم بلقطات · حصّة نادي لكل صنف · د.أ
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, and, ne, desc, asc, isNull, inArray, gte, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { menuItems, orders, orderItems } from '../schemas/fnb.schema.js';
import { activities, bookings, locations, staff } from '../schemas/admin.schema.js';
import { sessions, sessionPlayers } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { authenticate, requireVenuePermission } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { sendPushToPlayer, sendPushToLocationStaff } from '../services/fcm.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ════════════════════════════════════════════
// 🏪 venueRouter — /api/venue (حسابات الأماكن + HQ)
// ════════════════════════════════════════════

export const venueRouter = Router();

// ── GET /me — هويّة الحساب: الدور والصلاحيّات والمكان المرتبط ──
// لأيّ موظّف مصادَق (بلا صلاحيّة محدّدة) — تبني عليه واجهة /venue القوائم والحراسة.
venueRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.select({
      id: staff.id, role: staff.role, displayName: staff.displayName,
      permissions: staff.permissions, isActive: staff.isActive, locationId: staff.locationId,
    }).from(staff).where(and(eq(staff.id, req.user!.id), isNull(staff.deletedAt))).limit(1);

    if (!row || row.isActive === false) return res.status(403).json({ error: 'الحساب غير نشط' });

    let location: { id: number; name: string } | null = null;
    if (row.locationId) {
      const [loc] = await db.select({ id: locations.id, name: locations.name })
        .from(locations).where(eq(locations.id, row.locationId)).limit(1);
      location = loc || null;
    }
    res.json({
      success: true,
      me: {
        id: row.id, role: row.role, displayName: row.displayName,
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
        location,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── رفع صورة صنف → uploads/menu ──
const MENU_MEDIA_DIR = path.resolve(process.cwd(), 'uploads/menu');
if (!fs.existsSync(MENU_MEDIA_DIR)) fs.mkdirSync(MENU_MEDIA_DIR, { recursive: true });

const menuImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MENU_MEDIA_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
      cb(null, `m${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB تكفي لصورة صنف
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (ok.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`صيغة غير مدعومة: ${file.mimetype} (المسموح: PNG/JPG/WEBP)`));
  },
});

venueRouter.post('/menu-items/upload-image', authenticate, requireVenuePermission('menu.manage'), (req: Request, res: Response) => {
  menuImageUpload.single('image')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'فشل رفع الصورة' });
    const f = (req as any).file;
    if (!f) return res.status(400).json({ error: 'لا يوجد ملف' });
    res.json({ success: true, url: `/uploads/menu/${f.filename}` });
  });
});

// يحلّ مكان الطلب: حساب المكان → مكانه الحصريّ؛ الأدمن/المدير → locationId من الطلب (إلزاميّ له)
function resolveVenueLocation(req: Request, res: Response): number | null {
  const locId = req.venueLocationId;
  if (!locId) {
    res.status(400).json({ error: 'حدّد المكان (locationId) — حساب الإدارة يخدم أكثر من مكان' });
    return null;
  }
  return locId;
}

// ── GET /menu-items — أصناف مكان الحساب (تشمل غير المتاحة، لا المحذوفة) ──
venueRouter.get('/menu-items', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const items = await db.select().from(menuItems)
      .where(and(eq(menuItems.locationId, locId), isNull(menuItems.deletedAt)))
      .orderBy(asc(menuItems.category), asc(menuItems.sortOrder), asc(menuItems.id));
    res.json({ success: true, items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// تحقّق مشترك لحقول الصنف — يعيد null مع ردّ 400 عند الخلل
function validateItemBody(body: any, res: Response): { name: string; price: string; clubShare: string } | null {
  const name = String(body.name || '').trim();
  if (!name || name.length > 150) { res.status(400).json({ error: 'اسم الصنف مطلوب (حتى 150 حرفاً)' }); return null; }
  const price = parseFloat(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 9999) { res.status(400).json({ error: 'سعر غير صالح' }); return null; }
  const clubShare = body.clubShare === undefined || body.clubShare === '' ? 0 : parseFloat(body.clubShare);
  if (!Number.isFinite(clubShare) || clubShare < 0 || clubShare > price) {
    res.status(400).json({ error: 'حصّة النادي يجب أن تكون بين 0 وسعر الصنف' }); return null;
  }
  return { name, price: price.toFixed(2), clubShare: clubShare.toFixed(2) };
}

// ── POST /menu-items — إضافة صنف ──
venueRouter.post('/menu-items', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const v = validateItemBody(req.body, res);
  if (!v) return;
  try {
    const [item] = await db.insert(menuItems).values({
      locationId: locId,
      category: String(req.body.category || '').trim().slice(0, 50),
      name: v.name,
      description: String(req.body.description || '').trim(),
      price: v.price,
      clubShare: v.clubShare,
      imageUrl: req.body.imageUrl ? String(req.body.imageUrl).slice(0, 500) : null,
      isAvailable: req.body.isAvailable !== false,
      sortOrder: Number.isFinite(parseInt(req.body.sortOrder)) ? parseInt(req.body.sortOrder) : 0,
    } as any).returning();
    res.json({ success: true, item });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PUT /menu-items/:id — تعديل صنف (ضمن مكان الحساب حصراً) ──
venueRouter.put('/menu-items/:id', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  const v = validateItemBody(req.body, res);
  if (!v) return;
  try {
    const [item] = await db.update(menuItems).set({
      category: String(req.body.category || '').trim().slice(0, 50),
      name: v.name,
      description: String(req.body.description || '').trim(),
      price: v.price,
      clubShare: v.clubShare,
      imageUrl: req.body.imageUrl ? String(req.body.imageUrl).slice(0, 500) : null,
      isAvailable: req.body.isAvailable !== false,
      sortOrder: Number.isFinite(parseInt(req.body.sortOrder)) ? parseInt(req.body.sortOrder) : 0,
    } as any).where(and(eq(menuItems.id, id), eq(menuItems.locationId, locId), isNull(menuItems.deletedAt))).returning();
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    res.json({ success: true, item });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /menu-items/:id/availability — تبديل الإتاحة سريعاً ──
venueRouter.patch('/menu-items/:id/availability', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  try {
    const [item] = await db.update(menuItems).set({ isAvailable: req.body.isAvailable === true } as any)
      .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locId), isNull(menuItems.deletedAt))).returning();
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    res.json({ success: true, item });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /menu-items/:id — حذف ناعم (الطلبات القديمة تحتفظ بلقطاتها) ──
venueRouter.delete('/menu-items/:id', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  try {
    const [item] = await db.update(menuItems).set({ deletedAt: new Date() } as any)
      .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locId), isNull(menuItems.deletedAt))).returning();
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════
// 📥 صندوق طلبات المكان — /api/venue/orders
// ════════════════════════════════════════════

const ORDERS_LOOKBACK_HOURS = 24;

// ── GET /orders — طلبات المكان (آخر 24 ساعة افتراضاً، أو فعاليّة محدّدة) ──
venueRouter.get('/orders', authenticate, requireVenuePermission('orders.receive'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(String(req.query.activityId || ''));
  try {
    const conds = [eq(orders.locationId, locId)];
    if (Number.isFinite(activityId)) conds.push(eq(orders.activityId, activityId));
    else conds.push(gte(orders.createdAt, new Date(Date.now() - ORDERS_LOOKBACK_HOURS * 3600_000)));

    const rows = await db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(300);
    const orderIds = rows.map(o => o.id);
    const items = orderIds.length > 0
      ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : [];
    const actIds = [...new Set(rows.map(o => o.activityId))];
    const acts = actIds.length > 0
      ? await db.select({ id: activities.id, name: activities.name }).from(activities).where(inArray(activities.id, actIds))
      : [];
    const actName = new Map(acts.map(a => [a.id, a.name]));

    res.json({
      success: true,
      orders: rows.map(o => ({
        id: o.id, status: o.status, total: o.total, note: o.note, createdAt: o.createdAt,
        playerName: o.playerName, physicalId: o.physicalId,
        activityId: o.activityId, activityName: actName.get(o.activityId) || '',
        items: items.filter(i => i.orderId === o.id).map(i => ({
          name: i.nameSnapshot, unitPrice: i.unitPriceSnapshot, quantity: i.quantity,
        })),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// انتقالات الحالة المسموحة للمكان
const STATUS_FLOW: Record<string, string[]> = {
  new: ['preparing', 'delivered', 'cancelled'],
  preparing: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const PLAYER_STATUS_PUSH: Record<string, { title: string; body: (loc: string) => string }> = {
  preparing: { title: '👨‍🍳 طلبك قيد التحضير', body: (loc) => `بدأ ${loc} بتحضير طلبك` },
  delivered: { title: '✅ تمّ تسليم طلبك', body: (loc) => `سلّمك ${loc} طلبك — بالهناء!` },
  cancelled: { title: '✖️ أُلغي طلبك', body: (loc) => `ألغى ${loc} طلبك — راجعهم إن كان ذلك غير متوقّع` },
};

// ── PUT /orders/:id/status — تغيير حالة الطلب (تحضير/تسليم/إلغاء) ──
venueRouter.put('/orders/:id/status', authenticate, requireVenuePermission('orders.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  const status = String(req.body.status || '');
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  if (!['preparing', 'delivered', 'cancelled'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
  try {
    const [existing] = await db.select().from(orders)
      .where(and(eq(orders.id, id), eq(orders.locationId, locId))).limit(1);
    if (!existing) return res.status(404).json({ error: 'الطلب غير موجود' });
    if (!STATUS_FLOW[existing.status]?.includes(status)) {
      return res.status(400).json({ error: `لا يمكن الانتقال من «${existing.status}» إلى «${status}»` });
    }

    const [updated] = await db.update(orders).set({
      status, statusChangedBy: req.venueStaff!.id, statusChangedAt: new Date(),
    } as any).where(eq(orders.id, id)).returning();

    // بثّ لحظيّ لبقيّة أجهزة المكان
    const io = req.app.get('io');
    if (io) io.to(`location:${locId}`).emit('fnb:order-updated', { orderId: id, status, activityId: existing.activityId });

    // إشعار اللاعب بحالة طلبه (بوش + جرس)
    const push = PLAYER_STATUS_PUSH[status];
    if (push) {
      const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, locId)).limit(1);
      sendPushToPlayer(existing.playerId, push.title, push.body(loc?.name || 'المكان'), 'order_status', {
        url: '/player/order', orderId: String(id), status,
      }).catch(err => console.error('❌ order_status push:', err.message));
    }

    res.json({ success: true, order: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════
// 📱 playerFnbRouter — /api/fnb (تطبيق اللاعب)
// ════════════════════════════════════════════

export const playerFnbRouter = Router();

// نافذة الطلب حول موعد الفعاليّة: من ساعةٍ قبل الموعد حتى 12 ساعة بعده (ما لم تكتمل/تُلغَ)
const ORDER_WINDOW_BEFORE_MS = 60 * 60 * 1000;
const ORDER_WINDOW_AFTER_MS = 12 * 60 * 60 * 1000;

interface FnbContext {
  activityId: number;
  activityName: string;
  activityDate: Date;
  locationId: number;
  locationName: string;
  bookingId: number;
  sessionId: number | null;
  physicalId: number | null;
  source: 'live' | 'booking';
}

// يحلّ «أين اللاعب الآن؟» — القرار المقفل ٥: داخل غرفة حيّة، أو حاجزٌ ضمن نافذة الفعاليّة.
// الحجز شرطٌ في الحالتين (القرار ٣): بلا حجزٍ لا طلب حتى داخل الغرفة.
async function resolveFnbContext(db: NonNullable<ReturnType<typeof getDB>>, playerId: number): Promise<FnbContext | { error: string } | null> {
  const now = Date.now();

  // حجوزات اللاعب لفعاليّات مفعَّلة المنيو ضمن النافذة الزمنيّة
  const bookingRows = await db.select({
    bookingId: bookings.id,
    activityId: activities.id,
    activityName: activities.name,
    activityDate: activities.date,
    activityStatus: activities.status,
    locationId: activities.locationId,
  }).from(bookings)
    .innerJoin(activities, eq(bookings.activityId, activities.id))
    .where(and(
      eq(bookings.playerId, playerId),
      isNull(bookings.deletedAt),
      isNull(activities.deletedAt),
      eq(activities.menuOrderingEnabled, true),
      gte(activities.date, new Date(now - ORDER_WINDOW_AFTER_MS)),
    ))
    .orderBy(asc(activities.date));

  const inWindow = bookingRows.filter(b =>
    b.activityStatus !== 'completed' && b.activityStatus !== 'cancelled' &&
    b.locationId != null &&
    b.activityDate.getTime() - ORDER_WINDOW_BEFORE_MS <= now
  );

  // (أ) غرفة حيّة: جلسة نشطة مرتبطة بإحدى فعاليّات اللاعب المحجوزة
  const bookedActIds = inWindow.map(b => b.activityId);
  let live: { sessionId: number; physicalId: number; activityId: number } | null = null;
  if (bookedActIds.length > 0) {
    const liveRows = await db.select({
      sessionId: sessions.id,
      physicalId: sessionPlayers.physicalId,
      activityId: sessions.activityId,
    }).from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        eq(sessions.status, 'active'),
        isNull(sessions.deletedAt),
        inArray(sessions.activityId, bookedActIds),
      ))
      .orderBy(desc(sessionPlayers.joinedAt))
      .limit(1);
    if (liveRows.length > 0 && liveRows[0].activityId != null) {
      live = { sessionId: liveRows[0].sessionId, physicalId: liveRows[0].physicalId, activityId: liveRows[0].activityId };
    }
  }

  const chosen = live ? inWindow.find(b => b.activityId === live!.activityId)! : inWindow[0];
  if (!chosen) {
    // لاعب داخل غرفة حيّة لفعاليّة مفعَّلة لكن بلا حجز؟ → رسالة أوضح من «لا شيء»
    const liveNoBooking = await db.select({ actId: sessions.activityId })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        eq(sessions.status, 'active'),
        isNull(sessions.deletedAt),
        eq(activities.menuOrderingEnabled, true),
      )).limit(1);
    if (liveNoBooking.length > 0) return { error: 'الطلب متاح للحاجزين فقط — لا يوجد حجز باسمك لهذه الفعاليّة' };
    return null;
  }

  const [loc] = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(eq(locations.id, chosen.locationId!)).limit(1);
  if (!loc) return null;

  return {
    activityId: chosen.activityId,
    activityName: chosen.activityName,
    activityDate: chosen.activityDate,
    locationId: loc.id,
    locationName: loc.name,
    bookingId: chosen.bookingId,
    sessionId: live?.sessionId ?? null,
    physicalId: live?.physicalId ?? null,
    source: live ? 'live' : 'booking',
  };
}

// ── GET /context — هل للّاعب سياق طلبٍ الآن؟ ──
playerFnbRouter.get('/context', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const ctx = await resolveFnbContext(db, req.playerAccount!.playerId);
    if (!ctx) return res.json({ success: true, context: null });
    if ('error' in ctx) return res.json({ success: true, context: null, reason: ctx.error });
    res.json({ success: true, context: ctx });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /menu — منيو مكان الفعاليّة (المتاح فقط، بلا حصّة النادي) ──
playerFnbRouter.get('/menu', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const activityId = parseInt(String(req.query.activityId || ''));
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'activityId مطلوب' });
  try {
    const [act] = await db.select({ id: activities.id, locationId: activities.locationId, enabled: activities.menuOrderingEnabled })
      .from(activities).where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);
    if (!act || !act.enabled || !act.locationId) return res.status(404).json({ error: 'المنيو غير متاح لهذه الفعاليّة' });

    const items = await db.select({
      id: menuItems.id, category: menuItems.category, name: menuItems.name,
      description: menuItems.description, price: menuItems.price, imageUrl: menuItems.imageUrl,
    }).from(menuItems)
      .where(and(eq(menuItems.locationId, act.locationId), eq(menuItems.isAvailable, true), isNull(menuItems.deletedAt)))
      .orderBy(asc(menuItems.category), asc(menuItems.sortOrder), asc(menuItems.id));
    res.json({ success: true, items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

const MAX_OPEN_ORDERS_PER_ACTIVITY = 10;
const MAX_ITEMS_PER_ORDER = 30;

// ── POST /orders — إنشاء طلب (تسعير خادم + لقطات، الحجز إلزاميّ) ──
playerFnbRouter.post('/orders', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = req.playerAccount!.playerId;

  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (rawItems.length === 0) return res.status(400).json({ error: 'أضف صنفاً واحداً على الأقلّ' });
  if (rawItems.length > MAX_ITEMS_PER_ORDER) return res.status(400).json({ error: 'عدد بنود الطلب كبير جدّاً' });

  // تطبيع البنود ودمج المكرَّر
  const qtyById = new Map<number, number>();
  for (const it of rawItems) {
    const id = parseInt(it?.menuItemId);
    const qty = parseInt(it?.quantity);
    if (!Number.isFinite(id) || !Number.isFinite(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ error: 'بند غير صالح (الكمّية 1-20)' });
    }
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }

  try {
    const ctx = await resolveFnbContext(db, playerId);
    if (!ctx) return res.status(403).json({ error: 'لا يوجد نشاط متاح للطلب الآن' });
    if ('error' in ctx) return res.status(403).json({ error: ctx.error });

    // سقف الطلبات المفتوحة لكل لاعب لكل فعاليّة (حماية من الإغراق)
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(orders)
      .where(and(eq(orders.playerId, playerId), eq(orders.activityId, ctx.activityId), ne(orders.status, 'cancelled')));
    if (cnt >= MAX_OPEN_ORDERS_PER_ACTIVITY) {
      return res.status(429).json({ error: 'وصلت حدّ الطلبات لهذه الفعاليّة — راجع المكان' });
    }

    // التسعير من قاعدة البيانات حصراً (لا نثق بأسعار العميل)
    const ids = [...qtyById.keys()];
    const dbItems = await db.select().from(menuItems)
      .where(and(inArray(menuItems.id, ids), eq(menuItems.locationId, ctx.locationId), eq(menuItems.isAvailable, true), isNull(menuItems.deletedAt)));
    if (dbItems.length !== ids.length) {
      return res.status(400).json({ error: 'بعض الأصناف لم تعد متاحة — حدّث المنيو وأعد المحاولة' });
    }

    const [playerRow] = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
    const total = dbItems.reduce((s, m) => s + parseFloat(m.price) * qtyById.get(m.id)!, 0);
    const note = String(req.body.note || '').trim().slice(0, 300);

    const order = await db.transaction(async (tx) => {
      const [o] = await tx.insert(orders).values({
        activityId: ctx.activityId,
        locationId: ctx.locationId,
        playerId,
        playerName: playerRow?.name || 'لاعب',
        bookingId: ctx.bookingId,
        sessionId: ctx.sessionId,
        physicalId: ctx.physicalId,
        status: 'new',
        total: total.toFixed(2),
        note,
      } as any).returning();
      await tx.insert(orderItems).values(dbItems.map(m => ({
        orderId: o.id,
        menuItemId: m.id,
        nameSnapshot: m.name,
        unitPriceSnapshot: m.price,
        clubShareSnapshot: m.clubShare || '0',
        quantity: qtyById.get(m.id)!,
      })) as any);
      return o;
    });

    // 📥 إشعار المكان الفوريّ: بثّ لغرفة location:{id} + بوش لحسابات المكان المصرَّح لها
    const emittedItems = dbItems.map(m => ({ name: m.name, unitPrice: m.price, quantity: qtyById.get(m.id)! }));
    const io = req.app.get('io');
    if (io) {
      io.to(`location:${ctx.locationId}`).emit('fnb:new-order', {
        order: {
          id: order.id, status: order.status, total: order.total, note: order.note, createdAt: order.createdAt,
          playerName: order.playerName, physicalId: order.physicalId,
          activityId: ctx.activityId, activityName: ctx.activityName,
          items: emittedItems,
        },
      });
    }
    const summary = emittedItems.map(i => `${i.name} ×${i.quantity}`).join('، ');
    sendPushToLocationStaff(ctx.locationId, 'orders.receive',
      `🍽️ طلب جديد من ${order.playerName}`,
      `${summary} — ${total.toFixed(2)} د.أ${note ? ` • ${note}` : ''}`,
      'new_order', { url: '/venue/orders', orderId: String(order.id) },
    ).catch(err => console.error('❌ new_order push:', err.message));

    res.json({ success: true, order });
  } catch (err: any) {
    console.error('❌ fnb create order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /my-orders?activityId= — طلبات اللاعب لهذه الفعاليّة مع بنودها ──
playerFnbRouter.get('/my-orders', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = req.playerAccount!.playerId;
  const activityId = parseInt(String(req.query.activityId || ''));
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'activityId مطلوب' });
  try {
    const myOrders = await db.select().from(orders)
      .where(and(eq(orders.playerId, playerId), eq(orders.activityId, activityId)))
      .orderBy(desc(orders.createdAt));
    const orderIds = myOrders.map(o => o.id);
    const items = orderIds.length > 0
      ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : [];
    res.json({
      success: true,
      orders: myOrders.map(o => ({
        id: o.id, status: o.status, total: o.total, note: o.note, createdAt: o.createdAt,
        items: items.filter(i => i.orderId === o.id).map(i => ({
          name: i.nameSnapshot, unitPrice: i.unitPriceSnapshot, quantity: i.quantity,
        })),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /orders/:id/cancel — إلغاء طلبه ما دام «جديداً» (لم يبدأ التحضير) ──
playerFnbRouter.post('/orders/:id/cancel', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = req.playerAccount!.playerId;
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try {
    const [o] = await db.update(orders).set({ status: 'cancelled', statusChangedAt: new Date() } as any)
      .where(and(eq(orders.id, id), eq(orders.playerId, playerId), eq(orders.status, 'new')))
      .returning();
    if (!o) return res.status(400).json({ error: 'لا يمكن إلغاء الطلب — بدأ تحضيره أو غير موجود' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
