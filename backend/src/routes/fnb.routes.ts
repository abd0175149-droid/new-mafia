// ══════════════════════════════════════════════════════
// 🍽️ مسارات المنيو والطلبات — F&B Routes
// راوتران: venueRouter (/api/venue — حساب المكان) و playerFnbRouter (/api/fnb — تطبيق اللاعب)
// قرارات مقفلة: الطلب يتطلّب حجزاً · تسعير خادم بلقطات · حصّة نادي لكل صنف · د.أ
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, and, ne, desc, asc, isNull, inArray, gte, lte, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { menuItems, orders, orderItems, orderInvoices, menuCategories, menuOptionGroups, menuOptionValues, serviceRequests } from '../schemas/fnb.schema.js';
import { activities, bookings, locations, staff } from '../schemas/admin.schema.js';
import { sessions, sessionPlayers } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { staffFcmTokens } from '../schemas/notification.schema.js';
import { authenticate, requireVenuePermission } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { sendPushToPlayer, sendPushToLocationStaff, sendPushToAdmins } from '../services/fcm.service.js';
import { buildInvoiceData, issueInvoiceNumber, invoiceHtml, mergeInvoicePages, playersWhoPlayed, waterItemOf } from '../services/fnb-invoice.service.js';
import { resolveOptionGroups, validateSelections, type ChosenOption } from '../services/fnb-options.service.js';
import { readSlots, slotItemIds, validateSlotsInput, resolveOrderSlots } from '../services/fnb-bundle.service.js';
import { gateCheck, saveLastFix, isUsableFix } from '../services/geofence.service.js';
import { renderRawHtmlPdf } from '../reports/render/pdf.js';
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

// ── GET /push-status — من سيصله إشعار الطلب فعلاً؟ ──
// 🔇 ينهي الفشل الصامت: حسابٌ بلا جهازٍ مسجّل كان يبتلع الإشعار بلا أثر،
// فيظنّ المكان أنّ النظام يعمل وهو معطّل. هنا يُرى الواقع بالأرقام.
// ════════════════════════════════════════
// 📍 موقع المكان — نقطة السياج ونصف قطره
// 🔴 من يقف على الباب هو من يضبط النقطة — لا رابط الخرائط: الرابط
//    يحمل زوجَي إحداثيّات (مركز العرض والدبّوس) يفترقان ٢٤٥ متراً في أحد
//    مكانينا. وحساب المكان مثبَّت على staff.locationId في resolveVenueLocation،
//    فلا يستطيع أحدٌ ضبط دبّوس مكانٍ آخر ولو حاول.
// ════════════════════════════════════════
venueRouter.get('/location', authenticate, requireVenuePermission('location.geofence'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const [row] = await db.select({
      id: locations.id, name: locations.name, region: locations.region, mapUrl: locations.mapUrl,
      latitude: locations.latitude, longitude: locations.longitude,
      geofenceRadiusM: locations.geofenceRadiusM,
      geofenceSetBy: locations.geofenceSetBy, geofenceSetAt: locations.geofenceSetAt,
    }).from(locations).where(eq(locations.id, locId)).limit(1);
    if (!row) return res.status(404).json({ error: 'المكان غير موجود' });

    let setByName = '';
    if (row.geofenceSetBy) {
      const [s] = await db.select({ n: staff.displayName }).from(staff).where(eq(staff.id, row.geofenceSetBy)).limit(1);
      setByName = s?.n || '';
    }
    res.json({ success: true, location: { ...row, setByName } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

venueRouter.put('/location', authenticate, requireVenuePermission('location.geofence'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;

  const lat = parseFloat(String(req.body?.latitude));
  const lng = parseFloat(String(req.body?.longitude));
  const radius = parseInt(String(req.body?.geofenceRadiusM));

  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return res.status(400).json({ error: 'خطّ العرض غير صالح' });
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return res.status(400).json({ error: 'خطّ الطول غير صالح' });
  // أقلّ من ٥٠م يرفض جالساً على الطاولة (دقّة GPS داخل مقهىً وحدها تتجاوزه)،
  // وأكثر من ٢ كم يفقد السياج معناه.
  if (!Number.isFinite(radius) || radius < 50 || radius > 2000) {
    return res.status(400).json({ error: 'نصف القطر بين ٥٠ و٢٠٠٠ متر' });
  }

  try {
    await db.update(locations).set({
      latitude: String(lat), longitude: String(lng), geofenceRadiusM: radius,
      geofenceSetBy: req.venueStaff!.id, geofenceSetAt: new Date(),
    } as any).where(eq(locations.id, locId));
    res.json({ success: true, latitude: lat, longitude: lng, geofenceRadiusM: radius });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

venueRouter.get('/push-status', authenticate, requireVenuePermission('orders.receive'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const accounts = await db.select({
      id: staff.id, displayName: staff.displayName, permissions: staff.permissions,
    }).from(staff).where(and(
      eq(staff.locationId, locId),
      eq(staff.role, 'location_owner' as any),
      eq(staff.isActive, true),
      isNull(staff.deletedAt),
    ));

    const ids = accounts.map(a => a.id);
    const toks = ids.length > 0
      ? await db.select({ staffId: staffFcmTokens.staffId, token: staffFcmTokens.fcmToken })
          .from(staffFcmTokens)
          .where(and(inArray(staffFcmTokens.staffId, ids), eq(staffFcmTokens.isActive, true)))
      : [];

    const rows = accounts
      .filter(a => (Array.isArray(a.permissions) ? a.permissions as string[] : []).includes('orders.receive'))
      .map(a => {
        const mine = toks.filter(t => t.staffId === a.id);
        return {
          staffId: a.id,
          displayName: a.displayName,
          devices: mine.length,
          // WEBPUSH:: = آيفون/سفاري · وغيره توكن FCM (أندرويد/سطح مكتب)
          ios: mine.filter(t => t.token.startsWith('WEBPUSH::')).length,
          other: mine.filter(t => !t.token.startsWith('WEBPUSH::')).length,
        };
      });

    res.json({
      success: true,
      accounts: rows,
      totalDevices: rows.reduce((s, r) => s + r.devices, 0),
      accountsWithoutDevice: rows.filter(r => r.devices === 0).length,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /room-attendance — من في الغرفة الحيّة الآن، ومَن منهم لم يطلب بعد ──
// 👥 لوحة «في الغرفة» في شاشة الطلبات: كلّ جالسٍ في غرفةٍ حيّة لفعاليّةٍ
//    مفعَّل منيوها بهذا المكان، مع عدد طلباته ومجموعها — صفرٌ يعني أنّ
//    الموظّف يذهب إليه ويذكّره. الجلوس من session_players والطلبات بالحساب.
venueRouter.get('/room-attendance', authenticate, requireVenuePermission('orders.receive'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const rooms = await db.select({
      sessionId: sessions.id, activityId: activities.id, activityName: activities.name,
    }).from(sessions)
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .where(and(
        eq(sessions.status, 'active'), liveSessionFresh(), isNull(sessions.deletedAt),
        eq(activities.locationId, locId), isNull(activities.deletedAt),
        ne(activities.status, 'cancelled'), eq(activities.menuOrderingEnabled, true),
      ));
    if (rooms.length === 0) return res.json({ success: true, rooms: [] });

    const out = [];
    for (const r of rooms) {
      const seats = await db.select({
        physicalId: sessionPlayers.physicalId, playerName: sessionPlayers.playerName,
        playerId: sessionPlayers.playerId, joinedAt: sessionPlayers.joinedAt,
      }).from(sessionPlayers).where(eq(sessionPlayers.sessionId, r.sessionId));

      // إعادة دخولٍ بنفس المقعد تترك صفّين — الأحدث جلوساً هو الصادق
      const bySeat = new Map<number, typeof seats[number]>();
      for (const s of seats) {
        const prev = bySeat.get(s.physicalId);
        if (!prev || new Date(s.joinedAt) > new Date(prev.joinedAt)) bySeat.set(s.physicalId, s);
      }

      const pids = [...bySeat.values()].map(s => s.playerId).filter(Boolean) as number[];
      const sums = pids.length > 0
        ? await db.select({
            playerId: orders.playerId,
            cnt: sql<number>`count(*)::int`,
            total: sql<string>`sum(${orders.total})::text`,
          }).from(orders).where(and(
            eq(orders.activityId, r.activityId), eq(orders.locationId, locId),
            ne(orders.status, 'cancelled'), inArray(orders.playerId, pids),
          )).groupBy(orders.playerId)
        : [];
      const sumByPlayer = new Map(sums.map(s => [s.playerId, s]));

      out.push({
        activityId: r.activityId,
        activityName: r.activityName,
        players: [...bySeat.values()].map(s => ({
          physicalId: s.physicalId,
          playerName: s.playerName,
          joinedAt: s.joinedAt,
          ordersCount: s.playerId ? (sumByPlayer.get(s.playerId)?.cnt ?? 0) : 0,
          ordersTotal: s.playerId ? parseFloat(sumByPlayer.get(s.playerId)?.total || '0') : 0,
        })),
      });
    }
    res.json({ success: true, rooms: out });
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

const MAX_BUNDLE_COMPONENTS = 12;

// ⏳ عمرٌ أقصى للجلسة كي تُعدّ «حيّة».
// 🔴 `status='active'` وحدها لا تكفي: الجلسة لا تُغلق تلقائيّاً عند انتهاء الليلة،
//    فتبقى نشطةً إلى الغد. ولمّا كان فرع «الغرفة الحيّة» في resolveFnbContext بلا
//    شرطٍ زمنيّ (عمداً — كي لا تُحرَم غرفةٌ بدأت قبل موعدها)، كانت جلسة الأمس تلتقط
//    طلب اليوم فيُكتب على **فعاليّة الأمس**. والفوترة تُجمَّع بـ activityId حصراً،
//    فيسقط الطلب من فاتورة الليلة ويضيع ثمنه على المكان. حدث فعلاً: الطلب 232.
//    ١٨ ساعة أوسع من أطول ليلةٍ ممكنة بمرّات، فلا تُستبعد جلسةٌ حيّة أبداً.
const LIVE_SESSION_MAX_AGE_MS = 18 * 3600_000;
const liveSessionFresh = () => gte(sessions.createdAt, new Date(Date.now() - LIVE_SESSION_MAX_AGE_MS));

// يتحقّق أنّ القسم ومجموعات الخيارات تخصّ هذا المكان — ومنعُ ربطِ مجموعةِ مكانٍ
// آخر ليس تجميلاً: الأسعار والفروق تُقرأ منها عند كلّ طلب.
async function validateLinks(
  db: NonNullable<ReturnType<typeof getDB>>, body: any, locId: number, res: Response,
): Promise<{ categoryId: number | null; optionGroupIds: number[] } | null> {
  const rawCat = parseInt(body.categoryId);
  let categoryId: number | null = Number.isFinite(rawCat) ? rawCat : null;
  if (categoryId !== null) {
    const [c] = await db.select({ id: menuCategories.id }).from(menuCategories)
      .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.locationId, locId), isNull(menuCategories.deletedAt))).limit(1);
    if (!c) { res.status(400).json({ error: 'القسم غير موجود في مكانك' }); return null; }
  }

  const ids = [...new Set((Array.isArray(body.optionGroupIds) ? body.optionGroupIds : [])
    .map((x: any) => parseInt(x)).filter(Number.isFinite))] as number[];
  if (ids.length > 0) {
    const rows = await db.select({ id: menuOptionGroups.id }).from(menuOptionGroups)
      .where(and(inArray(menuOptionGroups.id, ids), eq(menuOptionGroups.locationId, locId), isNull(menuOptionGroups.deletedAt)));
    if (rows.length !== ids.length) { res.status(400).json({ error: 'بعض مجموعات الخيارات غير موجودة في مكانك' }); return null; }
  }
  return { categoryId, optionGroupIds: ids };
}

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

// 🎁 تحقّق تركيبة الباقة — أصنافٌ فعليّة من نفس المكان، غير محذوفة، وغير باقاتٍ نفسها (لا تعشيش).
// يعيد التركيبة المطبَّعة، أو null بعد أن يردّ 400. صنفٌ عاديّ (isBundle=false) يعيد [] دائماً.
async function validateBundleBody(
  db: NonNullable<ReturnType<typeof getDB>>, body: any, locId: number, selfId: number | null, res: Response,
): Promise<{ isBundle: boolean; bundleItems: any[] } | null> {
  if (body.isBundle !== true) return { isBundle: false, bundleItems: [] };

  // كلّ صنفٍ قد تشير إليه خانة — ثابتاً كان أو أحد خيارات خانة اختيار
  const slots = readSlots(body.bundleItems);
  const ids = slotItemIds(slots);
  if (ids.length === 0) { res.status(400).json({ error: 'الباقة تحتاج خانةً واحدة على الأقلّ' }); return null; }

  const rows = await db.select({ id: menuItems.id, isBundle: menuItems.isBundle }).from(menuItems)
    .where(and(inArray(menuItems.id, ids), eq(menuItems.locationId, locId), isNull(menuItems.deletedAt)));
  const simple = new Set(rows.filter(r => r.isBundle !== true).map(r => r.id));

  // 🔴 منع التعشيش من الجهة الثانية (TOCTOU): صنفٌ بسيطٌ مكوّنٌ في باقةٍ حيّة
  //    يتحوّل باقةً عبر PUT — ففي داخل الباقة الأولى باقةٌ لا تُحلّ خاناتها
  //    وقت الطلب وتصل تذكرة المطبخ باسمٍ بلا تركيبة
  if (selfId !== null) {
    const others = await db.select({ name: menuItems.name, bundleItems: menuItems.bundleItems }).from(menuItems)
      .where(and(eq(menuItems.locationId, locId), eq(menuItems.isBundle, true), isNull(menuItems.deletedAt), ne(menuItems.id, selfId)));
    const host = others.find(o => slotItemIds(readSlots(o.bundleItems)).includes(selfId));
    if (host) {
      res.status(400).json({ error: `الصنف مكوّنٌ في باقة «${host.name}» — أزِله منها قبل تحويله باقةً` });
      return null;
    }
  }

  try {
    // التحقّق نفسه يخدم الشكلين — والباقات القديمة تمرّ منه بلا ترحيل
    return { isBundle: true, bundleItems: validateSlotsInput(body.bundleItems, selfId, (id) => simple.has(id)) };
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'خانةٌ غير صالحة' });
    return null;
  }
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
    const b = await validateBundleBody(db, req.body, locId, null, res);
    if (!b) return;
    const links = await validateLinks(db, req.body, locId, res);
    if (!links) return;
    const [item] = await db.insert(menuItems).values({
      categoryId: links.categoryId,
      // 🎁 الباقة خياراتها في خاناتها — مجموعةٌ على الباقة نفسها لا يجمعها
      //    مُهيّئ العميل فيرفض الخادم كلّ طلبٍ لها (باقة معروضة غير قابلة للطلب)
      optionGroupIds: b.isBundle ? [] : links.optionGroupIds,
      ...(b.isBundle ? { customOptions: [] } : {}),
      locationId: locId,
      category: String(req.body.category || '').trim().slice(0, 50),
      name: v.name,
      description: String(req.body.description || '').trim(),
      price: v.price,
      clubShare: v.clubShare,
      imageUrl: req.body.imageUrl ? String(req.body.imageUrl).slice(0, 500) : null,
      isAvailable: req.body.isAvailable !== false,
      sortOrder: Number.isFinite(parseInt(req.body.sortOrder)) ? parseInt(req.body.sortOrder) : 0,
      isBundle: b.isBundle,
      bundleItems: b.bundleItems,
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
    const b = await validateBundleBody(db, req.body, locId, id, res);
    if (!b) return;
    const links = await validateLinks(db, req.body, locId, res);
    if (!links) return;
    // صنفٌ عاديّ لا يجوز أن يصبح عاديّاً وهو مكوّنٌ داخل باقة؟ مسموح — الباقة تحفظ لقطتها لحظة الطلب.
    const [item] = await db.update(menuItems).set({
      categoryId: links.categoryId,
      // 🎁 نفس قاعدة الإدراج: باقةٌ بلا مجموعات خياراتٍ على نفسها
      ...(b.isBundle ? { optionGroupIds: [], customOptions: [] } : { optionGroupIds: links.optionGroupIds }),
      category: String(req.body.category || '').trim().slice(0, 50),
      name: v.name,
      description: String(req.body.description || '').trim(),
      price: v.price,
      clubShare: v.clubShare,
      imageUrl: req.body.imageUrl ? String(req.body.imageUrl).slice(0, 500) : null,
      isAvailable: req.body.isAvailable !== false,
      sortOrder: Number.isFinite(parseInt(req.body.sortOrder)) ? parseInt(req.body.sortOrder) : 0,
      isBundle: b.isBundle,
      bundleItems: b.bundleItems,
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
    // 🔴 مكوّن باقةٍ حيّة لا يُحذف: العرض يخفيه لكنّ خانات الباقة المخزّنة تطالب
    //    به وقت الطلب — فتصير الباقة معروضةً وكلّ طلبٍ لها يفشل. عدّل الباقة أوّلاً.
    const liveBundles = await db.select({ name: menuItems.name, bundleItems: menuItems.bundleItems }).from(menuItems)
      .where(and(eq(menuItems.locationId, locId), eq(menuItems.isBundle, true), isNull(menuItems.deletedAt)));
    const host = liveBundles.find(bb => slotItemIds(readSlots(bb.bundleItems)).includes(id));
    if (host) return res.status(400).json({ error: `الصنف مكوّنٌ في باقة «${host.name}» — عدّل الباقة أو احذفها أوّلاً` });

    const [item] = await db.update(menuItems).set({ deletedAt: new Date() } as any)
      .where(and(eq(menuItems.id, id), eq(menuItems.locationId, locId), isNull(menuItems.deletedAt))).returning();
    if (!item) return res.status(404).json({ error: 'الصنف غير موجود' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /menu-items/bulk-club-share — ضبط حصّة النادي على دفعةٍ من الأصناف ──
// 💰 لماذا مسارٌ خاصّ: الحصّة رقمُ عملٍ يُتّفق عليه مع المكان ويتغيّر بالتفاوض،
//    وضبطه صنفاً صنفاً على منيو ٧٠ صنفاً عملٌ يُؤجَّل فلا يُنجَز — فتُشغَّل
//    ليلةٌ كاملة بحصّةٍ صفر. هنا يُضبط لكلّ المنيو أو لقسمٍ واحد بضغطة.
// وضعان: مبلغٌ ثابت لكلّ صنف، أو نسبةٌ من سعره تُقرَّب لأقرب قرش.
// 🔒 السقف مفروضٌ صنفاً صنفاً: حصّةٌ تتجاوز السعر تعني مكاناً يدفع للنادي.
venueRouter.post('/menu-items/bulk-club-share', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;

  const mode = req.body.mode === 'percent' ? 'percent' : 'fixed';
  const value = parseFloat(req.body.value);
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: 'القيمة غير صالحة' });
  if (mode === 'percent' && value > 100) return res.status(400).json({ error: 'النسبة لا تتجاوز ١٠٠٪' });

  // قسمٌ بعينه أو كامل المنيو. القسم الأب يشمل فروعه — وإلّا كان اختيار
  // «المأكولات» يصيب صفر صنفٍ لأنّ الأصناف معلَّقة على الفروع لا على الأب.
  const rawCat = req.body.categoryId;
  const categoryId = rawCat === undefined || rawCat === null || rawCat === '' ? null : parseInt(String(rawCat));
  if (categoryId !== null && !Number.isFinite(categoryId)) return res.status(400).json({ error: 'قسمٌ غير صالح' });

  try {
    let catIds: number[] | null = null;
    if (categoryId !== null) {
      const cats = await db.select({ id: menuCategories.id, parentId: menuCategories.parentId })
        .from(menuCategories).where(and(eq(menuCategories.locationId, locId), isNull(menuCategories.deletedAt)));
      if (!cats.some(c => c.id === categoryId)) return res.status(404).json({ error: 'القسم غير موجود' });
      catIds = [categoryId, ...cats.filter(c => c.parentId === categoryId).map(c => c.id)];
    }

    const rows = await db.select({ id: menuItems.id, price: menuItems.price, categoryId: menuItems.categoryId })
      .from(menuItems)
      .where(and(eq(menuItems.locationId, locId), isNull(menuItems.deletedAt)));
    const targets = rows.filter(r => !catIds || (r.categoryId !== null && catIds.includes(r.categoryId)));

    let changed = 0, capped = 0;
    for (const r of targets) {
      const price = parseFloat(r.price);
      let share = mode === 'percent' ? (price * value) / 100 : value;
      // التقريب قبل السقف: نسبةٌ تُنتج 2.996 على سعر 3.00 تُقرَّب إلى 3.00 لا تُقصّ
      share = Math.round(share * 100) / 100;
      if (share > price) { share = price; capped++; }
      await db.update(menuItems).set({ clubShare: share.toFixed(2) } as any).where(eq(menuItems.id, r.id));
      changed++;
    }
    res.json({ success: true, changed, capped, scanned: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════
// 🗂️ أقسام المنيو — /api/venue/categories (مستويان)
// ════════════════════════════════════════════

// ── GET /categories — شجرة أقسام المكان ──
venueRouter.get('/categories', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const rows = await db.select().from(menuCategories)
      .where(and(eq(menuCategories.locationId, locId), isNull(menuCategories.deletedAt)))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.id));
    res.json({ success: true, categories: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /categories — قسمٌ رئيس أو فرعيّ (عمق مستويين فقط) ──
venueRouter.post('/categories', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const name = String(req.body.name || '').trim();
  if (!name || name.length > 60) return res.status(400).json({ error: 'اسم القسم مطلوب (حتى 60 حرفاً)' });
  const parentId = Number.isFinite(parseInt(req.body.parentId)) ? parseInt(req.body.parentId) : null;
  try {
    if (parentId !== null) {
      const [parent] = await db.select({ id: menuCategories.id, parentId: menuCategories.parentId })
        .from(menuCategories)
        .where(and(eq(menuCategories.id, parentId), eq(menuCategories.locationId, locId), isNull(menuCategories.deletedAt))).limit(1);
      if (!parent) return res.status(400).json({ error: 'القسم الأب غير موجود' });
      // 🔒 مستويان فقط: قسمٌ فرعيّ لا يُنجب فرعيّاً
      if (parent.parentId !== null) return res.status(400).json({ error: 'الأقسام مستويان فقط — لا قسم داخل قسمٍ فرعيّ' });
    }
    const [row] = await db.insert(menuCategories).values({
      locationId: locId, parentId, name,
      sortOrder: Number.isFinite(parseInt(req.body.sortOrder)) ? parseInt(req.body.sortOrder) : 0,
    } as any).returning();
    res.json({ success: true, category: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PUT /categories/:id — إعادة تسمية/ترتيب (مرّةً واحدة لكلّ أصنافه) ──
venueRouter.put('/categories/:id', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  if (!name || name.length > 60) return res.status(400).json({ error: 'اسم القسم مطلوب (حتى 60 حرفاً)' });
  try {
    const [row] = await db.update(menuCategories).set({
      name,
      sortOrder: Number.isFinite(parseInt(req.body.sortOrder)) ? parseInt(req.body.sortOrder) : 0,
    } as any).where(and(eq(menuCategories.id, id), eq(menuCategories.locationId, locId), isNull(menuCategories.deletedAt))).returning();
    if (!row) return res.status(404).json({ error: 'القسم غير موجود' });
    // لقطة الاسم النصّيّة على الأصناف تبقى متّسقة مع الجدول
    await db.update(menuItems).set({ category: name } as any)
      .where(and(eq(menuItems.categoryId, id), eq(menuItems.locationId, locId)));
    res.json({ success: true, category: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /categories/:id — يُرفض ما دام مستعمَلاً (لا أصناف يتيمة) ──
venueRouter.delete('/categories/:id', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  try {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(menuItems)
      .where(and(eq(menuItems.categoryId, id), isNull(menuItems.deletedAt)));
    if (cnt > 0) return res.status(400).json({ error: `القسم يحوي ${cnt} صنفاً — انقلها أو احذفها أوّلاً` });
    const [{ kids }] = await db.select({ kids: sql<number>`count(*)::int` }).from(menuCategories)
      .where(and(eq(menuCategories.parentId, id), isNull(menuCategories.deletedAt)));
    if (kids > 0) return res.status(400).json({ error: 'احذف الأقسام الفرعيّة أوّلاً' });

    const [row] = await db.update(menuCategories).set({ deletedAt: new Date() } as any)
      .where(and(eq(menuCategories.id, id), eq(menuCategories.locationId, locId), isNull(menuCategories.deletedAt))).returning();
    if (!row) return res.status(404).json({ error: 'القسم غير موجود' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════
// ⚙️ مجموعات الخيارات المشتركة — /api/venue/option-groups
// ════════════════════════════════════════════

// ── GET /option-groups — المجموعات بقيمها ──
venueRouter.get('/option-groups', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const groups = await db.select().from(menuOptionGroups)
      .where(and(eq(menuOptionGroups.locationId, locId), isNull(menuOptionGroups.deletedAt)))
      .orderBy(asc(menuOptionGroups.sortOrder), asc(menuOptionGroups.id));
    const values = groups.length > 0
      ? await db.select().from(menuOptionValues)
          .where(and(inArray(menuOptionValues.groupId, groups.map(g => g.id)), isNull(menuOptionValues.deletedAt)))
          .orderBy(asc(menuOptionValues.sortOrder), asc(menuOptionValues.id))
      : [];
    res.json({
      success: true,
      groups: groups.map(g => ({ ...g, values: values.filter(v => v.groupId === g.id) })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// يقرأ حقول المجموعة ويطبّعها — القيم تُستبدل كاملةً في كلّ حفظ (أبسط من مزامنة فرديّة)
function readGroupBody(body: any, res: Response): { name: string; selectionType: string; isRequired: boolean; maxSelect: number; sortOrder: number; values: { name: string; priceDelta: string; sortOrder: number }[] } | null {
  const name = String(body.name || '').trim();
  if (!name || name.length > 80) { res.status(400).json({ error: 'اسم المجموعة مطلوب (حتى 80 حرفاً)' }); return null; }
  const selectionType = body.selectionType === 'multi' ? 'multi' : 'single';
  const rawValues = Array.isArray(body.values) ? body.values : [];
  const values: { name: string; priceDelta: string; sortOrder: number }[] = [];
  for (const [i, v] of rawValues.entries()) {
    const vn = String(v?.name || '').trim();
    if (!vn) continue;
    if (vn.length > 80) { res.status(400).json({ error: 'اسم الخيار طويل (حتى 80 حرفاً)' }); return null; }
    const d = v?.priceDelta === undefined || v?.priceDelta === '' ? 0 : parseFloat(v.priceDelta);
    if (!Number.isFinite(d) || d < 0 || d > 9999) { res.status(400).json({ error: `فرق سعر غير صالح في «${vn}»` }); return null; }
    values.push({ name: vn, priceDelta: d.toFixed(2), sortOrder: i });
  }
  if (values.length === 0) { res.status(400).json({ error: 'أضف خياراً واحداً على الأقلّ' }); return null; }
  const maxSelect = selectionType === 'multi'
    ? Math.min(Math.max(1, parseInt(body.maxSelect) || 1), values.length)
    : 1;
  return {
    name, selectionType, isRequired: body.isRequired === true, maxSelect,
    sortOrder: Number.isFinite(parseInt(body.sortOrder)) ? parseInt(body.sortOrder) : 0,
    values,
  };
}

// ── POST /option-groups ──
venueRouter.post('/option-groups', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const v = readGroupBody(req.body, res);
  if (!v) return;
  try {
    const group = await db.transaction(async (tx) => {
      const [g] = await tx.insert(menuOptionGroups).values({
        locationId: locId, name: v.name, selectionType: v.selectionType,
        isRequired: v.isRequired, maxSelect: v.maxSelect, sortOrder: v.sortOrder,
      } as any).returning();
      await tx.insert(menuOptionValues).values(v.values.map(x => ({ groupId: g.id, ...x })) as any);
      return g;
    });
    res.json({ success: true, group });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PUT /option-groups/:id — استبدالٌ كامل للقيم ──
// القيم القديمة تُحذف ناعماً لا صلباً: لقطات الطلبات السابقة تحفظ أسماءها أصلاً،
// لكنّ الحذف الناعم يبقي الأثر للتدقيق.
venueRouter.put('/option-groups/:id', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  const v = readGroupBody(req.body, res);
  if (!v) return;
  try {
    const [exists] = await db.select({ id: menuOptionGroups.id, name: menuOptionGroups.name }).from(menuOptionGroups)
      .where(and(eq(menuOptionGroups.id, id), eq(menuOptionGroups.locationId, locId), isNull(menuOptionGroups.deletedAt))).limit(1);
    if (!exists) return res.status(404).json({ error: 'المجموعة غير موجودة' });

    const group = await db.transaction(async (tx) => {
      const [g] = await tx.update(menuOptionGroups).set({
        name: v.name, selectionType: v.selectionType,
        isRequired: v.isRequired, maxSelect: v.maxSelect, sortOrder: v.sortOrder,
      } as any).where(eq(menuOptionGroups.id, id)).returning();
      await tx.update(menuOptionValues).set({ deletedAt: new Date() } as any)
        .where(and(eq(menuOptionValues.groupId, id), isNull(menuOptionValues.deletedAt)));
      await tx.insert(menuOptionValues).values(v.values.map(x => ({ groupId: id, ...x })) as any);

      // 🔒 أقفال الباقات مربوطة باسم المجموعة نصّاً (lockedOptions): إعادة التسمية
      //    بلا ترحيلها كانت تفكّ القفل — فيُسأل اللاعب عن خيارٍ حدّده العرض
      //    ويُحاسَب على فرقه فوق سعر الباقة الثابت
      if (v.name !== exists.name) {
        const bundles = await tx.select({ id: menuItems.id, bundleItems: menuItems.bundleItems }).from(menuItems)
          .where(and(eq(menuItems.locationId, locId), eq(menuItems.isBundle, true), isNull(menuItems.deletedAt)));
        for (const bb of bundles) {
          const raw = Array.isArray(bb.bundleItems) ? bb.bundleItems as any[] : [];
          let touched = false;
          const next = raw.map(slot => {
            const lo = slot?.lockedOptions;
            if (lo && typeof lo === 'object' && exists.name in lo) {
              touched = true;
              const { [exists.name]: val, ...rest } = lo;
              return { ...slot, lockedOptions: { ...rest, [v.name]: val } };
            }
            return slot;
          });
          if (touched) await tx.update(menuItems).set({ bundleItems: next } as any).where(eq(menuItems.id, bb.id));
        }
      }
      return g;
    });
    res.json({ success: true, group });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /option-groups/:id — يُرفض ما دامت مربوطةً بصنف ──
venueRouter.delete('/option-groups/:id', authenticate, requireVenuePermission('menu.manage'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  try {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(menuItems)
      .where(and(eq(menuItems.locationId, locId), isNull(menuItems.deletedAt),
                 sql`${menuItems.optionGroupIds} @> ${JSON.stringify([id])}::jsonb`));
    if (cnt > 0) return res.status(400).json({ error: `المجموعة مربوطة بـ${cnt} صنفاً — افصلها عنها أوّلاً` });

    const [row] = await db.update(menuOptionGroups).set({ deletedAt: new Date() } as any)
      .where(and(eq(menuOptionGroups.id, id), eq(menuOptionGroups.locationId, locId), isNull(menuOptionGroups.deletedAt))).returning();
    if (!row) return res.status(404).json({ error: 'المجموعة غير موجودة' });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════
// 📥 صندوق طلبات المكان — /api/venue/orders
// ════════════════════════════════════════════

const ORDERS_LOOKBACK_HOURS = 24;

// 🔕 آخر تصعيدٍ للأدمن عن مكانٍ إشعاراته لا تصل أحداً — ساعةٌ بين التحذيرين
const pushBlackoutWarnedAt = new Map<number, number>();

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
        // ⏱️ مرجع حرارة التذكرة: عمر **المرحلة** لا عمر الطلب (نفس مرجع التذكير)
        statusChangedAt: o.statusChangedAt,
        playerName: o.playerName, physicalId: o.physicalId,
        activityId: o.activityId, activityName: actName.get(o.activityId) || '',
        items: items.filter(i => i.orderId === o.id).map(i => ({
          name: i.nameSnapshot, unitPrice: i.unitPriceSnapshot, quantity: i.quantity,
          components: Array.isArray(i.componentsSnapshot) ? i.componentsSnapshot : [],
          options: Array.isArray(i.optionsSnapshot) ? i.optionsSnapshot : [],
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

    // 🔒 الحارس على الحالة القديمة يقفل سباق check-then-update: موظّفان يضغطان
    //    معاً، أو إلغاء اللاعب الذرّيّ يسبق — الثاني يجد 0 صفوف فيُرفض لا يدوس
    const [updated] = await db.update(orders).set({
      status, statusChangedBy: req.venueStaff!.id, statusChangedAt: new Date(),
      // ⏰ المرحلة الجديدة تبدأ بعدّاد تذكيرٍ نظيف — من بدأ التحضير الآن
      // لا يُذكَّر لأنّ الطلب قديم، ويُمنح ٥ دقائق كاملة لمرحلته
      reminderSentAt: null, reminderCount: 0,
    } as any).where(and(eq(orders.id, id), eq(orders.status, existing.status))).returning();
    if (!updated) return res.status(409).json({ error: 'تغيّرت حالة الطلب للتوّ — حدّث الشاشة' });

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
// 🧾 فواتير المكان — /api/venue/invoices
// ════════════════════════════════════════════

// ── GET /invoice-activities — فعاليّات المكان المفعَّلة المنيو (آخر 7 أيّام حتى يومين قادمين) ──
venueRouter.get('/invoice-activities', authenticate, requireVenuePermission('invoices.print'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const acts = await db.select({ id: activities.id, name: activities.name, date: activities.date })
      .from(activities)
      .where(and(
        eq(activities.locationId, locId),
        eq(activities.menuOrderingEnabled, true),
        isNull(activities.deletedAt),
        gte(activities.date, new Date(Date.now() - 7 * 24 * 3600_000)),
      ))
      .orderBy(desc(activities.date))
      .limit(30);
    res.json({ success: true, activities: acts });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /invoices/candidates?activityId= — لاعبو الفعاليّة أصحاب الطلبات مع مجاميعهم ──
venueRouter.get('/invoices/candidates', authenticate, requireVenuePermission('invoices.print'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(String(req.query.activityId || ''));
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'activityId مطلوب' });
  try {
    const [act] = await db.select({
      id: activities.id, addGameFee: activities.addGameFeeToBill, basePrice: activities.basePrice,
    }).from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.locationId, locId), isNull(activities.deletedAt))).limit(1);
    if (!act) return res.status(404).json({ error: 'الفعاليّة غير موجودة لهذا المكان' });

    const rows: { playerId: number; playerName: string; bookingId: number | null; ordersCount: number; ordersTotal: string }[] =
      await db.select({
        playerId: orders.playerId,
        playerName: sql<string>`max(${orders.playerName})`,
        bookingId: sql<number>`max(${orders.bookingId})`,
        ordersCount: sql<number>`count(*)::int`,
        ordersTotal: sql<string>`sum(${orders.total})::text`,
      }).from(orders)
        .where(and(eq(orders.activityId, activityId), eq(orders.locationId, locId), ne(orders.status, 'cancelled')))
        .groupBy(orders.playerId);

    // 💳 الحدّ الأدنى: من لعب جولةً على الأقلّ يدخل الفوترة ولو بلا طلبات —
    //    تكملته تظهر هنا كما ستظهر في فاتورته
    const [locRow] = await db.select({
      minChargeEnabled: locations.minChargeEnabled, minimumCharge: locations.minimumCharge,
      autoWater: locations.autoWater,
    }).from(locations).where(eq(locations.id, locId)).limit(1);
    const minCharge = locRow?.minChargeEnabled === true ? parseFloat(locRow.minimumCharge || '0') : 0;
    // 💧 الماء التلقائيّ: صنفه من المنيو الفعّال، ومن وصله ماءٌ من طلبه يُستثنى
    const water = locRow?.autoWater === true ? await waterItemOf(db, locId) : null;
    const waterOwners = water
      ? new Set(((await db.execute(sql`
          SELECT DISTINCT o.player_id FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.activity_id = ${activityId} AND o.location_id = ${locId} AND o.status != 'cancelled'
            AND (oi.name_snapshot = ${water.name}
                 OR oi.components_snapshot @> ${JSON.stringify([{ name: water.name }])}::jsonb)
        `)) as any).rows.map((r: any) => Number(r.player_id)))
      : new Set<number>();
    const playedIds = (minCharge > 0 || water) ? new Set(await playersWhoPlayed(db, activityId)) : new Set<number>();

    // 🧾 ومن له فاتورةٌ مُصدَرة يبقى مرشّحاً دائماً — فاتورة تكملةٍ محصَّلة
    //    للاعبٍ بلا طلبات كانت ستختفي من الشاشة لو عُطّل الحدّ لاحقاً
    const invoicedIds = (await db.select({ playerId: orderInvoices.playerId }).from(orderInvoices)
      .where(and(eq(orderInvoices.locationId, locId), eq(orderInvoices.activityId, activityId))))
      .map(i => i.playerId);

    const zeroOrderPlayed = [...new Set([...playedIds, ...invoicedIds])]
      .filter(pid => !rows.some(r => r.playerId === pid));
    if (zeroOrderPlayed.length > 0) {
      const names = await db.select({ id: players.id, name: players.name })
        .from(players).where(inArray(players.id, zeroOrderPlayed));
      const bks0 = await db.select({ id: bookings.id, playerId: bookings.playerId })
        .from(bookings).where(and(
          eq(bookings.activityId, activityId), inArray(bookings.playerId, zeroOrderPlayed), isNull(bookings.deletedAt)));
      const bkByPlayer = new Map(bks0.map(b => [b.playerId, b.id]));
      for (const pid of zeroOrderPlayed) {
        rows.push({
          playerId: pid,
          playerName: names.find(n => n.id === pid)?.name || `لاعب #${pid}`,
          bookingId: bkByPlayer.get(pid) ?? null,
          ordersCount: 0,
          ordersTotal: '0',
        });
      }
    }

    // حالة دفع الحجوزات (لسطر رسوم اللعبة) + الفواتير المُصدَرة سابقاً
    const bookingIds = rows.map(r => Number(r.bookingId)).filter(Boolean);
    const bks = bookingIds.length > 0
      ? await db.select({ id: bookings.id, isPaid: bookings.isPaid, isFree: bookings.isFree })
          .from(bookings).where(inArray(bookings.id, bookingIds))
      : [];
    const bkById = new Map(bks.map(b => [b.id, b]));
    const invs = await db.select({
      playerId: orderInvoices.playerId, invoiceNo: orderInvoices.invoiceNo, printedAt: orderInvoices.printedAt,
      isPaid: orderInvoices.isPaid, paidAt: orderInvoices.paidAt, gameFeeAmount: orderInvoices.gameFeeAmount,
      minTopup: orderInvoices.minTopup, waterCharge: orderInvoices.waterCharge,
    }).from(orderInvoices)
      .where(and(eq(orderInvoices.locationId, locId), eq(orderInvoices.activityId, activityId)));
    const invByPlayer = new Map(invs.map(i => [i.playerId, i]));

    res.json({
      success: true,
      gameFeeEnabled: act.addGameFee === true,
      minChargeEnabled: minCharge > 0,
      minimumCharge: minCharge,
      autoWaterEnabled: water !== null,
      waterPrice: water?.price ?? 0,
      candidates: rows.map(r => {
        const bk = bkById.get(Number(r.bookingId));
        const gameFee = act.addGameFee === true && bk && bk.isPaid !== true && bk.isFree !== true
          ? parseFloat(act.basePrice || '0') : 0;
        const ordersTotal = parseFloat(r.ordersTotal || '0');
        const inv = invByPlayer.get(r.playerId);
        // فاتورةٌ محصَّلة تُجمَّد على لقطتها (رسوماً وتكملةً وماءً) — الحيّ يُحسب للبقيّة
        const waterCharge = inv?.isPaid
          ? parseFloat(inv.waterCharge || '0')
          : (water && !waterOwners.has(r.playerId) ? water.price : 0);
        const minTopup = inv?.isPaid
          ? parseFloat(inv.minTopup || '0')
          : (playedIds.has(r.playerId) ? Math.max(0, minCharge - (ordersTotal + waterCharge)) : 0);
        const feeShown = inv?.isPaid ? parseFloat(inv.gameFeeAmount || '0') : gameFee;
        return {
          playerId: r.playerId,
          playerName: r.playerName,
          ordersCount: r.ordersCount,
          ordersTotal,
          minTopup,
          waterCharge,
          gameFee: feeShown,
          grandTotal: ordersTotal + waterCharge + minTopup + feeShown,
          invoiceNo: inv?.invoiceNo ?? null,
          printedAt: inv?.printedAt ?? null,
          isPaid: inv?.isPaid === true,
          paidAt: inv?.paidAt ?? null,
        };
      }),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /invoices/:activityId/:playerId — تفاصيل الفاتورة للعرض (بلا إصدار رقم) ──
// القراءة لا تستهلك رقماً ولا تختم طباعةً — لذا تُفتح التفاصيل بحرّية.
// 🔴 القيد الرقميّ (\d+) ضروريّ: بدونه يلتقط هذا المسار «print-all» كمعرّف لاعبٍ
//    — فكان زرّ طباعة كلّ الفواتير يعيد 400 دائماً (اكتشفه الفحص الشامل 2026-08-10)
venueRouter.get('/invoices/:activityId/:playerId(\\d+)', authenticate, requireVenuePermission('invoices.print'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(req.params.activityId);
  const playerId = parseInt(req.params.playerId);
  if (!Number.isFinite(activityId) || !Number.isFinite(playerId)) return res.status(400).json({ error: 'معرّفات غير صالحة' });
  try {
    const data = await buildInvoiceData(db, locId, activityId, playerId);
    if ('error' in data) return res.status(404).json({ error: data.error });

    const [inv] = await db.select().from(orderInvoices).where(and(
      eq(orderInvoices.locationId, locId),
      eq(orderInvoices.activityId, activityId),
      eq(orderInvoices.playerId, playerId),
    )).limit(1);

    // حالة الحجز — تشرح سبب وجود/غياب سطر رسوم اللعبة
    const [bk] = data.bookingId
      ? await db.select({ isPaid: bookings.isPaid, isFree: bookings.isFree })
          .from(bookings).where(eq(bookings.id, data.bookingId)).limit(1)
      : [undefined as any];

    res.json({
      success: true,
      invoice: {
        ...data,
        invoiceNo: inv?.invoiceNo ?? null,
        printedAt: inv?.printedAt ?? null,
        isPaid: inv?.isPaid === true,
        paidAt: inv?.paidAt ?? null,
        bookingIsPaid: bk?.isPaid === true,
        bookingIsFree: bk?.isFree === true,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /invoices/:activityId/:playerId/pdf — إصدار/إعادة طباعة فاتورة A6 (inline PDF) ──
// يثبّت الرقم التسلسليّ ويسجّل التدقيق ثم يعيد الـPDF مباشرة.
venueRouter.post('/invoices/:activityId/:playerId/pdf', authenticate, requireVenuePermission('invoices.print'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(req.params.activityId);
  const playerId = parseInt(req.params.playerId);
  if (!Number.isFinite(activityId) || !Number.isFinite(playerId)) return res.status(400).json({ error: 'معرّفات غير صالحة' });
  try {
    const data = await buildInvoiceData(db, locId, activityId, playerId);
    if ('error' in data) return res.status(404).json({ error: data.error });

    const invoiceNo = await issueInvoiceNumber(db, data, req.venueStaff!.id);
    const printedByName = req.user?.displayName || req.user?.username || '';
    const pdf = await renderRawHtmlPdf(invoiceHtml(data, invoiceNo, printedByName), { format: 'A6' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`invoice-${invoiceNo}`)}.pdf`);
    res.send(pdf);
  } catch (err: any) {
    console.error('❌ fnb invoice pdf:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════
// 💰 الدخل والحصص — /api/venue/revenue
// ════════════════════════════════════════════

// ── GET /revenue?from=&to= — دخل المكان مقسوماً بدقّة ──
// 🔢 المصدر الوحيد للحقيقة: لقطات بنود الطلبات — لا أسعار المنيو الحاليّة.
//    حصّة النادي = Σ(club_share_snapshot × qty) · حصّة المكان = المبيعات − حصّة النادي
//    (فروق الخيارات داخل unit_price_snapshot وتعود للمكان — قرار مقفل).
// «محصَّل» يعني فاتورةً وُسمت مدفوعة؛ وما عداه مستحقّ.
venueRouter.get('/revenue', authenticate, requireVenuePermission('invoices.print'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;

  const parseDay = (v: unknown, fallback: Date) => {
    const d = new Date(String(v || ''));
    return Number.isNaN(d.getTime()) ? fallback : d;
  };
  const to = parseDay(req.query.to, new Date());
  to.setHours(23, 59, 59, 999);
  const from = parseDay(req.query.from, new Date(Date.now() - 30 * 24 * 3600_000));
  from.setHours(0, 0, 0, 0);

  try {
    const scope = and(
      eq(orders.locationId, locId),
      ne(orders.status, 'cancelled'),
      isNull(activities.deletedAt),
      gte(activities.date, from),
      lte(activities.date, to),
    );

    // إجماليّات + تفصيل لكل فعاليّة في استعلامٍ واحد
    const rows = await db.select({
      activityId: activities.id,
      activityName: activities.name,
      activityDate: activities.date,
      gross: sql<string>`COALESCE(SUM(${orderItems.unitPriceSnapshot}::numeric * ${orderItems.quantity}), 0)::text`,
      club: sql<string>`COALESCE(SUM(${orderItems.clubShareSnapshot}::numeric * ${orderItems.quantity}), 0)::text`,
      ordersCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
      playersCount: sql<number>`COUNT(DISTINCT ${orders.playerId})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(activities, eq(orders.activityId, activities.id))
      .where(scope)
      .groupBy(activities.id, activities.name, activities.date)
      .orderBy(desc(activities.date));

    // حالة تحصيل الفواتير لنفس الفترة
    const invRows = await db.select({
      activityId: orderInvoices.activityId,
      issued: sql<number>`COUNT(*)::int`,
      paid: sql<number>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = true THEN 1 ELSE 0 END), 0)::int`,
      paidTotal: sql<string>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = true THEN ${orderInvoices.grandTotal}::numeric ELSE 0 END), 0)::text`,
      unpaidTotal: sql<string>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = false THEN ${orderInvoices.grandTotal}::numeric ELSE 0 END), 0)::text`,
      gameFees: sql<string>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = true THEN ${orderInvoices.gameFeeAmount}::numeric ELSE 0 END), 0)::text`,
    }).from(orderInvoices)
      .innerJoin(activities, eq(orderInvoices.activityId, activities.id))
      .where(and(
        eq(orderInvoices.locationId, locId),
        isNull(activities.deletedAt),
        gte(activities.date, from),
        lte(activities.date, to),
      ))
      .groupBy(orderInvoices.activityId);
    const invByAct = new Map(invRows.map(i => [i.activityId, i]));

    // أكثر الأصناف دخلاً (اسم اللقطة — الصنف قد يكون حُذف)
    const topItems = await db.select({
      name: orderItems.nameSnapshot,
      qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      gross: sql<string>`COALESCE(SUM(${orderItems.unitPriceSnapshot}::numeric * ${orderItems.quantity}), 0)::text`,
      club: sql<string>`COALESCE(SUM(${orderItems.clubShareSnapshot}::numeric * ${orderItems.quantity}), 0)::text`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(activities, eq(orders.activityId, activities.id))
      .where(scope)
      .groupBy(orderItems.nameSnapshot)
      .orderBy(desc(sql`SUM(${orderItems.unitPriceSnapshot}::numeric * ${orderItems.quantity})`))
      .limit(20);

    const n = (x: unknown) => { const v = parseFloat(String(x ?? '0')); return Number.isFinite(v) ? v : 0; };
    const activitiesOut = rows.map(r => {
      const gross = n(r.gross), club = n(r.club);
      const inv = invByAct.get(r.activityId);
      return {
        activityId: r.activityId, activityName: r.activityName, activityDate: r.activityDate,
        gross, club, venue: gross - club,
        ordersCount: r.ordersCount, playersCount: r.playersCount,
        invoicesIssued: inv?.issued ?? 0,
        invoicesPaid: inv?.paid ?? 0,
        collected: n(inv?.paidTotal), outstanding: n(inv?.unpaidTotal),
        gameFeesCollected: n(inv?.gameFees),
      };
    });

    const sum = (k: keyof typeof activitiesOut[number]) =>
      activitiesOut.reduce((s, a) => s + (a[k] as number), 0);

    const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, locId)).limit(1);

    res.json({
      success: true,
      locationName: loc?.name || '',
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        gross: sum('gross'), club: sum('club'), venue: sum('venue'),
        ordersCount: sum('ordersCount'),
        collected: sum('collected'), outstanding: sum('outstanding'),
        gameFeesCollected: sum('gameFeesCollected'),
        invoicesIssued: sum('invoicesIssued'), invoicesPaid: sum('invoicesPaid'),
      },
      activities: activitiesOut,
      topItems: topItems.map(t => ({
        name: t.name, qty: t.qty,
        gross: n(t.gross), club: n(t.club), venue: n(t.gross) - n(t.club),
      })),
    });
  } catch (err: any) {
    console.error('❌ fnb revenue:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /invoices/:activityId/:playerId/pay — تحصيل الفاتورة كاملةً ──
// 🎯 توحيد 2026-08-06 (القرار 4): الدفع الكامل فقط — لا دفعات جزئيّة.
// إن حملت الفاتورة سطر رسوم اللعبة يُقلَب الحجز إلى مدفوع داخل المعاملة نفسها،
// فتدخل الرسوم تقارير الإيراد فوراً بلا خطوة يدويّة في صفحة الحجوزات.
venueRouter.post('/invoices/:activityId/:playerId/pay', authenticate, requireVenuePermission('payments.record'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(req.params.activityId);
  const playerId = parseInt(req.params.playerId);
  if (!Number.isFinite(activityId) || !Number.isFinite(playerId)) return res.status(400).json({ error: 'معرّفات غير صالحة' });

  try {
    // المجاميع تُعاد من الطلبات الحاليّة — لا نثق بمجاميع مخزّنة قد تكون قديمة (طلبٌ أُضيف بعد الطباعة)
    const data = await buildInvoiceData(db, locId, activityId, playerId);
    if ('error' in data) return res.status(404).json({ error: data.error });

    const staffId = req.venueStaff!.id;
    const receiverName = req.user?.displayName || req.user?.username || '';

    // 💵 التحصيل يُصدر رقم الفاتورة بنفسه إن لم يُصدَر بعد (قرار 2026-08-12):
    //    كان يردّ «أصدر الفاتورة أوّلاً» فيفرض على الكاشير فتح PDF في تبويبٍ
    //    آخر ثمّ العودة — ترتيبٌ لا مبرّر له. الترقيم يبقى تسلسليّاً بنفس
    //    القفل الاستشاريّ داخل issueInvoiceNumber، والطباعة صارت اختياريّة.
    let [inv] = await db.select().from(orderInvoices).where(and(
      eq(orderInvoices.locationId, locId),
      eq(orderInvoices.activityId, activityId),
      eq(orderInvoices.playerId, playerId),
    )).limit(1);
    if (!inv) {
      await issueInvoiceNumber(db, data, staffId);
      [inv] = await db.select().from(orderInvoices).where(and(
        eq(orderInvoices.locationId, locId),
        eq(orderInvoices.activityId, activityId),
        eq(orderInvoices.playerId, playerId),
      )).limit(1);
      if (!inv) return res.status(500).json({ error: 'تعذّر إصدار رقم الفاتورة' });
    }
    if (inv.isPaid === true) return res.status(400).json({ error: 'الفاتورة محصَّلة مسبقاً' });

    // 🔒 isPaid=false داخل الشرط: كاشيران يضغطان معاً — الثاني يجد 0 صفوف
    //    فيُرفض، ولا يضيع اسم من حصّل فعلاً من سجلّ التدقيق
    let paidRow: any = null;
    await db.transaction(async (tx) => {
      const [row] = await tx.update(orderInvoices).set({
        ordersTotal: data.ordersTotal.toFixed(2),
        minTopup: data.minTopup.toFixed(2),
        waterCharge: data.waterCharge.toFixed(2),
        gameFeeApplied: data.gameFeeApplied,
        gameFeeAmount: data.gameFeeAmount.toFixed(2),
        grandTotal: data.grandTotal.toFixed(2),
        isPaid: true, paidAt: new Date(), paidBy: staffId,
      } as any).where(and(eq(orderInvoices.id, inv.id), eq(orderInvoices.isPaid, false))).returning();
      paidRow = row;
      if (!row) return;

      // رسوم اللعبة محصَّلة عند المكان ⇒ الحجز صار مدفوعاً باسم موظّف المكان
      if (data.gameFeeApplied && data.gameFeeAmount > 0 && data.bookingId) {
        await tx.update(bookings).set({
          isPaid: true,
          paidAmount: data.gameFeeAmount.toFixed(2),
          receivedBy: receiverName,
        } as any).where(and(eq(bookings.id, data.bookingId), eq(bookings.isPaid, false)));
      }
    });
    if (!paidRow) return res.status(400).json({ error: 'الفاتورة محصَّلة مسبقاً' });

    res.json({
      success: true,
      invoiceNo: inv.invoiceNo,
      grandTotal: data.grandTotal,
      gameFeeSettled: data.gameFeeApplied ? data.gameFeeAmount : 0,
    });
  } catch (err: any) {
    console.error('❌ fnb invoice pay:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /invoices/:activityId/:playerId/waive-fee — إسقاط رسوم اللعبة ──
// يجعل حجز اللاعب **مجّانيّاً لهذه الفعاليّة تحديداً** (bookings.is_free)، فيسقط
// سطر الرسوم من فاتورته ولا يظهر كمستحقٍّ في التقارير. عمليّة مرئيّة تُسجَّل
// باسم من نفّذها — لذا تتطلّب صلاحيّة التحصيل لا مجرّد الطباعة.
venueRouter.post('/invoices/:activityId/:playerId/waive-fee', authenticate, requireVenuePermission('payments.record'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(req.params.activityId);
  const playerId = parseInt(req.params.playerId);
  const waive = req.body?.waive !== false;   // افتراضاً إسقاط، و false يعيدها
  if (!Number.isFinite(activityId) || !Number.isFinite(playerId)) return res.status(400).json({ error: 'معرّفات غير صالحة' });

  try {
    // الحجز يُستخرج من طلبات اللاعب في هذه الفعاليّة (نفس مصدر الفاتورة)
    const [row] = await db.select({ bookingId: orders.bookingId }).from(orders)
      .where(and(eq(orders.activityId, activityId), eq(orders.locationId, locId), eq(orders.playerId, playerId)))
      .limit(1);
    if (!row?.bookingId) return res.status(404).json({ error: 'لا حجز مرتبط بطلبات هذا اللاعب' });

    const [bk] = await db.select({ isPaid: bookings.isPaid }).from(bookings)
      .where(eq(bookings.id, row.bookingId)).limit(1);
    if (!bk) return res.status(404).json({ error: 'الحجز غير موجود' });
    if (waive && bk.isPaid === true) {
      return res.status(400).json({ error: 'الحجز مدفوع مسبقاً — لا يمكن جعله مجّانيّاً' });
    }

    await db.update(bookings).set({
      isFree: waive,
      // مجّانيّ = لا مبلغ مستحقّ؛ وإلغاء المجّانيّة يعيده غير مدفوع
      ...(waive ? { paidAmount: '0' } : {}),
    } as any).where(eq(bookings.id, row.bookingId));

    // فاتورةٌ صادرة تُحدَّث مجاميعها لتوافق الحالة الجديدة
    const [inv] = await db.select({ id: orderInvoices.id, isPaid: orderInvoices.isPaid }).from(orderInvoices)
      .where(and(eq(orderInvoices.locationId, locId), eq(orderInvoices.activityId, activityId), eq(orderInvoices.playerId, playerId)))
      .limit(1);
    if (inv && inv.isPaid !== true) {
      const data = await buildInvoiceData(db, locId, activityId, playerId);
      if (!('error' in data)) {
        await db.update(orderInvoices).set({
          gameFeeApplied: data.gameFeeApplied,
          gameFeeAmount: data.gameFeeAmount.toFixed(2),
          grandTotal: data.grandTotal.toFixed(2),
        } as any).where(eq(orderInvoices.id, inv.id));
      }
    }

    res.json({ success: true, waived: waive });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /invoices/:activityId/print-all — كل فواتير الفعاليّة في PDF واحد ──
// A6 لكل لاعب متتاليةً — يُطبع دفعةً واحدة بدل فتح فاتورةٍ فاتورة.
// يثبّت أرقام من لم تُصدَر فاتورته بعد (نفس قفل الترقيم).
venueRouter.get('/invoices/:activityId/print-all', authenticate, requireVenuePermission('invoices.print'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const activityId = parseInt(req.params.activityId);
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const rows = await db.selectDistinct({ playerId: orders.playerId }).from(orders)
      .where(and(eq(orders.activityId, activityId), eq(orders.locationId, locId), ne(orders.status, 'cancelled')));
    // 💳 مع الحدّ الأدنى: من لعب بلا طلباتٍ له فاتورة تكملةٍ تُطبع مع البقيّة —
    //    ومن له فاتورةٌ مُصدَرة يُطبع دائماً (لقطته محفوظة ولو تغيّرت الإعدادات)
    const [locMin] = await db.select({ en: locations.minChargeEnabled, water: locations.autoWater })
      .from(locations).where(eq(locations.id, locId)).limit(1);
    const extraIds = new Set<number>(
      (await db.select({ playerId: orderInvoices.playerId }).from(orderInvoices)
        .where(and(eq(orderInvoices.locationId, locId), eq(orderInvoices.activityId, activityId))))
        .map(i => i.playerId));
    if (locMin?.en === true || locMin?.water === true) {
      for (const pid of await playersWhoPlayed(db, activityId)) extraIds.add(pid);
    }
    for (const pid of extraIds) {
      if (!rows.some(r => r.playerId === pid)) rows.push({ playerId: pid });
    }
    if (rows.length === 0) return res.status(404).json({ error: 'لا فواتير لهذه الفعاليّة' });

    const printedByName = req.user?.displayName || req.user?.username || '';
    const pages: string[] = [];
    for (const r of rows) {
      const data = await buildInvoiceData(db, locId, activityId, r.playerId);
      if ('error' in data) continue;
      const no = await issueInvoiceNumber(db, data, req.venueStaff!.id);
      pages.push(invoiceHtml(data, no, printedByName));
    }
    if (pages.length === 0) return res.status(404).json({ error: 'لا فواتير لهذه الفعاليّة' });

    const pdf = await renderRawHtmlPdf(mergeInvoicePages(pages), { format: 'A6' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(`invoices-activity-${activityId}`)}.pdf`);
    res.send(pdf);
  } catch (err: any) {
    console.error('❌ fnb print-all:', err.message);
    res.status(500).json({ error: err.message });
  }
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

  // ── (أ) غرفةٌ حيّة أوّلاً — **بلا شرطٍ زمنيّ** ──────────────────
  // 🔴 القاعدة: الغرفة الحيّة هي الحدث. إن بدأ القائد اللعبة فاللاعبون
  //    جالسون في المكان الآن مهما قال الموعد المجدول. كان الشرط الزمنيّ
  //    يُطبَّق حتى على الغرف الحيّة، فغرفةٌ بدأت قبل موعدها بساعتين تُحرَم
  //    الطلب — وهو ما يناقض «الطلب داخل الفعاليّة» أصلاً.
  //    الحجز يبقى إلزاميّاً (قرار مقفل).
  const liveRows = await db.select({
    sessionId: sessions.id,
    physicalId: sessionPlayers.physicalId,
    activityId: activities.id,
    activityName: activities.name,
    activityDate: activities.date,
    locationId: activities.locationId,
    bookingId: bookings.id,
  }).from(sessionPlayers)
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
    .innerJoin(activities, eq(sessions.activityId, activities.id))
    .innerJoin(bookings, and(
      eq(bookings.activityId, activities.id),
      eq(bookings.playerId, playerId),
      isNull(bookings.deletedAt),
    ))
    .where(and(
      eq(sessionPlayers.playerId, playerId),
      eq(sessions.status, 'active'),
      liveSessionFresh(),          // ⏳ جلسة الأمس المفتوحة ليست «الآن» — انظر التعليق أعلاه
      isNull(sessions.deletedAt),
      isNull(activities.deletedAt),
      eq(activities.menuOrderingEnabled, true),
      ne(activities.status, 'cancelled'),
    ))
    .orderBy(desc(sessionPlayers.joinedAt))
    .limit(1);

  if (liveRows.length > 0 && liveRows[0].locationId != null) {
    const r = liveRows[0];
    const [loc] = await db.select({ id: locations.id, name: locations.name })
      .from(locations).where(eq(locations.id, r.locationId!)).limit(1);
    if (loc) {
      return {
        activityId: r.activityId,
        activityName: r.activityName,
        activityDate: r.activityDate,
        locationId: loc.id,
        locationName: loc.name,
        bookingId: r.bookingId,
        sessionId: r.sessionId,
        physicalId: r.physicalId,
        source: 'live',
      };
    }
  }

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

  const usable = bookingRows.filter(b =>
    b.activityStatus !== 'completed' && b.activityStatus !== 'cancelled' && b.locationId != null);
  const inWindow = usable.filter(b => b.activityDate.getTime() - ORDER_WINDOW_BEFORE_MS <= now);

  // 🎯 عند تداخل نافذتين (فعاليّة عصرٍ لم تُغلَق + فعاليّة الليلة): الأقرب زمنيّاً
  //    للآن هي التي يجلس فيها اللاعب — الترتيب التصاعديّ وحده كان يختار الأقدم
  //    فتذهب طلباته وفاتورته لمكانٍ غادره
  inWindow.sort((a, b) =>
    Math.abs(a.activityDate.getTime() - now) - Math.abs(b.activityDate.getTime() - now));
  const chosen = inWindow[0];
  if (!chosen) {
    // لا سياق — نُفصح **لماذا** بدل الصمت: الغموض هنا كلّف تشخيصاً خاطئاً مرّتين.
    // لاعب داخل غرفة حيّة لفعاليّة مفعَّلة لكن بلا حجز؟
    const liveNoBooking = await db.select({ actId: sessions.activityId })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        eq(sessions.status, 'active'),
        liveSessionFresh(),        // نفس الحارس — وإلّا شخّصنا «بلا حجز» بسبب غرفةٍ من الشهر الماضي
        isNull(sessions.deletedAt),
        eq(activities.menuOrderingEnabled, true),
      )).limit(1);
    if (liveNoBooking.length > 0) return { error: 'الطلب متاح للحاجزين فقط — لا يوجد حجز باسمك لهذه الفعاليّة' };

    // حجزٌ قائم لكنّ النافذة لم تُفتح بعد → أعطِ الموعد بدل رسالةٍ عامّة
    const soonest = usable[0];
    if (soonest) {
      const opensAt = new Date(soonest.activityDate.getTime() - ORDER_WINDOW_BEFORE_MS);
      const t = opensAt.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
      return { error: `يفتح الطلب من «${soonest.activityName}» الساعة ${t} (قبل الموعد بساعة) — أو فور بدء الغرفة` };
    }
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
    sessionId: null,          // الغرفة الحيّة عولجت أعلاه — هذا مسار الحجز قبل بدئها
    physicalId: null,
    source: 'booking',
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

// 🍽️ منيو اللاعب لمكانٍ ما: المتاح فقط، **بلا حصّة النادي إطلاقاً**، ومكوّنات الباقات
// محلولةٌ إلى أسماء (اللاعب يرى «ماذا داخل العرض» بلا أن يرى أسعار المكوّنات).
// تُستخدم في مسارَين: منيو الفعاليّة (أثناء نافذة الطلب) واستعراض المنيو وقت الحجز.
export async function buildPlayerMenu(db: NonNullable<ReturnType<typeof getDB>>, locationId: number) {
  const rows = await db.select().from(menuItems)
    .where(and(eq(menuItems.locationId, locationId), eq(menuItems.isAvailable, true), isNull(menuItems.deletedAt)))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));

  // 🗂️ شجرة الأقسام: القسم الرئيس يجمع، والفرعيّ يرتّب داخله
  const cats = await db.select().from(menuCategories)
    .where(and(eq(menuCategories.locationId, locationId), isNull(menuCategories.deletedAt)))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.id));
  const catById = new Map(cats.map(c => [c.id, c]));
  const catOrder = new Map(cats.map((c, i) => [c.id, i]));

  // أصناف المكوّنات تُحلّ من كامل أصناف المكان (المكوّن قد يكون مخفيّاً عن الطلب المباشر)
  const compById = new Map<number, { id: number; name: string; price: string; optionGroupIds: unknown; customOptions: unknown }>();
  if (rows.some(r => r.isBundle)) {
    const all = await db.select({
      id: menuItems.id, name: menuItems.name, price: menuItems.price,
      optionGroupIds: menuItems.optionGroupIds, customOptions: menuItems.customOptions,
    }).from(menuItems).where(and(eq(menuItems.locationId, locationId), isNull(menuItems.deletedAt)));
    for (const a of all) compById.set(a.id, a);
  }
  // خيارات المكوّنات تُحلّ مع خيارات الأصناف نفسها في نداءٍ واحد
  const compGroups = compById.size > 0
    ? await resolveOptionGroups(db, [...compById.values()])
    : new Map();

  // ⚙️ مجموعات الخيارات الفعّالة لكلّ صنف — **بلا حصّة نادٍ** (اللاعب يرى فروق السعر فقط)
  const groupsByItem = await resolveOptionGroups(db, rows);

  const mapped = rows.map(r => {
    const leaf = r.categoryId ? catById.get(r.categoryId) : undefined;
    const parent = leaf?.parentId ? catById.get(leaf.parentId) : undefined;
    return {
      id: r.id,
      // القسم المعروض = الأب إن وُجد، والفرعيّ عنوانٌ داخله
      category: parent?.name ?? leaf?.name ?? r.category ?? '',
      subcategory: parent ? leaf!.name : '',
      name: r.name, description: r.description,
      price: r.price, imageUrl: r.imageUrl, isBundle: r.isBundle === true,
      // 🎁 خانات الباقة: الثابتة باسمها، والاختياريّة بمرشّحيها وخياراتهم —
      //    كي يهيّئ اللاعب الباقة كاملةً في ورقةٍ واحدة بلا نداءٍ إضافيّ
      slots: r.isBundle === true
        ? readSlots(r.bundleItems).map((s, i) => {
            if (s.kind === 'choice') {
              return {
                i, kind: 'choice' as const, label: s.label, note: s.note, qty: s.qty,
                from: s.from.map(id => {
                  const c = compById.get(id);
                  return c ? { menuItemId: id, name: c.name, optionGroups: compGroups.get(id) ?? [] } : null;
                }).filter(Boolean),
              };
            }
            const c = compById.get(s.menuItemId);
            const groups = (compGroups.get(s.menuItemId) ?? []) as { name: string }[];
            return {
              i, kind: 'fixed' as const, menuItemId: s.menuItemId, name: c?.name || '', qty: s.qty,
              lockedOptions: s.lockedOptions,
              // المقفلة تُعرض للعلم ولا تُسأل — فتُستبعَد من مجموعات السؤال
              optionGroups: groups.filter(g => !(g.name in s.lockedOptions)),
            };
          }).filter((s: any) => s.kind === 'choice' ? s.from.length > 0 : s.name)
        : [],
      optionGroups: r.isBundle === true ? [] : (groupsByItem.get(r.id) ?? []),
      _sort: [
        catOrder.get(parent?.id ?? leaf?.id ?? -1) ?? 9999,
        catOrder.get(leaf?.id ?? -1) ?? 9999,
        r.sortOrder ?? 0, r.id,
      ] as number[],
    };
  });

  // ترتيبٌ نهائيّ: قسمٌ رئيس ← فرعيّ ← ترتيب الصنف. الفرز هنا لأنّ الأقسام جدولٌ لا نصّ.
  mapped.sort((a, b) => {
    for (let i = 0; i < a._sort.length; i++) {
      if (a._sort[i] !== b._sort[i]) return a._sort[i] - b._sort[i];
    }
    return 0;
  });

  // الخانات جاهزةٌ بخياراتها من الأعلى — لا حاجة لمرورٍ ثانٍ
  return mapped.map(({ _sort, ...m }) => m);
}

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

    res.json({ success: true, items: await buildPlayerMenu(db, await effectiveMenuLocation(db, act.locationId)) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════
// 🧪 استعارة المنيو — موقع الاختبار يعرض منيو مكانٍ آخر ويُسعّر منه
// الغاية: تجربة منيو أيّ مكانٍ بفعاليّةٍ على Test Location بلا فتح فعاليّةٍ
// حقيقيّة عنده. **العرض والتسعير** وحدهما يُستعاران — الطلبات والفواتير
// والإشعارات تبقى على موقع الاختبار، فلا يصل موظّفي المكان الحقيقيّ شيء
// ولا تدخل تجربةٌ في حساباته.
// 🔒 تُحترم القيمة لمواقع الاختبار حصراً: مكانٌ حقيقيٌّ يستعير منيو غيره
//    يعني تسعيراً بأسعارِ سواه — بابُ خطأٍ ماليٍّ يُغلَق هنا لا في الواجهة.
// ══════════════════════════════════════════════════════
export async function effectiveMenuLocation(
  db: NonNullable<ReturnType<typeof getDB>>, locationId: number,
): Promise<number> {
  const [loc] = await db.select({
    isTest: locations.isTestLocation,
    src: locations.menuSourceLocationId,
  }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!loc || loc.isTest !== true || !loc.src) return locationId;
  // المصدر يجب أن يكون قائماً وغير محذوف — وإلّا عاد الموقع لمنيوه
  const [src] = await db.select({ id: locations.id }).from(locations)
    .where(and(eq(locations.id, loc.src), isNull(locations.deletedAt))).limit(1);
  return src ? src.id : locationId;
}

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

  // تطبيع البنود ودمج المكرَّر.
  // ⚙️ المفتاح = الصنف + توليفة خياراته: «أرجيلة/تفاحتين» و«أرجيلة/عنب» بندان
  // منفصلان لا واحدٌ بكمّية 2 — وإلّا حُضّرت نكهةٌ واحدة مرّتين.
  interface RawLine { menuItemId: number; quantity: number; options: unknown; componentOptions: unknown; slots: unknown }
  const linesByKey = new Map<string, RawLine>();
  for (const it of rawItems) {
    const id = parseInt(it?.menuItemId);
    const qty = parseInt(it?.quantity);
    if (!Number.isFinite(id) || !Number.isFinite(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ error: 'بند غير صالح (الكمّية 1-20)' });
    }
    const opts = Array.isArray(it?.options) ? it.options : [];
    const compOpts = Array.isArray(it?.componentOptions) ? it.componentOptions : [];
    // 🔑 خانات الباقة داخل بصمة الدمج: باقتان بنكهتين مختلفتين سطران مستقلّان،
    //    وبدونها كانتا تُدمجان في سطرٍ بكمّية ٢ فيضيع أحد الاختيارين.
    const slots = Array.isArray(it?.slots) ? it.slots : null;
    const sig = JSON.stringify([
      opts.map((o: any) => `${o?.group}|${o?.value}`).sort(),
      compOpts.map((c: any) => `${c?.menuItemId}:${(Array.isArray(c?.options) ? c.options : []).map((o: any) => `${o?.group}|${o?.value}`).sort().join(',')}`).sort(),
      (slots ?? []).map((s: any) => `${s?.i}:${s?.menuItemId ?? ''}:${(Array.isArray(s?.options) ? s.options : []).map((o: any) => `${o?.group}|${o?.value}`).sort().join(',')}`),
    ]);
    const key = `${id}#${sig}`;
    const prev = linesByKey.get(key);
    if (prev) prev.quantity = Math.min(prev.quantity + qty, 20);
    else linesByKey.set(key, { menuItemId: id, quantity: qty, options: opts, componentOptions: compOpts, slots });
  }
  const lines = [...linesByKey.values()];
  if (lines.length > MAX_ITEMS_PER_ORDER) return res.status(400).json({ error: 'عدد بنود الطلب كبير جدّاً' });

  try {
    const ctx = await resolveFnbContext(db, playerId);
    if (!ctx) return res.status(403).json({ error: 'لا يوجد نشاط متاح للطلب الآن' });
    if ('error' in ctx) return res.status(403).json({ error: ctx.error });

    // 📍 سياج الفعاليّة — الحارس هنا لا داخل resolveFnbContext عمداً:
    //    تلك يستخدمها GET /context وGET /menu أيضاً، والتصفّح مسموح — الإرسال وحده محروس.
    {
      const g = await gateCheck({
        playerId, activityId: ctx.activityId, fix: req.body?.fix, gate: 'order',
      });
      if (!g.ok) return res.status(403).json({ error: g.message, code: g.reason, distanceM: g.distanceM });
    }

    // سقف الطلبات المفتوحة لكل لاعب لكل فعاليّة (حماية من الإغراق)
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(orders)
      .where(and(eq(orders.playerId, playerId), eq(orders.activityId, ctx.activityId), ne(orders.status, 'cancelled')));
    if (cnt >= MAX_OPEN_ORDERS_PER_ACTIVITY) {
      return res.status(429).json({ error: 'وصلت حدّ الطلبات لهذه الفعاليّة — راجع المكان' });
    }

    // التسعير من قاعدة البيانات حصراً (لا نثق بأسعار العميل)
    const ids = [...new Set(lines.map(l => l.menuItemId))];
    // 🧪 التسعير من المنيو الفعّال (قد يكون مستعاراً لموقع اختبار) — الطلب نفسه
    //    يبقى على ctx.locationId فتصل إشعاراته وفواتيره لموقع الاختبار لا للمصدر
    const menuLocId = await effectiveMenuLocation(db, ctx.locationId);
    const dbItems = await db.select().from(menuItems)
      .where(and(inArray(menuItems.id, ids), eq(menuItems.locationId, menuLocId), eq(menuItems.isAvailable, true), isNull(menuItems.deletedAt)));
    if (dbItems.length !== ids.length) {
      return res.status(400).json({ error: 'بعض الأصناف لم تعد متاحة — حدّث المنيو وأعد المحاولة' });
    }
    const itemById = new Map(dbItems.map(m => [m.id, m]));

    // 🎁 مكوّنات الباقات: كلّ صنفٍ قد تشير إليه خانة — ثابتاً أو مرشَّحاً لاختيار
    const compIds = [...new Set(dbItems.filter(m => m.isBundle === true)
      .flatMap(m => slotItemIds(readSlots(m.bundleItems))))];
    // المحذوف ناعماً لا يدخل طلباً جديداً — resolveOrderSlots سيرفض برسالةٍ صريحة
    const compRows = compIds.length > 0
      ? await db.select().from(menuItems).where(and(inArray(menuItems.id, compIds), isNull(menuItems.deletedAt)))
      : [];
    const compById = new Map(compRows.map(c => [c.id, c]));

    // ⚙️ مجموعات الخيارات الفعّالة للأصناف ولمكوّنات الباقات معاً
    const groupsByItem = await resolveOptionGroups(db, [...dbItems, ...compRows]);

    // بناء البنود: تحقّقٌ من الخيارات وتسعيرٌ = السعر الأساسيّ + فروق الخيارات.
    // 💰 حصّة النادي تبقى مبلغ الصنف الثابت — الفروق للمكان (قرار مقفل).
    interface BuiltLine {
      item: typeof dbItems[number]; quantity: number; unitPrice: number;
      options: ChosenOption[]; components: { name: string; qty: number; options?: { group: string; value: string }[] }[];
    }
    const built: BuiltLine[] = [];
    try {
      for (const l of lines) {
        const m = itemById.get(l.menuItemId)!;
        const { chosen, delta } = validateSelections(m.isBundle === true ? [] : (groupsByItem.get(m.id) ?? []), l.options, m.name);

        // 🎁 خانات الباقة: الثابتة تُحلّ وحدها، والاختياريّة من `slots` التي أرسلها
        //    اللاعب. الشكل القديم `componentOptions` (مفتاحه menuItemId) يبقى مقبولاً
        //    للنسخ التي لم تُحدَّث بعد — أندرويد وiOS منها.
        let components: BuiltLine['components'] = [];
        let compDelta = 0;
        if (m.isBundle === true) {
          const slots = readSlots(m.bundleItems);
          let picks = Array.isArray(l.slots) ? l.slots : null;
          if (!picks) {
            // ترجمةُ الشكل القديم: خياراتٌ بمعرّف الصنف ⇐ خاناتٌ بالفهرس
            const byId = new Map<number, unknown>();
            for (const c of (Array.isArray(l.componentOptions) ? l.componentOptions as any[] : [])) {
              const cid = Number(c?.menuItemId);
              if (Number.isFinite(cid)) byId.set(cid, c?.options);
            }
            picks = slots.map((s, i) => s.kind === 'fixed'
              ? { i, options: byId.get(s.menuItemId) }
              : { i });
          }
          const r = resolveOrderSlots(slots, picks, m.name, compById as any, groupsByItem);
          components = r.components;
          compDelta = r.delta;
        }

        built.push({
          item: m, quantity: l.quantity,
          unitPrice: parseFloat(m.price) + delta + compDelta,
          options: chosen, components,
        });
      }
    } catch (e: any) {
      // رسائل validateSelections عربيّةٌ جاهزة للعرض
      return res.status(400).json({ error: e.message || 'خيارٌ غير صالح' });
    }

    const [playerRow] = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
    const total = built.reduce((s, b) => s + b.unitPrice * b.quantity, 0);
    const note = String(req.body.note || '').trim().slice(0, 300);

    // 🔁 مفتاح تكرارٍ اختياريّ من العميل: إعادة إرسال سلّةٍ ضاع ردّها لا تنشئ
    //    طلباً ثانياً — تعيد الأوّل نفسه (فهرسٌ فريد يقفل السباق أيضاً)
    const rawKey = String(req.body.clientKey || '').trim().slice(0, 40);
    const clientKey = /^[A-Za-z0-9-]{8,40}$/.test(rawKey) ? rawKey : null;
    if (clientKey) {
      const [dup] = await db.select({ id: orders.id, total: orders.total }).from(orders)
        .where(and(
          eq(orders.activityId, ctx.activityId),
          eq(orders.playerId, playerId),
          eq(orders.clientKey, clientKey),
        )).limit(1);
      if (dup) return res.json({ success: true, orderId: dup.id, replayed: true });
    }

    let order: any;
    try {
      order = await db.transaction(async (tx) => {
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
        clientKey,
      } as any).returning();
      await tx.insert(orderItems).values(built.map(b => ({
        orderId: o.id,
        menuItemId: b.item.id,
        nameSnapshot: b.item.name,
        unitPriceSnapshot: b.unitPrice.toFixed(2),
        clubShareSnapshot: b.item.clubShare || '0',
        quantity: b.quantity,
        componentsSnapshot: b.components,
        optionsSnapshot: b.options,
      })) as any);
      return o;
      });
    } catch (e: any) {
      // سباق نفس المفتاح من جهازين: الفهرس الفريد يرفض الثاني — نعيد الأوّل
      if (e?.code === '23505' && clientKey) {
        const [dup] = await db.select({ id: orders.id }).from(orders)
          .where(and(
            eq(orders.activityId, ctx.activityId),
            eq(orders.playerId, playerId),
            eq(orders.clientKey, clientKey),
          )).limit(1);
        if (dup) return res.json({ success: true, orderId: dup.id, replayed: true });
      }
      throw e;
    }

    // 📥 إشعار المكان الفوريّ: بثّ لغرفة location:{id} + بوش لحسابات المكان المصرَّح لها
    const emittedItems = built.map(b => ({
      name: b.item.name, unitPrice: b.unitPrice.toFixed(2), quantity: b.quantity,
      components: b.components, options: b.options,
    }));
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
    ).then(reachable => {
      // 🔊 صفر مستلمين = الإشعار ضاع في الفراغ: تحذيرٌ على الشاشة المفتوحة
      //    وتصعيدٌ للأدمن (مرّة بالساعة لكلّ مكان كي لا يغرق)
      if (reachable > 0) return;
      if (io) {
        io.to(`location:${ctx.locationId}`).emit('fnb:push-blackout', {
          message: `طلبٌ وصل ولا جهاز مسجّل يستلم إشعارات «${ctx.locationName}» — فعّلوا الإشعارات من شاشة الطلبات`,
        });
      }
      const last = pushBlackoutWarnedAt.get(ctx.locationId) || 0;
      if (Date.now() - last > 3600_000) {
        pushBlackoutWarnedAt.set(ctx.locationId, Date.now());
        sendPushToAdmins('🔕 إشعارات مكانٍ لا تصل أحداً',
          `«${ctx.locationName}»: طلباتٌ تصل ولا حساب مكانٍ لديه جهازٌ مسجّل — راجعوا شاشة الطلبات وفعّلوا الإشعارات`,
          'push_blackout', { url: '/venue/orders' },
        ).catch(() => {});
      }
    }).catch(err => console.error('❌ new_order push:', err.message));

    res.json({ success: true, order });
  } catch (err: any) {
    console.error('❌ fnb create order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /my-orders?activityId= — طلبات اللاعب لهذه الفعاليّة مع بنودها ──
// ════════════════════════════════════════
// 📍 POST /fix — اللاعب يُبلّغ عن موقعه
// يُنادى عند كلّ فتحة تطبيق، وعند العودة من الخلفيّة، وبنبضةٍ أثناء غرفةٍ حيّة.
// 🔴 لا يمنع شيئاً ولا يُرجِع خطأً: وظيفته تحديث النقطة لا الحراسة. الحراسة عند البوّابات.
// ════════════════════════════════════════
playerFnbRouter.post('/fix', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = req.playerAccount!.playerId;
  const fix = req.body?.fix;
  if (!isUsableFix(fix)) return res.json({ success: true, stored: false });
  try {
    await saveLastFix(playerId, fix);
    // 🗺️ دفعةٌ لحظيّة لخريطة الليدر — تصل سوكتات الموجّهين وحدهم (التصفية في السوكت)
    try {
      const io = req.app.get('io');
      if (io) {
        const { emitFixToLeaders } = await import('../sockets/geofence.socket.js');
        await emitFixToLeaders(io, playerId, fix);
      }
    } catch (e: any) { console.warn('⚠️ [fix] بثّ فاشل:', e.message); }
    res.json({ success: true, stored: true });
  } catch (err: any) {
    console.warn('⚠️ [fix] تعذّر الحفظ:', err.message);
    res.json({ success: true, stored: false });
  }
});

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
          components: Array.isArray(i.componentsSnapshot) ? i.componentsSnapshot : [],
          options: Array.isArray(i.optionsSnapshot) ? i.optionsSnapshot : [],
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
    // 🔴 قيمة الطلب قد تكون داخل فاتورةٍ حُصِّلت نقداً: إلغاؤه بعدها يجعل المكان
    //    قابضاً ثمن طلبٍ ملغى وتقارير الدخل تسقطه — الإلغاء بعد التحصيل بيد المكان لا اللاعب
    const [target] = await db.select({ activityId: orders.activityId }).from(orders)
      .where(and(eq(orders.id, id), eq(orders.playerId, playerId))).limit(1);
    if (target) {
      const [paidInv] = await db.select({ id: orderInvoices.id }).from(orderInvoices)
        .where(and(
          eq(orderInvoices.activityId, target.activityId),
          eq(orderInvoices.playerId, playerId),
          eq(orderInvoices.isPaid, true),
        )).limit(1);
      if (paidInv) return res.status(400).json({ error: 'فاتورتك حُصِّلت — راجع المكان لأيّ تعديل' });
    }

    const [o] = await db.update(orders).set({ status: 'cancelled', statusChangedAt: new Date() } as any)
      .where(and(eq(orders.id, id), eq(orders.playerId, playerId), eq(orders.status, 'new')))
      .returning();
    if (!o) return res.status(400).json({ error: 'لا يمكن إلغاء الطلب — بدأ تحضيره أو غير موجود' });

    // 🔔 الكونسول يعرف فوراً: بلا هذا البثّ كانت التذكرة تبقى «بانتظار» على
    //    الشاشة حتى دورة المسح، فيبدأ الموظّف تحضير طلبٍ ملغى
    const io = req.app.get('io');
    if (io) io.to(`location:${o.locationId}`).emit('fnb:order-updated', { orderId: o.id, status: 'cancelled', activityId: o.activityId });

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════
// 💨 خدمة الأرجيلة — فحمٌ أو تزبيط
// ليست طلباً: بلا سعرٍ ولا فاتورةٍ ولا أثرٍ في تقارير الدخل. إشارةٌ تصل
// مسؤول الأراجيل وتُغلَق حين يستجيب.
// ════════════════════════════════════════════

const SERVICE_KINDS: Record<string, string> = { coal: 'فحم', fix: 'تزبيط الأرجيلة' };

/** هل استلم اللاعب أرجيلةً في هذه الفعاليّة؟ الخدمة بلا أرجيلةٍ بلا معنى. */
async function hasDeliveredShisha(
  db: NonNullable<ReturnType<typeof getDB>>, activityId: number, playerId: number,
): Promise<boolean> {
  // الاسم الملقوط لحظة الطلب هو المرجع — الصنف قد يُعاد تسميته أو يُحذف لاحقاً،
  // وبنود الباقة تحمل الأرجيلة داخل components_snapshot لا كصنفٍ مستقلّ.
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.activityId, activityId),
      eq(orders.playerId, playerId),
      eq(orders.status, 'delivered'),
      // «رجيل» تلتقط أرجيلة/الأراجيل، و«شيش» تلتقط شيشة/الشيشة — مرادفان شائعان
      sql`(${orderItems.nameSnapshot} LIKE '%رجيل%' OR ${orderItems.nameSnapshot} LIKE '%شيش%'
           OR ${orderItems.componentsSnapshot}::text LIKE '%رجيل%' OR ${orderItems.componentsSnapshot}::text LIKE '%شيش%')`,
    ));
  return (row?.n ?? 0) > 0;
}

// ── GET /service/state — هل تُعرض البطاقة، وهل ثمّة طلبٌ معلَّق؟ ──
playerFnbRouter.get('/service/state', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = req.playerAccount!.playerId;
  try {
    const ctx = await resolveFnbContext(db, playerId);
    if (!ctx || 'error' in ctx) return res.json({ success: true, available: false, pending: null });

    const [pending] = await db.select({
      id: serviceRequests.id, kind: serviceRequests.kind, createdAt: serviceRequests.createdAt,
    }).from(serviceRequests)
      .where(and(
        eq(serviceRequests.activityId, ctx.activityId),
        eq(serviceRequests.playerId, playerId),
        eq(serviceRequests.status, 'open'),
      )).limit(1);

    res.json({
      success: true,
      available: await hasDeliveredShisha(db, ctx.activityId, playerId),
      pending: pending || null,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── POST /service — طلب فحمٍ أو تزبيط ──
playerFnbRouter.post('/service', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = req.playerAccount!.playerId;

  const kind = String(req.body?.kind || '');
  if (!SERVICE_KINDS[kind]) return res.status(400).json({ error: 'نوع الخدمة غير معروف' });
  const note = String(req.body?.note || '').trim().slice(0, 120);

  try {
    const ctx = await resolveFnbContext(db, playerId);
    // 📍 نفس سياج الطلب — طلب الخدمة حضورٌ في المكان مثله تماماً
    if (!ctx) return res.status(403).json({ error: 'لا يوجد نشاط متاح الآن' });
    if ('error' in ctx) return res.status(403).json({ error: ctx.error });

    // 📍 نفس سياج الطلب — طلب خدمة الأرجيلة حضورٌ في المكان مثله تماماً.
    //    تفريقهما يخلق ثغرةً مربكة: ممنوعٌ من الطلب ومسموحٌ له باستدعاء الفحم.
    {
      const g = await gateCheck({
        playerId, activityId: ctx.activityId, fix: req.body?.fix, gate: 'service',
      });
      if (!g.ok) return res.status(403).json({ error: g.message, code: g.reason, distanceM: g.distanceM });
    }

    if (!(await hasDeliveredShisha(db, ctx.activityId, playerId))) {
      return res.status(400).json({ error: 'لا توجد أرجيلةٌ مُسلَّمة باسمك في هذه الفعاليّة' });
    }

    // 🔒 طلبٌ معلَّقٌ واحد: خمس ضغطاتٍ متلاحقة كانت خمسة إشعاراتٍ لموظّفٍ واحد
    const [open] = await db.select({ id: serviceRequests.id }).from(serviceRequests)
      .where(and(
        eq(serviceRequests.activityId, ctx.activityId),
        eq(serviceRequests.playerId, playerId),
        eq(serviceRequests.status, 'open'),
      )).limit(1);
    if (open) return res.status(429).json({ error: 'طلبك السابق ما زال قيد التنفيذ — الموظّف في الطريق' });

    const [p] = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
    // 🔒 إدراجٌ مشروطٌ ذرّيّاً (INSERT..SELECT WHERE NOT EXISTS): ضغطتان متسارعتان
    //    كانتا تمرّان معاً من فحص SELECT فتصير فحمَين وإشعارَين وسَيلَي تذكير
    const insRes: any = await db.execute(sql`
      INSERT INTO service_requests (activity_id, location_id, player_id, player_name, kind, note, physical_id)
      SELECT ${ctx.activityId}, ${ctx.locationId}, ${playerId}, ${p?.name || 'لاعب'}, ${kind}, ${note}, ${ctx.physicalId}
      WHERE NOT EXISTS (
        SELECT 1 FROM service_requests
        WHERE activity_id = ${ctx.activityId} AND player_id = ${playerId} AND status = 'open')
      RETURNING *`);
    const raw = (insRes?.rows ?? insRes)?.[0];
    if (!raw) return res.status(429).json({ error: 'طلبك السابق ما زال قيد التنفيذ — الموظّف في الطريق' });
    const row = { id: raw.id, activityId: raw.activity_id, locationId: raw.location_id, playerId: raw.player_id,
      playerName: raw.player_name, kind: raw.kind, note: raw.note, physicalId: raw.physical_id,
      status: raw.status, createdAt: raw.created_at };

    const label = SERVICE_KINDS[kind];
    const io = req.app.get('io');
    if (io) io.to(`location:${ctx.locationId}`).emit('fnb:service-request', { ...row, label });
    sendPushToLocationStaff(
      ctx.locationId, 'service.shisha', `💨 ${label}`,
      `${p?.name || 'لاعب'}${ctx.physicalId ? ` — مقعد ${ctx.physicalId}` : ''}${note ? ` · ${note}` : ''}`,
      'service_request', { requestId: String(row.id) },
    ).catch(() => {});

    res.status(201).json({ success: true, request: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET /service — الطلبات المفتوحة لفعاليّة (شاشة المكان) ──
venueRouter.get('/service', authenticate, requireVenuePermission('service.shisha'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  try {
    const rows = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.locationId, locId), eq(serviceRequests.status, 'open')))
      .orderBy(asc(serviceRequests.createdAt));
    res.json({ success: true, requests: rows.map(r => ({ ...r, label: SERVICE_KINDS[r.kind] || r.kind })) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PUT /service/:id/done — إغلاق الطلب ──
venueRouter.put('/service/:id/done', authenticate, requireVenuePermission('service.shisha'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = resolveVenueLocation(req, res);
  if (!locId) return;
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try {
    const [row] = await db.update(serviceRequests)
      .set({ status: 'done', resolvedBy: req.user!.id, resolvedAt: new Date() } as any)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.locationId, locId), eq(serviceRequests.status, 'open')))
      .returning();
    if (!row) return res.status(404).json({ error: 'الطلب غير موجود أو أُغلق' });

    const io = req.app.get('io');
    if (io) {
      io.to(`location:${locId}`).emit('fnb:service-done', { id: row.id });
      // اللاعب يرى بطاقته تعود قابلةً للضغط بلا تحديثٍ يدويّ
      io.to(`player:${row.playerId}`).emit('fnb:service-done', { id: row.id });
    }
    sendPushToPlayer(
      row.playerId, '💨 تمّت خدمة أرجيلتك',
      SERVICE_KINDS[row.kind] || 'تمّ', 'service_done',
    ).catch(() => {});
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
