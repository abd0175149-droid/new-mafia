// ══════════════════════════════════════════════════════
// 🗡️ منصّة الأدوات — أداةٌ ثلاثيّة الأبعاد لكلّ دور/حدث (بدل الأيقونات)، مُصيَّرة مسبقاً إلى إطارات
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: أصول Poly Haven (CC0) لكلّ قدرة، وبدائل إجرائيّة إن غاب الملفّ.
// خطّة الإحماء: مُصيّرٌ WebGL واحد مشترك خارج الشاشة يرسم كلّ أداة 16 إطاراً (دورة كاملة) مرّةً في اللوبي،
// والبطاقات ترسم الإطارات على لوحاتٍ ثنائيّة الأبعاد — لا سياق WebGL لكلّ بطاقة (كانت 7 سياقات في الصباح).
// الأداة ترمز إلى الدور فقط؛ الهويّة تبقى في بطاقة الحدث.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type PropKind = 'MAFIA' | 'DOCTOR' | 'SHERIFF' | 'SNIPER' | 'SILENCER' | 'WITCH' | 'ASSASSIN' | 'PHOENIX' | 'POLICEWOMAN' | 'TWINS';
export const PROP_KINDS: PropKind[] = ['MAFIA', 'DOCTOR', 'SHERIFF', 'SNIPER', 'SILENCER', 'WITCH', 'ASSASSIN', 'PHOENIX', 'POLICEWOMAN', 'TWINS'];
const ASSET: Partial<Record<PropKind, { name: string; size: number; axis: 'x' | 'y' | 'z'; rot?: [number, number, number] }>> = {
  MAFIA: { name: 'ornate_medieval_dagger', size: 1.7, axis: 'y', rot: [0, 0, -.35] },
  DOCTOR: { name: 'medical_box', size: 1.5, axis: 'x', rot: [.2, .6, 0] },
  SHERIFF: { name: 'magnifying_glass_01', size: 1.6, axis: 'y', rot: [.4, .5, 0] },
  SNIPER: { name: 'bolt_action_rifle_7_62', size: 2.2, axis: 'x', rot: [0, 0, .25] },
  SILENCER: { name: 'medical_tape', size: 1.4, axis: 'x', rot: [.9, 0, 0] },
  TWINS: { name: 'ornate_mirror_01', size: 1.7, axis: 'y', rot: [0, .3, 0] },
};
/** الحدث/القدرة → الأداة */
export function propFor(type: string | null | undefined): PropKind {
  const t = (type || '').toUpperCase();
  if (/ASSASSINATE|ASSASSIN_/.test(t)) return 'ASSASSIN';
  if (/KILL|ASSASSINATION|MAFIA|GODFATHER/.test(t)) return 'MAFIA';
  if (/PROTECT|DOCTOR|NURSE|BLOCKED/.test(t)) return 'DOCTOR';
  if (/INVESTIGATE|SHERIFF/.test(t)) return 'SHERIFF';
  if (/SNIPE|SNIPER/.test(t)) return 'SNIPER';
  if (/SILENCE|SILENCED|SILENCER/.test(t)) return 'SILENCER';
  if (/DISABLE|WITCH|ABILITY/.test(t)) return 'WITCH';
  if (/PHOENIX/.test(t)) return 'PHOENIX';
  if (/POLICEWOMAN/.test(t)) return 'POLICEWOMAN';
  if (/TWIN/.test(t)) return 'TWINS';
  return 'MAFIA';
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();
function load(name: string) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`/3d/models/${name}/${name}.gltf`).then(g => g.scene).catch(() => null));
  return cache.get(name)!;
}

const gold = () => new THREE.MeshStandardMaterial({ color: 0xc5a059, metalness: .9, roughness: .25 });
const steel = () => new THREE.MeshStandardMaterial({ color: 0xd8d8dd, metalness: 1, roughness: .18 });
const black = () => new THREE.MeshStandardMaterial({ color: 0x111114, roughness: .5, metalness: .4 });
/** بدائل إجرائيّة (تُستعمل إن غاب الأصل) */
function procedural(kind: PropKind): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'PHOENIX') { for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(.12, .9 - i * .05), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff6a2a : 0xffb347, emissive: 0x8a2a00, side: THREE.DoubleSide })); f.position.set((i - 4) * .09, .2 - Math.abs(i - 4) * .05, 0); f.rotation.z = (i - 4) * .22; g.add(f); } return g; }
  if (kind === 'POLICEWOMAN') { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? .22 : .5, a = i / 10 * Math.PI * 2 - Math.PI / 2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } sh.closePath(); g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .06, bevelEnabled: true, bevelSize: .02, bevelThickness: .02 }), gold())); const c = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .09, 24), steel()); c.rotation.x = Math.PI / 2; g.add(c); return g; }
  if (kind === 'WITCH') { const glass = new THREE.MeshStandardMaterial({ color: 0x8fd3ff, transparent: true, opacity: .45, roughness: .05, metalness: .3 }); const body = new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 18), glass); g.add(body); const liq = new THREE.Mesh(new THREE.SphereGeometry(.36, 24, 18), new THREE.MeshStandardMaterial({ color: 0x8a5cff, transparent: true, opacity: .8, emissive: 0x3a1a80, emissiveIntensity: .8 })); liq.position.y = -.05; g.add(liq); const neck = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .5, 12), glass); neck.position.y = .55; g.add(neck); const cork = new THREE.Mesh(new THREE.CylinderGeometry(.1, .09, .18, 10), new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: .8 })); cork.position.y = .85; g.add(cork); const glow = new THREE.PointLight(0x8a5cff, 3, 3); g.add(glow); g.position.y = -.2; return g; }
  if (kind === 'ASSASSIN') { const bl = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.1, .015), steel()); bl.position.y = .5; g.add(bl); const h = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .45, 10), black()); h.position.y = -.25; g.add(h); const gd = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .04, 12), gold()); gd.position.y = -.02; g.add(gd); g.rotation.z = -.6; return g; }
  const bl = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.3, .02), steel()); bl.position.y = .55; g.add(bl); const gd = new THREE.Mesh(new THREE.BoxGeometry(.42, .06, .08), gold()); gd.position.y = -.12; g.add(gd); const h = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .5, 10), new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: .7 })); h.position.y = -.4; g.add(h); g.position.y = -.3; return g;
}
async function buildProp(kind: PropKind): Promise<THREE.Object3D> {
  const a = ASSET[kind]; if (!a) return procedural(kind);
  const src = await load(a.name); if (!src) return procedural(kind);
  const o = src.clone(true); const b = new THREE.Box3().setFromObject(o); const s = new THREE.Vector3(); b.getSize(s); o.scale.setScalar(a.size / (s[a.axis] || 1)); const c = new THREE.Vector3(); new THREE.Box3().setFromObject(o).getCenter(c); o.position.sub(c); const wrap = new THREE.Group(); wrap.add(o); if (a.rot) wrap.rotation.set(...a.rot); return wrap;
}

/* ───────── المُصيّر المشترك: إطارات الدوران لكلّ أداة ───────── */
export const FRAMES = 16, FRAME_PX = 176;
const frames = new Map<PropKind, HTMLCanvasElement[]>();
const pending = new Map<PropKind, Promise<HTMLCanvasElement[] | null>>();
let shared: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
function sharedRenderer() {
  if (shared) return shared;
  try {
    const canvas = document.createElement('canvas'); canvas.width = FRAME_PX; canvas.height = FRAME_PX;
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(FRAME_PX, FRAME_PX, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(32, 1, .1, 20); cam.position.set(0, .9, 3.2); cam.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffe6c0, 0x101014, 1.2)); const key = new THREE.SpotLight(0xffd9a0, 40, 12, .7, .5); key.position.set(2, 3, 2); scene.add(key); const rim = new THREE.PointLight(0x7fb0ff, 12, 8); rim.position.set(-2, 1, -2); scene.add(rim);
    shared = { r, scene, cam }; return shared;
  } catch { return null; }
}
/** يصيّر إطارات أداةٍ مرّةً واحدة (16 إطاراً × 176px) ويحتفظ بها في الذاكرة */
export function prerenderProp(kind: PropKind): Promise<HTMLCanvasElement[] | null> {
  if (frames.has(kind)) return Promise.resolve(frames.get(kind)!);
  if (pending.has(kind)) return pending.get(kind)!;
  const p = (async () => {
    const sh = sharedRenderer(); if (!sh) return null; const obj = await buildProp(kind); sh.scene.add(obj); const out: HTMLCanvasElement[] = [];
    for (let i = 0; i < FRAMES; i++) { obj.rotation.y = i / FRAMES * Math.PI * 2; obj.position.y = Math.sin(i / FRAMES * Math.PI * 2) * .05 + (obj.position.y || 0) * 0; sh.r.render(sh.scene, sh.cam); const c = document.createElement('canvas'); c.width = FRAME_PX; c.height = FRAME_PX; c.getContext('2d')!.drawImage(sh.r.domElement, 0, 0); out.push(c); await new Promise(r => setTimeout(r, 0)); }
    sh.scene.remove(obj); frames.set(kind, out); return out;
  })();
  pending.set(kind, p); return p;
}
export function framesOf(kind: PropKind) { return frames.get(kind) || null; }
/** الإحماء في اللوبي: كلّ الأدوات تُصيَّر قبل أوّل ليل */
export async function preloadProps() { for (const k of PROP_KINDS) { await prerenderProp(k); } }
