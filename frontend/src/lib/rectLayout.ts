// ══════════════════════════════════════════════════════
// 📐 هندسة التخطيط المستطيل — Rectangle Layout Math (نقي، بلا three)
// مصدر واحد لحساب: مواقع المقاعد، الترقيم، نقاط الأبواب، والمقاعد المجاورة للأبواب.
// يُستخدم من محرّر 3D ومن صفحة الحفظ معاً.
// ══════════════════════════════════════════════════════

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Corner = 'TL' | 'TR' | 'BR' | 'BL';

export interface Sides { top: number; right: number; bottom: number; left: number }
export interface Numbering { startCorner: Corner; direction: 'cw' | 'ccw' }
export interface RectDoor { id: string; side: Side; offset: number; type: 'entry' | 'exit' }
export interface RectSeat { seatNum: number; x: number; z: number; side: Side; slotIndex: number }

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

// ── حساب المقاعد: مواقع (x,z) + رقم كل مقعد حسب زاوية البداية والاتجاه ──
export function computeRectSeats(sides: Sides, numbering: Numbering): RectSeat[] {
  const { W, D, halfW, halfD } = rectDims(sides);
  // قائمة «الخانات» بالترتيب الطبيعي مع عقارب الساعة بدءاً من أعلى-يسار:
  // أعلى (يسار→يمين) ← يمين (أعلى→أسفل) ← أسفل (يمين→يسار) ← يسار (أسفل→أعلى)
  const slots: { x: number; z: number; side: Side }[] = [];
  for (let i = 0; i < sides.top; i++) slots.push({ side: 'top', x: -halfW + (W * (i + 1)) / (sides.top + 1), z: -halfD });
  for (let i = 0; i < sides.right; i++) slots.push({ side: 'right', x: halfW, z: -halfD + (D * (i + 1)) / (sides.right + 1) });
  for (let i = 0; i < sides.bottom; i++) slots.push({ side: 'bottom', x: halfW - (W * (i + 1)) / (sides.bottom + 1), z: halfD });
  for (let i = 0; i < sides.left; i++) slots.push({ side: 'left', x: -halfW, z: halfD - (D * (i + 1)) / (sides.left + 1) });

  const total = slots.length;
  const arr: RectSeat[] = slots.map((s, slotIndex) => ({ ...s, slotIndex, seatNum: 0 }));
  if (total === 0) return arr;

  const startIndex =
    numbering.startCorner === 'TL' ? 0 :
    numbering.startCorner === 'TR' ? sides.top :
    numbering.startCorner === 'BR' ? sides.top + sides.right :
    sides.top + sides.right + sides.bottom; // BL

  for (let i = 0; i < total; i++) {
    const idx = numbering.direction === 'cw'
      ? (startIndex + i) % total
      : ((startIndex - i) % total + total) % total;
    arr[idx].seatNum = i + 1;
  }
  return arr.sort((a, b) => a.seatNum - b.seatNum);
}

// ── إحداثيات الباب على الجدار حسب الضلع والإزاحة (0..1) ──
export function doorPoint(sides: Sides, door: RectDoor): { x: number; z: number } {
  const { W, D, halfW, halfD } = rectDims(sides);
  const o = Math.max(0, Math.min(1, door.offset));
  switch (door.side) {
    case 'top': return { x: -halfW + W * o, z: -halfD };
    case 'bottom': return { x: halfW - W * o, z: halfD };
    case 'right': return { x: halfW, z: -halfD + D * o };
    case 'left': return { x: -halfW, z: halfD - D * o };
  }
}

// ── المقاعد المجاورة للأبواب: أقرب مقعد لكل باب + جاريه على الحلقة ──
export function computeDoorSeats(sides: Sides, seats: RectSeat[], doors: RectDoor[]): number[] {
  const total = seats.length;
  const set = new Set<number>();
  if (total === 0) return [];
  for (const d of doors) {
    const p = doorPoint(sides, d);
    let best = seats[0]; let bestDist = Infinity;
    for (const s of seats) {
      const dd = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (dd < bestDist) { bestDist = dd; best = s; }
    }
    if (best) {
      set.add(best.seatNum);
      set.add(best.seatNum === 1 ? total : best.seatNum - 1);
      set.add(best.seatNum === total ? 1 : best.seatNum + 1);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

// ── تحويل إحداثيات 3D (x,z) إلى مواقع 2D للحفظ التوافقي (seatPositions) ──
export function seatsTo2D(seats: RectSeat[]): { id: number; x: number; y: number }[] {
  if (seats.length === 0) return [];
  // قياس بسيط إلى لوحة 600×450 (للعرض التوافقي فقط)
  const xs = seats.map(s => s.x), zs = seats.map(s => s.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
  const pad = 40, W = 600, H = 450;
  return seats.map(s => ({
    id: s.seatNum,
    x: pad + ((s.x - minX) / spanX) * (W - pad * 2),
    y: pad + ((s.z - minZ) / spanZ) * (H - pad * 2),
  }));
}
