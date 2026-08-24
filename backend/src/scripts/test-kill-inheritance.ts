// ══════════════════════════════════════════════════════
// 🧪 اختبار سلسلة وراثة الاغتيال — MAFIA_KILL_PRIORITY
// يقفل الترتيب المعلن، ويؤكّد أنّ المنفّذ الفعليّ في resolveNight يطابقه.
// 🔴 الساحرة مافيا (MAFIA_ROLES تضمّها) وكانت غائبة عن السلسلة: فحين تكون
//    آخر من فوق المافيا العاديّ، كان القتل يُنسَب لغيرها أو لا يُنسَب لأحد.
// تشغيل: npx tsx src/scripts/test-kill-inheritance.ts
// ══════════════════════════════════════════════════════
import { primeTestDefs } from './_game-fixtures.js';
import { setGameState, getGameState } from '../config/redis.js';
import { resolveNight } from '../game/night-resolver.js';
import { Role, MAFIA_KILL_PRIORITY, MAFIA_ROLES } from '../game/roles.js';

primeTestDefs();

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }
const P = (physicalId: number, role: Role, isAlive = true): any =>
  ({ physicalId, name: role + '#' + physicalId, role, isAlive, isSilenced: false, playerId: physicalId + 1000 });

/** يبني ليلةً فيها اغتيالٌ ناجح على مواطنٍ ويُعيد منفّذ الاغتيال كما نسبه المحرّك. */
async function killPerformer(roomId: string, mafia: any[]): Promise<{ id?: number; credited?: number }> {
  const victim = P(30, Role.CITIZEN);
  await setGameState(roomId, {
    roomId, round: 3, players: [...mafia, victim, P(31, Role.CITIZEN), P(32, Role.CITIZEN)],
    config: { bombEnabled: false, jesterSurviveRounds: 2, useDynamicEngine: true },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    nightActions: {
      godfatherTarget: 30, silencerTarget: null, sheriffTarget: null, sheriffResult: null,
      doctorTarget: null, sniperTarget: null, nurseTarget: null, assassinTarget: null,
      lastProtectedTarget: null, witchTarget: null,
    },
    votingState: { candidates: [], deals: [], totalVotesCast: 0, hiddenPlayersFromVoting: [], tieBreakerLevel: 0, playerVotes: {} },
    twinState: null, assassinState: null, mayorState: null,
  } as any);
  const r = await resolveNight(roomId);
  const s: any = await getGameState(roomId);
  const ev = r.events.find((e: any) => e.type === 'ASSASSINATION');
  const credit = s.performanceTracking.abilityResults.find((a: any) => a.correct === true);
  return { id: (ev as any)?.performerPhysicalId, credited: credit?.physicalId };
}

async function main() {
  console.log('🧪 اختبار وراثة الاغتيال\n');

  section('1) الترتيب المعلن');
  {
    const order = MAFIA_KILL_PRIORITY;
    check('يبدأ بشيخ المافيا', order[0] === Role.GODFATHER);
    check('الحرباية ثانياً', order[1] === Role.CHAMELEON);
    check('القص ثالثاً', order[2] === Role.SILENCER);
    check('🧙‍♀️ الساحرة مباشرةً بعد القص', order[3] === Role.WITCH);
    check('الساحرة قبل الأخ الأكبر والمافيا العاديّ',
      order.indexOf(Role.WITCH) < order.indexOf(Role.OLDER_BROTHER) &&
      order.indexOf(Role.WITCH) < order.indexOf(Role.MAFIA_REGULAR));
    check('لا دور مكرّر', new Set(order).size === order.length);
    const missing = MAFIA_ROLES.filter(r => !order.includes(r));
    check('كلّ أدوار المافيا مشمولة (لا دور بلا وراثة)', missing.length === 0, missing.join(','));
    check('لا دور من خارج المافيا في السلسلة', order.every(r => MAFIA_ROLES.includes(r)));
  }

  section('2) المنفّذ الفعليّ يطابق الترتيب');
  {
    const a = await killPerformer('k1', [P(1, Role.GODFATHER), P(2, Role.WITCH), P(3, Role.MAFIA_REGULAR)]);
    check('الشيخ حيّ → هو المنفّذ', a.id === 1);

    const b = await killPerformer('k2', [P(1, Role.GODFATHER, false), P(2, Role.SILENCER), P(3, Role.WITCH), P(4, Role.MAFIA_REGULAR)]);
    check('الشيخ ميت والقص حيّ → القص لا الساحرة', b.id === 2);

    const c = await killPerformer('k3', [P(1, Role.GODFATHER, false), P(2, Role.SILENCER, false), P(3, Role.WITCH), P(4, Role.OLDER_BROTHER), P(5, Role.MAFIA_REGULAR)]);
    check('🧙‍♀️ مات من فوقها → الساحرة ترث الاغتيال', c.id === 3);
    check('ونقاط الاغتيال تُنسب لها', c.credited === 3);

    const d = await killPerformer('k4', [P(3, Role.WITCH, false), P(4, Role.OLDER_BROTHER), P(5, Role.MAFIA_REGULAR)]);
    check('الساحرة ميتة → الأخ الأكبر', d.id === 4);

    const e = await killPerformer('k5', [P(5, Role.MAFIA_REGULAR)]);
    check('المافيا العاديّ آخر السلسلة', e.id === 5);

    const f = await killPerformer('k6', [P(3, Role.WITCH)]);
    check('الساحرة وحدها → تنفّذ ولا يبقى القتل بلا منفّذ', f.id === 3);
  }

  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
  console.log('\n🎉 سلسلة وراثة الاغتيال تعمل بالشكل المتوقع.');
  process.exit(0);
}
main();
