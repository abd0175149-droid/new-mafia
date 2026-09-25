// ══════════════════════════════════════════════════════
// 🖐️ قياس تأرجح الذراع بعد إعادة التوجيه
// ══════════════════════════════════════════════════════
// عطلٌ لا تكشفه لقطةُ شاشة: الشخصيّة تمشي ويداها شبه ساكنتين خلف ظهرها.
// يُحاكى هنا ما يفعله `retargetLocal` ويُقاس موضعُ اليد أمام الورك وخلفه
// على مدى دورة المشي، بالصيغتين، كي يكون الحكم رقماً لا انطباعاً.
//
//   node scripts/check-retarget.mjs
//
// المرجع: اليد في ملفّ المصدر نفسه تتأرجح 0.462 م. أقلُّ من 0.25 م ⇒ عطل.
// 🔴 وضعيّةُ الراحة تُقرأ من الملفّ **قبل** أن يمسّ الـmixer الهيكل: لو قيست
//    بعد setTime(0) لصارت الإطارَ الأوّل من المشي، وأعطت الصيغةَ المعطوبة
//    نتيجةً ممتازة كاذبة.
// ══════════════════════════════════════════════════════
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io2 = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// تُنزع القوام قبل التحليل: GLTFLoader يطلب self/createImageBitmap وهما غير
// موجودين في Node، ولا حاجة للصور هنا — القياس على العظام وحدها.
const load = async (f) => {
  const doc = await io2.read(f);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  const bin = await io2.writeBinary(doc);
  return new Promise((res, rej) => new GLTFLoader().parse(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), '', res, rej));
};

const src = await load('public/3d/anim/walking.glb');
const clip = src.animations[0];
const mixer = new THREE.AnimationMixer(src.scene);
mixer.clipAction(clip).play();
src.scene.updateMatrixWorld(true);

const CH = ['Hips', 'Spine', 'Spine1', 'Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
const sFind = (n) => { let o = null; src.scene.traverse(x => { if (!o && x.name.endsWith(n)) o = x; }); return o; };
const sB = CH.map(sFind);
const sRest = sB.map(b => b.getWorldQuaternion(new THREE.Quaternion()));

const CHARS = [
  ['mafia_boss', 'public/3d/sketchfab/mafia_boss/scene.glb', CH.map(n => 'mixamorig' + n)],
  ['gangster', 'public/3d/sketchfab/gangster/scene.gltf', ['Root_M', 'Spine1_M', 'Spine1_M', 'Chest_M', 'Scapula_R', 'Shoulder_R', 'Elbow_R', 'Wrist_R']],
  ['gangster_lite', 'public/3d/sketchfab/gangster_lite/scene.glb', ['Root_M', 'Spine1_M', 'Spine1_M', 'Chest_M', 'Scapula_R', 'Shoulder_R', 'Elbow_R', 'Wrist_R']],
  ['dotty', 'public/3d/sketchfab/dotty/scene.gltf', ['Root_M', 'Spine1_M', 'Spine1_M', 'Chest_M', 'Scapula_R', 'Shoulder_R', 'Elbow_R', 'Wrist_R']],
];

let bad = 0;
for (const [label, file, names] of CHARS) {
  let g;
  try { g = await load(file); } catch (e) { console.log(`⚠️ ${label}: ${e.message}`); continue; }
  g.scene.updateMatrixWorld(true);
  const tFind = (n) => { let o = null; g.scene.traverse(x => { if (!o && (x.name === n || x.name.replace(/_\d+$/, '') === n)) o = x; }); return o; };
  const tB = names.map(tFind);
  if (tB.some(b => !b)) { console.log(`⚠️ ${label}: عظامٌ ناقصة — ${names.filter((n, i) => !tB[i]).join(', ')}`); continue; }
  const rest = tB.map(b => b.getWorldPosition(new THREE.Vector3()));
  const tRest = tB.map(b => b.getWorldQuaternion(new THREE.Quaternion()));

  /** world: الصيغة المعطوبة (دلتا عالميّة) · rest: صيغةُ إطار الراحة (المعتمدة) */
  const run = (mode) => {
    let mn = 9, mx = -9;
    for (let i = 0; i <= 24; i++) {
      mixer.setTime(clip.duration * i / 24); src.scene.updateMatrixWorld(true);
      const W = sB.map(b => b.getWorldQuaternion(new THREE.Quaternion()));
      const Wt = (k) => mode === 'world'
        ? W[k].clone().multiply(sRest[k].clone().invert()).multiply(tRest[k])
        : tRest[k].clone().multiply(sRest[k].clone().invert()).multiply(W[k]);
      const pos = [rest[0].clone()];
      for (let k = 1; k < CH.length; k++) {
        const d = Wt(k - 1).multiply(tRest[k - 1].clone().invert());
        pos.push(pos[k - 1].clone().add(rest[k].clone().sub(rest[k - 1]).applyQuaternion(d)));
      }
      const f = pos[CH.length - 1].z - pos[0].z;
      mn = Math.min(mn, f); mx = Math.max(mx, f);
    }
    return { mn, mx, range: mx - mn };
  };

  const w = run('world'), r = run('rest');
  const ok = r.range >= 0.25;
  if (!ok) bad++;
  console.log(`\n${ok ? '✅' : '❌'} ${label}`);
  console.log(`   الصيغة المعتمدة (إطار الراحة): تأرجح ${r.range.toFixed(3)} م · المدى ${r.mn.toFixed(3)} .. ${r.mx.toFixed(3)}`);
  console.log(`   الصيغة المعطوبة (دلتا عالميّة): تأرجح ${w.range.toFixed(3)} م · المدى ${w.mn.toFixed(3)} .. ${w.mx.toFixed(3)}`);
}
console.log(`\n📌 للمقارنة: اليد في ملفّ المصدر نفسه تتأرجح 0.462 م`);
process.exit(bad ? 1 : 0);
