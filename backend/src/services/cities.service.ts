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
  }).from(cities).orderBy(asc(cities.sortOrder), asc(cities.id));
  cache = { rows: rows as CityRow[], at: Date.now() };
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

export async function updateCity(id: number, patch: { name?: string; isActive?: boolean; sortOrder?: number }): Promise<CityRow | null> {
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
