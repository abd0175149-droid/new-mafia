// ══════════════════════════════════════════════════════
// 🧪 اختبار منطق «ملخص نقاط اللعبة» (زر الليدر في نهاية اللعبة) — نقي بلا DB
// يستدعي الدوال الحقيقية: summarizeMatchPlayerPoints + computeAdjustedValues (match.service)
// وهي ما يعتمده مودال الملخص (الجدول: كسب | خسر | المجموع) والتعديل اليدوي.
//
// تشغيل: npx tsx src/scripts/test-match-points.ts
// ══════════════════════════════════════════════════════

import { summarizeMatchPlayerPoints, computeAdjustedValues } from '../services/match.service.js';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

// صفّ match_players افتراضي (نفس الحقول التي يقرؤها buildDisplayBreakdown)
function row(over: any = {}): any {
  return {
    id: over.id ?? 1, playerId: over.playerId ?? 100, physicalId: over.physicalId ?? 1,
    playerName: over.playerName ?? 'لاعب', role: over.role ?? 'CITIZEN',
    xpEarned: over.xpEarned ?? 0, rrChange: over.rrChange ?? 0,
    penaltyRRDeduction: over.penaltyRRDeduction ?? 0, bombRRChange: over.bombRRChange ?? 0,
    rewardBreakdown: over.rewardBreakdown ?? null,
    matchWinner: over.matchWinner ?? null,
    survivedToEnd: over.survivedToEnd ?? false,
  };
}
const rrLine = (s: any, key: string) => (s.rrBreakdown.find((l: any) => l.key === key)?.value);

// كل الحالات التي نتحقق منها (تغطّي الفائز/الخاسر/المختلط/المحايد/العقوبة/التسوية/الصفر)
const cases: Array<{ name: string; r: any; rrGained: number; rrLost: number; rrTotal: number; team: string; won: boolean }> = [
  {
    name: '1) مواطن فائز (نتيجة فريق + نجاة)', team: 'CITIZEN', won: true, rrGained: 25, rrLost: 0, rrTotal: 25,
    r: row({ role: 'CITIZEN', xpEarned: 80, rrChange: 25, rewardBreakdown: { won: true, team: 'CITIZEN', xp: { participation: 30, teamWin: 40, survival: 10 }, rr: { teamResult: 20, survivedToEnd: 5 } } }),
  },
  {
    name: '2) مافيا خاسر', team: 'MAFIA', won: false, rrGained: 0, rrLost: -20, rrTotal: -20,
    r: row({ role: 'GODFATHER', xpEarned: 30, rrChange: -20, rewardBreakdown: { won: false, team: 'MAFIA', xp: { participation: 30 }, rr: { teamResult: -20 } } }),
  },
  {
    name: '3) مختلط (الطيار: −20 فريق + 15 قدرة صحيحة − 5 خاطئة)', team: 'CITIZEN', won: false, rrGained: 15, rrLost: -25, rrTotal: -10,
    r: row({ role: 'SHERIFF', xpEarned: 60, rrChange: -10, rewardBreakdown: { won: false, team: 'CITIZEN', xp: { participation: 30, abilityCorrect: 10 }, rr: { teamResult: -20, abilityCorrect: 15, abilityIncorrect: -5 } } }),
  },
  {
    name: '4) مهرّج فائز (محايد)', team: 'NEUTRAL', won: true, rrGained: 30, rrLost: 0, rrTotal: 30,
    r: row({ role: 'JESTER', xpEarned: 50, rrChange: 30, rewardBreakdown: { won: true, team: 'NEUTRAL', xp: { neutralResult: 50 }, rr: { neutralResult: 30 } } }),
  },
  {
    name: '5) عقوبة (عمود منفصل −10)', team: 'CITIZEN', won: true, rrGained: 20, rrLost: -10, rrTotal: 10,
    r: row({ role: 'CITIZEN', xpEarned: 30, rrChange: 10, penaltyRRDeduction: -10, rewardBreakdown: { won: true, team: 'CITIZEN', xp: { participation: 30 }, rr: { teamResult: 20 } } }),
  },
  {
    name: '6) تسوية (مكافأة إقصاء +15 غير مفصّلة في البنود)', team: 'CITIZEN', won: true, rrGained: 35, rrLost: 0, rrTotal: 35,
    r: row({ role: 'CITIZEN', xpEarned: 30, rrChange: 35, rewardBreakdown: { won: true, team: 'CITIZEN', xp: { participation: 30 }, rr: { teamResult: 20 } } }),
  },
  {
    name: '7) صفر', team: 'CITIZEN', won: false, rrGained: 0, rrLost: 0, rrTotal: 0,
    r: row({ role: 'CITIZEN', xpEarned: 0, rrChange: 0, rewardBreakdown: { won: false, team: 'CITIZEN', xp: { participation: 0 }, rr: { teamResult: 0 } } }),
  },
];

section('1) جدول الملخص — كسب/خسر/المجموع + team/won');
for (const c of cases) {
  const s = summarizeMatchPlayerPoints(c.r, undefined);
  check(`${c.name}: كسب=${c.rrGained}`, s.rrGained === c.rrGained, `=${s.rrGained}`);
  check(`${c.name}: خسر=${c.rrLost}`, s.rrLost === c.rrLost, `=${s.rrLost}`);
  check(`${c.name}: المجموع=${c.rrTotal}`, s.rrTotal === c.rrTotal, `=${s.rrTotal}`);
  check(`${c.name}: team=${c.team}`, s.team === c.team, `=${s.team}`);
  check(`${c.name}: won=${c.won}`, s.won === c.won, `=${s.won}`);
}

section('2) الثابت الأساسي: كسب + خسر === المجموع === rr_change المخزّن (لكل الحالات)');
for (const c of cases) {
  const s = summarizeMatchPlayerPoints(c.r, undefined);
  check(`${c.name}: كسب+خسر = المجموع`, s.rrGained + s.rrLost === s.rrTotal, `${s.rrGained}+${s.rrLost}≠${s.rrTotal}`);
  check(`${c.name}: المجموع = rr_change`, s.rrTotal === c.r.rrChange, `${s.rrTotal}≠${c.r.rrChange}`);
}

section('3) نفس الثابت للـ XP');
for (const c of cases) {
  const s = summarizeMatchPlayerPoints(c.r, undefined);
  check(`${c.name}: XP كسب+خسر = الإجمالي = xp_earned`, s.xpGained + s.xpLost === s.xpTotal && s.xpTotal === c.r.xpEarned, `g${s.xpGained}+l${s.xpLost}=${s.xpTotal} vs ${c.r.xpEarned}`);
}

section('4) تفصيل البنود (ما يظهر عند تمديد اسم اللاعب)');
{
  const s = summarizeMatchPlayerPoints(cases[2].r, undefined); // الطيار المختلط
  check('بند نتيجة الفريق = −20', rrLine(s, 'teamResult') === -20);
  check('بند قدرة صحيحة = +15', rrLine(s, 'abilityCorrect') === 15);
  check('بند قدرة خاطئة = −5', rrLine(s, 'abilityIncorrect') === -5);
  check('لا تظهر البنود الصفرية (dealSuccess محذوف)', s.rrBreakdown.every((l: any) => l.value !== 0));

  const sp = summarizeMatchPlayerPoints(cases[4].r, undefined); // العقوبة
  check('بند العقوبة يظهر = −10', !!s && sp.rrBreakdown.some((l: any) => l.key === 'penalty' && l.value === -10));

  const sr = summarizeMatchPlayerPoints(cases[5].r, undefined); // التسوية
  check('بند التسوية يظهر = +15', sr.rrBreakdown.some((l: any) => l.key === 'reconcile' && l.value === 15));
}

section('5) التعديل اليدوي — computeAdjustedValues (دلتا match_players + players بحدّ أدنى 0)');
{
  const a = computeAdjustedValues({ mpXp: 50, mpRr: 20, playerXp: 100, playerRr: 30 }, 10, -5);
  check('دلتا عادية: mpXp 50→60', a.mpXp === 60);
  check('دلتا عادية: mpRr 20→15', a.mpRr === 15);
  check('دلتا عادية: playerXp 100→110', a.playerXp === 110);
  check('دلتا عادية: playerRr 30→25', a.playerRr === 25);

  const b = computeAdjustedValues({ mpXp: 5, mpRr: 5, playerXp: 3, playerRr: 2 }, -10, -10);
  check('match_players تسمح بالسالب: mpRr = −5', b.mpRr === -5);
  check('players بحدّ أدنى 0: playerRr = 0 (ليس −8)', b.playerRr === 0);
  check('players بحدّ أدنى 0: playerXp = 0', b.playerXp === 0);

  // سيناريو استرداد عقوبة القصّ (+5/+5)
  const c = computeAdjustedValues({ mpXp: 170, mpRr: -20, playerXp: 165, playerRr: 0 }, 5, 5);
  check('استرداد: mpRr −20→−15', c.mpRr === -15);
  check('استرداد: mpXp 170→175', c.mpXp === 175);
  check('استرداد: playerRr 0→5', c.playerRr === 5);
}

section('6) الملخص يعكس التعديل اليدوي بدقّة (الجدول يتحدّث بعد الحفظ)');
{
  // الحالة 1 (كسب 25) بعد إضافة +10 RR يدوياً: rr_change يصبح 35، البنود لا تتغيّر → سطر تسوية +10
  const adjusted = { ...cases[0].r, rrChange: cases[0].r.rrChange + 10 };
  const s = summarizeMatchPlayerPoints(adjusted, undefined);
  check('بعد +10: المجموع = 35', s.rrTotal === 35, `=${s.rrTotal}`);
  check('بعد +10: كسب = 35 (يشمل +10 التسوية)', s.rrGained === 35, `=${s.rrGained}`);
  check('بعد +10: كسب+خسر = المجموع', s.rrGained + s.rrLost === s.rrTotal);
}

console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) {
  console.log(`\n❌ الفشل:`);
  failures.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log(`\n🎉 منطق ملخص نقاط اللعبة يعمل بشكل صحيح.`);
  process.exit(0);
}
