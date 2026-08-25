// ══════════════════════════════════════════════════════
// 📍 سياج الفعاليّة — المتحقّق الموحّد من حضور اللاعب
//
// المكان يحمل **النقطة** (locations.latitude/longitude/geofence_radius_m)،
// والفعاليّة تحمل **القرار** (activities.geofence_enabled)، فليلةٌ واحدة يمكن أن
// تُقام بلا سياج بضغطةٍ من نموذج الفعاليّة بلا لمس إعدادات المكان.
//
// 🔴 دالّةٌ واحدة تخدم البوّابتين (الدخول والطلب). تكرار المنطق في موضعين هو ما
//    أنتج آخر ثلاث عللٍ عالجناها في هذا المستودع — فلا نسخة ثانية هنا أبداً.
//
// ⚠️ حدُّ هذه المنظومة، مكتوبٌ صراحةً كي لا يُبنى عليها ما لا تحتمل: الإحداثيّات
//    تصل من جهاز اللاعب فهي **مُدخَلٌ غير موثوق**؛ تُزوَّر من أدوات المتصفّح أو من
//    «الموقع الوهميّ» في أندرويد. فالسياج يمنع التساهل لا الاحتيال، ومخرجه الدائم
//    هو الليدر (room:force-add-player).
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, locations, playerLastFix, presenceChecks } from '../schemas/admin.schema.js';

/** قراءةُ موقعٍ كما يرسلها العميل. */
export interface GeoFix {
  lat: number;
  lng: number;
  /** دقّة القراءة بالأمتار — تُضاف لنصف القطر لا تُقارَن به. */
  accuracyM?: number | null;
  /** زمن القراءة على الجهاز (ms) — لا زمن وصولها. */
  capturedAt?: number | null;
  /** أندرويد وحده يكشفه؛ iOS والويب لا واجهة لديهما. */
  isMocked?: boolean;
  source?: 'web' | 'app';
}

export type GeoReason =
  | 'OK'
  | 'EXEMPT'
  | 'NO_VENUE_POINT'
  | 'LOCATION_REQUIRED'
  | 'LOCATION_STALE'
  | 'LOCATION_INACCURATE'
  | 'LOCATION_MOCKED'
  | 'TOO_FAR';

export interface GeoVerdict {
  ok: boolean;
  reason: GeoReason;
  distanceM: number | null;
  /** نصف القطر المطبَّق فعلاً (الفعاليّة تتجاوز المكان). */
  radiusM: number | null;
  /** رسالةٌ جاهزةٌ للعرض — الواجهات لا تؤلّف نصوصاً متفرّقة. */
  message: string;
}

// ── الحدود ────────────────────────────────────────────
/** أقصى عمرٍ لقراءةٍ تُقبل عند البوّابة. أقصر من ذلك يرهق هاتفاً في قبو. */
export const FIX_MAX_AGE_MS = 120_000;
/** أسوأ دقّةٍ تُقبل. ما بعدها ليس موقعاً بل مدينة. */
export const FIX_MAX_ACCURACY_M = 200;

const MSG: Record<GeoReason, string> = {
  OK: '',
  EXEMPT: '',
  NO_VENUE_POINT: '',
  LOCATION_REQUIRED: 'نحتاج موقعك للتأكّد من حضورك — فعّل إذن الموقع وأعد المحاولة',
  LOCATION_STALE: 'قراءة موقعك قديمة — انتظر لحظةً وأعد المحاولة',
  LOCATION_INACCURATE: 'موقعك غير دقيق بما يكفي — فعّل «الموقع الدقيق» وأعد المحاولة',
  LOCATION_MOCKED: 'تعذّر التحقّق من موقعك',
  TOO_FAR: 'يبدو أنّك خارج المكان — اطلب من موجّه اللعبة إضافتك',
};

const verdict = (
  ok: boolean, reason: GeoReason, distanceM: number | null = null, radiusM: number | null = null,
): GeoVerdict => ({ ok, reason, distanceM, radiusM, message: MSG[reason] });

// ── المسافة ───────────────────────────────────────────
/** haversine بالأمتار. نصف قطر الأرض المتوسّط 6371 كم — الخطأ دون المتر على مسافاتنا. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}

const num = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** قراءةٌ صالحةٌ شكلاً؟ (قبل أيّ منطق سياج) */
export function isUsableFix(fix: any): fix is GeoFix {
  if (!fix || typeof fix !== 'object') return false;
  const lat = num(fix.lat), lng = num(fix.lng);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// ── المتحقّق ──────────────────────────────────────────
export interface VerifyArgs {
  activityId: number | null | undefined;
  fix: any;
  /** غرفةٌ بعيدة (أونلاين) — معفاةٌ دائماً. */
  isRemote?: boolean;
}

/**
 * الترتيب مقصود: أوّل شرطٍ يتحقّق يحسم.
 * الإعفاءات أوّلاً كي لا يُحسب شيءٌ لفعاليّةٍ لا سياج عليها أصلاً.
 */
export async function verifyPresence(args: VerifyArgs): Promise<GeoVerdict> {
  const db = getDB();
  if (!db) return verdict(true, 'EXEMPT');

  if (args.isRemote) return verdict(true, 'EXEMPT');
  if (!Number.isFinite(Number(args.activityId))) return verdict(true, 'EXEMPT');

  const [row] = await db.select({
    geofenceEnabled: activities.geofenceEnabled,
    actRadius: activities.geofenceRadiusM,
    lat: locations.latitude,
    lng: locations.longitude,
    locRadius: locations.geofenceRadiusM,
    isTest: locations.isTestLocation,
  })
    .from(activities)
    .leftJoin(locations, eq(locations.id, activities.locationId))
    .where(eq(activities.id, Number(args.activityId)))
    .limit(1);

  if (!row) return verdict(true, 'EXEMPT');
  if (row.geofenceEnabled !== true) return verdict(true, 'EXEMPT');
  if (row.isTest === true) return verdict(true, 'EXEMPT');

  const vLat = num(row.lat), vLng = num(row.lng);
  // 🔴 مفتاحٌ مُشغَّلٌ على مكانٍ بلا نقطة: نمرّر ولا نمنع. سياجٌ حول لا شيء إمّا يمنع
  //    الجميع أو يمرّر الجميع — والمنع هنا يقفل ليلةً كاملة بسبب إعدادٍ ناقص.
  //    النموذج يمنع هذه الحالة أصلاً، وهذا حارسٌ أخير يُنذر ولا يؤذي.
  if (vLat === null || vLng === null) {
    console.warn(`⚠️ [geofence] الفعاليّة ${args.activityId} سياجها مُشغَّل ومكانها بلا نقطة — مُرِّر`);
    return verdict(true, 'NO_VENUE_POINT');
  }

  // نصف قطر الفعاليّة يتجاوز نصف قطر المكان (لحدثٍ خارجيّ مثلاً)
  const radiusM = row.actRadius ?? row.locRadius ?? 200;

  if (!isUsableFix(args.fix)) return verdict(false, 'LOCATION_REQUIRED', null, radiusM);

  const fix = args.fix as GeoFix;
  const captured = num(fix.capturedAt);
  if (captured !== null && Date.now() - captured > FIX_MAX_AGE_MS) {
    return verdict(false, 'LOCATION_STALE', null, radiusM);
  }

  const acc = num(fix.accuracyM);
  if (acc !== null && acc > FIX_MAX_ACCURACY_M) {
    return verdict(false, 'LOCATION_INACCURATE', null, radiusM);
  }

  if (fix.isMocked === true) return verdict(false, 'LOCATION_MOCKED', null, radiusM);

  const distanceM = haversineM(vLat, vLng, num(fix.lat)!, num(fix.lng)!);
  // الدقّة تُضاف لا تُقارَن: هاتفٌ داخل مقهىً مسقوف يبلّغ بدقّة ٨٠م، فمقارنةُ نقطةٍ
  // بنقطةٍ ترفض جالساً على الطاولة.
  const slack = Math.min(acc ?? 0, FIX_MAX_ACCURACY_M);
  if (distanceM <= radiusM + slack) return verdict(true, 'OK', distanceM, radiusM);

  return verdict(false, 'TOO_FAR', distanceM, radiusM);
}

// ── التسجيل ───────────────────────────────────────────

/** يخزّن آخر قراءةٍ للاعب — صفٌّ واحدٌ يُستبدَل. */
export async function saveLastFix(playerId: number, fix: GeoFix): Promise<void> {
  const db = getDB();
  if (!db || !isUsableFix(fix)) return;
  const captured = num(fix.capturedAt);
  const values = {
    playerId,
    latitude: String(num(fix.lat)),
    longitude: String(num(fix.lng)),
    accuracyM: num(fix.accuracyM) === null ? null : Math.round(num(fix.accuracyM)!),
    isMocked: fix.isMocked === true,
    source: fix.source === 'app' ? 'app' : 'web',
    capturedAt: new Date(captured ?? Date.now()),
    updatedAt: new Date(),
  } as any;
  const { playerId: _drop, ...onUpdate } = values;
  await db.insert(playerLastFix).values(values)
    .onConflictDoUpdate({ target: playerLastFix.playerId, set: onUpdate as any });
}

/** يسجّل نتيجة فحصٍ — بلا إحداثيّات خام. */
export async function logPresenceCheck(o: {
  playerId: number; activityId?: number | null; gate: 'join' | 'order' | 'service';
  v: GeoVerdict; accuracyM?: number | null; isMocked?: boolean; enforced?: boolean;
}): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await db.insert(presenceChecks).values({
      playerId: o.playerId,
      activityId: Number.isFinite(Number(o.activityId)) ? Number(o.activityId) : null,
      gate: o.gate,
      result: o.v.reason === 'OK' ? 'OK' : o.v.reason,
      distanceM: o.v.distanceM,
      accuracyM: o.accuracyM === null || o.accuracyM === undefined ? null : Math.round(o.accuracyM),
      isMocked: o.isMocked === true,
      enforced: o.enforced !== false,
    } as any);
  } catch (e: any) {
    console.warn('⚠️ [geofence] تعذّر تسجيل الفحص:', e.message);
  }
}

/** فحصٌ كاملٌ عند بوّابة: يحفظ القراءة، يتحقّق، يسجّل. */
export async function gateCheck(o: {
  playerId: number; activityId: number | null | undefined; fix: any;
  gate: 'join' | 'order' | 'service'; isRemote?: boolean;
}): Promise<GeoVerdict> {
  if (isUsableFix(o.fix)) {
    try { await saveLastFix(o.playerId, o.fix as GeoFix); } catch { /* لا يُسقط البوّابة */ }
  }
  const v = await verifyPresence({ activityId: o.activityId, fix: o.fix, isRemote: o.isRemote });
  if (v.reason !== 'EXEMPT') {
    await logPresenceCheck({
      playerId: o.playerId, activityId: o.activityId, gate: o.gate, v,
      accuracyM: num(o.fix?.accuracyM), isMocked: o.fix?.isMocked === true,
    });
  }
  return v;
}
