// ══════════════════════════════════════════════════════
// 🧪 اختبار طبقة بناء طابور الليل واختيار الأهداف (المحرك الديناميكي)
// buildNightQueue (بوابات الممرضة/السفّاح/الساحرة) + getAvailableTargets
// (نوع الهدف ENEMY/ALLY، استثناء النفس، استثناء آخر هدف، أهداف الساحرة السابقة).
// تشغيل: npx tsx src/scripts/test-night-queue.ts
// ══════════════════════════════════════════════════════
import { primeTestDefs } from './_game-fixtures.js';
import { buildNightQueue, getAvailableTargets } from '../game/dynamic-night-resolver.js';
import { Role } from '../game/roles.js';

primeTestDefs();

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }
function P(physicalId: number, role: Role, isAlive = true): any {
  return { physicalId, name: role + '#' + physicalId, role, isAlive, isSilenced: false };
}
function st(players: any[], opts: any = {}): any {
  return { players, round: opts.round ?? 2, config: { witchDisableRounds: 3 }, nurseActivated: opts.nurseActivated ?? false, assassinState: opts.assassinState ?? null, witchPreviousTargets: opts.witchPreviousTargets ?? [] };
}
const ids = (q: any[]) => q.map((x: any) => x.abilityId).sort();

async function main() {
  console.log('🧪 اختبار طابور الليل واختيار الأهداف\n');

  section('1) buildNightQueue — القدرات الصحيحة فقط، مرتّبة بالأولوية');
  {
    const s = st([P(1, Role.GODFATHER), P(7, Role.SHERIFF), P(8, Role.DOCTOR), P(9, Role.SNIPER), P(4, Role.WITCH), P(12, Role.CITIZEN), P(10, Role.POLICEWOMAN)]);
    const q = await buildNightQueue(s);
    check('يحوي KILL/INVESTIGATE/PROTECT/SNIPE/DISABLE_ABILITY', JSON.stringify(ids(q)) === JSON.stringify(['DISABLE_ABILITY', 'INVESTIGATE', 'KILL', 'PROTECT', 'SNIPE']));
    check('لا يحوي قدرة للمواطن/الشرطية (بلا قدرات)', !q.some((x: any) => x.performerPhysicalId === 12 || x.performerPhysicalId === 10));
    check('مرتّب تصاعدياً بالأولوية (KILL=1 أولاً)', q[0].abilityId === 'KILL');
  }

  section('2) بوابة الممرضة (PROTECT تظهر فقط بعد تفعيل الممرضة)');
  {
    let s = st([P(11, Role.NURSE), P(12, Role.CITIZEN)], { nurseActivated: false });
    let q = await buildNightQueue(s);
    check('ممرضة غير مفعّلة: لا PROTECT في الطابور', !q.some((x: any) => x.abilityId === 'PROTECT'));

    s = st([P(11, Role.NURSE), P(12, Role.CITIZEN)], { nurseActivated: true });
    q = await buildNightQueue(s);
    check('ممرضة مفعّلة (بعد موت الطبيب): PROTECT تظهر', q.some((x: any) => x.abilityId === 'PROTECT' && x.performerPhysicalId === 11));
  }

  section('3) بوابة السفّاح (ASSASSINATE تتطلّب مرور أول ليلة وعدم الفوز)');
  {
    let s = st([P(15, Role.ASSASSIN)], { assassinState: { firstNightPassed: false, won: false } });
    check('أول ليلة (firstNightPassed=false): لا ASSASSINATE', !(await buildNightQueue(s)).some((x: any) => x.abilityId === 'ASSASSINATE'));

    s = st([P(15, Role.ASSASSIN)], { assassinState: { firstNightPassed: true, won: false } });
    check('بعد أول ليلة: ASSASSINATE تظهر', (await buildNightQueue(s)).some((x: any) => x.abilityId === 'ASSASSINATE'));

    s = st([P(15, Role.ASSASSIN)], { assassinState: { firstNightPassed: true, won: true } });
    check('بعد الفوز بالعقود: لا ASSASSINATE (اكتفى)', !(await buildNightQueue(s)).some((x: any) => x.abilityId === 'ASSASSINATE'));
  }

  section('4) buildNightQueue — تعليم اللاعب المعطّل (isDisabled)');
  {
    const sheriff = P(7, Role.SHERIFF); sheriff.disabledUntilRound = 4; sheriff.disabledRoleName = 'SHERIFF';
    const s = st([P(1, Role.GODFATHER), sheriff], { round: 2 });
    const q = await buildNightQueue(s);
    const inv = q.find((x: any) => x.abilityId === 'INVESTIGATE');
    check('الشريف المعطّل مُعلَّم isDisabled في الطابور', !!inv && inv.isDisabled === true);
  }

  section('5) getAvailableTargets — نوع الهدف ENEMY/ALLY واستثناء النفس');
  {
    const s = st([P(1, Role.GODFATHER), P(6, Role.MAFIA_REGULAR), P(7, Role.SHERIFF), P(12, Role.CITIZEN)]);
    const dn = { actions: {}, lastTargets: {} };
    // KILL (مافيا، ENEMY) → فقط المواطنون
    const killTargets = (await getAvailableTargets(s, 'KILL', 1, dn)).map((p: any) => p.physicalId).sort((a: number, b: number) => a - b);
    check('KILL: أهداف المواطنين فقط (7,12) لا المافيا ولا النفس', JSON.stringify(killTargets) === JSON.stringify([7, 12]), `actual=${JSON.stringify(killTargets)}`);
    // INVESTIGATE (مواطن، ANY, excludeSelf) → الكل ما عدا الشريف نفسه
    const invTargets = (await getAvailableTargets(s, 'INVESTIGATE', 7, dn)).map((p: any) => p.physicalId).sort((a: number, b: number) => a - b);
    check('INVESTIGATE (ANY): الكل عدا النفس', JSON.stringify(invTargets) === JSON.stringify([1, 6, 12]), `actual=${JSON.stringify(invTargets)}`);
  }

  section('6) getAvailableTargets — استثناء آخر هدف (الطبيب لا يكرّر)');
  {
    const s = st([P(8, Role.DOCTOR), P(7, Role.SHERIFF), P(12, Role.CITIZEN)]);
    const dn: any = { actions: {}, lastTargets: { PROTECT: 12 } }; // حمى #12 الليلة الماضية
    const t = (await getAvailableTargets(s, 'PROTECT', 8, dn)).map((p: any) => p.physicalId).sort((a: number, b: number) => a - b);
    check('PROTECT: يستثني آخر هدف (#12) والنفس', JSON.stringify(t) === JSON.stringify([7]), `actual=${JSON.stringify(t)}`);
  }

  section('7) getAvailableTargets — الساحرة تستثني أهدافها السابقة');
  {
    const s = st([P(4, Role.WITCH), P(7, Role.SHERIFF), P(8, Role.DOCTOR), P(12, Role.CITIZEN)], { witchPreviousTargets: [7] });
    const dn = { actions: {}, lastTargets: {} };
    const t = (await getAvailableTargets(s, 'DISABLE_ABILITY', 4, dn)).map((p: any) => p.physicalId).sort((a: number, b: number) => a - b);
    check('DISABLE_ABILITY (ENEMY): مواطنون غير مكرّرين (8,12) لا #7 السابق', JSON.stringify(t) === JSON.stringify([8, 12]), `actual=${JSON.stringify(t)}`);
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail > 0) { console.log('\n❌ ' + failures.join('\n❌ ')); process.exit(1); }
  console.log('\n🎉 طبقة الطابور واختيار الأهداف تعمل بالشكل المتوقع.');
  process.exit(0);
}
main().catch(e => { console.error('crash:', e); process.exit(1); });
