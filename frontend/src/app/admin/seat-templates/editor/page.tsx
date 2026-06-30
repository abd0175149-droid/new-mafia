'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  computeRectLayout, seatsTo2D, totalFromSides,
  type Sides, type Numbering, type RectDoor, type Side,
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

type PinVal = { playerId?: number; phone?: string; playerName: string };
const SIDE_LABEL: Record<string, string> = { top: 'أعلى', right: 'يمين', bottom: 'أسفل', left: 'يسار' };
const rectKey = (side: Side, sideIndex: number) => `r:${side}:${sideIndex}`;

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
  const [blockedPairs, setBlockedPairs] = useState<any[]>([]); // الأزواج الممنوعة العالمية (لفحص التثبيت)

  const [name, setName] = useState('');
  const [layoutType, setLayoutType] = useState<'rectangle' | 'circle' | 'rows'>('rectangle');
  const [sides, setSides] = useState<Sides>({ top: 6, right: 4, bottom: 6, left: 4 });
  const [numbering, setNumbering] = useState<Numbering>({ start: null, direction: 'cw' });
  const [doors, setDoors] = useState<RectDoor[]>([]);
  const [reservedTailCount, setReservedTailCount] = useState(5);
  const [pinned, setPinned] = useState<Record<string, PinVal>>({}); // key: r:side:idx (مستطيل) أو s:seatNum (دائري/صفوف)
  const [isDefault, setIsDefault] = useState(false);
  const [totalSeats, setTotalSeats] = useState(20);

  const [viewMode, setViewMode] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');

  const isRect = layoutType === 'rectangle';
  const layout = useMemo(() => isRect ? computeRectLayout(sides, numbering, doors) : null, [isRect, sides, numbering, doors]);
  const totalChairs = layout?.totalChairs ?? totalFromSides(sides);
  const effectiveTotal = isRect ? totalChairs : totalSeats;
  const selectedSeatObj = useMemo(() => layout?.seats.find(s => s.seatNum === selectedSeat), [layout, selectedSeat]);
  const selectedDoor = useMemo(() => doors.find(d => d.id === selectedDoorId), [doors, selectedDoorId]);

  const pinnedByChair = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(pinned).forEach(([k, v]) => { if (k.startsWith('r:')) m[k.slice(2)] = v.playerName; });
    return m;
  }, [pinned]);
  const pinned2DSet = useMemo(() => new Set(Object.keys(pinned).filter(k => k.startsWith('s:')).map(k => Number(k.slice(2)))), [pinned]);

  // المفتاح الحالي للتثبيت حسب المقعد المحدّد
  const pinKey = isRect
    ? (selectedSeatObj ? rectKey(selectedSeatObj.side, selectedSeatObj.sideIndex) : null)
    : (selectedSeat != null ? `s:${selectedSeat}` : null);

  useEffect(() => { apiFetch('/api/player/all').then(r => setPlayers(Array.isArray(r) ? r : r.players || [])).catch(() => {}); }, []);
  useEffect(() => { apiFetch('/api/seating/blocked-pairs').then(r => setBlockedPairs(r.pairs || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!editId) return;
    apiFetch(`/api/seat-templates/${editId}`).then(({ template: t }) => {
      setName(t.name); setLayoutType((t.layoutType as any) || 'rectangle');
      setReservedTailCount(t.reservedTailCount); setIsDefault(t.isDefault); setTotalSeats(t.totalSeats);
      if (t.layoutType === 'rectangle' && t.layoutConfig?.shape === 'rectangle') {
        const lc = t.layoutConfig;
        setSides(lc.sides);
        const num: Numbering = { start: lc.numbering?.start ?? null, direction: lc.numbering?.direction || 'cw' };
        setNumbering(num);
        const dz: RectDoor[] = (lc.doors || []).filter((d: any) => d && d.side && typeof d.pos === 'number')
          .map((d: any) => ({ id: d.id || 'd' + Math.random().toString(36).slice(2), side: d.side, pos: d.pos, type: d.type || 'entry' }));
        setDoors(dz);
        const lay = computeRectLayout(lc.sides, num, dz);
        const pm: Record<string, PinVal> = {};
        (t.pinnedSeats || []).forEach((p: any) => { const seat = lay.seats.find(s => s.seatNum === p.seatNumber); if (seat) pm[rectKey(seat.side, seat.sideIndex)] = { playerId: p.playerId, phone: p.phone, playerName: p.playerName }; });
        setPinned(pm);
      } else {
        setSides(defaultSides(t.totalSeats)); setNumbering({ start: null, direction: 'cw' }); setDoors([]);
        const pm: Record<string, PinVal> = {};
        (t.pinnedSeats || []).forEach((p: any) => { pm[`s:${p.seatNumber}`] = { playerId: p.playerId, phone: p.phone, playerName: p.playerName }; });
        setPinned(pm);
      }
    }).catch(() => alert('تعذّر تحميل القالب')).finally(() => setLoading(false));
  }, [editId]);

  const clearSel = () => { setSelectedSeat(null); setSelectedDoorId(null); setSearch(''); setManualName(''); };

  const setSide = (side: keyof Sides, delta: number) => setSides(prev => {
    const next = { ...prev, [side]: Math.max(0, prev[side] + delta) };
    if (totalFromSides(next) > 50) return prev;
    return next;
  });

  const startNumberingHere = () => { if (selectedSeatObj) { setNumbering(n => ({ ...n, start: { side: selectedSeatObj.side, sideIndex: selectedSeatObj.sideIndex } })); clearSel(); } };
  const putDoorHere = () => {
    if (!selectedSeatObj) return;
    setDoors(prev => [...prev, { id: 'd' + Date.now(), side: selectedSeatObj.side, pos: selectedSeatObj.sideIndex + 1, type: 'entry' }]);
    clearSel();
  };
  const removeDoor = (id: string) => { setDoors(prev => prev.filter(d => d.id !== id)); clearSel(); };
  const setDoorType = (id: string, type: 'entry' | 'exit') => setDoors(prev => prev.map(d => d.id === id ? { ...d, type } : d));

  // ── فحص ذكي لتعارض تثبيت لاعب في مقعد مع شروط الجلوس ──
  const normPhone = (ph?: string) => {
    if (!ph) return '';
    let c = ph.replace(/[\s\-()+]/g, '');
    if (c.startsWith('00962')) c = c.slice(5); else if (c.startsWith('962')) c = c.slice(3);
    return c.startsWith('0') ? c : '0' + c;
  };
  const genderAr = (g?: string) => (g || '').toUpperCase() === 'FEMALE' ? 'أنثى' : (g || '').toUpperCase() === 'MALE' ? 'ذكر' : '';
  // سجل اللاعب الكامل (جنس/قيد) من قائمة players بالـ id أو الهاتف
  const lookupPlayer = (ref: { playerId?: number | null; phone?: string }) => {
    if (ref.playerId != null) { const f = players.find(p => p.id === ref.playerId); if (f) return f; }
    const ph = normPhone(ref.phone);
    if (ph) { const f = players.find(p => normPhone(p.phone) === ph); if (f) return f; }
    return null;
  };
  // رقم المقعد من مفتاح التثبيت (s:N للدائري/الصفوف، r:side:idx للمستطيل)
  const seatNumOfKey = (key: string): number | null => {
    if (key.startsWith('s:')) return Number(key.slice(2));
    const [, side, idxStr] = key.split(':');
    const seat = layout?.seats.find(s => s.side === side && s.sideIndex === Number(idxStr));
    return seat?.seatNum ?? null;
  };
  const circDist = (a: number, b: number, total: number) => { const d = Math.abs(a - b); return Math.min(d, total - d); };

  /** يرجع قائمة رسائل التعارض عند تثبيت «cand» في المقعد targetSeat (فارغة = لا تعارض) */
  const checkPinConflicts = (
    targetSeat: number,
    cand: { playerId?: number; phone?: string; name: string; gender?: string; genderConstraint?: string },
  ): string[] => {
    const total = effectiveTotal;
    if (!total || total < 2) return [];
    // المقاعد المشغولة (عدا الهدف نفسه) → رقم المقعد ← التثبيت
    const occ: Record<number, PinVal> = {};
    Object.entries(pinned).forEach(([k, v]) => { const n = seatNumOfKey(k); if (n && n !== targetSeat) occ[n] = v; });

    const conflicts: string[] = [];
    const candGender = (cand.gender || '').toUpperCase();
    const candRule = cand.genderConstraint || 'NONE';
    const candPhone = normPhone(cand.phone);

    // 1) قيود الجنس — الجيران المباشرون (يسار/يمين)
    const left = targetSeat === 1 ? total : targetSeat - 1;
    const right = targetSeat === total ? 1 : targetSeat + 1;
    for (const ns of [left, right]) {
      const pin = occ[ns]; if (!pin) continue;
      const nb = lookupPlayer(pin);
      const nbGender = (nb?.gender || '').toUpperCase();
      const nbRule = nb?.genderConstraint || 'NONE';
      const nbName = pin.playerName || nb?.name || `مقعد ${ns}`;
      if (!candGender || !nbGender) continue; // جنس غير معروف (اسم يدوي) → تخطّ
      if (candRule === 'FORBID_SAME' && candGender === nbGender)
        conflicts.push(`«${cand.name}» ممنوع مجاورة نفس الجنس — الجار «${nbName}» (${genderAr(nbGender)}) بالمقعد ${ns}`);
      if (candRule === 'FORBID_OPPOSITE' && candGender !== nbGender)
        conflicts.push(`«${cand.name}» ممنوع مجاورة الجنس الآخر — الجار «${nbName}» (${genderAr(nbGender)}) بالمقعد ${ns}`);
      if (nbRule === 'FORBID_SAME' && nbGender === candGender)
        conflicts.push(`الجار «${nbName}» (بالمقعد ${ns}) ممنوع مجاورة نفس الجنس — و«${cand.name}» (${genderAr(candGender)}) مِثله`);
      if (nbRule === 'FORBID_OPPOSITE' && nbGender !== candGender)
        conflicts.push(`الجار «${nbName}» (بالمقعد ${ns}) ممنوع مجاورة الجنس الآخر — و«${cand.name}» (${genderAr(candGender)}) مختلف`);
    }

    // 2) الأزواج الممنوعة — ضمن مسافة مقعدين (الحد الأدنى 3 مقاعد بينهما)
    if (blockedPairs.length > 0 && (cand.playerId != null || candPhone)) {
      for (let ns = 1; ns <= total; ns++) {
        if (ns === targetSeat) continue;
        const pin = occ[ns]; if (!pin) continue;
        const dist = circDist(targetSeat, ns, total);
        if (dist > 2) continue;
        const nb = lookupPlayer(pin);
        const nbId = nb?.id ?? pin.playerId;
        const nbPhone = normPhone(pin.phone || nb?.phone);
        const isBlocked = blockedPairs.some((bp: any) => {
          const ph1 = normPhone(bp.player1_phone), ph2 = normPhone(bp.player2_phone);
          const candIs1 = (cand.playerId != null && bp.player1_id === cand.playerId) || (!!candPhone && ph1 === candPhone);
          const candIs2 = (cand.playerId != null && bp.player2_id === cand.playerId) || (!!candPhone && ph2 === candPhone);
          const nbIs1 = (nbId != null && bp.player1_id === nbId) || (!!nbPhone && ph1 === nbPhone);
          const nbIs2 = (nbId != null && bp.player2_id === nbId) || (!!nbPhone && ph2 === nbPhone);
          return (candIs1 && nbIs2) || (candIs2 && nbIs1);
        });
        if (isBlocked) {
          const nbName = pin.playerName || nb?.name || `مقعد ${ns}`;
          conflicts.push(`زوج ممنوع: «${cand.name}» و«${nbName}» على بُعد ${dist} مقعد فقط (المقعد ${ns}) — المطلوب 3 مقاعد على الأقل`);
        }
      }
    }
    return conflicts;
  };

  const pinPlayer = (p: { id?: number; phone?: string; name: string; gender?: string; genderConstraint?: string }) => {
    if (!pinKey) return;
    const targetSeat = seatNumOfKey(pinKey);
    if (targetSeat != null) {
      const conflicts = checkPinConflicts(targetSeat, { playerId: p.id, phone: p.phone, name: p.name, gender: p.gender, genderConstraint: p.genderConstraint });
      if (conflicts.length > 0) {
        const ok = window.confirm(`⚠️ تعارض مع شروط الجلوس:\n\n${conflicts.map(c => '• ' + c).join('\n')}\n\nتثبيت «${p.name}» في المقعد ${targetSeat} رغم ذلك؟`);
        if (!ok) return;
      }
    }
    setPinned(prev => ({ ...prev, [pinKey]: { playerId: p.id, phone: p.phone, playerName: p.name } }));
    setSearch(''); setManualName('');
  };
  const unpinKey = (key: string) => setPinned(prev => { const n = { ...prev }; delete n[key]; return n; });

  const handleSave = async () => {
    if (!name.trim()) { alert('الاسم مطلوب'); return; }
    if (effectiveTotal < 6 || effectiveTotal > 50) { alert('عدد الكراسي بين 6 و 50'); return; }
    setSaving(true);
    try {
      let layoutConfig: any = null; let seatPositions: any = null; let pinnedSeats: any[] = [];
      if (isRect && layout) {
        Object.entries(pinned).forEach(([k, v]) => {
          if (!k.startsWith('r:')) return;
          const [, side, idxStr] = k.split(':');
          const seat = layout.seats.find(s => s.side === side && s.sideIndex === Number(idxStr));
          if (seat) pinnedSeats.push({ seatNumber: seat.seatNum, playerId: v.playerId, phone: v.phone, playerName: v.playerName });
        });
        layoutConfig = { shape: 'rectangle', sides, numbering, doors, doorSeats: layout.doorSeats };
        seatPositions = seatsTo2D(layout.seats);
      } else {
        Object.entries(pinned).forEach(([k, v]) => { if (k.startsWith('s:')) { const n = Number(k.slice(2)); if (n <= totalSeats) pinnedSeats.push({ seatNumber: n, playerId: v.playerId, phone: v.phone, playerName: v.playerName }); } });
      }
      const body = { name, layoutType, totalSeats: effectiveTotal, reservedTailCount, pinnedSeats, seatPositions, layoutConfig, isDefault };
      if (editId) await apiFetch(`/api/seat-templates/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/api/seat-templates', { method: 'POST', body: JSON.stringify(body) });
      router.push('/admin/seat-templates');
    } catch (e: any) { alert('فشل الحفظ: ' + e.message); setSaving(false); }
  };

  const filteredPlayers = players.filter(p => (p.name || '').includes(search) || (p.phone || '').includes(search)).slice(0, 6);
  const selectedPinned = pinKey ? pinned[pinKey] : undefined;
  const doorCount = doors.length;

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
              <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: قاعة المزاج" className="w-full bg-gray-900/70 border border-gray-700/30 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-amber-500/50 focus:outline-none" />
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
                <p className="text-xs text-gray-400 mb-1 font-bold">عدد الكراسي لكل ضلع</p>
                <p className="text-[10px] text-gray-600 mb-3">كراسي: <span className="text-emerald-400 font-bold">{totalChairs}</span> · أبواب: <span className="text-rose-400 font-bold">{doorCount}</span> <span className="text-gray-700">(الباب موضع إضافي لا ينقص الكراسي)</span></p>
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
                {totalChairs >= 50 && <p className="text-[10px] text-rose-400 mt-2">⚠️ بلغت الحدّ الأقصى 50</p>}
              </div>

              <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1 font-bold">الترقيم {numbering.start && <span className="text-blue-400 font-normal">(يبدأ من مقعد محدّد)</span>}</p>
                <p className="text-[10px] text-gray-600 mb-2">وضع التعديل: انقر كرسياً ← «بدء الترقيم من هنا»</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setNumbering(n => ({ ...n, direction: 'cw' }))} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${numbering.direction === 'cw' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20'}`}>↻ مع العقارب</button>
                  <button onClick={() => setNumbering(n => ({ ...n, direction: 'ccw' }))} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${numbering.direction === 'ccw' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-gray-900/50 text-gray-500 border-gray-700/20'}`}>↺ عكسها</button>
                </div>
                {numbering.start && <button onClick={() => setNumbering(n => ({ ...n, start: null }))} className="mt-2 text-[10px] text-gray-500 hover:text-white">↺ إعادة للبداية الافتراضية</button>}
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

          <AnimatePresence>
            {(selectedSeat != null || selectedDoorId) && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-gray-800/80 border border-blue-500/30 rounded-xl p-4 space-y-3">
                {selectedDoorId && selectedDoor ? (
                  <>
                    <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">🚪 باب — {SIDE_LABEL[selectedDoor.side]}</h4><button onClick={clearSel} className="text-gray-500 hover:text-white">✕</button></div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setDoorType(selectedDoor.id, 'entry')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${selectedDoor.type === 'entry' ? 'bg-green-500/20 text-green-400' : 'bg-gray-900/50 text-gray-500'}`}>دخول</button>
                      <button onClick={() => setDoorType(selectedDoor.id, 'exit')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${selectedDoor.type === 'exit' ? 'bg-rose-500/20 text-rose-400' : 'bg-gray-900/50 text-gray-500'}`}>خروج</button>
                    </div>
                    <button onClick={() => removeDoor(selectedDoor.id)} className="w-full py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20">🗑️ إزالة الباب</button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-white">🪑 مقعد #{selectedSeat}</h4><button onClick={clearSel} className="text-gray-500 hover:text-white">✕</button></div>
                    {isRect && (
                      <div className="grid grid-cols-1 gap-1.5">
                        <button onClick={startNumberingHere} className="py-2 rounded-lg text-xs font-bold bg-blue-500/10 border border-blue-500/25 text-blue-300 hover:bg-blue-500/20">① بدء الترقيم من هذا المقعد</button>
                        <button onClick={putDoorHere} className="py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:bg-rose-500/20">🚪 ضع باباً بجانبه (موضع إضافي)</button>
                      </div>
                    )}
                    {selectedPinned ? (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-center justify-between">
                        <span className="text-amber-400 text-xs font-bold">📌 {selectedPinned.playerName}</span>
                        <button onClick={() => { if (pinKey) unpinKey(pinKey); }} className="text-rose-400 text-xs">إلغاء التثبيت</button>
                      </div>
                    ) : (
                      <div className="space-y-2 border-t border-gray-700/20 pt-2">
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ابحث عن لاعب لتثبيته..." className="w-full bg-gray-900/70 border border-gray-700/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none" />
                        {search && filteredPlayers.map(p => (
                          <button key={p.id} onClick={() => pinPlayer({ id: p.id, phone: p.phone, name: p.name, gender: p.gender, genderConstraint: p.genderConstraint })} className="w-full flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-1.5 hover:bg-amber-500/5 text-right">
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

          {(Object.keys(pinned).length > 0 || doorCount > 0) && (
            <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-4 space-y-2">
              {doorCount > 0 && <p className="text-[11px] text-rose-300">🚪 {doorCount} أبواب · المقاعد المجاورة: {layout?.doorSeats.join('، ') || '—'}</p>}
              {Object.keys(pinned).length > 0 && <p className="text-[11px] text-amber-400">📌 {Object.keys(pinned).length} لاعب مثبّت</p>}
            </div>
          )}

          <button onClick={() => setIsDefault(!isDefault)} className={`text-xs px-4 py-2 rounded-lg border ${isDefault ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-gray-800/50 text-gray-500 border-gray-700/20'}`}>{isDefault ? '⭐ قالب افتراضي' : 'تعيين كافتراضي'}</button>
        </div>

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
              <Editor3D dims={layout.dims} seats={layout.seats} doorNodes={layout.doorNodes} pinnedByChair={pinnedByChair}
                reservedTailCount={reservedTailCount} viewMode={viewMode}
                selectedSeat={selectedSeat} selectedDoorId={selectedDoorId}
                onSelectSeat={(n) => { setSelectedSeat(n); setSelectedDoorId(null); }}
                onSelectDoor={(id) => { setSelectedDoorId(id); setSelectedSeat(null); }} />
            </div>
          ) : (
            <Svg2D total={totalSeats} layout={layoutType} reservedTailCount={reservedTailCount} pinnedSet={pinned2DSet} selectedSeat={selectedSeat} onSelect={(n) => { setSelectedSeat(n); setSelectedDoorId(null); }} />
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
