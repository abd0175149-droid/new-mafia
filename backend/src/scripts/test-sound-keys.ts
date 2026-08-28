// ══════════════════════════════════════════════════════
// 🔑 حارسُ مفاتيح الصوت — كلُّ مفتاحٍ يُنادى في الكود مُعرَّفٌ في الكتالوج الواحد
// التشغيل: npx tsx src/scripts/test-sound-keys.ts
//
// 🔴 لماذا: كانت أربعُ قوائم للمفاتيح لا تتّفق، ولا شيء يفحصها — فمفتاحٌ يُنادى
//    كلَّ ليلة لم يكن في الكتالوج فلا سبيل لرفع ملفٍّ له، وبقي صامتاً شهرين.
//    هذا الفحص يُسقط البناء عند أوّل مفتاحٍ يُنادى بلا تعريف.
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const FRONT = path.resolve(process.cwd(), '../frontend/src');
const CATALOG = path.join(FRONT, 'lib', 'sound-keys.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const catalogSrc = fs.readFileSync(CATALOG, 'utf8');
// مفاتيحُ الأحداث وحدها — لا مفاتيحُ الفئات (لها `labelAr` لا `label`)
const catalog = new Set([...catalogSrc.matchAll(/\{\s*key:\s*'([a-z_]+)',\s*label:/g)].map(m => m[1]));

const callers = new Map<string, string[]>();
const add = (k: string, where: string) => { if (!callers.has(k)) callers.set(k, []); callers.get(k)!.push(where); };

for (const file of walk(FRONT)) {
  if (file.endsWith('sound-keys.ts')) continue;
  const rel = path.relative(FRONT, file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/play(?:Game|Ambient|Event|Local)Sound\(\s*'([a-z_]+)'/g)) add(m[1], rel);
  for (const m of src.matchAll(/previewAmbient\(\s*'([a-z_]+)'/g)) add(m[1], rel);
  // خرائطُ القيم النصّيّة في صفحة الموجّه ومدير الصوت
  for (const m of src.matchAll(/:\s*'((?:ambient|phase|morning|win|night|elimination|card_flip)_[a-z_]+)'/g)) add(m[1], rel);
  // ثلاثيّاتٌ نصّيّة بمفاتيح صوتٍ فقط — لا كلَّ ثلاثيّةٍ في التطبيق
  const SK = '(?:ambient|phase|morning|win|night|elimination|card_flip|timer|vote|leader|day)_[a-z_]+';
  for (const m of src.matchAll(new RegExp(`\\?\\s*'(${SK})'\\s*:\\s*'(${SK})'`, 'g'))) { add(m[1], rel); add(m[2], rel); }
  // ثلاثيّةٌ أحدُ طرفيها فقط مفتاحُ صوت (كسلسلة الفوز عند الموجّه)
  for (const m of src.matchAll(new RegExp(`[?:]\\s*'(${SK})'\\s*[:;,)]`, 'g'))) add(m[1], rel);
}
// المفاتيحُ المشتقّةُ برمجيّاً
const ROLES = ['godfather','silencer','chameleon','witch','older_brother','mafia_regular','sheriff','doctor','sniper','policewoman','nurse','mayor','citizen','younger_brother','jester','assassin','phoenix'];
for (const r of ROLES) add('elimination_' + r, 'soundManager:_playEliminationSound');
for (const k of ['drumroll', 'impact_boom', 'chips_victory_sting', 'birthday_song']) add(k, 'soundManager/leader');

const missing = [...callers.keys()].filter(k => !catalog.has(k) && !/^(mafia|citizen|neutral)$/.test(k)).sort();
const dead = [...catalog].filter(k => !callers.has(k)).sort();

let fail = 0;
console.log(`\n🔑 كتالوج: ${catalog.size} · مفاتيح منادَاة: ${callers.size}\n`);
if (missing.length) {
  fail++;
  console.log(`❌ يُنادى ولا يوجد في الكتالوج (${missing.length}):`);
  for (const k of missing) console.log(`   ${k}  ←  ${[...new Set(callers.get(k))].join(', ')}`);
} else console.log('✅ كلُّ مفتاحٍ منادىً معرَّفٌ في الكتالوج');
if (dead.length) {
  console.log(`\n👻 في الكتالوج ولا يناديه كود (${dead.length}) — تحذيرٌ لا فشل:`);
  for (const k of dead) console.log(`   ${k}`);
}
console.log(fail ? '\n💥 فشل — عرّف المفاتيح في frontend/src/lib/sound-keys.ts' : '\n🎉 المفاتيح متّفقة.');
process.exit(fail ? 1 : 0);
