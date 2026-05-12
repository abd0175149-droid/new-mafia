'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gcFetch } from './helpers';
import * as LucideIcons from 'lucide-react';

// Helper: render Lucide icon by name
function LucideIcon({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (LucideIcons as any)[name];
  if (!Icon) return <span className={className} style={{ fontSize: size }}>✦</span>;
  return <Icon size={size} className={className} />;
}

interface CardTemplate {
  id: string;
  gradient: string;
  borderColor: string;
  textColor: string;
  glowEffect: string;
  teamBadge: { text: string; bgColor: string; textColor: string; borderColor: string } | null;
  icon: { type: string; value: string } | null;
  secretFace: { type: string; customImageUrl?: string; overlayGradient?: string } | null;
  elements: { showPlayerNumber: boolean; showClubBranding: boolean; showDescription: boolean; customFooterText?: string } | null;
}

interface RoleOption { id: string; nameAr: string; team: string; cardTemplateId: string | null; }

// ── Tailwind gradient presets ──
const GRADIENT_PRESETS = [
  { label: 'أحمر داكن', value: 'from-red-800 via-red-900 to-red-950' },
  { label: 'ذهبي', value: 'from-amber-800 via-amber-900 to-yellow-950' },
  { label: 'أزرق', value: 'from-blue-800 via-blue-900 to-blue-950' },
  { label: 'أخضر', value: 'from-emerald-800 via-emerald-900 to-green-950' },
  { label: 'بنفسجي', value: 'from-fuchsia-800 via-fuchsia-900 to-fuchsia-950' },
  { label: 'نيلي', value: 'from-indigo-800 via-indigo-900 to-indigo-950' },
  { label: 'وردي', value: 'from-rose-800 via-rose-900 to-rose-950' },
  { label: 'سماوي', value: 'from-cyan-800 via-cyan-900 to-cyan-950' },
  { label: 'رمادي', value: 'from-zinc-700 via-zinc-800 to-zinc-900' },
  { label: 'زيتي', value: 'from-teal-800 via-teal-900 to-teal-950' },
];

const BORDER_PRESETS = [
  'border-red-500/60', 'border-amber-400/60', 'border-blue-500/60',
  'border-emerald-500/60', 'border-fuchsia-500/60', 'border-indigo-500/60',
  'border-rose-500/60', 'border-cyan-500/60', 'border-zinc-500/60', 'border-teal-500/60',
];

const TEXT_PRESETS = [
  'text-red-300', 'text-amber-300', 'text-blue-300', 'text-emerald-300',
  'text-fuchsia-300', 'text-indigo-300', 'text-rose-300', 'text-cyan-300',
  'text-zinc-300', 'text-teal-300',
];

const ICON_OPTIONS = [
  { label: 'مستخدم', value: 'User' }, { label: 'قلب', value: 'HeartPulse' },
  { label: 'درع', value: 'Shield' }, { label: 'حقنة', value: 'Syringe' },
  { label: 'نيشان', value: 'Crosshair' }, { label: 'شارة', value: 'BadgeAlert' },
  { label: 'جمجمة', value: 'Skull' }, { label: 'تاج', value: 'Crown' },
  { label: 'قناع', value: 'Drama' }, { label: 'مقص', value: 'Scissors' },
  { label: 'نار', value: 'Flame' }, { label: 'شبح', value: 'Ghost' },
  { label: 'عين', value: 'Eye' }, { label: 'صاعقة', value: 'Zap' },
  { label: 'سيف', value: 'Sword' }, { label: 'قلب ❤', value: 'Heart' },
];

export default function CardsTab() {
  const [items, setItems] = useState<CardTemplate[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CardTemplate> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      gcFetch('/card-templates').then(d => d.data || []),
      gcFetch('/roles').then(d => d.data || []),
    ]).then(([c, r]) => { setItems(c); setRoles(r); })
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
        await gcFetch('/card-templates', { method: 'POST', body: JSON.stringify(editing) });
      } else {
        const { id, createdAt, updatedAt, ...body } = editing as any;
        await gcFetch(`/card-templates/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setEditing(null); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  // الأدوار المرتبطة بقالب معين
  const linkedRoles = useMemo(() => {
    if (!editing?.id) return [];
    return roles.filter(r => r.cardTemplateId === editing.id);
  }, [editing?.id, roles]);

  const newTemplate = (): Partial<CardTemplate> => ({
    id: '', gradient: GRADIENT_PRESETS[0].value, borderColor: BORDER_PRESETS[0],
    textColor: TEXT_PRESETS[0], glowEffect: '',
    teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
    icon: { type: 'lucide', value: 'User' },
    secretFace: null, elements: { showPlayerNumber: true, showClubBranding: true, showDescription: true },
  });

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{items.length} قالب بطاقة</p>
        <button onClick={() => setEditing(newTemplate())}
          className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition">+ قالب جديد</button>
      </div>

      {error && <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">{error}</div>}

      {/* Grid of cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((card, i) => {
          const cardRoles = roles.filter(r => r.cardTemplateId === card.id);
          return (
            <motion.div key={card.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-gray-800/50 border border-gray-700/40 rounded-2xl overflow-hidden hover:border-gray-600/60 transition group cursor-pointer"
              onClick={() => setEditing({ ...card })}
            >
              {/* Card Preview */}
              <div className={`h-28 bg-gradient-to-b ${card.gradient} relative overflow-hidden`}>
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent" />
                {/* شارة الفريق */}
                {card.teamBadge && (
                  <div className={`absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full border text-[8px] font-mono ${card.teamBadge.bgColor} ${card.teamBadge.textColor} ${card.teamBadge.borderColor}`}>
                    {card.teamBadge.text}
                  </div>
                )}
                {/* الأيقونة */}
                <div className="absolute inset-0 flex items-center justify-center pt-4">
                  {card.icon?.type?.toLowerCase() === 'emoji' ? (
                    <span className="text-3xl">{card.icon.value}</span>
                  ) : card.icon?.type?.toLowerCase() === 'lucide' ? (
                    <LucideIcon name={card.icon.value} size={28} className={card.textColor} />
                  ) : (
                    <span className={`text-3xl ${card.textColor}`}>✦</span>
                  )}
                </div>
              </div>
              <div className="p-3">
                <p className="text-white text-sm font-medium">{card.id}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {cardRoles.map(r => (
                    <span key={r.id} className={`text-[9px] px-1.5 py-0.5 rounded ${
                      r.team === 'MAFIA' ? 'bg-rose-500/15 text-rose-400' : r.team === 'NEUTRAL' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                    }`}>{r.nameAr}</span>
                  ))}
                  {cardRoles.length === 0 && <span className="text-[9px] text-gray-600">غير مرتبط</span>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Modal — Card Builder */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-full max-w-3xl my-8" dir="rtl" onClick={e => e.stopPropagation()}>
              
              <div className="flex gap-6">
                {/* Left: Form */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[70vh] pl-4" style={{ scrollbarWidth: 'thin' }}>
                  <h3 className="text-lg font-bold text-white mb-4">{items.find(i => i.id === editing.id) ? 'تعديل القالب' : 'قالب جديد'}</h3>

                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">المعرّف (ID)</label>
                    <input value={editing.id || ''} onChange={e => setEditing({ ...editing, id: e.target.value })} disabled={!!items.find(i => i.id === editing.id)}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none disabled:opacity-50" />
                  </div>

                  {/* التدرج */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">التدرج اللوني</label>
                    <div className="flex flex-wrap gap-2">
                      {GRADIENT_PRESETS.map(p => (
                        <button key={p.value} onClick={() => setEditing({ ...editing, gradient: p.value })}
                          className={`w-8 h-8 rounded-lg bg-gradient-to-b ${p.value} border-2 transition ${editing.gradient === p.value ? 'border-white ring-1 ring-white/30' : 'border-gray-700/50 hover:border-gray-500'}`}
                          title={p.label} />
                      ))}
                    </div>
                  </div>

                  {/* لون الحدود */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">لون الحدود</label>
                    <div className="flex flex-wrap gap-2">
                      {BORDER_PRESETS.map(b => (
                        <button key={b} onClick={() => setEditing({ ...editing, borderColor: b })}
                          className={`w-7 h-7 rounded-lg border-2 ${b} bg-gray-800 transition ${editing.borderColor === b ? 'ring-1 ring-white/30' : 'hover:opacity-80'}`} />
                      ))}
                    </div>
                  </div>

                  {/* لون النص */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">لون النص</label>
                    <div className="flex flex-wrap gap-2">
                      {TEXT_PRESETS.map(t => (
                        <button key={t} onClick={() => setEditing({ ...editing, textColor: t })}
                          className={`px-2 py-1 rounded-lg text-xs bg-gray-800 border border-gray-700/50 ${t} transition ${editing.textColor === t ? 'ring-1 ring-white/30 border-white/30' : 'hover:opacity-80'}`}>Aa</button>
                      ))}
                    </div>
                  </div>

                  {/* الأيقونة */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">الأيقونة</label>
                    <div className="flex gap-2 mb-2">
                      <button onClick={() => setEditing({ ...editing, icon: { type: 'lucide', value: editing.icon?.value || 'User' } })}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition ${editing.icon?.type?.toLowerCase() === 'lucide' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700/40'}`}>Lucide</button>
                      <button onClick={() => setEditing({ ...editing, icon: { type: 'emoji', value: '🎭' } })}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition ${editing.icon?.type === 'emoji' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700/40'}`}>Emoji</button>
                    </div>
                    {editing.icon?.type?.toLowerCase() === 'lucide' && (
                      <div className="flex flex-wrap gap-1.5">
                        {ICON_OPTIONS.map(ico => (
                          <button key={ico.value} onClick={() => setEditing({ ...editing, icon: { type: 'lucide', value: ico.value } })}
                            className={`px-2 py-1 rounded text-[10px] border transition ${editing.icon?.value === ico.value ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800/50 text-gray-400 border-gray-700/40'}`}>{ico.label}</button>
                        ))}
                      </div>
                    )}
                    {editing.icon?.type === 'emoji' && (
                      <input value={editing.icon?.value || ''} onChange={e => setEditing({ ...editing, icon: { type: 'emoji', value: e.target.value } })}
                        className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-2xl text-center focus:border-amber-500/50 focus:outline-none" />
                    )}
                  </div>

                  {/* شارة الفريق */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">نص شارة الفريق</label>
                    <input value={editing.teamBadge?.text || ''} onChange={e => setEditing({ ...editing, teamBadge: { ...(editing.teamBadge || { bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' }), text: e.target.value } })}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
                  </div>

                  {/* صورة الوجه السري */}
                  {editing.id && items.find(i => i.id === editing.id) && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">📸 صورة الوجه السري</label>
                      {editing.secretFace?.customImageUrl && (
                        <div className="mb-2 flex items-center gap-2">
                          <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${editing.secretFace.customImageUrl}`}
                            alt="Secret face" className="w-12 h-12 rounded-lg object-cover border border-gray-700" />
                          <span className="text-[10px] text-gray-500 truncate flex-1">{editing.secretFace.customImageUrl}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input type="file" accept="image/*" id="card-face-upload" className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !editing.id) return;
                            const formData = new FormData();
                            formData.append('image', file);
                            try {
                              const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                              const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/game-config/card-templates/${editing.id}/upload-image`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${token}` },
                                body: formData,
                              });
                              const data = await res.json();
                              if (data.success) {
                                setEditing({ ...editing, secretFace: { type: 'custom', customImageUrl: data.imageUrl } });
                                load(); // refresh
                              } else {
                                setError(data.error || 'Upload failed');
                              }
                            } catch (err: any) { setError(err.message); }
                          }}
                        />
                        <label htmlFor="card-face-upload"
                          className="flex-1 py-2 text-center bg-gray-800/80 text-gray-300 border border-gray-700/50 rounded-lg text-sm cursor-pointer hover:bg-gray-700/80 hover:text-white transition">
                          📤 رفع صورة
                        </label>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1">PNG, JPG, WEBP, GIF — حد أقصى 5MB</p>
                    </div>
                  )}

                  {/* الأدوار المرتبطة */}
                  {linkedRoles.length > 0 && (
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">الأدوار المرتبطة</label>
                      <div className="flex flex-wrap gap-1.5">
                        {linkedRoles.map(r => (
                          <span key={r.id} className={`text-[10px] px-2 py-1 rounded-lg border ${
                            r.team === 'MAFIA' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : r.team === 'NEUTRAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>{r.nameAr}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Live Preview */}
                <div className="w-56 shrink-0 flex flex-col items-center gap-3">
                  <p className="text-xs text-gray-500 font-mono tracking-widest uppercase">LIVE PREVIEW</p>
                  <div className={`w-48 h-64 rounded-2xl overflow-hidden border-2 ${editing.borderColor || 'border-gray-500/40'} ${editing.glowEffect || ''} relative`}>
                    <div className={`absolute inset-0 bg-gradient-to-b ${editing.gradient || 'from-zinc-700 via-zinc-800 to-zinc-900'}`} />
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent" />
                    {/* شارة */}
                    {editing.teamBadge && (
                      <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-full border text-[8px] font-mono ${editing.teamBadge.bgColor} ${editing.teamBadge.textColor} ${editing.teamBadge.borderColor}`}>
                        {editing.teamBadge.text}
                      </div>
                    )}
                    {/* أيقونة */}
                    <div className="relative z-10 flex flex-col items-center justify-center h-full p-3 pt-10">
                      <div className={`w-16 h-16 rounded-full border-2 ${editing.borderColor || ''} flex items-center justify-center mb-3 ${editing.textColor || ''}`} style={{ background: 'rgba(0,0,0,0.4)' }}>
                        {editing.icon?.type?.toLowerCase() === 'emoji' ? (
                          <span className="text-2xl">{editing.icon.value}</span>
                        ) : editing.icon?.type?.toLowerCase() === 'lucide' ? (
                          <LucideIcon name={editing.icon.value} size={28} className="" />
                        ) : (
                          <span className="text-2xl">✦</span>
                        )}
                      </div>
                      <h3 className={`text-lg font-black mb-1 ${editing.textColor || 'text-white'}`} style={{ fontFamily: 'Amiri, serif' }}>
                        {linkedRoles[0]?.nameAr || 'اسم الدور'}
                      </h3>
                      <p className="text-white/40 text-[10px] font-mono">اسم اللاعب</p>
                      <div className="w-12 h-[1px] my-2 bg-white/10" />
                      <span className="text-[7px] text-zinc-600 font-mono tracking-widest">اضغط للإخفاء</span>
                    </div>
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
