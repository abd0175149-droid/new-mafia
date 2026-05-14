'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gcFetch } from './helpers';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';

// ── Types ──
interface RankFx {
  border: { enabled: boolean; color: string; width: number; inset: number; style: 'solid'|'gradient'|'traveling'; gradientColors: string[]; travelSpeed: number };
  glow: { enabled: boolean; color: string; size: number; opacity: number; pulseEnabled: boolean; pulseDuration: number };
  shimmer: { enabled: boolean; color: string; opacity: number; duration: number };
  particles: { enabled: boolean; count: number; color: string; size: number; orbitRadius: string; baseDuration: number };
  corners: { enabled: boolean; color: string; size: number; width: number; pulseEnabled: boolean };
  gradientOverlay: { enabled: boolean; color: string; opacity: number; direction: string };
  floating: { enabled: boolean; content: string; position: 'top'|'bottom'; size: number; animation: 'float'|'bounce'|'spin'; glowColor: string; offsetX?: number; offsetY?: number };
  badge: { enabled: boolean; emoji: string; label: string; bgColor: string; textColor: string; borderColor: string; position: string; offsetX?: number; offsetY?: number };
  nameEffect: { enabled: boolean; color: string; glowColor: string; glowSize: number };
}

interface RankItem { id: string; nameAr: string; sortOrder: number; effects: RankFx; }

// ── Helpers ──
function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Sub-components ──
function Toggle({ val, set, label }: { val: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => set(!val)} className={`w-9 h-5 rounded-full transition-colors relative ${val ? 'bg-amber-500' : 'bg-gray-700'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-xs text-gray-300">{label}</span>
    </label>
  );
}

function ColorInput({ val, set, label }: { val: string; set: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={val} onChange={e => set(e.target.value)} className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent" />
      <span className="text-xs text-gray-400">{label}</span>
      <input type="text" value={val} onChange={e => set(e.target.value)} className="w-20 text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300 font-mono" />
    </label>
  );
}

function Slider({ val, set, label, min, max, step = 1, unit = '' }: { val: number; set: (v: number) => void; label: string; min: number; max: number; step?: number; unit?: string }) {
  return (
    <label className="flex items-center gap-2 w-full">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))} className="flex-1 accent-amber-500 h-1" />
      <span className="text-[10px] text-gray-500 font-mono w-12 text-left">{val}{unit}</span>
    </label>
  );
}

function Section({ title, icon, children, enabled, onToggle }: { title: string; icon: string; children: React.ReactNode; enabled?: boolean; onToggle?: (v: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${enabled ? 'border-amber-500/30 bg-gray-800/40' : 'border-gray-700/30 bg-gray-900/20'}`}>
      <div className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium text-gray-200">{title}</span>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {onToggle && <Toggle val={!!enabled} set={onToggle} label="" />}
          <span className={`text-gray-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </div>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

// ── Main Component ──
export default function RankEffectsSection() {
  const [ranks, setRanks] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [previewFace, setPreviewFace] = useState<'cover'|'role'>('cover');
  const [dragMode, setDragMode] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ el: 'badge'|'floating'|null; startX: number; startY: number; origX: number; origY: number }>({ el: null, startX: 0, startY: 0, origX: 0, origY: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await gcFetch('/rank-effects');
      const data = d.data || d || [];
      setRanks(data);
      if (!activeId && data.length > 0) setActiveId(data[0].id);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = ranks.find(r => r.id === activeId) || null;
  const fx = active?.effects;

  const setFx = (section: keyof RankFx, patch: any) => {
    if (!active) return;
    const updated = ranks.map(r => r.id === active.id ? { ...r, effects: { ...r.effects, [section]: { ...r.effects[section], ...patch } } } : r);
    setRanks(updated);
  };

  const save = async () => {
    if (!active) return;
    setSaving(true); setMsg('');
    try {
      await gcFetch(`/rank-effects/${encodeURIComponent(active.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ nameAr: active.nameAr, sortOrder: active.sortOrder, effects: active.effects }),
      });
      setMsg('✅ تم الحفظ');
      setTimeout(() => setMsg(''), 2000);
    } catch (e: any) { setMsg('❌ ' + e.message); }
    setSaving(false);
  };

  const seed = async () => {
    try {
      await gcFetch('/rank-effects/seed', { method: 'POST' });
      await load();
      setMsg('✅ تم بذر البيانات الافتراضية');
      setTimeout(() => setMsg(''), 2000);
    } catch { }
  };

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;
  if (ranks.length === 0) return (
    <div className="text-center py-10">
      <p className="text-gray-400 text-sm mb-4">لا توجد رتب محفوظة بعد</p>
      <button onClick={seed} className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-sm hover:bg-amber-500/25 transition">🎖️ بذر الرتب الافتراضية</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Rank selector bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {ranks.map(r => (
          <button key={r.id} onClick={() => setActiveId(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${activeId === r.id ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-gray-800/50 text-gray-400 border-gray-700/40 hover:border-gray-600'}`}>
            {r.effects.badge?.emoji || '○'} {r.nameAr}
          </button>
        ))}
      </div>

      {active && fx && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* Preview */}
          <div className="flex flex-col items-center gap-3 p-4 bg-gray-900/50 border border-gray-700/30 rounded-2xl">
            <div className="flex gap-2 mb-1">
              <button onClick={() => setPreviewFace('cover')} className={`text-[10px] px-2 py-0.5 rounded ${previewFace === 'cover' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500'}`}>الغلاف</button>
              <button onClick={() => setPreviewFace('role')} className={`text-[10px] px-2 py-0.5 rounded ${previewFace === 'role' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500'}`}>الدور</button>
              <button onClick={() => setDragMode(!dragMode)} className={`text-[10px] px-2 py-0.5 rounded ${dragMode ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'text-gray-500 border border-gray-700/30'}`}>
                {dragMode ? '✋ وضع السحب' : '🖱️ تحريك'}
              </button>
            </div>
            <div
              ref={previewRef}
              className={`relative ${dragMode ? 'cursor-grab' : ''}`}
              onMouseDown={e => {
                if (!dragMode || !fx) return;
                const rect = previewRef.current?.getBoundingClientRect();
                if (!rect) return;
                const target = e.target as HTMLElement;
                const el = target.closest('[data-rank-el]') as HTMLElement;
                if (!el) return;
                const elType = el.dataset.rankEl as 'badge'|'floating';
                const section = elType === 'badge' ? fx.badge : fx.floating;
                dragRef.current = { el: elType, startX: e.clientX, startY: e.clientY, origX: section.offsetX || 0, origY: section.offsetY || 0 };
                e.preventDefault();
                const onMove = (ev: MouseEvent) => {
                  const d = dragRef.current;
                  if (!d.el) return;
                  const dx = ev.clientX - d.startX;
                  const dy = ev.clientY - d.startY;
                  setFx(d.el, { offsetX: Math.round(d.origX + dx), offsetY: Math.round(d.origY + dy) });
                };
                const onUp = () => {
                  dragRef.current.el = null;
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
            <DynamicMafiaCard
              playerNumber={7}
              playerName="لاعب تجريبي"
              role={previewFace === 'role' ? 'GODFATHER' : null}
              isFlipped={previewFace === 'role'}
              flippable={false}
              size="md"
              rankTier={active.id}
              rankEffectsOverride={fx}
              rankEditable={dragMode}
              gender="MALE"
            />
            {dragMode && (
              <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-green-500/30 pointer-events-none" />
            )}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={save} disabled={saving} className="px-4 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg text-xs hover:bg-amber-500/25 transition disabled:opacity-50">
                {saving ? '...' : '💾 حفظ'}
              </button>
              <button onClick={() => load()} className="px-3 py-1.5 bg-gray-700/30 text-gray-400 border border-gray-600/30 rounded-lg text-xs hover:bg-gray-700/50 transition">🔄</button>
            </div>
            {msg && <p className="text-xs text-center mt-1">{msg}</p>}
          </div>

          {/* Controls */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {/* Name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400">اسم الرتبة:</span>
              <input value={active.nameAr} onChange={e => setRanks(ranks.map(r => r.id === active.id ? { ...r, nameAr: e.target.value } : r))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white" />
            </div>

            {/* 1. Border */}
            <Section title="الإطار والتوهج" icon="🔲" enabled={fx.border.enabled} onToggle={v => setFx('border', { enabled: v })}>
              <ColorInput val={fx.border.color} set={v => setFx('border', { color: v })} label="اللون" />
              <Slider val={fx.border.width} set={v => setFx('border', { width: v })} label="السمك" min={0.5} max={4} step={0.5} unit="px" />
              <Slider val={Math.abs(fx.border.inset)} set={v => setFx('border', { inset: -v })} label="الإزاحة" min={1} max={5} step={1} unit="px" />
              <div className="flex gap-1">
                {(['solid','gradient','traveling'] as const).map(s => (
                  <button key={s} onClick={() => setFx('border', { style: s })}
                    className={`text-[10px] px-2 py-0.5 rounded ${fx.border.style === s ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500 hover:text-gray-300'}`}>{s}</button>
                ))}
              </div>
              {fx.border.style !== 'solid' && (
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-500">ألوان التدرج (فاصلة):</span>
                  <input value={(fx.border.gradientColors || []).join(',')} onChange={e => setFx('border', { gradientColors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 font-mono" placeholder="#color1,#color2" />
                </div>
              )}
              <hr className="border-gray-700/30 my-1" />
              <Toggle val={fx.glow.enabled} set={v => setFx('glow', { enabled: v })} label="تفعيل التوهج" />
              {fx.glow.enabled && <>
                <ColorInput val={fx.glow.color} set={v => setFx('glow', { color: v })} label="لون التوهج" />
                <Slider val={fx.glow.size} set={v => setFx('glow', { size: v })} label="الحجم" min={0} max={40} unit="px" />
                <Slider val={fx.glow.opacity} set={v => setFx('glow', { opacity: v })} label="الشفافية" min={0} max={1} step={0.05} />
                <Toggle val={fx.glow.pulseEnabled} set={v => setFx('glow', { pulseEnabled: v })} label="نبض" />
                {fx.glow.pulseEnabled && <Slider val={fx.glow.pulseDuration} set={v => setFx('glow', { pulseDuration: v })} label="سرعة النبض" min={1} max={6} step={0.5} unit="s" />}
              </>}
            </Section>

            {/* 2. Shimmer */}
            <Section title="اللمعة" icon="✨" enabled={fx.shimmer.enabled} onToggle={v => setFx('shimmer', { enabled: v })}>
              <ColorInput val={fx.shimmer.color} set={v => setFx('shimmer', { color: v })} label="اللون" />
              <Slider val={fx.shimmer.opacity} set={v => setFx('shimmer', { opacity: v })} label="الشفافية" min={0} max={0.3} step={0.01} />
              <Slider val={fx.shimmer.duration} set={v => setFx('shimmer', { duration: v })} label="السرعة" min={2} max={10} step={0.5} unit="s" />
            </Section>

            {/* 3. Particles */}
            <Section title="الجزيئات" icon="🟡" enabled={fx.particles.enabled} onToggle={v => setFx('particles', { enabled: v })}>
              <div className="flex gap-1 mb-1">
                {(['orbit','burst'] as const).map(t => (
                  <button key={t} onClick={() => setFx('particles', { animationType: t })}
                    className={`text-[10px] px-2 py-0.5 rounded ${(fx.particles.animationType || 'orbit') === t ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500 hover:text-gray-300'}`}>
                    {t === 'orbit' ? '🔄 دوران' : '💥 انفجار'}
                  </button>
                ))}
              </div>
              <Slider val={fx.particles.count} set={v => setFx('particles', { count: v })} label="العدد" min={1} max={8} />
              <ColorInput val={fx.particles.color} set={v => setFx('particles', { color: v })} label="اللون" />
              <Slider val={fx.particles.size} set={v => setFx('particles', { size: v })} label="الحجم" min={1} max={8} unit="px" />
              <Slider val={fx.particles.baseDuration} set={v => setFx('particles', { baseDuration: v })} label="السرعة" min={1} max={8} step={0.5} unit="s" />
              <hr className="border-gray-700/30 my-1" />
              <span className="text-[10px] text-gray-500">نقطة الانطلاق (%)</span>
              <Slider val={fx.particles.originX ?? 50} set={v => setFx('particles', { originX: v })} label="أفقي X" min={0} max={100} unit="%" />
              <Slider val={fx.particles.originY ?? 50} set={v => setFx('particles', { originY: v })} label="عمودي Y" min={0} max={100} unit="%" />
            </Section>

            {/* 4. Corners */}
            <Section title="الزوايا المزخرفة" icon="🔳" enabled={fx.corners.enabled} onToggle={v => setFx('corners', { enabled: v })}>
              <ColorInput val={fx.corners.color} set={v => setFx('corners', { color: v })} label="اللون" />
              <Slider val={fx.corners.size} set={v => setFx('corners', { size: v })} label="الحجم" min={6} max={24} unit="px" />
              <Slider val={fx.corners.width} set={v => setFx('corners', { width: v })} label="السمك" min={1} max={4} unit="px" />
              <Toggle val={fx.corners.pulseEnabled} set={v => setFx('corners', { pulseEnabled: v })} label="نبض" />
            </Section>

            {/* 5. Gradient Overlay */}
            <Section title="طبقة التدرج" icon="🌈" enabled={fx.gradientOverlay.enabled} onToggle={v => setFx('gradientOverlay', { enabled: v })}>
              <ColorInput val={fx.gradientOverlay.color} set={v => setFx('gradientOverlay', { color: v })} label="اللون" />
              <Slider val={fx.gradientOverlay.opacity} set={v => setFx('gradientOverlay', { opacity: v })} label="الشفافية" min={0} max={0.2} step={0.01} />
              <div className="flex gap-1">
                {['to top','to bottom','135deg'].map(d => (
                  <button key={d} onClick={() => setFx('gradientOverlay', { direction: d })}
                    className={`text-[10px] px-2 py-0.5 rounded ${fx.gradientOverlay.direction === d ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500'}`}>{d}</button>
                ))}
              </div>
            </Section>

            {/* 6. Floating Element */}
            <Section title="العنصر العائم" icon="👑" enabled={fx.floating.enabled} onToggle={v => setFx('floating', { enabled: v })}>
              <label className="flex items-center gap-2">
                <span className="text-xs text-gray-400">المحتوى:</span>
                <input value={fx.floating.content} onChange={e => setFx('floating', { content: e.target.value })}
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-sm text-center" />
              </label>
              <Slider val={fx.floating.size} set={v => setFx('floating', { size: v })} label="الحجم" min={10} max={28} unit="px" />
              <div className="flex gap-1">
                {(['float','bounce','spin'] as const).map(a => (
                  <button key={a} onClick={() => setFx('floating', { animation: a })}
                    className={`text-[10px] px-2 py-0.5 rounded ${fx.floating.animation === a ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500'}`}>{a}</button>
                ))}
              </div>
              <ColorInput val={fx.floating.glowColor} set={v => setFx('floating', { glowColor: v })} label="لون التوهج" />
              <Slider val={fx.floating.scale ?? 1} set={v => setFx('floating', { scale: v })} label="الحجم" min={0.5} max={3} step={0.1} unit="x" />
            </Section>

            {/* 7. Badge */}
            <Section title="شارة الرتبة" icon="🏷️" enabled={fx.badge.enabled} onToggle={v => setFx('badge', { enabled: v })}>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">إيموجي:</span>
                  <input value={fx.badge.emoji} onChange={e => setFx('badge', { emoji: e.target.value })} className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-sm text-center" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">النص:</span>
                  <input value={fx.badge.label} onChange={e => setFx('badge', { label: e.target.value })} className="flex-1 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs" />
                </label>
              </div>
              <ColorInput val={fx.badge.textColor} set={v => setFx('badge', { textColor: v })} label="لون النص" />
              <ColorInput val={fx.badge.borderColor.startsWith('rgba') ? '#6b7280' : fx.badge.borderColor} set={v => setFx('badge', { borderColor: v, bgColor: hexToRgba(v, 0.15) })} label="لون الإطار" />
              <Slider val={fx.badge.scale ?? 1} set={v => setFx('badge', { scale: v })} label="الحجم" min={0.5} max={3} step={0.1} unit="x" />
            </Section>

            {/* 8. Name Effect */}
            <Section title="تأثير الاسم" icon="✏️" enabled={fx.nameEffect.enabled} onToggle={v => setFx('nameEffect', { enabled: v })}>
              <ColorInput val={fx.nameEffect.color} set={v => setFx('nameEffect', { color: v })} label="لون النص" />
              <ColorInput val={fx.nameEffect.glowColor} set={v => setFx('nameEffect', { glowColor: v })} label="لون التوهج" />
              <Slider val={fx.nameEffect.glowSize} set={v => setFx('nameEffect', { glowSize: v })} label="حجم التوهج" min={0} max={20} unit="px" />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
