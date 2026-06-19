// ══════════════════════════════════════════════════════
// 📐 هندسة التخطيط المستطيل — Rectangle Layout Math (نقي، بلا three)
// • الكراسي مستقيمة على كل ضلع، ووجهها عموديّ نحو داخل المستطيل.
// • الباب يحلّ محلّ كرسي (يأخذ موضعه)، فيُزال الكرسي ويُعاد ترقيم الكراسي
//   متخطّياً مواضع الأبواب، ويبقى مكان الباب فارغاً من الكراسي.
// ══════════════════════════════════════════════════════

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Sides { top: number; right: number; bottom: number; left: number }
export interface Numbering { startIndex: number; direction: 'cw' | 'ccw' }
export interface RectDoor { id: string; slotIndex: number; type: 'entry' | 'exit' }

export interface RectSeat { seatNum: number; slotIndex: number; x: number; z: number; side: Side; rotationY: number }
export interface DoorNode { id: string; slotIndex: number; type: 'entry' | 'exit'; x: number; z: number; side: Side; rotationY: number }
export interface RectLayout { seats: RectSeat[]; doorNodes: DoorNode[]; totalSlots: number; totalChairs: number; doorSeats: number[] }

export const SPACING = 1.5;

export function totalFromSides(s: Sides): number {
  return (s.top || 0) + (s.right || 0) + (s.bottom || 0) + (s.left || 0);
}

export function rectDims(sides: Sides) {
  const cols = Math.max(sides.top, sides.bottom, 1);
  const rows = Math.max(sides.left, sides.right, 1);
  const W = Math.max(cols + 1, 4) * SPACING;
  const D = Math.max(rows + 1, 4) * SPACING;
  return { W, D, halfW: W / 2, halfD: D / 2 };
}

// اتجاه الجلوس عموديّ نحو الداخل حسب الضلع (الكرسي يواجه +Z افتراضياً)
function inwardRotation(side: Side): number {
  switch (side) {
    case 'top': return 0;            // يواجه +Z (للأسفل/الداخل)
    case 'bottom': return Math.PI;   // يواجه -Z
    case 'left': return Math.PI / 2; // يواجه +X
    case 'right': return -Math.PI / 2; // يواجه -X
  }
}

// كل المواضع (slots) حول المحيط بالترتيب مع عقارب الساعة بدءاً من أعلى-يسار
function buildSlots(sides: Sides): { x: number; z: number; side: Side; slotIndex: number; rotationY: number }[] {
  const { W, D, halfW, halfD } = rectDims(sides);
  const out: { x: number; z: number; side: Side; slotIndex: number; rotationY: number }[] = [];
  const push = (side: Side, x: number, z: number) => out.push({ side, x, z, slotIndex: out.length, rotationY: inwardRotation(side) });
  for (let i = 0; i < sides.top; i++) push('top', -halfW + (W * (i + 1)) / (sides.top + 1), -halfD);
  for (let i = 0; i < sides.right; i++) push('right', halfW, -halfD + (D * (i + 1)) / (sides.right + 1));
  for (let i = 0; i < sides.bottom; i++) push('bottom', halfW - (W * (i + 1)) / (sides.bottom + 1), halfD);
  for (let i = 0; i < sides.left; i++) push('left', -halfW, halfD - (D * (i + 1)) / (sides.left + 1));
  return out;
}

export function computeRectLayout(sides: Sides, numbering: Numbering, doors: RectDoor[]): RectLayout {
  const slots = buildSlots(sides);
  const total = slots.length;
  const doorSet = new Set((doors || []).map(d => d.slotIndex).filter(i => i >= 0 && i < total));

  // ترقيم الكراسي فقط (تخطّي مواضع الأبواب) بدءاً من startIndex بالاتجاه المختار
  const seatNumBySlot = new Map<number, number>();
  if (total > 0) {
    const start = ((numbering.startIndex % total) + total) % total;
    let n = 0;
    for (let i = 0; i < total; i++) {
      const idx = numbering.direction === 'cw' ? (start + i) % total : ((start - i) % total + total) % total;
      if (!doorSet.has(idx)) { n++; seatNumBySlot.set(idx, n); }
    }
  }

  const seats: RectSeat[] = slots
    .filter(s => !doorSet.has(s.slotIndex))
    .map(s => ({ seatNum: seatNumBySlot.get(s.slotIndex)!, slotIndex: s.slotIndex, x: s.x, z: s.z, side: s.side, rotationY: s.rotationY }))
    .sort((a, b) => a.seatNum - b.seatNum);

  const doorNodes: DoorNode[] = (doors || [])
    .map(d => { const s = slots[d.slotIndex]; return s ? { id: d.id, slotIndex: d.slotIndex, type: d.type, x: s.x, z: s.z, side: s.side, rotationY: s.rotationY } : null; })
    .filter(Boolean) as DoorNode[];

  // المقاعد المجاورة لكل باب = أقرب كرسي على كل جهة فيزيائية من موضع الباب
  const doorSeats = new Set<number>();
  for (const d of Array.from(doorSet)) {
    for (const dir of [-1, 1]) {
      for (let k = 1; k < total; k++) {
        const idx = ((d + dir * k) % total + total) % total;
        if (!doorSet.has(idx)) { const sn = seatNumBySlot.get(idx); if (sn) doorSeats.add(sn); break; }
      }
    }
  }

  return { seats, doorNodes, totalSlots: total, totalChairs: total - doorSet.size, doorSeats: Array.from(doorSeats).sort((a, b) => a - b) };
}

// تحويل لمواقع 2D (seatPositions) للحفظ التوافقي
export function seatsTo2D(seats: RectSeat[]): { id: number; x: number; y: number }[] {
  if (seats.length === 0) return [];
  const xs = seats.map(s => s.x), zs = seats.map(s => s.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
  const pad = 40, W = 600, H = 450;
  return seats.map(s => ({ id: s.seatNum, x: pad + ((s.x - minX) / spanX) * (W - pad * 2), y: pad + ((s.z - minZ) / spanZ) * (H - pad * 2) }));
}
