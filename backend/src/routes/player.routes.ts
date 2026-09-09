// ══════════════════════════════════════════════════════
// 🎮 Player Routes — البحث والتسجيل والبروفايل
// يُستخدم من واجهة اللاعب (PlayerFlow) للبحث والتسجيل
// + GET /api/player/:id/profile للبروفايل الكامل
// ══════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { normGender } from '../utils/gender.util.js';
import { getDB } from '../config/db.js';
import { sessionPlayers } from '../schemas/game.schema.js';
import { players as playersTable, PLAYER_DEFAULT_PASSWORD, lockedLoginAttempts } from '../schemas/player.schema.js';
import { eq, desc, sql, isNull } from 'drizzle-orm';
import { locations } from '../schemas/admin.schema.js';
import { haversineM } from '../services/geofence.service.js';
import { authenticate, adminOnly, authorize, staffOrSelf, authenticatePlayerOrStaff } from '../middleware/auth.js';
import { hashPlayerPassword } from '../middleware/player-auth.middleware.js';
import { logStaffAction } from '../services/staff-action-log.service.js';
import { rateLimit } from '../middleware/rate-limit.js';
import {
  findPlayerByPhone,
  createPlayer,
  getPlayerProfile,
} from '../services/player.service.js';

const router = Router();

// ── GET /api/player/all — جلب جميع اللاعبين (Admin only) ──
router.get('/all', authenticate, authorize('admin', 'accountant'), async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const { sql } = await import('drizzle-orm');
    const { bookings, activities } = await import('../schemas/admin.schema.js');

    const rows = await db.select({
      id: playersTable.id,
      phone: playersTable.phone,
      name: playersTable.name,
      gender: playersTable.gender,
      avatarUrl: playersTable.avatarUrl,
      totalMatches: playersTable.totalMatches,
      totalWins: playersTable.totalWins,
      totalSurvived: playersTable.totalSurvived,
      xp: playersTable.xp,
      level: playersTable.level,
      rankTier: playersTable.rankTier,
      rankRR: playersTable.rankRR,
      lastActiveAt: playersTable.lastActiveAt,
      lastActiveSource: playersTable.lastActiveSource,
      lastActivePlatform: playersTable.lastActivePlatform,
      createdAt: playersTable.createdAt,
      mustChangePassword: playersTable.mustChangePassword,
      email: playersTable.email,
      isTestAccount: playersTable.isTestAccount,
      isFreeAccount: playersTable.isFreeAccount,
      canHostRemote: playersTable.canHostRemote,
      geofenceExempt: playersTable.geofenceExempt,
      isLocked: playersTable.isLocked,
      lockedReason: playersTable.lockedReason,
      lockedAt: playersTable.lockedAt,
      geofenceExemptReason: playersTable.geofenceExemptReason,
      geofenceExemptAt: playersTable.geofenceExemptAt,
      genderConstraint: playersTable.genderConstraint,
      homeCityId: playersTable.homeCityId,
    }).from(playersTable).orderBy(desc(playersTable.createdAt));

    // ── حساب lastMatchAt لكل اللاعبين (batch واحد بدل N+1) ──
    const lastMatchRows = await db.execute(sql`
      SELECT
        b.player_id AS "playerId",
        MAX(a.date) AS "lastMatchAt"
      FROM bookings b
      INNER JOIN activities a ON b.activity_id = a.id AND a.status = 'completed'
      WHERE b.player_id IS NOT NULL
      GROUP BY b.player_id
    `);

    // بناء Map للوصول السريع
    const lastMatchMap = new Map<number, string>();
    for (const row of (lastMatchRows as any).rows || lastMatchRows) {
      if (row.playerId && row.lastMatchAt) {
        lastMatchMap.set(Number(row.playerId), row.lastMatchAt);
      }
    }

    // دمج lastMatchAt مع بيانات اللاعبين
    // 🔴 وتجريدُ الحقول الحسّاسة لغير الأدمن (قرارُ المالك: نصُّ سببِ القفل
    //    للأدمن وحدَه). الحارسُ هنا `admin` أو `accountant`، وكان المحاسبُ
    //    يقرأ سببَ كلّ قفلٍ في القائمة. و`isLocked` يبقى للجميع — يحتاج
    //    المحاسبُ أن يعرف أنّ الحسابَ مقفولٌ لا **لماذا**.
    const seeReasons = (req as any).user?.role === 'admin';

    // 🏙️ رتبةٌ لكلّ مدينة (الموسم العادي النشط): ?cityId= يعرض رتبة تلك المدينة في الأعمدة الرئيسة؛
    //    بدونه تبقى الأعمدة = المدينة الأساسيّة (مرآة players.*). وstandings[] لكلّ المدن دائماً.
    const cityFilter = Number.isFinite(parseInt(String(req.query.cityId))) ? parseInt(String(req.query.cityId)) : null;
    const standingsMap = new Map<number, any[]>();
    const homeNames = new Map<number, string>();
    try {
      const { getActiveRegularSeasonId } = await import('../services/season.service.js');
      const { cityMap } = await import('../services/cities.service.js');
      const seasonId = await getActiveRegularSeasonId();
      const cm = await cityMap();
      if (seasonId) {
        const stRes: any = await db.execute(sql`
          SELECT player_id, city_id, rank_tier, rank_rr, level, xp, total_matches, total_wins, total_survived
          FROM player_season_stats WHERE season_id = ${seasonId} AND city_id IS NOT NULL AND COALESCE(total_matches,0) > 0`);
        for (const s of (stRes?.rows ?? stRes ?? [])) {
          const pid = Number(s.player_id);
          const list = standingsMap.get(pid) || [];
          list.push({
            cityId: Number(s.city_id), cityName: cm.get(Number(s.city_id))?.name ?? null,
            rankTier: s.rank_tier || 'INFORMANT', rankRR: Number(s.rank_rr || 0), level: Number(s.level || 1), xp: Number(s.xp || 0),
            totalMatches: Number(s.total_matches || 0), totalWins: Number(s.total_wins || 0), totalSurvived: Number(s.total_survived || 0),
          });
          standingsMap.set(pid, list);
        }
      }
      for (const [id, c] of cm) homeNames.set(id, c.name);
    } catch (e: any) { console.warn('⚠️ standings for /player/all failed:', e?.message || e); }

    const enrichedPlayers = rows.map(p => {
      const standings = (standingsMap.get(p.id) || []).sort((a, b) => (a.cityId === (p as any).homeCityId ? -1 : b.cityId === (p as any).homeCityId ? 1 : a.cityId - b.cityId));
      const scoped = cityFilter ? standings.find(s => s.cityId === cityFilter) : null;
      const rankFields = cityFilter
        ? (scoped
          ? { rankTier: scoped.rankTier, rankRR: scoped.rankRR, level: scoped.level, xp: scoped.xp, totalMatches: scoped.totalMatches, totalWins: scoped.totalWins, totalSurvived: scoped.totalSurvived }
          : { rankTier: 'INFORMANT', rankRR: 0, level: 1, xp: 0, totalMatches: 0, totalWins: 0, totalSurvived: 0 })
        : {};
      return {
        ...p,
        ...rankFields,
        homeCityId: (p as any).homeCityId ?? null,
        homeCityName: (p as any).homeCityId ? (homeNames.get((p as any).homeCityId) ?? null) : null,
        standings,
        displayedCityId: cityFilter ?? (p as any).homeCityId ?? null,
        lockedReason: seeReasons ? p.lockedReason : undefined,
        geofenceExemptReason: seeReasons ? p.geofenceExemptReason : undefined,
        lastMatchAt: lastMatchMap.get(p.id) || null,
      };
    });

    return res.json({ success: true, players: enrichedPlayers, cityId: cityFilter });
  } catch (err: any) {
    console.error('❌ Fetch all players error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب اللاعبين' });
  }
});

// ── POST /api/player/:id/reset-password — إعادة تعيين كلمة المرور (Admin only) ──
router.post('/:id/reset-password', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    // التحقق من وجود اللاعب
    const existing = await db.select({ id: playersTable.id, name: playersTable.name })
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // إعادة تعيين كلمة المرور للافتراضية
    const defaultHash = await hashPlayerPassword(PLAYER_DEFAULT_PASSWORD);
    await db.update(playersTable)
      .set({ passwordHash: defaultHash, mustChangePassword: true } as any)
      .where(eq(playersTable.id, playerId));

    console.log(`🔄 Admin reset password for player #${playerId} (${existing[0].name}) to default`);
    return res.json({ success: true, message: 'تم إعادة تعيين كلمة المرور للافتراضية' });
  } catch (err: any) {
    console.error('❌ Reset password error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في إعادة تعيين كلمة المرور' });
  }
});

// ── POST /api/player/:id/toggle-test — تبديل حالة حساب الاختبار (Admin only) ──
router.post('/:id/toggle-test', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const [player] = await db.select({ id: playersTable.id, isTestAccount: playersTable.isTestAccount })
      .from(playersTable).where(eq(playersTable.id, playerId)).limit(1);

    if (!player) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

    const newValue = !player.isTestAccount;
    await db.update(playersTable)
      .set({ isTestAccount: newValue } as any)
      .where(eq(playersTable.id, playerId));

    console.log(`🧪 Player #${playerId} isTestAccount → ${newValue}`);
    return res.json({ success: true, isTestAccount: newValue });
  } catch (err: any) {
    console.error('❌ toggle-test error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/player/:id/toggle-free — تبديل حالة الحساب المجاني (Admin only) ──
router.post('/:id/toggle-free', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const [player] = await db.select({ id: playersTable.id, isFreeAccount: playersTable.isFreeAccount })
      .from(playersTable).where(eq(playersTable.id, playerId)).limit(1);

    if (!player) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

    const newValue = !player.isFreeAccount;
    await db.update(playersTable)
      .set({ isFreeAccount: newValue } as any)
      .where(eq(playersTable.id, playerId));

    console.log(`🏷️ Player #${playerId} isFreeAccount → ${newValue}`);
    return res.json({ success: true, isFreeAccount: newValue });
  } catch (err: any) {
    console.error('❌ toggle-free error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/player/:id/toggle-host-remote — تبديل صلاحيّة إنشاء الغرف أونلاين (Admin only) ──
router.post('/:id/toggle-host-remote', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const [player] = await db.select({ id: playersTable.id, canHostRemote: playersTable.canHostRemote })
      .from(playersTable).where(eq(playersTable.id, playerId)).limit(1);

    if (!player) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

    const newValue = !player.canHostRemote;
    await db.update(playersTable)
      .set({ canHostRemote: newValue } as any)
      .where(eq(playersTable.id, playerId));

    console.log(`🌐 Player #${playerId} canHostRemote → ${newValue}`);
    return res.json({ success: true, canHostRemote: newValue });
  } catch (err: any) {
    console.error('❌ toggle-host-remote error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/player/:id/toggle-geofence-exempt — إعفاء لاعب من سياج الفعاليّة (Admin only) ──
// 📍 لماذا يوجد هذا أصلاً: السياج يقرأ موقع الجهاز، وبعض الأجهزة لا تُنتج قراءةً
//    أبداً مهما مُنح الإذن (حالة PWA على iOS موثّقة في presence_checks: محاولاتٌ
//    متكرّرة بنتيجة LOCATION_REQUIRED ودقّةٍ فارغة، ولا صفَّ في player_last_fix قطّ).
//    مثل هذا اللاعب حاضرٌ في القاعة ولا يستطيع إثبات ذلك — ومنعُه عقوبةٌ على عطلٍ
//    في هاتفه. الإعفاء يعترف بهذا، ويبقى مرئيّاً: وسمٌ في الجدول وسببٌ في السجلّ.
// ⚠️ ليس ترخيصاً للّعب عن بُعد — من نال الإعفاء يُفترض حضورُه، والسياج أصلاً
//    «يمنع التساهل لا الاحتيال» كما ينصّ geofence.service.
router.post('/:id/toggle-geofence-exempt', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const [player] = await db.select({
      id: playersTable.id, name: playersTable.name, exempt: playersTable.geofenceExempt,
    }).from(playersTable).where(eq(playersTable.id, playerId)).limit(1);

    if (!player) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

    const newValue = !player.exempt;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';

    await db.update(playersTable).set({
      geofenceExempt: newValue,
      // السبب ومن منح ومتى تُمسح عند السحب — صفٌّ لا يكذب على من يراجعه لاحقاً
      geofenceExemptReason: newValue ? (reason || 'جهاز لا يُنتج قراءة موقع') : '',
      geofenceExemptBy: newValue ? ((req as any).user?.id ?? null) : null,
      geofenceExemptAt: newValue ? new Date() : null,
    } as any).where(eq(playersTable.id, playerId));

    console.log(`📍 Player #${playerId} (${player.name}) geofenceExempt → ${newValue}`);

    try {
      const { logStaffAction } = await import('../services/staff-action-log.service.js');
      logStaffAction({
        staffId: (req as any).user?.id, staffUsername: (req as any).user?.username,
        staffRole: (req as any).user?.role, source: 'rest', action: 'rest:geofence-exempt',
        details: { playerId, playerName: player.name, exempt: newValue, reason: reason || null },
      });
    } catch { /* غير حاجب */ }

    return res.json({ success: true, geofenceExempt: newValue });
  } catch (err: any) {
    console.error('❌ toggle-geofence-exempt error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🔒 POST /api/player/:id/toggle-lock — قفلُ الحساب وفكُّه (أدمن فقط)
//
// 🔴 القفلُ ليس حذفاً: البياناتُ كاملةٌ والقرارُ يُفكّ بضغطة. ولذلك حقولٌ
//    مستقلّةٌ عن deletedAt/anonymizedAt — خلطُهما يُفقد الفرقَ بين إجراءٍ
//    مؤقّتٍ ونهايةٍ للحساب.
//
// 🔴 والسببُ يُطلب عند القفل وحده ويُسجَّل: قفلٌ بلا سببٍ مكتوب يصير بعد
//    أسبوعٍ لغزاً لا يعرف أحدٌ أيُفكّ أم يُترك — نفسُ درس إعفاء السياج.
// ══════════════════════════════════════════════════════
router.post('/:id/toggle-lock', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const [player] = await db.select({
      id: playersTable.id, name: playersTable.name, locked: playersTable.isLocked,
    }).from(playersTable).where(eq(playersTable.id, playerId)).limit(1);

    if (!player) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });

    const newValue = !player.locked;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';

    // 🔴 السببُ إلزاميٌّ عند القفل: ١٣ قفلاً من ٢٢ على الإنتاج بلا سببٍ
    //    مكتوب، والمكتوبُ في الباقي «11» و«12» و«حر» — نصٌّ لا يُقرأ بعد شهر.
    if (newValue && !reason) {
      return res.status(400).json({ success: false, error: 'سببُ القفل إلزاميّ' });
    }

    // 🔴 والفكُّ لا يمحو التاريخ: كان يصفّر السببَ والمُصدِرَ والتاريخ، فمن
    //    قُفل وفُكّ قفلُه مرّتين يبدو نظيفاً تماماً ولا يعرف أحدٌ بعد شهرٍ
    //    لماذا قُفل. الأعمدةُ تبقى؛ `is_locked` وحدَه يقول الحالةَ الراهنة.
    // `as any` كنمط الملفّ: استنتاجُ drizzle لـ.set() مكسورٌ هنا أصلاً
    const lockPatch: any = newValue
      ? { isLocked: true, lockedReason: reason, lockedBy: (req as any).user?.id ?? null, lockedAt: new Date() }
      : { isLocked: false };
    await db.update(playersTable).set(lockPatch).where(eq(playersTable.id, playerId));

    console.log(`🔒 Player #${playerId} (${player.name}) isLocked → ${newValue}`);

    try {
      const { logStaffAction } = await import('../services/staff-action-log.service.js');
      logStaffAction({
        staffId: (req as any).user?.id, staffUsername: (req as any).user?.username,
        staffRole: (req as any).user?.role, source: 'rest', action: 'rest:player-lock',
        details: { playerId, playerName: player.name, locked: newValue, reason: reason || null },
      });
    } catch { /* غير حاجب */ }

    return res.json({ success: true, isLocked: newValue });
  } catch (err: any) {
    console.error('❌ toggle-lock error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 📍 GET /api/player/:id/lock-attempts — محاولاتُ الدخول على حسابٍ مقفول ──
router.get('/:id/lock-attempts', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });

    const rows = await db.select()
      .from(lockedLoginAttempts)
      .where(eq(lockedLoginAttempts.playerId, playerId))
      .orderBy(desc(lockedLoginAttempts.at))
      .limit(50);

    return res.json({ success: true, attempts: rows });
  } catch (err: any) {
    console.error('❌ lock-attempts error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── 📝 ملاحظاتُ الموظّفين عن اللاعب — نصٌّ حرّ (قرارُ المالك) ──
//
// 🔴 أدمن فقط قراءةً وكتابة: نصٌّ حرٌّ عن شخصٍ بعينه، والحاجةُ التي يسدّها
//    كانت تُقضى في حقلِ ملاحظةِ **الحجز** — ثلاثون ملاحظةً بخطّ إنسانٍ فيها
//    أوصافٌ اجتماعيّةٌ وعمرُ قاصرة، يقرؤها كلُّ من يفتح الحجز.
//
// 🔴 وسجلٌّ لا حقل: تُضاف الملاحظةُ ولا تُستبدَل، فلا يمحو أحدٌ ما كتبه غيرُه.
router.get('/:id/notes', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    const r: any = await db.execute(sql`
      SELECT id, staff_username AS "staffUsername", text, created_at AS "createdAt"
      FROM player_notes WHERE player_id = ${playerId}
      ORDER BY created_at DESC LIMIT 100
    `);
    return res.json({ success: true, notes: r?.rows ?? r ?? [] });
  } catch (err: any) {
    console.error('❌ notes read error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب الملاحظات' });
  }
});

router.post('/:id/notes', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) return res.status(400).json({ success: false, error: 'معرّف غير صالح' });
    const text = String(req.body?.text ?? '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ success: false, error: 'الملاحظةُ فارغة' });
    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'DB unavailable' });
    await db.execute(sql`
      INSERT INTO player_notes (player_id, staff_id, staff_username, text)
      VALUES (${playerId}, ${(req as any).user?.id ?? null}, ${(req as any).user?.username ?? null}, ${text})
    `);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('❌ notes write error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في حفظ الملاحظة' });
  }
});

// ── DELETE /api/player/:id — حذف لاعب نهائياً (Admin only) ──
router.delete('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    // التحقق من وجود اللاعب
    const existing = await db.select({ id: playersTable.id, name: playersTable.name })
      .from(playersTable)
      .where(eq(playersTable.id, playerId))
      .limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // ══════════════════════════════════════════════════
    // 🛡️ حارس الحذف — قرار المالك (١): رفض صريح، لا حذف ناعم.
    //
    // مرجع الدفتر صار ON DELETE RESTRICT، فالحذف هنا كان سيرتدّ خطأ ٥٠٠ خاماً
    // بلا تفسير. والأهم أن السؤال الحقيقي — «ماذا يحلّ بمال هذا الشخص؟» —
    // يجب أن يُطرح صراحةً لا أن يُجاب عنه بالمحو. نُعيد ٤٠٩ يسمّي الأرقام،
    // ونعرض مسار نقل عبر `?transferTo=` للحساب الباقي.
    // ══════════════════════════════════════════════════
    const money: any = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM chips_ledger  WHERE player_id = ${playerId})::int AS ledger_rows,
        (SELECT COUNT(*) FROM chips_rentals WHERE player_id = ${playerId})::int AS rentals,
        (SELECT COALESCE(chips_balance,0) FROM players WHERE id = ${playerId})::int AS balance
    `);
    const m = (money?.rows ?? money ?? [])[0] || {};
    const hasHistory = Number(m.ledger_rows || 0) > 0 || Number(m.rentals || 0) > 0;

    const transferTo = req.query.transferTo ? parseInt(String(req.query.transferTo)) : null;

    if (hasHistory && !transferTo) {
      return res.status(409).json({
        success: false,
        code: 'CHIPS_HISTORY',
        error: `لا يُحذف «${existing[0].name}»: له سجلّ مالي (${m.ledger_rows} حركة · ${m.rentals} إيجار · رصيد ${m.balance} 🪙). `
             + 'انقل سجلّه إلى حساب آخر أولاً عبر transferTo=<معرّف اللاعب الباقي>.',
        chips: { ledgerRows: Number(m.ledger_rows || 0), rentals: Number(m.rentals || 0), balance: Number(m.balance || 0) },
      });
    }

    if (hasHistory && transferTo) {
      if (transferTo === playerId) {
        return res.status(400).json({ success: false, error: 'لا يمكن النقل إلى الحساب نفسه' });
      }
      const [target] = await db.select({ id: playersTable.id, name: playersTable.name })
        .from(playersTable).where(eq(playersTable.id, transferTo)).limit(1);
      if (!target) return res.status(404).json({ success: false, error: 'حساب النقل غير موجود' });

      // النقل والحذف في معاملة واحدة — لا حالة وسطى يفقد فيها السجلّ صاحبه
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL app.chips_ledger_admin = 'on'`);
        await tx.execute(sql`UPDATE chips_ledger  SET player_id = ${transferTo} WHERE player_id = ${playerId}`);
        await tx.execute(sql`UPDATE chips_rentals SET player_id = ${transferTo} WHERE player_id = ${playerId}`);
        await tx.execute(sql`
          UPDATE players SET chips_balance =
            COALESCE((SELECT SUM(amount) FROM chips_ledger WHERE player_id = ${transferTo}), 0)
          WHERE id = ${transferTo}
        `);
        // 🔴 حذفٌ ناعمٌ لا صلب (قرارُ المالك): `DELETE FROM players` هو مصدرُ
        //    اليتامى الـ١٢٥ المرصودة — ٤١ حساباً حُذف فترك صفوفَ لعبٍ وحجزٍ
        //    تشير إلى معرّفٍ لا وجودَ له، وكلُّ JOIN يفترض وجودَ الصفّ ينكسر
        //    أو يُخفي صفوفاً بصمت. والمهلةُ ٣٠ يوماً كما يصفها المخطَّط،
        //    وبعدها يُجهّل الصفُّ بـ`runDeletionSweep` القائمة.
        await tx.execute(sql`
          UPDATE players
          SET deleted_at = NOW(),
              deletion_due_at = NOW() + INTERVAL '30 days',
              deletion_reason = 'admin'
          WHERE id = ${playerId}
        `);
      });

      logStaffAction({
        staffId: (req as any).user?.id,
        staffUsername: (req as any).user?.username,
        staffRole: (req as any).user?.role,
        source: 'http',
        action: 'player:delete-with-chips-transfer',
        outcome: 'success',
        targetName: existing[0].name,
        details: { playerId, transferTo, targetName: target.name, ...m },
      });

      console.log(`🗑️ Admin deleted player #${playerId} — نُقل سجلّه المالي إلى #${transferTo}`);
      return res.json({ success: true, message: `جُدول حذفُ اللاعب بعد ٣٠ يوماً، ونُقل سجلّه المالي إلى «${target.name}»` });
    }

    // 🔴 حذفٌ ناعمٌ لا صلب — انظر التعليقَ في فرع النقل أعلاه.
    await db.execute(sql`
      UPDATE players
      SET deleted_at = NOW(),
          deletion_due_at = NOW() + INTERVAL '30 days',
          deletion_reason = 'admin'
      WHERE id = ${playerId}
    `);

    logStaffAction({
      staffId: (req as any).user?.id,
      staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role,
      source: 'http',
      action: 'player:delete',
      outcome: 'success',
      targetName: existing[0].name,
      details: { playerId },
    });

    console.log(`🗑️ Admin deleted player #${playerId} (${existing[0].name})`);
    return res.json({ success: true, message: 'جُدول الحذف — يُجهّل الحسابُ بعد ٣٠ يوماً، ويمكن التراجعُ خلالها' });
  } catch (err: any) {
    console.error('❌ Delete player error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في حذف اللاعب' });
  }
});

// ── POST /api/player/lookup — البحث عن لاعب برقم الهاتف ──
// 🔴 لا حارسَ مصادقةٍ هنا — هذه خطوةُ ما قبل الدخول، فالمجهولُ هو المستعمل.
//    والحمايةُ الممكنة حدُّ معدّل: بدونه المسارُ عدّادُ أرقامٍ يكشف مَن في
//    النادي ومَن ليس فيه، رقماً رقماً. القيمُ نسخةٌ عن `player-auth/login`.
router.post('/lookup', rateLimit({
  windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'player-lookup',
  identity: (req) => req.body?.phone, identityMax: 10,
}), async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.json({ found: false, player: null });
    }

    // التأكد من اتصال DB — محاولة إعادة الاتصال إن لم يكن متصلاً
    let db = getDB();
    if (!db) {
      console.warn('[Lookup] ⚠️ DB is null, attempting reconnection...');
      try {
        const { connectDB } = await import('../config/db.js');
        await connectDB();
        db = getDB();
        console.log('[Lookup]', db ? '✅ DB reconnected!' : '❌ DB still null after reconnection');
      } catch (dbErr: any) {
        console.error('[Lookup] ❌ DB reconnection failed:', dbErr.message);
      }
    }

    if (!db) {
      console.error('[Lookup] ❌ CRITICAL: No DB connection — cannot lookup player');
      return res.json({ found: false, player: null, dbError: 'لا يوجد اتصال بقاعدة البيانات' });
    }

    // 1. البحث في جدول players الموحد
    console.log('[Lookup] 🔍 Searching player by phone');
    const unified = await findPlayerByPhone(phone);
    console.log(`[Lookup] 📦 Unified result:`, unified ? `Found: ${unified.name} (id=${unified.id})` : 'NOT FOUND');

    if (unified) {
      // 🔴 لا ختمَ نشاطٍ هنا: كان مجهولٌ يكتب في `players` بلا مصادقة، ومن
      //    يطرق البابَ بلا دخولٍ يُحسب «نشطاً اليوم» — وlast_active_at مقامُ
      //    شرائح لوحة التحليلات كلِّها. الختمُ مكانُه بعد نجاح كلمة السرّ.
      return res.json({
        found: true,
        player: {
          id: unified.id,
          displayName: unified.name,
          phone: unified.phone,
          gender: unified.gender,
          dateOfBirth: unified.dob,
          playerId: unified.id,
        },
      });
    }

    // 2. Fallback: البحث في session_players (قديم)
    const results = await db
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.phone, phone))
      .orderBy(desc(sessionPlayers.id))
      .limit(1);

    console.log(`[Lookup] 📦 Session fallback:`, results.length > 0 ? `Found: ${results[0].playerName}` : 'NOT FOUND');

    if (results.length > 0) {
      const p = results[0];
      // ترحيل تلقائي: إنشاء حساب في جدول players الموحد
      // 🔴 لا إنشاءَ حسابٍ من مسارٍ مجهول. كان هذا يُنشئ حساباً كاملاً بكلمة
      //    السرّ الافتراضيّة لأيّ رقمٍ له صفٌّ قديمٌ في session_players، بلا أن
      //    يُثبت أحدٌ ملكيّةَ الرقم — فمن يعرف واحداً من الـ٤٥ رقماً القديمة
      //    (مقيسةٌ على الإنتاج) يملك حساباً بكلمة سرٍّ يعرفها الجميع.
      //
      //    ومن بقي بلا حسابٍ موحَّدٍ يمرّ من `/register` كأيّ لاعبٍ جديد:
      //    الردُّ أدناه يعيد `playerId: null` وهو ما كان يفعله أصلاً حين يفشل
      //    الترحيل، فالعميلُ يعرف هذه الحالةَ ويتعامل معها.
      const unifiedPlayerId: number | null = null;

      return res.json({
        found: true,
        player: {
          id: unifiedPlayerId || p.id,
          displayName: p.playerName,
          phone: p.phone,
          gender: p.gender,
          dateOfBirth: p.dateOfBirth,
          playerId: unifiedPlayerId || null,
        },
      });
    }

    console.log('[Lookup] ℹ️ Player not found');
    return res.json({ found: false, player: null });
  } catch (err: any) {
    console.error('❌ Player lookup error:', err.message);
    return res.status(500).json({ found: false, error: 'خطأ في البحث: ' + err.message });
  }
});

// ── POST /api/player/register — تسجيل لاعب جديد (إنشاء حساب تلقائي) ──
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { phone, displayName, dateOfBirth, gender } = req.body;

    if (!phone || !displayName) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    // إنشاء أو إيجاد اللاعب في جدول players الموحد
    const player = await createPlayer({
      phone,
      name: displayName,
      gender: normGender(gender),
      dob: dateOfBirth || undefined,
    });

    if (player) {
      return res.json({
        success: true,
        player: {
          id: player.id,
          playerId: player.id,
          displayName: player.name,
          phone: player.phone,
        },
      });
    }

    // Fallback إذا DB مش متوفرة
    return res.json({
      success: true,
      player: {
        id: null,
        displayName,
        phone,
      },
    });
  } catch (err: any) {
    console.error('❌ Player register error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في التسجيل' });
  }
});

// ── البطاقةُ العامّة — قائمةُ سماحٍ صريحة ──
//
// 🔴 قائمةُ سماحٍ لا قائمةَ حجب. سببُ الثغرة الأصليّ أنّ `getPlayerProfile`
//    تُرجع الصفَّ كاملاً ناقصاً منه ما عُرف خطرُه (البصمة والتشبس)، فالهاتفُ
//    وتاريخُ الميلاد خرجا لأنّ أحداً لم يفكّر فيهما. هنا يُضاف الحقلُ عمداً
//    أو لا يخرج أصلاً — ويومَ يُضاف عمودٌ جديد إلى `players` لا يتسرّب صامتاً.
//
// 🔴 ولا `activeGame` بحال: دورُ اللاعب في مباراةٍ جاريةٍ سرُّ اللعبة نفسِها،
//    وكشفُه للاعبٍ آخر يُفسدها لا يخرق الخصوصيّةَ فحسب.
//
// 🔴 ودالّةٌ واحدةٌ لمنفذين: لو نُسخ الجسمُ مرّتين لتباعدا عند أوّل تعديل،
//    وتباعُدُهما يعني حقلاً يُضاف في مسارٍ ويُنسى في الآخر.
function publicCard(profile: any) {
  const p = profile?.player || {};
  return {
    success: true,
    player: {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl ?? null,
      gender: p.gender ?? null,
      rankTier: p.rankTier ?? 'INFORMANT',
    },
    progression: profile?.progression ?? null,
    stats: profile?.stats ?? null,
    matchHistory: Array.isArray(profile?.matchHistory) ? profile.matchHistory.slice(0, 5) : [],
  };
}

// ── GET /api/player/:id/profile — بروفايل اللاعب الكامل ──
//
// 🔴 كان هذا المسارُ مفتوحاً بلا أيّ وسيط بينما جيرانُه كلُّهم محروسون، فكان
//    عدُّ الأرقام من ١ إلى ٨١٤ يسحب دفترَ هويّة النادي: الاسمَ والهاتفَ
//    وتاريخَ الميلاد والبريد وسجلَّ المباريات. وأخطرُ منه في اللعب أنّ الردَّ
//    يحمل `activeGame` — دورَ اللاعب السرّيَّ في مباراةٍ تُلعب الآن.
//
// 🔴 وليس `staffOrSelf`: هي تردّ 403 على لاعبٍ يقرأ لاعباً آخر، وذلك يكسر
//    بطاقةَ لوحة الصدارة في **النسخة المشحونة من التطبيق** — ونسخةُ الهاتف
//    لا تُصلحها نشرةُ خادم. فالمصادقةُ إلزاميّةٌ للجميع، والتدرّجُ في المحتوى:
//    الموظّفُ واللاعبُ عن نفسه يأخذان الملفَّ كاملاً، واللاعبُ عن غيره يأخذ
//    البطاقةَ العامّة نفسَها التي يخدمها `/:id/public`.
//
//    أي أنّ الردَّ يضيق ولا ينكسر: صفرُ تسريبٍ وصفرُ عطل. والعملاءُ الجدد
//    ينادون `/public` صراحةً؛ وهذا المسارُ يحمي القدماء.
router.get('/:id/profile', authenticatePlayerOrStaff, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const profile: any = await getPlayerProfile(playerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // 🔴 لاعبٌ يقرأ لاعباً آخر ⇒ البطاقةُ العامّة، لا 403 ولا الملفُّ الكامل.
    //    يُقاس على `req.playerAccount` وحدَه: الموظّفُ يضبط `req.user` فلا يدخل هنا.
    const asPlayer = (req as any).playerAccount;
    if (asPlayer && asPlayer.playerId !== playerId) {
      return res.json(publicCard(profile));
    }

    // التحقق من لعبة نشطة (real-time من Redis) — تجاهل المجمدين
    let activeGame = null;
    try {
      const { getAllGameStates } = await import('../config/redis.js');
      const allStates = await getAllGameStates();

      for (const state of allStates) {
        if (!state || state.phase === 'GAME_OVER') continue;
        const p = state.players?.find((pl: any) =>
          (pl.playerId === playerId || pl.phone === profile.player.phone) && !pl.frozen
        );
        if (p) {
          activeGame = {
            roomId: state.roomId,
            roomCode: state.roomCode,
            gameName: state.config?.gameName,
            physicalId: p.physicalId,
            // 🔴 الدورُ يُحجب حتّى يثبّته الليدر — نسخةٌ عن player-auth.routes.ts:392.
            //    كان هذا المنفذُ يُخرجه خاماً بينما `/me` يحجبه، فكان اللاعبُ
            //    يقرأ دورَه من هنا **قبل أن يكشفه الليدر**: بابٌ خلفيٌّ حول
            //    توقيتِ الكشف، لا خرقَ خصوصيّةٍ فحسب.
            role: state.rolesConfirmed ? (p.role || null) : null,
            isAlive: p.isAlive,
            phase: state.phase,
          };
          break;
        }
      }
    } catch { /* Redis might be unavailable */ }

    return res.json({
      success: true,
      ...profile,
      activeGame,
    });
  } catch (err: any) {
    console.error('❌ Profile error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب البروفايل' });
  }
});

// ── GET /api/player/:id/public — البطاقةُ العامّة (لاعبٌ يرى لاعباً) ──
//
// 🔴 لوحةُ الصدارة تفتح بطاقةَ لاعبٍ آخر، وكانت تقرؤها من `/profile` المفتوح.
//    فحراستُه كانت ستكسر الميزة، وتوسيعُ الحارس كان سيُبقي الهاتفَ وتاريخَ
//    الميلاد مكشوفَين لكلّ لاعب. فالمخرجُ منفذٌ ثالث: قائمةُ سماحٍ صريحةٌ لا
//    قائمةَ حجب — يُضاف الحقلُ هنا عمداً أو لا يخرج أصلاً.
//
// 🔴 ولا `activeGame` هنا بحالٍ: دورُ اللاعب في مباراةٍ جاريةٍ سرُّ اللعبة
//    نفسِها، وعرضُه للاعبٍ آخر يُفسدها لا يخرق الخصوصيّةَ فحسب.
router.get('/:id/public', authenticatePlayerOrStaff, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const profile: any = await getPlayerProfile(playerId);
    if (!profile) return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    return res.json(publicCard(profile));
  } catch (err: any) {
    console.error('❌ Public profile error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في جلب البطاقة' });
  }
});

// ── PUT /api/player/:id/profile — تعديل بيانات البروفايل (موظف أو اللاعب نفسه) ──
router.put('/:id/profile', staffOrSelf('id'), async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const { name, email, gender, phone, genderConstraint, dob } = req.body;
    const updates: any = {};
    if (name && name.trim()) updates.name = name.trim();
    // 🎂 تاريخ الميلاد — يُقبل بصيغة YYYY-MM-DD حصراً (كل السجلات الحالية بهذه الصيغة،
    //    ومنطق عيديّة الميلاد يقارن الشهر واليوم منها مباشرةً فأي صيغة أخرى تكسره).
    if (dob !== undefined) {
      const v = String(dob || '').trim();
      if (v === '') {
        updates.dob = null;
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return res.status(400).json({ success: false, error: 'صيغة تاريخ الميلاد يجب أن تكون YYYY-MM-DD' });
      } else {
        const t = new Date(v).getTime();
        const year = Number(v.slice(0, 4));
        if (isNaN(t) || t > Date.now() || year < 1940) {
          return res.status(400).json({ success: false, error: 'تاريخ ميلاد غير منطقي' });
        }
        updates.dob = v;
      }
    }
    if (email !== undefined) updates.email = email?.trim() || null;
    // 🔴 يُطبَّع لا يُقارَن: الشرطُ القديم كان يقبل القياسيَّ ويُسقط `male`
    //    صامتاً — فمن أرسل الحالةَ الصغيرة لم يُحفظ تعديلُه ولم يُخبَر.
    if (gender) updates.gender = normGender(gender);
    if (phone && phone.trim()) updates.phone = phone.trim();
    if (genderConstraint !== undefined) {
      if (['NONE', 'FORBID_SAME', 'FORBID_OPPOSITE'].includes(genderConstraint)) {
        updates.genderConstraint = genderConstraint;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'لا توجد بيانات للتحديث' });
    }

    const { players } = await import('../schemas/player.schema.js');
    const result = await db.update(players)
      .set(updates)
      .where(eq(players.id, playerId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'اللاعب غير موجود' });
    }

    // ── تحديث الاسم في الغرف النشطة (Redis) ──
    if (updates.name) {
      try {
        const { getAllGameStates, setGameState } = await import('../config/redis.js');
        const allStates = await getAllGameStates();
        for (const state of allStates) {
          if (!state || state.phase === 'GAME_OVER') continue;
          const player = state.players?.find((p: any) =>
            p.playerId === playerId || p.phone === result[0].phone
          );
          if (player) {
            player.name = updates.name;
            await setGameState(state.roomId, state);
            console.log(`🔄 Updated player name in Redis room ${state.roomId}: ${updates.name}`);
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Failed to sync name to Redis:', err.message);
      }
    }

    console.log(`✏️ Player #${playerId} profile updated:`, updates);
    // 🔒 لا تخرج الأسرار ولا البيانات المالية من الخادم مع ردّ التعديل
    const { passwordHash: _p, chipsBalance: _b, chipsFrameItemId: _f, chipsTitleItemId: _t, chipsNameFxItemId: _n, ...safe } = result[0] as any;
    return res.json({ success: true, player: safe });
  } catch (err: any) {
    console.error('❌ Profile update error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في تعديل البروفايل' });
  }
});

// ── POST /api/player/:id/avatar — رفع صورة البروفايل (موظف أو اللاعب نفسه) ──
router.post('/:id/avatar', staffOrSelf('id'), async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.id);
    if (!playerId || isNaN(playerId)) {
      return res.status(400).json({ success: false, error: 'معرّف اللاعب غير صالح' });
    }

    const { image } = req.body; // base64 string: "data:image/jpeg;base64,..."
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'صورة غير صالحة' });
    }

    const path = await import('path');
    const fs = await import('fs');

    const uploadDir = path.resolve('uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // استخراج نوع الصورة و البيانات
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, error: 'تنسيق صورة غير صالح' });
    }

    // allow-list صارم للامتدادات (يمنع svg/أنواع قابلة للتنفيذ)
    const rawExt = (matches[1] || '').toLowerCase();
    const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    if (!ALLOWED_EXT.includes(rawExt)) {
      return res.status(400).json({ success: false, error: 'نوع صورة غير مدعوم' });
    }
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const base64Data = matches[2];
    const fileName = `${playerId}.${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // تحقّق من الحجم (حد 5MB بعد فك الترميز)
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'حجم الصورة كبير جداً (الحد 5MB)' });
    }

    // حفظ الملف
    fs.writeFileSync(filePath, buffer);

    // 🖼️ مصغّر WebP 192px للقوائم (يوفّر ~90% من الباندويدث) — فشله لا يُفشل الرفع
    try {
      const sharp = (await import('sharp')).default;
      const thumbsDir = path.join(uploadDir, 'thumbs');
      if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
      await sharp(buffer).resize(192, 192, { fit: 'cover' }).webp({ quality: 80 })
        .toFile(path.join(thumbsDir, `${playerId}.webp`));
    } catch (thumbErr: any) {
      console.warn(`⚠️ avatar thumb failed for #${playerId}:`, thumbErr.message);
    }

    const avatarUrl = `/uploads/avatars/${fileName}?v=${Date.now()}`;

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const { players } = await import('../schemas/player.schema.js');
    await db.update(players)
      .set({ avatarUrl } as any)
      .where(eq(players.id, playerId));

    console.log(`📸 Player #${playerId} avatar updated: ${avatarUrl}`);
    return res.json({ success: true, avatarUrl });
  } catch (err: any) {
    console.error('❌ Avatar upload error:', err.message);
    return res.status(500).json({ success: false, error: 'خطأ في رفع الصورة' });
  }
});


// ════════════════════════════════════════
// 🗺️ GET /api/player/locations/map — آخر موقعٍ مسجّل لكلّ لاعب
//
// خلاف خريطة الليدر (المربوطة بغرفةٍ حيّة)، هذه تعرض الجميع بلا حاجةٍ
// للعبة — لمراجعة من كان أين ومتى.
//
// 🔴 `capturedAt` يُرسَل دائماً: التطبيق لا يُبلّغ في الخلفيّة، فنقطة من أغلق
//    تطبيقه تتجمّد حيث كان. بلا هذا الحقل تصير الخريطة كاذبةً بثقة.
// ════════════════════════════════════════
router.get('/locations/map', authenticate, authorize('admin', 'manager'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  // مكانٌ مرجعٌ اختياريّ — تُحسب المسافات إليه وتُرسم دائرته
  const locId = parseInt(String(req.query.locationId || ''));

  try {
    const venues = await db.select({
      id: locations.id, name: locations.name,
      latitude: locations.latitude, longitude: locations.longitude,
      geofenceRadiusM: locations.geofenceRadiusM,
    }).from(locations).where(isNull(locations.deletedAt)).orderBy(locations.id);

    const venue = Number.isFinite(locId) ? venues.find(v => v.id === locId) : null;
    const vLat = venue?.latitude ? parseFloat(String(venue.latitude)) : null;
    const vLng = venue?.longitude ? parseFloat(String(venue.longitude)) : null;

    const rows: any = await db.execute(sql`
      SELECT f.player_id, f.latitude, f.longitude, f.accuracy_m, f.is_mocked, f.source,
             f.captured_at, p.name, p.phone, p.is_test_account
      FROM player_last_fix f
      JOIN players p ON p.id = f.player_id
      ORDER BY f.captured_at DESC
    `);
    const list = (rows.rows ?? rows) as any[];

    const players = list.map(r => {
      const lat = parseFloat(String(r.latitude));
      const lng = parseFloat(String(r.longitude));
      const distanceM = (vLat !== null && vLng !== null)
        ? haversineM(vLat, vLng, lat, lng) : null;
      return {
        playerId: r.player_id, name: r.name, phone: r.phone,
        isTest: r.is_test_account === true,
        lat, lng,
        accuracyM: r.accuracy_m === null ? null : Number(r.accuracy_m),
        isMocked: r.is_mocked === true,
        source: r.source || null,
        capturedAt: new Date(r.captured_at).getTime(),
        distanceM,
      };
    });

    res.json({
      success: true,
      venues: venues.map(v => ({
        id: v.id, name: v.name,
        latitude: v.latitude === null ? null : parseFloat(String(v.latitude)),
        longitude: v.longitude === null ? null : parseFloat(String(v.longitude)),
        geofenceRadiusM: v.geofenceRadiusM,
      })),
      selectedVenueId: venue?.id ?? null,
      players,
      at: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🗺️ تاريخُ مواقع لاعبٍ واحد — للصفحة عند اختياره
// ══════════════════════════════════════════════════════
// 🔴 نقطةُ نهايةٍ منفصلة عن /locations/map عمداً: العرضُ الافتراضيّ يبقى آخرَ
//    موقعٍ لكلّ لاعب، وتاريخُ الجميع دفعةً واحدة حملٌ لا يُعرض. تُنادى عند
//    اختيار لاعبٍ بعينه لا مع تحميل الصفحة.
router.get('/locations/history', authenticate, authorize('admin', 'manager'), async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(String(req.query.playerId || ''));
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return res.status(400).json({ error: 'playerId مطلوب' });
  }
  // سقفُ العرض قرارُ مالك: آخر ٢٠٠ نقطة
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '200')) || 200, 1), 500);
  const locId = parseInt(String(req.query.locationId || ''));

  try {
    let vLat: number | null = null, vLng: number | null = null;
    if (Number.isFinite(locId)) {
      const [v] = await db.select({ latitude: locations.latitude, longitude: locations.longitude })
        .from(locations).where(eq(locations.id, locId)).limit(1);
      if (v?.latitude && v?.longitude) {
        vLat = parseFloat(String(v.latitude));
        vLng = parseFloat(String(v.longitude));
      }
    }

    const rows: any = await db.execute(sql`
      SELECT latitude, longitude, accuracy_m, is_mocked, source, captured_at
      FROM player_fixes
      WHERE player_id = ${playerId}
      ORDER BY captured_at DESC
      LIMIT ${limit}
    `);
    const list = (rows.rows ?? rows) as any[];

    // الأحدثُ أوّلاً كما جاءت — الواجهة تتكفّل بالترتيب البصريّ
    const points = list.map(r => {
      const lat = parseFloat(String(r.latitude));
      const lng = parseFloat(String(r.longitude));
      return {
        lat, lng,
        accuracyM: r.accuracy_m === null ? null : Number(r.accuracy_m),
        isMocked: r.is_mocked === true,
        source: r.source || null,
        capturedAt: new Date(r.captured_at).getTime(),
        distanceM: (vLat !== null && vLng !== null) ? haversineM(vLat, vLng, lat, lng) : null,
      };
    });

    res.json({ success: true, playerId, points, at: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
