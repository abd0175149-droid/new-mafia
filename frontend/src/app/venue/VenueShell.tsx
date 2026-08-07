'use client';

// ══════════════════════════════════════════════════════
// 🏪 كونسول المكان — /venue/* · تصميم «الجمرة»
// حراسة: توكن موظّف + /api/venue/me (حساب مكانٍ مرتبط حصراً — الإدارة تُحوَّل).
// الواجهة تتشكّل حسب الصلاحيات: لا تبويبات مقفلة ولا أزرار ميّتة.
// 🖥️ حسابٌ بصلاحيّة الاستقبال وحدها = شاشة مطبخ: بلا تبويبات ولا خروج،
//    جهازٌ معلّقٌ يُقرأ من مترين ولا يُلمس.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { VenueContext, type VenueCtx, type VenueMe } from './context';
import { EM } from './ember';
import InstallGuide from '../../components/InstallGuide';

// ترتيبٌ حسب تواتر الاستخدام: الطلبات (كلّ ليلة) ← المال ← الإعداد النادر
const TABS: { href: string; icon: string; label: string; short?: string; perm: string }[] = [
  { href: '/venue/orders', icon: '📥', label: 'الطلبات', perm: 'orders.receive' },
  { href: '/venue/invoices', icon: '🧾', label: 'الفواتير', perm: 'invoices.print' },
  { href: '/venue/revenue', icon: '💰', label: 'الدخل والحصص', short: 'الدخل', perm: 'invoices.print' },
  { href: '/venue/menu', icon: '⚙️', label: 'إعدادات المنيو', short: 'المنيو', perm: 'menu.manage' },
];

export default function VenueShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<VenueMe | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
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
        // الكونسول لحسابات الأماكن حصراً — الإدارة تدير الأماكن من /admin/venues
        if (m.role === 'admin' || m.role === 'manager') {
          const fromUrl = new URLSearchParams(window.location.search).get('locationId');
          const tail = window.location.pathname.split('/')[2] || 'menu';
          const section = ['menu', 'orders', 'invoices', 'revenue'].includes(tail) ? tail : 'menu';
          router.replace(`/admin/venues/${section}${fromUrl ? `?locationId=${fromUrl}` : ''}`);
          return;
        }
        setMe(m);
        if (!m.location) setError('هذا الحساب غير مرتبط بمكان — تواصل مع الإدارة');
      })
      .catch(() => setError('خطأ في الاتصال بالسيرفر'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: EM.ink }} dir="rtl">
        <div className="w-10 h-10 rounded-full animate-spin"
          style={{ border: `2px solid ${EM.line2}`, borderTopColor: EM.warm }} />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: EM.ink }} dir="rtl">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-sm mb-4" style={{ color: EM.hot }}>{error || 'غير مصرّح'}</p>
          <Link href="/admin/login" className="text-sm underline" style={{ color: EM.warm }}>تسجيل الدخول</Link>
        </div>
      </div>
    );
  }

  const loc = me.location;
  const ctx: VenueCtx = {
    me,
    locationId: loc?.id ?? null,
    locationName: loc?.name || '',
    setLocation: () => { /* حساب المكان لا يبدّل مكانه */ },
    isHQ: false,
    authHeaders: { Authorization: `Bearer ${token}` },
    can: (perm) => me.permissions.includes(perm),
  };

  const tabs = TABS.filter(t => ctx.can(t.perm));
  // 📺 شاشة مطبخ: الاستقبال وحده بلا إدارة — عرضٌ لا تفاعل، فتُزال كلّ أدوات التنقّل
  const isKds = ctx.can('orders.receive') && !ctx.can('orders.manage') && tabs.length === 1;

  return (
    <VenueContext.Provider value={ctx}>
      <div className="min-h-screen" dir="rtl" style={{ background: EM.ink, color: EM.text }}>
        {/* ── الترويسة ── */}
        <header className="sticky top-0 z-40 backdrop-blur"
          style={{ background: `${EM.ink2}f2`, borderBottom: `1px solid ${EM.line}` }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ background: `linear-gradient(140deg, ${EM.warm}, ${EM.hot})` }}>🔥</span>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold truncate leading-tight">{loc?.name || 'كونسول المكان'}</h1>
              <p className="text-[10px] truncate" style={{ color: EM.faint }}>
                {me.displayName} • {isKds ? 'شاشة عرض' : 'حساب المكان'}
              </p>
            </div>
            {!isKds && (
              <button
                onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/admin/login'); }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${EM.line2}`, color: EM.dim }}
              >
                خروج
              </button>
            )}
          </div>

          {/* تبويبات سطح المكتب — تختفي إن كان تبويبٌ واحد فلا معنى لشريطٍ بخيارٍ وحيد */}
          {tabs.length > 1 && (
            <nav className="max-w-3xl mx-auto px-2 hidden sm:flex gap-0.5">
              {tabs.map(tab => {
                const active = pathname === tab.href;
                return (
                  <Link key={tab.href} href={tab.href}
                    className="px-3.5 py-2.5 text-xs font-bold transition-colors whitespace-nowrap"
                    style={{
                      color: active ? EM.warm : EM.dim,
                      borderBottom: `2px solid ${active ? EM.warm : 'transparent'}`,
                    }}
                  >
                    {tab.icon} {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        <main className={`max-w-3xl mx-auto px-4 py-5 ${tabs.length > 1 ? 'pb-24 sm:pb-8' : 'pb-8'}`}>
          {!loc ? (
            <div className="text-center py-16 text-sm" style={{ color: EM.faint }}>الحساب غير مرتبط بمكان</div>
          ) : (
            <>
              {/* 📲 هنا موضع التثبيت الصحيح: هذه الصفحة تحت /venue فتعلن manifest
                  الكونسول. الإضافة من صفحة الدخول (تحت الجذر) تُنتج تطبيق اللاعب. */}
              <InstallGuide app="venue" />
              {children}
            </>
          )}
        </main>

        {/* ── شريط سفليّ للجوال — أهداف لمسٍ كبيرة ليدٍ مستعجلة ── */}
        {loc && tabs.length > 1 && (
          <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl"
            style={{ background: `${EM.ink2}f5`, borderTop: `1px solid ${EM.line}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex">
              {tabs.map(tab => {
                const active = pathname === tab.href;
                return (
                  <Link key={tab.href} href={tab.href}
                    className="flex-1 flex flex-col items-center gap-0.5 py-2.5"
                    style={{ color: active ? EM.warm : EM.faint }}
                  >
                    <span className="text-xl leading-none">{tab.icon}</span>
                    <span className="text-[10px] font-bold">{tab.short || tab.label}</span>
                    <span className="h-0.5 w-8 rounded-full mt-0.5"
                      style={{ background: active ? EM.warm : 'transparent' }} />
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </VenueContext.Provider>
  );
}
