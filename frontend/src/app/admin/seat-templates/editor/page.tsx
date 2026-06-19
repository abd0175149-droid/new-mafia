'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  computeRectLayout, seatsTo2D, totalFromSides,
  type Sides, type Numbering, type RectDoor,
} from '@/lib/rectLayout';

const Editor3D = dynamic(() => import('@/components/SeatTemplate3DEditor'), {
  ssr: false,
  loading: () => <div className="h-full min-h-[380px] flex items-center justify-center text-gray-600">⏳ تحميل المشهد ثلاثي الأبعاد...</div>,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

interface PinSlot { slotIndex: number; playerId?: number; phone?: string; playerName: string }
const SIDE_LABEL: Record<string, string> = { top: 'أعلى', right: 'يمين', bottom: 'أسفل', left: 'يسار' };
const MIN_CHAIRS = 6;

function defaultSides(total: number): Sides {
  const s: Sides = { top: 0, right: 0, bottom: 0, left: 0 };
  const order: (keyof Sides)[] = ['top', 'bottom', 'right', 'left'];
  let rem = Math.max(6, total), i = 0;
  while (rem > 0) { s[order[i % 4]]++; rem--; i++; }
  return s;
}
function gen2D(total: number, layout: string, W: number, H: number) {
  const out: { id: number; x: number; y: number }[] = []; const pad = 40;
  if (layout === 'circle') {
    const cx = W / 2, cy = H / 2, r = Math.min(cx, cy) - pad;
    for (let i = 0; i < total; i++) { const a = (2 * Math.PI * i) / total - Math.PI / 2; out.push({ id: i + 1, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  } else {
    const cols = Math.ceil(Math.sqrt(total * 1.5)), rows = Math.ceil(total / cols);
    const cw = (W - pad * 2) / cols, ch = (H - pad * 2) / rows; let p = 0;
    for (let r = 0; r < rows && p < total; r++) for (let c = 0; c < cols && p < total; c++, p++) out.push({ id: p + 1, x: pad + cw * c + cw / 2, y: pad + ch * r + ch / 2 });
  }
  return out;
}

function EditorInner() {
  const router = useRouter();
  const editId = useSearchParams().get('id');

  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);

  const [name, setName] = useState('');
  const [layoutType, setLayoutType] = useState<'rectangle' | 'circle' | 'rows'>('rectangle');
  const [sides, setSides] = useState<Sides>({ top: 6, right: 4, bottom: 6, left: 4 });
  const [numbering, setNumbering] = useState<Numbering>({ startIndex: 0, direction: 'cw' });
  const [doors, setDoors] = useState<RectDoor[]>([]);
  const [reservedTailCount, setReservedTailCount] = useState(5);
  const [pinnedSlots, setPinnedSlots] = useState<PinSlot[]>([]); // slotIndex (مستطيل) أو seatNumber (دائري/صفوف)
  const [isDefault, setIsDefault] = useState(false);
  const [totalSeats, setTotalSeats] = useState(20); // للدائري/الصفوف

  const [viewMode, setViewMode] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);   // seatNum
  const [selectedDoorSlot, setSelectedDoorSlot] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');

  const isRect = layoutType === 'rectangle';
  const layout = useMemo(() => isRect ? computeRectLayout(sides, numbering, doors) : null, [isRect, sides, numbering, doors]);
  const totalChairs = layout?.totalChairs ?? 0;
  const effectiveTotal = isRect ? totalChairs : totalSeats;
  const selectedSeatObj = useMemo(() => layout?.seats.find(s => s.seatNum === selectedSeat), [layout, selectedSeat]);
  const selectedDoor = useMemo(() => doors.find(d => d.slotIndex === selectedDoorSlot), [doors, selectedDoorSlot]);
  const pinnedNameBySlot = useMemo(() => {
    const m: Record<number, string> = {}; pinnedSlots.forEach(p => { m[p.slotIndex] = p.playerName; }); return m;
  }, [pinnedSlots]);

  useEffect(() => { apiFetch('/api/player/all').then(r => setPlayers(Array.isArray(r) ? r : r.players || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!editId) return;
    apiFetch(`/api/seat-templates/${editId}`).then(({ template: t }) => {
      setName(t.name); setLayoutType((t.layoutType as any) || 'rectangle');
      setReservedTailCount(t.reservedTailCount); setIsDefault(t.isDefault); setTotalSeats(t.totalSeats);
      if (t.layoutType === 'rectangle' && t.layoutConfig?.shape === 'rectangle') {
        const lc = t.layoutConfig;
        setSides(lc.sides);
        let num: Numbering = { startIndex: 0, direction: 'cw' };
        if (typeof lc.numbering?.startIndex === 'number') num = { startIndex: lc.numbering.startIndex, direction: lc.numbering.direction || 'cw' };
        else if (lc.numbering?.startCorner) { const s = lc.sides; const map: any = { TL: 0, TR: s.top, BR: s.top + s.right, BL: s.top + s.right + s.bottom }; num = { startIndex: map[lc.numbering.startCorner] ?? 0, direction: lc.numbering.direction || 'cw' }; }
        setNumbering(num);
        const dz: RectDoor[] = (lc.doors || []).filter((d: any) => typeof d.slotIndex === 'number').map((d: any) => ({ id: d.id || 'd' + d.slotIndex, slotIndex: d.slotIndex, type: d.type || 'entry' }));
        setDoors(dz);
        const lay = computeRectLayout(lc.sides, num, dz);
        setPinnedSlots((t.pinnedSeats || []).map((p: any) => { const seat = lay.seats.find(s => s.seatNum === p.seatNumber); return seat ? { slotIndex: seat.slotIndex, playerId: p.playerId, phone: p.phone, playerName: p.playerName } : null; }).filter(Boolean));
      } else {
        setSides(defaultSides(t.totalSeats)); setNumbering({ startIndex: 0, direction: 'cw' }); setDoors([]);
        setPinnedSlots((t.pinnedSeats || []).map((p: any) => ({ slotIndex: p.seatNumber, playerId: p.playerId, phone: p.phone, playerName: p.playerName })));
      }
    }).catch(() => alert('تعذّر تحميل القالب')).finally(() => setLoading(false));
  }, [editId]);

  const clearSel = () => { setSelectedSeat(null); setSelectedDoorSlot(null); setSearch(''); setManualName(''); };

  const setSide = (side: keyof Sides, delta: number) => setSides(prev => {
    const next = { ...prev, [side]: Math.max(0, prev[side] + delta) };
    if (totalFromSides(next) > 50) return prev;
    return next;
  });

  const startNumberingHere = () => { if (selectedSeatObj) { setNumbering(n => ({ ...n, startIndex: selectedSeatObj.slotIndex })); clearSel(); } };
  const putDoorHere = () => {
    if (!selectedSeatObj) return;
    if (totalChairs - 1 < MIN_CHAIRS) { alert(`يجب أن يبقى ${MIN_CHAIRS} كراسي على الأقل`); return; }
    const slot = selectedSeatObj.slotIndex;
    setDoors(prev => [...prev, { id: 'd' + Date.now(), slotIndex: slot, type: 'entry' }]);
    setPinnedSlots(prev => prev.filter(p => p.slotIndex !== slot)); // الكرسي اختفى
    clearSel();
  };
  const removeDoor = (slot: number) => { setDoors(prev => prev.filter(d => d.slotIndex !== slot)); clearSel(); };
  const setDoorType = (slot: number, type: 'entry' | 'exit') => setDoors(prev => prev.map(d => d.slotIndex === slot ? { ...d, type } : d));

  const pinSlotIndex = isRect ? selectedSeatObj?.slotIndex : selectedSeat;
  const pinPlayer = (p: { id?: number; phone?: string; name: string }) => {
    if (pinSlotIndex == null) return;
    setPinnedSlots(prev => [...prev.filter(x => x.slotIndex !== pinSlotIndex), { slotIndex: pinSlotIndex, playerId: p.id, phone: p.phone, playerName: p.name }]);
    setSearch(''); setManualName('');
  };
  const unpin = (slot: number) => setPinnedSlots(prev => prev.filter(x => x.slotIndex !== slot));

  const handleSave = async () => {
    if (!name.trim()) { alert('الاسم مطلوب'); return; }
    if (effectiveTotal < MIN_CHAIRS || effectiveTotal > 50) { alert('عدد الكراسي بين 6 و 50'); return; }
    setSaving(true);
    try {
      let layoutConfig: any = null; let seatPositions: any = null; let pinnedSeats: any[] = [];
      if (isRect && layout) {
        pinnedSeats = pinnedSlots.map(p => { const seat = layout.seats.find(s => s.slotIndex === p.slotIndex); return seat ? { seatNumber: seat.seatNum, playerId: p.playerId, phone: p.phone, playerName: p.playerName } : null; }).filter(Boolean) as any[];
        layoutConfig = { shape: 'rectangle', sides, numbering, doors, doorSeats: layout.doorSeats };
        seatPositions = seatsTo2D(layout.seats);
      } else {
        pinnedSeats = pinnedSlots.filter(p => p.slotIndex <= totalSeats).map(p => ({ seatNumber: p.slotIndex, playerId: p.playerId, phone: p.phone, playerName: p.playerName }));
      }
      const body = { name, layoutType, totalSeats: effectiveTotal, reservedTailCount, pinnedSeats, seatPositions, layoutConfig, isDefault };
      if (editId) await apiFetch(`/api/seat-templates/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/api/seat-templates', { method: 'POST', body: JSON.stringify(body) });
      router.push('/admin/seat-templates');
    } catch (e: any) { alert('فشل الحفظ: ' + e.message); setSaving(false); }
  };

  const filteredPlayers = players.filter(p => (p.name || '').includes(search) || (p.phone || '').includes(search)).slice(0, 6);
  const selectedPinned = pinSlotIndex != null ? pinnedSlots.find(p => p.slotIndex === pinSlotIndex) : undefined;

  if (loading) return <div className="flex justify-center py-24"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div dir="rtl" className="pb-10">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-gray-950/90 backdrop-blur z-20 py-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/seat-templates')} className="w-9 h-9 rounded-xl bg-gray-800 text-gray-300 hover:text-white">→</button>
          <h1 className="text-xl font-bold text-white">{editId ? '✏️ تعديل القالب' : '✨ قالب مقاعد جديد'}</h1>
        </div>
        <button onClick={handleSave} disabled={saving || !name.trim()} className="px-6 py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/30 transition disabled:opacity-50">
          {saving ? '⏳ جارٍ الحفظ...' : editId ? '✅ حفظ' : '✅ إنشاء'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-4">
        <div className="space-y-4">
          <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">اسم القالب *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: قاعة المزاج"
                className="w-full bg-gray-900/70 border border-gray-700/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">الشكل</label>
              <div className="flex gap-2">
                {[['rectangle', '🔳 مستطيل'], ['circle', '⭕ دائري'], ['rows', '📊 صفوف']].map(([v, l]) => (
                  <button key={v} onClick={() => { setLayoutType(v as any); clearSel(); }} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${layoutType === v ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700/20'}`}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {isRect ? (
            <>
              <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1 font-bold">المواضع لكل ضلع</p>
                <p className="text-[10px] text-gray-600 mb-3">كراسي: <span className="text-emerald-400 font-bold">{totalChairs}</span> · أبواب: <span className="text-rose-400 font-bold">{doors.length}</span> · مواضع: {layout?.totalSlots ?? 0}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['top', 'right', 'bottom', 'left'] as (keyof Sides)[]).map(side => (
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
                {(layout?.totalSlots ?? 0) >= 50 && <p className="text-[10px] text-rose-400 mt-2">⚠️ بلغت الحدّ الأقصى 50</p>}
              </div>

              <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1 font-bold">الترقيم</p>
                <p className="text-[10px] text-gray-600 mb-2">وضع التعديل: انقر كرسياً ← «بدء الترقيم من هنا»</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setNumbering(n => ({ ...n, direction: 'cw' }))} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${numbering.direction === 'cw' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20'}`}>↻ مع العقارب</button>
                  <button onClick={() => setNumbering(n => ({ ...n, direction: 'ccw' }))} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${numbering.direction === 'ccw' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20'}`}>↺ عكسها</button>
                </div>
              </div>

              <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                <label className="text-xs text-gray-400 block mb-1.5">المقاعد المؤخرة: <span className="text-gray-300 font-bold">{reservedTailCount}</span></label>
                <input type="range" min={0} max={Math.max(0, Math.floor(totalChairs / 2))} value={reservedTailCount} onChange={e => setReservedTailCount(Number(e.target.value))} className="w-full accent-gray-500" />
              </div>
            </>
          ) : (
            <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4 space-y-3">
              <label className="text-xs text-gray-400 block">عدد المقاعد: <span className="text-amber-400 font-bold">{totalSeats}</span></label>
              <input type="range" min={6} max={50} value={totalSeats} onChange={e => setTotalSeats(Number(e.target.value))} className="w-full accent-amber-500" />
              <label className="text-xs text-gray-400 block">المؤخرة: <span className="text-gray-300 font-bold">{reservedTailCount}</span></label>
              <input type="range" min={0} max={Math.floor(totalSeats / 2)} value={reservedTailCount} onChange={e => setReservedTailCount(Number(e.target.value))} className="w-full accent-gray-500" />
            </div>
          )}

          {/* لوحة المقعد المحدّد */}
          <AnimatePresence>
            {(selectedSeat || selectedDoorSlot != null) && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-gray-800/80 border border-blue-500/30 rounded-xl p-4 space-y-3">
                {selectedDoorSlot != null && selectedDoor ? (
                  <>
                    <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">🚪 باب</h4><button onClick={clearSel} className="text-gray-500 hover:text-white">✕</button></div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setDoorType(selectedDoor.slotIndex, 'entry')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${selectedDoor.type === 'entry' ? 'bg-green-500/20 text-green-400' : 'bg-gray-900/50 text-gray-500'}`}>دخول</button>
                      <button onClick={() => setDoorType(selectedDoor.slotIndex, 'exit')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${selectedDoor.type === 'exit' ? 'bg-rose-500/20 text-rose-400' : 'bg-gray-900/50 text-gray-500'}`}>خروج</button>
                    </div>
                    <button onClick={() => removeDoor(selectedDoor.slotIndex)} className="w-full py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20">🗑️ إزالة الباب (يعود كرسي)</button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">🪑 مقعد #{selectedSeat}</h4><button onClick={clearSel} className="text-gray-500 hover:text-white">✕</button></div>
                    {isRect && (
                      <div className="grid grid-cols-1 gap-1.5">
                        <button onClick={startNumberingHere} className="py-2 rounded-lg text-xs font-bold bg-blue-500/10 border border-blue-500/25 text-blue-300 hover:bg-blue-500/20">① بدء الترقيم من هذا المقعد</button>
                        <button onClick={putDoorHere} className="py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:bg-rose-500/20">🚪 ضع باباً مكانه (يحلّ محلّ الكرسي)</button>
                      </div>
                    )}
                    {selectedPinned ? (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-amber-400 text-xs font-bold">📌 {selectedPinned.playerName}</span>
                        <button onClick={() => { if (pinSlotIndex != null) unpin(pinSlotIndex); }} className="text-rose-400 text-xs">إلغاء التثبيت</button>
                      </div>
                    ) : (
                      <div className="space-y-2 border-t border-gray-700/20 pt-2">
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ابحث عن لاعب لتثبيته..." className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none" />
                        {search && filteredPlayers.map(p => (
                          <button key={p.id} onClick={() => pinPlayer({ id: p.id, phone: p.phone, name: p.name })} className="w-full flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-1.5 hover:bg-amber-500/5 text-right">
                            <span className="text-xs text-white font-bold">{p.name}</span><span className="text-[10px] text-gray-500 mr-auto" dir="ltr">{p.phone || '—'}</span>
                          </button>
                        ))}
                        <div className="flex gap-1.5">
                          <input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="أو اسم يدوي" className="flex-1 bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none" />
                          <button onClick={() => { if (manualName.trim()) pinPlayer({ name: manualName.trim() }); }} disabled={!manualName.trim()} className="px-3 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold disabled:opacity-40">📌</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ملخّص */}
          {(pinnedSlots.length > 0 || doors.length > 0) && (
            <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4 space-y-2">
              {doors.length > 0 && <p className="text-[11px] text-rose-300">🚪 {doors.length} أبواب · المقاعد المجاورة: {layout?.doorSeats.join('، ') || '—'}</p>}
              {pinnedSlots.length > 0 && <p className="text-[11px] text-amber-400">📌 {pinnedSlots.length} لاعب مثبّت</p>}
            </div>
          )}

          <button onClick={() => setIsDefault(!isDefault)} className={`text-xs px-4 py-2 rounded-lg border ${isDefault ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700/20'}`}>{isDefault ? '⭐ قالب افتراضي' : 'تعيين كافتراضي'}</button>
        </div>

        {/* المشهد */}
        <div className="lg:sticky lg:top-16 h-fit">
          {isRect && layout ? (
            <div className="relative rounded-2xl overflow-hidden border border-gray-700/40" style={{ height: '72vh', minHeight: 420 }}>
              <button onClick={() => { setViewMode(v => !v); clearSel(); }} className={`absolute top-3 right-3 z-10 px-4 py-2 rounded-xl text-xs font-bold border backdrop-blur transition ${viewMode ? 'bg-blue-500/25 text-blue-200 border-blue-400/40' : 'bg-amber-500/25 text-amber-200 border-amber-400/40'}`}>
                {viewMode ? '🔄 وضع الدوران (اضغط للتعديل)' : '✋ وضع التعديل (اضغط للدوران)'}
              </button>
              <div className="absolute bottom-3 right-3 left-3 z-10 flex items-center gap-3 text-[10px] text-gray-300 bg-black/40 backdrop-blur rounded-lg px-3 py-1.5 flex-wrap justify-center">
                <span className="text-emerald-400">■ كرسي</span><span className="text-amber-400">■ 📌</span><span className="text-rose-400">■ باب</span><span className="text-gray-400">■ مؤخر</span><span className="text-blue-400">■ محدد</span>
                <span>{viewMode ? '🖱️ اسحب للدوران' : '🖱️ انقر كرسياً/باباً'}</span>
              </div>
              <Editor3D sides={sides} seats={layout.seats} doorNodes={layout.doorNodes} pinnedNameBySlot={pinnedNameBySlot}
                reservedTailCount={reservedTailCount} viewMode={viewMode}
                selectedSeat={selectedSeat} selectedDoorSlot={selectedDoorSlot}
                onSelectSeat={(n) => { setSelectedSeat(n); setSelectedDoorSlot(null); }}
                onSelectDoor={(s) => { setSelectedDoorSlot(s); setSelectedSeat(null); }} />
            </div>
          ) : (
            <Svg2D total={totalSeats} layout={layoutType} reservedTailCount={reservedTailCount}
              pinnedSet={new Set(pinnedSlots.map(p => p.slotIndex))} selectedSeat={selectedSeat}
              onSelect={(n) => { setSelectedSeat(n); setSelectedDoorSlot(null); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Svg2D({ total, layout, reservedTailCount, pinnedSet, selectedSeat, onSelect }: {
  total: number; layout: string; reservedTailCount: number; pinnedSet: Set<number>; selectedSeat: number | null; onSelect: (n: number | null) => void;
}) {
  const W = 600, H = 460; const pos = gen2D(total, layout, W, H); const tailStart = total - reservedTailCount + 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full bg-gray-900/70 rounded-2xl border border-gray-700/40" onClick={() => onSelect(null)}>
      {pos.map(p => {
        const pinned = pinnedSet.has(p.id); const isTail = p.id >= tailStart && reservedTailCount > 0; const sel = selectedSeat === p.id;
        const c = sel ? '#3b82f6' : pinned ? '#f59e0b' : isTail ? '#6b7280' : '#10b981';
        return (
          <g key={p.id} transform={`translate(${p.x - 21},${p.y - 21})`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : p.id); }}>
            <rect width={42} height={42} rx={12} fill={`${c}26`} stroke={c} strokeWidth={sel ? 2.5 : 1.5} />
            <text x={21} y={21} textAnchor="middle" dominantBaseline="central" fill={c} fontSize={15} fontWeight="bold">{p.id}</text>
            {pinned && <text x={21} y={34} textAnchor="middle" fill="#f59e0b" fontSize={8}>📌</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function SeatTemplateEditorPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>}>
      <EditorInner />
    </Suspense>
  );
}
