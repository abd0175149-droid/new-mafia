'use client';

// ══════════════════════════════════════════════════════
// 🏪 كونسول المكان — /venue/* · «الجمرة» · إعادة البناء 2026-10-30 (الهاتف أوّلاً)
// حراسة: توكن موظّف + /api/venue/me (حساب مكانٍ مرتبط حصراً — الإدارة تُحوَّل).
// أربعة أقسام في شريطٍ سفليّ: الطلبات · التحصيل · الحساب · المنيو — كلٌّ بصلاحيّته.
// «المكان» (قواعد الفاتورة، الإشعارات، الصوت، الموقع، الخروج) ورقةٌ من زرّ الترويسة،
// فلا تتكدّس اللافتات فوق الطلبات.
// 🖥️ حسابٌ بصلاحيّة الاستقبال وحدها = شاشة مطبخ: بلا تبويبات ولا خروج.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { VenueContext, type VenueCtx, type VenueMe } from './context';
import { EM, TX, SHARE } from './ember';
import { Icon, Sheet, type IconName } from './ui';
import InstallGuide from '../../components/InstallGuide';

// ترتيبٌ حسب تواتر الاستخدام: الطلبات (كلّ دقيقة) ← التحصيل ← الحساب ← المنيو
const TABS: { href: string; icon: IconName; label: string; perm: string; badge?: 'orders' | 'due' }[] = [
  { href: '/venue/orders', icon: 'flame', label: 'الطلبات', perm: 'orders.receive', badge: 'orders' },
  { href: '/venue/invoices', icon: 'receipt', label: 'التحصيل', perm: 'invoices.print', badge: 'due' },
  { href: '/venue/revenue', icon: 'wallet', label: 'الحساب', perm: 'finance.view' },
  { href: '/venue/menu', icon: 'menu', label: 'المنيو', perm: 'menu.manage' },
];

/** الأقسام تطلب تحديث العدّادين بعد فعلٍ يغيّرهما (تحصيل، تسليم طلب…) */
export const refreshBadges = () => { try { window.dispatchEvent(new Event('venue:badges')); } catch { /* */ } };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(iv); }, []);
  const day = now.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'Asia/Amman' });
  const dm = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Amman' });
  const t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Amman' });
  return { day, dm, t };
}

export default function VenueShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<VenueMe | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [settings, setSettings] = useState(false);
  const [badges, setBadges] = useState({ openOrders: 0, dueCount: 0 });
  const [push, setPush] = useState<'on' | 'off' | 'busy'>('off');
  const [muted, setMuted] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const clock = useClock();

  // 🧠 السياق يُبنى مرّةً لكلّ (حساب، توكن): الساعة في الترويسة تعيد رسم الغلاف كلّ ٣٠ث،
  //    وسياقٌ جديدٌ في كلّ رسمٍ كان يعيد رسم كلّ صفحةٍ ويغيّر هويّة authHeaders فتُعاد طلباتها.
  const ctxMemo = useMemo<VenueCtx | null>(() => me ? {
    me,
    locationId: me.location?.id ?? null,
    locationName: me.location?.name || '',
    setLocation: () => { /* حساب المكان لا يبدّل مكانه */ },
    isHQ: false,
    authHeaders: { Authorization: `Bearer ${token}` },
    can: (perm: string) => me.permissions.includes(perm),
  } : null, [me, token]);

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

  // 🔔 حالة إشعارات هذا الجهاز + الصوت (المفتاح نفسه الذي تقرؤه شاشة الطلبات)
  useEffect(() => {
    const granted = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
    setPush(granted && localStorage.getItem('venue_push_registered') === '1' ? 'on' : 'off');
    setMuted(localStorage.getItem('venue_sound_muted') === '1');
    const onMute = () => setMuted(localStorage.getItem('venue_sound_muted') === '1');
    // شاشة الطلبات قد تفعّل الإشعارات بنفسها — الترويسة تتبعها بلا إعادة تحميل
    const onPush = () => setPush('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('venue_push_registered') === '1' ? 'on' : 'off');
    window.addEventListener('venue:sound', onMute);
    window.addEventListener('venue:push', onPush);
    return () => { window.removeEventListener('venue:sound', onMute); window.removeEventListener('venue:push', onPush); };
  }, []);

  // 🔢 عدّادا الشريط: كلّ ٣٠ث، وعند العودة للتبويب، وحين يطلبها قسمٌ بعد فعل
  const loadBadges = useCallback(() => {
    if (!token || !me?.location) return;
    fetch('/api/venue/badges', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) setBadges({ openOrders: d.openOrders, dueCount: d.dueCount }); })
      .catch(() => {});
  }, [token, me]);
  useEffect(() => {
    loadBadges();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') loadBadges(); }, 30_000);
    window.addEventListener('venue:badges', loadBadges);
    document.addEventListener('visibilitychange', loadBadges);
    return () => { clearInterval(iv); window.removeEventListener('venue:badges', loadBadges); document.removeEventListener('visibilitychange', loadBadges); };
  }, [loadBadges, pathname]);

  const enablePush = async () => {
    setPush('busy'); setPushMsg('');
    try {
      const { requestNotificationPermission } = await import('@/lib/firebase');
      const tk = await requestNotificationPermission();
      if (!tk) { setPush('off'); setPushMsg('لم يُمنح إذن الإشعارات — اسمح بها من إعدادات المتصفّح'); return; }
      const r = await fetch('/api/staff-notifications/register-token', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tk, deviceInfo: 'venue-console' }),
      }).then(x => x.json());
      if (r.success) { localStorage.setItem('venue_push_registered', '1'); window.dispatchEvent(new Event('venue:push')); setPush('on'); setPushMsg('ستصلك الطلبات الجديدة كإشعارات'); }
      else { setPush('off'); setPushMsg('فشل تسجيل الجهاز — حاول مرّةً أخرى'); }
    } catch { setPush('off'); setPushMsg('فشل تفعيل الإشعارات'); }
  };
  const toggleMute = () => {
    const next = !muted;
    localStorage.setItem('venue_sound_muted', next ? '1' : '0');
    setMuted(next);
    window.dispatchEvent(new Event('venue:sound'));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: EM.ink }} dir="rtl">
        <div className="w-10 h-10 rounded-full animate-spin" style={{ border: `2px solid ${EM.line2}`, borderTopColor: EM.warm }} />
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: EM.ink, color: EM.text }} dir="rtl">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: EM.card, border: `1px solid ${EM.line2}` }}>
            <Icon name="warn" size={26} color={TX.bad} />
          </div>
          <p className="text-[15px] mb-4" style={{ color: TX.bad }}>{error || 'غير مصرّح'}</p>
          <Link href="/admin/login" className="text-[15px] underline underline-offset-4" style={{ color: TX.amberHi }}>تسجيل الدخول</Link>
        </div>
      </div>
    );
  }

  const loc = me.location;
  const rules = loc?.rules;
  const ctx = ctxMemo!;

  const tabs = TABS.filter(t => ctx.can(t.perm));
  // 📺 شاشة مطبخ: الاستقبال وحده بلا إدارة — عرضٌ لا تفاعل، فتُزال كلّ أدوات التنقّل
  const isKds = ctx.can('orders.receive') && !ctx.can('orders.manage') && tabs.length === 1;
  const wide = pathname === '/venue/orders';   // سكّة الطلبات تتّسع لعمودين على الشاشة الكبيرة
  const badgeOf = (b?: 'orders' | 'due') => b === 'orders' ? badges.openOrders : b === 'due' ? badges.dueCount : 0;
  const pushOk = push === 'on';

  const row = (label: string, value: React.ReactNode, last = false) => (
    <div className="flex justify-between items-center gap-3 px-3.5 py-3 text-[14px]" style={{ borderBottom: last ? 'none' : '1px solid #1F2622' }}>
      <span>{label}</span><span className="font-bold text-left">{value}</span>
    </div>
  );
  const dot = (on: boolean) => <span className="inline-block w-[7px] h-[7px] rounded-full ml-1.5" style={{ background: on ? EM.go : TX.amberHi }} />;

  return (
    <VenueContext.Provider value={ctx}>
      <div className="vc-root min-h-screen" dir="rtl" style={{ background: EM.ink, color: EM.text }}>
        {/* ── الترويسة ── */}
        <header className="sticky top-0 z-40" style={{ background: EM.ink2, borderBottom: `1px solid ${EM.line}`, paddingTop: 'env(safe-area-inset-top)' }}>
          <div className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 py-3 flex items-center gap-3`}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: SHARE.venue }}>
              <Icon name="flame" size={22} stroke={2} color="#1A1208" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[17px] font-extrabold truncate leading-tight">{loc?.name || 'كونسول المكان'}</h1>
              <p className="text-[12.5px] whitespace-nowrap mt-0.5" style={{ color: TX.dim }}>
                {clock.day} <span className="vc-num">{clock.dm}</span> · <span className="vc-num">{clock.t}</span>
              </p>
            </div>
            {!isKds && (
              <>
                <button type="button" onClick={() => setSettings(true)} className="vc-press h-8 px-2.5 rounded-full flex items-center gap-1.5 text-[12.5px] font-bold whitespace-nowrap"
                  style={pushOk
                    ? { background: 'rgba(37,192,138,.10)', border: '1px solid rgba(37,192,138,.28)', color: TX.good }
                    : { background: 'rgba(240,197,140,.10)', border: '1px solid rgba(240,197,140,.35)', color: TX.amber }}>
                  <span className="w-[7px] h-[7px] rounded-full" style={{ background: pushOk ? EM.go : TX.amberHi }} />
                  {pushOk ? 'مباشر' : 'الإشعارات مطفأة'}
                </button>
                <button type="button" aria-label="إعدادات المكان" onClick={() => setSettings(true)}
                  className="vc-press w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ border: `1px solid ${EM.line2}`, background: EM.card, color: '#C9D4CD' }}>
                  <Icon name="sliders" size={20} stroke={1.8} />
                </button>
              </>
            )}
          </div>

          {/* تبويبات الشاشة الكبيرة — على الهاتف الشريط السفليّ وحده */}
          {tabs.length > 1 && (
            <nav aria-label="أقسام الكونسول" className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-2 hidden md:flex gap-1`}>
              {tabs.map(tab => {
                const active = pathname === tab.href;
                const b = badgeOf(tab.badge);
                return (
                  <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
                    className="px-3.5 py-3 text-[14px] font-extrabold flex items-center gap-2 whitespace-nowrap"
                    style={{ color: active ? TX.amberHi : TX.dim, borderBottom: `2px solid ${active ? SHARE.venue : 'transparent'}` }}>
                    <Icon name={tab.icon} size={18} />{tab.label}
                    {b > 0 && <span className="vc-num min-w-[20px] h-5 px-1.5 rounded-full text-[11.5px] flex items-center justify-center"
                      style={{ background: tab.badge === 'orders' ? EM.hot : TX.amberHi, color: tab.badge === 'orders' ? '#fff' : '#1A1208' }}>{b}</span>}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        <main className={`${wide ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 pt-4 ${tabs.length > 1 ? 'pb-28 md:pb-10' : 'pb-10'}`}>
          {!loc ? (
            <div className="text-center py-16 text-[14px]" style={{ color: TX.dim }}>الحساب غير مرتبط بمكان</div>
          ) : (
            <>
              {/* 📲 هنا موضع التثبيت الصحيح: هذه الصفحة تحت /venue فتعلن manifest
                  الكونسول. الإضافة من صفحة الدخول (تحت الجذر) تُنتج تطبيق اللاعب. */}
              <InstallGuide app="venue" />
              {children}
            </>
          )}
        </main>

        {/* ── الشريط السفليّ للهاتف — أهداف لمسٍ كاملة العرض ليدٍ مستعجلة ── */}
        {loc && tabs.length > 1 && (
          <nav aria-label="أقسام الكونسول" className="md:hidden fixed bottom-0 inset-x-0 z-40"
            style={{ background: EM.ink2, borderTop: `1px solid ${EM.line}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map(tab => {
                const active = pathname === tab.href;
                const b = badgeOf(tab.badge);
                return (
                  <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
                    className="vc-press relative flex flex-col items-center justify-center gap-1 h-[66px] text-[12.5px] font-extrabold"
                    style={{ color: active ? TX.amberHi : '#8E9C95' }}>
                    <span className="absolute top-0 w-7 h-[3px] rounded-b" style={{ background: active ? SHARE.venue : 'transparent' }} />
                    <span className="relative block w-[22px] h-[22px]">
                      <Icon name={tab.icon} size={22} />
                      {b > 0 && (
                        <span className="vc-num absolute -top-[7px] -left-[13px] min-w-[18px] h-[18px] px-[5px] rounded-full text-[11px] flex items-center justify-center"
                          aria-label={tab.badge === 'orders' ? `${b} طلبات مفتوحة` : `${b} لم يُحصَّل`}
                          style={{ background: tab.badge === 'orders' ? EM.hot : TX.amberHi, color: tab.badge === 'orders' ? '#fff' : '#1A1208', boxShadow: `0 0 0 2px ${EM.ink2}` }}>
                          {b}
                        </span>
                      )}
                    </span>
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {/* ── ورقة «المكان» ── */}
        <Sheet open={settings} onClose={() => setSettings(false)} title="المكان" subtitle="قواعد الفاتورة تضبطها الإدارة — هنا للاطّلاع">
          <div className="mt-3 rounded-[14px] overflow-hidden" style={{ background: EM.ink2, border: `1px solid ${EM.line}` }}>
            {row('حدّ أدنى للاستهلاك', rules?.minChargeEnabled
              ? <><span className="vc-num">{(rules.minimumCharge ?? 0).toFixed(2)}</span> لكلّ من لعب</>
              : <span style={{ color: TX.dim }}>مطفأ</span>)}
            {row('ماء تلقائيّ على الفاتورة', rules?.autoWater ? 'مفعَّل' : <span style={{ color: TX.dim }}>مطفأ</span>)}
            {row('دخوليّة اللعبة', <span style={{ color: TX.sub }}>تُضبط لكلّ ليلة</span>, true)}
          </div>

          <div className="mt-2.5 rounded-[14px] overflow-hidden" style={{ background: EM.ink2, border: `1px solid ${EM.line}` }}>
            <div className="flex justify-between items-center gap-3 px-3.5 py-2.5 text-[14px]" style={{ borderBottom: '1px solid #1F2622' }}>
              <span className="flex items-center gap-2"><Icon name={pushOk ? 'bell' : 'bellOff'} size={18} color={pushOk ? TX.good : TX.amber} />إشعارات الطلبات على هذا الجهاز</span>
              {pushOk
                ? <span className="font-bold" style={{ color: TX.good }}>{dot(true)}تعمل</span>
                : <button type="button" onClick={enablePush} disabled={push === 'busy'} className="vc-press h-10 px-3.5 rounded-[10px] font-extrabold text-[13.5px]"
                    style={{ background: SHARE.venue, color: '#1A1208' }}>{push === 'busy' ? 'جارٍ…' : 'فعّلها'}</button>}
            </div>
            <div className="flex justify-between items-center gap-3 px-3.5 py-2.5 text-[14px]" style={{ borderBottom: ctx.can('location.geofence') ? '1px solid #1F2622' : 'none' }}>
              <span className="flex items-center gap-2"><Icon name={muted ? 'mute' : 'sound'} size={18} color={muted ? TX.amber : TX.good} />صوت تنبيه الطلبات</span>
              <button type="button" onClick={toggleMute} className="vc-press h-10 px-3.5 rounded-[10px] font-extrabold text-[13.5px]"
                style={{ border: `1px solid ${EM.line2}`, color: muted ? TX.amber : '#C9D4CD' }}>{muted ? 'مكتوم — شغّله' : 'يعمل — اكتمه'}</button>
            </div>
            {ctx.can('location.geofence') && (
              <Link href="/venue/location" onClick={() => setSettings(false)}
                className="flex justify-between items-center gap-3 px-3.5 py-3 text-[14px]">
                <span className="flex items-center gap-2"><Icon name="pin" size={18} color={rules?.geofenceSet ? TX.good : TX.amber} />موقع المكان على الخريطة</span>
                <span className="flex items-center gap-1.5 font-bold" style={{ color: rules?.geofenceSet ? TX.good : TX.amber }}>
                  {rules?.geofenceSet ? <>مضبوط{rules.geofenceRadiusM ? <> · <span className="vc-num">{rules.geofenceRadiusM}</span> م</> : null}</> : 'لم يُضبط'}
                  <Icon name="chevron" size={16} color={TX.dim} />
                </span>
              </Link>
            )}
          </div>
          {pushMsg && <p className="mt-2 text-[13px]" style={{ color: pushOk ? TX.good : TX.amber }}>{pushMsg}</p>}
          {!pushOk && typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && (
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: TX.dim }}>على الآيفون: أضف الكونسول إلى الشاشة الرئيسيّة أوّلاً من زرّ المشاركة، ثمّ افتحه من هناك وفعّل الإشعارات.</p>
          )}

          <p className="mt-3 text-[12.5px]" style={{ color: TX.dim }}>{me.displayName} · حساب المكان</p>
          <button type="button" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.push('/admin/login'); }}
            className="vc-press mt-2 w-full h-12 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2"
            style={{ border: `1px solid ${EM.line2}`, color: '#C9D4CD' }}>
            <Icon name="logout" size={18} />تسجيل الخروج
          </button>
        </Sheet>
      </div>
    </VenueContext.Provider>
  );
}
