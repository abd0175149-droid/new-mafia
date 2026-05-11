'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gcFetch, CONDITION_OPTIONS, RESOLUTION_OPTIONS } from './helpers';

interface Rule {
  id: number;
  abilityA: string;
  abilityB: string;
  condition: string;
  resolution: string;
  resultEvent: string;
  priority: number;
}

interface AbilityOption { id: string; nameAr: string; }

export default function InteractionsTab() {
  const [items, setItems] = useState<Rule[]>([]);
  const [abilities, setAbilities] = useState<AbilityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      gcFetch('/interactions').then(d => d.data || []),
      gcFetch('/abilities').then(d => d.data || []),
    ]).then(([r, a]) => { setItems(r); setAbilities(a); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError('');
    try {
      if (!editing.id) {
        await gcFetch('/interactions', { method: 'POST', body: JSON.stringify(editing) });
      } else {
        const { id, ...body } = editing;
        await gcFetch(`/interactions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setEditing(null); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('حذف هذه القاعدة؟')) return;
    try { await gcFetch(`/interactions/${id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setError(e.message); }
  };

  const getAbilityName = (id: string) => abilities.find(a => a.id === id)?.nameAr || id;

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{items.length} قاعدة تفاعل</p>
        <button onClick={() => setEditing({ abilityA: '', abilityB: '', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', resultEvent: '', priority: 1 })}
          className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition">+ قاعدة جديدة</button>
      </div>

      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">{error}</div>}

      <div className="grid gap-3">
        {items.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4 hover:border-gray-600/60 transition group">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-1 bg-rose-500/15 text-rose-400 border border-rose-500/20 rounded-lg text-xs">{getAbilityName(r.abilityA)}</span>
                  <span className="text-gray-600 text-xs">+</span>
                  <span className="px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-lg text-xs">{getAbilityName(r.abilityB)}</span>
                  <span className="text-gray-600 text-xs">→</span>
                  <span className="px-2 py-1 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-lg text-xs">
                    {CONDITION_OPTIONS.find(c => c.value === r.condition)?.label}: {RESOLUTION_OPTIONS.find(c => c.value === r.resolution)?.label}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-1">الحدث: <span className="text-gray-300">{r.resultEvent}</span></p>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => setEditing({ ...r })} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-xs hover:bg-gray-600/50">تعديل</button>
                <button onClick={() => remove(r.id)} className="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20">حذف</button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-4">{editing.id ? 'تعديل القاعدة' : 'قاعدة جديدة'}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">القدرة A</label>
                    <select value={editing.abilityA || ''} onChange={e => setEditing({ ...editing, abilityA: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                      <option value="">اختر...</option>
                      {abilities.map(a => <option key={a.id} value={a.id}>{a.nameAr}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">القدرة B</label>
                    <select value={editing.abilityB || ''} onChange={e => setEditing({ ...editing, abilityB: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                      <option value="">اختر...</option>
                      {abilities.map(a => <option key={a.id} value={a.id}>{a.nameAr}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الشرط</label>
                    <select value={editing.condition || 'SAME_TARGET'} onChange={e => setEditing({ ...editing, condition: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                      {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">النتيجة</label>
                    <select value={editing.resolution || 'B_CANCELS_A'} onChange={e => setEditing({ ...editing, resolution: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                      {RESOLUTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">حدث النتيجة</label>
                    <input value={editing.resultEvent || ''} onChange={e => setEditing({ ...editing, resultEvent: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" placeholder="ASSASSINATION_BLOCKED" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الأولوية</label>
                    <input type="number" value={editing.priority ?? 1} onChange={e => setEditing({ ...editing, priority: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
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
