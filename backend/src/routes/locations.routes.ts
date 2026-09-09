// ══════════════════════════════════════════════════════
// 📍 مسارات المواقع — Locations Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDB } from '../config/db.js';
import { locations, staff, notifications, userSettings, cities } from '../schemas/admin.schema.js';
import { authenticate, managerOrAbove, adminOnly } from '../middleware/auth.js';
import { getCity } from '../services/cities.service.js';
import { getActiveRegularSeasonId } from '../services/season.service.js';

const router = Router();

// 🏙️ المدينة إلزاميّة: تُستخدم في فلترة الفعاليّات واحتساب نقاط الرانك — لا يُحفظ المكان بدونها
async function parseCityId(raw: unknown): Promise<{ cityId: number } | { error: string; code: string }> {
  const id = parseInt(String(raw));
  if (!Number.isFinite(id) || id <= 0) return { error: 'المدينة مطلوبة', code: 'CITY_REQUIRED' };
  const city = await getCity(id);
  if (!city) return { error: 'المدينة غير موجودة', code: 'CITY_NOT_FOUND' };
  return { cityId: id };
}

// Helper: generate username from location name
function generateUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'location';
}

// Helper: كلمة مرور عشوائيّة قويّة (لا نكرّر نمط username+'123' الضعيف)
// صلاحيّات صاحب المكان الكاملة — مطابقة لـVENUE_PERMISSIONS في middleware/auth.ts
const OWNER_PERMISSIONS = ['orders.receive', 'orders.manage', 'invoices.print', 'menu.manage', 'payments.record', 'service.shisha'];

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!#%';
  return Array.from(crypto.randomBytes(12)).map(b => chars[b % chars.length]).join('');
}

// GET /api/locations
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  // المحذوف ناعماً لا يُعرض — العمود كان موجوداً وغير مستعمل، فكان الحذف صلباً
  // 🏙️ + اسم المدينة + عدد مباريات المكان في الموسم النشط (لتحذير نقل المدينة في النموذج)
  const seasonId = await getActiveRegularSeasonId();
  const rows = await db.select({
    loc: locations,
    cityName: cities.name,
    activeSeasonMatches: sql<number>`(
      SELECT COUNT(*)::int FROM matches m
      JOIN sessions s ON s.id = m.session_id
      LEFT JOIN activities a ON a.id = s.activity_id
      WHERE COALESCE(s.location_id, a.location_id) = ${locations.id}
        AND m.season_id = ${seasonId ?? -1} AND m.deleted_at IS NULL)`,
  }).from(locations)
    .leftJoin(cities, eq(locations.cityId, cities.id))
    .where(isNull(locations.deletedAt))
    .orderBy(desc(locations.id));
  res.json(rows.map(r => ({ ...r.loc, cityName: r.cityName ?? null, activeSeasonMatches: Number(r.activeSeasonMatches || 0) })));
});

// POST /api/locations — إنشاء موقع (+ حساب مالك) — مدير فأعلى فقط (يمنع تصعيد الصلاحية)
router.post('/', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { name, region, mapUrl, offers, ownerUsername, isActive, isTestLocation } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  const cityRes = await parseCityId(req.body.cityId);
  if ('error' in cityRes) return res.status(400).json(cityRes);

  const result = await db.insert(locations).values({
    name,
    // 🏙️ المدينة — إلزاميّة (مواقع الاختبار أيضاً؛ استثناؤها من الرانك بعلم isTestLocation كما هو)
    cityId: cityRes.cityId,
    region: String(region || '').trim().slice(0, 80),
    mapUrl: mapUrl || '',
    offers: Array.isArray(offers) ? offers : [],
    // 🔌 فعّال: بوت واتساب يذكر الأماكن الفعّالة فقط
    isActive: isActive !== false,
    // 🧪 مكان اختبار: فعاليّاته لا تظهر إلّا لحسابات الاختبار
    isTestLocation: isTestLocation === true,
    // 🧪 استعارة منيو منذ الإنشاء — تُحترم لمواقع الاختبار حصراً في effectiveMenuLocation
    menuSourceLocationId: Number.isFinite(parseInt(String(req.body.menuSourceLocationId)))
      ? parseInt(String(req.body.menuSourceLocationId)) : null,
    // 💳 الحدّ الأدنى للاستهلاك — الافتراضيّ 2.00 معطَّلاً حتى يُفعَّل من هنا
    minChargeEnabled: req.body.minChargeEnabled === true,
    // 💧 ماءٌ تلقائيّ على كلّ فاتورة — يُستثنى من طلبه ماءً أو عرضاً يحويه
    autoWater: req.body.autoWater === true,
    minimumCharge: Number.isFinite(parseFloat(String(req.body.minimumCharge))) && parseFloat(String(req.body.minimumCharge)) >= 0
      ? parseFloat(String(req.body.minimumCharge)).toFixed(2) : '2.00',
  } as any).returning();

  const locationId = result[0].id;

  // Auto-create location_owner account
  let finalUsername = ownerUsername?.trim() || generateUsername(name);
  const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, finalUsername)).limit(1);
  if (existing.length > 0) finalUsername = finalUsername + locationId;

  // 🔑 كلمة مرور عشوائيّة — كانت `username+'123'` أي مخمَّنةٌ من اسم المكان العلنيّ
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  const staffResult = await db.insert(staff).values({
    username: finalUsername,
    passwordHash: hash,
    displayName: name,
    role: 'location_owner',
    locationId,
    // 🔴 كانت [] — فالحساب المُنشأ تلقائيّاً يُسلَّم لصاحب المكان وهو **معطّل
    // كليّاً**: بلا تبويبات وكلّ نداء يردّ 403، رغم عرض بيانات دخوله كأنّه جاهز.
    permissions: OWNER_PERMISSIONS,
  } as any).returning();

  await db.insert(userSettings).values({ userId: staffResult[0].id } as any).onConflictDoNothing();

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      title: 'مكان جديد',
      message: `تم إضافة مكان فعالية جديد: ${name}`,
      type: 'new_location',
      targetId: `location-${locationId}`,
    } as any);
  }

  res.status(201).json({
    ...result[0],
    ownerAccount: { username: finalUsername, password },
  });
});

// PUT /api/locations/:id
router.put('/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, region, mapUrl, isActive, isTestLocation } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  // 🔴 `offers` لا يُكتَب هنا إطلاقاً: أرشيفٌ مقروءٌ فقط تخدمه الفعاليّات
  // المفتوحة عليه. كان التعديل يعيد كتابته من شكلٍ فاقدٍ في الواجهة فيُتلفه.
  // الحقول غير المُرسَلة تبقى كما هي — لا تُصفَّر بالسهو.
  const patch: Record<string, unknown> = {
    name,
    region: String(region || '').trim().slice(0, 80),
    mapUrl: mapUrl || '',
  };
  // 🏙️ نقلُ مكانٍ إلى مدينةٍ أخرى مسموحٌ (بتحذيرٍ في الواجهة): يسري على المباريات القادمة فقط —
  //    التاريخُ مختومٌ بمدينته على matches.city_id فلا يُعاد كتابته.
  if (req.body.cityId !== undefined) {
    const cityRes = await parseCityId(req.body.cityId);
    if ('error' in cityRes) return res.status(400).json(cityRes);
    patch.cityId = cityRes.cityId;
  }
  if (isActive !== undefined) patch.isActive = isActive !== false;
  if (isTestLocation !== undefined) patch.isTestLocation = isTestLocation === true;

  // 📍 نقطة السياج — مسارٌ إداريّ موازٍ لـPUT /api/venue/location.
  //    من يدير الأماكن كلّها لا يُطالَب بتسجيل دخولٍ بحساب كلّ مكان ليضبط دبّوساً.
  //    وإرسال null يمسح النقطة (فيُعطّل السياج تلقائيّاً على فعاليّاته).
  if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
    const lat = req.body.latitude === null ? null : parseFloat(String(req.body.latitude));
    const lng = req.body.longitude === null ? null : parseFloat(String(req.body.longitude));
    if (lat === null || lng === null) {
      patch.latitude = null; patch.longitude = null;
      patch.geofenceSetBy = null; patch.geofenceSetAt = null;
    } else {
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) return res.status(400).json({ error: 'خطّ العرض غير صالح' });
      if (!Number.isFinite(lng) || Math.abs(lng) > 180) return res.status(400).json({ error: 'خطّ الطول غير صالح' });
      patch.latitude = String(lat); patch.longitude = String(lng);
      patch.geofenceSetBy = req.user?.id ?? null;
      patch.geofenceSetAt = new Date();
    }
  }
  if (req.body.geofenceRadiusM !== undefined) {
    const r = parseInt(String(req.body.geofenceRadiusM));
    // أقلّ من ٥٠م يرفض جالساً على الطاولة (دقّة GPS داخل مقهىً وحدها تتجاوزه)
    if (!Number.isFinite(r) || r < 50 || r > 2000) return res.status(400).json({ error: 'نصف القطر بين ٥٠ و٢٠٠٠ متر' });
    patch.geofenceRadiusM = r;
  }

  // 🧪 استعارة منيو (لمواقع الاختبار): null يفكّها، ورقمٌ يجب أن يكون مكاناً
  //    قائماً غير المكان نفسه. الفرضُ الفعليّ في effectiveMenuLocation.
  if (req.body.menuSourceLocationId !== undefined) {
    const raw = req.body.menuSourceLocationId;
    if (raw === null || raw === '') {
      patch.menuSourceLocationId = null;
    } else {
      const srcId = parseInt(String(raw));
      if (!Number.isFinite(srcId)) return res.status(400).json({ error: 'مصدر المنيو غير صالح' });
      if (srcId === id) return res.status(400).json({ error: 'لا يمكن للمكان أن يستعير منيو نفسه' });
      const [src] = await db.select({ id: locations.id }).from(locations)
        .where(and(eq(locations.id, srcId), isNull(locations.deletedAt))).limit(1);
      if (!src) return res.status(400).json({ error: 'مصدر المنيو غير موجود' });
      patch.menuSourceLocationId = srcId;
    }
  }

  // 💳 الحدّ الأدنى للاستهلاك: تفعيلٌ ومبلغٌ — غير المُرسَل يبقى كما هو
  if (req.body.minChargeEnabled !== undefined) patch.minChargeEnabled = req.body.minChargeEnabled === true;
  if (req.body.autoWater !== undefined) patch.autoWater = req.body.autoWater === true;
  if (req.body.minimumCharge !== undefined) {
    const v = parseFloat(String(req.body.minimumCharge));
    if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'الحدّ الأدنى غير صالح' });
    patch.minimumCharge = v.toFixed(2);
  }

  await db.update(locations).set(patch as any).where(eq(locations.id, id));

  res.json({ success: true });
});

// ══════════════════════════════════════════════════════
// 🏙️ PATCH /api/locations/:id/city — نقلُ مكانٍ إلى مدينةٍ أخرى
// ══════════════════════════════════════════════════════
// 🔴 مسارٌ مستقلٌّ عن PUT عمداً: الأخيرُ يكتب name/region/mapUrl من الجسم دائماً،
//    فطلبٌ يحمل المدينةَ وحدَها يمسح المنطقةَ ورابطَ الخريطة. هذا يلمس عموداً واحداً.
//
// 🔒 التاريخُ مجمَّد: matches.city_id مختومٌ لحظةَ اللعب، فالنقلُ يسري على المباريات
//    القادمة وحدَها. نُعيد عددَ مبارياته في الموسم النشط كي تعرضه الواجهةُ قبل التأكيد.
router.patch('/:id/city', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

  const [loc] = await db.select({ id: locations.id, name: locations.name, cityId: locations.cityId })
    .from(locations).where(and(eq(locations.id, id), isNull(locations.deletedAt))).limit(1);
  if (!loc) return res.status(404).json({ error: 'المكان غير موجود' });

  const cityRes = await parseCityId(req.body?.cityId);
  if ('error' in cityRes) return res.status(400).json(cityRes);
  if (cityRes.cityId === loc.cityId) return res.json({ success: true, unchanged: true, cityId: loc.cityId });

  await db.update(locations).set({ cityId: cityRes.cityId } as any).where(eq(locations.id, id));

  const seasonId = await getActiveRegularSeasonId();
  const frozen: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM matches m
    JOIN sessions s ON s.id = m.session_id
    LEFT JOIN activities a ON a.id = s.activity_id
    WHERE COALESCE(s.location_id, a.location_id) = ${id}
      AND m.season_id = ${seasonId ?? -1} AND m.deleted_at IS NULL`);
  const frozenMatches = Number((frozen?.rows ?? frozen ?? [])[0]?.n || 0);

  console.log(`🏙️ Location #${id} (${loc.name}) moved city ${loc.cityId} → ${cityRes.cityId} — ${frozenMatches} past match(es) keep their stamped city`);
  res.json({ success: true, cityId: cityRes.cityId, previousCityId: loc.cityId, frozenMatches });
});

// DELETE /api/locations/:id
router.delete('/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

  // 🔴 كان حذفاً صلباً — و menu_items / menu_categories / menu_option_groups
  // كلّها ON DELETE CASCADE، فحذف مكانٍ كان **يمحو منيوه وأقسامه وخياراته نهائيّاً**
  // بلا إنذار (أو يفشل بخطأ مفتاحٍ أجنبيّ إن كانت له طلبات). الآن حذفٌ ناعم:
  // البيانات تبقى، والمكان يختفي من القوائم، وحساباته تُوقَف فلا تدخل مكاناً ميّتاً.
  const [existing] = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(and(eq(locations.id, id), isNull(locations.deletedAt))).limit(1);
  if (!existing) return res.status(404).json({ error: 'المكان غير موجود' });

  await db.update(locations).set({ deletedAt: new Date() } as any).where(eq(locations.id, id));
  const stopped = await db.update(staff).set({ isActive: false } as any)
    .where(and(eq(staff.locationId, id), eq(staff.role, 'location_owner'), isNull(staff.deletedAt)))
    .returning({ id: staff.id });

  console.log(`🗑️ Location #${id} (${existing.name}) soft-deleted — ${stopped.length} venue account(s) deactivated`);
  res.json({ success: true, deactivatedAccounts: stopped.length });
});

// ── 🍽️ الحسابات المرتبطة بالمكان ──────────────────────

// GET /api/locations/:id/staff — قائمة الحسابات المرتبطة (admin only)
router.get('/:id/staff', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

  const rows = await db.select({
    id: staff.id, username: staff.username, displayName: staff.displayName,
    permissions: staff.permissions, isActive: staff.isActive, lastLogin: staff.lastLogin,
  }).from(staff)
    .where(and(eq(staff.locationId, id), eq(staff.role, 'location_owner'), isNull(staff.deletedAt)))
    .orderBy(staff.id);
  res.json({ success: true, accounts: rows });
});

// POST /api/locations/:id/staff — إنشاء حساب مرتبط إضافيّ (admin only)
// كلمة مرور عشوائيّة تُعاد مرّة واحدة فقط في الاستجابة.
router.post('/:id/staff', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  const [loc] = await db.select({ id: locations.id, name: locations.name }).from(locations)
    .where(and(eq(locations.id, id), isNull(locations.deletedAt))).limit(1);
  if (!loc) return res.status(404).json({ error: 'المكان غير موجود' });

  const { username, displayName, permissions } = req.body || {};
  let finalUsername = String(username || '').trim() || `${generateUsername(loc.name)}_${Date.now() % 1000}`;
  const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, finalUsername)).limit(1);
  if (existing.length > 0) return res.status(409).json({ error: 'اسم المستخدم موجود بالفعل' });

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  const [created] = await db.insert(staff).values({
    username: finalUsername,
    passwordHash: hash,
    displayName: String(displayName || '').trim() || loc.name,
    role: 'location_owner',
    locationId: id,
    permissions: Array.isArray(permissions) ? permissions : [],
  } as any).returning({ id: staff.id, username: staff.username, displayName: staff.displayName, permissions: staff.permissions });

  await db.insert(userSettings).values({ userId: created.id } as any).onConflictDoNothing();

  console.log(`🍽️ Linked venue account #${created.id} (${created.username}) → location #${id}`);
  res.status(201).json({ success: true, account: created, password }); // كلمة المرور تُعرض مرّة واحدة
});

export default router;
