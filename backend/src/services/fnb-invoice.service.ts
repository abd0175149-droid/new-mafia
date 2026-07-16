// ══════════════════════════════════════════════════════
// 🧾 فواتير المنيو — F&B Invoice Service
// فاتورة A6 لكل لاعب لكل فعاليّة: مجموع طلباته (غير الملغاة) + سطر رسوم اللعبة
// الاختياريّ (addGameFeeToBill ولم يُدفع الحجز). ترقيم تسلسليّ لكل مكان بقفل استشاريّ.
// المال لا يلمس bookings.paid_amount هنا إطلاقاً — التحصيل عبر مسار الدفع الموجود.
// ══════════════════════════════════════════════════════

import { eq, and, ne, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { orders, orderItems, orderInvoices } from '../schemas/fnb.schema.js';
import { activities, bookings, locations } from '../schemas/admin.schema.js';

export interface InvoiceLine { name: string; quantity: number; unitPrice: number; lineTotal: number }
export interface InvoiceData {
  locationId: number;
  locationName: string;
  activityId: number;
  activityName: string;
  activityDate: Date;
  playerId: number;
  playerName: string;
  bookingId: number | null;
  lines: InvoiceLine[];
  ordersCount: number;
  ordersTotal: number;
  gameFeeApplied: boolean;
  gameFeeAmount: number;
  grandTotal: number;
}

// يجمع بيانات فاتورة لاعبٍ واحد لفعاليّة واحدة (بلا كتابة)
export async function buildInvoiceData(
  db: Database, locationId: number, activityId: number, playerId: number,
): Promise<InvoiceData | { error: string }> {
  const [act] = await db.select({
    id: activities.id, name: activities.name, date: activities.date,
    locationId: activities.locationId, addGameFee: activities.addGameFeeToBill,
    basePrice: activities.basePrice,
  }).from(activities).where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);
  if (!act || act.locationId !== locationId) return { error: 'الفعاليّة غير موجودة لهذا المكان' };

  const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, locationId)).limit(1);

  const playerOrders = await db.select().from(orders).where(and(
    eq(orders.activityId, activityId),
    eq(orders.locationId, locationId),
    eq(orders.playerId, playerId),
    ne(orders.status, 'cancelled'),
  ));
  if (playerOrders.length === 0) return { error: 'لا طلبات لهذا اللاعب في هذه الفعاليّة' };

  const items = await db.select().from(orderItems)
    .where(inArray(orderItems.orderId, playerOrders.map(o => o.id)));

  // دمج البنود المتطابقة (نفس الصنف ونفس سعر اللقطة) عبر كل الطلبات
  const merged = new Map<string, InvoiceLine>();
  for (const it of items) {
    const key = `${it.nameSnapshot}|${it.unitPriceSnapshot}`;
    const prev = merged.get(key);
    const unitPrice = parseFloat(it.unitPriceSnapshot);
    if (prev) { prev.quantity += it.quantity; prev.lineTotal = prev.quantity * unitPrice; }
    else merged.set(key, { name: it.nameSnapshot, quantity: it.quantity, unitPrice, lineTotal: unitPrice * it.quantity });
  }
  const lines = [...merged.values()];
  const ordersTotal = playerOrders.reduce((s, o) => s + parseFloat(o.total), 0);

  // رسوم اللعبة: مفعَّلة على الفعاليّة + للحجز غير المدفوع فقط (المدفوع حُصّل من مساره)
  const bookingId = playerOrders[0].bookingId;
  let gameFeeApplied = false;
  let gameFeeAmount = 0;
  if (act.addGameFee === true) {
    const [bk] = await db.select({ isPaid: bookings.isPaid, isFree: bookings.isFree })
      .from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (bk && bk.isPaid !== true && bk.isFree !== true) {
      gameFeeApplied = true;
      gameFeeAmount = parseFloat(act.basePrice || '0');
    }
  }

  return {
    locationId,
    locationName: loc?.name || '',
    activityId,
    activityName: act.name,
    activityDate: act.date,
    playerId,
    playerName: playerOrders[0].playerName,
    bookingId,
    lines,
    ordersCount: playerOrders.length,
    ordersTotal,
    gameFeeApplied,
    gameFeeAmount,
    grandTotal: ordersTotal + gameFeeAmount,
  };
}

// يثبّت رقم الفاتورة: يعيد الرقم الموجود لنفس (مكان، فعاليّة، لاعب) أو يصدر التالي.
// قفل استشاريّ لكل مكان يمنع سباق MAX+1 عند طباعة جهازين معاً.
export async function issueInvoiceNumber(
  db: Database, data: InvoiceData, printedBy: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'fnb_invoice_' + data.locationId}))`);

    const [existing] = await tx.select().from(orderInvoices).where(and(
      eq(orderInvoices.locationId, data.locationId),
      eq(orderInvoices.activityId, data.activityId),
      eq(orderInvoices.playerId, data.playerId),
    )).limit(1);

    if (existing) {
      // إعادة طباعة: نحدّث المجاميع والختم بلا رقم جديد
      await tx.update(orderInvoices).set({
        ordersTotal: data.ordersTotal.toFixed(2),
        gameFeeApplied: data.gameFeeApplied,
        gameFeeAmount: data.gameFeeAmount.toFixed(2),
        grandTotal: data.grandTotal.toFixed(2),
        printedBy,
        printedAt: new Date(),
      } as any).where(eq(orderInvoices.id, existing.id));
      return existing.invoiceNo;
    }

    // execute يعيد {rows} مع درايفر pg ومصفوفةً مع postgres-js — نتعامل مع الشكلين
    const result: any = await tx.execute(sql`
      SELECT COALESCE(MAX(invoice_no), 0) + 1 AS next FROM order_invoices WHERE location_id = ${data.locationId}
    `);
    const next = Number((result?.rows?.[0] ?? result?.[0])?.next ?? 1);

    await tx.insert(orderInvoices).values({
      invoiceNo: next,
      locationId: data.locationId,
      activityId: data.activityId,
      playerId: data.playerId,
      bookingId: data.bookingId,
      ordersTotal: data.ordersTotal.toFixed(2),
      gameFeeApplied: data.gameFeeApplied,
      gameFeeAmount: data.gameFeeAmount.toFixed(2),
      grandTotal: data.grandTotal.toFixed(2),
      printedBy,
    } as any);
    return next;
  });
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => n.toFixed(2);

// قالب الفاتورة — A6 (105×148mm) RTL
export function invoiceHtml(data: InvoiceData, invoiceNo: number, printedByName: string): string {
  const d = new Date();
  const dateStr = d.toLocaleDateString('ar-JO', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
  const actDate = new Date(data.activityDate).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric', weekday: 'short' });

  const rows = data.lines.map(l => `
    <tr>
      <td class="n">${esc(l.name)}</td>
      <td class="c">${l.quantity}</td>
      <td class="c">${fmt(l.unitPrice)}</td>
      <td class="t">${fmt(l.lineTotal)}</td>
    </tr>`).join('');

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
  @page { size: A6; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Noto Naskh Arabic","Noto Sans Arabic","Tajawal","DejaVu Sans",sans-serif;
    direction: rtl; color: #111; font-size: 9.5px; line-height: 1.45;
    width: 105mm; min-height: 148mm; padding: 6mm 6mm 5mm;
    display: flex; flex-direction: column;
  }
  .head { text-align: center; border-bottom: 1.5px solid #111; padding-bottom: 3mm; margin-bottom: 3mm; }
  .club { font-size: 14px; font-weight: 700; letter-spacing: .5px; }
  .loc  { font-size: 11px; color: #333; margin-top: 1mm; }
  .meta { display: flex; justify-content: space-between; font-size: 8.5px; color: #444; margin-bottom: 2.5mm; }
  .meta b { color: #111; }
  .who { background: #f2f2f2; border-radius: 2mm; padding: 2mm 2.5mm; margin-bottom: 3mm; }
  .who .p { font-size: 12px; font-weight: 700; }
  .who .a { font-size: 8.5px; color: #555; margin-top: .5mm; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 8px; color: #666; border-bottom: 1px solid #bbb; padding: 1mm .5mm; font-weight: 600; }
  td { padding: 1.2mm .5mm; border-bottom: .5px solid #e5e5e5; vertical-align: top; }
  .n { text-align: right; }
  .c { text-align: center; white-space: nowrap; width: 12mm; }
  .t { text-align: left; white-space: nowrap; width: 15mm; font-variant-numeric: tabular-nums; }
  .sums { margin-top: 3mm; border-top: 1px solid #bbb; padding-top: 2mm; }
  .sum { display: flex; justify-content: space-between; padding: .6mm 0; font-size: 10px; }
  .sum.fee { color: #7a4b00; }
  .sum.grand { font-size: 13px; font-weight: 700; border-top: 1.5px solid #111; margin-top: 1.5mm; padding-top: 1.5mm; }
  .foot { margin-top: auto; text-align: center; font-size: 7.5px; color: #777; border-top: .5px dashed #bbb; padding-top: 2mm; }
  </style></head><body>
    <div class="head">
      <div class="club">🎭 نادي المافيا</div>
      <div class="loc">${esc(data.locationName)}</div>
    </div>
    <div class="meta">
      <span>فاتورة <b>#${invoiceNo}</b></span>
      <span>${dateStr} • ${timeStr}</span>
    </div>
    <div class="who">
      <div class="p">${esc(data.playerName)}</div>
      <div class="a">${esc(data.activityName)} — ${actDate} • ${data.ordersCount} ${data.ordersCount === 1 ? 'طلب' : 'طلبات'}</div>
    </div>
    <table>
      <thead><tr><th class="n">الصنف</th><th class="c">الكمّية</th><th class="c">السعر</th><th class="t">المجموع</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sums">
      <div class="sum"><span>مجموع الطلبات</span><span>${fmt(data.ordersTotal)} د.أ</span></div>
      ${data.gameFeeApplied ? `<div class="sum fee"><span>رسوم اللعبة</span><span>${fmt(data.gameFeeAmount)} د.أ</span></div>` : ''}
      <div class="sum grand"><span>الإجماليّ</span><span>${fmt(data.grandTotal)} د.أ</span></div>
    </div>
    <div class="foot">أصدرها: ${esc(printedByName)} — شكراً لزيارتكم 🌹</div>
  </body></html>`;
}
