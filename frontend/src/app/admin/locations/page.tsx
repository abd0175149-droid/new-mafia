'use client';

// ══════════════════════════════════════════════════════
// 📍 أماكن الفعاليات — /admin/locations
// 🎯 توحيد 2026-08-06: أُلغي محرّر «عروض المكان» — الكتالوج الوحيد هو منيو المكان
// (أصنافٌ مفردة + باقات) ويُدار من /venue/menu. locations.offers محفوظ للقراءة فقط
// كي تُكمل الفعاليّات المفتوحة عليه دورتها.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { swalConfirm } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const PAGE_SIZE = 6;

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// توحيد شكل العروض القديمة للعرض فقط (بياناتٌ مؤرشفة — لا تُنشأ ولا تُعدَّل)
function normalizeOffer(o: any, index: number): any {
  if (typeof o === 'string') return { id: `legacy-${index}`, description: o, price: 0, clubShare: 0, venueShare: 0 };
  return {
    id: o.id || `offer-${index}`,
    description: o.description || '',
    price: o.price || 0,
    clubShare: o.clubShare ?? o.price ?? 0,
    venueShare: o.venueShare ?? 0,
  };
}


export default function LocationsPage() {
  // ── Data ──
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(1);

  // ── Dialog ──
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<any | null>(null);

  // ── Form fields ──
  const [name, setName] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [region, setRegion] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isTestLocation, setIsTestLocation] = useState(false);
  // 🧪 استعارة منيو — معرّف المكان المصدر كسلسلة ('' = بلا استعارة)
  const [menuSource, setMenuSource] = useState('');
  // 💳 الحدّ الأدنى للاستهلاك — لمن لعب جولةً على الأقلّ في الفعاليّة
  const [minChargeEnabled, setMinChargeEnabled] = useState(false);
  const [minimumCharge, setMinimumCharge] = useState('2.00');
  // 💧 ماء تلقائيّ لكلّ فاتورة
  const [autoWater, setAutoWater] = useState(false);
  const [ownerUsername, setOwnerUsername] = useState('');
  const [offers, setOffers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Owner account dialog ──
  const [ownerAccount, setOwnerAccount] = useState<{ username: string; password: string } | null>(null);

  // ── 🍽️ الحسابات المرتبطة بالمكان ──
  const [accountsFor, setAccountsFor] = useState<any | null>(null); // المكان المفتوح
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [loadingAccts, setLoadingAccts] = useState(false);
  const [newAcctUsername, setNewAcctUsername] = useState('');
  const [newAcctName, setNewAcctName] = useState('');
  const [newAcctPerms, setNewAcctPerms] = useState<string[]>(['orders.receive']);
  const [creatingAcct, setCreatingAcct] = useState(false);
  const [createdAcct, setCreatedAcct] = useState<{ username: string; password: string } | null>(null);
  const VENUE_PERMS = [
    { id: 'orders.receive', label: '📥 استقبال الطلبات' },
    { id: 'orders.manage', label: '🔁 إدارة الطلبات' },
    { id: 'invoices.print', label: '🧾 طباعة الفواتير' },
    { id: 'menu.manage', label: '📋 إدارة المنيو' },
    { id: 'payments.record', label: '💵 تسجيل التحصيل' },
    { id: 'service.shisha', label: '💨 خدمة الأرجيلة (فحم/تزبيط)' },
  ];

  // 👥 مجموعات صلاحيات جاهزة — أنواع موظّفي المكان (الدور واحد: location_owner)
  const PERM_PRESETS = [
    { key: 'owner', label: '👑 صاحب المكان', perms: ['orders.receive', 'orders.manage', 'invoices.print', 'menu.manage', 'payments.record', 'service.shisha'] },
    { key: 'cashier', label: '💵 كاشير', perms: ['invoices.print', 'payments.record'] },
    { key: 'prep', label: '👨‍🍳 موظّف تحضير', perms: ['orders.receive', 'orders.manage', 'service.shisha'] },
    { key: 'kds', label: '📺 شاشة مطبخ', perms: ['orders.receive'] },
    { key: 'menu', label: '📋 مسؤول المنيو', perms: ['menu.manage'] },
  ];

  async function openAccounts(loc: any) {
    setAccountsFor(loc); setAccountsList([]); setCreatedAcct(null);
    setNewAcctUsername(''); setNewAcctName(''); setNewAcctPerms(['orders.receive']);
    setLoadingAccts(true);
    try { const d = await apiFetch(`/api/locations/${loc.id}/staff`); setAccountsList(d.accounts || []); }
    catch (e) { console.error(e); }
    finally { setLoadingAccts(false); }
  }

  async function createLinkedAccount() {
    if (!accountsFor) return;
    setCreatingAcct(true);
    try {
      const d = await apiFetch(`/api/locations/${accountsFor.id}/staff`, {
        method: 'POST',
        body: JSON.stringify({ username: newAcctUsername.trim() || undefined, displayName: newAcctName.trim() || undefined, permissions: newAcctPerms }),
      });
      setCreatedAcct({ username: d.account.username, password: d.password });
      setAccountsList(prev => [...prev, d.account]);
      setNewAcctUsername(''); setNewAcctName('');
    } catch (e: any) { alert(e.message || 'فشل إنشاء الحساب'); }
    finally { setCreatingAcct(false); }
  }

  // ══ Fetch ══
  async function fetchLocations() {
    try { setLocations(await apiFetch('/api/locations')); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }
  useEffect(() => { fetchLocations(); }, []);

  // ══ Pagination ══
  const totalPages = Math.ceil(locations.length / PAGE_SIZE) || 1;
  const paginatedData = locations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ══ Open New ══
  function handleOpenNew() {
    setEditingLoc(null);
    setName(''); setRegion(''); setMapUrl(''); setOffers([]); setOwnerUsername('');
    setIsActive(true); setIsTestLocation(false); setMenuSource('');
    setMinChargeEnabled(false); setMinimumCharge('2.00'); setAutoWater(false);
    setIsDialogOpen(true);
  }

  // ══ Open Edit ══
  function handleOpenEdit(loc: any) {
    setEditingLoc(loc);
    setName(loc.name || '');
    setRegion(loc.region || '');
    setIsActive(loc.isActive !== false);
    setIsTestLocation(loc.isTestLocation === true);
    setMenuSource(loc.menuSourceLocationId ? String(loc.menuSourceLocationId) : '');
    setMinChargeEnabled(loc.minChargeEnabled === true);
    setMinimumCharge(loc.minimumCharge ? String(parseFloat(loc.minimumCharge)) : '2.00');
    setAutoWater(loc.autoWater === true);
    setMapUrl(loc.mapUrl || '');
    const parsed = (loc.offers || []).map((o: any, i: number) => normalizeOffer(o, i));
    setOffers(parsed);
    setIsDialogOpen(true);
  }

  // ══ Save ══
  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    // 🔴 `offers` لا يُرسَل إطلاقاً: normalizeOffer عرضٌ فقط وهو **فاقد** — يُسقط
    // اسم العرض ويُصفّر سعر العروض النصّيّة القديمة. إعادة إرساله كانت تجعل
    // تغيير اسم المكان يُتلف الأرشيف ويُعطّل بوّابة سعر التذكرة في اللوبي.
    const payload = {
      name: name.trim(), region: region.trim(), mapUrl, isActive, isTestLocation,
      // الاستعارة تُرسَل null عند الفكّ أو حين لا يكون الموقع اختباريّاً
      menuSourceLocationId: isTestLocation && menuSource ? parseInt(menuSource) : null,
      // 💳 الحدّ الأدنى: تفعيلٌ ومبلغ — التحقّق النهائيّ في الخادم
      minChargeEnabled,
      minimumCharge: parseFloat(minimumCharge) >= 0 ? parseFloat(minimumCharge) : 2,
      autoWater,
      ownerUsername: ownerUsername.trim() || undefined,
    };

    try {
      if (editingLoc) {
        await apiFetch(`/api/locations/${editingLoc.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const result = await apiFetch('/api/locations', { method: 'POST', body: JSON.stringify(payload) });
        if (result?.ownerAccount) {
          setOwnerAccount(result.ownerAccount);
        }
      }
      setIsDialogOpen(false);
      await fetchLocations();
    } catch (err: any) {
      alert('فشل الحفظ: ' + (err.message || 'خطأ في الاتصال بالسيرفر'));
    } finally { setSaving(false); }
  }

  // ══ Delete ══
  async function handleDelete(id: number) {
    if (!(await swalConfirm('هل تريد حذف هذا المكان؟'))) return;
    try {
      await apiFetch(`/api/locations/${id}`, { method: 'DELETE' });
      await fetchLocations();
    } catch (err: any) {
      alert('فشل الحذف: ' + (err.message || 'خطأ في الاتصال بالسيرفر'));
    }
  }

  // ══ Loading ══
  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6" dir="rtl">

      {/* ══ HEADER ══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📍 أماكن الفعاليات</h1>
          <p className="text-gray-400 text-sm mt-1">أضف القهاوي والكافيهات التي تقام بها الفعاليات وحساباتها — الأسعار والباقات تُدار من منيو كلّ مكان</p>
        </div>
        <button onClick={handleOpenNew} className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition">
          + إضافة مكان جديد
        </button>
      </div>

      {/* ══ CARDS GRID ══ */}
      {paginatedData.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-700/30 rounded-2xl">
          <span className="text-4xl block mb-3 opacity-30">📍</span>
          <p className="text-gray-500 font-medium">لا توجد أماكن مضافة بعد</p>
          <p className="text-gray-600 text-sm mt-1">أضف مكاناً ليُنشأ له حساب ومنيو خاصّ به</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedData.map((loc: any) => {
            const locOffers = (loc.offers || []).map((o: any, i: number) => normalizeOffer(o, i));
            return (
              <motion.div
                key={loc.id}
                id={`glow-location-${loc.id}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden hover:border-gray-600/50 transition group"
              >
                {/* Header */}
                <div className="p-4 pb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white truncate">{loc.name}</h3>
                    {loc.region && <p className="text-[11px] text-gray-500">📍 {loc.region}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openAccounts(loc)} className="p-1.5 rounded-lg text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 transition" title="الحسابات المرتبطة">👥</button>
                    <button onClick={() => handleOpenEdit(loc)} className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition" title="تعديل">✏️</button>
                    <button onClick={() => handleDelete(loc.id)} className="p-1.5 rounded-lg text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/10 transition" title="حذف">🗑️</button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-4 pb-4 space-y-3">
                  {/* Map link */}
                  {loc.mapUrl ? (
                    <a href={loc.mapUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      🔗 عرض الموقع على الخريطة
                    </a>
                  ) : (
                    <p className="text-xs text-gray-600">📍 لا يوجد رابط للخريطة</p>
                  )}

                  {/* 🍽️ إدارة المكان من لوحة الإدارة مباشرةً — بلا دخول كونسول المكان */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <a href={`/admin/venues/menu?locationId=${loc.id}`}
                      className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-lg p-2 text-center hover:border-emerald-500/40 transition">
                      <p className="text-base leading-none mb-1">🍽️</p>
                      <p className="text-[10px] font-bold text-emerald-400">المنيو</p>
                    </a>
                    <a href={`/admin/venues/orders?locationId=${loc.id}`}
                      className="bg-blue-500/[0.06] border border-blue-500/20 rounded-lg p-2 text-center hover:border-blue-500/40 transition">
                      <p className="text-base leading-none mb-1">📥</p>
                      <p className="text-[10px] font-bold text-blue-400">الطلبات</p>
                    </a>
                    <a href={`/admin/venues/invoices?locationId=${loc.id}`}
                      className="bg-amber-500/[0.06] border border-amber-500/20 rounded-lg p-2 text-center hover:border-amber-500/40 transition">
                      <p className="text-base leading-none mb-1">🧾</p>
                      <p className="text-[10px] font-bold text-amber-400">الفواتير</p>
                    </a>
                    <a href={`/admin/venues/revenue?locationId=${loc.id}`}
                      className="bg-violet-500/[0.06] border border-violet-500/20 rounded-lg p-2 text-center hover:border-violet-500/40 transition">
                      <p className="text-base leading-none mb-1">💰</p>
                      <p className="text-[10px] font-bold text-violet-400">الدخل</p>
                    </a>
                  </div>

                  {/* 🗄️ عروض قديمة مؤرشفة: تخدم الفعاليّات المفتوحة فقط ولا تُنشأ جديداً */}
                  {locOffers.length > 0 && (
                    <div className="border border-dashed border-gray-700/40 rounded-lg p-2.5">
                      <p className="text-[10px] text-gray-500 font-bold mb-1">🗄️ عروض حجزٍ قديمة ({locOffers.length}) — مؤرشفة</p>
                      <p className="text-[10px] text-gray-600 leading-relaxed">
                        {locOffers.map((o: any) => o.description).filter(Boolean).join(' • ') || 'بلا وصف'}
                      </p>
                      <p className="text-[9px] text-gray-600 mt-1">تخدم الفعاليّات المفتوحة عليها فقط — الجديد يُبنى كباقة في المنيو.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ══ PAGINATION ══ */}
      {locations.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">◄</button>
          <span className="text-sm text-gray-400">صفحة {currentPage} من {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm disabled:opacity-30">►</button>
        </div>
      )}

      {/* ══ ADD/EDIT DIALOG ══ */}
      <AnimatePresence>
        {isDialogOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setIsDialogOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-[600px] space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{editingLoc ? 'تعديل بيانات المكان' : 'إضافة مكان جديد'}</h3>
                <button onClick={() => setIsDialogOpen(false)} className="text-gray-500 hover:text-white transition">✕</button>
              </div>

              {/* اسم المكان */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">اسم المكان (الكافيه / القهوة) <span className="text-rose-400">*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: The Coffee Bean" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              </div>

              {/* اسم المستخدم — فقط عند الإضافة */}
              {!editingLoc && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">اسم المستخدم لحساب صاحب المكان (اختياري)</label>
                  <input type="text" value={ownerUsername} onChange={e => setOwnerUsername(e.target.value)} placeholder="مثال: coffebean" dir="ltr" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                </div>
              )}

              {/* رابط الخريطة */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">المنطقة (الشميساني، عبدون، …)</label>
                <input type="text" value={region} onChange={e => setRegion(e.target.value)} placeholder="مثال: الشميساني" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
                <p className="text-[10px] text-gray-500 mt-1">تظهر للاعب وتُذكر في رسالة تأكيد الحجز.</p>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">رابط جوجل ماب (اختياري)</label>
                <input type="text" value={mapUrl} onChange={e => setMapUrl(e.target.value)} placeholder="https://maps.google.com/..." dir="ltr" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600" />
              </div>

              {/* ── حالة المكان ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-700/30 cursor-pointer">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-500" />
                  <span>
                    <span className="block text-xs text-white font-bold">مكان فعّال</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">بوت واتساب يذكر الأماكن الفعّالة فقط</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-700/30 cursor-pointer">
                  <input type="checkbox" checked={isTestLocation} onChange={e => setIsTestLocation(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500" />
                  <span>
                    <span className="block text-xs text-white font-bold">مكان اختبار 🧪</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">فعاليّاته تظهر لحسابات الاختبار فقط</span>
                  </span>
                </label>
              </div>

              {/* ── 💳 الحدّ الأدنى للاستهلاك ── */}
              <div className="bg-sky-500/[0.06] border border-sky-500/25 rounded-xl p-4">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={minChargeEnabled} onChange={e => setMinChargeEnabled(e.target.checked)} className="mt-0.5 w-4 h-4 accent-sky-500" />
                  <span className="flex-1">
                    <span className="block text-xs text-white font-bold">💳 حدّ أدنى للاستهلاك</span>
                    <span className="block text-[10.5px] text-gray-500 mt-0.5 leading-relaxed">
                      يسري على كلّ لاعبٍ لعب جولةً واحدة على الأقلّ: من لم يطلب — أو طلب أقلّ من الحدّ —
                      تُكمَّل فاتورته إليه. رسوم اللعبة خارج الحساب وتُضاف فوقه.
                    </span>
                  </span>
                </label>
                {minChargeEnabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <input type="number" min="0" step="0.25" value={minimumCharge}
                      onChange={e => setMinimumCharge(e.target.value)} dir="ltr"
                      className="w-28 px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-sky-500/30" />
                    <span className="text-xs text-gray-400">د.أ لكلّ لاعب</span>
                  </div>
                )}
                <label className="flex items-start gap-2.5 cursor-pointer mt-3 pt-3 border-t border-sky-500/15">
                  <input type="checkbox" checked={autoWater} onChange={e => setAutoWater(e.target.checked)} className="mt-0.5 w-4 h-4 accent-sky-500" />
                  <span className="flex-1">
                    <span className="block text-xs text-white font-bold">💧 ماء تلقائيّ لكلّ فاتورة</span>
                    <span className="block text-[10.5px] text-gray-500 mt-0.5 leading-relaxed">
                      ماءٌ واحد بسعر صنف «مياه/ماء» في المنيو يُضاف لكلّ لاعبٍ لعب جولة —
                      إلا من طلب ماءً بنفسه أو عرضاً يحويه. يُحتسب ضمن استهلاك الحدّ الأدنى.
                    </span>
                  </span>
                </label>
              </div>

              {/* ── 🧪 استعارة منيو — لمواقع الاختبار حصراً ── */}
              {isTestLocation && (
                <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-xl p-4">
                  <label className="block text-xs font-bold text-amber-400 mb-1">🍽️ اختبار منيو مكانٍ آخر</label>
                  <p className="text-[10.5px] text-gray-500 leading-relaxed mb-2.5">
                    فعاليّات هذا الموقع تعرض المنيو المختار للاعبين وتُسعّر منه — والطلبات تبقى
                    معزولةً هنا فلا تصل موظّفي المكان الحقيقيّ ولا تدخل حساباته.
                  </p>
                  <select
                    value={menuSource}
                    onChange={e => setMenuSource(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                  >
                    <option value="">منيو هذا الموقع نفسه (بلا استعارة)</option>
                    {locations.filter(l => l.id !== editingLoc?.id && !l.isTestLocation).map(l => (
                      <option key={l.id} value={l.id}>منيو {l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── 🍽️ الكتالوج: المنيو ── */}
              <div>
                <hr className="border-gray-700/30 mb-4" />
                <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-400 mb-1">🍽️ أسعار المكان تُدار من المنيو</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    الأصناف المفردة والباقات (العروض) وأسعارها وحصّة النادي — من «الأماكن والمنيو ← المنيو والباقات».
                    {editingLoc && <> افتح <a href={`/admin/venues/menu?locationId=${editingLoc.id}`} className="text-emerald-400 underline">منيو {editingLoc.name}</a>.</>}
                  </p>
                  {offers.length > 0 && (
                    <p className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-700/30">
                      🗄️ لهذا المكان {offers.length} عرض حجزٍ قديم محفوظ — يخدم الفعاليّات المفتوحة عليه ولا يُعدَّل بعد الآن.
                    </p>
                  )}
                </div>
              </div>

              {/* زر الحفظ */}
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition disabled:opacity-50 text-sm">
                  {saving ? 'جاري الحفظ...' : 'حفظ البيانات'}
                </button>
                <button onClick={() => setIsDialogOpen(false)} className="px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ OWNER ACCOUNT DIALOG ══ */}
      <AnimatePresence>
        {ownerAccount && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOwnerAccount(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-lg font-bold text-white">تم إنشاء حساب صاحب المكان</h3>

              <div className="space-y-3">
                <div className="bg-gray-900/50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">اسم المستخدم</p>
                  <p className="text-sm font-bold text-white font-mono" dir="ltr">{ownerAccount.username}</p>
                </div>
                <div className="bg-gray-900/50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">كلمة المرور</p>
                  <p className="text-sm font-bold text-amber-400 font-mono" dir="ltr">{ownerAccount.password}</p>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                يمكن لصاحب المكان تسجيل الدخول بهذه البيانات لمتابعة الأنشطة والحجوزات المرتبطة بمكانه
              </p>

              <button onClick={() => setOwnerAccount(null)} className="w-full py-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition text-sm font-bold">
                تم
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ 🍽️ LINKED ACCOUNTS DIALOG ══ */}
      <AnimatePresence>
        {accountsFor && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAccountsFor(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-[560px] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">👥 الحسابات المرتبطة — {accountsFor.name}</h3>
                <button onClick={() => setAccountsFor(null)} className="text-gray-500 hover:text-white transition">✕</button>
              </div>

              {loadingAccts ? (
                <div className="py-8 text-center"><div className="animate-spin h-7 w-7 border-4 border-sky-500 border-t-transparent rounded-full mx-auto" /></div>
              ) : (
                <>
                  {accountsList.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">لا حسابات مرتبطة بهذا المكان بعد</p>
                  ) : (
                    <div className="space-y-2">
                      {accountsList.map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3 bg-gray-900/40 border border-gray-700/30 rounded-xl p-3">
                          <div className="w-9 h-9 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center font-bold">{(a.displayName || '?')[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{a.displayName} <span className="text-[10px] text-gray-500 font-mono" dir="ltr">{a.username}</span>{a.isActive === false && <span className="text-[9px] text-rose-400 border border-rose-500/40 rounded px-1 mr-1.5">موقوف</span>}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(Array.isArray(a.permissions) ? a.permissions : []).filter((p: string) => p.includes('.')).map((p: string) => (
                                <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full border border-sky-500/30 text-sky-400">{VENUE_PERMS.find(v => v.id === p)?.label || p}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <hr className="border-gray-700/30" />
                  <p className="text-sm font-bold text-white">+ إضافة حساب مرتبط</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={newAcctName} onChange={e => setNewAcctName(e.target.value)} placeholder="الاسم الظاهر (مثل: موظّف البار)" className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm outline-none focus:ring-1 focus:ring-sky-500/30" />
                    <input type="text" value={newAcctUsername} onChange={e => setNewAcctUsername(e.target.value)} placeholder="اسم المستخدم (اختياريّ)" dir="ltr" className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm font-mono outline-none focus:ring-1 focus:ring-sky-500/30" />
                  </div>

                  {/* أنواع الموظّفين: اختصارٌ يملأ الصلاحيات — تبقى قابلةً للتعديل يدويّاً */}
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1.5">نوع الموظّف (يملأ الصلاحيات تلقائيّاً)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PERM_PRESETS.map(p => {
                        const on = p.perms.length === newAcctPerms.length && p.perms.every(x => newAcctPerms.includes(x));
                        return (
                          <button key={p.key} onClick={() => setNewAcctPerms([...p.perms])}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${on ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-gray-900/40 text-gray-400 border-gray-700/40 hover:border-gray-600'}`}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {VENUE_PERMS.map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer bg-gray-900/40 p-2 rounded-lg border border-gray-700/30">
                        <input type="checkbox" checked={newAcctPerms.includes(p.id)} onChange={() => setNewAcctPerms(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} className="accent-sky-500 w-4 h-4" />
                        <span className="text-xs text-gray-300">{p.label}</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={createLinkedAccount} disabled={creatingAcct} className="w-full py-2.5 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-xl hover:bg-sky-500/30 transition text-sm font-bold disabled:opacity-50">
                    {creatingAcct ? '⏳ جارٍ الإنشاء…' : 'إنشاء الحساب'}
                  </button>

                  {createdAcct && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
                      <p className="text-xs text-emerald-300 font-bold">✅ أُنشئ الحساب — احفظ كلمة المرور الآن، لن تظهر مرّة أخرى</p>
                      <p className="text-sm font-mono text-white" dir="ltr">{createdAcct.username}</p>
                      <p className="text-sm font-mono font-bold text-amber-400" dir="ltr">{createdAcct.password}</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
