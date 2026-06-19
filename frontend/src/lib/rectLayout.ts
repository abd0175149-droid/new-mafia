// ══════════════════════════════════════════════════════
// 📐 هندسة التخطيط المستطيل — Rectangle Layout Math (نقي، بلا three)
// مصدر واحد: مواقع المقاعد، اتجاه كل كرسي نحو المركز، الترقيم (من أي مقعد)،
// والأبواب المرتبطة بموقع مقعد (slot) مع المقاعد المجاورة لها.
// ══════════════════════════════════════════════════════

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Sides { top: number; right: number; bottom: number; left: number }
// الترقيم يبدأ من «خانة» محدّدة (موقع فيزيائي حول المحيط) باتجاه معيّن
export interface Numbering { startIndex: number; direction: 'cw' | 'ccw' }
// الباب مرتبط بموقع مقعد فيزيائي (slotIndex) كي لا يتحرّك عند إعادة الترقيم
export interface RectDoor { id: string; slotIndex: number; seatNumber?: number; type: 'entry' | 'exit' }
export interface RectSeat { seatNum: number; slotIndex: number; x: number; z: number; side: Side; rotationY: number }

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

// ── المقاعد: مواقع (x,z) + اتجاه نحو المركز + رقم كل مقعد بدءاً من خانة معيّنة ──
export function computeRectSeats(sides: Sides, numbering: Numbering): RectSeat[] {
  const { W, D, halfW, halfD } = rectDims(sides);
  // الخانات بالترتيب الطبيعي مع عقارب الساعة بدءاً من أعلى-يسار:
  // أعلى (يسار→يمين) ← يمين (أعلى→أسفل) ← أسفل (يمين→يسار) ← يسار (أسفل→أعلى)
  const slots: { x: number; z: number; side: Side }[] = [];
  for (let i = 0; i < sides.top; i++) slots.push({ side: 'top', x: -halfW + (W * (i + 1)) / (sides.top + 1), z: -halfD });
  for (let i = 0; i < sides.right; i++) slots.push({ side: 'right', x: halfW, z: -halfD + (D * (i + 1)) / (sides.right + 1) });
  for (let i = 0; i < sides.bottom; i++) slots.push({ side: 'bottom', x: halfW - (W * (i + 1)) / (sides.bottom + 1), z: halfD });
  for (let i = 0; i < sides.left; i++) slots.push({ side: 'left', x: -halfW, z: halfD - (D * (i + 1)) / (sides.left + 1) });

  const total = slots.length;
  const arr: RectSeat[] = slots.map((s, slotIndex) => ({
    ...s, slotIndex, seatNum: 0,
    // اتجاه الكرسي نحو مركز المستطيل (الكرسي يواجه +Z افتراضياً)
    rotationY: Math.atan2(-s.x, -s.z),
  }));
  if (total === 0) return arr;

  const start = ((numbering.startIndex % total) + total) % total;
  for (let i = 0; i < total; i++) {
    const idx = numbering.direction === 'cw'
      ? (start + i) % total
      : ((start - i) % total + total) % total;
    arr[idx].seatNum = i + 1;
  }
  return arr.sort((a, b) => a.seatNum - b.seatNum);
}

// ── المقاعد المجاورة للأبواب: مقعد الباب + جاريه على الحلقة ──
export function computeDoorSeats(seats: RectSeat[], doors: RectDoor[]): number[] {
  const total = seats.length;
  const set = new Set<number>();
  if (total === 0) return [];
  for (const d of doors) {
    const seat = seats.find(s => s.slotIndex === d.slotIndex);
    if (!seat) continue;
    set.add(seat.seatNum);
    set.add(seat.seatNum === 1 ? total : seat.seatNum - 1);
    set.add(seat.seatNum === total ? 1 : seat.seatNum + 1);
  }
  return Array.from(set).sort((a, b) => a - b);
}

// ── ختم رقم المقعد الحالي على كل باب (للعرض في واجهة الليدر) ──
export function stampDoorSeatNumbers(seats: RectSeat[], doors: RectDoor[]): RectDoor[] {
  return doors.map(d => {
    const s = seats.find(x => x.slotIndex === d.slotIndex);
    return { ...d, seatNumber: s?.seatNum };
  });
}

// ── تحويل لمواقع 2D (seatPositions) للحفظ التوافقي ──
export function seatsTo2D(seats: RectSeat[]): { id: number; x: number; y: number }[] {
  if (seats.length === 0) return [];
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
