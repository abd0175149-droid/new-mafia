// ══════════════════════════════════════════════════════
// 🏗️ خطّ أصول شاشة القاعة ثلاثيّة الأبعاد — يجلب أصول Poly Haven (CC0) المعتمدة
//    (قرار المالك 2026-09-12)، يعيد ترميز القوام إلى WebP، ويكتب public/3d/LICENSES.md.
//    التشغيل: node scripts/3d-assets.mjs   (يتخطّى ما جُلب سابقاً)
//    أصول Sketchfab (السيّارة، الشخصيّة، القبّعة) تُنزَّل يدويّاً بحساب المالك إلى public/3d/sketchfab/
// ══════════════════════════════════════════════════════
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public/3d');
const API = 'https://api.polyhaven.com';
const RES = '1k';
const WEBP_Q = 82;

const MODELS = ['street_lamp_01', 'street_lamp_02', 'fire_hydrant', 'modular_fire_escape', 'metal_trash_can', 'water_manhole_cover', 'modular_metal_gutter'];
const TEXTURES = ['red_brick_03', 'plastered_wall_04', 'asphalt_02', 'cobblestone_floor_08', 'painted_plaster_wall', 'wood_planks_grey'];
const HDRIS = ['moonless_golf', 'klippad_sunrise_2'];

const exists = async (p) => !!(await fs.stat(p).catch(() => null));
const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.json(); };
const buf = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} → ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const mb = (n) => (n / 1e6).toFixed(2) + ' MB';
const toWebp = (b) => sharp(b).webp({ quality: WEBP_Q }).toBuffer();
const lic = [];

async function model(name) {
  const dir = path.join(ROOT, 'models', name); const out = path.join(dir, `${name}.gltf`);
  if (await exists(out)) { console.log('  ↷', name, '(موجود)'); return; }
  const files = await j(`${API}/files/${name}`); const g = files.gltf[RES].gltf;
  await fs.mkdir(path.join(dir, 'textures'), { recursive: true });
  const gltf = JSON.parse((await buf(g.url)).toString('utf8'));
  let total = 0;
  for (const [rel, f] of Object.entries(g.include || {})) {
    const src = await buf(f.url); let data = src, rel2 = rel;
    if (/\.(jpe?g|png)$/i.test(rel)) { data = await toWebp(src); rel2 = rel.replace(/\.(jpe?g|png)$/i, '.webp'); }
    await fs.mkdir(path.dirname(path.join(dir, rel2)), { recursive: true });
    await fs.writeFile(path.join(dir, rel2), data); total += data.length;
    if (rel2 !== rel) for (const im of gltf.images || []) if (im.uri === rel) { im.uri = rel2; im.mimeType = 'image/webp'; }
  }
  await fs.writeFile(out, JSON.stringify(gltf)); total += Buffer.byteLength(JSON.stringify(gltf));
  lic.push(`- models/${name} — "${name}" — Poly Haven — CC0 — https://polyhaven.com/a/${name}`);
  console.log('  ✓ model', name, mb(total));
}

async function texture(name) {
  const dir = path.join(ROOT, 'tex'); await fs.mkdir(dir, { recursive: true });
  const outDiff = path.join(dir, `${name}_diff.webp`);
  if (await exists(outDiff)) { console.log('  ↷', name, '(موجود)'); return; }
  const files = await j(`${API}/files/${name}`);
  const pick = (keys) => { for (const k of keys) if (files[k]?.[RES]) return files[k][RES]; return null; };
  const maps = { diff: pick(['Diffuse', 'diffuse', 'Color']), nor: pick(['nor_gl', 'Normal']), rough: pick(['Rough', 'Roughness']) };
  let total = 0;
  for (const [k, m] of Object.entries(maps)) {
    if (!m) { console.log('    ⚠️ لا خريطة', k, 'لـ', name); continue; }
    const f = m.jpg || m.png; const data = await toWebp(await buf(f.url));
    await fs.writeFile(path.join(dir, `${name}_${k}.webp`), data); total += data.length;
  }
  lic.push(`- tex/${name}_* — "${name}" — Poly Haven — CC0 — https://polyhaven.com/a/${name}`);
  console.log('  ✓ texture', name, mb(total));
}

async function hdri(name) {
  const dir = path.join(ROOT, 'hdri'); await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${name}_${RES}.hdr`);
  if (await exists(out)) { console.log('  ↷', name, '(موجود)'); return; }
  const files = await j(`${API}/files/${name}`); const data = await buf(files.hdri[RES].hdr.url);
  await fs.writeFile(out, data); lic.push(`- hdri/${name}_${RES}.hdr — "${name}" — Poly Haven — CC0 — https://polyhaven.com/a/${name}`);
  console.log('  ✓ hdri', name, mb(data.length));
}

console.log('🏗️  Poly Haven →', ROOT);
for (const m of MODELS) await model(m).catch(e => console.error('  ✗', m, e.message));
for (const t of TEXTURES) await texture(t).catch(e => console.error('  ✗', t, e.message));
for (const h of HDRIS) await hdri(h).catch(e => console.error('  ✗', h, e.message));

const licPath = path.join(ROOT, 'LICENSES.md');
const head = `# رخص أصول شاشة القاعة ثلاثيّة الأبعاد\n\nكلّ أصول Poly Haven تحت CC0 (لا يلزم إسناد). أصول Sketchfab تحت CC-BY 4.0 ويلزم إسنادها في صفحة «عن التطبيق»:\n\n- sketchfab/pierce_arrow — "1933 Pierce Arrow Silver Arrow look-alike V2" — Libau Media (robinmikart) — CC-BY 4.0 — https://sketchfab.com/3d-models/1933-pierce-arrow-silver-arrow-look-alike-v2-152dbf047cc24ec0979639fe91a9ad9f\n- sketchfab/gangster — "1920's Gangster" — Wolf3D — CC-BY 4.0 — https://sketchfab.com/3d-models/7a633a06e91f40b291b2a9ebf1834507\n- sketchfab/fedoras — "fedoras" — CC-BY 4.0 — https://sketchfab.com/3d-models/c456f905f8c04169b8864bd7be04b554\n\n## Poly Haven (CC0)\n`;
const prev = (await exists(licPath)) ? (await fs.readFile(licPath, 'utf8')).split('\n').filter(l => l.startsWith('- ') && l.includes('Poly Haven')) : [];
const all = [...new Set([...prev, ...lic])].sort();
await fs.writeFile(licPath, head + all.join('\n') + '\n');
console.log('📝 LICENSES.md:', all.length, 'أصول Poly Haven');
