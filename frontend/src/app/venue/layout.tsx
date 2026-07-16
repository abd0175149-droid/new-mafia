'use client';

// ══════════════════════════════════════════════════════
// 🏪 كونسول المكان — /venue/*
// حراسة: توكن موظّف + /api/venue/me (حساب مكان مرتبط، أو أدمن/مدير مع مُنتقي مكان)
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { VenueContext, type VenueCtx, type VenueMe } from './context';

const TABS = [
  { href: '/venue/menu', label: '🍽️ المنيو', perm: 'menu.manage', ready: true },
  { href: '/venue/orders', label: '📥 الطلبات', perm: 'orders.receive', ready: false },
  { href: '/venue/invoices', label: '🧾 الفواتير', perm: 'invoices.print', ready: false },
];

export default function VenueLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<VenueMe | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pickedLoc, setPickedLoc] = useState<{ id: number; name: string } | null>(null);
  const [hqLocations, setHqLocations] = useState<{ id: number; name: string }[]>([]);
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token') || '';
    if (!t) { router.replace('/admin/login'); return; }
    setToken(t);
    fetch('/api/venue/me', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(async (data) => {
        if (!data.success) { setError(data.error || 'تعذّر التحقّق من الحساب'); return; }
        const m: VenueMe = data.me;
        setMe(m);
        if (m.role === 'admin' || m.role === 'manager') {
          // HQ: جلب الأماكن لمُنتقي المكان
          try {
            const locRes = await fetch('/api/locations', { headers: { Authorization: `Bearer ${t}` } });
            const locs = await locRes.json();
            const list = (Array.isArray(locs) ? locs : locs.locations || []).map((l: any) => ({ id: l.id, name: l.name }));
            setHqLocations(list);
            const saved = parseInt(localStorage.getItem('venue_loc') || '');
            const found = list.find((l: any) => l.id === saved);
            if (found) setPickedLoc(found);
          } catch { /* بلا أماكن — يظهر المُنتقي فارغاً */ }
        } else if (!m.location) {
          setError('هذا الحساب غير مرتبط بمكان — تواصل مع الإدارة');
        }
      })
      .catch(() => setError('خطأ في الاتصال بالسيرفر'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center" dir="rtl">
        <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-rose-400 text-sm mb-4">{error || 'غير مصرّح'}</p>
          <Link href="/admin/login" className="text-emerald-400 text-sm underline">تسجيل الدخول</Link>
        </div>
      </div>
    );
  }

  const isHQ = me.role === 'admin' || me.role === 'manager';
  const loc = isHQ ? pickedLoc : me.location;
  const ctx: VenueCtx = {
    me,
    locationId: loc?.id ?? null,
    locationName: loc?.name || '',
    setLocation: (id, name) => { setPickedLoc({ id, name }); localStorage.setItem('venue_loc', String(id)); },
    isHQ,
    authHeaders: { Authorization: `Bearer ${token}` },
    can: (perm) => isHQ || me.permissions.includes(perm),
  };

  return (
    <VenueContext.Provider value={ctx}>
      <div className="min-h-screen bg-gray-950 text-white" dir="rtl">
        {/* ── الترويسة ── */}
        <header className="sticky top-0 z-40 bg-gray-900/90 backdrop-blur border-b border-emerald-500/15">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-2xl">🏪</span>
              <div className="min-w-0">
                <h1 className="text-sm font-bold truncate">{loc?.name || 'كونسول المكان'}</h1>
                <p className="text-[10px] text-gray-500 truncate">{me.displayName} • {isHQ ? 'إدارة النادي' : 'حساب المكان'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isHQ && (
                <select
                  value={loc?.id || ''}
                  onChange={(e) => {
                    const l = hqLocations.find(x => x.id === parseInt(e.target.value));
                    if (l) ctx.setLocation(l.id, l.name);
                  }}
                  className="bg-gray-800 border border-gray-700 rounded-lg text-xs px-2 py-1.5 max-w-[130px]"
                >
                  <option value="" disabled>اختر المكان…</option>
                  {hqLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <button
                onClick={() => { router.push(isHQ ? '/admin' : '/admin/login'); if (!isHQ) { localStorage.removeItem('token'); localStorage.removeItem('user'); } }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
              >
                {isHQ ? '← لوحة الإدارة' : 'خروج'}
              </button>
            </div>
          </div>
          {/* ── التبويبات ── */}
          <nav className="max-w-3xl mx-auto px-4 flex gap-1 pb-2">
            {TABS.map(tab => {
              const active = pathname === tab.href;
              const allowed = ctx.can(tab.perm);
              if (!allowed) return null;
              return (
                <Link
                  key={tab.href}
                  href={tab.ready ? tab.href : '#'}
                  onClick={(e) => { if (!tab.ready) e.preventDefault(); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : tab.ready ? 'text-gray-400 hover:text-white hover:bg-white/5'
                      : 'text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {tab.label}
                  {!tab.ready && <span className="mr-1 text-[9px] text-gray-600">قريباً</span>}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-5">
          {!loc ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              {isHQ ? 'اختر مكاناً من القائمة أعلاه لإدارة منيوه' : 'الحساب غير مرتبط بمكان'}
            </div>
          ) : children}
        </main>
      </div>
    </VenueContext.Provider>
  );
}
