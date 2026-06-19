'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  computeRectSeats, computeDoorSeats, seatsTo2D, totalFromSides,
  type Sides, type Numbering, type RectDoor, type Side, type Corner,
} from '@/lib/rectLayout';

const Editor3D = dynamic(() => import('@/components/SeatTemplate3DEditor'), {
  ssr: false,
  loading: () => <div className="h-[460px] flex items-center justify-center text-gray-600 bg-gray-900/60 rounded-2xl">⏳ تحميل المحرّر ثلاثي الأبعاد...</div>,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

interface PinnedSeat { seatNumber: number; playerId?: number; phone?: string; playerName: string }
interface SeatPosition { id: number; x: number; y: number }
interface LayoutConfig { shape: 'rectangle'; sides: Sides; numbering: Numbering; doors: RectDoor[]; doorSeats: number[] }
interface SeatTemplate {
  id: number; name: string; layoutType: string; totalSeats: number; reservedTailCount: number;
  pinnedSeats: PinnedSeat[]; constraintsConfig: any[]; seatPositions: SeatPosition[] | null;
  layoutConfig: LayoutConfig | null; isDefault: boolean; createdAt: string;
}

// ── توزيع عدد افتراضي على 4 أضلاع ──
function defaultSides(total: number): Sides {
  const s: Sides = { top: 0, right: 0, bottom: 0, left: 0 };
  const order: (keyof Sides)[] = ['top', 'bottom', 'right', 'left'];
  let rem = Math.max(6, total);
  let i = 0;
  while (rem > 0) { s[order[i % 4]]++; rem--; i++; }
  return s;
}

const SIDE_LABEL: Record<Side, string> = { top: 'أعلى', right: 'يمين', bottom: 'أسفل', left: 'يسار' };
const CORNER_LABEL: Record<Corner, string> = { TL: '↖ أعلى-يسار', TR: '↗ أعلى-يمين', BR: '↘ أسفل-يمين', BL: '↙ أسفل-يسار' };

// ══════════════════════════════════════════════════════
// محرّر 2D القديم (للدائري والصفوف فقط)
// ══════════════════════════════════════════════════════
function generatePositions(totalSeats: number, layout: string, width: number, height: number): SeatPosition[] {
  const positions: SeatPosition[] = [];
  const padding = 40;
  if (layout === 'circle') {
    const cx = width / 2, cy = height / 2, radius = Math.min(cx, cy) - padding;
    for (let i = 0; i < totalSeats; i++) {
      const angle = (2 * Math.PI * i) / totalSeats - Math.PI / 2;
      positions.push({ id: i + 1, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
  } else {
    const cols = Math.ceil(Math.sqrt(totalSeats * 1.5));
    const rows = Math.ceil(totalSeats / cols);
    const cellW = (width - padding * 2) / cols, cellH = (height - padding * 2) / rows;
    let placed = 0;
    for (let r = 0; r < rows && placed < totalSeats; r++)
      for (let c = 0; c < cols && placed < totalSeats; c++, placed++)
        positions.push({ id: placed + 1, x: padding + cellW * c + cellW / 2, y: padding + cellH * r + cellH / 2 });
  }
  return positions;
}

function Svg2DEditor({ totalSeats, layoutType, reservedTailCount, pinnedSeats, selectedSeat, onSelectSeat }: {
  totalSeats: number; layoutType: string; reservedTailCount: number; pinnedSeats: PinnedSeat[];
  selectedSeat: number | null; onSelectSeat: (n: number | null) => void;
}) {
  const W = 600, H = 420;
  const positions = generatePositions(totalSeats, layoutType, W, H);
  const tailStart = totalSeats - reservedTailCount + 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-gray-900/70 rounded-2xl border border-gray-700/30" style={{ maxHeight: 420 }} onClick={() => onSelectSeat(null)}>
      {positions.map(pos => {
        const pinned = pinnedSeats.find(p => p.seatNumber === pos.id);
        const isTail = pos.id >= tailStart && reservedTailCount > 0;
        const sel = selectedSeat === pos.id;
        const color = sel ? '#3b82f6' : pinned ? '#f59e0b' : isTail ? '#6b7280' : '#10b981';
        return (
          <g key={pos.id} transform={`translate(${pos.x - 21},${pos.y - 21})`} style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onSelectSeat(sel ? null : pos.id); }}>
            <rect width={42} height={42} rx={12} fill={`${color}26`} stroke={color} strokeWidth={sel ? 2.5 : 1.5} />
            <text x={21} y={21} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={15} fontWeight="bold">{pos.id}</text>
            {pinned && <text x={21} y={34} textAnchor="middle" fill="#f59e0b" fontSize={8}>📌</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ══════════════════════════════════════════════════════
// لوحة تثبيت لاعب في مقعد
// ══════════════════════════════════════════════════════
function PinSeatPanel({ selectedSeat, pinnedSeats, players, onPin, onUnpin, onClose }: {
  selectedSeat: number; pinnedSeats: PinnedSeat[]; players: any[];
  onPin: (seat: number, p: { id?: number; phone?: string; name: string }) => void;
  onUnpin: (seat: number) => void; onClose: () => void;
}) {
  const existing = pinnedSeats.find(p => p.seatNumber === selectedSeat);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const filtered = players.filter(p => (p.name || '').includes(search) || (p.phone || '').includes(search)).slice(0, 8);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/80 border border-blue-500/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          🪑 مقعد #{selectedSeat}
          {existing && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">📌 {existing.playerName}</span>}
        </h4>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>
      {existing ? (
        <div className="space-y-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <p className="text-amber-400 font-bold">{existing.playerName}</p>
            <p className="text-xs text-gray-500 font-mono" dir="ltr">{existing.phone || '—'}</p>
          </div>
          <button onClick={() => onUnpin(selectedSeat)} className="w-full py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20 transition">🗑️ إلغاء التثبيت</button>
        </div>
      ) : (
        <div className="space-y-3">
          <input type="text" placeholder="ابحث عن لاعب..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500/50 focus:outline-none" />
          {search && filtered.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filtered.map(p => (
                <button key={p.id} onClick={() => onPin(selectedSeat, { id: p.id, phone: p.phone, name: p.name })}
                  className="w-full flex items-center gap-2 bg-gray-900/50 border border-gray-700/20 rounded-lg px-3 py-2 hover:border-amber-500/30 hover:bg-amber-500/5 transition text-right">
                  <span className="text-sm text-white font-bold">{p.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono mr-auto" dir="ltr">{p.phone || '—'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-gray-700/20 pt-3 space-y-2">
            <p className="text-[10px] text-gray-600">أو أدخل يدوياً:</p>
            <input type="text" placeholder="اسم اللاعب" value={manualName} onChange={e => setManualName(e.target.value)}
              className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none" />
            <input type="text" placeholder="الهاتف (اختياري)" value={manualPhone} onChange={e => setManualPhone(e.target.value)} dir="ltr"
              className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none" />
            <button onClick={() => {
              if (!manualName.trim()) return;
              const m = players.find(p => (p.name || '').trim().toLowerCase() === manualName.trim().toLowerCase());
              if (m) onPin(selectedSeat, { id: m.id, phone: m.phone || manualPhone, name: m.name });
              else onPin(selectedSeat, { phone: manualPhone, name: manualName });
              setManualName(''); setManualPhone('');
            }} disabled={!manualName.trim()}
              className="w-full py-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/25 transition disabled:opacity-40">📌 تثبيت</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════
// 📐 الصفحة الرئيسية
// ══════════════════════════════════════════════════════
export default function SeatTemplatesPage() {
  const [templates, setTemplates] = useState<SeatTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SeatTemplate | null>(null);

  const [name, setName] = useState('');
  const [layoutType, setLayoutType] = useState<'rectangle' | 'circle' | 'rows'>('rectangle');
  const [totalSeats, setTotalSeats] = useState(20);
  const [reservedTailCount, setReservedTailCount] = useState(5);
  const [pinnedSeats, setPinnedSeats] = useState<PinnedSeat[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);

  // ── حالة المستطيل ──
  const [sides, setSides] = useState<Sides>({ top: 6, right: 4, bottom: 6, left: 4 });
  const [numbering, setNumbering] = useState<Numbering>({ startCorner: 'TL', direction: 'cw' });
  const [doors, setDoors] = useState<RectDoor[]>([]);

  const rectTotal = useMemo(() => totalFromSides(sides), [sides]);
  const effectiveTotal = layoutType === 'rectangle' ? rectTotal : totalSeats;

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch('/api/seat-templates'); setTemplates(res.templates || []); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  const fetchPlayers = useCallback(async () => {
    try { const res = await apiFetch('/api/player/all'); setPlayers(Array.isArray(res) ? res : res.players || []); } catch {}
  }, []);
  useEffect(() => { fetchTemplates(); fetchPlayers(); }, [fetchTemplates, fetchPlayers]);

  const openNew = () => {
    setEditingTemplate(null); setName(''); setLayoutType('rectangle'); setTotalSeats(20);
    setReservedTailCount(5); setPinnedSeats([]); setIsDefault(false); setSelectedSeat(null);
    setSides({ top: 6, right: 4, bottom: 6, left: 4 }); setNumbering({ startCorner: 'TL', direction: 'cw' }); setDoors([]);
    setShowEditor(true);
  };

  const openEdit = (t: SeatTemplate) => {
    setEditingTemplate(t); setName(t.name);
    setLayoutType((t.layoutType as any) || 'rectangle');
    setTotalSeats(t.totalSeats); setReservedTailCount(t.reservedTailCount);
    setPinnedSeats(t.pinnedSeats || []); setIsDefault(t.isDefault); setSelectedSeat(null);
    if (t.layoutConfig?.shape === 'rectangle') {
      setSides(t.layoutConfig.sides);
      setNumbering(t.layoutConfig.numbering || { startCorner: 'TL', direction: 'cw' });
      setDoors(t.layoutConfig.doors || []);
    } else {
      setSides(defaultSides(t.totalSeats)); setNumbering({ startCorner: 'TL', direction: 'cw' }); setDoors([]);
    }
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (effectiveTotal < 6 || effectiveTotal > 50) { alert('عدد المقاعد يجب أن يكون بين 6 و 50'); return; }
    setSaving(true);
    try {
      let layoutConfig: LayoutConfig | null = null;
      let seatPositions: SeatPosition[] | null = null;
      if (layoutType === 'rectangle') {
        const seats = computeRectSeats(sides, numbering);
        layoutConfig = { shape: 'rectangle', sides, numbering, doors, doorSeats: computeDoorSeats(sides, seats, doors) };
        seatPositions = seatsTo2D(seats);
      }
      const body = {
        name, layoutType, totalSeats: effectiveTotal, reservedTailCount,
        pinnedSeats: pinnedSeats.filter(p => p.seatNumber <= effectiveTotal),
        seatPositions, layoutConfig, isDefault,
      };
      if (editingTemplate) await apiFetch(`/api/seat-templates/${editingTemplate.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/api/seat-templates', { method: 'POST', body: JSON.stringify(body) });
      setShowEditor(false); fetchTemplates();
    } catch (e: any) { alert('فشل الحفظ: ' + e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('⚠️ حذف هذا القالب نهائياً؟')) return;
    try { await apiFetch(`/api/seat-templates/${id}`, { method: 'DELETE' }); fetchTemplates(); }
    catch (e: any) { alert('فشل الحذف: ' + e.message); }
  };

  const handlePin = (seatNumber: number, p: { id?: number; phone?: string; name: string }) => {
    setPinnedSeats(prev => [...prev.filter(x => x.seatNumber !== seatNumber), { seatNumber, playerId: p.id, phone: p.phone, playerName: p.name }]);
    setSelectedSeat(null);
  };
  const handleUnpin = (seatNumber: number) => { setPinnedSeats(prev => prev.filter(x => x.seatNumber !== seatNumber)); setSelectedSeat(null); };

  const setSide = (side: Side, delta: number) => {
    setSides(prev => {
      const next = { ...prev, [side]: Math.max(0, prev[side] + delta) };
      if (totalFromSides(next) > 50) return prev;
      return next;
    });
  };
  const addDoor = (side: Side, offset: number) => {
    setDoors(prev => [...prev, { id: 'd' + Date.now(), side, offset, type: 'entry' }]);
  };

  // مزامنة totalSeats مع الأضلاع في وضع المستطيل + تنظيف المثبت الزائد
  useEffect(() => {
    if (layoutType === 'rectangle') setTotalSeats(rectTotal);
  }, [rectTotal, layoutType]);
  useEffect(() => {
    setPinnedSeats(prev => prev.filter(p => p.seatNumber <= effectiveTotal));
    if (selectedSeat && selectedSeat > effectiveTotal) setSelectedSeat(null);
  }, [effectiveTotal]); // eslint-disable-line

  const LAYOUTS = [
    { v: 'rectangle', l: '🔳 مستطيل (3D)' },
    { v: 'circle', l: '⭕ دائري' },
    { v: 'rows', l: '📊 صفوف' },
  ] as const;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-10" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">📐 قوالب المقاعد</h1>
          <p className="text-sm text-gray-500 mt-1">صمّم القاعة ثلاثية الأبعاد: أضلاع، أبواب، ترقيم، وتثبيت لاعبين</p>
        </div>
        <button onClick={openNew} className="px-4 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 transition flex items-center gap-2">✨ قالب جديد</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-16 text-center">
          <span className="text-5xl block mb-4 opacity-30">📐</span>
          <p className="text-gray-500 text-sm mb-4">لا توجد قوالب حتى الآن</p>
          <button onClick={openNew} className="px-4 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 transition">✨ إنشاء أول قالب</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5 hover:border-amber-500/20 transition group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold flex items-center gap-2">{t.name}
                    {t.isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">افتراضي</span>}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t.totalSeats} مقعد • {t.layoutType === 'circle' ? '⭕ دائري' : t.layoutType === 'rows' ? '📊 صفوف' : '🔳 مستطيل'}</p>
                </div>
                <span className="text-2xl opacity-20 group-hover:opacity-40 transition">{t.layoutType === 'circle' ? '⭕' : t.layoutType === 'rows' ? '📊' : '🔳'}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-white">{t.totalSeats}</p><p className="text-[10px] text-gray-600">مقعد</p></div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-amber-400">{(t.pinnedSeats || []).length}</p><p className="text-[10px] text-gray-600">مثبت</p></div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-rose-400">{(t.layoutConfig?.doors || []).length}</p><p className="text-[10px] text-gray-600">باب</p></div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-gray-400">{t.reservedTailCount}</p><p className="text-[10px] text-gray-600">مؤخر</p></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(t)} className="flex-1 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition">✏️ تعديل</button>
                <button onClick={() => handleDelete(t.id)} className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20 transition">🗑️</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ══ Modal ══ */}
      <AnimatePresence>
        {showEditor && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={() => setShowEditor(false)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-700/50 rounded-2xl w-full max-w-5xl my-6">
              <div className="flex items-center justify-between p-5 border-b border-gray-700/30 sticky top-0 bg-gray-900 z-10 rounded-t-2xl">
                <h2 className="text-lg font-bold text-white">{editingTemplate ? '✏️ تعديل القالب' : '✨ قالب مقاعد جديد'}</h2>
                <button onClick={() => setShowEditor(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
              </div>

              <div className="p-5 space-y-5">
                {/* الاسم + الشكل */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">اسم القالب *</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: قاعة المزاج — مستطيل"
                      className="w-full bg-gray-800/70 border border-gray-700/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">شكل الترتيب</label>
                    <div className="flex gap-2">
                      {LAYOUTS.map(o => (
                        <button key={o.v} onClick={() => setLayoutType(o.v as any)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${layoutType === o.v ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700/20 hover:text-white'}`}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {layoutType === 'rectangle' ? (
                  <>
                    {/* عناصر تحكّم المستطيل */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* عدد المقاعد لكل ضلع */}
                      <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-3 font-bold">عدد المقاعد في كل ضلع <span className="text-amber-400">(الإجمالي {rectTotal})</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          {(['top', 'right', 'bottom', 'left'] as Side[]).map(side => (
                            <div key={side} className="bg-gray-900/50 rounded-lg p-2">
                              <p className="text-[10px] text-gray-500 mb-1 text-center">{SIDE_LABEL[side]}</p>
                              <div className="flex items-center justify-between">
                                <button onClick={() => setSide(side, -1)} className="w-6 h-6 rounded bg-gray-700/60 text-white text-sm hover:bg-gray-600">−</button>
                                <span className="text-white font-bold text-sm w-6 text-center">{sides[side]}</span>
                                <button onClick={() => setSide(side, 1)} className="w-6 h-6 rounded bg-amber-500/30 text-amber-300 text-sm hover:bg-amber-500/50">+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {rectTotal >= 50 && <p className="text-[10px] text-rose-400 mt-2">⚠️ بلغت الحدّ الأقصى 50</p>}
                      </div>

                      {/* الترقيم */}
                      <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-3 font-bold">بداية الترقيم</p>
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          {(['TL', 'TR', 'BL', 'BR'] as Corner[]).map(c => (
                            <button key={c} onClick={() => setNumbering(n => ({ ...n, startCorner: c }))}
                              className={`py-2 rounded-lg text-[11px] font-bold border transition ${numbering.startCorner === c ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20 hover:text-white'}`}>{CORNER_LABEL[c]}</button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => setNumbering(n => ({ ...n, direction: 'cw' }))}
                            className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition ${numbering.direction === 'cw' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20'}`}>↻ مع العقارب</button>
                          <button onClick={() => setNumbering(n => ({ ...n, direction: 'ccw' }))}
                            className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition ${numbering.direction === 'ccw' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20'}`}>↺ عكسها</button>
                        </div>
                      </div>

                      {/* الأبواب */}
                      <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-2 font-bold">الأبواب 🚪 <span className="text-gray-600 font-normal">({doors.length})</span></p>
                        <p className="text-[10px] text-gray-600 mb-2">اضغط على أيّ جدار في المشهد لإضافة باب</p>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto">
                          {doors.length === 0 && <p className="text-[10px] text-gray-600 text-center py-2">لا أبواب بعد</p>}
                          {doors.map((d, i) => (
                            <div key={d.id} className="flex items-center gap-1.5 bg-gray-900/50 rounded-lg px-2 py-1.5">
                              <span className="text-[10px] text-gray-400 flex-1">{SIDE_LABEL[d.side]}</span>
                              <button onClick={() => setDoors(prev => prev.map(x => x.id === d.id ? { ...x, type: x.type === 'entry' ? 'exit' : 'entry' } : x))}
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${d.type === 'entry' ? 'bg-green-500/15 text-green-400' : 'bg-rose-500/15 text-rose-400'}`}>{d.type === 'entry' ? 'دخول' : 'خروج'}</button>
                              <button onClick={() => setDoors(prev => prev.filter(x => x.id !== d.id))} className="text-gray-600 hover:text-rose-400 text-xs">✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* المؤخرة */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">المقاعد المؤخرة: <span className="text-gray-300 font-bold">{reservedTailCount}</span> <span className="text-[10px] text-gray-600">(تُملأ أخيراً)</span></label>
                      <input type="range" min={0} max={Math.floor(rectTotal / 2)} value={reservedTailCount} onChange={e => setReservedTailCount(Number(e.target.value))} className="w-full accent-gray-500" />
                    </div>

                    {/* المحرّر 3D */}
                    <Editor3D sides={sides} numbering={numbering} doors={doors} pinnedSeats={pinnedSeats}
                      reservedTailCount={reservedTailCount} selectedSeat={selectedSeat} onSelectSeat={setSelectedSeat} onAddDoor={addDoor} />
                    <div className="flex items-center gap-4 text-[10px] flex-wrap text-gray-500">
                      <span className="text-emerald-400">■ عادي</span>
                      <span className="text-amber-400">■ 📌 مثبت</span>
                      <span className="text-rose-400">■ بجانب باب</span>
                      <span className="text-gray-400">■ مؤخر</span>
                      <span className="text-blue-400">■ محدد</span>
                      <span>🖱️ اسحب للدوران · انقر كرسياً للتثبيت · انقر جداراً لإضافة باب</span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* الدائري/الصفوف — محرّر 2D القديم */}
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">عدد المقاعد: <span className="text-amber-400 font-bold">{totalSeats}</span></label>
                      <input type="range" min={6} max={50} value={totalSeats} onChange={e => setTotalSeats(Number(e.target.value))} className="w-full accent-amber-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">المقاعد المؤخرة: <span className="text-gray-300 font-bold">{reservedTailCount}</span></label>
                      <input type="range" min={0} max={Math.floor(totalSeats / 2)} value={reservedTailCount} onChange={e => setReservedTailCount(Number(e.target.value))} className="w-full accent-gray-500" />
                    </div>
                    <Svg2DEditor totalSeats={totalSeats} layoutType={layoutType} reservedTailCount={reservedTailCount}
                      pinnedSeats={pinnedSeats} selectedSeat={selectedSeat} onSelectSeat={setSelectedSeat} />
                    <p className="text-[10px] text-gray-600">🖱️ انقر مقعداً لتثبيت لاعب فيه</p>
                  </>
                )}

                {/* لوحة التثبيت */}
                <AnimatePresence>
                  {selectedSeat && (
                    <PinSeatPanel selectedSeat={selectedSeat} pinnedSeats={pinnedSeats} players={players}
                      onPin={handlePin} onUnpin={handleUnpin} onClose={() => setSelectedSeat(null)} />
                  )}
                </AnimatePresence>

                {/* قائمة المثبتين */}
                {pinnedSeats.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <h4 className="text-xs text-amber-400 font-bold mb-2">📌 المقاعد المثبتة ({pinnedSeats.length})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[...pinnedSeats].sort((a, b) => a.seatNumber - b.seatNumber).map(p => (
                        <div key={p.seatNumber} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
                          <span className="text-amber-400 font-bold text-sm">#{p.seatNumber}</span>
                          <span className="text-xs text-white truncate flex-1">{p.playerName}</span>
                          <button onClick={() => handleUnpin(p.seatNumber)} className="text-gray-600 hover:text-rose-400 text-xs">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* افتراضي */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsDefault(!isDefault)} className={`text-xs px-4 py-2 rounded-lg border transition ${isDefault ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700/20'}`}>{isDefault ? '⭐ قالب افتراضي' : 'تعيين كافتراضي'}</button>
                  <span className="text-[10px] text-gray-600">يُستخدم عند إنشاء فعالية بدون تحديد قالب</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-700/30 sticky bottom-0 bg-gray-900 rounded-b-2xl">
                <button onClick={() => setShowEditor(false)} className="px-5 py-2.5 rounded-xl border border-gray-600/30 text-gray-400 hover:text-white text-sm transition">إلغاء</button>
                <button onClick={handleSave} disabled={saving || !name.trim()} className="px-6 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/30 transition disabled:opacity-50">
                  {saving ? '⏳ جارٍ الحفظ...' : editingTemplate ? '✅ حفظ التعديلات' : '✅ إنشاء القالب'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
