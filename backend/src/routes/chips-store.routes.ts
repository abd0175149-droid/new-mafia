// ══════════════════════════════════════════════════════
// 🏦 مسارات خزنة الدون — الكتالوج والاستئجار والتجهيز
//   /api/chips/store/*   → اللاعب (authenticatePlayer)
//   /api/chips/items/*   → إدارة الكتالوج (adminOnly)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { getDB } from '../config/db.js';
import { chipsItems, CHIPS_ITEM_KINDS, CHIPS_RARITIES } from '../schemas/chips-store.schema.js';
import { players } from '../schemas/player.schema.js';
import {
  listCatalog, getActiveRentals, getPlayerCosmetics, rentItem, equipItem,
  grantRental, isSoundKeyAvailable, listVictoryStings, getStingById,
  claimFreeTrial, hasUsedTrial, itemTrialEligible,
  getInventorySummary, getExpiringRentals,
} from '../services/chips-store.service.js';
import { getChipsBalance } from '../services/chips.service.js';
import {
  normalizeItemConfig, normalizeEmblemId, designRegistry,
  normalizePriceChips, normalizeDurationDays,
  DEFAULT_DAYS_BY_KIND, KEY_PREFIX_BY_KIND,
} from '../shared/chips-design.contract.js';
import { getRewardsConfig } from '../services/chips-rewards.service.js';
import { CHIPS_PACKS } from '../schemas/chips.schema.js';
import { sql } from 'drizzle-orm';
import { logStaffAction } from '../services/staff-action-log.service.js';

function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }

const router = Router();

// ══════════════════════════════════════════════════════
// 👤 اللاعب
// ══════════════════════════════════════════════════════

// ── واجهة المتجر: الكتالوج + المملوك + الرصيد في نداء واحد ──
router.get('/store', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const playerId = req.playerAccount!.playerId;
    const db = getDB();
    const [catalog, rentals, balance, cosmetics] = await Promise.all([
      listCatalog(),
      getActiveRentals(playerId),
      getChipsBalance(playerId),
      getPlayerCosmetics(playerId),
    ]);

    // 🖼️ بيانات بطاقة اللاعب نفسه — لازمة لمعاينة «جرّب قبل الشراء» على صورته
    // الحقيقية (سياق اللاعب في الواجهة لا يحمل الصورة ولا الرتبة).
    let me: any = null;
    if (db) {
      const [row] = await db.select({
        name: players.name,
        avatarUrl: players.avatarUrl,
        rankTier: players.rankTier,
        gender: players.gender,
      }).from(players).where(eq(players.id, playerId)).limit(1);
      if (row) me = row;
    }

    // 🔊 نغمة النصر لا تُعرض ما لم يكن ملفها الصوتي مربوطاً فعلاً بلوحة المؤثرات
    // (بيع نغمة بلا صوت = وعد فارغ). الفحص لحظي فلا يحتاج إعادة تشغيل.
    // المكتبة تُقرأ مرّة واحدة — لا استعلام لكل عنصر (حلقة N+1 كانت هنا).
    const rewardsCfgEarly = await getRewardsConfig().catch(() => null as any);
    const trialUsed = await hasUsedTrial(playerId);
    // حامل الإكليل الحالي — استعلام واحد، يجعل «إنجاز فقط» هدفاً لا حائطاً
    const championName = db ? (rowsOf(await db.execute(sql`
      SELECT p.name FROM chips_rentals r
        JOIN players p ON p.id = r.player_id
        JOIN chips_items i ON i.id = r.item_id
       WHERE i.item_key = 'frame_champ' AND r.expires_at > NOW()
       ORDER BY r.expires_at DESC LIMIT 1
    `))[0]?.name || null) : null;
    const stingLib = await listVictoryStings();
    const activeStingIds = new Set(stingLib.filter(x => x.isActive).map(x => x.id));
    const stingUrlById = new Map(stingLib.map(x => [x.id, x.url]));

    const stingKeys = new Set<string>();
    for (const it of catalog as any[]) {
      if (it.kind === 'victory_sting' && it.config?.soundKey) stingKeys.add(String(it.config.soundKey));
    }
    const availableSounds = new Set<string>();
    for (const key of stingKeys) {
      if (await isSoundKeyAvailable(key)) availableSounds.add(key);
    }

    /** عنصر نغمة يُعرَض فقط إن كان ملفّه موجوداً فعلاً — لا نبيع وعداً فارغاً */
    const stingPlayable = (it: any) =>
      it.kind !== 'victory_sting'
      || (it.config?.soundId ? activeStingIds.has(Number(it.config.soundId))
                             : availableSounds.has(String(it.config?.soundKey || '')));

    // ══════════════════════════════════════════════════
    // 🛍️ بيانات التسويق — كلها من صفوف موجودة أصلاً
    //
    // ⚠️ كان المتجر يعرض السعر والاسم فقط. كل ما يجعل قراراً شرائياً ممكناً
    //    — كم يملكه غيري؟ ما الأكثر طلباً؟ ما الجديد؟ ماذا كان لي وانتهى؟
    //    كم ينقصني؟ وكم يساوي التشبس بالدينار؟ — كان موجوداً في القاعدة
    //    وغير معروض. هذه ثلاثة تجميعات وفهارسها.
    // ══════════════════════════════════════════════════
    const ownersRows = db ? rowsOf(await db.execute(sql`
      SELECT item_id, COUNT(DISTINCT player_id)::int AS owners
        FROM chips_rentals WHERE expires_at > NOW() GROUP BY item_id
    `)) : [];
    const owners = new Map<number, number>(ownersRows.map((r: any) => [Number(r.item_id), Number(r.owners)]));

    const hotRows = db ? rowsOf(await db.execute(sql`
      SELECT ref_id, COUNT(*)::int AS c FROM chips_ledger
       WHERE ref_type = 'item' AND reason IN ('rent_item','renew_item')
         AND created_at >= date_trunc('month', NOW())
       GROUP BY ref_id ORDER BY c DESC LIMIT 3
    `)) : [];
    const hot = new Set<number>(hotRows.map((r: any) => Number(r.ref_id)));

    // «كان لك» — أقوى دافع استرجاع: عنصر جرّبه ثم فقده
    const lapsedRows = db ? rowsOf(await db.execute(sql`
      SELECT DISTINCT item_id FROM chips_rentals
       WHERE player_id = ${playerId} AND expires_at <= NOW()
    `)) : [];
    const lapsed = new Set<number>(lapsedRows.map((r: any) => Number(r.item_id)));

    // نافذة «جديد» صارت إعداداً: إطلاقٌ شهريّ ونافذة أسبوعين قرارٌ تسويقيّ
    // يتغيّر، ولا يجوز أن يحتاج نشرة كود.
    const NEW_DAYS = Math.min(90, Math.max(1, Number(rewardsCfgEarly?.store?.newDays) || 14));
    const newCutoff = Date.now() - NEW_DAYS * 86400000;

    const ownedByItem = new Map(rentals.map(r => [r.itemId, r]));
    const items = catalog
      .filter(stingPlayable)
      .map((it: any) => {
      const owned = ownedByItem.get(it.id);
      return {
        id: it.id,
        kind: it.kind,
        itemKey: it.itemKey,
        nameAr: it.nameAr,
        hookAr: it.hookAr,
        rarity: it.rarity,
        priceChips: it.priceChips,
        durationDays: it.durationDays,
        emblemId: it.emblemId,
        config: it.config,
        isPurchasable: it.isPurchasable,
        closed: !!it.closedAt,
        owned: !!owned,
        expiresAt: owned?.expiresAt ?? null,
        // ── إشارات التسويق ──
        owners: owners.get(it.id) || 0,
        // التجاوز اليدوي يعلو الاشتقاق؛ و`null` يعني «اترك البيانات تقرّر»
        isHot: it.hotOverride ?? hot.has(it.id),
        isNew: it.newOverride ?? (it.createdAt ? new Date(it.createdAt).getTime() > newCutoff : false),
        wasOwned: !owned && lapsed.has(it.id),
        sortOrder: it.sortOrder ?? 0,
        // 🎁 الأهلية تُحسب مرّة للاعب ومرّة للعنصر — فالزرّ لا يظهر ليُرفض
        trialEligible: !trialUsed && itemTrialEligible(it) && !owned,
        // 👑 عنصر الإنجاز: لا يكفي أن يُقال «إنجاز فقط» — يُسمّى الإنجاز
        //    ويُذكر حامله الحالي، وإلا بقي صندوقاً رمادياً بلا طريق إليه.
        achievementAr: it.itemKey === 'frame_champ' ? 'صدارة الموسم' : null,
        holderName: it.itemKey === 'frame_champ' ? (championName || null) : null,
        // 🔊 رابط الملف — يسمح للمتجر بإسماع النغمة قبل الشراء.
        //    تُعزَف على جهاز اللاعب وحده ولا تُبَثّ للقاعة إطلاقاً.
        soundUrl: it.kind === 'victory_sting' && it.config?.soundId
          ? (stingUrlById.get(Number(it.config.soundId)) || null) : null,
      };
    });

    // ⛔ لا إشعار من قراءة. كان هذا السطر يجعل كل فتحة متجر تكتب في
    //    القاعدة (warned_at) وتُطلق إشعاراً — فحلقة تحديث أو prefetch
    //    تُغرق اللاعب. التنبيه انتقل إلى `startExpiryScheduler` وهو يصل
    //    من لا يفتح المتجر أصلاً — وهم مَن يحتاجونه فعلاً.

    // 💵 الباقات ومعدلات الكسب: كانت موجودة في الخادم بلا أي مستدعٍ، فاللاعب
    //    الذي ينقصه رصيد لم يكن يعرف كم يساوي التشبس ولا كيف يكسبه.
    const rewardsCfg = await getRewardsConfig().catch(() => null);
    res.json({
      success: true, balance, items, cosmetics, me, trialUsed,
      packs: CHIPS_PACKS,
      earnRates: {
        win: rewardsCfg?.drops?.win ?? 2,
        top3: rewardsCfg?.drops?.top3 ?? 3,
        firstMatch: rewardsCfg?.drops?.firstMatch ?? 10,
        birthday: rewardsCfg?.birthday?.enabled ? (rewardsCfg?.birthday?.amount ?? 0) : 0,
      },
    });
  } catch (err: any) {
    console.error('❌ chips store:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── مظهري (الخانات المُجهَّزة الفعّالة) ──
// تُرجع كذلك رتبة اللاعب: بطاقته داخل التطبيق تحتاج الاثنين معاً لترسم
// نفس ما تعرضه شاشة القاعة، و`/api/player-auth/me` لا يحمل الرتبة.
router.get('/store/cosmetics', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const playerId = req.playerAccount!.playerId;
    const db = getDB();
    const [cosmetics, rankRow] = await Promise.all([
      getPlayerCosmetics(playerId),
      db
        ? db.select({ rankTier: players.rankTier }).from(players).where(eq(players.id, playerId)).limit(1)
        : Promise.resolve([] as any[]),
    ]);
    res.json({ success: true, cosmetics, rankTier: rankRow?.[0]?.rankTier || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 🎁 التجربة المجانية (قرار المالك ٩) ──
// ندرة ≤ epic · ٣ أيام · مرّة واحدة للأبد، والحدّ مسنود بفهرس لا بشرط.
router.post('/store/trial',
  rateLimit({
    windowMs: 60_000, max: 60, keyPrefix: 'chips-trial',
    identity: (req) => String(req.headers.authorization || '').slice(-32) || null,
    identityMax: 5,
  }),
  authenticatePlayer,
  async (req: Request, res: Response) => {
    try {
      const playerId = req.playerAccount!.playerId;
      const itemId = parseInt(req.body?.itemId);
      if (!itemId || isNaN(itemId)) return res.status(400).json({ error: 'معرّف العنصر مطلوب' });

      const r = await claimFreeTrial({ playerId, itemId });
      if (!r.ok) {
        const status = r.code === 'NOT_FOUND' ? 404
          : r.code === 'ALREADY_USED' || r.code === 'PAID_BEFORE' || r.code === 'ALREADY_OWNED' ? 409
          : r.code === 'DB_DOWN' ? 503 : 400;
        return res.status(status).json({ error: r.message, code: r.code });
      }
      res.json({ success: true, ...r });
    } catch (err: any) {
      console.error('❌ chips trial:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── استئجار / تجديد ──
router.post('/store/rent',
  // الحدّ على الرمز لا على العنوان: قاعة كاملة خلف NAT واحد
  // كانت تتقاسم ٢٠ عملية في الدقيقة — لاعب متحمّس يمنع البقية من الشراء.
  rateLimit({
    windowMs: 60_000, max: 200, keyPrefix: 'chips-rent',
    identity: (req) => String(req.headers.authorization || '').slice(-32) || null,
    identityMax: 12,
  }),
  authenticatePlayer,
  async (req: Request, res: Response) => {
    try {
      const playerId = req.playerAccount!.playerId;
      const itemId = parseInt(req.body.itemId);
      const requestId = req.body.requestId ? String(req.body.requestId) : null;
      if (!itemId || isNaN(itemId)) return res.status(400).json({ error: 'العنصر مطلوب' });

      const result = await rentItem({ playerId, itemId, requestId });
      if (!result.ok) {
        const status = result.code === 'INSUFFICIENT' ? 402
          : result.code === 'NOT_FOUND' ? 404
          : result.code === 'CLOSED' || result.code === 'NOT_PURCHASABLE' ? 409 : 400;
        return res.status(status).json({ error: result.message, balance: result.balance });
      }
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('❌ chips rent:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── تجهيز / فكّ (itemId=null يفكّ الخانة) ──
router.post('/store/equip', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const playerId = req.playerAccount!.playerId;
    const kind = String(req.body.kind || '');
    const itemId = req.body.itemId == null ? null : parseInt(req.body.itemId);
    if (!CHIPS_ITEM_KINDS.includes(kind as any)) return res.status(400).json({ error: 'خانة غير معروفة' });

    const result = await equipItem({ playerId, kind: kind as any, itemId });
    if (!result.ok) {
      const status = result.code === 'NOT_OWNED' ? 403 : result.code === 'INVALID' ? 400 : 500;
      return res.status(status).json({ error: result.message });
    }
    const cosmetics = await getPlayerCosmetics(playerId);
    res.json({ success: true, cosmetics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── مظهر لاعب آخر (عام محدود: للبطاقات في الواجهات — بلا أي بيانات مالية) ──
router.get('/store/cosmetics/:playerId', async (req: Request, res: Response) => {
  try {
    const pid = parseInt(req.params.playerId);
    if (!pid || isNaN(pid)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const cosmetics = await getPlayerCosmetics(pid);
    res.json({ success: true, cosmetics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🛡️ إدارة الكتالوج — adminOnly
// ══════════════════════════════════════════════════════

router.use('/items', authenticate, adminOnly);

// ── قائمة كل العناصر (بما فيها المخفية) ──
router.get('/items', async (_req: Request, res: Response) => {
  try {
    const items = await listCatalog(true);
    res.json({ success: true, items, kinds: CHIPS_ITEM_KINDS, rarities: CHIPS_RARITIES });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ➕ إنشاء عنصر جديد (لقب / تشريفة دخول / تأثير اسم) ──
// المفتاح يُولَّد من نوع العنصر + لاحقة فريدة، فلا يتعارض مع المبذور.
router.post('/items', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const b = req.body || {};
    const kind = String(b.kind || '');

    // ✅ الأنواع السبعة كلها قابلة للإنشاء الآن.
    //    كان القبول محصوراً بثلاثة (لقب · تشريفة · تأثير اسم)، فالإطارات —
    //    أغلى نوع وأكثره تمييزاً — لم يكن يمكن إنشاؤها من اللوحة إطلاقاً،
    //    وحدها البذرة والنشر. سبب المنع كان أن المُصيّر ينهار على إعداد ناقص؛
    //    وقد صار محصَّناً، وصار التطبيع أدناه يمنع تخزين الفاسد من الأصل.
    if (!CHIPS_ITEM_KINDS.includes(kind as any)) {
      return res.status(400).json({ error: `نوع غير معروف — المتاح: ${CHIPS_ITEM_KINDS.join(' · ')}` });
    }

    const nameAr = String(b.nameAr || '').trim();
    if (nameAr.length < 2) return res.status(400).json({ error: 'اسم العنصر مطلوب' });

    const rarity = CHIPS_RARITIES.includes(b.rarity) ? b.rarity : 'rare';
    const priceChips = Math.max(0, Math.min(100000, Math.trunc(Number(b.priceChips) || 0)));
    const durationDays = Math.min(365, Math.max(1,
      Math.trunc(Number(b.durationDays) || DEFAULT_DAYS_BY_KIND[kind] || 30)));
    const hookAr = String(b.hookAr || '').slice(0, 500);

    // ── التطبيع: المصدر الوحيد للتحقّق، لكل نوع ──
    const norm = normalizeItemConfig(kind, b.config);
    if (!norm.ok) return res.status(400).json({ error: norm.message, field: norm.field });

    // نغمة بلا ملف صوت وعدٌ فارغ — نرفضها عند الإنشاء بدل أن تُخفى بصمت
    if (kind === 'victory_sting') {
      const bound = norm.config.soundId
        ? await getStingById(Number(norm.config.soundId))
        : (await isSoundKeyAvailable(String(norm.config.soundKey)) ? true : null);
      if (!bound) {
        return res.status(409).json({
          error: 'النغمة المختارة غير موجودة أو مُعطّلة — ارفعها واربطها ببند «نغمة النصر» أولاً',
          field: 'config.soundId',
        });
      }
    }

    // مفتاح فريد مقروء لكل نوع
    const itemKey = `${KEY_PREFIX_BY_KIND[kind] || 'item_'}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

    const [item] = await db.insert(chipsItems).values({
      kind, itemKey, nameAr, hookAr, rarity, priceChips, durationDays,
      emblemId: normalizeEmblemId(b.emblemId),
      config: norm.config,
      isActive: b.isActive !== false,
      isPurchasable: b.isPurchasable !== false,
      sortOrder: Math.trunc(Number(b.sortOrder) || 900),
    } as any).returning();

    // 💰 سطر التاريخ الأوّل يُكتب عند الإنشاء.
    //
    // ⚠️ لم يكن يُكتب إطلاقاً: البذرة وحدها تكتبه عند الإقلاع،
    //    فعنصر يُنشئه الأدمن يبقى بلا تاريخ سعر حتى إعادة التشغيل
    //    التالية — ونافذة يكون فيها السعر غير موثّق تكفي لإفساد حساب الإيراد.
    try {
      await db.execute(sql`
        INSERT INTO chips_item_price_history (item_id, price_chips, duration_days, changed_by)
        VALUES (${item.id}, ${priceChips}, ${durationDays}, ${(req as any).user?.id ?? null})
      `);
    } catch (e: any) {
      console.warn('⚠️ price history on create:', e?.message);
    }

    logStaffAction({
      staffId: (req as any).user?.id,
      staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role,
      source: 'http',
      action: 'chips:item-create',
      outcome: 'success',
      details: { kind, itemKey, nameAr, priceChips, durationDays, config: norm.config, coerced: norm.coerced },
    });

    res.json({ success: true, item });
  } catch (err: any) {
    console.error('❌ create chips item:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 🎨 سجلّ التصاميم المتاحة ──
// اللوحة تبني منتقياتها من هنا بدل ثوابت منسوخة في العميل. كانت النسخة
// العميلة تُقدّم خيارات لا يقبلها الخادم (والعكس)، فيختار المؤلّف تصميماً
// ويُرفض أو يُبدَّل بصمت.
// ── 🎵 مكتبة نغمات النصر ──
// كل صوت مرفوع ومربوط ببند «نغمة النصر» في صفحة المؤثرات.
// منها يختار المؤلّف نغمة **واحدة بعينها** لكل عنصر.
router.get('/items/stings', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const stings = await listVictoryStings();
    res.json({ success: true, stings, eventKey: 'chips_victory_sting' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items/design-registry', (_req: Request, res: Response) => {
  res.json({ success: true, registry: designRegistry(), kinds: CHIPS_ITEM_KINDS, rarities: CHIPS_RARITIES });
});

// ── تعديل عنصر (السعر/المدة/العرض/الإغلاق النهائي/كائن التأثيرات) ──
router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

    const b = req.body || {};
    const patch: any = { updatedAt: new Date() };
    if (b.nameAr != null) patch.nameAr = String(b.nameAr).slice(0, 80);
    if (b.hookAr != null) patch.hookAr = String(b.hookAr).slice(0, 500);
    if (b.rarity != null && CHIPS_RARITIES.includes(b.rarity)) patch.rarity = b.rarity;
    if (b.priceChips != null) {
      const g = normalizePriceChips(b.priceChips);
      if (!g.ok) return res.status(400).json({ error: g.message, field: 'priceChips' });
      patch.priceChips = g.value;
    }
    if (b.durationDays != null) {
      const g = normalizeDurationDays(b.durationDays);
      if (!g.ok) return res.status(400).json({ error: g.message, field: 'durationDays' });
      patch.durationDays = g.value;
    }
    if (b.isActive != null) patch.isActive = !!b.isActive;
    if (b.isPurchasable != null) patch.isPurchasable = !!b.isPurchasable;
    if (b.sortOrder != null) patch.sortOrder = Math.trunc(Number(b.sortOrder) || 0);
    // null صالح عمداً: يُعيد الإشارة إلى الاشتقاق بدل تثبيتها
    if (b.hotOverride !== undefined) patch.hotOverride = b.hotOverride === null ? null : !!b.hotOverride;
    if (b.newOverride !== undefined) patch.newOverride = b.newOverride === null ? null : !!b.newOverride;
    if (b.emblemId !== undefined) patch.emblemId = normalizeEmblemId(b.emblemId);

    // ⚠️ كان هذا السطر يقبل **أي كائن** بلا تحقّق — بما فيه المصفوفات —
    //    ويشحنه مباشرةً إلى مُصيّر ينهار على إعداد ناقص. أي حفظة أدمن واحدة
    //    كانت كافية لتعتيم كل بطاقات شاشة القاعة في منتصف الفعالية.
    //    الآن يُقرأ نوع العنصر من صفّه ثم يُطبَّع الإعداد بمُطبِّع نوعه.
    let coerced: string[] | undefined;
    if (b.config != null) {
      const [row] = await db.select({ kind: chipsItems.kind }).from(chipsItems).where(eq(chipsItems.id, id)).limit(1);
      if (!row) return res.status(404).json({ error: 'العنصر غير موجود' });
      const norm = normalizeItemConfig(row.kind, b.config);
      if (!norm.ok) return res.status(400).json({ error: norm.message, field: norm.field });
      if (row.kind === 'victory_sting') {
        // الربط صار بالمعرّف؛ والمفتاح يبقى للعناصر القديمة.
        const bound = norm.config.soundId
          ? await getStingById(Number(norm.config.soundId))
          : (await isSoundKeyAvailable(String(norm.config.soundKey)) ? true : null);
        if (!bound) {
          return res.status(409).json({
            error: 'النغمة المختارة غير موجودة أو مُعطّلة — لا تُباع نغمة بلا صوت',
            field: 'config.soundId',
          });
        }
      }
      patch.config = norm.config;
      coerced = norm.coerced;
    }
    // 🔒 الإغلاق النهائي لا رجعة فيه (محرك الندرة) — يُضبط ولا يُلغى
    if (b.close === true) patch.closedAt = new Date();

    await db.update(chipsItems).set(patch).where(eq(chipsItems.id, id));

    // 💰 تعديل السعر أو المدة يُسجَّل في التاريخ: سطر دفتر لإطار بـ١٢٠ يجب
    //    أن يبقى مميَّزاً عن آخر اشتُري بـ٦٠، وإلا صار حساب الإيراد بأثر رجعي.
    if (patch.priceChips != null || patch.durationDays != null) {
      const [cur] = await db.select({ p: chipsItems.priceChips, d: chipsItems.durationDays })
        .from(chipsItems).where(eq(chipsItems.id, id)).limit(1);
      if (cur) {
        await db.execute(sql`
          INSERT INTO chips_item_price_history (item_id, price_chips, duration_days, changed_by)
          VALUES (${id}, ${cur.p}, ${cur.d}, ${(req as any).user?.id ?? null})
        `);
      }
    }

    logStaffAction({
      staffId: (req as any).user?.id,
      staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role,
      source: 'http',
      action: 'chips:item-edit',
      outcome: 'success',
      details: { itemId: id, patch: { ...patch, config: b.config ? '[كائن تأثيرات]' : undefined }, coerced },
    });

    const [item] = await db.select().from(chipsItems).where(eq(chipsItems.id, id)).limit(1);
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── منح عنصر للاعب بلا مقابل (إنجاز/تعويض) ──
router.post('/items/grant', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.body.playerId);
    const itemId = parseInt(req.body.itemId);
    const days = req.body.days ? parseInt(req.body.days) : undefined;
    if (!playerId || !itemId) return res.status(400).json({ error: 'اللاعب والعنصر مطلوبان' });

    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
    const [p] = await db.select({ id: players.id, name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
    if (!p) return res.status(404).json({ error: 'اللاعب غير موجود' });

    const result = await grantRental({ playerId, itemId, days, source: 'admin_grant' });
    if (!result.ok) return res.status(400).json({ error: result.message });

    logStaffAction({
      staffId: (req as any).user?.id,
      staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role,
      source: 'http',
      action: 'chips:item-grant',
      outcome: 'success',
      targetName: p.name,
      details: { playerId, itemId, days: days ?? 'افتراضي' },
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 📊 دفتر المخزون: ما يُباع فعلاً وما يوشك أن ينتهي ──
router.get('/items/inventory', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(String(req.query.days)) : 7;
    const [items, expiring] = await Promise.all([
      getInventorySummary(days),
      getExpiringRentals(days),
    ]);
    const totals = items.reduce((t, i) => ({
      activeOwners: t.activeOwners + i.activeOwners,
      revenueChips: t.revenueChips + i.revenueChips,
      purchases: t.purchases + i.purchases,
      expiringSoon: t.expiringSoon + i.expiringSoon,
    }), { activeOwners: 0, revenueChips: 0, purchases: 0, expiringSoon: 0 });
    res.json({ success: true, days, items, expiring, totals });
  } catch (err: any) {
    console.error('❌ chips inventory:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── إيجارات لاعب (لدعم الإدارة) ──
router.get('/items/rentals/:playerId', async (req: Request, res: Response) => {
  try {
    const pid = parseInt(req.params.playerId);
    if (!pid || isNaN(pid)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const rentals = await getActiveRentals(pid);
    res.json({ success: true, rentals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
