'use client';

// ══════════════════════════════════════════════════════
// 🍽️ إدارة المنيو — /venue/menu
// أصناف المكان: إضافة/تعديل/حذف + إتاحة سريعة + صورة + حصّة النادي لكل صنف
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVenue } from '../context';
import CategoriesModal, { type MenuCategory } from './CategoriesModal';
import OptionGroupsModal, { type OptionGroup } from './OptionGroupsModal';
import ClubShareModal from './ClubShareModal';

interface BundleComponent { menuItemId: number; qty: number }

interface MenuItem {
  id: number;
  category: string;
  categoryId: number | null;
  name: string;
  description: string;
  price: string;
  clubShare: string;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  isBundle: boolean;
  bundleItems: BundleComponent[];
  optionGroupIds: number[];
}

const EMPTY_FORM = { name: '', category: '', categoryId: '', description: '', price: '', clubShare: '', sortOrder: '0', imageUrl: '', isAvailable: true };

// ══════════════════════════════════════════════════════
// 👁️ معاينة حيّة — نسخةٌ طبق الأصل من صفّ الصنف في /player/order
// ⚠️ أيّ تعديل على شكل الصفّ هناك يجب أن يُنقل هنا وإلّا كذبت المعاينة.
// تعمد استعمال نفس الفئات والأنماط السطريّة حرفيّاً لهذا السبب.
// ══════════════════════════════════════════════════════
function PlayerPreview({
  form, isBundle, components, priceNum,
}: {
  form: typeof EMPTY_FORM;
  isBundle: boolean;
  components: { name: string; qty: number }[];
  priceNum: number;
}) {
  const name = form.name.trim();
  const compsLine = components.map(c => `${c.name}${c.qty > 1 ? ` ×${c.qty}` : ''}`).join(' + ');

  return (
    // ⚠️ ألوان هذه البطاقة **ليست** من لوحة «الجمرة» عمداً: هي نسخةٌ من شاشة
    // اللاعب (زمرديّة) — لو صبغناها بألوان الكونسول لكذبت المعاينة.
    <div className="rounded-2xl border border-[#232B27]/60 p-3" style={{ background: 'rgba(3,7,5,0.6)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-[#8B9A92]">👁️ كما يراه اللاعب</p>
        <span className="text-[9px] text-[#5A6862]">تطبيق اللاعب</span>
      </div>

      {/* رأس الفئة — كما يبنيه اللاعب: الفئة الفارغة تُعرض «المنيو» */}
      <h3 className="text-xs font-bold text-emerald-400/80 mb-2 flex items-center gap-2">
        <span>{form.category.trim() || 'المنيو'}</span>
        <span className="flex-1 h-px bg-emerald-500/10" />
      </h3>

      {/* صفّ الصنف */}
      <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#1B211D] flex items-center justify-center shrink-0">
          {form.imageUrl ? <img src={form.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">🍴</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm truncate">
            {isBundle && <span className="text-[9px] px-1.5 py-0.5 rounded-md ml-1.5" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>🎁 عرض</span>}
            {name || <span className="text-[#5A6862]">اسم الصنف…</span>}
          </p>
          {isBundle && components.length > 0 ? (
            <p className="text-[10px] truncate" style={{ color: 'rgba(196,181,253,0.75)' }}>{compsLine}</p>
          ) : form.description.trim() ? (
            <p className="text-[#5A6862] text-[10px] truncate">{form.description.trim()}</p>
          ) : null}
          <p className="text-emerald-400 text-[11px] font-bold mt-0.5">{priceNum.toFixed(2)} د.أ</p>
        </div>
        <span className="px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
          + أضف
        </span>
      </div>

      {/* ملاحظات تشرح ما لا يظهر في الصفّ نفسه */}
      <div className="mt-2.5 space-y-1">
        {!form.isAvailable && (
          <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
            ⚠️ «متاح للطلب الآن» مغلق — لن يظهر هذا الصنف للاعبين إطلاقاً.
          </p>
        )}
        {isBundle && components.length === 0 && (
          <p className="text-[10px] text-violet-300/80">🎁 اختر مكوّنات الباقة لتظهر للاعب مكان الوصف.</p>
        )}
        {parseFloat(form.clubShare || '0') > 0 && (
          <p className="text-[10px] text-[#8B9A92]">
            🔒 حصّة النادي ({parseFloat(form.clubShare).toFixed(2)}) لا تصل تطبيق اللاعب — يرى السعر فقط.
          </p>
        )}
      </div>
    </div>
  );
}

export default function VenueMenuPage() {
  const { locationId, locationName, authHeaders, can, isHQ } = useVenue();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // 🎁 تركيبة الباقة — Map(menuItemId → qty). فارغةٌ = صنفٌ عاديّ.
  const [isBundle, setIsBundle] = useState(false);
  const [bundle, setBundle] = useState<Map<number, number>>(new Map());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 🗂️ الأقسام و⚙️ مجموعات الخيارات — تُدار من مودالَين مستقلَّين
  const [cats, setCats] = useState<MenuCategory[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [managerModal, setManagerModal] = useState<'cats' | 'groups' | 'share' | null>(null);
  // مجموعات الخيارات المربوطة بالصنف قيد التحرير
  const [linkedGroups, setLinkedGroups] = useState<Set<number>>(new Set());

  // للأدمن تُمرَّر locationId صراحةً (تجاوز HQ في requireVenuePermission)
  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;

  const load = useCallback(() => {
    if (!locationId) return;
    setLoading(true);
    Promise.all([
      fetch(withLoc('/api/venue/menu-items'), { headers: authHeaders }).then(r => r.json()),
      fetch(withLoc('/api/venue/categories'), { headers: authHeaders }).then(r => r.json()),
      fetch(withLoc('/api/venue/option-groups'), { headers: authHeaders }).then(r => r.json()),
    ])
      .then(([mi, ct, og]) => {
        if (mi.success) setItems(mi.items); else setErr(mi.error || 'فشل التحميل');
        if (ct.success) setCats(ct.categories);
        if (og.success) setGroups(og.groups);
      })
      .catch(() => setErr('خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  /// اسم القسم كاملاً للعرض: «مشروبات ← باردة»
  const catLabel = useCallback((id: number | null | undefined) => {
    if (!id) return '';
    const leaf = cats.find(c => c.id === id);
    if (!leaf) return '';
    const parent = leaf.parentId ? cats.find(c => c.id === leaf.parentId) : null;
    return parent ? `${parent.name} ← ${leaf.name}` : leaf.name;
  }, [cats]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM }); setIsBundle(false); setBundle(new Map()); setLinkedGroups(new Set());
    setEditId(null); setErr(''); setModal('add');
  };
  const openEdit = (it: MenuItem) => {
    setForm({
      name: it.name, category: it.category || '', categoryId: it.categoryId ? String(it.categoryId) : '',
      description: it.description || '',
      price: it.price, clubShare: it.clubShare || '0', sortOrder: String(it.sortOrder ?? 0),
      imageUrl: it.imageUrl || '', isAvailable: it.isAvailable,
    });
    setIsBundle(it.isBundle === true);
    setBundle(new Map((it.bundleItems || []).map(c => [c.menuItemId, c.qty])));
    setLinkedGroups(new Set(it.optionGroupIds || []));
    setEditId(it.id); setErr(''); setModal('edit');
  };

  // مكوّنات مرشَّحة: أصناف المكان العاديّة فقط (لا تعشيش باقات، ولا الصنف نفسه)
  const componentChoices = items.filter(i => !i.isBundle && i.id !== editId);
  const setComp = (id: number, qty: number) => setBundle(prev => {
    const next = new Map(prev);
    if (qty <= 0) next.delete(id); else next.set(id, Math.min(qty, 20));
    return next;
  });
  // مجموع المكوّنات بأسعارها المفردة — مرجعٌ استرشاديّ لبيان قيمة الخصم (لا يفرض السعر)
  const compsSum = Array.from(bundle.entries())
    .reduce((s, [id, q]) => s + (parseFloat(items.find(i => i.id === id)?.price || '0') * q), 0);

  const uploadImage = async (file: File) => {
    setUploading(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await fetch(withLoc('/api/venue/menu-items/upload-image'), { method: 'POST', headers: authHeaders, body: fd });
      const d = await r.json();
      if (d.success) setForm(f => ({ ...f, imageUrl: d.url }));
      else setErr(d.error || 'فشل رفع الصورة');
    } catch { setErr('فشل رفع الصورة'); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) { setErr('اسم الصنف مطلوب'); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { setErr('أدخل سعراً صالحاً'); return; }
    if (isBundle && bundle.size === 0) { setErr('اختر مكوّناً واحداً على الأقلّ للباقة'); return; }
    setSaving(true); setErr('');
    try {
      const url = modal === 'add' ? withLoc('/api/venue/menu-items') : withLoc(`/api/venue/menu-items/${editId}`);
      const r = await fetch(url, {
        method: modal === 'add' ? 'POST' : 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // لقطة اسم القسم تُرسل للتوافق، والمصدر الحقيقيّ categoryId
          category: catLabel(parseInt(form.categoryId) || null).split(' ← ').pop() || '',
          categoryId: form.categoryId ? parseInt(form.categoryId) : null,
          price: parseFloat(form.price),
          clubShare: form.clubShare === '' ? 0 : parseFloat(form.clubShare),
          sortOrder: parseInt(form.sortOrder) || 0,
          isBundle,
          bundleItems: isBundle ? Array.from(bundle.entries()).map(([menuItemId, qty]) => ({ menuItemId, qty })) : [],
          optionGroupIds: Array.from(linkedGroups),
        }),
      });
      const d = await r.json();
      if (d.success) { setModal(null); load(); flash(modal === 'add' ? '✅ أُضيف الصنف' : '✅ حُفظت التعديلات'); }
      else setErr(d.error || 'فشل الحفظ');
    } catch { setErr('خطأ في الاتصال'); }
    setSaving(false);
  };

  const toggleAvail = async (it: MenuItem) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, isAvailable: !it.isAvailable } : x));
    const r = await fetch(withLoc(`/api/venue/menu-items/${it.id}/availability`), {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: !it.isAvailable }),
    }).then(x => x.json()).catch(() => ({ success: false }));
    if (!r.success) { setItems(prev => prev.map(x => x.id === it.id ? { ...x, isAvailable: it.isAvailable } : x)); flash('❌ فشل التبديل'); }
  };

  const remove = async (it: MenuItem) => {
    if (!confirm(`حذف «${it.name}» من المنيو؟\nالطلبات السابقة تحتفظ ببياناتها.`)) return;
    const r = await fetch(withLoc(`/api/venue/menu-items/${it.id}`), { method: 'DELETE', headers: authHeaders }).then(x => x.json()).catch(() => ({ success: false }));
    if (r.success) { load(); flash('🗑️ حُذف الصنف'); } else flash('❌ فشل الحذف');
  };

  if (!can('menu.manage')) {
    return <div className="text-center py-16 text-[#8B9A92] text-sm">ليس لدى حسابك صلاحيّة إدارة المنيو</div>;
  }

  // تجميع بالفئة + بحث/تصفية (صفحة إعدادٍ تُزار نادراً لكن يجب أن يكون إيجاد الصنف فوريّاً)
  const allCategories = Array.from(new Set(items.map(i => i.category || '')));
  const existingCats = allCategories.filter(Boolean);
  const availCount = items.filter(i => i.isAvailable).length;

  const q = search.trim().toLowerCase();
  const visibleItems = items.filter(i =>
    (catFilter === null || (i.category || '') === catFilter) &&
    (!q || i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
  );
  const categories = Array.from(new Set(visibleItems.map(i => i.category || '')));

  return (
    <div className="space-y-4">
      {/* ── شريط علويّ ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">⚙️ إعدادات المنيو</h2>
          <p className="text-[11px] text-[#8B9A92] mt-0.5">
            {locationName} • {items.length} صنفاً ({availCount} متاح) • يُعدّ مرّةً ويظهر للاعبين في كلّ فعاليّة مفعَّلة
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setManagerModal('cats')} title="أقسام المنيو"
            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:border-[#D98A2B]/45 transition-colors">
            🗂️ الأقسام
          </button>
          <button onClick={() => setManagerModal('groups')} title="مجموعات الخيارات"
            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:border-amber-500/40 transition-colors">
            ⚙️ الخيارات
          </button>
          {/* 💰 الحصّة رقمُ عملٍ يتغيّر بالتفاوض — ضبطها صنفاً صنفاً عملٌ يُؤجَّل فلا يُنجَز */}
          <button onClick={() => setManagerModal('share')} title="حصّة النادي على دفعة أصناف"
            className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 hover:border-amber-500/40 transition-colors">
            💰 الحصّة
          </button>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-l from-[#D98A2B] to-[#C2751F] text-white shadow-lg shadow-black/40 active:scale-95 transition-transform"
          >
            + صنف جديد
          </button>
        </div>
      </div>

      {/* ── بحث + فئات ── */}
      {items.length > 0 && (
        <div className="space-y-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔎 ابحث باسم الصنف…"
            className="w-full bg-[#1B211D] border border-[#232B27] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#D98A2B]/50 placeholder:text-[#5A6862]"
          />
          {existingCats.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setCatFilter(null)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                  catFilter === null ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-[#8B9A92] border border-transparent'
                }`}
              >
                الكل ({items.length})
              </button>
              {allCategories.map(c => (
                <button
                  key={c || '_none'}
                  onClick={() => setCatFilter(prev => prev === c ? null : c)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                    catFilter === c ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-[#8B9A92] border border-transparent'
                  }`}
                >
                  {c || 'بلا فئة'} ({items.filter(i => (i.category || '') === c).length})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#2E3833] border-t-[#D98A2B] rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-[#232B27]">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-[#8B9A92] text-sm mb-1">المنيو فارغ</p>
          <p className="text-[#5A6862] text-xs">أضف أوّل صنف ليظهر للاعبين الحاجزين أثناء الفعاليّات</p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-[#232B27]">
          <p className="text-[#8B9A92] text-sm">لا نتائج لبحثك</p>
          <button onClick={() => { setSearch(''); setCatFilter(null); }} className="text-emerald-400 text-xs underline mt-2">مسح البحث والتصفية</button>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat || '_none'}>
            <h3 className="text-xs font-bold text-emerald-400/80 mb-2 flex items-center gap-2">
              <span>{cat || 'بلا فئة'}</span>
              <span className="flex-1 h-px bg-emerald-500/10" />
            </h3>
            <div className="space-y-2">
              {visibleItems.filter(i => (i.category || '') === cat).map(it => (
                <div
                  key={it.id}
                  className={`rounded-xl p-3 flex items-center gap-3 border transition-opacity ${it.isAvailable ? 'bg-white/[0.03] border-white/[0.07]' : 'bg-white/[0.01] border-white/[0.04] opacity-50'}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#1B211D] flex items-center justify-center shrink-0">
                    {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">🍴</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {it.isBundle && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/25 ml-1.5">🎁 باقة</span>}
                      {it.name}
                    </p>
                    {it.isBundle ? (
                      <p className="text-[10px] text-violet-300/70 truncate">
                        {(it.bundleItems || []).map(c => {
                          const comp = items.find(x => x.id === c.menuItemId);
                          return `${comp?.name || 'صنف محذوف'} ×${c.qty}`;
                        }).join(' + ') || 'بلا مكوّنات'}
                      </p>
                    ) : it.description ? (
                      <p className="text-[10px] text-[#8B9A92] truncate">{it.description}</p>
                    ) : null}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-bold text-emerald-400">{parseFloat(it.price).toFixed(2)} د.أ</span>
                      {parseFloat(it.clubShare || '0') > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          حصّة النادي {parseFloat(it.clubShare).toFixed(2)}
                        </span>
                      )}
                      {(it.optionGroupIds?.length ?? 0) > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20" title="مجموعات خيارات مربوطة">
                          ⚙️ {it.optionGroupIds.map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(' · ') || it.optionGroupIds.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* إتاحة */}
                  <button
                    onClick={() => toggleAvail(it)}
                    className={`w-10 h-5.5 rounded-full relative transition-colors shrink-0 ${it.isAvailable ? 'bg-emerald-500' : 'bg-gray-700'}`}
                    style={{ height: 22 }}
                    title={it.isAvailable ? 'متاح — اضغط للإخفاء' : 'مخفيّ — اضغط للإتاحة'}
                  >
                    <span className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-all ${it.isAvailable ? 'right-0.5' : 'right-[20px]'}`} />
                  </button>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => openEdit(it)} className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">✏️</button>
                    <button onClick={() => remove(it)} className="text-xs px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* ── مودال إضافة/تعديل ── */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModal(null)}>
          <div
            className="w-full max-w-md sm:max-w-2xl bg-[#161B18] border border-[#232B27] rounded-2xl p-5 max-h-[88vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-4">{modal === 'add' ? '➕ صنف جديد' : '✏️ تعديل الصنف'}</h3>

            {/* المعاينة ملتصقة في الحالتين: فوق الحقول على الجوّال، وعموداً يساراً على الشاشات الواسعة */}
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_280px] gap-4 sm:gap-5 sm:items-start">
            <div className="space-y-3 order-2 sm:order-1">
              {/* ── 🎁 نوع الصنف: مفرد أم باقة ── */}
              <div className="flex gap-2 p-1 rounded-xl bg-[#1B211D] border border-[#232B27]">
                <button
                  onClick={() => { setIsBundle(false); setBundle(new Map()); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${!isBundle ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-[#8B9A92] border border-transparent'}`}
                >
                  🍴 صنف مفرد
                </button>
                <button
                  onClick={() => setIsBundle(true)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${isBundle ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-[#8B9A92] border border-transparent'}`}
                >
                  🎁 باقة (عرض)
                </button>
              </div>

              <div>
                <label className="block text-[11px] text-[#8B9A92] mb-1">{isBundle ? 'اسم الباقة *' : 'اسم الصنف *'}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D98A2B]/50"
                  placeholder={isBundle ? 'مثال: عرض السهرة' : 'مثال: أرجيلة معسّل'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#8B9A92]">القسم</label>
                    <button onClick={() => setManagerModal('cats')} className="text-[10px] text-emerald-400">إدارة الأقسام ←</button>
                  </div>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D98A2B]/50">
                    <option value="">بلا قسم</option>
                    {cats.filter(c => !c.parentId).map(root => {
                      const kids = cats.filter(k => k.parentId === root.id);
                      return kids.length === 0
                        ? <option key={root.id} value={root.id}>{root.name}</option>
                        : (
                          <optgroup key={root.id} label={root.name}>
                            {kids.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                          </optgroup>
                        );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#8B9A92] mb-1">الترتيب داخل الفئة</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                    className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D98A2B]/50" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#8B9A92] mb-1">وصف قصير</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D98A2B]/50" placeholder="اختياريّ" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#8B9A92] mb-1">السعر (د.أ) *</label>
                  <input type="number" step="0.05" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D98A2B]/50" placeholder="3.50" />
                </div>
                <div>
                  <label className="block text-[11px] text-[#8B9A92] mb-1">حصّة النادي (د.أ)</label>
                  <input type="number" step="0.05" min="0" value={form.clubShare} onChange={e => setForm(f => ({ ...f, clubShare: e.target.value }))}
                    className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" placeholder="0 = لا حصّة" />
                  <p className="text-[9px] text-[#5A6862] mt-0.5">من كلّ وحدة تُباع — 0 إن لا حصّة</p>
                </div>
              </div>

              {/* ── 🎁 مكوّنات الباقة — أصنافٌ فعليّة تُطبع تفاصيلها في فاتورة اللاعب ── */}
              {isBundle && (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-violet-300">مكوّنات الباقة *</label>
                    {bundle.size > 0 && (
                      <span className="text-[9px] text-[#8B9A92]">
                        مجموع المكوّنات مفردةً {compsSum.toFixed(2)}
                        {parseFloat(form.price || '0') > 0 && compsSum > parseFloat(form.price) && (
                          <span className="text-emerald-400"> • خصم {(compsSum - parseFloat(form.price)).toFixed(2)}</span>
                        )}
                      </span>
                    )}
                  </div>

                  {componentChoices.length === 0 ? (
                    <p className="text-[11px] text-[#8B9A92] py-2">أضف أصنافاً مفردة أوّلاً لتتمكّن من تركيب باقة منها.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pl-1">
                      {componentChoices.map(c => {
                        const qty = bundle.get(c.id) || 0;
                        return (
                          <div key={c.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border transition-colors ${qty > 0 ? 'bg-violet-500/10 border-violet-500/30' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate">{c.name}</p>
                              <p className="text-[9px] text-[#8B9A92]">{parseFloat(c.price).toFixed(2)} د.أ{!c.isAvailable && ' • مخفيّ عن الطلب المباشر'}</p>
                            </div>
                            {qty === 0 ? (
                              <button onClick={() => setComp(c.id, 1)}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30">+ أضف</button>
                            ) : (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => setComp(c.id, qty - 1)} className="w-6 h-6 rounded-md bg-white/5 border border-white/10 text-sm leading-none">−</button>
                                <span className="text-xs font-bold w-4 text-center">{qty}</span>
                                <button onClick={() => setComp(c.id, qty + 1)} className="w-6 h-6 rounded-md bg-white/5 border border-white/10 text-sm leading-none">+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[9px] text-[#5A6862] mt-2">سعر الباقة وحصّتها يُدخلان يدويّاً أعلاه — المجموع أعلاه للاسترشاد فقط.</p>
                </div>
              )}

              {/* ── ⚙️ خيارات الصنف: نكهة/حجم/إضافات — مجموعاتٌ مشتركة تُربط بضغطة ── */}
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-amber-300">⚙️ خيارات يختارها اللاعب</label>
                  <button onClick={() => setManagerModal('groups')} className="text-[10px] text-amber-400">إدارة المجموعات ←</button>
                </div>
                {groups.length === 0 ? (
                  <p className="text-[11px] text-[#8B9A92] py-1">
                    لا مجموعات بعد — أنشئ «نكهة المعسل» أو «الحجم» مرّةً واربطها بكلّ الأصناف التي تحتاجها.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pl-1">
                    {groups.map(g => {
                      const on = linkedGroups.has(g.id);
                      return (
                        <label key={g.id}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border cursor-pointer transition-colors ${on ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                          <input type="checkbox" checked={on} className="w-3.5 h-3.5 accent-amber-500"
                            onChange={() => setLinkedGroups(prev => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                              return next;
                            })} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">
                              {g.name}
                              {g.isRequired && <span className="text-[9px] text-rose-400 mr-1.5">إلزاميّ</span>}
                            </p>
                            <p className="text-[9px] text-[#8B9A92] truncate">
                              {g.values.map(v => v.name).join(' · ')}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-[9px] text-[#5A6862] mt-2">فروق أسعار الخيارات تُضاف لسعر الصنف وتعود للمكان كاملةً.</p>
              </div>

              {/* صورة */}
              <div>
                <label className="block text-[11px] text-[#8B9A92] mb-1">صورة الصنف</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#1B211D] flex items-center justify-center shrink-0">
                    {form.imageUrl ? <img src={form.imageUrl} alt="" className="w-full h-full object-cover" /> : <span>🍴</span>}
                  </div>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50">
                    {uploading ? '⏳ يرفع…' : form.imageUrl ? 'تغيير الصورة' : '📷 رفع صورة'}
                  </button>
                  {form.imageUrl && (
                    <button onClick={() => setForm(f => ({ ...f, imageUrl: '' }))} className="text-xs text-rose-400">إزالة</button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input type="checkbox" checked={form.isAvailable} onChange={e => setForm(f => ({ ...f, isAvailable: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500" />
                <span className="text-xs text-[#E8EFEA]">متاح للطلب الآن</span>
              </label>

              {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">{err}</p>}

              <div className="flex gap-2 pt-2">
                <button onClick={save} disabled={saving || uploading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-[#D98A2B] to-[#C2751F] text-white disabled:opacity-50">
                  {saving ? '⏳ يحفظ…' : modal === 'add' ? 'إضافة الصنف' : 'حفظ التعديلات'}
                </button>
                <button onClick={() => setModal(null)} disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-[#8B9A92]">إلغاء</button>
              </div>
            </div>

            {/* ── 👁️ المعاينة الحيّة ── */}
            <div className="order-1 sm:order-2 sticky top-0 z-10 bg-[#161B18] pb-2 sm:pb-0">
              <PlayerPreview
                form={form}
                isBundle={isBundle}
                components={Array.from(bundle.entries()).map(([id, qty]) => ({
                  name: items.find(i => i.id === id)?.name || 'صنف محذوف',
                  qty,
                }))}
                priceNum={parseFloat(form.price) || 0}
              />
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ── مديرا الأقسام والخيارات ── */}
      {managerModal === 'cats' && (
        <CategoriesModal authHeaders={authHeaders} withLoc={withLoc}
          onClose={() => setManagerModal(null)} onChanged={load} />
      )}
      {managerModal === 'groups' && (
        <OptionGroupsModal authHeaders={authHeaders} withLoc={withLoc}
          onClose={() => setManagerModal(null)} onChanged={load} />
      )}
      {managerModal === 'share' && (
        <ClubShareModal
          items={items.map(i => ({ id: i.id, name: i.name, price: i.price, clubShare: i.clubShare || '0', categoryId: i.categoryId ?? null }))}
          cats={cats.map(c => ({ id: c.id, name: c.name, parentId: c.parentId ?? null }))}
          onClose={() => setManagerModal(null)}
          onApply={async (body) => {
            const r = await fetch(withLoc('/api/venue/menu-items/bulk-club-share'), {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || 'فشل التطبيق');
            flash(`💰 ضُبطت حصّة النادي على ${d.changed} صنفاً`);
            load();
          }}
        />
      )}

      {/* ── توست ── */}
      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#1B211D] border border-emerald-500/30 rounded-xl px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
