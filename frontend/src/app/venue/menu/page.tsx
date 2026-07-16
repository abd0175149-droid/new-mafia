'use client';

// ══════════════════════════════════════════════════════
// 🍽️ إدارة المنيو — /venue/menu
// أصناف المكان: إضافة/تعديل/حذف + إتاحة سريعة + صورة + حصّة النادي لكل صنف
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVenue } from '../context';

interface MenuItem {
  id: number;
  category: string;
  name: string;
  description: string;
  price: string;
  clubShare: string;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
}

const EMPTY_FORM = { name: '', category: '', description: '', price: '', clubShare: '', sortOrder: '0', imageUrl: '', isAvailable: true };

export default function VenueMenuPage() {
  const { locationId, locationName, authHeaders, can, isHQ } = useVenue();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // للأدمن تُمرَّر locationId صراحةً (تجاوز HQ في requireVenuePermission)
  const locParam = isHQ && locationId ? `locationId=${locationId}` : '';
  const withLoc = (url: string) => locParam ? `${url}${url.includes('?') ? '&' : '?'}${locParam}` : url;

  const load = useCallback(() => {
    if (!locationId) return;
    setLoading(true);
    fetch(withLoc('/api/venue/menu-items'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setItems(d.items); else setErr(d.error || 'فشل التحميل'); })
      .catch(() => setErr('خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const openAdd = () => { setForm({ ...EMPTY_FORM }); setEditId(null); setErr(''); setModal('add'); };
  const openEdit = (it: MenuItem) => {
    setForm({
      name: it.name, category: it.category || '', description: it.description || '',
      price: it.price, clubShare: it.clubShare || '0', sortOrder: String(it.sortOrder ?? 0),
      imageUrl: it.imageUrl || '', isAvailable: it.isAvailable,
    });
    setEditId(it.id); setErr(''); setModal('edit');
  };

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
    setSaving(true); setErr('');
    try {
      const url = modal === 'add' ? withLoc('/api/venue/menu-items') : withLoc(`/api/venue/menu-items/${editId}`);
      const r = await fetch(url, {
        method: modal === 'add' ? 'POST' : 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, price: parseFloat(form.price), clubShare: form.clubShare === '' ? 0 : parseFloat(form.clubShare), sortOrder: parseInt(form.sortOrder) || 0 }),
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
    return <div className="text-center py-16 text-gray-500 text-sm">ليس لدى حسابك صلاحيّة إدارة المنيو</div>;
  }

  // تجميع بالفئة
  const categories = Array.from(new Set(items.map(i => i.category || '')));
  const existingCats = categories.filter(Boolean);
  const availCount = items.filter(i => i.isAvailable).length;

  return (
    <div className="space-y-5">
      {/* ── شريط علويّ ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">منيو {locationName}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{items.length} صنفاً • {availCount} متاح • الأسعار بالدينار الأردنيّ</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-l from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform"
        >
          + صنف جديد
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-gray-700">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-gray-400 text-sm mb-1">المنيو فارغ</p>
          <p className="text-gray-600 text-xs">أضف أوّل صنف ليظهر للاعبين الحاجزين أثناء الفعاليّات</p>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat || '_none'}>
            <h3 className="text-xs font-bold text-emerald-400/80 mb-2 flex items-center gap-2">
              <span>{cat || 'بلا فئة'}</span>
              <span className="flex-1 h-px bg-emerald-500/10" />
            </h3>
            <div className="space-y-2">
              {items.filter(i => (i.category || '') === cat).map(it => (
                <div
                  key={it.id}
                  className={`rounded-xl p-3 flex items-center gap-3 border transition-opacity ${it.isAvailable ? 'bg-white/[0.03] border-white/[0.07]' : 'bg-white/[0.01] border-white/[0.04] opacity-50'}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shrink-0">
                    {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">🍴</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    {it.description && <p className="text-[10px] text-gray-500 truncate">{it.description}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-bold text-emerald-400">{parseFloat(it.price).toFixed(2)} د.أ</span>
                      {parseFloat(it.clubShare || '0') > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          حصّة النادي {parseFloat(it.clubShare).toFixed(2)}
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
            className="w-full max-w-md bg-gray-900 border border-emerald-500/20 rounded-2xl p-5 max-h-[88vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-4">{modal === 'add' ? '➕ صنف جديد' : '✏️ تعديل الصنف'}</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">اسم الصنف *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" placeholder="مثال: أرجيلة معسّل" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">الفئة</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} list="cat-list"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" placeholder="مشروبات ساخنة" />
                  <datalist id="cat-list">{existingCats.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">الترتيب داخل الفئة</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-400 mb-1">وصف قصير</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" placeholder="اختياريّ" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">السعر (د.أ) *</label>
                  <input type="number" step="0.05" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50" placeholder="3.50" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">حصّة النادي (د.أ)</label>
                  <input type="number" step="0.05" min="0" value={form.clubShare} onChange={e => setForm(f => ({ ...f, clubShare: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" placeholder="0 = لا حصّة" />
                  <p className="text-[9px] text-gray-600 mt-0.5">من كلّ وحدة تُباع — 0 إن لا حصّة</p>
                </div>
              </div>

              {/* صورة */}
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">صورة الصنف</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shrink-0">
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
                <span className="text-xs text-gray-300">متاح للطلب الآن</span>
              </label>

              {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">{err}</p>}

              <div className="flex gap-2 pt-2">
                <button onClick={save} disabled={saving || uploading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-emerald-500 to-teal-600 text-white disabled:opacity-50">
                  {saving ? '⏳ يحفظ…' : modal === 'add' ? 'إضافة الصنف' : 'حفظ التعديلات'}
                </button>
                <button onClick={() => setModal(null)} disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── توست ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 border border-emerald-500/30 rounded-xl px-4 py-2 text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
