'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import { gcFetch } from './helpers';

function LI({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = (LucideIcons as any)[name];
  if (!Icon) return <span className={className} style={{ fontSize: size }}>✦</span>;
  return <Icon size={size} className={className} />;
}

const GRADIENTS = [
  { l: 'أحمر', v: 'from-red-800 via-red-900 to-red-950' },
  { l: 'ذهبي', v: 'from-amber-800 via-amber-900 to-yellow-950' },
  { l: 'أزرق', v: 'from-blue-800 via-blue-900 to-blue-950' },
  { l: 'أخضر', v: 'from-emerald-800 via-emerald-900 to-green-950' },
  { l: 'بنفسجي', v: 'from-fuchsia-800 via-fuchsia-900 to-fuchsia-950' },
  { l: 'نيلي', v: 'from-indigo-800 via-indigo-900 to-indigo-950' },
  { l: 'وردي', v: 'from-rose-800 via-rose-900 to-rose-950' },
  { l: 'سماوي', v: 'from-cyan-800 via-cyan-900 to-cyan-950' },
  { l: 'رمادي', v: 'from-zinc-700 via-zinc-800 to-zinc-900' },
  { l: 'زيتي', v: 'from-teal-800 via-teal-900 to-teal-950' },
];
const BORDERS = ['border-red-500/60','border-amber-400/60','border-blue-500/60','border-emerald-500/60','border-fuchsia-500/60','border-indigo-500/60','border-rose-500/60','border-cyan-500/60','border-zinc-500/60','border-teal-500/60'];
const TEXTS = ['text-red-300','text-amber-300','text-blue-300','text-emerald-300','text-fuchsia-300','text-indigo-300','text-rose-300','text-cyan-300','text-zinc-300','text-teal-300'];
const ICONS = [
  { l: 'مستخدم', v: 'User' },{ l: 'قلب', v: 'HeartPulse' },{ l: 'درع', v: 'Shield' },{ l: 'حقنة', v: 'Syringe' },
  { l: 'نيشان', v: 'Crosshair' },{ l: 'شارة', v: 'BadgeAlert' },{ l: 'جمجمة', v: 'Skull' },{ l: 'تاج', v: 'Crown' },
  { l: 'قناع', v: 'Drama' },{ l: 'مقص', v: 'Scissors' },{ l: 'نار', v: 'Flame' },{ l: 'شبح', v: 'Ghost' },
  { l: 'عين', v: 'Eye' },{ l: 'صاعقة', v: 'Zap' },{ l: 'سيف', v: 'Sword' },{ l: 'قلب❤', v: 'Heart' },
];
const FONTS = [
  { l: 'أميري (كلاسيكي)', v: 'Amiri, serif' },{ l: 'القاهرة', v: 'Cairo, sans-serif' },
  { l: 'تجوال', v: 'Tajawal, sans-serif' },{ l: 'نوتو كوفي', v: 'Noto Kufi Arabic, sans-serif' },
  { l: 'ريم كوفي', v: 'Reem Kufi, sans-serif' },{ l: 'Inter', v: 'Inter, sans-serif' },
];
const GLOWS = [
  { l: 'بدون', v: '' },{ l: 'ذهبي', v: 'shadow-[0_0_40px_rgba(251,191,36,0.25)]' },
  { l: 'أحمر', v: 'shadow-[0_0_40px_rgba(239,68,68,0.25)]' },{ l: 'أزرق', v: 'shadow-[0_0_40px_rgba(59,130,246,0.25)]' },
];

type Tab = 'colors' | 'icon' | 'typography' | 'elements' | 'secret';
type Face = 'front' | 'secret';

interface Props {
  editing: any;
  setEditing: (v: any) => void;
  isNew: boolean;
  linkedRoles: { id: string; nameAr: string; team: string }[];
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
  setError: (v: string) => void;
  onLoad: () => void;
}

export default function CardEditorModal({ editing, setEditing, isNew, linkedRoles, onSave, onClose, saving, error, setError, onLoad }: Props) {
  const [tab, setTab] = useState<Tab>('colors');
  const [face, setFace] = useState<Face>('front');

  const el = editing.elements || { showPlayerNumber: true, showClubBranding: true, showDescription: true };
  const setEl = (p: any) => setEditing({ ...editing, elements: { ...el, ...p } });
  const font = el.fontFamily || 'Amiri, serif';
  const iconSize = el.iconSize || 48;
  const nameSize = el.nameSize || 20;
  const badgeSize = el.badgeSize || 10;

  const TABS: { k: Tab; l: string; i: string }[] = [
    { k: 'colors', l: 'الألوان', i: '🎨' },
    { k: 'icon', l: 'الأيقونة', i: '✦' },
    { k: 'typography', l: 'الخطوط', i: '𝐀' },
    { k: 'elements', l: 'العناصر', i: '⚙' },
    { k: 'secret', l: 'الوجه السري', i: '🔒' },
  ];

  const uploadImage = async (file: File) => {
    if (!editing.id) return;
    const fd = new FormData(); fd.append('image', file);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/game-config/card-templates/${editing.id}/upload-image`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (data.success) { setEditing({ ...editing, secretFace: { type: 'custom', customImageUrl: data.imageUrl } }); onLoad(); }
      else setError(data.error || 'Upload failed');
    } catch (err: any) { setError(err.message); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        className="bg-gray-900 border border-gray-700/60 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden" dir="rtl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">{isNew ? '✨ قالب جديد' : `✏️ تعديل: ${editing.id}`}</h3>
          <div className="flex gap-2">
            <button onClick={onSave} disabled={saving} className="px-5 py-2 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50 text-sm">
              {saving ? '⏳' : '💾 حفظ'}
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-gray-400 rounded-xl hover:bg-gray-700 transition text-sm">✕</button>
          </div>
        </div>

        {error && <div className="mx-6 mt-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">{error}</div>}

        <div className="flex h-[calc(90vh-80px)]">
          {/* Sidebar Tabs */}
          <div className="w-16 border-l border-gray-800 flex flex-col items-center py-4 gap-1 shrink-0">
            {TABS.map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} title={t.l}
                className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg transition ${tab === t.k ? 'bg-amber-500/15 text-amber-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
                {t.i}
              </button>
            ))}
          </div>

          {/* Editor Panel */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>
            {/* ID */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">المعرّف (ID)</label>
              <input value={editing.id || ''} onChange={e => setEditing({ ...editing, id: e.target.value })} disabled={!isNew}
                className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none disabled:opacity-50" />
            </div>

            {/* Tab: Colors */}
            {tab === 'colors' && <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">التدرج اللوني</label>
                <div className="flex flex-wrap gap-2">
                  {GRADIENTS.map(p => (
                    <button key={p.v} onClick={() => setEditing({ ...editing, gradient: p.v })}
                      className={`w-10 h-10 rounded-xl bg-gradient-to-b ${p.v} border-2 transition ${editing.gradient === p.v ? 'border-white ring-2 ring-amber-500/30' : 'border-gray-700/50 hover:border-gray-500'}`} title={p.l} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">لون الحدود</label>
                <div className="flex flex-wrap gap-2">
                  {BORDERS.map(b => (
                    <button key={b} onClick={() => setEditing({ ...editing, borderColor: b })}
                      className={`w-8 h-8 rounded-lg border-2 ${b} bg-gray-800 transition ${editing.borderColor === b ? 'ring-2 ring-amber-500/30' : 'hover:opacity-80'}`} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">لون النص</label>
                <div className="flex flex-wrap gap-2">
                  {TEXTS.map(t => (
                    <button key={t} onClick={() => setEditing({ ...editing, textColor: t })}
                      className={`px-3 py-1.5 rounded-lg text-xs bg-gray-800 border border-gray-700/50 ${t} transition ${editing.textColor === t ? 'ring-2 ring-amber-500/30' : ''}`}>Aa</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">التوهج</label>
                <div className="flex flex-wrap gap-2">
                  {GLOWS.map(g => (
                    <button key={g.l} onClick={() => setEditing({ ...editing, glowEffect: g.v })}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition ${editing.glowEffect === g.v ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700/40'}`}>{g.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">نص شارة الفريق</label>
                <input value={editing.teamBadge?.text || ''} onChange={e => setEditing({ ...editing, teamBadge: { ...(editing.teamBadge || { bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' }), text: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
              </div>
            </>}

            {/* Tab: Icon */}
            {tab === 'icon' && <>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setEditing({ ...editing, icon: { ...editing.icon, type: 'lucide', value: editing.icon?.value || 'User' } })}
                  className={`px-4 py-2 rounded-xl text-sm border transition ${editing.icon?.type?.toLowerCase() === 'lucide' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700/40'}`}>🎯 Lucide</button>
                <button onClick={() => setEditing({ ...editing, icon: { type: 'emoji', value: '🎭' } })}
                  className={`px-4 py-2 rounded-xl text-sm border transition ${editing.icon?.type?.toLowerCase() === 'emoji' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700/40'}`}>😀 Emoji</button>
              </div>
              {editing.icon?.type?.toLowerCase() === 'lucide' && (
                <div className="grid grid-cols-4 gap-2">
                  {ICONS.map(ico => (
                    <button key={ico.v} onClick={() => setEditing({ ...editing, icon: { type: 'lucide', value: ico.v } })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition ${editing.icon?.value === ico.v ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-gray-800/50 border-gray-700/40 text-gray-400 hover:border-gray-600'}`}>
                      <LI name={ico.v} size={22} />
                      <span className="text-[9px]">{ico.l}</span>
                    </button>
                  ))}
                </div>
              )}
              {editing.icon?.type?.toLowerCase() === 'emoji' && (
                <input value={editing.icon?.value || ''} onChange={e => setEditing({ ...editing, icon: { type: 'emoji', value: e.target.value } })}
                  className="w-full px-3 py-4 bg-gray-800/80 border border-gray-700/50 rounded-xl text-white text-3xl text-center focus:border-amber-500/50 focus:outline-none" />
              )}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">حجم الأيقونة: {iconSize}px</label>
                <input type="range" min={24} max={80} value={iconSize} onChange={e => setEl({ iconSize: +e.target.value })}
                  className="w-full accent-amber-500" />
              </div>
            </>}

            {/* Tab: Typography */}
            {tab === 'typography' && <>
              <div>
                <label className="text-xs text-gray-500 mb-2 block">نوع الخط</label>
                <div className="space-y-2">
                  {FONTS.map(f => (
                    <button key={f.v} onClick={() => setEl({ fontFamily: f.v })}
                      className={`w-full text-right px-4 py-3 rounded-xl border transition ${font === f.v ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-gray-800/50 border-gray-700/40 text-gray-300 hover:border-gray-600'}`}>
                      <span style={{ fontFamily: f.v }} className="text-lg">{f.l}</span>
                      <span className="block text-xs mt-1 opacity-50" style={{ fontFamily: f.v }}>بسم الله الرحمن الرحيم — 123</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">حجم اسم الدور: {nameSize}px</label>
                <input type="range" min={12} max={32} value={nameSize} onChange={e => setEl({ nameSize: +e.target.value })}
                  className="w-full accent-amber-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">حجم شارة الفريق: {badgeSize}px</label>
                <input type="range" min={6} max={16} value={badgeSize} onChange={e => setEl({ badgeSize: +e.target.value })}
                  className="w-full accent-amber-500" />
              </div>
            </>}

            {/* Tab: Elements */}
            {tab === 'elements' && <>
              {[
                { k: 'showPlayerNumber', l: 'رقم اللاعب' },
                { k: 'showClubBranding', l: 'شعار النادي' },
                { k: 'showDescription', l: 'وصف الدور' },
              ].map(item => (
                <label key={item.k} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl border border-gray-700/40 cursor-pointer hover:border-gray-600 transition">
                  <span className="text-sm text-gray-300">{item.l}</span>
                  <input type="checkbox" checked={(el as any)[item.k] ?? true} onChange={e => setEl({ [item.k]: e.target.checked })}
                    className="w-5 h-5 accent-amber-500 rounded" />
                </label>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">نص مخصص في الأسفل</label>
                <input value={el.customFooterText || ''} onChange={e => setEl({ customFooterText: e.target.value })}
                  placeholder="اختياري..." className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
              </div>
              {linkedRoles.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الأدوار المرتبطة</label>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedRoles.map(r => (
                      <span key={r.id} className={`text-[10px] px-2 py-1 rounded-lg border ${r.team === 'MAFIA' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : r.team === 'NEUTRAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{r.nameAr}</span>
                    ))}
                  </div>
                </div>
              )}
            </>}

            {/* Tab: Secret Face */}
            {tab === 'secret' && <>
              <p className="text-xs text-gray-500 mb-2">الوجه السري يظهر عند قلب البطاقة (وضع الإخفاء)</p>
              {editing.secretFace?.customImageUrl && (
                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/40">
                  <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${editing.secretFace.customImageUrl}`} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-700" />
                  <span className="text-[10px] text-gray-500 truncate flex-1">{editing.secretFace.customImageUrl}</span>
                </div>
              )}
              {editing.id && !isNew && (
                <div>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="sf-upload" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
                  <label htmlFor="sf-upload" className="block w-full py-3 text-center bg-gray-800/80 text-gray-300 border border-dashed border-gray-600 rounded-xl text-sm cursor-pointer hover:bg-gray-700/80 hover:text-white hover:border-gray-500 transition">
                    📤 رفع صورة مخصصة
                  </label>
                  <p className="text-[10px] text-gray-600 mt-1 text-center">PNG, JPG, WEBP, GIF — حد أقصى 5MB</p>
                </div>
              )}
              {isNew && <p className="text-xs text-amber-400/70 text-center p-4 bg-amber-500/5 rounded-xl border border-amber-500/10">احفظ القالب أولاً ثم ارفع الصورة</p>}
            </>}
          </div>

          {/* Preview Panel */}
          <div className="w-72 border-r border-gray-800 flex flex-col items-center py-5 px-4 shrink-0 bg-gray-950/50">
            {/* Face Toggle */}
            <div className="flex gap-1 mb-4 bg-gray-800/80 rounded-xl p-1 w-full">
              <button onClick={() => setFace('front')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${face === 'front' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>الوجه الأمامي</button>
              <button onClick={() => setFace('secret')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${face === 'secret' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>الوجه السري</button>
            </div>

            {/* Card Preview */}
            <div className={`w-56 h-80 rounded-2xl overflow-hidden border-2 ${editing.borderColor || 'border-gray-500/40'} ${editing.glowEffect || ''} relative transition-all duration-300`}>
              {face === 'front' ? (
                /* Front Face */
                <>
                  <div className={`absolute inset-0 bg-gradient-to-b ${editing.gradient || 'from-zinc-700 via-zinc-800 to-zinc-900'}`} />
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent" />
                  {editing.teamBadge && (
                    <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-0.5 rounded-full border font-mono ${editing.teamBadge.bgColor} ${editing.teamBadge.textColor} ${editing.teamBadge.borderColor}`}
                      style={{ fontSize: badgeSize }}>
                      {editing.teamBadge.text}
                    </div>
                  )}
                  <div className="relative z-10 flex flex-col items-center justify-center h-full p-4 pt-12">
                    <div className={`rounded-full border-2 ${editing.borderColor || ''} flex items-center justify-center mb-3 ${editing.textColor || ''}`}
                      style={{ width: iconSize + 20, height: iconSize + 20, background: 'rgba(0,0,0,0.4)' }}>
                      {editing.icon?.type?.toLowerCase() === 'emoji' ? (
                        <span style={{ fontSize: iconSize * 0.6 }}>{editing.icon.value}</span>
                      ) : editing.icon?.type?.toLowerCase() === 'lucide' ? (
                        <LI name={editing.icon.value} size={iconSize * 0.6} />
                      ) : <span style={{ fontSize: iconSize * 0.6 }}>✦</span>}
                    </div>
                    <h3 className={`font-black mb-1 ${editing.textColor || 'text-white'} text-center leading-tight`}
                      style={{ fontFamily: font, fontSize: nameSize }}>
                      {linkedRoles[0]?.nameAr || 'اسم الدور'}
                    </h3>
                    {el.showPlayerNumber && <p className="text-white/40 text-[10px] font-mono mt-1">اسم اللاعب</p>}
                    <div className="w-12 h-[1px] my-2 bg-white/10" />
                    {el.customFooterText ? (
                      <span className="text-[8px] text-zinc-500" style={{ fontFamily: font }}>{el.customFooterText}</span>
                    ) : (
                      <span className="text-[7px] text-zinc-600 font-mono tracking-widest">اضغط للإخفاء</span>
                    )}
                    {el.showClubBranding && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[6px] text-zinc-700 font-mono">MAFIA CLUB</div>}
                  </div>
                </>
              ) : (
                /* Secret Face */
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: editing.secretFace?.bgColor || '#0a0a0a' }}>
                  {editing.secretFace?.customImageUrl ? (
                    <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${editing.secretFace.customImageUrl}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="text-5xl opacity-20">🎭</div>
                      <p className="text-zinc-600 text-xs font-mono">SECRET FACE</p>
                      <p className="text-zinc-700 text-[10px]">لم يُضف وجه سري</p>
                    </div>
                  )}
                  {editing.secretFace?.overlayGradient && <div className={`absolute inset-0 bg-gradient-to-b ${editing.secretFace.overlayGradient}`} />}
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-600 mt-3 font-mono tracking-widest uppercase">{face === 'front' ? 'FRONT' : 'SECRET'} PREVIEW</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
