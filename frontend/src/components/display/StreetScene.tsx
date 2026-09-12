'use client';
// ══════════════════════════════════════════════════════
// 🏙️ زقاق المافيا — مشهد ثلاثيّ الأبعاد لشاشة القاعة (الليل والفجر)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: لا رسومٌ مسطّحة مجرّدة؛ مشهدٌ 3D بروح المافيا الإيطاليّة:
// زقاقٌ ضيّق بواجهاتٍ حجريّة وسلالم حريق، أسفلتٌ مبلّل يعكس الأضواء، مصابيح صوديوم
// دافئة ترتجف، حبال مصابيح معلّقة بين الواجهات، مظلّات مخطّطة، سيّارة كلاسيكيّة
// متوقّفة، ضبابٌ ومطرٌ خفيف. الكاميرا تتهادى ببطء. الفجر: السماء تدفأ، المصابيح تُطفأ،
// النوافذ تُظلم، ضبابٌ ذهبيّ منخفض.
//
// كلّ شيء إجرائيّ (بلا ملفّات نماذج) كي يعمل على متصفّح التلفاز بلا تحميل ثقيل.
// يُستورد بـnext/dynamic (ssr:false) لأنّ three يحتاج window.
// ══════════════════════════════════════════════════════
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

export type StreetMode = 'night' | 'dawn';

function rng(seed: number) { let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

/** واجهة مبنى: صندوق حجريّ + شبكة نوافذ (مضيئة ليلاً) + سلّم حريق + مظلّة أحياناً */
function Facade({ x, z, w, h, d, side, seed, mode }: { x: number; z: number; w: number; h: number; d: number; side: 1 | -1; seed: number; mode: StreetMode }) {
  const r = useMemo(() => rng(seed), [seed]);
  const wins = useMemo(() => {
    const out: Array<{ x: number; y: number; on: boolean; warm: boolean }> = [];
    const cols = Math.max(2, Math.floor(w / 1.4)), rows = Math.max(2, Math.floor(h / 1.6));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push({ x: -w / 2 + 0.7 + i * (w - 1.4) / Math.max(1, cols - 1), y: 1.2 + j * (h - 2) / Math.max(1, rows - 1), on: r() < 0.55, warm: r() < 0.7 });
    return out;
  }, [w, h, r]);
  const tone = useMemo(() => new THREE.Color().setHSL(0.07 + r() * 0.04, 0.25, 0.16 + r() * 0.08), [r]);
  const night = mode === 'night';
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={tone} roughness={0.95} /></mesh>
      {/* إفريز */}
      <mesh position={[0, h + 0.15, 0]}><boxGeometry args={[w + 0.3, 0.3, d + 0.3]} /><meshStandardMaterial color="#2a211a" roughness={1} /></mesh>
      {/* النوافذ على الوجه المطلّ على الزقاق */}
      {wins.map((wn, i) => (
        <mesh key={i} position={[side * (w / 2 + 0.02), wn.y, wn.x * (d / w)]} rotation={[0, side === 1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <planeGeometry args={[0.6, 0.9]} />
          <meshStandardMaterial color={night && wn.on ? (wn.warm ? '#ffd27a' : '#cfe3ff') : '#0b0c10'} emissive={night && wn.on ? (wn.warm ? '#ffb347' : '#8fb8ff') : '#000'} emissiveIntensity={night && wn.on ? 1.6 : 0} roughness={0.4} />
        </mesh>
      ))}
      {/* سلّم الحريق */}
      {[0.35, 0.65].map((f, k) => (
        <group key={k} position={[side * (w / 2 + 0.35), 0, -d / 2 + d * f]}>
          {Array.from({ length: Math.floor(h / 2.2) }).map((_, j) => (
            <mesh key={j} position={[0, 2.4 + j * 2.2, 0]}><boxGeometry args={[1.6, 0.06, 0.7]} /><meshStandardMaterial color="#1a1512" metalness={0.6} roughness={0.5} /></mesh>
          ))}
          <mesh position={[-0.8, h / 2, 0]}><boxGeometry args={[0.05, h - 1, 0.05]} /><meshStandardMaterial color="#1a1512" metalness={0.6} /></mesh>
          <mesh position={[0.8, h / 2, 0]}><boxGeometry args={[0.05, h - 1, 0.05]} /><meshStandardMaterial color="#1a1512" metalness={0.6} /></mesh>
        </group>
      ))}
      {/* مظلّة مخطّطة فوق باب المحلّ */}
      {seed % 3 === 0 && (
        <mesh position={[side * (w / 2 + 0.6), 2.6, 0]} rotation={[0, 0, -side * 0.35]}>
          <boxGeometry args={[1.2, 0.06, Math.min(d * 0.7, 4)]} />
          <meshStandardMaterial color={seed % 2 ? '#7a1f1f' : '#1f4d2e'} roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** مصباح شارع بضوءٍ يرتجف */
function Lamp({ x, z, on }: { x: number; z: number; on: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const seed = useMemo(() => Math.random() * 100, []);
  useFrame(({ clock }) => { if (light.current) light.current.intensity = on ? 14 + Math.sin(clock.elapsedTime * 7 + seed) * 1.2 + (Math.sin(clock.elapsedTime * 31 + seed) > 0.97 ? -6 : 0) : 0; });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.4, 0]}><cylinderGeometry args={[0.05, 0.08, 4.8, 8]} /><meshStandardMaterial color="#121212" metalness={0.7} roughness={0.4} /></mesh>
      <mesh position={[0, 4.9, 0]}><sphereGeometry args={[0.22, 12, 12]} /><meshStandardMaterial color="#ffe0a0" emissive="#ffb347" emissiveIntensity={on ? 3 : 0} /></mesh>
      <pointLight ref={light} position={[0, 4.8, 0]} color="#ffb060" distance={24} decay={2} />
    </group>
  );
}

/** حبل مصابيح معلّق بين الواجهتين */
function StringLights({ z, on }: { z: number; on: boolean }) {
  const bulbs = useMemo(() => Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [ -6 + t * 12, 6.2 - Math.sin(t * Math.PI) * 1.1, z ] as [number, number, number]; }), [z]);
  return (
    <group>
      {bulbs.map((p, i) => (
        <mesh key={i} position={p}><sphereGeometry args={[0.09, 8, 8]} /><meshStandardMaterial color="#ffe7b0" emissive={on ? '#ffc766' : '#000'} emissiveIntensity={on ? 2.5 : 0} /></mesh>
      ))}
      <mesh position={[0, 5.7, z]} rotation={[0, 0, 0]}><boxGeometry args={[12, 0.015, 0.015]} /><meshStandardMaterial color="#111" /></mesh>
    </group>
  );
}

/** سيّارة كلاسيكيّة منخفضة التفاصيل — كتلٌ وأسطوانات */
function VintageCar({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.55, 0]}><boxGeometry args={[4.4, 0.7, 1.8]} /><meshStandardMaterial color="#0d0d0f" metalness={0.8} roughness={0.25} /></mesh>
      <mesh position={[-0.3, 1.15, 0]}><boxGeometry args={[2.4, 0.6, 1.6]} /><meshStandardMaterial color="#0d0d0f" metalness={0.8} roughness={0.25} /></mesh>
      <mesh position={[0.95, 1.12, 0]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.7, 0.55, 1.5]} /><meshStandardMaterial color="#1b2a44" metalness={0.2} roughness={0.05} transparent opacity={0.85} /></mesh>
      {[[-1.5, 0.95], [1.5, 0.95], [-1.5, -0.95], [1.5, -0.95]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.38, wz]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.38, 0.38, 0.3, 16]} /><meshStandardMaterial color="#0a0a0a" roughness={0.9} /></mesh>
      ))}
      <mesh position={[2.2, 0.6, 0.55]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#fff2c0" emissive="#fff2c0" emissiveIntensity={0.4} /></mesh>
      <mesh position={[2.2, 0.6, -0.55]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#fff2c0" emissive="#fff2c0" emissiveIntensity={0.4} /></mesh>
    </group>
  );
}

/** مطرٌ خفيف — نقاطٌ تسقط وتُعاد */
function Rain({ count = 600, on }: { count?: number; on: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => { const a = new Float32Array(count * 3); for (let i = 0; i < count; i++) { a[i * 3] = (Math.random() - 0.5) * 30; a[i * 3 + 1] = Math.random() * 14; a[i * 3 + 2] = -Math.random() * 40 + 5; } return a; }, [count]);
  useFrame((_, dt) => { if (!ref.current || !on) return; const p = ref.current.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < count; i++) { let y = p.getY(i) - dt * 9; if (y < 0) y = 14; p.setY(i, y); } p.needsUpdate = true; });
  if (!on) return null;
  return (
    <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry><pointsMaterial color="#9fb3c8" size={0.05} transparent opacity={0.55} /></points>
  );
}

function CameraDrift({ mode }: { mode: StreetMode }) {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.08) * 0.9;
    camera.position.y = (mode === 'night' ? 2.2 : 2.6) + Math.sin(t * 0.13) * 0.15;
    camera.position.z = 14 - (t % 120) * 0.02;
    camera.lookAt(0, 3.2, -12);
  });
  return null;
}

function Street({ mode }: { mode: StreetMode }) {
  const night = mode === 'night';
  const facades = useMemo(() => {
    const r = rng(11); const out: any[] = []; let z = 6;
    for (let i = 0; i < 9; i++) { const w = 5 + r() * 4, h = 8 + r() * 7; out.push({ x: -7.5 - w * 0.1, z: z - w / 2, w: 5, h, d: w, side: 1 as const, seed: i * 7 + 1 }); z -= w + 0.4; }
    z = 6;
    for (let i = 0; i < 9; i++) { const w = 5 + r() * 4, h = 8 + r() * 7; out.push({ x: 7.5 + w * 0.1, z: z - w / 2, w: 5, h, d: w, side: -1 as const, seed: i * 5 + 2 }); z -= w + 0.4; }
    return out;
  }, []);
  return (
    <>
      <color attach="background" args={[night ? '#05060c' : '#f0b775']} />
      <fog attach="fog" args={[night ? '#0a0b14' : '#f3c58b', 8, night ? 42 : 55]} />
      <ambientLight intensity={night ? 0.28 : 0.9} color={night ? '#6677bb' : '#ffe0b0'} />
      <hemisphereLight args={[night ? '#2a3260' : '#ffd9a0', '#0a0806', night ? 0.6 : 0.8]} />
      {!night && <directionalLight position={[-20, 8, -30]} intensity={2.2} color="#ffb070" />}
      {!night && <mesh position={[-26, 9, -70]}><sphereGeometry args={[5.5, 24, 24]} /><meshBasicMaterial color="#ffd27a" /></mesh>}
      {night && <directionalLight position={[10, 30, -10]} intensity={0.55} color="#8fa8ff" />}

      {/* الأسفلت المبلّل */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -12]}>
        <planeGeometry args={[60, 80]} />
        <MeshReflectorMaterial mirror={0.6} blur={[300, 80]} resolution={512} mixBlur={1} mixStrength={night ? 12 : 4} roughness={0.9} depthScale={0.6} minDepthThreshold={0.4} maxDepthThreshold={1.2} color={night ? '#06070a' : '#3a2f28'} metalness={0.4} />
      </mesh>
      {/* رصيفان */}
      <mesh position={[-5.6, 0.12, -12]}><boxGeometry args={[3.2, 0.24, 80]} /><meshStandardMaterial color="#1c1a18" roughness={1} /></mesh>
      <mesh position={[5.6, 0.12, -12]}><boxGeometry args={[3.2, 0.24, 80]} /><meshStandardMaterial color="#1c1a18" roughness={1} /></mesh>

      {facades.map((f, i) => <Facade key={i} {...f} mode={mode} />)}
      {[2, -10, -22, -34].map((z, i) => <Lamp key={i} x={i % 2 ? -4.6 : 4.6} z={z} on={night} />)}
      {[-2, -14, -26].map((z, i) => <StringLights key={i} z={z} on={night} />)}
      <VintageCar x={-3.2} z={-6} rot={0.06} />
      <VintageCar x={3.6} z={-24} rot={-0.08} />

      {night && <Stars radius={120} depth={40} count={1800} factor={3} saturation={0} fade speed={0.4} />}
      {night && <mesh position={[14, 26, -60]}><sphereGeometry args={[3.2, 24, 24]} /><meshStandardMaterial color="#f2eedc" emissive="#e8e2c4" emissiveIntensity={1.4} /></mesh>}
      {!night && <Sparkles count={120} scale={[30, 8, 40]} position={[0, 3, -14]} size={3} speed={0.25} color="#ffe2a8" opacity={0.5} />}
      <Rain on={night} />
      <CameraDrift mode={mode} />
    </>
  );
}

export default function StreetScene({ mode }: { mode: StreetMode }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2.2, 14], fov: 58 }} gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ position: 'absolute', inset: 0 }}>
      <Street mode={mode} />
    </Canvas>
  );
}
