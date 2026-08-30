// ══════════════════════════════════════════════════════
// 📱 مسارات تطبيق اللاعب — Player App Routes
// ⚠️ ترتيب مهم: static routes أولاً ثم parameterized
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, ne, desc, and, sql, inArray, or, isNull, ilike } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players, playerFollows } from '../schemas/player.schema.js';
import { matchPlayers, matches, sessions } from '../schemas/game.schema.js';
import { bookings, activities, locations, reservations } from '../schemas/admin.schema.js';
import { menuItems } from '../schemas/fnb.schema.js';
import { buildPlayerMenu, effectiveMenuLocation } from './fnb.routes.js';
import { authenticatePlayer, requireNoPendingFeedback } from '../middleware/player-auth.middleware.js';
import { buildDisplayBreakdown } from '../services/progression.service.js';
import { getProgressionConfig } from './progression-settings.routes.js';
import { buildActivityPulse, hasBooking } from '../services/activity-pulse.query.js';

const router = Router();

// ════════════════════════════════════════════
// 🔒 STATIC ROUTES FIRST (قبل /:id)
// ════════════════════════════════════════════

// ── 🏆 GET /leaderboard (ترتيب الموسم العادي النشط — من players.*) ──
// ⚠️ لاعبو الموسم فقط (total_matches > 0): بعد بدء موسم جديد يتساوى الجميع على صفر/مُخبر،
// فبلا هذا الشرط تعرض اللوحة خمسين اسماً بترتيبٍ اعتباطي وكأنهم متصدّرون بلا لعب.
router.get('/leaderboard', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const rows = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
      xp: players.xp,
      rankTier: players.rankTier,
      rankRR: players.rankRR,
      totalMatches: players.totalMatches,
      totalWins: players.totalWins,
    })
      .from(players)
      .where(sql`COALESCE(${players.totalMatches}, 0) > 0`)
      .orderBy(
        sql`CASE ${players.rankTier}
          WHEN 'GODFATHER' THEN 5
          WHEN 'UNDERBOSS' THEN 4
          WHEN 'CAPO' THEN 3
          WHEN 'SOLDIER' THEN 2
          ELSE 1 END DESC`,
        desc(players.rankRR),
        desc(players.level)
      )
      .limit(50);

    res.json({ success: true, leaderboard: rows });
  } catch (err: any) {
    console.error('❌ leaderboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 🔎 GET /search?q= — بحث عن لاعب لإرسال دعوة (بالاسم جزئيّاً أو برقم الهاتف تامّاً) ──
// الخصوصيّة: الاسم مطابقة جزئيّة، أمّا الهاتف فمطابقة تامّة حصريّاً (لا تخمين بجزءٍ من الرقم)،
// ولا يُعاد الهاتف في النتائج إطلاقاً. يستبعد الباحث نفسه.
router.get('/search', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const callerId = req.playerAccount?.playerId;
  const raw = String(req.query.q || '').trim();
  if (raw.length < 2) return res.json({ success: true, results: [] });

  // مطابقة جزئيّة لكليهما (بلا حساسيّة لحالة الأحرف): بالاسم أو بجزءٍ من الرقم — لا يلزم الرقم كاملاً.
  // النتائج لا تُعيد الهاتف إطلاقاً (id/name/avatar فقط).
  const nameQ = raw.replace(/[%_]/g, '');       // تحييد رموز LIKE
  const phoneQ = raw.replace(/[\s%_-]/g, '');   // أرقام/رمز فقط

  try {
    const match = or(ilike(players.name, `%${nameQ}%`), ilike(players.phone, `%${phoneQ}%`));

    const results = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
    })
      .from(players)
      .where(callerId ? and(ne(players.id, callerId), match) : match)
      .limit(20);

    res.json({ success: true, results });
  } catch (err: any) {
    console.error('❌ player search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
// ══════════════════════════════════════════════════════
// ❌ DELETE /book/:activityId — اللاعب يُلغي حجزه بنفسه
// ══════════════════════════════════════════════════════
// 🔴 يمرّ بالمرآة كما يمرّ حذفُ الموظّف: يُحذف صفُّ الحجز **ويُنزَّل وسمُ المتابعة**
//    ويعود صفُّها «غير مثبَّت». وإلّا بقيت المتابعة تقول «له حجز» ولا حجز، فيسقط
//    من العدّ ويُردّ إن حاول الحجز ثانيةً.
// 🔴 حارسان لا ثالث لهما: المدفوع لا يُلغى من التطبيق (مالٌ يحتاج يداً بشريّة)،
//    والفعاليّةُ التي بدأت لا يُنسحب منها — الإلغاء بعد البدء إخلالٌ لا اعتذار.
router.delete('/book/:activityId', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const player = (req as any).playerAccount;
  if (!player?.playerId) return res.status(401).json({ error: 'غير مصادق' });

  const activityId = parseInt(req.params.activityId);
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const [act] = await db.select({ id: activities.id, name: activities.name, date: activities.date })
      .from(activities)
      .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
      .limit(1);
    if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

    if (act.date && new Date(act.date).getTime() <= Date.now()) {
      return res.status(409).json({ error: 'بدأت الفعاليّة — تعذّر الإلغاء. كلّم موجّه اللعبة' });
    }

    const [bk] = await db.select()
      .from(bookings)
      .where(and(
        eq(bookings.activityId, activityId),
        isNull(bookings.deletedAt),
        or(
          eq(bookings.playerId, player.playerId),
          player.phone ? eq(bookings.phone, player.phone) : sql`false`,
        ),
      ))
      .limit(1);
    if (!bk) return res.status(404).json({ error: 'لا حجزَ لك في هذه الفعاليّة' });

    if (bk.isPaid === true && bk.isFree !== true) {
      return res.status(409).json({ error: 'حجزك مدفوع — راجع الإدارة للإلغاء' });
    }

    await db.update(bookings).set({ deletedAt: new Date() } as any).where(eq(bookings.id, bk.id));

    // 🔗 المرآة — نفس ما يفعله حذفُ الموظّف وفكُّ التثبيت
    await db.update(reservations).set({
      appConfirmed: false, appConfirmedAt: null, status: 'pending', updatedAt: new Date(),
    } as any).where(and(
      eq(reservations.activityId, activityId),
      isNull(reservations.deletedAt),
      or(
        eq(reservations.playerId, player.playerId),
        player.phone ? eq(reservations.phone, player.phone) : sql`false`,
      ),
    ));

    console.log(`❌ [player-app] اللاعب #${player.playerId} ألغى حجزه في الفعاليّة #${activityId}`);

    // 🔔 الإدارة تعرف بالإلغاء كما تعرف بالحجز — الغيابُ المفاجئ يُربك الطاولة
    try {
      const { sendPushToStaffByPermission } = await import('../services/fcm.service.js');
      sendPushToStaffByPermission(
        'bookings', '❌ إلغاء حجز (تطبيق)',
        `${player.name} ألغى حجزه في ${act.name}`,
        'booking_cancelled', { activityId: String(activityId), url: '/admin/reservations' },
      );
    } catch { /* الإشعار خدمةٌ لا شرط */ }

    res.json({ success: true, activityId });
  } catch (err: any) {
    console.error('❌ cancel booking error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── 🎟️ POST /book — حجز نشاط (لنفسه فقط) — يتطلب إكمال استبيانات الفعاليات السابقة ──
router.post('/book', authenticatePlayer, requireNoPendingFeedback, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const { activityId } = req.body;
  const player = (req as any).playerAccount;

  if (!activityId) return res.status(400).json({ error: 'activityId مطلوب' });
  if (!player) return res.status(401).json({ error: 'غير مصادق' });

  try {
    // التحقق من النشاط
    const actRows = await db.select().from(activities)
      .where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);

    if (actRows.length === 0) return res.status(404).json({ error: 'النشاط غير موجود' });
    const activity = actRows[0];

    // 🎟️ الحجز مفتوح بلا سقف (قرار تشغيلي): اللاعبون يتناوبون بين الألعاب،
    // فالعبرة بالحضور الفعلي لا بعدد الحجوزات. سعة المقاعد تخص الغرفة فقط
    // (انظر services/capacity.service.ts — شجرة قرار سعة الغرفة).

    // التحقق من عدم الحجز المسبق (بالهاتف أو playerId)
    const existingBooking = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.activityId, activityId),
        isNull(bookings.deletedAt),
        or(
          eq(bookings.phone, player.phone),
          player.playerId ? eq(bookings.playerId, player.playerId) : sql`false`
        )
      ))
      .limit(1);

    if (existingBooking.length > 0) {
      return res.status(409).json({ error: 'محجوز مسبقاً لهذا النشاط' });
    }

    // التحقق من حالة الحساب المجاني
    let isFreeAccount = false;
    if (player.playerId) {
      const pRow = await db.select({ isFreeAccount: players.isFreeAccount }).from(players).where(eq(players.id, player.playerId)).limit(1);
      isFreeAccount = pRow[0]?.isFreeAccount || false;
    }

    // إنشاء الحجز (count=1 دائماً — لنفسه فقط)
    // 🔴 offerId هو **فهرس** في locations.offers، وصفرٌ فهرسٌ صحيح.
    //    كان الشرط `offerId ? [offerId] : []` يبتلع الاختيار الأول صامتاً:
    //    فاللاعب الذي يختار أول باقة يُسجَّل كمن لم يختر شيئاً — يختفي من
    //    تقرير مبيعات الإضافات، وتُتخطّى بوّابة سعر التذكرة في اللوبي التي
    //    تمنع الدخول عند دفعٍ ناقص. وُجد بالاختبار من التطبيق.
    const rawOfferId = req.body.offerId;
    const offerId = Number.isInteger(rawOfferId) && rawOfferId >= 0 ? rawOfferId : null;
    const result = await db.insert(bookings).values({
      activityId,
      name: player.name,
      phone: player.phone,
      count: 1,
      isPaid: isFreeAccount,
      paidAmount: '0',
      isFree: isFreeAccount,
      playerId: player.playerId,
      createdBy: 'player-app',
      offerItems: offerId === null ? [] : [offerId],
    } as any).returning();

    // 📋 حجز المتابعة: حجز اللاعب بنفسه من التطبيق = تثبيتٌ تلقائيّ (أقوى تأكيدٍ من ردّ الواتساب).
    // إن وُجد حجزٌ مُدخَل مسبقاً (يدويّاً) → يُوسم ويُثبَّت ويُربط بحسابه. وإن لم يوجد → يُنشأ
    // «مثبّتاً» مباشرةً (لا «غير مثبّت») بالوسم نفسه.
    try {
      const existingRes = await db.select({ id: reservations.id, status: reservations.status, playerId: reservations.playerId })
        .from(reservations)
        .where(and(
          eq(reservations.activityId, activityId),
          isNull(reservations.deletedAt),
          or(
            player.playerId ? eq(reservations.playerId, player.playerId) : sql`false`,
            player.phone ? eq(reservations.phone, player.phone) : sql`false`,
          ),
        ))
        .limit(1);
      if (existingRes.length === 0) {
        await db.insert(reservations).values({
          activityId,
          contactName: player.name,
          phone: player.phone || '',
          peopleCount: 1,
          playerId: player.playerId ?? null,
          status: 'confirmed',   // ✅ تثبيت تلقائيّ لحجز التطبيق
          notes: 'حجز تلقائيّ من تطبيق اللاعب',
          createdBy: 'player-app',
          appConfirmed: true,
          appConfirmedAt: new Date(),
        } as any);
      } else {
        const ex = existingRes[0];
        await db.update(reservations).set({
          appConfirmed: true,
          appConfirmedAt: new Date(),
          // رفع «غير مثبّت» إلى «مثبّت» فقط — الحالات الأقوى (paid_all القديمة) تبقى كما هي
          ...(ex.status === 'pending' ? { status: 'confirmed' } : {}),
          // مطابقة بالهاتف بلا ربط؟ اربطه بحسابه الآن
          ...(!ex.playerId && player.playerId ? { playerId: player.playerId } : {}),
          updatedAt: new Date(),
        } as any).where(eq(reservations.id, ex.id));
        console.log(`📱 Reservation #${ex.id} app-confirmed by player booking (activity ${activityId})`);
      }
    } catch (e: any) {
      console.warn('⚠️ auto-reservation on player booking failed:', e?.message);
    }

    res.status(201).json({ success: true, booking: result[0] });

    // 🔔 Push للموظفين (حجز جديد من تطبيق اللاعب) + تأكيد للاعب
    import('../services/fcm.service.js').then(({ sendPushToStaffByPermission, sendPushToPlayer }) => {
      sendPushToStaffByPermission('bookings', '🎟️ حجز جديد (تطبيق)', `${player.name} حجز في ${activity.name}`, 'new_booking', {
        targetId: `booking-${result[0].id}`,
        url: '/admin/bookings',
      });
      if (player.playerId) {
        sendPushToPlayer(player.playerId, '✅ تم الحجز', `تم تأكيد حجزك في ${activity.name}`, 'booking_confirmed', {
          activityId,
          url: '/player/home',
        });
      }
    }).catch(() => {});
  } catch (err: any) {
    console.error('❌ book error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 📅 GET /activities/upcoming — الأنشطة القادمة ──
router.get('/activities/upcoming', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerIdParam = parseInt(req.query.playerId as string);

  try {
    // جلب الأنشطة مع بيانات المكان
    const rows = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      description: activities.description,
      basePrice: activities.basePrice,
      status: activities.status,
      locationId: activities.locationId,
      maxCapacity: activities.maxCapacity,
      difficulty: activities.difficulty,
      enabledOfferIds: activities.enabledOfferIds,
      // 🗓️ برنامج الليلة كما كتبه الأدمن — يعرضه اللاعب ليعرف متى يحضر.
      //    خطّةٌ مكتوبة لا تُشتقّ من الغرف (انظر تعليق العمود في المخطّط)،
      //    وقد يكون فارغاً فتختفي القائمة عند اللاعب.
      gameSchedule: activities.gameSchedule,
      locationName: locations.name,
      locationRegion: locations.region,
      locationMapUrl: locations.mapUrl,
      locationOffers: locations.offers,
      isTestLocation: locations.isTestLocation,
    })
      .from(activities)
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(
        or(eq(activities.status, 'planned'), eq(activities.status, 'active')),
        isNull(activities.deletedAt)
      ))
      // 🔴 الأقربُ موعداً أوّلاً: القائمة تُقرأ من أعلاها، ومَن يفتحها الليلة
      //    يريد ليلته لا ليلةَ الشهر القادم. (كان desc فيتصدّرها الأبعد.)
      .orderBy(activities.date);

    // فلترة أنشطة الاختبار: لا تظهر إلا لحسابات الاختبار
    let isTestUser = false;
    if (playerIdParam) {
      const [playerRow] = await db.select({ isTestAccount: players.isTestAccount })
        .from(players).where(eq(players.id, playerIdParam)).limit(1);
      isTestUser = playerRow?.isTestAccount || false;
    }

    const filtered = isTestUser
      ? rows  // حساب اختبار → يرى كل شيء
      : rows.filter(r => !r.isTestLocation);  // حساب عادي → يخفي أنشطة الاختبار

    // 🍽️ أيّ الأماكن لديها منيو متاح؟ (استعلامٌ واحد — لتمييز الفعاليّات التي يُعرض فيها زرّ المنيو)
    const menuLocRows = await db.selectDistinct({ locationId: menuItems.locationId })
      .from(menuItems)
      .where(and(eq(menuItems.isAvailable, true), isNull(menuItems.deletedAt)));
    const menuLocIds = new Set(menuLocRows.map(r => r.locationId));
    // 🧪 الاستعارة تنعكس هنا أيضاً: موقع اختبارٍ بلا أصنافٍ خاصّة كان يفقد زرّ
    //    المنيو أصلاً — فيبدو الاختبار «معطّلاً» وهو يعمل. خريطة استعارةٍ واحدة.
    const borrowRows = await db.select({ id: locations.id, src: locations.menuSourceLocationId })
      .from(locations)
      .where(and(eq(locations.isTestLocation, true), isNull(locations.deletedAt)));
    // مصدرٌ محذوفٌ يُسقط الاستعارة هنا كما يُسقطها effectiveMenuLocation — وإلّا
    // أضاء الزرّ على منيو الموقع نفسه الفارغ
    const srcIds = [...new Set(borrowRows.map(r => r.src).filter(Boolean))] as number[];
    const liveSrc = srcIds.length
      ? new Set((await db.select({ id: locations.id }).from(locations)
          .where(and(inArray(locations.id, srcIds), isNull(locations.deletedAt)))).map(r => r.id))
      : new Set<number>();
    const borrowMap = new Map(borrowRows.filter(r => r.src && liveSrc.has(r.src)).map(r => [r.id, r.src as number]));

    // 👥 عدد الحاجزين — من المصدر الموحّد، دفعةً واحدة لكلّ الفعاليّات.
    // 🔴 كان هنا `SUM(bookings.count)` وحده داخل حلقة: لا يرى متابعةَ الحجوزات،
    //    فمن أُدخل يدويّاً بلا حساب ومرافقو اللاعبين يختفون من الرقم الذي يقرؤه
    //    اللاعب ليقرّر أفيه مجالٌ أم لا. (فعاليّة ٢٢٤: ٢٠ معروضاً و٢٧ حقيقةً.)
    const { countBookedPeopleBatch } = await import('../services/booking-count.service.js');
    const bookedMap = await countBookedPeopleBatch(filtered.map((a: any) => a.id));

    const enriched = await Promise.all(filtered.map(async (act) => {

      // 🎯 توحيد 2026-08-06: العروض مسارٌ مهجور يخدم الفعاليّات القديمة فقط.
      // لا يُعرض عرضٌ إلا إذا اختاره الأدمن صراحةً — أُلغيت قاعدة «الفارغ = اعرض الكل»
      // كي لا ترث الفعاليّات الجديدة عروض المكان القديمة (الكتالوج الآن هو المنيو).
      const allOffers: any[] = Array.isArray(act.locationOffers) ? act.locationOffers : [];
      const enabledIds: number[] = Array.isArray(act.enabledOfferIds) ? act.enabledOfferIds : [];
      const activeOffers = enabledIds.length > 0
        ? allOffers.filter((_: any, idx: number) => enabledIds.includes(idx))
        : [];

      return {
        ...act,
        locationOffers: activeOffers,
        // 🍽️ للاعب: زرّ استعراض المنيو وقت الحجز — بالمنيو الفعّال (قد يكون مستعاراً)
        hasMenu: act.locationId ? menuLocIds.has(borrowMap.get(act.locationId) ?? act.locationId) : false,
        bookedCount: bookedMap.get(act.id) ?? 0,
        maxPlayers: act.maxCapacity || 20,
      };
    }));

    res.json({ success: true, activities: enriched });
  } catch (err: any) {
    console.error('❌ activities/upcoming error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 🍽️ GET /locations/:locId/menu — استعراض منيو المكان وقت الحجز (عرضٌ فقط) ──
// 🎯 توحيد 2026-08-06: المنيو هو الكتالوج الوحيد، فيراه اللاعب قبل الحجز ليعرف
// ماذا يقدّم المكان وبكم. **بلا طلب** — الطلب يبقى داخل نافذته (ساعة قبل ← 12 بعد).
// مفتوحٌ بلا مصادقة كبقيّة مسارات الاستكشاف، ولا يكشف حصّة النادي إطلاقاً.
router.get('/locations/:locId/menu', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locId = parseInt(req.params.locId);
  if (!Number.isFinite(locId)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try {
    const [loc] = await db.select({ id: locations.id, name: locations.name })
      .from(locations).where(and(eq(locations.id, locId), isNull(locations.deletedAt))).limit(1);
    if (!loc) return res.status(404).json({ error: 'المكان غير موجود' });
    // 🧪 الاستعارة: موقع الاختبار يعرض منيو مصدره — وباسم المصدر ليصدُق العنوان
    const effLocId = await effectiveMenuLocation(db, locId);
    let displayName = loc.name;
    if (effLocId !== locId) {
      const [src] = await db.select({ name: locations.name }).from(locations)
        .where(eq(locations.id, effLocId)).limit(1);
      if (src) displayName = `${src.name} (تجربة)`;
    }
    res.json({ success: true, locationName: displayName, items: await buildPlayerMenu(db, effLocId) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── 👥 GET /activities/:actId/bookers — جميع الحاجزين لنشاط مع تمييز المتابَعين ──
router.get('/activities/:actId/following-bookers', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const activityId = parseInt(req.params.actId);
  const playerId = parseInt(req.query.playerId as string);

  if (!activityId || !playerId) {
    return res.status(400).json({ error: 'activityId و playerId مطلوبان' });
  }

  try {
    // 1. جلب قائمة المتابَعين
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));
    const followingSet = new Set(followRows.map(f => f.followingId));

    // 2. جلب كل الحاجزين لهذا النشاط (عدا نفسي)
    const allBookerRows = await db.select({
      bookingId: bookings.id,
      playerId: bookings.playerId,
      name: bookings.name,
    })
      .from(bookings)
      .where(eq(bookings.activityId, activityId));

    const bookerPlayerIds = allBookerRows
      .map(b => b.playerId)
      .filter(pid => pid && pid !== playerId) as number[];

    if (bookerPlayerIds.length === 0) {
      return res.json({ success: true, count: 0, bookers: [] });
    }

    // 3. إضافة بيانات اللاعبين
    const playerDetails = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
    })
      .from(players)
      .where(inArray(players.id, bookerPlayerIds));

    // 4. إضافة علامة المتابعة — المتابَعون أولاً
    const enrichedBookers = playerDetails.map(p => ({
      ...p,
      isFollowing: followingSet.has(p.id),
    })).sort((a, b) => (b.isFollowing ? 1 : 0) - (a.isFollowing ? 1 : 0));

    res.json({ success: true, count: enrichedBookers.length, bookers: enrichedBookers });
  } catch (err: any) {
    console.error('❌ bookers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 🎮 GET /my-active-rooms — الغرف النشطة لأنشطة اللاعب الحاجز ──
router.get('/my-active-rooms', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const player = (req as any).playerAccount;
  if (!player) return res.status(401).json({ error: 'غير مصادق' });

  try {
    // 1. جلب حجوزات اللاعب (بالهاتف أو playerId)
    const myBookings = await db.select({
      activityId: bookings.activityId,
      activityName: activities.name,
      activityDate: activities.date,
    })
      .from(bookings)
      .innerJoin(activities, eq(bookings.activityId, activities.id))
      .where(
        or(
          eq(bookings.phone, player.phone),
          player.playerId ? eq(bookings.playerId, player.playerId) : sql`false`
        )
      );

    if (myBookings.length === 0) {
      return res.json({ success: true, rooms: [] });
    }

    // 2. جلب الغرف النشطة لهذه الأنشطة
    const activityIds = [...new Set(myBookings.map(b => b.activityId))];
    
    const activeRooms = await db.select({
      sessionId: sessions.id,
      sessionCode: sessions.sessionCode,
      sessionName: sessions.sessionName,
      maxPlayers: sessions.maxPlayers,
      isActive: sessions.isActive,
      activityId: sessions.activityId,
    })
      .from(sessions)
      .where(
        and(
          inArray(sessions.activityId, activityIds),
          eq(sessions.isActive, true),
        )
      );

    if (activeRooms.length === 0) {
      return res.json({ success: true, rooms: [] });
    }

    // 3. تجميع النتائج: كل نشاط مع غرفه
    const result = activityIds
      .map(actId => {
        const booking = myBookings.find(b => b.activityId === actId);
        const rooms = activeRooms.filter(r => r.activityId === actId);
        if (rooms.length === 0) return null;
        return {
          activityId: actId,
          activityName: booking?.activityName || '',
          activityDate: booking?.activityDate || '',
          rooms: rooms.map(r => ({
            sessionId: r.sessionId,
            sessionCode: r.sessionCode,
            sessionName: r.sessionName,
            maxPlayers: r.maxPlayers,
          })),
        };
      })
      .filter(Boolean);

    res.json({ success: true, rooms: result });
  } catch (err: any) {
    console.error('❌ my-active-rooms error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 🌙 GET /pulse — نبض الليلة: أين نحن الآن في غرفةٍ مختارة ──
// البوّابةُ الوحيدة هي الحجز: غيرُ الحاجز لا يرى التبويب أصلاً ويُردّ هنا بـ403.
// المعاملان اختياريّان — بدونهما تُختار الفعاليّة الأقرب زمناً والغرفةُ التي
// للّاعب مقعدٌ فيها، وإلّا فأبكرُ الغرف بدايةً.
router.get('/pulse', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const account = (req as any).playerAccount;
  if (!account) return res.status(401).json({ error: 'غير مصادق' });

  try {
    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const activityId = num(req.query.activityId);
    const roomId = num(req.query.roomId);

    // 🔒 حارسُ الحجز يسبق أيّ قراءة: فعاليّةٌ مطلوبةٌ بلا حجزٍ عليها تُردّ فوراً.
    if (activityId != null) {
      const ok = await hasBooking(activityId, account.playerId ?? null, account.phone ?? null);
      if (!ok) return res.status(403).json({ error: 'لا حجز لك على هذه الفعاليّة' });
    }

    const pulse = await buildActivityPulse({
      playerId: account.playerId ?? null,
      phone: account.phone ?? null,
      activityId,
      roomId,
    });

    // لا فعاليّةَ جاريةً محجوزة ⇒ التبويب لا يظهر أصلاً
    if (!pulse) return res.status(403).json({ error: 'لا فعاليّة جارية محجوزة' });

    res.json({ success: true, pulse });
  } catch (err: any) {
    console.error('❌ pulse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════
// 🔓 PARAMETERIZED ROUTES (بعد static)
// ════════════════════════════════════════════

// ── 👥 GET /:id/co-players — لاعبون لعبت معهم ──
router.get('/:id/co-players', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);
  if (!playerId || isNaN(playerId)) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const myMatches = await db.select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .where(eq(matchPlayers.playerId, playerId));

    const matchIds = myMatches.map(m => m.matchId).filter(Boolean) as number[];
    if (matchIds.length === 0) return res.json({ success: true, coPlayers: [] });

    const coPlayerRows = await db.select({
      playerId: matchPlayers.playerId,
      playerName: matchPlayers.playerName,
      matchId: matchPlayers.matchId,
    })
      .from(matchPlayers)
      .where(and(
        inArray(matchPlayers.matchId, matchIds),
        sql`${matchPlayers.playerId} IS NOT NULL AND ${matchPlayers.playerId} != ${playerId}`
      ));

    const coMap = new Map<number, { playerId: number; playerName: string; matchCount: number }>();
    for (const row of coPlayerRows) {
      if (!row.playerId) continue;
      const existing = coMap.get(row.playerId);
      if (existing) existing.matchCount++;
      else coMap.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, matchCount: 1 });
    }

    const coPlayerIds = Array.from(coMap.keys());
    let enriched: any[] = [];

    if (coPlayerIds.length > 0) {
      const playerDetails = await db.select({
        id: players.id,
        name: players.name,
        avatarUrl: players.avatarUrl,
        level: players.level,
        rankTier: players.rankTier,
      })
        .from(players)
        .where(inArray(players.id, coPlayerIds));

      // هل متابعهم؟
      const myFollowing = await db.select({ followingId: playerFollows.followingId })
        .from(playerFollows)
        .where(eq(playerFollows.followerId, playerId));
      const followingSet = new Set(myFollowing.map(f => f.followingId));

      enriched = playerDetails.map(p => ({
        ...p,
        matchCount: coMap.get(p.id)?.matchCount || 0,
        isFollowing: followingSet.has(p.id),
      })).sort((a, b) => b.matchCount - a.matchCount);
    }

    res.json({ success: true, coPlayers: enriched });
  } catch (err: any) {
    console.error('❌ co-players error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ⭐ POST /:id/follow/:targetId — متابعة لاعب ──
router.post('/:id/follow/:targetId', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  // المتابِع = اللاعب الموثّق دائماً (نتجاهل :id لمنع المتابعة نيابةً عن غيره)
  const followerId = (req as any).playerAccount?.playerId;
  const followingId = parseInt(req.params.targetId);

  if (!followerId || !followingId || followerId === followingId) {
    return res.status(400).json({ error: 'معرّفات غير صالحة' });
  }

  try {
    // التحقق: هل لعبوا سوا؟
    const myMatches = await db.select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .where(eq(matchPlayers.playerId, followerId));
    const myMatchIds = myMatches.map(m => m.matchId).filter(Boolean) as number[];

    if (myMatchIds.length === 0) {
      return res.status(403).json({ error: 'لا يمكن متابعة لاعب لم تلعب معه' });
    }

    const sharedMatch = await db.select({ id: matchPlayers.id })
      .from(matchPlayers)
      .where(and(
        inArray(matchPlayers.matchId, myMatchIds),
        eq(matchPlayers.playerId, followingId)
      ))
      .limit(1);

    if (sharedMatch.length === 0) {
      return res.status(403).json({ error: 'لا يمكن متابعة لاعب لم تلعب معه' });
    }

    // التحقق من عدم التكرار
    const existing = await db.select({ id: playerFollows.id })
      .from(playerFollows)
      .where(and(
        eq(playerFollows.followerId, followerId),
        eq(playerFollows.followingId, followingId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ success: true, message: 'متابع مسبقاً' });
    }

    await db.insert(playerFollows).values({ followerId, followingId } as any);
    res.json({ success: true, message: 'تمت المتابعة' });
  } catch (err: any) {
    console.error('❌ follow error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ❌ DELETE /:id/follow/:targetId — إلغاء متابعة ──
router.delete('/:id/follow/:targetId', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  // المتابِع = اللاعب الموثّق دائماً (نتجاهل :id)
  const followerId = (req as any).playerAccount?.playerId;
  const followingId = parseInt(req.params.targetId);

  try {
    await db.delete(playerFollows).where(and(
      eq(playerFollows.followerId, followerId),
      eq(playerFollows.followingId, followingId)
    ));
    res.json({ success: true, message: 'تم إلغاء المتابعة' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 📋 GET /:id/following — قائمة المتابَعين ──
router.get('/:id/following', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));

    const ids = followRows.map(f => f.followingId);
    if (ids.length === 0) return res.json({ success: true, following: [] });

    const followingPlayers = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
      rankTier: players.rankTier,
      rankRR: players.rankRR,
      totalMatches: players.totalMatches,
      totalWins: players.totalWins,
    })
      .from(players)
      .where(inArray(players.id, ids));

    res.json({ success: true, following: followingPlayers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 📰 GET /:id/following-feed — فيد أخبار المتابَعين ──
router.get('/:id/following-feed', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    // 1. جلب قائمة المتابَعين
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));

    const followingIds = followRows.map(f => f.followingId);
    if (followingIds.length === 0) return res.json({ success: true, feed: [] });

    // 2. آخر 20 مباراة لعبها المتابَعون
    const recentMatches = await db.select({
      playerId: matchPlayers.playerId,
      playerName: matchPlayers.playerName,
      role: matchPlayers.role,
      survived: matchPlayers.survivedToEnd,
      xpEarned: matchPlayers.xpEarned,
      rrChange: matchPlayers.rrChange,
      matchWinner: matches.winner,
      matchDate: matches.createdAt,
    })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(inArray(matchPlayers.playerId, followingIds))
      .orderBy(desc(matches.createdAt))
      .limit(20);

    // 3. إضافة أسماء وصور
    const playerInfoMap = new Map<number, any>();
    const pInfo = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
      rankTier: players.rankTier,
    })
      .from(players)
      .where(inArray(players.id, followingIds));

    for (const p of pInfo) playerInfoMap.set(p.id, p);

    const feed = recentMatches.map(m => ({
      ...m,
      playerInfo: m.playerId ? playerInfoMap.get(m.playerId) : null,
    }));

    res.json({ success: true, feed });
  } catch (err: any) {
    console.error('❌ following-feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 📋 GET /:id/bookings — حجوزات اللاعب ──
router.get('/:id/bookings', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    const playerBookings = await db.select({
      bookingId: bookings.id,
      activityId: bookings.activityId,
      isPaid: bookings.isPaid,
      isFree: bookings.isFree,
      createdAt: bookings.createdAt,
      activityName: activities.name,
      activityDate: activities.date,
      activityStatus: activities.status,
    })
      .from(bookings)
      .innerJoin(activities, eq(bookings.activityId, activities.id))
      .where(and(eq(bookings.playerId, playerId), isNull(bookings.deletedAt)))
      .orderBy(desc(activities.date));

    res.json({ success: true, bookings: playerBookings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 🎮 GET /:id/matches — سجل مباريات اللاعب وتفاصيل النقاط ──
router.get('/:id/matches', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);
  const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];

  try {
    const playerMatches = await db.select({
      matchId: matches.id,
      gameName: matches.gameName,
      matchDate: matches.createdAt,
      matchWinner: matches.winner,
      durationSeconds: matches.durationSeconds,
      totalRounds: matches.totalRounds,
      playerCount: matches.playerCount,
      role: matchPlayers.role,
      survivedToEnd: matchPlayers.survivedToEnd,
      eliminatedDuring: matchPlayers.eliminatedDuring,
      eliminatedAtRound: matchPlayers.eliminatedAtRound,
      roundsSurvived: matchPlayers.roundsSurvived,
      dealInitiated: matchPlayers.dealInitiated,
      dealSuccess: matchPlayers.dealSuccess,
      abilityUsed: matchPlayers.abilityUsed,
      abilityCorrect: matchPlayers.abilityCorrect,
      xpEarned: matchPlayers.xpEarned,
      rrChange: matchPlayers.rrChange,
      penaltyCount: matchPlayers.penaltyCount,
      penaltyRRDeduction: matchPlayers.penaltyRRDeduction,
      bombRRChange: matchPlayers.bombRRChange,
      rewardBreakdown: matchPlayers.rewardBreakdown,
    })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(eq(matchPlayers.playerId, playerId))
      .orderBy(desc(matches.createdAt));

    // 🧮 تفصيل دقيق موحّد: من المخزّن إن وُجد وإلا إعادة بناء + بند تسوية يضمن مطابقة المجموع
    let cfg: any; try { cfg = await getProgressionConfig(); } catch { cfg = undefined; }
    const enriched = playerMatches.map(m => ({ ...m, breakdown: buildDisplayBreakdown(m, cfg) }));

    res.json({ success: true, matches: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
