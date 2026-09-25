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
  // A(b): أقصرُ دورانٍ يحمل اتّجاهَ عظمة المصدر في راحتها إلى اتّجاه نظيرتها عند الهدف
  const sPos = sB.map(b => b.getWorldPosition(new THREE.Vector3()));
  const align = CH.map((_, k) => {
    const c = k + 1;
    if (c >= CH.length) return new THREE.Quaternion();
    const ds = sPos[c].clone().sub(sPos[k]), dt = rest[c].clone().sub(rest[k]);
    if (ds.lengthSq() < 1e-9 || dt.lengthSq() < 1e-9) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(ds.normalize(), dt.normalize());
  });

  /** world: الصيغة المعطوبة (دلتا عالميّة) · rest: صيغةُ إطار الراحة (المعتمدة) */
  const run = (mode) => {
    let mn = 9, mx = -9, side = 0, lift = 0, n = 0;
    for (let i = 0; i <= 24; i++) {
      mixer.setTime(clip.duration * i / 24); src.scene.updateMatrixWorld(true);
      const W = sB.map(b => b.getWorldQuaternion(new THREE.Quaternion()));
      const Wt = (k) => mode === 'world'
        ? W[k].clone().multiply(sRest[k].clone().invert()).multiply(tRest[k])
        : mode === 'rest'
          ? tRest[k].clone().multiply(sRest[k].clone().invert()).multiply(W[k])
          // محاذاة: مرجعُ المصدر ليس راحته بل راحته موضوعةً باتّجاه عظام الهدف،
          // فلا يُحتسب فرقُ T→A ولا يُعتمد على توافق محاور العظام المحلّيّة
          : W[k].clone().multiply(sRest[k].clone().invert()).multiply(align[k].clone().invert()).multiply(tRest[k]);
      const pos = [rest[0].clone()];
      for (let k = 1; k < CH.length; k++) {
        const d = Wt(k - 1).multiply(tRest[k - 1].clone().invert());
        pos.push(pos[k - 1].clone().add(rest[k].clone().sub(rest[k - 1]).applyQuaternion(d)));
      }
      const f = pos[CH.length - 1].z - pos[0].z;
      mn = Math.min(mn, f); mx = Math.max(mx, f);
      // انحرافُ الوضعيّة عن راحة الشخصيّة نفسها: تأرجحٌ واسعٌ لا ينفع إن كانت
      // الذراع ممدودةً جانباً طوال الوقت (وضعيّة T مسرَّبة)
      side += Math.abs(pos[CH.length - 1].x - pos[0].x);
      lift += pos[CH.length - 1].y - pos[0].y;
      n++;
    }
    return { mn, mx, range: mx - mn, side: side / n, lift: lift / n };
  };

  const w = run('world'), r = run('rest'), a = run('align');
  const ok = r.range >= 0.25;
  if (!ok) bad++;
  console.log(`\n${ok ? '✅' : '❌'} ${label}`);
  const restSide = Math.abs(rest[CH.length - 1].x - rest[0].x), restLift = rest[CH.length - 1].y - rest[0].y;
  console.log(`   راحةُ الشخصيّة:      اليد جانباً ${restSide.toFixed(3)} م · ارتفاعها عن الورك ${restLift.toFixed(3)} م`);
  console.log(`   إطارُ الراحة:        تأرجح ${r.range.toFixed(3)} · جانباً ${r.side.toFixed(3)} · ارتفاع ${r.lift.toFixed(3)}`);
  console.log(`   دلتا عالميّة:        تأرجح ${w.range.toFixed(3)} · جانباً ${w.side.toFixed(3)} · ارتفاع ${w.lift.toFixed(3)}`);
  console.log(`   محاذاةُ الاتّجاهات:   تأرجح ${a.range.toFixed(3)} · جانباً ${a.side.toFixed(3)} · ارتفاع ${a.lift.toFixed(3)}`);
}
console.log(`\n📌 للمقارنة: اليد في ملفّ المصدر نفسه تتأرجح 0.462 م`);
process.exit(bad ? 1 : 0);
