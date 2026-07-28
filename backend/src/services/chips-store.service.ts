// ══════════════════════════════════════════════════════
// 🏦 خدمة خزنة الدون — الكتالوج، الاستئجار، التجديد، التجهيز
//
// ⏳ نموذج الإيجار: «يملك» = له إيجار نشط (expires_at > now).
//    الفحص كسول عند كل قراءة — لا كرون ولا وظيفة مجدولة.
//    التجديد يمدّد: expires_at = GREATEST(now, expires_at) + المدة.
//    انتهاء الإيجار يفكّ التجهيز تلقائياً عند أول قراءة.
// ══════════════════════════════════════════════════════

import { sql, eq, and, asc, desc, gt, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import {
  chipsItems, chipsRentals, EQUIP_SLOTS, DEFAULT_RENTAL_DAYS, EXPIRY_WARN_DAYS,
  type ChipsItemKind,
} from '../schemas/chips-store.schema.js';
import { applyChipsTx } from './chips.service.js';

// ── خانات التجهيز → أعمدة players ────────────────────

const SLOT_COLUMN: Partial<Record<ChipsItemKind, string>> = {
  frame: 'chips_frame_item_id',
  title: 'chips_title_item_id',
  name_fx: 'chips_name_fx_item_id',
};

function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }

export interface StoreResult {
  ok: boolean;
  code?: 'NOT_FOUND' | 'CLOSED' | 'NOT_PURCHASABLE' | 'INSUFFICIENT' | 'NOT_OWNED' | 'INVALID' | 'DB_DOWN' | 'ERROR';
  message?: string;
  balance?: number;
  expiresAt?: Date | string;
  itemId?: number;
  renewed?: boolean;
}

// ══════════════════════════════════════════════════════
// 📖 قراءات
// ══════════════════════════════════════════════════════

/** الكتالوج المعروض (المتجر) — يشمل غير القابل للشراء ليبقى هدفاً مرئياً */
export async function listCatalog(includeInactive = false) {
  const db = getDB();
  if (!db) return [];
  const rows = await db.select().from(chipsItems)
    .where(includeInactive ? (undefined as any) : eq(chipsItems.isActive, true))
    .orderBy(asc(chipsItems.sortOrder), asc(chipsItems.id));
  return rows;
}

/** إيجارات اللاعب النشطة الآن (الفحص الكسول للانتهاء) */
export async function getActiveRentals(playerId: number) {
  const db = getDB();
  if (!db) return [];
  return db.select({
    rentalId: chipsRentals.id,
    itemId: chipsRentals.itemId,
    expiresAt: chipsRentals.expiresAt,
    source: chipsRentals.source,
    kind: chipsItems.kind,
    itemKey: chipsItems.itemKey,
    nameAr: chipsItems.nameAr,
    rarity: chipsItems.rarity,
    emblemId: chipsItems.emblemId,
    config: chipsItems.config,
    priceChips: chipsItems.priceChips,
    durationDays: chipsItems.durationDays,
  }).from(chipsRentals)
    .innerJoin(chipsItems, eq(chipsItems.id, chipsRentals.itemId))
    .where(and(eq(chipsRentals.playerId, playerId), gt(chipsRentals.expiresAt, new Date())))
    .orderBy(asc(chipsRentals.expiresAt));
}

/**
 * 🎭 مظهر اللاعب المُجهَّز والفعّال — نقطة الحقيقة الوحيدة للواجهات.
 * تُسقِط أي خانة انتهى إيجارها (وتنظّف العمود بصمت).
 */
export async function getPlayerCosmetics(playerId: number) {
  const db = getDB();
  if (!db) return null;

  const [p] = await db.select({
    frameId: players.chipsFrameItemId,
    titleId: players.chipsTitleItemId,
    nameFxId: players.chipsNameFxItemId,
  }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) return null;

  const equippedIds = [p.frameId, p.titleId, p.nameFxId].filter(Boolean) as number[];
  // ⛔ لا خروج مبكر هنا: التشريفة والإقصاء يُفعَّلان بالإيجار لا بالتجهيز،
  //    فاللاعب بلا خانة مُجهَّزة قد يملك تشريفة نشطة — والخروج المبكر يخفيها.
  const active = await getActiveRentals(playerId);
  const activeIds = new Set(active.map(r => r.itemId));
  const byId = new Map(active.map(r => [r.itemId, r]));

  // تنظيف الخانات المنتهية (فكّ التجهيز التلقائي)
  const stale = equippedIds.filter(id => !activeIds.has(id));
  if (stale.length) {
    const sets: string[] = [];
    if (p.frameId && stale.includes(p.frameId)) sets.push('chips_frame_item_id = NULL');
    if (p.titleId && stale.includes(p.titleId)) sets.push('chips_title_item_id = NULL');
    if (p.nameFxId && stale.includes(p.nameFxId)) sets.push('chips_name_fx_item_id = NULL');
    if (sets.length) {
      await db.execute(sql.raw(`UPDATE players SET ${sets.join(', ')} WHERE id = ${Number(playerId)}`));
    }
  }

  const shape = (r: any) => ({
    itemId: r.itemId, itemKey: r.itemKey, nameAr: r.nameAr, rarity: r.rarity,
    emblemId: r.emblemId, config: r.config, expiresAt: r.expiresAt,
  });

  const pick = (id: number | null) => {
    if (!id || !activeIds.has(id)) return null;
    return shape(byId.get(id)!);
  };

  // ⚠️ أنواع بلا خانة تجهيز (تشريفة الدخول · أنيميشن الإقصاء):
  //    امتلاك إيجار نشط = تفعيل. لولا هذا لما ظهرت التشريفة أبداً مهما اشتراها اللاعب،
  //    لأن الخانات المُجهَّزة تُقرأ من أعمدة players وهذه الأنواع بلا أعمدة.
  const byKind = (kind: string) => {
    const rows = active.filter(r => r.kind === kind);
    if (!rows.length) return null;
    rows.sort((a, b) => new Date(b.expiresAt as any).getTime() - new Date(a.expiresAt as any).getTime());
    return shape(rows[0]);
  };

  return {
    frame: pick(p.frameId),
    title: pick(p.titleId),
    nameFx: pick(p.nameFxId),
    entrance: byKind('entrance'),
    elimination: byKind('elimination'),
  };
}

/** مظهر مجموعة لاعبين دفعة واحدة — لخط شاشة العرض (استعلام واحد) */
export async function getCosmeticsForPlayers(playerIds: number[]) {
  const db = getDB();
  const out: Record<number, any> = {};
  if (!db || playerIds.length === 0) return out;

  const rows = await db.select({
    playerId: players.id,
    frameId: players.chipsFrameItemId,
    titleId: players.chipsTitleItemId,
    nameFxId: players.chipsNameFxItemId,
    itemId: chipsItems.id,
    kind: chipsItems.kind,
    itemKey: chipsItems.itemKey,
    nameAr: chipsItems.nameAr,
    rarity: chipsItems.rarity,
    emblemId: chipsItems.emblemId,
    config: chipsItems.config,
  }).from(players)
    .innerJoin(chipsRentals, and(
      eq(chipsRentals.playerId, players.id),
      gt(chipsRentals.expiresAt, new Date()),
    ))
    .innerJoin(chipsItems, eq(chipsItems.id, chipsRentals.itemId))
    .where(inArray(players.id, playerIds));

  for (const r of rows) {
    // خانات مُجهَّزة بأعمدة + أنواع تُفعَّل بمجرّد امتلاك إيجار نشط
    const slotMatch =
      (r.itemId === r.frameId && 'frame') ||
      (r.itemId === r.titleId && 'title') ||
      (r.itemId === r.nameFxId && 'nameFx') ||
      (r.kind === 'entrance' && 'entrance') ||
      (r.kind === 'elimination' && 'elimination') || null;
    if (!slotMatch) continue;
    if (!out[r.playerId]) out[r.playerId] = { frame: null, title: null, nameFx: null, entrance: null, elimination: null };
    out[r.playerId][slotMatch] = {
      itemId: r.itemId, itemKey: r.itemKey, nameAr: r.nameAr,
      rarity: r.rarity, emblemId: r.emblemId, config: r.config,
    };
  }
  return out;
}

// ══════════════════════════════════════════════════════
// 🛒 الاستئجار والتجديد
// ══════════════════════════════════════════════════════

/**
 * استئجار/تجديد عنصر لمدته.
 * • السعر يُقرأ من قاعدة البيانات دائماً (لا نثق بالعميل إطلاقاً).
 * • الخصم عبر applyChipsTx (البوابة الوحيدة) بمفتاح منع تكرار من العميل.
 * • إن كان له إيجار نشط: يُمدَّد فوق المتبقّي ولا يُهدر يوم.
 */
export async function rentItem(opts: {
  playerId: number; itemId: number; requestId?: string | null;
}): Promise<StoreResult> {
  const db = getDB();
  if (!db) return { ok: false, code: 'DB_DOWN', message: 'قاعدة البيانات غير متاحة' };

  const playerId = Number(opts.playerId);
  const itemId = Number(opts.itemId);
  if (!playerId || !itemId) return { ok: false, code: 'INVALID', message: 'طلب غير صالح' };

  const [item] = await db.select().from(chipsItems).where(eq(chipsItems.id, itemId)).limit(1);
  if (!item) return { ok: false, code: 'NOT_FOUND', message: 'العنصر غير موجود' };
  if (!item.isActive) return { ok: false, code: 'CLOSED', message: 'هذا العنصر لم يعد معروضاً' };
  if (item.closedAt) return { ok: false, code: 'CLOSED', message: 'أُغلق هذا العنصر نهائياً — لا يعود' };
  if (!item.isPurchasable) return { ok: false, code: 'NOT_PURCHASABLE', message: 'هذا العنصر يُنال بالإنجاز لا بالشراء' };

  // إيجار نشط؟ (تجديد = تمديد)
  const [existing] = await db.select({ id: chipsRentals.id, expiresAt: chipsRentals.expiresAt })
    .from(chipsRentals)
    .where(and(
      eq(chipsRentals.playerId, playerId),
      eq(chipsRentals.itemId, itemId),
      gt(chipsRentals.expiresAt, new Date()),
    ))
    .orderBy(desc(chipsRentals.expiresAt))
    .limit(1);

  const renewing = !!existing;
  const rid = String(opts.requestId || '').trim().slice(0, 60)
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // 1) الخصم أولاً — لا إيجار بلا حركة دفتر مثبتة
  // ⚠️ المفتاح ثابت للطلب الواحد ولا يتبع حالة (استئجار/تجديد):
  //    لو غيّرناه حسب renewing، فإعادة إرسال نفس الطلب بعد نجاحه ستُرى
  //    كطلب جديد (لأن الإيجار صار موجوداً) فتُخصم مرتين وتُمدَّد مرتين.
  const tx = await applyChipsTx({
    playerId,
    amount: -Math.abs(item.priceChips),
    reason: renewing ? 'renew_item' : 'rent_item',
    idempotencyKey: `store:${rid}`,
    refType: 'item',
    refId: String(item.id),
    note: `${renewing ? 'تجديد' : 'استئجار'} ${item.nameAr} — ${item.durationDays} يوماً`,
    notify: {
      title: renewing ? '🔄 تم التجديد' : '🛒 عنصر جديد في خزنتك',
      body: `${item.nameAr} — ${item.durationDays} يوماً مقابل ${item.priceChips} 🪙`,
    },
  });

  if (!tx.ok) {
    return {
      ok: false,
      code: tx.code === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'ERROR',
      message: tx.code === 'INSUFFICIENT' ? 'رصيدك لا يكفي — اشحن من الإدارة' : (tx.message || 'تعذّر إتمام العملية'),
      balance: tx.balance,
    };
  }

  // 2) الحركة مكرّرة (نقر مزدوج) → لا نمدّد مرتين
  if (tx.duplicate) {
    const [cur] = await db.select({ expiresAt: chipsRentals.expiresAt }).from(chipsRentals)
      .where(and(eq(chipsRentals.playerId, playerId), eq(chipsRentals.itemId, itemId)))
      .orderBy(desc(chipsRentals.expiresAt)).limit(1);
    return { ok: true, balance: tx.balance, expiresAt: cur?.expiresAt, itemId, renewed: renewing };
  }

  const days = Number(item.durationDays || DEFAULT_RENTAL_DAYS);

  // 3) تمديد أو إنشاء — التمديد بحساب الخادم (GREATEST) فلا تُهدر أيام
  if (existing) {
    const res: any = await db.execute(sql`
      UPDATE chips_rentals
         SET expires_at = GREATEST(NOW(), expires_at) + (${days} || ' days')::interval,
             source = 'renew',
             ledger_id = ${tx.ledgerId ?? null},
             warned_at = NULL
       WHERE id = ${existing.id}
      RETURNING expires_at
    `);
    const nextExp = rowsOf(res)[0]?.expires_at;
    return { ok: true, balance: tx.balance, expiresAt: nextExp, itemId, renewed: true };
  }

  const res: any = await db.execute(sql`
    INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source, ledger_id)
    VALUES (${playerId}, ${itemId}, NOW(), NOW() + (${days} || ' days')::interval, 'rent', ${tx.ledgerId ?? null})
    RETURNING expires_at
  `);
  const exp = rowsOf(res)[0]?.expires_at;

  // تجهيز تلقائي للخانة الفارغة — أول شراء يجب أن يُرى فوراً
  const col = SLOT_COLUMN[item.kind as ChipsItemKind];
  if (col) {
    await db.execute(sql.raw(
      `UPDATE players SET ${col} = ${Number(itemId)} WHERE id = ${Number(playerId)} AND ${col} IS NULL`,
    ));
  }

  return { ok: true, balance: tx.balance, expiresAt: exp, itemId, renewed: false };
}

/** منح إيجار بلا مقابل (إنجاز/إداري) — لا يمسّ الرصيد */
export async function grantRental(opts: {
  playerId: number; itemId: number; days?: number; source?: 'achievement' | 'admin_grant';
}): Promise<StoreResult> {
  const db = getDB();
  if (!db) return { ok: false, code: 'DB_DOWN', message: 'قاعدة البيانات غير متاحة' };

  const [item] = await db.select().from(chipsItems).where(eq(chipsItems.id, Number(opts.itemId))).limit(1);
  if (!item) return { ok: false, code: 'NOT_FOUND', message: 'العنصر غير موجود' };

  const days = Number(opts.days || item.durationDays || DEFAULT_RENTAL_DAYS);
  const source = opts.source || 'admin_grant';

  const res: any = await db.execute(sql`
    INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source)
    VALUES (${Number(opts.playerId)}, ${Number(opts.itemId)}, NOW(), NOW() + (${days} || ' days')::interval, ${source})
    RETURNING expires_at
  `);
  return { ok: true, expiresAt: rowsOf(res)[0]?.expires_at, itemId: Number(opts.itemId) };
}

// ══════════════════════════════════════════════════════
// 🎽 التجهيز
// ══════════════════════════════════════════════════════

/** تجهيز عنصر (يُشترط إيجار نشط) · itemId=null يفكّ الخانة */
export async function equipItem(opts: {
  playerId: number; kind: ChipsItemKind; itemId: number | null;
}): Promise<StoreResult> {
  const db = getDB();
  if (!db) return { ok: false, code: 'DB_DOWN', message: 'قاعدة البيانات غير متاحة' };

  const col = SLOT_COLUMN[opts.kind];
  if (!col) return { ok: false, code: 'INVALID', message: 'خانة غير مدعومة بعد' };

  const playerId = Number(opts.playerId);

  if (opts.itemId == null) {
    await db.execute(sql.raw(`UPDATE players SET ${col} = NULL WHERE id = ${playerId}`));
    broadcastCosmetics(playerId);
    return { ok: true };
  }

  const itemId = Number(opts.itemId);
  const active = await getActiveRentals(playerId);
  const owned = active.find(r => r.itemId === itemId);
  if (!owned) return { ok: false, code: 'NOT_OWNED', message: 'لا تملك إيجاراً نشطاً لهذا العنصر' };
  if (owned.kind !== opts.kind) return { ok: false, code: 'INVALID', message: 'العنصر لا يناسب هذه الخانة' };

  await db.execute(sql.raw(`UPDATE players SET ${col} = ${itemId} WHERE id = ${playerId}`));
  broadcastCosmetics(playerId);
  return { ok: true, itemId, expiresAt: owned.expiresAt };
}

/** بثّ المظهر الجديد: لغرفة اللاعب + لغرف اللعب التي هو فيها (تحديث حي) */
function broadcastCosmetics(playerId: number) {
  (async () => {
    try {
      const io = (global as any).io;
      if (!io) return;
      const cos = await getPlayerCosmetics(playerId);
      io.to(`player:${playerId}`).emit('chips:cosmetics-updated', { cosmetics: cos });

      // غرف اللعب الجارية التي يجلس فيها اللاعب
      const { getAllGameStates } = await import('../config/redis.js');
      const states: any[] = await getAllGameStates();
      for (const st of states) {
        if (!st || st.phase === 'GAME_OVER') continue;
        const seat = (st.players || []).find((p: any) => p?.playerId === playerId);
        if (seat) {
          io.to(st.roomId).emit('player:cosmetics-updated', {
            playerId, physicalId: seat.physicalId, cosmetics: cos,
          });
        }
      }
    } catch { /* البث ليس جزءاً من ضمان العملية */ }
  })();
}

// ══════════════════════════════════════════════════════
// ⏳ تنبيه قرب الانتهاء (كسول — يُستدعى عند فتح المتجر/الهوم)
// ══════════════════════════════════════════════════════

export async function notifyExpiringSoon(playerId: number) {
  const db = getDB();
  if (!db) return;
  try {
    const rows: any = await db.execute(sql`
      SELECT r.id, i.name_ar, r.expires_at
        FROM chips_rentals r
        JOIN chips_items i ON i.id = r.item_id
       WHERE r.player_id = ${Number(playerId)}
         AND r.warned_at IS NULL
         AND r.expires_at > NOW()
         AND r.expires_at <= NOW() + (${EXPIRY_WARN_DAYS} || ' days')::interval
    `);
    const list = rowsOf(rows);
    if (!list.length) return;

    const { sendPushToPlayers } = await import('./fcm.service.js');
    for (const r of list) {
      const daysLeft = Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / 86400000));
      await sendPushToPlayers(
        [Number(playerId)],
        '⏳ إيجارك يقترب من الانتهاء',
        `«${r.name_ar}» ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'} — جدّده من الخزنة`,
        'chips',
        { tag: 'chips-expiry', url: '/player/store' },
      );
      await db.execute(sql`UPDATE chips_rentals SET warned_at = NOW() WHERE id = ${r.id}`);
    }
  } catch { /* التنبيه لا يعطّل شيئاً */ }
}

// ── مساعد: الخانات المدعومة حالياً ──
export function equipSlots() { return EQUIP_SLOTS.filter(k => !!SLOT_COLUMN[k]); }

// ══════════════════════════════════════════════════════
// 🔊 نغمة النصر — أي مفتاح صوت مرفوع من لوحة المؤثرات
// ══════════════════════════════════════════════════════

/** هل مفتاح الصوت مرفوع ومفعّل فعلاً؟ (نغمة تُباع بلا ملف = وعد فارغ) */
export async function isSoundKeyAvailable(soundKey: string): Promise<boolean> {
  const db = getDB();
  if (!db || !soundKey) return false;
  try {
    const res: any = await db.execute(sql`
      SELECT 1 FROM sound_effects
       WHERE is_active = true AND event_keys @> ${JSON.stringify([soundKey])}::jsonb
       LIMIT 1
    `);
    return rowsOf(res).length > 0;
  } catch { return false; }
}

/**
 * نغمة النصر التي ستُعزف لهذه المباراة.
 * قاعدة الاختيار: **نغمة واحدة فقط** مهما تعدّد المالكون بين الفائزين
 * (نغمتان معاً = ضجيج لا احتفال) — ونختار الأدنى مقعداً لثبات النتيجة.
 * تُتجاهل النغمة إن لم يكن ملفها مرفوعاً.
 */
export async function resolveVictorySting(winners: Array<{ playerId: number; name?: string | null; physicalId?: number }>) {
  const db = getDB();
  if (!db || winners.length === 0) return null;
  try {
    const ids = winners.map(w => w.playerId).filter(Boolean);
    if (ids.length === 0) return null;

    const rows = await db.select({
      playerId: chipsRentals.playerId,
      config: chipsItems.config,
      nameAr: chipsItems.nameAr,
    }).from(chipsRentals)
      .innerJoin(chipsItems, eq(chipsItems.id, chipsRentals.itemId))
      .where(and(
        inArray(chipsRentals.playerId, ids),
        eq(chipsItems.kind, 'victory_sting'),
        gt(chipsRentals.expiresAt, new Date()),
      ));
    if (rows.length === 0) return null;

    const owners = new Map(rows.map(r => [r.playerId, r]));
    const ordered = [...winners]
      .filter(w => owners.has(w.playerId))
      .sort((a, b) => (a.physicalId ?? 0) - (b.physicalId ?? 0));
    if (ordered.length === 0) return null;

    const pick = ordered[0];
    const item = owners.get(pick.playerId)!;
    const soundKey = String((item.config as any)?.soundKey || '');
    if (!soundKey || !(await isSoundKeyAvailable(soundKey))) return null;

    return { soundKey, playerId: pick.playerId, playerName: pick.name || '', itemNameAr: item.nameAr };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════
// ⚡ المعزّزات النشطة (xp_boost) — تُقرأ لحظة احتساب المباراة
//
// ⚠️ حدود صارمة بحكم الدستور (لا كسر توازن):
//    المعزّز يضاعف **الخبرة فقط**. لا يمسّ RR ولا الرانك ولا نتيجة
//    المباراة ولا أي معلومة داخل اللعبة. وهذه الدالة قراءة محضة.
// ══════════════════════════════════════════════════════

/** مضاعِف الخبرة لكل لاعب (1 = بلا معزّز) — استعلام واحد للمجموعة كلها */
export async function getXpMultipliers(playerIds: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  const db = getDB();
  if (!db || playerIds.length === 0) return out;
  try {
    const rows = await db.select({
      playerId: chipsRentals.playerId,
      config: chipsItems.config,
    }).from(chipsRentals)
      .innerJoin(chipsItems, eq(chipsItems.id, chipsRentals.itemId))
      .where(and(
        inArray(chipsRentals.playerId, playerIds),
        eq(chipsItems.kind, 'xp_boost'),
        gt(chipsRentals.expiresAt, new Date()),
      ));
    for (const r of rows) {
      const m = Number((r.config as any)?.multiplier || 1);
      // نأخذ الأعلى إن تصادف أكثر من معزّز، وبسقف أمان
      const safe = Math.min(Math.max(m, 1), 3);
      out[r.playerId] = Math.max(out[r.playerId] || 1, safe);
    }
  } catch { /* المعزّز ميزة — لا يعطّل احتساب المباراة */ }
  return out;
}
