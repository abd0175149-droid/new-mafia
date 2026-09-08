// 🧪 عقودُ البيانات — تصنيفُ الفريق، والفوزُ الرباعيّ، وتطبيعُ الجنس
//
// التشغيل: npx tsx test-data-contracts.ts

import { teamOfRole, MAFIA_ROLES, CITIZEN_ROLES, NEUTRAL_ROLES, Role } from './src/game/roles.js';
import { normGender, isFemale } from './src/utils/gender.util.js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra?: string) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  ← ' + extra : '')); }
};
const NL = '\n';

// ── منطقُ الفوز كما صار في player.service وhistory/page ──
function won(role: string, winner: string | null): boolean {
  const team = teamOfRole(role);
  return winner === 'MAFIA' ? team === 'MAFIA'
    : winner === 'CITIZEN' ? team === 'CITIZEN'
    : winner === 'JESTER' ? role === 'JESTER'
    : winner === 'ASSASSIN' ? role === 'ASSASSIN'
    : false;
}

console.log(NL + '🧪 الدوران اللذان كانت القائمةُ اليدويّة تُسقطهما');
{
  // 🔴 جوهرُ العطب: القائمةُ الرباعيّة المنسوخة في موضعين كانت
  //    ['GODFATHER','SILENCER','CHAMELEON','MAFIA_REGULAR'] — بلا هذين.
  ok('الساحرةُ مافيا', teamOfRole('WITCH') === 'MAFIA', teamOfRole('WITCH'));
  ok('والأخُ الأكبر مافيا', teamOfRole('OLDER_BROTHER') === 'MAFIA', teamOfRole('OLDER_BROTHER'));
  ok('فتفوز الساحرةُ بفوز المافيا', won('WITCH', 'MAFIA'));
  ok('ويفوز الأخُ الأكبر بفوز المافيا', won('OLDER_BROTHER', 'MAFIA'));
  ok('ولا تفوز الساحرةُ بفوز المواطنين', !won('WITCH', 'CITIZEN'));
}

console.log(NL + '🧪 الفوزُ رباعيٌّ لا ثنائيّ');
{
  ok('المهرّجُ يفوز بفوزه', won('JESTER', 'JESTER'));
  ok('والسفّاحُ يفوز بفوزه', won('ASSASSIN', 'ASSASSIN'));
  // 🔴 المقارنةُ الثنائيّة القديمة كانت تعطي `won=false` هنا — أي أنّ
  //    الفائزَ نفسَه يرى «خسارة». ١٠٠٨ صفوفٍ على الإنتاج.
  ok('ولا يفوز المهرّجُ بفوز السفّاح', !won('JESTER', 'ASSASSIN'));
  ok('ولا يفوز مواطنٌ بفوز المهرّج', !won('CITIZEN', 'JESTER'));
  ok('ولا مافيا بفوز المهرّج', !won('GODFATHER', 'JESTER'));
  ok('ومباراةٌ بلا فائزٍ لا تُحتسب فوزاً لأحد', !won('GODFATHER', null));
}

console.log(NL + '🧪 المحايدُ ليس مواطناً');
{
  ok('المهرّجُ محايد', teamOfRole('JESTER') === 'NEUTRAL');
  ok('والسفّاحُ محايد', teamOfRole('ASSASSIN') === 'NEUTRAL');
  ok('فلا يفوزان بفوز المواطنين', !won('JESTER', 'CITIZEN') && !won('ASSASSIN', 'CITIZEN'));
}

console.log(NL + '🧪 لا دورَ في فريقين');
{
  const overlap = MAFIA_ROLES.filter(r => CITIZEN_ROLES.includes(r));
  ok('لا تقاطعَ بين المافيا والمواطنين', overlap.length === 0, overlap.join(','));
  const nOverlap = NEUTRAL_ROLES.filter(r => MAFIA_ROLES.includes(r) || CITIZEN_ROLES.includes(r));
  ok('ولا المحايدُ في أحدهما', nOverlap.length === 0, nOverlap.join(','));
}

console.log(NL + '🧪 كلُّ دورٍ مصنَّف');
{
  const all = Object.values(Role) as string[];
  const unclassified = all.filter(r =>
    !MAFIA_ROLES.includes(r as Role) && !CITIZEN_ROLES.includes(r as Role) && !NEUTRAL_ROLES.includes(r as Role));
  // 🔴 غيرُ المصنَّف يسقط على CITIZEN في `teamOfRole` — صامتاً. فدورٌ جديدٌ
  //    يُضاف بلا تصنيفٍ يصير مواطناً بلا أن يقرّر ذلك أحد.
  ok('لا دورَ خارج التصنيفات الثلاثة', unclassified.length === 0, unclassified.join(','));
}

console.log(NL + '🧪 تطبيعُ الجنس');
{
  ok('FEMALE ⇒ FEMALE', normGender('FEMALE') === 'FEMALE');
  ok('female ⇒ FEMALE — الصفوفُ السبعةُ المعطوبة', normGender('female') === 'FEMALE');
  ok('Female ⇒ FEMALE', normGender('Female') === 'FEMALE');
  ok('male ⇒ MALE', normGender('male') === 'MALE');
  ok('فراغٌ ⇒ MALE (افتراضُ الإنشاء)', normGender('') === 'MALE');
  ok('null ⇒ MALE', normGender(null) === 'MALE');
  ok('مسافاتٌ حول القيمة تُقصّ', normGender('  female  ') === 'FEMALE');
  ok('isFemale تقرأ الحالةَ الصغيرة', isFemale('female') && !isFemale('male'));
}

console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);
