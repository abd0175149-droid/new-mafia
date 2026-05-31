'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gcFetch, TEAM_OPTIONS, WIN_CONDITION_OPTIONS } from './helpers';
import MafiaCardLegacy from '@/components/MafiaCardLegacy';

interface Role {
  id: string;
  nameAr: string;
  nameEn: string;
  team: string;
  abilities: string[];
  genPriority: number;
  genMaxCount: number;
  genMinPlayers: number;
  genIsRequired: boolean;
  description: string | null;
  cardTemplateId: string | null;
  winConditionType: string | null;
  winConditionDescription: string | null;
  winConditionRevealTarget: boolean;
}

interface AbilityOption { id: string; nameAr: string; }
interface CardTemplateOption { id: string; }

export default function RolesTab() {
  const [items, setItems] = useState<Role[]>([]);
  const [abilities, setAbilities] = useState<AbilityOption[]>([]);
  const [cardTemplates, setCardTemplates] = useState<CardTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Role> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      gcFetch('/roles').then(d => d.data || []),
      gcFetch('/abilities').then(d => d.data || []),
      gcFetch('/card-templates').then(d => d.data || []).catch(() => []),
    ]).then(([r, a, c]) => { setItems(r); setAbilities(a); setCardTemplates(c); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError('');
    try {
      const isNew = !items.find(i => i.id === editing.id);
      if (isNew) {
        await gcFetch('/roles', { method: 'POST', body: JSON.stringify(editing) });
      } else {
        const { id, createdAt, updatedAt, ...body } = editing as any;
        await gcFetch(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setEditing(null); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('حذف هذا الدور؟')) return;
    try { await gcFetch(`/roles/${id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setError(e.message); }
  };

  const toggleAbility = (abilityId: string) => {
    if (!editing) return;
    const cur = editing.abilities || [];
    const next = cur.includes(abilityId) ? cur.filter(a => a !== abilityId) : [...cur, abilityId];
    setEditing({ ...editing, abilities: next });
  };

  const getTeamStyle = (team: string) => {
    switch (team) {
      case 'MAFIA': return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
      case 'CITIZEN': return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
      case 'NEUTRAL': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      default: return 'bg-gray-500/15 text-gray-400 border-gray-500/20';
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{items.length} دور معرّف</p>
        <button onClick={() => setEditing({ id: '', nameAr: '', nameEn: '', team: 'CITIZEN', abilities: [], genPriority: 10, genMaxCount: 1, genMinPlayers: 6, genIsRequired: false, description: '', cardTemplateId: null, winConditionType: null, winConditionDescription: null, winConditionRevealTarget: false })}
          className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition">+ دور جديد</button>
      </div>

      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">{error}</div>}

      {/* 🔪 Assassin Info Box */}
      <div className="bg-[#8A0303]/10 border border-[#8A0303]/30 rounded-xl p-4 mb-4 flex items-start gap-4">
        <div className="text-3xl">🔪</div>
        <div>
          <h3 className="text-rose-400 font-bold mb-1" style={{ fontFamily: 'Amiri, serif' }}>بنك مهام السفّاح (Assassin Contracts Pool)</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            يتم اختيار مهام السفّاح ديناميكياً عند بدء كل لعبة. بنك الأهداف المحتملة يشمل <strong>جميع الأدوار المميزة</strong> المتواجدة في اللعبة فعلياً (أي دور باستثناء المواطن العادي، والمافيا العادي، والسفاح نفسه). 
            كلما زاد عدد الأدوار المميزة في الجلسة، زاد تنوع العقود المتاحة للسفاح.
          </p>
        </div>
      </div>

      {/* Group by team */}
      {['MAFIA', 'CITIZEN', 'NEUTRAL'].map(team => {
        const teamRoles = items.filter(r => r.team === team);
        if (teamRoles.length === 0) return null;
        const teamInfo = TEAM_OPTIONS.find(t => t.value === team)!;
        return (
          <div key={team} className="space-y-2">
            <h3 className={`text-sm font-bold ${teamInfo.color} flex items-center gap-2`}>
              {team === 'MAFIA' ? '🔴' : team === 'CITIZEN' ? '🔵' : '🟡'} {teamInfo.label} ({teamRoles.length})
            </h3>
            <div className="grid gap-2">
              {teamRoles.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4 flex items-center gap-4 hover:border-gray-600/60 transition group">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border shrink-0 ${getTeamStyle(r.team)}`}>
                    {r.genPriority}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">{r.nameAr} <span className="text-gray-500 text-xs">({r.nameEn})</span></p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(r.abilities || []).map(aId => {
                        const ab = abilities.find(a => a.id === aId);
                        return <span key={aId} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300">{ab?.nameAr || aId}</span>;
                      })}
                      {r.genIsRequired && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">إجباري</span>}
                      {r.cardTemplateId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">🎴 {r.cardTemplateId}</span>}
                      {r.winConditionType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">🏆 {WIN_CONDITION_OPTIONS.find(w => w.value === r.winConditionType)?.label || r.winConditionType}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => setEditing({ ...r })} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-xs hover:bg-gray-600/50">تعديل</button>
                    <button onClick={() => remove(r.id)} className="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20">حذف</button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white mb-4">{items.find(i => i.id === editing.id) ? 'تعديل الدور' : 'دور جديد'}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">المعرّف (ID)</label>
                    <input value={editing.id || ''} onChange={e => setEditing({ ...editing, id: e.target.value })} disabled={!!items.find(i => i.id === editing.id)}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الفريق</label>
                    <select value={editing.team || 'CITIZEN'} onChange={e => setEditing({ ...editing, team: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                      {TEAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الاسم (عربي)</label>
                    <input value={editing.nameAr || ''} onChange={e => setEditing({ ...editing, nameAr: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الاسم (إنجليزي)</label>
                    <input value={editing.nameEn || ''} onChange={e => setEditing({ ...editing, nameEn: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الأولوية</label>
                    <input type="number" value={editing.genPriority ?? 10} onChange={e => setEditing({ ...editing, genPriority: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الحد الأقصى</label>
                    <input type="number" value={editing.genMaxCount ?? 1} onChange={e => setEditing({ ...editing, genMaxCount: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">أقل عدد لاعبين</label>
                    <input type="number" value={editing.genMinPlayers ?? 6} onChange={e => setEditing({ ...editing, genMinPlayers: parseInt(e.target.value) || 6 })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className={`w-8 h-5 rounded-full transition ${editing.genIsRequired ? 'bg-amber-500' : 'bg-gray-700'} relative`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${editing.genIsRequired ? 'right-0.5' : 'right-4'}`} />
                  </div>
                  <span className="text-xs text-gray-400">إجباري (يظهر دائماً)</span>
                </label>

                {/* قدرات مرتبطة */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block">القدرات المرتبطة</label>
                  <div className="flex flex-wrap gap-2">
                    {abilities.map(a => {
                      const selected = (editing.abilities || []).includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAbility(a.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs border transition ${selected ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800/50 text-gray-400 border-gray-700/40 hover:border-gray-600'}`}>
                          {a.nameAr}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* قالب البطاقة */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">🎴 قالب البطاقة</label>
                  <select value={editing.cardTemplateId || ''} onChange={e => setEditing({ ...editing, cardTemplateId: e.target.value || null })}
                    className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                    <option value="">بدون قالب (افتراضي)</option>
                    {cardTemplates.map(ct => <option key={ct.id} value={ct.id}>{ct.id}</option>)}
                  </select>
                </div>

                {/* شروط الفوز — متاحة لكل الفرق (خاصة المحايدين) */}
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-3">
                  <label className="text-xs text-amber-400 font-bold block">🏆 شرط الفوز {editing.team === 'NEUTRAL' ? '(محايد — مطلوب)' : '(اختياري)'}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">نوع الشرط</label>
                      <select value={editing.winConditionType || ''} onChange={e => setEditing({ ...editing, winConditionType: e.target.value || null })}
                        className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none">
                        {WIN_CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mt-5">
                        <div className={`w-8 h-5 rounded-full transition ${editing.winConditionRevealTarget ? 'bg-amber-500' : 'bg-gray-700'} relative`}>
                          <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${editing.winConditionRevealTarget ? 'right-0.5' : 'right-4'}`} />
                        </div>
                        <span className="text-xs text-gray-400">كشف الهدف</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">وصف شرط الفوز</label>
                    <input value={editing.winConditionDescription || ''} onChange={e => setEditing({ ...editing, winConditionDescription: e.target.value || null })}
                      placeholder="مثلاً: يفوز فقط إذا تم إقصاؤه بالتصويت النهاري"
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الوصف</label>
                  <textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2}
                    className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none resize-none" />
                </div>

                {/* 🃏 معاينة الكارد */}
                {editing.nameAr && (
                  <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
                    <label className="text-xs text-gray-500 mb-3 block text-center">🃏 معاينة الكارد</label>
                    <div className="flex justify-center">
                      <MafiaCardLegacy
                        playerNumber={1}
                        playerName="لاعب تجريبي"
                        role={editing.id || null}
                        isFlipped={true}
                        flippable={false}
                        size="sm"
                      />
                    </div>
                    {editing.cardTemplateId && (
                      <p className="text-center text-[10px] text-gray-600 mt-2">قالب: {editing.cardTemplateId}</p>
                    )}
                  </div>
                )}
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
