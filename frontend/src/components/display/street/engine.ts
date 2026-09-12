// ══════════════════════════════════════════════════════
// 🏙️ Via dei Segreti — محرّك زقاق «ليتل إيتالي 1931» لشاشة القاعة (ليل/فجر/نهار) — v3
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: النموذج المعتمد في الارتفاكت يُنقل كما هو إلى الكود.
// three خام (لا fiber): المشهد إجرائيّ بمعظمه، مع أصول Poly Haven (CC0) وSketchfab (CC-BY)
// تُحمَّل إن وُجدت تحت /3d/ وإلا بقيت النماذج المؤقّتة الإجرائيّة.
//
// • مفردٌ (singleton) مضيفه StreetStage على مستوى الصفحة: يبقى حيّاً من أوّل ليلٍ إلى نهاية اللعبة (الليل → الفجر → النهار
//   تحوّلات إضاءةٍ داخل اللقطة نفسها بلا إعادة تركيب)؛ يُتلَف بعد 90 ثانية من الغياب.
// • v3 (2026-09-12، خطّة الإصلاح المعتمدة): قطعٌ محروس وغطاءٌ يملكه المحرّك (لا وميض)، طقم واجهات Sketchfab بدل
//   المباني الإجرائيّة، مظلّات/شرفات/غسيل/أعمدة أصولاً، حشدٌ من ثلاث شخصيّات بحركات Mixamo مُعاد توجيهها، سيّارتان،
//   وضع النهار الرماديّ خلف الكروت، والتقاط ملصقٍ للأجهزة الضعيفة.
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
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export type StreetMode = 'night' | 'dawn' | 'day';
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

const ANIM = (n: string) => `${ASSET_ROOT}/anim/${n}.glb`;
const SFB = (n: string) => `${ASSET_ROOT}/sketchfab/${n}/scene.glb`;

/** الإحماء: يُستدعى من اللوبي كي تكون الأصول في الذاكرة قبل أوّل ليل */
export function preloadStreetAssets() {
  if (typeof window === 'undefined') return;
  ['street_lamp_01', 'street_lamp_02', 'fire_hydrant', 'modular_fire_escape', 'metal_trash_can', 'water_manhole_cover', 'modular_electricity_poles', 'wooden_crate_01', 'wooden_crate_02', 'wooden_barrels_01', 'painted_wooden_bench', 'outdoor_table_chair_set_01', 'standing_chalkboard_01', 'planter_box_01', 'cardboard_box_01', 'trashbag', 'wooden_ladder', 'covered_car'].forEach(n => loadGLTF(PH(n)));
  ['pierce_arrow', 'coupe33', 'gangster', 'dotty', 'fedoras', 'brownstone', 'awning', 'balcony', 'clothesline', 'diorama1930'].forEach(n => loadGLTF(SF(n)));
  loadGLTF(SFB('moneyman')); ['neutral_idle', 'walking', 'smoking', 'sitting'].forEach(n => loadGLTF(ANIM(n)));
  Object.values(SURFACES).forEach(s => { loadTex(TEX(s.name, 'diff'), true, s.rep); loadTex(TEX(s.name, 'nor'), false, s.rep); loadTex(TEX(s.name, 'rough'), false, s.rep); });
  loadHDR(`${ASSET_ROOT}/hdri/moonless_golf_1k.hdr`); loadHDR(`${ASSET_ROOT}/hdri/klippad_sunrise_2_1k.hdr`);
}

/* ───────────────── quality ───────────────── */
function detectQuality(): Quality {
  try {
    const q = new URLSearchParams(location.search).get('q'); if (q === 'high' || q === 'med' || q === 'low') return q;
    localStorage.removeItem('display3dQuality'); // 🔴 كانت درجةٌ متدنّية تُحفظ من فحصٍ جرى أثناء التحميل فتلتصق بالجهاز
  } catch { /* noop */ }
  return 'high';
}
function debugParam(k: string) { try { return new URLSearchParams(location.search).get(k); } catch { return null; } }

/* ───────────────── the engine ───────────────── */
type Lamp = { g: THREE.Group; pl: THREE.PointLight; sl: THREE.SpotLight | null; cone: THREE.Mesh; bulb: THREE.Mesh; flick: number; on: number };
type Neon = { mesh: THREE.Mesh; light: THREE.PointLight; base: THREE.Color; broken: boolean; on: boolean };
type PS = { g: THREE.Group; items: { s: THREE.Sprite; life: number; vx?: number; vz?: number }[] };
type Shot = { len: number; fov: number; at: (t: number) => [THREE.Vector3, THREE.Vector3] };
type Preset = { top: THREE.Color; hor: THREE.Color; fog: THREE.Color; fd: number; hemi: number; hemiC: THREE.Color; exp: number; sun: number; lamps: number; rain: number };
/** شخصيّة في الحشد: نسخة هيكليّة بحركاتها وحالتها */
type Walker = { root: THREE.Object3D; groundY: number; mixer: THREE.AnimationMixer | null; acts: Record<string, THREE.AnimationAction>; cur: string; kind: 'lamp' | 'walk' | 'idle' | 'seat'; side: 1 | -1; z: number; dir: 1 | -1; speed: number; pause: number; night: boolean; day: boolean; gait: { hips: THREE.Object3D[]; knees: THREE.Object3D[]; arms: THREE.Object3D[] } | null };

/** خريطة عظام Advanced Skeleton (Al Capone / Dotty) → Mixamo */
const AS_TO_MIXAMO: Record<string, string> = {
  Root_M: 'Hips', Spine1_M: 'Spine', Chest_M: 'Spine2', Neck_M: 'Neck', Head_M: 'Head',
  Scapula_R: 'RightShoulder', Shoulder_R: 'RightArm', Elbow_R: 'RightForeArm', Wrist_R: 'RightHand', Hip_R: 'RightUpLeg', Knee_R: 'RightLeg', Ankle_R: 'RightFoot', Toes_R: 'RightToeBase',
  Scapula_L: 'LeftShoulder', Shoulder_L: 'LeftArm', Elbow_L: 'LeftForeArm', Wrist_L: 'LeftHand', Hip_L: 'LeftUpLeg', Knee_L: 'LeftLeg', Ankle_L: 'LeftFoot', Toes_L: 'LeftToeBase',
  MiddleFinger1_R: 'RightHandMiddle1', MiddleFinger2_R: 'RightHandMiddle2', IndexFinger1_R: 'RightHandIndex1', IndexFinger2_R: 'RightHandIndex2', ThumbFinger1_R: 'RightHandThumb1', ThumbFinger2_R: 'RightHandThumb2',
  MiddleFinger1_L: 'LeftHandMiddle1', MiddleFinger2_L: 'LeftHandMiddle2', IndexFinger1_L: 'LeftHandIndex1', IndexFinger2_L: 'LeftHandIndex2', ThumbFinger1_L: 'LeftHandThumb1', ThumbFinger2_L: 'LeftHandThumb2',
};

class StreetEngine {
  renderer!: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(50, 16 / 9, .1, 400);
  container: HTMLElement | null = null; dipEl: HTMLDivElement | null = null; ro: ResizeObserver | null = null; raf = 0; disposeTimer: any = null; disposed = false; ok = true; active = true; frameSkip = 0;
  composer!: EffectComposer; bloom!: UnrealBloomPass; bokeh!: BokehPass; film!: FilmPass; vig!: ShaderPass; smaa!: SMAAPass; quality: Quality = 'high'; probe = { frames: 0, t: 0, done: false }; ambient = false;
  clock = new THREE.Clock(); mode: StreetMode = 'night'; from: Preset; to: Preset; transT = 1; transStart = 0; transMs = 8000;
  lamps: Lamp[] = []; neons: Neon[] = []; laundry: { m: THREE.Object3D; ph: number }[] = []; pigeons: { s: THREE.Sprite; t: number; ox: number; oz: number }[] = [];
  rain: THREE.LineSegments | null = null; steam!: PS; purple!: PS; exhaust!: PS;
  proc = new THREE.Group(); hat = new THREE.Group(); hatLight!: THREE.PointLight; car = new THREE.Group(); car2 = new THREE.Group(); ember!: THREE.Mesh; emberLight!: THREE.PointLight;
  walkers: Walker[] = []; clipsMixamo: Record<string, THREE.AnimationClip> = {}; figLamp: Walker | null = null; gestureT = -1; gestureKind = '';
  reflector!: Reflector; skyMat!: THREE.ShaderMaterial; stars!: THREE.Points; moon!: THREE.Sprite; sun!: THREE.Mesh; shafts = new THREE.Group(); skyline!: THREE.Mesh; hemi!: THREE.HemisphereLight; sunLight!: THREE.DirectionalLight; snipeL: THREE.PointLight | null = null;
  envNight: THREE.Texture | null = null; envDawn: THREE.Texture | null = null; pmrem!: THREE.PMREMGenerator; windows!: THREE.InstancedMesh; soft = texSoft(); curtain = texCurtain();
  shots!: Record<string, Shot>; cur = 'A'; shotT = 0; order = ['A', 'B', 'C']; oi = 0; evShot: string | null = null; _p = new THREE.Vector3(-.8, 1.7, 11); _l = new THREE.Vector3(.4, 2, -30); sway = new THREE.Vector3(); cutting = false; frameShift = 0;
  ev = { silence: 0, disable: 0, snipe: 0, kill: 0, saved: 0 }; posterCb: ((url: string) => void) | null = null; fpsEma = 0; facadeGroup: THREE.Group | null = null; ready = false; readyAt = 0; assetsReady: Promise<void> = Promise.resolve();
  prewarmDone = false; prewarmMs = 0; posters: Partial<Record<StreetMode, string>> = {}; lastFrameAt = 0; frameIndex = 0; transMarkAt = 0; transPending = false; lastTransitionMs = 0; dusk = false;
  STEAM_O = new THREE.Vector3(2.2, .1, -14); EXH_O = new THREE.Vector3(3.4, .4, -6.6);
  /** للشارة التشخيصيّة */
  lastTris = 0; lastCalls = 0;
  stats() { return { mode: this.mode, quality: this.quality, ambient: this.ambient, ready: this.ready, prewarm: this.prewarmDone, prewarmMs: this.prewarmMs, lastTransitionMs: this.lastTransitionMs, active: this.active, fps: this.active ? Math.round(this.fpsEma) : 0, tris: (this.lastTris / 1000).toFixed(0) + 'k', calls: this.lastCalls }; }
  NIGHT: Preset = { top: new THREE.Color(0x02030a), hor: new THREE.Color(0x1a1420), fog: new THREE.Color(0x0a0b12), fd: .03, hemi: .22, hemiC: new THREE.Color(0x223046), exp: .95, sun: 0, lamps: 1, rain: 1 };
  DAWN: Preset = { top: new THREE.Color(0x4f6690), hor: new THREE.Color(0xe9a878), fog: new THREE.Color(0xb99e86), fd: .012, hemi: .85, hemiC: new THREE.Color(0xffd9b0), exp: 1.0, sun: 1, lamps: 0, rain: 0 };
  DAY: Preset = { top: new THREE.Color(0x5b6472), hor: new THREE.Color(0x9a948c), fog: new THREE.Color(0x777370), fd: .014, hemi: 1.0, hemiC: new THREE.Color(0xcfd6e0), exp: .85, sun: .3, lamps: 0, rain: 0 };
  MAT!: Record<string, THREE.MeshStandardMaterial>; frontSign = 1;

  constructor() {
    try { this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch { this.ok = false; this.from = this.to = this.NIGHT; return; }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .95;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    this.pmrem = new THREE.PMREMGenerator(this.renderer); this.renderer.info.autoReset = false; this.quality = detectQuality(); this.manualQuality = !!debugParam('q'); this.from = this.to = this.NIGHT;
    const bs = debugParam('brot'); if (bs === '180') this.frontSign = -1; const sh = debugParam('shot'); if (sh) setTimeout(() => { if (this.shots[sh]) { this.evShot = sh; this.shotT = 0; this.order = [sh]; this.cur = sh; } }, 1500);
    this.build(); this.buildPost(); this.applyQuality(); this.applyPreset(this.NIGHT); this.loadAssets();
    // الظلال والانعكاس بالتناوب: المشهد كان يُرسم 4 مرّات في الإطار (عرض + انعكاس + ظلّان) — الآن ~2.2
    this.renderer.shadowMap.autoUpdate = false; const origBefore = this.reflector.onBeforeRender.bind(this.reflector); this.reflector.onBeforeRender = (...args: any[]) => { if (this.frameIndex % 2 === 1) (origBefore as any)(...args); };
    this.assetsReady.then(() => this.prewarm());
  }

  /* ── materials ── */
  private std(t: TexSet, extra?: THREE.MeshStandardMaterialParameters) {
    const o: THREE.MeshStandardMaterialParameters = { map: t.map, normalMap: t.normalMap, roughness: t.roughness ?? 1, metalness: t.metalness ?? 0 }; if (t.roughnessMap) o.roughnessMap = t.roughnessMap;
    return new THREE.MeshStandardMaterial(Object.assign(o, extra || {}));
  }
  private async swapSurface(key: string, mat: THREE.MeshStandardMaterial) {
    const s = SURFACES[key]; if (!s) return;
    const [d, n, r] = await Promise.all([loadTex(TEX(s.name, 'diff'), true, s.rep), loadTex(TEX(s.name, 'nor'), false, s.rep), loadTex(TEX(s.name, 'rough'), false, s.rep)]);
    if (!d || this.disposed) return; mat.map = d; if (n) mat.normalMap = n; if (r) { mat.roughnessMap = r; mat.roughness = 1; } mat.needsUpdate = true;
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
    this.MAT = MAT; S.add(this.proc);
    this.buildProceduralBuildings(MAT);
    // ground
    this.reflector = new Reflector(new THREE.PlaneGeometry(STREET_W + .2, 220), { clipBias: .003, textureWidth: 1024, textureHeight: 1024, color: 0x5a5a5e }); this.reflector.rotation.x = -Math.PI / 2; this.reflector.position.set(0, -.01, -60); S.add(this.reflector);
    const asphaltMat = this.std(M.asphalt, { transparent: true, alphaMap: puddleMask(), roughness: .35, metalness: .05, color: 0xbbbbbb }); MAT.asphalt = asphaltMat; const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W + .2, 220), asphaltMat); asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(0, .005, -60); asphalt.receiveShadow = true; S.add(asphalt);
    ([-1, 1] as const).forEach(s => { const sw = new THREE.Mesh(new THREE.BoxGeometry(SIDE_W, .16, 220), MAT.cobble); sw.position.set(s * (STREET_W / 2 + SIDE_W / 2), .08, -60); sw.receiveShadow = true; S.add(sw); const curb = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, 220), MAT.plaster); curb.position.set(s * (STREET_W / 2 + .09), .09, -60); S.add(curb); });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6a6a70, roughness: .45, metalness: .8 }); [-1.3, 1.3].forEach(x => { const r = new THREE.Mesh(new THREE.BoxGeometry(.09, .03, 220), railMat); r.position.set(x, .02, -60); S.add(r); });
    // سلك الترام (خطوط: أنحف عنصرٍ ممكن)
    { const wires: THREE.Vector3[] = []; [-1.3, 1.3].forEach(x => wires.push(new THREE.Vector3(x, 6.1, 8), new THREE.Vector3(x, 6.1, -100))); for (let z = -4; z > -98; z -= 12) { wires.push(new THREE.Vector3(-FACE, 6.6, z), new THREE.Vector3(FACE, 6.6, z)); [-1.3, 1.3].forEach(x => wires.push(new THREE.Vector3(x, 6.6, z), new THREE.Vector3(x, 6.1, z))); } S.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), new THREE.LineBasicMaterial({ color: 0x1a1a1a }))); }
    // lamps: the Poly Haven post carries the light; the cone/bulb are effects hung on its head
    const coneMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(0xffb347) }, uI: { value: .55 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f=abs(dot(vN,vV)); float a=pow(vUv.y,2.2)*pow(f,1.4)*uI; gl_FragColor=vec4(uColor*a,a); }' });
    const LAMPS: [number, number][] = [[-6.55, -2], [6.55, -12], [-6.55, -24], [6.55, -36], [-6.55, -48], [6.55, -60]];
    LAMPS.forEach(([x, z], i) => { const g = new THREE.Group(); g.position.set(x, 0, z); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc478).multiplyScalar(3), toneMapped: false })); bulb.position.set(0, 3.6, 0); g.add(bulb);
      const pl = new THREE.PointLight(0xffb060, 18, 22, 1.8); pl.position.copy(bulb.position); g.add(pl); let sl: THREE.SpotLight | null = null; if (i < 2) { sl = new THREE.SpotLight(0xffb060, 36, 26, .9, .6, 1.5); sl.position.copy(bulb.position); sl.target.position.set(0, 0, 0); sl.castShadow = true; sl.shadow.mapSize.set(1024, 1024); sl.shadow.bias = -.0008; g.add(sl); g.add(sl.target); }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.7, 24, 1, true), coneMat.clone()); cone.position.set(0, 1.75, 0); g.add(cone); S.add(g); this.lamps.push({ g, pl, sl, cone, bulb, flick: rnd() * 10, on: 1 }); });
    // sky
    this.skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: this.NIGHT.top.clone() }, hor: { value: this.NIGHT.hor.clone() }, sunDir: { value: new THREE.Vector3(0, -1, 0) }, sunI: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform float sunI; varying vec3 vP; void main(){ float h=clamp(vP.y,0.,1.); vec3 c=mix(hor,top,pow(h,.55)); float s=max(dot(vP,normalize(sunDir)),0.); c+=vec3(1.,.72,.45)*pow(s,18.)*sunI*1.6+vec3(1.,.6,.3)*pow(s,4.)*sunI*.35; gl_FragColor=vec4(c,1.); }' });
    S.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat));
    { const n = 900, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * .9); pos[i * 3] = Math.sin(ph) * Math.cos(th) * 280; pos[i * 3 + 1] = Math.cos(ph) * 280 + 10; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 280; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: .75, fog: false })); S.add(this.stars); }
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: 0xdde4ff, fog: false, transparent: true, opacity: .9 })); this.moon.scale.set(14, 14, 1); this.moon.position.set(40, 70, -200); S.add(this.moon);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc48a).multiplyScalar(4), toneMapped: false, fog: false })); this.sun.position.set(95, -16, -34); this.sun.visible = false; S.add(this.sun);
    for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + k * .4, 90), new THREE.MeshBasicMaterial({ map: this.soft, color: 0xffcc88, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); m.position.set(9 + k * 1.6, 0, -34 - k * 2); m.rotation.z = -.55 + (k - 3) * .04; this.shafts.add(m); } S.add(this.shafts);
    this.skyline = new THREE.Mesh(new THREE.PlaneGeometry(120, 30), new THREE.MeshBasicMaterial({ map: texSkyline(), transparent: true, toneMapped: false, color: 0x9a9aa0 })); this.skyline.position.set(0, 12, -125); S.add(this.skyline);
    S.fog = new THREE.FogExp2(0x0a0b12, .03); this.hemi = new THREE.HemisphereLight(0x223046, 0x101010, .22); S.add(this.hemi); this.sunLight = new THREE.DirectionalLight(0xffb27a, 0); this.sunLight.position.set(60, 22, -30); S.add(this.sunLight);
    const cube = (stops: [number, string][], blobs: boolean) => { const faces: HTMLCanvasElement[] = []; for (let f = 0; f < 6; f++) { const c = cv(64, 64), x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 0, 64); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 64, 64); if (blobs) for (let k = 0; k < 5; k++) { x.fillStyle = 'rgba(255,180,90,.5)'; x.beginPath(); x.arc(rnd() * 64, 20 + rnd() * 30, 3 + rnd() * 4, 0, 7); x.fill(); } faces.push(c); } const ct = new THREE.CubeTexture(faces); ct.needsUpdate = true; ct.colorSpace = THREE.SRGBColorSpace; return this.pmrem.fromCubemap(ct).texture; };
    this.envNight = cube([[0, '#0b0d16'], [.6, '#1a1712'], [1, '#3a2a14']], true); this.envDawn = cube([[0, '#5b6f9a'], [.55, '#f2a86b'], [1, '#4a3a2a']], false); S.environment = this.envNight;
    // hat (fedora asset replaces the procedural stand-in), cars (assets replace stand-ins)
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, .16, 14), MAT.dark); c.position.y = .09; c.name = 'proc'; this.hat.add(c); const b = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .02, 18), MAT.dark); b.name = 'proc'; this.hat.add(b); this.hat.position.set(-FACE + 1.7, 6, -4.2); this.hat.scale.setScalar(1.7); this.hat.visible = false; S.add(this.hat); this.hatLight = new THREE.PointLight(0xffd9a0, 0, 7, 2); this.hatLight.position.set(-FACE + 2.8, 2.4, -3.6); S.add(this.hatLight); }
    this.car.position.set(3.6, 0, -9); this.car.rotation.y = Math.PI / 2 + .05; S.add(this.car); this.car2.position.set(-3.5, 0, -31); this.car2.rotation.y = -Math.PI / 2 - .04; S.add(this.car2);
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a2a).multiplyScalar(6), toneMapped: false })); this.ember.position.set(-FACE + 2.1, 1.45, -2.9); S.add(this.ember); this.emberLight = new THREE.PointLight(0xff6a2a, .8, 1.4, 2); this.emberLight.position.copy(this.ember.position); S.add(this.emberLight);
    for (let k = 0; k < 7; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: 0xd8d8e0, transparent: true, opacity: 0 })); s.scale.set(.35, .22, 1); S.add(s); this.pigeons.push({ s, t: -1, ox: FACE - 1.5 + (rnd() - .5) * 2, oz: -11 + (rnd() - .5) * 3 }); }
    const STEAM_O = new THREE.Vector3(2.2, .1, -14); this.steam = this.particles(14, 0x8a8580, .7, STEAM_O, 1.4); this.purple = this.particles(44, 0x5a2ea0, 1.5, STEAM_O, 2.4); this.exhaust = this.particles(6, 0x777780, .4, new THREE.Vector3(3.4, .4, -6.6), .4);
    // shots (الفجر/الصباح: الإطار يُزاح كي يبقى المشهد في الثلثين الأيسرين والبطاقة على اليمين)
    const FIG = () => this.figLamp ? this.figLamp.root.position : new THREE.Vector3(-FACE + 1.9, 0, -3.2);
    this.shots = {
      A: { len: 18, fov: 50, at: t => [new THREE.Vector3(-.8, 1.7, 11 - t * 4.5), new THREE.Vector3(.4, 2.0, -30)] },
      B: { len: 18, fov: 46, at: t => { const e = 1 - Math.pow(1 - t, 3); return [new THREE.Vector3(2.5, 12 - e * 9.5, 3 - e * 2), new THREE.Vector3(-2.5, 1.2, -12)]; } },
      C: { len: 18, fov: 22, at: t => [new THREE.Vector3(1.2, 1.9, -52 + t * 2), new THREE.Vector3(FIG().x + .3, 1.4, FIG().z)] },
      KILL: { len: 7, fov: 34, at: t => [new THREE.Vector3(-FACE + 6.8, 1.5 + (1 - t) * .4, -8.2), new THREE.Vector3(-FACE + 1.7, 4.6 - Math.min(1, t * 1.6) * 4.3, -4.2)] },
      SAVED: { len: 6, fov: 42, at: () => [new THREE.Vector3(-FACE + 6, 1.6, -1), new THREE.Vector3(FIG().x, 1.5, FIG().z)] },
      SILENCE: { len: 5, fov: 40, at: () => { const n = this.neons[0]; const p = n ? n.mesh.position : new THREE.Vector3(FACE, 5, -8); return [new THREE.Vector3(p.x - Math.sign(p.x) * 7, 3.2, p.z + 3), p.clone()]; } },
      DISABLE: { len: 6, fov: 40, at: () => [new THREE.Vector3(-2.5, 2.4, -8.5), new THREE.Vector3(2.2, .6, -14)] },
      SNIPE: { len: 6, fov: 42, at: () => [new THREE.Vector3(-3, 1.6, -2), new THREE.Vector3(FACE - .6, 8.5, -11)] },
      DAWN: { len: 9, fov: 34, at: t => [new THREE.Vector3(.5, 1.8, -2 - t * 3), new THREE.Vector3(0, 6, -90)] },
    };
  }
  /** المباني الإجرائيّة (احتياط حتى يصل طقم الواجهات) — تُزال كلّها عند تحميل الطقم */
  private buildProceduralBuildings(MAT: Record<string, THREE.MeshStandardMaterial>) {
    const S = this.proc; const geos: Record<string, THREE.BufferGeometry[]> = { brick: [], plaster: [], plaster2: [], metal: [], wood: [], dark: [] };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: string) => { const g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z)); geos[mat].push(g); };
    const windows: { x: number; y: number; z: number; ry: number; lit: boolean; warm: boolean }[] = [];
    const building = (side: 1 | -1, z0: number, w: number, floors: number, seedv: number) => {
      seed = seedv; const fh = 3.4, h = floors * fh + .6; const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2; const wall = rnd() > .5 ? 'brick' : (rnd() > .5 ? 'plaster' : 'plaster2'); const fx = side * FACE, zc = z0 - w / 2;
      box(11.7, h, w, side * (FACE + 6.15), h / 2, zc, wall); box(.3, 3.4, w * .9, fx + side * .15, 1.7, zc, 'dark'); box(.3, .9, w, fx + side * .15, 3.85, zc, wall);
      const nWin = Math.max(2, Math.floor(w / 3)); const spacing = w / nWin; const pierW = Math.max(.3, spacing - 1.7);
      for (let f = 1; f < floors; f++) { const y = f * fh + 1.9; const top = f * fh + 2.9; const next = f === floors - 1 ? h : (f + 1) * fh + .9; box(.3, next - top, w, fx + side * .15, (top + next) / 2, zc, wall);
        for (let k = 0; k <= nWin; k++) { const bz = z0 - spacing * k; const pw = (k === 0 || k === nWin) ? pierW / 2 : pierW; const pz = k === 0 ? bz - pw / 2 : k === nWin ? bz + pw / 2 : bz; box(.3, 2.0, pw, fx + side * .15, y, pz, wall); }
        for (let k = 0; k < nWin; k++) { const z = z0 - spacing * (k + .5); windows.push({ x: fx + side * .24, y, z, ry: ry + Math.PI, lit: rnd() > .45, warm: rnd() > .35 }); box(.36, .14, 1.94, fx - side * .03, y - 1.05, z, 'plaster'); } }
      box(.65, .2, w + .5, fx - side * .15, h - .33, zc, 'plaster');
    };
    let zL = 6, zR = 6, i = 0; while (zL > -72) { const w = 8 + rnd() * 7, f = 3 + Math.floor(rnd() * 4); building(-1, zL, w, f, 1000 + i * 31); zL -= w + .2; i++; } i = 0; while (zR > -72) { const w = 8 + rnd() * 7, f = 3 + Math.floor(rnd() * 4); building(1, zR, w, f, 5000 + i * 17); zR -= w + .2; i++; }
    for (const k in geos) { if (!geos[k].length) continue; const g = mergeGeometries(geos[k].map(x => x.toNonIndexed()), false)!; const m = new THREE.Mesh(g, MAT[k]); m.castShadow = true; m.receiveShadow = true; S.add(m); }
    const g = new THREE.PlaneGeometry(1.4, 1.85); const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: this.curtain, toneMapped: false }), windows.length); const d = new THREE.Object3D(); const c = new THREE.Color();
    windows.forEach((w, i) => { d.position.set(w.x, w.y, w.z); d.rotation.set(0, w.ry, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); if (w.lit) c.setRGB(w.warm ? 2.6 : 1.2, w.warm ? 1.7 : 1.5, w.warm ? .8 : 2.2, THREE.LinearSRGBColorSpace); else c.setRGB(.08, .09, .13, THREE.LinearSRGBColorSpace); im.setColorAt(i, c); });
    im.instanceMatrix.needsUpdate = true; S.add(im); this.windows = im;
  }
  private particles(n: number, color: number, size: number, origin: THREE.Vector3, spread: number): PS {
    const g = new THREE.Group(); const items: PS['items'] = [];
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color, transparent: true, opacity: 0, depthWrite: false })); s.scale.set(size, size, 1); const life = rnd(); s.position.set(origin.x + (rnd() - .5) * spread, origin.y + life * 3, origin.z + (rnd() - .5) * spread); g.add(s); items.push({ s, life }); }
    this.scene.add(g); return { g, items };
  }

  /* ── assets ── */
  private fit(obj: THREE.Object3D, target: number, axis: 'x' | 'y' | 'z') { const b = new THREE.Box3().setFromObject(obj); const s = new THREE.Vector3(); b.getSize(s); const k = target / (s[axis] || 1); obj.scale.multiplyScalar(k); const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y; return k; }
  private prep(root: THREE.Object3D, shadow = true) { root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; } }); return root; }
  private place(name: string, size: number, axis: 'x' | 'y' | 'z', spots: [number, number, number][], y = .16, shadow = true, sf = false) {
    return loadGLTF(sf ? SF(name) : PH(name)).then(g => { if (!g || this.disposed) return; spots.forEach(([x, z, r]) => { const m = this.prep(g.scene.clone(true), shadow); this.fit(m, size, axis); m.position.set(x, y, z); m.rotation.y = r; this.scene.add(m); }); });
  }
  private async loadAssets() {
    const S = this.scene; const pending: Promise<unknown>[] = []; const track = <T,>(p: Promise<T>) => { pending.push(p); return p; };
    this.assetsReady = new Promise<void>(res => { setTimeout(async () => { await Promise.allSettled(pending); this.ready = true; this.readyAt = performance.now(); res(); }, 0); });
    for (const k of ['brick', 'plaster', 'plaster2', 'asphalt', 'cobble', 'wood']) this.swapSurface(k, this.MAT[k]);
    loadHDR(`${ASSET_ROOT}/hdri/moonless_golf_1k.hdr`).then((t: THREE.Texture | null) => { if (!t || this.disposed) return; this.envNight = this.pmrem.fromEquirectangular(t).texture; if (this.mode === 'night') S.environment = this.envNight; });
    loadHDR(`${ASSET_ROOT}/hdri/klippad_sunrise_2_1k.hdr`).then((t: THREE.Texture | null) => { if (!t || this.disposed) return; this.envDawn = this.pmrem.fromEquirectangular(t).texture; if (this.mode !== 'night') S.environment = this.envDawn; });
    // street lamps (Poly Haven) — the light effects hang on the asset's head
    loadGLTF(PH('street_lamp_01')).then(g => { if (!g || this.disposed) return; this.lamps.forEach(l => { const m = this.prep(g.scene.clone(true)); this.fit(m, 3.9, 'y'); m.rotation.y = l.g.position.x < 0 ? Math.PI / 2 : -Math.PI / 2; l.g.add(m); const b = new THREE.Box3().setFromObject(m); const head = new THREE.Vector3(-Math.sign(l.g.position.x) * .35, b.max.y - .35, 0); l.bulb.position.copy(head); l.pl.position.copy(head); if (l.sl) l.sl.position.copy(head); l.cone.position.set(head.x, head.y - 1.85, 0); }); });
    this.place('fire_hydrant', .8, 'y', [[FACE - 1.2, -6, 0]]);
    this.place('metal_trash_can', .9, 'y', [[-FACE + 1.0, -16, .3], [FACE - 1.1, -30, 2.4], [-FACE + 1.1, -44, 1.1]]);
    this.place('water_manhole_cover', .7, 'x', [[2.2, -14, 0]], .01, false);
    loadGLTF(PH('modular_fire_escape')).then(g => { if (!g || this.disposed) return; ([[-1, -18], [1, -34], [-1, -52]] as [number, number][]).forEach(([side, z]) => { const m = this.prep(g.scene.clone(true)); this.fit(m, 9.5, 'y'); m.position.set(side * (FACE + .1), 3.3, z); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; S.add(m); }); });
    this.place('wooden_crate_01', .8, 'x', [[FACE - 1.4, -27.5, .2], [FACE - 1.4, -28.4, 1.1], [FACE - 2.2, -27.9, -.3]]); this.place('wooden_crate_02', 1.15, 'x', [[FACE - 1.5, -26.3, .1]]);
    this.place('wooden_barrels_01', 1.4, 'x', [[-FACE + 1.6, -40.5, .4]]); this.place('painted_wooden_bench', 1.8, 'x', [[-FACE + 1.4, -10, Math.PI / 2]]);
    this.place('outdoor_table_chair_set_01', 1.6, 'x', [[FACE - 1.7, -1.6, .3], [FACE - 1.7, -3.6, -.2]]); this.place('standing_chalkboard_01', .9, 'y', [[FACE - 1.0, -.4, -.6]]);
    this.place('planter_box_01', 1.0, 'x', [[-FACE + 1.0, -13.2, Math.PI / 2], [FACE - 1.0, -21.6, Math.PI / 2]]); this.place('cardboard_box_01', .6, 'x', [[-FACE + 1.9, -16.4, .5], [FACE - 2.0, -30.9, 1.3]]);
    this.place('trashbag', .7, 'x', [[-FACE + 1.5, -16.9, 0], [-FACE + 2.1, -44.6, 2]]); this.place('wooden_ladder', 3.2, 'y', [[-FACE + .35, -58, Math.PI / 2 + .35]], .16);
    this.place('covered_car', 4.4, 'z', [[3.4, -46, .02]], 0);
    // أعمدة الكهرباء (أصل بدل الإجرائيّ)
    loadGLTF(PH('modular_electricity_poles')).then(g => { if (!g || this.disposed) return; [-16, -50, -84].forEach(z => { const m = this.prep(g.scene.clone(true)); this.fit(m, 7.4, 'y'); m.position.set(-7.1, 0, z); m.rotation.y = Math.PI / 2; S.add(m); }); });
    // ديورامة 1930: صناديق وسلّة وصحيفة
    loadGLTF(SF('diorama1930')).then(g => { if (!g || this.disposed) return; const pick = (rx: RegExp) => { let hit: THREE.Object3D | null = null; g.scene.traverse((o: THREE.Object3D) => { if (!hit && rx.test(o.name)) hit = o; }); return hit as THREE.Object3D | null; };
      const put = (o: THREE.Object3D | null, size: number, x: number, z: number, r: number) => { if (!o) return; const m = this.prep(o.clone(true)); this.fit(m, size, 'y'); m.position.set(x, .16, z); m.rotation.y = r; S.add(m); };
      put(pick(/^crate low_7/), .6, FACE - 2.4, -29.2, .6); put(pick(/^crate low2/), .6, -FACE + 2.3, -41.6, 1.9); put(pick(/^kosz/), .9, FACE - 1.2, -41, .2); put(pick(/^Newspaper/), .3, -FACE + 2.2, -9.2, .4); });
    // 🏛️ طقم الواجهات البنّيّة — يستبدل المباني الإجرائيّة كاملةً
    track(loadGLTF(SF('brownstone')).then(g => { if (!g || this.disposed) return; this.buildBrownstoneStreet(g.scene); }));
    // المظلّات والشرفات وحبال الغسيل (أصول)
    loadGLTF(SF('awning')).then(g => { if (!g || this.disposed) return; g.scene.traverse((o: THREE.Object3D) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm && mm.isMeshStandardMaterial) { mm.metalness = 0; mm.roughness = .95; mm.envMapIntensity = .2; mm.color.multiplyScalar(.75); } }); ([[-1, -6.5], [1, -2.6]] as [number, number][]).forEach(([side, z]) => { const m = this.prep(g.scene.clone(true)); this.fit(m, 2.6, 'x'); const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s); m.position.set(side * (FACE - s.z / 2 - .05), 2.9, z); m.rotation.y = side > 0 ? Math.PI : 0; S.add(m); }); });
    loadGLTF(SF('balcony')).then(() => { /* تُوضع بعد الواجهات على الشبابيك المكتشفة فقط (placeBalconies) */ }); if (false) loadGLTF(SF('balcony')).then(g => { if (!g || this.disposed) return; for (let k = 0; k < 8; k++) { const side = k % 2 ? 1 : -1; const m = this.prep(g.scene.clone(true)); const b1 = new THREE.Box3().setFromObject(m); const s1 = new THREE.Vector3(); b1.getSize(s1); const big: 'x' | 'y' | 'z' = s1.x >= s1.y && s1.x >= s1.z ? 'x' : s1.y >= s1.z ? 'y' : 'z'; this.fit(m, 2.4, big); const b2 = new THREE.Box3().setFromObject(m); const s2 = new THREE.Vector3(); b2.getSize(s2); if (s2.x > s2.z) m.rotation.y = Math.PI / 2; /* أنحف محور عمودياً على الواجهة */ const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s); const c = new THREE.Vector3(); b.getCenter(c); m.position.set(side * (FACE - s.x / 2 - .02) - c.x, 5.6 + Math.floor(rnd() * 3) * 3.4 - b.min.y, -4 - k * 8 - rnd() * 3 - c.z); S.add(m); } });
    loadGLTF(SF('clothesline')).then(g => { if (!g || this.disposed) return; ([[-1, -14], [1, -38], [-1, -62]] as [number, number][]).forEach(([side, z], i) => { const m = this.prep(g.scene.clone(true), false); const b1 = new THREE.Box3().setFromObject(m); const s1 = new THREE.Vector3(); b1.getSize(s1); const axis: 'x' | 'y' | 'z' = s1.x >= s1.y && s1.x >= s1.z ? 'x' : s1.y >= s1.z ? 'y' : 'z'; this.fit(m, 3.2, axis); const b = new THREE.Box3().setFromObject(m); const sz = new THREE.Vector3(); b.getSize(sz); const long: 'x' | 'z' = sz.x >= sz.z ? 'x' : 'z'; if (long === 'x') m.rotation.y = Math.PI / 2; const b2 = new THREE.Box3().setFromObject(m); const c = new THREE.Vector3(); b2.getCenter(c); m.position.set(side * (FACE - .9) - c.x, 6.2 + i * 1.5 - b2.min.y, z - c.z); S.add(m); this.laundry.push({ m, ph: rnd() * 6 }); }); });
    // Sketchfab: cars, fedora
    const putCar = (name: string, host: THREE.Group, len: number) => loadGLTF(SF(name)).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene); const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s); const long: 'x' | 'z' = s.x >= s.z ? 'x' : 'z'; this.fit(m, len, long); if (long === 'z') m.rotation.y = Math.PI / 2; const b2 = new THREE.Box3().setFromObject(m); const c = new THREE.Vector3(); b2.getCenter(c); m.position.x -= c.x; m.position.z -= c.z; host.children.slice().forEach(ch => host.remove(ch)); host.add(m); });
    track(putCar('pierce_arrow', this.car, 5.0)); track(putCar('coupe33', this.car2, 4.4));
    loadGLTF(SF('fedoras')).then(g => { if (!g || this.disposed) return; const m = this.prep(g.scene); this.fit(m, .34, 'x'); this.hat.children.filter(c => c.name === 'proc').forEach(c => this.hat.remove(c)); this.hat.add(m); });
    // 👥 الحشد: حركات Mixamo تُعاد توجيهها على هياكل الشخصيّات
    track(this.loadCrowd());
  }
  /**
   * الشرفات على الشبابيك فقط (قرار المالك): تُكشف تجاويف النوافذ بأشعّةٍ من الشارع نحو الواجهة؛
   * حيث يكون الاصطدام أعمق من خطّ الجدار بأكثر من 6سم على امتداد 0.7–2.4م نعدّه شبّاكاً ونعلّق عليه شرفة.
   */
  private lumCache = new Map<THREE.Texture, { ctx: CanvasRenderingContext2D; w: number; h: number } | null>();
  /** إضاءة نقطة القوام عند الاصطدام (النوافذ مرسومة لا مجوّفة في طقم الواجهات: الزجاج داكن) */
  private texLum(hit: THREE.Intersection): number {
    const m = hit.object as THREE.Mesh; const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial; const tex = mat?.map; if (!tex || !hit.uv) return 1;
    let e = this.lumCache.get(tex); if (e === undefined) { try { const img = tex.image as any; const w = Math.min(512, img.width || 512), h = Math.min(512, img.height || 512); const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, w, h); e = { ctx, w, h }; } catch { e = null; } this.lumCache.set(tex, e); }
    if (!e) return 1; const u = ((hit.uv.x % 1) + 1) % 1, v = ((hit.uv.y % 1) + 1) % 1; const px = e.ctx.getImageData(Math.floor(u * (e.w - 1)), Math.floor((tex.flipY ? (1 - v) : v) * (e.h - 1)), 1, 1).data; return (px[0] * .299 + px[1] * .587 + px[2] * .114) / 255;
  }
  private async placeBalconies() {
    const g = await loadGLTF(SF('balcony')); if (!g || this.disposed || !this.facadeGroup) return;
    const ray = new THREE.Raycaster(); const origin = new THREE.Vector3(), dir = new THREE.Vector3(); let placed = 0; const rows = [5.0, 8.4, 11.8];
    for (const side of [-1, 1] as const) {
      for (const y of rows) { let span: number[] = []; const flush = () => { if (span.length >= 2) { const zc = (span[0] + span[span.length - 1]) / 2, wdt = Math.abs(span[0] - span[span.length - 1]) + .35; if (wdt >= .7 && wdt <= 2.4 && rnd() > .45 && placed < 14) { const m = this.prep(g.scene.clone(true)); const b1 = new THREE.Box3().setFromObject(m); const s1 = new THREE.Vector3(); b1.getSize(s1); const big: 'x' | 'y' | 'z' = s1.x >= s1.y && s1.x >= s1.z ? 'x' : s1.y >= s1.z ? 'y' : 'z'; this.fit(m, Math.max(1.4, wdt + .5), big); const b2 = new THREE.Box3().setFromObject(m); const s2 = new THREE.Vector3(); b2.getSize(s2); if (s2.x > s2.z) m.rotation.y = Math.PI / 2; const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s); const c = new THREE.Vector3(); b.getCenter(c); m.position.set(side * (FACE - s.x / 2 - .02) - c.x, y - 1.0 - b.min.y, zc - c.z); this.scene.add(m); placed++; } } span = []; };
        for (let z = 2; z > -98; z -= .35) { origin.set(side * (FACE - 3), y, z); dir.set(side, 0, 0); ray.set(origin, dir); const hit = ray.intersectObject(this.facadeGroup, true)[0]; const depth = hit ? hit.distance - 3 : -1; const dark = hit ? this.texLum(hit) < .2 : false; if ((depth > .06 && depth < 1.2) || (dark && depth > -.3 && depth < 1.2)) span.push(z); else flush(); } flush(); }
    }
    console.info('🏛️ balconies on windows:', placed);
  }
  /** يضع قطع الطقم على الجانبين حتى نهاية الشارع، بمقياسٍ موحّد (ارتفاع 13–19م) ووجهها إلى الشارع */
  /** الوجه الأماميّ للقطعة: الاتّجاه الأفقيّ الذي تتجمّع فيه أكبر مساحة أوجهٍ (الواجهة المفصّلة لا الظهر) */
  private frontDir(obj: THREE.Object3D): THREE.Vector3 {
    obj.updateMatrixWorld(true); const acc: Record<string, number> = { px: 0, nx: 0, pz: 0, nz: 0 }; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    obj.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry; const pos = g.attributes.position; if (!pos) return; const idx = g.index; const tri = idx ? idx.count / 3 : pos.count / 3;
      for (let i = 0; i < tri; i++) { const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2; a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld); e.subVectors(c, a); n.subVectors(b, a).cross(e); const area = n.length() / 2; if (area === 0) continue; n.divideScalar(area * 2); if (Math.abs(n.y) > .6) continue; const wgt = 1 + Math.min(area, .5); /* عدد الأوجه (التفصيل) لا المساحة: الجدران الجانبيّة الصمّاء كانت تخدع القياس */ if (Math.abs(n.x) > Math.abs(n.z)) { if (n.x > 0) acc.px += wgt; else acc.nx += wgt; } else { if (n.z > 0) acc.pz += wgt; else acc.nz += wgt; } } });
    // تباين القوام على كلّ وجه: الواجهة الحقيقيّة (نوافذ وأبواب) متباينة، والظهر الأصمّ مسطّح
    const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size); const ctr = new THREE.Vector3(); box.getCenter(ctr); const ray = new THREE.Raycaster();
    const variance = (dirKey: string) => { const d = dirKey === 'px' ? new THREE.Vector3(-1, 0, 0) : dirKey === 'nx' ? new THREE.Vector3(1, 0, 0) : dirKey === 'pz' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1); const vals: number[] = [];
      for (const fy of [.3, .55, .8]) for (let i = 0; i < 14; i++) { const t = (i + .5) / 14; const o = new THREE.Vector3(); if (dirKey === 'px' || dirKey === 'nx') o.set(dirKey === 'px' ? box.max.x + 2 : box.min.x - 2, box.min.y + size.y * fy, box.min.z + size.z * t); else o.set(box.min.x + size.x * t, box.min.y + size.y * fy, dirKey === 'pz' ? box.max.z + 2 : box.min.z - 2); ray.set(o, d); const hit = ray.intersectObject(obj, true)[0]; if (hit) vals.push(this.texLum(hit)); }
      if (vals.length < 6) return 0; const mean = vals.reduce((a2, b2) => a2 + b2, 0) / vals.length; return vals.reduce((a2, b2) => a2 + (b2 - mean) ** 2, 0) / vals.length; };
    const score: Record<string, number> = {}; for (const k of Object.keys(acc)) score[k] = variance(k) * 1000 + acc[k] * .001;
    const best = Object.entries(score).sort((p, q) => q[1] - p[1])[0][0]; return best === 'px' ? new THREE.Vector3(1, 0, 0) : best === 'nx' ? new THREE.Vector3(-1, 0, 0) : best === 'pz' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
  }
  private buildBrownstoneStreet(src: THREE.Object3D) {
    const rootNode = src.getObjectByName('RootNode') || src; const pieces: THREE.Object3D[] = rootNode.children.filter(o => /^Brownstone_/.test(o.name) && !/Commercial|Complex/.test(o.name)); // القطع العليا فقط (لا العُقد الفرعيّة)
    if (!pieces.length) return; seed = 4242; const shuffled = pieces.slice().sort(() => rnd() - .5);
    const group = new THREE.Group(); let idx = 0;
    ([-1, 1] as const).forEach(side => { let z = 6; let guard = 0; while (z > -100 && guard++ < 60) { const piece = shuffled[idx++ % shuffled.length]; const w = new THREE.Group(); const m = this.prep(piece.clone(true)); w.add(m);
      // 1) الوجه الأماميّ (بالمساحة) يُدار ليواجه الشارع: يسار الشارع يواجه +x، يمينه −x
      const f = this.frontDir(w); const want = new THREE.Vector3(-side, 0, 0); const ang = Math.atan2(want.x, want.z) - Math.atan2(f.x, f.z); w.rotation.y = ang * this.frontSign;
      // 2) مقياسٌ موحّد بالارتفاع، ثمّ الإرساء على خطّ الواجهة والأرض
      const h = 13 + rnd() * 6; this.fit(w, h, 'y'); const b = new THREE.Box3().setFromObject(w); const sz = new THREE.Vector3(); b.getSize(sz); const width = sz.z; if (!isFinite(width) || width < 2 || width > 42) { console.warn('🏛️ piece skipped', piece.name, sz.toArray().map(v => +v.toFixed(1))); continue; }
      const nearX = side > 0 ? b.min.x : b.max.x; w.position.x += side * FACE - nearX; w.position.z += (z - width / 2) - (b.max.z + b.min.z) / 2; w.position.y -= b.min.y;
      console.info('🏛️ piece', piece.name, 'size', sz.toArray().map(v => +v.toFixed(1)).join('x'), 'front', f.toArray().join(','), 'side', side, 'z', z.toFixed(1));
      group.add(w); z -= width + .25; } });
    // سدّ نهاية الشارع: قطعة عريضة تواجه الكاميرا عند z=-104 (كان فراغاً أسود)
    { const piece = shuffled.find(p => /FlatFacade_9|Lowrise|Classic/.test(p.name)) || shuffled[0]; const w = new THREE.Group(); w.add(this.prep(piece.clone(true))); const f = this.frontDir(w); w.rotation.y = Math.atan2(0, 1) - Math.atan2(f.x, f.z); this.fit(w, 17, 'y'); const b = new THREE.Box3().setFromObject(w); const sz = new THREE.Vector3(); b.getSize(sz); const k = Math.max(1, 26 / Math.max(sz.x, 1)); w.scale.x *= k; const b2 = new THREE.Box3().setFromObject(w); w.position.x -= (b2.max.x + b2.min.x) / 2; w.position.z += -104 - b2.max.z; w.position.y -= b2.min.y; group.add(w); }
    this.scene.add(group); this.facadeGroup = group; this.scene.remove(this.proc); this.proc.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    // الشرفات: نوافذ الطقم مرسومة لا مجوّفة، ولا مرساة موثوقة لها → لا تُوضع شرفات منفصلة (قاعدة المالك: على الشبابيك فقط)
    if (debugParam('balconies') === '1') this.placeBalconies();
    // نيون فوق بعض الواجهات (قوام مضيء على لوح — تأثير لا شكل هندسيّ)
    const neonColors = ['#ff3fa4', '#4ad2ff', '#ffb347', '#7dff9a']; const names = ['TRATTORIA', 'BARBIERE', 'CAFFÈ', 'HOTEL'];
    names.forEach((nm, i) => { const side = i % 2 ? 1 : -1; const col = neonColors[i]; const mat = new THREE.MeshBasicMaterial({ map: texNeon(nm, col), transparent: true, toneMapped: false, color: new THREE.Color(col).multiplyScalar(2.2), side: THREE.DoubleSide, depthWrite: false }); const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), mat); m.position.set(side * (FACE - .4), 4.8 + rnd(), -6 - i * 15); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; this.scene.add(m); const light = new THREE.PointLight(col, 4, 7, 2); light.position.set(side * (FACE - .9), m.position.y, m.position.z); this.scene.add(light); this.neons.push({ mesh: m, light, base: mat.color.clone(), broken: i === 1, on: this.mode === 'night' }); });
  }

  /* ── crowd & animation ── */
  private boneTreeFromNodes(root: THREE.Object3D): THREE.Bone | null {
    let hips: THREE.Object3D | null = null; root.traverse(o => { if (!hips && /^mixamorig:?Hips$/.test(o.name)) hips = o; }); if (!hips) { console.warn('🏙️ mixamo hips not found'); return null; }
    const conv = (o: THREE.Object3D): THREE.Bone => { const b = new THREE.Bone(); b.name = o.name; b.position.copy(o.position); b.quaternion.copy(o.quaternion); b.scale.copy(o.scale); o.children.forEach(c => b.add(conv(c))); return b; };
    return conv(hips);
  }
  /**
   * إعادة توجيه حركةٍ من هيكل Mixamo إلى هيكل الشخصيّة بنقل الدوران العالميّ مع إزاحة وضعيّة الراحة
   * (كلا الهيكلين في وضعيّة T): Wt(t) = Ws(t)·O حيث O = Ws0⁻¹·Wt0، ثمّ يُحوَّل إلى دورانٍ محلّيّ هرميّاً.
   * لا تُلمس مصفوفات الربط ولا يُستدعى pose() (SkeletonUtils.retarget كان يُفسد الجلد).
   */
  private retargetLocal(target: THREE.SkinnedMesh, srcHips: THREE.Bone, clip: THREE.AnimationClip, names: Record<string, string>): THREE.AnimationClip {
    const fps = 30, n = Math.max(2, Math.round(clip.duration * fps)); const times = new Float32Array(n); for (let i = 0; i < n; i++) times[i] = i / fps;
    // ترتيب هرميّ لعظام الهدف (من الجذر إلى الأطراف)
    const bones = target.skeleton.bones; const set = new Set<THREE.Object3D>(bones); const roots = bones.filter(b => !b.parent || !set.has(b.parent)); const ordered: THREE.Bone[] = []; const walk = (b: THREE.Object3D) => { if (set.has(b)) ordered.push(b as THREE.Bone); b.children.forEach(walk); }; roots.forEach(walk);
    // وضعيّة الراحة (كما حُمِّلت): دوران عالميّ لكلّ عظمة هدف ومصدر
    target.updateMatrixWorld(true); srcHips.updateMatrixWorld(true);
    const restLocal = new Map<THREE.Bone, THREE.Quaternion>(), restWorld = new Map<THREE.Bone, THREE.Quaternion>(); ordered.forEach(b => { restLocal.set(b, b.quaternion.clone()); restWorld.set(b, b.getWorldQuaternion(new THREE.Quaternion())); });
    const srcByName = new Map<string, THREE.Bone>(); srcHips.traverse(o => { if ((o as THREE.Bone).isBone) srcByName.set(o.name, o as THREE.Bone); });
    const srcRestWorld = new Map<string, THREE.Quaternion>(); srcByName.forEach((b, k) => srcRestWorld.set(k, b.getWorldQuaternion(new THREE.Quaternion())));
    const offset = new Map<THREE.Bone, THREE.Quaternion>(); ordered.forEach(b => { const sn = names[b.name]; if (!sn || !srcByName.has(sn)) return; offset.set(b, srcRestWorld.get(sn)!.clone().invert().multiply(restWorld.get(b)!)); });
    // تشغيل المصدر إطاراً إطاراً وتجميع الدورانات المحلّيّة للهدف
    const mixer = new THREE.AnimationMixer(srcHips); const action = mixer.clipAction(clip); action.play(); mixer.update(0);
    const out = new Map<THREE.Bone, Float32Array>(); ordered.forEach(b => out.set(b, new Float32Array(n * 4)));
    const parentWorldOf = (b: THREE.Bone, worldNow: Map<THREE.Bone, THREE.Quaternion>): THREE.Quaternion => { const p = b.parent as THREE.Object3D | null; if (p && set.has(p) && worldNow.has(p as THREE.Bone)) return worldNow.get(p as THREE.Bone)!; return p ? p.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(); };
    const q = new THREE.Quaternion(), qs = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      mixer.setTime(i / fps); srcHips.updateMatrixWorld(true); const worldNow = new Map<THREE.Bone, THREE.Quaternion>();
      for (const b of ordered) { const pw = parentWorldOf(b, worldNow); const sn = names[b.name]; let local: THREE.Quaternion;
        if (sn && srcByName.has(sn)) { srcByName.get(sn)!.getWorldQuaternion(qs); q.copy(qs).multiply(offset.get(b)!); local = pw.clone().invert().multiply(q); } else local = restLocal.get(b)!.clone();
        worldNow.set(b, pw.clone().multiply(local)); const arr = out.get(b)!; arr[i * 4] = local.x; arr[i * 4 + 1] = local.y; arr[i * 4 + 2] = local.z; arr[i * 4 + 3] = local.w; }
    }
    action.stop(); mixer.uncacheRoot(srcHips);
    const tracks: THREE.KeyframeTrack[] = []; ordered.forEach(b => { if (!offset.has(b)) return; tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, out.get(b)!)); });
    return new THREE.AnimationClip(clip.name, n / fps, tracks);
  }
  private async loadCrowd() {
    const [idle, walk, smoke, sit] = await Promise.all(['neutral_idle', 'walking', 'smoking', 'sitting'].map(n => loadGLTF(ANIM(n))));
    if (this.disposed) return;
    const clips: Record<string, THREE.AnimationClip> = {}; let skelRoot: THREE.Bone | null = null;
    for (const [k, g] of [['idle', idle], ['walk', walk], ['smoke', smoke], ['sit', sit]] as [string, any][]) { if (!g) continue; if (g.animations?.[0]) clips[k] = g.animations[0]; if (!skelRoot) skelRoot = this.boneTreeFromNodes(g.scene); }
    const skeleton = skelRoot; this.clipsMixamo = clips;
    const specs: { src: string; glb?: boolean; n: number; kinds: Walker['kind'][]; night: boolean[]; day: boolean[]; sides: (1 | -1)[]; zs: number[]; h: number }[] = [
      { src: 'gangster', n: 3, kinds: ['lamp', 'walk', 'idle'], night: [true, true, false], day: [true, true, true], sides: [-1, 1, -1], zs: [-3.2, -20, -50], h: 1.85 },
      { src: 'dotty', n: 2, kinds: ['walk', 'idle'], night: [false, true], day: [true, true], sides: [1, -1], zs: [-38, -12], h: 1.7 },
      { src: 'moneyman', glb: true, n: 1, kinds: ['seat'], night: [true], day: [true], sides: [1], zs: [-2.6], h: 1.35 },
    ];
    for (const sp of specs) {
      const g = await loadGLTF(sp.glb ? SFB(sp.src) : SF(sp.src)); if (!g || this.disposed) continue;
      for (let i = 0; i < sp.n; i++) {
        const root = SkeletonUtils.clone(g.scene); this.prep(root, i === 0); root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
        const wrap = new THREE.Group(); wrap.add(root); this.fit(wrap, sp.h, 'y');
        const w: Walker = { root: wrap, groundY: wrap.position.y + .16 /* سطح الرصيف */, mixer: null, acts: {}, cur: '', kind: sp.kinds[i], side: sp.sides[i], z: sp.zs[i], dir: i % 2 ? 1 : -1, speed: .9 + rnd() * .4, pause: 0, night: sp.night[i], day: sp.day[i], gait: null };
        let skinned: THREE.SkinnedMesh | null = null; root.traverse(o => { if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
        if (skinned && skeleton && sp.kinds[i] !== 'seat') {
          try {
            const names: Record<string, string> = {}; (skinned as THREE.SkinnedMesh).skeleton.bones.forEach(b => { const base = b.name.replace(/_\d+$/, ''); if (AS_TO_MIXAMO[base]) names[b.name] = 'mixamorig' + AS_TO_MIXAMO[base]; });
            w.mixer = new THREE.AnimationMixer(root);
            for (const k of Object.keys(clips)) { const rc = this.retargetLocal(skinned, skeleton, clips[k], names); w.acts[k] = w.mixer.clipAction(rc); }
            console.info('🏙️ retarget', sp.src, Object.keys(w.acts).join(','), 'tracks', Object.values(w.acts).map(a => a.getClip().tracks.length).join('/'), 'mapped', Object.keys(names).length);
            if (!Object.keys(w.acts).length) w.mixer = null;
          } catch (e) { console.warn('🏙️ retarget failed, procedural gait:', sp.src, String(e)); w.mixer = null; }
        }
        if (!w.mixer && skinned) { const find = (rx: RegExp) => { const out: THREE.Object3D[] = []; (skinned as THREE.SkinnedMesh).skeleton.bones.forEach(b => { if (rx.test(b.name)) out.push(b); }); return out; }; w.gait = { hips: find(/^Hip_[RL]/), knees: find(/^Knee_[RL]/), arms: find(/^Shoulder_[RL]/) }; }
        this.scene.add(wrap); this.walkers.push(w); if (w.kind === 'lamp') this.figLamp = w;
      }
    }
    this.applyCrowdMode();
  }
  private playW(w: Walker, k: string) { if (!w.mixer || w.cur === k) return; const a = w.acts[k] || w.acts.idle; if (!a) return; const prev = w.acts[w.cur]; if (prev && prev !== a) prev.fadeOut(.5); a.reset().fadeIn(.5).play(); w.mixer.update(0.001); w.cur = k; }
  private applyCrowdMode() {
    const night = this.mode === 'night';
    this.walkers.forEach(w => { w.root.visible = night ? w.night : w.day; if (!w.root.visible) return;
      if (w.kind === 'seat') { w.root.position.set(FACE - 1.3, .16 + w.groundY, w.z); w.root.rotation.y = Math.PI * .85; return; }
      if (w.kind === 'lamp' && night) { w.root.position.set(-FACE + 1.9, w.groundY, w.z); w.root.rotation.y = .6; this.playW(w, 'smoke'); return; }
      if (w.kind === 'idle' && night) { w.root.position.set(w.side * (FACE - 1.1), w.groundY, w.z); w.root.rotation.y = w.side > 0 ? Math.PI / 2 : -Math.PI / 2; this.playW(w, 'idle'); return; }
      w.root.position.set(w.side * (FACE - 1.4), w.groundY, w.z); w.root.rotation.y = w.dir > 0 ? 0 : Math.PI; this.playW(w, 'walk'); w.kind = w.kind === 'lamp' || w.kind === 'idle' ? 'walk' : w.kind; });
    this.ember.visible = night && !!this.figLamp?.root.visible;
  }
  private updateCrowd(dt: number, time: number) {
    this.walkers.forEach(w => { if (!w.root.visible) return; w.mixer?.update(dt);
      if (w.kind === 'walk') {
        if (w.pause > 0) { w.pause -= dt; this.playW(w, 'idle'); if (w.pause <= 0) this.playW(w, 'walk'); }
        else { if (rnd() < dt * .03) w.pause = 2 + rnd() * 4; w.z += w.dir * w.speed * dt; if (w.z > 2) w.dir = -1; if (w.z < -66) w.dir = 1; w.root.position.z = w.z; w.root.rotation.y += ((w.dir > 0 ? 0 : Math.PI) - w.root.rotation.y) * .1; if (w.mixer && w.acts.walk) w.acts.walk.timeScale = w.speed / 1.25;
          if (w.gait) { const s = Math.sin(time * 6 * w.speed); w.gait.hips.forEach((b, i) => b.rotation.x = (i ? -s : s) * .5); w.gait.knees.forEach((b, i) => b.rotation.x = Math.max(0, (i ? s : -s)) * .7); w.gait.arms.forEach((b, i) => b.rotation.x = (i ? s : -s) * .35); } }
      }
      if (w === this.figLamp && this.mode === 'night') { const B = w.root; if (!w.mixer) B.position.y = w.groundY + Math.sin(time * 1.3) * .012; if (this.gestureT >= 0) { this.gestureT += dt; const g = Math.sin(Math.min(1, this.gestureT / 3.2) * Math.PI); B.rotation.y = .6 + g * (this.gestureKind === 'shush' ? -.5 : .8); if (this.gestureT > 3.2) { this.gestureT = -1; B.rotation.y = .6; } } }
    });
  }

  /* ── post ── */
  private buildPost() {
    const w = 1280, h = 720; this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 8, aperture: .00018, maxblur: .011 }); this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .55, .65, .86); this.composer.addPass(this.bloom);
    this.film = new FilmPass(.09, false); this.composer.addPass(this.film);
    this.vig = new ShaderPass(VignetteShader); this.vig.uniforms.offset.value = .92; this.vig.uniforms.darkness.value = 1.15; this.composer.addPass(this.vig);
    this.composer.addPass(new OutputPass()); this.smaa = new SMAAPass(w, h); this.composer.addPass(this.smaa);
  }
  onQuality: ((q: Quality) => void) | null = null; manualQuality = false;
  setQuality(q: Quality) { this.quality = q; this.applyQuality(); this.onQuality?.(q); }
  private applyQuality() {
    const hi = this.quality === 'high' && !this.ambient, md = this.quality === 'med' || (this.quality === 'high' && this.ambient); this.renderer.setPixelRatio(hi ? Math.min(devicePixelRatio, 1.5) : md ? 1 : .75);
    this.bokeh.enabled = hi; this.bloom.enabled = hi || md; this.film.enabled = hi || md; this.smaa.enabled = hi || md; this.renderer.shadowMap.enabled = hi || md; this.lamps.forEach(l => { if (l.sl) l.sl.castShadow = hi; }); this.reflector.visible = hi; this.makeRain(hi ? 1800 : md ? 900 : 0); this.resize();
  }
  private makeRain(count: number) {
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; } if (!count) return;
    const pos = new Float32Array(count * 6); for (let i = 0; i < count; i++) { const x = (rnd() - .5) * 40, y = rnd() * 24, z = (rnd() - .5) * 60 - 10; pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x + .04; pos[i * 6 + 4] = y - .5; pos[i * 6 + 5] = z; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c8, transparent: true, opacity: .28 * this.to.rain })); this.rain.userData.count = count; this.scene.add(this.rain);
  }
  private resize() {
    const el = this.container; if (!el) return; const w = Math.max(2, el.clientWidth), h = Math.max(2, el.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; if (this.frameShift) this.camera.setViewOffset(w, h, -this.frameShift * w, 0, w, h); else this.camera.clearViewOffset(); this.camera.updateProjectionMatrix(); this.composer.setSize(w, h); this.bloom.setSize(w, h); this.smaa.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    if (this.active) this.composer.render(0); // لا إطارَ أسود عند تغيّر القياس
  }
  /** إزاحة الإطار (0 = مركز، .17 = المشهد في الثلثين الأيسرين والبطاقة يميناً) */
  setFrameShift(f: number) { if (this.frameShift === f) return; this.frameShift = f; this.resize(); }

  /* ── public API ── */
  mount(el: HTMLElement) {
    if (!this.ok || this.disposed) return; if (this.disposeTimer) { clearTimeout(this.disposeTimer); this.disposeTimer = null; }
    if (this.container && this.container !== el) this.unmountDom();
    this.container = el; el.appendChild(this.renderer.domElement);
    if (!this.dipEl) { this.dipEl = document.createElement('div'); this.dipEl.style.cssText = 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .28s ease'; }
    el.appendChild(this.dipEl); this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); this.resize();
    if (!this.raf) { this.clock.start(); this.loop(); }
  }
  private unmountDom() { this.ro?.disconnect(); this.ro = null; if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement); if (this.dipEl?.parentElement) this.dipEl.parentElement.removeChild(this.dipEl); this.container = null; }
  unmount() { this.unmountDom(); if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } this.disposeTimer = setTimeout(() => this.dispose(), DISPOSE_AFTER_MS); }
  /** إيقاف الرسم مع بقاء اللوحة (المراحل التي تُخفي المدينة) */
  setActive(on: boolean) { this.active = on; }
  setAmbient(on: boolean) { if (this.ambient === on) return; this.ambient = on; this.applyQuality(); }
  dispose() { if (this.disposed) return; this.disposed = true; this.unmountDom(); if (this.raf) cancelAnimationFrame(this.raf); this.renderer.dispose(); this.pmrem.dispose(); if (engine === this) engine = null; }
  /** الليل ← الفجر ← النهار: الإضاءة تتحوّل داخل اللقطة الجارية بلا قطع */
  setMode(m: StreetMode, opts?: { instant?: boolean }) {
    if (m === this.mode) return; const prevMode = this.mode; this.mode = m; this.dusk = false; this.transMarkAt = performance.now(); this.transPending = true;
    const target = m === 'night' ? this.NIGHT : m === 'dawn' ? this.DAWN : this.DAY; this.from = this.snapshot(); this.to = target; this.transT = opts?.instant ? 1 : 0; this.transStart = performance.now(); this.transMs = m === 'dawn' && prevMode === 'night' ? 8000 : 4000;
    if (opts?.instant) this.applyPreset(target);
    if (m === 'night') { this.hat.visible = false; this.evShot = null; this.cut('A'); } else if (m === 'dawn' && prevMode === 'night') { this.evShot = 'DAWN'; this.shotT = 0; }
    this.applyCrowdMode(); this.scene.environment = m === 'night' ? this.envNight : this.envDawn;
  }
  private snapshot(): Preset { const f = this.scene.fog as THREE.FogExp2; return { top: (this.skyMat.uniforms.top.value as THREE.Color).clone(), hor: (this.skyMat.uniforms.hor.value as THREE.Color).clone(), fog: f.color.clone(), fd: f.density, hemi: this.hemi.intensity, hemiC: this.hemi.color.clone(), exp: this.renderer.toneMappingExposure, sun: this.skyMat.uniforms.sunI.value as number, lamps: this.lamps[0]?.on ?? 1, rain: this.rain ? (this.rain.material as THREE.LineBasicMaterial).opacity / .28 : 0 }; }
  private applyPreset(P: Preset) { this.lerpPreset(this.from = P, P, 1); }
  private lerpPreset(A: Preset, B: Preset, k: number) {
    const e = k * k * (3 - 2 * k), S = this.scene, f = S.fog as THREE.FogExp2;
    (this.skyMat.uniforms.top.value as THREE.Color).copy(A.top).lerp(B.top, e); (this.skyMat.uniforms.hor.value as THREE.Color).copy(A.hor).lerp(B.hor, e); f.color.copy(A.fog).lerp(B.fog, e); f.density = A.fd + (B.fd - A.fd) * e; this.hemi.intensity = A.hemi + (B.hemi - A.hemi) * e; this.hemi.color.copy(A.hemiC).lerp(B.hemiC, e); this.renderer.toneMappingExposure = A.exp + (B.exp - A.exp) * e;
    const sun = A.sun + (B.sun - A.sun) * e; (this.stars.material as THREE.PointsMaterial).opacity = .75 * (1 - sun); this.moon.material.opacity = .9 * (1 - sun) * (B === this.DAY ? 0 : 1); this.sun.position.y = -16 + sun * 34; this.sun.visible = sun > .02 && B !== this.DAY; (this.skyMat.uniforms.sunDir.value as THREE.Vector3).set(95, Math.max(4, this.sun.position.y), -34); this.skyMat.uniforms.sunI.value = sun * (B === this.DAY ? .3 : 1); this.sunLight.intensity = sun * 1.3;
    this.shafts.children.forEach((m, i) => { ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = sun * .06 * (1 - i * .06) * (B === this.DAY ? 0 : 1); }); this.shafts.position.y = 6 + sun * 6; (this.skyline.material as THREE.MeshBasicMaterial).opacity = 1 - sun * .6;
    const lamps = A.lamps + (B.lamps - A.lamps) * e; this.lamps.forEach((l, i) => { const off = Math.min(1, Math.max(0, ((1 - lamps) - .25 - (5 - i) * .08) * 4)); l.on = lamps >= .99 ? 1 : lamps <= .01 ? 0 : 1 - off; }); this.neons.forEach(n => { n.on = lamps > .4; });
    if (this.rain) (this.rain.material as THREE.LineBasicMaterial).opacity = .28 * (A.rain + (B.rain - A.rain) * e);
  }
  fireEvent(k: StreetEvent) {
    this.evShot = k; this.shotT = 0; this.dip(250);
    this.gestureT = 0; this.gestureKind = k === 'SILENCE' ? 'shush' : 'react';
    if (k === 'KILL') { this.ev.kill = .001; this.hat.visible = true; this.hat.position.set(-FACE + 1.7, 5.4, -4.2); this.hat.rotation.set(0, 0, 0); }
    if (k === 'SAVED') this.ev.saved = .001; if (k === 'SILENCE') this.ev.silence = .001; if (k === 'DISABLE') { this.ev.disable = .001; this.purple.items.forEach(i => (i.life = rnd())); } if (k === 'SNIPE') { this.ev.snipe = .001; this.pigeons.forEach(p => (p.t = 0)); }
  }
  /** غطسة سوداء قصيرة يملكها المحرّك (لا حالة React) */
  private dip(ms: number) { if (!this.dipEl) return; this.dipEl.style.opacity = '1'; setTimeout(() => { if (this.dipEl) this.dipEl.style.opacity = '0'; }, ms); }
  /** قطعٌ محروس: يُصفَّر العدّاد فوراً ولا يُقبل قطعٌ آخر أثناء الغطسة (كان يُستدعى كلّ إطار فيومض) */
  private cut(name: string) { if (this.cutting) return; this.cutting = true; this.cur = name; this.shotT = 0; this.dip(260); setTimeout(() => { this.cutting = false; }, 300); }
  /**
   * 🔥 الإحماء (خطّة الإحماء 2026-09-12): بعد اكتمال الأصول يُجمَّع تظليل كلّ وضعٍ ويُرسم إطارٌ مخفيّ له خارج الشاشة
   * (ليل/فجر/نهار) فتُرفع القوام كلّها إلى البطاقة، وتُلتقط صورة 1280×720 لكلّ وضع تبقى في الذاكرة.
   * النتيجة: أوّل ليلٍ يبدأ في الإطار نفسه، والملصق جاهزٌ بلا التقاطٍ أثناء اللعب.
   */
  async prewarm() {
    if (this.disposed || !this.ok) return; const t0 = performance.now();
    const rt = new THREE.WebGLRenderTarget(1280, 720); const saved = { from: this.from, to: this.to, t: this.transT, mode: this.mode, active: this.active };
    const buf = new Uint8Array(1280 * 720 * 4); const cvs = document.createElement('canvas'); cvs.width = 1280; cvs.height = 720; const ctx = cvs.getContext('2d')!;
    for (const [m, P] of [['night', this.NIGHT], ['dawn', this.DAWN], ['day', this.DAY]] as [StreetMode, Preset][]) {
      this.mode = m; this.applyPreset(P); this.applyCrowdMode(); this.lamps.forEach(l => { l.cone.visible = true; }); this.scene.environment = m === 'night' ? this.envNight : this.envDawn;
      try { await (this.renderer as any).compileAsync(this.scene, this.camera); } catch { /* noop */ }
      this.renderer.shadowMap.needsUpdate = true; this.renderer.setRenderTarget(rt); this.renderer.render(this.scene, this.camera); this.renderer.setRenderTarget(null);
      try { this.renderer.readRenderTargetPixels(rt, 0, 0, 1280, 720, buf); const img = ctx.createImageData(1280, 720); for (let y = 0; y < 720; y++) img.data.set(buf.subarray((719 - y) * 1280 * 4, (720 - y) * 1280 * 4), y * 1280 * 4); ctx.putImageData(img, 0, 0); this.posters[m] = cvs.toDataURL('image/jpeg', .82); } catch { /* noop */ }
      if (this.disposed) return;
    }
    rt.dispose(); this.mode = saved.mode; this.from = saved.from; this.to = saved.to; this.transT = saved.t; this.lerpPreset(this.from, this.to, this.transT); this.applyCrowdMode(); this.scene.environment = this.mode === 'night' ? this.envNight : this.envDawn;
    this.prewarmDone = true; this.prewarmMs = Math.round(performance.now() - t0); console.info('🔥 prewarm', this.prewarmMs, 'ms');
  }
  /** الغسق (تلميح الموجّه): يهبط الضوء نحو الليل بمقدار 45% خلال ثانيتين، ويعود إن أُلغي */
  setDusk(on: boolean) {
    if (this.dusk === on || this.mode !== 'day') return; this.dusk = on; const D = this.DAY, N = this.NIGHT;
    const mix = (k: number): Preset => ({ top: D.top.clone().lerp(N.top, k), hor: D.hor.clone().lerp(N.hor, k), fog: D.fog.clone().lerp(N.fog, k), fd: D.fd + (N.fd - D.fd) * k, hemi: D.hemi + (N.hemi - D.hemi) * k, hemiC: D.hemiC.clone().lerp(N.hemiC, k), exp: D.exp + (N.exp - D.exp) * k, sun: D.sun * (1 - k), lamps: k > .3 ? 1 : 0, rain: k });
    this.from = this.snapshot(); this.to = on ? mix(.45) : this.DAY; this.transT = 0; this.transStart = performance.now(); this.transMs = on ? 2000 : 1000;
  }
  /** يلتقط الإطار التالي كصورة (ملصق الأجهزة الضعيفة) */
  async capturePoster(): Promise<string> { await this.assetsReady; if (this.disposed) return ''; if (this.posters[this.mode]) return this.posters[this.mode]!; this.transT = 1; this.applyPreset(this.to); this.applyCrowdMode(); return new Promise(res => { this.posterCb = res; }); }

  /* ── loop ── */
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop); if (!this.container || !this.active) return;
    // ⏱️ سقف 30 إطاراً في كلّ الأوضاع (تجربة سينمائيّة لا لعبة): يوفّر الحرارة ويثبّت الإيقاع
    const nowTs = performance.now(); if (nowTs - this.lastFrameAt < 30) return; this.lastFrameAt = nowTs; this.frameIndex++;
    const dtRaw = Math.min(.5, this.clock.getDelta()), dt = Math.min(.05, dtRaw), time = this.clock.elapsedTime; const ev = this.ev; if (dtRaw > 0) this.fpsEma += ((1 / dtRaw) - this.fpsEma) * .08; this.lastTris = this.renderer.info.render.triangles; this.lastCalls = this.renderer.info.render.calls; this.renderer.info.reset();
    // 🧪 فحص الإطارات بعد اكتمال الأصول بثانيتين (لا أثناء التحميل)، نافذة 4 ثوانٍ؛ 30 إطاراً كافية (تجربة سينمائيّة لا لعبة)
    if (!this.probe.done && !this.manualQuality && this.ready && performance.now() - this.readyAt > 2000) { this.probe.frames++; this.probe.t += dtRaw; if (this.probe.t >= 4) { this.probe.done = true; const fps = this.probe.frames / this.probe.t; console.info('🧪 fps probe', fps.toFixed(1)); if (fps < 18) this.setQuality('low'); else if (fps < 30 && this.quality === 'high') this.setQuality('med'); } }
    if (this.transT < 1) { this.transT = Math.min(1, (performance.now() - this.transStart) / this.transMs); this.lerpPreset(this.from, this.to, this.transT); }
    const dim = ev.silence > 0 ? (ev.silence < 2 ? .6 : 1) : 1;
    this.lamps.forEach((l, i) => { let f = 1; if (i === 0) { if (ev.kill > 0) { const k = ev.kill; f = k < 1.2 ? (Math.sin(k * 40) > 0.2 ? 1 : .15) : k < 1.8 ? .6 : 0; } if (ev.saved > 0) f = 1 + Math.min(1.2, ev.saved * 1.5) * Math.max(0, 1 - (ev.saved - 1.5) * .7); }
      const flick = 1 - (i === 2 ? .06 * (.5 + .5 * Math.sin(time * 7.3 + l.flick)) * (.5 + .5 * Math.sin(time * 2.1)) : 0); const I = l.on * f * flick * dim; l.pl.intensity = 18 * I; if (l.sl) l.sl.intensity = 36 * I; (l.bulb.material as THREE.MeshBasicMaterial).color.setRGB(3 * I, 2.3 * I, 1.4 * I, THREE.LinearSRGBColorSpace); (l.cone.material as THREE.ShaderMaterial).uniforms.uI.value = .55 * I; l.cone.visible = I > .01; });
    this.neons.forEach(n => { let on = n.on && !(ev.silence > 0 && ev.silence < 2.2); if (n.broken && on) { const cyc = time % 9; on = !(cyc > 6.2 && cyc < 6.9 && Math.sin(time * 31) > 0); } (n.mesh.material as THREE.MeshBasicMaterial).color.copy(n.base).multiplyScalar(on ? 1 : .06); n.light.intensity = on ? 4 : 0; });
    if (ev.kill > 0) { ev.kill += dt; this.hatLight.intensity = ev.kill < 7 ? 1.6 : 0; const h = this.hat; if (h.visible && h.position.y > .18) { h.position.y -= dt * (2.5 + (5.4 - h.position.y) * 1.5); h.rotation.x += dt * 4; h.rotation.z += dt * 2; if (h.position.y <= .18) { h.position.y = .18; h.rotation.set(.1, 0, .05); } } if (ev.kill > 8) { ev.kill = 0; this.hatLight.intensity = 0; } }
    if (ev.saved > 0) { ev.saved += dt; this.ember.visible = ev.saved < 2.5 && this.mode === 'night'; if (ev.saved > 6) ev.saved = 0; }
    if (ev.silence > 0) { ev.silence += dt; this.hemi.intensity = this.to.hemi * dim; if (ev.silence > 5) ev.silence = 0; }
    if (ev.disable > 0) { ev.disable += dt; if (ev.disable > 7) ev.disable = 0; }
    if (ev.snipe > 0) { ev.snipe += dt; const fl = ev.snipe < .15 ? 1 : ev.snipe < .3 ? .4 : ev.snipe < .4 ? 1 : 0; if (!this.snipeL) { this.snipeL = new THREE.PointLight(0xfff2d0, 0, 20, 1.5); this.snipeL.position.set(FACE - 1.2, 8.6, -11); this.scene.add(this.snipeL); } this.snipeL.intensity = fl * 400; if (ev.snipe > 7) ev.snipe = 0; }
    this.pigeons.forEach(p => { if (p.t >= 0) { p.t += dt; const k = p.t; p.s.material.opacity = k < 3 ? Math.min(1, k * 4) * (1 - k / 3) : 0; p.s.position.set(p.ox + Math.sin(k * 3 + p.oz) * k * .8 - k * 1.2, 11.5 + k * 2.2 + Math.sin(k * 14) * .15, p.oz + k * 1.3); p.s.scale.set(.35, .22 * (0.5 + Math.abs(Math.sin(k * 18))), 1); if (k > 3) p.t = -1; } });
    if (this.mode === 'night') { const pulse = .5 + .5 * Math.sin(time * 1.6); this.emberLight.intensity = (this.ember.visible ? 1 : 0) * (.5 + pulse * .7); if (this.figLamp) { const hp = this.figLamp.root.position; this.ember.position.set(hp.x + .2, 1.45, hp.z + .3); this.emberLight.position.copy(this.ember.position); } } else this.emberLight.intensity = 0;
    this.updateCrowd(dt, time);
    this.laundry.forEach(l => { l.m.rotation.x = Math.sin(time * 1.4 + l.ph) * .04; });
    if (this.rain && (this.rain.material as THREE.LineBasicMaterial).opacity > 0) { const a = (this.rain.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array, n = this.rain.userData.count as number; for (let i = 0; i < n; i++) { a[i * 6 + 1] -= dt * 16; a[i * 6 + 4] -= dt * 16; if (a[i * 6 + 1] < 0) { a[i * 6 + 1] += 24; a[i * 6 + 4] += 24; } } (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; this.rain.position.set(this.camera.position.x, 0, this.camera.position.z + 10); }
    const upd = (ps: PS, origin: THREE.Vector3, speed: number, spread: number, maxLife: number, alpha: number, grow: number) => { ps.items.forEach(it => { it.life += dt / maxLife; if (it.life > 1) { it.life = 0; it.s.position.set(origin.x + (rnd() - .5) * spread, origin.y, origin.z + (rnd() - .5) * spread); it.vx = (rnd() - .5) * .3; it.vz = (rnd() - .5) * .3; } it.s.position.y += dt * speed; it.s.position.x += (it.vx || 0) * dt; it.s.position.z += (it.vz || 0) * dt; const l = it.life; it.s.material.opacity = alpha * Math.sin(l * Math.PI); const sc = 1 + l * grow; it.s.scale.set(sc, sc, 1); }); };
    upd(this.steam, this.STEAM_O, .9, 1.4, 4.5, .07, 2.4); if (ev.disable > 0 && ev.disable < 5) upd(this.purple, this.STEAM_O, 1.2, 2.4, 3.8, .38, 2.6); else this.purple.items.forEach(i => (i.s.material.opacity = 0)); upd(this.exhaust, this.EXH_O, .5, .4, 2.5, .06, 1.8);
    // camera (بالساعة الحقيقيّة)
    const s = this.shots[this.evShot || this.cur]; this.shotT += dtRaw; const t = Math.min(1, this.shotT / s.len); const [p, l] = s.at(t); const k = (a: number) => 1 - Math.pow(1 - a, dtRaw * 60); this._p.lerp(p, k(this.evShot ? .35 : .12)); this._l.lerp(l, k(.12)); this.sway.set(Math.sin(time * .7) * .03, Math.sin(time * 1.1) * .02, 0); this.camera.position.copy(this._p).add(this.sway); this.camera.lookAt(this._l); this.camera.fov += (s.fov - this.camera.fov) * .08; this.camera.updateProjectionMatrix();
    if (this.evShot) { if (this.shotT >= s.len) { this.evShot = null; this.cut(this.cur); } } else if (this.shotT >= s.len && !this.cutting) { this.oi = (this.oi + 1) % this.order.length; this.cut(this.order[this.oi]); }
    const d = this.camera.position.distanceTo(this.evShot === 'KILL' ? this.hat.position : (this.figLamp?.root.position || this.car.position)); (this.bokeh.uniforms as any).focus.value += (d - (this.bokeh.uniforms as any).focus.value) * .1;
    if (this.frameIndex % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(dtRaw);
    if (this.transPending) { this.transPending = false; this.lastTransitionMs = Math.round(performance.now() - this.transMarkAt); }
    if (this.posterCb) { const cb = this.posterCb; this.posterCb = null; try { cb(this.renderer.domElement.toDataURL('image/jpeg', .85)); } catch { cb(''); } }
  };
}

let engine: StreetEngine | null = null;
/** المحرّك المفرد — يُنشأ عند أوّل طلب ويبقى حيّاً بين المراحل */
export function getStreetEngine(): StreetEngine | null {
  if (typeof window === 'undefined') return null;
  if (!engine || engine.disposed) engine = new StreetEngine();
  return engine.ok ? engine : null;
}
export type { StreetEngine };
