// ══════════════════════════════════════════════════════
// 🎩 استيراد أصل Sketchfab (glTF منزَّل يدويّاً بحساب المالك) إلى public/3d/sketchfab/<name>/
//    - يضغط القوام إلى WebP بحدّ 1024px ويعيد كتابة مسارات الصور في scene.gltf
//    - يحذف العُقد التي تطابق --drop=<regex> (مثل أرضيّة العرض داخل نموذج السيّارة)
//    التشغيل: node scripts/sketchfab-import.mjs "<مجلّد المصدر>" <name> [--drop=ground] [--max=1024]
// ══════════════════════════════════════════════════════
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [src, name, ...flags] = process.argv.slice(2);
if (!src || !name) { console.error('usage: node scripts/sketchfab-import.mjs <srcDir> <name> [--drop=regex] [--max=1024]'); process.exit(1); }
const opt = Object.fromEntries(flags.map(f => { const m = f.match(/^--(\w+)=(.*)$/); return m ? [m[1], m[2]] : [f.replace(/^--/, ''), true]; }));
const MAX = Number(opt.max || 1024); const DROP = opt.drop ? new RegExp(opt.drop, 'i') : null;
const out = path.resolve('public/3d/sketchfab', name);
await fs.rm(out, { recursive: true, force: true }); await fs.mkdir(path.join(out, 'textures'), { recursive: true });

const gltf = JSON.parse(await fs.readFile(path.join(src, 'scene.gltf'), 'utf8'));
// buffers (scene.bin وغيرها)
let total = 0;
for (const b of gltf.buffers || []) { if (!b.uri || b.uri.startsWith('data:')) continue; const data = await fs.readFile(path.join(src, b.uri)); await fs.writeFile(path.join(out, path.basename(b.uri)), data); b.uri = path.basename(b.uri); total += data.length; }
// images → webp
for (const im of gltf.images || []) {
  if (!im.uri || im.uri.startsWith('data:')) continue;
  const file = path.join(src, decodeURIComponent(im.uri)); const base = path.basename(file).replace(/\.(jpe?g|png|webp)$/i, '');
  const img = sharp(await fs.readFile(file)); const meta = await img.metadata();
  const data = await img.resize({ width: Math.min(MAX, meta.width || MAX), height: Math.min(MAX, meta.height || MAX), fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  await fs.writeFile(path.join(out, 'textures', base + '.webp'), data); im.uri = `textures/${base}.webp`; im.mimeType = 'image/webp'; total += data.length;
}
// drop nodes by name (يُفرَّغ محتواها بدل حذفها كي لا تختلّ الفهارس)
let dropped = 0;
if (DROP) for (const n of gltf.nodes || []) { if (n.name && DROP.test(n.name)) { delete n.mesh; delete n.children; dropped++; } }
gltf.extensionsRequired = (gltf.extensionsRequired || []).filter(e => e !== 'KHR_texture_basisu');
await fs.writeFile(path.join(out, 'scene.gltf'), JSON.stringify(gltf));
const lic = await fs.readFile(path.join(src, 'license.txt'), 'utf8').catch(() => null); if (lic) await fs.writeFile(path.join(out, 'license.txt'), lic);
console.log(`✓ ${name}: ${(total / 1e6).toFixed(2)} MB, images ${gltf.images?.length || 0}, nodes ${gltf.nodes?.length || 0}, dropped ${dropped}, skins ${gltf.skins?.length || 0}, anims ${gltf.animations?.length || 0}`);
