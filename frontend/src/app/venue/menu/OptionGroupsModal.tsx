'use client';

// ══════════════════════════════════════════════════════
// ⚙️ مجموعات الخيارات المشتركة — نكهات · أحجام · إضافات
// تُعرَّف مرّةً لكلّ مكان وتُربط بعدّة أصناف: «نكهات المعسل» بعشرين نكهة
// تُدخَل مرّةً وتخدم كلّ الأراجيل، وإضافة نكهة تعديلٌ في مكانٍ واحد.
// 💰 فرق السعر يعود للمكان كاملاً — حصّة النادي تبقى مبلغ الصنف الثابت.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

export interface OptionValue { id?: number; name: string; priceDelta: string }
export interface OptionGroup {
  id: number;
  name: string;
  selectionType: 'single' | 'multi';
  isRequired: boolean;
  maxSelect: number;
  sortOrder: number;
  values: OptionValue[];
}

const EMPTY: { name: string; selectionType: 'single' | 'multi'; isRequired: boolean; maxSelect: string; values: OptionValue[] } = {
  name: '', selectionType: 'single', isRequired: true, maxSelect: '1', values: [{ name: '', priceDelta: '0' }],
};

export default function OptionGroupsModal({
  authHeaders, withLoc, onClose, onChanged,
}: {
  authHeaders: Record<string, string>;
  withLoc: (url: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(withLoc('/api/venue/option-groups'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setGroups(d.groups); else setErr(d.error || 'فشل التحميل'); })
      .catch(() => setErr('خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ ...EMPTY, values: [{ name: '', priceDelta: '0' }] }); setEditId(null); setErr(''); setEditorOpen(true); };
  const openEdit = (g: OptionGroup) => {
    setForm({
      name: g.name, selectionType: g.selectionType, isRequired: g.isRequired,
      maxSelect: String(g.maxSelect ?? 1),
      values: g.values.map(v => ({ name: v.name, priceDelta: String(parseFloat(String(v.priceDelta)) || 0) })),
    });
    setEditId(g.id); setErr(''); setEditorOpen(true);
  };

  const setVal = (i: number, patch: Partial<OptionValue>) =>
    setForm(f => ({ ...f, values: f.values.map((v, ix) => ix === i ? { ...v, ...patch } : v) }));
  const addVal = () => setForm(f => ({ ...f, values: [...f.values, { name: '', priceDelta: '0' }] }));
  const delVal = (i: number) => setForm(f => ({ ...f, values: f.values.filter((_, ix) => ix !== i) }));

  const save = async () => {
    const values = form.values.filter(v => v.name.trim());
    if (!form.name.trim()) { setErr('اسم المجموعة مطلوب'); return; }
    if (values.length === 0) { setErr('أضف خياراً واحداً على الأقلّ'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch(withLoc(editId ? `/api/venue/option-groups/${editId}` : '/api/venue/option-groups'), {
        method: editId ? 'PUT' : 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          selectionType: form.selectionType,
          isRequired: form.isRequired,
          maxSelect: form.selectionType === 'multi' ? parseInt(form.maxSelect) || 1 : 1,
          sortOrder: editId ? undefined : groups.length,
          values: values.map(v => ({ name: v.name.trim(), priceDelta: parseFloat(v.priceDelta) || 0 })),
        }),
      });
      const d = await r.json();
      if (!d.success) { setErr(d.error || 'فشل الحفظ'); return; }
      setEditorOpen(false); load(); onChanged();
    } catch { setErr('خطأ في الاتصال'); }
    finally { setBusy(false); }
  };

  const remove = async (g: OptionGroup) => {
    if (!confirm(`حذف مجموعة «${g.name}»؟`)) return;
    setBusy(true); setErr('');
    try {
      const d = await fetch(withLoc(`/api/venue/option-groups/${g.id}`), { method: 'DELETE', headers: authHeaders }).then(r => r.json());
      if (!d.success) { setErr(d.error || 'فشل الحذف'); return; }
      load(); onChanged();
    } catch { setErr('خطأ في الاتصال'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#161B18] border border-[#2E3833] border-b-0 rounded-t-3xl p-5 overflow-y-auto relative" style={{ height: '90%', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-11 h-1 rounded-full bg-[#2E3833]" />
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold">⚙️ مجموعات الخيارات</h3>
          <button onClick={onClose} className="text-[#8B9A92] hover:text-white">✕</button>
        </div>
        <p className="text-[11px] text-[#8B9A92] mb-4">
          تُعرَّف مرّةً وتُربط بعدّة أصناف — «نكهات المعسل» تخدم كلّ الأراجيل. فرق السعر يعود للمكان.
        </p>

        {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 mb-3">{err}</p>}

        {editorOpen ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-[#8B9A92] mb-1">اسم المجموعة *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: نكهة المعسل"
                className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#8B9A92] mb-1">نوع الاختيار</label>
                <div className="flex gap-1.5 p-1 rounded-lg bg-[#1B211D]/60 border border-[#232B27]">
                  <button onClick={() => setForm(f => ({ ...f, selectionType: 'single' }))}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-bold ${form.selectionType === 'single' ? 'bg-amber-500/20 text-amber-300' : 'text-[#8B9A92]'}`}>
                    واحد فقط
                  </button>
                  <button onClick={() => setForm(f => ({ ...f, selectionType: 'multi' }))}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-bold ${form.selectionType === 'multi' ? 'bg-amber-500/20 text-amber-300' : 'text-[#8B9A92]'}`}>
                    متعدّد
                  </button>
                </div>
              </div>
              {form.selectionType === 'multi' && (
                <div>
                  <label className="block text-[11px] text-[#8B9A92] mb-1">الحدّ الأقصى</label>
                  <input type="number" min="1" value={form.maxSelect} onChange={e => setForm(f => ({ ...f, maxSelect: e.target.value }))}
                    className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isRequired} onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))}
                className="w-4 h-4 accent-amber-500" />
              <span className="text-xs text-gray-300">إلزاميّ — لا يُرسل الطلب بلا اختيار</span>
            </label>

            <div>
              <label className="block text-[11px] text-[#8B9A92] mb-1.5">الخيارات وفروق أسعارها</label>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pl-1">
                {form.values.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={v.name} onChange={e => setVal(i, { name: e.target.value })}
                      placeholder={`خيار ${i + 1}`}
                      className="flex-1 bg-[#1B211D] border border-[#232B27] rounded-lg px-2.5 py-1.5 text-xs" />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-[#5A6862]">+</span>
                      <input type="number" step="0.05" min="0" value={v.priceDelta} onChange={e => setVal(i, { priceDelta: e.target.value })}
                        className="w-16 bg-[#1B211D] border border-[#232B27] rounded-lg px-2 py-1.5 text-xs text-center" />
                    </div>
                    <button onClick={() => delVal(i)} disabled={form.values.length === 1}
                      className="text-[11px] text-rose-400 px-1 disabled:opacity-30">🗑️</button>
                  </div>
                ))}
              </div>
              <button onClick={addVal} className="mt-2 text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">+ خيار آخر</button>
              <p className="text-[9px] text-[#5A6862] mt-1.5">اترك الفرق 0 إن لم يغيّر الخيار السعر (النكهات عادةً).</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-amber-500 to-orange-600 text-white disabled:opacity-50">
                {busy ? '⏳ يحفظ…' : editId ? 'حفظ التعديلات' : 'إضافة المجموعة'}
              </button>
              <button onClick={() => setEditorOpen(false)} disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-[#8B9A92]">رجوع</button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-10"><div className="w-7 h-7 border-2 border-[#2E3833] border-t-[#D98A2B] rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {groups.length === 0 && <p className="text-xs text-[#8B9A92] text-center py-6">لا مجموعات بعد — أنشئ «نكهة المعسل» أو «الحجم».</p>}
            {groups.map(g => (
              <div key={g.id} className="rounded-xl px-3 py-2.5 bg-white/[0.03] border border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold flex-1 truncate">{g.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {g.selectionType === 'multi' ? `متعدّد ≤${g.maxSelect}` : 'واحد'}
                  </span>
                  {g.isRequired && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">إلزاميّ</span>}
                  <button onClick={() => openEdit(g)} className="text-[11px] px-1">✏️</button>
                  <button onClick={() => remove(g)} disabled={busy} className="text-[11px] text-rose-400 px-1">🗑️</button>
                </div>
                <p className="text-[10px] text-[#8B9A92] mt-1 truncate">
                  {g.values.map(v => {
                    const d = parseFloat(String(v.priceDelta)) || 0;
                    return d > 0 ? `${v.name} (+${d.toFixed(2)})` : v.name;
                  }).join(' · ') || 'بلا خيارات'}
                </p>
              </div>
            ))}
            <button onClick={openNew}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-amber-500 to-orange-600 text-white">
              + مجموعة جديدة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
