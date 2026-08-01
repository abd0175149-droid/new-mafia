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
import {
  applyChipsTx, applyChipsTxIn, emitChipsSideEffects, isLedgerDuplicateError,
} from './chips.service.js';

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

  // ⛔ لا كتابة من قراءة. كان هنا `UPDATE players SET chips_*_item_id = NULL`
  //    لفكّ الخانات المنتهية — فكانت كل قراءة للمظهر (والمتجر يقرؤه في كل
  //    فتحة) تكتب في جدول اللاعبين.
  //
  //    وحذفه لا يُفسد شيئاً: `pick()` أدناه يرفض أصلاً أي خانة ليست ضمن
  //    الإيجارات النشطة، فالقارئ يرى الحقيقة سواء نُظِّف العمود أم لا.
  //    التنظيف الفعلي انتقل إلى `sweepStaleEquipSlots` في المجدول.
  void equippedIds;

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

  // 🔒 تعقيم معرّف الطلب: **النقطتان محظورتان**.
  //    المفتاح مبنيّ بالنقطتين فاصلاً، فمعرّف طلب يحوي `:` يستطيع انتحال
  //    شكل مفتاح آخر. مثال حقيقي: شراء رخيص بـrid=«q» يولّد `store:{p}:q:3`،
  //    ثم إرسال rid=«q:3» لعنصر آخر يجعل المفتاح القديم مطابقاً حرفياً —
  //    فيُرى الطلب «مكرّراً» قبل أي خصم. نقصر المعرّف على محارف آمنة.
  const rawRid = String(opts.requestId || '').trim().slice(0, 60);
  const rid = /^[A-Za-z0-9._-]{1,60}$/.test(rawRid)
    ? rawRid
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // 🔑 المفتاح مربوط بهدفه بالكامل: **الدافع** والطلب والعنصر.
  //    القيد الفريد على المفتاح عالميّ لا لكل لاعب — فمفتاح بلا معرّف لاعب
  //    يتعارض عبر الحسابات: حساب ثانٍ يُعيد نفس الطلب يصطدم بالقيد، تتراجع
  //    معاملته بلا خصم، ثم يُسلَّم له العنصر مجاناً. إدراج معرّف اللاعب يغلق
  //    هذا الباب من أصله.
  const key = `store:${playerId}:${rid}:${itemId}`;
  // 🕰️ المفتاح القديم — يُفحص ١٤ يوماً بعد النشر ثم يُحذف. بدونه تُرى إعادةُ
  //    محاولةٍ نجحت قبل النشر كطلبٍ جديد فتُخصم ثانيةً.
  const legacyKey = `store:${rid}`;

  const nowIso = new Date();

  try {
    const out = await db.transaction(async (tx) => {
      // ⓪ قفل استشاري لهذا (اللاعب + العنصر) طوال المعاملة.
      //    `FOR UPDATE` على صفوف الإيجار لا يقفل شيئاً حين **لا يوجد** إيجار
      //    بعد — وهي بالضبط حالة الشراء الأول. فطلبان متزامنان بمعرّفَي طلب
      //    مختلفين كانا يمرّان معاً فيُخصم مرتين ويُنشأ إيجاران متداخلان.
      //    القفل الاستشاري يُسلسل الحالتين معاً: الأولى والتجديد.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rent:${playerId}:${itemId}`}))`);

      // ① العنصر — يُقرأ **داخل** المعاملة كي لا يتغيّر سعره بين الفحص والخصم
      const itemRows = rowsOf(await tx.execute(sql`
        SELECT id, kind, name_ar, price_chips, duration_days, is_active, is_purchasable, closed_at
          FROM chips_items WHERE id = ${itemId} LIMIT 1
      `));
      if (itemRows.length === 0) throw Object.assign(new Error('NOT_FOUND'), { storeCode: 'NOT_FOUND', msg: 'العنصر غير موجود' });
      const item = itemRows[0];
      if (!item.is_active) throw Object.assign(new Error('CLOSED'), { storeCode: 'CLOSED', msg: 'هذا العنصر لم يعد معروضاً' });
      if (item.closed_at) throw Object.assign(new Error('CLOSED'), { storeCode: 'CLOSED', msg: 'أُغلق هذا العنصر نهائياً — لا يعود' });
      if (!item.is_purchasable) throw Object.assign(new Error('NOT_PURCHASABLE'), { storeCode: 'NOT_PURCHASABLE', msg: 'هذا العنصر يُنال بالإنجاز لا بالشراء' });

      // ② المفتاح القديم مُستهلَك؟ ⇒ الطلب نفسه نجح قبل النشر.
      //    ⚠️ يُشترط تطابق **اللاعب والعنصر والسبب** معاً: وجود سطر بمفتاح
      //    متشابه لا يعني أن هذا الطلب نُفِّذ. بلا هذه الشروط كان يكفي أن
      //    يوجد أي سطر بذلك المفتاح ليُعدّ الطلب مكرّراً — قبل أي خصم.
      const legacyHit = rowsOf(await tx.execute(sql`
        SELECT id, balance_after FROM chips_ledger
         WHERE idempotency_key = ${legacyKey}
           AND player_id = ${playerId}
           AND ref_type = 'item'
           AND ref_id = ${String(itemId)}
           AND reason IN ('rent_item','renew_item')
         LIMIT 1
      `));
      if (legacyHit.length) {
        throw Object.assign(new Error('DUPLICATE'), { storeCode: 'DUPLICATE', ledgerId: Number(legacyHit[0].id), balance: Number(legacyHit[0].balance_after) });
      }

      // ③ الصفّ القائم لهذا (اللاعب، العنصر) — **بلا شرط انتهاء**.
      //
      // ⚠️ كان الشرط `expires_at > now`، فإيجارٌ **منتهٍ** + شراء جديد
      //    يُنتجان صفّاً ثانياً — والتكرار ليس أثر تزامن كما بدا، بل
      //    نتيجة حتمية لكل من اشترى ثم ترك العنصر ينتهي ثم عاد.
      //    الصفوف المكرّرة تُضخّم عدّاد المالكين، وتُكرّر إشعار الانتهاء،
      //    وتجعل الاسترجاع يُبطل صفّاً ويترك آخر.
      //
      // 📌 و«تجديد أم شراء» يُقرَّر **داخل SQL** لا في جافاسكربت: الحساب
      //    في العقدة يلتقط الوقت قبل فتح المعاملة، والعمود بلا منطقة
      //    زمنية — وهذا الفرع يقرّر rent_item مقابل renew_item، أي
      //    يقرّر تصنيف الإيراد في التقرير. لا انحراف ساعة في فرع محاسبي.
      const existingRows = rowsOf(await tx.execute(sql`
        SELECT id, expires_at, (expires_at > NOW()) AS is_active
          FROM chips_rentals
         WHERE player_id = ${playerId} AND item_id = ${itemId}
         ORDER BY expires_at DESC LIMIT 1
         FOR UPDATE
      `));
      const existing = existingRows[0] || null;
      const renewing = !!existing?.is_active;
      const price = Math.abs(Number(item.price_chips) || 0);
      const days = Number(item.duration_days || DEFAULT_RENTAL_DAYS);

      // ④ الخصم — **داخل المعاملة نفسها**. لا يمكن بعد اليوم أن يُخصم مال
      //    بلا إيجار: إما أن يُثبَّت الاثنان معاً أو لا شيء.
      const ledger = await applyChipsTxIn(tx, {
        playerId,
        amount: -price,
        reason: renewing ? 'renew_item' : 'rent_item',
        idempotencyKey: key,
        refType: 'item',
        refId: String(itemId),
        note: `${renewing ? 'تجديد' : 'استئجار'} ${item.name_ar} — ${days} يوماً`,
      });

      // ⑤ الإيجار — صفّ واحد لكل (لاعب، عنصر) دائماً.
      //    القائم يُحدَّث سواء كان فعّالاً (تمديد فوق المتبقّي فلا تُهدر أيام)
      //    أو منتهياً (GREATEST تُعيده إلى الآن فيبدأ مدّة كاملة نظيفة).
      let expiresAt: any;
      if (existing) {
        const r: any = await tx.execute(sql`
          UPDATE chips_rentals
             SET expires_at = GREATEST(NOW(), expires_at) + (${days} || ' days')::interval,
                 -- شراء جديد فوق صفّ منتهٍ يبدأ من جديد: يُعاد ضبط تاريخ البدء
                 starts_at = CASE WHEN ${renewing} THEN starts_at ELSE NOW() END,
                 source = ${renewing ? 'renew' : 'rent'},
                 ledger_id = ${ledger.ledgerId}, warned_at = NULL,
                 price_paid_chips = ${price}, duration_days_snapshot = ${days}
           WHERE id = ${existing.id}
          RETURNING expires_at
        `);
        expiresAt = rowsOf(r)[0]?.expires_at;
      } else {
        const r: any = await tx.execute(sql`
          INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source, ledger_id,
                                     price_paid_chips, duration_days_snapshot)
          VALUES (${playerId}, ${itemId}, NOW(), NOW() + (${days} || ' days')::interval, 'rent', ${ledger.ledgerId},
                  ${price}, ${days})
          RETURNING expires_at
        `);
        expiresAt = rowsOf(r)[0]?.expires_at;
      }

      // ⑥ تجهيز تلقائي للخانة الفارغة — أول شراء يجب أن يُرى فوراً.
      //    ⚠️ كان داخل فرع الإدراج وحده، فمن اشترى ثم انتهت مدّته ثم عاد
      //    لا يُجهَّز له شيء — يدفع ولا يرى، وهو نفس عطب «دفع ولم يُسلَّم»
      //    بشكل أخفّ. الشرط هو «شراء جديد» لا «صفّ جديد».
      if (!renewing) {
        const col = SLOT_COLUMN[item.kind as ChipsItemKind];
        if (col) {
          await tx.execute(sql.raw(
            `UPDATE players SET ${col} = ${Number(itemId)} WHERE id = ${Number(playerId)} AND ${col} IS NULL`,
          ));
        }
      }

      return {
        balance: ledger.balance, expiresAt, renewing, price, days,
        nameAr: String(item.name_ar), ledgerId: ledger.ledgerId,
      };
    });

    // ── آثار جانبية بعد التثبيت فقط ──
    emitChipsSideEffects({
      playerId, amount: -out.price,
      reason: out.renewing ? 'renew_item' : 'rent_item',
      idempotencyKey: key,
      notify: {
        title: out.renewing ? '🔄 تم التجديد' : '🛒 عنصر جديد في خزنتك',
        body: `${out.nameAr} — ${out.days} يوماً مقابل ${out.price} 🪙`,
      },
    }, out.balance);
    broadcastCosmetics(playerId);

    return { ok: true, balance: out.balance, expiresAt: out.expiresAt, itemId, renewed: out.renewing };
  } catch (err: any) {
    // ── تكرار: الطلب نفسه نُفِّذ سابقاً ──
    if (err?.storeCode === 'DUPLICATE' || isLedgerDuplicateError(err)) {
      return repairOrConfirmRental(playerId, itemId, err?.storeCode === 'DUPLICATE' ? legacyKey : key);
    }
    if (err?.chipsCode === 'INSUFFICIENT') {
      return { ok: false, code: 'INSUFFICIENT', message: 'رصيدك لا يكفي — اشحن من الإدارة', balance: err.balance };
    }
    if (err?.chipsCode === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND', message: 'اللاعب غير موجود' };
    if (err?.storeCode) return { ok: false, code: err.storeCode, message: err.msg || 'تعذّر إتمام العملية' };
    console.error('❌ rentItem:', err?.message);
    return { ok: false, code: 'ERROR', message: 'تعذّر إتمام العملية' };
  }
}

/**
 * 🩹 تكرار الطلب: نؤكّد الإيجار — **وننشئه إن كان مفقوداً**.
 *
 * الحالة المفقودة ليست نظرية: كل عملية سبقت هذا الإصلاح كان يمكن أن تنقطع
 * بين الخصم وكتابة الإيجار، وكانت إعادة المحاولة تُعيد «نجاحاً» بلا إنشاء
 * أي شيء — فيبقى في الدفتر خصمٌ بلا مقابل إلى الأبد. هنا نُصلحه لحظة أول
 * إعادة محاولة، مربوطاً بسطر الدفتر الأصلي كي يبقى الأثر واضحاً.
 */
async function repairOrConfirmRental(playerId: number, itemId: number, idemKey: string): Promise<StoreResult> {
  const db = getDB();
  if (!db) return { ok: false, code: 'DB_DOWN', message: 'قاعدة البيانات غير متاحة' };
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rent:${playerId}:${itemId}`}))`);

      // 🔒 سطر الدفتر يجب أن يكون **دفعةَ هذا اللاعب لهذا العنصر** تحديداً.
      //    بلا هذه الشروط كان يكفي وجود أي سطر بذلك المفتاح لتُنشأ ملكية —
      //    أي «ادفع مرة، خُذ الكتالوج كله مجاناً». الشروط هنا هي الفارق بين
      //    إصلاح خصمٍ ضائع وبين منح مجاني.
      const led = rowsOf(await tx.execute(sql`
        SELECT id, balance_after FROM chips_ledger
         WHERE idempotency_key = ${idemKey}
           AND player_id = ${playerId}
           AND ref_type = 'item'
           AND ref_id = ${String(itemId)}
           AND reason IN ('rent_item','renew_item')
         LIMIT 1
      `))[0];

      if (!led) {
        // المفتاح موجود لكنه ليس دفعة هذا اللاعب لهذا العنصر ⇒ تصادم مفاتيح،
        // لا تكرار. نرفض بوضوح ولا نمنح شيئاً.
        throw Object.assign(new Error('KEY_COLLISION'), { storeCode: 'INVALID', msg: 'تعارض في معرّف الطلب — أعد المحاولة' });
      }

      // ⏳ إيجار **نشط** فقط يُعدّ تأكيداً. صفّ منتهٍ ليس بضاعةً سُلِّمت —
      //    لكنه صفّ قائم يجب أن يُعاد استعماله لا أن يُضاف فوقه ثانٍ.
      const rental = rowsOf(await tx.execute(sql`
        SELECT id, expires_at, (expires_at > NOW()) AS is_active FROM chips_rentals
         WHERE player_id = ${playerId} AND item_id = ${itemId}
         ORDER BY expires_at DESC LIMIT 1 FOR UPDATE
      `))[0];

      if (rental?.is_active) {
        return { balance: led ? Number(led.balance_after) : undefined, expiresAt: rental.expires_at, repaired: false };
      }

      // خصمٌ بلا إيجار — نُنشئه الآن بمدّة العنصر المعلنة
      const item = rowsOf(await tx.execute(sql`
        SELECT kind, duration_days FROM chips_items WHERE id = ${itemId} LIMIT 1
      `))[0];
      if (!item) return { balance: led ? Number(led.balance_after) : undefined, expiresAt: undefined, repaired: false };

      const days = Number(item.duration_days || DEFAULT_RENTAL_DAYS);
      // صفّ منتهٍ موجود ⇒ يُحيا. لا صفّ ⇒ يُدرَج. لا ثالث.
      const r: any = rental
        ? await tx.execute(sql`
            UPDATE chips_rentals
               SET starts_at = NOW(), expires_at = NOW() + (${days} || ' days')::interval,
                   source = 'rent', ledger_id = ${led ? Number(led.id) : null}, warned_at = NULL
             WHERE id = ${rental.id}
            RETURNING expires_at
          `)
        : await tx.execute(sql`
            INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source, ledger_id)
            VALUES (${playerId}, ${itemId}, NOW(), NOW() + (${days} || ' days')::interval, 'rent', ${led ? Number(led.id) : null})
            RETURNING expires_at
          `);
      const col = SLOT_COLUMN[item.kind as ChipsItemKind];
      if (col) {
        await tx.execute(sql.raw(
          `UPDATE players SET ${col} = ${Number(itemId)} WHERE id = ${Number(playerId)} AND ${col} IS NULL`,
        ));
      }
      return { balance: led ? Number(led.balance_after) : undefined, expiresAt: rowsOf(r)[0]?.expires_at, repaired: true };
    });

    if (out.repaired) {
      console.warn(`🩹 chips: أُصلح إيجار مفقود بعد خصم مثبَّت — لاعب ${playerId} عنصر ${itemId}`);
      broadcastCosmetics(playerId);
    }
    return { ok: true, balance: out.balance, expiresAt: out.expiresAt, itemId };
  } catch (e: any) {
    if (e?.storeCode) return { ok: false, code: e.storeCode, message: e.msg || 'تعذّر تأكيد العملية' };
    console.error('❌ repairOrConfirmRental:', e?.message);
    return { ok: false, code: 'ERROR', message: 'تعذّر تأكيد العملية' };
  }
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
  const playerId = Number(opts.playerId);
  const itemId = Number(opts.itemId);

  // ⚠️ كان إدراجاً أعمى بلا قفل ولا بحث — وهو **المسار الوحيد** القادر على
  //    إنتاج صفّين **فعّالين معاً** لنفس (اللاعب، العنصر). وأثره المالي مباشر:
  //    الاسترجاع يُبطل صفّاً واحداً (`ORDER BY expires_at DESC LIMIT 1`)
  //    فيعود المال ويبقى الصفّ الآخر حيّاً — أي استرجاعٌ يُنتج هديّة.
  //    الآن: قفل استشاري ثم تمديد الصفّ القائم، وإدراجٌ فقط إن لم يوجد.
  const res: any = await db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rent:${playerId}:${itemId}`}))`);

    const [existing] = rowsOf(await tx.execute(sql`
      SELECT id, (expires_at > NOW()) AS is_active FROM chips_rentals
       WHERE player_id = ${playerId} AND item_id = ${itemId}
       ORDER BY expires_at DESC LIMIT 1
       FOR UPDATE
    `));

    if (existing) {
      return await tx.execute(sql`
        UPDATE chips_rentals
           SET expires_at = GREATEST(NOW(), expires_at) + (${days} || ' days')::interval,
               starts_at = CASE WHEN ${!!existing.is_active} THEN starts_at ELSE NOW() END,
               source = ${source}, warned_at = NULL
         WHERE id = ${existing.id}
        RETURNING expires_at
      `);
    }
    return await tx.execute(sql`
      INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source)
      VALUES (${playerId}, ${itemId}, NOW(), NOW() + (${days} || ' days')::interval, ${source})
      RETURNING expires_at
    `);
  });

  // 📡 المنح الإداري/بالإنجاز يجب أن يُرى فوراً كالشراء تماماً
  broadcastCosmetics(playerId);
  return { ok: true, expiresAt: rowsOf(res)[0]?.expires_at, itemId };
}

// ══════════════════════════════════════════════════════
// 📊 دفتر المخزون — ما يملكه الناس فعلاً
//
// ⚠️ `chips_rentals` هو دفتر مخزون العمل كله، ولم تكن له **أي واجهة**.
//    المالك لا يستطيع أن يجيب: أي عنصر يُباع؟ كم إيجاراً نشطاً الآن؟ من
//    ينتهي إيجاره هذا الأسبوع كي نُذكّره؟ — أي أن المتجر يُدار على العمياني.
//    ومساران جاهزان في الخادم (`/items/rentals/:id` و`/items/grant`) بلا أي
//    مستدعٍ في الواجهة إطلاقاً.
// ══════════════════════════════════════════════════════

/** ملخّص لكل عنصر: مالكون نشطون · إجمالي مبيعات · إيراد بالتشبس · يوشك أن ينتهي */
export async function getInventorySummary(expiringDays = 7) {
  const db = getDB();
  if (!db) return [];
  const days = Math.min(90, Math.max(1, Math.trunc(expiringDays) || 7));

  const rows = rowsOf(await db.execute(sql`
    SELECT i.id, i.kind, i.name_ar, i.item_key, i.price_chips, i.duration_days,
           i.rarity, i.is_active, i.is_purchasable, i.closed_at, i.emblem_id,
           COUNT(r.id) FILTER (WHERE r.expires_at > NOW())::int AS active_owners,
           COUNT(r.id)::int AS total_rentals,
           COUNT(r.id) FILTER (
             WHERE r.expires_at > NOW() AND r.expires_at <= NOW() + (${days} || ' days')::interval
           )::int AS expiring_soon,
           MAX(r.starts_at) AS last_rented_at
      FROM chips_items i
      LEFT JOIN chips_rentals r ON r.item_id = i.id
     GROUP BY i.id
     ORDER BY active_owners DESC, i.sort_order ASC, i.id ASC
  `));

  // الإيراد من الدفتر لا من عدّ الإيجارات: التجديد حركة مالية بلا صفّ إيجار
  // جديد، فعدّ الصفوف يُنقص الإيراد الحقيقي.
  const revenue = new Map<number, { chips: number; moves: number }>();
  for (const r of rowsOf(await db.execute(sql`
    SELECT ref_id, SUM(-amount)::int AS chips, COUNT(*)::int AS moves
      FROM chips_ledger
     WHERE ref_type = 'item' AND reason IN ('rent_item','renew_item') AND amount < 0
     GROUP BY ref_id
  `))) {
    const id = Number(r.ref_id);
    if (Number.isInteger(id)) revenue.set(id, { chips: Number(r.chips || 0), moves: Number(r.moves || 0) });
  }

  return rows.map((r: any) => {
    const rev = revenue.get(Number(r.id)) || { chips: 0, moves: 0 };
    return {
      id: Number(r.id), kind: r.kind, nameAr: r.name_ar, itemKey: r.item_key,
      rarity: r.rarity, emblemId: r.emblem_id,
      priceChips: Number(r.price_chips || 0), durationDays: Number(r.duration_days || 0),
      isActive: !!r.is_active, isPurchasable: !!r.is_purchasable, closed: !!r.closed_at,
      activeOwners: Number(r.active_owners || 0),
      totalRentals: Number(r.total_rentals || 0),
      expiringSoon: Number(r.expiring_soon || 0),
      lastRentedAt: r.last_rented_at || null,
      revenueChips: rev.chips,
      purchases: rev.moves,
    };
  });
}

/** من يوشك إيجاره على الانتهاء — قائمة التذكير التي لم تكن موجودة */
export async function getExpiringRentals(days = 7, limit = 200) {
  const db = getDB();
  if (!db) return [];
  const d = Math.min(90, Math.max(1, Math.trunc(days) || 7));
  return rowsOf(await db.execute(sql`
    SELECT r.id, r.expires_at, r.warned_at,
           p.id AS player_id, p.name AS player_name, p.phone, p.avatar_url,
           i.id AS item_id, i.name_ar AS item_name, i.kind, i.price_chips
      FROM chips_rentals r
      JOIN players p ON p.id = r.player_id
      JOIN chips_items i ON i.id = r.item_id
     WHERE r.expires_at > NOW() AND r.expires_at <= NOW() + (${d} || ' days')::interval
     ORDER BY r.expires_at ASC
     LIMIT ${Math.min(1000, Math.max(1, limit))}
  `)).map((r: any) => ({
    rentalId: Number(r.id), expiresAt: r.expires_at, warnedAt: r.warned_at,
    playerId: Number(r.player_id), playerName: r.player_name, phone: r.phone, avatarUrl: r.avatar_url,
    itemId: Number(r.item_id), itemName: r.item_name, kind: r.kind, priceChips: Number(r.price_chips || 0),
  }));
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

/**
 * بثّ المظهر الجديد: لغرفة اللاعب + لغرف اللعب التي هو فيها (تحديث حي).
 *
 * ⚠️ **يُكتب في حالة اللعبة قبل البثّ.** كان يبثّ فقط، والشاشة تُطبّق التغيير
 *    على حالتها المحلية وحدها — بينما `syncStateFromData` تُعيد بناء مصفوفة
 *    اللاعبين من إسقاط Redis عند كل مزامنة. فأي تغيّر طور أو تصويت أو عقوبة
 *    بعد ثوانٍ كان يمحو المظهر الذي دفع اللاعب ثمنه، ولا يعود إلا بانضمام جديد.
 *    الكتابة أولاً تجعل المصدر والشاشة متطابقين، فلا فرق أيّهما وصل أخيراً.
 */
export function broadcastCosmetics(playerId: number) {
  (async () => {
    try {
      const io = (global as any).io;
      const cos = await getPlayerCosmetics(playerId);

      // غرف اللعب الجارية التي يجلس فيها اللاعب
      const { getAllGameStates } = await import('../config/redis.js');
      const { updatePlayer } = await import('../game/state.js');
      const states: any[] = await getAllGameStates();

      for (const st of states) {
        if (!st || st.phase === 'GAME_OVER') continue;
        const seat = (st.players || []).find((p: any) => p?.playerId === playerId);
        if (!seat) continue;

        // ① التثبيت في Redis — **في اللوبي فقط**.
        //
        // ⚠️ `updatePlayer` يقرأ حالة اللعبة كاملةً ثم يكتبها كاملةً. تشغيله من
        //    مسار يبدأه لاعب (شراء/تجهيز) أثناء مباراة جارية يفتح سباق
        //    قراءة-تعديل-كتابة على نفس الكائن الذي تكتب فيه الأصوات وأفعال
        //    الليل — فقد يُمحى صوتٌ أو فعلٌ بصمت. ثمن المظهر لا يبرّر ذلك أبداً.
        //    في اللوبي لا تصويت ولا أفعال ليل، والكتابة هناك هي بالضبط ما يفعله
        //    الانضمام أصلاً.
        //    أثناء المباراة: نكتفي بالبثّ، والشاشة تحتفظ بالمظهر لبقيّة الجلسة.
        if (st.phase === 'LOBBY') {
          try {
            await updatePlayer(st.roomId, seat.physicalId, { cosmetics: cos } as any);
          } catch { /* غرفة اختفت بين القراءة والكتابة — لا يعطّل البقيّة */ }
        }

        // ② البثّ الفوري كي لا ينتظر اللاعب مزامنة
        if (io) {
          io.to(st.roomId).emit('player:cosmetics-updated', {
            playerId, physicalId: seat.physicalId, name: seat.name, cosmetics: cos,
          });
        }
      }

      // غرفة اللاعب نفسه (تطبيقه) — بعد التثبيت كي لا يسبق العرضُ الحقيقةَ
      if (io) io.to(`player:${playerId}`).emit('chips:cosmetics-updated', { cosmetics: cos });
    } catch { /* البث ليس جزءاً من ضمان العملية */ }
  })();
}

// ══════════════════════════════════════════════════════
// ⏳ تنبيه قرب الانتهاء (كسول — يُستدعى عند فتح المتجر/الهوم)
// ══════════════════════════════════════════════════════

export async function notifyExpiringSoon(playerId: number): Promise<number> {
  const db = getDB();
  if (!db) return 0;
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
    if (!list.length) return 0;

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

// ══════════════════════════════════════════════════════
// ⏳ مجدول تنبيه الانتهاء
//
// ⚠️ لماذا وُجد: `notifyExpiringSoon` كان له مستدعٍ واحد — `GET /store`.
//    أي أن التنبيه الذي وظيفته **أن يقود اللاعب إلى المتجر** كان معلّقاً
//    على أن يفتح اللاعب المتجر أصلاً. من لا يزوره لا يُنبَّه أبداً، وينتهي
//    إيجاره بصمت. وفي المقابل كانت كل قراءة للمتجر تكتب في القاعدة
//    وتُرسل إشعارات — فحلقة تحديث واحدة تُغرق اللاعب.
//
// الآن: مسحة واحدة دورية لكل من يقترب انتهاؤه، و`warned_at` يبقى حارس
// عدم التكرار. والقراءة تتحرّر من الكتابة (انظر GET /store).
// ══════════════════════════════════════════════════════

/** ساعة الأردن (UTC+3 ثابتة) — الحاوية تعمل على UTC */
function jordanHour(): number {
  return new Date(Date.now() + 3 * 3600_000).getUTCHours();
}

/**
 * نافذة الإرسال: ١٠ صباحاً – ١٠ مساءً بتوقيت الأردن.
 * إشعار «إيجارك ينتهي» الرابعة فجراً ليس خدمةً بل إزعاج،
 * وأسرع طريق لإطفاء الإشعارات من الجهاز نهائياً.
 */
function withinSendingHours(): boolean {
  const h = jordanHour();
  return h >= 10 && h < 22;
}

/** مسحة واحدة: كل اللاعبين الذين يقترب انتهاء إيجارهم ولم يُنبَّهوا بعد */
export async function sweepExpiringRentals(): Promise<{ notified: number; players: number }> {
  const db = getDB();
  if (!db) return { notified: 0, players: 0 };

  const due = rowsOf(await db.execute(sql`
    SELECT DISTINCT r.player_id
      FROM chips_rentals r
      JOIN players p ON p.id = r.player_id
     WHERE r.warned_at IS NULL
       AND r.expires_at > NOW()
       AND r.expires_at <= NOW() + (${EXPIRY_WARN_DAYS} || ' days')::interval
       AND NOT COALESCE(p.is_test_account, false)
     LIMIT 500
  `));

  let notified = 0;
  for (const row of due) {
    try {
      const n = await notifyExpiringSoon(Number(row.player_id));
      notified += n;
    } catch { /* لاعب واحد لا يُسقط المسحة */ }
  }
  return { notified, players: due.length };
}

/**
 * 🧹 فكّ الخانات التي انتهت إيجاراتها.
 *
 * كان هذا يجري عند **كل قراءة** لمظهر لاعب. القراءة لا تحتاجه
 * (المُرجَع مفلتر أصلاً)، لكنّ ترك الأعمدة تشير إلى عنصر منتهٍ
 * يُربك أي استعلام إداري يقرأ الأعمدة مباشرة — فيُنظَّف دورياً.
 */
export async function sweepStaleEquipSlots(): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const r: any = await db.execute(sql`
    UPDATE players p SET
      chips_frame_item_id   = CASE WHEN p.chips_frame_item_id   IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM chips_rentals r WHERE r.player_id = p.id AND r.item_id = p.chips_frame_item_id   AND r.expires_at > NOW()
      ) THEN NULL ELSE p.chips_frame_item_id   END,
      chips_title_item_id   = CASE WHEN p.chips_title_item_id   IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM chips_rentals r WHERE r.player_id = p.id AND r.item_id = p.chips_title_item_id   AND r.expires_at > NOW()
      ) THEN NULL ELSE p.chips_title_item_id   END,
      chips_name_fx_item_id = CASE WHEN p.chips_name_fx_item_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM chips_rentals r WHERE r.player_id = p.id AND r.item_id = p.chips_name_fx_item_id AND r.expires_at > NOW()
      ) THEN NULL ELSE p.chips_name_fx_item_id END
    WHERE p.chips_frame_item_id IS NOT NULL
       OR p.chips_title_item_id IS NOT NULL
       OR p.chips_name_fx_item_id IS NOT NULL
  `);
  return Number(r?.rowCount ?? 0);
}

let expiryTimer: NodeJS.Timeout | null = null;

export function startExpiryScheduler(): void {
  if (expiryTimer) return;
  const everyMs = 30 * 60_000;   // كل نصف ساعة — النافذة ٣ أيام، فلا داعي لأكثر

  const tick = async () => {
    // التنظيف يجري دائماً — لا علاقة له بساعات الإرسال
    try { await sweepStaleEquipSlots(); } catch { /* التنظيف لا يعطّل شيئاً */ }
    // 👑 إكليل البطل حيازة تتبع الصدارة لا جائزة تُمنح مرّة —
    //    فمن فقد الصدارة يخلعه، وذلك يحتاج مزامنة دورية.
    try { await syncChampionFrame(); } catch { /* التتويج لا يعطّل المجدول */ }
    if (!withinSendingHours()) return;
    try {
      const r = await sweepExpiringRentals();
      if (r.notified > 0) console.log(`⏳ تنبيه انتهاء: ${r.notified} إشعاراً لـ${r.players} لاعباً`);
    } catch (e: any) {
      console.error('❌ مسحة الانتهاء:', e?.message);
    }
  };

  expiryTimer = setInterval(tick, everyMs);
  if (typeof expiryTimer.unref === 'function') expiryTimer.unref();
  // مسحة أولى بعد دقيقتين من الإقلاع — لا فوراً، كي لا تزاحم الترحيل
  setTimeout(tick, 120_000).unref?.();
  console.log('⏳ مجدول تنبيه انتهاء الإيجارات يعمل (كل ٣٠ دقيقة · ١٠ص–١٠م)');
}

// ══════════════════════════════════════════════════════
// 🎁 التجربة المجانية — قرار المالك المقفل (٩)
//
// الشروط: ندرة ≤ epic · ٣ أيام · **مرّة واحدة للأبد** لكل لاعب،
// مسنودة بفهرس جزئي فريد لا بشرط في الكود.
//
// ⚠️ لماذا الفهرس لا الشرط: هذا مسار مجّاني — أي سباق فيه يُنتج تجارب
//    متعدّدة بلا أثر مالي يكشفها لاحقاً. القفل الاستشاري يمنع التزامن
//    داخل عملية واحدة، والفهرس يمنعه أبداً.
//
// 🔗 تصادم مقصود مع منع تكرار الإيجار: بعد أن صار هناك صفّ واحد أبدي لكل
//    (لاعب، عنصر)، صار «امتلكه سابقاً» و«يملكه الآن» استعلاماً واحداً.
//    ولذلك يُبنى الحرمان على **مصدر** الإيجار لا على مجرّد وجوده:
//      • إيجار مدفوع سابق (rent/renew) ⇒ يُحرَم — التجربة لا تُستعمل
//        لتأجيل تجديد كان سيُدفع.
//      • منحة إدارية أو إنجاز انتهت ⇒ لا تمنع — لم يدفع شيئاً ولم يختر.
// ══════════════════════════════════════════════════════

/** الندرات المسموح تجربتها — القرار: ≤ epic */
const TRIAL_RARITIES = new Set(['common', 'rare', 'epic']);
const TRIAL_DAYS = 3;

export type TrialCode =
  | 'NOT_FOUND' | 'CLOSED' | 'NOT_PURCHASABLE' | 'RARITY'
  | 'KIND' | 'ALREADY_USED' | 'ALREADY_OWNED' | 'PAID_BEFORE' | 'DB_DOWN' | 'ERROR';

export interface TrialResult {
  ok: boolean;
  code?: TrialCode;
  message?: string;
  expiresAt?: Date | string;
  itemId?: number;
}

/** هل استهلك اللاعب تجربته؟ سؤال واحد يُجاب من الصفوف لا من علَم */
export async function hasUsedTrial(playerId: number): Promise<boolean> {
  const db = getDB();
  if (!db) return true;   // عند الشكّ نمنع: منح تجربة ثانية أسوأ من منعها
  const rows = rowsOf(await db.execute(sql`
    SELECT 1 FROM chips_rentals
     WHERE player_id = ${Number(playerId)}
       AND source IN ('trial', 'trial_converted')
     LIMIT 1
  `));
  return rows.length > 0;
}

/** هل هذا العنصر قابل للتجربة أصلاً؟ (للعرض في المتجر) */
export function itemTrialEligible(item: any): boolean {
  if (!item) return false;
  if (item.closedAt || item.closed_at) return false;
  if (item.isPurchasable === false || item.is_purchasable === false) return false;
  // ⛔ معزّز الخبرة مستثنى: ليس مظهراً بل الاستثناء الوحيد المرتبط بالتقدّم.
  //    تجربة مجانية له تعني ×٢ خبرة مجاناً — وهو باب خلفي لـ«الدفع مقابل التقدّم».
  if ((item.kind) === 'xp_boost') return false;
  return TRIAL_RARITIES.has(String(item.rarity));
}

/**
 * منح التجربة. لا يمسّ الرصيد ولا يكتب في الدفتر — لا مال هنا،
 * فسطر دفتر بقيمة صفر يُلوّث حساب الإيراد بلا فائدة.
 */
export async function claimFreeTrial(opts: { playerId: number; itemId: number }): Promise<TrialResult> {
  const db = getDB();
  if (!db) return { ok: false, code: 'DB_DOWN', message: 'قاعدة البيانات غير متاحة' };

  const playerId = Number(opts.playerId);
  const itemId = Number(opts.itemId);
  if (!playerId || !itemId) return { ok: false, code: 'ERROR', message: 'طلب غير صالح' };

  try {
    const out = await db.transaction(async (tx: any) => {
      // قفل على اللاعب لا على العنصر: الحدّ «مرّة واحدة» يخصّ اللاعب
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`trial:${playerId}`}))`);

      const [item] = rowsOf(await tx.execute(sql`
        SELECT id, kind, rarity, is_purchasable, closed_at, name_ar
          FROM chips_items WHERE id = ${itemId} LIMIT 1
      `));
      if (!item) return { ok: false as const, code: 'NOT_FOUND' as const, message: 'العنصر غير موجود' };
      if (item.closed_at) return { ok: false as const, code: 'CLOSED' as const, message: 'هذا العنصر أُغلق نهائياً' };
      if (!item.is_purchasable) {
        return { ok: false as const, code: 'NOT_PURCHASABLE' as const, message: 'هذا العنصر يُنال بالإنجاز لا بالتجربة' };
      }
      if (item.kind === 'xp_boost') {
        return { ok: false as const, code: 'KIND' as const, message: 'المعزّز لا يدخل التجربة المجانية' };
      }
      if (!TRIAL_RARITIES.has(String(item.rarity))) {
        return { ok: false as const, code: 'RARITY' as const, message: 'هذا العنصر أندر من أن يُجرَّب مجاناً' };
      }

      // مرّة واحدة للأبد — على مستوى اللاعب لا العنصر
      const used = rowsOf(await tx.execute(sql`
        SELECT 1 FROM chips_rentals
         WHERE player_id = ${playerId} AND source IN ('trial', 'trial_converted') LIMIT 1
      `));
      if (used.length) {
        return { ok: false as const, code: 'ALREADY_USED' as const, message: 'استعملت تجربتك المجانية سابقاً — وهي مرّة واحدة' };
      }

      const [existing] = rowsOf(await tx.execute(sql`
        SELECT id, source, (expires_at > NOW()) AS is_active
          FROM chips_rentals WHERE player_id = ${playerId} AND item_id = ${itemId}
         ORDER BY expires_at DESC LIMIT 1
         FOR UPDATE
      `));

      if (existing?.is_active) {
        return { ok: false as const, code: 'ALREADY_OWNED' as const, message: 'العنصر لديك الآن' };
      }
      // 💰 حماية إيراد التجديد: من دفع ثمنه سابقاً لا يستعمل التجربة لتأجيل تجديده.
      //    أمّا منحة إدارية أو إنجاز انتهيا فلا يمنعان — لم يدفع ولم يختر.
      if (existing && ['rent', 'renew'].includes(String(existing.source))) {
        return {
          ok: false as const, code: 'PAID_BEFORE' as const,
          message: 'سبق أن اشتريت هذا العنصر — التجربة لمن لم يجرّبه بعد',
        };
      }

      const r: any = existing
        ? await tx.execute(sql`
            UPDATE chips_rentals
               SET starts_at = NOW(), expires_at = NOW() + (${TRIAL_DAYS} || ' days')::interval,
                   source = 'trial', ledger_id = NULL, warned_at = NULL,
                   price_paid_chips = 0, duration_days_snapshot = ${TRIAL_DAYS}
             WHERE id = ${existing.id}
            RETURNING expires_at
          `)
        : await tx.execute(sql`
            INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source,
                                       price_paid_chips, duration_days_snapshot)
            VALUES (${playerId}, ${itemId}, NOW(), NOW() + (${TRIAL_DAYS} || ' days')::interval, 'trial',
                    0, ${TRIAL_DAYS})
            RETURNING expires_at
          `);

      // تجهيز الخانة الفارغة — تجربة لا تُرى ليست تجربة
      const col = SLOT_COLUMN[item.kind as ChipsItemKind];
      if (col) {
        await tx.execute(sql.raw(
          `UPDATE players SET ${col} = ${itemId} WHERE id = ${playerId} AND ${col} IS NULL`,
        ));
      }

      return {
        ok: true as const,
        expiresAt: rowsOf(r)[0]?.expires_at,
        itemId,
        nameAr: String(item.name_ar),
      };
    });

    if (!out.ok) return out;

    broadcastCosmetics(playerId);
    try {
      const { sendPushToPlayers } = await import('./fcm.service.js');
      await sendPushToPlayers(
        [playerId], '🎁 تجربتك المجانية بدأت',
        `«${(out as any).nameAr}» لك ${TRIAL_DAYS} أيام — جهّزه وشوفه على الشاشة`,
        'chips', { tag: 'chips-trial', url: '/player/store' },
      );
    } catch { /* الإشعار ليس شرطاً للمنح */ }

    return { ok: true, expiresAt: out.expiresAt, itemId };
  } catch (e: any) {
    // سباق: الفهرس الجزئي رفض تجربةً ثانية — نجاح حماية لا عطل
    if (String(e?.code || e?.cause?.code) === '23505') {
      return { ok: false, code: 'ALREADY_USED', message: 'استعملت تجربتك المجانية سابقاً' };
    }
    console.error('❌ claimFreeTrial:', e?.message);
    return { ok: false, code: 'ERROR', message: 'تعذّرت التجربة' };
  }
}


// ══════════════════════════════════════════════════════
// 👑 إكليل البطل — الإطار المرتبط بالإنجاز
//
// ⚠️ العطل الذي يغلقه هذا القسم: العنصر مبذور في الكتالوج منذ البداية،
//    وجملة بيعه تقول «لبطل الموسم وحده حتى تتويج التالي» — و**لا شيء في
//    المشروع كلّه يمنحه**. `grantRental` لا يُستدعى إلا من زرّ منح إداري
//    يدوي، و`grantTop3` يمنح تشبس فقط. فبقي الإطار زخرفةً في المتجر:
//    طموحٌ معروض لا طريق إليه. (على الإنتاج: صفر منح منذ إنشائه.)
//
// 📐 دلالته: ليس جائزة تُمنح مرّة، بل **حيازة تتبع الصدارة**. من تصدّر
//    يلبسه، ومن فقد الصدارة يخلعه في اللحظة نفسها. لذلك المزامنة تُشغَّل
//    دورياً لا عند حدث واحد.
// ══════════════════════════════════════════════════════

/** مفتاح العنصر المبذور — ثابت لا يتغيّر مع تعديلات الأدمن */
export const CHAMPION_ITEM_KEY = 'frame_champ';

export interface ChampionSyncResult {
  ok: boolean;
  seasonId?: number | null;
  championId?: number | null;
  granted?: boolean;
  revoked?: number;
  reason?: string;
}

/**
 * يُزامن حيازة إكليل البطل مع صدارة الموسم النشط.
 *
 * لا يمسّ الرصيد ولا الدفتر: إنجاز لا شراء.
 * ولا يُنشئ سطر سعر: `price_paid_chips = 0` صراحةً كي لا يُعيد استرجاعٌ
 * مالاً لم يُدفع.
 */
export async function syncChampionFrame(seasonId?: number | null): Promise<ChampionSyncResult> {
  const db = getDB();
  if (!db) return { ok: false, reason: 'DB_DOWN' };

  try {
    const [item] = rowsOf(await db.execute(sql`
      SELECT id FROM chips_items WHERE item_key = ${CHAMPION_ITEM_KEY} LIMIT 1
    `));
    if (!item) return { ok: false, reason: 'ITEM_MISSING' };
    const itemId = Number(item.id);

    // الموسم: المُمرَّر، وإلا العادي النشط
    const { listSeasonsForRewards, getSeasonTopPlayers } = await import('./chips-rewards.service.js');
    const seasons = await listSeasonsForRewards();
    const season = seasonId
      ? seasons.find((s: any) => s.id === Number(seasonId))
      : (seasons.find((s: any) => s.type === 'REGULAR' && s.status === 'ACTIVE')
         || seasons.find((s: any) => s.status === 'ACTIVE'));
    if (!season) return { ok: false, reason: 'NO_ACTIVE_SEASON' };

    const top = await getSeasonTopPlayers(Number(season.id), 1);
    const champion = top[0]?.playerId ? Number(top[0].playerId) : null;

    // ⚠️ لا متصدّر ⇒ **لا نسحب من أحد**. جدول فارغ لحظةَ إعادة حساب أو
    //    بداية موسم لا يعني أن البطل لم يعد بطلاً؛ السحب هنا يخلع الإكليل
    //    عن مستحقّه بسبب استعلامٍ عابر.
    if (!champion) return { ok: true, seasonId: Number(season.id), championId: null, reason: 'NO_LEADER' };

    const out = await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`champion:${itemId}`}))`);

      // يُخلع عن كل من ليس البطل الحالي
      const revoked: any = await tx.execute(sql`
        UPDATE chips_rentals
           SET expires_at = NOW()
         WHERE item_id = ${itemId}
           AND player_id <> ${champion}
           AND expires_at > NOW()
      `);

      // ويُلبَس للبطل — صفّ واحد لكل (لاعب، عنصر) فالتحديث يسبق الإدراج
      const [existing] = rowsOf(await tx.execute(sql`
        SELECT id, (expires_at > NOW()) AS is_active FROM chips_rentals
         WHERE player_id = ${champion} AND item_id = ${itemId}
         ORDER BY expires_at DESC LIMIT 1 FOR UPDATE
      `));

      const alreadyHeld = !!existing?.is_active;
      // 📅 سنة كاملة: «حتى تتويج التالي» تُنفَّذ بالمزامنة لا بانتهاء المدّة،
      //    والمدّة الطويلة تمنع سقوطه لو تعطّلت المزامنة يوماً.
      if (existing) {
        await tx.execute(sql`
          UPDATE chips_rentals
             SET expires_at = NOW() + interval '365 days',
                 starts_at = CASE WHEN ${alreadyHeld} THEN starts_at ELSE NOW() END,
                 source = 'achievement', price_paid_chips = 0, duration_days_snapshot = 365,
                 warned_at = NULL
           WHERE id = ${existing.id}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source,
                                     price_paid_chips, duration_days_snapshot)
          VALUES (${champion}, ${itemId}, NOW(), NOW() + interval '365 days', 'achievement', 0, 365)
        `);
      }

      // تجهيز تلقائي للخانة الفارغة — إكليل لا يُرى ليس تتويجاً
      await tx.execute(sql`
        UPDATE players SET chips_frame_item_id = ${itemId}
         WHERE id = ${champion} AND chips_frame_item_id IS NULL
      `);

      return { revoked: Number(revoked?.rowCount ?? 0), alreadyHeld };
    });

    // البثّ للبطل ولمن خُلع عنه — الشاشة والتطبيق يتحدّثان بلا انتظار
    broadcastCosmetics(champion);

    if (!out.alreadyHeld) {
      try {
        const { sendPushToPlayers } = await import('./fcm.service.js');
        await sendPushToPlayers(
          [champion], '👑 إكليل البطل لك',
          'تصدّرت الموسم — الإطار الذي لا يُشترى بأي ثمن صار على بطاقتك',
          'chips', { tag: 'chips-champion', url: '/player/store' },
        );
      } catch { /* الإشعار ليس شرطاً للتتويج */ }
      console.log(`👑 إكليل البطل → لاعب ${champion} (موسم ${season.id}) · خُلع عن ${out.revoked}`);
    }

    return {
      ok: true, seasonId: Number(season.id), championId: champion,
      granted: !out.alreadyHeld, revoked: out.revoked,
    };
  } catch (e: any) {
    console.error('❌ syncChampionFrame:', e?.message);
    return { ok: false, reason: 'ERROR' };
  }
}


// ══════════════════════════════════════════════════════
// 📉 قمع المتجر — قياس الرحلة من الفتح إلى الشراء
//
// ⚠️ ما كان: لا قياس إطلاقاً. أُعيد بناء المتجر بالكامل ولا أحد يعرف
//    أين يتسرّب اللاعبون: هل يفتحونه ولا يرون شيئاً؟ يجرّبون ولا يشترون؟
//    يصطدمون بنقص الرصيد فينسحبون؟ كل قرار تسويقي لاحق كان سيُبنى على حدس.
//
// 📐 مبدآن حاكمان:
//   1) **القياس لا يُعطّل البيع أبداً.** كل كتابة هنا لا ترمي ولا تُنتظَر،
//      وفشلها لا يظهر للاعب. متجرٌ لا يعمل لأن جدول تحليلات امتلأ = عبث.
//   2) **الأحداث المالية تُسجَّل خادمياً لا من العميل.** «اشترى» يُكتب من
//      مسار الشراء نفسه؛ لو صدّقنا العميل لصار القمع قابلاً للتزوير،
//      ولأصبحت أرقام التحويل أسوأ من غيابها.
// ══════════════════════════════════════════════════════

/** الأحداث المسموحة — قائمة مغلقة كي لا يُغرِق عميلٌ الجدول بأسماء حرّة */
export const STORE_EVENTS = ['open', 'impression', 'try_on', 'shortfall', 'rent', 'trial'] as const;
export type StoreEvent = (typeof STORE_EVENTS)[number];

/** أحداث لا تُقبل من العميل إطلاقاً — تُكتب من مسارها الخادمي وحده */
const SERVER_ONLY = new Set<string>(['rent', 'trial']);

/**
 * تسجيل حدث واحد. **لا يرمي أبداً** — يُستدعى من مسارات البيع.
 * التكرار مقصود أنه مسموح للأحداث السلوكية: فتحتان في اليوم حدثان.
 * الظهور وحده مُقيَّد بفهرس يومي (انظر الترحيل) وإلا انفجر الجدول:
 * ٣٠ لاعباً × ٢٠ عنصراً × كل تمريرة = آلاف الصفوف يومياً بلا معنى إضافي.
 */
export async function recordStoreEvent(
  playerId: number,
  event: StoreEvent,
  itemId?: number | null,
): Promise<void> {
  const db = getDB();
  if (!db || !playerId) return;
  if (!(STORE_EVENTS as readonly string[]).includes(event)) return;
  try {
    await db.execute(sql`
      INSERT INTO chips_store_events (player_id, event, item_id)
      VALUES (${Number(playerId)}, ${event}, ${itemId ? Number(itemId) : null})
      ON CONFLICT DO NOTHING
    `);
  } catch { /* القياس لا يُعطّل البيع */ }
}

/** دفعة من العميل — يُصفّى منها ما لا يجوز أن يُصدَّق */
export async function recordStoreEventsFromClient(
  playerId: number,
  raw: any,
): Promise<{ accepted: number; rejected: number }> {
  const list = Array.isArray(raw) ? raw.slice(0, 60) : [];
  let accepted = 0, rejected = 0;
  for (const e of list) {
    const event = String(e?.event || '');
    if (!(STORE_EVENTS as readonly string[]).includes(event) || SERVER_ONLY.has(event)) {
      rejected++;
      continue;
    }
    const itemId = Number(e?.itemId);
    await recordStoreEvent(playerId, event as StoreEvent, Number.isFinite(itemId) && itemId > 0 ? itemId : null);
    accepted++;
  }
  return { accepted, rejected };
}

/**
 * القمع خلال مدّة. حسابات الاختبار مستثناة — كما في تقرير الاقتصاد:
 * تصفّحُ مُختبِرٍ ليس نيّةَ شراء، وإدخاله يجعل نسبة التحويل كذباً مُطمئِناً.
 */
export async function getStoreFunnel(opts: { from?: string; to?: string } = {}) {
  const db = getDB();
  if (!db) return null;
  const from = safeDateLocal(opts.from, new Date(Date.now() - 30 * 86400000));
  const to = safeDateLocal(opts.to, new Date());

  const [tot] = rowsOf(await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE e.event = 'open')::int        AS opens,
      COUNT(DISTINCT e.player_id) FILTER (WHERE e.event = 'open')::int AS visitors,
      COUNT(*) FILTER (WHERE e.event = 'impression')::int  AS impressions,
      COUNT(*) FILTER (WHERE e.event = 'try_on')::int      AS tryOns,
      COUNT(*) FILTER (WHERE e.event = 'shortfall')::int   AS shortfalls,
      COUNT(*) FILTER (WHERE e.event = 'rent')::int        AS rents,
      COUNT(*) FILTER (WHERE e.event = 'trial')::int       AS trials,
      COUNT(DISTINCT e.player_id) FILTER (WHERE e.event IN ('rent','trial'))::int AS buyers
      FROM chips_store_events e
      JOIN players p ON p.id = e.player_id
     WHERE e.created_at >= ${from} AND e.created_at <= ${to}
       AND NOT COALESCE(p.is_test_account, false)
  `));

  // أين يتسرّبون: العنصر الذي يُجرَّب كثيراً ويُشترى قليلاً مشكلة سعر أو قيمة
  const byItem = rowsOf(await db.execute(sql`
    SELECT i.id, i.name_ar, i.kind, i.price_chips,
           COUNT(*) FILTER (WHERE e.event = 'impression')::int AS impressions,
           COUNT(*) FILTER (WHERE e.event = 'try_on')::int     AS try_ons,
           COUNT(*) FILTER (WHERE e.event = 'shortfall')::int  AS shortfalls,
           COUNT(*) FILTER (WHERE e.event IN ('rent','trial'))::int AS conversions
      FROM chips_store_events e
      JOIN players p ON p.id = e.player_id
      JOIN chips_items i ON i.id = e.item_id
     WHERE e.created_at >= ${from} AND e.created_at <= ${to}
       AND NOT COALESCE(p.is_test_account, false)
     GROUP BY i.id, i.name_ar, i.kind, i.price_chips
     ORDER BY 5 DESC, 4 DESC
     LIMIT 25
  `));

  const n = (v: any) => Number(v || 0);
  const opens = n(tot?.opens), tryOns = n(tot?.tryons ?? tot?.tryOns);
  const shortfalls = n(tot?.shortfalls), rents = n(tot?.rents), trials = n(tot?.trials);
  const conversions = rents + trials;

  return {
    from: from.toISOString(), to: to.toISOString(),
    totals: {
      opens, visitors: n(tot?.visitors), impressions: n(tot?.impressions),
      tryOns, shortfalls, rents, trials, conversions, buyers: n(tot?.buyers),
    },
    rates: {
      // نسب على أساس **الفتحات** لا الظهور: الظهور مُقيَّد يومياً فنسبته مضلِّلة
      tryOnRate: opens ? Math.round((tryOns / opens) * 100) : 0,
      conversionRate: opens ? Math.round((conversions / opens) * 100) : 0,
      // من جرّب ثم اشترى — أصدق مقياس لجودة العنصر نفسه
      tryToBuyRate: tryOns ? Math.round((conversions / tryOns) * 100) : 0,
      // من اصطدم بنقص الرصيد: ارتفاعه يعني التسعير أو معدّل الكسب لا الرغبة
      shortfallRate: opens ? Math.round((shortfalls / opens) * 100) : 0,
    },
    byItem: byItem.map((r: any) => ({
      itemId: n(r.id), nameAr: r.name_ar, kind: r.kind, priceChips: n(r.price_chips),
      impressions: n(r.impressions), tryOns: n(r.try_ons),
      shortfalls: n(r.shortfalls), conversions: n(r.conversions),
      tryToBuy: n(r.try_ons) ? Math.round((n(r.conversions) / n(r.try_ons)) * 100) : null,
    })),
  };
}

/** تاريخ من مدخل خارجي — مدخل فاسد يعود للافتراضي بدل RangeError */
function safeDateLocal(v: string | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d;
}

// ── مساعد: الخانات المدعومة حالياً ──
export function equipSlots() { return EQUIP_SLOTS.filter(k => !!SLOT_COLUMN[k]); }

// ══════════════════════════════════════════════════════
// 🔊 نغمة النصر — أي مفتاح صوت مرفوع من لوحة المؤثرات
// ══════════════════════════════════════════════════════

/** هل مفتاح الصوت مرفوع ومفعّل فعلاً؟ (نغمة تُباع بلا ملف = وعد فارغ) */
/**
 * 🎵 مكتبة نغمات النصر — كل صوت مرفوع ومربوط ببند «chips_victory_sting».
 *
 * ⚠️ لماذا بالمعرّف لا بالمفتاح: المفتاح واحد للبند كلّه،
 *    فإن رُبِط به صوتان صار أيّهما يُعزَف مسألة حظّ. ولذلك لم يكن
 *    يُباع إلا نغمة واحدة أبداً. الربط بمعرّف الصفّ يجعل كل عنصر
 *    مربوطاً بملفّه وحده، والبند يصير تصنيفاً لا مفتاح تشغيل.
 */
export const STING_EVENT_KEY = 'chips_victory_sting';

export async function listVictoryStings(): Promise<Array<{ id: number; name: string; url: string; isActive: boolean }>> {
  const db = getDB();
  if (!db) return [];
  try {
    const res: any = await db.execute(sql`
      SELECT id, name, filename, is_active
        FROM sound_effects
       WHERE event_keys @> ${JSON.stringify([STING_EVENT_KEY])}::jsonb
       ORDER BY is_active DESC, name ASC
    `);
    return rowsOf(res).map((r: any) => ({
      id: Number(r.id),
      name: String(r.name),
      url: `/uploads/sounds/${r.filename}`,
      isActive: !!r.is_active,
    }));
  } catch { return []; }
}

/** هل النغمة المربوطة بهذا المعرّف موجودة ومفعّلة؟ */
export async function getStingById(soundId: number): Promise<{ id: number; name: string; url: string } | null> {
  const db = getDB();
  if (!db || !soundId) return null;
  try {
    const res: any = await db.execute(sql`
      SELECT id, name, filename FROM sound_effects
       WHERE id = ${Number(soundId)} AND is_active = true
         AND event_keys @> ${JSON.stringify([STING_EVENT_KEY])}::jsonb
       LIMIT 1
    `);
    const r = rowsOf(res)[0];
    return r ? { id: Number(r.id), name: String(r.name), url: `/uploads/sounds/${r.filename}` } : null;
  } catch { return null; }
}

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
    const cfg: any = item.config || {};

    // الربط بالمعرّف أوّلاً: هو الذي يُحدّد **ملفّاً بعينه**.
    // والمفتاح يبقى للعناصر القديمة التي بيعت قبل وجود المكتبة.
    const bound = cfg.soundId ? await getStingById(Number(cfg.soundId)) : null;
    if (bound) {
      return {
        soundId: bound.id, soundUrl: bound.url, soundName: bound.name,
        soundKey: STING_EVENT_KEY,
        playerId: pick.playerId, playerName: pick.name || '', itemNameAr: item.nameAr,
      };
    }

    const soundKey = String(cfg.soundKey || '');
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
