// ══════════════════════════════════════════════════════
// 💬 مجموعةُ الواتساب حسب المنطقة والجنس
//
// 🔴 القواعدُ في جدول `wa_groups` يديره المالكُ من اللوحة، لا ثوابتَ في
//    الشفرة: الروابطُ تنتهي صلاحيّتُها، والمجموعاتُ تُنشأ وتُغلق، والمناطقُ
//    تتوسّع — وكلُّ واحدةٍ من هذه كانت ستعني نشرةً كاملة.
//
// 🔴 والمنطقةُ نقطةٌ ونصفُ قطر لا اسمُ مدينة: حدودُ المدن الإداريّة متداخلة
//    ولا يعرفها الجهاز، والدائرةُ تُرسم على الخريطة وتُفهم.
//
// 🔴 والقرارُ في الخادم لا في العميلين: نسختان في فلاتر والويب تعنيان لاعباً
//    في المنطقة نفسِها يُوجَّه إلى مجموعتين مختلفتين حسب الجهاز الذي فتح منه.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

/** يُستعمل حين لا جدولَ ولا قاعدةً افتراضيّةً — آخرُ خطّ دفاع */
export const GROUP_HARD_FALLBACK = 'https://chat.whatsapp.com/Bz1ipm8YxR31u5OEUOxeJZ';

export interface WaGroupRule {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  gender: 'ANY' | 'MALE' | 'FEMALE';
  url: string;
  isDefault: boolean;
  isActive: boolean;
}

/** مسافةُ هافرساين بالكيلومترات */
export function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * هل الإحداثيّاتُ صالحةٌ أصلاً؟
 *
 * 🔴 (0,0) عددٌ صالحٌ وهي في المحيط الأطلسيّ — تُنتجها أجهزةٌ تفشل قراءتُها،
 *    وبلا هذا الحارس تُقاس المسافةُ إليها فتُطابق أوسعَ دائرةٍ في الجدول.
 */
export function validCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la === 0 && ln === 0) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

/**
 * يختار القاعدةَ المطابقة من قائمةٍ معطاة — منطقٌ خالصٌ يُختبر بلا قاعدة بيانات.
 *
 * الترتيب:
 *  ١. القواعدُ التي تحوي الموقعَ داخل نصف قطرها، وجنسُها يطابق أو ANY.
 *  ٢. **الأخصُّ يفوز**: قاعدةُ الجنس تسبق ANY، ثمّ الأصغرُ نصفَ قطرٍ.
 *     دائرتان متداخلتان أمرٌ عاديّ (حيٌّ داخل مدينة)، والأصغرُ هو المقصود.
 *  ٣. فإن لم تطابق واحدة ⇒ القاعدةُ الافتراضيّة، ثمّ الاحتياطيُّ الصلب.
 */
export function pickGroup(
  rules: WaGroupRule[],
  coords: { lat: number; lng: number } | null,
  gender: unknown,
): WaGroupRule | null {
  const g = String(gender ?? '').trim().toUpperCase() === 'FEMALE' ? 'FEMALE' : 'MALE';
  const active = rules.filter(r => r.isActive);

  if (coords) {
    const hits = active
      .filter(r => r.latitude != null && r.longitude != null && r.radiusKm != null)
      .filter(r => r.gender === 'ANY' || r.gender === g)
      .map(r => ({ r, d: distKm(coords.lat, coords.lng, r.latitude!, r.longitude!) }))
      .filter(x => x.d <= x.r.radiusKm!)
      .sort((a, b) =>
        // الجنسُ المحدَّد أوّلاً، ثمّ أصغرُ نصفِ قطر، ثمّ الأقرب
        (a.r.gender === 'ANY' ? 1 : 0) - (b.r.gender === 'ANY' ? 1 : 0)
        || a.r.radiusKm! - b.r.radiusKm!
        || a.d - b.d);
    if (hits.length) return hits[0].r;
  }

  return active.find(r => r.isDefault) ?? null;
}

/** يقرأ القواعدَ من القاعدة */
export async function loadRules(): Promise<WaGroupRule[]> {
  const db = getDB();
  if (!db) return [];
  const r: any = await db.execute(sql`
    SELECT id, name, latitude, longitude, radius_km, gender, url, is_default, is_active
    FROM wa_groups ORDER BY is_default DESC, radius_km ASC NULLS LAST, id ASC
  `);
  return ((r?.rows ?? r ?? []) as any[]).map(x => ({
    id: x.id, name: x.name,
    latitude: x.latitude == null ? null : Number(x.latitude),
    longitude: x.longitude == null ? null : Number(x.longitude),
    radiusKm: x.radius_km == null ? null : Number(x.radius_km),
    gender: x.gender, url: x.url,
    isDefault: !!x.is_default, isActive: !!x.is_active,
  }));
}

/** الرابطُ المناسب — الواجهةُ العليا التي يستعملها المنفذ */
export async function resolveGroup(lat: unknown, lng: unknown, gender: unknown) {
  const coords = validCoords(lat, lng);
  const rules = await loadRules();
  const hit = pickGroup(rules, coords, gender);
  return {
    url: hit?.url ?? GROUP_HARD_FALLBACK,
    groupName: hit?.name ?? '',
    matchedById: hit?.id ?? null,
  };
}
