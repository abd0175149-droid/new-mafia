// ══════════════════════════════════════════════════════
// 📐 هندسة التخطيط المستطيل — Rectangle Layout Math (نقي، بلا three)
// • الكراسي مستقيمة على كل ضلع، ووجهها عموديّ نحو داخل المستطيل.
// • عدد كراسي كل ضلع ثابت لا يتغيّر. الباب يُضاف كـ«موضع إضافي» بين الكراسي،
//   فتتباعد الكراسي لتفسح له مكاناً (دون أن ينقص عددها)، ويبقى مكان الباب فارغاً.
// • هويّة الكرسي = (الضلع + ترتيبه على الضلع) — ثابتة عند إضافة/إزالة أبواب أو إعادة ترقيم.
// ══════════════════════════════════════════════════════

export type Side = 'top' | 'right' | 'bottom' | 'left';
export interface Sides { top: number; right: number; bottom: number; left: number }
export interface ChairRef { side: Side; sideIndex: number }
// الباب يُدرَج بعد عدد (pos) من كراسي الضلع: pos=0 قبل الأول، pos=C بعد الأخير
export interface RectDoor { id: string; side: Side; pos: number; type: 'entry' | 'exit' }
export interface Numbering { start: ChairRef | null; direction: 'cw' | 'ccw' }

export interface RectSeat { seatNum: number; side: Side; sideIndex: number; x: number; z: number; rotationY: number }
export interface DoorNode { id: string; side: Side; type: 'entry' | 'exit'; x: number; z: number; rotationY: number }
export interface Dims { W: number; D: number; halfW: number; halfD: number }
export interface RectLayout { seats: RectSeat[]; doorNodes: DoorNode[]; totalChairs: number; doorSeats: number[]; dims: Dims }

export const SPACING = 1.5;
const SIDES_ORDER: Side[] = ['top', 'right', 'bottom', 'left'];

export function totalFromSides(s: Sides): number {
  return (s.top || 0) + (s.right || 0) + (s.bottom || 0) + (s.left || 0);
}

function inwardRotation(side: Side): number {
  switch (side) {
    case 'top': return 0;
    case 'bottom': return Math.PI;
    case 'left': return Math.PI / 2;
    case 'right': return -Math.PI / 2;
  }
}

// عدد العناصر (كراسي + أبواب) على كل ضلع — يحدّد أبعاد المستطيل
function elementCount(sides: Sides, doors: RectDoor[], side: Side): number {
  return (sides[side] || 0) + doors.filter(d => d.side === side).length;
}

export function rectDims(sides: Sides, doors: RectDoor[] = []): Dims {
  const cols = Math.max(elementCount(sides, doors, 'top'), elementCount(sides, doors, 'bottom'), 1);
  const rows = Math.max(elementCount(sides, doors, 'left'), elementCount(sides, doors, 'right'), 1);
  const W = Math.max(cols + 1, 4) * SPACING;
  const D = Math.max(rows + 1, 4) * SPACING;
  return { W, D, halfW: W / 2, halfD: D / 2 };
}

function coordOnSide(side: Side, f: number, d: Dims): { x: number; z: number } {
  switch (side) {
    case 'top': return { x: -d.halfW + d.W * f, z: -d.halfD };
    case 'bottom': return { x: d.halfW - d.W * f, z: d.halfD };
    case 'right': return { x: d.halfW, z: -d.halfD + d.D * f };
    case 'left': return { x: -d.halfW, z: d.halfD - d.D * f };
  }
}

type GEl =
  | { kind: 'chair'; side: Side; sideIndex: number; x: number; z: number; rotationY: number; seatNum: number }
  | { kind: 'door'; side: Side; id: string; type: 'entry' | 'exit'; x: number; z: number; rotationY: number };

export function computeRectLayout(sides: Sides, numbering: Numbering, doors: RectDoor[]): RectLayout {
  const dims = rectDims(sides, doors);
  const global: GEl[] = [];

  for (const side of SIDES_ORDER) {
    const C = sides[side] || 0;
    const dz = (doors || []).filter(d => d.side === side).slice().sort((a, b) => a.pos - b.pos);
    // بناء تسلسل العناصر على الضلع: أبواب مُدرَجة عند pos بين الكراسي
    const seq: ({ kind: 'chair'; sideIndex: number } | { kind: 'door'; door: RectDoor })[] = [];
    let di = 0;
    for (let c = 0; c <= C; c++) {
      while (di < dz.length && dz[di].pos === c) { seq.push({ kind: 'door', door: dz[di] }); di++; }
      if (c < C) seq.push({ kind: 'chair', sideIndex: c });
    }
    const E = seq.length;
    seq.forEach((el, j) => {
      const f = (j + 1) / (E + 1);
      const { x, z } = coordOnSide(side, f, dims);
      const rotationY = inwardRotation(side);
      if (el.kind === 'chair') global.push({ kind: 'chair', side, sideIndex: el.sideIndex, x, z, rotationY, seatNum: 0 });
      else global.push({ kind: 'door', side, id: el.door.id, type: el.door.type, x, z, rotationY });
    });
  }

  // ترقيم الكراسي بدءاً من الكرسي المختار (أو أول كرسي) بالاتجاه المحدّد
  const chairEls = global.filter(e => e.kind === 'chair') as Extract<GEl, { kind: 'chair' }>[];
  const C = chairEls.length;
  if (C > 0) {
    let startIdx = 0;
    if (numbering.start) {
      const i = chairEls.findIndex(c => c.side === numbering.start!.side && c.sideIndex === numbering.start!.sideIndex);
      if (i >= 0) startIdx = i;
    }
    for (let i = 0; i < C; i++) {
      const idx = numbering.direction === 'cw' ? (startIdx + i) % C : ((startIdx - i) % C + C) % C;
      chairEls[idx].seatNum = i + 1;
    }
  }

  const seats: RectSeat[] = chairEls
    .map(c => ({ seatNum: c.seatNum, side: c.side, sideIndex: c.sideIndex, x: c.x, z: c.z, rotationY: c.rotationY }))
    .sort((a, b) => a.seatNum - b.seatNum);

  const doorNodes: DoorNode[] = global.filter(e => e.kind === 'door').map(e => {
    const d = e as Extract<GEl, { kind: 'door' }>;
    return { id: d.id, side: d.side, type: d.type, x: d.x, z: d.z, rotationY: d.rotationY };
  });

  // المقاعد المجاورة للأبواب = أقرب كرسي على كل جهة من موضع الباب في الحلقة العامة
  const doorSeats = new Set<number>();
  const N = global.length;
  for (let g = 0; g < N; g++) {
    if (global[g].kind !== 'door') continue;
    for (const dir of [-1, 1]) {
      for (let k = 1; k < N; k++) {
        const idx = ((g + dir * k) % N + N) % N;
        const el = global[idx];
        if (el.kind === 'chair') { if (el.seatNum) doorSeats.add(el.seatNum); break; }
      }
    }
  }

  return { seats, doorNodes, totalChairs: C, doorSeats: Array.from(doorSeats).sort((a, b) => a - b), dims };
}

export function seatsTo2D(seats: RectSeat[]): { id: number; x: number; y: number }[] {
  if (seats.length === 0) return [];
  const xs = seats.map(s => s.x), zs = seats.map(s => s.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
  const pad = 40, W = 600, H = 450;
  return seats.map(s => ({ id: s.seatNum, x: pad + ((s.x - minX) / spanX) * (W - pad * 2), y: pad + ((s.z - minZ) / spanZ) * (H - pad * 2) }));
}
