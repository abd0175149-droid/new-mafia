// ══════════════════════════════════════════════════════
// 💵 التحصيل — فاتورةٌ واحدة أو دفعةٌ تغلق عدّة فواتير (2026-11-01، التصوّران المعتمدان)
//   https://claude.ai/artifact/8yuFEpGS9h6UcsBPH3dJT8 (الدفع عن الأصحاب)
//   https://claude.ai/artifact/XTYdBUEsr7infzd6izWKp8 (تحصيل بلمستين)
//
// مسارٌ واحد للحالتين: التحصيل الفرديّ دفعةٌ من فاتورةٍ واحدة بلا سجلّ دفعة.
//   • كلّ صاحبٍ يحتفظ بفاتورته ورقمها ودخوليّته وحدّه الأدنى وولائه — الدفعة تربطها فقط.
//   • كلّ شيءٍ أو لا شيء: مبلغٌ تغيّر (طلبٌ وصل) أو فاتورةٌ حصّلها كاشيرٌ آخر ⟵ تُرفض كلّها
//     ويُعاد السبب باسم صاحبه. لا تُحصَّل نصف الطاولة.
//   • طريقة الدفع (كاش/فيزا/كليك) تُحفظ مع كلّ فاتورة — «الحساب» يعرف كم في الدرج نقداً.
//   • التراجع: الدفعة كلّها خلال المهلة لمن حصّلها، والأدمن دائماً؛ مشروب ولاءٍ مستهلَك ⟵ الأدمن.
// ══════════════════════════════════════════════════════

import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { orders, orderInvoices, venuePayments } from '../schemas/fnb.schema.js';
import { bookings } from '../schemas/admin.schema.js';
import { buildInvoiceData, issueInvoiceNumber, type InvoiceData } from './fnb-invoice.service.js';
import { UNDO_WINDOW_MS } from './fnb-ledger.service.js';

export type PayMethod = 'cash' | 'card' | 'cliq';
/** 🧾 لم تُحصَّل (2026-11-01): دينٌ عليه يُسدَّد في زيارته القادمة، أو خسارة — والسبب إلزاميّ */
export type WriteoffKind = 'debt' | 'loss';
export const PAY_METHODS: PayMethod[] = ['cash', 'card', 'cliq'];
export const PAY_METHOD_AR: Record<string, string> = { cash: 'كاش', card: 'فيزا', cliq: 'كليك' };
/** أقصى فواتير في دفعةٍ واحدة */
export const MAX_GROUP = 20;

export interface CollectItem { playerId: number; expectedTotal?: number | null }
export interface CollectedInvoice { playerId: number; playerName: string; invoiceId: number; invoiceNo: number; grandTotal: number; gameFeeSettled: number }
export type CollectFail = { ok: false; status: number; code: 'CHANGED' | 'GONE' | 'NOTHING' | 'INVALID'; error: string;
  changed?: { playerId: number; name: string; from: number; to: number }[]; gone?: { playerId: number; name: string }[] };
export type CollectResult =
  | { ok: true; paymentId: number | null; invoices: CollectedInvoice[]; total: number; method: PayMethod; payerName: string | null; paidAt: Date; canUndoUntil: string | null }
  | { ok: false; status: number; code: 'CHANGED' | 'GONE' | 'NOTHING' | 'INVALID'; error: string;
      changed?: { playerId: number; name: string; from: number; to: number }[]; gone?: { playerId: number; name: string }[] };

class GoneError extends Error { constructor(public playerId: number, public who: string) { super('gone'); } }

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

/**
 * يحصّل فاتورةً أو أكثر في معاملةٍ واحدة.
 * payer = null ⟵ تحصيلٌ فرديّ (لا سجلّ دفعة). وإلّا يُنشأ سجلّ venue_payments ويُربط بكلّ فاتورة.
 */
export async function collectInvoices(db: Database, p: {
  locId: number; activityId: number; items: CollectItem[]; staffId: number; receiverName: string;
  method: PayMethod; payer: { playerId: number | null; name: string } | null;
  /** تسجيل «لم تُحصَّل» بدل التحصيل: تُغلق الفاتورة بلا مال ولا يُقلب الحجز مدفوعاً */
  writeoff?: { kind: WriteoffKind; reason: string } | null;
}): Promise<CollectResult> {
  const seen = new Set<number>();
  const items = p.items.filter(i => Number.isFinite(i.playerId) && !seen.has(i.playerId) && seen.add(i.playerId));
  if (!items.length) return { ok: false, status: 400, code: 'INVALID', error: 'لم يُختر أحد' };
  if (items.length > MAX_GROUP) return { ok: false, status: 400, code: 'INVALID', error: `أقصى ${MAX_GROUP} فاتورة في دفعةٍ واحدة` };
  if (!p.writeoff && !PAY_METHODS.includes(p.method)) return { ok: false, status: 400, code: 'INVALID', error: 'طريقة دفعٍ غير معروفة' };
  if (p.writeoff && (!['debt', 'loss'].includes(p.writeoff.kind) || String(p.writeoff.reason || '').trim().length < 3)) {
    return { ok: false, status: 400, code: 'INVALID', error: 'اكتب سبب عدم التحصيل' };
  }

  // ① المجاميع تُعاد من الطلبات المفتوحة الآن — لا نثق بمجاميع مخزّنة قد تكون قديمة
  const prepared: { item: CollectItem; data: InvoiceData }[] = [];
  const changed: { playerId: number; name: string; from: number; to: number }[] = [];
  const gone: { playerId: number; name: string }[] = [];
  let nothingError = '';
  for (const it of items) {
    const data = await buildInvoiceData(db, p.locId, p.activityId, it.playerId);
    if ('error' in data) { gone.push({ playerId: it.playerId, name: '' }); nothingError = data.error; continue; }
    if (data.orderIds.length === 0 && data.grandTotal <= 0) { gone.push({ playerId: it.playerId, name: data.playerName }); nothingError = 'لا شيء مستحقّ'; continue; }
    const exp = it.expectedTotal;
    if (exp != null && Number.isFinite(Number(exp)) && Math.abs(Number(exp) - data.grandTotal) > 0.004) {
      changed.push({ playerId: it.playerId, name: data.playerName, from: r2(Number(exp)), to: r2(data.grandTotal) });
    }
    prepared.push({ item: it, data });
  }
  if (gone.length) {
    const names = gone.map(g => g.name).filter(Boolean);
    return { ok: false, status: 409, code: items.length === 1 ? 'NOTHING' : 'GONE', gone, changed,
      error: items.length === 1 ? (nothingError.includes('محصَّلة') ? 'الفاتورة محصَّلة مسبقاً' : nothingError || 'لا شيء مستحقّ الآن')
        : `${names.length ? names.join('، ') : 'أحدهم'} لم يعد عليه شيء — حُصّل للتوّ. لم يُقبض شيء.` };
  }
  if (changed.length) {
    return { ok: false, status: 409, code: 'CHANGED', changed,
      error: changed.map(c => `تغيّر مبلغ ${c.name}: ${c.from.toFixed(2)} ← ${c.to.toFixed(2)}`).join(' · ') + ' — وصل طلبٌ جديد. لم يُقبض شيء.' };
  }

  // ② رقم الفاتورة يُصدر قبل المعاملة إن لم يُصدر (كالطباعة — رقمٌ ثابتٌ لا يُستهلك مرّتين)
  const openRow = async (playerId: number) => (await db.select().from(orderInvoices).where(and(
    eq(orderInvoices.locationId, p.locId), eq(orderInvoices.activityId, p.activityId),
    eq(orderInvoices.playerId, playerId), eq(orderInvoices.isPaid, false))).limit(1))[0];
  const rowsFor: { inv: any; data: InvoiceData }[] = [];
  for (const x of prepared) {
    let inv = await openRow(x.item.playerId);
    if (!inv) { await issueInvoiceNumber(db, x.data, p.staffId); inv = await openRow(x.item.playerId); }
    if (!inv) return { ok: false, status: 500, code: 'INVALID', error: 'تعذّر إصدار رقم الفاتورة' };
    rowsFor.push({ inv, data: x.data });
  }

  const total = r2(rowsFor.reduce((s, x) => s + x.data.grandTotal, 0));
  const paidAt = new Date();
  let paymentId: number | null = null;
  try {
    await db.transaction(async (tx) => {
      if (p.payer) {
        const [pay] = await tx.insert(venuePayments).values({
          locationId: p.locId, activityId: p.activityId, payerPlayerId: p.payer.playerId, payerName: p.payer.name.slice(0, 150),
          method: p.method, total: total.toFixed(2), invoiceCount: rowsFor.length, staffId: p.staffId, createdAt: paidAt,
        } as any).returning({ id: venuePayments.id });
        paymentId = pay.id;
      }
      for (const { inv, data } of rowsFor) {
        // 🔒 isPaid=false داخل الشرط: كاشيران يضغطان معاً — الثاني يجد 0 صفوف فتُرفض الدفعة كلّها
        const [row] = await tx.update(orderInvoices).set({
          ordersTotal: data.ordersTotal.toFixed(2), minTopup: data.minTopup.toFixed(2), waterCharge: data.waterCharge.toFixed(2),
          loyaltyDiscount: data.loyaltyDiscount.toFixed(2), loyaltyRewardId: data.loyaltyRewardId,
          gameFeeApplied: data.gameFeeApplied, gameFeeAmount: data.gameFeeAmount.toFixed(2), grandTotal: data.grandTotal.toFixed(2),
          bookingId: data.bookingId, isPaid: true, paidAt, paidBy: p.staffId, payMethod: p.writeoff ? p.writeoff.kind : p.method, paymentId,
          compAmount: (data.compAmount || 0).toFixed(2),
          writeoffReason: p.writeoff ? String(p.writeoff.reason).trim().slice(0, 300) : null,
        } as any).where(and(eq(orderInvoices.id, inv.id), eq(orderInvoices.isPaid, false))).returning({ id: orderInvoices.id });
        if (!row) throw new GoneError(data.playerId, data.playerName);
        // 🧾 الطلبات التي حسبناها تُختم بهذه الفاتورة — ما وصل بعد الحساب يبقى مفتوحاً
        if (data.orderIds.length > 0) {
          await tx.update(orders).set({ invoiceId: inv.id } as any).where(and(inArray(orders.id, data.orderIds), isNull(orders.invoiceId)));
        }
        // الدخوليّة محصَّلة عند المكان ⇒ الحجز صار مدفوعاً باسم موظّف المكان (لا عند «لم تُحصَّل»)
        if (!p.writeoff && data.gameFeeApplied && data.gameFeeAmount > 0 && data.bookingId) {
          const flipped = await tx.update(bookings).set({
            isPaid: true, paidAmount: data.gameFeeAmount.toFixed(2), receivedBy: p.receiverName,
          } as any).where(and(eq(bookings.id, data.bookingId), eq(bookings.isPaid, false))).returning({ id: bookings.id });
          if (flipped.length > 0) await tx.update(orderInvoices).set({ feeBookingFlipped: true } as any).where(eq(orderInvoices.id, inv.id));
        }
      }
    });
  } catch (e) {
    if (e instanceof GoneError) {
      return { ok: false, status: items.length === 1 ? 400 : 409, code: 'GONE', gone: [{ playerId: e.playerId, name: e.who }],
        error: items.length === 1 ? 'الفاتورة محصَّلة مسبقاً' : `فاتورة ${e.who} حُصّلت للتوّ من جهازٍ آخر. لم يُقبض شيء — راجع المجموع.` };
    }
    throw e;
  }

  // 🎟️ مشروب الولاء استُخدم فعلاً مع التحصيل
  for (const { inv, data } of rowsFor) {
    if (data.loyaltyRewardId && data.loyaltyDiscount > 0) {
      try { const { redeemDrinkOnInvoice } = await import('./loyalty.service.js'); await redeemDrinkOnInvoice(data.loyaltyRewardId, inv.id, data.loyaltyDiscount, data.loyaltyItemName, p.staffId); } catch { /* غير حاجب */ }
    }
  }
  const anyLoyalty = rowsFor.some(x => x.data.loyaltyDiscount > 0);
  return {
    ok: true, paymentId, total, method: p.method, payerName: p.payer?.name ?? null, paidAt,
    canUndoUntil: anyLoyalty ? null : new Date(paidAt.getTime() + UNDO_WINDOW_MS).toISOString(),
    invoices: rowsFor.map(({ inv, data }) => ({
      playerId: data.playerId, playerName: data.playerName, invoiceId: inv.id, invoiceNo: inv.invoiceNo,
      grandTotal: data.grandTotal, gameFeeSettled: data.gameFeeApplied ? data.gameFeeAmount : 0,
    })),
  };
}

/**
 * ↩️ التراجع عن دفعةٍ كاملة: تعود كلّ فواتيرها مفتوحةً بأرقامها، وتُفكّ أختام طلباتها،
 * ويعود كلّ حجزٍ غير مدفوع **إن كان التحصيل هو من قلبه**. القواعد نفسها للفاتورة الواحدة.
 */
export async function undoPayment(db: Database, p: { locId: number; paymentId: number; me: { id: number; role: string } }):
  Promise<{ ok: true; invoices: { playerId: number; invoiceId: number; invoiceNo: number }[]; activityId: number } | { ok: false; status: number; error: string }> {
  const [pay] = await db.select().from(venuePayments).where(and(eq(venuePayments.id, p.paymentId), eq(venuePayments.locationId, p.locId))).limit(1);
  if (!pay) return { ok: false, status: 404, error: 'الدفعة غير موجودة' };
  if (pay.undoneAt) return { ok: false, status: 400, error: 'أُلغيت هذه الدفعة من قبل' };
  const isAdmin = p.me.role === 'admin';
  if (!isAdmin && pay.staffId !== p.me.id) return { ok: false, status: 403, error: 'التراجع لمن حصّلها فقط' };
  if (!isAdmin && Date.now() - new Date(pay.createdAt).getTime() > UNDO_WINDOW_MS) return { ok: false, status: 400, error: 'انتهت مهلة التراجع — راجع الإدارة' };
  const invs = await db.select().from(orderInvoices).where(and(eq(orderInvoices.paymentId, pay.id), eq(orderInvoices.isPaid, true)));
  if (!isAdmin && invs.some(i => parseFloat(String((i as any).loyaltyDiscount || '0')) > 0)) {
    return { ok: false, status: 400, error: 'فيها مشروب بطاقة ولاء — التراجع من الإدارة' };
  }
  // للّاعب فاتورةٌ مفتوحةٌ أخرى الآن ⟵ إعادة فتح هذه تصنع فاتورتين مفتوحتين له
  const pids = invs.map(i => i.playerId);
  if (pids.length) {
    const [other] = await db.select({ id: orderInvoices.id }).from(orderInvoices).where(and(
      eq(orderInvoices.locationId, p.locId), eq(orderInvoices.activityId, pay.activityId),
      inArray(orderInvoices.playerId, pids), eq(orderInvoices.isPaid, false))).limit(1);
    if (other) return { ok: false, status: 409, error: 'أحدهم له فاتورةٌ مفتوحة جديدة الآن — حصّلها أو راجع الإدارة' };
  }
  let undone: typeof invs = [];
  await db.transaction(async (tx) => {
    for (const inv of invs) {
      const [row] = await tx.update(orderInvoices).set({
        isPaid: false, paidAt: null, paidBy: null, unpaidAt: new Date(), unpaidBy: p.me.id, feeBookingFlipped: false, paymentId: null, payMethod: null,
      } as any).where(and(eq(orderInvoices.id, inv.id), eq(orderInvoices.isPaid, true))).returning({ id: orderInvoices.id });
      if (!row) continue;
      undone.push(inv);
      await tx.update(orders).set({ invoiceId: null } as any).where(eq(orders.invoiceId, inv.id));
      if (inv.feeBookingFlipped === true && inv.bookingId) {
        await tx.update(bookings).set({ isPaid: false, paidAmount: '0', receivedBy: '' } as any)
          .where(and(eq(bookings.id, inv.bookingId), eq(bookings.isPaid, true)));
      }
    }
    await tx.update(venuePayments).set({ undoneAt: new Date(), undoneBy: p.me.id } as any).where(eq(venuePayments.id, pay.id));
  });
  return { ok: true, activityId: pay.activityId, invoices: undone.map(i => ({ playerId: i.playerId, invoiceId: i.id, invoiceNo: i.invoiceNo })) };
}

/** من دفع فاتورةً وكيف — للطباعة وواتساب والبوت (null ⟵ دفعها صاحبها بنفسه بلا دفعة) */
export async function paymentOf(db: Database, paymentId: number | null | undefined) {
  if (!paymentId) return null;
  const [pay] = await db.select().from(venuePayments).where(eq(venuePayments.id, paymentId)).limit(1);
  if (!pay) return null;
  const invs = await db.select({ id: orderInvoices.id, playerId: orderInvoices.playerId, invoiceNo: orderInvoices.invoiceNo, grandTotal: orderInvoices.grandTotal })
    .from(orderInvoices).where(eq(orderInvoices.paymentId, paymentId));
  return { ...pay, invoices: invs };
}

/**
 * 💳 تسديد دينٍ قديم (2026-11-01): فاتورةٌ سُجّلت «دين عليه» في ليلةٍ سابقة يدفعها في زيارته.
 * تأخذ طريقة دفعٍ حقيقيّة فتدخل المحصَّل (على ليلتها الأصليّة)، ويُقلب حجزها مدفوعاً إن حملت الدخوليّة.
 */
export async function settleDebt(db: Database, p: { locId: number; invoiceId: number; method: PayMethod; staffId: number; receiverName: string }):
  Promise<{ ok: true; invoiceNo: number; total: number; playerId: number; activityId: number; canUndoUntil: string } | { ok: false; status: number; error: string }> {
  if (!PAY_METHODS.includes(p.method)) return { ok: false, status: 400, error: 'طريقة دفعٍ غير معروفة' };
  const [inv] = await db.select().from(orderInvoices).where(and(eq(orderInvoices.id, p.invoiceId), eq(orderInvoices.locationId, p.locId))).limit(1);
  if (!inv) return { ok: false, status: 404, error: 'الفاتورة غير موجودة' };
  if ((inv as any).payMethod !== 'debt') return { ok: false, status: 400, error: 'ليست ديناً قائماً — ربّما سُدّد للتوّ' };
  let done = false;
  await db.transaction(async (tx) => {
    const [row] = await tx.update(orderInvoices).set({ payMethod: p.method, debtSettledAt: new Date(), debtSettledBy: p.staffId } as any)
      .where(and(eq(orderInvoices.id, inv.id), eq(orderInvoices.payMethod, 'debt'))).returning({ id: orderInvoices.id });
    if (!row) return;
    done = true;
    const fee = parseFloat(String(inv.gameFeeAmount || '0')) || 0;
    if (inv.gameFeeApplied && fee > 0 && inv.bookingId) {
      const flipped = await tx.update(bookings).set({ isPaid: true, paidAmount: fee.toFixed(2), receivedBy: p.receiverName } as any)
        .where(and(eq(bookings.id, inv.bookingId), eq(bookings.isPaid, false))).returning({ id: bookings.id });
      if (flipped.length) await tx.update(orderInvoices).set({ feeBookingFlipped: true } as any).where(eq(orderInvoices.id, inv.id));
    }
  });
  if (!done) return { ok: false, status: 409, error: 'سُدّد هذا الدين للتوّ من جهازٍ آخر' };
  return { ok: true, invoiceNo: inv.invoiceNo, total: parseFloat(String(inv.grandTotal || '0')) || 0, playerId: inv.playerId, activityId: inv.activityId,
    canUndoUntil: new Date(Date.now() + UNDO_WINDOW_MS).toISOString() };
}

/** ↩️ تراجعٌ عن تسديد دين: يعود «دين عليه» كما كان (لمن سدّده خلال المهلة، والأدمن دائماً) */
export async function unsettleDebt(db: Database, p: { locId: number; invoiceId: number; me: { id: number; role: string } }):
  Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [inv] = await db.select().from(orderInvoices).where(and(eq(orderInvoices.id, p.invoiceId), eq(orderInvoices.locationId, p.locId))).limit(1);
  const at = (inv as any)?.debtSettledAt as Date | null;
  if (!inv || !at) return { ok: false, status: 400, error: 'ليس ديناً مسدَّداً' };
  const isAdmin = p.me.role === 'admin';
  if (!isAdmin && (inv as any).debtSettledBy !== p.me.id) return { ok: false, status: 403, error: 'التراجع لمن سدّده فقط' };
  if (!isAdmin && Date.now() - new Date(at).getTime() > UNDO_WINDOW_MS) return { ok: false, status: 400, error: 'انتهت مهلة التراجع — راجع الإدارة' };
  await db.transaction(async (tx) => {
    await tx.update(orderInvoices).set({ payMethod: 'debt', debtSettledAt: null, debtSettledBy: null, feeBookingFlipped: false } as any).where(eq(orderInvoices.id, inv.id));
    if (inv.feeBookingFlipped === true && inv.bookingId) {
      await tx.update(bookings).set({ isPaid: false, paidAmount: '0', receivedBy: '' } as any).where(and(eq(bookings.id, inv.bookingId), eq(bookings.isPaid, true)));
    }
  });
  return { ok: true };
}
