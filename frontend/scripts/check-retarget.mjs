// ══════════════════════════════════════════════════════
// 🦾 قياس إعادة التوجيه: زاوية اتّجاه كلّ عظمةٍ مقارنةً بالمصدر
// ══════════════════════════════════════════════════════
// عطلٌ لا تراه لقطةُ شاشة ولا يكشفه «مدى تأرجح اليد»: ذراعٌ تلتفّ إلى داخل
// الصدر يبقى مدى يدها واسعاً. المقياسُ الأمين هو الزاوية بين اتّجاه كلّ عظمةٍ
// في العالم عند الهدف واتّجاهها عند المصدر، إطاراً إطاراً. الصيغةُ الصحيحة
// تُعطي 0° على كلّ العظام لأيّ هيكل.
//
//   node scripts/check-retarget.mjs                         ← mafia_boss
//   node scripts/check-retarget.mjs public/3d/sketchfab/gangster_lite/scene.glb
//
// يُحاكى ما يفعله `retargetLocal` بالصيغ الثلاث (المعتمدة: محاذاة الاتّجاه).
// 🔴 وضعيّةُ الراحة تُقرأ من الملفّ **قبل** أن يمسّ الـmixer الهيكل: قياسُها بعد
//    setTime(0) يجعلها الإطارَ الأوّل من المشي فتبدو الصيغُ المعطوبة ممتازة.
// 🔴 القياسُ مرّتين أضلّني (2026-09-25): «مسافة اليد عن الورك» ثمّ «بُعدها
//    الجانبيّ» — كلاهما بلا مرجعٍ من المصدر نفسه. المرجعُ هنا هو المصدر دائماً.
// ══════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io2 = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// تُنزع القوام قبل التحليل: GLTFLoader يطلب self/createImageBitmap وهما غير موجودين في Node
const load = async (f) => {
  const doc = await io2.read(f);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  const bin = await io2.writeBinary(doc);
  return new Promise((res, rej) => new GLTFLoader().parse(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), '', res, rej));
};

const CHAR = process.argv[2] || 'public/3d/sketchfab/mafia_boss/scene.glb';
const CLIP = process.argv[3] || 'walking';
const src = await load(`public/3d/anim/${CLIP}.glb`);
const clip = src.animations[0];
const mixer = new THREE.AnimationMixer(src.scene);
mixer.clipAction(clip).play();
src.scene.updateMatrixWorld(true);

// سلسلةٌ من الورك إلى السبّابة اليمنى — الذراعُ حيث يظهر كلُّ خطأ
const CH = ['Hips', 'Spine', 'Spine1', 'Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1'];
const AS = { Hips: 'Root_M', Spine: 'Spine1_M', Spine1: 'Spine1_M', Spine2: 'Chest_M', RightShoulder: 'Scapula_R', RightArm: 'Shoulder_R', RightForeArm: 'Elbow_R', RightHand: 'Wrist_R', RightHandIndex1: 'IndexFinger1_R' };
const sB = CH.map(n => { let o = null; src.scene.traverse(x => { if (!o && x.name.endsWith(n)) o = x; }); return o; });
const sRest = sB.map(b => b.getWorldQuaternion(new THREE.Quaternion()));
const sPos0 = sB.map(b => b.getWorldPosition(new THREE.Vector3()));

const g = await load(CHAR); g.scene.updateMatrixWorld(true);
const tB = CH.map(n => { let o = null; g.scene.traverse(x => { if (!o && (x.name === 'mixamorig' + n || x.name.replace(/_[0-9]+$/, '') === AS[n])) o = x; }); return o; });
if (tB.some(b => !b)) { console.log('⚠️ عظامٌ ناقصة:', CH.filter((_, i) => !tB[i]).join(', ')); process.exit(1); }
const rest = tB.map(b => b.getWorldPosition(new THREE.Vector3()));
const tRest = tB.map(b => b.getWorldQuaternion(new THREE.Quaternion()));
// A_b: أقصرُ دورانٍ يحمل اتّجاه عظمة الهدف (في راحته) إلى اتّجاه نظيرتها في المصدر
const A = CH.map((_, k) => {
  const c = k + 1; if (c >= CH.length) return new THREE.Quaternion();
  const ds = sPos0[c].clone().sub(sPos0[k]), dt = rest[c].clone().sub(rest[k]);
  if (ds.lengthSq() < 1e-10 || dt.lengthSq() < 1e-10) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(dt.normalize(), ds.normalize());
});
const deg = (r) => r * 180 / Math.PI;
const unit = rest[0].y / sPos0[0].y;   // للمقارنة بوحدات الهدف

const run = (mode) => {
  const errs = CH.map(() => []); let side = 0, lift = 0, n = 0, mn = 9, mx = -9;
  for (let i = 0; i <= 24; i++) {
    mixer.setTime(clip.duration * i / 24); src.scene.updateMatrixWorld(true);
    const W = sB.map(b => b.getWorldQuaternion(new THREE.Quaternion())), sP = sB.map(b => b.getWorldPosition(new THREE.Vector3()));
    const Wt = (k) => mode === 'world' ? W[k].clone().multiply(sRest[k].clone().invert()).multiply(tRest[k])
      : mode === 'rest' ? tRest[k].clone().multiply(sRest[k].clone().invert()).multiply(W[k])
      : W[k].clone().multiply(sRest[k].clone().invert()).multiply(A[k]).multiply(tRest[k]);
    const pos = [rest[0].clone()];
    for (let k = 1; k < CH.length; k++) { const d = Wt(k - 1).multiply(tRest[k - 1].clone().invert()); pos.push(pos[k - 1].clone().add(rest[k].clone().sub(rest[k - 1]).applyQuaternion(d))); }
    for (let k = 0; k < CH.length - 1; k++) {
      const dT = pos[k + 1].clone().sub(pos[k]), dS = sP[k + 1].clone().sub(sP[k]);
      if (dT.lengthSq() < 1e-10 || dS.lengthSq() < 1e-10) continue;   // عظمةٌ بلا طول (Spine1_M مكرّرة في AS)
      errs[k].push(deg(dT.normalize().angleTo(dS.normalize())));
    }
    const h = pos[7].clone().sub(pos[0]); side += Math.abs(h.x); lift += h.y; n++; mn = Math.min(mn, h.z); mx = Math.max(mx, h.z);
  }
  return { errs: errs.map(e => e.length ? e.reduce((a, b) => a + b, 0) / e.length : null), side: side / n, lift: lift / n, range: mx - mn };
};
// المصدرُ نفسه هو المرجع
let rs = 0, rl = 0, rn = 0, rmn = 9, rmx = -9;
for (let i = 0; i <= 24; i++) { mixer.setTime(clip.duration * i / 24); src.scene.updateMatrixWorld(true); const hp = sB[0].getWorldPosition(new THREE.Vector3()), h = sB[7].getWorldPosition(new THREE.Vector3()).sub(hp); rs += Math.abs(h.x); rl += h.y; rn++; rmn = Math.min(rmn, h.z); rmx = Math.max(rmx, h.z); }

console.log(`\n🧍 ${CHAR.split(/[\\/]/).slice(-2)[0]} · مقطع ${CLIP}`);
console.log(`📌 المصدر (بوحدات الهدف): اليد جانباً ${(rs / rn * unit).toFixed(3)} · ارتفاع ${(rl / rn * unit).toFixed(3)} · تأرجح ${((rmx - rmn) * unit).toFixed(3)}`);
const fmt = (r) => CH.slice(0, -1).map((c, k) => r.errs[k] === null ? null : `${c.replace('Right', 'R.')} ${r.errs[k].toFixed(0)}°`).filter(Boolean).join(' · ');
const arm = (r) => Math.max(...[5, 6, 7].map(k => r.errs[k] ?? 0));
let bad = 0;
for (const [m, name] of [['align', '🟢 محاذاة الاتّجاه (المعتمدة)'], ['rest', '⚪ إطار الراحة'], ['world', '⚪ دلتا عالميّة']]) {
  const r = run(m);
  console.log(`\n${name}: اليد جانباً ${r.side.toFixed(3)} · ارتفاع ${r.lift.toFixed(3)} · تأرجح ${r.range.toFixed(3)}`);
  console.log('   خطأ الاتّجاه (متوسّط الدورة): ' + fmt(r));
  if (m === 'align' && arm(r) > 5) { bad++; console.log(`   ❌ خطأُ الذراع ${arm(r).toFixed(0)}° — الصيغة المعتمدة لا تطابق المصدر`); }
}
console.log(`\n${bad ? '❌' : '✅'} ${bad ? 'راجع الصيغة' : 'الصيغة المعتمدة تطابق المصدر على كلّ العظام'}\n`);
process.exit(bad ? 1 : 0);
