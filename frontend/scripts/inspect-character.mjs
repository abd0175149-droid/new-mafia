// ══════════════════════════════════════════════════════
// 🦴 فحص شخصيّة ثلاثيّة الأبعاد قبل إدخالها المشهد
// ══════════════════════════════════════════════════════
// يقرأ ملفّ GLB/glTF ويجيب عن السؤال الوحيد الذي يهمّ: هل ستتحرّك هذه
// الشخصيّة في شاشة القاعة أم ستقف متجمّدة؟ ويقيس ما يقرّر ذلك: العظام
// وتطابقها مع نظام إعادة الاستهداف، والمثلّثات، والقوام، والامتدادات.
//
//   node scripts/inspect-character.mjs public/3d/sketchfab/dotty/scene.gltf
//   node scripts/inspect-character.mjs <file.glb> --json
//   node scripts/inspect-character.mjs <file.glb> --fix --tris 9000 --max 1024 --out <file.lite.glb>
//     --tris عدد المثلّثات المستهدَف · --max حدّ ضلع القوام · --error ميزانيّة خطأ التبسيط
//
// 🔴 منطق مطابقة العظام **مستوردٌ** من محرّك المشهد نفسه
//    (src/components/display/street/bone-map.ts) لا منسوخ: نسخةٌ ثانية كانت
//    تنحرف صامتةً — أوّل تشغيلٍ لهذا السكربت أعطى Shoulder_L → LeftShoulder
//    بينما المحرّك يعطيها LeftArm، فيكذب التقرير على من يثق به.
//    (Node 22.18+ يجرّد أنواع TypeScript تلقائيّاً، فالاستيراد يعمل بلا بناء.)
// ══════════════════════════════════════════════════════
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const argv = process.argv.slice(2);
const FILE = argv.find(a => !a.startsWith('--'));
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (!FILE) {
  console.error('usage: node scripts/inspect-character.mjs <file.glb|gltf> [--json] [--fix --tris 9000 --max 1024 --error 0.001 --out out.glb]');
  process.exit(1);
}

// ── مطابقة العظام: مصدرٌ واحد مشترك مع المحرّك ──
const BONE_MAP_URL = pathToFileURL(path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'components', 'display', 'street', 'bone-map.ts',
)).href;
const { coreBoneName: coreOf, MIN_BONE_MATCH: MIN_MATCH } = await import(BONE_MAP_URL);
export { coreOf };

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(FILE);
  const root = doc.getRoot();
  const stat = await fs.stat(FILE);

  // ── العظام ──
  const skins = root.listSkins();
  const boneNodes = [];
  const seen = new Set();
  for (const sk of skins) for (const j of sk.listJoints()) { if (!seen.has(j)) { seen.add(j); boneNodes.push(j); } }

  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const depth = (n) => { let d = 0, p = parentOf.get(n); while (p) { d++; p = parentOf.get(p); } return d; };

  const bones = boneNodes.map(n => ({ name: n.getName(), depth: depth(n), core: coreOf(n.getName()) }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const matched = bones.filter(b => b.core);
  const unmatched = bones.filter(b => !b.core);

  // ── الهندسة ──
  let tris = 0, verts = 0, skinnedMeshes = 0, staticMeshes = 0;
  const staticNames = [];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += Math.floor((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3);
      verts += pos ? pos.getCount() : 0;
    }
  }
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    if (node.getSkin()) skinnedMeshes++; else { staticMeshes++; staticNames.push(node.getName() || '(بلا اسم)'); }
  }

  // ── القوام والخامات ──
  const textures = root.listTextures().map(t => ({
    name: t.getName() || '(بلا اسم)',
    mime: t.getMimeType(),
    size: t.getImage() ? t.getImage().byteLength : 0,
    wh: t.getSize() ? t.getSize().join('×') : '?',
  }));
  const materials = root.listMaterials().map(m => m.getName() || '(بلا اسم)');

  // ── الامتدادات ──
  const exts = doc.getRoot().listExtensionsUsed().map(e => e.extensionName);
  const compression = {
    draco: exts.includes('KHR_draco_mesh_compression'),
    ktx2: exts.includes('KHR_texture_basisu'),
    meshopt: exts.includes('EXT_meshopt_compression'),
  };

  // ── الأبعاد ──
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const mn = pos.getMinNormalized ? pos.getMin([]) : null, mx = pos.getMax ? pos.getMax([]) : null;
      if (!mn || !mx) continue;
      for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], mn[i]); box.max[i] = Math.max(box.max[i], mx[i]); }
    }
  }
  // ملفّات الحركة لا تحمل شبكات: الصندوق يبقى لانهائيّاً، و-Infinity في التقرير يوهم بعطل
  const hasGeom = Number.isFinite(box.min[0]) && Number.isFinite(box.max[0]);
  if (!hasGeom) { box.min = [0, 0, 0]; box.max = [0, 0, 0]; }
  const size = [0, 1, 2].map(i => +(box.max[i] - box.min[i]).toFixed(3));
  const up = !hasGeom ? '— (لا شبكات: ملفّ حركةٍ على الأرجح)'
    : size[1] >= size[0] && size[1] >= size[2] ? 'Y-up (صحيح)' : size[2] > size[1] ? '⚠️ Z-up غالباً — أطول بُعدٍ هو Z' : '⚠️ غير واضح';

  const report = {
    file: FILE, fileSizeMB: +(stat.size / 1e6).toFixed(2),
    bones: { total: bones.length, matched: matched.length, unmatched: unmatched.map(b => b.name) },
    willAnimate: matched.length >= MIN_MATCH,
    geometry: { triangles: tris, vertices: verts, skinnedMeshes, staticMeshes, staticMeshNames: staticNames },
    materials, textures, extensions: exts, compression,
    bbox: { size, heightY: size[1], up },
    animations: root.listAnimations().map(a => a.getName() || '(بلا اسم)'),
  };

  if (flag('json')) { console.log(JSON.stringify(report, null, 2)); }
  else {
    const L = (s = '') => console.log(s);
    L(`\n🦴 ${path.basename(FILE)}  —  ${report.fileSizeMB} م.ب`);
    L('═'.repeat(66));
    if (hasGeom) {
      L(`\n📐 الأبعاد: ${size.join(' × ')}  ·  الطول Y = ${size[1]}  ·  ${up}`);
      L(`   bbox.min.y = ${box.min[1].toFixed(3)} ${Math.abs(box.min[1]) < 0.02 ? '(القدمان عند الصفر ✅)' : '(⚠️ ليست عند الصفر — fit() ستُنزلها)'}`);
    } else L(`\n📐 الأبعاد: ${up}`);
    L(`\n🔺 الهندسة: ${tris.toLocaleString('en')} مثلّث · ${verts.toLocaleString('en')} رأس`);
    L(`   شبكات مجلَّدة: ${skinnedMeshes}  ·  شبكات ثابتة: ${staticMeshes}${staticMeshes ? ` ⚠️ (${staticNames.slice(0, 4).join(', ')}) — pinRigidProps ستلصقها بأقرب عظمة` : ''}`);
    L(`\n🎨 الخامات (${materials.length}): ${materials.join(' · ') || '—'}`);
    L(`🖼️ القوام (${textures.length}):`);
    for (const t of textures) L(`   ${t.wh.padEnd(11)} ${String(t.mime).padEnd(12)} ${(t.size / 1024).toFixed(0).padStart(6)} ك.ب   ${t.name}`);
    L(`\n📦 الامتدادات: ${exts.length ? exts.join(', ') : '— لا شيء'}`);
    if (compression.draco || compression.ktx2 || compression.meshopt) {
      L(`   Draco ${compression.draco ? '✅' : '—'} · KTX2 ${compression.ktx2 ? '✅' : '—'} · meshopt ${compression.meshopt ? '✅' : '—'}`);
      L('   ℹ️ المحمّل يسجّل Draco و meshopt. KTX2 غير مسجَّل — لا تستعمله.');
    }
    L(`\n🎬 الحركات داخل الملفّ: ${report.animations.length ? report.animations.join(', ') : '— لا شيء (صحيح: الحركات ملفّات منفصلة)'}`);
    L(`\n🦴 العظام: ${bones.length} — انطبقت ${matched.length}`);
    L('─'.repeat(66));
    for (const b of bones.slice(0, 80)) L(`   ${'  '.repeat(Math.min(b.depth, 6))}${b.name}${b.core ? `   → ${b.core}` : '   ✗'}`);
    if (bones.length > 80) L(`   … و${bones.length - 80} عظمةً أخرى`);
    if (unmatched.length) { L(`\n✗ لم تنطبق (${unmatched.length}):`); L('   ' + unmatched.map(b => b.name).join(' · ')); }
    L('\n' + '═'.repeat(66));
    L(report.willAnimate
      ? `✅ ستتحرّك — ${matched.length} عظمة منطبقة (الحدّ ${MIN_MATCH}).`
      : `❌ لن تتحرّك — ${matched.length} عظمة فقط (الحدّ ${MIN_MATCH}). سيُفعَّل البديل الإجرائيّ.`);
    const warn = [];
    if (tris > 9000) warn.push(`${tris.toLocaleString('en')} مثلّث — فوق حدّ الحشد (٩ آلاف)`);
    if (textures.some(t => { const [w] = String(t.wh).split('×').map(Number); return w > 1024; })) warn.push('قوامٌ أكبر من ١٠٢٤');
    if (compression.ktx2) warn.push('KTX2 غير مدعوم في المحمّل');
    if (staticMeshes) warn.push(`${staticMeshes} شبكة ثابتة`);
    if (warn.length) L('⚠️  ' + warn.join('  ·  '));
    L('');
  }

  // ── --fix ──
  if (flag('fix')) {
    const outPath = opt('out', FILE.replace(/\.(glb|gltf)$/i, '.lite.glb'));
    const maxTex = Number(opt('max', 1024));
    const targetTris = Number(opt('tris', 0));

    // ① الهندسة
    const { simplify, weld, prune, dedup } = await import('@gltf-transform/functions');
    const { MeshoptSimplifier } = await import('meshoptimizer').catch(() => ({ MeshoptSimplifier: null }));
    const steps = [dedup(), prune()];
    if (targetTris > 0 && tris > targetTris) {
      if (!MeshoptSimplifier) console.warn('⚠️ meshoptimizer غير مثبَّت — تُخطّى خطوة التبسيط. ثبّته: npm i -D meshoptimizer');
      else { await MeshoptSimplifier.ready; steps.push(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: targetTris / tris, error: Number(opt('error', 0.001)) })); }
    }
    await doc.transform(...steps);
    await io.write(outPath, doc);

    // العدد المتحقّق لا المطلوب: simplify يتوقّف عند ميزانيّة الخطأ، فقد يبقى
    // فوق الهدف — إعلانُ النجاح هنا يكذب على من يثق بالرقم.
    let nowTris = 0;
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
      const ix = p.getIndices(), ps = p.getAttribute('POSITION');
      nowTris += Math.floor((ix ? ix.getCount() : ps ? ps.getCount() : 0) / 3);
    }
    if (targetTris > 0) console.log(`   \ud83d\udd3a \u0627\u0644\u0645\u062b\u0644\u0651\u062b\u0627\u062a: ${tris.toLocaleString('en')} \u2192 ${nowTris.toLocaleString('en')} (\u0627\u0644\u0647\u062f\u0641 ${targetTris.toLocaleString('en')})${nowTris > targetTris * 1.1 ? ` \u2014 \u0644\u0645 \u064a\u0628\u0644\u063a \u0627\u0644\u0647\u062f\u0641\u060c \u062c\u0631\u0651\u0628 --error 0.01` : ''}`);

    // ② القوام — في عمليّةٍ مستقلّة، وهذا ليس ترفاً:
    //    `@gltf-transform/functions` يجرّ نسخة sharp ثانية (ndarray-pixels)
    //    تتشارك libvips مع الأولى في العمليّة نفسها، فيفسد ثابت فضاء اللون
    //    وتفشل كلُّ عمليّات الصور بـ«colourspace: parameter space not set».
    //    عمليّةٌ نظيفة لا تستورد functions تتجنّب التصادم كلّه.
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), outPath, '--texonly', '--max', String(maxTex)], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('⚠️ تخطّي ضغط القوام (العمليّة الفرعيّة فشلت)');

    const after = await fs.stat(outPath);
    console.log(`🛠️  كُتب ${outPath} — ${(after.size / 1e6).toFixed(2)} م.ب (كان ${report.fileSizeMB})`);
    console.log('   أعد الفحص عليه للتأكّد من بقاء العظام.\n');
  }
}

/** يعيد ترميز كلّ قوامٍ إلى WebP بحدٍّ أقصى للضلع، في الملفّ نفسه */
async function texOnly() {
  const maxTex = Number(opt('max', 1024));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(FILE);
  const sharp = (await import('sharp')).default;
  let saved = 0, done = 0, failed = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    try {
      const out = await sharp(Buffer.from(img))
        .resize({ width: maxTex, height: maxTex, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer();
      if (out.byteLength < img.byteLength || tex.getMimeType() !== 'image/webp') {
        saved += img.byteLength - out.byteLength; done++;
        tex.setImage(out).setMimeType('image/webp');
        const uri = tex.getURI();
        if (uri) tex.setURI(uri.replace(/\.(png|jpe?g|webp)$/i, '.webp'));
      }
    } catch (e) { failed++; console.warn(`   ⚠️ تعذّر ضغط قوام: ${tex.getName() || '(بلا اسم)'} — ${e.message}`); }
  }
  await io.write(FILE, doc);
  console.log(`   🖼️ القوام: ${done} أُعيد ترميزه بحدّ ${maxTex}px · وُفّر ${(saved / 1e6).toFixed(2)} م.ب${failed ? ` · فشل ${failed}` : ''}`);
}


if (flag('texonly')) { await texOnly(); process.exit(0); }

main().catch(e => { console.error('❌', e?.message || e); process.exit(1); });
