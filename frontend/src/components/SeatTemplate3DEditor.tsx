'use client';

// ══════════════════════════════════════════════════════
// 🏛️🪑 قاعة المافيا ثلاثيّة الأبعاد — Realistic Venue 3D
// غرفة واقعيّة: جدران بارتفاع مع فتحات أبواب، كراسي مجسّمة موجّهة للطاولة،
// طاولة مركزيّة، إضاءة دافئة وظلال ناعمة، وحلقة إضاءة تحت كل مقعد تعكس حالته
// (متاح/مثبّت قالب/مخصّص نشاط/مؤخّر/محدّد) — كأنّك داخل لعبة ثلاثية الأبعاد.
// التفاعل: مدارٌ حرّ (اسحب/زوم) دائماً + نقر المقاعد/الأبواب. viewMode = دورانٌ سينمائيّ.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, RoundedBox, ContactShadows, MeshReflectorMaterial } from '@react-three/drei';
import type { RectSeat, DoorNode, Dims } from '@/lib/rectLayout';
import { SPACING } from '@/lib/rectLayout';

interface Props {
  dims: Dims;
  seats: RectSeat[];
  doorNodes: DoorNode[];
  pinnedByChair: Record<string, string>;    // "side:sideIndex" -> playerName (تثبيت القالب الدائم)
  assignedByChair?: Record<string, string>;  // "side:sideIndex" -> playerName (تخصيص النشاط المؤقّت)
  reservedTailCount: number;
  viewMode: boolean;                          // true = دورانٌ سينمائيّ تلقائيّ
  selectedSeat: number | null;
  selectedDoorId: string | null;
  onSelectSeat: (n: number) => void;
  onSelectDoor: (id: string) => void;
}

const chairKey = (s: RectSeat) => `${s.side}:${s.sideIndex}`;

// حالات المقاعد (لون الحلقة/التوهّج تحت الكرسي)
const STATE = {
  empty:    '#34d399',
  pin:      '#eab04a',
  assign:   '#a78bfa',
  tail:     '#64748b',
  selected: '#5aa0ff',
};
const WALL_H = 2.65;      // ارتفاع الجدار
const WALL_T = 0.17;      // سماكة الجدار
const DOOR_HALF = SPACING * 0.62; // نصف عرض فتحة الباب

// إزاحة الكرسيّ إلى داخل الغرفة بعيداً عن الجدار (يجلس ملاصقاً للجدار من الداخل، لا داخله)
const CHAIR_INSET = 0.72;
function insetOf(side: RectSeat['side']): [number, number] {
  if (side === 'top') return [0, CHAIR_INSET];
  if (side === 'bottom') return [0, -CHAIR_INSET];
  if (side === 'left') return [CHAIR_INSET, 0];
  return [-CHAIR_INSET, 0]; // right
}

// ── كرسيّ مجسّم واقعيّ + حلقة حالة مضيئة ──
function Chair({ seat, state, name, glow, selected, dimmed, onClick, onOver, onOut }: {
  seat: RectSeat; state: string; name?: string; glow: boolean; selected: boolean; dimmed: boolean;
  onClick: () => void; onOver: () => void; onOut: () => void;
}) {
  const emis = selected ? 0.85 : glow ? 0.45 : name ? 0.28 : 0.1;
  const lift = glow ? 0.05 : 0;
  const [ix, iz] = insetOf(seat.side);
  const wood = '#1c130b', leather = '#2f2620';
  return (
    <group position={[seat.x + ix, 0, seat.z + iz]} rotation={[0, seat.rotationY, 0]}>
      {/* حلقة الحالة المضيئة على الأرض */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.32, 0.44, 44]} />
        <meshBasicMaterial color={state} transparent opacity={selected ? 0.95 : dimmed ? 0.25 : glow ? 0.9 : 0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <circleGeometry args={[0.32, 44]} />
        <meshBasicMaterial color={state} transparent opacity={selected ? 0.26 : 0.08} />
      </mesh>

      {/* جسم الكرسيّ */}
      <group
        position={[0, lift, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); onOver(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onOut(); document.body.style.cursor = 'auto'; }}
      >
        {/* أرجل مخروطيّة */}
        {[[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.2, lz]} castShadow>
            <cylinderGeometry args={[0.028, 0.045, 0.4, 10]} />
            <meshStandardMaterial color={wood} roughness={0.45} metalness={0.4} />
          </mesh>
        ))}
        {/* إطار خشبيّ تحت المقعد */}
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.5, 0.07, 0.5]} />
          <meshStandardMaterial color={wood} roughness={0.5} metalness={0.35} />
        </mesh>
        {/* وسادة المقعد (جلد + توهّج خفيف للحالة) */}
        <RoundedBox args={[0.5, 0.1, 0.5]} radius={0.045} smoothness={5} position={[0, 0.5, 0]} castShadow>
          <meshStandardMaterial color={leather} roughness={0.5} metalness={0.12} emissive={state} emissiveIntensity={emis * 0.5} />
        </RoundedBox>
        {/* الظهر: مائل قليلاً للخلف (نحو الجدار) */}
        <group position={[0, 0.55, -0.22]} rotation={[-0.13, 0, 0]}>
          <RoundedBox args={[0.5, 0.6, 0.09]} radius={0.045} smoothness={5} position={[0, 0.3, 0]} castShadow>
            <meshStandardMaterial color={leather} roughness={0.55} metalness={0.12} emissive={state} emissiveIntensity={emis * 0.45} />
          </RoundedBox>
          {/* مسند علويّ خشبيّ + خيط ذهبيّ رفيع */}
          <mesh position={[0, 0.63, 0]} castShadow>
            <boxGeometry args={[0.52, 0.08, 0.12]} />
            <meshStandardMaterial color={wood} roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.63, 0.065]}>
            <boxGeometry args={[0.44, 0.02, 0.02]} />
            <meshStandardMaterial color="#c9a457" roughness={0.3} metalness={0.85} emissive="#c9a457" emissiveIntensity={0.2} />
          </mesh>
        </group>
      </group>

      {/* اللوحة العائمة: الرقم دائماً + الاسم عند الإشغال/التحويم */}
      <Html position={[0, 1.5, 0]} center distanceFactor={9} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ textAlign: 'center', fontFamily: 'monospace', whiteSpace: 'nowrap', opacity: dimmed ? 0.5 : 1 }}>
          <div style={{
            display: 'inline-block', fontWeight: 800, fontSize: 13, color: '#fff',
            background: 'rgba(10,12,18,.7)', border: `1px solid ${selected ? STATE.selected : 'rgba(255,255,255,.18)'}`,
            borderRadius: 8, padding: '1px 7px', textShadow: '0 1px 2px #000', backdropFilter: 'blur(3px)',
          }}>{seat.seatNum}</div>
          {name && (glow || !!name) && (
            <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 700, color: state, textShadow: '0 1px 3px #000', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          )}
        </div>
      </Html>
    </group>
  );
}

// ── فتحة باب: إطار + عتبة + مصراع مفتوح ──
function Doorway({ door, selected, onClick }: { door: DoorNode; selected: boolean; onClick: () => void }) {
  const col = door.type === 'entry' ? '#22c55e' : '#ef4444';
  return (
    <group position={[door.x, 0, door.z]} rotation={[0, door.rotationY, 0]}>
      {/* قائمان + عتبة علويّة */}
      {[-DOOR_HALF, DOOR_HALF].map((px, i) => (
        <mesh key={i} position={[px, WALL_H / 2, 0]} castShadow>
          <boxGeometry args={[WALL_T * 1.1, WALL_H, WALL_T * 1.2]} />
          <meshStandardMaterial color="#3a2c17" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, WALL_H - WALL_T * 0.6, 0]} castShadow>
        <boxGeometry args={[DOOR_HALF * 2 + WALL_T, WALL_T * 1.2, WALL_T * 1.2]} />
        <meshStandardMaterial color="#3a2c17" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* عتبة أرضيّة ملوّنة (دخول/خروج) */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
        <planeGeometry args={[DOOR_HALF * 2, WALL_T * 2.2]} />
        <meshStandardMaterial color={col} emissive={col} emissiveIntensity={selected ? 1 : 0.5} transparent opacity={0.85} />
      </mesh>
      {/* المصراع (مفتوح للداخل) */}
      <group position={[-DOOR_HALF + 0.03, 0, 0]} rotation={[0, 0.85, 0]}>
        <mesh position={[DOOR_HALF - 0.03, WALL_H * 0.44, 0.14]} castShadow>
          <boxGeometry args={[DOOR_HALF * 1.9, WALL_H * 0.86, 0.06]} />
          <meshStandardMaterial color="#241a12" roughness={0.5} metalness={0.15} emissive={col} emissiveIntensity={selected ? 0.35 : 0.12} />
        </mesh>
      </group>
      <Html position={[0, WALL_H + 0.25, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 12, whiteSpace: 'nowrap', color: col, fontWeight: 700, textShadow: '0 1px 3px #000' }}>
          {door.type === 'entry' ? '🚪 دخول' : '🚪 خروج'}
        </div>
      </Html>
    </group>
  );
}

// ── جدران مقطّعة حول فتحات الأبواب + أعمدة زوايا ──
function Walls({ dims, doorNodes }: { dims: Dims; doorNodes: DoorNode[] }) {
  const { halfW, halfD } = dims;
  const segsAlong = (min: number, max: number, doorPos: number[]) => {
    const sorted = [...doorPos].sort((a, b) => a - b);
    const out: [number, number][] = [];
    let cur = min;
    for (const p of sorted) {
      const a = p - DOOR_HALF, b = p + DOOR_HALF;
      if (a > cur) out.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (max > cur) out.push([cur, max]);
    return out;
  };
  // جدار واقعيّ بطبقات: بلاستر علويّ + إزار خشبيّ (wainscot) + إفريز + قاعدة + تاج ذهبيّ
  const RAIL = 0.98; // ارتفاع الإفريز/قمّة الإزار
  const horiz = (z: number, doorPos: number[]) => segsAlong(-halfW, halfW, doorPos).map(([a, b], i) => {
    const len = b - a; if (len <= 0.02) return null;
    return (
      <group key={i} position={[(a + b) / 2, 0, z]}>
        <mesh position={[0, WALL_H / 2, 0]} receiveShadow castShadow><boxGeometry args={[len, WALL_H, WALL_T]} /><meshStandardMaterial color="#2b2018" roughness={0.95} metalness={0.04} /></mesh>
        <mesh position={[0, (RAIL + 0.16) / 2, 0]} receiveShadow castShadow><boxGeometry args={[len, RAIL - 0.16, WALL_T * 1.4]} /><meshStandardMaterial color="#17100a" roughness={0.7} metalness={0.18} /></mesh>
        <mesh position={[0, RAIL, 0]}><boxGeometry args={[len, 0.07, WALL_T * 1.6]} /><meshStandardMaterial color="#6b552a" roughness={0.45} metalness={0.55} emissive="#6b552a" emissiveIntensity={0.14} /></mesh>
        <mesh position={[0, 0.08, 0]}><boxGeometry args={[len, 0.16, WALL_T * 1.5]} /><meshStandardMaterial color="#0c0906" roughness={0.8} /></mesh>
        <mesh position={[0, WALL_H - 0.03, 0]}><boxGeometry args={[len, 0.06, WALL_T * 1.4]} /><meshStandardMaterial color="#6b552a" roughness={0.5} metalness={0.5} emissive="#6b552a" emissiveIntensity={0.12} /></mesh>
      </group>
    );
  });
  const vert = (x: number, doorPos: number[]) => segsAlong(-halfD, halfD, doorPos).map(([a, b], i) => {
    const len = b - a; if (len <= 0.02) return null;
    return (
      <group key={i} position={[x, 0, (a + b) / 2]}>
        <mesh position={[0, WALL_H / 2, 0]} receiveShadow castShadow><boxGeometry args={[WALL_T, WALL_H, len]} /><meshStandardMaterial color="#2b2018" roughness={0.95} metalness={0.04} /></mesh>
        <mesh position={[0, (RAIL + 0.16) / 2, 0]} receiveShadow castShadow><boxGeometry args={[WALL_T * 1.4, RAIL - 0.16, len]} /><meshStandardMaterial color="#17100a" roughness={0.7} metalness={0.18} /></mesh>
        <mesh position={[0, RAIL, 0]}><boxGeometry args={[WALL_T * 1.6, 0.07, len]} /><meshStandardMaterial color="#6b552a" roughness={0.45} metalness={0.55} emissive="#6b552a" emissiveIntensity={0.14} /></mesh>
        <mesh position={[0, 0.08, 0]}><boxGeometry args={[WALL_T * 1.5, 0.16, len]} /><meshStandardMaterial color="#0c0906" roughness={0.8} /></mesh>
        <mesh position={[0, WALL_H - 0.03, 0]}><boxGeometry args={[WALL_T * 1.4, 0.06, len]} /><meshStandardMaterial color="#6b552a" roughness={0.5} metalness={0.5} emissive="#6b552a" emissiveIntensity={0.12} /></mesh>
      </group>
    );
  });

  const dTop = doorNodes.filter(d => d.side === 'top').map(d => d.x);
  const dBottom = doorNodes.filter(d => d.side === 'bottom').map(d => d.x);
  const dLeft = doorNodes.filter(d => d.side === 'left').map(d => d.z);
  const dRight = doorNodes.filter(d => d.side === 'right').map(d => d.z);

  return (
    <group>
      {horiz(-halfD, dTop)}
      {horiz(halfD, dBottom)}
      {vert(-halfW, dLeft)}
      {vert(halfW, dRight)}
      {/* أعمدة الزوايا */}
      {[[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx, WALL_H / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={[WALL_T * 1.9, WALL_H + 0.08, WALL_T * 1.9]} />
          <meshStandardMaterial color="#211913" roughness={0.85} metalness={0.15} />
        </mesh>
      ))}
    </group>
  );
}

// ── الطاولة المركزيّة ──
function Table({ dims }: { dims: Dims }) {
  const tw = Math.max(dims.W - 3 * SPACING, SPACING * 2.2);
  const td = Math.max(dims.D - 3 * SPACING, SPACING * 2.2);
  return (
    <group>
      <RoundedBox args={[tw, 0.14, td]} radius={0.09} smoothness={5} position={[0, 0.74, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1b120a" roughness={0.35} metalness={0.35} />
      </RoundedBox>
      {/* حافّة ذهبيّة */}
      <mesh position={[0, 0.82, 0]}>
        <boxGeometry args={[tw * 0.9, 0.015, td * 0.9]} />
        <meshStandardMaterial color="#c9a457" roughness={0.3} metalness={0.8} emissive="#c9a457" emissiveIntensity={0.18} />
      </mesh>
      {/* أرجل */}
      {[[-tw / 2 + 0.4, -td / 2 + 0.4], [tw / 2 - 0.4, -td / 2 + 0.4], [-tw / 2 + 0.4, td / 2 - 0.4], [tw / 2 - 0.4, td / 2 - 0.4]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.37, lz]} castShadow>
          <boxGeometry args={[0.12, 0.74, 0.12]} />
          <meshStandardMaterial color="#100b07" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {/* شعار في المنتصف */}
      <Html position={[0, 0.83, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div style={{ fontSize: 26, filter: 'drop-shadow(0 2px 6px rgba(201,164,87,.5))', opacity: 0.9 }}>🃏</div>
      </Html>
    </group>
  );
}

function Scene({ dims, seats, doorNodes, pinnedByChair, assignedByChair, reservedTailCount, viewMode, selectedSeat, selectedDoorId, onSelectSeat, onSelectDoor }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const bound = Math.max(dims.halfW, dims.halfD);
  const total = seats.length;
  const tailStart = total - reservedTailCount + 1;
  const floorW = dims.W + 3, floorD = dims.D + 3;

  return (
    <>
      {/* إضاءة القاعة */}
      <ambientLight intensity={0.75} color="#fff2df" />
      <hemisphereLight args={['#3a4560', '#0a0806', 0.7]} />
      <directionalLight
        position={[dims.halfW + 3, 11, dims.halfD + 3]} intensity={1.45} color="#ffe6c0" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004}
        shadow-camera-left={-bound - 4} shadow-camera-right={bound + 4}
        shadow-camera-top={bound + 4} shadow-camera-bottom={-bound - 4}
        shadow-camera-near={0.5} shadow-camera-far={44}
      />
      <directionalLight position={[-dims.halfW - 4, 6, -dims.halfD - 2]} intensity={0.4} color="#c9a457" />
      {/* ثريّا مركزيّة دافئة + جسم مرئيّ */}
      <pointLight position={[0, WALL_H * 1.35, 0]} intensity={11} distance={Math.max(dims.W, dims.D) * 1.6} decay={1.6} color="#ffcf8a" castShadow />
      <mesh position={[0, WALL_H * 1.35, 0]}>
        <sphereGeometry args={[0.16, 20, 20]} />
        <meshStandardMaterial color="#ffdfa0" emissive="#ffcf8a" emissiveIntensity={2.4} />
      </mesh>
      <mesh position={[0, WALL_H * 1.35 + 0.55, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.1, 6]} />
        <meshStandardMaterial color="#2a2216" />
      </mesh>
      {/* إضاءتان دافئتان بزاويتين متقابلتين لتوزيع أنعم */}
      <pointLight position={[dims.halfW * 0.7, 1.7, dims.halfD * 0.7]} intensity={3} distance={dims.W} decay={2} color="#e8b878" />
      <pointLight position={[-dims.halfW * 0.7, 1.7, -dims.halfD * 0.7]} intensity={3} distance={dims.W} decay={2} color="#e8b878" />

      {/* محيط خارجيّ داكن */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[floorW * 2, floorD * 2]} />
        <meshStandardMaterial color="#070809" roughness={1} />
      </mesh>
      {/* أرضيّة القاعة — خشب مصقول عاكس (واقعيّ) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[dims.W + WALL_T, dims.D + WALL_T]} />
        <MeshReflectorMaterial resolution={1024} mixBlur={1.1} mixStrength={2.2} blur={[420, 120]}
          roughness={0.78} depthScale={1.1} minDepthThreshold={0.4} maxDepthThreshold={1.3}
          color="#1a130c" metalness={0.55} mirror={0.35} />
      </mesh>
      {/* سجّادة تحت الطاولة بإطار ذهبيّ (لوح ذهبيّ أكبر تحت الأحمر) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
        <planeGeometry args={[dims.W - 1.2 * SPACING + 0.22, dims.D - 1.2 * SPACING + 0.22]} />
        <meshStandardMaterial color="#6b552a" roughness={0.5} metalness={0.6} emissive="#6b552a" emissiveIntensity={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]}>
        <planeGeometry args={[dims.W - 1.2 * SPACING, dims.D - 1.2 * SPACING]} />
        <meshStandardMaterial color="#3a1414" roughness={0.98} metalness={0.05} />
      </mesh>
      <ContactShadows position={[0, 0.022, 0]} opacity={0.6} scale={Math.max(floorW, floorD) * 1.4} blur={2.2} far={4.5} resolution={1024} color="#000000" />

      <Walls dims={dims} doorNodes={doorNodes} />
      <Table dims={dims} />

      {seats.map((s) => {
        const k = chairKey(s);
        const assigned = assignedByChair?.[k];
        const pinned = pinnedByChair[k];
        const name = assigned || pinned;
        const isTail = s.seatNum >= tailStart && reservedTailCount > 0;
        const sel = selectedSeat === s.seatNum;
        const state = sel ? STATE.selected : assigned ? STATE.assign : pinned ? STATE.pin : isTail ? STATE.tail : STATE.empty;
        const isHover = hover === s.seatNum;
        return (
          <Chair key={k} seat={s} state={state} name={name} glow={isHover || sel} selected={sel}
            dimmed={hover !== null && !isHover && !sel && !name}
            onClick={() => onSelectSeat(s.seatNum)} onOver={() => setHover(s.seatNum)} onOut={() => setHover(h => h === s.seatNum ? null : h)} />
        );
      })}

      {doorNodes.map((d) => (
        <Doorway key={d.id} door={d} selected={selectedDoorId === d.id} onClick={() => onSelectDoor(d.id)} />
      ))}

      <OrbitControls
        enableDamping dampingFactor={0.08} enablePan={false}
        autoRotate={viewMode} autoRotateSpeed={0.55}
        minDistance={bound + 2} maxDistance={bound * 4 + 12}
        maxPolarAngle={Math.PI / 2.12} target={[0, 0.55, 0]}
      />
    </>
  );
}

export default function SeatTemplate3DEditor(props: Props) {
  const bound = Math.max(props.dims.halfW, props.dims.halfD);
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 380, background: 'radial-gradient(ellipse at 50% 20%, #12100c 0%, #050608 78%)' }}>
      <Canvas shadows camera={{ position: [bound * 1.1, bound * 1.7, bound * 2.0], fov: 46 }} dpr={[1, 2]}
        gl={{ toneMappingExposure: 1.18, antialias: true }}>
        <fog attach="fog" args={['#070809', bound * 3.2, bound * 7]} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
