// ══════════════════════════════════════════════════════
// ⏰ تذكير الطلبات المتأخّرة — F&B Stalled-Order Reminder
// طلبٌ بقي في مرحلته أكثر من ٥ دقائق يُذكَّر به موظّفو المكان.
//
// قرارات التصميم:
//   • العمر يُقاس لـ**المرحلة الحاليّة** (statusChangedAt وإلّا createdAt) لا لعمر
//     الطلب — فمن بدأ التحضير حالاً لا يُذكَّر لأنّ الطلب قديم.
//   • سقف ٣ تذكيرات: التذكير بلا سقفٍ يصير ضجيجاً يُطفئه الموظّف فيضيع معه
//     الإشعار الأصليّ. ما بعد ربع ساعة مشكلةٌ إداريّة لا إشعاريّة.
//   • عمودان على الطلب (reminderSentAt/reminderCount) لا ذاكرةٌ في العمليّة:
//     إعادة تشغيل الخادم لا تُعيد إرسال ما أُرسل ولا تُصفّر العدّ.
//   • نطاق ٢٤ ساعة: الماسح لا يوقظ فعاليّاتٍ قديمة.
// نمط المُشغّل مأخوذٌ من whatsapp-reminder.service القائم — لا آليّة جديدة.
// ══════════════════════════════════════════════════════

import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { orders, serviceRequests } from '../schemas/fnb.schema.js';
import { locations } from '../schemas/admin.schema.js';
import { sendPushToLocationStaff } from './fcm.service.js';

/** يبدأ التذكير بعد هذه المدّة في المرحلة نفسها، ويتكرّر بها. */
const STALL_MS = 5 * 60 * 1000;
/** أقصى عدد تذكيرات لكلّ طلب قبل التوقّف. */
const MAX_REMINDERS = 3;
/** لا يُنظَر لطلباتٍ أقدم من هذا. */
const LOOKBACK_MS = 24 * 3600 * 1000;
const SCAN_EVERY_MS = 60_000;

const STAGE_TEXT: Record<string, { title: string; verb: string }> = {
  new: { title: '⏰ طلبٌ لم يبدأ تحضيره', verb: 'بانتظارٍ' },
  preparing: { title: '⏰ طلبٌ لم يُسلَّم', verb: 'قيد التحضير' },
};

export async function runStalledOrderScan(io?: any): Promise<void> {
  const db = getDB();
  if (!db) return;

  const now = Date.now();
  const cutoff = new Date(now - STALL_MS);

  // المرشّحون: مفتوحٌ · مضى على مرحلته ٥ دقائق · لم يبلغ سقف التذكير ·
  // ولم يُذكَّر خلال آخر ٥ دقائق.
  const stageStart = sql`COALESCE(${orders.statusChangedAt}, ${orders.createdAt})`;
  const rows = await db.select({
    id: orders.id,
    locationId: orders.locationId,
    playerName: orders.playerName,
    physicalId: orders.physicalId,
    status: orders.status,
    total: orders.total,
    reminderCount: orders.reminderCount,
    stageAt: sql<Date>`${stageStart}`,
  }).from(orders)
    .where(and(
      inArray(orders.status, ['new', 'preparing']),
      sql`${stageStart} < ${cutoff}`,
      sql`${orders.createdAt} > ${new Date(now - LOOKBACK_MS)}`,
      lt(orders.reminderCount, MAX_REMINDERS),
      or(isNull(orders.reminderSentAt), lt(orders.reminderSentAt, cutoff)),
    ))
    .limit(100);

  if (rows.length === 0) return;

  // أسماء الأماكن دفعةً واحدة
  const locIds = [...new Set(rows.map(r => r.locationId))];
  const locs = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(inArray(locations.id, locIds));
  const locName = new Map(locs.map(l => [l.id, l.name]));

  for (const r of rows) {
    const stage = STAGE_TEXT[r.status];
    if (!stage) continue;

    const mins = Math.max(5, Math.round((now - new Date(r.stageAt).getTime()) / 60000));
    const nth = (r.reminderCount ?? 0) + 1;
    const seat = r.physicalId ? ` — مقعد ${r.physicalId}` : '';
    const last = nth >= MAX_REMINDERS ? ' (آخر تذكير)' : '';

    try {
      // ✍️ الوسم قبل الإرسال: فشل الدفع لا يجوز أن يُنتج تذكيراً كلّ دقيقة.
      // 🔒 مشروطٌ بالحالة والعدّاد اللذين قرأناهما: انتقال الحالة أثناء معالجة
      //    الحلقة يصفّر العدّاد — تحديثٌ غير مشروط كان يدوس التصفير ويرسل
      //    «لم يبدأ تحضيره» لطلبٍ بدأ تحضيره للتوّ
      const [claimed] = await db.update(orders).set({
        reminderSentAt: new Date(),
        reminderCount: nth,
      } as any).where(and(
        eq(orders.id, r.id),
        eq(orders.status, r.status),
        eq(orders.reminderCount, r.reminderCount ?? 0),
      )).returning({ id: orders.id });
      if (!claimed) continue;

      await sendPushToLocationStaff(
        r.locationId,
        'orders.receive',
        stage.title,
        `طلب ${r.playerName} ${stage.verb} منذ ${mins} دقيقة${seat}${last}`,
        'new_order',
        { url: '/venue/orders', orderId: String(r.id), reminder: '1' },
      );

      // يُبرز التذكرة في كلّ كونسولٍ مفتوح — الشاشة المفتوحة لا تحتاج إشعاراً
      if (io) {
        io.to(`location:${r.locationId}`).emit('fnb:order-stalled', {
          orderId: r.id, status: r.status, minutes: mins, reminderCount: nth,
        });
      }

      console.log(`⏰ تذكير #${nth} للطلب ${r.id} (${r.status}, ${mins}د) — ${locName.get(r.locationId) || r.locationId}`);
    } catch (err: any) {
      console.warn(`⚠️ تذكير الطلب ${r.id}:`, err.message);
    }
  }
}

// ══════════════════════════════════════════════════════
// 💨 تذكير طلبات خدمة الأرجيلة — نفس العتبة والسقف
// من طلب فحماً ولم يصله شيءٌ خلال خمس دقائق لن يطلب ثانيةً: يقوم ويبحث عن
// موظّف. التذكير هنا يمنع ذلك.
// ══════════════════════════════════════════════════════
export async function runStalledServiceScan(io?: any): Promise<void> {
  const db = getDB();
  if (!db) return;
  const now = Date.now();
  const cutoff = new Date(now - STALL_MS);

  const rows = await db.select({
    id: serviceRequests.id, locationId: serviceRequests.locationId,
    playerName: serviceRequests.playerName, kind: serviceRequests.kind,
    physicalId: serviceRequests.physicalId, createdAt: serviceRequests.createdAt,
    reminderCount: serviceRequests.reminderCount,
  }).from(serviceRequests)
    .where(and(
      eq(serviceRequests.status, 'open'),
      lt(serviceRequests.createdAt, cutoff),
      sql`${serviceRequests.createdAt} > ${new Date(now - LOOKBACK_MS)}`,
      lt(serviceRequests.reminderCount, MAX_REMINDERS),
      or(isNull(serviceRequests.reminderSentAt), lt(serviceRequests.reminderSentAt, cutoff)),
    ))
    .limit(50);

  for (const r of rows) {
    const mins = Math.max(5, Math.round((now - new Date(r.createdAt).getTime()) / 60000));
    const nth = (r.reminderCount ?? 0) + 1;
    const label = r.kind === 'coal' ? 'فحم' : 'تزبيط أرجيلة';
    const seat = r.physicalId ? ` — مقعد ${r.physicalId}` : '';
    try {
      // الوسم قبل الإرسال — كما في تذكير الطلبات، مشروطاً ببقاء الطلب مفتوحاً
      const [claimed] = await db.update(serviceRequests).set({
        reminderSentAt: new Date(), reminderCount: nth,
      } as any).where(and(
        eq(serviceRequests.id, r.id),
        eq(serviceRequests.status, 'open'),
        eq(serviceRequests.reminderCount, r.reminderCount ?? 0),
      )).returning({ id: serviceRequests.id });
      if (!claimed) continue;

      await sendPushToLocationStaff(
        r.locationId, 'service.shisha', `⏰ ${label} بانتظارك`,
        `طلب ${r.playerName} منذ ${mins} دقيقة${seat}`,
        'service_request', { url: '/venue/orders', requestId: String(r.id), reminder: '1' },
      );
      if (io) io.to(`location:${r.locationId}`).emit('fnb:service-stalled', { id: r.id, minutes: mins });
    } catch (err: any) {
      console.warn(`⚠️ تذكير خدمة ${r.id}:`, err.message);
    }
  }
}

let started = false;
export function startStalledOrderScheduler(io?: any): void {
  if (started) return;
  started = true;
  setInterval(() => {
    runStalledOrderScan(io).catch(e => console.warn('⚠️ fnb stalled scan:', e.message));
    runStalledServiceScan(io).catch(e => console.warn('⚠️ service stalled scan:', e.message));
  }, SCAN_EVERY_MS);
  console.log(`⏰ ماسح الطلبات المتأخّرة بدأ (كل ${SCAN_EVERY_MS / 1000}ث · عتبة ${STALL_MS / 60000}د · سقف ${MAX_REMINDERS})`);
}
