// ══════════════════════════════════════════════════════
// 🏙️ Via dei Segreti — محرّك زقاق «ليتل إيتالي 1931» لشاشة القاعة (ليل/فجر)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: النموذج المعتمد في الارتفاكت يُنقل كما هو إلى الكود.
// three خام (لا fiber): المشهد إجرائيّ بمعظمه، مع أصول Poly Haven (CC0) وSketchfab (CC-BY)
// تُحمَّل إن وُجدت تحت /3d/ وإلا بقيت النماذج المؤقّتة الإجرائيّة.
//
// • مفردٌ (singleton) يبقى حيّاً بين الليل والفجر كي يُعرض انتقال الفجر داخل المشهد نفسه؛
//   يُفصل عن الشاشة عند مغادرة الطبقة ويُتلَف بعد 90 ثانية من الغياب.
// • سلّم الجودة: عالٍ/متوسّط/منخفض — يُقاس بفحص إطاراتٍ أوّل 3 ثوانٍ، ويُثبَّت في localStorage،
//   ويُجبر بـ ?q=high|med|low.
// • لا اسمَ ولا رقمَ لاعبٍ هنا أبداً: الهويّة تعيش في بطاقة الحدث فوق المشهد (سياسة الكشف).
// ══════════════════════════════════════════════════════
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type StreetMode = 'night' | 'dawn';
export type StreetEvent = 'KILL' | 'SAVED' | 'SILENCE' | 'DISABLE' | 'SNIPE';
export type Quality = 'high' | 'med' | 'low';

const STREET_W = 12, SIDE_W = 3.2, FACE = STREET_W / 2 + SIDE_W;
const ASSET_ROOT = '/3d';
const DISPOSE_AFTER_MS = 90_000;

/* ───────────────── seeded rng & procedural textures (احتياط وقوامٌ خاصّ) ───────────────── */
let seed = 1337;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function valueNoise(w: number, h: number, cells: number, s: number) {
  const g: number[] = []; let sd = s; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  for (let i = 0; i < (cells + 1) * (cells + 1); i++) g.push(r());
  const out = new Float32Array(w * h); const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / w * cells, fy = y / h * cells; const x0 = Math.floor(fx), y0 = Math.floor(fy); const tx = sm(fx - x0), ty = sm(fy - y0);
    const i = (xx: number, yy: number) => g[((yy % cells) + cells) % cells * (cells + 1) + ((xx % cells) + cells) % cells];
    const a = i(x0, y0), b = i(x0 + 1, y0), c = i(x0, y0 + 1), d = i(x0 + 1, y0 + 1); out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}
function fbm(w: number, h: number, oct: number, s: number, base = 4) {
  const o = new Float32Array(w * h); let amp = 1, sum = 0, c = base;
  for (let k = 0; k < oct; k++) { const n = valueNoise(w, h, c, s + k * 77); for (let i = 0; i < o.length; i++) o[i] += n[i] * amp; sum += amp; amp *= .5; c *= 2; }
  for (let i = 0; i < o.length; i++) o[i] /= sum; return o;
}
const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function ctex(c: HTMLCanvasElement, rep: [number, number], srgb = false) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function normalFrom(hArr: Float32Array, w: number, h: number, strength: number) {
  const c = cv(w, h), x = c.getContext('2d')!, id = x.createImageData(w, h), d = id.data;
  for (let y = 0; y < h; y++) for (let x0 = 0; x0 < w; x0++) {
    const l = hArr[y * w + ((x0 - 1 + w) % w)], r = hArr[y * w + ((x0 + 1) % w)], u = hArr[((y - 1 + h) % h) * w + x0], dn = hArr[((y + 1) % h) * w + x0];
    const nx = (l - r) * strength, ny = (u - dn) * strength; const len = Math.hypot(nx, ny, 1); const i = (y * w + x0) * 4;
    d[i] = (nx / len * .5 + .5) * 255; d[i + 1] = (ny / len * .5 + .5) * 255; d[i + 2] = (1 / len * .5 + .5) * 255; d[i + 3] = 255;
  }
  x.putImageData(id, 0, 0); return c;
}
function paint(w: number, h: number, fn: (i: number) => [number, number, number]) {
  const c = cv(w, h), x = c.getContext('2d')!, id = x.createImageData(w, h), d = id.data;
  for (let i = 0; i < w * h; i++) { const [r, g, b] = fn(i); d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); return c;
}
type TexSet = { map: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture; roughness?: number; metalness?: number };
function texBrick(): TexSet {
  const w = 512, h = 512, bw = 64, bh = 24, m = 4; const hgt = new Float32Array(w * h); const n = fbm(w, h, 4, 11, 8), n2 = fbm(w, h, 3, 29, 32);
  const col = paint(w, h, i => { const x = i % w, y = (i / w) | 0; const row = (y / bh) | 0; const off = (row % 2) * bw / 2; const bx = (x + off) % bw, by = y % bh; const mortar = bx < m || by < m; const bid = row * 100 + (((x + off) / bw) | 0);
    let sd = bid * 7919 + 13; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }; const v = rr();
    if (mortar) { hgt[i] = 0.2 + n2[i] * .2; const g = 95 + n[i] * 40; return [g, g - 4, g - 10]; }
    hgt[i] = 0.75 + n2[i] * .25 - (bx < m + 3 || by < m + 3 ? .15 : 0);
    const base = [122 + v * 40, 58 + v * 22, 42 + v * 14]; const dirt = (n[i] - .5) * 60; return [base[0] + dirt, base[1] + dirt * .8, base[2] + dirt * .6]; });
  return { map: ctex(col, [2, 3], true), normalMap: ctex(normalFrom(hgt, w, h, 2.2), [2, 3]), roughness: .92 };
}
function texPlaster(tint: [number, number, number]): TexSet {
  const w = 512, h = 512; const n = fbm(w, h, 5, 101, 6), n2 = fbm(w, h, 4, 202, 24); const hgt = new Float32Array(w * h);
  const ck = new Uint8Array(w * h); for (let k = 0; k < 7; k++) { let x = rnd() * w, y = rnd() * h; for (let s = 0; s < 160; s++) { ck[(((y | 0) + h) % h) * w + (((x | 0) + w) % w)] = 1; x += (rnd() - .5) * 4; y += 1 + rnd() * 2; if (y >= h) y -= h; } }
  const col = paint(w, h, i => { const v = n[i], s = n2[i]; hgt[i] = v * .6 + s * .4 - (ck[i] ? .3 : 0); const d = (v - .5) * 38 + (s - .5) * 20; const c: [number, number, number] = [tint[0] + d, tint[1] + d, tint[2] + d * .8]; if (ck[i]) return [c[0] * .55, c[1] * .55, c[2] * .55]; if (s > .72) return [c[0] * .8, c[1] * .78, c[2] * .72]; return c; });
  return { map: ctex(col, [1.5, 1.5], true), normalMap: ctex(normalFrom(hgt, w, h, 1.6), [1.5, 1.5]), roughness: .9 };
}
function texAsphalt(): TexSet {
  const w = 512, h = 512; const n = fbm(w, h, 5, 303, 16), c2 = fbm(w, h, 3, 404, 48); const hgt = new Float32Array(w * h);
  const col = paint(w, h, i => { const v = n[i], g = c2[i]; hgt[i] = v * .5 + g * .5; const b = 22 + v * 22 + (g - .5) * 10; return [b, b, b + 2]; });
  const rough = paint(w, h, i => { const r = (120 + n[i] * 110) | 0; return [r, r, r]; });
  return { map: ctex(col, [8, 40], true), normalMap: ctex(normalFrom(hgt, w, h, 1.3), [8, 40]), roughnessMap: ctex(rough, [8, 40]) };
}
function puddleMask() {
  const w = 256, h = 1024; const n = fbm(w, h, 4, 505, 3); const c = cv(w, h), x = c.getContext('2d')!, id = x.createImageData(w, h), d = id.data;
  for (let i = 0; i < w * h; i++) { const v = n[i]; const a = Math.min(1, Math.max(0, (v - .6) * 10)); const s = a * a * (3 - 2 * a); const g = (1 - s) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g; d[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2); return t;
}
function texCobble(): TexSet {
  const w = 512, h = 512, s = 40; const hgt = new Float32Array(w * h); const n = fbm(w, h, 3, 606, 20);
  const col = paint(w, h, i => { const x = i % w, y = (i / w) | 0; const cx = (x / s) | 0, cy = (y / s) | 0; const off = (cy % 2) * s / 2; const lx = ((x + off) % s) / s - .5, ly = (y % s) / s - .5; const r = Math.hypot(lx * 1.1, ly * 1.3); const inside = r < .42; let sd = cx * 131 + cy * 17 + 5; sd = (sd * 16807) % 2147483647; const v = (sd - 1) / 2147483646;
    hgt[i] = inside ? (.6 + (1 - r / .42) * .4) + n[i] * .1 : n[i] * .15; const g = inside ? 70 + v * 35 + (n[i] - .5) * 30 : 38 + n[i] * 12; return [g, g - 3, g - 8]; });
  return { map: ctex(col, [2, 24], true), normalMap: ctex(normalFrom(hgt, w, h, 2.4), [2, 24]), roughness: .85 };
}
function texMetal(): TexSet {
  const w = 256, h = 256; const n = fbm(w, h, 4, 707, 10), s = fbm(w, h, 2, 808, 3); const hgt = new Float32Array(w * h);
  const col = paint(w, h, i => { const v = n[i]; hgt[i] = v; const rust = s[i] > .62; const g = rust ? 60 + v * 30 : 38 + v * 22; return rust ? [g + 25, g - 5, g - 20] : [g, g + 1, g + 3]; });
  return { map: ctex(col, [1, 4], true), normalMap: ctex(normalFrom(hgt, w, h, .8), [1, 4]), roughness: .55, metalness: .7 };
}
function texWood(): TexSet {
  const w = 256, h = 256; const n = fbm(w, h, 4, 909, 40); const hgt = new Float32Array(w * h);
  const col = paint(w, h, i => { const y = (i / w) | 0; const plank = (y / 32) | 0; const gap = y % 32 < 2; const v = n[i]; hgt[i] = gap ? 0 : .7 + v * .3; const g = gap ? 20 : 70 + v * 30 + ((plank * 37) % 11); return [g + 10, g - 2, g - 18]; });
  return { map: ctex(col, [1, 1], true), normalMap: ctex(normalFrom(hgt, w, h, 1.2), [1, 1]), roughness: .8 };
}
function texCurtain() {
  const c = cv(128, 192), x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#3a2c1c'); g.addColorStop(1, '#6d5230'); x.fillStyle = g; x.fillRect(0, 0, 128, 192);
  for (let i = 0; i < 128; i += 8) { x.fillStyle = 'rgba(0,0,0,' + (0.12 + 0.18 * Math.abs(Math.sin(i * .6))) + ')'; x.fillRect(i, 0, 4, 192); }
  x.fillStyle = 'rgba(255,230,180,.22)'; x.fillRect(48, 20, 32, 150); x.fillStyle = '#1a1410'; x.fillRect(0, 0, 128, 4); x.fillRect(60, 0, 8, 192); x.fillRect(0, 92, 128, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texStripes(a: string, b: string) { const c = cv(256, 64), x = c.getContext('2d')!; for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(i * 16, 0, 16, 64); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1); return t; }
function texSign(text: string) { const c = cv(512, 96), x = c.getContext('2d')!; x.fillStyle = '#17301f'; x.fillRect(0, 0, 512, 96); x.strokeStyle = '#c5a059'; x.lineWidth = 4; x.strokeRect(8, 8, 496, 80); x.font = 'bold 52px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#e2c07a'; x.fillText(text, 256, 50); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function texSoft() { const c = cv(64, 64), x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
function texNeon(text: string, color: string) {
  const c = cv(512, 128), x = c.getContext('2d')!; x.font = 'bold 74px "IBM Plex Mono", "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 26; x.lineWidth = 5; x.strokeStyle = color; x.strokeText(text, 256, 64); x.shadowBlur = 0; x.lineWidth = 2; x.strokeStyle = '#ffffff'; x.strokeText(text, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texSkyline() {
  const c = cv(1024, 256), x = c.getContext('2d')!; x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 256); let px = 0;
  while (px < 1024) { const w = 30 + rnd() * 60, h = 60 + rnd() * 170; x.fillStyle = '#08080c'; x.fillRect(px, 256 - h, w, h); for (let yy = 256 - h + 6; yy < 250; yy += 9) for (let xx = px + 4; xx < px + w - 4; xx += 7) { if (rnd() > .62) { x.fillStyle = rnd() > .5 ? 'rgba(255,190,110,.75)' : 'rgba(190,210,255,.45)'; x.fillRect(xx, yy, 3, 5); } } px += w + 2 + rnd() * 8; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ───────────────── asset loading (Poly Haven / Sketchfab) ───────────────── */
const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const rgbeLoader = new RGBELoader();
const cache = new Map<string, Promise<any>>();
function loadGLTF(url: string) { if (!cache.has(url)) cache.set(url, gltfLoader.loadAsync(url).catch(e => { console.warn('🏙️ 3D asset missing:', url, e?.message || e); return null; })); return cache.get(url)!; }
function loadTex(url: string, srgb: boolean, rep: [number, number]) {
  const k = url + rep.join('x'); if (!cache.has(k)) cache.set(k, texLoader.loadAsync(url).then(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }).catch(() => null)); return cache.get(k)!;
}
function loadHDR(url: string) { if (!cache.has(url)) cache.set(url, rgbeLoader.loadAsync(url).catch(() => null)); return cache.get(url)!; }
const PH = (n: string) => `${ASSET_ROOT}/models/${n}/${n}.gltf`;
const SF = (n: string) => `${ASSET_ROOT}/sketchfab/${n}/scene.gltf`;
const TEX = (n: string, k: 'diff' | 'nor' | 'rough') => `${ASSET_ROOT}/tex/${n}_${k}.webp`;
const SURFACES: Record<string, { name: string; rep: [number, number] }> = { brick: { name: 'red_brick_03', rep: [2, 3] }, plaster: { name: 'plastered_wall_04', rep: [1.5, 1.5] }, plaster2: { name: 'painted_plaster_wall', rep: [1.5, 1.5] }, asphalt: { name: 'asphalt_02', rep: [8, 40] }, cobble: { name: 'cobblestone_floor_08', rep: [2, 24] }, wood: { name: 'wood_planks_grey', rep: [1, 1] } };

/** الإحماء: يُستدعى من اللوبي كي تكون الأصول في الذاكرة قبل أوّل ليل */
export function preloadStreetAssets() {
  if (typeof window === 'undefined') return;
  ['street_lamp_01', 'street_lamp_02', 'fire_hydrant', 'modular_fire_escape', 'metal_trash_can', 'water_manhole_cover'].forEach(n => loadGLTF(PH(n)));
  ['pierce_arrow', 'gangster', 'fedoras'].forEach(n => loadGLTF(SF(n)));
  Object.values(SURFACES).forEach(s => { loadTex(TEX(s.name, 'diff'), true, s.rep); loadTex(TEX(s.name, 'nor'), false, s.rep); loadTex(TEX(s.name, 'rough'), false, s.rep); });
  loadHDR(`${ASSET_ROOT}/hdri/moonless_golf_1k.hdr`); loadHDR(`${ASSET_ROOT}/hdri/klippad_sunrise_2_1k.hdr`);
}

/* ───────────────── quality ───────────────── */
function detectQuality(): Quality {
  try {
    const q = new URLSearchParams(location.search).get('q'); if (q === 'high' || q === 'med' || q === 'low') return q;
    const s = localStorage.getItem('display3dQuality'); if (s === 'high' || s === 'med' || s === 'low') return s;
  } catch { /* noop */ }
  return 'high';
}

/* ───────────────── the engine ───────────────── */
type Lamp = { g: THREE.Group; bulbMat: THREE.MeshBasicMaterial; pl: THREE.PointLight; sl: THREE.SpotLight | null; cone: THREE.Mesh; base: number; flick: number; on: number };
type Neon = { mesh: THREE.Mesh; light: THREE.PointLight; base: THREE.Color; broken: boolean; on: boolean };
type PS = { g: THREE.Group; items: { s: THREE.Sprite; life: number; vx?: number; vz?: number }[] };
type Shot = { len: number; fov: number; at: (t: number) => [THREE.Vector3, THREE.Vector3] };

class StreetEngine {
  renderer!: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(50, 16 / 9, .1, 400);
  container: HTMLElement | null = null; ro: ResizeObserver | null = null; raf = 0; disposeTimer: any = null; disposed = false; ok = true;
  composer!: EffectComposer; bloom!: UnrealBloomPass; bokeh!: BokehPass; film!: FilmPass; vig!: ShaderPass; smaa!: SMAAPass; quality: Quality = 'high'; probe = { frames: 0, t: 0, done: false };
  clock = new THREE.Clock(); mode: StreetMode = 'night'; dawnT = -1; dawnStart = 0;
  lamps: Lamp[] = []; neons: Neon[] = []; laundry: { m: THREE.Mesh; ph: number }[] = []; pigeons: { s: THREE.Sprite; t: number; ox: number; oz: number }[] = [];
  rain: THREE.LineSegments | null = null; steam!: PS; smokes: { e: THREE.Vector3; ps: PS }[] = []; purple!: PS; exhaust!: PS;
  fig = new THREE.Group(); car = new THREE.Group(); hat = new THREE.Group(); kiosk = new THREE.Group(); shutter!: THREE.Mesh; ember!: THREE.Mesh; emberLight!: THREE.PointLight;
  mixer: THREE.AnimationMixer | null = null; clips: THREE.AnimationClip[] = []; figAction: THREE.AnimationAction | null = null;
  reflector!: Reflector; skyMat!: THREE.ShaderMaterial; stars!: THREE.Points; moon!: THREE.Sprite; sun!: THREE.Mesh; shafts = new THREE.Group(); skyline!: THREE.Mesh; hemi!: THREE.HemisphereLight; sunLight!: THREE.DirectionalLight; snipeL: THREE.PointLight | null = null;
  envNight: THREE.Texture | null = null; envDawn: THREE.Texture | null = null; pmrem!: THREE.PMREMGenerator;
  windows!: THREE.InstancedMesh; soft = texSoft(); curtain = texCurtain();
  shots!: Record<string, Shot>; cur = 'A'; shotT = 0; order = ['A', 'B', 'C']; oi = 0; evShot: string | null = null; _p = new THREE.Vector3(-.8, 1.7, 11); _l = new THREE.Vector3(.4, 2, -30); sway = new THREE.Vector3(); onCut: ((dip: boolean) => void) | null = null;
  ev = { silence: 0, disable: 0, snipe: 0, kill: 0, saved: 0 };
  NIGHT = { top: new THREE.Color(0x02030a), hor: new THREE.Color(0x1a1420), fog: new THREE.Color(0x0a0b12), fd: .03, hemi: .22, hemiC: new THREE.Color(0x223046), exp: .95 };
  DAWN = { top: new THREE.Color(0x4f6690), hor: new THREE.Color(0xe9a878), fog: new THREE.Color(0xb99e86), fd: .012, hemi: .85, hemiC: new THREE.Color(0xffd9b0), exp: 1.0 };
  MAT!: Record<string, THREE.MeshStandardMaterial>;

  constructor() {
    try { this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); } catch { this.ok = false; return; }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .95;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.quality = detectQuality();
    this.build(); this.buildPost(); this.applyQuality();
    this.applyDawn(0); this.loadAssets();
  }

  /* ── materials ── */
  private std(t: TexSet, extra?: THREE.MeshStandardMaterialParameters) {
    const o: THREE.MeshStandardMaterialParameters = { map: t.map, normalMap: t.normalMap, roughness: t.roughness ?? 1, metalness: t.metalness ?? 0 }; if (t.roughnessMap) o.roughnessMap = t.roughnessMap;
    return new THREE.MeshStandardMaterial(Object.assign(o, extra || {}));
  }
  private async swapSurface(key: string, mat: THREE.MeshStandardMaterial) {
    const s = SURFACES[key]; if (!s) return;
    const [d, n, r] = await Promise.all([loadTex(TEX(s.name, 'diff'), true, s.rep), loadTex(TEX(s.name, 'nor'), false, s.rep), loadTex(TEX(s.name, 'rough'), false, s.rep)]);
    if (!d || this.disposed) return;
    mat.map = d; if (n) mat.normalMap = n; if (r) { mat.roughnessMap = r; mat.roughness = 1; } mat.needsUpdate = true;
  }

  /* ── scene ── */
  private build() {
    const S = this.scene;
    const M = { brick: texBrick(), plaster: texPlaster([168, 150, 120]), plaster2: texPlaster([120, 128, 118]), asphalt: texAsphalt(), cobble: texCobble(), metal: texMetal(), wood: texWood() };
    const MAT: Record<string, THREE.MeshStandardMaterial> = {
      brick: this.std(M.brick), plaster: this.std(M.plaster), plaster2: this.std(M.plaster2), metal: this.std(M.metal, { color: 0x9a9aa0 }), wood: this.std(M.wood), dark: new THREE.MeshStandardMaterial({ color: 0x14131a, roughness: .7 }),
      paint: new THREE.MeshStandardMaterial({ color: 0x090a0e, roughness: .22, metalness: .6 }), chrome: new THREE.MeshStandardMaterial({ color: 0xd9d9dd, roughness: .18, metalness: 1 }), rubber: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: .95 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 1, side: THREE.DoubleSide }), awningA: new THREE.MeshStandardMaterial({ map: texStripes('#4d2a20', '#a89a80'), roughness: .9, side: THREE.DoubleSide }), awningB: new THREE.MeshStandardMaterial({ map: texStripes('#1e3a2b', '#a89a80'), roughness: .9, side: THREE.DoubleSide }),
      glass: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: .05, metalness: .9, transparent: true, opacity: .55 }), cobble: this.std(M.cobble),
    };
    this.MAT = MAT;
    const geos: Record<string, THREE.BufferGeometry[]> = { brick: [], plaster: [], plaster2: [], metal: [], wood: [], dark: [] };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: string, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); const m = new THREE.Matrix4(); if (ry) m.makeRotationY(ry); m.setPosition(x, y, z); g.applyMatrix4(m); geos[mat].push(g); };
    const windows: { x: number; y: number; z: number; ry: number; lit: boolean; warm: boolean }[] = []; const balconies: { x: number; y: number; z: number; w: number; ry: number }[] = []; const neonSigns: { text: string; x: number; y: number; z: number; ry: number; side: number }[] = []; const tanks: THREE.Vector3[] = []; const chimneys: THREE.Vector3[] = [];
    const groundTypes = ['TRATTORIA', 'BARBIERE', 'CAFFÈ', 'HOTEL', 'FARMACIA', 'SARTORIA', 'PANE', 'TABACCHI'];
    const pipes: { x: number; z: number; h: number }[] = []; const signs: { text: string; x: number; y: number; z: number; ry: number; w: number }[] = [];
    // 🏛️ واجهة بطبقات حقيقيّة: جسم المبنى خلف الواجهة بـ0.3م، والدعامات بين النوافذ وشرائط الطوابق بارزة إلى خطّ الواجهة —
    //    فالنوافذ غائرة فعلاً بعتباتٍ وأعتاب، والكورنيش مدرّج، والمتجر بأعمدةٍ ولوحةٍ مرسومة (قرار المالك 2026-09-12: لا بدائيّة)
    const building = (side: 1 | -1, z0: number, w: number, floors: number, seedv: number) => {
      seed = seedv; const fh = 3.4, h = floors * fh + .6; const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2; const wall = rnd() > .5 ? 'brick' : (rnd() > .5 ? 'plaster' : 'plaster2'); const trim = wall === 'brick' ? 'plaster' : 'brick';
      const fx = side * FACE, zc = z0 - w / 2; const nm = groundTypes[seedv % groundTypes.length]; const dark = rnd() > .6;
      box(11.7, h, w, side * (FACE + 6.15), h / 2, zc, wall);                                   // الجسم (وجهه عند FACE+0.3)
      // ── الطابق الأرضيّ: واجهة متجر غائرة بين عمودين ──
      box(.3, 3.4, w * .9, fx + side * .15, 1.7, zc, 'dark');                                    // تجويف المتجر
      [z0 - .3, z0 - w + .3].forEach(pz => box(.34, 3.5, .6, fx - side * .02, 1.75, pz, trim));     // عمودان
      box(.34, .16, w + .1, fx - side * .02, 3.5, zc, trim);                                      // إفريز فوق المتجر
      box(.3, .9, w, fx + side * .15, 3.85, zc, wall);                                            // شريط بين الأرضيّ والطابق الأوّل
      signs.push({ text: nm, x: fx - side * .04, y: 3.05, z: zc, ry: ry + Math.PI, w: w * .62 }); box(.16, .62, w * .66, fx + side * .04, 3.05, zc, 'wood'); // لوحة مرسومة
      box(.14, 2.3, 1.05, fx + side * .12, 1.15, zc + w * .3, 'wood'); box(.03, .8, .7, fx + side * .04, 1.65, zc + w * .3, 'dark'); box(.03, .8, .7, fx + side * .04, .7, zc + w * .3, 'dark'); // باب بلوحين
      box(.5, .12, 1.5, fx - side * .22, .06, zc + w * .3, trim);                                  // عتبة الباب
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(w * .42, 2.1), MAT.glass); gl.position.set(fx + side * .08, 1.45, zc - w * .1); gl.rotation.y = ry + Math.PI; S.add(gl);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(w * .4, 1.9), new THREE.MeshBasicMaterial({ color: dark ? 0x1a1408 : 0xffcf8a, transparent: true, opacity: dark ? .4 : .55, toneMapped: false })); inner.position.set(fx + side * .24, 1.45, zc - w * .1); inner.rotation.y = ry + Math.PI; S.add(inner);
      // مظلّة مخطّطة بذيل (valance)
      const awM = rnd() > .5 ? MAT.awningA : MAT.awningB; const aw = new THREE.Mesh(new THREE.PlaneGeometry(w * .5, 1.5), awM); aw.position.set(fx - side * .7, 2.75, zc - w * .1); aw.rotation.set(0, ry + Math.PI, 0); aw.rotateX(-.45); aw.castShadow = true; S.add(aw);
      const val = new THREE.Mesh(new THREE.PlaneGeometry(w * .5, .22), awM); val.position.set(fx - side * 1.38, 2.32, zc - w * .1); val.rotation.y = ry + Math.PI; S.add(val);
      if (!dark && rnd() > .35) neonSigns.push({ text: nm, x: fx - side * .35, y: 4.6 + rnd() * 1.2, z: zc + w * .15, ry: ry + Math.PI, side });
      // ── الطوابق العليا: شرائط ودعامات بارزة، نوافذ غائرة ──
      const nWin = Math.max(2, Math.floor(w / 3)); const spacing = w / nWin; const pierW = Math.max(.3, spacing - 1.7);
      for (let f = 1; f < floors; f++) { const y = f * fh + 1.9; const bal = rnd() > .62; const top = f * fh + 2.9; const next = f === floors - 1 ? h : (f + 1) * fh + .9;
        box(.3, next - top, w, fx + side * .15, (top + next) / 2, zc, wall);                       // شريط الطابق (spandrel)
        for (let k = 0; k <= nWin; k++) { const bz = z0 - spacing * k; const pw = (k === 0 || k === nWin) ? pierW / 2 : pierW; const pz = k === 0 ? bz - pw / 2 : k === nWin ? bz + pw / 2 : bz; box(.3, 2.0, pw, fx + side * .15, y, pz, wall); } // دعامات
        for (let k = 0; k < nWin; k++) { const z = z0 - spacing * (k + .5); const lit = rnd() > .45; windows.push({ x: fx + side * .24, y, z, ry: ry + Math.PI, lit, warm: rnd() > .35 });
          box(.12, 2.0, .12, fx + side * .2, y, z - .78, 'wood'); box(.12, 2.0, .12, fx + side * .2, y, z + .78, 'wood'); box(.12, .12, 1.68, fx + side * .2, y + .96, z, 'wood'); box(.12, .06, 1.68, fx + side * .2, y - .02, z, 'wood');
          box(.36, .14, 1.94, fx - side * .03, y - 1.05, z, trim);                                   // عتبة
          box(.3, .18, 1.94, fx - side * .0, y + 1.1, z, trim);                                     // عَتَب (lintel)
          if (rnd() > .5) { const open = rnd() > .5; box(.06, 1.85, .6, fx - side * .06, y, z - (open ? 1.12 : 0.95), 'wood', open ? side * 1.0 : 0); } }
        if (bal) balconies.push({ x: fx + side * .5, y: y - 1.15, z: z0 - w / 2, w: w * .6, ry });
      }
      // ── كورنيش مدرّج وسطح ──
      box(.45, .22, w + .3, fx - side * .05, h - .55, zc, trim); box(.65, .2, w + .5, fx - side * .15, h - .33, zc, trim); box(.85, .16, w + .7, fx - side * .25, h - .14, zc, 'dark');
      pipes.push({ x: fx - side * .12, z: z0 - .12, h });
      if (rnd() > .55) tanks.push(new THREE.Vector3(side * (FACE + 6) + (rnd() - .5) * 4, h + 1.6, zc + (rnd() - .5) * w * .4));
      if (rnd() > .4) chimneys.push(new THREE.Vector3(side * (FACE + 4) + (rnd() - .5) * 3, h + .8, zc + (rnd() - .5) * w * .5));
    };
    let zL = 6, zR = 6, i = 0; while (zL > -72) { const w = 8 + rnd() * 7, f = 3 + Math.floor(rnd() * 4); building(-1, zL, w, f, 1000 + i * 31); zL -= w + .2; i++; } i = 0; while (zR > -72) { const w = 8 + rnd() * 7, f = 3 + Math.floor(rnd() * 4); building(1, zR, w, f, 5000 + i * 17); zR -= w + .2; i++; }
    for (const k in geos) { if (!geos[k].length) continue; const g = mergeGeometries(geos[k].map(x => x.toNonIndexed()), false)!; const m = new THREE.Mesh(g, MAT[k]); m.castShadow = true; m.receiveShadow = true; S.add(m); }
    // مزاريب هابطة عند فواصل المباني
    { const g = new THREE.CylinderGeometry(.07, .07, 1, 8); pipes.forEach(pp => { const m = new THREE.Mesh(g, MAT.metal); m.scale.y = pp.h - .4; m.position.set(pp.x, (pp.h - .4) / 2, pp.z); S.add(m); }); }
    // لوحات المتاجر المرسومة (ذهبيّ على أخضر داكن، مضاءة لا متوهّجة)
    signs.forEach(sg => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, .5), new THREE.MeshStandardMaterial({ map: texSign(sg.text), roughness: .8 })); m.position.set(sg.x, sg.y, sg.z); m.rotation.y = sg.ry; S.add(m); });
    // windows
    { const g = new THREE.PlaneGeometry(1.4, 1.85); const mat = new THREE.MeshBasicMaterial({ map: this.curtain, toneMapped: false }); const im = new THREE.InstancedMesh(g, mat, windows.length); const d = new THREE.Object3D(); const c = new THREE.Color();
      windows.forEach((w, i) => { d.position.set(w.x, w.y, w.z); d.rotation.set(0, w.ry, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); if (w.lit) c.setRGB(w.warm ? 2.6 : 1.2, w.warm ? 1.7 : 1.5, w.warm ? .8 : 2.2, THREE.LinearSRGBColorSpace); else c.setRGB(.08, .09, .13, THREE.LinearSRGBColorSpace); im.setColorAt(i, c); });
      im.instanceMatrix.needsUpdate = true; S.add(im); this.windows = im; }
    balconies.forEach(b => { const grp = new THREE.Group(); grp.position.set(b.x, b.y, b.z); grp.rotation.y = b.ry; const floor = new THREE.Mesh(new THREE.BoxGeometry(b.w, .12, 1.0), MAT.dark); floor.castShadow = true; grp.add(floor);
      for (let k = 0; k <= Math.floor(b.w / .35); k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.0, .04), MAT.metal); p.position.set(-b.w / 2 + k * .35, .5, .45); grp.add(p); } const rail = new THREE.Mesh(new THREE.BoxGeometry(b.w, .05, .05), MAT.metal); rail.position.set(0, 1.0, .45); grp.add(rail);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(.14, .1, .22, 10), MAT.awningA); pot.position.set(b.w * .3, .17, .2); grp.add(pot); S.add(grp); });
    tanks.forEach(t => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 14), MAT.wood); m.position.copy(t); S.add(m); const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, .6, 14), MAT.dark); cone.position.set(t.x, t.y + 1.4, t.z); S.add(cone); for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.4, .1), MAT.metal); l.position.set(t.x + Math.cos(k * 1.57) * .8, t.y - 1.6, t.z + Math.sin(k * 1.57) * .8); S.add(l); } });
    const smokeEmitters: THREE.Vector3[] = []; chimneys.forEach(c => { const m = new THREE.Mesh(new THREE.BoxGeometry(.7, 1.4, .7), MAT.brick); m.position.copy(c); S.add(m); smokeEmitters.push(new THREE.Vector3(c.x, c.y + .8, c.z)); });
    const neonColors = ['#ff3fa4', '#4ad2ff', '#ffb347', '#7dff9a']; neonSigns.forEach((n, i) => { const col = neonColors[i % neonColors.length]; const mat = new THREE.MeshBasicMaterial({ map: texNeon(n.text, col), transparent: true, toneMapped: false, color: new THREE.Color(col).multiplyScalar(2.2), side: THREE.DoubleSide, depthWrite: false }); const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), mat); m.position.set(n.x, n.y, n.z); m.rotation.y = n.ry; S.add(m);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1.0), MAT.metal); bracket.position.set(n.x - n.side * .2, n.y + .5, n.z); S.add(bracket); const light = new THREE.PointLight(col, 4, 7, 2); light.position.set(n.x - n.side * .6, n.y, n.z); S.add(light);
      this.neons.push({ mesh: m, light, base: mat.color.clone(), broken: i === 1, on: true }); });
    for (let k = 0; k < 4; k++) { const z = -8 - k * 16 + (rnd() - .5) * 4, y = 9 + rnd() * 4; const pts: THREE.Vector3[] = []; for (let s = 0; s <= 12; s++) { const t = s / 12; pts.push(new THREE.Vector3(-FACE + t * 2 * FACE, y - Math.sin(t * Math.PI) * .9, z)); }
      S.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x777777 })));
      for (let c = 0; c < 5; c++) { const t = .2 + c * .15 + rnd() * .05; const p = pts[Math.round(t * 12)]; const cl = new THREE.Mesh(new THREE.PlaneGeometry(.7 + rnd() * .5, .9 + rnd() * .6), rnd() > .5 ? MAT.cloth : MAT.awningB); cl.position.set(p.x, p.y - .5, p.z); cl.castShadow = false; S.add(cl); this.laundry.push({ m: cl, ph: rnd() * 6 }); } }
    // أعمدة كهرباء خشبيّة وأسلاكها (نيويورك الثلاثينيّات) + سلك الترام العلويّ
    { const poleZ = [-9, -31, -53]; const tops: THREE.Vector3[] = [];
      poleZ.forEach(z => { const g = new THREE.Group(); g.position.set(-7.1, 0, z); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.11, .15, 7.6, 10), MAT.wood); pole.position.y = 3.8; pole.castShadow = true; g.add(pole);
        [6.6, 7.2].forEach(y => { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, .1, .1), MAT.wood); arm.position.y = y; g.add(arm); [-.6, -.2, .2, .6].forEach(x => { const ins = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .12, 6), new THREE.MeshStandardMaterial({ color: 0x3d7a5c, roughness: .4 })); ins.position.set(x, y + .1, 0); g.add(ins); tops.push(new THREE.Vector3(-7.1 + x, y + .12, z)); }); });
        S.add(g); });
      const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a }); const wires: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) { for (let k = 0; k + 8 < tops.length; k += 8) { const a = tops[k + i], b = tops[k + 8 + i]; for (let t = 0; t < 8; t++) { const t0 = t / 8, t1 = (t + 1) / 8; const sag = (u: number) => -Math.sin(u * Math.PI) * .45; wires.push(new THREE.Vector3().lerpVectors(a, b, t0).add(new THREE.Vector3(0, sag(t0), 0)), new THREE.Vector3().lerpVectors(a, b, t1).add(new THREE.Vector3(0, sag(t1), 0))); } } }
      // سلك الترام: خطّان فوق السكّتين وأسلاك عرضيّة تحملهما بين الواجهتين
      [-1.3, 1.3].forEach(x => wires.push(new THREE.Vector3(x, 6.1, 8), new THREE.Vector3(x, 6.1, -74)));
      for (let z = -4; z > -72; z -= 12) { wires.push(new THREE.Vector3(-FACE, 6.6, z), new THREE.Vector3(FACE, 6.6, z)); [-1.3, 1.3].forEach(x => wires.push(new THREE.Vector3(x, 6.6, z), new THREE.Vector3(x, 6.1, z))); }
      S.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), wireMat)); }
    // ground
    this.reflector = new Reflector(new THREE.PlaneGeometry(STREET_W + .2, 160), { clipBias: .003, textureWidth: 1024, textureHeight: 1024, color: 0x5a5a5e }); this.reflector.rotation.x = -Math.PI / 2; this.reflector.position.set(0, -.01, -40); S.add(this.reflector);
    const asphaltMat = this.std(M.asphalt, { transparent: true, alphaMap: puddleMask(), roughness: .35, metalness: .05, color: 0xbbbbbb }); MAT.asphalt = asphaltMat; const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W + .2, 160), asphaltMat); asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(0, .005, -40); asphalt.receiveShadow = true; S.add(asphalt);
    ([-1, 1] as const).forEach(s => { const sw = new THREE.Mesh(new THREE.BoxGeometry(SIDE_W, .16, 160), MAT.cobble); sw.position.set(s * (STREET_W / 2 + SIDE_W / 2), .08, -40); sw.receiveShadow = true; S.add(sw); const curb = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, 160), MAT.plaster); curb.position.set(s * (STREET_W / 2 + .09), .09, -40); S.add(curb); });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6a6a70, roughness: .45, metalness: .8 }); [-1.3, 1.3].forEach(x => { const r = new THREE.Mesh(new THREE.BoxGeometry(.09, .03, 160), railMat); r.position.set(x, .02, -40); S.add(r); });
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.2, .03, .8), MAT.metal); grate.position.set(2.2, .03, -14); grate.name = 'grate'; S.add(grate);
    // lamps (procedural; swapped for street_lamp_01 when loaded)
    const coneMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(0xffb347) }, uI: { value: .55 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f=abs(dot(vN,vV)); float a=pow(vUv.y,2.2)*pow(f,1.4)*uI; gl_FragColor=vec4(uColor*a,a); }' });
    const LAMPS: [number, number][] = [[-6.55, -2], [6.55, -12], [-6.55, -24], [6.55, -36], [-6.55, -48], [6.55, -60]]; /* على حافّة الرصيف بعيداً عن سلالم الهروب والمظلّات */
    LAMPS.forEach(([x, z], i) => { const g = new THREE.Group(); g.position.set(x, 0, z); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 5.2, 10), MAT.metal); pole.position.y = 2.6; pole.castShadow = true; pole.name = 'proc'; g.add(pole); const base = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .5, 10), MAT.metal); base.position.y = .25; base.name = 'proc'; g.add(base);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 1.0), MAT.metal); arm.position.set(-Math.sign(x) * .5, 5.1, 0); arm.rotation.y = Math.PI / 2; arm.name = 'proc'; g.add(arm); const head = new THREE.Mesh(new THREE.CylinderGeometry(.28, .18, .35, 10), MAT.dark); head.position.set(-Math.sign(x) * 1.0, 5.05, 0); head.name = 'proc'; g.add(head);
      const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc478).multiplyScalar(3), toneMapped: false }); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), bulbMat); bulb.position.set(-Math.sign(x) * 1.0, 4.85, 0); bulb.name = 'bulb'; g.add(bulb);
      const pl = new THREE.PointLight(0xffb060, 30, 22, 1.8); pl.position.copy(bulb.position); g.add(pl);
      let sl: THREE.SpotLight | null = null; if (i < 2) { sl = new THREE.SpotLight(0xffb060, 60, 26, .9, .6, 1.5); sl.position.copy(bulb.position); sl.target.position.set(bulb.position.x, 0, 0); sl.castShadow = true; sl.shadow.mapSize.set(1024, 1024); sl.shadow.bias = -.0008; g.add(sl); g.add(sl.target); }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.9, 24, 1, true), coneMat.clone()); cone.position.set(bulb.position.x, 2.4, 0); g.add(cone);
      S.add(g); this.lamps.push({ g, bulbMat, pl, sl, cone, base: 1, flick: rnd() * 10, on: 1 }); });
    // bridge + skyline
    { const arch = new THREE.Mesh(new THREE.TorusGeometry(7.5, .55, 10, 40, Math.PI), MAT.metal); arch.position.set(0, 2, -76); S.add(arch); [-7.5, 7.5].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), MAT.brick); p.position.set(x, 4.5, -76); S.add(p); }); const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 3), MAT.dark); deck.position.set(0, 10, -76); S.add(deck);
      for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false })); b.position.set(-7 + k * 2.33, 9.3, -75.5); S.add(b); }
      this.skyline = new THREE.Mesh(new THREE.PlaneGeometry(120, 30), new THREE.MeshBasicMaterial({ map: texSkyline(), transparent: true, toneMapped: false, color: 0x9a9aa0 })); this.skyline.position.set(0, 12, -125); S.add(this.skyline); }
    // sky
    this.skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: this.NIGHT.top.clone() }, hor: { value: this.NIGHT.hor.clone() }, sunDir: { value: new THREE.Vector3(0, -1, 0) }, sunI: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform float sunI; varying vec3 vP; void main(){ float h=clamp(vP.y,0.,1.); vec3 c=mix(hor,top,pow(h,.55)); float s=max(dot(vP,normalize(sunDir)),0.); c+=vec3(1.,.72,.45)*pow(s,18.)*sunI*1.6+vec3(1.,.6,.3)*pow(s,4.)*sunI*.35; gl_FragColor=vec4(c,1.); }' });
    S.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat));
    { const n = 900, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * .9); pos[i * 3] = Math.sin(ph) * Math.cos(th) * 280; pos[i * 3 + 1] = Math.cos(ph) * 280 + 10; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 280; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: .75, fog: false })); S.add(this.stars); }
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: 0xdde4ff, fog: false, transparent: true, opacity: .9 })); this.moon.scale.set(14, 14, 1); this.moon.position.set(40, 70, -200); S.add(this.moon);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc48a).multiplyScalar(4), toneMapped: false, fog: false })); this.sun.position.set(95, -16, -34); this.sun.visible = false; S.add(this.sun); /* الشمس جانبيّة لا في وجه الكاميرا (قرار المالك 2026-09-12) */
    for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + k * .4, 90), new THREE.MeshBasicMaterial({ map: this.soft, color: 0xffcc88, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); m.position.set(9 + k * 1.6, 0, -34 - k * 2); m.rotation.z = -.55 + (k - 3) * .04; this.shafts.add(m); } S.add(this.shafts);
    S.fog = new THREE.FogExp2(0x0a0b12, .03);
    this.hemi = new THREE.HemisphereLight(0x223046, 0x101010, .22); S.add(this.hemi); this.sunLight = new THREE.DirectionalLight(0xffb27a, 0); this.sunLight.position.set(60, 22, -30); S.add(this.sunLight);
    // procedural env (until HDRIs load)
    const cube = (stops: [number, string][], blobs: boolean) => { const faces: HTMLCanvasElement[] = []; for (let f = 0; f < 6; f++) { const c = cv(64, 64), x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 0, 64); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 64, 64); if (blobs) for (let k = 0; k < 5; k++) { x.fillStyle = 'rgba(255,180,90,.5)'; x.beginPath(); x.arc(rnd() * 64, 20 + rnd() * 30, 3 + rnd() * 4, 0, 7); x.fill(); } faces.push(c); } const ct = new THREE.CubeTexture(faces); ct.needsUpdate = true; ct.colorSpace = THREE.SRGBColorSpace; return this.pmrem.fromCubemap(ct).texture; };
    this.envNight = cube([[0, '#0b0d16'], [.6, '#1a1712'], [1, '#3a2a14']], true); this.envDawn = cube([[0, '#5b6f9a'], [.55, '#f2a86b'], [1, '#4a3a2a']], false); S.environment = this.envNight;
    // placeholders
    this.buildCar(); this.buildFigure(); this.buildHat(); this.buildKiosk();
    for (let k = 0; k < 7; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: 0xd8d8e0, transparent: true, opacity: 0 })); s.scale.set(.35, .22, 1); S.add(s); this.pigeons.push({ s, t: -1, ox: FACE - 1.5 + (rnd() - .5) * 2, oz: -11 + (rnd() - .5) * 3 }); }
    const STEAM_O = new THREE.Vector3(2.2, .1, -14), EXH_O = new THREE.Vector3(this.car.position.x - .2, .4, this.car.position.z + 2.4);
    this.steam = this.particles(14, 0x8a8580, .7, STEAM_O, 1.4); this.smokes = smokeEmitters.map(e => ({ e, ps: this.particles(6, 0x55555c, 1.2, e, .8) })); this.purple = this.particles(22, 0x8a5cff, 1.1, STEAM_O, 2.2); this.exhaust = this.particles(6, 0x777780, .4, EXH_O, .4);
    // shots
    const FIG = () => this.fig.position;
    this.shots = {
      A: { len: 18, fov: 50, at: t => [new THREE.Vector3(-.8, 1.7, 11 - t * 4.5), new THREE.Vector3(.4, 2.0, -30)] },
      B: { len: 18, fov: 46, at: t => { const e = 1 - Math.pow(1 - t, 3); return [new THREE.Vector3(2.5, 12 - e * 9.5, 3 - e * 2), new THREE.Vector3(-2.5, 1.2, -12)]; } },
      C: { len: 18, fov: 22, at: t => [new THREE.Vector3(1.2, 1.9, -52 + t * 2), new THREE.Vector3(FIG().x + .3, 1.4, FIG().z)] },
      KILL: { len: 7, fov: 36, at: t => [new THREE.Vector3(-FACE + 7.5, 1.5 + (1 - t) * .5, -6.5), new THREE.Vector3(-FACE + 1.2, 4.8 - Math.min(1, t * 1.6) * 4.4, -1.6)] },
      SAVED: { len: 6, fov: 42, at: () => [new THREE.Vector3(-FACE + 6, 1.6, -1), new THREE.Vector3(FIG().x, 1.5, FIG().z)] },
      SILENCE: { len: 5, fov: 40, at: () => { const n = this.neons[0]; const p = n ? n.mesh.position : new THREE.Vector3(FACE, 5, -8); return [new THREE.Vector3(p.x - Math.sign(p.x) * 7, 3.2, p.z + 3), p.clone()]; } },
      DISABLE: { len: 6, fov: 40, at: () => [new THREE.Vector3(-2.5, 2.4, -8.5), new THREE.Vector3(2.2, .6, -14)] },
      SNIPE: { len: 6, fov: 42, at: () => [new THREE.Vector3(-3, 1.6, -2), new THREE.Vector3(FACE - .6, 8.5, -11)] },
      DAWN: { len: 9, fov: 34, at: t => [new THREE.Vector3(.5, 1.8, -2 - t * 3), new THREE.Vector3(0, 6, -90)] },
    };
  }
  private particles(n: number, color: number, size: number, origin: THREE.Vector3, spread: number): PS {
    const g = new THREE.Group(); const items: PS['items'] = [];
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color, transparent: true, opacity: 0, depthWrite: false })); s.scale.set(size, size, 1); const life = rnd(); s.position.set(origin.x + (rnd() - .5) * spread, origin.y + life * 3, origin.z + (rnd() - .5) * spread); g.add(s); items.push({ s, life }); }
    this.scene.add(g); return { g, items };
  }
  private buildCar() {
    const MAT = this.MAT, car = this.car; const shape = new THREE.Shape(); shape.moveTo(-2.3, .45); shape.lineTo(-2.3, .9); shape.lineTo(-1.6, 1.0); shape.lineTo(-1.0, 1.05); shape.lineTo(-.6, 1.7); shape.lineTo(.9, 1.75); shape.lineTo(1.5, 1.1); shape.lineTo(2.2, 1.0); shape.lineTo(2.3, .5); shape.lineTo(-2.3, .45);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.7, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 3 }), MAT.paint); body.position.z = -.85; body.castShadow = true; car.add(body);
    const rb = new THREE.Mesh(new THREE.BoxGeometry(4.4, .06, 2.2), MAT.dark); rb.position.y = .42; car.add(rb);
    ([[-1.5, 1], [1.4, 1], [-1.5, -1], [1.4, -1]] as [number, number][]).forEach(([x, s]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .24, 20), MAT.rubber); w.rotation.x = Math.PI / 2; w.position.set(x, .42, s * .95); car.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .26, 16), MAT.chrome); hub.rotation.x = Math.PI / 2; hub.position.copy(w.position); car.add(hub); const fd = new THREE.Mesh(new THREE.TorusGeometry(.55, .14, 8, 18, Math.PI), MAT.paint); fd.position.set(x, .5, s * 1.0); fd.rotation.y = Math.PI / 2; car.add(fd); });
    const grille = new THREE.Mesh(new THREE.BoxGeometry(.12, .55, 1.0), MAT.chrome); grille.position.set(2.32, .78, 0); car.add(grille); [-.55, .55].forEach(z => { const hl = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c0, toneMapped: false })); hl.position.set(2.25, 1.05, z); car.add(hl); });
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .2, 20), MAT.rubber); spare.rotation.z = Math.PI / 2; spare.position.set(-2.45, 1.0, 0); car.add(spare); const bump = new THREE.Mesh(new THREE.BoxGeometry(.1, .08, 1.9), MAT.chrome); bump.position.set(2.45, .5, 0); car.add(bump);
    car.position.set(3.6, 0, -9); car.rotation.y = Math.PI / 2 + .05; this.scene.add(car);
  }
  private buildFigure() {
    const fig = this.fig; const dark = new THREE.MeshStandardMaterial({ color: 0x0c0b10, roughness: 1 }); const hatM = new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 1 });
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(.24, .34, 1.15, 12), dark); coat.position.y = .85; coat.castShadow = true; fig.add(coat); const chest = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .55, 12), dark); chest.position.y = 1.5; chest.castShadow = true; fig.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), hatM); head.position.y = 1.9; fig.add(head); const crown = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .16, 14), hatM); crown.position.y = 2.04; fig.add(crown); const brim = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .02, 18), hatM); brim.position.y = 1.97; brim.castShadow = true; fig.add(brim);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .5, 8), dark); arm.position.set(.22, 1.55, .12); arm.rotation.z = -.5; fig.add(arm);
    fig.children.forEach(c => (c.name = 'proc'));
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a2a).multiplyScalar(6), toneMapped: false })); this.ember.position.set(.34, 1.72, .28); fig.add(this.ember); this.emberLight = new THREE.PointLight(0xff6a2a, .8, 1.4, 2); this.emberLight.position.copy(this.ember.position); fig.add(this.emberLight);
    fig.position.set(-FACE + 1.9, 0, -3.2); fig.rotation.y = .6; this.scene.add(fig);
  }
  private buildHat() { const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .16, 14), this.MAT.dark); c.position.y = .09; c.name = 'proc'; this.hat.add(c); const b = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .02, 18), this.MAT.dark); b.name = 'proc'; this.hat.add(b); this.hat.position.set(-FACE + 1.2, 6, -1.6); this.hat.visible = false; this.scene.add(this.hat); }
  private buildKiosk() {
    const MAT = this.MAT, k = this.kiosk; const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.3, 1.4), MAT.awningB); b.position.y = 1.15; b.castShadow = true; k.add(b); const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, .12, 1.8), MAT.wood); roof.position.y = 2.36; k.add(roof);
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.5, .62), MAT.cloth); p.position.set(-.75 + i % 3 * .75, .9 + Math.floor(i / 3) * .7, .71); k.add(p); }
    this.shutter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, .05), MAT.metal); this.shutter.position.set(0, 1.5, .73); k.add(this.shutter); k.position.set(FACE - 1.6, .16, -20); k.rotation.y = Math.PI; this.scene.add(k);
  }

  /* ── real assets swap in when available ── */
  private fit(obj: THREE.Object3D, target: number, axis: 'x' | 'y' | 'z') { const b = new THREE.Box3().setFromObject(obj); const s = new THREE.Vector3(); b.getSize(s); const k = target / (s[axis] || 1); obj.scale.multiplyScalar(k); const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y; return k; }
  private prep(root: THREE.Object3D, shadow = true) { root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; } }); return root; }
  private async loadAssets() {
    const S = this.scene;
    // surfaces
    for (const k of ['brick', 'plaster', 'plaster2', 'asphalt', 'cobble', 'wood']) this.swapSurface(k, this.MAT[k]);
    // HDRIs
    loadHDR(`${ASSET_ROOT}/hdri/moonless_golf_1k.hdr`).then((t: THREE.Texture | null) => { if (!t || this.disposed) return; this.envNight = this.pmrem.fromEquirectangular(t).texture; if (this.mode === 'night') S.environment = this.envNight; });
    loadHDR(`${ASSET_ROOT}/hdri/klippad_sunrise_2_1k.hdr`).then((t: THREE.Texture | null) => { if (!t || this.disposed) return; this.envDawn = this.pmrem.fromEquirectangular(t).texture; if (this.mode === 'dawn') S.environment = this.envDawn; });
    // street lamps
    loadGLTF(PH('street_lamp_01')).then(g => { if (!g || this.disposed) return; this.lamps.forEach(l => { const m = this.prep(g.scene.clone(true)); this.fit(m, 3.9, 'y'); m.rotation.y = l.g.position.x < 0 ? Math.PI / 2 : -Math.PI / 2; l.g.children.filter(c => c.name === 'proc').forEach(c => l.g.remove(c)); l.g.add(m); }); });
    loadGLTF(PH('fire_hydrant')).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene); m.children.slice(1).forEach(c => m.remove(c)); /* الملفّ يحمل نسختين */ this.fit(m, .8, 'y'); m.position.set(FACE - 1.2, .16, -6); S.add(m); });
    loadGLTF(PH('metal_trash_can')).then(g => { if (!g || this.disposed) return; [[-FACE + 1.0, -16, .3], [FACE - 1.1, -30, 2.4], [-FACE + 1.1, -44, 1.1]].forEach(([x, z, r]) => { const m = this.prep(g.scene.clone(true)); this.fit(m, .9, 'y'); m.position.set(x, .16, z); m.rotation.y = r; S.add(m); }); });
    loadGLTF(PH('water_manhole_cover')).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene, false); this.fit(m, .7, 'x'); m.position.set(2.2, .01, -14); S.add(m); const grate = S.getObjectByName('grate'); if (grate) S.remove(grate); });
    loadGLTF(PH('modular_fire_escape')).then(g => { if (!g || this.disposed) return; [[-1, -18], [1, -34], [-1, -52]].forEach(([side, z]) => { const m = this.prep(g.scene.clone(true)); this.fit(m, 9.5, 'y'); m.position.set(side * (FACE + .1), 3.3, z); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; S.add(m); }); });
    // دفعة إثراء الشارع: صناديق، براميل، مقعد، طاولات المقهى، لوح الطباشير، أحواض، كراتين، أكياس، سلّم، سيّارة مغطّاة
    const place = (name: string, size: number, axis: 'x' | 'y' | 'z', spots: [number, number, number][], y = .16, shadow = true) => loadGLTF(PH(name)).then(g => { if (!g || this.disposed) return; spots.forEach(([x, z, r]) => { const m = this.prep(g.scene.clone(true), shadow); this.fit(m, size, axis); m.position.set(x, y, z); m.rotation.y = r; S.add(m); }); });
    place('wooden_crate_01', .8, 'x', [[FACE - 1.4, -27.5, .2], [FACE - 1.4, -28.4, 1.1], [FACE - 2.2, -27.9, -.3]]); place('wooden_crate_02', 1.15, 'x', [[FACE - 1.5, -26.3, .1]]);
    place('wooden_barrels_01', 1.4, 'x', [[-FACE + 1.6, -40.5, .4]]); place('painted_wooden_bench', 1.8, 'x', [[-FACE + 1.4, -10, Math.PI / 2]]);
    place('outdoor_table_chair_set_01', 1.6, 'x', [[FACE - 1.7, -1.6, .3], [FACE - 1.7, -3.6, -.2]]); place('standing_chalkboard_01', .9, 'y', [[FACE - 1.0, -.4, -.6]]);
    place('planter_box_01', 1.0, 'x', [[-FACE + 1.0, -13.2, Math.PI / 2], [FACE - 1.0, -21.6, Math.PI / 2]]); place('cardboard_box_01', .6, 'x', [[-FACE + 1.9, -16.4, .5], [FACE - 2.0, -30.9, 1.3]]);
    place('trashbag', .7, 'x', [[-FACE + 1.5, -16.9, 0], [-FACE + 2.1, -44.6, 2]]); place('wooden_ladder', 3.2, 'y', [[-FACE + .35, -58, Math.PI / 2 + .35]], .16);
    place('covered_car', 4.4, 'z', [[3.4, -46, .02]], 0);
    // Sketchfab (CC-BY): car, character, fedora
    loadGLTF(SF('pierce_arrow')).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene); const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s); const long = s.x >= s.z ? 'x' : 'z'; this.fit(m, 5.0, long); if (long === 'z') m.rotation.y = Math.PI / 2; this.car.children.slice().forEach(c => this.car.remove(c)); this.car.add(m); });
    loadGLTF(SF('gangster')).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene); m.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; }); this.poseFigure(m); this.fit(m, 1.85, 'y'); this.fig.children.filter(c => c.name === 'proc').forEach(c => this.fig.remove(c)); this.fig.add(m); this.figModel = m; this.ember.position.set(.2, 1.45, .3); this.emberLight.position.copy(this.ember.position);
      this.clips = g.animations || []; console.info('🏙️ figure clips:', this.clips.map(c => c.name).join(', ') || 'none'); if (this.clips.length) { this.mixer = new THREE.AnimationMixer(m); this.mixer.addEventListener('finished', () => this.playClip(this.mode === 'dawn' ? 'walk' : 'idle')); this.playClip(this.mode === 'dawn' ? 'walk' : 'idle'); } });
    loadGLTF(SF('fedoras')).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene); this.fit(m, .34, 'x'); this.hat.children.filter(c => c.name === 'proc').forEach(c => this.hat.remove(c)); this.hat.add(m); });
  }
  figModel: THREE.Object3D | null = null; bones: Record<string, THREE.Object3D> = {};
  /** الملفّ مُهيكل بلا حركات (وضعيّة T): نُنزل الذراعين ونثني المرفقين ونميل الرأس قليلاً — ثمّ تهتزّ الوقفة في الحلقة */
  private poseFigure(root: THREE.Object3D) {
    const find = (rx: RegExp) => { let hit: THREE.Object3D | null = null; root.traverse(o => { if (!hit && (o as THREE.Bone).isBone && rx.test(o.name)) hit = o; }); return hit as THREE.Object3D | null; };
    const B = this.bones; const set = (k: string, rx: RegExp) => { const b = find(rx); if (b) B[k] = b; };
    set('shR', /^Shoulder_R/); set('shL', /^Shoulder_L/); set('elR', /^Elbow_R/); set('elL', /^Elbow_L/); set('head', /^Head/); set('neck', /^Neck/); set('spine', /^Spine1|^Chest/); set('root', /^Root_M/);
    const rot = (k: string, x: number, y: number, z: number) => { const b = B[k]; if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; } };
    // محاور العظام غير معروفة: نجرّب الدوران حول كلّ محورٍ بالاتّجاهين ونُبقي ما يُنزل المرفق أكثر (أدنى y عالميّ)
    const lower = (sh: string, el: string, amt: number) => { const S = B[sh], E = B[el]; if (!S || !E) return; const start = S.rotation.clone(); let best = { y: Infinity, r: start.clone() }; const wp = new THREE.Vector3();
      for (const ax of ['x', 'y', 'z'] as const) for (const sg of [1, -1]) { S.rotation.copy(start); (S.rotation as any)[ax] += sg * amt; root.updateMatrixWorld(true); E.getWorldPosition(wp); if (wp.y < best.y) best = { y: wp.y, r: S.rotation.clone() }; }
      S.rotation.copy(best.r); root.updateMatrixWorld(true); };
    lower('shR', 'elR', 1.3); lower('shL', 'elL', 1.3); rot('head', .12, .25, 0);
  }
  /** خريطة الحركات: كلّ نوعٍ يبحث في أسماء المقاطع بترتيبٍ ويسقط على idle — ملفّ Wolf3D (28 حركة) يملأها كلّها، وملفٌّ بلا حركات يعود إلى الإيماءات الإجرائيّة */
  private static CLIPS: Record<string, RegExp[]> = {
    idle: [/smok/i, /idle/i, /stand/i, /breath/i], walk: [/walk/i, /stroll/i, /run/i], react: [/look|turn|react|surpris|shock/i, /idle/i], relief: [/relie|wave|cheer|happy|nod/i, /idle/i],
    shush: [/shush|silence|quiet|finger|point/i, /talk|gestur/i, /idle/i], confused: [/confus|shrug|think|scratch/i, /idle/i], duck: [/duck|crouch|cover|hit|hurt|dodge/i, /idle/i],
  };
  private playClip(kind: string) {
    if (!this.mixer || !this.clips.length) return;
    let clip: THREE.AnimationClip | undefined; for (const rx of (StreetEngine.CLIPS[kind] || StreetEngine.CLIPS.idle)) { clip = this.clips.find(c => rx.test(c.name)); if (clip) break; } clip = clip || this.clips[0];
    const a = this.mixer.clipAction(clip); if (this.figAction && this.figAction !== a) this.figAction.fadeOut(.5);
    a.reset().fadeIn(.5); if (kind !== 'idle' && kind !== 'walk') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
    a.play(); this.figAction = a;
  }
  gestureT = -1; gestureKind = '';
  /** إيماءة إجرائيّة (للملفّ بلا حركات): التفاتٌ نحو الكاميرا وانحناءة قصيرة */
  private gesture(kind: string) { this.gestureT = 0; this.gestureKind = kind; this.playClip(kind); }

  /* ── post ── */
  private buildPost() {
    const w = 1280, h = 720; this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 8, aperture: .00018, maxblur: .011 }); this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .55, .65, .86); this.composer.addPass(this.bloom);
    this.film = new FilmPass(.09, false); this.composer.addPass(this.film);
    this.vig = new ShaderPass(VignetteShader); this.vig.uniforms.offset.value = .92; this.vig.uniforms.darkness.value = 1.15; this.composer.addPass(this.vig);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass(w, h); this.composer.addPass(this.smaa);
  }
  setQuality(q: Quality) { this.quality = q; try { localStorage.setItem('display3dQuality', q); } catch { /* noop */ } this.applyQuality(); }
  private applyQuality() {
    const hi = this.quality === 'high', md = this.quality === 'med'; this.renderer.setPixelRatio(hi ? Math.min(devicePixelRatio, 1.5) : md ? 1 : .75);
    this.bokeh.enabled = hi; this.bloom.enabled = hi || md; this.film.enabled = hi || md; this.smaa.enabled = hi || md; this.renderer.shadowMap.enabled = hi || md; this.lamps.forEach(l => { if (l.sl) l.sl.castShadow = hi || md; }); this.reflector.visible = hi || md; this.makeRain(hi ? 1800 : md ? 900 : 0); this.resize();
  }
  private makeRain(count: number) {
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; } if (!count) return;
    const pos = new Float32Array(count * 6); for (let i = 0; i < count; i++) { const x = (rnd() - .5) * 40, y = rnd() * 24, z = (rnd() - .5) * 60 - 10; pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x + .04; pos[i * 6 + 4] = y - .5; pos[i * 6 + 5] = z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c8, transparent: true, opacity: .28 })); this.rain.userData.count = count; this.scene.add(this.rain);
  }
  private resize() {
    const el = this.container; if (!el) return; const w = Math.max(2, el.clientWidth), h = Math.max(2, el.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h); this.bloom.setSize(w, h); this.smaa.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }

  /* ── public API ── */
  mount(el: HTMLElement) {
    if (!this.ok || this.disposed) return; if (this.disposeTimer) { clearTimeout(this.disposeTimer); this.disposeTimer = null; }
    if (this.container && this.container !== el) this.unmountDom();
    this.container = el; el.appendChild(this.renderer.domElement); this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); this.resize();
    if (!this.raf) { this.clock.start(); this.loop(); }
  }
  private unmountDom() { this.ro?.disconnect(); this.ro = null; if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement); this.container = null; }
  unmount() {
    this.unmountDom(); if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.disposeTimer = setTimeout(() => this.dispose(), DISPOSE_AFTER_MS);
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.unmountDom(); if (this.raf) cancelAnimationFrame(this.raf); this.renderer.dispose(); this.pmrem.dispose(); if (engine === this) engine = null; }
  setMode(m: StreetMode, opts?: { instant?: boolean }) {
    if (m === this.mode && this.dawnT !== 0) return; this.mode = m;
    if (m === 'dawn') { if (opts?.instant) { this.dawnT = 1; this.applyDawn(1); this.fig.position.z = -70; this.shutter.position.y = 2.2; } else { this.dawnT = 0; this.dawnStart = performance.now(); this.evShot = 'DAWN'; this.shotT = 0; } this.playClip('walk'); }
    else { this.dawnT = -1; this.applyDawn(0); this.fig.position.set(-FACE + 1.9, 0, -3.2); this.fig.rotation.y = .6; this.fig.visible = true; this.hat.visible = false; this.shutter.position.y = 1.5; this.evShot = null; this.cutTo('A'); this.playClip('idle'); }
  }
  fireEvent(k: StreetEvent) {
    this.evShot = k; this.shotT = 0; this.onCut?.(true);
    if (k === 'KILL') { this.ev.kill = .001; this.hat.visible = true; this.hat.position.set(-FACE + 1.2, 5.4, -1.6); this.hat.rotation.set(0, 0, 0); }
    this.gesture(k === 'KILL' ? 'react' : k === 'SAVED' ? 'relief' : k === 'SILENCE' ? 'shush' : k === 'DISABLE' ? 'confused' : 'duck');
    if (k === 'SAVED') this.ev.saved = .001; if (k === 'SILENCE') this.ev.silence = .001; if (k === 'DISABLE') { this.ev.disable = .001; this.purple.items.forEach(i => (i.life = rnd())); } if (k === 'SNIPE') { this.ev.snipe = .001; this.pigeons.forEach(p => (p.t = 0)); }
  }
  private cutTo(name: string) { this.onCut?.(true); setTimeout(() => { this.cur = name; this.shotT = 0; this.onCut?.(false); }, 300); }
  private applyDawn(k: number) {
    const e = k * k * (3 - 2 * k), N = this.NIGHT, D = this.DAWN, S = this.scene;
    (this.skyMat.uniforms.top.value as THREE.Color).copy(N.top).lerp(D.top, e); (this.skyMat.uniforms.hor.value as THREE.Color).copy(N.hor).lerp(D.hor, e); (S.fog as THREE.FogExp2).color.copy(N.fog).lerp(D.fog, e); (S.fog as THREE.FogExp2).density = N.fd + (D.fd - N.fd) * e; this.hemi.intensity = N.hemi + (D.hemi - N.hemi) * e; this.hemi.color.copy(N.hemiC).lerp(D.hemiC, e); this.renderer.toneMappingExposure = N.exp + (D.exp - N.exp) * e;
    (this.stars.material as THREE.PointsMaterial).opacity = .75 * (1 - e); this.moon.material.opacity = .9 * (1 - e); this.sun.position.y = -16 + e * 34; this.sun.visible = e > .02; (this.skyMat.uniforms.sunDir.value as THREE.Vector3).set(95, Math.max(4, this.sun.position.y), -34); this.skyMat.uniforms.sunI.value = e; this.sunLight.intensity = e * 1.3;
    this.shafts.children.forEach((m, i) => { ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = e * .06 * (1 - i * .06); }); this.shafts.position.y = 6 + e * 6; S.environment = e > .5 ? this.envDawn : this.envNight; (this.skyline.material as THREE.MeshBasicMaterial).opacity = 1 - e * .6;
    this.lamps.forEach((l, i) => { const off = Math.min(1, Math.max(0, (e - .25 - (5 - i) * .08) * 4)); l.on = 1 - off; }); this.neons.forEach(n => { n.on = e < .6; }); if (this.rain) (this.rain.material as THREE.LineBasicMaterial).opacity = .28 * (1 - e);
  }

  /* ── loop ── */
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop); if (!this.container) return;
    const dt = Math.min(.05, this.clock.getDelta()), time = this.clock.elapsedTime; const ev = this.ev;
    if (!this.probe.done) { this.probe.frames++; this.probe.t += dt; if (this.probe.t >= 3) { this.probe.done = true; const fps = this.probe.frames / this.probe.t; if (fps < 28 && this.quality === 'high') this.setQuality('med'); else if (fps < 20 && this.quality === 'med') this.setQuality('low'); } }
    if (this.dawnT >= 0 && this.dawnT < 1) { this.dawnT = Math.min(1, (performance.now() - this.dawnStart) / 8000); this.applyDawn(this.dawnT); if (this.dawnT > .5) { if (this.mixer) { this.fig.position.z -= dt * .9; this.fig.rotation.y += (Math.PI - this.fig.rotation.y) * .05; } else this.fig.visible = this.dawnT < .75; } if (this.dawnT > .7) this.shutter.position.y = Math.min(2.2, this.shutter.position.y + dt * .5); }
    else if (this.mode === 'dawn' && this.mixer && this.fig.position.z > -70) this.fig.position.z -= dt * .9;
    const dim = ev.silence > 0 ? (ev.silence < 2 ? .6 : 1) : 1;
    this.lamps.forEach((l, i) => { let f = 1; if (i === 0) { if (ev.kill > 0) { const k = ev.kill; f = k < 1.2 ? (Math.sin(k * 40) > 0.2 ? 1 : .15) : k < 1.8 ? .6 : 0; } if (ev.saved > 0) f = 1 + Math.min(1.2, ev.saved * 1.5) * Math.max(0, 1 - (ev.saved - 1.5) * .7); }
      const flick = 1 - (i === 2 ? .06 * (.5 + .5 * Math.sin(time * 7.3 + l.flick)) * (.5 + .5 * Math.sin(time * 2.1)) : 0); /* ارتجافٌ ناعم لا ومضات (قرار المالك 2026-09-12) */ const I = l.on * f * flick * dim; l.pl.intensity = 18 * I; if (l.sl) l.sl.intensity = 36 * I; l.bulbMat.color.setRGB(3 * I, 2.3 * I, 1.4 * I, THREE.LinearSRGBColorSpace); (l.cone.material as THREE.ShaderMaterial).uniforms.uI.value = .55 * I; l.cone.visible = I > .01; });
    this.neons.forEach(n => { let on = n.on && !(ev.silence > 0 && ev.silence < 2.2); if (n.broken && on) { const cyc = time % 9; on = !(cyc > 6.2 && cyc < 6.9 && Math.sin(time * 31) > 0); } /* ومضةٌ قصيرة كلّ ٩ ثوانٍ فقط */ (n.mesh.material as THREE.MeshBasicMaterial).color.copy(n.base).multiplyScalar(on ? 1 : .06); n.light.intensity = on ? 4 : 0; });
    if (ev.kill > 0) { ev.kill += dt; const h = this.hat; if (h.visible && h.position.y > .18) { h.position.y -= dt * (2.5 + (5.4 - h.position.y) * 1.5); h.rotation.x += dt * 4; h.rotation.z += dt * 2; if (h.position.y <= .18) { h.position.y = .18; h.rotation.set(.1, 0, .05); } } if (ev.kill > 8) ev.kill = 0; }
    if (ev.saved > 0) { ev.saved += dt; this.fig.rotation.y += (.6 + Math.sin(Math.min(Math.PI, ev.saved)) * 1.4 - this.fig.rotation.y) * .08; this.ember.visible = ev.saved < 2.5; this.emberLight.intensity = ev.saved < 2.5 ? .8 : 0; if (ev.saved > 6) { ev.saved = 0; this.ember.visible = true; this.emberLight.intensity = .8; } }
    if (ev.silence > 0) { ev.silence += dt; this.hemi.intensity = (this.mode === 'dawn' ? this.DAWN.hemi : this.NIGHT.hemi) * dim; if (ev.silence > 5) ev.silence = 0; }
    if (ev.disable > 0) { ev.disable += dt; if (ev.disable > 7) ev.disable = 0; }
    if (ev.snipe > 0) { ev.snipe += dt; const fl = ev.snipe < .15 ? 1 : ev.snipe < .3 ? .4 : ev.snipe < .4 ? 1 : 0; if (!this.snipeL) { this.snipeL = new THREE.PointLight(0xfff2d0, 0, 20, 1.5); this.snipeL.position.set(FACE - 1.2, 8.6, -11); this.scene.add(this.snipeL); } this.snipeL.intensity = fl * 400; if (ev.snipe > 7) ev.snipe = 0; }
    this.pigeons.forEach(p => { if (p.t >= 0) { p.t += dt; const k = p.t; p.s.material.opacity = k < 3 ? Math.min(1, k * 4) * (1 - k / 3) : 0; p.s.position.set(p.ox + Math.sin(k * 3 + p.oz) * k * .8 - k * 1.2, 11.5 + k * 2.2 + Math.sin(k * 14) * .15, p.oz + k * 1.3); p.s.scale.set(.35, .22 * (0.5 + Math.abs(Math.sin(k * 18))), 1); if (k > 3) p.t = -1; } });
    if (this.mode === 'night' && ev.saved === 0) { const pulse = .5 + .5 * Math.sin(time * 1.6); this.emberLight.intensity = .5 + pulse * .7; if (!this.mixer) this.fig.position.y = Math.sin(time * 1.3) * .012; }
    if (!this.mixer && this.figModel) { const B = this.bones; let g = 0; if (this.gestureT >= 0) { this.gestureT += dt; g = Math.sin(Math.min(1, this.gestureT / 3.2) * Math.PI); if (this.gestureT > 3.2) this.gestureT = -1; }
      if (B.spine) { B.spine.rotation.z = Math.sin(time * .9) * .025 + g * (this.gestureKind === 'duck' ? .35 : .08); B.spine.rotation.y = g * (this.gestureKind === 'shush' ? -.3 : .2); }
      if (B.head) { B.head.rotation.y = .25 + Math.sin(time * .35) * .18 + g * .5; B.head.rotation.x = .12 + g * (this.gestureKind === 'confused' ? -.2 : .1); }
      this.fig.scale.y = 1 + Math.sin(time * 1.1) * .006; }
    this.mixer?.update(dt);
    this.laundry.forEach(l => { l.m.rotation.x = Math.sin(time * 1.4 + l.ph) * .18; l.m.rotation.y = Math.sin(time * .9 + l.ph) * .12; });
    if (this.rain && (this.rain.material as THREE.LineBasicMaterial).opacity > 0) { const a = (this.rain.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array, n = this.rain.userData.count as number; for (let i = 0; i < n; i++) { a[i * 6 + 1] -= dt * 16; a[i * 6 + 4] -= dt * 16; if (a[i * 6 + 1] < 0) { a[i * 6 + 1] += 24; a[i * 6 + 4] += 24; } } (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; this.rain.position.set(this.camera.position.x, 0, this.camera.position.z + 10); }
    const upd = (ps: PS, origin: THREE.Vector3, speed: number, spread: number, maxLife: number, alpha: number, grow: number) => { ps.items.forEach(it => { it.life += dt / maxLife; if (it.life > 1) { it.life = 0; it.s.position.set(origin.x + (rnd() - .5) * spread, origin.y, origin.z + (rnd() - .5) * spread); it.vx = (rnd() - .5) * .3; it.vz = (rnd() - .5) * .3; } it.s.position.y += dt * speed; it.s.position.x += (it.vx || 0) * dt; it.s.position.z += (it.vz || 0) * dt; const l = it.life; it.s.material.opacity = alpha * Math.sin(l * Math.PI); const sc = 1 + l * grow; it.s.scale.set(sc, sc, 1); }); };
    const STEAM_O = this.steam.items[0] ? new THREE.Vector3(2.2, .1, -14) : new THREE.Vector3();
    upd(this.steam, STEAM_O, .9, 1.4, 4.5, .07, 2.4); this.smokes.forEach(s => upd(s.ps, s.e, .8, .8, 7, .05, 3)); if (ev.disable > 0 && ev.disable < 5) upd(this.purple, STEAM_O, 1.1, 2.2, 3.5, .16, 2.5); else this.purple.items.forEach(i => (i.s.material.opacity = 0)); upd(this.exhaust, new THREE.Vector3(this.car.position.x - .2, .4, this.car.position.z + 2.4), .5, .4, 2.5, .06, 1.8);
    // camera
    const s = this.shots[this.evShot || this.cur]; this.shotT += dt; const t = Math.min(1, this.shotT / s.len); const [p, l] = s.at(t); this._p.lerp(p, this.evShot ? .35 : .12); this._l.lerp(l, .12); this.sway.set(Math.sin(time * .7) * .03, Math.sin(time * 1.1) * .02, 0); this.camera.position.copy(this._p).add(this.sway); this.camera.lookAt(this._l); this.camera.fov += (s.fov - this.camera.fov) * .08; this.camera.updateProjectionMatrix();
    if (this.evShot) { if (this.shotT >= s.len) { this.evShot = null; this.shotT = 0; this.cutTo(this.cur); } } else if (this.shotT >= s.len) { this.oi = (this.oi + 1) % this.order.length; this.cutTo(this.order[this.oi]); }
    const d = this.camera.position.distanceTo(this.evShot === 'KILL' ? this.hat.position : this.fig.position); (this.bokeh.uniforms as any).focus.value += (d - (this.bokeh.uniforms as any).focus.value) * .1;
    this.composer.render(dt);
  };
}

let engine: StreetEngine | null = null;
/** المحرّك المفرد — يُنشأ عند أوّل طلب ويبقى حيّاً بين الليل والفجر */
export function getStreetEngine(): StreetEngine | null {
  if (typeof window === 'undefined') return null;
  if (!engine || engine.disposed) engine = new StreetEngine();
  return engine.ok ? engine : null;
}
export type { StreetEngine };
