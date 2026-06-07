'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

// ══════════════════════════════════════════════════════
// الأنواع
// ══════════════════════════════════════════════════════

interface PinnedSeat {
  seatNumber: number;
  playerId?: number;
  phone?: string;
  playerName: string;
}

interface SeatPosition {
  id: number;
  x: number;
  y: number;
}

interface SeatTemplate {
  id: number;
  name: string;
  layoutType: string;
  totalSeats: number;
  reservedTailCount: number;
  pinnedSeats: PinnedSeat[];
  constraintsConfig: any[];
  seatPositions: SeatPosition[] | null;
  isDefault: boolean;
  createdAt: string;
}

// ══════════════════════════════════════════════════════
// 🔵 توليد المواقع حسب الشكل
// ══════════════════════════════════════════════════════

function generatePositions(totalSeats: number, layout: string, width: number, height: number): SeatPosition[] {
  const positions: SeatPosition[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const padding = 40;

  if (layout === 'circle') {
    const radius = Math.min(cx, cy) - padding;
    for (let i = 0; i < totalSeats; i++) {
      const angle = (2 * Math.PI * i) / totalSeats - Math.PI / 2;
      positions.push({
        id: i + 1,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    }
  } else if (layout === 'rectangle') {
    const perSide = Math.ceil(totalSeats / 4);
    const w = width - padding * 2;
    const h = height - padding * 2;
    let placed = 0;

    // Top
    for (let i = 0; i < perSide && placed < totalSeats; i++, placed++) {
      positions.push({ id: placed + 1, x: padding + (w / (perSide + 1)) * (i + 1), y: padding });
    }
    // Right
    for (let i = 0; i < perSide && placed < totalSeats; i++, placed++) {
      positions.push({ id: placed + 1, x: width - padding, y: padding + (h / (perSide + 1)) * (i + 1) });
    }
    // Bottom
    for (let i = 0; i < perSide && placed < totalSeats; i++, placed++) {
      positions.push({ id: placed + 1, x: width - padding - (w / (perSide + 1)) * (i + 1), y: height - padding });
    }
    // Left
    for (let i = 0; i < perSide && placed < totalSeats; i++, placed++) {
      positions.push({ id: placed + 1, x: padding, y: height - padding - (h / (perSide + 1)) * (i + 1) });
    }
  } else {
    // rows
    const cols = Math.ceil(Math.sqrt(totalSeats * 1.5));
    const rows = Math.ceil(totalSeats / cols);
    const cellW = (width - padding * 2) / cols;
    const cellH = (height - padding * 2) / rows;
    let placed = 0;

    for (let r = 0; r < rows && placed < totalSeats; r++) {
      for (let c = 0; c < cols && placed < totalSeats; c++, placed++) {
        positions.push({
          id: placed + 1,
          x: padding + cellW * c + cellW / 2,
          y: padding + cellH * r + cellH / 2,
        });
      }
    }
  }

  return positions;
}

// ══════════════════════════════════════════════════════
// 🪑 مكون المقعد الواحد (قابل للسحب)
// ══════════════════════════════════════════════════════

function SeatNode({
  seat,
  position,
  isPinned,
  pinnedInfo,
  isTail,
  isSelected,
  isDragging,
  onMouseDown,
  onClick,
}: {
  seat: number;
  position: SeatPosition;
  isPinned: boolean;
  pinnedInfo?: PinnedSeat;
  isTail: boolean;
  isSelected: boolean;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const size = 42;
  const half = size / 2;

  let bgColor = 'rgba(16, 185, 129, 0.15)';
  let borderColor = 'rgba(16, 185, 129, 0.3)';
  let textColor = '#10b981';
  let glowColor = '';

  if (isPinned) {
    bgColor = 'rgba(245, 158, 11, 0.2)';
    borderColor = 'rgba(245, 158, 11, 0.5)';
    textColor = '#f59e0b';
    glowColor = '0 0 12px rgba(245, 158, 11, 0.3)';
  } else if (isTail) {
    bgColor = 'rgba(107, 114, 128, 0.1)';
    borderColor = 'rgba(107, 114, 128, 0.25)';
    textColor = '#6b7280';
  }

  if (isSelected) {
    borderColor = '#3b82f6';
    glowColor = '0 0 16px rgba(59, 130, 246, 0.4)';
  }

  return (
    <g
      transform={`translate(${position.x - half}, ${position.y - half})`}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDown}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <rect
        width={size}
        height={size}
        rx={12}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        style={{ filter: glowColor ? `drop-shadow(${glowColor})` : undefined }}
      />
      <text
        x={half}
        y={half - (isPinned ? 4 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={isPinned ? 13 : 15}
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {seat}
      </text>
      {isPinned && pinnedInfo && (
        <>
          <text
            x={half}
            y={half + 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#f59e0b"
            fontSize={8}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            📌
          </text>
          <title>{`مثبت: ${pinnedInfo.playerName}`}</title>
        </>
      )}
      {isTail && !isPinned && (
        <text
          x={half}
          y={half + 14}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#6b7280"
          fontSize={7}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          مؤخر
        </text>
      )}
    </g>
  );
}

// ══════════════════════════════════════════════════════
// 🎨 المحرر البصري التفاعلي
// ══════════════════════════════════════════════════════

function SeatEditor({
  totalSeats,
  layoutType,
  reservedTailCount,
  pinnedSeats,
  seatPositions,
  onPositionsChange,
  onPinnedSeatsChange,
  selectedSeat,
  onSelectSeat,
}: {
  totalSeats: number;
  layoutType: string;
  reservedTailCount: number;
  pinnedSeats: PinnedSeat[];
  seatPositions: SeatPosition[] | null;
  onPositionsChange: (positions: SeatPosition[]) => void;
  onPinnedSeatsChange: (pinned: PinnedSeat[]) => void;
  selectedSeat: number | null;
  onSelectSeat: (seat: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const canvasW = 600;
  const canvasH = 450;

  // مواقع المقاعد (مولّدة أو محفوظة)
  const positions = seatPositions && seatPositions.length === totalSeats
    ? seatPositions
    : generatePositions(totalSeats, layoutType, canvasW, canvasH);

  // المقاعد المؤخرة
  const tailStart = totalSeats - reservedTailCount + 1;

  // بدء السحب
  const handleMouseDown = useCallback((seatId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    const pos = positions.find(p => p.id === seatId);
    if (!pos) return;
    setDragOffset({ x: svgP.x - pos.x, y: svgP.y - pos.y });
    setDragging(seatId);
  }, [positions]);

  // أثناء السحب
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    const newPositions = positions.map(p =>
      p.id === dragging
        ? { ...p, x: Math.max(20, Math.min(canvasW - 20, svgP.x - dragOffset.x)), y: Math.max(20, Math.min(canvasH - 20, svgP.y - dragOffset.y)) }
        : p
    );
    onPositionsChange(newPositions);
  }, [dragging, positions, dragOffset, onPositionsChange, canvasW, canvasH]);

  // إنهاء السحب
  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="relative bg-gray-900/70 border border-gray-700/30 rounded-2xl overflow-hidden">
      {/* شريط أدوات صغير */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700/20">
        <span className="text-xs text-gray-500">🖱️ اسحب المقاعد لتغيير مواقعها • اضغط لتثبيت لاعب</span>
        <button
          onClick={() => onPositionsChange(generatePositions(totalSeats, layoutType, canvasW, canvasH))}
          className="text-xs px-3 py-1 rounded-lg bg-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-600/50 transition"
        >
          🔄 إعادة ترتيب تلقائي
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        className="w-full"
        style={{ height: 'auto', maxHeight: '450px' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => onSelectSeat(null)}
      >
        {/* خطوط ربط خافتة بين المقاعد المتتالية */}
        {positions.map((pos, i) => {
          const next = positions[(i + 1) % totalSeats];
          return (
            <line
              key={`line-${i}`}
              x1={pos.x}
              y1={pos.y}
              x2={next.x}
              y2={next.y}
              stroke="rgba(75, 85, 99, 0.15)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* المقاعد */}
        {positions.map((pos) => {
          const pinned = pinnedSeats.find(p => p.seatNumber === pos.id);
          const isTail = pos.id >= tailStart;
          return (
            <SeatNode
              key={pos.id}
              seat={pos.id}
              position={pos}
              isPinned={!!pinned}
              pinnedInfo={pinned}
              isTail={isTail}
              isSelected={selectedSeat === pos.id}
              isDragging={dragging === pos.id}
              onMouseDown={(e) => handleMouseDown(pos.id, e)}
              onClick={() => onSelectSeat(selectedSeat === pos.id ? null : pos.id)}
            />
          );
        })}
      </svg>

      {/* مفتاح الألوان */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-800/30 border-t border-gray-700/20">
        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30 inline-block" /> عادي
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-amber-400">
          <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/40 inline-block" /> 📌 مثبت
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-3 h-3 rounded bg-gray-500/10 border border-gray-500/25 inline-block" /> مؤخر
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-blue-400">
          <span className="w-3 h-3 rounded bg-blue-500/20 border-2 border-blue-500 inline-block" /> محدد
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 📌 لوحة تثبيت المقعد المحدد
// ══════════════════════════════════════════════════════

function PinSeatPanel({
  selectedSeat,
  pinnedSeats,
  players,
  onPin,
  onUnpin,
  onClose,
}: {
  selectedSeat: number;
  pinnedSeats: PinnedSeat[];
  players: any[];
  onPin: (seat: number, player: { id?: number; phone?: string; name: string }) => void;
  onUnpin: (seat: number) => void;
  onClose: () => void;
}) {
  const existing = pinnedSeats.find(p => p.seatNumber === selectedSeat);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  const filteredPlayers = players.filter(p =>
    (p.name || '').includes(search) || (p.phone || '').includes(search)
  ).slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/80 border border-blue-500/30 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          🪑 مقعد #{selectedSeat}
          {existing && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">📌 مثبت لـ {existing.playerName}</span>}
        </h4>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>

      {existing ? (
        <div className="space-y-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <p className="text-amber-400 font-bold">{existing.playerName}</p>
            <p className="text-xs text-gray-500 font-mono" dir="ltr">{existing.phone || '—'}</p>
          </div>
          <button
            onClick={() => onUnpin(selectedSeat)}
            className="w-full py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20 transition"
          >
            🗑️ إلغاء التثبيت
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* بحث لاعب */}
          <input
            type="text"
            placeholder="ابحث عن لاعب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500/50 focus:outline-none"
          />
          {search && filteredPlayers.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPin(selectedSeat, { id: p.id, phone: p.phone, name: p.name })}
                  className="w-full flex items-center gap-2 bg-gray-900/50 border border-gray-700/20 rounded-lg px-3 py-2 hover:border-amber-500/30 hover:bg-amber-500/5 transition text-right"
                >
                  <span className="text-sm text-white font-bold">{p.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono mr-auto" dir="ltr">{p.phone || '—'}</span>
                </button>
              ))}
            </div>
          )}

          {/* إدخال يدوي */}
          <div className="border-t border-gray-700/20 pt-3 space-y-2">
            <p className="text-[10px] text-gray-600">أو أدخل يدوياً:</p>
            <input
              type="text"
              placeholder="اسم اللاعب"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
            />
            <input
              type="text"
              placeholder="الهاتف (اختياري)"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              dir="ltr"
              className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
            />
            <button
              onClick={() => {
                if (!manualName.trim()) return;
                onPin(selectedSeat, { phone: manualPhone, name: manualName });
                setManualName('');
                setManualPhone('');
              }}
              disabled={!manualName.trim()}
              className="w-full py-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold hover:bg-amber-500/25 transition disabled:opacity-40"
            >
              📌 تثبيت
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════
// 📐 الصفحة الرئيسية — قوالب المقاعد
// ══════════════════════════════════════════════════════

export default function SeatTemplatesPage() {
  const [templates, setTemplates] = useState<SeatTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SeatTemplate | null>(null);

  // حقول الإنشاء/التعديل
  const [name, setName] = useState('');
  const [layoutType, setLayoutType] = useState('circle');
  const [totalSeats, setTotalSeats] = useState(20);
  const [reservedTailCount, setReservedTailCount] = useState(5);
  const [pinnedSeats, setPinnedSeats] = useState<PinnedSeat[]>([]);
  const [seatPositions, setSeatPositions] = useState<SeatPosition[] | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // قائمة اللاعبين (للبحث عند التثبيت)
  const [players, setPlayers] = useState<any[]>([]);

  // تحميل القوالب
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/seat-templates');
      setTemplates(res.templates || []);
    } catch (err: any) {
      console.error('Failed to load seat templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // تحميل اللاعبين
  const fetchPlayers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/player?limit=500');
      setPlayers(Array.isArray(res) ? res : res.players || []);
    } catch { }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchPlayers();
  }, [fetchTemplates, fetchPlayers]);

  // فتح محرر جديد
  const openNew = () => {
    setEditingTemplate(null);
    setName('');
    setLayoutType('circle');
    setTotalSeats(20);
    setReservedTailCount(5);
    setPinnedSeats([]);
    setSeatPositions(null);
    setIsDefault(false);
    setSelectedSeat(null);
    setShowEditor(true);
  };

  // فتح محرر تعديل
  const openEdit = (t: SeatTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setLayoutType(t.layoutType);
    setTotalSeats(t.totalSeats);
    setReservedTailCount(t.reservedTailCount);
    setPinnedSeats(t.pinnedSeats || []);
    setSeatPositions(t.seatPositions || null);
    setIsDefault(t.isDefault);
    setSelectedSeat(null);
    setShowEditor(true);
  };

  // حفظ
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name,
        layoutType,
        totalSeats,
        reservedTailCount,
        pinnedSeats,
        seatPositions,
        isDefault,
      };

      if (editingTemplate) {
        await apiFetch(`/api/seat-templates/${editingTemplate.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/api/seat-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      setShowEditor(false);
      fetchTemplates();
    } catch (err: any) {
      alert('فشل الحفظ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // حذف
  const handleDelete = async (id: number) => {
    if (!confirm('⚠️ هل تريد حذف هذا القالب نهائياً؟')) return;
    try {
      await apiFetch(`/api/seat-templates/${id}`, { method: 'DELETE' });
      fetchTemplates();
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  };

  // تثبيت مقعد
  const handlePinSeat = (seatNumber: number, player: { id?: number; phone?: string; name: string }) => {
    setPinnedSeats(prev => [
      ...prev.filter(p => p.seatNumber !== seatNumber),
      { seatNumber, playerId: player.id, phone: player.phone, playerName: player.name },
    ]);
    setSelectedSeat(null);
  };

  // إلغاء تثبيت
  const handleUnpinSeat = (seatNumber: number) => {
    setPinnedSeats(prev => prev.filter(p => p.seatNumber !== seatNumber));
    setSelectedSeat(null);
  };

  // عند تغيير عدد المقاعد أو الشكل → إعادة توليد المواقع
  useEffect(() => {
    if (showEditor) {
      setSeatPositions(null);
      setPinnedSeats(prev => prev.filter(p => p.seatNumber <= totalSeats));
    }
  }, [totalSeats, layoutType]);

  const LAYOUT_OPTIONS = [
    { value: 'circle', label: '⭕ دائري', desc: 'مقاعد على شكل دائرة' },
    { value: 'rectangle', label: '🔳 مربع', desc: 'مقاعد على شكل مربع' },
    { value: 'rows', label: '📊 صفوف', desc: 'مقاعد بصفوف أفقية' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-10" dir="rtl">
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            📐 قوالب المقاعد
          </h1>
          <p className="text-sm text-gray-500 mt-1">تصميم وإدارة ترتيبات المقاعد المختلفة للفعاليات</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 transition flex items-center gap-2"
        >
          ✨ قالب جديد
        </button>
      </div>

      {/* ══ قائمة القوالب ══ */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-16 text-center">
          <span className="text-5xl block mb-4 opacity-30">📐</span>
          <p className="text-gray-500 text-sm mb-4">لا توجد قوالب حتى الآن</p>
          <button
            onClick={openNew}
            className="px-4 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 transition"
          >
            ✨ إنشاء أول قالب
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5 hover:border-amber-500/20 transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold flex items-center gap-2">
                    {t.name}
                    {t.isDefault && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        افتراضي
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {t.totalSeats} مقعد • {LAYOUT_OPTIONS.find(l => l.value === t.layoutType)?.label || t.layoutType}
                  </p>
                </div>
                <span className="text-2xl opacity-20 group-hover:opacity-40 transition">
                  {t.layoutType === 'circle' ? '⭕' : t.layoutType === 'rectangle' ? '🔳' : '📊'}
                </span>
              </div>

              {/* إحصائيات سريعة */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-white">{t.totalSeats}</p>
                  <p className="text-[10px] text-gray-600">مقعد</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-400">{(t.pinnedSeats || []).length}</p>
                  <p className="text-[10px] text-gray-600">مثبت</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-gray-400">{t.reservedTailCount}</p>
                  <p className="text-[10px] text-gray-600">مؤخر</p>
                </div>
              </div>

              {/* أزرار */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(t)}
                  className="flex-1 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition"
                >
                  ✏️ تعديل
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20 transition"
                >
                  🗑️
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ══ Modal — المحرر البصري ══ */}
      <AnimatePresence>
        {showEditor && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEditor(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-gray-700/50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-700/30">
                <h2 className="text-lg font-bold text-white">
                  {editingTemplate ? '✏️ تعديل القالب' : '✨ قالب مقاعد جديد'}
                </h2>
                <button onClick={() => setShowEditor(false)} className="text-gray-500 hover:text-white text-xl transition">✕</button>
              </div>

              <div className="p-5 space-y-6">
                {/* ── صف 1: الاسم والشكل ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">اسم القالب *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="مثال: قالب 20 لاعب — دائري"
                      className="w-full bg-gray-800/70 border border-gray-700/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">شكل الترتيب</label>
                    <div className="flex gap-2">
                      {LAYOUT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setLayoutType(opt.value)}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                            layoutType === opt.value
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-gray-800/50 text-gray-500 border-gray-700/20 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── صف 2: عدد المقاعد + المؤخرة ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">
                      عدد المقاعد: <span className="text-amber-400 font-bold text-sm">{totalSeats}</span>
                    </label>
                    <input
                      type="range"
                      min={6}
                      max={27}
                      value={totalSeats}
                      onChange={(e) => setTotalSeats(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                      <span>6</span>
                      <span>27</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">
                      المقاعد المؤخرة: <span className="text-gray-300 font-bold text-sm">{reservedTailCount}</span>
                      <span className="text-[10px] text-gray-600 mr-2">(تُملأ أخيراً)</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.floor(totalSeats / 2)}
                      value={reservedTailCount}
                      onChange={(e) => setReservedTailCount(Number(e.target.value))}
                      className="w-full accent-gray-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                      <span>0</span>
                      <span>{Math.floor(totalSeats / 2)}</span>
                    </div>
                  </div>
                </div>

                {/* ── المحرر البصري ── */}
                <SeatEditor
                  totalSeats={totalSeats}
                  layoutType={layoutType}
                  reservedTailCount={reservedTailCount}
                  pinnedSeats={pinnedSeats}
                  seatPositions={seatPositions}
                  onPositionsChange={setSeatPositions}
                  onPinnedSeatsChange={setPinnedSeats}
                  selectedSeat={selectedSeat}
                  onSelectSeat={setSelectedSeat}
                />

                {/* ── لوحة تثبيت المقعد المحدد ── */}
                <AnimatePresence>
                  {selectedSeat && (
                    <PinSeatPanel
                      selectedSeat={selectedSeat}
                      pinnedSeats={pinnedSeats}
                      players={players}
                      onPin={handlePinSeat}
                      onUnpin={handleUnpinSeat}
                      onClose={() => setSelectedSeat(null)}
                    />
                  )}
                </AnimatePresence>

                {/* ── المقاعد المثبتة ── */}
                {pinnedSeats.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <h4 className="text-xs text-amber-400 font-bold mb-2">📌 المقاعد المثبتة ({pinnedSeats.length})</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {pinnedSeats.sort((a, b) => a.seatNumber - b.seatNumber).map((p) => (
                        <div key={p.seatNumber} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
                          <span className="text-amber-400 font-bold text-sm">#{p.seatNumber}</span>
                          <span className="text-xs text-white truncate flex-1">{p.playerName}</span>
                          <button
                            onClick={() => handleUnpinSeat(p.seatNumber)}
                            className="text-gray-600 hover:text-rose-400 text-xs transition"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── قالب افتراضي ── */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsDefault(!isDefault)}
                    className={`text-xs px-4 py-2 rounded-lg border transition ${
                      isDefault
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-gray-800/50 text-gray-500 border-gray-700/20'
                    }`}
                  >
                    {isDefault ? '⭐ قالب افتراضي' : 'تعيين كافتراضي'}
                  </button>
                  <span className="text-[10px] text-gray-600">يُستخدم تلقائياً عند إنشاء فعالية بدون تحديد قالب</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-700/30">
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-600/30 text-gray-400 hover:text-white text-sm transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="px-6 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/30 transition disabled:opacity-50"
                >
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
