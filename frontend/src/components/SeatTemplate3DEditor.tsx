'use client';

// ══════════════════════════════════════════════════════
// 🪑🚪 محرّر القاعة ثلاثي الأبعاد — Rectangular Venue 3D Editor
// طاولة في الوسط + كراسي على الأضلاع + أبواب على الجدران.
// نقر على كرسي = تحديد/تثبيت · نقر على الجدار = إضافة باب · دوران بالكاميرا.
// يُستورد ديناميكياً مع ssr:false (يعتمد three.js).
// ══════════════════════════════════════════════════════

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import {
  computeRectSeats, computeDoorSeats, rectDims, doorPoint,
  type Sides, type Numbering, type RectDoor, type Side,
} from '@/lib/rectLayout';

interface PinnedSeat { seatNumber: number; playerName: string }

interface Props {
  sides: Sides;
  numbering: Numbering;
  doors: RectDoor[];
  pinnedSeats: PinnedSeat[];
  reservedTailCount: number;
  selectedSeat: number | null;
  onSelectSeat: (n: number | null) => void;
  onAddDoor: (side: Side, offset: number) => void;
}

const SEAT_COLORS = {
  normal: '#10b981', pinned: '#f59e0b', door: '#fb7185', tail: '#6b7280', selected: '#3b82f6',
};

function Chair({ x, z, num, color, pinnedName, onClick }: {
  x: number; z: number; num: number; color: string; pinnedName?: string; onClick: () => void;
}) {
  return (
    <group position={[x, 0, z]}>
      {/* مقعد */}
      <RoundedBox
        args={[0.85, 0.5, 0.85]} radius={0.12} smoothness={4}
        position={[0, 0.25, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} emissive={color} emissiveIntensity={0.18} />
      </RoundedBox>
      {/* مسند الظهر */}
      <RoundedBox args={[0.85, 0.55, 0.14]} radius={0.06} position={[0, 0.5, -0.36]}>
        <meshStandardMaterial color={color} roughness={0.6} emissive={color} emissiveIntensity={0.1} />
      </RoundedBox>
      {/* الرقم */}
      <Html position={[0, 0.95, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontWeight: 800, fontSize: 15, color: '#fff', fontFamily: 'monospace',
          textShadow: '0 1px 3px #000', whiteSpace: 'nowrap', textAlign: 'center',
        }}>
          {num}
          {pinnedName && <div style={{ fontSize: 9, color: '#fbbf24', marginTop: 1 }}>📌 {pinnedName}</div>}
        </div>
      </Html>
    </group>
  );
}

function DoorMarker({ x, z, type }: { x: number; z: number; type: 'entry' | 'exit' }) {
  const color = type === 'entry' ? '#22c55e' : '#ef4444';
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.55, 1.4, 0.22]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <Html position={[0, 1.7, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{type === 'entry' ? '🚪⬇️' : '🚪⬆️'}</div>
      </Html>
    </group>
  );
}

// شريط جدار قابل للنقر لإضافة باب
function WallStrip({ side, dims, onAddDoor }: {
  side: Side; dims: ReturnType<typeof rectDims>; onAddDoor: (side: Side, offset: number) => void;
}) {
  const { W, D, halfW, halfD } = dims;
  let pos: [number, number, number]; let args: [number, number, number];
  if (side === 'top') { pos = [0, 0.05, -halfD]; args = [W, 0.1, 0.3]; }
  else if (side === 'bottom') { pos = [0, 0.05, halfD]; args = [W, 0.1, 0.3]; }
  else if (side === 'right') { pos = [halfW, 0.05, 0]; args = [0.3, 0.1, D]; }
  else { pos = [-halfW, 0.05, 0]; args = [0.3, 0.1, D]; }

  return (
    <mesh
      position={pos}
      onClick={(e) => {
        e.stopPropagation();
        const p = e.point;
        let offset = 0.5;
        if (side === 'top') offset = (p.x + halfW) / W;
        else if (side === 'bottom') offset = (halfW - p.x) / W;
        else if (side === 'right') offset = (p.z + halfD) / D;
        else offset = (halfD - p.z) / D;
        onAddDoor(side, Math.max(0, Math.min(1, offset)));
      }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'copy'; }}
      onPointerOut={() => { document.body.style.cursor = 'auto'; }}
    >
      <boxGeometry args={args} />
      <meshStandardMaterial color="#1f2937" transparent opacity={0.35} />
    </mesh>
  );
}

function Scene({ sides, numbering, doors, pinnedSeats, reservedTailCount, selectedSeat, onSelectSeat, onAddDoor }: Props) {
  const seats = computeRectSeats(sides, numbering);
  const total = seats.length;
  const doorSeats = new Set(computeDoorSeats(sides, seats, doors));
  const pinnedMap = new Map(pinnedSeats.map(p => [p.seatNumber, p.playerName]));
  const tailStart = total - reservedTailCount + 1;
  const dims = rectDims(sides);
  const { halfW, halfD } = dims;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} castShadow />
      <directionalLight position={[-6, 8, -8]} intensity={0.3} color="#f59e0b" />

      {/* الأرضية */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} onClick={() => onSelectSeat(null)}>
        <planeGeometry args={[halfW * 4 + 8, halfD * 4 + 8]} />
        <meshStandardMaterial color="#0b0e14" roughness={1} />
      </mesh>
      {/* شبكة خفيفة */}
      <gridHelper args={[Math.max(halfW, halfD) * 4, 24, '#1f2937', '#141a24']} position={[0, 0, 0]} />

      {/* الطاولة المركزية */}
      <RoundedBox args={[Math.max(halfW * 1.2, 1.5), 0.5, Math.max(halfD * 1.2, 1.5)]} radius={0.1} position={[0, 0.25, 0]}>
        <meshStandardMaterial color="#15202e" roughness={0.4} metalness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(halfW * 1.2, 1.5), Math.max(halfD * 1.2, 1.5)]} />
        <meshStandardMaterial color="#1a2738" roughness={0.3} metalness={0.4} emissive="#f59e0b" emissiveIntensity={0.04} />
      </mesh>

      {/* أشرطة الجدران (نقر = إضافة باب) */}
      {(['top', 'right', 'bottom', 'left'] as Side[]).map(side => (
        <WallStrip key={side} side={side} dims={dims} onAddDoor={onAddDoor} />
      ))}

      {/* الكراسي */}
      {seats.map(s => {
        const isSel = selectedSeat === s.seatNum;
        const isPinned = pinnedMap.has(s.seatNum);
        const isDoor = doorSeats.has(s.seatNum);
        const isTail = s.seatNum >= tailStart && reservedTailCount > 0;
        const color = isSel ? SEAT_COLORS.selected
          : isPinned ? SEAT_COLORS.pinned
          : isDoor ? SEAT_COLORS.door
          : isTail ? SEAT_COLORS.tail
          : SEAT_COLORS.normal;
        return (
          <Chair key={s.seatNum} x={s.x} z={s.z} num={s.seatNum} color={color}
            pinnedName={pinnedMap.get(s.seatNum)} onClick={() => onSelectSeat(isSel ? null : s.seatNum)} />
        );
      })}

      {/* الأبواب */}
      {doors.map(d => {
        const p = doorPoint(sides, d);
        return <DoorMarker key={d.id} x={p.x} z={p.z} type={d.type} />;
      })}

      <OrbitControls
        enablePan={false}
        minDistance={Math.max(halfW, halfD) + 3}
        maxDistance={Math.max(halfW, halfD) * 4 + 12}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function SeatTemplate3DEditor(props: Props) {
  const dims = rectDims(props.sides);
  const bound = Math.max(dims.halfW, dims.halfD);
  return (
    <div style={{ width: '100%', height: 460, borderRadius: 16, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 30%, #11161f 0%, #070a0f 100%)' }}>
      <Canvas
        shadows
        camera={{ position: [bound * 1.3, bound * 1.8, bound * 2.0], fov: 50 }}
        onPointerMissed={() => props.onSelectSeat(null)}
      >
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
