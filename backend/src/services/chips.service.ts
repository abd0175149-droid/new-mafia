// ══════════════════════════════════════════════════════
// 🪙 خدمة التشبس — البوابة الوحيدة لكل حركة رصيد
//
// ⛔ قاعدة صارمة: لا يوجد UPDATE مباشر على players.chips_balance
//    في أي مكان بالمشروع. كل حركة تمرّ من applyChipsTx() حصراً.
//    السبب: الذرّية + مفتاح منع التكرار + الدفتر + البث + الإشعار
//    كلها في مكان واحد — فلا يمكن نسيان أحدها.
// ══════════════════════════════════════════════════════

import { sql, eq, and, desc, gte, lte, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import {
  chipsLedger, CHIPS_REASONS, getChipsPack,
  type ChipsReason,
} from '../schemas/chips.schema.js';

// ── الأنواع ──────────────────────────────────────────

export interface ChipsTxInput {
  playerId: number;
  amount: number;                 // موجب = إيداع · سالب = صرف
  reason: ChipsReason;
  idempotencyKey: string;         // فريد عالمياً — التكرار يفشل على القيد
  refType?: string | null;
  refId?: string | null;
  staffId?: number | null;
  note?: string | null;
  /** إشعار اللاعب (اختياري) — يُرسل بعد نجاح المعاملة فقط */
  notify?: { title: string; body: string } | null;
}

export type ChipsErrorCode = 'INSUFFICIENT' | 'NOT_FOUND' | 'INVALID' | 'DB_DOWN' | 'ERROR';

// واجهة واحدة بحقول اختيارية (لا discriminated union — المشروع على strict:false
// فلا يضيّق TS الاتحاد على ok، وهذا الشكل يعمل بلا تحايل).
export interface ChipsTxResult {
  ok: boolean;
  balance?: number;
  ledgerId?: number;
  duplicate?: boolean;
  code?: ChipsErrorCode;
  message?: string;
}

// ── أدوات داخلية ─────────────────────────────────────

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

function pgCodeOf(err: any): string | undefined {
  return err?.code || err?.cause?.code || err?.originalError?.code;
}

/** اسم القيد الفريد على مفتاح منع التكرار (index.ts — بذرة الإقلاع) */
export const LEDGER_IDEM_CONSTRAINT = 'idx_chips_ledger_idem';

function constraintOf(err: any): string | undefined {
  return err?.constraint || err?.cause?.constraint || err?.originalError?.constraint;
}

/**
 * هل هذا الخطأ تكرارُ **مفتاح دفتر** تحديداً؟
 *
 * ⚠️ لا يكفي فحص الرمز 23505: بعد أن صار الخصم يشارك معاملة الاستئجار،
 *    صار أي تعارض فريد آخر داخل المعاملة (صفّ إيجار مثلاً) يحمل الرمز نفسه —
 *    فمعاملته كـ«حركة مكرّرة ناجحة» يعني الإبلاغ عن نجاح لعملية لم تقع.
 *    نتحقّق من اسم القيد. وإن غاب الاسم (بعض الأغلفة لا تمرّره) نتراجع إلى
 *    الرمز وحده حفاظاً على السلوك القديم بدل رفض حركة صحيحة.
 */
export function isLedgerDuplicateError(err: any): boolean {
  if (pgCodeOf(err) !== '23505') return false;
  const c = constraintOf(err);
  return !c || c === LEDGER_IDEM_CONSTRAINT;
}

/** بث الرصيد الجديد لغرفة اللاعب (لا يُفشل الحركة أبداً) */
function emitBalance(playerId: number, balance: number, delta: number, reason: string) {
  try {
    const io = (global as any).io;
    if (io) io.to(`player:${playerId}`).emit('chips:balance-updated', { balance, delta, reason });
  } catch { /* البث ليس جزءاً من ضمان المعاملة */ }
}

/** إشعار بوش (لا يُفشل الحركة أبداً) */
function pushChips(playerId: number, title: string, body: string) {
  import('./fcm.service.js')
    .then(({ sendPushToPlayers }) => sendPushToPlayers(
      [playerId], title, body, 'chips',
      { tag: 'chips', url: '/player/home' },
    ))
    .catch(() => { /* الإشعار ليس جزءاً من ضمان المعاملة */ });
}

// ══════════════════════════════════════════════════════
// 💠 الدالة الوحيدة — كل حركة تشبس تمرّ من هنا
// ══════════════════════════════════════════════════════

/** تحقّق صارم من المدخلات — يُستدعى قبل أي لمس للقاعدة */
export function validateChipsTx(input: ChipsTxInput): ChipsTxResult | null {
  const playerId = Number(input.playerId);
  const amount = Math.trunc(Number(input.amount));
  const key = String(input.idempotencyKey || '').trim();
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, code: 'INVALID', message: 'معرّف لاعب غير صالح' };
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, code: 'INVALID', message: 'قيمة الحركة يجب أن تكون عدداً صحيحاً غير صفري' };
  if (Math.abs(amount) > 100000) return { ok: false, code: 'INVALID', message: 'قيمة الحركة تتجاوز الحد المسموح' };
  if (!CHIPS_REASONS.includes(input.reason)) return { ok: false, code: 'INVALID', message: 'سبب حركة غير معروف' };
  if (!key || key.length > 120) return { ok: false, code: 'INVALID', message: 'مفتاح منع التكرار مطلوب' };
  return null;
}

/**
 * 💠 جسد الحركة **داخل معاملة قائمة** — الشكل الوحيد الذي يسمح لمُستدعٍ
 *    بضمّ الخصم إلى عمله في ذرّة واحدة.
 *
 * ⚠️ لماذا استُخرج: `rentItem` كان يُثبّت الخصم في معاملته الخاصة ثم يكتب
 *    صفّ الإيجار بجملة منفصلة. انقطاع بين الاثنتين = خُصم المال ولم يُسلَّم
 *    شيء، وإعادة المحاولة كانت تُثبّت الخسارة (تُرى الحركة مكرّرة فيُعاد
 *    نجاح بلا إنشاء إيجار). لا يمكن إصلاح ذلك دون معاملة واحدة تضمّهما.
 *
 * يرمي عند INSUFFICIENT / NOT_FOUND، ويترك تعارض المفتاح الفريد يصعد كما هو
 * كي يقرّره المُستدعي (تكرار ناجح أم خطأ حقيقي).
 */
export async function applyChipsTxIn(tx: any, input: ChipsTxInput): Promise<{ balance: number; ledgerId: number }> {
  const playerId = Number(input.playerId);
  const amount = Math.trunc(Number(input.amount));
  const key = String(input.idempotencyKey || '').trim();

  // 1) قفل صف اللاعب — يمنع سباق حركتين متزامنتين
  const locked = rowsOf(await tx.execute(
    sql`SELECT id, COALESCE(chips_balance, 0)::int AS bal FROM players WHERE id = ${playerId} FOR UPDATE`,
  ));
  if (locked.length === 0) throw Object.assign(new Error('NOT_FOUND'), { chipsCode: 'NOT_FOUND' });

  const current = Number(locked[0].bal ?? 0);
  const next = current + amount;

  // 2) لا يهبط الرصيد تحت الصفر أبداً
  if (next < 0) throw Object.assign(new Error('INSUFFICIENT'), { chipsCode: 'INSUFFICIENT', balance: current });

  // 3) الدفتر (القيد الفريد على المفتاح = أمان النقر المزدوج)
  const [led] = await tx.insert(chipsLedger).values({
    playerId,
    amount,
    balanceAfter: next,
    reason: input.reason,
    refType: input.refType ?? null,
    refId: input.refId != null ? String(input.refId) : null,
    idempotencyKey: key,
    staffId: input.staffId ?? null,
    note: input.note ?? null,
  } as any).returning({ id: chipsLedger.id });

  // 4) كاش الرصيد
  await tx.update(players).set({ chipsBalance: next } as any).where(eq(players.id, playerId));

  return { balance: next, ledgerId: led.id };
}

/** الآثار الجانبية بعد التثبيت — بثّ الرصيد وإشعار اللاعب */
export function emitChipsSideEffects(input: ChipsTxInput, balance: number) {
  emitBalance(Number(input.playerId), balance, Math.trunc(Number(input.amount)), input.reason);
  if (input.notify) pushChips(Number(input.playerId), input.notify.title, input.notify.body);
}

export async function applyChipsTx(input: ChipsTxInput): Promise<ChipsTxResult> {
  const db = getDB();
  if (!db) return { ok: false, code: 'DB_DOWN', message: 'قاعدة البيانات غير متاحة' };

  const playerId = Number(input.playerId);
  const amount = Math.trunc(Number(input.amount));
  const key = String(input.idempotencyKey || '').trim();

  const invalid = validateChipsTx(input);
  if (invalid) return invalid;

  try {
    const out = await db.transaction(async (tx) => applyChipsTxIn(tx, input));

    // ── آثار جانبية بعد التثبيت فقط ──
    emitBalance(playerId, out.balance, amount, input.reason);
    if (input.notify) pushChips(playerId, input.notify.title, input.notify.body);

    return { ok: true, balance: out.balance, ledgerId: out.ledgerId, duplicate: false };
  } catch (err: any) {
    // ── تكرار: نفس المفتاح مُنفَّذ سابقاً — نتيجة ناجحة لا خطأ ──
    if (isLedgerDuplicateError(err)) {
      const [prev] = await db.select({ id: chipsLedger.id, balanceAfter: chipsLedger.balanceAfter })
        .from(chipsLedger).where(eq(chipsLedger.idempotencyKey, key)).limit(1);
      if (prev) return { ok: true, balance: prev.balanceAfter, ledgerId: prev.id, duplicate: true };
      return { ok: false, code: 'ERROR', message: 'تعارض غير متوقع بمفتاح الحركة' };
    }
    if (err?.chipsCode === 'INSUFFICIENT') {
      return { ok: false, code: 'INSUFFICIENT', balance: err.balance, message: 'الرصيد غير كافٍ' };
    }
    if (err?.chipsCode === 'NOT_FOUND') {
      return { ok: false, code: 'NOT_FOUND', message: 'اللاعب غير موجود' };
    }
    console.error('❌ applyChipsTx:', err?.message);
    return { ok: false, code: 'ERROR', message: 'تعذّر تنفيذ الحركة' };
  }
}

// ══════════════════════════════════════════════════════
// 📦 عمليات عالية المستوى
// ══════════════════════════════════════════════════════

/**
 * 🕰️ هل استُهلك مفتاح قديم (بلا ربط بالهدف) لهذا الطلب؟
 *
 * المفاتيح صارت مربوطة بهدفها، والقديمة لا تتعارض مع الجديدة — فبدون هذا
 * الفحص ستُرى إعادةُ محاولةٍ نجحت قبل النشر كطلبٍ جديد فتُنفَّذ مرة ثانية.
 * يبقى الفحص ١٤ يوماً بعد النشر ثم يُحذف.
 */
async function legacyKeyUsed(legacyKey: string): Promise<{ balance: number; ledgerId: number } | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const [row] = await db.select({ id: chipsLedger.id, balanceAfter: chipsLedger.balanceAfter })
      .from(chipsLedger).where(eq(chipsLedger.idempotencyKey, legacyKey)).limit(1);
    return row ? { balance: row.balanceAfter, ledgerId: row.id } : null;
  } catch { return null; }
}

/** شحن إداري بباقة معتمدة حصراً */
export async function adminTopup(opts: {
  playerId: number; packId: string; staffId?: number | null; note?: string | null; requestId?: string | null;
}): Promise<ChipsTxResult & { pack?: { id: string; jod: number; chips: number } }> {
  const pack = getChipsPack(opts.packId);
  if (!pack) return { ok: false, code: 'INVALID', message: 'باقة غير معتمدة' };

  // المفتاح يأتي من العميل (requestId) ليكون النقر المزدوج آمناً؛
  // وإن غاب نولّده فيصبح كل نداء حركة مستقلة.
  const rid = String(opts.requestId || '').trim().slice(0, 60)
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // 🔑 مربوط بهدفه: الطلب + اللاعب + الباقة.
  //    كان `topup:{rid}` وحده ومعرّف الطلب لا يتجدّد إلا عند النجاح — فموظّف
  //    ضاع ردّ شحنه ثم انتقل **للزبون التالي** كان يرى «مُنفَّذة سابقاً»
  //    ويُكتب رصيد الزبون الأول على صفّ الثاني: دفع ولم يستلم، وبلا سطر تدقيق.
  const legacy = await legacyKeyUsed(`topup:${rid}`);
  if (legacy) return { ok: true, balance: legacy.balance, ledgerId: legacy.ledgerId, duplicate: true, pack: { id: pack.id, jod: pack.jod, chips: pack.chips } };

  const res = await applyChipsTx({
    playerId: opts.playerId,
    amount: pack.chips,
    reason: 'admin_topup',
    idempotencyKey: `topup:${rid}:${Number(opts.playerId)}:${pack.id}`,
    refType: 'topup_pack',
    refId: pack.id,
    staffId: opts.staffId ?? null,
    note: opts.note ?? null,
    notify: {
      title: '🪙 تم شحن رصيدك',
      body: `أُضيف ${pack.chips} 🪙 إلى محفظتك (${pack.jod} د.أ)`,
    },
  });
  return { ...res, pack: { id: pack.id, jod: pack.jod, chips: pack.chips } };
}

/** تصحيح يدوي (موجب أو سالب) — الملاحظة إلزامية للتدقيق */
export async function adminAdjust(opts: {
  playerId: number; amount: number; note: string; staffId?: number | null; requestId?: string | null;
}): Promise<ChipsTxResult> {
  const note = String(opts.note || '').trim();
  if (note.length < 3) return { ok: false, code: 'INVALID', message: 'الملاحظة إلزامية للتصحيح اليدوي' };

  const rid = String(opts.requestId || '').trim().slice(0, 60)
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const amount = Math.trunc(Number(opts.amount));

  // 🔑 مربوط بهدفه (الطلب + اللاعب + القيمة) — نفس علّة الشحن أعلاه
  const legacy = await legacyKeyUsed(`adjust:${rid}`);
  if (legacy) return { ok: true, balance: legacy.balance, ledgerId: legacy.ledgerId, duplicate: true };

  return applyChipsTx({
    playerId: opts.playerId,
    amount,
    reason: 'admin_adjust',
    idempotencyKey: `adjust:${rid}:${Number(opts.playerId)}:${amount}`,
    refType: 'manual',
    staffId: opts.staffId ?? null,
    note: note.slice(0, 300),
    notify: amount > 0
      ? { title: '🪙 تعديل على رصيدك', body: `أُضيف ${amount} 🪙 — ${note.slice(0, 60)}` }
      : { title: '🪙 تعديل على رصيدك', body: `خُصم ${Math.abs(amount)} 🪙 — ${note.slice(0, 60)}` },
  });
}

/** رصيد لاعب واحد (من الكاش — الدفتر يبقى المرجع عند الشك) */
export async function getChipsBalance(playerId: number): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const [row] = await db.select({ bal: players.chipsBalance }).from(players).where(eq(players.id, playerId)).limit(1);
  return Number(row?.bal ?? 0);
}

/** ملخّص محفظة اللاعب: كم كسب مجاناً · كم شُحن له · كم صرف */
export async function getPlayerWalletSummary(playerId: number) {
  const db = getDB();
  if (!db) return { balance: 0, earnedFree: 0, toppedUp: 0, spent: 0, moves: 0 };
  const res: any = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND reason LIKE 'drop_%'), 0)::int AS earned_free,
      COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND reason NOT LIKE 'drop_%'), 0)::int AS topped_up,
      COALESCE(SUM(-amount) FILTER (WHERE amount < 0), 0)::int AS spent,
      COUNT(*)::int AS moves
    FROM chips_ledger WHERE player_id = ${playerId}
  `);
  const r = rowsOf(res)[0] || {};
  const balance = await getChipsBalance(playerId);
  return {
    balance,
    earnedFree: Number(r.earned_free ?? 0),
    toppedUp: Number(r.topped_up ?? 0),
    spent: Number(r.spent ?? 0),
    moves: Number(r.moves ?? 0),
  };
}

/** حركات لاعب (الأحدث أولاً) */
export async function getPlayerLedger(playerId: number, limit = 50) {
  const db = getDB();
  if (!db) return [];
  return db.select({
    id: chipsLedger.id,
    amount: chipsLedger.amount,
    balanceAfter: chipsLedger.balanceAfter,
    reason: chipsLedger.reason,
    refType: chipsLedger.refType,
    refId: chipsLedger.refId,
    note: chipsLedger.note,
    createdAt: chipsLedger.createdAt,
  }).from(chipsLedger)
    .where(eq(chipsLedger.playerId, playerId))
    .orderBy(desc(chipsLedger.id))
    .limit(Math.min(Math.max(limit, 1), 200));
}

/** دفتر إداري بفلاتر + ترقيم */
export async function getAdminLedger(opts: {
  playerId?: number; reason?: string; from?: string; to?: string; limit?: number; offset?: number;
}) {
  const db = getDB();
  if (!db) return { rows: [], total: 0 };

  const conds: any[] = [];
  if (opts.playerId) conds.push(eq(chipsLedger.playerId, opts.playerId));
  if (opts.reason && CHIPS_REASONS.includes(opts.reason as ChipsReason)) conds.push(eq(chipsLedger.reason, opts.reason));
  if (opts.from) conds.push(gte(chipsLedger.createdAt, new Date(opts.from)));
  if (opts.to) conds.push(lte(chipsLedger.createdAt, new Date(opts.to)));
  const where = conds.length ? and(...conds) : undefined;

  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const offset = Math.max(Number(opts.offset) || 0, 0);

  const rows = await db.select({
    id: chipsLedger.id,
    playerId: chipsLedger.playerId,
    playerName: players.name,
    playerPhone: players.phone,
    amount: chipsLedger.amount,
    balanceAfter: chipsLedger.balanceAfter,
    reason: chipsLedger.reason,
    refType: chipsLedger.refType,
    refId: chipsLedger.refId,
    staffId: chipsLedger.staffId,
    note: chipsLedger.note,
    createdAt: chipsLedger.createdAt,
  }).from(chipsLedger)
    .leftJoin(players, eq(players.id, chipsLedger.playerId))
    .where(where as any)
    .orderBy(desc(chipsLedger.id))
    .limit(limit).offset(offset);

  const [cnt] = await db.select({ c: sql<number>`count(*)::int` }).from(chipsLedger).where(where as any);
  return { rows, total: Number(cnt?.c ?? 0) };
}

/** أرصدة اللاعبين (بحث + ترتيب) — لواجهة الشحن */
export async function getPlayerBalances(opts: { search?: string; limit?: number }) {
  const db = getDB();
  if (!db) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const s = String(opts.search || '').trim();

  const where = s
    ? sql`(${players.name} ILIKE ${'%' + s + '%'} OR ${players.phone} ILIKE ${'%' + s + '%'})`
    : undefined;

  return db.select({
    id: players.id,
    name: players.name,
    phone: players.phone,
    avatarUrl: players.avatarUrl,
    rankTier: players.rankTier,
    balance: players.chipsBalance,
  }).from(players)
    .where(where as any)
    .orderBy(desc(players.chipsBalance), desc(players.id))
    .limit(limit);
}

/** إحصاءات الاقتصاد */
export async function getChipsStats() {
  const db = getDB();
  if (!db) return { issued: 0, spent: 0, circulating: 0, holders: 0, topupJod: 0 };

  const res: any = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::int AS issued,
      COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::int AS spent
    FROM chips_ledger
  `);
  const r = rowsOf(res)[0] || {};

  const circRes: any = await db.execute(sql`
    SELECT COALESCE(SUM(COALESCE(chips_balance,0)), 0)::int AS circulating,
           COUNT(*) FILTER (WHERE COALESCE(chips_balance,0) > 0)::int AS holders
    FROM players
  `);
  const c = rowsOf(circRes)[0] || {};

  // إيراد الشحن بالدينار — يُشتق من الباقات المسجَّلة بالدفتر
  const packRes: any = await db.execute(sql`
    SELECT ref_id, COUNT(*)::int AS n FROM chips_ledger
    WHERE reason = 'admin_topup' AND ref_type = 'topup_pack' GROUP BY ref_id
  `);
  let topupJod = 0;
  for (const row of rowsOf(packRes)) {
    const p = getChipsPack(String(row.ref_id || ''));
    if (p) topupJod += p.jod * Number(row.n || 0);
  }

  return {
    issued: Number(r.issued ?? 0),
    spent: Number(r.spent ?? 0),
    circulating: Number(c.circulating ?? 0),
    holders: Number(c.holders ?? 0),
    topupJod,
  };
}

/**
 * 🔍 تدقيق: مقارنة كاش الرصيد بمجموع الدفتر لكل لاعب.
 * الدفتر هو الحقيقة — أي انحراف يُبلَّغ (ويُصلَّح عند fix=true).
 */
export async function auditChipsBalances(fix = false) {
  const db = getDB();
  if (!db) return { checked: 0, drifted: [] as Array<{ playerId: number; cached: number; ledger: number }>, fixed: 0 };

  const res: any = await db.execute(sql`
    SELECT p.id AS player_id,
           COALESCE(p.chips_balance, 0)::int AS cached,
           COALESCE((SELECT SUM(amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)::int AS ledger
    FROM players p
    WHERE COALESCE(p.chips_balance, 0) <> COALESCE((SELECT SUM(amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)
  `);
  const drifted = rowsOf(res).map((r: any) => ({
    playerId: Number(r.player_id), cached: Number(r.cached), ledger: Number(r.ledger),
  }));

  let fixed = 0;
  if (fix && drifted.length) {
    for (const d of drifted) {
      await db.update(players).set({ chipsBalance: d.ledger } as any).where(eq(players.id, d.playerId));
      emitBalance(d.playerId, d.ledger, 0, 'audit_fix');
      fixed++;
    }
  }

  const [cnt] = await db.select({ c: sql<number>`count(*)::int` }).from(players);
  return { checked: Number(cnt?.c ?? 0), drifted, fixed };
}

/** أرصدة مجمّعة لعدة لاعبين (لواجهات المستقبل) */
export async function getBalancesFor(playerIds: number[]): Promise<Record<number, number>> {
  const db = getDB();
  if (!db || playerIds.length === 0) return {};
  const rows = await db.select({ id: players.id, bal: players.chipsBalance })
    .from(players).where(inArray(players.id, playerIds));
  const out: Record<number, number> = {};
  for (const r of rows) out[r.id] = Number(r.bal ?? 0);
  return out;
}
