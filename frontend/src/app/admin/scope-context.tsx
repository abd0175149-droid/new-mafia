'use client';

// ══════════════════════════════════════════════════════
// 🏙️ نطاقُ العرض — مدينةٌ واحدةٌ أو «الكلّ» لكلّ لوحة الإدارة
//
// 🔴 يُحفظ محلّيّاً في `admin_city_scope` ويُقرأ بعد الإقلاع لا في أوّل تصيير:
//    القراءةُ في المُهيّئ تُنتج شجرةً على الخادم تختلف عن شجرة المتصفّح.
//    ولذلك `ready`: الصفحاتُ تنتظره قبل أوّل جلبٍ كي لا تجلب مرّتين.
//
// 🔴 مدينةٌ محفوظةٌ لم تعد فعّالة (عُطّلت) تعود إلى «الكلّ» بصمت.
// ══════════════════════════════════════════════════════

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCities, type City } from '@/hooks/useCities';

export const ADMIN_SCOPE_KEY = 'admin_city_scope';

export interface AdminScope {
  /** `null` = الكلّ */
  cityId: number | null;
  setCityId: (id: number | null) => void;
  cities: City[];
  city: City | null;
  loading: boolean;
  /** قُرئت القيمةُ المحفوظة — الصفحاتُ تنتظرها قبل أوّل جلب */
  ready: boolean;
  /** اسمُ النطاق للعرض: اسم المدينة أو «الكلّ» */
  label: string;
}

const noop = () => {};

export const AdminScopeContext = createContext<AdminScope>({
  cityId: null, setCityId: noop, cities: [], city: null, loading: false, ready: true, label: 'الكلّ',
});

function readStored(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SCOPE_KEY);
    if (raw == null || raw === '' || raw === 'all') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const { cities, loading } = useCities('public');
  const [cityId, setCityIdState] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCityIdState(readStored());
    setReady(true);
  }, []);

  const setCityId = useCallback((id: number | null) => {
    setCityIdState(id);
    try { localStorage.setItem(ADMIN_SCOPE_KEY, id == null ? 'all' : String(id)); } catch { /* تصفّحٌ خاصّ */ }
  }, []);

  // المدينةُ المحفوظة لم تعد في القائمة الفعّالة → الكلّ
  useEffect(() => {
    if (!ready || loading || !cities.length || cityId == null) return;
    if (!cities.some(c => c.id === cityId)) setCityId(null);
  }, [ready, loading, cities, cityId, setCityId]);

  const value = useMemo<AdminScope>(() => {
    const city = cities.find(c => c.id === cityId) || null;
    return { cityId, setCityId, cities, city, loading, ready, label: city?.name || 'الكلّ' };
  }, [cityId, setCityId, cities, loading, ready]);

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>;
}

export function useAdminScope(): AdminScope {
  return useContext(AdminScopeContext);
}
