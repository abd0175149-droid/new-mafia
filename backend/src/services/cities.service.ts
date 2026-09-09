// ══════════════════════════════════════════════════════
// 🏙️ خدمة المدن — Cities Service
// المدينةُ صفةٌ للمكان (locations.city_id)؛ منها تُشتقّ مدينةُ الفعاليّة والمباراة
// والتصنيف. لا حذف للمدن (مُشارٌ إليها من الأماكن والمباريات والإحصاءات) — تعطيلٌ فقط.
// ══════════════════════════════════════════════════════

import { eq, asc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { cities, locations } from '../schemas/admin.schema.js';

export interface CityRow {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  // 🗺️ نطاقُ الخريطة — نقطةٌ ونصفُ قطر بالكيلومترات؛ null = بلا نطاق
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
}

// ── كاش ٦٠ ثانية (القائمة صغيرة وتتغيّر نادراً) ──
let cache: { rows: CityRow[]; at: number } | null = null;
const CACHE_MS = 60_000;
export function invalidateCitiesCache() { cache = null; }

async function loadAll(): Promise<CityRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const db = getDB();
  if (!db) return cache?.rows ?? [];
  const rows = await db.select({
    id: cities.id, name: cities.name, slug: cities.slug, isActive: cities.isActive, sortOrder: cities.sortOrder,
    centerLat: cities.centerLat, centerLng: cities.centerLng, radiusKm: cities.radiusKm,
  }).from(cities).orderBy(asc(cities.sortOrder), asc(cities.id));
  // decimal يصل نصّاً من السائق — يُحوَّل مرّةً هنا فلا يتكرّر التحويل في كلّ مستهلك
  cache = {
    rows: rows.map(r => ({
      ...r,
      centerLat: r.centerLat == null ? null : Number(r.centerLat),
      centerLng: r.centerLng == null ? null : Number(r.centerLng),
      radiusKm: r.radiusKm == null ? null : Number(r.radiusKm),
    })) as CityRow[],
    at: Date.now(),
  };
  return cache.rows;
}

/** كلّ المدن (أو الفعّالة فقط) مرتّبةً بـ sort_order. */
export async function listCities(opts: { activeOnly?: boolean } = {}): Promise<CityRow[]> {
  const rows = await loadAll();
  return opts.activeOnly ? rows.filter(c => c.isActive) : rows;
}

export async function getCity(id: number | null | undefined): Promise<CityRow | null> {
  if (id == null) return null;
  const rows = await loadAll();
  return rows.find(c => c.id === Number(id)) ?? null;
}

export async function cityNameOf(id: number | null | undefined): Promise<string | null> {
  const c = await getCity(id);
  return c?.name ?? null;
}

export async function cityMap(): Promise<Map<number, CityRow>> {
  const rows = await loadAll();
  return new Map(rows.map(c => [c.id, c]));
}

/** المدينةُ الافتراضيّة لغير المسجّل ولمن لا مدينةَ له: أوّلُ مدينةٍ فعّالة بالترتيب. */
export async function defaultCityId(): Promise<number | null> {
  const active = await listCities({ activeOnly: true });
  return active[0]?.id ?? null;
}

/** مدينةُ مكانٍ (locations.city_id) — null إن لم يوجد المكان. */
export async function resolveCityForLocation(locationId: number | null | undefined): Promise<number | null> {
  if (!locationId) return null;
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({ cityId: locations.cityId }).from(locations)
    .where(eq(locations.id, locationId)).limit(1);
  return row?.cityId ?? null;
}

// ══════════════════════════════════════════════════════
// 🗺️ مطابقةُ الإحداثيّات بمدينة — اقتراحٌ وقياسٌ لا قرار
// ══════════════════════════════════════════════════════
// 🔴 نقطةٌ ونصفُ قطر لا اسمٌ ولا حدودٌ إداريّة — نفسُ قرار wa_groups، وللسبب نفسه:
//    حدودُ المدن متداخلةٌ ولا يعرفها الجهاز، والدائرةُ تُرسم على الخريطة وتُفهم.
// 🔴 والأصغرُ نصفَ قطرٍ يفوز عند التداخل: دائرةٌ داخل دائرةٍ أمرٌ عاديّ (ضاحيةٌ داخل
//    إقليم)، والأخصُّ هو المقصود. ثمّ الأقربُ إلى المركز عند تساوي القطر.
// 🔴 ولا تُستعمل هذه الدالّة لتقرير رتبةٍ ولا لإخفاء فعاليّة: الرتبةُ من مكان اللعب،
//    والمدينةُ الأساسيّة اختيارُ اللاعب. الموقعُ يقترح فقط.
//
// يُعيد null إذا لم تُحدَّد إحداثيّاتٌ صالحة، أو لم تقع داخل أيّ دائرة.

/** مسافةُ هافرساين بالكيلومترات — الوحدةُ نفسُها المستعملة في توجيه مجموعات الواتساب */
export { distKm } from '../lib/city-groups.js';

export function validCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;   // نقطةُ الصفر قراءةٌ فاشلة لا موقع
  return { lat: a, lng: b };
}

export interface CityMatch { city: CityRow; distanceKm: number }

/** المدينةُ التي تقع فيها هذه الإحداثيّات (الفعّالة ذات النطاق فقط). */
export async function resolveCityByCoords(lat: unknown, lng: unknown, opts: { activeOnly?: boolean } = {}): Promise<CityMatch | null> {
  const coords = validCoords(lat, lng);
  if (!coords) return null;
  const { distKm } = await import('../lib/city-groups.js');
  const rows = await listCities({ activeOnly: opts.activeOnly !== false });
  const hits = rows
    .filter(c => c.centerLat != null && c.centerLng != null && c.radiusKm != null)
    .map(c => ({ city: c, distanceKm: distKm(coords.lat, coords.lng, c.centerLat!, c.centerLng!) }))
    .filter(h => h.distanceKm <= h.city.radiusKm!)
    .sort((a, b) => (a.city.radiusKm! - b.city.radiusKm!) || (a.distanceKm - b.distanceKm));
  return hits[0] ?? null;
}

export function slugify(name: string): string {
  const base = String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'city').slice(0, 40);
}

export async function createCity(name: string, slug?: string): Promise<CityRow> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) throw new Error('اسم المدينة مطلوب');
  const [{ maxOrder }] = await db.select({ maxOrder: sql<number>`COALESCE(MAX(${cities.sortOrder}), 0)::int` }).from(cities);
  let finalSlug = slugify(slug || clean);
  const clash = await db.select({ id: cities.id }).from(cities).where(eq(cities.slug, finalSlug)).limit(1);
  if (clash.length) finalSlug = `${finalSlug}-${Date.now() % 10000}`.slice(0, 40);
  const [row] = await db.insert(cities).values({
    name: clean, slug: finalSlug, isActive: true, sortOrder: (maxOrder || 0) + 1,
  } as any).returning();
  invalidateCitiesCache();
  return row as any;
}

export interface CityPatch {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
  /** 🗺️ النطاق — تمريرُ null صراحةً يمسحه (مدينةٌ بلا نطاقٍ على الخريطة) */
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
}

export async function updateCity(id: number, patch: CityPatch): Promise<CityRow | null> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const clean = String(patch.name || '').trim().slice(0, 60);
    if (!clean) throw new Error('اسم المدينة مطلوب');
    set.name = clean;
  }
  if (patch.isActive !== undefined) set.isActive = patch.isActive === true;
  if (patch.sortOrder !== undefined && Number.isFinite(Number(patch.sortOrder))) set.sortOrder = Number(patch.sortOrder);

  // 🗺️ النطاق يُكتب كوحدةٍ واحدة: نقطةٌ بلا نصف قطرٍ لا تُطابِق شيئاً، ونصفُ قطرٍ بلا نقطةٍ لا معنى له.
  const geoTouched = patch.centerLat !== undefined || patch.centerLng !== undefined || patch.radiusKm !== undefined;
  if (geoTouched) {
    const lat = patch.centerLat === null ? null : Number(patch.centerLat);
    const lng = patch.centerLng === null ? null : Number(patch.centerLng);
    const rad = patch.radiusKm === null ? null : Number(patch.radiusKm);
    const clearing = lat === null || lng === null || rad === null;
    if (clearing) {
      set.centerLat = null; set.centerLng = null; set.radiusKm = null;
    } else {
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) throw new Error('خطّ العرض غير صالح');
      if (!Number.isFinite(lng) || Math.abs(lng) > 180) throw new Error('خطّ الطول غير صالح');
      // ١ كم يقلّ عن حجم حيّ، و١٠٠ كم يبتلع نصف البلد — كلاهما خطأُ إدخالٍ لا نيّة
      if (!Number.isFinite(rad) || rad < 1 || rad > 100) throw new Error('نصف القطر بين ١ و١٠٠ كم');
      set.centerLat = String(lat); set.centerLng = String(lng); set.radiusKm = String(rad);
    }
  }

  if (Object.keys(set).length === 0) return getCity(id);
  const [row] = await db.update(cities).set(set as any).where(eq(cities.id, id)).returning();
  invalidateCitiesCache();
  return (row as any) ?? null;
}

/**
 * البذرُ الافتراضيّ عند الإقلاع: عمّان (1، فعّالة) والزرقاء (2، معطّلة حتى الإطلاق).
 * آمنٌ للتكرار — لا يكتب إن وُجد أيّ صفّ.
 */
export async function ensureDefaultCities(): Promise<void> {
  const db = getDB();
  if (!db) return;
  const [{ c }] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(cities);
  if ((c || 0) > 0) return;
  await db.execute(sql`
    INSERT INTO cities (id, name, slug, is_active, sort_order) VALUES
      (1, 'عمّان', 'amman', true, 1),
      (2, 'الزرقاء', 'zarqa', false, 2)
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`SELECT setval('cities_id_seq', (SELECT MAX(id) FROM cities))`);
  invalidateCitiesCache();
  console.log('🏙️ Default cities seeded (عمّان active · الزرقاء inactive)');
}
