// ══════════════════════════════════════════════════════
// 📡 آخرُ تفاعلٍ للاعب — التعريفُ الواحد
//
// 🔴 «لا نعرف» حالةٌ صريحة. الحقلُ كان يُكتب لحظةَ **إنشاء الحساب**، ولمّا كان
//    الموظّفُ يُنشئ معظمَ الحسابات في القاعة صار ذلك مصدرَ ٣٤٧ قيمةً كاذبةً من
//    ٧٥١ (٤٦٪ من القاعدة) — تُقرأ نشاطاً وهي لحظةُ تسجيلٍ لم يتبعها شيء.
//    فلا يُكتب هنا إلّا عن تفاعلٍ حقيقيّ، ويبقى NULL حتّى أوّلِه.
//
// 🔴 ولكلّ قيمةٍ **مصدرٌ** يُراجَع: صفٌّ بقيمةٍ بلا مصدرٍ يعني مساراً يكتب من
//    وراء هذه الدالّة — وهو ما نريد كشفَه لا اكتشافَه بعد شهر.
//
// 🔴 والخطأُ تأخّرٌ لا تقدّم: الخنقُ يمنع الكتابةَ لا يُقدّمها، فالمسجَّلُ لا
//    يسبق الواقعَ أبداً. وأقصى تأخّرٍ نافذةُ الخنق — إلّا في نهاية جلسة اللعب،
//    فتُختم بلا خنقٍ لأنّها اللحظةُ الوحيدة التي نعرف فيها يقيناً أنّ الجلسة انتهت.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

/** نافذةُ الخنق (قرار المالك): ±٥ دقائق مقابل ~٢٦٠٠ كتابةٍ يوميّاً. */
export const TOUCH_THROTTLE_MS = 5 * 60_000;

export type ActiveSource = 'request' | 'socket' | 'socket_end' | 'backfill';
export type ActivePlatform = 'web' | 'android' | 'ios' | 'app';

/**
 * منصّةُ العميل من ترويسات الطلب.
 *
 * الترويسةُ الصريحة أوّلاً — هي الطريقُ الوحيد الذي لا يكسره تحديثُ متصفّحٍ أو
 * مكتبة. و`Dart/` احتياطٌ لنسخِ التطبيق القديمة التي لا ترسلها: نعرف أنّه أصليّ
 * ولا نعرف نظامَه، فنقول `app` ولا نخمّن.
 */
export function platformFromHeaders(headers: any): ActivePlatform {
  const h = String(headers?.['x-client-platform'] || '').toLowerCase();
  if (h === 'android' || h === 'ios' || h === 'web') return h;
  const ua = String(headers?.['user-agent'] || '');
  if (/^Dart\//i.test(ua) || /dart:io/i.test(ua)) return 'app';
  return 'web';
}

/**
 * يختم آخرَ تفاعل — إن استحقّ الختم.
 *
 * @param prev   القيمةُ الحاليّة في الصفّ (أو null) — تُمرَّر لأنّ المستدعي قرأها أصلاً
 * @param force  يتجاوز الخنق. لنهاية الجلسة وحدها.
 * @returns      هل كُتب فعلاً
 *
 * لا يرمي أبداً: تعطّلُ ختمٍ إحصائيٍّ لا يجوز أن يُسقط طلباً أو يقطع اتّصالاً.
 */
export async function touchLastActive(
  playerId: number,
  prev: Date | string | null | undefined,
  source: ActiveSource,
  platform: ActivePlatform,
  force = false,
): Promise<boolean> {
  try {
    if (!Number.isFinite(playerId) || playerId <= 0) return false;

    if (!force && prev) {
      const t = prev instanceof Date ? prev.getTime() : new Date(prev).getTime();
      if (Number.isFinite(t) && Date.now() - t < TOUCH_THROTTLE_MS) return false;
    }

    const db = getDB();
    if (!db) return false;

    // 🔴 استعلامٌ خامّ لا drizzle: الجدولُ يُستدعى في مسارٍ ساخنٍ (كلُّ طلبٍ
    //    مصادَق)، والاستعلامُ المُعدُّ مسبقاً أخفُّ من بناء كائنِ تحديثٍ كلَّ مرّة.
    //
    // 🔴 وGREATEST مع القيمة القائمة: ختمُ السوكِت وختمُ الطلب قد يتسابقان،
    //    فلا يجوز أن يُرجع أحدُهما الساعةَ إلى الوراء.
    await db.execute(sql`
      UPDATE players
      SET last_active_at = GREATEST(COALESCE(last_active_at, NOW()), NOW()),
          last_active_source = ${source},
          last_active_platform = ${platform}
      WHERE id = ${playerId}
    `);
    return true;
  } catch (err: any) {
    console.error('⚠️ touchLastActive:', err?.message);
    return false;
  }
}
