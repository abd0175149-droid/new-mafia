'use client';

// ══════════════════════════════════════════════════════
// 🪑🚪 محرّر القاعة ثلاثي الأبعاد — Rectangular Venue 3D Editor
// الكراسي تواجه مركز المستطيل دائماً. الأبواب بعرض محدّد مرتبطة بمقعد.
// زر «وضع العرض»: مفعّل = دوران بالكاميرا · مُوقف = النقر على المقاعد للتعديل.
// يُستورد ديناميكياً مع ssr:false.
// ══════════════════════════════════════════════════════

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import { rectDims, SPACING, type Sides, type RectDoor, type RectSeat } from '@/lib/rectLayout';

interface PinnedSeat { seatNumber: number; playerName: string }

interface Props {
  sides: Sides;
  seats: RectSeat[];
  doors: RectDoor[];
  pinnedSeats: PinnedSeat[];
  reservedTailCount: number;
  viewMode: boolean;        // true = دوران الكاميرا · false = نقر المقاعد
  selectedSeat: number | null;
  onSelectSeat: (n: number) => void;
}

const C = { normal: '#10b981', pinned: '#f59e0b', door: '#fb7185', tail: '#6b7280', selected: '#3b82f6' };

function Chair({ seat, color, pinnedName, clickable, onClick }: {
  seat: RectSeat; color: string; pinnedName?: string; clickable: boolean; onClick: () => void;
}) {
  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rotationY, 0]}>
      <RoundedBox
        args={[0.85, 0.45, 0.85]} radius={0.12} smoothness={4} position={[0, 0.23, 0]}
        onClick={clickable ? (e) => { e.stopPropagation(); onClick(); } : undefined}
        onPointerOver={clickable ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={clickable ? () => { document.body.style.cursor = 'auto'; } : undefined}
      >
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} emissive={color} emissiveIntensity={0.18} />
      </RoundedBox>
      {/* مسند الظهر — للخارج (الكرسي يواجه المركز) */}
      <RoundedBox args={[0.85, 0.6, 0.14]} radius={0.06} position={[0, 0.5, -0.36]}>
        <meshStandardMaterial color={color} roughness={0.6} emissive={color} emissiveIntensity={0.1} />
      </RoundedBox>
      <Html position={[0, 1.0, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', fontFamily: 'monospace', textShadow: '0 1px 3px #000', whiteSpace: 'nowrap', textAlign: 'center' }}>
          {seat.seatNum}
          {pinnedName && <div style={{ fontSize: 9, color: '#fbbf24', marginTop: 1 }}>📌 {pinnedName}</div>}
        </div>
      </Html>
    </group>
  );
}

function Door({ seat, dims, type }: { seat: RectSeat; dims: ReturnType<typeof rectDims>; type: 'entry' | 'exit' }) {
  const color = type === 'entry' ? '#22c55e' : '#ef4444';
  const wDoor = SPACING * 1.15;
  const { halfW, halfD } = dims;
  let pos: [number, number, number]; let args: [number, number, number];
  if (seat.side === 'top') { pos = [seat.x, 0.85, -halfD - 0.18]; args = [wDoor, 1.7, 0.32]; }
  else if (seat.side === 'bottom') { pos = [seat.x, 0.85, halfD + 0.18]; args = [wDoor, 1.7, 0.32]; }
  else if (seat.side === 'left') { pos = [-halfW - 0.18, 0.85, seat.z]; args = [0.32, 1.7, wDoor]; }
  else { pos = [halfW + 0.18, 0.85, seat.z]; args = [0.32, 1.7, wDoor]; }
  return (
    <group>
      <mesh position={pos}>
        <boxGeometry args={args} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.3} />
      </mesh>
      <Html position={[pos[0], 1.95, pos[2]]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{type === 'entry' ? '🚪⬇️' : '🚪⬆️'}</div>
      </Html>
    </group>
  );
}

function Scene({ sides, seats, doors, pinnedSeats, reservedTailCount, viewMode, selectedSeat, onSelectSeat }: Props) {
  const total = seats.length;
  const doorSlots = new Set(doors.map(d => d.slotIndex));
  const pinnedMap = new Map(pinnedSeats.map(p => [p.seatNumber, p.playerName]));
  const tailStart = total - reservedTailCount + 1;
  const dims = rectDims(sides);
  const { halfW, halfD } = dims;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 14, 6]} intensity={1.1} />
      <directionalLight position={[-6, 8, -8]} intensity={0.3} color="#f59e0b" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[halfW * 4 + 8, halfD * 4 + 8]} />
        <meshStandardMaterial color="#0b0e14" roughness={1} />
      </mesh>
      <gridHelper args={[Math.max(halfW, halfD) * 4, 24, '#1f2937', '#141a24']} />

      {/* الطاولة */}
      <RoundedBox args={[Math.max(halfW * 1.2, 1.5), 0.5, Math.max(halfD * 1.2, 1.5)]} radius={0.1} position={[0, 0.25, 0]}>
        <meshStandardMaterial color="#15202e" roughness={0.4} metalness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(halfW * 1.2, 1.5), Math.max(halfD * 1.2, 1.5)]} />
        <meshStandardMaterial color="#1a2738" roughness={0.3} metalness={0.4} emissive="#f59e0b" emissiveIntensity={0.05} />
      </mesh>

      {/* الكراسي */}
      {seats.map(s => {
        const isSel = selectedSeat === s.seatNum;
        const isPinned = pinnedMap.has(s.seatNum);
        const isDoor = doorSlots.has(s.slotIndex);
        const isTail = s.seatNum >= tailStart && reservedTailCount > 0;
        const color = isSel ? C.selected : isPinned ? C.pinned : isDoor ? C.door : isTail ? C.tail : C.normal;
        return (
          <Chair key={s.slotIndex} seat={s} color={color} pinnedName={pinnedMap.get(s.seatNum)}
            clickable={!viewMode} onClick={() => onSelectSeat(s.seatNum)} />
        );
      })}

      {/* الأبواب */}
      {doors.map(d => {
        const seat = seats.find(s => s.slotIndex === d.slotIndex);
        if (!seat) return null;
        return <Door key={d.id} seat={seat} dims={dims} type={d.type} />;
      })}

      <OrbitControls
        enabled={viewMode}
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
    <div style={{ width: '100%', height: '100%', minHeight: 380, background: 'radial-gradient(ellipse at 50% 25%, #11161f 0%, #070a0f 100%)' }}>
      <Canvas camera={{ position: [bound * 1.2, bound * 1.9, bound * 2.1], fov: 50 }}>
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
