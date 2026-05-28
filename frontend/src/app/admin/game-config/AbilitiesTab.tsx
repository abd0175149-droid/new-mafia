'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gcFetch, PHASE_OPTIONS, TARGET_TYPE_OPTIONS, EFFECT_TYPE_OPTIONS } from './helpers';

interface Ability {
  id: string;
  nameAr: string;
  nameEn: string;
  phase: string;
  priority: number;
  targetType: string;
  excludeSelf: boolean;
  excludeLastTarget: boolean;
  maxTargets: number;
  effectType: string;
  effectOnSuccess: string | null;
  effectOnFail: string | null;
  canSkip: boolean;
  isInheritable: boolean;
  inheritanceOrder: string[] | null;
  deceptionRule: string | null;
  soundEvent: string | null;
  animationType: string | null;
}

const EMPTY: Partial<Ability> = {
  id: '', nameAr: '', nameEn: '', phase: 'NIGHT', priority: 10,
  targetType: 'ANY', excludeSelf: true, excludeLastTarget: false,
  maxTargets: 1, effectType: 'ELIMINATE', effectOnSuccess: null, effectOnFail: null,
  canSkip: true, isInheritable: false, inheritanceOrder: null,
  deceptionRule: null, soundEvent: null, animationType: null,
};

export default function AbilitiesTab() {
  const [items, setItems] = useState<Ability[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Ability> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    gcFetch('/abilities')
      .then(d => setItems(d.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const isNew = !items.find(i => i.id === editing.id);
      if (isNew) {
        await gcFetch('/abilities', { method: 'POST', body: JSON.stringify(editing) });
      } else {
        const { id, ...body } = editing;
        await gcFetch(`/abilities/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذه القدرة؟')) return;
    try {
      await gcFetch(`/abilities/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{items.length} قدرة معرّفة</p>
        <button onClick={() => setEditing({ ...EMPTY })} className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition">+ قدرة جديدة</button>
      </div>

      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">{error}</div>}

      {/* List */}
      <div className="grid gap-3">
        {items.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4 flex items-center gap-4 hover:border-gray-600/60 transition group">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-lg font-bold shrink-0">{a.priority}</div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium">{a.nameAr} <span className="text-gray-500 text-xs">({a.nameEn})</span></p>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">{PHASE_OPTIONS.find(p => p.value === a.phase)?.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">{TARGET_TYPE_OPTIONS.find(t => t.value === a.targetType)?.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">{EFFECT_TYPE_OPTIONS.find(e => e.value === a.effectType)?.label}</span>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
              <button onClick={() => setEditing({ ...a })} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-xs hover:bg-gray-600/50">تعديل</button>
              <button onClick={() => remove(a.id)} className="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20">حذف</button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-4">{items.find(i => i.id === editing.id) ? 'تعديل القدرة' : 'قدرة جديدة'}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="المعرّف (ID)" value={editing.id || ''} onChange={v => setEditing({ ...editing, id: v })} disabled={!!items.find(i => i.id === editing.id)} />
                  <Field label="الأولوية" value={String(editing.priority || 10)} onChange={v => setEditing({ ...editing, priority: parseInt(v) || 0 })} type="number" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="الاسم (عربي)" value={editing.nameAr || ''} onChange={v => setEditing({ ...editing, nameAr: v })} />
                  <Field label="الاسم (إنجليزي)" value={editing.nameEn || ''} onChange={v => setEditing({ ...editing, nameEn: v })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select label="المرحلة" value={editing.phase || 'NIGHT'} options={PHASE_OPTIONS} onChange={v => setEditing({ ...editing, phase: v })} />
                  <Select label="نوع الهدف" value={editing.targetType || 'ANY'} options={TARGET_TYPE_OPTIONS} onChange={v => setEditing({ ...editing, targetType: v })} />
                  <Select label="نوع التأثير" value={editing.effectType || 'ELIMINATE'} options={EFFECT_TYPE_OPTIONS} onChange={v => setEditing({ ...editing, effectType: v })} />
                </div>
                <div className="flex flex-wrap gap-4">
                  <Toggle label="استثناء النفس" checked={editing.excludeSelf ?? true} onChange={v => setEditing({ ...editing, excludeSelf: v })} />
                  <Toggle label="استثناء آخر هدف" checked={editing.excludeLastTarget ?? false} onChange={v => setEditing({ ...editing, excludeLastTarget: v })} />
                  <Toggle label="يمكن تخطيها" checked={editing.canSkip ?? true} onChange={v => setEditing({ ...editing, canSkip: v })} />
                  <Toggle label="قابلة للتوريث" checked={editing.isInheritable ?? false} onChange={v => setEditing({ ...editing, isInheritable: v })} />
                </div>

                {/* حقول متقدمة */}
                <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-3 space-y-3">
                  <label className="text-xs text-gray-500 font-bold block">⚙️ إعدادات متقدمة</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="حدث النجاح" value={editing.effectOnSuccess || ''} onChange={v => setEditing({ ...editing, effectOnSuccess: v || null })} />
                    <Field label="حدث الفشل" value={editing.effectOnFail || ''} onChange={v => setEditing({ ...editing, effectOnFail: v || null })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="حدث الصوت" value={editing.soundEvent || ''} onChange={v => setEditing({ ...editing, soundEvent: v || null })} />
                    <Field label="نوع الأنيميشن" value={editing.animationType || ''} onChange={v => setEditing({ ...editing, animationType: v || null })} />
                  </div>
                  <Field label="قاعدة الخداع" value={editing.deceptionRule || ''} onChange={v => setEditing({ ...editing, deceptionRule: v || null })} />
                  <Field label="ترتيب التوريث (IDs مفصولة بفواصل)" value={(editing.inheritanceOrder || []).join(', ')} onChange={v => setEditing({ ...editing, inheritanceOrder: v ? v.split(',').map(s => s.trim()).filter(Boolean) : null })} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50">
                  {saving ? 'جارِ الحفظ...' : 'حفظ'}
                </button>
                <button onClick={() => setEditing(null)} className="px-6 py-2.5 bg-gray-800 text-gray-300 rounded-xl hover:bg-gray-700 transition">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── مكونات مساعدة ──
function Field({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none disabled:opacity-50" />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div className={`w-8 h-5 rounded-full transition ${checked ? 'bg-amber-500' : 'bg-gray-700'} relative`}>
        <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${checked ? 'right-0.5' : 'right-4'}`} />
      </div>
      <span className="text-xs text-gray-400">{label}</span>
    </label>
  );
}
