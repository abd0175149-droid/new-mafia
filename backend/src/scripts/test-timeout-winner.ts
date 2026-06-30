// ══════════════════════════════════════════════════════
// 🧪 اختبار قرار الفائز عند انتهاء وقت اللعبة (decideTimeoutWinner) — نقي بلا DB
// يقفل إصلاح الخطأ: كانت المافيا تُعلَن فائزة عند انتهاء الوقت حتى لو مات جميع المافيا.
//
// تشغيل: npx tsx src/scripts/test-timeout-winner.ts
// ══════════════════════════════════════════════════════

import { decideTimeoutWinner, checkWinCondition, WinResult } from '../game/win-checker.js';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

const P = (physicalId: number, role: string, isAlive: boolean) => ({ physicalId, name: `#${physicalId}`, role, isAlive });
function st(players: any[], winner: string | null = null): any {
  return { players, winner, config: {}, phase: 'DAY' };
}

section('1) سيناريو المباراة 448: مات كل المافيا، نجا مواطنان → فوز المواطنين (لا المافيا)');
{
  // الأدوار الحقيقية للمباراة 448 (مافيا: حرباء/شيخ/مُسكِت — كلهم ماتوا، نجا مواطن + ممرضة)
  const players = [
    P(8, 'CHAMELEON', false), P(11, 'GODFATHER', false), P(5, 'SILENCER', false), // مافيا — كلهم ميّتون
    P(10, 'CITIZEN', true), P(15, 'NURSE', true),                                   // ناجيان — مواطنان
    P(1, 'CITIZEN', false), P(6, 'DOCTOR', false), P(7, 'SHERIFF', false),
    P(2, 'SNIPER', false), P(12, 'POLICEWOMAN', false), P(9, 'WITCH', false),
    P(4, 'JESTER', false), P(3, 'CITIZEN', false),
  ];
  const state = st(players);
  check('aliveMafia = 0 (checkWinCondition → CITIZEN_WIN)', checkWinCondition(state) === WinResult.CITIZEN_WIN);
  check('decideTimeoutWinner = CITIZEN (لا MAFIA)', decideTimeoutWinner(state) === 'CITIZEN');
}

section('2) القاعدة الأساسية: الوقت انتهى والمافيا أحياء → فوز المافيا');
{
  // مافيا 1 ومواطن 1 (تعادل) — المدينة لم تُنهِ المافيا في الوقت
  const a = st([P(1, 'GODFATHER', true), P(2, 'CITIZEN', true)]);
  check('مافيا=مواطنين → MAFIA', decideTimeoutWinner(a) === 'MAFIA');
  // مافيا 1 ومواطنون 3 (المافيا أقل، لكن لم يُقصَ بعد) — القاعدة: انتهاء الوقت يفيد المافيا
  const b = st([P(1, 'SILENCER', true), P(2, 'CITIZEN', true), P(3, 'DOCTOR', true), P(4, 'NURSE', true)]);
  check('مافيا أحياء < مواطنين (لم يُحسم) → MAFIA (قاعدة المؤقّت)', decideTimeoutWinner(b) === 'MAFIA');
}

section('3) احترام فائز محسوم مسبقاً (محايد/مواطن) لم تُغلَق عليه اللعبة');
{
  const jester = st([P(1, 'GODFATHER', true), P(4, 'JESTER', false)], 'JESTER');
  check('winner=JESTER محسوم → يبقى JESTER', decideTimeoutWinner(jester) === 'JESTER');
  const assassin = st([P(1, 'GODFATHER', true), P(2, 'CITIZEN', true)], 'ASSASSIN');
  check('winner=ASSASSIN محسوم → يبقى ASSASSIN', decideTimeoutWinner(assassin) === 'ASSASSIN');
  const citizenPreset = st([P(10, 'CITIZEN', true)], 'CITIZEN');
  check('winner=CITIZEN محسوم → يبقى CITIZEN', decideTimeoutWinner(citizenPreset) === 'CITIZEN');
}

section('4) لا أحد حيّ إطلاقاً (الكل مات) → لا مافيا → CITIZEN');
{
  const allDead = st([P(1, 'GODFATHER', false), P(2, 'CITIZEN', false)]);
  check('aliveMafia=0 → CITIZEN', decideTimeoutWinner(allDead) === 'CITIZEN');
}

console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) {
  console.log(`\n❌ الفشل:`);
  failures.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log(`\n🎉 قرار الفائز عند انتهاء الوقت صحيح — لا فوز للمافيا بلا مافيا أحياء.`);
  process.exit(0);
}
