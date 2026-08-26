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
    check('الحرباية ثانياً — بلا قدرةٍ فوارثٌ نظيف', order[1] === Role.CHAMELEON);
    check('المافيا العاديّ ثالثاً — بلا قدرةٍ أيضاً', order[2] === Role.MAFIA_REGULAR);
    check('الأخ الأكبر رابعاً — يملك الاغتيال أصلاً فلا يزدوج', order[3] === Role.OLDER_BROTHER);
    // 🔴 حارسُ الهدف نفسِه لا صورتِه: حاملا القدرتين آخِراً كي يندر اجتماعُ فعلين
    //    في يدٍ واحدة. أيُّ إعادة ترتيبٍ لاحقة تكسر هذا الشرط تُوقِف الاختبار.
    check('القصُّ والساحرةُ آخِرَ السلسلة — أقلُّ احتمالٍ للازدواج',
      order.indexOf(Role.SILENCER) >= order.length - 2 &&
      order.indexOf(Role.WITCH) >= order.length - 2);
    check('كلُّ عديمي القدرة قبل حامليها',
      Math.max(order.indexOf(Role.CHAMELEON), order.indexOf(Role.MAFIA_REGULAR)) <
      Math.min(order.indexOf(Role.SILENCER), order.indexOf(Role.WITCH)));
    check('لا دور مكرّر', new Set(order).size === order.length);
    const missing = MAFIA_ROLES.filter(r => !order.includes(r));
    check('كلّ أدوار المافيا مشمولة (لا دور بلا وراثة)', missing.length === 0, missing.join(','));
    check('لا دور من خارج المافيا في السلسلة', order.every(r => MAFIA_ROLES.includes(r)));
  }

  section('2) المنفّذ الفعليّ يطابق الترتيب');
  {
    const a = await killPerformer('k1', [P(1, Role.GODFATHER), P(2, Role.WITCH), P(3, Role.MAFIA_REGULAR)]);
    check('الشيخ حيّ → هو المنفّذ', a.id === 1);

    // 🔴 الشيخُ ميّتٌ والقصُّ والمافيا العاديّ حيّان ⇒ العاديُّ يرث لا القصّ:
    //    عديمُ القدرة أَولى كي لا يجتمع في يد القصّ إسكاتٌ واغتيال.
    const b = await killPerformer('k2', [P(1, Role.GODFATHER, false), P(2, Role.SILENCER), P(3, Role.WITCH), P(4, Role.MAFIA_REGULAR)]);
    check('الشيخ ميت ⇒ المافيا العاديّ لا القص ولا الساحرة', b.id === 4);

    const b2 = await killPerformer('k2b', [P(1, Role.GODFATHER, false), P(6, Role.CHAMELEON), P(2, Role.SILENCER), P(4, Role.MAFIA_REGULAR)]);
    check('الحرباية قبل المافيا العاديّ', b2.id === 6);

    const c = await killPerformer('k3', [P(1, Role.GODFATHER, false), P(2, Role.SILENCER), P(3, Role.WITCH), P(4, Role.OLDER_BROTHER)]);
    check('الأخ الأكبر قبل القصّ والساحرة', c.id === 4);

    const d = await killPerformer('k4', [P(2, Role.SILENCER), P(3, Role.WITCH)]);
    check('لم يبقَ إلّا القصُّ والساحرة ⇒ القصُّ قبلها', d.id === 2);
    check('ونقاط الاغتيال تُنسب له', d.credited === 2);

    const e = await killPerformer('k5', [P(3, Role.WITCH)]);
    check('الساحرة وحدها → تنفّذ ولا يبقى القتل بلا منفّذ', e.id === 3);

    const f = await killPerformer('k6', [P(5, Role.MAFIA_REGULAR)]);
    check('المافيا العاديّ وحده → ينفّذ', f.id === 5);
  }

  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
  console.log('\n🎉 سلسلة وراثة الاغتيال تعمل بالشكل المتوقع.');
  process.exit(0);
}
main();
