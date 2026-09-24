// ══════════════════════════════════════════════════════
// ↩️ فحص حرّاس إعادة المُقصى بالعقوبات
// ══════════════════════════════════════════════════════
// الإعادة تصحيحُ خطأ، وشرطُها الوحيد أن يبقى الدور سرّاً: بعد أن يُعرَض
// الكرت على الطاولة يعرف الجميعُ دورَه، فإعادتُه تفسد اللعبة لا تصلحها.
// وكلّ فحصٍ هنا يحرس حلقةً في تلك السلسلة.
//
//   npx tsx test-penalty-restore.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const WEB = path.join(HERE, '..', 'frontend', 'src');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const strip = (t: string) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const src = (p: string) => strip(fs.readFileSync(path.join(SRC, p), 'utf8'));
const web = (p: string) => {
  const f = path.join(WEB, p);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
};

const lobby = src('sockets/lobby.socket.ts');
const day = src('sockets/day.socket.ts');
const state = src('game/state.ts');
// نأخذ جسم المعالِج وحده حتّى لا تتسرّب مطابقاتٌ من معالجاتٍ مجاورة
const handler = (() => {
  const i = lobby.indexOf("socket.on('leader:restore-penalized'");
  return i < 0 ? '' : lobby.slice(i, i + 3000);
})();

// ══════════════════════════════════════════════════════
console.log('\n🔒 شرطُ الإعادة');
// ══════════════════════════════════════════════════════
check(!!handler, 'المعالج موجود');
check(/socket\.data\.role !== 'leader'/.test(handler), 'الموجّه وحده يُعيد');
check(/if \(!player\.penaltyKicked\)/.test(handler),
  'لا تُعاد إلّا حالةُ إقصاءٍ بالعقوبات — لا موتُ اللعب ولا الإقصاء الإداريّ');
check(/if \(player\.cardRevealed\)/.test(handler),
  '🔴 الشرط الحاكم: كرتٌ عُرض على الشاشة يمنع الإعادة');
const guardBeforeWrite =
  handler.indexOf('player.cardRevealed') < handler.indexOf('player.isAlive = true');
check(guardBeforeWrite, 'الحارس قبل التعديل لا بعده');

// ══════════════════════════════════════════════════════
console.log('\n🧹 ما يُعاد ضبطه');
// ══════════════════════════════════════════════════════
check(/player\.isAlive = true/.test(handler), 'يعود حيّاً');
check(/player\.penaltyKicked = false/.test(handler), 'تُرفع عنه علامة الإقصاء');
check(/player\.penalties = 0/.test(handler),
  'تُصفَّر عقوباته — من بلغ الحدّ لا تُسجَّل عليه عقوبةٌ جديدة، فلولا التصفير لعاد بلا إمكان معاقبته');
check(/await setGameState/.test(handler), 'الحالة تُحفظ');

// ══════════════════════════════════════════════════════
console.log('\n📡 من يُبلَّغ');
// ══════════════════════════════════════════════════════
check(/player:penalty-restored/.test(handler), 'اللاعب نفسه يُبلَّغ — شاشته تقول «أُقصيت»');
check(/admin:player-restored/.test(handler), 'شاشة القاعة تُبلَّغ بحدثٍ بعينه');
check(/emitStateSanitized/.test(handler), 'الحالة تُبثّ للجميع');
check(/activeRooms\.get/.test(handler) && /playerCount/.test(handler),
  'عدّاد الغرفة في الذاكرة يُحدَّث — وإلّا بقي ناقصاً حتّى إعادة التشغيل');

// ══════════════════════════════════════════════════════
console.log('\n🃏 تسجيل كشف الكرت');
// ══════════════════════════════════════════════════════
const reveal = (() => {
  const i = day.indexOf("socket.on('admin:reveal-eliminated'");
  return i < 0 ? '' : day.slice(i, i + 1400);
})();
check(/pl\.cardRevealed = true/.test(reveal),
  'الكشف يُسجَّل في الحالة — كان بثّاً عابراً لا أثر له');
check(/await setGameState/.test(reveal), 'ويُحفظ');
check(/catch/.test(reveal),
  'فشلُ التسجيل لا يُسقط الكشف نفسه — الكشف وصل الشاشة فعلاً');
check(/cardRevealed\?: boolean/.test(state), 'الحقل معرَّفٌ في نوع اللاعب');
check(/cardRevealed: false/.test(lobby),
  'الكشف لا يُورَّث للعبة جديدة');

// ══════════════════════════════════════════════════════
console.log('\n🖥️ الواجهات');
// ══════════════════════════════════════════════════════
const dayView = web('app/leader/LeaderDayView.tsx');
const display = web('app/display/page.tsx');
const flow = web('components/PlayerFlow.tsx');
check(/leader:restore-penalized/.test(dayView), 'زرّ الموجّه موصولٌ بالحدث');
check(/p\.cardRevealed \?/.test(dayView), 'الزرّ يختفي حين يكون الكرت مكشوفاً');
check(/swalConfirm/.test(dayView), 'الإعادة تسأل قبل أن تفعل');
check(/admin:player-restored/.test(display) && /socket\.off\('admin:player-restored'/.test(display),
  'شاشة القاعة تستمع وتنظّف');
check(/player:penalty-restored/.test(flow), 'شاشة اللاعب تستمع');
check(/setIsPlayerDead\(false\)/.test(flow), 'وتُعيد شاشته كما كانت');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
