// ══════════════════════════════════════════════════════
// 🧾 فواتير المنيو — F&B Invoice Service
// فاتورة A6 لكل لاعب لكل فعاليّة: مجموع طلباته (غير الملغاة) + سطر رسوم اللعبة
// الاختياريّ (addGameFeeToBill ولم يُدفع الحجز). ترقيم تسلسليّ لكل مكان بقفل استشاريّ.
// المال لا يلمس bookings.paid_amount هنا إطلاقاً — التحصيل عبر مسار الدفع الموجود.
// ══════════════════════════════════════════════════════

import { eq, and, ne, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { orders, orderItems, orderInvoices, menuItems } from '../schemas/fnb.schema.js';
import { activities, bookings, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';

export interface InvoiceComponent { name: string; qty: number; options?: { group: string; value: string }[] }
export interface InvoiceLine {
  name: string; quantity: number; unitPrice: number; lineTotal: number;
  components: InvoiceComponent[];   // 🎁 مكوّنات الباقة (لقطة الطلب) — تُطبع مُسنَّنة تحت السطر
  options: { group: string; value: string }[];   // ⚙️ الخيارات المختارة (نكهة/حجم/إضافات)
}
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
  /** 💳 تكملة الحدّ الأدنى للاستهلاك — صفر إن كان معطّلاً أو الطلبات بلغته أو اللاعب لم يلعب */
  minTopup: number;
  /** 💧 الماء التلقائيّ — صفر إن كان معطّلاً أو وصله ماءٌ من طلبه (مفرداً أو ضمن عرض) */
  waterCharge: number;
  gameFeeApplied: boolean;
  gameFeeAmount: number;
  grandTotal: number;
}

/** هل لعب اللاعب جولةً واحدة على الأقلّ في هذه الفعاليّة؟ (شرط استحقاق الحدّ الأدنى) */
export async function playedInActivity(db: Database, activityId: number, playerId: number): Promise<boolean> {
  const r: any = await db.execute(sql`
    SELECT 1 FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    JOIN sessions s ON s.id = m.session_id
    WHERE s.activity_id = ${activityId} AND mp.player_id = ${playerId}
    LIMIT 1
  `);
  return Boolean(r?.rows?.[0] ?? r?.[0]);
}

/**
 * 💧 صنف الماء في المنيو الفعّال للمكان — بالاسم («مياه» أو «ماء»).
 * موقع الاختبار يستعير منيو مصدره، فالبحث يتبع الاستعارة (نفس دلالة
 * effectiveMenuLocation في fnb.routes — منسوخة هنا لتفادي استيرادٍ دائريّ).
 */
export async function waterItemOf(db: Database, locationId: number):
  Promise<{ id: number; name: string; price: number } | null> {
  let menuLocId = locationId;
  const [loc] = await db.select({
    isTest: locations.isTestLocation, src: locations.menuSourceLocationId,
  }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (loc?.isTest === true && loc.src) {
    const [src] = await db.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, loc.src), isNull(locations.deletedAt))).limit(1);
    if (src) menuLocId = src.id;
  }
  const [w] = await db.select({ id: menuItems.id, name: menuItems.name, price: menuItems.price })
    .from(menuItems)
    .where(and(
      eq(menuItems.locationId, menuLocId),
      inArray(menuItems.name, ['مياه', 'ماء']),
      isNull(menuItems.deletedAt),
    )).limit(1);
  return w ? { id: w.id, name: w.name, price: parseFloat(w.price) } : null;
}

/** لاعبو الفعاليّة الذين لعبوا جولةً على الأقلّ (معرّفاتهم المميّزة) */
export async function playersWhoPlayed(db: Database, activityId: number): Promise<number[]> {
  const r: any = await db.execute(sql`
    SELECT DISTINCT mp.player_id FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    JOIN sessions s ON s.id = m.session_id
    WHERE s.activity_id = ${activityId} AND mp.player_id IS NOT NULL
  `);
  const rows: any[] = r?.rows ?? r ?? [];
  return rows.map(x => Number(x.player_id)).filter(Number.isFinite);
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

  const [loc] = await db.select({
    name: locations.name,
    minChargeEnabled: locations.minChargeEnabled,
    minimumCharge: locations.minimumCharge,
    autoWater: locations.autoWater,
  }).from(locations).where(eq(locations.id, locationId)).limit(1);

  const playerOrders = await db.select().from(orders).where(and(
    eq(orders.activityId, activityId),
    eq(orders.locationId, locationId),
    eq(orders.playerId, playerId),
    ne(orders.status, 'cancelled'),
  ));

  // 💳 الحدّ الأدنى: يستحقّه من لعب جولةً على الأقلّ — فحضورٌ بلا لعبٍ ليس زبون طاولة
  const minCharge = loc?.minChargeEnabled === true ? parseFloat(loc.minimumCharge || '0') : 0;
  // 💧 الماء التلقائيّ — يفتح هو الآخر فاتورةَ من لعب بلا طلبات
  const water = loc?.autoWater === true ? await waterItemOf(db, locationId) : null;
  const played = (minCharge > 0 || water !== null) ? await playedInActivity(db, activityId, playerId) : false;

  if (playerOrders.length === 0 && !((minCharge > 0 || water !== null) && played)) {
    // فاتورةٌ سبق إصدارها (تكملة حدٍّ أدنى مثلاً) تبقى قابلةً للعرض وإعادة
    // الطباعة ولو عُطّلت الميزة لاحقاً — المحصَّلة تُقرأ من لقطتها المجمّدة
    const [inv] = await db.select({ id: orderInvoices.id }).from(orderInvoices).where(and(
      eq(orderInvoices.locationId, locationId),
      eq(orderInvoices.activityId, activityId),
      eq(orderInvoices.playerId, playerId),
    )).limit(1);
    if (!inv) return { error: 'لا طلبات لهذا اللاعب في هذه الفعاليّة' };
  }

  const items = playerOrders.length > 0
    ? await db.select().from(orderItems)
        .where(inArray(orderItems.orderId, playerOrders.map(o => o.id)))
    : [];

  // دمج البنود المتطابقة (نفس الصنف ونفس سعر اللقطة) عبر كل الطلبات
  const merged = new Map<string, InvoiceLine>();
  for (const it of items) {
    const opts = (Array.isArray(it.optionsSnapshot) ? it.optionsSnapshot as any[] : [])
      .map(o => ({ group: String(o?.group || ''), value: String(o?.value || '') })).filter(o => o.value);
    // ⚙️ الخيارات جزءٌ من هويّة السطر: «أرجيلة/تفاحتين» و«أرجيلة/عنب» سطران
    // منفصلان في الفاتورة وإن تساوى سعرهما — الزبون يجب أن يقرأ ما طلبه.
    const key = `${it.nameSnapshot}|${it.unitPriceSnapshot}|${opts.map(o => `${o.group}:${o.value}`).join(',')}`;
    const prev = merged.get(key);
    const unitPrice = parseFloat(it.unitPriceSnapshot);
    if (prev) { prev.quantity += it.quantity; prev.lineTotal = prev.quantity * unitPrice; }
    else merged.set(key, {
      name: it.nameSnapshot, quantity: it.quantity, unitPrice, lineTotal: unitPrice * it.quantity,
      components: (Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot as any[] : [])
        .map(c => ({
          name: String(c?.name || ''), qty: Number(c?.qty) || 1,
          options: (Array.isArray(c?.options) ? c.options : [])
            .map((o: any) => ({ group: String(o?.group || ''), value: String(o?.value || '') })).filter((o: any) => o.value),
        })).filter(c => c.name),
      options: opts,
    });
  }
  const lines = [...merged.values()];
  const ordersTotal = playerOrders.reduce((s, o) => s + parseFloat(o.total), 0);

  // 💧 ماءٌ واحدٌ تلقائيّاً — إلا من وصله ماءٌ من طلبه: مفرداً باسمه أو مكوّناً في عرض
  let waterCharge = 0;
  if (water) {
    const hasWater = items.some(it =>
      it.nameSnapshot === water.name ||
      (Array.isArray(it.componentsSnapshot)
        && (it.componentsSnapshot as any[]).some(c => String(c?.name || '') === water.name)));
    waterCharge = hasWater ? 0 : water.price;
  }

  // 💳 التكملة: الماء استهلاكٌ فعليّ فيُحتسب ضمن الحدّ — رسوم اللعبة وحدها خارج المقارنة
  const minTopup = minCharge > 0 && played ? Math.max(0, minCharge - (ordersTotal + waterCharge)) : 0;

  // هويّة اللاعب وحجزه: من الطلبات إن وُجدت، وإلا من حسابه وحجزه في الفعاليّة
  let playerName = playerOrders[0]?.playerName || '';
  let bookingId: number | null = playerOrders[0]?.bookingId ?? null;
  if (playerOrders.length === 0) {
    const [p] = await db.select({ name: players.name }).from(players)
      .where(eq(players.id, playerId)).limit(1);
    playerName = p?.name || `لاعب #${playerId}`;
    const [bk] = await db.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.activityId, activityId), eq(bookings.playerId, playerId), isNull(bookings.deletedAt)))
      .limit(1);
    bookingId = bk?.id ?? null;
  }

  // رسوم اللعبة: مفعَّلة على الفعاليّة + للحجز غير المدفوع فقط (المدفوع حُصّل من مساره)
  let gameFeeApplied = false;
  let gameFeeAmount = 0;
  if (act.addGameFee === true && bookingId) {
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
    playerName,
    bookingId,
    lines,
    ordersCount: playerOrders.length,
    ordersTotal,
    minTopup,
    waterCharge,
    gameFeeApplied,
    gameFeeAmount,
    grandTotal: ordersTotal + waterCharge + minTopup + gameFeeAmount,
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
      // 🔴 فاتورةٌ محصَّلة لا تُعاد كتابة مبالغها: بعد /pay يصير الحجز مدفوعاً،
      //    فإعادة البناء تحسب رسوم اللعبة صفراً وتكتبها فوق اللقطة المدفوعة —
      //    فتختفي الرسوم من تقارير التحصيل وكأنّها لم تُقبض. الختمُ وحده يُحدَّث.
      if (existing.isPaid === true) {
        await tx.update(orderInvoices).set({ printedBy, printedAt: new Date() } as any)
          .where(eq(orderInvoices.id, existing.id));
        // الورقة المطبوعة تعكس اللقطة المجمَّدة لا الحساب المُعاد — data تُمرَّر
        // بالمرجع فيقرأ منها invoiceHtml في المسارَين (pdf و print-all)
        data.ordersTotal = parseFloat(existing.ordersTotal || '0');
        data.minTopup = parseFloat(existing.minTopup || '0');
        data.waterCharge = parseFloat(existing.waterCharge || '0');
        data.gameFeeApplied = existing.gameFeeApplied === true;
        data.gameFeeAmount = parseFloat(existing.gameFeeAmount || '0');
        data.grandTotal = parseFloat(existing.grandTotal || '0');
        return existing.invoiceNo;
      }
      // إعادة طباعة فاتورةٍ غير محصَّلة: نحدّث المجاميع والختم بلا رقم جديد
      await tx.update(orderInvoices).set({
        ordersTotal: data.ordersTotal.toFixed(2),
        minTopup: data.minTopup.toFixed(2),
        waterCharge: data.waterCharge.toFixed(2),
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
      minTopup: data.minTopup.toFixed(2),
      waterCharge: data.waterCharge.toFixed(2),
      gameFeeApplied: data.gameFeeApplied,
      gameFeeAmount: data.gameFeeAmount.toFixed(2),
      grandTotal: data.grandTotal.toFixed(2),
      printedBy,
    } as any);
    return next;
  });
}

/**
 * يدمج فواتير A6 في مستندٍ واحد للطباعة الجماعيّة.
 * يأخذ `<style>` أوّل فاتورة (كلّها بالقالب نفسه) ويضمّ أجسادها في صفحاتٍ
 * متتالية بفاصل `page-break-after` — فتخرج كلّ فاتورة على ورقتها.
 */
export function mergeInvoicePages(pages: string[]): string {
  const styleMatch = pages[0]?.match(/<style>([\s\S]*?)<\/style>/);
  const style = styleMatch ? styleMatch[1] : '';
  const bodies = pages.map(p => {
    const m = p.match(/<body>([\s\S]*?)<\/body>/);
    return m ? m[1] : '';
  });
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
  ${style}
  /* كلّ فاتورة على ورقةٍ مستقلّة — الأخيرة بلا فاصلٍ زائد يُنتج ورقةً فارغة */
  .sheet { width: 105mm; min-height: 148mm; padding: 6mm 6mm 5mm; display: flex; flex-direction: column; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  body { width: auto; min-height: 0; padding: 0; display: block; }
  </style></head><body>${bodies.map(b => `<div class="sheet">${b}</div>`).join('')}</body></html>`;
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => n.toFixed(2);

// قالب الفاتورة — A6 (105×148mm) RTL
export function invoiceHtml(data: InvoiceData, invoiceNo: number, printedByName: string): string {
  const d = new Date();
  const dateStr = d.toLocaleDateString('ar-JO', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
  const actDate = new Date(data.activityDate).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric', weekday: 'short' });

  // سطر الصنف، ويليه سطرٌ ثانويّ للخيارات و/أو مكوّنات الباقة.
  // الكمّيات في المكوّنات مضروبة بعدد الباقات المطلوبة.
  const rows = data.lines.map(l => {
    const detail: string[] = [];
    if (l.options.length > 0) detail.push(l.options.map(o => `${esc(o.group)}: ${esc(o.value)}`).join(' &#183; '));
    if (l.components.length > 0) {
      detail.push(l.components.map(c => {
        const co = (c.options ?? []).map(o => esc(o.value)).join('/');
        return `${esc(c.name)}${co ? ` (${co})` : ''} &#215;${c.qty * l.quantity}`;
      }).join(' &#183; '));
    }
    return `
    <tr${detail.length > 0 ? ' class="hascomp"' : ''}>
      <td class="n">${esc(l.name)}</td>
      <td class="c">${l.quantity}</td>
      <td class="c">${fmt(l.unitPrice)}</td>
      <td class="t">${fmt(l.lineTotal)}</td>
    </tr>` + (detail.length > 0 ? `
    <tr class="comp">
      <td class="n" colspan="4">${detail.join('<br>')}</td>
    </tr>` : '');
  }).join('');

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
  /* 🎁 مكوّنات الباقة: سطرٌ ثانويّ مُسنَّن يقرأ كتفصيلٍ للسطر أعلاه (الحدّ ينتقل إليه) */
  tr.hascomp td { border-bottom: none; padding-bottom: 0; }
  tr.comp td { font-size: 7.5px; color: #666; padding: .3mm 3mm 1.2mm; border-bottom: .5px solid #e5e5e5; }
  .c { text-align: center; white-space: nowrap; width: 12mm; }
  .t { text-align: left; white-space: nowrap; width: 15mm; font-variant-numeric: tabular-nums; }
  .sums { margin-top: 3mm; border-top: 1px solid #bbb; padding-top: 2mm; }
  .sum { display: flex; justify-content: space-between; padding: .6mm 0; font-size: 10px; }
  .sum.fee { color: #7a4b00; }
  .sum.grand { font-size: 13px; font-weight: 700; border-top: 1.5px solid #111; margin-top: 1.5mm; padding-top: 1.5mm; }
  .foot { margin-top: auto; text-align: center; font-size: 7.5px; color: #777; border-top: .5px dashed #bbb; padding-top: 2mm; }
  </style></head><body>
    <div class="head">
      <div class="club">نادي المافيا</div>
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
      ${data.waterCharge > 0 ? `<div class="sum fee"><span>مياه ×1</span><span>${fmt(data.waterCharge)} د.أ</span></div>` : ''}
      ${data.minTopup > 0 ? `<div class="sum fee"><span>حدّ أدنى للاستهلاك</span><span>${fmt(data.minTopup)} د.أ</span></div>` : ''}
      ${data.gameFeeApplied ? `<div class="sum fee"><span>رسوم اللعبة</span><span>${fmt(data.gameFeeAmount)} د.أ</span></div>` : ''}
      <div class="sum grand"><span>الإجماليّ</span><span>${fmt(data.grandTotal)} د.أ</span></div>
    </div>
    <div class="foot">أصدرها: ${esc(printedByName)} — شكراً لزيارتكم</div>
  </body></html>`;
}
