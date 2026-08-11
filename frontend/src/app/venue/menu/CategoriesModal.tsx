'use client';

// ══════════════════════════════════════════════════════
// 🗂️ إدارة أقسام المنيو — مستويان
// «أراجيل» بلا فرعيّ · «مشروبات» ← «باردة» و«ساخنة».
// إعادة التسمية هنا تسري على كلّ أصناف القسم دفعةً واحدة (الخادم يحدّث لقطة الاسم).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

export interface MenuCategory {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
}

export default function CategoriesModal({
  authHeaders, withLoc, onClose, onChanged,
}: {
  authHeaders: Record<string, string>;
  withLoc: (url: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cats, setCats] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [newRoot, setNewRoot] = useState('');
  const [newChild, setNewChild] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(withLoc('/api/venue/categories'), { headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.success) setCats(d.categories); else setErr(d.error || 'فشل التحميل'); })
      .catch(() => setErr('خطأ في الاتصال'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (url: string, method: string, body?: any) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(withLoc(url), {
        method,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!d.success) { setErr(d.error || 'فشل الإجراء'); return false; }
      load(); onChanged();
      return true;
    } catch { setErr('خطأ في الاتصال'); return false; }
    finally { setBusy(false); }
  };

  const addRoot = async () => {
    if (!newRoot.trim()) return;
    if (await call('/api/venue/categories', 'POST', { name: newRoot.trim(), sortOrder: cats.filter(c => !c.parentId).length })) setNewRoot('');
  };
  const addChild = async (parentId: number) => {
    const name = (newChild[parentId] || '').trim();
    if (!name) return;
    if (await call('/api/venue/categories', 'POST', { name, parentId, sortOrder: cats.filter(c => c.parentId === parentId).length })) {
      setNewChild(p => ({ ...p, [parentId]: '' }));
    }
  };
  const rename = async () => {
    if (!editing || !editing.name.trim()) return;
    const cur = cats.find(c => c.id === editing.id);
    if (await call(`/api/venue/categories/${editing.id}`, 'PUT', { name: editing.name.trim(), sortOrder: cur?.sortOrder ?? 0 })) {
      setEditing(null);
    }
  };
  const move = async (c: MenuCategory, dir: -1 | 1) => {
    await call(`/api/venue/categories/${c.id}`, 'PUT', { name: c.name, sortOrder: (c.sortOrder ?? 0) + dir * 15 });
  };

  const roots = cats.filter(c => !c.parentId);

  const row = (c: MenuCategory, child: boolean) => (
    <div key={c.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${child ? 'bg-white/[0.02] border-white/[0.05] mr-5' : 'bg-white/[0.04] border-white/[0.08]'}`}>
      {editing?.id === c.id ? (
        <>
          <input autoFocus value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
            className="flex-1 bg-[#1B211D] border border-emerald-500/40 rounded-md px-2 py-1 text-xs" />
          <button onClick={rename} disabled={busy} className="text-[11px] text-emerald-400 px-1.5">حفظ</button>
          <button onClick={() => setEditing(null)} className="text-[11px] text-[#8B9A92] px-1.5">إلغاء</button>
        </>
      ) : (
        <>
          <span className="flex-1 text-xs truncate">{child ? '↳ ' : '🗂️ '}{c.name}</span>
          <button onClick={() => move(c, -1)} disabled={busy} title="أعلى" className="text-[11px] text-[#8B9A92] px-1">▲</button>
          <button onClick={() => move(c, 1)} disabled={busy} title="أسفل" className="text-[11px] text-[#8B9A92] px-1">▼</button>
          <button onClick={() => setEditing({ id: c.id, name: c.name })} className="text-[11px] px-1">✏️</button>
          <button
            onClick={() => { if (confirm(`حذف القسم «${c.name}»؟`)) call(`/api/venue/categories/${c.id}`, 'DELETE'); }}
            disabled={busy} className="text-[11px] text-rose-400 px-1">🗑️</button>
        </>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#161B18] border border-[#2E3833] border-b-0 rounded-t-3xl p-5 overflow-y-auto relative" style={{ height: '90%', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-11 h-1 rounded-full bg-[#2E3833]" />
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold">🗂️ أقسام المنيو</h3>
          <button onClick={onClose} className="text-[#8B9A92] hover:text-white">✕</button>
        </div>
        <p className="text-[11px] text-[#8B9A92] mb-4">
          مستويان: قسمٌ رئيس وداخله أقسامٌ فرعيّة. مثال: «مشروبات» ← «باردة» و«ساخنة».
        </p>

        {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 mb-3">{err}</p>}

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-7 h-7 border-2 border-[#2E3833] border-t-[#D98A2B] rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {roots.length === 0 && <p className="text-xs text-[#8B9A92] text-center py-6">لا أقسام بعد — أضف أوّل قسم أدناه.</p>}
            {roots.map(r => (
              <div key={r.id} className="space-y-1.5">
                {row(r, false)}
                {cats.filter(c => c.parentId === r.id).map(c => row(c, true))}
                <div className="flex gap-2 mr-5">
                  <input
                    value={newChild[r.id] || ''}
                    onChange={e => setNewChild(p => ({ ...p, [r.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addChild(r.id); }}
                    placeholder={`+ قسم فرعيّ داخل «${r.name}»`}
                    className="flex-1 bg-[#1B211D]/60 border border-[#232B27] rounded-md px-2 py-1.5 text-[11px] placeholder:text-[#5A6862]" />
                  <button onClick={() => addChild(r.id)} disabled={busy} className="text-[11px] px-2.5 rounded-md bg-white/5 border border-white/10">إضافة</button>
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-2 border-t border-gray-800">
              <input
                value={newRoot} onChange={e => setNewRoot(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRoot(); }}
                placeholder="+ قسم رئيس جديد (مثال: أراجيل)"
                className="flex-1 bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-xs placeholder:text-[#5A6862]" />
              <button onClick={addRoot} disabled={busy}
                className="px-4 rounded-lg text-xs font-bold bg-gradient-to-l from-emerald-500 to-teal-600 text-white disabled:opacity-50">إضافة</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
