// ══════════════════════════════════════════════════════
// 🧪 مواقعُ الاختبار في كلّ ما يواجه واتساب (قرار المالك 2026-09-27)
// ══════════════════════════════════════════════════════
// البوت عرض على العملاء فعاليّةً في «Test Location» (locations.is_test_location = true).
// القاعدة: أيّ فعاليّة في موقع اختبار لا تظهر في قائمة، ولا تُقبل بالمعرّف في أداة، ولا
// يُذكَّر بها، ولا تُتابَع، ولا تُبثّ عنها — للعميل والأدمن سواء. تطبيقُ اللاعب يخفيها
// للحسابات العاديّة (player-app.routes) والتقارير تستثنيها (reports/helpers).
// هذه الوحدة هي المصدر الواحد لكلّ خدمات واتساب كي لا تفترق صيغةٌ عن صيغة.
import { sql, eq } from 'drizzle-orm';
import { activities, locations } from '../schemas/admin.schema.js';

/** شرطُ Drizzle على جدول activities (بلا JOIN): يُبقي الفعاليّات بلا موقع ويستبعد مواقع الاختبار */
export const notTestActivity = sql`(${activities.locationId} IS NULL OR ${activities.locationId} NOT IN (SELECT id FROM locations WHERE is_test_location IS TRUE))`;

/** الشرطُ نفسه نصّاً لاستعلامات SQL الخامّة، بالاسم المستعار لجدول الفعاليّات (افتراضيّاً a) */
export const notTestActivitySql = (alias = 'a') => `(${alias}.location_id IS NULL OR ${alias}.location_id NOT IN (SELECT id FROM locations WHERE is_test_location IS TRUE))`;

/** لجدول locations نفسِه (بالاسم المستعار l) */
export const notTestLocationSql = (alias = 'l') => `COALESCE(${alias}.is_test_location, false) = false`;

/** نتيجةُ أداةٍ موحّدة: يفهمها النموذج فلا يذكر الفعاليّة */
export const TEST_ACTIVITY_RESULT = { error: 'هذه الفعاليّة غير متاحة عبر الواتساب (موقع اختبار) — أعد عرض الفعاليّات المتاحة ولا تذكرها للعميل' };

/** هل هذه الفعاليّة في موقع اختبار؟ (معرّفٌ من النموذج أو من زرّ) */
export async function isTestActivity(db: any, activityId: number | null | undefined): Promise<boolean> {
  const id = Number(activityId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const [row] = await db.select({ isTest: locations.isTestLocation })
    .from(activities).leftJoin(locations, eq(activities.locationId, locations.id))
    .where(eq(activities.id, id)).limit(1);
  return !!row?.isTest;
}

// مجموعةُ معرّفات فعاليّات الاختبار — لحالات Redis (غرف اللعب الحيّة) حيث لا استعلامَ لكلّ حالة؛ كاش دقيقة
let idsCache: { at: number; set: Set<number> } | null = null;
export async function testActivityIds(db: any): Promise<Set<number>> {
  if (idsCache && Date.now() - idsCache.at < 60_000) return idsCache.set;
  const rows = await db.select({ id: activities.id }).from(activities)
    .innerJoin(locations, eq(activities.locationId, locations.id))
    .where(eq(locations.isTestLocation, true));
  idsCache = { at: Date.now(), set: new Set(rows.map((r: any) => Number(r.id))) };
  return idsCache.set;
}
