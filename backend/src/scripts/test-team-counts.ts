// ══════════════════════════════════════════════════════
// 🧪 عدّ الفرق — المحايد يُعدّ بفريقه، ومعادلة النصر لا تتأثّر
//
// 🔴 هذا الاختبار يحرس فصلاً مقصوداً: عدُّ **العرض** (getTeamCounts) منفصلٌ عن
//    عدِّ **الحكم** (checkWinCondition). كان الأوّل يعدّ المهرّج مواطناً فيرى
//    الجميع رقماً كاذباً. وتوحيدُهما إغراءٌ يجب أن يُقاوَم: أيّ لمسةٍ للثاني
//    تغيّر متى تنتهي كلّ لعبة.
//
// تشغيل: npx tsx src/scripts/test-team-counts.ts
// ══════════════════════════════════════════════════════
import { getTeamCounts, Role } from '../game/roles.js';
import { checkWinCondition, WinResult } from '../game/win-checker.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

const P = (physicalId: number, role: Role, isAlive = true): any => ({ physicalId, role, isAlive, name: `${role}#${physicalId}` });
const S = (players: any[]): any => ({ players, round: 2, config: {} });

function main() {
  console.log('🧪 اختبار عدّ الفرق\n');

  section('1) المحايد يُعدّ بفريقه لا مع المواطنين');
  {
    const c = getTeamCounts([
      P(1, Role.GODFATHER), P(2, Role.SILENCER),
      P(5, Role.CITIZEN), P(6, Role.DOCTOR), P(7, Role.SHERIFF),
      P(9, Role.JESTER), P(10, Role.ASSASSIN),
    ]);
    check('مافيا = ٢', c.mafiaAlive === 2, String(c.mafiaAlive));
    check('مواطنون = ٣ (لا ٥)', c.citizenAlive === 3, String(c.citizenAlive));
    check('مستقلّون = ٢', c.neutralAlive === 2, String(c.neutralAlive));
    check('المجموع يساوي عدد اللاعبين', c.mafiaAlive + c.citizenAlive + c.neutralAlive === 7);
    check('الإجماليّات كذلك', c.mafiaTotal === 2 && c.citizenTotal === 3 && c.neutralTotal === 2);
  }

  section('2) الأموات لا يُعدّون في الأحياء ويبقون في الإجماليّ');
  {
    const c = getTeamCounts([
      P(1, Role.GODFATHER), P(2, Role.SILENCER, false),
      P(5, Role.CITIZEN), P(6, Role.DOCTOR, false),
      P(9, Role.JESTER, false),
    ]);
    check('مافيا حيّ = ١ · إجماليّ = ٢', c.mafiaAlive === 1 && c.mafiaTotal === 2);
    check('مواطن حيّ = ١ · إجماليّ = ٢', c.citizenAlive === 1 && c.citizenTotal === 2);
    check('مستقلّ حيّ = ٠ · إجماليّ = ١', c.neutralAlive === 0 && c.neutralTotal === 1);
  }

  section('3) كلّ أدوار المافيا تُعدّ مافيا — بما فيها الساحرة والتوأم');
  {
    const c = getTeamCounts([
      P(1, Role.GODFATHER), P(2, Role.SILENCER), P(3, Role.CHAMELEON),
      P(4, Role.WITCH), P(5, Role.OLDER_BROTHER), P(6, Role.MAFIA_REGULAR),
      P(7, Role.CITIZEN),
    ]);
    check('مافيا = ٦', c.mafiaAlive === 6, String(c.mafiaAlive));
    check('مواطنون = ١', c.citizenAlive === 1, String(c.citizenAlive));
    check('مستقلّون = ٠', c.neutralAlive === 0);
  }

  section('4) الأخ الأصغر مواطن — والعمدة والشرطيّة كذلك');
  {
    const c = getTeamCounts([
      P(1, Role.GODFATHER),
      P(5, Role.YOUNGER_BROTHER), P(6, Role.MAYOR), P(7, Role.POLICEWOMAN), P(8, Role.NURSE),
    ]);
    check('مواطنون = ٤', c.citizenAlive === 4, String(c.citizenAlive));
    check('لا مستقلّ', c.neutralAlive === 0);
  }

  section('5) لاعبٌ بلا دور لا يُعدّ إطلاقاً');
  {
    const c = getTeamCounts([P(1, Role.GODFATHER), { physicalId: 2, role: null, isAlive: true } as any]);
    check('المجموع = ١', c.mafiaAlive + c.citizenAlive + c.neutralAlive === 1);
  }

  section('6) 🔒 معادلة النصر لا تتأثّر بالمحايدين');
  {
    // مافيا ١ · مواطنان ⇒ اللعبة مستمرّة
    const base = [P(1, Role.GODFATHER), P(5, Role.CITIZEN), P(6, Role.DOCTOR)];
    check('بلا محايد: مستمرّة', checkWinCondition(S(base)) === WinResult.GAME_CONTINUES);
    // إضافة محايدَين حيَّين يجب ألّا تغيّر شيئاً
    const withNeutrals = [...base, P(9, Role.JESTER), P(10, Role.ASSASSIN)];
    check('مع محايدَين: مستمرّة كما هي', checkWinCondition(S(withNeutrals)) === WinResult.GAME_CONTINUES);

    // 🔴 الحالة الحاسمة: مافيا ١ · مواطن ١ ⇒ المافيا تفوز. ووجود محايدَين
    //    يجب ألّا يُنقذ المدينة — لو عُدّا مواطنَين لصارت ٣ ولم تفز المافيا.
    const tight = [P(1, Role.GODFATHER), P(5, Role.CITIZEN)];
    check('مافيا ١ ضدّ مواطن ١: فوز المافيا', checkWinCondition(S(tight)) === WinResult.MAFIA_WIN);
    const tightPlusNeutrals = [...tight, P(9, Role.JESTER), P(10, Role.ASSASSIN)];
    check('ومع محايدَين حيَّين: فوز المافيا كما هو',
      checkWinCondition(S(tightPlusNeutrals)) === WinResult.MAFIA_WIN);

    // ولا مافيا ⇒ فوز المدينة، ووجود محايدٍ لا يمنعه
    const noMafia = [P(5, Role.CITIZEN), P(9, Role.JESTER)];
    check('لا مافيا: فوز المدينة رغم وجود محايد', checkWinCondition(S(noMafia)) === WinResult.CITIZEN_WIN);
  }

  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
  console.log('\n🎉 عدّ الفرق صادق، ومعادلة النصر لم تُمَسّ.');
  process.exit(0);
}
main();
