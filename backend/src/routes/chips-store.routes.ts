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
  grantRental, notifyExpiringSoon, isSoundKeyAvailable,
} from '../services/chips-store.service.js';
import { getChipsBalance } from '../services/chips.service.js';
import { logStaffAction } from '../services/staff-action-log.service.js';

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
    const stingKeys = new Set<string>();
    for (const it of catalog as any[]) {
      if (it.kind === 'victory_sting' && it.config?.soundKey) stingKeys.add(String(it.config.soundKey));
    }
    const availableSounds = new Set<string>();
    for (const key of stingKeys) {
      if (await isSoundKeyAvailable(key)) availableSounds.add(key);
    }

    const ownedByItem = new Map(rentals.map(r => [r.itemId, r]));
    const items = catalog
      .filter((it: any) => it.kind !== 'victory_sting' || availableSounds.has(String(it.config?.soundKey || '')))
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
      };
    });

    // تنبيه قرب الانتهاء يُفحص كسولاً عند فتح المتجر
    notifyExpiringSoon(playerId);

    res.json({ success: true, balance, items, cosmetics, me });
  } catch (err: any) {
    console.error('❌ chips store:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── مظهري (الخانات المُجهَّزة الفعّالة) ──
router.get('/store/cosmetics', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const cosmetics = await getPlayerCosmetics(req.playerAccount!.playerId);
    res.json({ success: true, cosmetics });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── استئجار / تجديد ──
router.post('/store/rent',
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'chips-rent' }),
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
    if (b.priceChips != null) patch.priceChips = Math.max(0, Math.trunc(Number(b.priceChips) || 0));
    if (b.durationDays != null) patch.durationDays = Math.min(365, Math.max(1, Math.trunc(Number(b.durationDays) || 30)));
    if (b.isActive != null) patch.isActive = !!b.isActive;
    if (b.isPurchasable != null) patch.isPurchasable = !!b.isPurchasable;
    if (b.sortOrder != null) patch.sortOrder = Math.trunc(Number(b.sortOrder) || 0);
    if (b.config != null && typeof b.config === 'object') patch.config = b.config;
    // 🔒 الإغلاق النهائي لا رجعة فيه (محرك الندرة) — يُضبط ولا يُلغى
    if (b.close === true) patch.closedAt = new Date();

    await db.update(chipsItems).set(patch).where(eq(chipsItems.id, id));

    logStaffAction({
      staffId: (req as any).user?.id,
      staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role,
      source: 'http',
      action: 'chips:item-edit',
      outcome: 'success',
      details: { itemId: id, patch: { ...patch, config: b.config ? '[كائن تأثيرات]' : undefined } },
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
