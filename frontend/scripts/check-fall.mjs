// ══════════════════════════════════════════════════════
// 🎬 فحص مقاطع السقوط قبل إدخالها
// ══════════════════════════════════════════════════════
// مقطعُ سقوطٍ خاطئ لا يُرى إلّا في القاعة: جسدٌ يلتفّ وهو طائر، أو يغوص تحت
// البلاط، أو يتجمّد واقفاً. يُقاس هنا ما يقرّر ذلك قبل النشر.
//
//   node scripts/check-fall.mjs                      ← كلّ ما وُجد من مقاطع السقوط
//   node scripts/check-fall.mjs public/3d/anim/fall.glb
//
// يُحاكي ما يفعله المحرّك: ارتفاعُ حوض المصدر عالميّاً، مضروباً بنسبة ارتفاع
// حوض الشخصيّة إلى حوض الهيكل المصدر (engine.ts · retargetLocal · grounded).
// ══════════════════════════════════════════════════════
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io2 = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const load = async (f) => {
  const doc = await io2.read(f);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  const bin = await io2.writeBinary(doc);
  return new Promise((res, rej) => new GLTFLoader().parse(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), '', res, rej));
};

const CHAR = 'public/3d/sketchfab/mafia_boss/scene.glb';
const ANIM_DIR = 'public/3d/anim';
const WANTED = ['fall', 'fall_b', 'fall_c', 'react_death'];
const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const targets = files.length ? files : WANTED.map(n => `${ANIM_DIR}/${n}.glb`).filter(f => fs.existsSync(f));

if (!targets.length) {
  console.log(`\nلا مقاطعَ سقوطٍ بعد. ضع أيّاً من هذه في ${ANIM_DIR}/ ثمّ أعِد التشغيل:`);
  WANTED.forEach(n => console.log(`   ${n}.glb`));
  console.log('');
  process.exit(0);
}

// ارتفاعُ حوض الشخصيّة ومقاسها
const ch = await load(CHAR);
ch.scene.updateMatrixWorld(true);
const find = (o, rx) => { let r = null; o.traverse(x => { if (!r && rx.test(x.name)) r = x; }); return r; };
const cHips = find(ch.scene, /Hips$|Root_M/);
const cHipY = cHips.getWorldPosition(new THREE.Vector3()).y;
const cBox = new THREE.Box3().setFromObject(ch.scene);
const cH = cBox.max.y - cBox.min.y;
console.log(`\n🧍 الشخصيّة: ${CHAR.split('/').slice(-2)[0]} — طول ${cH.toFixed(2)} م · حوضٌ على ${cHipY.toFixed(2)} م`);

// هيكلُ المصدر (من أوّل ملفّ حركةٍ كما يفعل المحرّك)
const ref = await load(`${ANIM_DIR}/neutral_idle.glb`);
ref.scene.updateMatrixWorld(true);
const sHipsRef = find(ref.scene, /Hips$/);
const sHipYRef = sHipsRef.getWorldPosition(new THREE.Vector3()).y;
const scale = Math.abs(sHipYRef) > 1e-6 ? cHipY / sHipYRef : 1;
console.log(`🎞️ الهيكل المصدر: حوضٌ على ${sHipYRef.toFixed(2)} وحدة ⇒ نسبة التحجيم ×${scale.toFixed(4)}\n`);

let bad = 0;
for (const f of targets) {
  if (!fs.existsSync(f)) { console.log(`❌ ${f} — غير موجود`); bad++; continue; }
  const g = await load(f);
  const clip = g.animations?.[0];
  if (!clip) { console.log(`❌ ${f} — لا مقطعَ حركةٍ داخله`); bad++; continue; }
  // 🔴 يُشغَّل المقطعُ على هيكل neutral_idle لا على هيكله الخاصّ — كما يفعل المحرّك (retargetLocal يشغّله
  //    على srcHips). بعضُ تنزيلات Mixamo تحمل حوضَ راحةٍ عند الأصل، فقياسُ الفرق عن راحتها الخاصّة يُضاعف الارتفاع.
  if (!clip.tracks.some(t => /Hips\.position$/.test(t.name))) { console.log(`❌ ${f} — لا مسارَ موقعٍ لعظمة الحوض`); bad++; continue; }
  const hips = sHipsRef; const restY = sHipYRef;
  const mixer = new THREE.AnimationMixer(ref.scene);
  const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce); action.clampWhenFinished = true; action.play();
  const bonesRef = []; ref.scene.traverse(o => { if (o.isBone && /^mixamorig/.test(o.name) && !/Backpack/.test(o.name)) bonesRef.push(o); }); // عظامُ Mixamo وحدها — هيكلُ المرجع يحمل عظمةَ حقيبةٍ (mixamorigBackpack) لا يحرّكها المقطع
  const headRef = find(ref.scene, /Head$/);

  const N = 60, ys = [];
  let travel = 0, prev = null, lowestEnd = 0, lowestName = '', headEnd = 0, p0 = null, pEnd = null;
  for (let i = 0; i <= N; i++) {
    mixer.setTime(clip.duration * i / N);
    ref.scene.updateMatrixWorld(true);
    const p = hips.getWorldPosition(new THREE.Vector3());
    ys.push((p.y - restY) * scale);
    if (prev) travel += Math.hypot(p.x - prev.x, p.z - prev.z) * scale;
    prev = p; if (i === 0) p0 = p.clone(); pEnd = p;
    if (i === N) { let loB = null; for (const b of bonesRef) { const y = b.getWorldPosition(new THREE.Vector3()).y; if (!loB || y < loB.y) loB = { y, name: b.name }; } lowestEnd = loB.y * scale; lowestName = loB.name.replace(/^mixamorig:?/, ''); headEnd = headRef ? headRef.getWorldPosition(new THREE.Vector3()).y * scale : 0; }
  }
  action.stop(); mixer.uncacheRoot(ref.scene);
  const endHip = cHipY + ys[ys.length - 1];
  const minHip = cHipY + Math.min(...ys);
  const name = f.split(/[\\/]/).pop();
  const isReact = /react_death/.test(name);
  const lo = isReact ? 0.5 : 0.9, hi = isReact ? 0.9 : 4.0;

  const okLen = clip.duration >= lo && clip.duration <= hi;
  // ممدّدٌ على الأرض: الحوض بين 8% و25% من الطول. واقفاً يكون ~53%.
  const ratio = endHip / cH;
  const okEnd = isReact ? ratio > 0.4 : (ratio >= 0.05 && ratio <= 0.30);
  const okFloor = minHip > -0.05;
  if (!okLen || !okEnd || !okFloor) bad++;

  console.log(`${okLen && okEnd && okFloor ? '✅' : '❌'} ${name}`);
  console.log(`   الطول ${clip.duration.toFixed(2)} ث ${okLen ? '' : `⚠️ خارج ${lo}–${hi}`}`);
  console.log(`   الحوض: يبدأ ${(cHipY + ys[0]).toFixed(2)} م ← ينتهي ${endHip.toFixed(2)} م (${(ratio * 100).toFixed(0)}% من الطول)` +
    (okEnd ? '' : isReact ? '  ⚠️ مقطعُ الارتداد يجب أن ينتهي واقفاً' : '  ⚠️ لا يبدو ممدّداً على الأرض'));
  console.log(`   أخفضُ ارتفاعٍ للحوض ${minHip.toFixed(2)} م${okFloor ? '' : '  ⚠️ يغوص تحت البلاط'} · آخرُ إطار: أخفضُ عظمة ${lowestName} ${lowestEnd.toFixed(2)} م، الرأس ${headEnd.toFixed(2)} م`);
  // المحرّك يحفظ X/Z للسقوط (planar): تقدُّمٌ إلى الأمام (+Z في Mixamo) طبيعيّ؛ الانحرافُ الجانبيّ فوق 30 سم مريب
  const fwd = (pEnd.z - p0.z) * scale, side = Math.abs(pEnd.x - p0.x) * scale;
  console.log(`   الحوض أفقيّاً: يتقدّم ${fwd.toFixed(2)} م، ينحرف جانبيّاً ${side.toFixed(2)} م (مسارٌ إجماليّ ${travel.toFixed(2)} م) — ${side > 0.3 ? '⚠️ انحرافٌ جانبيّ كبير' : fwd < 0 ? 'يسقط إلى الخلف' : 'يسقط إلى الأمام ✅'}`);
  console.log(`   مسارات: ${clip.tracks.length}`);
}
console.log(`\n${bad ? '❌ راجع ما سبق' : '✅ كلّ المقاطع صالحة'} — والمحرّك يطبع تحقّقاً آخر عند التحميل (🎬 «…» آخر إطار).\n`);
process.exit(bad ? 1 : 0);
