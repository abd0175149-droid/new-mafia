'use client';

// ══════════════════════════════════════════════════════
// 🏙️ المدن — قائمةٌ واحدةٌ مشتركةٌ بين شاشات الإدارة
//
// 🔴 نطاقان: `public` (المدن الفعّالة، بلا توثيق — للفلاتر والشرائح) و`all`
//    (كلُّ المدن بعدّاداتها، بتوثيق الموظّف — لنموذج المكان ولوحة إدارة المدن).
//    وحين يفشل `/api/cities` يُهبَط إلى العامّ كي لا تُترك القائمةُ فارغة.
//
// 🔴 ذاكرةٌ على مستوى الوحدة مع مشتركين: عشرُ شرائحٍ في الصفحة الواحدة لا
//    تعني عشرَ طلبات، وتفعيلُ مدينةٍ من لوحة الإدارة يظهر في الشريط الجانبيّ فوراً.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface City {
  id: number;
  name: string;
  slug?: string | null;
  isActive: boolean;
  sortOrder: number;
  /** من `/api/cities` فقط */
  locationsCount?: number;
  seasonPlayers?: number;
  seasonMatches?: number;
  /** 🗺️ نطاقُ الخريطة — نقطةٌ ونصفُ قطر بالكيلومترات؛ null = بلا نطاق */
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
}

export type CitiesScope = 'public' | 'all';

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

const cache: Partial<Record<CitiesScope, City[]>> = {};
const inflight: Partial<Record<CitiesScope, Promise<City[]>>> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

const num = (v: any): number | undefined => (v == null || v === '' ? undefined : Number(v));

function normalize(rows: any): City[] {
  return (Array.isArray(rows) ? rows : [])
    .map((c: any): City => ({
      id: Number(c.id),
      name: String(c.name || ''),
      slug: c.slug ?? null,
      isActive: c.isActive !== false,
      sortOrder: Number(c.sortOrder ?? 0),
      locationsCount: num(c.locationsCount),
      seasonPlayers: num(c.seasonPlayers),
      seasonMatches: num(c.seasonMatches),
      centerLat: c.centerLat == null ? null : Number(c.centerLat),
      centerLng: c.centerLng == null ? null : Number(c.centerLng),
      radiusKm: c.radiusKm == null ? null : Number(c.radiusKm),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** يُسقط الذاكرةَ كلَّها — بعد إضافة مدينةٍ أو تفعيلها أو تسميتها */
export function invalidateCities() {
  delete cache.public;
  delete cache.all;
}

export async function fetchCities(scope: CitiesScope = 'public', force = false): Promise<City[]> {
  if (!force && cache[scope]) return cache[scope]!;
  if (!force && inflight[scope]) return inflight[scope]!;

  const p = (async () => {
    try {
      if (scope === 'all') {
        try {
          const res = await fetch(`${API_URL}/api/cities`, { headers: { Authorization: `Bearer ${getToken()}` } });
          if (res.ok) {
            const d = await res.json();
            cache.all = normalize(d.cities);
            notify();
            return cache.all;
          }
        } catch { /* يُهبَط إلى العامّ */ }
      }
      const res = await fetch(`${API_URL}/api/cities/public`);
      if (!res.ok) throw new Error(`cities ${res.status}`);
      const d = await res.json();
      const list = normalize(d.cities);
      cache.public = list;
      notify();
      // احتياطُ `all`: يُعاد بلا تخزينٍ تحت مفتاحه كي تُعاد المحاولة لاحقاً
      return list;
    } finally {
      delete inflight[scope];
    }
  })();
  inflight[scope] = p;
  return p;
}

export function useCities(scope: CitiesScope = 'public') {
  const [cities, setCities] = useState<City[]>(() => cache[scope] || []);
  const [loading, setLoading] = useState(!cache[scope]);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setCities(await fetchCities(scope, force));
      setError('');
    } catch (e: any) {
      setError(e?.message || 'تعذّر جلب المدن');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  // يتابع تغيّرَ الذاكرة من أيّ مستهلكٍ آخر
  useEffect(() => {
    const fn = () => { if (cache[scope]) setCities(cache[scope]!); };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [scope]);

  const reload = useCallback(() => load(true), [load]);
  return { cities, loading, error, reload };
}

/** يُلحق `cityId` بمسارٍ سواء كان فيه استعلامٌ أم لا */
export const withCity = (path: string, cityId: number | null | undefined): string =>
  cityId ? `${path}${path.includes('?') ? '&' : '?'}cityId=${cityId}` : path;
