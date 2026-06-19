'use client';

// ══════════════════════════════════════════════════════
// 🪑🚪 محرّر القاعة ثلاثي الأبعاد — Rectangular Venue 3D Editor
// الكراسي مستقيمة على كل ضلع، وجهها عموديّ نحو الداخل. عدد الكراسي ثابت؛
// الباب موضع إضافي بين الكراسي (مكانه فارغ من الكرسي) بعرض كرسي.
// زر «وضع العرض»: مفعّل = دوران الكاميرا · مُوقف = النقر على المقاعد/الأبواب.
// ══════════════════════════════════════════════════════

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox } from '@react-three/drei';
import type { RectSeat, DoorNode, Dims } from '@/lib/rectLayout';

interface Props {
  dims: Dims;
  seats: RectSeat[];
  doorNodes: DoorNode[];
  pinnedByChair: Record<string, string>; // "side:sideIndex" -> playerName
  reservedTailCount: number;
  viewMode: boolean;
  selectedSeat: number | null;     // seatNum
  selectedDoorId: string | null;
  onSelectSeat: (n: number) => void;
  onSelectDoor: (id: string) => void;
}

const C = { normal: '#10b981', pinned: '#f59e0b', tail: '#6b7280', selected: '#3b82f6' };
const chairKey = (s: RectSeat) => `${s.side}:${s.sideIndex}`;

function Chair({ seat, color, pinnedName, clickable, onClick }: {
  seat: RectSeat; color: string; pinnedName?: string; clickable: boolean; onClick: () => void;
}) {
  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rotationY, 0]}>
      <RoundedBox args={[0.85, 0.45, 0.85]} radius={0.12} smoothness={4} position={[0, 0.23, 0]}
        onClick={clickable ? (e) => { e.stopPropagation(); onClick(); } : undefined}
        onPointerOver={clickable ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={clickable ? () => { document.body.style.cursor = 'auto'; } : undefined}>
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} emissive={color} emissiveIntensity={0.18} />
      </RoundedBox>
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

function Door({ door, selected, clickable, onClick }: { door: DoorNode; selected: boolean; clickable: boolean; onClick: () => void }) {
  const color = door.type === 'entry' ? '#22c55e' : '#ef4444';
  return (
    <group position={[door.x, 0, door.z]} rotation={[0, door.rotationY, 0]}>
      <mesh position={[0, 0.95, 0]}
        onClick={clickable ? (e) => { e.stopPropagation(); onClick(); } : undefined}
        onPointerOver={clickable ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={clickable ? () => { document.body.style.cursor = 'auto'; } : undefined}>
        <boxGeometry args={[0.9, 1.9, 0.18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.95 : 0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshStandardMaterial color={color} transparent opacity={0.15} />
      </mesh>
      <Html position={[0, 2.15, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 13, whiteSpace: 'nowrap', textAlign: 'center' }}>{door.type === 'entry' ? '🚪 دخول' : '🚪 خروج'}</div>
      </Html>
    </group>
  );
}

function Scene({ dims, seats, doorNodes, pinnedByChair, reservedTailCount, viewMode, selectedSeat, selectedDoorId, onSelectSeat, onSelectDoor }: Props) {
  const totalChairs = seats.length;
  const tailStart = totalChairs - reservedTailCount + 1;
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
      <RoundedBox args={[Math.max(halfW * 1.2, 1.5), 0.5, Math.max(halfD * 1.2, 1.5)]} radius={0.1} position={[0, 0.25, 0]}>
        <meshStandardMaterial color="#15202e" roughness={0.4} metalness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(halfW * 1.2, 1.5), Math.max(halfD * 1.2, 1.5)]} />
        <meshStandardMaterial color="#1a2738" roughness={0.3} metalness={0.4} emissive="#f59e0b" emissiveIntensity={0.05} />
      </mesh>

      {seats.map(s => {
        const isSel = selectedSeat === s.seatNum;
        const name = pinnedByChair[chairKey(s)];
        const isTail = s.seatNum >= tailStart && reservedTailCount > 0;
        const color = isSel ? C.selected : name ? C.pinned : isTail ? C.tail : C.normal;
        return <Chair key={chairKey(s)} seat={s} color={color} pinnedName={name} clickable={!viewMode} onClick={() => onSelectSeat(s.seatNum)} />;
      })}

      {doorNodes.map(d => (
        <Door key={d.id} door={d} selected={selectedDoorId === d.id} clickable={!viewMode} onClick={() => onSelectDoor(d.id)} />
      ))}

      <OrbitControls enabled={viewMode} enablePan={false}
        minDistance={Math.max(halfW, halfD) + 3} maxDistance={Math.max(halfW, halfD) * 4 + 12}
        maxPolarAngle={Math.PI / 2.15} target={[0, 0, 0]} />
    </>
  );
}

export default function SeatTemplate3DEditor(props: Props) {
  const bound = Math.max(props.dims.halfW, props.dims.halfD);
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 380, background: 'radial-gradient(ellipse at 50% 25%, #11161f 0%, #070a0f 100%)' }}>
      <Canvas camera={{ position: [bound * 1.2, bound * 1.9, bound * 2.1], fov: 50 }}>
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
