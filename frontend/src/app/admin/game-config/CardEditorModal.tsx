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

// ── CSS Gradient Helpers ──
const DIRECTIONS = [
  { l: '↓ للأسفل', v: 'to bottom', deg: '180deg' },
  { l: '↑ للأعلى', v: 'to top', deg: '0deg' },
  { l: '← لليسار', v: 'to left', deg: '270deg' },
  { l: '→ لليمين', v: 'to right', deg: '90deg' },
  { l: '↘ قطري', v: 'to bottom right', deg: '135deg' },
  { l: '↗ قطري عكسي', v: 'to top right', deg: '45deg' },
];

function parseGradient(g: string): { color1: string; color2: string; direction: string } {
  // parse CSS: linear-gradient(to bottom, #c1, #c2)
  const m = g?.match(/linear-gradient\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
  if (m) return { direction: m[1].trim(), color1: m[2].trim(), color2: m[3].trim() };
  return { color1: '#991b1b', color2: '#1a0000', direction: 'to bottom' };
}
function buildGradient(color1: string, color2: string, direction: string): string {
  return `linear-gradient(${direction}, ${color1}, ${color2})`;
}
function parseRgba(s: string): { color: string; opacity: number } {
  const m = s?.match(/rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
  if (m) {
    const hex = '#' + [m[1],m[2],m[3]].map(c => parseInt(c.trim()).toString(16).padStart(2,'0')).join('');
    return { color: hex, opacity: parseFloat(m[4]) };
  }
  if (s?.startsWith('#')) return { color: s.slice(0,7), opacity: 1 };
  return { color: '#ef4444', opacity: 0.6 };
}
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
function parseGlow(s: string): { color: string; size: number; opacity: number } {
  const m = s?.match(/0\s+0\s+(\d+)px\s+rgba\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
  if (m) {
    const hex = '#' + [m[2],m[3],m[4]].map(c => parseInt(c.trim()).toString(16).padStart(2,'0')).join('');
    return { size: parseInt(m[1]), color: hex, opacity: parseFloat(m[5]) };
  }
  return { color: '#fbbf24', size: 40, opacity: 0 };
}
function buildGlow(color: string, size: number, opacity: number): string {
  if (opacity <= 0) return '';
  const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
  return `0 0 ${size}px rgba(${r}, ${g}, ${b}, ${opacity})`;
}

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

type Tab = 'colors' | 'icon' | 'typography' | 'elements' | 'shapes' | 'secret';
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
  const [previewHasPhoto, setPreviewHasPhoto] = useState(true);

  const el = editing.elements || { showPlayerNumber: true, showClubBranding: true, showDescription: true };
  const setEl = (p: any) => setEditing({ ...editing, elements: { ...el, ...p } });
  const pos = el.positions || {};
  const setPos = (key: string, deltaX: number, deltaY: number, newScale?: number) => {
    const current = pos[key] || { x: 0, y: 0, s: 1 };
    setEl({ positions: { ...pos, [key]: { x: current.x + deltaX, y: current.y + deltaY, s: newScale ?? current.s } } });
  };
  const onWheelScale = (e: React.WheelEvent, key: string) => {
    e.stopPropagation();
    const current = pos[key] || { x: 0, y: 0, s: 1 };
    const ds = e.deltaY > 0 ? -0.1 : 0.1;
    const newS = Math.max(0.1, Math.min((current.s || 1) + ds, 5));
    setPos(key, 0, 0, newS);
  };

  const addShape = (f: 'role'|'cover') => {
    const s = { id: Math.random().toString(36).substring(2), face: f, type: 'rect', x: 0, y: 0, w: 100, h: 50, bg: '#ffffff', opacity: 0.5, zIndex: 0, radius: 0 };
    setEl({ shapes: [...(el.shapes || []), s] });
  };
  const updateShape = (id: string, updates: any) => {
    setEl({ shapes: (el.shapes || []).map((s:any) => s.id === id ? { ...s, ...updates } : s) });
  };
  const removeShape = (id: string) => {
    setEl({ shapes: (el.shapes || []).filter((s:any) => s.id !== id) });
  };

  const font = el.fontFamily || 'Amiri, serif';
  const iconSize = el.iconSize || 48;
  const nameSize = el.nameSize || 20;
  const badgeSize = el.badgeSize || 10;

  const TABS: { k: Tab | 'shapes'; l: string; i: string }[] = [
    { k: 'colors', l: 'الألوان', i: '🎨' },
    { k: 'icon', l: 'الأيقونة', i: '✦' },
    { k: 'typography', l: 'الخطوط', i: '𝐀' },
    { k: 'elements', l: 'العناصر', i: '⚙' },
    { k: 'shapes', l: 'الأشكال', i: '🔳' },
    { k: 'secret', l: 'تصميم جاهز', i: '📤' },
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
            {tab === 'colors' && (() => {
              const grad = parseGradient(editing.gradient || '');
              const border = parseRgba(editing.borderColor || '');
              const text = parseRgba(editing.textColor || '');
              const glow = parseGlow(editing.glowEffect || '');
              return <>
              {/* التدرج اللوني */}
              <div className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-3">
                <label className="text-xs text-gray-400 font-bold block">🎨 التدرج اللوني</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] text-gray-500 block mb-1">اللون الأول</span>
                    <input type="color" value={grad.color1} onChange={e => setEditing({ ...editing, gradient: buildGradient(e.target.value, grad.color2, grad.direction) })}
                      className="w-full h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  </div>
                  <button onClick={() => setEditing({ ...editing, gradient: buildGradient(grad.color2, grad.color1, grad.direction) })}
                    className="mt-4 p-2 text-gray-400 hover:text-amber-400 transition" title="عكس الترتيب">⇄</button>
                  <div className="flex-1">
                    <span className="text-[10px] text-gray-500 block mb-1">اللون الثاني</span>
                    <input type="color" value={grad.color2} onChange={e => setEditing({ ...editing, gradient: buildGradient(grad.color1, e.target.value, grad.direction) })}
                      className="w-full h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block mb-1">اتجاه التدرج</span>
                  <div className="flex flex-wrap gap-1">
                    {DIRECTIONS.map(d => (
                      <button key={d.v} onClick={() => setEditing({ ...editing, gradient: buildGradient(grad.color1, grad.color2, d.v) })}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] border transition ${grad.direction === d.v ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800 text-gray-500 border-gray-700/40 hover:text-gray-300'}`}>{d.l}</button>
                    ))}
                  </div>
                </div>
                <div className="h-6 rounded-lg" style={{ background: editing.gradient || 'linear-gradient(to bottom, #991b1b, #1a0000)' }} />
              </div>
              {/* لون الحدود */}
              <div className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                <label className="text-xs text-gray-400 font-bold block">🔲 لون الحدود</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={border.color} onChange={e => setEditing({ ...editing, borderColor: hexToRgba(e.target.value, border.opacity) })}
                    className="w-12 h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  <div className="flex-1">
                    <span className="text-[10px] text-gray-500">الشفافية: {Math.round(border.opacity*100)}%</span>
                    <input type="range" min="0" max="1" step="0.05" value={border.opacity} onChange={e => setEditing({ ...editing, borderColor: hexToRgba(border.color, +e.target.value) })}
                      className="w-full accent-amber-500" />
                  </div>
                </div>
              </div>
              {/* لون النص */}
              <div className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                <label className="text-xs text-gray-400 font-bold block">✏️ لون النص</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={text.color} onChange={e => setEditing({ ...editing, textColor: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  <span className="text-sm font-bold" style={{ color: editing.textColor || '#fca5a5' }}>معاينة النص</span>
                </div>
              </div>
              {/* التوهج */}
              <div className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                <label className="text-xs text-gray-400 font-bold block">✨ التوهج</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={glow.color} onChange={e => setEditing({ ...editing, glowEffect: buildGlow(e.target.value, glow.size, glow.opacity) })}
                    className="w-12 h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent" />
                  <div className="flex-1 space-y-1">
                    <div><span className="text-[10px] text-gray-500">الحجم: {glow.size}px</span>
                    <input type="range" min="10" max="100" value={glow.size} onChange={e => setEditing({ ...editing, glowEffect: buildGlow(glow.color, +e.target.value, glow.opacity) })}
                      className="w-full accent-amber-500" /></div>
                    <div><span className="text-[10px] text-gray-500">القوة: {Math.round(glow.opacity*100)}%</span>
                    <input type="range" min="0" max="0.8" step="0.05" value={glow.opacity} onChange={e => setEditing({ ...editing, glowEffect: buildGlow(glow.color, glow.size, +e.target.value) })}
                      className="w-full accent-amber-500" /></div>
                  </div>
                </div>
              </div>
              {/* شارة الفريق */}
              <div className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                <label className="text-xs text-gray-400 font-bold block">🏷️ نص شارة الفريق</label>
                <input value={editing.teamBadge?.text || ''} onChange={e => setEditing({ ...editing, teamBadge: { ...(editing.teamBadge || { bgColor: 'rgba(30,58,138,0.6)', textColor: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' }), text: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none" />
              </div>
            </>; })()}

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

            {/* Tab: Shapes */}
            {tab === 'shapes' && <>
              <div className="flex gap-2 mb-4">
                <button onClick={() => addShape('role')} className="flex-1 py-2 bg-gray-800/80 border border-gray-700 rounded-xl text-xs hover:border-amber-500/50 text-gray-300">
                  + شكل للوجه المكشوف
                </button>
                <button onClick={() => addShape('cover')} className="flex-1 py-2 bg-gray-800/80 border border-gray-700 rounded-xl text-xs hover:border-amber-500/50 text-gray-300">
                  + شكل لوجه الغلاف
                </button>
              </div>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {(el.shapes || []).filter((s:any)=> s.face === (face === 'front' ? 'cover' : 'role')).map((s:any, i:number) => (
                  <div key={s.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-300">شكل {i+1}</span>
                      <button onClick={() => removeShape(s.id)} className="text-rose-500 hover:text-rose-400">✕</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                       <label className="text-gray-500">العرض: <input type="number" value={s.w} onChange={e => updateShape(s.id, {w: +e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 mt-1 text-gray-300" /></label>
                       <label className="text-gray-500">الطول: <input type="number" value={s.h} onChange={e => updateShape(s.id, {h: +e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 mt-1 text-gray-300" /></label>
                       <label className="text-gray-500">اللون: <input type="color" value={s.bg} onChange={e => updateShape(s.id, {bg: e.target.value})} className="w-full h-7 bg-gray-900 border border-gray-700 rounded mt-1" /></label>
                       <label className="text-gray-500">الطبقة (Z): <input type="number" value={s.zIndex} onChange={e => updateShape(s.id, {zIndex: +e.target.value})} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 mt-1 text-gray-300" /></label>
                       <label className="text-gray-500 col-span-2 flex items-center gap-2">الشفافية: 
                         <input type="range" min="0" max="1" step="0.1" value={s.opacity} onChange={e => updateShape(s.id, {opacity: +e.target.value})} className="flex-1 accent-amber-500" />
                       </label>
                       <label className="text-gray-500 col-span-2 flex items-center gap-2">الزوايا: 
                         <input type="range" min="0" max="100" value={s.radius} onChange={e => updateShape(s.id, {radius: +e.target.value})} className="flex-1 accent-amber-500" />
                       </label>
                    </div>
                  </div>
                ))}
                {(el.shapes || []).filter((s:any)=> s.face === (face === 'front' ? 'cover' : 'role')).length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">لا توجد أشكال مضافة لهذا الوجه</p>
                )}
              </div>
            </>}

            {/* Tab: Secret Face -> Custom Design */}
            {tab === 'secret' && <>
              <p className="text-xs text-gray-500 mb-2">رفع تصميم جاهز لوجه الدور (يلغي التصميم التلقائي)</p>
              {editing.secretFace?.customImageUrl && (
                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl border border-gray-700/40">
                  <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${editing.secretFace.customImageUrl}`} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-700" />
                  <span className="text-[10px] text-gray-500 truncate flex-1">{editing.secretFace.customImageUrl}</span>
                  <button onClick={() => setEditing({ ...editing, secretFace: null })} className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg">✕</button>
                </div>
              )}
              {editing.id && !isNew && (
                <div>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="sf-upload" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
                  <label htmlFor="sf-upload" className="block w-full py-3 text-center bg-gray-800/80 text-amber-400 border border-dashed border-amber-600/50 rounded-xl text-sm cursor-pointer hover:bg-amber-500/10 transition">
                    📤 رفع تصميم مخصص
                  </label>
                  <p className="text-[10px] text-gray-600 mt-1 text-center">يُفضل أبعاد 2:3 (مثال 400x600 بكسل)</p>
                </div>
              )}
              {isNew && <p className="text-xs text-amber-400/70 text-center p-4 bg-amber-500/5 rounded-xl border border-amber-500/10">احفظ القالب أولاً ثم ارفع الصورة</p>}
            </>}
          </div>

          {/* Preview Panel */}
          <div className="w-72 border-r border-gray-800 flex flex-col items-center py-5 px-4 shrink-0 bg-gray-950/50">
            {/* Face Toggle */}
            <div className="flex flex-col gap-2 w-full mb-4">
              <div className="flex gap-1 bg-gray-800/80 rounded-xl p-1 w-full">
                <button onClick={() => setFace('front')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition ${face === 'front' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>وجه الغلاف</button>
                <button onClick={() => setFace('secret')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition ${face === 'secret' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>وجه الدور</button>
              </div>
              {face === 'front' && (
                <label className="flex items-center justify-center gap-2 text-[10px] text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={previewHasPhoto} onChange={e => setPreviewHasPhoto(e.target.checked)} className="accent-amber-500" />
                  مع صورة اللاعب
                </label>
              )}
              {face === 'secret' && !editing.secretFace?.customImageUrl && (
                 <p className="text-[9px] text-amber-500/70 text-center">يمكنك سحب العناصر بالماوس لتغيير موقعها 🖐️</p>
              )}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-1.5 mt-2">
                <p className="text-[9px] text-amber-400 text-center flex items-center justify-center gap-1">
                  <span>💡</span>
                  <span>لتكبير أو تصغير أي عنصر، ضع الماوس فوقه واستخدم عجلة التمرير (Scroll)!</span>
                </p>
              </div>
            </div>

            {/* Card Preview */}
            <div className="w-56 h-80 rounded-2xl overflow-hidden relative transition-all duration-300" style={{ border: face === 'secret' ? `2px solid ${editing.borderColor || 'rgba(107,114,128,0.4)'}` : '2px solid rgba(197,160,89,0.4)', boxShadow: face === 'secret' ? (editing.glowEffect || 'none') : 'none' }}>
              {face === 'front' ? (
                /* Cover Face (The 'Front' in CSS, what others see) */
                <div className="absolute inset-0 bg-black flex flex-col overflow-hidden">
                  {/* Top 2/3 */}
                  <div className="relative h-[66.66%] w-full">
                    <motion.div 
                      drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'coverPhoto')} onDragEnd={(e, info) => setPos('coverPhoto', info.offset.x, info.offset.y)}
                      animate={{ x: pos.coverPhoto?.x || 0, y: pos.coverPhoto?.y || 0, scale: pos.coverPhoto?.s || 1 }}
                      className="absolute inset-0 cursor-move hover:ring-2 ring-white/30" style={{ zIndex: 1 }}
                    >
                      {previewHasPhoto ? (
                         <img src="https://ui-avatars.com/api/?name=Player&background=random" alt="Cover" className="w-full h-full object-cover opacity-80" />
                      ) : (
                         <div className="w-full h-full bg-gradient-to-b from-zinc-700/50 via-zinc-900/80 to-black" />
                      )}
                    </motion.div>
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent pointer-events-none" style={{ zIndex: 2 }} />
                    
                    {/* Player Number */}
                    <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5 }}>
                      <motion.span 
                        drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'coverNumber')} onDragEnd={(e, info) => setPos('coverNumber', info.offset.x, info.offset.y)}
                        animate={{ x: pos.coverNumber?.x || 0, y: pos.coverNumber?.y || 0, scale: pos.coverNumber?.s || 1 }}
                        className="font-mono font-black text-[#C5A059] cursor-move hover:ring-2 ring-white/30 rounded" style={{ fontSize: '5.5rem', opacity: previewHasPhoto ? 0.9 : 0.35, textShadow: previewHasPhoto ? '0 2px 10px rgba(0,0,0,0.9)' : '0 4px 20px rgba(0,0,0,0.8)', lineHeight: 1 }}>
                        7
                      </motion.span>
                    </div>
                  </div>

                  {/* Bottom 1/3 */}
                  <div className="relative h-[33.33%] flex flex-col items-center justify-center px-3 bg-black" style={{ zIndex: 5 }}>
                    <div className="absolute top-0 left-[15%] right-[15%] h-[1px] bg-[#C5A059]/30" />
                    <motion.h2 
                      drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'coverName')} onDragEnd={(e, info) => setPos('coverName', info.offset.x, info.offset.y)}
                      animate={{ x: pos.coverName?.x || 0, y: pos.coverName?.y || 0, scale: pos.coverName?.s || 1 }}
                      className="text-xl font-black text-white text-center leading-tight cursor-move hover:ring-2 ring-white/30 rounded px-2" style={{ fontFamily: 'Amiri, serif' }}>
                      اللاعب
                    </motion.h2>
                    <motion.p 
                      drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'coverBranding')} onDragEnd={(e, info) => setPos('coverBranding', info.offset.x, info.offset.y)}
                      animate={{ x: pos.coverBranding?.x || 0, y: pos.coverBranding?.y || 0, scale: pos.coverBranding?.s || 1 }}
                      className="text-[8px] font-mono tracking-[0.25em] uppercase mt-1 text-[#C5A059]/40 cursor-move hover:ring-2 ring-white/30 rounded px-1">
                      MAFIA CLUB
                    </motion.p>
                    <motion.span 
                      drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'coverFooter')} onDragEnd={(e, info) => setPos('coverFooter', info.offset.x, info.offset.y)}
                      animate={{ x: pos.coverFooter?.x || 0, y: pos.coverFooter?.y || 0, scale: pos.coverFooter?.s || 1 }}
                      className="text-[7px] text-zinc-600 font-mono tracking-widest uppercase mt-1 cursor-move hover:ring-2 ring-white/30 rounded px-1">اضغط للكشف</motion.span>
                  </div>

                  {/* Shapes on Cover Face (Rendered last so they sit on top and are draggable) */}
                  {(el.shapes || []).filter((s:any) => s.face === 'cover').map((s:any) => (
                    <motion.div key={s.id} drag dragMomentum={false} dragElastic={0} onDragEnd={(e, info) => updateShape(s.id, { x: s.x + info.offset.x, y: s.y + info.offset.y })} animate={{ x: s.x, y: s.y }} className="absolute cursor-move hover:ring-2 ring-amber-500/80 group" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2 }}>
                      <div className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                    </motion.div>
                  ))}
                </div>
              ) : (
                /* Role Face (The 'Back' in CSS, flipped, what the player sees) */
                <div className="absolute inset-0 flex flex-col overflow-hidden">
                  {editing.secretFace?.customImageUrl ? (
                    <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${editing.secretFace.customImageUrl}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <>
                      <div className="absolute inset-0" style={{ background: editing.gradient || 'linear-gradient(to bottom, #3f3f46, #18181b)' }} />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top right, transparent, rgba(255,255,255,0.03), transparent)' }} />
                      
                      {/* شارة */}
                      {editing.teamBadge && (
                        <motion.div 
                          drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'badge')}
                          onDragEnd={(e, info) => setPos('badge', info.offset.x, info.offset.y)}
                          animate={{ x: pos.badge?.x || 0, y: pos.badge?.y || 0, scale: pos.badge?.s || 1 }}
                          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-2.5 py-0.5 rounded-full font-mono cursor-move hover:ring-2 ring-white/30"
                          style={{ fontSize: badgeSize, backgroundColor: editing.teamBadge.bgColor || 'rgba(30,58,138,0.6)', color: editing.teamBadge.textColor || '#93c5fd', border: `1px solid ${editing.teamBadge.borderColor || 'rgba(59,130,246,0.3)'}` }}>
                          {editing.teamBadge.text}
                        </motion.div>
                      )}

                      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4 pt-12">
                         <motion.div 
                           drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'number')}
                           onDragEnd={(e, info) => setPos('number', info.offset.x, info.offset.y)}
                           animate={{ x: pos.number?.x || 0, y: pos.number?.y || 0, scale: pos.number?.s || 1 }}
                           className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center font-mono text-sm font-bold rounded-md bg-black/40 cursor-move hover:ring-2 ring-white/30"
                           style={{ border: `1px solid ${editing.borderColor || 'rgba(107,114,128,0.4)'}`, color: editing.textColor || '#d4d4d8' }}>
                           7
                         </motion.div>

                        <motion.div 
                          drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'icon')}
                          onDragEnd={(e, info) => setPos('icon', info.offset.x, info.offset.y)}
                          animate={{ x: pos.icon?.x || 0, y: pos.icon?.y || 0, scale: pos.icon?.s || 1 }}
                          className="rounded-full flex items-center justify-center mb-5 cursor-move hover:ring-2 ring-white/30"
                          style={{ width: iconSize + 20, height: iconSize + 20, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)', border: `2px solid ${editing.borderColor || 'rgba(107,114,128,0.4)'}`, color: editing.textColor || '#d4d4d8' }}>
                          {editing.icon?.type?.toLowerCase() === 'emoji' ? (
                            <span style={{ fontSize: iconSize * 0.6 }}>{editing.icon.value}</span>
                          ) : editing.icon?.type?.toLowerCase() === 'lucide' ? (
                            <LI name={editing.icon.value} size={iconSize * 0.6} />
                          ) : <span style={{ fontSize: iconSize * 0.6 }}>✦</span>}
                        </motion.div>
                        
                        <motion.div
                          drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'title')}
                          onDragEnd={(e, info) => setPos('title', info.offset.x, info.offset.y)}
                          animate={{ x: pos.title?.x || 0, y: pos.title?.y || 0, scale: pos.title?.s || 1 }}
                          className="cursor-move hover:ring-2 ring-white/30 rounded px-2"
                        >
                          <h3 className="font-black mb-2 text-center leading-tight"
                            style={{ fontFamily: font, fontSize: nameSize, color: editing.textColor || '#d4d4d8' }}>
                            {linkedRoles[0]?.nameAr || 'اسم الدور'}
                          </h3>
                        </motion.div>
                        
                        {el.showPlayerNumber && (
                           <motion.p 
                             drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'playerName')}
                             onDragEnd={(e, info) => setPos('playerName', info.offset.x, info.offset.y)}
                             animate={{ x: pos.playerName?.x || 0, y: pos.playerName?.y || 0, scale: pos.playerName?.s || 1 }}
                             className="text-white/40 text-sm font-mono mt-1 cursor-move hover:ring-2 ring-white/30 px-2 rounded" dir="ltr">اللاعب</motion.p>
                        )}
                        
                        <div className="w-20 h-[1px] my-4" style={{ backgroundColor: editing.borderColor || 'rgba(255,255,255,0.1)' }} />
                        
                        <motion.div
                          drag dragMomentum={false} dragElastic={0} onWheel={e => onWheelScale(e, 'footer')}
                          onDragEnd={(e, info) => setPos('footer', info.offset.x, info.offset.y)}
                          animate={{ x: pos.footer?.x || 0, y: pos.footer?.y || 0, scale: pos.footer?.s || 1 }}
                          className="mt-auto cursor-move hover:ring-2 ring-white/30 px-2 py-1 rounded"
                        >
                          {el.customFooterText ? (
                            <span className="text-[9px] text-zinc-500" style={{ fontFamily: font }}>{el.customFooterText}</span>
                          ) : (
                            <span className="text-[9px] text-zinc-600 font-mono tracking-widest uppercase">اضغط للإخفاء</span>
                          )}
                        </motion.div>
                      </div>

                      {/* Shapes on Role Face (Rendered last so they sit on top and are draggable) */}
                      {(el.shapes || []).filter((s:any) => s.face === 'role').map((s:any) => (
                        <motion.div key={s.id} drag dragMomentum={false} dragElastic={0} onDragEnd={(e, info) => updateShape(s.id, { x: s.x + info.offset.x, y: s.y + info.offset.y })} animate={{ x: s.x, y: s.y }} className="absolute cursor-move hover:ring-2 ring-amber-500/80 group" style={{ width: s.w, height: s.h, backgroundColor: s.bg, opacity: s.opacity, zIndex: s.zIndex, borderRadius: s.radius, top: '50%', left: '50%', marginTop: -s.h/2, marginLeft: -s.w/2 }}>
                          <div className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-amber-500 rounded-full opacity-0 group-hover:opacity-100 pointer-events-none" />
                        </motion.div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-600 mt-3 font-mono tracking-widest uppercase">{face === 'front' ? 'COVER FACE' : 'ROLE FACE'}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
