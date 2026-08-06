'use client';

// ══════════════════════════════════════════════════════
// 🏪 إدارة الأماكن من لوحة الإدارة — /admin/venues/*
// الأدمن/المدير يدير منيو أيّ مكان وطلباته وفواتيره **من هنا** بلا دخول
// كونسول المكان — الكونسول (/venue) صار حصريّاً لحسابات الأماكن.
// يوفّر VenueContext نفسه الذي تستهلكه صفحات /venue فتُعاد استعمالها كما هي:
// مصدرٌ واحد للسلوك، وأيّ إصلاحٍ يسري على الواجهتين معاً.
// ══════════════════════════════════════════════════════

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { VenueContext, type VenueMe } from '../../venue/context';

const LOC_KEY = 'admin_venue_loc';

export default function AdminVenuesLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [me, setMe] = useState<VenueMe | null>(null);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('token') || '';
    if (!t) { router.replace('/admin/login'); return; }
    setToken(t);

    fetch('/api/venue/me', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(async (data) => {
        if (!data.success) { setError(data.error || 'تعذّر التحقّق من الحساب'); return; }
        const m: VenueMe = data.me;
        // 🔒 هذه الصفحات للإدارة فقط — حساب المكان يعمل من كونسوله
        if (m.role !== 'admin' && m.role !== 'manager') {
          router.replace('/venue/orders');
          return;
        }
        setMe(m);

        const locRes = await fetch('/api/locations', { headers: { Authorization: `Bearer ${t}` } });
        const raw = await locRes.json();
        const list = (Array.isArray(raw) ? raw : raw.locations || []).map((l: any) => ({ id: l.id, name: l.name }));
        setLocations(list);

        // 🔗 مكانٌ في الرابط يطغى على المحفوظ (روابط بطاقات صفحة الأماكن)
        const fromUrl = parseInt(new URLSearchParams(window.location.search).get('locationId') || '');
        const target = Number.isFinite(fromUrl) ? fromUrl : parseInt(localStorage.getItem(LOC_KEY) || '');
        const found = list.find((l: any) => l.id === target) || list[0] || null;
        if (found) {
          setPicked(found);
          localStorage.setItem(LOC_KEY, String(found.id));
        }
      })
      .catch(() => setError('خطأ في الاتصال بالسيرفر'))
      .finally(() => setLoading(false));
  }, [router]);

  const setLocation = (id: number, name: string) => {
    setPicked({ id, name });
    localStorage.setItem(LOC_KEY, String(id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">🔒</div>
        <p className="text-rose-400 text-sm">{error || 'غير مصرّح'}</p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="text-center py-24 border-2 border-dashed border-gray-700/30 rounded-2xl">
        <div className="text-5xl mb-4 opacity-30">📍</div>
        <p className="text-gray-400 text-sm mb-1">لا توجد أماكن بعد</p>
        <p className="text-gray-600 text-xs mb-4">أضف مكاناً أوّلاً ليكون له منيو وطلبات وفواتير</p>
        <a href="/admin/locations" className="text-emerald-400 text-sm underline">← صفحة الأماكن</a>
      </div>
    );
  }

  // الأدمن يملك كلّ صلاحيّات المكان بحكم دوره (نفس تجاوز HQ في requireVenuePermission)
  const ctx = {
    me,
    locationId: picked?.id ?? null,
    locationName: picked?.name ?? '',
    setLocation,
    isHQ: true,
    authHeaders: { Authorization: `Bearer ${token}` } as Record<string, string>,
    can: () => true,
  };

  return (
    <VenueContext.Provider value={ctx}>
      {/* عرضٌ مقيَّد: صفحات المكان صُمّمت لعمودٍ واحد (max-w-3xl) لا لعرض اللوحة الكامل */}
      <div className="space-y-4 max-w-3xl mx-auto" dir="rtl">
        {/* ── منتقي المكان: ثابتٌ فوق كلّ صفحات القسم ── */}
        <div className="flex items-center gap-3 flex-wrap bg-gray-800/50 border border-gray-700/40 rounded-2xl px-4 py-3">
          <span className="text-lg">🏪</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">المكان الذي تديره الآن</p>
            <p className="text-sm font-bold text-white truncate">{picked?.name || '—'}</p>
          </div>
          <select
            value={picked?.id ?? ''}
            onChange={e => {
              const id = parseInt(e.target.value);
              const loc = locations.find(l => l.id === id);
              if (loc) setLocation(loc.id, loc.name);
            }}
            className="bg-gray-900/60 border border-gray-600/50 rounded-xl text-sm text-white px-3 py-2 max-w-[220px]"
          >
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {picked ? children : (
          <p className="text-center text-gray-500 text-sm py-16">اختر مكاناً للبدء</p>
        )}
      </div>
    </VenueContext.Provider>
  );
}
